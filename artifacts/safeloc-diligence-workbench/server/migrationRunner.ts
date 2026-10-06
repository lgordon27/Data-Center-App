import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { protectDatabaseClient } from "./databaseResilience.mjs";

// Directory discovery never grants execution authority. Pins cover raw bytes.
export const REVIEWED_MIGRATIONS = Object.freeze([
  { filename: "0001_canonical_dossiers.sql", sha256: "3cd9621efd862b975fddd684eb17cfa6c0e8b159d5bb66c79b06e09e70b82536" },
  { filename: "0002_research_run_audits.sql", sha256: "bdb06758a5addba88bf2529fe78202c5f06d7cb016ba61c293935b5e1570d422" },
  { filename: "0003_research_run_audit_lifecycle.sql", sha256: "db4362163d2b39f73d0a876617b9435af0c04fc8613092e6304dfcd30a922245" },
  { filename: "0004_public_safety_controls.sql", sha256: "cdce7ad8386513f091d5eea2a26c05fcfc759cba9b03f98a0bd2f9b6c5718152" },
  { filename: "0005_safeloc_proof_ledger.sql", sha256: "fbba0688c460eb651b697c26d94de7e3ac72cb9d7d32ac922d91b5e5c40c5407" },
  { filename: "0006_reconcile_proof_ledger.sql", sha256: "006dcdc7540f3399e9a174f3dd50ad1d97b841f7cf2bca5980fad2ddc295b150" },
]);

export type MigrationOutcome = {
  filename: string;
  status: "applied" | "skipped" | "baseline" | "refused";
  reason: string;
};
export type MigrationReport = { warning: boolean; outcomes: MigrationOutcome[] };

type Column = { table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null };
export type MigrationCatalog = {
  columns: Column[];
  indexes: { name: string; definition: string; valid: boolean }[];
  functions: { name: string; body: string; language: string; result: string }[];
  triggers: { name: string; table_name: string; definition: string; enabled: string }[];
  constraints: { table_name: string; kind: string; definition: string; validated: boolean }[];
};

const CATALOG_SQL = `/* startup-migration-catalog */
SELECT
  COALESCE((SELECT jsonb_agg(c) FROM (
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public'
  ) c), '[]'::jsonb) AS columns,
  COALESCE((SELECT jsonb_agg(i) FROM (
    SELECT ci.relname AS name, pg_get_indexdef(pi.indexrelid) AS definition, pi.indisvalid AS valid
    FROM pg_index pi JOIN pg_class ci ON ci.oid = pi.indexrelid
    JOIN pg_namespace n ON n.oid = ci.relnamespace WHERE n.nspname = 'public'
  ) i), '[]'::jsonb) AS indexes,
  COALESCE((SELECT jsonb_agg(f) FROM (
    SELECT p.proname AS name, p.prosrc AS body, l.lanname AS language,
      pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.pronargs = 0
  ) f), '[]'::jsonb) AS functions,
  COALESCE((SELECT jsonb_agg(t) FROM (
    SELECT t.tgname AS name, c.relname AS table_name,
      pg_get_triggerdef(t.oid) AS definition, t.tgenabled AS enabled
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  ) t), '[]'::jsonb) AS triggers,
  COALESCE((SELECT jsonb_agg(k) FROM (
    SELECT c.relname AS table_name, k.contype AS kind,
      pg_get_constraintdef(k.oid) AS definition, k.convalidated AS validated
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
  ) k), '[]'::jsonb) AS constraints`;

// These parsers only describe the six checksum-verified, reviewed files above;
// they are not a general SQL interpreter or a way to authorize other files.
function normalize(value: string) {
  // SQL syntax is case/whitespace insensitive; quoted values are not.
  const literals: string[] = [];
  const syntax = value.replace(/'(?:[^']|'')*'/g, literal => {
    literals.push(literal);
    return `\0${literals.length - 1}\0`;
  });
  return syntax.toLowerCase().replace(/public\./g, "")
    .replace(/\busing btree\b/g, "").replace(/::(?:text|integer|bigint)/g, "")
    .replace(/update or delete/g, "delete or update")
    .replace(/\bin\s*\(([^()]+)\)/g, "=any array[$1]")
    .replace(/["\s();]/g, "")
    .replace(/\0(\d+)\0/g, (_, index) => literals[Number(index)]);
}

function checkDefinitions(sql: string): string[] {
  const checks: string[] = [];
  for (const match of sql.matchAll(/\bCHECK\s*\(/g)) {
    let depth = 1;
    let end = match.index! + match[0].length;
    const start = end;
    while (depth && end < sql.length) {
      if (sql[end] === "(") depth++;
      if (sql[end] === ")") depth--;
      end++;
    }
    checks.push(`CHECK (${sql.slice(start, end - 1)})`);
  }
  return checks;
}

function expectedColumns(sql: string): Column[] {
  const columns: Column[] = [];
  for (const table of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    for (const line of table[2].split("\n")) {
      const match = line.trim().match(/^(\w+) (uuid|text|jsonb|timestamptz|integer|bigint|bigserial|date)\b(.*)/);
      if (!match) continue;
      const [, column_name, type, tail] = match;
      const defaultValue = tail.match(/DEFAULT (now\(\)|gen_random_uuid\(\)|'[^']*'|\d+)/)?.[1] ?? null;
      columns.push({
        table_name: table[1], column_name,
        data_type: type === "timestamptz" ? "timestamp with time zone" : type === "bigserial" ? "bigint" : type,
        is_nullable: /NOT NULL|PRIMARY KEY/.test(tail) ? "NO" : "YES",
        column_default: type === "bigserial" ? "sequence" : defaultValue,
      });
    }
  }
  return columns;
}

function columnCompatible(actual: Column | undefined, expected: Column) {
  if (!actual || actual.data_type !== expected.data_type || actual.is_nullable !== expected.is_nullable) return false;
  if (expected.column_default === "sequence") return /^nextval\(/.test(actual.column_default ?? "");
  return normalize(actual.column_default ?? "") === normalize(expected.column_default ?? "");
}

const lifecycleColumns: Column[] = [
  { table_name: "research_run_audits", column_name: "started_at", data_type: "timestamp with time zone", is_nullable: "NO", column_default: "now()" },
  { table_name: "research_run_audits", column_name: "finished_at", data_type: "timestamp with time zone", is_nullable: "YES", column_default: null },
];
const findColumn = (catalog: MigrationCatalog, column: Column) => catalog.columns.find(
  c => c.table_name === column.table_name && c.column_name === column.column_name,
);
const lifecycleComplete = (catalog: MigrationCatalog) => lifecycleColumns.every(c => columnCompatible(findColumn(catalog, c), c));

export function inspectMigrationSchema(index: number, sql: string, catalog: MigrationCatalog): "absent" | "complete" | "partial" {
  if (index === 2) {
    if (lifecycleComplete(catalog)) return "complete";
    const oldFinished = { ...lifecycleColumns[1], is_nullable: "NO", column_default: "now()" };
    return !catalog.columns.some(c => c.table_name === "research_run_audits" && c.column_name === "started_at")
      && columnCompatible(findColumn(catalog, oldFinished), oldFinished) ? "absent" : "partial";
  }
  const expected = expectedColumns(sql);
  if (!expected.length) return "partial";
  const tables = [...new Set(expected.map(c => c.table_name))];
  const present = catalog.columns.some(c => tables.includes(c.table_name));
  const functions = [...sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)];
  if (!present) {
    // An orphaned proof function/trigger is also ambiguous, not a fresh schema.
    return functions.some(f => catalog.functions.some(c => c.name === f[1])) ? "partial" : "absent";
  }
  const columnsComplete = expected.every(c => {
    if (index === 1 && c.column_name === "finished_at" && lifecycleComplete(catalog)) return true;
    return columnCompatible(findColumn(catalog, c), c);
  });
  if (!columnsComplete) return "partial";
  for (const match of sql.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)([\s\S]*?);/g)) {
    const actual = catalog.indexes.find(i => i.name === match[1]);
    if (!actual?.valid || normalize(actual.definition) !== normalize(`CREATE INDEX ${match[1]}${match[2]}`)) return "partial";
  }
  // Primary/unique indexes must have the reviewed keys, not just a table name.
  for (const table of tables) {
    const tableSql = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`))![1];
    const inlineKey = tableSql.match(/(\w+) \w+ PRIMARY KEY/)?.[1];
    const primary = inlineKey ?? tableSql.match(/PRIMARY KEY \(([^)]+)\)/)?.[1];
    const keyIndex = catalog.indexes.some(i => i.valid && normalize(i.definition) === normalize(`CREATE UNIQUE INDEX ${table}_pkey ON ${table} (${primary})`));
    if (!primary || !keyIndex) return "partial";
    for (const unique of tableSql.matchAll(/(\w+) \w+ NOT NULL UNIQUE/g)) {
      if (!catalog.indexes.some(i => i.valid && normalize(i.definition) === normalize(`CREATE UNIQUE INDEX ${table}_${unique[1]}_key ON ${table} (${unique[1]})`))) return "partial";
    }
    // Missing checks/FKs cannot be described as a complete baseline.
    for (const check of checkDefinitions(tableSql)) {
      if (!catalog.constraints.some(c => c.table_name === table && c.kind === "c" && c.validated && normalize(c.definition) === normalize(check))) return "partial";
    }
    for (const foreign of tableSql.matchAll(/(\w+) \w+ REFERENCES (\w+) \((\w+)\)/g)) {
      if (!catalog.constraints.some(c => c.table_name === table && c.kind === "f" && c.validated
        && normalize(c.definition) === normalize(`FOREIGN KEY (${foreign[1]}) REFERENCES ${foreign[2]} (${foreign[3]})`))) return "partial";
    }
  }
  for (const func of functions) {
    if (!catalog.functions.some(f => f.name === func[1] && f.language === "plpgsql" && f.result === "trigger" && f.body.trim() === func[2].trim())) return "partial";
  }
  // 0006's dynamic CREATE statements have the same definitions as 0005.
  for (const trigger of sql.matchAll(/CREATE TRIGGER (\w+)\s+([\s\S]*?EXECUTE FUNCTION \w+\(\))/g)) {
    const actual = catalog.triggers.find(t => t.name === trigger[1]);
    if (!actual || !["O", "A"].includes(actual.enabled)
      || normalize(actual.definition) !== normalize(`CREATE TRIGGER ${trigger[1]} ${trigger[2]}`)) return "partial";
  }
  return "complete";
}

// Reconciliation is permitted to fill absent tables/indexes/triggers, but never
// assumes CREATE TABLE IF NOT EXISTS can repair incompatible existing columns.
function reconciliationCompatible(sql: string, catalog: MigrationCatalog) {
  return expectedColumns(sql).every(c =>
    !catalog.columns.some(a => a.table_name === c.table_name) || columnCompatible(findColumn(catalog, c), c));
}

type RunnerOptions = {
  signal?: AbortSignal;
  logger?: Pick<Console, "info" | "warn">;
  readMigration?: (filename: string) => Promise<Buffer>;
  lockWaitMs?: number;
  pollMs?: number;
  operationTimeoutMs?: number;
  totalTimeoutMs?: number;
};

export async function runStartupMigrations(pool: Pick<Pool, "connect">, options: RunnerOptions = {}): Promise<MigrationReport> {
  const logger = options.logger ?? console;
  const outcomes = new Map<string, MigrationOutcome>();
  const record = (filename: string, status: MigrationOutcome["status"], reason: string) => {
    if (outcomes.has(filename)) return;
    const outcome = { filename, status, reason };
    outcomes.set(filename, outcome);
    (status === "refused" ? logger.warn : logger.info).call(logger, "SafeLoc startup migration.", JSON.stringify(outcome));
  };
  let client: PoolClient | undefined;
  let destroyed = false;
  let transaction = false;
  let terminalReason = "migration-session-unavailable";
  const deadline = Date.now() + (options.totalTimeoutMs ?? 30_000);
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    client?.release(true); // Destroying the session releases advisory locks, even after uncertain COMMIT.
  };
  const onAbort = () => destroy();
  const onError = () => destroy();
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (options.signal?.aborted || destroyed) throw new Error("migration-stopped");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          const stop = () => { destroy(); reject(new Error("migration-stopped")); };
          timer = setTimeout(stop, Math.max(1, Math.min(options.operationTimeoutMs ?? 12_000, deadline - Date.now())));
          abort = stop;
          options.signal?.addEventListener("abort", stop, { once: true });
          client?.once("error", stop);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (abort) {
        options.signal?.removeEventListener("abort", abort);
        client?.off("error", abort);
      }
    }
  };
  const query = (sql: string, values?: unknown[]) => bounded(() => client!.query(sql, values));
  const readMigration = options.readMigration ?? (filename => readFile(new URL(`../migrations/${filename}`, import.meta.url)));
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    // A checkout that arrives after timeout/abort is destroyed, never leaked.
    client = await bounded(async () => {
      const connected = await pool.connect();
      if (destroyed || options.signal?.aborted) { connected.release(true); throw new Error("migration-stopped"); }
      return connected;
    });
    protectDatabaseClient(client, logger);
    client.on("error", onError);
    // pg_catalog is implicitly searched first; public is the creation schema.
    await query("SET search_path TO public");
    await query("SET statement_timeout TO '10s'");
    await query("SET lock_timeout TO '2s'");
    const lockDeadline = Date.now() + (options.lockWaitMs ?? 2_000);
    while (true) {
      const lock = await query("SELECT pg_try_advisory_lock(1935763045, 1835624306) AS acquired");
      if (lock.rows[0]?.acquired === true) break;
      if (Date.now() >= lockDeadline) {
        terminalReason = "migration-lock-wait-exhausted";
        return finish();
      }
      await bounded(() => new Promise(resolve => setTimeout(resolve, Math.min(options.pollMs ?? 50, Math.max(1, lockDeadline - Date.now())))));
    }
    await query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const [index, migration] of REVIEWED_MIGRATIONS.entries()) {
      const { filename, sha256 } = migration;
      let bytes: Buffer;
      try { bytes = await bounded(() => readMigration(filename)); }
      catch {
        record(filename, "refused", "pinned-file-unavailable");
        continue;
      }
      if (createHash("sha256").update(bytes).digest("hex") !== sha256) {
        record(filename, "refused", "pinned-file-checksum-mismatch");
        continue;
      }
      try {
        const receipt = await query("SELECT sha256 FROM public.schema_migrations WHERE filename = $1", [filename]);
        if (receipt.rows.length) {
          record(filename, receipt.rows[0].sha256 === sha256 ? "skipped" : "refused",
            receipt.rows[0].sha256 === sha256 ? "already-applied" : "receipt-checksum-conflict");
          continue;
        }
        const sql = bytes.toString("utf8");
        const catalog = (await query(CATALOG_SQL)).rows[0] as MigrationCatalog;
        const state = inspectMigrationSchema(index, sql, catalog);
        if (state === "partial" && (index !== 5 || !reconciliationCompatible(sql, catalog))) {
          record(filename, "refused", "partial-or-incompatible-schema");
          continue;
        }
        await query("BEGIN");
        transaction = true;
        if (state !== "complete" || index === 5) await query(sql);
        await query("INSERT INTO public.schema_migrations (filename, sha256) VALUES ($1, $2)", [filename, sha256]);
        await query("COMMIT");
        transaction = false;
        record(filename, state === "complete" && index !== 5 ? "baseline" : "applied",
          state === "complete" && index !== 5 ? "observed-schema-compatible-not-historical-execution" : "transaction-committed");
      } catch {
        // Never retry an uncertain COMMIT. Next startup re-checks its receipt.
        if (transaction && !destroyed) {
          try { await query("ROLLBACK"); } catch { destroy(); }
        }
        transaction = false;
        record(filename, "refused", "migration-operation-failed");
        if (destroyed) break;
      }
    }
  } catch {
    terminalReason = options.signal?.aborted ? "startup-shutdown" : "migration-session-unavailable";
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    client?.off("error", onError);
    // No pool reuse of altered timeouts, failed transactions or held locks.
    if (client && !destroyed) destroy();
    finish();
  }
  return finish();

  function finish(): MigrationReport {
    for (const migration of REVIEWED_MIGRATIONS) {
      record(migration.filename, "refused", terminalReason);
    }
    const ordered = REVIEWED_MIGRATIONS.map(m => outcomes.get(m.filename)!);
    return { warning: ordered.some(o => o.status === "refused"), outcomes: ordered };
  }
}
