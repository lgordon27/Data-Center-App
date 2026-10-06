import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { databaseHostFingerprint, logDatabaseStartupDiagnostics } from "./db.js";

test("database host fingerprint hashes only the parsed hostname", () => {
  const firstUrl = "postgresql://first:secret-one@db.example.test:5432/first?sslmode=require";
  const secondUrl = "postgres://second:secret-two@db.example.test:6432/second";
  const expected = createHash("sha256").update("db.example.test").digest("hex").slice(0, 8);

  assert.equal(databaseHostFingerprint(firstUrl), expected);
  assert.equal(databaseHostFingerprint(secondUrl), expected);
  assert.equal(databaseHostFingerprint("not a database URL"), null);
});

test("startup diagnostics report the database and missing schema without exposing connection details", async () => {
  const connectionString = "postgresql://operator:private-pass@192.0.2.44:5432/heliumdb";
  const events: { level: string; args: unknown[] }[] = [];
  const logger = {
    info: (...args: unknown[]) => events.push({ level: "info", args }),
    warn: (...args: unknown[]) => events.push({ level: "warn", args }),
  };

  await logDatabaseStartupDiagnostics(
    async (sql) => {
      assert.match(sql, /information_schema\.columns/);
      assert.match(sql, /information_schema\.tables/);
      assert.match(sql, /public_request_events/);
      assert.match(sql, /proof_user_decisions/);
      assert.match(sql, /proof_ledger_events/);
      return {
        rows: [{
          database_name: "heliumdb",
          missing_tables: ["proof_ledger_events", "proof_user_decisions"],
          missing_columns: ["research_result_cache.result"],
        }],
      };
    },
    connectionString,
    logger,
  );

  const logged = JSON.stringify(events);
  assert.match(logged, new RegExp(databaseHostFingerprint(connectionString)!));
  assert.match(logged, /heliumdb/);
  assert.match(logged, /proof_ledger_events/);
  assert.match(logged, /research_result_cache\.result/);
  assert.doesNotMatch(logged, /private-pass|operator|192\.0\.2\.44|postgresql:\/\//);
  assert.equal(events.filter((event) => event.level === "warn").length, 1);
});

test("startup database query failures use a fixed warning without logging the error", async () => {
  const connectionString = "postgresql://operator:private-pass@192.0.2.45:5432/heliumdb";
  const events: { level: string; args: unknown[] }[] = [];
  const logger = {
    info: (...args: unknown[]) => events.push({ level: "info", args }),
    warn: (...args: unknown[]) => events.push({ level: "warn", args }),
  };

  await logDatabaseStartupDiagnostics(
    async () => { throw new Error(connectionString); },
    connectionString,
    logger,
  );

  assert.deepEqual(events, [{
    level: "warn",
    args: ["SafeLoc database startup diagnostics unavailable."],
  }]);
  assert.doesNotMatch(JSON.stringify(events), /private-pass|operator|192\.0\.2\.45|postgresql:\/\//);
});