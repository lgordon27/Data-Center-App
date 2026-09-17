import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const dossiers = pgTable("dossiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull().default("1"),
  coverageState: text("coverage_state").notNull().default("review"),
  asOfDate: text("as_of_date"),
  canonicalData: jsonb("canonical_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DossierRow = typeof dossiers.$inferSelect;