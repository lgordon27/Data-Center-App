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

function sourceFromUrlCitation(annotation, queries) {
  const url = safeCandidateUrl(annotation?.url);
  if (!url) return null;
  return {
    url,
    canonicalUrl: url,
    title: normalizeText(annotation?.title, 240) || "Google-grounded public source",
    publisher: null,
    date: null,
    excerpt: "",
    claimPassage: null,
    claimCited: false,
    sourceChannel: "google-grounded-search",
    origin: "google-grounded-search",
    discoveryOnly: true,
    exactProject: false,
    referringQueries: [...new Set(queries)].slice(0, 12),
    ...categoryIdsForCitation(annotation),
    relevanceNote: "Google grounding discovered this URL; generated summaries and snippets are not evidence.",
  };
}

export function buildGoogleGroundedDiscoveryPrompt(project) {
  const name = normalizeText(project?.name, 240) || "the submitted project";
  const location = normalizeText(project?.location, 240) || "the stated project location";
  const operator = normalizeText(project?.knownData?.operator ?? project?.operator, 200) || "the stated operator";
  return [
    `Discover public sources for ${name} in ${location}, associated with ${operator}.`,
    "You must call Google Search before answering; do not answer from memory.",
    "Use one bounded Google Search grounding request and return only discovery metadata.",
    `Cover these discovery areas in the query plan: ${DISCOVERY_CATEGORIES.join(", ")}.`,
    "Do not use generated JSON, prose, snippets, or model-selected URLs as provenance. The application accepts only executed google_search_call queries and provider url_citation annotations in the Interactions response.",
    "The response may contain explanatory text, but it must not be used to manufacture queries or citations. Never invent a URL.",
    "Prefer first-party company/developer disclosures, government and regulator records, permits, utility records, court or public-agenda records, and reputable project-specific reporting.",
  ].join("\n");
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
  const seen = new Set();
  const annotationDiagnostics = annotations.map((annotation) => {
    const rawUrl = typeof annotation?.url === "string" ? annotation.url.trim() : "";
    const url = safeCandidateUrl(rawUrl);
    const canonicalUrl = url ? canonicalizeSourceUrl(url) : null;
    const duplicate = Boolean(canonicalUrl && seen.has(canonicalUrl));
    if (canonicalUrl) seen.add(canonicalUrl);
    return {
      type: "url_citation",
      title: normalizeText(annotation?.title, 240) || null,
      url: rawUrl || null,
      canonicalUrl,
      accepted: Boolean(url && !duplicate),
      rejectionReason: !rawUrl ? "missing-url" : !url ? "unsafe-or-invalid-url" : duplicate ? "duplicate-canonical-url" : null,
    };
  });
  for (const [index, annotation] of annotations.entries()) {
    const source = sourceFromUrlCitation(annotation, queries);
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
      .map((annotation) => ({ url: annotation.url, reason: annotation.rejectionReason })),
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
  let response;
  try {
    response = await fetchImpl(endpoint, requestInit);
  } catch (cause) {
    const error = new Error("Google Gemini grounding request failed.");
    error.name = cause?.name === "AbortError" ? "GoogleDiscoveryTimeoutError" : "GoogleDiscoveryProviderError";
    error.researchErrorType = cause?.name === "AbortError" ? "google-timeout" : "google-provider-failure";
    error.providerDiagnostic = { status: null, reason: normalizeText(cause?.message, 180) || "network-failure" };
    throw error;
  }
  const raw = await response.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    const error = new Error("Google Gemini grounding returned malformed JSON.");
    error.name = "GoogleDiscoveryParseError";
    error.researchErrorType = "google-malformed-response";
    error.providerDiagnostic = { status: response.status, reason: "invalid-json" };
    throw error;
  }
  if (!response.ok) {
    const error = new Error("Google Gemini grounding returned an upstream failure.");
    error.name = "GoogleDiscoveryProviderError";
    const providerStatus = normalizeText(body?.error?.status, 120).toUpperCase();
    const providerMessage = normalizeText(body?.error?.message, 180);
    const modelUnavailable = response.status === 404
      && (providerStatus === "NOT_FOUND" || /model|not available|not found/i.test(providerMessage));
    error.researchErrorType = modelUnavailable
      ? "google-model-unavailable"
      : response.status === 429
        ? "google-quota-failure"
        : "google-provider-failure";
    error.providerDiagnostic = {
      status: response.status,
      reason: providerStatus || providerMessage || "upstream-failure",
    };
    error.providerAttempt = {
      provider: "google-gemini-grounding",
      model,
      requestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
      status: response.status,
      outcome: "failed",
      queryCount: 0,
      citationCount: 0,
      groundingMetadataPresent: false,
      googleSearchCallCount: 0,
      googleSearchResultCount: 0,
      urlCitationCount: 0,
      toolDeclarationTransmitted: requestBody.tools?.some((tool) => tool?.type === "google_search") === true,
    };
    throw error;
  }
  let result;
  try {
    result = { ...parseGoogleGroundedDiscoveryResponse(body), model };
  } catch (error) {
    if (error?.providerDiagnostic) error.providerDiagnostic.status = response.status;
    error.providerAttempt = {
      provider: "google-gemini-grounding",
      model,
      requestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
      status: response.status,
      outcome: "failed",
      queryCount: 0,
      citationCount: 0,
      groundingMetadataPresent: false,
      googleSearchCallCount: 0,
      googleSearchResultCount: 0,
      urlCitationCount: 0,
      toolDeclarationTransmitted: requestBody.tools?.some((tool) => tool?.type === "google_search") === true,
    };
    throw error;
  }
  const completed = {
    ...result,
    providerRequestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
    requestContract: sanitizeGoogleGroundedRequest(endpoint, requestInit),
    providerAttempt: {
      provider: "google-gemini-grounding",
      model,
      requestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
      status: response.status,
      outcome: "completed",
      queryCount: result.queries.length,
      citationCount: result.citationCount,
      groundingMetadataPresent: result.groundingMetadataPresent,
      googleSearchCallCount: result.googleSearchCallCount,
      googleSearchResultCount: result.googleSearchResultCount,
      urlCitationCount: result.urlCitationCount,
      toolDeclarationTransmitted: requestBody.tools?.some((tool) => tool?.type === "google_search") === true,
    },
  };
  return requireGrounding ? assertGoogleGroundedPreflightResult(completed) : completed;
}