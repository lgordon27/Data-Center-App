import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { createApp } from "./index.js";
import { clientIdentity, createDailySpendGuard, createPublicRateLimiter, evidenceSpendConfig } from "./publicLimits.js";
import { createResearchCacheStore } from "./researchCacheStore.js";

test("Express trusts exactly the nearest proxy hop for client identities", async () => {
  const previousPort = process.env.PORT;
  const previousBase = process.env.BASE_PATH;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.PORT = "25519";
  process.env.BASE_PATH = "/";
  process.env.NODE_ENV = "production";
  try {
    const app = await createApp();
    assert.equal(app.get("trust proxy"), 1);
    const ipFor = (remote: string, forwarded: string) => {
      const request = Object.create(app.request);
      request.socket = { remoteAddress: remote };
      request.headers = { "x-forwarded-for": forwarded };
      return clientIdentity(request);
    };
    assert.equal(ipFor("127.0.0.1", "spoofed, 198.51.100.10"), "198.51.100.10");
    assert.equal(ipFor("127.0.0.1", "another-spoof, 198.51.100.10"), "198.51.100.10");
    assert.equal(ipFor("127.0.0.1", "spoofed, 198.51.100.11"), "198.51.100.11");
  } finally {
    if (previousPort === undefined) delete process.env.PORT; else process.env.PORT = previousPort;
    if (previousBase === undefined) delete process.env.BASE_PATH; else process.env.BASE_PATH = previousBase;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("separate limiter instances share a rolling database window", async () => {
  const events: { client: string; time: number }[] = [];
  const statements: string[] = [];
  const connection = {
    async query(sql: string, values?: unknown[]) {
      statements.push(sql);
      if (sql.startsWith("DELETE FROM public_request_events")) {
        for (let i = events.length - 1; i >= 0; i--) {
          if (events[i].client === values?.[0] && events[i].time <= (values?.[1] as Date).getTime()) events.splice(i, 1);
        }
      }
      if (sql.startsWith("SELECT requested_at")) return {
        rows: events.filter(e => e.client === values?.[0]).sort((a, b) => a.time - b.time)
          .map(e => ({ requested_at: new Date(e.time) })),
      };
      if (sql.startsWith("INSERT INTO public_request_events")) {
        events.push({ client: values?.[0] as string, time: (values?.[1] as Date).getTime() });
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => connection } as unknown as Pool;
  let time = 100_000;
  const opts = { limit: 2, windowMs: 60_000, now: () => new Date(time) };
  const first = createPublicRateLimiter(pool, opts);
  const second = createPublicRateLimiter(pool, opts);
  const a = { ip: "198.51.100.10" };
  assert.equal((await first.allow(a)).allowed, true);
  assert.equal((await second.allow(a)).allowed, true);
  assert.deepEqual(await first.allow(a), { allowed: false, retryAfterSeconds: 60 });
  assert.equal((await second.allow({ ip: "198.51.100.11" })).allowed, true);
  assert.ok(statements.some(sql => sql.includes("pg_advisory_xact_lock")));
  time += 60_000;
  assert.equal((await first.allow(a)).allowed, true);
});

test("daily spend reservations serialize against shared totals and settle provider usage", async () => {
  const days = new Map<string, { spent: number; reserved: number }>();
  const pool = {
    async query(sql: string, values: unknown[]) {
      const day = values[0] as string;
      if (sql.startsWith("INSERT")) {
        if (!days.has(day)) days.set(day, { spent: 0, reserved: 0 });
        return { rowCount: 1 };
      }
      const row = days.get(day)!;
      if (sql.includes("RETURNING spend_day")) {
        const amount = values[1] as number;
        if (row.spent + row.reserved + amount > (values[2] as number)) return { rowCount: 0 };
        row.reserved += amount;
        return { rowCount: 1 };
      }
      row.reserved -= values[1] as number;
      row.spent += values[2] as number;
      return { rowCount: 1 };
    },
  } as unknown as Pool;
  let current = new Date("2026-09-28T23:59:59Z");
  const config = {
    capUsd: 0.000004,
    prices: { model: { inputUsdPerMillion: 1, outputUsdPerMillion: 2 } },
    now: () => current,
  };
  const guard1 = createDailySpendGuard(pool, config);
  const guard2 = createDailySpendGuard(pool, config);
  const call = { model: "model", inputTokenCeiling: 2, outputTokenCeiling: 1 };
  const first = await guard1.reserve(call);
  assert.equal(first.allowed, true);
  assert.equal((await guard2.reserve(call)).allowed, false);
  if (!first.allowed) throw new Error("Expected reservation");
  await guard1.record(first.reservation, { prompt_tokens: 1, completion_tokens: 1 });
  assert.deepEqual(days.get("2026-09-28"), { spent: 3, reserved: 0 });
  assert.equal((await guard2.reserve(call)).allowed, false);
  current = new Date("2026-09-29T00:00:00Z");
  assert.equal((await guard2.reserve(call)).allowed, true);
  assert.deepEqual(days.get("2026-09-29"), { spent: 0, reserved: 4 });
  assert.throws(() => createDailySpendGuard(pool, { capUsd: -1, prices: config.prices }));
  assert.throws(() => evidenceSpendConfig({ AI_EVIDENCE_DAILY_CAP_USD: "NaN" }));
  assert.throws(() => evidenceSpendConfig({ AI_EVIDENCE_OUTPUT_USD_PER_MILLION: "-1" }));
});

test("cache normalizes identity, persists JSON, date and app version across instances", async () => {
  const saved = new Map<string, { result: unknown; research_date: string; application_version: string }>();
  const pool = {
    async query(sql: string, values: unknown[]) {
      const key = `${values[0]}|${values[1]}`;
      if (sql.startsWith("INSERT")) {
        saved.set(key, {
          result: JSON.parse(values[2] as string),
          research_date: values[3] as string,
          application_version: values[4] as string,
        });
        return { rows: [] };
      }
      return { rows: saved.has(key) ? [saved.get(key)] : [] };
    },
  } as unknown as Pool;
  const writer = createResearchCacheStore(pool);
  const reader = createResearchCacheStore(pool);
  await writer.put("  NORTHSTAR  Storage ", "Texas ", { sources: [1] }, "2026-09-28", "1.2.3");
  assert.deepEqual(await reader.get("northstar storage", " TEXAS"), {
    result: { sources: [1] }, researchDate: "2026-09-28", applicationVersion: "1.2.3",
  });
  assert.equal(await reader.get("northstar storage", "Nevada"), null);
  await assert.rejects(writer.put(" ", "Texas", {}, "2026-09-28"));
  await assert.rejects(writer.put("A", "Texas", {}, "2026-02-30"));
});