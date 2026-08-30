import { randomUUID } from "node:crypto";

export type GridQueryKind =
  | "queue-snapshot"
  | "change-log"
  | "classification"
  | "daily-summary";

export type GridFreshness = "live" | "cached" | "stale" | "disconnected";
export type GridConnectionStatus = "connected" | "disconnected";

export type GridRecord = {
  label: string;
  value: string;
  detail?: string;
};

export type GridTrackerResponse = {
  ok: boolean;
  query: string;
  kind: GridQueryKind;
  answer: {
    summary: string;
    records: GridRecord[];
  } | null;
  freshness: GridFreshness;
  cache: {
    hit: boolean;
    stale: boolean;
    ageMs: number | null;
    ttlMs: number;
  };
  source: {
    name: "GridTracker MCP Server";
    attribution: "Model Context Protocol";
    retrievedAt: string;
    dataTimestamp: string | null;
  };
  evidenceMapping: {
    evidenceId: "grid_interconnection";
    label: string;
    proposedClassification: "Verified Evidence";
    directlySupports: boolean;
    rationale: string;
  };
  connection: {
    status: GridConnectionStatus;
    endpointConfigured: boolean;
    protocolVersion: string | null;
    negotiatedAt: string | null;
  };
  diagnostics: {
    historyId: string | null;
  };
  error?: {
    code: string;
    message: string;
  };
};

export type GridTrackerStatus = {
  status: GridConnectionStatus;
  endpointConfigured: boolean;
  protocolVersion: string | null;
  negotiatedAt: string | null;
  lastQuery: {
    id: string;
    at: string;
    freshness: GridFreshness;
    kind: GridQueryKind;
  } | null;
};

export type GridTrackerDiagnostic = {
  id: string;
  at: string;
  query: string;
  kind: GridQueryKind;
  ok: boolean;
  freshness: GridFreshness;
  request: unknown;
  response: unknown;
  error?: string;
};

export type McpTransport = {
  send(request: JsonRpcRequest): Promise<unknown>;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string;
  method: string;
  params?: Record<string, unknown>;
};

type DiscoveredTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

type CacheEntry = {
  at: number;
  response: GridTrackerResponse;
};

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const CHANGE_LOG_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_HISTORY = 50;
const MAX_DIAGNOSTIC_BYTES = 12_000;
const PROTOCOL_VERSION = "2025-06-18";

export function validateNaturalLanguageQuery(value: unknown): string {
  if (typeof value !== "string") {
    throw new GridTrackerError("INVALID_QUERY", "A natural-language query is required.");
  }
  const query = value.trim();
  if (query.length < 8 || query.length > 500) {
    throw new GridTrackerError("INVALID_QUERY", "Query must be between 8 and 500 characters.");
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(query)) {
    throw new GridTrackerError("INVALID_QUERY", "Query contains unsupported control characters.");
  }
  return query;
}

export function classifyGridQuery(query: string): GridQueryKind {
  const lower = query.toLowerCase();
  if (/(slip|slipped|cod|commercial operation|change log|change history|delay)/.test(lower)) {
    return "change-log";
  }
  if (/(withdraw|withdrawn|energized|active|classification|status)/.test(lower)) {
    return "classification";
  }
  if (/(daily|today|this week|summary|summarize|how many)/.test(lower)) {
    return "daily-summary";
  }
  return "queue-snapshot";
}

export function ttlForQueryKind(kind: GridQueryKind): number {
  return kind === "change-log" ? CHANGE_LOG_TTL_MS : SNAPSHOT_TTL_MS;
}

export class GridTrackerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GridTrackerError";
  }
}

class HttpMcpTransport implements McpTransport {
  private sessionId: string | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly authToken?: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async send(request: JsonRpcRequest): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      if (this.authToken) headers.authorization = `Bearer ${this.authToken}`;
      if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
      if (request.method !== "initialize") headers["MCP-Protocol-Version"] = PROTOCOL_VERSION;
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new GridTrackerError("PROVIDER_HTTP_ERROR", `GridTracker returned HTTP ${response.status}.`);
      }
      this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;
      const text = await response.text();
      if (!text.trim()) return null;
      return parseMcpHttpBody(text, response.headers.get("content-type"));
    } catch (error) {
      if (error instanceof GridTrackerError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new GridTrackerError("PROVIDER_TIMEOUT", "GridTracker did not respond before the timeout.");
      }
      throw new GridTrackerError("PROVIDER_UNAVAILABLE", "GridTracker could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class GridTrackerMcpClient {
  private readonly endpoint?: string;
  private readonly transport?: McpTransport;
  private readonly clock: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly history: GridTrackerDiagnostic[] = [];
  private tools: DiscoveredTool[] = [];
  private connection: GridTrackerStatus = {
    status: "disconnected",
    endpointConfigured: false,
    protocolVersion: null,
    negotiatedAt: null,
    lastQuery: null,
  };
  private initialized = false;

  constructor(options: {
    endpoint?: string;
    authToken?: string;
    transport?: McpTransport;
    now?: () => number;
  } = {}) {
    this.endpoint = options.endpoint ?? process.env.GRIDTRACKER_MCP_ENDPOINT;
    this.transport = options.transport ??
      (this.endpoint
        ? new HttpMcpTransport(
            this.endpoint,
            options.authToken ?? process.env.GRIDTRACKER_MCP_AUTH_TOKEN,
            Number(process.env.GRIDTRACKER_MCP_TIMEOUT_MS) || 15_000,
          )
        : undefined);
    this.clock = options.now ?? Date.now;
    this.connection.endpointConfigured = Boolean(this.endpoint || options.transport);
  }

  async query(rawQuery: unknown): Promise<GridTrackerResponse> {
    let query: string;
    try {
      query = validateNaturalLanguageQuery(rawQuery);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid query.";
      return this.errorResponse(
        typeof rawQuery === "string" ? rawQuery.trim().slice(0, 500) : "",
        "queue-snapshot",
        "INVALID_QUERY",
        message,
      );
    }

    const kind = classifyGridQuery(query);
    const ttlMs = ttlForQueryKind(kind);
    const cacheKey = `${kind}:${query.toLowerCase()}`;
    const existing = this.cache.get(cacheKey);
    const now = this.clock();
    if (existing && now - existing.at < ttlMs) {
      const cached = cloneResponse(existing.response);
      cached.freshness = "cached";
      cached.cache = {
        hit: true,
        stale: false,
        ageMs: Math.max(0, now - existing.at),
        ttlMs,
      };
      cached.connection = this.connectionSnapshot();
      this.connection.lastQuery = {
        id: randomUUID(),
        at: new Date(now).toISOString(),
        freshness: "cached",
        kind,
      };
      cached.connection = this.connectionSnapshot();
      this.recordHistory(query, kind, cached, null, {
        jsonrpc: "2.0",
        id: "cache",
        method: "cache/read",
      }, { cache: true });
      return cached;
    }

    try {
      await this.ensureConnected();
      const tool = selectTool(this.tools, kind);
      if (!tool) {
        throw new GridTrackerError(
          "UNSUPPORTED_OPERATION",
          `GridTracker did not advertise a tool for ${kind.replace("-", " ")} queries.`,
        );
      }
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: {
          name: tool.name,
          arguments: buildToolArguments(tool, query),
        },
      };
      const rawResponse = await this.send(request);
      const answer = normalizeMcpResult(rawResponse, kind, this.clock());
      if (!answer) {
        throw new GridTrackerError("MALFORMED_RESPONSE", "GridTracker returned no usable structured data.");
      }
      const response = this.successResponse(query, kind, answer, ttlMs);
      this.cache.set(cacheKey, { at: now, response });
      this.connection.lastQuery = {
        id: randomUUID(),
        at: response.source.retrievedAt,
        freshness: "live",
        kind,
      };
      this.recordHistory(query, kind, response, rawResponse, request);
      return response;
    } catch (error) {
      const normalized = normalizeError(error);
      this.connection.status = "disconnected";
      const cachedEntry = existing;
      if (cachedEntry) {
        const stale = cloneResponse(cachedEntry.response);
        stale.freshness = "stale";
        stale.cache = {
          hit: true,
          stale: true,
          ageMs: Math.max(0, now - cachedEntry.at),
          ttlMs,
        };
        stale.connection = this.connectionSnapshot();
        stale.error = normalized;
        this.connection.lastQuery = {
          id: randomUUID(),
          at: new Date(now).toISOString(),
          freshness: "stale",
          kind,
        };
        stale.connection = this.connectionSnapshot();
        this.recordHistory(query, kind, stale, null, null, { staleFallback: true });
        return stale;
      }
      const response = this.errorResponse(query, kind, normalized.code, normalized.message, ttlMs);
      this.connection.lastQuery = {
        id: randomUUID(),
        at: new Date(now).toISOString(),
        freshness: "disconnected",
        kind,
      };
      response.connection = this.connectionSnapshot();
      this.recordHistory(query, kind, response, null, null);
      return response;
    }
  }

  status(): GridTrackerStatus {
    return {
      ...this.connectionSnapshot(),
      lastQuery: this.connection.lastQuery ? { ...this.connection.lastQuery } : null,
    };
  }

  diagnostics(): { status: GridTrackerStatus; history: GridTrackerDiagnostic[] } {
    return {
      status: this.status(),
      history: this.history.map((item) => ({ ...item })),
    };
  }

  private async ensureConnected() {
    if (!this.transport) {
      throw new GridTrackerError(
        "NOT_CONFIGURED",
        "GridTracker is disconnected because no server-side MCP endpoint is configured.",
      );
    }
    if (this.initialized) return;
    const initializeRequest: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "SafeLoc Diligence Workbench", version: "1.0.0" },
      },
    };
    const initialized = await this.send(initializeRequest);
    const negotiatedVersion =
      readString(initialized, ["result", "protocolVersion"]) ?? PROTOCOL_VERSION;
    await this.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
    const toolsResponse = await this.send({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/list",
      params: {},
    });
    this.tools = readTools(toolsResponse);
    if (!this.tools.length) {
      throw new GridTrackerError("NO_TOOLS", "GridTracker connected but advertised no usable tools.");
    }
    this.connection = {
      ...this.connection,
      status: "connected",
      endpointConfigured: true,
      protocolVersion: negotiatedVersion,
      negotiatedAt: new Date(this.clock()).toISOString(),
    };
    this.initialized = true;
  }

  private async send(request: JsonRpcRequest) {
    if (!this.transport) throw new GridTrackerError("NOT_CONFIGURED", "GridTracker is disconnected.");
    const response = await this.transport.send(request);
    if (isJsonRpcError(response)) {
      throw new GridTrackerError(
        "MCP_ERROR",
        typeof response.error.message === "string" ? response.error.message : "GridTracker returned an MCP error.",
      );
    }
    return response;
  }

  private connectionSnapshot(): GridTrackerStatus["status"] extends never ? never : GridTrackerStatus {
    return {
      status: this.connection.status,
      endpointConfigured: this.connection.endpointConfigured,
      protocolVersion: this.connection.protocolVersion,
      negotiatedAt: this.connection.negotiatedAt,
      lastQuery: this.connection.lastQuery ? { ...this.connection.lastQuery } : null,
    };
  }

  private successResponse(
    query: string,
    kind: GridQueryKind,
    answer: NonNullable<GridTrackerResponse["answer"]>,
    ttlMs: number,
  ): GridTrackerResponse {
    const retrievedAt = new Date(this.clock()).toISOString();
    return {
      ok: true,
      query,
      kind,
      answer,
      freshness: "live",
      cache: { hit: false, stale: false, ageMs: 0, ttlMs },
      source: {
        name: "GridTracker MCP Server",
        attribution: "Model Context Protocol",
        retrievedAt,
        dataTimestamp: answerDataTimestamp(answer),
      },
      evidenceMapping: {
        evidenceId: "grid_interconnection",
        label: "Grid Interconnection Timeline",
        proposedClassification: "Verified Evidence",
        directlySupports: answer.records.length > 0 || answer.summary.length > 0,
        rationale: "This provider response is proposed as corroboration only; an analyst must confirm before reclassifying the evidence item.",
      },
      connection: this.connectionSnapshot(),
      diagnostics: { historyId: null },
    };
  }

  private errorResponse(
    query: string,
    kind: GridQueryKind,
    code: string,
    message: string,
    ttlMs = ttlForQueryKind(kind),
  ): GridTrackerResponse {
    const retrievedAt = new Date(this.clock()).toISOString();
    return {
      ok: false,
      query,
      kind,
      answer: null,
      freshness: this.connection.endpointConfigured ? "disconnected" : "disconnected",
      cache: { hit: false, stale: false, ageMs: null, ttlMs },
      source: {
        name: "GridTracker MCP Server",
        attribution: "Model Context Protocol",
        retrievedAt,
        dataTimestamp: null,
      },
      evidenceMapping: {
        evidenceId: "grid_interconnection",
        label: "Grid Interconnection Timeline",
        proposedClassification: "Verified Evidence",
        directlySupports: false,
        rationale: "No provider-backed result is available to map.",
      },
      connection: this.connectionSnapshot(),
      diagnostics: { historyId: null },
      error: { code, message },
    };
  }

  private recordHistory(
    query: string,
    kind: GridQueryKind,
    response: GridTrackerResponse,
    rawResponse: unknown,
    request: JsonRpcRequest | null,
    flags: Record<string, unknown> = {},
  ) {
    const id = randomUUID();
    response.diagnostics.historyId = id;
    const entry: GridTrackerDiagnostic = {
      id,
      at: new Date(this.clock()).toISOString(),
      query,
      kind,
      ok: response.ok,
      freshness: response.freshness,
      request: redactProtocolPayload(request ?? { cache: flags }),
      response: redactProtocolPayload(rawResponse ?? { ...flags, error: response.error }),
      ...(response.error ? { error: response.error.message } : {}),
    };
    this.history.unshift(entry);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
  }
}

function parseMcpHttpBody(text: string, contentType: string | null): unknown {
  if (contentType?.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean).pop();
    if (!data) throw new GridTrackerError("MALFORMED_RESPONSE", "GridTracker returned an empty event stream.");
    try {
      return JSON.parse(data);
    } catch {
      throw new GridTrackerError("MALFORMED_RESPONSE", "GridTracker returned invalid JSON in its event stream.");
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GridTrackerError("MALFORMED_RESPONSE", "GridTracker returned invalid JSON.");
  }
}

function isJsonRpcError(value: unknown): value is { error: { message?: unknown } } {
  return Boolean(value && typeof value === "object" && "error" in value);
}

function readTools(value: unknown): DiscoveredTool[] {
  const raw = value && typeof value === "object" && "result" in value
    ? (value as { result?: { tools?: unknown } }).result?.tools
    : null;
  if (!Array.isArray(raw)) return [];
  return raw.filter((tool): tool is DiscoveredTool => {
    if (!tool || typeof tool !== "object") return false;
    const candidate = tool as Partial<DiscoveredTool>;
    return typeof candidate.name === "string" && candidate.name.length > 0;
  }).map((tool) => ({
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description : undefined,
    inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : undefined,
  }));
}

function selectTool(tools: DiscoveredTool[], kind: GridQueryKind): DiscoveredTool | null {
  const terms: Record<GridQueryKind, string[]> = {
    "queue-snapshot": ["queue", "snapshot", "project", "interconnection"],
    "change-log": ["change", "history", "cod", "slip", "delay"],
    classification: ["classification", "status", "withdraw", "energized", "active"],
    "daily-summary": ["daily", "summary", "queue", "change"],
  };
  const ranked = tools.map((tool) => {
    const haystack = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
    const score = terms[kind].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
    return { tool, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].tool : null;
}

function buildToolArguments(tool: DiscoveredTool, query: string): Record<string, string> {
  const properties = Object.keys(tool.inputSchema?.properties ?? {});
  const preferred = properties.find((key) => /query|question|prompt|search|input|text/i.test(key));
  const field = preferred ?? (properties.length === 1 ? properties[0] : "query");
  return { [field]: query };
}

function normalizeMcpResult(raw: unknown, kind: GridQueryKind, now: number): GridTrackerResponse["answer"] | null {
  const payload = unwrapMcpPayload(raw);
  if (payload === null || payload === undefined) return null;
  const records = findRecordArray(payload).slice(0, 25).map(toGridRecord).filter(Boolean) as GridRecord[];
  const summary = readString(payload, ["summary", "answer", "message", "text", "description"]) ??
    (typeof payload === "string" ? payload : records.length ? `${records.length} ${kind.replace("-", " ")} records returned.` : "");
  if (!summary && !records.length) return null;
  return {
    summary: summary || "GridTracker returned structured queue intelligence.",
    records,
  };
}

function unwrapMcpPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return typeof raw === "string" ? raw : null;
  const result = "result" in raw ? (raw as { result?: unknown }).result : raw;
  if (!result || typeof result !== "object") return typeof result === "string" ? result : null;
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  if (structured !== undefined) return structured;
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const texts = content.filter((item): item is { text: string } => Boolean(item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string")).map((item) => item.text);
    if (texts.length) {
      const joined = texts.join("\n");
      try {
        return JSON.parse(joined);
      } catch {
        return joined;
      }
    }
  }
  return result;
}

function findRecordArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate) && candidate.some((item) => item && typeof item === "object")) return candidate;
  }
  return [];
}

function toGridRecord(value: unknown): GridRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = readString(record, ["label", "name", "project", "projectName", "id", "queueId"]) ?? "Queue record";
  const valueText = readString(record, ["value", "status", "classification", "state", "count", "date", "cod", "commercialOperationDate"]) ??
    JSON.stringify(redactProtocolPayload(record)).slice(0, 500);
  const detail = readString(record, ["detail", "description", "county", "utility", "change"]);
  return { label, value: valueText, ...(detail ? { detail } : {}) };
}

function readString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (current && typeof current === "object" && key in current) {
      const next = (current as Record<string, unknown>)[key];
      if (typeof next === "string" && next.trim()) return next.trim().slice(0, 500);
      if (typeof next === "number" && Number.isFinite(next)) return String(next);
    }
  }
  return null;
}

function answerDataTimestamp(answer: NonNullable<GridTrackerResponse["answer"]>): string | null {
  const timestampRecord = answer.records.find((record) => /date|time|updated|as of/i.test(record.label));
  return timestampRecord?.value ?? null;
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (error instanceof GridTrackerError) return { code: error.code, message: error.message };
  return { code: "PROVIDER_UNAVAILABLE", message: "GridTracker is temporarily unavailable." };
}

function cloneResponse(response: GridTrackerResponse): GridTrackerResponse {
  return JSON.parse(JSON.stringify(response)) as GridTrackerResponse;
}

export function redactProtocolPayload(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" ? value.slice(0, 1000) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactProtocolPayload(item, depth + 1));
  if (typeof value !== "object") return "[redacted]";
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/authorization|token|secret|password|cookie|credential|api[-_]?key/i.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redactProtocolPayload(item, depth + 1);
    }
  }
  try {
    const serialized = JSON.stringify(output);
    if (serialized.length > MAX_DIAGNOSTIC_BYTES) {
      return `${serialized.slice(0, MAX_DIAGNOSTIC_BYTES)}…[truncated]`;
    }
  } catch {
    return "[unserializable]";
  }
  return output;
}