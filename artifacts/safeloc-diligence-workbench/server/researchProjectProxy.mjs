import { defaultResearchProjectCache } from "./researchProjectCache.mjs";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const RESEARCH_PROJECT_MODEL = "gpt-4o";
const RESEARCH_PROJECT_MAX_TOKENS = 4_000;
const RESEARCH_PROJECT_TIMEOUT_MS = 90_000;
const RESEARCH_PROJECT_MAX_TOOL_CALLS = 32;
const DEFAULT_RESEARCH_CAPACITY_MW = 1_200;
const MAX_RESEARCH_CAPACITY_MW = 10_000;
const RESEARCH_PROJECT_REQUEST_LIMIT = 10;
const RESEARCH_PROJECT_REQUEST_WINDOW_MS = 60_000;
const RESEARCH_PROJECT_RATE_LIMIT_MESSAGE =
  "Custom research request limit reached. Please wait before trying again or use the curated case.";

const RESEARCH_EVIDENCE_IDS = [
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
  "water_escalation",
  "community_risk",
  "renewable_percentage",
  "cooling_capex",
  "electricity_escalation",
  "carbon_compliance",
  "permitting_timeline",
  "customer_concentration",
  "water_rights",
  "site_hazard_exposure",
  "backup_power_capacity",
  "water_source_resilience",
  "downtime_cost",
];

const VALID_CLASSIFICATIONS = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

const RESEARCH_EVIDENCE_RECORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string", minLength: 1 },
    value: { anyOf: [{ type: "number" }, { type: "string", minLength: 1 }] },
    unit: { type: "string", minLength: 1 },
    classification: { type: "string", enum: VALID_CLASSIFICATIONS },
    citation: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    sourceRole: { type: "string", minLength: 1 },
    sourceUrl: { anyOf: [{ type: "string" }, { type: "null" }] },
    sourceUrls: { type: "array", items: { type: "string" }, maxItems: 4 },
    conflictSummary: { anyOf: [{ type: "string" }, { type: "null" }] },
    coverageStatus: { type: "string", enum: ["supported", "searched-no-support", "partial", "conflicting"] },
    numericValue: { anyOf: [{ type: "number" }, { type: "null" }] },
    modelReportedConfidence: { anyOf: [{ type: "number", minimum: 0, maximum: 100 }, { type: "null" }] },
    sourceSupportConfidence: { type: "number", minimum: 0, maximum: 100 },
    classificationReason: { type: "string", minLength: 1 },
    sourceRelevanceNote: { type: "string", minLength: 1 },
    sourceRelevance: { type: "string", enum: ["exact-project", "related-context", "unresolved"] },
    searchTerms: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
    qualitativeValue: {
      anyOf: [
        { type: "string", enum: ["low", "moderate", "high", "single-source", "diversified"] },
        { type: "null" },
      ],
    },
  },
  required: [
    "label",
    "value",
    "unit",
    "classification",
    "citation",
    "description",
    "sourceRole",
    "sourceUrl",
    "sourceUrls",
    "conflictSummary",
    "coverageStatus",
    "numericValue",
    "modelReportedConfidence",
    "sourceSupportConfidence",
    "classificationReason",
    "sourceRelevanceNote",
    "sourceRelevance",
    "searchTerms",
    "qualitativeValue",
  ],
};

const RESEARCH_PROJECT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectSummary: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1 },
        location: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        capacityMW: { anyOf: [{ type: "number" }, { type: "null" }] },
        capacityProvenance: { type: "string", enum: ["ai-reported", "directory-reported", "standardized-default"] },
      },
      required: ["name", "location", "description", "capacityMW", "capacityProvenance"],
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        RESEARCH_EVIDENCE_IDS.map((id) => [id, RESEARCH_EVIDENCE_RECORD_SCHEMA]),
      ),
      required: RESEARCH_EVIDENCE_IDS,
    },
  },
  required: ["projectSummary", "evidence"],
};

const RESEARCH_PROJECT_SYSTEM_PROMPT = `You are a careful infrastructure diligence researcher. Research the named data-center project and location using current, attributable public sources. Separate facility-level evidence from market, regional, or industry context. If you find public reporting confirming a data point, classify it as Management Assertion when it comes from company sources, or Verified Evidence when it comes from independent regulatory filings, government data, or independent reporting. Only classify as Missing Evidence if you genuinely cannot find any public information about that variable. Do not default to Missing Evidence as a conservative choice. Independent public records or reporting are Verified Evidence; dated company announcements, filings, or disclosures with limited independent confirmation are Management Assertion; analyst-derived estimates from related facts are Model Inference; synthetic analyst-selected values are User Assumption; and a fact not established in the searched public record is Missing Evidence.

SafeLoc models exactly 16 evidence variables: electricity_cost, water_consumption, grid_interconnection, water_escalation, community_risk, renewable_percentage, cooling_capex, electricity_escalation, carbon_compliance, permitting_timeline, customer_concentration, water_rights, site_hazard_exposure, backup_power_capacity, water_source_resilience, and downtime_cost. The evidence object is keyed by those exact identifiers. Complete every key exactly once.

The projectSummary.description must explicitly report relevant findings, when available, about electrical-equipment procurement and lead times, jurisdictional bans or moratoriums, noise ordinances and operational impacts, local electricity-rate concerns, and semiconductor and memory supply-chain constraints. It must also identify speculative or phantom grid-load requests when that context is relevant. These are contextual research areas, not additional modeled evidence inputs: do not add them to the evidence array, assign them evidence classifications, or imply that market-wide statistics prove facility-level facts.

ERCOT BATCH ZERO UPDATE (August 2026): ERCOT's Batch Zero large-load interconnection studies, covering 200 GW across 300 applicants, have been delayed from the original September 2026 start to January 2027 at earliest. The study was expected to complete by April 2027; the revised completion date is unclear. ERCOT staff testified this delay may cause some applicants to drop out due to financing constraints. Separately, 17 facilities totaling 6.6 GW that already completed studies are stuck in Governor Abbott's verification audit and cannot energize. Any Texas data center project requiring ERCOT grid interconnection is affected. Only behind-the-meter projects exempt from the ERCOT queue are unaffected. When classifying Grid Interconnection for any Texas project, a grid-dependent project should not receive Verified Evidence for interconnection timeline because no grid-dependent project currently has a confirmed interconnection date. Treat this as August 2026 market and grid-process context, not proof of a named facility's interconnection status; research exact-project evidence separately.

Respond with one JSON object matching the supplied schema. projectSummary must contain name, location, description, and capacityMW. Every evidence record must contain label, value, unit, classification, citation, sourceRole, sourceUrl, sourceUrls, conflictSummary, coverageStatus, numericValue, modelReportedConfidence, sourceSupportConfidence, classificationReason, sourceRelevance, sourceRelevanceNote, searchTerms, and qualitativeValue. modelReportedConfidence is your optional per-variable confidence from 0 to 100; return null when unavailable. It is not source validation and must never be copied from or substituted for sourceSupportConfidence. sourceSupportConfidence is only a schema placeholder; the server ignores it and computes deterministic support confidence from validated sources. sourceUrl is the strongest direct source, and sourceUrls contains up to four direct supporting, corroborating, or conflicting packet URLs. Use null for sourceUrl, conflictSummary, numericValue, modelReportedConfidence, or qualitativeValue and [] for sourceUrls or searchTerms when unavailable. Identify conflicting sources explicitly rather than silently choosing one. When a cited source in the retrieved packet directly supports the finding, return that source's exact URL; never invent or return a URL that is not in the packet. The server will attach validated source metadata. A source URL is a research aid only and never facility-level proof by itself. Use sourceRelevance exact-project only when the source names or otherwise identifies this facility; use related-context for regional or industry context, and unresolved when no source is mapped. sourceRelevanceNote must explain why each matched source is relevant to this claim. classificationReason must concisely explain the provenance classification. Include only queries actually used for this specific variable in its searchTerms; never copy global or other-variable queries to every item. The server separately records global tool-observed telemetry. Do not infer numeric zero or categorical none from silence: zero/none is valid only when an exact-project source explicitly establishes it under the variable definition. For grid_interconnection, numericValue is months of delay; for renewable_percentage it is the facility's delivered or contractually procured renewable share. A gas-generation or fuel-supply source does not establish the facility's electricity price. A source naming a water source does not establish water consumption or water rights. A PPA or named offtaker does not establish a customer-concentration number unless the source explicitly quantifies the relevant facility-level share. qualitativeValue may only be low, moderate, high, single-source, or diversified. Use concise plain language. Do not include markdown or commentary.`;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function cacheMetadata(key, entry, state, refreshStatus = "idle", extras = {}) {
  return {
    key,
    state,
    storedAt: entry?.storedAt ?? null,
    refreshStatus,
    providerAvailable: extras.providerAvailable ?? true,
    ...(extras.errorType ? { errorType: extras.errorType } : {}),
  };
}

function withCacheMetadata(entry, metadata) {
  return { ...entry.result, researchCache: metadata };
}

const WEB_SEARCH_SOURCE_BOUNDARY_PROMPT = `
Use the built-in web-search tool during this response. Perform all searches and synthesis inside this one response; do not request a follow-up provider call. Never invent a source, URL, date, excerpt, or facility-level fact. Put the exact public URLs returned by web search into sourceUrl and sourceUrls. Verified Evidence requires an exact-project government, regulator, utility, filed-company, or independent-reporting source returned by this web search; a company announcement is normally Management Assertion. If no searched source independently confirms a claim, do not classify it as Verified Evidence. You may use well-established model knowledge only at a Management Assertion ceiling and must say it requires independent verification. If projectSummary states an exact-project fact such as a named customer or offtaker, behind-the-meter power, disclosed capacity, or a stated water source, map the same fact into the relevant evidence variable at the appropriate classification rather than calling that variable Missing Evidence. Do not classify contextual market or industry reporting as facility-level Verified Evidence. There is no finding quota: after bounded searches, leave a variable explicitly unresolved rather than inventing a result. Do not use modelReportedConfidence or sourceSupportConfidence to promote a finding: the server recomputes sourceSupportConfidence from validated sources, independence, and conflicts.`;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value, field, maxLength = 4_000) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Research field "${field}" must be a non-empty string.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new Error(`Research field "${field}" is too long.`);
  }
  return result;
}

function stringOrFallback(value, fallback, maxLength = 4_000) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLength);
}

function isExplicitUnknownValue(value) {
  if (typeof value !== "string") return false;
  return /^(unknown|not disclosed|not publicly available|not available|unavailable|undisclosed|no data|no public data|not established|n\/a|na)$/i.test(
    value.trim().replace(/[.!]+$/, ""),
  );
}

function safePublicSourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function parseResearchProjectBody(body) {
  if (!isRecord(body)) throw new Error("Research project body must be a JSON object.");
  const name = body.name ?? body.projectName;
  let knownData;
  if (body.knownData !== undefined) {
    if (!isRecord(body.knownData)) throw new Error('Research field "knownData" must be an object.');
    const capacity = normalizeReportedCapacityMW(body.knownData.capacity);
    const operator = typeof body.knownData.operator === "string" && body.knownData.operator.trim()
      ? body.knownData.operator.trim().slice(0, 160)
      : null;
    const status = typeof body.knownData.status === "string" && body.knownData.status.trim()
      ? body.knownData.status.trim().slice(0, 80)
      : null;
    const sourceUrl = safePublicSourceUrl(body.knownData.sourceUrl);
    const normalized = {
      ...(capacity === null ? {} : { capacity }),
      ...(operator ? { operator } : {}),
      ...(status ? { status } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
    if (Object.keys(normalized).length) knownData = normalized;
  }
  let focusIds;
  if (body.focusIds !== undefined) {
    if (!Array.isArray(body.focusIds) || body.focusIds.length > RESEARCH_EVIDENCE_IDS.length) {
      throw new Error('Research field "focusIds" must be an array of modeled evidence identifiers.');
    }
    focusIds = [...new Set(body.focusIds.map((id) => nonEmptyString(id, "focusIds", 80)))];
    if (focusIds.some((id) => !RESEARCH_EVIDENCE_IDS.includes(id))) {
      throw new Error('Research field "focusIds" contains an unknown evidence identifier.');
    }
  }
  let currentEvidence;
  if (body.currentEvidence !== undefined) {
    if (!Array.isArray(body.currentEvidence) || body.currentEvidence.length > RESEARCH_EVIDENCE_IDS.length) {
      throw new Error('Research field "currentEvidence" must be an evidence record array.');
    }
    currentEvidence = body.currentEvidence
      .filter(isRecord)
      .map((item) => ({
        id: typeof item.id === "string" ? item.id.trim() : "",
        label: typeof item.label === "string" ? item.label.trim().slice(0, 160) : "",
        value: typeof item.value === "string" || typeof item.value === "number" ? String(item.value).slice(0, 500) : "",
        classification: typeof item.classification === "string" ? item.classification.trim().slice(0, 60) : "",
        citation: typeof item.citation === "string" ? item.citation.trim().slice(0, 1_000) : "",
      }))
      .filter((item) => RESEARCH_EVIDENCE_IDS.includes(item.id) && item.label && item.value);
  }
  return {
    name: nonEmptyString(name, "name", 160),
    location: nonEmptyString(body.location, "location", 160),
    ...(knownData ? { knownData } : {}),
    ...(focusIds ? { focusIds } : {}),
    ...(currentEvidence ? { currentEvidence } : {}),
    ...(body.forceRefresh === true ? { forceRefresh: true } : {}),
  };
}

function normalizeReportedCapacityMW(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_RESEARCH_CAPACITY_MW
    ? value
    : null;
}

function normalizeCapacityMW(value) {
  return normalizeReportedCapacityMW(value) ?? DEFAULT_RESEARCH_CAPACITY_MW;
}

function normalizeSearchTerms(value, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((term) => typeof term === "string" && term.trim())
    .map((term) => term.trim().replace(/\s+/g, " ").slice(0, 240)))]
    .slice(0, maxItems);
}

const RESEARCH_QUERY_ANGLES = {
  electricity_cost: ["utility tariff electricity rate power price $/MWh", "filed energy contract electricity cost"],
  water_consumption: ["water demand consumption gallons usage", "water utility demand projection withdrawal volume"],
  grid_interconnection: ["grid interconnection queue transmission study", "behind-the-meter power grid connection delay"],
  water_escalation: ["water tariff rate increase escalation", "water utility rate case forecast"],
  community_risk: ["public hearing opposition complaints community", "noise ordinance moratorium local meeting"],
  renewable_percentage: ["renewable electricity percentage procurement", "PPA renewable share energy mix"],
  cooling_capex: ["cooling system capital cost capex", "cooling equipment procurement construction budget"],
  electricity_escalation: ["electricity tariff escalation rate case", "power price forecast utility increase"],
  carbon_compliance: ["emissions air permit carbon compliance", "generator emissions regulation environmental filing"],
  permitting_timeline: ["permit application approval construction timeline", "planning zoning land-use hearing schedule"],
  customer_concentration: ["customer concentration revenue load share percentage", "tenant offtaker capacity allocation percentage"],
  water_rights: ["water right permit entitlement allocation", "groundwater withdrawal authorization district permit"],
  site_hazard_exposure: ["flood wildfire seismic hazard exact site", "FEMA environmental hazard parcel"],
  backup_power_capacity: ["backup generator capacity MW permit", "emergency generation redundancy capacity"],
  water_source_resilience: ["water source redundancy drought resilience", "alternate supply recycled groundwater source"],
  downtime_cost: ["downtime cost outage loss facility", "SLA outage penalty business interruption"],
};

function extractObservedQueriesByEvidence(body, project) {
  if (!project) return {};
  const observedQueries = extractSearchTerms(body);
  const normalizedObserved = new Map(observedQueries.map((query) => [query.toLowerCase(), query]));
  return Object.fromEntries(RESEARCH_EVIDENCE_IDS.flatMap((id) => {
    const matched = buildVariableQueries(project, id)
      .map((query) => normalizedObserved.get(query.toLowerCase()))
      .filter(Boolean);
    return matched.length ? [[id, normalizeSearchTerms(matched)]] : [];
  }));
}

function normalizeModelReportedConfidence(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : null;
}

function extractSearchTerms(body) {
  const terms = [];
  for (const output of Array.isArray(body?.output) ? body.output : []) {
    if (output?.type !== "web_search_call") continue;
    const action = output.action;
    for (const candidate of [
      action?.query,
      action?.search_query,
      ...(Array.isArray(action?.queries) ? action.queries : []),
    ]) {
      if (typeof candidate === "string") terms.push(candidate);
      else if (isRecord(candidate) && typeof candidate.query === "string") terms.push(candidate.query);
    }
  }
  return normalizeSearchTerms(terms, RESEARCH_PROJECT_MAX_TOOL_CALLS);
}

function countWebSearchCalls(body) {
  return (Array.isArray(body?.output) ? body.output : [])
    .filter((output) => output?.type === "web_search_call")
    .length;
}

function sourceIdentityTokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["the", "and", "for", "project", "data", "center"].includes(token));
}

function isExactProjectSource(source, summary, itemRelevance) {
  if (source?.exactProject === true) return true;
  if (source?.exactProject === false) return false;
  const sourceTokens = new Set(sourceIdentityTokens(`${source?.title ?? ""} ${source?.excerpt ?? ""} ${source?.url ?? ""}`));
  const nameTokens = sourceIdentityTokens(summary?.name);
  const locationTokens = sourceIdentityTokens(summary?.location);
  const nameMatches = nameTokens.length > 0 && nameTokens.every((token) => sourceTokens.has(token));
  return nameMatches;
}

function calculateSourceSupportConfidence({
  classification,
  sources = [],
  coverageStatus,
  conflictSummary,
}) {
  if (classification === "Missing Evidence" || !Array.isArray(sources) || sources.length === 0) return 0;
  const nonConflicting = sources.filter((source) => source.relationship !== "conflicting");
  const exactSources = nonConflicting.filter((source) => source.exactProject);
  const strongSources = exactSources.filter((source) =>
    ["primary-government", "primary-utility", "primary-company"].includes(source.sourceClass),
  );
  const independentPublishers = new Set(strongSources.map((source) => {
    try {
      return new URL(source.url).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return source.publisher;
    }
  }));
  let confidence = strongSources.length
    ? independentPublishers.size >= 2 ? 94 : 82
    : exactSources.length ? 62 : 38;
  if (coverageStatus === "conflicting" || conflictSummary) confidence = Math.min(confidence, 59);
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function defaultClassificationReason(classification, supportedByRetrievedSource, sourceSupportConfidence) {
  if (classification === "Missing Evidence") {
    return "No validated claim-specific public source established this facility-level item.";
  }
  if (!supportedByRetrievedSource) {
    return `${classification} retained conservatively because no retrieved source matched the claim; independent verification is required.`;
  }
  if (sourceSupportConfidence >= 90) {
    return `${classification} is supported by multiple independent exact-project public sources.`;
  }
  if (sourceSupportConfidence >= 70) {
    return `${classification} is supported by one strong exact-project public source; corroboration would strengthen it.`;
  }
  return `${classification} has a validated link, but the retrieved packet provides limited exact-project support.`;
}

const MODEL_UNIT_RULES = {
  electricity_cost: /^\s*(?:\$|usd)\s*\/\s*mwh\s*$/i,
  water_consumption: /^\s*(?:m\s*gal\s*\/\s*(?:yr|year)|mgal\s*\/\s*(?:yr|year))\s*$/i,
  grid_interconnection: /^\s*months?\s*$/i,
  permitting_timeline: /^\s*months?\s*$/i,
  water_escalation: /^\s*%(?:\s*(?:annual|year))?\s*$/i,
  electricity_escalation: /^\s*%(?:\s*(?:annual|year))?\s*$/i,
  renewable_percentage: /^\s*%\s*$/i,
  cooling_capex: /^\s*\$?\s*m(?:illion)?\s*$/i,
  carbon_compliance: /^\s*\$?\s*m(?:illion)?\s*\/\s*(?:yr|year)\s*$/i,
  backup_power_capacity: /^\s*(?:hours?|h)\s*$/i,
  downtime_cost: /^\s*(?:\$|usd)\s*(?:\/\s*(?:day|d)|per\s+day)\s*$/i,
};

function containResearchRecord(item) {
  const reasons = [];
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const hasSource = Boolean(item.sourceUrl) || sources.length > 0;
  const exactProject = sources.some((source) => source.exactProject === true);
  const nonReviewer = sources.some((source) => source.sourceClass !== "reviewer-submitted") ||
    (item.sourceUrl && !String(item.sourceRole ?? "").toLowerCase().includes("reviewer-submitted"));
  if (!hasSource) reasons.push("No validated project-specific source was returned.");
  if (!exactProject || !nonReviewer || !["Verified Evidence", "Management Assertion"].includes(item.classification) || (item.sourceSupportConfidence ?? 0) < 60) {
    reasons.push("Source provenance is not eligible for model activation.");
  }
  const rule = MODEL_UNIT_RULES[item.id];
  if (item.numericValue !== undefined && rule && (!item.unit || !rule.test(item.unit))) {
    reasons.push(`Incompatible unit for ${item.id}: ${item.unit}. Raw value retained for review.`);
  }
  if (item.id === "electricity_cost" && /\b(residential|household|homeowner|domestic)\b/i.test(
    [item.value, item.description, item.citation, ...sources.flatMap((source) => [source.title, source.excerpt])].join(" "),
  )) {
    reasons.push("Residential electricity pricing is not eligible as a facility tariff.");
  }
  if (item.coverageStatus === "conflicting" || item.conflictSummary) reasons.push("Conflicting source coverage requires reviewer resolution.");
  if (item.classification === "Model Inference" || item.classification === "User Assumption") {
    reasons.push(`${item.classification} is not source-backed and cannot activate custom economics.`);
  }
  const eligible = reasons.length === 0;
  return {
    ...item,
    rawValue: item.rawValue ?? item.value,
    rawUnit: item.rawUnit ?? item.unit,
    eligibleForModel: eligible,
    acceptedForModel: false,
    researchState: eligible ? "proposed" : hasSource ? "quarantined" : "retrieved-lead",
    quarantineReasons: reasons,
  };
}

export function containResearchResult(result) {
  const evidence = (result.evidence ?? []).map(containResearchRecord);
  const eligibleEvidence = evidence.filter((item) => item.eligibleForModel === true);
  return {
    ...result,
    evidence,
    retrievedLeads: evidence.filter((item) => item.researchState === "retrieved-lead" || item.researchState === "quarantined"),
    eligibleEvidence,
    proposedInputs: eligibleEvidence,
    acceptedModelInputs: [],
    quarantineReasons: [...new Set(evidence.flatMap((item) => item.quarantineReasons ?? []))],
    researchMode: result.researchMode === "default-assumptions"
      ? "default-assumptions"
      : eligibleEvidence.length > 0 ? "ai-researched" : "research-incomplete",
  };
}

function parseResearchResponse(body, retrievedSources = [], accessedAt = new Date().toISOString().slice(0, 10), coverage = null, knownData = null) {
  if (!isRecord(body) || !isRecord(body.projectSummary) || (!Array.isArray(body.evidence) && !isRecord(body.evidence))) {
    throw new Error("Research response must include projectSummary and evidence.");
  }

  const summary = body.projectSummary;
  const reportedCapacityMW = normalizeReportedCapacityMW(summary.capacityMW);
  const summaryFields = {
    name: nonEmptyString(summary.name, "projectSummary.name", 160),
    location: nonEmptyString(summary.location, "projectSummary.location", 160),
    description: nonEmptyString(summary.description, "projectSummary.description", 8_000),
    capacityMW: normalizeReportedCapacityMW(knownData?.capacity) ?? reportedCapacityMW ?? DEFAULT_RESEARCH_CAPACITY_MW,
    capacityProvenance: normalizeReportedCapacityMW(knownData?.capacity) !== null
      ? "directory-reported"
      : reportedCapacityMW === null ? "standardized-default" : "ai-reported",
  };

  const evidenceCandidates = Array.isArray(body.evidence)
    ? body.evidence
    : RESEARCH_EVIDENCE_IDS.map((id) => ({ id, ...body.evidence[id] }));
  if (
    evidenceCandidates.length !== RESEARCH_EVIDENCE_IDS.length ||
    (!Array.isArray(body.evidence) && Object.keys(body.evidence).some((id) => !RESEARCH_EVIDENCE_IDS.includes(id)))
  ) {
    throw new Error("Research response must contain exactly 16 evidence records.");
  }

  const expectedIds = new Set(RESEARCH_EVIDENCE_IDS);
  const sourceByUrl = new Map(
    retrievedSources
      .map((source) => [safePublicSourceUrl(source.url), source])
      .filter(([url]) => Boolean(url)),
  );
  const observedSearchTerms = normalizeSearchTerms(coverage?.searchTerms, RESEARCH_PROJECT_MAX_TOOL_CALLS);
  const seenIds = new Set();
  const evidence = evidenceCandidates.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Research evidence record ${index + 1} is invalid.`);
    const id = nonEmptyString(item.id, `evidence[${index}].id`, 80);
    if (!expectedIds.has(id) || seenIds.has(id)) {
      throw new Error("Research response must contain each modeled evidence identifier exactly once.");
    }
    seenIds.add(id);
    const citation = stringOrFallback(
      item.citation,
      "No supporting retrieved source was returned for this evidence item.",
      2_000,
    );
    const citedUrl = safePublicSourceUrl(
      citation.match(/https?:\/\/[^\s)]+/)?.[0]?.replace(/[.,;]+$/, ""),
    );
    const returnedSourceUrl = safePublicSourceUrl(item.sourceUrl);
    const returnedSourceUrls = Array.isArray(item.sourceUrls)
      ? item.sourceUrls.map(safePublicSourceUrl).filter(Boolean)
      : [];
    const validatedUrls = [...new Set([returnedSourceUrl, citedUrl, ...returnedSourceUrls])]
      .filter((url) => url && sourceByUrl.has(url))
      .sort((a, b) => sourcePriority(sourceByUrl.get(a)?.sourceClass) - sourcePriority(sourceByUrl.get(b)?.sourceClass))
      .slice(0, 4);
    const sourceUrl = validatedUrls[0] ?? null;
    const supportingSources = validatedUrls.map((url) => {
      const metadata = sourceByUrl.get(url);
      const exactProject = isExactProjectSource(metadata, summary, item.sourceRelevance);
      return {
        url,
        title: typeof metadata?.title === "string" && metadata.title.trim() ? metadata.title.trim().slice(0, 500) : "not provided",
        publisher: new URL(url).hostname.replace(/^www\./, ""),
        publishedAt: normalizePublicDate(metadata?.date),
        accessedAt: normalizePublicDate(accessedAt),
        accessStatus: ["open", "paywall", "registration"].includes(metadata?.accessStatus) ? metadata.accessStatus : "not provided",
        excerpt: stringOrFallback(metadata?.excerpt, "No excerpt returned.", 1_000),
        sourceClass: metadata?.sourceClass ?? classifySource(url, metadata?.title),
        searchDomain: metadata?.searchDomain ?? "project-identity",
        exactProject,
        relevanceNote: stringOrFallback(
          metadata?.relevanceNote ?? item.sourceRelevanceNote,
          exactProject
            ? "This retrieved source is mapped to the claim and contains exact-project context."
            : "This retrieved source is mapped to the claim but may provide related context rather than facility-level proof.",
          500,
        ),
        relationship: url === sourceUrl ? "primary" : item.coverageStatus === "conflicting" ? "conflicting" : "corroborating",
      };
    });
    const supportedByRetrievedSource = supportingSources.length > 0;
    const rawClassification = nonEmptyString(item.classification, `evidence[${index}].classification`, 60);
    if (!VALID_CLASSIFICATIONS.includes(rawClassification)) {
      throw new Error(`Research evidence record ${id} has an invalid classification.`);
    }
    const explicitUnknownValue = isExplicitUnknownValue(item.value);
    const classification = supportedByRetrievedSource
      ? rawClassification
      : rawClassification === "Verified Evidence"
        ? "Management Assertion"
        : rawClassification;
    const sourceMismatchNote = !supportedByRetrievedSource && rawClassification === "Verified Evidence"
      ? " AI classification downgraded: cited source not in retrieved search results. Original classification: Verified Evidence."
      : !supportedByRetrievedSource && rawClassification !== "Missing Evidence"
        ? ` Based on AI training knowledge. No retrieved source independently confirmed this claim. Verify before relying on this ${rawClassification} classification.`
        : "";
    const record = {
      id,
      label: stringOrFallback(item.label, id.replaceAll("_", " "), 160),
      value: typeof item.value === "number" && Number.isFinite(item.value)
        ? item.value
        : stringOrFallback(item.value, "Not established", 1_000),
      unit: stringOrFallback(item.unit, "Not disclosed", 100),
      classification,
      citation: supportedByRetrievedSource ? citation : `No validated source match for this claim.${sourceMismatchNote} ${citation}`,
      description: stringOrFallback(item.description, "The searched public record did not establish a facility-level value.", 2_000),
      sourceRole: stringOrFallback(item.sourceRole, "AI-researched public-source review", 200),
      coverageStatus: supportedByRetrievedSource && ["supported", "partial", "conflicting"].includes(item.coverageStatus)
        ? item.coverageStatus
        : supportedByRetrievedSource
          ? "supported"
          : classification === "Missing Evidence" || explicitUnknownValue
            ? "searched-no-support"
            : "partial",
      searchCoverage: Array.isArray(coverage?.searchedByEvidence?.[id])
        ? coverage.searchedByEvidence[id]
        : Array.isArray(coverage?.searchedDomains) ? coverage.searchedDomains : [],
      failedSearchDomains: Array.isArray(coverage?.failedByEvidence?.[id])
        ? coverage.failedByEvidence[id]
        : Array.isArray(coverage?.failedDomains) ? coverage.failedDomains : [],
      searchTerms: normalizeSearchTerms(coverage?.observedQueriesByEvidence?.[id]).length
        ? normalizeSearchTerms(coverage.observedQueriesByEvidence[id])
        : normalizeSearchTerms(item.searchTerms),
      searchTermsSource: normalizeSearchTerms(coverage?.observedQueriesByEvidence?.[id]).length
        ? "tool-observed"
        : normalizeSearchTerms(item.searchTerms).length ? "ai-reported" : "unavailable",
      sourceRelevanceNote: stringOrFallback(
        item.sourceRelevanceNote,
        supportedByRetrievedSource
          ? "The retrieved source is directly mapped to this claim; review the source text before relying on it."
          : "No validated source was mapped to this claim.",
        500,
      ),
    };
    const modelReportedConfidence = normalizeModelReportedConfidence(item.modelReportedConfidence);
    if (modelReportedConfidence !== null) record.modelReportedConfidence = modelReportedConfidence;
    if (sourceUrl) {
      const metadata = supportingSources[0];
      record.sourceUrl = sourceUrl;
      record.sourceTitle = metadata.title;
      record.sourcePublisher = metadata.publisher;
      record.sourcePublishedAt = metadata.publishedAt;
      record.sourceAccessedAt = metadata.accessedAt;
      record.sourceAccessStatus = metadata.accessStatus;
      record.sources = supportingSources;
      const conflictSummary = stringOrFallback(item.conflictSummary, "", 1_000);
      if (record.coverageStatus === "conflicting" && conflictSummary) record.conflictSummary = conflictSummary;
    }
    if (supportedByRetrievedSource && item.numericValue !== undefined && item.numericValue !== null) {
      if (typeof item.numericValue !== "number" || !Number.isFinite(item.numericValue)) {
        throw new Error(`Research evidence record ${id} has an invalid numericValue.`);
      }
      record.numericValue = item.numericValue;
    }
    if (supportedByRetrievedSource && item.qualitativeValue !== undefined && item.qualitativeValue !== null) {
      if (!["low", "moderate", "high", "single-source", "diversified"].includes(item.qualitativeValue)) {
        throw new Error(`Research evidence record ${id} has an invalid qualitativeValue.`);
      }
      record.qualitativeValue = item.qualitativeValue;
    }
    if (explicitUnknownValue) {
      record.value = "Not established";
      record.classification = "Missing Evidence";
      record.citation = `The AI returned an explicitly unavailable value. ${record.citation}`;
      record.description = "The returned value indicates that the public record did not disclose this item.";
      delete record.numericValue;
    } else if (!supportsExplicitZero(id, item, supportingSources)) {
      record.value = "Not established";
      record.classification = "Missing Evidence";
      record.citation = `The supplied sources did not explicitly establish a zero value. ${record.citation}`;
      record.description = "Zero cannot be inferred from a source being silent; an exact-project source must explicitly establish it.";
      delete record.numericValue;
    }
    record.sourceSupportConfidence = calculateSourceSupportConfidence({
      classification: record.classification,
      sources: record.sources ?? [],
      coverageStatus: record.coverageStatus,
      conflictSummary: record.conflictSummary,
    });
    record.sourceRelevance = supportingSources.length
      ? supportingSources.some((source) => source.exactProject) ? "exact-project" : "related-context"
      : "unresolved";
    record.classificationReason = stringOrFallback(
      item.classificationReason,
      defaultClassificationReason(record.classification, supportedByRetrievedSource, record.sourceSupportConfidence),
      500,
    );
    return record;
  });

  const parsedResult = {
    projectSummary: summaryFields,
    researchCoverage: {
      searchedDomains: Array.isArray(coverage?.searchedDomains) ? coverage.searchedDomains : [],
      failedDomains: Array.isArray(coverage?.failedDomains) ? coverage.failedDomains : [],
      retrievedSourceCount: retrievedSources.length,
      searchTerms: observedSearchTerms,
      searchTermsSource: observedSearchTerms.length ? "tool-observed" : "unavailable",
      toolCallCount: Number.isInteger(coverage?.toolCallCount) ? coverage.toolCallCount : 0,
      toolCallLimit: RESEARCH_PROJECT_MAX_TOOL_CALLS,
      toolCallBudgetExceeded: coverage?.toolCallBudgetExceeded === true,
      observedQueriesByEvidence: Object.fromEntries(RESEARCH_EVIDENCE_IDS.flatMap((id) => {
        const terms = normalizeSearchTerms(coverage?.observedQueriesByEvidence?.[id]);
        return terms.length ? [[id, terms]] : [];
      })),
    },
    evidence,
  };
  return containResearchResult(parsedResult);
}

function normalizePublicDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (!match || !Number.isFinite(Date.parse(`${match[0]}T00:00:00.000Z`))) return null;
  return match[0];
}

function classifySource(url, title = "") {
  const hostname = new URL(url).hostname.toLowerCase();
  const text = `${hostname} ${title}`.toLowerCase();
  if (hostname.endsWith(".gov") || /\b(dnr|ferc|ercot|commission|department|county|city of|borough)\b/.test(text)) {
    return "primary-government";
  }
  if (/\b(utility|utilities|electric|energy authority|water authority|power)\b/.test(text)) {
    return "primary-utility";
  }
  if (/\b(10-k|10-q|8-k|filing|investor|company announcement|press release)\b/.test(text)) {
    return "primary-company";
  }
  return "secondary-reporting";
}

function sourcePriority(sourceClass) {
  return {
    "primary-government": 0,
    "primary-utility": 1,
    "primary-company": 2,
    "secondary-reporting": 3,
  }[sourceClass] ?? 4;
}

function supportsExplicitZero(id, item, sources) {
  if (item.numericValue !== 0 && item.value !== 0 && !/^(0|zero|none)$/i.test(String(item.value).trim())) return true;
  const text = [item.citation, item.description, ...sources.map((source) => source.excerpt)].join(" ").toLowerCase();
  if (id === "renewable_percentage") {
    return /\b(0\s*%|zero percent|no renewable (energy|electricity) (is|was) (delivered|procured|contracted))\b/.test(text);
  }
  if (id === "grid_interconnection") {
    return /\b(0|zero)\s*(month|months|day|days)\b|\balready interconnected\b|\bno interconnection delay\b|\bbehind[- ]the[- ]meter\b|\bno (new )?grid interconnection (is|was) required\b|\bnot dependent on (a )?new (ercot )?interconnection\b/.test(text);
  }
  return /\b(0|zero|none)\b/.test(text);
}

function buildVariableQueries({ name, location, knownData }, id) {
  const projectAndLocation = `"${name}" "${location}"`;
  const operatorAndProject = knownData?.operator
    ? `"${knownData.operator}" "${name}"`
    : projectAndLocation;
  return [
    `${projectAndLocation} ${RESEARCH_QUERY_ANGLES[id][0]}`,
    `${operatorAndProject} ${RESEARCH_QUERY_ANGLES[id][1]}`,
  ];
}

function buildVariableQueryPlan({ name, location, knownData, focusIds }) {
  const project = { name, location, knownData };
  const orderedIds = focusIds?.length
    ? [...focusIds, ...RESEARCH_EVIDENCE_IDS.filter((id) => !focusIds.includes(id))]
    : RESEARCH_EVIDENCE_IDS;
  return orderedIds
    .map((id) => `- ${id} (maximum 2 queries): ${buildVariableQueries(project, id).join(" | ")}`)
    .join("\n");
}

function buildResearchProjectPrompt({ name, location, knownData, focusIds, currentEvidence }) {
  const knownDataPrompt = knownData
    ? `\n\nThe following facts are already confirmed from the Compute Atlas public database: ${JSON.stringify(knownData)}. Use them as directory discovery context for project identity and summary fields, not as SafeLoc evidence or verified project economics. Focus your research on the 16 evidence variables, not on rediscovering basic project facts.`
    : "";
  const queryPlan = buildVariableQueryPlan({ name, location, knownData, focusIds });
  return `Research and analyze this exact data-center project using the built-in web-search tool: ${name}. Location: ${location}. Search current project, operator, regulatory, utility, grid, water, permitting, community, environmental, capacity, customer, and infrastructure records. Prefer direct government, regulator, utility, land, permit, environmental, and filed-company records over summaries. Verify project, operator, and location identity so similarly named facilities are not mixed. Preserve exact URLs returned by web search, distinguish facility-level findings from regional context, and return the exact JSON contract from the system instruction. When no searched source independently confirms a claim, use Management Assertion or lower and state that verification is required. Do not replace genuine public information with Missing Evidence merely because one query fails. Use the bounded per-variable plan below inside this single provider response. Try distinct primary-record and corroboration angles where useful, with no more than two targeted queries per variable and no more than 32 targeted queries overall. These are query hints, not findings. There is no minimum finding quota; exhausted searches must remain unresolved.

Bounded variable query plan:
${queryPlan}${focusIds?.length ? ` This is a focused refresh for these unresolved variables: ${focusIds.join(", ")}. Prioritize their query angles, then still return all 16 records. Preserve unrelated existing records unless new searched evidence directly contradicts them.` : ""}${currentEvidence?.length ? `\n\nExisting evidence context:\n${JSON.stringify(currentEvidence)}` : ""}${knownDataPrompt}`;
}

function normalizeRetrievedSources(body, searchDomain = "project-identity") {
  const candidates = [];
  for (const output of Array.isArray(body?.output) ? body.output : []) {
    if (output?.type === "web_search_call" && Array.isArray(output.action?.sources)) {
      candidates.push(...output.action.sources);
    }
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type === "url_citation") {
          candidates.push({
            ...annotation,
            excerpt: typeof content.text === "string" ? content.text : annotation.excerpt,
          });
        }
      }
    }
  }
  const seen = new Set();
  return candidates
    .map((source) => {
      const url = safePublicSourceUrl(source.url) ?? "";
      const title = typeof source.title === "string" ? source.title.trim() : "Retrieved public source";
      return {
        url,
        title,
        date: typeof source.published_date === "string" ? source.published_date : typeof source.date === "string" ? source.date : null,
        excerpt: typeof source.snippet === "string" ? source.snippet.trim() : typeof source.excerpt === "string" ? source.excerpt.trim() : "",
        accessStatus: ["open", "paywall", "registration"].includes(source.access_status) ? source.access_status : "not provided",
        sourceClass: url ? classifySource(url, title) : "secondary-reporting",
        searchDomain,
        exactProject: source.exactProject === true,
        relevanceNote: typeof source.relevanceNote === "string" ? source.relevanceNote.trim().slice(0, 500) : null,
      };
    })
    .filter((source) => {
      if (!/^https?:\/\//i.test(source.url) || seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .slice(0, 10);
}

function redactUpstreamDetail(value) {
  return String(value ?? "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function createUpstreamRequestError(response, stage) {
  const rawBody = await response.text();
  let detail = "";
  try {
    const body = JSON.parse(rawBody);
    const providerError = body?.error;
    detail = typeof providerError === "string"
      ? providerError
      : providerError?.message ?? body?.message ?? "";
  } catch {
    detail = rawBody;
  }
  const suffix = redactUpstreamDetail(detail);
  const error = new Error(`${stage} upstream returned HTTP ${response.status}${suffix ? `: ${suffix}` : ""}`);
  error.name = "UpstreamRequestError";
  error.upstreamStatus = response.status;
  error.publicMessage = response.status === 429
    ? "Project research provider quota is exhausted (upstream HTTP 429)."
    : response.status === 401
      ? "Project research provider authentication failed (upstream HTTP 401)."
      : `Project research provider returned upstream HTTP ${response.status}.`;
  return error;
}

function extractResponseOutputText(body) {
  if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  for (const output of Array.isArray(body?.output) ? body.output : []) {
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return null;
}

async function researchProjectWithWebSearch(project, apiKey, fetchImpl, signal) {
  const response = await fetchImpl(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: RESEARCH_PROJECT_MODEL,
      tools: [{ type: "web_search_preview" }],
      input: [
        { role: "system", content: `${RESEARCH_PROJECT_SYSTEM_PROMPT}${WEB_SEARCH_SOURCE_BOUNDARY_PROMPT}` },
        { role: "user", content: buildResearchProjectPrompt(project) },
      ],
      max_output_tokens: RESEARCH_PROJECT_MAX_TOKENS,
      max_tool_calls: RESEARCH_PROJECT_MAX_TOOL_CALLS,
      include: ["web_search_call.action.sources"],
      text: {
        format: {
          type: "json_schema",
          name: "safeloc_research_project",
          strict: true,
          schema: RESEARCH_PROJECT_RESPONSE_SCHEMA,
        },
      },
    }),
    signal,
  });

  if (!response.ok) throw await createUpstreamRequestError(response, "Research with web search");
  const rawText = await response.text();
  let body;
  try {
    body = JSON.parse(rawText);
  } catch (error) {
    const parseError = new Error("Project research provider returned invalid JSON.");
    parseError.name = "ResearchParseError";
    throw parseError;
  }
  const content = extractResponseOutputText(body);
  if (!content) {
    const parseError = new Error("Project research provider returned no JSON output.");
    parseError.name = "ResearchParseError";
    throw parseError;
  }
  let research;
  try {
    research = JSON.parse(content);
  } catch {
    const parseError = new Error("Project research provider returned malformed result JSON.");
    parseError.name = "ResearchParseError";
    throw parseError;
  }
  const sources = normalizeRetrievedSources(body, "web-search");
  const searchTerms = extractSearchTerms(body);
  const observedQueriesByEvidence = extractObservedQueriesByEvidence(body, project);
  const toolCallCount = countWebSearchCalls(body);
  return {
    research,
    sources,
    coverage: {
      searchedDomains: ["web-search"],
      failedDomains: [],
      retrievedSourceCount: sources.length,
      searchTerms,
      observedQueriesByEvidence,
      toolCallCount,
      toolCallBudgetExceeded: toolCallCount > RESEARCH_PROJECT_MAX_TOOL_CALLS,
      searchTermsSource: searchTerms.length ? "tool-observed" : "unavailable",
    },
  };
}

async function readRequestBody(req) {
  if (req.body !== undefined) return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requestClientKey(req) {
  if (typeof req?.ip === "string" && req.ip.trim()) return req.ip.trim();
  if (typeof req?.socket?.remoteAddress === "string" && req.socket.remoteAddress.trim()) {
    return req.socket.remoteAddress.trim();
  }
  return "unknown";
}

function createResearchProjectRateLimiter({
  limit = RESEARCH_PROJECT_REQUEST_LIMIT,
  windowMs = RESEARCH_PROJECT_REQUEST_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const requestTimesByClient = new Map();
  return {
    allow(req) {
      const currentTime = now();
      const clientKey = requestClientKey(req);
      for (const [key, requestTimes] of requestTimesByClient) {
        if (requestTimes.every((requestTime) => currentTime - requestTime >= windowMs)) {
          requestTimesByClient.delete(key);
        }
      }
      const recentRequests = (requestTimesByClient.get(clientKey) ?? []).filter(
        (requestTime) => currentTime - requestTime < windowMs,
      );
      if (recentRequests.length >= limit) {
        requestTimesByClient.set(clientKey, recentRequests);
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((recentRequests[0] + windowMs - currentTime) / 1000)),
        };
      }
      recentRequests.push(currentTime);
      requestTimesByClient.set(clientKey, recentRequests);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

const defaultRateLimiter = createResearchProjectRateLimiter();

function classifyResearchFailure(error) {
  if (error?.name === "AbortError") return { status: 504, type: "timeout", message: "Project research upstream request timed out after 90 seconds." };
  if (error?.name === "ResearchParseError") return { status: 502, type: "malformed-response", message: error.message };
  if (error?.name === "UpstreamRequestError") {
    if (error.upstreamStatus === 429) return { status: 429, type: "quota-exhausted", message: error.publicMessage };
    if (error.upstreamStatus === 401) return { status: 502, type: "authentication", message: error.publicMessage };
    return { status: 502, type: "upstream", message: error.publicMessage ?? "Project research provider request failed." };
  }
  if (error?.name === "RateLimitError") return { status: 429, type: "request-limit", message: RESEARCH_PROJECT_RATE_LIMIT_MESSAGE };
  if (error?.name === "ConfigurationError") return { status: 503, type: "not-configured", message: "Project research not configured." };
  if (error?.name === "StructuredResearchError") return { status: 502, type: "malformed-response", message: "Project research returned an invalid 16-item response." };
  return { status: 502, type: "upstream", message: "Project research upstream request failed." };
}

async function runValidatedResearch(project, { apiKey, fetchImpl, rateLimiter, req }) {
  if (!apiKey) {
    const error = new Error("Project research not configured.");
    error.name = "ConfigurationError";
    error.researchErrorType = "not-configured";
    throw error;
  }
  const rateLimit = rateLimiter.allow(req);
  if (!rateLimit.allowed) {
    const error = new Error(RESEARCH_PROJECT_RATE_LIMIT_MESSAGE);
    error.name = "RateLimitError";
    error.retryAfterSeconds = rateLimit.retryAfterSeconds;
    error.researchErrorType = "request-limit";
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_PROJECT_TIMEOUT_MS);
  try {
    const result = await researchProjectWithWebSearch(project, apiKey, fetchImpl, controller.signal);
    try {
      return parseResearchResponse(
        result.research,
        result.sources,
        new Date().toISOString().slice(0, 10),
        result.coverage,
        project.knownData,
      );
    } catch (error) {
      console.warn("[research-project] Rejected structured research response:", error instanceof Error ? error.message : "unknown validation error");
      const structuredError = new Error("Invalid structured research response.");
      structuredError.name = "StructuredResearchError";
      structuredError.researchErrorType = "malformed-response";
      throw structuredError;
    }
  } catch (error) {
    if (error && !error.researchErrorType) error.researchErrorType = classifyResearchFailure(error).type;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleResearchProjectRequest(
  req,
  res,
  {
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl = fetch,
    rateLimiter = defaultRateLimiter,
    cache = defaultResearchProjectCache,
  } = {},
) {
  if (req.method === "GET") {
    const requestUrl = new URL(req.url ?? "/api/research-project", "http://localhost");
    const key = req.query?.cacheKey ?? requestUrl.searchParams.get("cacheKey");
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) {
      sendJson(res, 400, { error: "A valid research cache key is required." });
      return;
    }
    const entry = await cache.read(key);
    const status = cache.status(key);
    const containedEntry = entry ? { ...entry, result: containResearchResult(entry.result) } : null;
    const containedStatusResult = status.result ? containResearchResult(status.result) : undefined;
    sendJson(res, 200, {
      researchCache: cacheMetadata(key, containedEntry, containedEntry ? cache.age(containedEntry) : "expired", status.refreshStatus, {
        providerAvailable: status.refreshStatus !== "failed",
        errorType: status.errorType,
      }),
      ...(status.refreshStatus === "completed" && containedStatusResult ? { result: containedStatusResult } : {}),
    });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let project;
  try {
    project = parseResearchProjectBody(await readRequestBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid research project request." });
    return;
  }

  const key = cache.keyFor(project);
  const retained = await cache.read(key);
  const containedRetained = retained ? { ...retained, result: containResearchResult(retained.result) } : null;
  const retainedState = retained ? cache.age(retained) : "expired";
  if (!project.forceRefresh && containedRetained && (retainedState === "fresh" || retainedState === "recent")) {
    sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, retainedState)));
    return;
  }

  const refresh = () => cache.refresh(key, () => runValidatedResearch(project, { apiKey, fetchImpl, rateLimiter, req }));
   if (!project.forceRefresh && containedRetained && retainedState === "stale") {
    const background = refresh();
    void background.promise.catch((error) => {
      console.error("[research-project] Background refresh failed:", classifyResearchFailure(error).type);
    });
    sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, "stale", "running")));
    return;
  }

  try {
    const { promise } = refresh();
    const entry = await promise;
    sendJson(res, 200, withCacheMetadata(entry, cacheMetadata(key, entry, "updated")));
  } catch (error) {
    const failure = classifyResearchFailure(error);
    console.error("[research-project] Request failed:", failure.type);
    if (containedRetained) {
      sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, "stale", "failed", {
        providerAvailable: false,
        errorType: failure.type,
      })));
      return;
    }
    if (failure.type === "request-limit" && error?.retryAfterSeconds) {
      res.setHeader("retry-after", String(error.retryAfterSeconds));
    }
    sendJson(res, failure.status, { error: failure.message, errorType: failure.type });
  }
}

export {
  DEFAULT_RESEARCH_CAPACITY_MW,
  MAX_RESEARCH_CAPACITY_MW,
  OPENAI_RESPONSES_URL,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_PROJECT_MAX_TOOL_CALLS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_TIMEOUT_MS,
  RESEARCH_PROJECT_RESPONSE_SCHEMA,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  RESEARCH_QUERY_ANGLES,
  buildResearchProjectPrompt,
  buildVariableQueries,
  buildVariableQueryPlan,
  extractResponseOutputText,
  researchProjectWithWebSearch,
  normalizeCapacityMW,
  normalizeReportedCapacityMW,
  parseResearchProjectBody,
  parseResearchResponse,
  normalizeRetrievedSources,
  normalizeSearchTerms,
  extractSearchTerms,
  extractObservedQueriesByEvidence,
  countWebSearchCalls,
  normalizeModelReportedConfidence,
  calculateSourceSupportConfidence,
  isExactProjectSource,
  normalizePublicDate,
  classifySource,
  supportsExplicitZero,
  safePublicSourceUrl,
  createResearchProjectRateLimiter,
  classifyResearchFailure,
  runValidatedResearch,
};