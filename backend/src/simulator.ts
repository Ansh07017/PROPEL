import { db } from './db/index.js';
import { poles, transformers } from './db/schema.js';
import { isNotNull, eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const API_URL = 'http://localhost:3000/api/telemetry';

// ---------------------------------------------------------
// 1. PHYSICS & HARDWARE STATE
// ---------------------------------------------------------
interface DeviceState {
  fw: string; // 1.4.2 or 1.2.0
  clockSkewMs: number; // ±90 seconds
  seq: number;
}

const deviceRegistry = new Map<string, DeviceState>();
const groundTruthTree = new Map<string, string[]>(); // poleId -> array of child poleIds
const activeFaults = new Set<string>(); // Keep track of poles currently down

// Helper: Haversine distance
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ---------------------------------------------------------
// 2. INITIALIZATION: Build the Real-World State
// ---------------------------------------------------------
async function initializeSimulator() {
  console.log("🌍 Initializing Simulator Physics Engine...");
  
  const allPoles = await db.select().from(poles).where(isNotNull(poles.deviceId));
  
  for (const p of allPoles) {
    if (!p.deviceId) continue;
    deviceRegistry.set(p.deviceId, {
      fw: Math.random() < 0.08 ? '1.2.0' : '1.4.2', 
      clockSkewMs: Math.floor((Math.random() * 180000) - 90000), 
      seq: 0
    });
    groundTruthTree.set(p.poleId, []);
  }

  const dts = await db.select().from(transformers);
  
  for (const dt of dts) {
    const dtPoles = allPoles.filter(p => p.dtId === dt.dtId);
    const hasTopology = dtPoles.some(p => p.parentPoleId !== null);
    
    if (hasTopology) {
      dtPoles.forEach(p => {
        if (p.parentPoleId && groundTruthTree.has(p.parentPoleId)) {
          groundTruthTree.get(p.parentPoleId)!.push(p.poleId);
        }
      });
    } else {
      let unassigned = [...dtPoles];
      if (unassigned.length === 0) continue;
      
      unassigned.sort((a, b) => getDistance(dt.lat, dt.lon, a.lat, a.lon) - getDistance(dt.lat, dt.lon, b.lat, b.lon));
      let currentRoot = unassigned.shift()!;
      
      while (unassigned.length > 0) {
        unassigned.sort((a, b) => getDistance(currentRoot.lat, currentRoot.lon, a.lat, a.lon) - getDistance(currentRoot.lat, currentRoot.lon, b.lat, b.lon));
        let nextChild = unassigned.shift()!;
        groundTruthTree.get(currentRoot.poleId)!.push(nextChild.poleId);
        currentRoot = nextChild; 
      }
    }
  }
  console.log(`✅ Physics engine loaded ${allPoles.length} devices.`);
  return allPoles;
}

// ---------------------------------------------------------
// 3. NETWORK TRANSMISSION LAYER
// ---------------------------------------------------------
async function transmit(deviceId: string, event: string, energized: boolean) {
  const state = deviceRegistry.get(deviceId);
  if (!state) return;

  //if (event === 'power_lost' && state.fw === '1.2.0') return;
  //if (event === 'power_lost' && Math.random() < 0.3) return;

  if (event === 'boot') state.seq = 0;
  else state.seq += 1;

  const skewedTime = new Date(Date.now() + state.clockSkewMs).toISOString();

  const payload = {
    deviceId,
    poleId: deviceId.replace('DEV-', ''),
    event,
    energized,
    ts: skewedTime,
    seq: state.seq,
    battery_mv: energized ? 4100 : 3100,
    fw: state.fw
  };

  try {
    setTimeout(async () => {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }, Math.random() * 2000); 
  } catch (error) {
    // Silently fail network error
  }
}

function getDownstreamPoles(rootPoleId: string): string[] {
  let downstream: string[] = [];
  const children = groundTruthTree.get(rootPoleId) || [];
  for (const child of children) {
    downstream.push(child);
    downstream = downstream.concat(getDownstreamPoles(child));
  }
  return downstream;
}

// ---------------------------------------------------------
// 4. UI / CLI EXECUTION HANDLER
// ---------------------------------------------------------
async function runUICommand(allPoles: any[], command: string) {
  if (command === 'fault span') {
    let target = allPoles[Math.floor(Math.random() * allPoles.length)];
    let children = groundTruthTree.get(target.poleId) || [];
    while (children.length === 0) {
       target = allPoles[Math.floor(Math.random() * allPoles.length)];
       children = groundTruthTree.get(target.poleId) || [];
    }

    console.log(`\n💥 SNAP! Span failed before pole ${target.poleId}`);
    const affected = [target.poleId, ...getDownstreamPoles(target.poleId)];
    console.log(`📉 Cascading power loss to ${affected.length} poles...`);
    
    for (const poleId of affected) {
      const pole = allPoles.find(p => p.poleId === poleId);
      if (pole && pole.deviceId) transmit(pole.deviceId, 'power_lost', false);
    }
  } 
  else if (command === 'fault dt' || command === 'noise') {
    const target = allPoles[Math.floor(Math.random() * allPoles.length)];
    console.log(`\n🔌 NOISE: Sensor ${target.deviceId} died, but power is fine!`);
    if (target.deviceId) {
      transmit(target.deviceId, 'power_lost', false);
    }
  } 
  else if (command === 'repair') {
    console.log(`\n🔧 Lineman repaired the fault! Restoring power to entire grid...`);
    for (const pole of allPoles) {
      if (pole.deviceId) {
        transmit(pole.deviceId, 'boot', true);
        setTimeout(() => transmit(pole.deviceId, 'power_restored', true), 500);
      }
    }
  }

  // We must wait for the setTimeout functions in transmit() to fire before killing the script!
  console.log("⏳ Waiting 3 seconds for simulated telemetry to hit the network...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log("✅ Simulation script finished cleanly.");
  process.exit(0);
}

// ---------------------------------------------------------
// 5. INTERACTIVE MENU (For Manual Terminal Usage)
// ---------------------------------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptMenu(allPoles: any[]) {
  console.log(`\n--- 🌩️ KSPDB FAULT SIMULATOR ---`);
  console.log(`1. Inject Span Fault (Cascading Outage)`);
  console.log(`2. Inject Dead Sensor Noise (False Positive Test)`);
  console.log(`3. Repair All Faults (Power Restored)`);
  console.log(`4. Exit`);
  
  rl.question('Select an option: ', async (answer) => {
    if (answer === '1') await runUICommand(allPoles, 'fault span');
    else if (answer === '2') await runUICommand(allPoles, 'noise');
    else if (answer === '3') await runUICommand(allPoles, 'repair');
    else if (answer === '4') process.exit(0);
    else setTimeout(() => promptMenu(allPoles), 500);
  });
}

// ---------------------------------------------------------
// RUN
// ---------------------------------------------------------
initializeSimulator().then((allPoles) => {
  const args = process.argv.slice(2).join(' ').trim();
  
  // If the UI passes arguments, bypass the menu and run silently
  if (args) {
    runUICommand(allPoles, args);
  } else {
    // If run manually in terminal, show the menu
    promptMenu(allPoles);
  }
}).catch((err) => {
  console.error("❌ Simulation failed:", err);
  process.exit(1); 
});