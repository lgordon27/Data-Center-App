import type { ProviderSourceMetadata } from "@/data/sources";

export type ErcotProjectRecord = {
  inr: string;
  name: string;
  capacityMw: number;
  currentStatus: string;
  projectedCod: string | null;
  iaStatus: string | null;
  queuePosition: string | number | null;
  codSlipCount: number;
  totalDaysSlipped: number;
  explicitDelayOrCancellation: boolean;
};

export type ErcotQueueStats = {
  totalMw: number;
  totalGw: number;
  dataCenterMw: number;
  dataCenterShare: number;
  dataCenterRequestCount: number | null;
  asOfDate: string | null;
  sourceRefreshDate: string | null;
};

export type ErcotDiagnostics = {
  endpoint: string;
  requestTimestamp: string | null;
  responseStatus: number | null;
  cache: "hit" | "miss" | "unknown";
  sourceFreshness: string | null;
  responses: Array<Record<string, unknown>>;
  error?: string;
  failedResponses?: Array<Record<string, unknown>>;
  responsePreview: Record<string, unknown>;
};

export type ErcotQueueResult = {
  status: "live" | "cached" | "embedded";
  providerStatus: "live" | "cached" | "embedded";
  fetchedAt: string | null;
  sourceUpdatedAt: string | null;
  stats: ErcotQueueStats;
  matchingProject: ErcotProjectRecord | null;
  diagnostics: ErcotDiagnostics;
  sourceMetadata: ProviderSourceMetadata;
};

type ProxyEnvelope = {
  status?: string;
  fetchedAt?: unknown;
  sourceUpdatedAt?: unknown;
  data?: {
    projects?: unknown;
    codHistory?: unknown;
    loadQueueSummary?: unknown;
    siteFreshness?: unknown;
  } | null;
  diagnostics?: Record<string, unknown>;
};

const FALLBACK_SOURCE_TIMESTAMP = "2026-08-07T17:27:53.695Z";

export const ERCOT_PROXY_ENDPOINT = "/api/ercot-queue";

const FALLBACK_STATS: ErcotQueueStats = {
  totalMw: 466_497,
  totalGw: 466.497,
  dataCenterMw: 420_812,
  dataCenterShare: 90.2,
  dataCenterRequestCount: null,
  asOfDate: "2026-06-18",
  sourceRefreshDate: "2026-07-15",
};

export const FALLBACK_ERCOT_RESULT: ErcotQueueResult = {
  status: "embedded",
  providerStatus: "embedded",
  fetchedAt: null,
  sourceUpdatedAt: FALLBACK_SOURCE_TIMESTAMP,
  stats: FALLBACK_STATS,
  matchingProject: null,
  diagnostics: {
    endpoint: ERCOT_PROXY_ENDPOINT,
    requestTimestamp: null,
    responseStatus: null,
    cache: "unknown",
    sourceFreshness: FALLBACK_SOURCE_TIMESTAMP,
    responses: [],
    error: "Live ERCOTQueue data is unavailable; showing the bundled public aggregate baseline.",
    responsePreview: { status: "embedded-fallback", stats: FALLBACK_STATS },
  },
  sourceMetadata: {
    status: "embedded",
    dataOrigin: "embedded",
    timestamp: undefined,
    version: "Bundled public aggregate baseline",
  },
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validDate(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function projectArray(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { projects?: unknown }).projects)) return [];
  return (payload as { projects: unknown[] }).projects.filter((project): project is Record<string, unknown> => Boolean(project && typeof project === "object"));
}

function dateDiffDays(oldValue: string, newValue: string): number {
  const oldDate = Date.parse(oldValue);
  const newDate = Date.parse(newValue);
  return Number.isFinite(oldDate) && Number.isFinite(newDate) && newDate > oldDate
    ? Math.round((newDate - oldDate) / 86_400_000)
    : 0;
}

function historyFor(inr: string, payload: unknown) {
  if (!Array.isArray(payload)) return { count: 0, days: 0 };
  const shifts = payload.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .filter((entry) => normalizeText(entry.inr) === normalizeText(inr))
    .map((entry) => dateDiffDays(String(entry.old_value ?? ""), String(entry.new_value ?? "")))
    .filter((days) => days > 0);
  return {
    count: shifts.length,
    days: shifts.reduce((total, days) => total + days, 0),
  };
}

function normalizeProject(project: Record<string, unknown>, codHistory: unknown): ErcotProjectRecord | null {
  const inr = stringValue(project.inr);
  const name = stringValue(project.name);
  const capacityMw = finiteNumber(project.capacity_mw);
  if (!inr || !name || capacityMw === null) return null;
  const milestones = project.milestones && typeof project.milestones === "object"
    ? project.milestones as Record<string, unknown>
    : {};
  const currentStatus = stringValue(project.status_raw) || stringValue(project.funnel_stage) || "Status not published";
  const history = historyFor(inr, codHistory);
  const explicitDelayOrCancellation = Boolean(
    project.cod_delayed === true ||
    /delay|cancel|withdraw|withdrawn|terminated/i.test(currentStatus) ||
    history.days > 0,
  );
  return {
    inr,
    name,
    capacityMw,
    currentStatus,
    projectedCod: validDate(project.projected_cod),
    iaStatus: stringValue(milestones.ia_signed)
      ? `IA signed ${String(milestones.ia_signed)}`
      : /no ia/i.test(currentStatus) ? "No IA published" : "IA status not published",
    queuePosition: finiteNumber(project.queue_position ?? project.queuePosition ?? project.position) ?? stringValue(project.queue_position ?? project.queuePosition ?? project.position),
    codSlipCount: history.count,
    totalDaysSlipped: history.days,
    explicitDelayOrCancellation,
  };
}

function findMatchingProject(projects: unknown, codHistory: unknown): ErcotProjectRecord | null {
  const candidates = projectArray(projects)
    .map((project) => normalizeProject(project, codHistory))
    .filter((project): project is ErcotProjectRecord => project !== null);
  return candidates.find((project) => {
    const searchable = normalizeText(project.name);
     return searchable.includes("stargate") || searchable.includes("oracle") || searchable.includes("crusoe");
  }) ?? null;
}

function bucketValue(summary: Record<string, unknown>, status: string): number | null {
  const buckets = Array.isArray(summary.buckets) ? summary.buckets : [];
  const bucket = buckets.find((item) => item && typeof item === "object" && normalizeText((item as Record<string, unknown>).status) === normalizeText(status));
  return bucket && typeof bucket === "object" ? finiteNumber((bucket as Record<string, unknown>).mw) : null;
}

function sectorValue(summary: Record<string, unknown>, sector: string): { mw: number | null; projectCount: number | null } {
  const sectors = Array.isArray(summary.by_sector) ? summary.by_sector : [];
  const entry = sectors.find((item) => item && typeof item === "object" && normalizeText((item as Record<string, unknown>).sector) === normalizeText(sector));
  if (!entry || typeof entry !== "object") return { mw: null, projectCount: null };
  return {
    mw: finiteNumber((entry as Record<string, unknown>).mw),
    projectCount: finiteNumber((entry as Record<string, unknown>).project_count),
  };
}

function normalizeStats(data: NonNullable<ProxyEnvelope["data"]>): ErcotQueueStats | null {
  if (!data.loadQueueSummary || typeof data.loadQueueSummary !== "object") return null;
  const summary = (data.loadQueueSummary as { summary?: unknown }).summary;
  if (!summary || typeof summary !== "object") return null;
  const summaryRecord = summary as Record<string, unknown>;
  const totalMw = bucketValue(summaryRecord, "submitted");
  const sector = sectorValue(summaryRecord, "data_center");
  if (totalMw === null || sector.mw === null) return null;
  const totalGw = totalMw / 1000;
  return {
    totalMw,
    totalGw,
    dataCenterMw: sector.mw,
    dataCenterShare: totalMw > 0 ? (sector.mw / totalMw) * 100 : 0,
    dataCenterRequestCount: sector.projectCount,
    asOfDate: validDate(summaryRecord.as_of_date),
    sourceRefreshDate: validDate(summaryRecord.source_refresh_date),
  };
}

function previewData(data: NonNullable<ProxyEnvelope["data"]>) {
  const projects = projectArray(data.projects);
  const codHistoryCount = Array.isArray(data.codHistory) ? data.codHistory.length : 0;
  const summary = data.loadQueueSummary && typeof data.loadQueueSummary === "object"
    ? (data.loadQueueSummary as { summary?: Record<string, unknown> }).summary
    : null;
  return {
    projects: { generatedAt: (data.projects as { generated_at?: unknown })?.generated_at ?? null, count: projects.length },
    codHistory: { count: codHistoryCount },
    loadQueueSummary: { generatedAt: (data.loadQueueSummary as { generated_at?: unknown })?.generated_at ?? null, summary },
    siteFreshness: data.siteFreshness,
  };
}

function diagnosticsFrom(envelope: ProxyEnvelope, data: NonNullable<ProxyEnvelope["data"]>): ErcotDiagnostics {
  const raw = envelope.diagnostics ?? {};
  return {
    endpoint: stringValue(raw.endpoint) ?? ERCOT_PROXY_ENDPOINT,
    requestTimestamp: validDate(raw.requestTimestamp),
    responseStatus: finiteNumber(raw.responseStatus),
    cache: raw.cache === "hit" || raw.cache === "miss" ? raw.cache : "unknown",
    sourceFreshness: validDate(raw.sourceFreshness),
    responses: Array.isArray(raw.responses) ? raw.responses.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [],
    error: stringValue(raw.error) ?? undefined,
    failedResponses: Array.isArray(raw.failedResponses) ? raw.failedResponses.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : undefined,
    responsePreview: previewData(data),
  };
}

export function normalizeErcotProxyEnvelope(envelope: unknown): ErcotQueueResult {
  if (!envelope || typeof envelope !== "object") return FALLBACK_ERCOT_RESULT;
  const typed = envelope as ProxyEnvelope;
  const data = typed.data;
  const stats = data ? normalizeStats(data) : null;
  if (!data || !stats || (typed.status !== "live" && typed.status !== "cached")) {
    return {
      ...FALLBACK_ERCOT_RESULT,
      diagnostics: {
        ...FALLBACK_ERCOT_RESULT.diagnostics,
        ...(typed.diagnostics ? diagnosticsFrom(typed, { projects: {}, codHistory: [], loadQueueSummary: {}, siteFreshness: {} }) : {}),
        error: stringValue(typed.diagnostics?.error) ?? FALLBACK_ERCOT_RESULT.diagnostics.error,
      },
    };
  }
  const sourceUpdatedAt = validDate(typed.sourceUpdatedAt) ?? validDate(typed.diagnostics?.sourceFreshness) ?? validDate(stats.sourceRefreshDate);
  if (!sourceUpdatedAt) return FALLBACK_ERCOT_RESULT;
  const status = typed.status === "live" ? "live" : "cached";
  return {
    status,
    providerStatus: status,
    fetchedAt: validDate(typed.fetchedAt),
    sourceUpdatedAt,
    stats,
    matchingProject: findMatchingProject(data.projects, data.codHistory),
    diagnostics: diagnosticsFrom(typed, data),
    sourceMetadata: {
      status,
      dataOrigin: "provider",
      timestamp: sourceUpdatedAt,
    },
  };
}

export async function fetchErcotQueue(fetchImpl: typeof fetch = fetch): Promise<ErcotQueueResult> {
  try {
    const response = await fetchImpl(ERCOT_PROXY_ENDPOINT, { headers: { accept: "application/json" } });
    const envelope = await response.json() as unknown;
    if (!response.ok) {
      return {
        ...FALLBACK_ERCOT_RESULT,
        diagnostics: {
          ...FALLBACK_ERCOT_RESULT.diagnostics,
          responseStatus: response.status,
          error: `ERCOTQueue proxy returned HTTP ${response.status}`,
        },
      };
    }
    return normalizeErcotProxyEnvelope(envelope);
  } catch (error) {
    return {
      ...FALLBACK_ERCOT_RESULT,
      diagnostics: {
        ...FALLBACK_ERCOT_RESULT.diagnostics,
        error: error instanceof Error ? error.message : "ERCOTQueue proxy request failed",
      },
    };
  }
}
