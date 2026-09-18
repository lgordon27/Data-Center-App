import { canonicalizeSourceUrl } from "../src/data/sourceValidationPolicy.mjs";

export const GOOGLE_GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
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
  "Use Google Search before answering; do not answer from memory.",
  "As of September 18, 2026, find the current official DataBank page that identifies its Dallas-area DFW data center or campus.",
  "Return the official page URL and a short identification only. The application will trust only Google grounding metadata, not your prose.",
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

function parseJsonText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function responseText(body) {
  return (body?.candidates ?? [])
    .flatMap((candidate) => candidate?.content?.parts ?? [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n");
}

function groundingChunks(body) {
  return (body?.candidates ?? []).flatMap((candidate) =>
    Array.isArray(candidate?.groundingMetadata?.groundingChunks)
      ? candidate.groundingMetadata.groundingChunks
      : [],
  );
}

function groundingMetadata(body) {
  return (body?.candidates ?? [])
    .map((candidate) => candidate?.groundingMetadata)
    .filter((metadata) => metadata && typeof metadata === "object");
}

function groundingQueries(body) {
  const metadataQueries = groundingMetadata(body).flatMap((metadata) =>
    Array.isArray(metadata?.webSearchQueries)
      ? metadata.webSearchQueries
      : [],
  );
  return [...new Set(metadataQueries
    .map((query) => normalizeText(query, 500))
    .filter(Boolean))].slice(0, 24);
}

function declaredCitations(parsed) {
  return Array.isArray(parsed?.citations) ? parsed.citations : [];
}

function categoryIdsForCitation(citation) {
  const values = Array.isArray(citation?.categoryIds)
    ? citation.categoryIds
    : Array.isArray(citation?.categories)
      ? citation.categories
      : [];
  const normalized = values
    .map((value) => normalizeText(value, 80).toLowerCase().replaceAll("_", "-"))
    .filter((value) => value && (DISCOVERY_CATEGORIES.includes(value) || value === "facility"));
  return normalized.length ? [...new Set(normalized)] : [...DISCOVERY_CATEGORIES];
}

function sourceFromCandidate(candidate, queries, declared = null) {
  const web = candidate?.web ?? candidate;
  const url = safeCandidateUrl(web?.uri ?? web?.url ?? declared?.url);
  if (!url) return null;
  const referringQueries = Array.isArray(declared?.queries)
    ? declared.queries.map((query) => normalizeText(query, 500)).filter(Boolean)
    : queries;
  return {
    url,
    canonicalUrl: url,
    title: normalizeText(web?.title ?? declared?.title, 240) || "Google-grounded public source",
    publisher: normalizeText(declared?.publisher ?? web?.domain, 160) || null,
    date: normalizeText(declared?.publishedAt ?? declared?.date, 40) || null,
    excerpt: "",
    claimPassage: null,
    claimCited: false,
    sourceChannel: "google-grounded-search",
    origin: "google-grounded-search",
    discoveryOnly: true,
    exactProject: false,
    referringQueries: [...new Set(referringQueries)].slice(0, 12),
    categoryIds: categoryIdsForCitation(declared),
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
    "The response must be JSON with this shape: {\"queries\":[string],\"citations\":[{\"url\":string,\"title\":string,\"publisher\":string|null,\"publishedAt\":string|null,\"categoryIds\":string[],\"queries\":string[]}]}.",
    "Citations must be URLs returned by Google grounding. Never invent a URL. Do not treat snippets, generated summaries, or your own prose as evidence.",
    "Prefer first-party company/developer disclosures, government and regulator records, permits, utility records, court or public-agenda records, and reputable project-specific reporting.",
  ].join("\n");
}

export function buildGoogleGroundedDiscoveryRequestBody(project, {
  prompt = buildGoogleGroundedDiscoveryPrompt(project),
  maxOutputTokens,
} = {}) {
  return {
    contents: [{
      role: "user",
      parts: [{ text: prompt }],
    }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0,
      ...(Number.isInteger(maxOutputTokens) && maxOutputTokens > 0 ? { maxOutputTokens } : {}),
    },
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
    body,
  };
}

export function parseGoogleGroundedDiscoveryResponse(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("Google grounding returned a non-object response.");
    error.name = "GoogleDiscoveryParseError";
    throw error;
  }
  const parsed = parseJsonText(responseText(body)) ?? {};
  const queries = groundingQueries(body);
  const declared = declaredCitations(parsed);
  const sources = [];
  const seen = new Set();
  for (const chunk of groundingChunks(body)) {
    const source = sourceFromCandidate(chunk, queries);
    if (source && !seen.has(source.canonicalUrl)) {
      seen.add(source.canonicalUrl);
      sources.push(source);
    }
  }
  for (const citation of declared) {
    const source = sourceFromCandidate(citation, queries, citation);
    if (source && seen.has(source.canonicalUrl)) {
      const existing = sources.find((candidate) => candidate.canonicalUrl === source.canonicalUrl);
      if (existing) {
        existing.title = existing.title === "Google-grounded public source" ? source.title : existing.title;
        existing.publisher ??= source.publisher;
        existing.date ??= source.date;
        existing.categoryIds = [...new Set([...existing.categoryIds, ...source.categoryIds])];
        existing.referringQueries = [...new Set([...existing.referringQueries, ...source.referringQueries])].slice(0, 12);
      }
    }
  }
  return {
    status: "completed",
    provider: "google-gemini-grounding",
    model: GOOGLE_GEMINI_MODEL,
    queries,
    candidates: sources.slice(0, GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES),
    generatedSummaryIgnored: true,
    groundingMetadataPresent: groundingMetadata(body).length > 0,
    groundingSearchExecuted: queries.length > 0,
    usableCitationMetadataPresent: sources.length > 0,
    citationCount: sources.length,
  };
}

export function assertGoogleGroundedPreflightResult(result) {
  const reason = !result?.groundingMetadataPresent
    ? "missing-grounding-metadata"
    : !result?.groundingSearchExecuted
      ? "missing-executed-query-metadata"
      : !result?.usableCitationMetadataPresent || !Array.isArray(result?.candidates) || result.candidates.length === 0
        ? "missing-usable-citation-metadata"
        : null;
  if (!reason) return result;
  const error = new Error("Google Gemini returned HTTP success without proving a usable Google Search grounding call.");
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
  maxOutputTokens,
  requireGrounding = false,
} = {}) {
  if (!apiKey) {
    const error = new Error("Google Gemini grounding is not configured.");
    error.name = "GoogleDiscoveryConfigurationError";
    error.researchErrorType = "google-not-configured";
    throw error;
  }
  const endpoint = `${GOOGLE_GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
  const requestBody = buildGoogleGroundedDiscoveryRequestBody(project, { prompt, maxOutputTokens });
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
      toolDeclarationTransmitted: requestBody.tools?.[0]?.google_search != null,
    };
    throw error;
  }
  const result = {
    ...parseGoogleGroundedDiscoveryResponse(body),
    model,
  };
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
      toolDeclarationTransmitted: requestBody.tools?.[0]?.google_search != null,
    },
  };
  return requireGrounding ? assertGoogleGroundedPreflightResult(completed) : completed;
}