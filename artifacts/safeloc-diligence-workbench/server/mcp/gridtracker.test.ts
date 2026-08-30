import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GridTrackerMcpClient,
  redactProtocolPayload,
  validateNaturalLanguageQuery,
  type McpTransport,
} from "./gridtracker";

function mockTransport(responseForQuery: (query: string) => unknown) {
  const requests: string[] = [];
  let fail = false;
  const transport: McpTransport = {
    async send(request) {
      requests.push(request.method);
      if (fail) throw new Error("mock provider unavailable");
      if (request.method === "initialize") {
        return { jsonrpc: "2.0", id: request.id, result: { protocolVersion: "2025-06-18", capabilities: {} } };
      }
      if (request.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [
              { name: "queue_snapshot", description: "Project queue snapshot", inputSchema: { properties: { question: { type: "string" } } } },
              { name: "cod_change_history", description: "COD slip and change history", inputSchema: { properties: { query: { type: "string" } } } },
              { name: "queue_classification", description: "Active withdrawn energized classification", inputSchema: { properties: { input: { type: "string" } } } },
              { name: "daily_queue_summary", description: "Daily queue change summary", inputSchema: { properties: { prompt: { type: "string" } } } },
            ],
          },
        };
      }
      if (request.method === "notifications/initialized") return null;
      const args = request.params?.arguments as Record<string, string>;
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: { structuredContent: responseForQuery(Object.values(args)[0]) },
      };
    },
  };
  return { transport, requests, setFail: (value: boolean) => { fail = value; } };
}

test("negotiates MCP capabilities and normalizes a discovered tool response", async () => {
  const mock = mockTransport(() => ({
    summary: "Oracle Abilene request is active.",
    records: [{ projectName: "Oracle Abilene", status: "active", utility: "Oncor" }],
  }));
  const client = new GridTrackerMcpClient({ transport: mock.transport, now: () => 1_700_000_000_000 });
  const result = await client.query("What is the current queue status for Oracle's Abilene interconnection request?");

  assert.equal(result.ok, true);
  assert.equal(result.freshness, "live");
  assert.equal(result.answer?.summary, "Oracle Abilene request is active.");
  assert.equal(result.answer?.records[0]?.label, "Oracle Abilene");
  assert.equal(client.status().protocolVersion, "2025-06-18");
  assert.deepEqual(mock.requests.slice(0, 4), ["initialize", "notifications/initialized", "tools/list", "tools/call"]);
});

test("uses separate snapshot and change-log TTL classes", async () => {
  let now = 1_700_000_000_000;
  let calls = 0;
  const mock = mockTransport(() => {
    calls += 1;
    return { summary: `response ${calls}`, records: [{ label: "count", value: calls }] };
  });
  const client = new GridTrackerMcpClient({ transport: mock.transport, now: () => now });

  await client.query("Show the current project queue snapshot for Stargate");
  await client.query("Show the current project queue snapshot for Stargate");
  assert.equal(calls, 1);
  now += 24 * 60 * 60 * 1000 + 1;
  await client.query("Show the current project queue snapshot for Stargate");
  assert.equal(calls, 2);

  await client.query("How many times has the Stargate project's commercial operation date slipped?");
  await client.query("How many times has the Stargate project's commercial operation date slipped?");
  assert.equal(calls, 3);
  now += 12 * 60 * 60 * 1000 + 1;
  await client.query("How many times has the Stargate project's commercial operation date slipped?");
  assert.equal(calls, 4);
});

test("returns stale cached data when the provider fails", async () => {
  let now = 1_700_000_000_000;
  const mock = mockTransport(() => ({ summary: "Cached queue result", records: [{ label: "status", value: "active" }] }));
  const client = new GridTrackerMcpClient({ transport: mock.transport, now: () => now });
  await client.query("What is the current queue status for Stargate?");
  now += 24 * 60 * 60 * 1000 + 1;
  mock.setFail(true);
  const result = await client.query("What is the current queue status for Stargate?");

  assert.equal(result.ok, true);
  assert.equal(result.freshness, "stale");
  assert.equal(result.cache.stale, true);
  assert.equal(result.error?.code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.connection.status, "disconnected");
});

test("bounds queries and redacts protocol credentials", () => {
  assert.throws(() => validateNaturalLanguageQuery("short"), /between 8 and 500/);
  assert.throws(() => validateNaturalLanguageQuery("a".repeat(501)), /between 8 and 500/);
  const redacted = redactProtocolPayload({
    headers: { authorization: "Bearer secret", cookie: "session-cookie" },
    nested: { apiKey: "key", safe: "visible" },
  }) as Record<string, unknown>;
  assert.deepEqual(redacted, {
    headers: { authorization: "[redacted]", cookie: "[redacted]" },
    nested: { apiKey: "[redacted]", safe: "visible" },
  });
});