import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { db } from './db/index.js';
import { tickets, poles, transformers, telemetryLogs } from './db/schema.js'; 
import { runAnalyzer } from './analyzer.js';
import { eq, desc } from 'drizzle-orm';
import { exec } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json());

// 1. Fetch active tickets WITH exact GPS coordinates for the map
app.get('/api/tickets', async (req, res) => {
  try {
    const activeTickets = await db.select().from(tickets).orderBy(desc(tickets.createdAt));
    const allPoles = await db.select().from(poles);
    
    const enrichedTickets = activeTickets.map(t => {
      const startPole = allPoles.find(p => p.poleId === t.affectedSpanStart);
      const endPole = allPoles.find(p => p.poleId === t.affectedSpanEnd);
      return {
        ...t,
        startLat: startPole?.lat || 12.9716,
        startLon: startPole?.lon || 77.5946,
        endLat: endPole?.lat || 12.9716,
        endLon: endPole?.lon || 77.5946,
      };
    });
    
    res.status(200).json(enrichedTickets);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});
// Fetch recent telemetry logs for the UI modal
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await db.select()
      .from(telemetryLogs)
      .orderBy(desc(telemetryLogs.timestamp))
      .limit(50);
    res.status(200).json(logs);
  } catch (error) {
    console.error('Logs API Error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// 2. Fetch network-wide health metrics for the dashboard ribbon
app.get('/api/stats', async (req, res) => {
  try {
    const allPoles = await db.select().from(poles);
    const allDts = await db.select().from(transformers);
    const activeTickets = await db.select().from(tickets).where(eq(tickets.status, 'open'));
    const allLogs = await db.select().from(telemetryLogs).orderBy(desc(telemetryLogs.timestamp));

    const latestState = new Map();
    for (const log of allLogs) {
      if (!latestState.has(log.deviceId)) latestState.set(log.deviceId, log.energized);
    }

    const totalPoles = allPoles.length;
    const totalDts = allDts.length;
    const withParent = allPoles.filter(p => p.parentPoleId !== null).length;
    const withoutParent = totalPoles - withParent;
    
    // NEW: Count exactly how many poles have IoT devices fitted
    const totalSensors = allPoles.filter(p => p.deviceId !== null).length;
    
    let energizedCount = 0;
    let deadSensors = 0;

    const openTicketEnds = new Set(activeTickets.map(t => t.affectedSpanEnd));

    for (const pole of allPoles) {
      if (pole.deviceId) {
        const isEnergized = latestState.get(pole.deviceId);
        if (isEnergized) {
          energizedCount++;
        } else if (isEnergized === false && !openTicketEnds.has(pole.poleId)) {
          deadSensors++;
        }
      }
    }

    res.status(200).json({
      totalPoles,
      totalDts,
      totalSensors, // Exporting this for the UI
      withParent,
      withoutParent,
      energizedCount,
      deadSensors
    });
  } catch (error) {
    console.error('Stats API Error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// 3. AI Dispatch Brief Generator (Powered by Groq)
app.post('/api/ai/dispatch', async (req, res) => {
  try {
    const { spanStart, spanEnd, pinCode, confidence } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY in environment variables." });
    }

    const prompt = `
      You are an AI assistant for the Karnataka State Power Distribution Board (KSPDB) control room.
      A fault has been detected on the low-tension distribution network.

      Ticket Details:
      - Broken Span: Between pole ${spanStart} and pole ${spanEnd}
      - PIN Code: ${pinCode || 'Unknown'}
      - Localization Confidence: ${confidence}

      Write a concise, professional SMS dispatch brief (max 3 sentences) to send to the local lineman crew. 
      It must explicitly state the two poles they need to check and the PIN code. 
      If the confidence is "Medium" or lower, warn them that the exact topology is unverified and they may need to check adjacent poles.
      Do not include any greetings or signatures. Output strictly the SMS text.
    `;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a highly efficient, deterministic KSPDB dispatch AI. You output only raw SMS text."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const generatedBrief = data.choices[0].message.content.trim();

    res.status(200).json({ brief: generatedBrief });
  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({ error: 'Failed to generate AI brief' });
  }
});

// 4. ACTIVE: High-Throughput Telemetry Ingestion
app.post('/api/telemetry', async (req, res) => {
    try {
      const { deviceId, event, energized, ts, seq } = req.body;

      // Real database insertion
      await db.insert(telemetryLogs).values({
        deviceId,
        event,
        energized,
        timestamp: new Date(ts),
        seq
      });

      res.status(200).json({ status: 'received' });
    } catch (error) {
      console.error('Ingestion Error:', error);
      res.status(500).json({ error: 'Failed to log telemetry' });
    }
});

// 5. NEW: Scheduled Outages Mock Feed
app.get('/api/scheduled-outages', (req, res) => {
  // Returns a mocked active load shedding event to satisfy the brief's requirement
  res.status(200).json([
    {
      "id": "SO-2026-08-04-014",
      "scope": "feeder",
      "target_id": "F-01",
      "start": new Date(Date.now() - 3600000).toISOString(),
      "end": new Date(Date.now() + 3600000).toISOString(),
      "reason": "Planned maintenance - jumper replacement"
    }
  ]);
});
// 6. Start the Background Analyzer Loop (Runs every 15 seconds)
setInterval(() => {
  runAnalyzer().catch(err => console.error("Analyzer Error:", err));
}, 15000);

// MANUAL ANALYZER TRIGGER
app.post('/api/analyzer/run', async (req, res) => {
  console.log(`🔍 UI triggered manual analyzer sweep...`);
  try {
    await runAnalyzer();
    res.json({ success: true, message: "Analyzer sweep complete." });
  } catch (error) {
    console.error(`❌ Analyzer Error:`, error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/simulate', (req, res) => {
  const { command } = req.body;
  
  console.log(`🎮 UI triggered simulation command: ${command}`);
  
  // Explicitly use .cmd on Windows so it doesn't silently fail
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const executeString = `${npxCommand} tsx src/simulator.ts ${command}`;
  
  exec(executeString, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Simulation Error: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }
    console.log(`✅ Simulator Finished Successfully! \n${stdout}`);
    res.json({ success: true, output: stdout });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 KSPDB Backend API running on port ${PORT}`);
  console.log(`⏱️ Background Analyzer started (15s interval)`);
});
