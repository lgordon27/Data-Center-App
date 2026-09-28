import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const researchRunAudits = pgTable("research_run_audits", {
  runId: uuid("run_id").primaryKey(),
  projectName: text("project_name").notNull(),
  projectLocation: text("project_location").notNull(),
  researchStatus: text("research_status").notNull(),
  projectSummary: jsonb("project_summary").notNull(),
  audit: jsonb("audit").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});