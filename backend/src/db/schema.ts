import { pgTable, varchar, timestamp, boolean, integer, doublePrecision, uuid, serial } from "drizzle-orm/pg-core";

// 1. Distribution Transformers
export const transformers = pgTable("transformers", {
  dtId: varchar("dt_id", { length: 50 }).primaryKey(),
  feederId: varchar("feeder_id", { length: 50 }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
});

// 2. Poles (The 60% missing topology is handled by making parentPoleId nullable)
export const poles = pgTable("poles", {
  poleId: varchar("pole_id", { length: 50 }).primaryKey(),
  dtId: varchar("dt_id", { length: 50 }).references(() => transformers.dtId).notNull(),
  lat: doublePrecision("lat").notNull(),
  lon: doublePrecision("lon").notNull(),
  parentPoleId: varchar("parent_pole_id", { length: 50 }), // Nullable for the 60%
  deviceId: varchar("device_id", { length: 100 }), // Nullable as ~9% lack devices
  pinCode: varchar("pincode", { length: 10 }),
});

// 3. Telemetry Logs (High throughput ingestion table)
export const telemetryLogs = pgTable("telemetry_logs", {
  id: serial("id").primaryKey(),
  deviceId: varchar("device_id", { length: 100 }).notNull(),
  event: varchar("event", { length: 50 }).notNull(), // heartbeat, power_lost, power_restored, boot
  energized: boolean("energized").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  seq: integer("seq").notNull(), // Used for deduplication
});

// 4. Incident Tickets
export const tickets = pgTable("tickets", {
  ticketId: uuid("ticket_id").defaultRandom().primaryKey(),
  dtId: varchar("dt_id", { length: 50 }).references(() => transformers.dtId).notNull(),
  affectedSpanStart: varchar("affected_span_start", { length: 50 }),
  affectedSpanEnd: varchar("affected_span_end", { length: 50 }),
  status: varchar("status", { length: 20 }).default('open').notNull(), // open, verified, closed
  confidence: varchar("confidence", { length: 20 }).notNull(), // High, Medium, Low
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  downstreamCount: integer("downstream_count").default(0), 
});