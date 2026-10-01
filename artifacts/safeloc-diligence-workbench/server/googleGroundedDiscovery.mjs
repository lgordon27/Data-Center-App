import { canonicalizeSourceUrl } from "../src/data/sourceValidationPolicy.mjs";

export const GOOGLE_GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GOOGLE_GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
export function resolveGoogleGeminiModel(env = process.env) {
  const configured = typeof env?.GEMINI_DISCOVERY_MODEL === "string"
    ? env.GEMINI_DISCOVERY_MODEL.trim()
    : "";
  return configured || GOOGLE_GEMINI_DEFAULT_MODEL;
}
export const GOOGLE_GEMINI_MODEL = resolveGoogleGeminiModel();
export const GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT = 1;
export const GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES = 80;
export const GOOGLE_GROUNDED_PREFLIGHT_PROMPT = [
  "Use Google Search to find Google's official “Grounding with Google Search” Gemini API documentation.",
  "Report the date currently displayed in that page's “Last updated” footer and cite that exact official documentation page.",
  "You must use the enabled Google Search tool before answering. The application trusts only search-call steps and URL-citation annotations, not your prose.",
].join("\n");

const DISCOVERY_CATEGORIES = Object.freeze([
  "project-identity",
  "company-developer",
  "facility",
  "grid-power",
  "water",
  "community",
  "permitting-construction",
  "counterparty",
  "climate",
  "project-economics",
]);

export const GOOGLE_DISCOVERY_CATEGORY_ROUTING = Object.freeze({
  "project-identity": ["project-identity"],
  "company-developer": ["construction-capital", "tenant-counterparty"],
  facility: ["project-identity"],
  "grid-power": ["grid", "electricity"],
  water: ["water"],
  community: ["permitting-community"],
  "permitting-construction": ["permitting-community", "construction-capital"],
  counterparty: ["tenant-counterparty"],
  climate: ["climate-operational-hazard"],
  "project-economics": ["electricity", "construction-capital"],
});
function normalizeText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function safeGoogleErrorKind(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().split(/[./]/).at(-1)?.slice(0, 80) ?? "";
  return /^[a-z0-9_-]+$/.test(normalized) ? normalized : null;
}

function safeGoogleErrorMessage(value) {
  return normalizeText(value, 240)
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/\borg-[A-Za-z0-9_-]+\b/gi, "org-[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(api[_ -]?key|authorization|token)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function safeGoogleResponseId(value) {
  const id = normalizeText(value, 160);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(id) ? id : null;
}

function googleResponseUsage(body) {
  const containers = [
    body?.usage,
    body?.usageMetadata,
    body?.usage_metadata,
    body?.response?.usage,
    body?.response?.usageMetadata,
    body?.response?.usage_metadata,
  ].filter((value) => value && typeof value === "object");
  const firstCount = (keys) => {
    for (const usage of containers) {
      for (const key of keys) {
        const value = usage[key];
        if (Number.isFinite(value) && value >= 0) return value;
      }
    }
    return null;
  };
  const usage = {
    inputTokens: firstCount(["input_tokens", "inputTokens", "promptTokenCount", "prompt_tokens"]),
    outputTokens: firstCount([
      "output_tokens",
      "outputTokens",
      "candidatesTokenCount",
      "candidateTokenCount",
      "completion_tokens",
    ]),
    totalTokens: firstCount(["total_tokens", "totalTokens", "totalTokenCount"]),
  };
  return Object.values(usage).some((value) => value !== null) ? usage : null;
}

function googleRateLimitIndicators(headers) {
  const fields = {
    retryAfter: "retry-after",
    limitRequests: "x-ratelimit-limit-requests",
    remainingRequests: "x-ratelimit-remaining-requests",
    resetRequests: "x-ratelimit-reset-requests",
    limitTokens: "x-ratelimit-limit-tokens",
    remainingTokens: "x-ratelimit-remaining-tokens",
    resetTokens: "x-ratelimit-reset-tokens",
  };
  return Object.fromEntries(Object.entries(fields).flatMap(([key, header]) => {
    const value = headers.get(header)?.trim().slice(0, 80);
    return value && /^[A-Za-z0-9_.:/ -]+$/.test(value) ? [[key, value]] : [];
  }));
}

function safeCandidateUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return canonicalizeSourceUrl(parsed.toString());
  } catch {
    return null;
  }
}

function interactionSteps(body) {
  if (!Array.isArray(body?.steps)) {
    const error = new Error("Google Interactions grounding response is missing a valid steps array.");
    error.name = "GoogleDiscoveryParseError";
    error.researchErrorType = "google-malformed-response";
    error.providerDiagnostic = { status: null, reason: "malformed-interactions-response" };
    throw error;
  }
  return body.steps;
}

function searchCallQueries(step) {
  const args = step?.arguments;
  const queries = Array.isArray(args?.queries) ? args.queries : [];
  return queries.map((query) => normalizeText(query, 500)).filter(Boolean);
}

function categoryIdsForCitation(citation) {
  const values = Array.isArray(citation?.categoryIds)
    ? citation.categoryIds
    : Array.isArray(citation?.categories)
      ? citation.categories
      : [];
  const labels = [...new Set(values
    .map((value) => normalizeText(value, 80).toLowerCase().replaceAll("_", "-"))
    .filter(Boolean))];
  const mapped = labels.flatMap((label) => GOOGLE_DISCOVERY_CATEGORY_ROUTING[label] ?? []);
  // Unknown provider labels remain available for relevance assessment in every
  // downstream category, but are never treated as evidence applicability.
  return {
    categoryIds: [...new Set(mapped)],
    discoveryCategoryIds: labels,
    unknownCategoryLabels: labels.filter((label) => !DISCOVERY_CATEGORIES.includes(label)),
    // Missing, empty, unusable, and wholly unknown provider metadata all mean
    // relevance is unresolved. Mixed metadata keeps its recognized routing;
    // the unknown label is still retained for audit without broadening scope.
    categoryRoutingUnknown: mapped.length === 0,
  };
}

function sourceFromUrlCitation(annotation) {
  const url = safeCandidateUrl(annotation?.url);
  if (!url) return null;
  const originatingQuery = typeof annotation?.discoveryOriginatingQuery === "string"
    ? normalizeText(annotation.discoveryOriginatingQuery, 500)
    : null;
  return {
    url,
    canonicalUrl: url,
    discoveryCandidateUrl: safeCandidateUrl(annotation?.url),
    title: normalizeText(annotation?.title, 240) || "Google-grounded public source",
    publisher: null,
    date: null,
    excerpt: "",
    claimPassage: null,
    claimCited: false,
    sourceChannel: "google-grounded-search",
    origin: "google-grounded-search",
    discoveryOnly: true,
    discoveryCandidateRank: Number.isInteger(annotation?.discoveryCandidateRank)
      ? annotation.discoveryCandidateRank
      : null,
    discoveryOriginatingQuery: originatingQuery,
    discoveryCandidateRankWithinQuery: Number.isInteger(annotation?.discoveryCandidateRankWithinQuery)
      ? annotation.discoveryCandidateRankWithinQuery
      : null,
    discoveryQueryAttributionStatus: originatingQuery ? "provider-attributed" : "unavailable",
    discoveryQueryRankAvailability: Number.isInteger(annotation?.discoveryCandidateRankWithinQuery)
      ? "provider-reported"
      : "unavailable",
    discoveryDeduplicationLineage: annotation?.discoveryDeduplicationLineage ?? {
      duplicateAnnotationRanks: [],
      deduplicatedAcrossQueries: false,
    },
    referringQueries: originatingQuery ? [originatingQuery] : [],
    ...categoryIdsForCitation(annotation),
    relevanceNote: "Google grounding discovered this URL; generated summaries and snippets are not evidence.",
  };
}

export function buildGoogleGroundedDiscoveryPrompt(project) {
  const queryPlan = buildGoogleGroundedDiscoveryQueryPlan(project);
  return [
    "Discover public sources for the submitted project using only the supplied project context below.",
    "You must call Google Search before answering; do not answer from memory.",
    "Use this one bounded, deterministic query plan in order. Issue no more than one search query for each listed family; do not add searches or follow-up phases.",
    "The plan is requested coverage, not proof of execution. Preserve the actual queries only in google_search_call telemetry.",
    ...queryPlan.map((query, index) => `${index + 1}. ${query}`),
    `Keep returned candidates useful across these discovery areas: ${DISCOVERY_CATEGORIES.join(", ")}.`,
    "Do not use generated JSON, prose, snippets, or model-selected URLs as provenance. The application accepts only executed google_search_call queries and provider url_citation annotations in the Interactions response.",
    "The response may contain explanatory text, but it must not be used to manufacture queries or citations. Never invent a URL.",
    "Prefer first-party company/developer disclosures, government and regulator records, permits, utility records, court or public-agenda records, and reputable project-specific reporting.",
  ].join("\n");
}

function contextStrings(...values) {
  const flattened = values.flatMap((value) => Array.isArray(value) ? value : [value]);
  const unique = new Map();
  for (const value of flattened) {
    const text = normalizeText(value, 80);
    const key = text.toLocaleLowerCase();
    if (text && !unique.has(key)) unique.set(key, text);
  }
  return [...unique.values()];
}

export function extractDfwFacilityIdentifiers(passages = []) {
  const seen = new Set();
  const identifiers = [];
  for (const passage of Array.isArray(passages) ? passages : [passages]) {
    for (const match of String(passage ?? "").matchAll(/\bDFW\s*[- ]?\s*(\d{1,2})\b/giu)) {
      const identifier = `DFW${match[1]}`;
      const key = identifier.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      identifiers.push(identifier);
      if (identifiers.length >= 8) return identifiers;
    }
  }
  return identifiers;
}

/**
 * Produces bounded navigation aliases. Retained-passage aliases are explicitly
 * labeled as such, but every alias remains a search hint rather than identity
 * evidence or an evidence-eligibility signal.
 */
export function buildGoogleGroundedDiscoveryAliasSet(project = {}, retainedPassages = []) {
  const knownData = project?.knownData ?? {};
  const aliases = [];
  const seen = new Set();
  const add = (kind, source, values, maxForKind) => {
    for (const value of contextStrings(...values).slice(0, maxForKind)) {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      aliases.push({
        value,
        kind,
        source,
        navigationHintOnly: true,
        identityEvidence: false,
      });
    }
  };

  add("project", "submitted-context", [
    project?.name,
    project?.projectName,
    project?.aliases,
    project?.projectAliases,
    knownData?.aliases,
    knownData?.projectAliases,
  ], 4);
  add("operator", "submitted-context", [
    project?.operator,
    knownData?.operator,
    project?.owner,
    knownData?.owner,
    knownData?.developer,
    knownData?.companyName,
    project?.operatorAliases,
    knownData?.operatorAliases,
    project?.ownerAliases,
    knownData?.ownerAliases,
  ], 3);
  add("location", "submitted-context", [
    project?.city,
    project?.county,
    project?.state,
    project?.location,
    knownData?.city,
    knownData?.county,
    knownData?.state,
  ], 6);
  add("facility-identifier", "submitted-context", [
    project?.facilityIdentifiers,
    project?.facilityIds,
    project?.buildingIdentifiers,
    project?.buildingIds,
    project?.campusIdentifiers,
    knownData?.facilityIdentifiers,
    knownData?.facilityIds,
    knownData?.buildingIdentifiers,
    knownData?.buildingIds,
    knownData?.campusIdentifiers,
  ], 6);
  add("facility-identifier", "retained-passage", [
    extractDfwFacilityIdentifiers(retainedPassages),
  ], 8);
  return aliases.slice(0, 24);
}

function domainForSearch(value) {
  const text = normalizeText(value, 180);
  if (!text) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? domain : "";
  } catch {
    return "";
  }
}

/**
 * Produces requested search coverage from submitted context only. These terms
 * guide the single grounding request; they are not execution telemetry,
 * provenance, identity, or evidence.
 */
export function buildGoogleGroundedDiscoveryQueryPlan(project = {}) {
  const knownData = project?.knownData ?? {};
  const aliases = buildGoogleGroundedDiscoveryAliasSet(project);
  const names = aliases.filter((alias) => alias.kind === "project").map((alias) => alias.value).slice(0, 3);
  const name = names[0] ?? (normalizeText(project?.name ?? project?.projectName, 120) || "the submitted project");
  const operatorNames = aliases.filter((alias) => alias.kind === "operator").map((alias) => alias.value).slice(0, 2);
  const identifiers = aliases
    .filter((alias) => alias.kind === "facility-identifier")
    .map((alias) => alias.value)
    .slice(0, 6);
  const location = contextStrings(project?.location)[0]
    ?? (contextStrings(knownData?.city, knownData?.county, knownData?.state).join(", ")
      || "the submitted project location");
  const operatorTerms = operatorNames.join(" ") || "the submitted owner or operator";
  const projectTerms = names.slice(0, 2).join(" ") || name;
  const facilityTerms = identifiers.slice(0, 4).join(" ") || projectTerms;
  const authorityNames = contextStrings(
    knownData?.authorityNames,
    knownData?.permittingAuthority,
    knownData?.waterAuthority,
  ).slice(0, 4);
  const authorityDomains = contextStrings(
    knownData?.authorityDomains,
    knownData?.cityDomains,
    knownData?.countyDomains,
    knownData?.utilityDomains,
    knownData?.knownOfficialEndpoints?.map(domainForSearch),
  ).map(domainForSearch).filter(Boolean).slice(0, 8);
  const stateText = contextStrings(knownData?.state, project?.location).join(" ");
  if (/\b(?:texas|tx)\b/i.test(stateText)) {
    authorityDomains.splice(0, authorityDomains.length, "tdlr.texas.gov", ...authorityDomains.filter((domain) => domain !== "tdlr.texas.gov"));
  }
  const officialTargets = [
    ...authorityNames,
    ...authorityDomains.map((domain) => `site:${domain}`),
  ].join(" ");

  const redOakDataBankContext = /\bred\s+oak\b/i.test(`${name} ${projectTerms} ${names.join(" ")}`)
    && /\bdatabank\b/i.test(`${operatorNames.join(" ")} ${names.join(" ")}`);
  const queryFacilityIdentifiers = redOakDataBankContext
    ? ["DFW9", "DFW10", "DFW11"]
    : identifiers;
  const dfwIdentifiers = queryFacilityIdentifiers
    .filter((identifier) => /^DFW\s*[- ]?\s*\d{1,2}$/i.test(identifier))
    .slice(0, 3)
    .map((identifier) => identifier.replace(/\s+|-/g, "").toUpperCase());
  if (dfwIdentifiers.length) {
    const bridgeQueries = dfwIdentifiers.map((identifier) =>
      `"${operatorNames[0] ?? operatorTerms}" "${identifier}" "${name}" "${location}" Red Oak DataBank relationship`);
    const officialBridge = `${dfwIdentifiers.map((identifier) => `"${identifier}"`).join(" OR ")} ${operatorTerms} ${projectTerms} ${location} official state records TDLR TABS permits ${officialTargets}`;
    const broadCoverage = `${projectTerms} ${operatorTerms} ${facilityTerms} ${location} data center campus utility power grid permits financing construction local reporting`;
    return [
      `"${name}" ${operatorTerms} ${projectTerms} ${location} project campus data center`,
      ...bridgeQueries,
      officialBridge,
      broadCoverage,
    ].map((query) => normalizeText(query, 500));
  }

  return [
    `"${name}" ${operatorTerms} ${projectTerms} ${location} project campus data center`,
    `"${name}" ${operatorTerms} ${facilityTerms} ${location} facility building campus data center`,
    `${projectTerms} ${operatorTerms} ${location} project-specific permits TDLR TABS zoning building records ${officialTargets}`,
    `${projectTerms} ${operatorTerms} ${location} data center financing construction loan development announcement`,
    `${projectTerms} ${operatorTerms} ${facilityTerms} ${location} data center electric power utility grid substation interconnection`,
    `${projectTerms} ${operatorTerms} ${location} data center trade reporting local news community financing construction`,
  ].map((query) => normalizeText(query, 500));
}

function explicitCandidateQueryAttribution(annotation, executedQueries) {
  const reportedQuery = [
    annotation?.discoveryOriginatingQuery,
    annotation?.originatingQuery,
    annotation?.searchQuery,
    annotation?.search_query,
  ].find((value) => typeof value === "string" && value.trim());
  if (!reportedQuery) return { query: null, queryRank: null };
  const normalizedReported = normalizeText(reportedQuery, 500).toLocaleLowerCase();
  const query = executedQueries.find((value) =>
    normalizeText(value, 500).toLocaleLowerCase() === normalizedReported) ?? null;
  if (!query) return { query: null, queryRank: null };
  const reportedRank = [
    annotation?.discoveryCandidateRankWithinQuery,
    annotation?.candidateRankWithinQuery,
    annotation?.rankWithinQuery,
    annotation?.queryRank,
  ].find((value) => Number.isInteger(value) && value > 0 && value <= GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES);
  return { query, queryRank: reportedRank ?? null };
}

export function buildGoogleGroundedDiscoveryRequestBody(project, {
  prompt = buildGoogleGroundedDiscoveryPrompt(project),
  model = GOOGLE_GEMINI_MODEL,
} = {}) {
  return {
    model,
    input: prompt,
    tools: [{ type: "google_search" }],
  };
}

export function sanitizeGoogleGroundedRequest(endpoint, init = {}) {
  let body = null;
  try {
    body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? null;
  } catch {
    body = null;
  }
  return {
    endpoint,
    method: normalizeText(init.method, 20).toUpperCase() || "POST",
    headers: {
      accept: normalizeText(init.headers?.accept, 80) || null,
      "content-type": normalizeText(init.headers?.["content-type"], 80) || null,
    },
    body: body && typeof body === "object"
      ? {
          model: normalizeText(body.model, 120) || null,
          input: normalizeText(body.input, 4_000) || null,
          tools: Array.isArray(body.tools)
            ? body.tools.slice(0, 4).map((tool) => ({ type: normalizeText(tool?.type, 80) || null }))
            : [],
        }
      : null,
  };
}

export function parseGoogleGroundedDiscoveryResponse(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("Google Interactions grounding returned a non-object response.");
    error.name = "GoogleDiscoveryParseError";
    error.researchErrorType = "google-malformed-response";
    error.providerDiagnostic = { status: null, reason: "malformed-interactions-response" };
    throw error;
  }
  const steps = interactionSteps(body);
  const searchCalls = steps.filter((step) => step?.type === "google_search_call");
  const searchResults = steps.filter((step) => step?.type === "google_search_result");
  const modelOutputs = steps.filter((step) => step?.type === "model_output");
  const queries = [...new Set(searchCalls.flatMap(searchCallQueries))].slice(0, 24);
  const annotations = modelOutputs.flatMap((step) =>
    (Array.isArray(step?.content) ? step.content : []).flatMap((content) =>
      Array.isArray(content?.annotations) ? content.annotations : []),
  ).filter((annotation) => annotation?.type === "url_citation");
  const sources = [];
  const firstByCanonicalUrl = new Map();
  const annotationDiagnostics = annotations.map((annotation, index) => {
    const rawUrl = typeof annotation?.url === "string" ? annotation.url.trim() : "";
    const url = safeCandidateUrl(rawUrl);
    const canonicalUrl = url ? canonicalizeSourceUrl(url) : null;
    const attribution = explicitCandidateQueryAttribution(annotation, queries);
    const prior = canonicalUrl ? firstByCanonicalUrl.get(canonicalUrl) : null;
    const duplicate = Boolean(prior);
    if (canonicalUrl && !prior) firstByCanonicalUrl.set(canonicalUrl, {
      discoveryRank: index + 1,
      originatingQuery: attribution.query,
    });
    return {
      discoveryRank: index + 1,
      type: "url_citation",
      title: normalizeText(annotation?.title, 240) || null,
      url: rawUrl || null,
      canonicalUrl,
      discoveryOriginatingQuery: attribution.query,
      discoveryQueryAttributionStatus: attribution.query ? "provider-attributed" : "unavailable",
      discoveryCandidateRankWithinQuery: attribution.queryRank,
      discoveryQueryRankAvailability: attribution.queryRank === null ? "unavailable" : "provider-reported",
      accepted: Boolean(url && !duplicate),
      deduplicatedAgainstDiscoveryRank: prior?.discoveryRank ?? null,
      rejectionReason: !rawUrl ? "missing-url" : !url ? "unsafe-or-invalid-url" : duplicate ? "duplicate-canonical-url" : null,
    };
  });
  for (const diagnostic of annotationDiagnostics) {
    if (!diagnostic.accepted) continue;
    const duplicates = annotationDiagnostics.filter((candidate) =>
      candidate.deduplicatedAgainstDiscoveryRank === diagnostic.discoveryRank);
    const queryValues = [
      diagnostic.discoveryOriginatingQuery,
      ...duplicates.map((candidate) => candidate.discoveryOriginatingQuery),
    ];
    const allAttributed = queryValues.every((query) => typeof query === "string" && query.length > 0);
    diagnostic.discoveryDeduplicationLineage = {
      duplicateAnnotationRanks: duplicates.map((candidate) => candidate.discoveryRank),
      deduplicatedAcrossQueries: duplicates.length === 0
        ? false
        : allAttributed
          ? new Set(queryValues).size > 1
          : null,
    };
  }
  for (const [index, annotation] of annotations.entries()) {
    const source = sourceFromUrlCitation({
      ...annotation,
      discoveryCandidateRank: index + 1,
      discoveryOriginatingQuery: annotationDiagnostics[index]?.discoveryOriginatingQuery,
      discoveryCandidateRankWithinQuery: annotationDiagnostics[index]?.discoveryCandidateRankWithinQuery,
      discoveryDeduplicationLineage: annotationDiagnostics[index]?.discoveryDeduplicationLineage,
    });
    if (source && annotationDiagnostics[index]?.accepted) {
      sources.push(source);
    }
  }
  return {
    status: "completed",
    provider: "google-gemini-grounding",
    model: GOOGLE_GEMINI_MODEL,
    queries,
    candidates: sources.slice(0, GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES),
    generatedSummaryIgnored: true,
    groundingMetadataPresent: searchCalls.length > 0 || searchResults.length > 0 || annotations.length > 0,
    groundingSearchExecuted: searchCalls.length > 0 && queries.length > 0,
    usableCitationMetadataPresent: sources.length > 0,
    googleSearchCallCount: searchCalls.length,
    googleSearchResultCount: searchResults.length,
    urlCitationCount: annotations.length,
    citationCount: sources.length,
    rawAnnotationSummaries: annotationDiagnostics.slice(0, 80),
    acceptedCitationUrls: sources.map((source) => source.url),
    rejectedCitationUrls: annotationDiagnostics
      .filter((annotation) => !annotation.accepted)
      .map((annotation) => ({
        discoveryRank: annotation.discoveryRank,
        url: annotation.url,
        discoveryOriginatingQuery: annotation.discoveryOriginatingQuery,
        discoveryQueryAttributionStatus: annotation.discoveryQueryAttributionStatus,
        discoveryCandidateRankWithinQuery: annotation.discoveryCandidateRankWithinQuery,
        discoveryQueryRankAvailability: annotation.discoveryQueryRankAvailability,
        deduplicatedAgainstDiscoveryRank: annotation.deduplicatedAgainstDiscoveryRank,
        discoveryDeduplicationLineage: annotation.discoveryDeduplicationLineage ?? null,
        reason: annotation.rejectionReason,
      })),
  };
}

export function assertGoogleGroundedPreflightResult(result) {
  const reason = !Number.isInteger(result?.googleSearchCallCount) || result.googleSearchCallCount === 0
    ? "missing-google-search-call"
    : !Array.isArray(result?.queries) || result.queries.length === 0
      ? "empty-executed-queries"
      : !Number.isInteger(result?.googleSearchResultCount) || result.googleSearchResultCount === 0
        ? "missing-google-search-result"
        : !Number.isInteger(result?.urlCitationCount)
          || result.urlCitationCount === 0
          || !Array.isArray(result?.candidates)
          || result.candidates.length === 0
        ? "missing-url-citations"
        : null;
  if (!reason) return result;
  const error = new Error("Google Interactions returned HTTP success without proving a usable Google Search grounding call.");
  error.name = "GoogleDiscoveryGroundingRequiredError";
  error.researchErrorType = "google-grounding-not-proven";
  error.providerDiagnostic = { status: 200, reason };
  error.providerAttempt = {
    provider: "google-gemini-grounding",
    model: result?.model ?? GOOGLE_GEMINI_MODEL,
    requestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
    status: 200,
    outcome: "failed",
    queryCount: Array.isArray(result?.queries) ? result.queries.length : 0,
    citationCount: Number.isInteger(result?.citationCount) ? result.citationCount : 0,
    groundingMetadataPresent: result?.groundingMetadataPresent === true,
    googleSearchCallCount: result?.googleSearchCallCount ?? 0,
    googleSearchResultCount: result?.googleSearchResultCount ?? 0,
    urlCitationCount: result?.urlCitationCount ?? 0,
    toolDeclarationTransmitted: true,
  };
  throw error;
}

export async function discoverGoogleGroundedProject({
  project,
  apiKey,
  fetchImpl = fetch,
  signal,
  model = GOOGLE_GEMINI_MODEL,
  prompt,
  requireGrounding = false,
  analysisTracker = null,
} = {}) {
  if (!apiKey) {
    const error = new Error("Google Gemini grounding is not configured.");
    error.name = "GoogleDiscoveryConfigurationError";
    error.researchErrorType = "google-not-configured";
    throw error;
  }
  const endpoint = GOOGLE_GEMINI_INTERACTIONS_URL;
  const requestBody = buildGoogleGroundedDiscoveryRequestBody(project, { prompt, model });
  const requestInit = {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal,
  };
  const queuedAtMs = Date.now();
  const providerAttempt = {
    provider: "google-gemini-grounding",
    model,
    requestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
    queuedAt: new Date(queuedAtMs).toISOString(),
    issuedAt: null,
    finishedAt: null,
    queueWaitMs: null,
    elapsedMs: null,
    status: null,
    requestState: "queued",
    outcome: "cancelled-before-issue",
    providerResponseId: null,
    providerResponseIdAvailability: "pending",
    usage: null,
    usageAvailability: "pending",
    requestBodyBytes: Buffer.byteLength(requestInit.body),
  };
  analysisTracker?.attempts?.push(providerAttempt);
  let issuedAtMs = null;
  let tracked = false;
  const finishAttempt = (outcome, status = null) => {
    const finishedAtMs = Date.now();
    if (tracked && analysisTracker) {
      analysisTracker.inFlight = Math.max(0, analysisTracker.inFlight - 1);
      tracked = false;
    }
    Object.assign(providerAttempt, {
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
      status: Number.isInteger(status) ? status : null,
      requestState: issuedAtMs === null ? "cancelled-before-issue"
        : outcome === "completed" ? "completed"
          : outcome === "cancelled-after-issue" ? "cancelled-after-issue" : "failed",
      outcome,
      inFlightAnalysisCount: analysisTracker?.inFlight ?? null,
    });
  };
  let response;
  if (signal?.aborted) {
    const error = new Error("Google Gemini grounding request was cancelled before issue.");
    error.name = "GoogleDiscoveryTimeoutError";
    error.researchErrorType = "google-timeout";
    error.providerDiagnostic = {
      provider: "google-gemini-grounding",
      status: null,
      upstreamStatus: null,
      reason: "cancelled-before-issue",
    };
    Object.assign(providerAttempt, {
      providerDiagnostic: error.providerDiagnostic,
      providerResponseIdAvailability: "not-issued",
      usageAvailability: "not-issued",
    });
    finishAttempt("cancelled-before-issue");
    error.providerAttempt = providerAttempt;
    throw error;
  }
  issuedAtMs = Date.now();
  providerAttempt.issuedAt = new Date(issuedAtMs).toISOString();
  providerAttempt.queueWaitMs = Math.max(0, issuedAtMs - queuedAtMs);
  providerAttempt.requestState = "issued";
  if (analysisTracker) {
    analysisTracker.inFlight += 1;
    analysisTracker.peak = Math.max(analysisTracker.peak, analysisTracker.inFlight);
    tracked = true;
    providerAttempt.inFlightAnalysisCountAtIssue = analysisTracker.inFlight;
  }
  try {
    response = await fetchImpl(endpoint, requestInit);
  } catch (cause) {
    const error = new Error("Google Gemini grounding request failed.");
    error.name = cause?.name === "AbortError" ? "GoogleDiscoveryTimeoutError" : "GoogleDiscoveryProviderError";
    error.researchErrorType = cause?.name === "AbortError" ? "google-timeout" : "google-provider-failure";
    error.providerDiagnostic = {
      provider: "google-gemini-grounding",
      status: null,
      upstreamStatus: null,
      reason: safeGoogleErrorKind(cause?.code) ?? (cause?.name === "AbortError" ? "aborted" : "network-failure"),
    };
    Object.assign(providerAttempt, {
      providerDiagnostic: error.providerDiagnostic,
      providerResponseIdAvailability: "response-not-received",
      usageAvailability: "response-not-received",
    });
    finishAttempt(cause?.name === "AbortError" || signal?.aborted ? "cancelled-after-issue" : "failed");
    error.providerAttempt = providerAttempt;
    throw error;
  }
  let raw;
  try {
    raw = await response.text();
  } catch (cause) {
    const error = new Error("Google Gemini grounding response could not be read.");
    error.name = cause?.name === "AbortError" ? "GoogleDiscoveryTimeoutError" : "GoogleDiscoveryProviderError";
    error.researchErrorType = cause?.name === "AbortError" ? "google-timeout" : "google-provider-failure";
    error.providerDiagnostic = {
      provider: "google-gemini-grounding",
      status: response.status,
      upstreamStatus: response.status,
      reason: safeGoogleErrorKind(cause?.code) ?? (cause?.name === "AbortError" ? "aborted" : "response-read-failure"),
    };
    Object.assign(providerAttempt, {
      providerDiagnostic: error.providerDiagnostic,
      providerResponseIdAvailability: "response-body-unreadable",
      usageAvailability: "response-body-unreadable",
    });
    finishAttempt(cause?.name === "AbortError" || signal?.aborted ? "cancelled-after-issue" : "failed", response.status);
    error.providerAttempt = providerAttempt;
    throw error;
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    const error = new Error("Google Gemini grounding returned malformed JSON.");
    error.name = "GoogleDiscoveryParseError";
    error.researchErrorType = "google-malformed-response";
    error.providerDiagnostic = { status: response.status, reason: "invalid-json" };
    Object.assign(providerAttempt, {
      providerDiagnostic: error.providerDiagnostic,
      providerResponseIdAvailability: "response-not-json",
      usageAvailability: "response-not-json",
    });
    finishAttempt("failed", response.status);
    error.providerAttempt = providerAttempt;
    throw error;
  }
  const providerResponseId = safeGoogleResponseId(body?.id);
  const usage = googleResponseUsage(body);
  Object.assign(providerAttempt, {
    providerResponseId,
    providerResponseIdAvailability: providerResponseId ? "provider-reported" : "not-provided-by-upstream",
    usage,
    usageAvailability: usage ? "provider-reported" : "not-provided-by-upstream",
  });
  if (!response.ok) {
    const error = new Error("Google Gemini grounding returned an upstream failure.");
    error.name = "GoogleDiscoveryProviderError";
    const providerStatus = normalizeText(body?.error?.status, 120).toUpperCase();
    const providerMessage = safeGoogleErrorMessage(body?.error?.message);
    const modelUnavailable = response.status === 404
      && (providerStatus === "NOT_FOUND" || /model|not available|not found/i.test(providerMessage));
    error.researchErrorType = modelUnavailable
      ? "google-model-unavailable"
      : "google-provider-failure";
    const errorCode = safeGoogleErrorKind(body?.error?.code)
      ?? safeGoogleErrorKind(providerStatus);
    const errorType = safeGoogleErrorKind(body?.error?.type);
    error.providerDiagnostic = {
      provider: "google-gemini-grounding",
      status: response.status,
      upstreamStatus: response.status,
      ...(errorCode ? { errorCode } : {}),
      ...(errorType ? { errorType } : {}),
      ...(providerMessage ? { message: providerMessage } : {}),
      rateLimit: googleRateLimitIndicators(response.headers),
      reason: safeGoogleErrorKind(providerStatus) ?? providerMessage ?? "upstream-failure",
    };
    Object.assign(providerAttempt, {
      providerDiagnostic: error.providerDiagnostic,
      queryCount: 0,
      citationCount: 0,
      groundingMetadataPresent: false,
      googleSearchCallCount: 0,
      googleSearchResultCount: 0,
      urlCitationCount: 0,
      toolDeclarationTransmitted: requestBody.tools?.some((tool) => tool?.type === "google_search") === true,
    });
    finishAttempt("failed", response.status);
    error.providerAttempt = providerAttempt;
    throw error;
  }
  let result;
  try {
    result = {
      ...parseGoogleGroundedDiscoveryResponse(body),
      model,
      requestedQueryPlan: typeof prompt === "string" && prompt.trim()
        ? []
        : buildGoogleGroundedDiscoveryQueryPlan(project),
    };
  } catch (error) {
    if (error?.providerDiagnostic) {
      error.providerDiagnostic.status = response.status;
      error.providerDiagnostic.upstreamStatus = response.status;
    }
    Object.assign(providerAttempt, {
      providerDiagnostic: error?.providerDiagnostic ?? null,
      queryCount: 0,
      citationCount: 0,
      groundingMetadataPresent: false,
      googleSearchCallCount: 0,
      googleSearchResultCount: 0,
      urlCitationCount: 0,
      toolDeclarationTransmitted: requestBody.tools?.some((tool) => tool?.type === "google_search") === true,
    });
    finishAttempt("failed", response.status);
    error.providerAttempt = providerAttempt;
    throw error;
  }
  const completed = {
    ...result,
    providerRequestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
    requestContract: sanitizeGoogleGroundedRequest(endpoint, requestInit),
    providerAttempt,
  };
  Object.assign(providerAttempt, {
    queryCount: result.queries.length,
    citationCount: result.citationCount,
    groundingMetadataPresent: result.groundingMetadataPresent,
    googleSearchCallCount: result.googleSearchCallCount,
    googleSearchResultCount: result.googleSearchResultCount,
    urlCitationCount: result.urlCitationCount,
    toolDeclarationTransmitted: requestBody.tools?.some((tool) => tool?.type === "google_search") === true,
  });
  if (!requireGrounding) {
    finishAttempt("completed", response.status);
    return completed;
  }
  try {
    const grounded = assertGoogleGroundedPreflightResult(completed);
    finishAttempt("completed", response.status);
    return grounded;
  } catch (error) {
    Object.assign(providerAttempt, error?.providerAttempt ?? {});
    finishAttempt("failed", response.status);
    error.providerAttempt = providerAttempt;
    throw error;
  }
}