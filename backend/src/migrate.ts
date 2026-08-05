import { db } from './db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log("🛠️ Running safe migration for downstream_count...");
  try {
    await db.execute(sql`
      ALTER TABLE tickets 
      ADD COLUMN IF NOT EXISTS downstream_count INTEGER DEFAULT 0;
    `);
    console.log("✅ Successfully added downstream_count column to tickets table!");
  } catch (err) {
    console.error("❌ Migration error:", err);
  }
  process.exit(0);
}

migrate();