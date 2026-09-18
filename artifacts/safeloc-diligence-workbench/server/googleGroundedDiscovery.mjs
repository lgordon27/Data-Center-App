import { canonicalizeSourceUrl } from "../src/data/sourceValidationPolicy.mjs";

export const GOOGLE_GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const GOOGLE_GEMINI_MODEL = "gemini-2.5-flash";
export const GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT = 1;
export const GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES = 80;

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

function groundingQueries(body, parsed) {
  const metadataQueries = (body?.candidates ?? []).flatMap((candidate) =>
    Array.isArray(candidate?.groundingMetadata?.webSearchQueries)
      ? candidate.groundingMetadata.webSearchQueries
      : [],
  );
  const declaredQueries = Array.isArray(parsed?.queries) ? parsed.queries : [];
  return [...new Set([...metadataQueries, ...declaredQueries]
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
    "Use one bounded Google Search grounding request and return only discovery metadata.",
    `Cover these discovery areas in the query plan: ${DISCOVERY_CATEGORIES.join(", ")}.`,
    "The response must be JSON with this shape: {\"queries\":[string],\"citations\":[{\"url\":string,\"title\":string,\"publisher\":string|null,\"publishedAt\":string|null,\"categoryIds\":string[],\"queries\":string[]}]}.",
    "Citations must be URLs returned by Google grounding. Never invent a URL. Do not treat snippets, generated summaries, or your own prose as evidence.",
    "Prefer first-party company/developer disclosures, government and regulator records, permits, utility records, court or public-agenda records, and reputable project-specific reporting.",
  ].join("\n");
}

export function buildGoogleGroundedDiscoveryRequestBody(project, { model = GOOGLE_GEMINI_MODEL } = {}) {
  return {
    contents: [{
      role: "user",
      parts: [{ text: buildGoogleGroundedDiscoveryPrompt(project) }],
    }],
    tools: [{ google_search: {} }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  };
}

export function parseGoogleGroundedDiscoveryResponse(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("Google grounding returned a non-object response.");
    error.name = "GoogleDiscoveryParseError";
    throw error;
  }
  const parsed = parseJsonText(responseText(body)) ?? {};
  const queries = groundingQueries(body, parsed);
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
    if (source && !seen.has(source.canonicalUrl)) {
      seen.add(source.canonicalUrl);
      sources.push(source);
    } else if (source) {
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
    groundingMetadataPresent: groundingChunks(body).length > 0,
    citationCount: sources.length,
  };
}

export async function discoverGoogleGroundedProject({
  project,
  apiKey,
  fetchImpl = fetch,
  signal,
  model = GOOGLE_GEMINI_MODEL,
} = {}) {
  if (!apiKey) {
    const error = new Error("Google Gemini grounding is not configured.");
    error.name = "GoogleDiscoveryConfigurationError";
    error.researchErrorType = "google-not-configured";
    throw error;
  }
  const endpoint = `${GOOGLE_GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildGoogleGroundedDiscoveryRequestBody(project, { model })),
      signal,
    });
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
    error.researchErrorType = response.status === 429 ? "google-quota-failure" : "google-provider-failure";
    error.providerDiagnostic = {
      status: response.status,
      reason: normalizeText(body?.error?.status ?? body?.error?.message, 180) || "upstream-failure",
    };
    throw error;
  }
  const result = parseGoogleGroundedDiscoveryResponse(body);
  return {
    ...result,
    model,
    providerRequestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
    providerAttempt: {
      provider: "google-gemini-grounding",
      model,
      requestCount: GOOGLE_GROUNDED_DISCOVERY_REQUEST_LIMIT,
      status: response.status,
      outcome: "completed",
      queryCount: result.queries.length,
      citationCount: result.citationCount,
    },
  };
}