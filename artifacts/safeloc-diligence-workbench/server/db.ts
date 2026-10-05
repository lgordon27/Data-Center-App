import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { DATABASE_POOL_SETTINGS, protectDatabasePool } from "./databaseResilience.mjs";
import * as schema from "./dossierSchema.js";

const pool = protectDatabasePool(new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...DATABASE_POOL_SETTINGS,
}));
export const db = drizzle(pool, { schema });
export { pool };

const REQUIRED_DATABASE_COLUMNS = [
  ["dossiers", "id"],
  ["dossiers", "slug"],
  ["dossiers", "name"],
  ["dossiers", "version"],
  ["dossiers", "coverage_state"],
  ["dossiers", "as_of_date"],
  ["dossiers", "canonical_data"],
  ["dossiers", "created_at"],
  ["dossiers", "updated_at"],
  ["research_run_audits", "run_id"],
  ["research_run_audits", "project_name"],
  ["research_run_audits", "project_location"],
  ["research_run_audits", "research_status"],
  ["research_run_audits", "project_summary"],
  ["research_run_audits", "audit"],
  ["research_run_audits", "started_at"],
  ["research_run_audits", "finished_at"],
  ["proof_user_decisions", "decision_id"],
  ["proof_user_decisions", "project_id"],
  ["proof_user_decisions", "actor_kind"],
  ["proof_user_decisions", "session_ref"],
  ["proof_user_decisions", "schema_version"],
  ["proof_ledger_events", "event_id"],
  ["proof_ledger_events", "project_id"],
  ["proof_ledger_events", "scope_kind"],
  ["proof_ledger_events", "scope_key"],
  ["proof_ledger_events", "event_type"],
  ["proof_ledger_events", "recorded_at"],
  ["proof_ledger_events", "schema_version"],
  ["proof_ledger_events", "policy_version"],
  ["proof_ledger_events", "payload"],
  ["public_request_events", "id"],
  ["public_request_events", "client_key"],
  ["public_request_events", "requested_at"],
  ["public_provider_spend", "spend_day"],
  ["public_provider_spend", "spent_micro_usd"],
  ["public_provider_spend", "reserved_micro_usd"],
  ["research_result_cache", "project_key"],
  ["research_result_cache", "location_key"],
  ["research_result_cache", "result"],
  ["research_result_cache", "research_date"],
  ["research_result_cache", "application_version"],
  ["research_result_cache", "updated_at"],
] as const;

const REQUIRED_COLUMN_VALUES = REQUIRED_DATABASE_COLUMNS
  .map(([table, column]) => `('${table}', '${column}')`)
  .join(",\n");

const STARTUP_DIAGNOSTICS_SQL = `
  WITH required(table_name, column_name) AS (VALUES ${REQUIRED_COLUMN_VALUES}),
  missing AS (
    SELECT required.table_name, required.column_name
    FROM required
    LEFT JOIN information_schema.columns AS column_info
      ON column_info.table_schema = 'public'
      AND column_info.table_name = required.table_name
      AND column_info.column_name = required.column_name
    WHERE column_info.column_name IS NULL
  )
  SELECT current_database() AS database_name,
    COALESCE(
      (SELECT array_agg(format('%s.%s', table_name, column_name) ORDER BY table_name, column_name) FROM missing),
      ARRAY[]::text[]
    ) AS missing_columns
`;

type StartupDiagnosticsQuery = (sql: string) => Promise<{
  rows: Array<{ database_name?: unknown; missing_columns?: unknown }>;
}>;

type StartupDiagnosticsLogger = Pick<Console, "info" | "warn">;

export function databaseHostFingerprint(databaseUrl?: string): string | null {
  if (!databaseUrl) return null;
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    const host = parsed.hostname;
    return host ? createHash("sha256").update(host).digest("hex").slice(0, 8) : null;
  } catch {
    return null;
  }
}

export async function logDatabaseStartupDiagnostics(
  query: StartupDiagnosticsQuery = (sql) => pool.query(sql),
  databaseUrl = process.env.DATABASE_URL,
  logger: StartupDiagnosticsLogger = console,
): Promise<void> {
  const hostSha256Prefix = databaseHostFingerprint(databaseUrl);
  try {
    const result = await query(STARTUP_DIAGNOSTICS_SQL);
    const row = result.rows[0];
    const missingColumns = Array.isArray(row?.missing_columns)
      ? row.missing_columns.filter((column): column is string => typeof column === "string")
      : null;
    if (typeof row?.database_name !== "string" || !missingColumns) {
      logger.warn("SafeLoc database startup diagnostics unavailable.");
      return;
    }

    logger.info("SafeLoc database startup diagnostics.", {
      database: row.database_name,
      hostSha256Prefix: hostSha256Prefix ?? "unavailable",
      requiredSchema: missingColumns.length === 0 ? "complete" : "missing",
      missingColumns,
    });
    if (missingColumns.length > 0) {
      logger.warn("SafeLoc database required tables or columns are missing.", { missingColumns });
    }
  } catch {
    logger.warn("SafeLoc database startup diagnostics unavailable.");
  }
}