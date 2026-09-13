export const DIRECTORY_ENDPOINT = "/api/directory";
export const DIRECTORY_STATS_ENDPOINT = "/api/directory/stats";
export const DIRECTORY_TIMEOUT_MS = 10_000;
export const DIRECTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DIRECTORY_CACHE_WARNING_MS = 20 * 60 * 60 * 1000;

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
  canonicalProjectId?: string;
  directoryDisposition?: "canonical" | "unverified-related";
  relationshipReason?: string;
  authorityDomains?: string[];
  companyDomains?: string[];
};

export type DirectoryResponse = {
  facilities: DirectoryFacility[];
  sourceMetadata: DirectorySourceMetadata;
  diagnostics?: Record<string, unknown>;
  totalFacilities?: number;
  /** Total normalized records in the provider catalog before filters. */
  totalAvailable?: number;
  /** Total records after the current filters, before this page is sliced. */
  totalMatching?: number;
  offset?: number;
  limit?: number;
  nextOffset?: number | null;
  hasMore?: boolean;
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

/**
 * The provider id is the stable identity. When an upstream row has no id,
 * derive one from the campus identity rather than its page position. This
 * keeps page merges deterministic while retaining distinct campuses with
 * different ids or locations.
 */
export function directoryFacilityKey(facility: Pick<DirectoryFacility, "id" | "name" | "operator" | "city" | "county" | "state">): string {
  const supplied = facility.id.trim().toLowerCase();
  if (supplied && !/^facility-\d+$/.test(supplied)) return `id:${supplied}`;
  return `campus:${[facility.name, facility.operator, facility.city, facility.county, facility.state]
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join(":")}`;
}

export function mergeDirectoryFacilities(current: DirectoryFacility[], incoming: DirectoryFacility[]): DirectoryFacility[] {
  const merged = new Map<string, DirectoryFacility>();
  for (const facility of [...current, ...incoming]) {
    const key = directoryFacilityKey(facility);
    if (!merged.has(key)) merged.set(key, facility);
  }
  return [...merged.values()];
}

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

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
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
  const domains = (candidate: unknown) => Array.isArray(candidate)
    ? [...new Set(candidate.filter((item): item is string => typeof item === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(item.trim())).map((item) => item.trim()))].slice(0, 8)
    : [];
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
    ...(typeof value.canonicalProjectId === "string" && value.canonicalProjectId.trim() ? { canonicalProjectId: value.canonicalProjectId.trim() } : {}),
    ...(["canonical", "unverified-related"].includes(String(value.directoryDisposition)) ? { directoryDisposition: value.directoryDisposition as DirectoryFacility["directoryDisposition"] } : {}),
    ...(typeof value.relationshipReason === "string" && value.relationshipReason.trim() ? { relationshipReason: value.relationshipReason.trim() } : {}),
    ...(domains(value.authorityDomains).length ? { authorityDomains: domains(value.authorityDomains) } : {}),
    ...(domains(value.companyDomains).length ? { companyDomains: domains(value.companyDomains) } : {}),
  };
}

function parseSource(value: unknown): DirectorySourceMetadata {
  if (!isSource(value)) throw new Error("Directory returned invalid source metadata.");
  return {
    provider: "Compute Atlas",
    attributionUrl: value.attributionUrl,
    status: value.status as DirectorySourceMetadata["status"],
    dataOrigin: value.dataOrigin as DirectorySourceMetadata["dataOrigin"],
    ...(validTimestamp(value.fetchedAt) ? { fetchedAt: value.fetchedAt } : {}),
    ...(value.sourceUpdatedAt === null || validTimestamp(value.sourceUpdatedAt) ? { sourceUpdatedAt: value.sourceUpdatedAt ?? null } : {}),
    ...(typeof value.snapshotVersion === "string" && value.snapshotVersion.trim() ? { snapshotVersion: value.snapshotVersion.trim() } : {}),
    ...(typeof value.reason === "string" && value.reason.trim() ? { reason: value.reason.trim() } : {}),
  };
}

export function formatDirectoryAge(timestamp: string | null | undefined, now = Date.now()): string | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  const ageMs = Math.max(0, now - parsed);
  if (ageMs < 60_000) return "just now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function directoryFreshness(source: DirectorySourceMetadata | undefined, now = Date.now()) {
  if (!source) return { label: "Freshness unavailable", caution: false };
  if (source.status === "embedded") {
    return {
      label: source.snapshotVersion ? `Embedded snapshot · ${source.snapshotVersion}` : "Embedded snapshot",
      caution: false,
    };
  }

  const providerAge = formatDirectoryAge(source.sourceUpdatedAt, now);
  const retainedAge = formatDirectoryAge(source.fetchedAt, now);
  const fetchedAtMs = source.fetchedAt ? Date.parse(source.fetchedAt) : NaN;
  const retainedWindowAge = Number.isFinite(fetchedAtMs) ? Math.max(0, now - fetchedAtMs) : null;
  const caution = source.status === "cached" &&
    retainedWindowAge !== null &&
    retainedWindowAge >= DIRECTORY_CACHE_WARNING_MS;

  if (source.status === "cached") {
    return {
      label: [
        providerAge ? `Provider updated ${providerAge}` : "Provider update time not reported",
        retainedAge ? `retained ${retainedAge}` : "retention age unavailable",
      ].join(" · "),
      caution,
    };
  }
  return {
    label: providerAge ? `Provider updated ${providerAge}` : "Provider update time not reported",
    caution: false,
  };
}

export function parseDirectoryResponse(value: unknown): DirectoryResponse {
  if (!isRecord(value) || !Array.isArray(value.facilities)) throw new Error("Directory returned an incomplete response.");
  const nonNegativeInteger = (candidate: unknown) => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 ? candidate : undefined;
  const nonNegativeIntegerOrNull = (candidate: unknown) => candidate === null ? null : nonNegativeInteger(candidate);
  return {
    facilities: value.facilities.map(parseFacility),
    sourceMetadata: parseSource(value.sourceMetadata),
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : undefined,
    ...(nonNegativeInteger(value.totalFacilities) !== undefined ? { totalFacilities: nonNegativeInteger(value.totalFacilities) } : {}),
    ...(nonNegativeInteger(value.totalAvailable) !== undefined ? { totalAvailable: nonNegativeInteger(value.totalAvailable) } : {}),
    ...(nonNegativeInteger(value.totalMatching) !== undefined ? { totalMatching: nonNegativeInteger(value.totalMatching) } : {}),
    ...(nonNegativeInteger(value.offset) !== undefined ? { offset: nonNegativeInteger(value.offset) } : {}),
    ...(nonNegativeInteger(value.limit) !== undefined ? { limit: nonNegativeInteger(value.limit) } : {}),
    ...(nonNegativeIntegerOrNull(value.nextOffset) !== undefined ? { nextOffset: nonNegativeIntegerOrNull(value.nextOffset) } : {}),
    ...(typeof value.hasMore === "boolean" ? { hasMore: value.hasMore } : {}),
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

export type DirectoryQuery = {
  offset?: number;
  limit?: number;
  search?: string;
  state?: string;
  company?: string;
};

function directoryUrl(query: DirectoryQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim()) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${DIRECTORY_ENDPOINT}?${search}` : DIRECTORY_ENDPOINT;
}

export async function fetchDirectory(fetchOrQuery: typeof fetch | DirectoryQuery = fetch, fetchImpl: typeof fetch = fetch): Promise<DirectoryResponse> {
  if (typeof fetchOrQuery === "function") return parseDirectoryResponse(await getJson(DIRECTORY_ENDPOINT, fetchOrQuery));
  return parseDirectoryResponse(await getJson(directoryUrl(fetchOrQuery), fetchImpl));
}

/**
 * Loads every provider page for one company without triggering project
 * research. The progress callback lets browsing surfaces expose records as
 * each page arrives instead of imposing the former first-100 ceiling.
 */
export async function fetchAllCompanyDirectoryFacilities(
  company: string,
  onPage?: (facilities: DirectoryFacility[], response: DirectoryResponse) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<DirectoryFacility[]> {
  const pageSize = 100;
  let offset = 0;
  let facilities: DirectoryFacility[] = [];
  const visitedOffsets = new Set<number>();

  while (!visitedOffsets.has(offset)) {
    visitedOffsets.add(offset);
    const response = await fetchDirectory({ company, limit: pageSize, offset }, fetchImpl);
    facilities = mergeDirectoryFacilities(facilities, response.facilities);
    onPage?.(facilities, response);

    if (response.facilities.length === 0) break;
    const reportedTotal = response.totalMatching ?? response.totalFacilities;
    const providerIndicatesMore = response.hasMore === true ||
      (typeof reportedTotal === "number" && offset + response.facilities.length < reportedTotal);
    const nextOffset = response.nextOffset ??
      (providerIndicatesMore ? offset + Math.max(response.limit ?? pageSize, response.facilities.length) : null);
    if (nextOffset === null || nextOffset <= offset) break;
    offset = nextOffset;
  }
  return facilities;
}

export async function fetchDirectoryStats(fetchImpl: typeof fetch = fetch): Promise<DirectoryStatsResponse> {
  return parseDirectoryStatsResponse(await getJson(DIRECTORY_STATS_ENDPOINT, fetchImpl));
}