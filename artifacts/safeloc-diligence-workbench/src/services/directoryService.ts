export const DIRECTORY_ENDPOINT = "/api/directory";
export const DIRECTORY_STATS_ENDPOINT = "/api/directory/stats";
export const DIRECTORY_TIMEOUT_MS = 10_000;

export type DirectorySourceMetadata = {
  provider: "Compute Atlas";
  attributionUrl: string;
  status: "live" | "cached" | "embedded";
  dataOrigin: "provider" | "embedded";
  fetchedAt?: string;
  sourceUpdatedAt?: string | null;
  snapshotVersion?: string;
  reason?: string;
};

export type DirectoryFacility = {
  id: string;
  name: string;
  operator: string;
  city: string;
  county: string;
  state: string;
  capacityMW: number | null;
  availableCapacityMW: number | null;
  status: "operating" | "construction" | "planned" | "delayed" | "cancelled" | "unknown";
  confidence: "confirmed" | "reported" | "rumored";
  aiClassification: string | null;
  sourceUrl: string | null;
  connectedCompanies: string[];
  connectedFunds: string[];
  lastUpdated: string | null;
};

export type DirectoryResponse = {
  facilities: DirectoryFacility[];
  sourceMetadata: DirectorySourceMetadata;
  diagnostics?: Record<string, unknown>;
};

export type DirectoryStats = {
  totalFacilities: number;
  stateCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  capacityTotalsMW: {
    total: number;
    operating: number;
    planned: number;
    construction: number;
    undisclosed: number;
  };
};

export type DirectoryStatsResponse = {
  stats: DirectoryStats;
  sourceMetadata: DirectorySourceMetadata;
  diagnostics?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSource(value: unknown): value is DirectorySourceMetadata {
  return isRecord(value) &&
    value.provider === "Compute Atlas" &&
    ["live", "cached", "embedded"].includes(String(value.status)) &&
    ["provider", "embedded"].includes(String(value.dataOrigin)) &&
    typeof value.attributionUrl === "string";
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function parseFacility(value: unknown): DirectoryFacility {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    throw new Error("Directory returned an invalid facility.");
  }
  const statuses = ["operating", "construction", "planned", "delayed", "cancelled", "unknown"] as const;
  const confidences = ["confirmed", "reported", "rumored"] as const;
  const status = statuses.includes(value.status as typeof statuses[number]) ? value.status as DirectoryFacility["status"] : "unknown";
  const confidence = confidences.includes(value.confidence as typeof confidences[number]) ? value.confidence as DirectoryFacility["confidence"] : "reported";
  const numberOrNull = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    operator: typeof value.operator === "string" ? value.operator : "Undisclosed operator",
    city: typeof value.city === "string" ? value.city : "Undisclosed",
    county: typeof value.county === "string" ? value.county : "",
    state: typeof value.state === "string" ? value.state : "US",
    capacityMW: numberOrNull(value.capacityMW),
    availableCapacityMW: numberOrNull(value.availableCapacityMW),
    status,
    confidence,
    aiClassification: typeof value.aiClassification === "string" ? value.aiClassification : null,
    sourceUrl: safeUrl(value.sourceUrl),
    connectedCompanies: Array.isArray(value.connectedCompanies) ? value.connectedCompanies.filter((item): item is string => typeof item === "string") : [],
    connectedFunds: Array.isArray(value.connectedFunds) ? value.connectedFunds.filter((item): item is string => typeof item === "string") : [],
    lastUpdated: typeof value.lastUpdated === "string" ? value.lastUpdated : null,
  };
}

function parseSource(value: unknown): DirectorySourceMetadata {
  if (!isSource(value)) throw new Error("Directory returned invalid source metadata.");
  return value as DirectorySourceMetadata;
}

export function parseDirectoryResponse(value: unknown): DirectoryResponse {
  if (!isRecord(value) || !Array.isArray(value.facilities)) throw new Error("Directory returned an incomplete response.");
  return {
    facilities: value.facilities.map(parseFacility),
    sourceMetadata: parseSource(value.sourceMetadata),
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : undefined,
  };
}

export function parseDirectoryStatsResponse(value: unknown): DirectoryStatsResponse {
  if (!isRecord(value) || !isRecord(value.stats)) throw new Error("Directory stats returned an incomplete response.");
  const stats = value.stats;
  if (typeof stats.totalFacilities !== "number" || !isRecord(stats.stateCounts) || !isRecord(stats.statusCounts) || !isRecord(stats.capacityTotalsMW)) {
    throw new Error("Directory stats returned invalid totals.");
  }
  const capacity = stats.capacityTotalsMW;
  const numberMap = (candidate: Record<string, unknown>) => Object.fromEntries(Object.entries(candidate).filter(([, count]) => typeof count === "number" && Number.isFinite(count))) as Record<string, number>;
  return {
    stats: {
      totalFacilities: stats.totalFacilities,
      stateCounts: numberMap(stats.stateCounts),
      statusCounts: numberMap(stats.statusCounts),
      capacityTotalsMW: {
        total: typeof capacity.total === "number" ? capacity.total : 0,
        operating: typeof capacity.operating === "number" ? capacity.operating : 0,
        planned: typeof capacity.planned === "number" ? capacity.planned : 0,
        construction: typeof capacity.construction === "number" ? capacity.construction : 0,
        undisclosed: typeof capacity.undisclosed === "number" ? capacity.undisclosed : 0,
      },
    },
    sourceMetadata: parseSource(value.sourceMetadata),
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : undefined,
  };
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECTORY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(isRecord(body) && typeof body.error === "string" ? body.error : "Directory is unavailable.");
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Directory request timed out.");
    throw error instanceof Error ? error : new Error("Directory is unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchDirectory(fetchImpl: typeof fetch = fetch): Promise<DirectoryResponse> {
  return parseDirectoryResponse(await getJson(DIRECTORY_ENDPOINT, fetchImpl));
}

export async function fetchDirectoryStats(fetchImpl: typeof fetch = fetch): Promise<DirectoryStatsResponse> {
  return parseDirectoryStatsResponse(await getJson(DIRECTORY_STATS_ENDPOINT, fetchImpl));
}