import { isIP } from "node:net";
import type { Pool } from "pg";

export interface ResearchRunAudit {
  runId: string;
  projectName: string;
  projectLocation: string;
  researchStatus: string;
  projectSummary: Record<string, unknown>;
  audit: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
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
    async startRun(record: ResearchRunAudit): Promise<void> {
      const summary = redactAuditAddresses(record.projectSummary);
      const audit = redactAuditAddresses(record.audit);
      const result = await client.query(
        `INSERT INTO research_run_audits
          (run_id, project_name, project_location, research_status, project_summary, audit, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7::timestamptz, now()), NULL)
         ON CONFLICT (run_id) DO NOTHING`,
        [record.runId, record.projectName, record.projectLocation, record.researchStatus,
          JSON.stringify(summary), JSON.stringify(audit), record.startedAt ?? null],
      );
      if (result.rowCount !== 1) throw new Error("Research audit run ID already exists.");
    },
    async finishRun(record: ResearchRunAudit): Promise<void> {
      const summary = redactAuditAddresses(record.projectSummary);
      const audit = redactAuditAddresses(record.audit);
      const result = await client.query(
        `UPDATE research_run_audits SET
           research_status = $2,
           project_summary = $3::jsonb,
           audit = $4::jsonb,
           finished_at = COALESCE($5::timestamptz, now())
         WHERE run_id = $1 AND finished_at IS NULL`,
        [record.runId, record.researchStatus, JSON.stringify(summary), JSON.stringify(audit),
          record.finishedAt ?? null],
      );
      if (result.rowCount !== 1) throw new Error("Research audit run was not open for completion.");
    },
    async save(record: ResearchRunAudit): Promise<void> {
      const summary = redactAuditAddresses(record.projectSummary);
      const audit = redactAuditAddresses(record.audit);
      await client.query(
        `INSERT INTO research_run_audits
          (run_id, project_name, project_location, research_status, project_summary, audit, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7::timestamptz, now()), COALESCE($8::timestamptz, now()))
         ON CONFLICT (run_id) DO UPDATE SET
           research_status = EXCLUDED.research_status,
           project_summary = EXCLUDED.project_summary,
           audit = EXCLUDED.audit,
           finished_at = COALESCE(EXCLUDED.finished_at, now())`,
        [record.runId, record.projectName, record.projectLocation, record.researchStatus,
          JSON.stringify(summary), JSON.stringify(audit), record.startedAt ?? null, record.finishedAt ?? null],
      );
    },
    async get(runId: string): Promise<ResearchRunAudit | null> {
      const result = await client.query(
        `SELECT run_id, project_name, project_location, research_status, project_summary, audit, started_at, finished_at
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
        startedAt: row.started_at?.toISOString?.() ?? row.started_at ?? null,
        finishedAt: row.finished_at?.toISOString?.() ?? row.finished_at ?? null,
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