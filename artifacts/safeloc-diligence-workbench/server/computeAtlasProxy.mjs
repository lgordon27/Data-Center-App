const COMPUTE_ATLAS_BASE_URL = "https://www.compute-atlas.com";
const COMPUTE_ATLAS_FACILITIES_URL = `${COMPUTE_ATLAS_BASE_URL}/api/facilities`;
const COMPUTE_ATLAS_STATS_URL = `${COMPUTE_ATLAS_BASE_URL}/api/stats`;
const COMPUTE_ATLAS_ATTRIBUTION_URL = "https://compute-atlas.com";
const DIRECTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DIRECTORY_REQUEST_TIMEOUT_MS = 8_000;

const OPERATOR_MAPPINGS = [
  { match: "nvidia", company: "NVIDIA", funds: ["QQQ", "SMH"] },
  { match: "microsoft", company: "Microsoft", funds: ["QQQ", "XLK"] },
  { match: "meta", company: "Meta", funds: ["QQQ", "XLC"] },
  { match: "google", company: "Google", funds: ["QQQ", "XLK"] },
  { match: "amazon", company: "Amazon", funds: ["QQQ", "XLY"] },
  { match: "oracle", company: "Oracle", funds: ["QQQ", "XLK"] },
  { match: "openai", company: "OpenAI", funds: ["Private company"] },
  { match: "crusoe", company: "Crusoe", funds: ["Private company"] },
];

// A small, reviewed context set keeps the directory useful during an upstream
// outage. These are directory records, not Stargate evidence or modeled inputs.
const EMBEDDED_SNAPSHOT = [
  ["stargate-abilene-tx", "Stargate Abilene", "Crusoe / OpenAI / Oracle", "Abilene", "Taylor", "TX", 1200, "construction", "confirmed", "ai_training", "https://www.compute-atlas.com/facilities/stargate-abilene-tx"],
  ["project-rainier-microsoft-wi", "Project Rainier", "Microsoft", "Mount Pleasant", "Racine", "WI", 315, "construction", "reported", "ai_training", "https://www.compute-atlas.com/facilities/project-rainier-microsoft-wi"],
  ["project-volcano-meta-la", "Project Volcano", "Meta", "Richland Parish", "Richland", "LA", 1500, "planned", "reported", "ai_training", "https://www.compute-atlas.com/facilities/project-volcano-meta-la"],
  ["google-willow-rock-oh", "Google New Albany Campus", "Google", "New Albany", "Licking", "OH", 600, "construction", "confirmed", "ai_training", "https://www.compute-atlas.com/facilities/google-willow-rock-oh"],
  ["amazon-data-center-ohio-oh", "Amazon Central Ohio Campus", "Amazon", "New Albany", "Licking", "OH", 300, "operating", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/amazon-data-center-ohio-oh"],
  ["oracle-aberdeen-md", "Oracle Aberdeen Cloud Region", "Oracle", "Aberdeen", "Harford", "MD", 120, "operating", "confirmed", "cloud", "https://www.compute-atlas.com/facilities/oracle-aberdeen-md"],
  ["nvidia-dgx-cloud-tx", "NVIDIA AI Factory Texas", "NVIDIA", "Austin", "Travis", "TX", 96, "planned", "rumored", "ai_training", "https://www.compute-atlas.com/facilities/nvidia-dgx-cloud-tx"],
  ["xai-colossus-memphis-tn", "Colossus", "xAI", "Memphis", "Shelby", "TN", 150, "operating", "reported", "ai_training", "https://www.compute-atlas.com/facilities/xai-colossus-memphis-tn"],
  ["coreweave-loudoun-va", "CoreWeave Sterling", "CoreWeave", "Sterling", "Loudoun", "VA", 90, "operating", "confirmed", "ai_training", "https://www.compute-atlas.com/facilities/coreweave-loudoun-va"],
  ["qts-richmond-va", "QTS Richmond", "QTS", "Richmond", "Henrico", "VA", 60, "construction", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/qts-richmond-va"],
  ["aligned-phoenix-az", "Aligned Phoenix Campus", "Aligned Data Centers", "Phoenix", "Maricopa", "AZ", 120, "construction", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/aligned-phoenix-az"],
  ["vantage-phoenix-az", "Vantage Phoenix Campus", "Vantage Data Centers", "Goodyear", "Maricopa", "AZ", 96, "planned", "reported", "hyperscale", "https://www.compute-atlas.com/facilities/vantage-phoenix-az"],
  ["iron-mountain-denver-co", "Iron Mountain Denver", "Iron Mountain", "Denver", "Denver", "CO", 70, "operating", "confirmed", "colocation", "https://www.compute-atlas.com/facilities/iron-mountain-denver-co"],
  ["switch-atlanta-ga", "Switch Atlanta", "Switch", "Lithia Springs", "Douglas", "GA", 84, "operating", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/switch-atlanta-ga"],
  ["facebook-new-albany-oh", "Meta New Albany", "Meta", "New Albany", "Licking", "OH", 300, "operating", "confirmed", "ai_training", "https://www.compute-atlas.com/facilities/facebook-new-albany-oh"],
  ["microsoft-boydton-va", "Microsoft Boydton", "Microsoft", "Boydton", "Mecklenburg", "VA", 200, "operating", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/microsoft-boydton-va"],
  ["google-douglas-county-ga", "Google Douglas County", "Google", "Douglasville", "Douglas", "GA", 150, "operating", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/google-douglas-county-ga"],
  ["amazon-loudoun-va", "Amazon Loudoun County", "Amazon", "Ashburn", "Loudoun", "VA", 240, "operating", "confirmed", "hyperscale", "https://www.compute-atlas.com/facilities/amazon-loudoun-va"],
  ["oracle-salt-lake-ut", "Oracle West Jordan", "Oracle", "West Jordan", "Salt Lake", "UT", 90, "operating", "confirmed", "cloud", "https://www.compute-atlas.com/facilities/oracle-salt-lake-ut"],
  ["lambda-lakeway-tx", "Lambda Lakeway", "Lambda", "Lakeway", "Travis", "TX", 40, "construction", "reported", "ai_training", "https://www.compute-atlas.com/facilities/lambda-lakeway-tx"],
  ["data-bank-dallas-tx", "DataBank DFW", "DataBank", "Dallas", "Dallas", "TX", 48, "operating", "confirmed", "colocation", "https://www.compute-atlas.com/facilities/data-bank-dallas-tx"],
  ["nvidia-santa-clara-ca", "NVIDIA Santa Clara", "NVIDIA", "Santa Clara", "Santa Clara", "CA", 35, "operating", "confirmed", "ai_training", "https://www.compute-atlas.com/facilities/nvidia-santa-clara-ca"],
].map(([id, name, operator, city, county, state, capacityMW, status, confidence, aiClassification, sourceUrl]) => ({
  id, name, operator, city, county, state, capacityMW, availableCapacityMW: capacityMW,
  status, confidence, aiClassification, sourceUrl,
  ...(id === "stargate-abilene-tx" ? {
    canonicalProjectId: "stargate-abilene",
    directoryDisposition: "canonical",
    relationshipReason: "Canonical Compute Atlas entry for the curated Stargate Abilene workbench. Other Abilene or Lancium records must remain separate unless a source-supported relationship is shown.",
  } : {}),
}));

let retainedDirectoryResponse = null;
let retainedStatsResponse = null;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFinitePositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function safePublicSourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function providerUpdatedAt(payload) {
  if (!isRecord(payload)) return null;
  const candidates = [
    payload.lastUpdated,
    payload.last_updated,
    payload.updatedAt,
    payload.updated_at,
    isRecord(payload.metadata) ? payload.metadata.lastUpdated : null,
    isRecord(payload.metadata) ? payload.metadata.last_updated : null,
    isRecord(payload.metadata) ? payload.metadata.updatedAt : null,
    isRecord(payload.metadata) ? payload.metadata.updated_at : null,
  ];
  const envelopeTimestamp = candidates.map(validTimestamp).find(Boolean);
  if (envelopeTimestamp) return envelopeTimestamp;
  const records = Array.isArray(payload.facilities) ? payload.facilities : [];
  return records
    .flatMap((record) => isRecord(record) ? [record.lastUpdated, record.last_updated, record.updatedAt, record.updated_at] : [])
    .map(validTimestamp)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function normalizeStatus(value) {
  const text = String(value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (["operational", "operating", "live", "in_operation"].includes(text)) return "operating";
  if (["under_construction", "construction", "building"].includes(text)) return "construction";
  if (["planned", "proposed", "permitted", "announced", "development"].includes(text)) return "planned";
  if (["delayed", "on_hold", "stalled", "paused"].includes(text)) return "delayed";
  if (["cancelled", "canceled", "dead", "withdrawn"].includes(text)) return "cancelled";
  return "unknown";
}

function normalizeConfidence(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "confirmed" || text === "high") return "confirmed";
  if (text === "rumored" || text === "rumour" || text === "low") return "rumored";
  return "reported";
}

function selectAvailableCapacityMW(value) {
  if (isFinitePositiveNumber(value)) return value;
  if (!isRecord(value)) return null;
  const candidates = [
    value.available, value.availableMw, value.availableMW, value.it,
    value.operational, value.operating, value.underConstruction,
    value.under_construction, value.planned, value.total, value.capacity,
  ];
  const selected = candidates.find(isFinitePositiveNumber);
  return selected === undefined ? null : selected;
}

function normalizeLocation(value) {
  if (isRecord(value)) {
    const state = typeof value.state === "string" ? value.state.trim().toUpperCase() : "";
    return {
      city: typeof value.city === "string" ? value.city.trim() : "",
      county: typeof value.county === "string" ? value.county.trim() : "",
      state: /^[A-Z]{2}$/.test(state) ? state : "",
    };
  }
  if (typeof value === "string") {
    const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
    const state = (parts.at(-1) ?? "").toUpperCase();
    return { city: parts[0] ?? "", county: "", state: /^[A-Z]{2}$/.test(state) ? state : "" };
  }
  return { city: "", county: "", state: "" };
}

function mapOperatorExposure(operator) {
  const text = String(operator ?? "").toLowerCase();
  const matches = OPERATOR_MAPPINGS.filter((mapping) => text.includes(mapping.match));
  return {
    companies: [...new Set(matches.map((mapping) => mapping.company))],
    funds: [...new Set(matches.flatMap((mapping) => mapping.funds))],
  };
}

function sourceUrlForFacility(raw, id) {
  const candidates = [
    ...(Array.isArray(raw?.sources) ? raw.sources.map((source) => source?.url) : []),
    raw?.sourceUrl, raw?.source_url,
    id ? `${COMPUTE_ATLAS_BASE_URL}/facilities/${encodeURIComponent(id)}` : null,
  ];
  return candidates.map(safePublicSourceUrl).find(Boolean) ?? null;
}

function resolveDirectoryIdentity({ id, name, operator, city, county, state }) {
  const normalized = `${id} ${name} ${operator}`.toLowerCase();
  const isAbileneArea = [city, county, state].some((value) => String(value ?? "").toLowerCase().includes("abilene") || String(value ?? "").toLowerCase().includes("taylor"));
  const isCanonicalAbilene = id === "stargate-abilene-tx" && isAbileneArea;
  if (isCanonicalAbilene) {
    return {
      canonicalProjectId: "stargate-abilene",
      directoryDisposition: "canonical",
      relationshipReason: "Canonical Compute Atlas entry for the curated Stargate Abilene workbench. Other Abilene or Lancium records must remain separate unless a source-supported relationship is shown.",
    };
  }
  const isLanciumCampus = normalized.includes("lancium") && normalized.includes("clean campus");
  if (isLanciumCampus && isAbileneArea) {
    return {
      directoryDisposition: "unverified-related",
      relationshipReason: "Lancium Clean Campus is co-mentioned in the reviewed Abilene source context, but that does not establish a shared campus or canonical facility identity. Keep this as a separate unverified directory entry.",
    };
  }
  if (isAbileneArea && normalized.includes("stargate") && normalized.includes("abilene")) {
    return {
      directoryDisposition: "unverified-related",
      relationshipReason: "Abilene/Stargate naming overlap is not enough to establish the same facility, phase, or agreement; research separately until attributable documentation is available.",
    };
  }
  return {};
}

function normalizeFacility(raw, index = 0) {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : `facility-${index + 1}`;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  if (!name) return null;
  const operator = typeof raw.operator === "string" && raw.operator.trim() ? raw.operator.trim() : "Undisclosed operator";
  const location = normalizeLocation(raw.location ?? raw.address);
  const capacityMW = selectAvailableCapacityMW(raw.capacityMw ?? raw.capacityMW ?? raw.capacity);
  const exposure = mapOperatorExposure(operator);
  const identity = resolveDirectoryIdentity({ id, name, operator, city: location.city, county: location.county, state: location.state });
  return {
    id,
    name,
    operator,
    city: location.city || "Undisclosed",
    county: location.county || "",
    state: location.state || "US",
    capacityMW,
    availableCapacityMW: capacityMW,
    status: normalizeStatus(raw.status),
    confidence: normalizeConfidence(raw.confidence),
    aiClassification: typeof raw.aiClassification === "string" && raw.aiClassification.trim()
      ? raw.aiClassification.trim()
      : typeof raw.ai_classification === "string" && raw.ai_classification.trim()
        ? raw.ai_classification.trim()
        : null,
    sourceUrl: sourceUrlForFacility(raw, id),
    connectedCompanies: exposure.companies,
    connectedFunds: exposure.funds,
    lastUpdated: validTimestamp(raw.lastUpdated ?? raw.last_updated ?? raw.updatedAt ?? raw.updated_at),
    ...identity,
  };
}

function sortFacilities(facilities) {
  return [...facilities].sort((a, b) =>
    a.state.localeCompare(b.state) ||
    (b.availableCapacityMW ?? -1) - (a.availableCapacityMW ?? -1) ||
    a.name.localeCompare(b.name),
  );
}

function parseFacilitiesPayload(payload) {
  const records = Array.isArray(payload) ? payload : isRecord(payload) ? payload.facilities : null;
  if (!Array.isArray(records)) throw new Error("Compute Atlas facilities response did not contain a facilities array.");
  const facilities = records.map(normalizeFacility).filter(Boolean);
  if (facilities.length === 0) throw new Error("Compute Atlas facilities response did not contain usable records.");
  return sortFacilities(facilities);
}

function countBy(facilities, key) {
  return facilities.reduce((counts, facility) => {
    const value = facility[key] || "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function aggregateStats(facilities, upstreamStats = null) {
  const capacityTotal = (key) => facilities.reduce((total, facility) => total + (facility.capacityMW ?? 0), 0);
  const upstreamStates = isRecord(upstreamStats?.states) ? upstreamStats.states : null;
  return {
    totalFacilities: isFinitePositiveNumber(upstreamStats?.count) ? upstreamStats.count : facilities.length,
    stateCounts: upstreamStates ?? countBy(facilities, "state"),
    statusCounts: countBy(facilities, "status"),
    capacityTotalsMW: {
      total: capacityTotal("capacityMW"),
      operating: isFinitePositiveNumber(upstreamStats?.operationalMw) ? upstreamStats.operationalMw : facilities.filter((f) => f.status === "operating").reduce((t, f) => t + (f.capacityMW ?? 0), 0),
      planned: isFinitePositiveNumber(upstreamStats?.plannedMw) ? upstreamStats.plannedMw : facilities.filter((f) => f.status === "planned").reduce((t, f) => t + (f.capacityMW ?? 0), 0),
      construction: isFinitePositiveNumber(upstreamStats?.underConstructionMw) ? upstreamStats.underConstructionMw : facilities.filter((f) => f.status === "construction").reduce((t, f) => t + (f.capacityMW ?? 0), 0),
      undisclosed: facilities.filter((f) => f.capacityMW === null).length,
    },
  };
}

function sourceMetadata(status, fetchedAt, sourceUpdatedAt, extra = {}) {
  return {
    provider: "Compute Atlas",
    attributionUrl: COMPUTE_ATLAS_ATTRIBUTION_URL,
    status,
    dataOrigin: status === "embedded" ? "embedded" : "provider",
    ...(status === "embedded" ? { snapshotVersion: "2026-08-31" } : { fetchedAt, sourceUpdatedAt }),
    ...extra,
  };
}

function embeddedDirectoryResponse(now, error = null) {
  const fetchedAt = new Date(now()).toISOString();
  return {
    facilities: sortFacilities(EMBEDDED_SNAPSHOT),
    sourceMetadata: sourceMetadata("embedded", fetchedAt, null, { reason: "provider-unavailable" }),
    diagnostics: { endpoint: "/api/directory", cache: "embedded", provider: COMPUTE_ATLAS_FACILITIES_URL, ...(error ? { error } : {}) },
  };
}

function embeddedStatsResponse(now, error = null) {
  const fetchedAt = new Date(now()).toISOString();
  return {
    stats: aggregateStats(EMBEDDED_SNAPSHOT),
    sourceMetadata: sourceMetadata("embedded", fetchedAt, null, { reason: "provider-unavailable" }),
    diagnostics: { endpoint: "/api/directory/stats", cache: "embedded", provider: COMPUTE_ATLAS_STATS_URL, ...(error ? { error } : {}) },
  };
}

async function fetchJson(url, fetchImpl, now) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECTORY_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Compute Atlas upstream returned HTTP ${response.status}.`);
    const contentType = response.headers.get?.("content-type") ?? "";
    if (contentType && !contentType.includes("json")) throw new Error("Compute Atlas upstream returned a non-JSON response.");
    const payload = await response.json();
    return { payload, sourceUpdatedAt: providerUpdatedAt(payload) };
  } finally {
    clearTimeout(timeout);
  }
}

function cacheIsFresh(entry, now) {
  return Boolean(entry) && now() - entry.cachedAt < DIRECTORY_CACHE_TTL_MS;
}

async function fetchDirectoryFromProvider({ fetchImpl = fetch, now = Date.now } = {}) {
  const fetchedAt = new Date(now()).toISOString();
  const result = await fetchJson(process.env.COMPUTE_ATLAS_FACILITIES_URL || COMPUTE_ATLAS_FACILITIES_URL, fetchImpl, now);
  const facilities = parseFacilitiesPayload(result.payload);
  const response = {
    facilities,
    sourceMetadata: sourceMetadata("live", fetchedAt, result.sourceUpdatedAt),
    diagnostics: { endpoint: "/api/directory", cache: "miss", provider: COMPUTE_ATLAS_FACILITIES_URL, responseStatus: 200 },
  };
  return { ...response, cachedAt: now() };
}

async function fetchStatsFromProvider({ fetchImpl = fetch, now = Date.now } = {}) {
  const fetchedAt = new Date(now()).toISOString();
  const [statsResult, facilitiesResult] = await Promise.all([
    fetchJson(process.env.COMPUTE_ATLAS_STATS_URL || COMPUTE_ATLAS_STATS_URL, fetchImpl, now),
    fetchJson(process.env.COMPUTE_ATLAS_FACILITIES_URL || COMPUTE_ATLAS_FACILITIES_URL, fetchImpl, now),
  ]);
  const facilities = parseFacilitiesPayload(facilitiesResult.payload);
  if (!isRecord(statsResult.payload)) throw new Error("Compute Atlas stats response was not an object.");
  const response = {
    stats: aggregateStats(facilities, statsResult.payload),
    sourceMetadata: sourceMetadata("live", fetchedAt, statsResult.sourceUpdatedAt ?? facilitiesResult.sourceUpdatedAt),
    diagnostics: { endpoint: "/api/directory/stats", cache: "miss", provider: COMPUTE_ATLAS_STATS_URL, responseStatus: 200 },
  };
  return { ...response, cachedAt: now() };
}

function retainedResponse(entry, status, endpoint, error) {
  const { cachedAt: _cachedAt, ...response } = entry;
  return {
    ...response,
    sourceMetadata: { ...response.sourceMetadata, status, dataOrigin: "provider" },
    diagnostics: { ...response.diagnostics, endpoint, cache: "hit", responseStatus: 200, error },
  };
}

export async function getDirectory(options = {}) {
  const now = options.now ?? Date.now;
  try {
    const response = await fetchDirectoryFromProvider(options);
    retainedDirectoryResponse = response;
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compute Atlas provider failed.";
    if (cacheIsFresh(retainedDirectoryResponse, now)) return retainedResponse(retainedDirectoryResponse, "cached", "/api/directory", message);
    return embeddedDirectoryResponse(now, message);
  }
}

export async function getDirectoryStats(options = {}) {
  const now = options.now ?? Date.now;
  try {
    const response = await fetchStatsFromProvider(options);
    retainedStatsResponse = response;
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compute Atlas provider failed.";
    if (cacheIsFresh(retainedStatsResponse, now)) return retainedResponse(retainedStatsResponse, "cached", "/api/directory/stats", message);
    return embeddedStatsResponse(now, message);
  }
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function pageDirectoryResponse(response, requestUrl) {
  const url = new URL(requestUrl || "/api/directory", "http://localhost");
  const parseInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
  };
  const limit = Math.max(1, parseInteger(url.searchParams.get("limit"), 24, 100));
  const offset = parseInteger(url.searchParams.get("offset"), 0);
  const query = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const state = (url.searchParams.get("state") ?? "").trim().toUpperCase();
  const company = (url.searchParams.get("company") ?? "").trim();
  const matches = response.facilities.filter((facility) => {
    const matchesState = !state ||
      (state === "OTHER" ? !["TX", "AZ", "VA", "GA", "OH"].includes(facility.state) : facility.state === state);
    const haystack = `${facility.name} ${facility.operator} ${facility.city} ${facility.county} ${facility.state} ${facility.aiClassification ?? ""}`.toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    const matchesCompany = !company || facility.connectedCompanies.includes(company);
    return matchesState && matchesSearch && matchesCompany;
  });
  const texasFirst = !state && !query && !company
    ? [...matches.filter((facility) => facility.state === "TX"), ...matches.filter((facility) => facility.state !== "TX")]
    : matches;
  const facilities = texasFirst.slice(offset, offset + limit);
  return {
    ...response,
    facilities,
    totalFacilities: texasFirst.length,
    offset,
    limit,
    hasMore: offset + facilities.length < texasFirst.length,
    diagnostics: { ...response.diagnostics, pagination: { offset, limit, totalFacilities: texasFirst.length, texasFirst: !state && !query && !company } },
  };
}

export async function handleDirectoryRequest(req, res, options = {}) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed", sourceMetadata: sourceMetadata("embedded", new Date().toISOString(), null) });
    return;
  }
  sendJson(res, 200, pageDirectoryResponse(await getDirectory(options), req.url));
}

export async function handleDirectoryStatsRequest(req, res, options = {}) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed", sourceMetadata: sourceMetadata("embedded", new Date().toISOString(), null) });
    return;
  }
  sendJson(res, 200, await getDirectoryStats(options));
}

export function clearDirectoryCache() {
  retainedDirectoryResponse = null;
  retainedStatsResponse = null;
}

export {
  COMPUTE_ATLAS_BASE_URL,
  COMPUTE_ATLAS_FACILITIES_URL,
  COMPUTE_ATLAS_STATS_URL,
  DIRECTORY_CACHE_TTL_MS,
  DIRECTORY_REQUEST_TIMEOUT_MS,
  EMBEDDED_SNAPSHOT,
  OPERATOR_MAPPINGS,
  aggregateStats,
  mapOperatorExposure,
  normalizeConfidence,
  normalizeFacility,
  normalizeLocation,
  normalizeStatus,
  providerUpdatedAt,
  parseFacilitiesPayload,
  safePublicSourceUrl,
  selectAvailableCapacityMW,
  sortFacilities,
};