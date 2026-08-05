import { db } from './db/index.js';
import { poles, telemetryLogs, tickets, transformers } from './db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------
// HELPER: Spatial Math
// ---------------------------------------------------------
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ---------------------------------------------------------
// ANALYZER ENGINE (Exported for background loop)
// ---------------------------------------------------------
export async function runAnalyzer() {
  console.log("🔍 Running Fault Location & Resolution Sweep...");

  // 1. Get the latest telemetry state for ALL devices (De-duplication)
  const allLogs = await db.select().from(telemetryLogs).orderBy(desc(telemetryLogs.timestamp));
  const latestState = new Map<string, { energized: boolean, event: string }>();
  
  for (const log of allLogs) {
    if (!latestState.has(log.deviceId)) {
      latestState.set(log.deviceId, { energized: log.energized, event: log.event });
    }
  }

  // ---------------------------------------------------------
  // PHASE 1: AUTO-VERIFY & CLOSE TICKETS
  // ---------------------------------------------------------
  const openTickets = await db.select().from(tickets).where(eq(tickets.status, 'open'));
  let closedCount = 0;

  for (const ticket of openTickets) {
    if (!ticket.affectedSpanEnd) continue;
    
    // Check if the pole that caused the ticket is now energized
    const endPole = await db.select().from(poles).where(eq(poles.poleId, ticket.affectedSpanEnd)).limit(1);
    if (endPole.length > 0 && endPole[0].deviceId) {
      const state = latestState.get(endPole[0].deviceId);
      if (state && state.energized) {
        await db.update(tickets)
          .set({ status: 'closed', resolvedAt: new Date() })
          .where(eq(tickets.ticketId, ticket.ticketId));
        closedCount++;
        console.log(`✅ AUTO-VERIFIED: Power restored at span ending ${ticket.affectedSpanEnd}. Ticket closed.`);
      }
    }
  }

  // ---------------------------------------------------------
  // PHASE 2: FAULT LOCALIZATION & TICKET GENERATION
  // ---------------------------------------------------------
  
  // Find all currently dark devices
  const darkDevices = Array.from(latestState.entries())
    .filter(([_, state]) => !state.energized)
    .map(([deviceId]) => deviceId);

  if (darkDevices.length === 0) {
    if (closedCount > 0) {
      console.log(`\n✅ System healthy. (Closed ${closedCount} resolved tickets)`);
    }
    return; // Exit the function cleanly, NOT the process
  }

  // Map dark devices to their respective Distribution Transformers (DTs)
  const darkPolesData = await db.select().from(poles);
  const activeDTs = new Set<string>();
  const darkPoleIds = new Set<string>();

  for (const p of darkPolesData) {
    if (p.deviceId && darkDevices.includes(p.deviceId)) {
      activeDTs.add(p.dtId);
      darkPoleIds.add(p.poleId);
    }
  }

  // ---------------------------------------------------------
  // FETCH SCHEDULED OUTAGES (NOISE FILTERING)
  // ---------------------------------------------------------
  let activeOutages: any[] = [];
  try {
    const outageRes = await fetch('http://localhost:3000/api/scheduled-outages');
    if (outageRes.ok) {
      const allOutages = await outageRes.json();
      const now = new Date();
      activeOutages = allOutages.filter((o: any) => new Date(o.start) <= now && new Date(o.end) >= now);
    }
  } catch (e) {
    console.log("⚠️ Could not fetch scheduled outages. Proceeding without load shedding filter.");
  }

  let newTicketsCount = 0;

  // Process fault grouping per DT (Spans are local to a DT)
  for (const dtId of activeDTs) {
    const dtPoles = darkPolesData.filter(p => p.dtId === dtId);
    const dt = await db.select().from(transformers).where(eq(transformers.dtId, dtId)).limit(1);
    
    if (dt.length === 0) continue;

    const feederId = dt[0].feederId;
    const isScheduledOutage = activeOutages.some(outage => 
      outage.target_id === dtId || outage.target_id === feederId
    );

    if (isScheduledOutage) {
      console.log(`⏳ SCHEDULED OUTAGE ACTIVE: Skipping fault generation for DT ${dtId} (Feeder ${feederId}).`);
      continue; 
    }

    // Build Topology (Exact or Spatial Fallback)
    const tree = new Map<string, string[]>();
    const parentMap = new Map<string, string | null>();
    let confidence = 'High';

    const hasTopology = dtPoles.some(p => p.parentPoleId !== null);

    if (hasTopology) {
      for (const p of dtPoles) {
        tree.set(p.poleId, []);
        parentMap.set(p.poleId, p.parentPoleId);
      }
      for (const p of dtPoles) {
        if (p.parentPoleId && tree.has(p.parentPoleId)) {
          tree.get(p.parentPoleId)!.push(p.poleId);
        }
      }
    } else {
      confidence = 'Medium';
      for (const p of dtPoles) tree.set(p.poleId, []);
      
      let unassigned = [...dtPoles];
      unassigned.sort((a, b) => getDistance(dt[0].lat, dt[0].lon, a.lat, a.lon) - getDistance(dt[0].lat, dt[0].lon, b.lat, b.lon));
      
      let currentRoot = unassigned.shift();
      if (currentRoot) {
        parentMap.set(currentRoot.poleId, null);
        while (unassigned.length > 0) {
          unassigned.sort((a, b) => getDistance(currentRoot!.lat, currentRoot!.lon, a.lat, a.lon) - getDistance(currentRoot!.lat, currentRoot!.lon, b.lat, b.lon));
          let nextChild = unassigned.shift()!;
          tree.get(currentRoot!.poleId)!.push(nextChild.poleId);
          parentMap.set(nextChild.poleId, currentRoot!.poleId);
          currentRoot = nextChild;
        }
      }
    }

    // Identify the Live/Dark Boundary & Filter Noise
    for (const poleId of darkPoleIds) {
      const pole = dtPoles.find(p => p.poleId === poleId);
      if (!pole || pole.dtId !== dtId) continue;

      let hasLiveChild = false;
      let descendants = [...(tree.get(poleId) || [])];
      
      while (descendants.length > 0) {
          const childId = descendants.pop()!;
          const childPole = dtPoles.find(p => p.poleId === childId);
        if (childPole && childPole.deviceId && !darkPoleIds.has(childId)) {
            hasLiveChild = true; 
            break;
          }
        descendants.push(...(tree.get(childId) || []));
      }

      if (hasLiveChild) {
        console.log(`🔌 NOISE FILTERED: Pole ${poleId} is dark but has live children. Ignored as a dead sensor.`);
        continue; 
      }

      const parentId = parentMap.get(poleId);
      const isParentLive = !parentId || !darkPoleIds.has(parentId);

      if (isParentLive) {
        let downstreamCount = 0;
        let queue = [...(tree.get(poleId) || [])];
        while (queue.length > 0) {
          const childId = queue.pop()!;
          downstreamCount++;
          queue.push(...(tree.get(childId) || []));
        }

        const existing = await db.select().from(tickets).where(
          and(eq(tickets.affectedSpanEnd, poleId), eq(tickets.status, 'open'))
        );

        if (existing.length === 0) {
          await db.insert(tickets).values({
            dtId: pole.dtId,
            affectedSpanStart: parentId || 'DT_ROOT',
            affectedSpanEnd: pole.poleId,
            status: 'open',
            confidence: confidence,
            downstreamCount: downstreamCount,
          });

          console.log(`\n🎫 TICKET GENERATED (Grouped ${downstreamCount + 1} poles):`);
          console.log(`   Span: ${parentId || 'DT_ROOT'} -> ${pole.poleId}`);
          console.log(`   Location: Lat ${pole.lat.toFixed(4)}, Lon ${pole.lon.toFixed(4)}`);
          console.log(`   PIN Code: ${pole.pinCode || 'Unknown'}`);
          console.log(`   Confidence: ${confidence} (${hasTopology ? 'Exact' : 'Spatial MST'})`);
          newTicketsCount++;
        }
      }
    }
  }

  if (newTicketsCount > 0) {
    console.log(`\n✅ Analysis complete. Created ${newTicketsCount} new tickets.`);
  }
}