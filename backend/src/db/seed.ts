import { db } from './index.js';
import { transformers, poles, telemetryLogs, tickets } from './schema.js';
import { sql } from 'drizzle-orm';

async function seed() {
  console.log("🌱 Starting database seeding & schema creation...");

  // 1. Force-create all required tables if they don't exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transformers (
      dt_id VARCHAR(50) PRIMARY KEY,
      feeder_id VARCHAR(50) NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL
    );

    CREATE TABLE IF NOT EXISTS poles (
      pole_id VARCHAR(50) PRIMARY KEY,
      dt_id VARCHAR(50) REFERENCES transformers(dt_id) NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      parent_pole_id VARCHAR(50),
      device_id VARCHAR(100),
      pincode VARCHAR(10)
    );

    CREATE TABLE IF NOT EXISTS telemetry_logs (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(100) NOT NULL,
      event VARCHAR(50) NOT NULL,
      energized BOOLEAN NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      seq INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dt_id VARCHAR(50) REFERENCES transformers(dt_id) NOT NULL,
      affected_span_start VARCHAR(50),
      affected_span_end VARCHAR(50),
      status VARCHAR(20) DEFAULT 'open' NOT NULL,
      confidence VARCHAR(20) NOT NULL,
      downstream_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      resolved_at TIMESTAMP
    );
  `);

  console.log("🧹 Clearing old data...");
  try { await db.delete(tickets); } catch (e) {}
  try { await db.delete(telemetryLogs); } catch (e) {}
  await db.delete(poles);
  await db.delete(transformers);

  // 2. Generate 50 Transformers
  const numTransformers = 50;
  const insertedTransformers = [];

  for (let i = 0; i < numTransformers; i++) {
    const dtId = `D-${i.toString().padStart(4, '0')}`;
    const lat = 12.9 + (Math.random() * 0.1); 
    const lon = 77.5 + (Math.random() * 0.1);

    insertedTransformers.push({
      dtId,
      feederId: `F-${Math.floor(Math.random() * 5)}`,
      lat,
      lon,
    });
  }

  await db.insert(transformers).values(insertedTransformers);
  console.log(`✅ Inserted ${numTransformers} distribution transformers.`);

  // 3. Generate Poles with the 60/40 Topology Constraint
  let totalPoles = 0;

  for (let i = 0; i < numTransformers; i++) {
    const dt = insertedTransformers[i];
    const hasTopology = i < (numTransformers * 0.4); 
    const numPoles = Math.floor(Math.random() * 50) + 20; 

    let parentId: string | null = null;

    for (let j = 0; j < numPoles; j++) {
      const poleId = `P-${dt.dtId}-${j}`;
      const hasDevice = Math.random() > 0.09; 

      await db.insert(poles).values({
        poleId,
        dtId: dt.dtId,
        lat: dt.lat + (Math.random() * 0.005 - 0.0025),
        lon: dt.lon + (Math.random() * 0.005 - 0.0025),
        parentPoleId: hasTopology ? parentId : null,
        deviceId: hasDevice ? `DEV-${poleId}` : null,
        pinCode: "560078"
      });

      if (hasTopology) {
        parentId = poleId;
      }
      totalPoles++;
    }
  }

  console.log(`✅ Inserted ${totalPoles} poles.`);
  console.log("🎉 Network Seeding Complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Seeding failed:", e);
  process.exit(1);
});