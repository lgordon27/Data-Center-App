import { isIP } from "node:net";
import type { Pool } from "pg";

export interface ResearchRunAudit {
  runId: string;
  projectName: string;
  projectLocation: string;
  researchStatus: string;
  projectSummary: Record<string, unknown>;
  audit: Record<string, unknown>;
}

// Audit receipts can describe rejected DNS answers. Preserve the hostname and
// policy rule, never the resolved address (including addresses inside a URL).
export function redactAuditAddresses(value: unknown): unknown {
  if (typeof value === "string") {
    if (isIP(value)) return "[redacted-address]";
    return value
      .replace(/(?:\d{1,3}\.){3}\d{1,3}/g, "[redacted-address]")
      .replace(/\[[a-f0-9:]+:[a-f0-9:]+\]/gi, "[redacted-address]");
  }
  if (Array.isArray(value)) return value.map(redactAuditAddresses);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) =>
      /^(?:ip|ips|address|addresses|ipAddress|resolvedAddress|dnsAddresses)$/i.test(key)
        ? []
        : [[key, redactAuditAddresses(entry)]]));
  }
  return value;
}

export function createResearchAuditRepository(client: Pick<Pool, "query">) {
  return {
    async save(record: ResearchRunAudit): Promise<void> {
      const summary = redactAuditAddresses(record.projectSummary);
      const audit = redactAuditAddresses(record.audit);
      await client.query(
        `INSERT INTO research_run_audits
          (run_id, project_name, project_location, research_status, project_summary, audit)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
         ON CONFLICT (run_id) DO UPDATE SET
           research_status = EXCLUDED.research_status,
           project_summary = EXCLUDED.project_summary,
           audit = EXCLUDED.audit,
           finished_at = now()`,
        [record.runId, record.projectName, record.projectLocation, record.researchStatus,
          JSON.stringify(summary), JSON.stringify(audit)],
      );
    },
    async get(runId: string): Promise<ResearchRunAudit | null> {
      const result = await client.query(
        `SELECT run_id, project_name, project_location, research_status, project_summary, audit
         FROM research_run_audits WHERE run_id = $1`,
        [runId],
      );
      const row = result.rows[0];
      return row ? {
        runId: row.run_id,
        projectName: row.project_name,
        projectLocation: row.project_location,
        researchStatus: row.research_status,
        projectSummary: row.project_summary,
        audit: row.audit,
      } : null;
    },
  };
}

let repository: ReturnType<typeof createResearchAuditRepository> | null = null;
export async function getResearchAuditRepository() {
  if (!repository) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for research audit persistence.");
    const { pool } = await import("./db.js");
    repository = createResearchAuditRepository(pool);
  }
  return repository;
}