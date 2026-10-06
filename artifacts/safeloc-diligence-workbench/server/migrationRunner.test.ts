import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before, after, beforeEach, afterEach } from "node:test";
import pg, { type Pool, type PoolClient } from "pg";
import express from "express";
import { protectDatabasePool } from "./databaseResilience.mjs";
import { REVIEWED_MIGRATIONS, runStartupMigrations } from "./migrationRunner.js";
import { createInitializationGateServer, createReadinessMiddleware, initializeServerApp } from "./index.js";
import { logDatabaseStartupDiagnostics } from "./db.js";
import { createResearchAuditRepository } from "./researchAuditRepository.js";

// A new, temporary local cluster, Unix socket only, never DATABASE_URL.
// PostgreSQL binaries are required for this explicitly invoked offline suite.
let directory: string;
let admin: Pool;
let pool: Pool;
let serial = 0;
const sqlFiles = await Promise.all(REVIEWED_MIGRATIONS.map(m => readFile(new URL(`../migrations/${m.filename}`, import.meta.url))));
const quiet = { info() {}, warn() {} };
const run = (options: Parameters<typeof runStartupMigrations>[1] = {}, target = pool) =>
  runStartupMigrations(target, { logger: quiet, ...options });
const receipts = async () => (await pool.query("SELECT filename, sha256 FROM schema_migrations ORDER BY filename")).rows;
const earlier = async (count = 5) => {
  for (const sql of sqlFiles.slice(0, count)) await pool.query(sql.toString());
};
const intercept = (callback: (client: PoolClient, sql: string, values?: unknown[]) => Promise<pg.QueryResult>) => ({
  async connect() {
    const client = await pool.connect();
    const proxy = Object.create(client) as PoolClient;
    proxy.query = ((sql: string, values?: unknown[]) => callback(client, sql, values)) as PoolClient["query"];
    proxy.release = client.release.bind(client);
    return proxy;
  },
}) as Pick<Pool, "connect">;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "safeloc-migration-test-"));
  const data = path.join(directory, "data");
  execFileSync("initdb", ["-D", data, "-A", "trust", "-U", "fixture", "--no-locale"], { stdio: "ignore" });
  execFileSync("pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-o", `-k ${directory} -p 55439 -c listen_addresses='' -c fsync=off`, "-w", "start"], { stdio: "ignore" });
  admin = new pg.Pool({ host: directory, port: 55439, user: "fixture", database: "postgres" });
});
after(async () => {
  await admin?.end();
  if (directory) {
    try { execFileSync("pg_ctl", ["-D", path.join(directory, "data"), "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});
beforeEach(async () => {
  const database = `fixture_${++serial}`;
  await admin.query(`CREATE DATABASE ${database}`);
  pool = protectDatabasePool(new pg.Pool({
    host: directory, port: 55439, user: "fixture", database, connectionTimeoutMillis: 500,
  }), quiet);
});
afterEach(async () => { await pool?.end(); });

test("fresh schema commits all six pins, including 0006, and second startup skips all", async () => {
  const first = await run();
  assert.equal(first.warning, false, JSON.stringify(first));
  assert.deepEqual(first.outcomes.map(o => o.status), Array(6).fill("applied"));
  assert.deepEqual(await receipts(), REVIEWED_MIGRATIONS);
  assert.ok((await pool.query("SELECT to_regclass('public.proof_ledger_events') AS table")).rows[0].table);
  const second = await run();
  assert.equal(second.warning, false);
  assert.deepEqual(second.outcomes.map(o => o.status), Array(6).fill("skipped"));
});

test("complete earlier objects are baselined, including superseded audit lifecycle, without SQL replay", async () => {
  await earlier();
  const replayed: string[] = [];
  const target = intercept(async (client, sql, values) => {
    if (sqlFiles.slice(0, 5).some(bytes => bytes.toString() === sql)) replayed.push(sql);
    return client.query(sql, values);
  });
  const report = await runStartupMigrations(target, { logger: quiet });
  assert.deepEqual(report.outcomes.map(o => o.status), ["baseline", "baseline", "baseline", "baseline", "baseline", "applied"], JSON.stringify(report));
  assert.equal(report.warning, false);
  assert.equal(replayed.length, 0);
  assert.equal((await receipts()).length, 6);
});

test("missing and modified pins refuse even an existing receipt, with one sanitized terminal line each", async () => {
  await run();
  const lines: unknown[] = [];
  const report = await run({
    readMigration: async filename => {
      if (filename === REVIEWED_MIGRATIONS[0].filename) throw new Error("postgres://secret/private");
      return filename === REVIEWED_MIGRATIONS[5].filename ? Buffer.from("private SQL") : sqlFiles[REVIEWED_MIGRATIONS.findIndex(m => m.filename === filename)];
    },
    logger: { info: (...args) => lines.push(args), warn: (...args) => lines.push(args) },
  });
  assert.equal(report.warning, true);
  assert.equal(report.outcomes[0].reason, "pinned-file-unavailable");
  assert.equal(report.outcomes[5].reason, "pinned-file-checksum-mismatch");
  assert.equal(lines.length, 6);
  assert.doesNotMatch(JSON.stringify(lines), /secret|private|postgres:|CREATE TABLE/);
  assert.equal((await pool.query("SELECT 1 AS alive")).rows[0].alive, 1);
});

test("mid-migration failure rolls back SQL and receipt; next successful startup clears warning", async () => {
  await earlier(4);
  const target = intercept(async (client, sql, values) => {
    const result = await client.query(sql, values);
    if (sql === sqlFiles[5].toString()) await client.query("SELECT 1 / 0");
    return result;
  });
  // Refuse 0005 by pin mismatch so reconciliation alone creates the tables.
  const readMigration = async (filename: string) => filename === REVIEWED_MIGRATIONS[4].filename
    ? Buffer.from("not approved") : sqlFiles[REVIEWED_MIGRATIONS.findIndex(m => m.filename === filename)];
  const failed = await runStartupMigrations(target, { readMigration, logger: quiet });
  assert.equal(failed.outcomes[5].status, "refused");
  assert.equal((await pool.query("SELECT to_regclass('public.proof_ledger_events') AS table")).rows[0].table, null);
  assert.equal((await receipts()).length, 4);
  assert.equal((await pool.query("SELECT 1 AS alive")).rows[0].alive, 1);
  const successful = await run();
  assert.equal(successful.warning, false, JSON.stringify(successful));
  assert.equal((await receipts()).length, 6);
});

test("concurrent workers wait and re-check real shared lock and receipts, executing once", async () => {
  const counts = Array(6).fill(0);
  const target = intercept(async (client, sql, values) => {
    const index = sqlFiles.findIndex(bytes => bytes.toString() === sql);
    if (index >= 0) {
      counts[index]++;
      await client.query("SELECT pg_sleep(0.02)");
    }
    return client.query(sql, values);
  });
  const reports = await Promise.all([
    runStartupMigrations(target, { logger: quiet }), runStartupMigrations(target, { logger: quiet }),
  ]);
  assert.deepEqual(counts, Array(6).fill(1));
  assert.equal(reports.every(r => !r.warning), true, JSON.stringify(reports));
  assert.deepEqual(reports.map(r => r.outcomes[5].status).sort(), ["applied", "skipped"]);
  assert.equal((await receipts()).length, 6);
});

test("bounded contention refuses safely and destroys session without stealing a lock", async () => {
  const holder = await pool.connect();
  await holder.query("SELECT pg_advisory_lock(1935763045, 1835624306)");
  try {
    const start = Date.now();
    const report = await run({ lockWaitMs: 40, pollMs: 5 });
    assert.ok(Date.now() - start < 1_000);
    assert.equal(report.outcomes.every(o => o.reason === "migration-lock-wait-exhausted"), true);
    assert.equal((await pool.query("SELECT to_regclass('public.schema_migrations') AS table")).rows[0].table, null);
  } finally {
    await holder.query("SELECT pg_advisory_unlock_all()");
    holder.release();
  }
  assert.equal((await run()).warning, false);
});

test("partial proof history refuses trigger replacement but retains additive reconciliation", async () => {
  await earlier();
  await pool.query("DROP TRIGGER proof_ledger_events_validate_references ON proof_ledger_events");
  const report = await run();
  assert.equal(report.outcomes[4].reason, "partial-or-incompatible-schema");
  assert.equal(report.outcomes[5].status, "applied");
  assert.equal((await receipts()).some(r => r.filename === REVIEWED_MIGRATIONS[4].filename), false);
  assert.equal((await run()).warning, false); // Baseline after reconciliation completes objects.
});

test("wrong columns, defaults, nullability, invalid checks, indexes and function bodies never baseline", async () => {
  await earlier();
  await pool.query("ALTER TABLE dossiers ALTER COLUMN coverage_state DROP DEFAULT");
  await pool.query("ALTER TABLE research_run_audits ALTER COLUMN finished_at SET DEFAULT now()");
  await pool.query("DROP INDEX public_request_events_client_time_idx");
  await pool.query("ALTER TABLE proof_user_decisions DROP CONSTRAINT proof_user_decisions_schema_version_check");
  await pool.query("ALTER TABLE proof_user_decisions ADD CHECK (schema_version >= 0)");
  const report = await run();
  for (const index of [0, 1, 2, 3, 4]) assert.equal(report.outcomes[index].reason, "partial-or-incompatible-schema", JSON.stringify(report));
  assert.equal(report.outcomes[5].status, "applied");
  // CREATE TABLE IF NOT EXISTS cannot repair this check: 0005 remains unbaselined.
  assert.equal((await run()).outcomes[4].status, "refused");
});

test("stored checksum conflict refuses execution without overwriting receipt", async () => {
  await run();
  await pool.query("UPDATE schema_migrations SET sha256 = 'conflict' WHERE filename = $1", [REVIEWED_MIGRATIONS[5].filename]);
  const report = await run();
  assert.equal(report.outcomes[5].reason, "receipt-checksum-conflict");
  assert.equal((await receipts())[5].sha256, "conflict");
});

test("connection loss destroys lock session and startup can recover without automatic replay", async () => {
  let killed = false;
  const target = intercept(async (client, sql, values) => {
    if (sql === sqlFiles[0].toString() && !killed) {
      killed = true;
      const pid = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await admin.query("SELECT pg_terminate_backend($1)", [pid]);
    }
    return client.query(sql, values);
  });
  const report = await runStartupMigrations(target, { logger: quiet, operationTimeoutMs: 500 });
  assert.equal(report.warning, true);
  assert.equal(killed, true);
  assert.equal((await run()).warning, false);
});

test("shutdown during SQL releases transaction and lock, and does not leave receipts", async () => {
  const controller = new AbortController();
  let paused!: () => void;
  const pause = new Promise<void>(resolve => { paused = resolve; });
  const target = intercept(async (client, sql, values) => {
    // PostgreSQL can notice TCP/socket loss only after its active statement.
    // Bound the real backend statement too; client destruction is not a claim
    // that the backend has synchronously released its advisory lock.
    if (sql === "SET statement_timeout TO '10s'") return client.query("SET statement_timeout TO '200ms'");
    if (sql === sqlFiles[0].toString()) {
      paused();
      await client.query("SELECT pg_sleep(10)");
    }
    return client.query(sql, values);
  });
  const running = runStartupMigrations(target, { logger: quiet, signal: controller.signal });
  await pause;
  controller.abort();
  const report = await running;
  assert.equal(report.warning, true);
  assert.equal((await receipts()).length, 0);
  assert.equal((await run()).warning, false);
});

test("stalled migration query times out and frees session so startup can proceed", async () => {
  const target = intercept(async (client, sql, values) => {
    if (sql === "SET statement_timeout TO '10s'") return client.query("SET statement_timeout TO '200ms'");
    if (sql === sqlFiles[0].toString()) await client.query("SELECT pg_sleep(10)");
    return client.query(sql, values);
  });
  const report = await runStartupMigrations(target, { logger: quiet, operationTimeoutMs: 100 });
  assert.equal(report.warning, true);
  assert.equal((await run()).warning, false);
});

test("changed proof function, disabled trigger and incompatible columns refuse baseline", async () => {
  await earlier();
  await pool.query(`CREATE OR REPLACE FUNCTION safeloc_reject_proof_history_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
  await pool.query("ALTER TABLE proof_ledger_events DISABLE TRIGGER proof_ledger_events_append_only");
  await pool.query("ALTER TABLE proof_user_decisions ALTER COLUMN rationale DROP NOT NULL");
  const report = await run();
  assert.equal(report.outcomes[4].reason, "partial-or-incompatible-schema");
  assert.equal(report.outcomes[5].reason, "partial-or-incompatible-schema");
  assert.equal((await receipts()).length, 4);
});

test("valid lifecycle predecessor is upgraded, but incomplete lifecycle is not replayed", async () => {
  await earlier(2);
  const report = await run();
  assert.deepEqual(report.outcomes.slice(0, 3).map(o => o.status), ["baseline", "baseline", "applied"]);
  await pool.query("DELETE FROM schema_migrations WHERE filename = $1", [REVIEWED_MIGRATIONS[2].filename]);
  await pool.query("ALTER TABLE research_run_audits ALTER COLUMN started_at DROP NOT NULL");
  const partial = await run();
  assert.equal(partial.outcomes[2].reason, "partial-or-incompatible-schema");
});

test("baseline comparisons preserve case and whitespace inside SQL literals", async () => {
  await earlier();
  await pool.query("ALTER TABLE dossiers ALTER COLUMN coverage_state SET DEFAULT 'REVIEW'");
  await pool.query("DROP INDEX proof_user_decisions_session_idx");
  await pool.query(`CREATE INDEX proof_user_decisions_session_idx
    ON proof_user_decisions (session_ref, recorded_at) WHERE actor_kind = 'ANONYMOUS-SESSION'`);
  const report = await run();
  assert.equal(report.outcomes[0].reason, "partial-or-incompatible-schema");
  assert.equal(report.outcomes[4].reason, "partial-or-incompatible-schema");
});

test("late checkout after timeout is destroyed exactly once", async () => {
  let released = 0;
  const target = {
    async connect() {
      await new Promise(resolve => setTimeout(resolve, 40));
      const client = await pool.connect();
      const release = client.release.bind(client);
      client.release = error => { released++; release(error); };
      return client;
    },
  } as Pick<Pool, "connect">;
  const report = await runStartupMigrations(target, { logger: quiet, operationTimeoutMs: 10 });
  assert.equal(report.warning, true);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(released, 1);
  assert.equal((await run()).warning, false);
});

test("uncertain commit is not replayed in-process; subsequent startup inspects committed receipt", async () => {
  let commits = 0;
  const target = intercept(async (client, sql, values) => {
    const result = await client.query(sql, values);
    if (sql === "COMMIT" && ++commits === 1) throw new Error("uncertain outcome private SQL");
    return result;
  });
  const report = await runStartupMigrations(target, { logger: quiet });
  assert.equal(report.outcomes[0].status, "refused");
  assert.equal((await receipts()).length, 6);
  const next = await run();
  assert.equal(next.warning, false);
  assert.equal(next.outcomes[0].status, "skipped");
});

test("real migration refusal keeps HTTP usable, preserves interrupted-run sweep and clears warnings on next startup", async () => {
  await earlier(4);
  await pool.query(`INSERT INTO research_run_audits
    (run_id, project_name, project_location, research_status, project_summary, audit, started_at)
    VALUES ('6f9619ff-8b86-4d11-b42d-00c04fc964ff', 'Offline', 'Fixture', 'running', '{}', '{}', now() - interval '1 hour')`);
  const faulty = intercept(async (client, sql, values) => {
    const result = await client.query(sql, values);
    if (sql === sqlFiles[5].toString()) await client.query("SELECT 1 / 0");
    return result;
  });
  for (const failing of [true, false]) {
    const startup = createInitializationGateServer(0, readiness => initializeServerApp(readiness, new AbortController().signal, {
      wait: async () => { await pool.query("SELECT 1"); return true; },
      migrate: async () => failing ? runStartupMigrations(faulty, {
        logger: quiet,
        readMigration: async filename => filename === REVIEWED_MIGRATIONS[4].filename
          ? Buffer.from("checksum failure") : sqlFiles[REVIEWED_MIGRATIONS.findIndex(m => m.filename === filename)],
      }) : run(),
      diagnose: () => logDatabaseStartupDiagnostics(sql => pool.query(sql), undefined, quiet),
      sweep: () => createResearchAuditRepository(pool).interruptStaleRuns(75_000),
      app: async state => {
        const app = express();
        app.use(createReadinessMiddleware(state));
        app.get("/", (_request, response) => response.send("usable"));
        return app;
      },
    }), "127.0.0.1");
    try {
      await startup.initialized;
      const address = startup.server.address();
      assert.ok(address && typeof address === "object");
      const base = `http://127.0.0.1:${address.port}`;
      assert.equal(await (await fetch(base)).text(), "usable");
      const health = await fetch(`${base}/api/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ready", schemaWarning: failing, migrationWarning: failing });
      assert.equal((await pool.query("SELECT research_status FROM research_run_audits")).rows[0].research_status, "interrupted");
    } finally {
      await new Promise<void>(resolve => startup.server.close(() => resolve()));
    }
  }
});
