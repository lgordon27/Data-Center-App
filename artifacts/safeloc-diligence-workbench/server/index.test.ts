import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Request, Response } from "express";
import { createScopedApiRequestLogger, type ScopedApiAccessLog } from "./index.js";

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