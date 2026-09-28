import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg, { type Pool } from "pg";
import { createOwnerAuditDownloadRateLimiter, handleResearchAuditDownload } from "./researchAuditApi.js";
import { createResearchAuditRepository, type ResearchRunAudit } from "./researchAuditRepository.js";

const ownerToken = "owner-token-for-research-audit-download-tests";
const record: ResearchRunAudit = {
  runId: "6f9619ff-8b86-4d11-b42d-00c04fc964ff",
  projectName: "Northstar Storage",
  projectLocation: "Texas",
  researchStatus: "partial",
  projectSummary: {
    overview: "Research completed with limited source coverage.",
    sources: [{ hostname: "records.example.test", status: "verified" }],
  },
  audit: {
    hostname: "records.example.test",
    rule: "reject-private-or-reserved-addresses",
    rejectedAnswer: "192.0.2.45",
  },
};

function responseHarness() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

async function download(authorization?: string, token = ownerToken) {
  const audit = { ...record, audit: { ...record.audit } };
  let lookups = 0;
  const result = responseHarness();
  await handleResearchAuditDownload(
    {
      get: () => authorization,
      params: { runId: record.runId },
    } as never,
    result as never,
    {
      ownerToken: token,
      repository: {
        async get(runId) {
          lookups += 1;
          assert.equal(runId, record.runId);
          return audit;
        },
      },
    },
  );
  return { result, lookups, audit };
}

test("research audit download requires owner authorization", async () => {
  const missing = await download();
  assert.equal(missing.result.statusCode, 401);
  assert.deepEqual(missing.result.body, { error: "Owner authorization required." });
  assert.equal(missing.lookups, 0);

  const missingOwnerConfiguration = await download(`Bearer ${ownerToken}`, "too-short");
  assert.equal(missingOwnerConfiguration.result.statusCode, 401);
  assert.equal(missingOwnerConfiguration.lookups, 0);

  const wrong = await download("Bearer incorrect-owner-token-value");
  assert.equal(wrong.result.statusCode, 401);
  assert.deepEqual(wrong.result.body, { error: "Owner authorization required." });
  assert.equal(wrong.lookups, 0);
});

test("authorized research audit download returns a JSON attachment", async () => {
  const { result, lookups, audit } = await download(`Bearer ${ownerToken}`);
  assert.equal(result.statusCode, 200);
  assert.equal(lookups, 1);
  assert.deepEqual(result.body, audit);
  assert.equal(
    result.headers["content-disposition"],
    `attachment; filename="research-audit-${record.runId}.json"`,
  );
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.headers.vary, "Authorization");
});

test("authorized audit downloads are rate limited per client", async () => {
  let now = 1_000;
  let lookups = 0;
  const rateLimiter = createOwnerAuditDownloadRateLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => now,
  });
  const requestFrom = async (ip: string, authorization = `Bearer ${ownerToken}`) => {
    const result = responseHarness();
    await handleResearchAuditDownload({
      get: () => authorization,
      params: { runId: record.runId },
      ip,
    } as never, result as never, {
      ownerToken,
      rateLimiter,
      repository: {
        async get() {
          lookups += 1;
          return record;
        },
      },
    });
    return result;
  };

  assert.equal((await requestFrom("203.0.113.10")).statusCode, 200);
  assert.equal((await requestFrom("203.0.113.10")).statusCode, 200);
  const limited = await requestFrom("203.0.113.10");
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["retry-after"], "60");
  assert.equal((await requestFrom("203.0.113.11")).statusCode, 200);
  assert.equal(lookups, 3);

  const rejected = await requestFrom("203.0.113.12", "Bearer invalid-token-value");
  assert.equal(rejected.statusCode, 401);
  assert.equal((await requestFrom("203.0.113.12", "Bearer invalid-token-value")).statusCode, 401);
  const invalidTokenLimited = await requestFrom("203.0.113.12", "Bearer invalid-token-value");
  assert.equal(invalidTokenLimited.statusCode, 429);
  assert.equal(invalidTokenLimited.headers["retry-after"], "60");
  now += 60_000;
  assert.equal((await requestFrom("203.0.113.10")).statusCode, 200);
});

test("research audit repository starts and finishes the same open row", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const repository = createResearchAuditRepository({
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pick<Pool, "query">);
  const started = { ...record, startedAt: "2026-09-28T12:00:00.000Z", finishedAt: null };
  const finished = { ...started, researchStatus: "partial", finishedAt: "2026-09-28T12:00:04.000Z" };
  const finalizationFailed = {
    ...finished,
    researchStatus: "finalization-failed",
    audit: { ...finished.audit, lifecycleState: "finalization-failed" },
  };

  await repository.startRun(started);
  await repository.finishRun(finished);
  await repository.markFinalizationFailed(finalizationFailed);
  assert.match(calls[0].text, /INSERT INTO research_run_audits/);
  assert.match(calls[0].text, /started_at, finished_at/);
  assert.match(calls[0].text, /ON CONFLICT \(run_id\) DO NOTHING/);
  assert.equal(calls[0].values?.[0], record.runId);
  assert.equal(calls[0].values?.[6], started.startedAt);
  assert.match(calls[1].text, /UPDATE research_run_audits SET/);
  assert.match(calls[1].text, /WHERE run_id = \$1 AND finished_at IS NULL/);
  assert.equal(calls[1].values?.[0], record.runId);
  assert.equal(calls[1].values?.[4], finished.finishedAt);
  assert.match(calls[2].text, /UPDATE research_run_audits SET/);
  assert.match(calls[2].text, /WHERE run_id = \$1$/);
  assert.doesNotMatch(calls[2].text, /finished_at IS NULL/);
  assert.equal(calls[2].values?.[0], record.runId);
  assert.equal(calls[2].values?.[1], "finalization-failed");
  assert.equal(JSON.parse(calls[2].values?.[3] as string).lifecycleState, "finalization-failed");
});

if (process.env.DATABASE_URL && process.env.TEST_RESEARCH_AUDIT_DATABASE === "1") {
  test("repository saves partial research and audit JSON in PostgreSQL, then rolls back", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const repository = createResearchAuditRepository(client as unknown as Pick<Pool, "query">);
      const savedRecord = { ...record, runId: randomUUID() };
      await repository.save(savedRecord);
      const restored = await repository.get(savedRecord.runId);
      assert.ok(restored);
      assert.equal(restored.researchStatus, "partial");
      assert.deepEqual(restored.projectSummary, savedRecord.projectSummary);
      assert.deepEqual(restored.audit, {
        hostname: "records.example.test",
        rule: "reject-private-or-reserved-addresses",
        rejectedAnswer: "[redacted-address]",
      });
      assert.equal(restored.audit.hostname, "records.example.test");
      assert.equal(restored.audit.rule, "reject-private-or-reserved-addresses");
    } finally {
      if (transactionStarted) await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
} else {
  test("repository persists JSON through parameterized SQL and redacts audit addresses", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const mockPool = {
      async query(text: string, values?: unknown[]) {
        calls.push({ text, values });
        if (text.includes("SELECT")) {
          const insertValues = calls[0].values!;
          return {
            rows: [{
              run_id: insertValues[0],
              project_name: insertValues[1],
              project_location: insertValues[2],
              research_status: insertValues[3],
              project_summary: JSON.parse(insertValues[4] as string),
              audit: JSON.parse(insertValues[5] as string),
            }],
          };
        }
        return { rows: [] };
      },
    } as unknown as Pick<Pool, "query">;

    const repository = createResearchAuditRepository(mockPool);
    await repository.save(record);

    assert.match(calls[0].text, /INSERT INTO research_run_audits/);
    assert.match(calls[0].text, /VALUES \(\$1, \$2, \$3, \$4, \$5::jsonb, \$6::jsonb, COALESCE\(\$7::timestamptz, now\(\)\), COALESCE\(\$8::timestamptz, now\(\)\)\)/);
    assert.match(calls[0].text, /ON CONFLICT \(run_id\) DO UPDATE/);
    assert.deepEqual(calls[0].values?.slice(0, 4), [
      record.runId,
      record.projectName,
      record.projectLocation,
      "partial",
    ]);
    assert.deepEqual(JSON.parse(calls[0].values?.[4] as string), record.projectSummary);
    assert.deepEqual(JSON.parse(calls[0].values?.[5] as string), {
      hostname: "records.example.test",
      rule: "reject-private-or-reserved-addresses",
      rejectedAnswer: "[redacted-address]",
    });

    const restored = await repository.get(record.runId);
    assert.match(calls[1].text, /FROM research_run_audits WHERE run_id = \$1/);
    assert.deepEqual(calls[1].values, [record.runId]);
    assert.ok(restored);
    assert.equal(restored.researchStatus, "partial");
    assert.deepEqual(restored.projectSummary, record.projectSummary);
    assert.equal(restored.audit.hostname, "records.example.test");
    assert.equal(restored.audit.rule, "reject-private-or-reserved-addresses");
    assert.equal(restored.audit.rejectedAnswer, "[redacted-address]");
  });
}