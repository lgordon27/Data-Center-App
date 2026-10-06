import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import express from "express";
import test from "node:test";
import type { Request, Response } from "express";
import {
  createInitializationGateServer,
  createReadinessMiddleware,
  createScopedApiRequestLogger,
  initializeServerApp,
  type ServerReadiness,
  type ScopedApiAccessLog,
} from "./index.js";

test("scoped API access logs contain only method, path, status, duration, and research run ID", () => {
  const entries: ScopedApiAccessLog[] = [];
  const middleware = createScopedApiRequestLogger((entry) => entries.push(entry));
  const makeResponse = (statusCode: number, runId?: string) => Object.assign(new EventEmitter(), {
    statusCode,
    getHeader(name: string) {
      return name.toLowerCase() === "x-safeloc-research-run-id" ? runId : undefined;
    },
  });
  let nextCalls = 0;

  const researchResponse = makeResponse(503, "5aa2c812-4041-4cbd-8cbb-2e06c073af8f");
  middleware(
    { method: "POST", path: "/api/research-project" } as unknown as Request,
    researchResponse as unknown as Response,
    () => { nextCalls += 1; },
  );
  researchResponse.emit("finish");
  researchResponse.emit("close");

  const evidenceResponse = makeResponse(405);
  middleware(
    { method: "GET", path: "/api/analyze-evidence" } as unknown as Request,
    evidenceResponse as unknown as Response,
    () => { nextCalls += 1; },
  );
  evidenceResponse.emit("close");

  assert.equal(nextCalls, 2);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].method, "POST");
  assert.equal(entries[0].path, "/api/research-project");
  assert.equal(entries[0].status, 503);
  assert.ok(Number.isInteger(entries[0].durationMs) && entries[0].durationMs >= 0);
  assert.equal(entries[0].researchRunId, "5aa2c812-4041-4cbd-8cbb-2e06c073af8f");
  assert.equal(entries[1].method, "GET");
  assert.equal(entries[1].path, "/api/analyze-evidence");
  assert.equal(entries[1].status, 405);
  assert.ok(Number.isInteger(entries[1].durationMs) && entries[1].durationMs >= 0);
  assert.equal(entries[1].researchRunId, null);
  assert.deepEqual(Object.keys(entries[0]).sort(), [
    "durationMs",
    "method",
    "path",
    "researchRunId",
    "status",
  ]);
});

test("startup holds cold-start responses through migrations, diagnostics and sweep, then exposes warning", async () => {
  const order: string[] = [];
  let finish!: () => void;
  const paused = new Promise<void>(resolve => { finish = resolve; });
  const startup = createInitializationGateServer(0, readiness => initializeServerApp(readiness, new AbortController().signal, {
    wait: async () => { order.push("availability"); return true; },
    migrate: async () => { order.push("migrations"); await paused; return { warning: true, outcomes: [] }; },
    diagnose: async () => { order.push("diagnostics"); return true; },
    sweep: async () => { order.push("sweep"); return 0; },
    app: async state => { order.push("app"); const app = express(); app.use(createReadinessMiddleware(state)); return app; },
  }), "127.0.0.1");
  try {
    await startup.listening;
    const address = startup.server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "2");
    assert.deepEqual(order, ["availability", "migrations"]);
    finish();
    await startup.initialized;
    assert.deepEqual(order, ["availability", "migrations", "diagnostics", "sweep", "app"]);
    const ready = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready", schemaWarning: true, migrationWarning: true });
  } finally {
    finish();
    await new Promise<void>(resolve => startup.server.close(() => resolve()));
  }
});

test("successful startup clears old schema and migration warnings; sweep failure stays nonfatal", async () => {
  const state: ServerReadiness = { ready: false, schemaWarning: true, migrationWarning: true };
  await initializeServerApp(state, new AbortController().signal, {
    wait: async () => true,
    migrate: async () => ({ warning: false, outcomes: [] }),
    diagnose: async () => true,
    sweep: async () => { throw new Error("private database error"); },
    app: async () => express(),
  });
  assert.equal(state.schemaWarning, false);
  assert.equal(state.migrationWarning, false);
});

test("migration-only failure and missing schema do not block route setup", async () => {
  let appCalls = 0;
  const state: ServerReadiness = { ready: false };
  await initializeServerApp(state, new AbortController().signal, {
    wait: async () => true,
    migrate: async () => ({ warning: true, outcomes: [] }),
    diagnose: async () => false,
    sweep: async () => 0,
    app: async () => { appCalls++; return express(); },
  });
  assert.equal(appCalls, 1);
  assert.equal(state.schemaWarning, true);
});

test("database availability failure and shutdown never bypass startup gate", async () => {
  let migrations = 0;
  const controller = new AbortController();
  const operations = {
    wait: async () => false,
    migrate: async () => { migrations++; return { warning: false, outcomes: [] }; },
    diagnose: async () => true, sweep: async () => 0, app: async () => express(),
  };
  await assert.rejects(initializeServerApp({ ready: false }, controller.signal, operations), /stopped before readiness/);
  assert.equal(migrations, 0);
  controller.abort();
  await assert.rejects(initializeServerApp({ ready: false }, controller.signal, {
    ...operations, wait: async () => true,
  }), /stopped before readiness/);
});

test("startup requests get retryable HTML and health remains not-ready until routes initialize", async () => {
  let finishInitialization!: () => void;
  const initializationPause = new Promise<void>((resolve) => {
    finishInitialization = resolve;
  });
  const startup = createInitializationGateServer(
    0,
    async (readiness) => {
      await initializationPause;
      const app = express();
      app.use(createReadinessMiddleware(readiness));
      app.get("/api/ready-check", (_request, response) => response.json({ ok: true }));
      app.get("/api/expected-error", (_request, _response, next) => next(new Error("post-readiness error")));
      return app;
    },
    "127.0.0.1",
  );

  try {
    await startup.listening;
    const address = startup.server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 503);
    assert.equal(page.headers.get("retry-after"), "2");
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await page.text(), /SafeLoc is starting/);

    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 503);
    assert.equal(health.headers.get("retry-after"), "2");
    assert.deepEqual(await health.json(), {
      status: "not-ready",
      message: "Starting up. Retry shortly.",
    });

    const api = await fetch(`${baseUrl}/api/ready-check`);
    assert.equal(api.status, 503);
    assert.equal(api.headers.get("retry-after"), "2");
    assert.deepEqual(await api.json(), {
      status: "not-ready",
      message: "Starting up. Retry shortly.",
    });

    finishInitialization();
    await startup.initialized;
    const readyHealth = await fetch(`${baseUrl}/api/health`);
    assert.equal(readyHealth.status, 200);
    assert.deepEqual(await readyHealth.json(), { status: "ready" });

    const readyRoute = await fetch(`${baseUrl}/api/ready-check`);
    assert.equal(readyRoute.status, 200);
    assert.deepEqual(await readyRoute.json(), { ok: true });

    const visibleError = await fetch(`${baseUrl}/api/expected-error`);
    assert.equal(visibleError.status, 500);
    assert.doesNotMatch(await visibleError.text(), /Starting up/);
  } finally {
    finishInitialization();
    await new Promise<void>((resolve, reject) => {
      startup.server.close((error) => error ? reject(error) : resolve());
    });
  }
});