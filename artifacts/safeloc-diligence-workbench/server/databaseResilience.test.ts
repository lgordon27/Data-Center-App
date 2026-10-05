import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { Pool } from "pg";
import { protectDatabasePool, retryDatabaseConnectionOperation, installDatabaseSafetyNet, boundedAuditOperation, logDatabaseConnectionError } from "./databaseResilience.mjs";
import { createResearchAuditRepository } from "./researchAuditRepository.js";
import { handleResearchProjectRequest } from "./researchProjectProxy.mjs";
import { createResearchProjectCache } from "./researchProjectCache.mjs";

const dropped = () => Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
const quiet = { warn() {}, error() {} };

function fakePool(query: (text: string, values?: unknown[]) => Promise<unknown>) {
  const releases: boolean[] = [];
  const clients: EventEmitter[] = [];
  const pool = Object.assign(new EventEmitter(), {
    connect(callback?: (...args: unknown[]) => void) {
      const client = Object.assign(new EventEmitter(), {
        query: (text: string, values?: unknown[]) => query(text, values),
        release: (destroy?: boolean) => releases.push(Boolean(destroy)),
      });
      clients.push(client);
      pool.emit("connect", client);
      if (callback) { queueMicrotask(() => callback(null, client, client.release)); return; }
      return Promise.resolve(client);
    },
    query,
  });
  protectDatabasePool(pool as unknown as Pool, quiet);
  return { pool, releases, clients };
}

test("checked-out, idle and callback clients consume errors and discard each checkout exactly once", async () => {
  const fixture = fakePool(async () => ({ rows: [], rowCount: 1 }));
  const client = await fixture.pool.connect();
  assert.ok(client);
  client.emit("error", dropped());
  client.release();
  assert.deepEqual(fixture.releases, [true]);
  assert.doesNotThrow(() => fixture.pool.emit("error", dropped(), client));
  await new Promise<void>((resolve) => fixture.pool.connect((_error, checkedOut, release) => {
    (checkedOut as EventEmitter).emit("error", dropped());
    (release as () => void)();
    resolve();
  }));
  assert.deepEqual(fixture.releases, [true, true]);
});

test("audit writes retry once with a fresh checkout and release successful and failed clients", async () => {
  let queries = 0;
  const fixture = fakePool(async () => {
    queries += 1;
    if (queries === 1) throw dropped();
    return { rows: [], rowCount: 1 };
  });
  await createResearchAuditRepository(fixture.pool as unknown as Pool).progressRun({
    runId: "offline-run", projectName: "Fixture", projectLocation: "Texas",
    researchStatus: "running", projectSummary: {}, audit: {},
  });
  assert.equal(fixture.clients.length, 2);
  assert.deepEqual(fixture.releases, [true, false]);
});

test("non-connection audit errors are not retried", async () => {
  let calls = 0;
  await assert.rejects(retryDatabaseConnectionOperation(async () => {
    calls += 1;
    throw Object.assign(new Error("syntax error"), { code: "42601" });
  }), /syntax error/);
  assert.equal(calls, 1);
});

test("a stalled audit operation has a bounded retry and never waits indefinitely", async () => {
  let calls = 0;
  await assert.rejects(retryDatabaseConnectionOperation(() => boundedAuditOperation(() => {
    calls += 1;
    return new Promise(() => {});
  }, 10)), (error: unknown) => (error as { code?: string }).code === "ETIMEDOUT");
  assert.equal(calls, 2);
});

test("database error logging never includes connection strings or raw error messages", () => {
  const logged: unknown[] = [];
  logDatabaseConnectionError(new Error("postgres://user:secret@example.test/db api_key=private"), "audit", {
    warn(...args: unknown[]) { logged.push(args); },
  });
  assert.doesNotMatch(JSON.stringify(logged), /secret|private|postgres:|example.test/);
});

test("mid-run client errors cannot discard the research result; failed audit writes remain explicit", async () => {
  let finalAttempts = 0;
  let progressAttempts = 0;
  const fixture = fakePool(async (text, values) => {
    if (text.startsWith("INSERT")) return { rows: [], rowCount: 1 };
    if (text.includes("SET audit =")) progressAttempts += 1;
    if (text.includes("finished_at = COALESCE") && values?.[1] !== "finalization-failed") finalAttempts += 1;
    fixture.clients.at(-1)!.emit("error", dropped());
    throw dropped();
  });
  const heldClient = await fixture.pool.connect();
  const response = {
    statusCode: 0, headers: {} as Record<string, string>, body: "",
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { this.body = body; },
  };
  await handleResearchProjectRequest({
    method: "POST", body: { name: "Offline database fixture", location: "Texas", forceRefresh: true },
    headers: {},
  }, response, {
    apiKey: "offline-fixture-key", googleApiKey: null,
    categoryIds: ["project-identity"], allowGoogleFallback: false,
    allowCorrectiveRetries: false, useDefaultSecConnector: false,
    googleDiscoveryImpl: async () => {
      heldClient!.emit("error", dropped());
      return { sources: [], providerAvailable: true, searchQueries: [], searchTerms: [] };
    },
    fetchImpl: async () => { throw new Error("No provider requests permitted."); },
    cache: createResearchProjectCache(),
    auditRepository: createResearchAuditRepository(fixture.pool as unknown as Pool),
  });
  assert.equal(response.statusCode, 200);
  const result = JSON.parse(response.body);
  assert.ok(result.projectSummary);
  assert.equal(result.auditPersistence.state, "persistence-incomplete");
  assert.ok(result.auditPersistence.reasonCodes.includes("audit-finalize-write-failed"));
  assert.equal(progressAttempts, 2);
  assert.equal(finalAttempts, 2);
  assert.equal(fixture.releases.length, fixture.clients.length);
});

test("startup sweep only interrupts running unfinished audits older than run bound plus margin", async () => {
  const now = Date.parse("2026-10-05T15:15:00Z");
  const stale = { runId: "f5e7aa32-0d69-49f7-b55d-6d7749c6e24c", status: "running", finished: null as number | null, started: Date.parse("2026-10-05T14:49:46.126Z") };
  const recent = { ...stale, runId: "recent", started: now - 30_000 };
  const completed = { ...stale, runId: "complete", status: "partial", finished: now };
  const rows = [stale, recent, completed];
  const repository = createResearchAuditRepository({
    async query(text: string, values: unknown[]) {
      assert.match(text, /research_status = 'running' AND finished_at IS NULL/);
      assert.match(text, /server-restart-before-finalize/);
      const selected = rows.filter((row) => row.status === "running" && row.finished === null && row.started < now - Number(values[0]));
      selected.forEach((row) => { row.status = "interrupted"; row.finished = now; });
      return { rows: [], rowCount: selected.length };
    },
  } as unknown as Pool);
  assert.equal(await repository.interruptStaleRuns(75_000), 1);
  assert.equal(stale.status, "interrupted");
  assert.equal(recent.status, "running");
  assert.equal(completed.status, "partial");
});

test("process safety net handles only recognized pg connection faults, not programming errors", () => {
  let exitCode: number | null = null;
  const target = Object.assign(new EventEmitter(), { exit: (code: number) => { exitCode = code; } });
  const uninstall = installDatabaseSafetyNet(target as unknown as NodeJS.Process, quiet);
  const error = dropped();
  error.stack = "Error\n at Client._handleErrorMessage (/node_modules/pg/lib/client.js:433:12)";
  target.emit("uncaughtException", error);
  assert.equal(exitCode, null);
  target.emit("uncaughtException", new TypeError("programming defect"));
  assert.equal(exitCode, 1);
  uninstall();
  assert.equal(target.listenerCount("uncaughtException"), 0);
});

test("a real server process remains reachable after a client termination event", () => {
  const helper = new URL("./databaseResilience.mjs", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { EventEmitter } from "node:events";
    import { createServer } from "node:http";
    import { protectDatabaseClient, installDatabaseSafetyNet } from ${JSON.stringify(helper)};
    installDatabaseSafetyNet();
    const client = new EventEmitter();
    protectDatabaseClient(client);
    const server = createServer((_req, res) => res.end("alive"));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    client.emit("error", Object.assign(new Error("terminating connection due to administrator command"), {code:"57P01"}));
    const response = await fetch("http://127.0.0.1:" + server.address().port);
    if (await response.text() !== "alive") process.exit(2);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    console.log("server-survived");
  `], { encoding: "utf8", timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /server-survived/);
  assert.doesNotMatch(child.stderr, /Unhandled 'error'/);
});
