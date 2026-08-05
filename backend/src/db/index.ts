import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Use the env variable, with the safe fallback
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://kspdb_admin:kspdb_password@127.0.0.1:5433/kspdb",
});
export const db = drizzle(pool, { schema });