import { defaultResearchProjectCache } from "./researchProjectCache.mjs";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  EVIDENCE_SEMANTIC_POLICY_VERSION,
  evaluateEvidenceSourceEligibility,
  normalizeEvidenceRecord,
} from "../src/data/evidenceSemanticPolicy.mjs";
import {
  SOURCE_VALIDATION_POLICY_VERSION,
  buildClaimPassageMappings,
  canonicalizeSourceUrl,
  createSourceLedger,
  evaluateResearchEvidenceEligibility,
  isSourceProjectSpecific,
  sourceUrlAliases,
} from "../src/data/sourceValidationPolicy.mjs";
import { defaultProjectResearchRegistry } from "./projectResearchRegistry.mjs";
import { discoverOfficialSources } from "./officialSourceDiscovery.mjs";
import { extractResearchDocument } from "./researchDocumentExtraction.mjs";
import { createSecConnector } from "./secConnector.mjs";

function sourceStateTransition(from, to, reason) {
  return { from, to, reason };
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const RESEARCH_PROJECT_MODEL = "gpt-4o";
const RESEARCH_PROJECT_MAX_TOKENS = 8_000;
const RESEARCH_CATEGORY_MAX_TOKENS = 3_500;
const RESEARCH_PROVIDER_MAX_CONCURRENCY = 2;
const RESEARCH_PROJECT_TIMEOUT_MS = 90_000;
const RESEARCH_PROJECT_MAX_TOOL_CALLS = 32;
const RESEARCH_POLICY_VERSION = 2;
const RESEARCH_CATEGORY_AUDIT_VERSION = 3;
const RESEARCH_RUN_BUDGET = Object.freeze({
  deadlineMs: RESEARCH_PROJECT_TIMEOUT_MS,
  maxProviderRequests: 16,
  maxFollowUps: 8,
  maxFollowUpsPerCategory: 1,
  maxCandidatesPerCategory: 10,
  maxTotalCandidates: 80,
  maxToolCalls: RESEARCH_PROJECT_MAX_TOOL_CALLS,
  maxPhysicalDocumentOpens: 24,
});
const RESEARCH_DOCUMENT_MAX_BYTES = 1_000_000;
const RESEARCH_DOCUMENT_MAX_REDIRECTS = 3;
const SEC_CONNECTOR_CACHE = new Map();
const RESEARCH_CATEGORY_STATES = Object.freeze([
  "Complete",
  "Partial",
  "No eligible evidence",
  "Provider failure",
  "Timed out",
  "Not searched",
]);
const RESEARCH_CATEGORIES = Object.freeze([
  { id: "project-identity", label: "Project identity", evidenceIds: [] },
  { id: "grid", label: "Grid", evidenceIds: ["grid_interconnection", "electricity_cost", "electricity_escalation", "renewable_percentage"] },
  { id: "electricity", label: "Electricity", evidenceIds: ["electricity_cost", "electricity_escalation", "renewable_percentage", "carbon_compliance"] },
  { id: "water", label: "Water", evidenceIds: ["water_consumption", "water_escalation", "water_rights", "water_source_resilience"] },
  { id: "permitting-community", label: "Permitting and community", evidenceIds: ["community_risk", "permitting_timeline", "carbon_compliance"] },
  { id: "construction-capital", label: "Construction and capital", evidenceIds: ["cooling_capex", "backup_power_capacity", "downtime_cost"] },
  { id: "tenant-counterparty", label: "Tenant and counterparty", evidenceIds: ["customer_concentration", "downtime_cost"] },
  { id: "climate-operational-hazard", label: "Climate and operational hazard", evidenceIds: ["site_hazard_exposure", "backup_power_capacity", "water_source_resilience", "downtime_cost"] },
]);
const TEXAS_CATEGORY_TARGETS = Object.freeze({
  "project-identity": {
    names: ["Texas project records", "project/developer disclosures", "ERCOT", "PUCT"],
    domains: ["ercot.com", "puc.texas.gov", "sec.gov"],
  },
  grid: {
    names: ["ERCOT", "PUCT", "Texas interconnection records"],
    domains: ["ercot.com", "puc.texas.gov"],
  },
  electricity: {
    names: ["ERCOT", "PUCT", "EIA market context", "Texas utility records"],
    domains: ["ercot.com", "puc.texas.gov", "eia.gov"],
  },
  water: {
    names: ["TWDB", "municipal water authorities", "county authorities"],
    domains: ["twdb.texas.gov"],
  },
  "permitting-community": {
    names: ["municipal agendas", "county agendas", "permits", "agreements"],
    domains: [],
  },
  "construction-capital": {
    names: ["SEC EDGAR", "company investor relations", "official developer disclosures"],
    domains: ["sec.gov"],
  },
  "tenant-counterparty": {
    names: ["SEC EDGAR", "company investor relations", "official project/developer disclosures"],
    domains: ["sec.gov"],
  },
  "climate-operational-hazard": {
    names: ["FEMA", "NOAA", "Texas geographic hazard records"],
    domains: ["fema.gov", "noaa.gov"],
  },
});
const STATE_ROUTING_TARGETS = Object.freeze({
  Arizona: {
    names: ["Arizona Corporation Commission", "Arizona Department of Water Resources", "Arizona Department of Environmental Quality", "Arizona utility and water-authority records"],
    domains: ["azcc.gov", "azwater.gov", "azdeq.gov"],
  },
  Ohio: {
    names: ["Public Utilities Commission of Ohio", "Ohio Department of Natural Resources", "Ohio Environmental Protection Agency", "Ohio utility and water-authority records"],
    domains: ["puco.ohio.gov", "ohiodnr.gov", "epa.ohio.gov"],
  },
});
const GENERIC_STATE_AUTHORITY_ROLES = Object.freeze([
  ["utility regulator", "state-utility"],
  ["environmental agency", "state-environmental"],
  ["water authority", "state-water"],
]);
const US_STATE_NAMES = Object.freeze({
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
});
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
    claimPassage: { type: "string", minLength: 1 },
    facilityScope: { type: "string", enum: ["exact-project", "exact-facility", "project", "facility", "unknown"] },
    phaseScope: { type: "string", enum: ["exact-phase", "not-applicable", "unknown"] },
    claimTimePeriod: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
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
    "claimPassage",
    "facilityScope",
    "phaseScope",
    "claimTimePeriod",
    "searchTerms",
    "qualitativeValue",
  ],
};

function buildResearchResponseSchema(evidenceIds = RESEARCH_EVIDENCE_IDS) {
  const scopedEvidenceIds = [...new Set(evidenceIds.filter((id) => RESEARCH_EVIDENCE_IDS.includes(id)))];
  return {
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
          scopedEvidenceIds.map((id) => [id, RESEARCH_EVIDENCE_RECORD_SCHEMA]),
        ),
        required: scopedEvidenceIds,
      },
    },
    required: ["projectSummary", "evidence"],
  };
}

function buildProjectIdentityResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      projectSummary: buildResearchResponseSchema([]).properties.projectSummary,
      identityAssessment: {
        type: "object",
        additionalProperties: false,
        properties: {
          exactProjectIdentityEstablished: { type: "boolean" },
          matchedName: { anyOf: [{ type: "string" }, { type: "null" }] },
          matchedLocation: { anyOf: [{ type: "string" }, { type: "null" }] },
          matchedOperator: { anyOf: [{ type: "string" }, { type: "null" }] },
          reason: { type: "string", minLength: 1 },
        },
        required: [
          "exactProjectIdentityEstablished",
          "matchedName",
          "matchedLocation",
          "matchedOperator",
          "reason",
        ],
      },
    },
    required: ["projectSummary", "identityAssessment"],
  };
}

const RESEARCH_PROJECT_RESPONSE_SCHEMA = buildResearchResponseSchema();
const RESEARCH_PROJECT_IDENTITY_RESPONSE_SCHEMA = buildProjectIdentityResponseSchema();

const RESEARCH_PROJECT_SYSTEM_PROMPT = `You are a careful infrastructure diligence researcher. Research the named data-center project and location using current, attributable public sources. Separate facility-level evidence from market, regional, or industry context. If you find public reporting confirming a data point, classify it as Management Assertion when it comes from company sources, or Verified Evidence when it comes from independent regulatory filings, government data, or independent reporting. Only classify as Missing Evidence if you genuinely cannot find any public information about that variable. Do not default to Missing Evidence as a conservative choice. Independent public records or reporting are Verified Evidence; dated company announcements, filings, or disclosures with limited independent confirmation are Management Assertion; analyst-derived estimates from related facts are Model Inference; synthetic analyst-selected values are User Assumption; and a fact not established in the searched public record is Missing Evidence.

SafeLoc models exactly 16 evidence variables across a complete run: electricity_cost, water_consumption, grid_interconnection, water_escalation, community_risk, renewable_percentage, cooling_capex, electricity_escalation, carbon_compliance, permitting_timeline, customer_concentration, water_rights, site_hazard_exposure, backup_power_capacity, water_source_resilience, and downtime_cost. The evidence object is keyed by the identifiers supplied in the response schema. Complete every supplied key exactly once; never add an identifier outside that schema.

The projectSummary.description must explicitly report relevant findings, when available, about electrical-equipment procurement and lead times, jurisdictional bans or moratoriums, noise ordinances and operational impacts, local electricity-rate concerns, and semiconductor and memory supply-chain constraints. It must also identify speculative or phantom grid-load requests when that context is relevant. These are contextual research areas, not additional modeled evidence inputs: do not add them to the evidence array, assign them evidence classifications, or imply that market-wide statistics prove facility-level facts.

ERCOT BATCH ZERO UPDATE (August 2026): ERCOT's Batch Zero large-load interconnection studies, covering 200 GW across 300 applicants, have been delayed from the original September 2026 start to January 2027 at earliest. The study was expected to complete by April 2027; the revised completion date is unclear. ERCOT staff testified this delay may cause some applicants to drop out due to financing constraints. Separately, 17 facilities totaling 6.6 GW that already completed studies are stuck in Governor Abbott's verification audit and cannot energize. Any Texas data center project requiring ERCOT grid interconnection is affected. Only behind-the-meter projects exempt from the ERCOT queue are unaffected. When classifying Grid Interconnection for any Texas project, a grid-dependent project should not receive Verified Evidence for interconnection timeline because no grid-dependent project currently has a confirmed interconnection date. Treat this as August 2026 market and grid-process context, not proof of a named facility's interconnection status; research exact-project evidence separately.

Respond with one JSON object matching the supplied schema. projectSummary must contain name, location, description, and capacityMW. Every evidence record must contain the listed fields plus claimPassage, facilityScope, phaseScope, and claimTimePeriod. claimPassage must be an exact quotation copied from the returned source passage; do not paraphrase it. facilityScope, phaseScope, and claimTimePeriod describe the claim itself, not merely the document or retrieval date. Use unknown or null when the source does not establish them. modelReportedConfidence is your optional per-variable confidence from 0 to 100; it is not source validation. sourceSupportConfidence is a schema placeholder; the server computes it from validated sources. sourceUrl is the strongest direct source, and sourceUrls contains up to four packet URLs. Never invent a URL, quote, scope, phase, or claim period. A source URL is a research aid only and never facility-level proof by itself. Use sourceRelevance exact-project only when the source names or otherwise identifies this facility. The server validates the exact quotation against the captured passage and requires explicit entity, phase, and claim-period scope before granting Verified Evidence or model eligibility. A gas-generation or fuel-supply source does not establish the facility's electricity price. A source naming a water source does not establish water consumption or water rights. A PPA or named offtaker does not establish a customer-concentration number unless the source explicitly quantifies the relevant facility-level share.`;

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
    validationPolicyVersion: entry?.validationPolicyVersion ?? EVIDENCE_SEMANTIC_POLICY_VERSION,
    researchPolicyVersion: entry?.researchPolicyVersion ?? RESEARCH_POLICY_VERSION,
    modelVersion: entry?.modelVersion ?? RESEARCH_PROJECT_MODEL,
    revalidated: entry?.needsRevalidation === true,
    ...(extras.errorType ? { errorType: extras.errorType } : {}),
    ...(extras.providerDiagnostic ? { providerDiagnostic: extras.providerDiagnostic } : {}),
  };
}

function withCacheMetadata(entry, metadata) {
  const { cacheable: _cacheable, ...publicResult } = entry.result ?? {};
  return { ...publicResult, researchCache: metadata };
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
    const hostname = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol) || !hostname || url.username || url.password
      || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")
      || hostname === "metadata.google.internal" || isPrivateNetworkHostname(hostname)) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function isPrivateNetworkHostname(hostname) {
  const normalized = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  const ip = normalized.match(/^\d{1,3}(?:\.\d{1,3}){3}$/)?.[0];
  if (ip) {
    const octets = ip.split(".").map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
    const value = octets.reduce((total, octet) => total * 256 + octet, 0);
    return octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && (octets[1] === 0 || octets[1] === 2 || octets[1] === 168))
      || (octets[0] === 192 && octets[1] === 88 && octets[2] === 99)
      || (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19)
      || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
      || octets[0] >= 224
      || value === 0xffffffff;
  }
  if (!normalized.includes(":")) return false;
  if (isIP(normalized) !== 6) return true;
  const groups = normalized.split("::");
  const left = groups[0] ? groups[0].split(":") : [];
  const right = groups[1] ? groups[1].split(":") : [];
  const expanded = groups.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  if (expanded.length !== 8) return true;
  const value = expanded.reduce((total, part) => (total << 16n) | BigInt(`0x${part || "0"}`), 0n);
  const mappedIpv4 = (value >> 32n) === 0xffffn;
  if (mappedIpv4) {
    const mapped = Number(value & 0xffffffffn);
    return isPrivateNetworkHostname(`${mapped >>> 24}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`);
  }
  const topByte = Number(value >> 120n);
  return value === 0n || value === 1n || topByte === 0xff
    || (topByte & 0xfe) === 0xfc
    || topByte === 0xfe
    || (value >> 96n) === 0x20010db8n;
}

async function resolvePublicAddress(url, dnsLookup = dns.lookup) {
  const parsed = new URL(url);
  if (isPrivateNetworkHostname(parsed.hostname)) throw new Error("private-destination");
  const addresses = await dnsLookup(parsed.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => isPrivateNetworkHostname(address.address))) {
    throw new Error("private-destination");
  }
  return addresses[0];
}

function createPinnedLookup(address) {
  return (_hostname, options, callback) => {
    if (options?.all === true) {
      callback(null, [{ address: address.address, family: address.family }]);
      return;
    }
    callback(null, address.address, address.family);
  };
}

function fetchPinnedPublicUrl(url, init = {}, dnsLookup = dns.lookup) {
  return resolvePublicAddress(url, dnsLookup).then((address) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method ?? "GET",
      headers: init.headers,
      lookup: createPinnedLookup(address),
      servername: parsed.hostname,
      signal: init.signal,
    }, (response) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) headers.set(name, value.join(", "));
        else if (value !== undefined) headers.set(name, value);
      }
      resolve(new Response(Readable.toWeb(response), {
        status: response.statusCode ?? 502,
        headers,
      }));
    });
    request.once("error", reject);
    request.end();
  }));
}

function parseResearchProjectBody(body) {
  if (!isRecord(body)) throw new Error("Research project body must be a JSON object.");
  const name = body.name ?? body.projectName;
  const displayLocation = nonEmptyString(body.location, "location", 160);
  const locationParts = displayLocation
    .split(/\s*(?:·|\||,)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (locationParts.length < 2) locationParts.length = 0;
  const derivedLocation = {
    ...(locationParts.find((part) => /\bcounty\b/i.test(part)) ? { county: locationParts.find((part) => /\bcounty\b/i.test(part)) } : {}),
    ...(locationParts.find((part) => /^[A-Z]{2}$/.test(part) || /^(?:Texas|Ohio|Virginia|California|New York)$/i.test(part))
      ? { state: locationParts.find((part) => /^[A-Z]{2}$/.test(part) || /^(?:Texas|Ohio|Virginia|California|New York)$/i.test(part)) }
      : {}),
    ...(locationParts.find((part) => !/\bcounty\b/i.test(part) && !/^[A-Z]{2}$/.test(part) && !/^(?:Texas|Ohio|Virginia|California|New York)$/i.test(part))
      ? { city: locationParts.find((part) => !/\bcounty\b/i.test(part) && !/^[A-Z]{2}$/.test(part) && !/^(?:Texas|Ohio|Virginia|California|New York)$/i.test(part)) }
      : {}),
  };
  let knownData;
  if (body.knownData !== undefined) {
    if (!isRecord(body.knownData)) throw new Error('Research field "knownData" must be an object.');
    const capacity = normalizeReportedCapacityMW(body.knownData.capacity);
    const operator = typeof body.knownData.operator === "string" && body.knownData.operator.trim()
      ? body.knownData.operator.trim().slice(0, 160)
      : null;
    const ticker = typeof body.knownData.ticker === "string" && /^[A-Za-z0-9.-]{1,20}$/.test(body.knownData.ticker.trim())
      ? body.knownData.ticker.trim().toUpperCase()
      : null;
    const companyName = typeof body.knownData.companyName === "string" && body.knownData.companyName.trim()
      ? body.knownData.companyName.trim().slice(0, 160)
      : null;
    const status = typeof body.knownData.status === "string" && body.knownData.status.trim()
      ? body.knownData.status.trim().slice(0, 80)
      : null;
    const sourceUrl = safePublicSourceUrl(body.knownData.sourceUrl);
    const providerId = typeof body.knownData.providerId === "string" && body.knownData.providerId.trim()
      ? body.knownData.providerId.trim().slice(0, 160)
      : null;
    const normalizeKnownText = (value, maxLength = 160) => typeof value === "string" && value.trim()
      ? value.trim().slice(0, maxLength)
      : null;
    const city = normalizeKnownText(body.knownData.city);
    const county = normalizeKnownText(body.knownData.county);
    const state = normalizeKnownText(body.knownData.state, 80);
    const waterAuthority = normalizeKnownText(body.knownData.waterAuthority);
    const permittingAuthority = normalizeKnownText(body.knownData.permittingAuthority);
    const authorityNames = Array.isArray(body.knownData.authorityNames)
      ? [...new Set(body.knownData.authorityNames.map((value) => normalizeKnownText(value)).filter(Boolean))].slice(0, 8)
      : [];
    const authorityDomains = Array.isArray(body.knownData.authorityDomains)
      ? [...new Set(body.knownData.authorityDomains.map((value) => normalizeKnownText(value, 120)?.replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((value) => value && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)))].slice(0, 12)
      : [];
    const companyDomains = Array.isArray(body.knownData.companyDomains)
      ? [...new Set(body.knownData.companyDomains.map((value) => normalizeKnownText(value, 120)?.replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((value) => value && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)))].slice(0, 8)
      : [];
    const normalizeDomainArray = (value, limit = 8) => Array.isArray(value)
      ? [...new Set(value.map((item) => normalizeKnownText(item, 120)?.replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((item) => item && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(item)))].slice(0, limit)
      : [];
    const cityDomains = normalizeDomainArray(body.knownData.cityDomains);
    const countyDomains = normalizeDomainArray(body.knownData.countyDomains);
    const utilityDomains = normalizeDomainArray(body.knownData.utilityDomains);
    const economicDevelopmentDomains = normalizeDomainArray(body.knownData.economicDevelopmentDomains);
    const knownOfficialEndpoints = Array.isArray(body.knownData.knownOfficialEndpoints)
      ? [...new Set(body.knownData.knownOfficialEndpoints.map(safePublicSourceUrl).filter(Boolean))].slice(0, 16)
      : [];
    const aliases = Array.isArray(body.knownData.aliases)
      ? [...new Set(body.knownData.aliases.map((value) => normalizeKnownText(value, 160)).filter(Boolean))].slice(0, 12)
      : [];
    const normalized = {
      ...derivedLocation,
      ...(capacity === null ? {} : { capacity }),
      ...(operator ? { operator } : {}),
      ...(ticker ? { ticker } : {}),
      ...(companyName ? { companyName } : {}),
      ...(status ? { status } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(providerId ? { providerId } : {}),
      ...(city ? { city } : {}),
      ...(county ? { county } : {}),
      ...(state ? { state } : {}),
      ...(waterAuthority ? { waterAuthority } : {}),
      ...(permittingAuthority ? { permittingAuthority } : {}),
      ...(authorityNames.length ? { authorityNames } : {}),
      ...(authorityDomains.length ? { authorityDomains } : {}),
      ...(companyDomains.length ? { companyDomains } : {}),
      ...(cityDomains.length ? { cityDomains } : {}),
      ...(countyDomains.length ? { countyDomains } : {}),
      ...(utilityDomains.length ? { utilityDomains } : {}),
      ...(economicDevelopmentDomains.length ? { economicDevelopmentDomains } : {}),
      ...(knownOfficialEndpoints.length ? { knownOfficialEndpoints } : {}),
      ...(aliases.length ? { aliases } : {}),
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
    location: displayLocation,
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

function researchCategoryForEvidence(id) {
  return RESEARCH_CATEGORIES.filter((category) => category.evidenceIds.includes(id)).map((category) => category.id);
}

function inferLocationAuthorityParts(project = {}) {
  const knownData = project.knownData ?? {};
  const location = String(project.location ?? "");
  const county = knownData.county
    ?? location.match(/\b([^,]+?)\s+County\b/i)?.[1]
    ?? null;
  const city = knownData.city
    ?? location.match(/^\s*([^,]+?)(?:\s*,|\s+County\b)/i)?.[1]
    ?? null;
  const stateMatch = Object.entries(US_STATE_NAMES).find(([abbreviation, name]) =>
    new RegExp(`\\b(?:${abbreviation}|${name})\\b`, "i").test(location));
  const knownState = typeof knownData.state === "string" ? knownData.state.trim() : "";
  const normalizedKnownState = (US_STATE_NAMES[knownState.toUpperCase()] ?? knownState) || null;
  const state = normalizedKnownState
    ?? (stateMatch ? US_STATE_NAMES[stateMatch[0]] ?? stateMatch[0] : null);
  return {
    city: city?.trim() || null,
    county: county?.trim() || null,
    state: state?.trim() || null,
  };
}

function buildProjectIdentityContext(project = {}) {
  const knownData = project.knownData ?? {};
  const parts = inferLocationAuthorityParts(project);
  const aliases = [...new Set([
    ...(Array.isArray(knownData.aliases) ? knownData.aliases : []),
    ...(knownData.operator && knownData.operator !== project.name ? [knownData.operator] : []),
  ].filter(Boolean))].slice(0, 12);
  const locationText = String(project.location ?? "");
  const ambiguities = [];
  if (/\bcampus\b/i.test(locationText)) {
    ambiguities.push("Campus-versus-region ambiguity: the supplied wording identifies a campus but not a uniquely resolved facility within it.");
  } else if (/\b(region|metro|metropolitan|area|corridor|valley|site)\b/i.test(locationText)
      && !parts.city && !parts.county) {
    ambiguities.push("Campus-versus-region ambiguity: the supplied location does not establish a city, county, or exact facility site.");
  } else if (/\b(region|metro|metropolitan|area|corridor|valley|site)\b/i.test(locationText)) {
    ambiguities.push("Campus-versus-region ambiguity: regional wording is present; do not treat regional records as exact-campus evidence.");
  }
  if (!knownData.operator && aliases.length === 0) {
    ambiguities.push("Operator identity is not established in the supplied project context; similarly named facilities require disambiguation.");
  }
  return {
    requestedName: String(project.name ?? "").trim(),
    aliases,
    operator: knownData.operator ?? null,
    location: locationText,
    city: parts.city,
    county: parts.county,
    state: parts.state,
    ambiguities,
    resolutionRequired: true,
  };
}

function buildLocalAuthorityTargets(project = {}) {
  const knownData = project.knownData ?? {};
  const parts = inferLocationAuthorityParts(project);
  const targets = [];
  const add = (name, kind, domain = null, establishmentMethod = "location-context") => {
    if (!name) return;
    targets.push({
      name,
      kind,
      domain: domain || null,
      establishmentMethod,
      status: domain ? "established" : "identified-no-domain",
    });
  };
  const knownDomains = Array.isArray(knownData.authorityDomains) ? knownData.authorityDomains : [];
  const domainFor = (index) => knownDomains[index] ?? null;
  if (knownData.permittingAuthority) add(knownData.permittingAuthority, "permitting", domainFor(0), "known-data");
  else if (parts.city) add(`City of ${parts.city}`, "municipal", domainFor(0));
  if (parts.county) add(`${parts.county} County`, "county", domainFor(parts.city ? 1 : 0));
  if (knownData.waterAuthority) add(knownData.waterAuthority, "water", domainFor(knownData.permittingAuthority || parts.city ? 1 : 0), "known-data");
  if (Array.isArray(knownData.authorityNames)) {
    knownData.authorityNames.forEach((name, index) => add(name, "known-authority", domainFor(index), "known-data"));
  }
  const limitations = [];
  if (parts.state?.toLowerCase() === "texas" && !targets.some((target) => target.domain)) {
    limitations.push("A local authority was inferred from the known location, but no official domain was established in the supplied project context.");
  } else if (parts.state?.toLowerCase() === "texas" && targets.some((target) => target.status === "identified-no-domain")) {
    limitations.push("Some local authorities were identified by name, but their official domains were not established; the unrestricted fallback is required.");
  }
  if (!parts.city && !parts.county && !knownData.authorityNames?.length) {
    limitations.push("City, county, or named local authority was not established from the known project context.");
  }
  return { targets, limitations };
}

function buildStateAuthorityTargets(project = {}) {
  const parts = inferLocationAuthorityParts(project);
  if (!parts.state || parts.state.toLowerCase() === "texas") {
    return { targets: [], limitations: [] };
  }
  const configured = STATE_ROUTING_TARGETS[parts.state];
  const names = configured?.names?.length
    ? configured.names
    : GENERIC_STATE_AUTHORITY_ROLES.map(([role]) => `${parts.state} ${role}`);
  const domains = configured?.domains ?? [];
  const targets = names.map((name, index) => ({
    name,
    kind: configured ? "state" : GENERIC_STATE_AUTHORITY_ROLES[index]?.[1] ?? "state-authority",
    domain: domains[index] ?? null,
    establishmentMethod: configured ? "state-routing" : "state-role-inference",
    status: domains[index] ? "established" : "identified-no-domain",
  }));
  const limitations = targets.some((target) => target.status === "identified-no-domain")
    ? [`Some ${parts.state} authority names were identified, but their official domains were not established; the unrestricted exact-project fallback is required.`]
    : [];
  return { targets, limitations };
}

function categoryAuthorityTargets(project, categoryId) {
  const parts = inferLocationAuthorityParts(project);
  const stateTargets = STATE_ROUTING_TARGETS[parts.state] ?? { names: [], domains: [] };
  const base = isTexasProject(project)
    ? TEXAS_CATEGORY_TARGETS[categoryId] ?? { names: [], domains: [] }
    : {
        names: ["project-identity", "grid", "electricity", "water", "permitting-community", "climate-operational-hazard"].includes(categoryId)
          ? stateTargets.names
          : [],
        domains: ["grid", "electricity", "water", "project-identity", "permitting-community", "climate-operational-hazard"].includes(categoryId)
          ? stateTargets.domains
          : [],
      };
  const local = ["water", "permitting-community"].includes(categoryId)
    ? buildLocalAuthorityTargets(project)
    : { targets: [], limitations: [] };
  const stateAuthorities = buildStateAuthorityTargets(project);
  const authorityRecords = [...stateAuthorities.targets, ...local.targets]
    .filter((target, index, records) => records.findIndex((candidate) => candidate.name === target.name) === index);
  const localNames = authorityRecords.map((target) => target.name);
  const localDomains = authorityRecords.map((target) => target.domain).filter(Boolean);
  return {
    names: [...new Set([...base.names, ...localNames])],
    domains: [...new Set([...base.domains, ...localDomains])],
    localAuthorities: authorityRecords,
    limitations: [
      ...stateAuthorities.limitations,
      ...local.limitations,
      ...(buildProjectIdentityContext(project).ambiguities.length && categoryId === "project-identity"
        ? buildProjectIdentityContext(project).ambiguities
        : []),
    ],
  };
}

function buildResearchCategoryPlan(project) {
  const identityContext = buildProjectIdentityContext(project);
  const plan = RESEARCH_CATEGORIES.map((category) => {
    const firstEvidenceId = category.evidenceIds[0];
    const followUpEvidenceId = category.evidenceIds[1] ?? firstEvidenceId;
    const requestedPrimaryQuery = buildCategoryQuery(project, category, "primary", firstEvidenceId);
    const optionalFollowUpQuery = buildCategoryQuery(project, category, "follow-up", followUpEvidenceId);
    const authorityTargets = categoryAuthorityTargets(project, category.id);
    return {
      categoryId: category.id,
      label: category.label,
      evidenceIds: [...category.evidenceIds],
      requestedPrimaryQuery,
      plannedPrimaryQuery: requestedPrimaryQuery,
      optionalFollowUpQuery,
      plannedFollowUpQuery: optionalFollowUpQuery,
      authorityTargets,
      primaryAttempt: "not-started",
      followUpAttempt: "not-started",
      identityContext,
    };
  });
  return {
    version: RESEARCH_CATEGORY_AUDIT_VERSION,
    categories: plan,
    budget: { ...RESEARCH_RUN_BUDGET },
    identityContext,
  };
}

function buildCategoryFollowUpQuery(project, category, unresolvedEvidenceIds = []) {
  const fallbackId = category.evidenceIds[1] ?? category.evidenceIds[0];
  const evidenceId = unresolvedEvidenceIds.find((id) => id !== category.evidenceIds[0]) ?? fallbackId;
  return buildCategoryQuery(project, category, "follow-up", evidenceId);
}

function evaluateResearchDocumentAccess(candidate = {}) {
  const rawUrls = [candidate.originalUrl ?? candidate.url, candidate.resolvedUrl ?? candidate.finalUrl ?? candidate.url];
  for (const rawUrl of rawUrls) {
    try {
      if (isPrivateNetworkHostname(new URL(rawUrl).hostname)) {
        return {
          state: "blocked",
          reason: "private-destination",
          originalUrl: null,
          resolvedUrl: null,
          contentType: String(candidate.contentType ?? candidate.mimeType ?? "").toLowerCase().split(";")[0].trim() || null,
          redirectChain: [],
          extractionLimitations: ["Private, loopback, link-local, or reserved destinations are never fetched."],
        };
      }
    } catch {
      // The normal URL validation below reports malformed values as unsafe.
    }
  }
  const originalUrl = safePublicSourceUrl(candidate.originalUrl ?? candidate.url);
  const resolvedUrl = safePublicSourceUrl(candidate.resolvedUrl ?? candidate.finalUrl ?? candidate.url);
  const contentType = String(candidate.contentType ?? candidate.mimeType ?? "").toLowerCase().split(";")[0].trim() || null;
  const redirectChain = Array.isArray(candidate.redirectChain) ? candidate.redirectChain.filter(Boolean).slice(0, 5) : [];
  if (!originalUrl || !resolvedUrl) {
    return { state: "blocked", reason: "unsafe-url", originalUrl: originalUrl ?? null, resolvedUrl: null, contentType, redirectChain, extractionLimitations: ["URL is missing, invalid, or contains credentials."] };
  }
  if (redirectChain.length > 3) {
    return { state: "blocked", reason: "redirect-limit", originalUrl, resolvedUrl, contentType, redirectChain, extractionLimitations: ["Redirect chain exceeded the bounded access limit."] };
  }
  if (["paywall", "registration", "blocked", "unsafe"].includes(candidate.accessStatus)) {
    return { state: "blocked", reason: String(candidate.accessStatus), originalUrl, resolvedUrl, contentType, redirectChain, extractionLimitations: ["The destination was not openly accessible; no unsupported material is treated as reviewed."] };
  }
  if (candidate.blocked === true) {
    return { state: "blocked", reason: "blocked", originalUrl, resolvedUrl, contentType, redirectChain, extractionLimitations: ["The destination requires blocked access."] };
  }
  const extension = new URL(resolvedUrl).pathname.toLowerCase();
  const format = contentType === "application/pdf" || extension.endsWith(".pdf")
    ? "text-pdf"
    : contentType === "application/json" || contentType?.endsWith("+json") || extension.endsWith(".json") || extension.endsWith(".geojson")
      ? "json"
      : contentType === "application/xml" || contentType === "text/xml" || contentType?.endsWith("+xml") || extension.endsWith(".xml")
        ? "xml"
        : contentType === "text/plain" || contentType === "text/csv"
      ? "text"
      : contentType === "text/html" || !contentType
        ? "html"
        : null;
  if (!format) {
    return { state: "unsupported", reason: "unsupported-source-type", originalUrl, resolvedUrl, contentType, redirectChain, extractionLimitations: [`Content type ${contentType} is outside the bounded HTML, text, PDF, JSON, ArcGIS, and XML pipeline.`] };
  }
  return {
    state: "accessible",
    reason: "supported-source-type",
    format,
    originalUrl,
    resolvedUrl,
    canonicalUrl: canonicalizeSourceUrl(resolvedUrl),
    contentType,
    redirectChain,
    retrievalTime: candidate.retrievedAt ?? null,
    passage: typeof candidate.passage === "string" ? candidate.passage.slice(0, 4_000) : null,
    pageOrSection: candidate.pageOrSection ?? candidate.page ?? candidate.section ?? null,
    extractionLimitations: format === "html" ? ["Passage and section references depend on bounded extraction."] : [],
  };
}

function createResearchCancellationError() {
  const error = new Error("Project research was cancelled.");
  error.name = "ResearchCancelledError";
  error.researchErrorType = "cancelled";
  return error;
}

function safeSourceIdentity(value) {
  try {
    const parsed = new URL(value);
    return {
      origin: parsed.origin.slice(0, 240),
      pathname: parsed.pathname.slice(0, 500),
    };
  } catch {
    return { origin: null, pathname: null };
  }
}

function sanitizeTransportText(value, maxLength = 240) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s]+/gi, (url) => {
      const identity = safeSourceIdentity(url);
      return identity.origin ? `${identity.origin}${identity.pathname}` : "[redacted-url]";
    })
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/\borg-[A-Za-z0-9_-]+\b/g, "org-[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(api[_ -]?key|authorization|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function transportErrorDetails(error) {
  const cause = error?.cause;
  const safeCode = (value) => typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(value)
    ? value
    : null;
  return {
    errorName: safeCode(error?.name) ?? "Error",
    errorCode: safeCode(error?.code),
    errorMessage: sanitizeTransportText(error?.message),
    causeName: safeCode(cause?.name),
    causeCode: safeCode(cause?.code),
    causeMessage: sanitizeTransportText(cause?.message),
  };
}

function buildTransportDiagnostic({
  stage,
  url,
  startedAtMs,
  responseReceived = false,
  response = null,
  redirectChain = [],
  error = null,
  cancelled = false,
  timedOut = false,
}) {
  const identity = safeSourceIdentity(url);
  return {
    stage,
    sourceOrigin: identity.origin,
    sourcePathname: identity.pathname,
    elapsedMs: Math.max(0, Date.now() - startedAtMs),
    responseReceived,
    httpStatus: Number.isInteger(response?.status) ? response.status : null,
    contentType: response?.headers?.get?.("content-type")?.split(";")[0]?.trim()?.toLowerCase() ?? null,
    redirectChain: redirectChain.map((item) => {
      const redirectIdentity = safeSourceIdentity(item);
      return redirectIdentity.origin ? `${redirectIdentity.origin}${redirectIdentity.pathname}` : null;
    }).filter(Boolean).slice(0, RESEARCH_DOCUMENT_MAX_REDIRECTS),
    cancelled,
    timedOut,
    ...(error ? transportErrorDetails(error) : {}),
  };
}

function throwIfResearchCancelled(signal) {
  if (signal?.aborted) throw createResearchCancellationError();
}

async function awaitWithResearchSignal(promise, signal) {
  if (!signal) return promise;
  throwIfResearchCancelled(signal);
  let onAbort;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        onAbort = () => reject(createResearchCancellationError());
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function accessResearchDocument(candidate = {}, {
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  maxBytes = RESEARCH_DOCUMENT_MAX_BYTES,
  maxRedirects = RESEARCH_DOCUMENT_MAX_REDIRECTS,
  signal,
  dnsLookup = dns.lookup,
  ocrImpl,
} = {}) {
  const documentStartedAtMs = Date.now();
  throwIfResearchCancelled(signal);
  const initial = evaluateResearchDocumentAccess(candidate);
  if (initial.state !== "accessible") return initial;
  let currentUrl = initial.resolvedUrl;
  const redirectChain = [];
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    throwIfResearchCancelled(signal);
    let response;
    const requestStartedAtMs = Date.now();
    try {
      const requestInit = {
        method: "GET",
        headers: { accept: "text/html, text/plain, application/json, application/geo+json, application/xml, text/xml, application/pdf" },
        redirect: "manual",
        signal,
      };
      response = fetchImpl === fetch
        ? await fetchPinnedPublicUrl(currentUrl, requestInit, dnsLookup)
        : await fetchImpl(currentUrl, requestInit);
    } catch (error) {
      if (error?.name === "ResearchCancelledError" || signal?.aborted) {
        const cancellation = createResearchCancellationError();
        cancellation.transportDiagnostic = buildTransportDiagnostic({
          stage: "request",
          url: currentUrl,
          startedAtMs: requestStartedAtMs,
          redirectChain,
          error,
          cancelled: true,
          timedOut: signal?.reason?.name === "TimeoutError",
        });
        throw cancellation;
      }
      return {
        ...initial,
        state: "blocked",
        reason: error?.message === "private-destination" ? "private-destination" : "network-failure",
        resolvedUrl: currentUrl,
        redirectChain,
        transportDiagnostic: buildTransportDiagnostic({
          stage: error?.message === "private-destination" ? "dns-validation" : "request",
          url: currentUrl,
          startedAtMs: requestStartedAtMs,
          redirectChain,
          error,
        }),
        extractionLimitations: ["The destination could not be retrieved by the bounded server reader."],
      };
    }
    throwIfResearchCancelled(signal);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      const safeLocation = safePublicSourceUrl(location ? new URL(location, currentUrl).href : null);
      if (!safeLocation || redirect === maxRedirects) {
        return {
          ...initial,
          state: "blocked",
          reason: "redirect-limit",
          resolvedUrl: currentUrl,
          redirectChain,
          extractionLimitations: ["Redirect chain exceeded the bounded access limit or supplied an unsafe destination."],
        };
      }
      redirectChain.push(safeLocation);
      currentUrl = safeLocation;
      continue;
    }
    if (!response.ok) {
      return {
        ...initial,
        state: "blocked",
        reason: `http-${response.status}`,
        resolvedUrl: currentUrl,
        redirectChain,
        transportDiagnostic: buildTransportDiagnostic({
          stage: "response",
          url: currentUrl,
          startedAtMs: requestStartedAtMs,
          responseReceived: true,
          response,
          redirectChain,
        }),
        extractionLimitations: [`The destination returned HTTP ${response.status}; no passage was retained.`],
      };
    }
    const contentType = response.headers?.get?.("content-type") ?? candidate.contentType ?? null;
    const contentLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ...initial, state: "blocked", reason: "size-limit", resolvedUrl: currentUrl, redirectChain, contentType, extractionLimitations: [`Document exceeds the ${maxBytes}-byte access limit.`] };
    }
    let bytes;
    try {
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const cancelReader = () => { void reader.cancel(); };
        signal?.addEventListener("abort", cancelReader, { once: true });
        const chunks = [];
        let total = 0;
        try {
          while (true) {
            throwIfResearchCancelled(signal);
            const part = await reader.read();
            if (part.done) break;
            total += part.value.byteLength;
            if (total > maxBytes) {
              await reader.cancel();
              throw new Error("size-limit");
            }
            chunks.push(Buffer.from(part.value));
          }
        } finally {
          signal?.removeEventListener("abort", cancelReader);
        }
        bytes = Buffer.concat(chunks, total);
      } else {
        const buffered = await awaitWithResearchSignal(response.arrayBuffer(), signal);
        if (buffered.byteLength > maxBytes) throw new Error("size-limit");
        bytes = Buffer.from(buffered);
      }
    } catch (error) {
      if (error?.name === "ResearchCancelledError" || signal?.aborted) throw createResearchCancellationError();
      return {
        ...initial,
        state: "blocked",
        reason: error?.message === "size-limit" ? "size-limit" : "read-failure",
        resolvedUrl: currentUrl,
        redirectChain,
        contentType,
        transportDiagnostic: buildTransportDiagnostic({
          stage: "body-read",
          url: currentUrl,
          startedAtMs: requestStartedAtMs,
          responseReceived: true,
          response,
          redirectChain,
          error,
        }),
        extractionLimitations: ["The bounded reader stopped before retaining the complete response."],
      };
    }
    const format = evaluateResearchDocumentAccess({ ...candidate, resolvedUrl: currentUrl, contentType, accessStatus: "open", redirectChain }).format;
    if (!format) return { ...initial, state: "unsupported", reason: "unsupported-source-type", resolvedUrl: currentUrl, redirectChain, contentType, extractionLimitations: ["The response content type is outside the bounded reader."] };
    throwIfResearchCancelled(signal);
    const extraction = await extractResearchDocument({
      bytes,
      contentType,
      sourceUrl: currentUrl,
      format: format === "text-pdf" ? "pdf" : format,
    }, { ocrImpl });
    throwIfResearchCancelled(signal);
    const passage = extraction.passage;
    if (!passage) {
      return {
        ...initial,
        state: "unsupported",
        reason: extraction.outcome === "underlying-document"
          ? "underlying-document"
          : format === "text-pdf" ? "scanned-pdf" : extraction.outcome === "malformed" ? "malformed-document" : "empty-passage",
        format,
        resolvedUrl: currentUrl,
        canonicalUrl: canonicalizeSourceUrl(currentUrl),
        redirectChain,
        contentType,
        retrievalTime: now(),
        contentHash: extraction.contentHash,
        extractionMethod: extraction.extractionMethod,
        extractionOutcome: extraction.outcome,
        underlyingDocumentUrl: extraction.underlyingDocumentUrl,
        candidateLinks: extraction.candidateLinks,
        transportDiagnostic: buildTransportDiagnostic({
          stage: "extraction",
          url: currentUrl,
          startedAtMs: documentStartedAtMs,
          responseReceived: true,
          response,
          redirectChain,
        }),
        extractionLimitations: extraction.limitations,
      };
    }
    return {
      ...initial,
      state: "accessible",
      reason: "retrieved",
      format,
      originalUrl: initial.originalUrl,
      resolvedUrl: currentUrl,
      canonicalUrl: canonicalizeSourceUrl(currentUrl),
      contentType,
      redirectChain,
      retrievalTime: now(),
      contentHash: extraction.contentHash,
      extractionMethod: extraction.extractionMethod,
      extractionOutcome: extraction.outcome,
      candidateLinks: extraction.candidateLinks,
      transportDiagnostic: buildTransportDiagnostic({
        stage: "complete",
        url: currentUrl,
        startedAtMs: documentStartedAtMs,
        responseReceived: true,
        response,
        redirectChain,
      }),
      passage,
      pageOrSection: null,
      extractionLimitations: [
        ...extraction.limitations,
        ...(format === "text-pdf"
          ? ["Page references are unavailable from the bounded text extractor."]
          : format === "html"
            ? ["HTML section references depend on the captured passage."]
            : ["Structured-field references depend on the captured passage."]),
      ],
    };
  }
  return { ...initial, state: "blocked", reason: "redirect-limit", redirectChain, extractionLimitations: ["Redirect chain exceeded the bounded access limit."] };
}

function categoryQueryMatches(category, query) {
  const normalized = String(query ?? "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes(category.categoryId.replaceAll("-", " ")) || normalized.includes(category.label.toLowerCase())) return true;
  return [category.requestedPrimaryQuery]
    .filter(Boolean)
    .some((plannedQuery) => normalized.includes(String(plannedQuery).toLowerCase()));
}

function categoryStageCounts(category, sources, evidence, project = {}) {
  const sourceCandidates = sources.filter((source) => categorySourceMatches(category, source));
  const categoryEvidence = evidence.filter((item) => category.evidenceIds.includes(item.id));
  const mapped = categoryEvidence.filter((item) => (item.claimMappings ?? []).some((mapping) => mapping.supportStatus !== "context-only"));
  const eligible = categoryEvidence.filter((item) => item.eligibleForModel === true);
  const allEvidenceEligible = category.evidenceIds.length
    ? category.evidenceIds.every((id) => categoryEvidence.some((item) => item.id === id && item.eligibleForModel === true))
    : sourceCandidates.some((source) =>
      source.accessOutcome?.state === "accessible"
      && (source.exactProject === true || isSourceProjectSpecific(source, project)));
  const rejectionReasons = categoryEvidence.flatMap((item) => item.quarantineReasons ?? []);
  const openedDocuments = categoryOpenedDocuments(sourceCandidates, category);
  return {
    normalized: sourceCandidates.length,
    accessed: sourceCandidates.filter((source) => source.accessOutcome?.state === "accessible").length,
    parsed: sourceCandidates.filter((source) => source.parsingState === "parsed" || source.accessOutcome?.passage).length,
    claimMapped: mapped.length,
    eligible: eligible.length,
    retainedCandidates: sourceCandidates.filter((source) =>
      ["retained", "redirected", "claim-supported", "project-specific", "evidence-mapped"].includes(source.sourceState)).length,
    candidates: sourceCandidates.length,
    attemptedRetrievals: openedDocuments.filter((document) => document.attempted === true).length,
    successfulAccesses: openedDocuments.filter((document) => document.accessState === "accessible").length,
    retainedPassages: openedDocuments.filter((document) => Boolean(document.retainedPassage)).length,
    reusedReceipts: openedDocuments.filter((document) => document.reusedReceipt === true).length,
    notAttempted: openedDocuments.filter((document) => document.attempted !== true && document.reusedReceipt !== true).length,
    allEvidenceEligible,
    rejectionCounts: Object.fromEntries([...new Set(rejectionReasons)].map((reason) => [
      reason,
      rejectionReasons.filter((candidate) => candidate === reason).length,
    ])),
  };
}

function categoryReturnedDomains(sources = []) {
  return [...new Set(sources.map((source) => sourceHostname(source)).filter(Boolean))];
}

function categorySourceMatches(category, source) {
  if (!category || !source) return false;
  if (source.searchDomain === category.categoryId) return true;
  if (Array.isArray(source.supportedEvidenceIds)
    && source.supportedEvidenceIds.some((id) => category.evidenceIds.includes(id))) return true;
  if (category.categoryId !== "project-identity") return false;
  return [source.identityRole, source.sourceRole, source.categoryRole]
    .some((role) => typeof role === "string" && /\b(identity|project identity|facility identity)\b/i.test(role));
}

function categoryOpenedDocuments(sources = [], category = null) {
  return sources.map((source) => {
    const outcome = source.accessOutcome ?? {};
    const referringUrls = [...new Set([
      ...(Array.isArray(outcome.referringUrls) ? outcome.referringUrls : []),
      ...(Array.isArray(source.documentReferringUrls) ? source.documentReferringUrls : []),
      source.originalUrl ?? source.url,
    ].filter(Boolean))];
    return {
      sourceChannel: source.sourceChannel ?? source.origin ?? "provider",
      originalUrl: source.originalUrl ?? source.url ?? null,
      referringUrls,
      resolvedUrl: outcome.resolvedUrl ?? source.resolvedUrl ?? source.url ?? null,
      canonicalUrl: outcome.canonicalUrl ?? source.canonicalUrl ?? source.url ?? null,
      opened: source.documentAccessReused !== true && Number.isInteger(outcome.physicalOpenIndex),
      attempted: source.documentAccessReused !== true && Number.isInteger(outcome.physicalOpenIndex),
      reusedReceipt: source.documentAccessReused === true,
      reusedFromCanonicalUrl: source.documentAccessReused === true
        ? outcome.canonicalUrl ?? source.canonicalUrl ?? source.url ?? null
        : null,
      accessState: outcome.state ?? "blocked",
      accessOutcome: outcome.reason ?? "not-attempted",
      extractionMethod: outcome.extractionMethod ?? null,
      extractionOutcome: outcome.extractionOutcome ?? null,
      contentHash: outcome.contentHash ?? null,
      retainedPassage: outcome.state === "accessible" ? outcome.passage ?? source.excerpt ?? null : null,
      extractionLimitations: Array.isArray(outcome.extractionLimitations) ? outcome.extractionLimitations.slice(0, 8) : [],
      ...(category ? {
        categoryId: category.categoryId,
        categoryLabel: category.label,
        identityRole: source.identityRole ?? source.sourceRole ?? null,
      } : {}),
    };
  });
}

function buildResearchAudit({
  project,
  coverage = {},
  sources = [],
  evidence = [],
  responseId = null,
  startedAt = null,
  finishedAt = null,
  runCorrelationId = null,
} = {}) {
  coverage = isRecord(coverage) ? coverage : {};
  const plan = buildResearchCategoryPlan(project);
  const observedQueries = normalizeSearchTerms(coverage.searchTerms, RESEARCH_PROJECT_MAX_TOOL_CALLS);
  const executions = isRecord(coverage.categoryExecutions) ? coverage.categoryExecutions : {};
  const categories = plan.categories.map((category) => {
    const supplied = isRecord(executions[category.categoryId]) ? executions[category.categoryId] : {};
    const executedQueries = normalizeSearchTerms(
      supplied.executedQueries ?? observedQueries.filter((query) => categoryQueryMatches(category, query)),
      (RESEARCH_RUN_BUDGET.maxFollowUpsPerCategory ?? 1) + 1,
    );
    const counts = {
      ...categoryStageCounts(category, sources, evidence, project),
      issuedProviderRequests: Number.isInteger(supplied.providerRequestCount) ? Math.max(0, supplied.providerRequestCount) : 0,
      observedSearches: normalizeSearchTerms([
        ...(Array.isArray(supplied.providerObservedPrimaryQueries) ? supplied.providerObservedPrimaryQueries : []),
        ...(Array.isArray(supplied.providerObservedFollowUpQueries) ? supplied.providerObservedFollowUpQueries : []),
      ], RESEARCH_PROJECT_MAX_TOOL_CALLS).length,
    };
    counts.successfulExtractions = counts.retainedPassages;
    const primaryWasIssued = typeof supplied.issuedPrimaryQuery === "string";
    const explicitFailureState = ["Provider failure", "Timed out", "Not searched"].includes(supplied.state)
      && !(supplied.state === "Not searched" && primaryWasIssued)
      ? supplied.state
      : null;
    const state = explicitFailureState ?? (
      counts.allEvidenceEligible ? "Complete"
        : counts.claimMapped > 0 || counts.retainedCandidates > 0 ? "Partial"
          : executedQueries.length || primaryWasIssued ? "No eligible evidence"
            : "Not searched"
    );
    const sourceChannelTelemetry = Array.isArray(supplied.sourceChannelTelemetry)
      ? supplied.sourceChannelTelemetry.slice(0, 80).map((entry) => ({
        sourceChannel: sanitizeTransportText(entry.sourceChannel, 120) || "provider",
        outcome: sanitizeTransportText(entry.outcome, 80) || "unknown",
        reason: sanitizeTransportText(entry.reason, 120) || null,
      }))
      : [];
    const noReturnEntries = sourceChannelTelemetry.filter((entry) => entry.outcome !== "candidate");
    return {
      categoryId: category.categoryId,
      label: category.label,
      evidenceIds: category.evidenceIds,
      requestedPrimaryQuery: category.requestedPrimaryQuery,
      plannedPrimaryQuery: category.plannedPrimaryQuery,
      issuedPrimaryQuery: typeof supplied.issuedPrimaryQuery === "string" ? supplied.issuedPrimaryQuery : null,
      executedQueries,
      providerObservedPrimaryQueries: normalizeSearchTerms(supplied.providerObservedPrimaryQueries, 8),
      optionalFollowUpQuery: supplied.optionalFollowUpQuery ?? category.optionalFollowUpQuery,
      plannedFollowUpQuery: category.plannedFollowUpQuery,
      issuedFollowUpQuery: typeof supplied.issuedFollowUpQuery === "string" ? supplied.issuedFollowUpQuery : null,
      providerObservedFollowUpQueries: normalizeSearchTerms(supplied.providerObservedFollowUpQueries, 8),
      followUpExecutedQuery: typeof supplied.followUpExecutedQuery === "string" ? supplied.followUpExecutedQuery : null,
      followUpCount: Number.isInteger(supplied.followUpCount) ? Math.max(0, supplied.followUpCount) : (supplied.followUpExecutedQuery ? 1 : 0),
      followUpLimit: RESEARCH_RUN_BUDGET.maxFollowUpsPerCategory,
      followUpTriggerEvidenceIds: Array.isArray(supplied.followUpTriggerEvidenceIds) ? supplied.followUpTriggerEvidenceIds.filter((id) => category.evidenceIds.includes(id)).slice(0, 8) : [],
      followUpSkipReason: supplied.followUpSkipReason ?? (category.evidenceIds.length ? "no-justified-gap" : "evidence-resolved"),
      authorityTargets: category.authorityTargets,
      identityContext: category.identityContext,
      identityAmbiguities: category.identityContext?.ambiguities ?? [],
      localAuthorities: category.authorityTargets?.localAuthorities ?? [],
      authorityLimitations: category.authorityTargets?.limitations ?? [],
      returnedDomains: Array.isArray(supplied.returnedDomains) ? supplied.returnedDomains.filter(Boolean).slice(0, 20) : categoryReturnedDomains(sources.filter((source) => categorySourceMatches(category, source))),
      openedDocuments: Array.isArray(supplied.openedDocuments)
        ? supplied.openedDocuments.slice(0, 20).map((document) => ({
          ...document,
          categoryId: document.categoryId ?? category.categoryId,
          categoryLabel: document.categoryLabel ?? category.label,
          identityRole: document.identityRole ?? (category.categoryId === "project-identity" ? document.sourceRole ?? null : null),
        }))
        : categoryOpenedDocuments(sources.filter((source) => categorySourceMatches(category, source)), category),
      state,
      stageCounts: counts,
      rejectionCounts: counts.rejectionCounts,
      accessLimitations: Array.isArray(supplied.accessLimitations) ? supplied.accessLimitations.slice(0, 8) : [],
       unresolvedGaps: counts.allEvidenceEligible
         ? []
         : category.evidenceIds.length
           ? category.evidenceIds.filter((id) => !evidence.some((item) => item.id === id && item.eligibleForModel))
           : [category.categoryId],
      providerFailure: supplied.providerFailure ?? null,
      providerFailureType: supplied.providerFailureType ?? null,
      providerRequestCount: counts.issuedProviderRequests,
      providerAttempts: Array.isArray(supplied.providerAttempts) ? supplied.providerAttempts.slice(0, 3) : [],
      sourceChannelTelemetry,
      noReturnCounts: {
        total: noReturnEntries.length,
        missingUrl: noReturnEntries.filter((entry) => entry.reason === "missing-url").length,
        unsafeUrl: noReturnEntries.filter((entry) => entry.reason === "unsafe-url").length,
        noPublicUrl: noReturnEntries.filter((entry) => entry.reason === "no-public-url").length,
        byChannel: Object.fromEntries([...new Set(noReturnEntries.map((entry) => entry.sourceChannel))]
          .slice(0, 20)
          .map((channel) => [channel, noReturnEntries.filter((entry) => entry.sourceChannel === channel).length])),
      },
      authorityRecords: Array.isArray(supplied.authorityRecords) ? supplied.authorityRecords.slice(0, 24).map((authority) => ({
        name: sanitizeTransportText(authority.name, 200),
        domain: typeof authority.domain === "string" ? sanitizeTransportText(authority.domain, 160) : null,
        jurisdiction: sanitizeTransportText(authority.jurisdiction, 160),
        establishmentMethod: sanitizeTransportText(authority.establishmentMethod, 120),
        discoveredAt: sanitizeTransportText(authority.discoveredAt, 80),
        sourceChannel: sanitizeTransportText(authority.sourceChannel, 120),
        urlsAttempted: Array.isArray(authority.urlsAttempted) ? authority.urlsAttempted.map(safePublicSourceUrl).filter(Boolean).slice(0, 12) : [],
        accessOutcomes: Array.isArray(authority.accessOutcomes) ? authority.accessOutcomes.slice(0, 12).map((outcome) => ({
          url: safePublicSourceUrl(outcome.url),
          status: sanitizeTransportText(outcome.status, 80),
          httpStatus: Number.isInteger(outcome.httpStatus) ? outcome.httpStatus : null,
          physicalOpenIndex: Number.isInteger(outcome.physicalOpenIndex) ? outcome.physicalOpenIndex : null,
        })) : [],
      })) : [],
      discoveryAttempts: Array.isArray(supplied.discoveryAttempts) ? supplied.discoveryAttempts.slice(0, 24).map((attempt) => ({
        sourceChannel: sanitizeTransportText(attempt.sourceChannel ?? "official-domain-discovery", 80),
        url: safePublicSourceUrl(attempt.url),
        status: sanitizeTransportText(attempt.status, 80),
        httpStatus: Number.isInteger(attempt.httpStatus) ? attempt.httpStatus : null,
        contentType: sanitizeTransportText(attempt.contentType, 120),
        physicalOpenIndex: Number.isInteger(attempt.physicalOpenIndex) ? attempt.physicalOpenIndex : null,
      })) : [],
      secConnectorAttempts: Array.isArray(supplied.secConnectorAttempts) ? supplied.secConnectorAttempts.slice(0, 12).map((attempt) => ({
        sourceChannel: "sec-public-data",
        sourceOrigin: safeSourceIdentity(attempt.sourceOrigin).origin,
        sourcePathname: sanitizeTransportText(attempt.sourcePathname, 500),
        status: Number.isInteger(attempt.status) ? attempt.status : null,
        outcome: sanitizeTransportText(attempt.outcome, 80),
        reason: sanitizeTransportText(attempt.reason, 160),
      })) : [],
    };
  });
  return {
    version: RESEARCH_CATEGORY_AUDIT_VERSION,
    policyVersion: RESEARCH_POLICY_VERSION,
    provider: coverage.provider ?? "openai",
    model: coverage.model ?? RESEARCH_PROJECT_MODEL,
    providerResponseId: responseId ?? coverage.providerResponseIds?.[0] ?? null,
    terminalState: coverage.terminalState ?? null,
    runCorrelationId,
    providerResponseIds: Array.isArray(coverage.providerResponseIds) ? coverage.providerResponseIds.filter(Boolean).slice(0, 16) : [],
    startedAt,
    finishedAt,
    budget: { ...RESEARCH_RUN_BUDGET },
    elapsedMs: startedAt && finishedAt ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) : null,
    toolCallCount: Number.isInteger(coverage.toolCallCount)
      ? Math.min(RESEARCH_RUN_BUDGET.maxToolCalls, Math.max(0, coverage.toolCallCount))
      : 0,
    providerRequestCount: Number.isInteger(coverage.providerRequestCount) ? coverage.providerRequestCount : 0,
    providerAttempts: Array.isArray(coverage.providerAttempts) ? coverage.providerAttempts.slice(0, RESEARCH_RUN_BUDGET.maxProviderRequests) : [],
    physicalOpenBudget: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
    physicalOpensUsed: Number.isInteger(coverage.physicalOpensUsed) ? coverage.physicalOpensUsed : 0,
    physicalOpensRemaining: Math.max(0, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens - (Number.isInteger(coverage.physicalOpensUsed) ? coverage.physicalOpensUsed : 0)),
    physicalOpenBudgetExceeded: coverage.physicalOpenBudgetExceeded === true,
    followUpCount: Number.isInteger(coverage.followUpCount)
      ? Math.max(0, coverage.followUpCount)
      : categories.reduce((total, category) => total + category.followUpCount, 0),
    followUpLimit: RESEARCH_RUN_BUDGET.maxFollowUps,
    followUpLimitPerCategory: RESEARCH_RUN_BUDGET.maxFollowUpsPerCategory,
    categories,
    categoryGaps: categories.filter((category) => category.state !== "Complete").map((category) => category.categoryId),
    providerLimitations: Array.isArray(coverage.providerLimitations) ? coverage.providerLimitations.slice(0, 12) : [],
  };
}

async function orchestrateCategoryResearch(project, {
  retrieveCategory,
  now = () => Date.now(),
  budget = RESEARCH_RUN_BUDGET,
  signal,
  deadlineState = { expired: false },
  concurrent = false,
  categoryIds = null,
} = {}) {
  if (typeof retrieveCategory !== "function") throw new Error("A bounded category retrieval function is required.");
  const startedAtMs = now();
  const categoryExecutions = {};
  const candidates = [];
  const categoryResults = [];
  let providerRequests = 0;
  let followUps = 0;
  let lastError = null;
  let toolCalls = 0;
  let toolCallBudgetExceeded = false;
  let physicalOpenBudgetExceeded = false;
  const resolvedEvidenceIds = new Set();
  const plannedCategories = buildResearchCategoryPlan(project).categories;
  const categories = Array.isArray(categoryIds) && categoryIds.length
    ? plannedCategories.filter((category) => categoryIds.includes(category.categoryId))
    : plannedCategories;
  const prefetchedPrimary = new Map();
  const prefetchPrimaryCategories = (targetCategories) => {
    for (const category of targetCategories) {
      const index = categories.findIndex((candidate) => candidate.categoryId === category.categoryId);
      if (
        index < 0
        || index >= budget.maxProviderRequests
        || prefetchedPrimary.has(category.categoryId)
        || deadlineState.expired
        || signal?.aborted
      ) continue;
      const primaryPromise = Promise.resolve(retrieveCategory({
        categoryId: category.categoryId,
        query: category.requestedPrimaryQuery,
        attempt: "primary",
        remainingMs: Math.max(0, budget.deadlineMs - (now() - startedAtMs)),
        remainingToolCalls: Math.max(1, Math.floor(budget.maxToolCalls / categories.length)),
        authorizeAdditionalProviderRequest: authorizeAdditionalRequest,
      }));
      primaryPromise.catch(() => {});
      prefetchedPrimary.set(category.categoryId, primaryPromise);
    }
  };
  let additionalRequestsAuthorized = 0;
  const authorizeAdditionalRequest = () => {
    // All category primaries are a hard reservation. Repairs and follow-ups
    // may use only the request slots left after that reservation.
    if (categories.length + additionalRequestsAuthorized >= budget.maxProviderRequests) return false;
    additionalRequestsAuthorized += 1;
    return true;
  };
  if (concurrent) {
    // Project identity gets the first physical-open opportunity. Remaining
    // primaries begin only after that bounded category reaches a terminal
    // result, preserving the same run-wide ceiling and deadline.
    const identityCategory = categories.find((category) => category.categoryId === "project-identity");
    prefetchPrimaryCategories(identityCategory ? [identityCategory] : categories);
  }
  for (const [categoryIndex, category] of categories.entries()) {
    if (signal?.aborted && !deadlineState.expired) {
      const error = new Error("Project research was cancelled.");
      error.name = "ResearchCancelledError";
      error.researchErrorType = "cancelled";
      throw error;
    }
    const elapsed = now() - startedAtMs;
    const issuedPrimary = prefetchedPrimary.has(category.categoryId);
    if (!issuedPrimary && (physicalOpenBudgetExceeded || deadlineState.expired || elapsed >= budget.deadlineMs || toolCalls >= budget.maxToolCalls || providerRequests >= budget.maxProviderRequests)) {
      categoryExecutions[category.categoryId] = {
        issuedPrimaryQuery: null,
        providerObservedPrimaryQueries: [],
        issuedFollowUpQuery: null,
        providerObservedFollowUpQueries: [],
        followUpTriggerEvidenceIds: [],
        followUpSkipReason: physicalOpenBudgetExceeded ? "physical-open-budget" : elapsed >= budget.deadlineMs ? "deadline" : toolCalls >= budget.maxToolCalls ? "tool-call-budget" : "provider-request-budget",
        returnedDomains: [],
        openedDocuments: [],
        state: elapsed >= budget.deadlineMs || deadlineState.expired || toolCalls >= budget.maxToolCalls ? "Timed out" : "Not searched",
        executedQueries: [],
        unresolvedGaps: category.evidenceIds,
        providerFailure: null,
        providerFailureType: null,
        providerRequestCount: 0,
      };
      continue;
    }
    const executedQueries = [];
    let categoryCandidates = [];
    let followUpWasRun = false;
    let primaryAdditionalRequestsAuthorized = 0;
    let state = "No eligible evidence";
    let providerFailure = null;
    const categoryResolvedEvidenceIds = new Set();
    const execution = {
      issuedPrimaryQuery: category.requestedPrimaryQuery,
      providerObservedPrimaryQueries: [],
      issuedFollowUpQuery: null,
      providerObservedFollowUpQueries: [],
      followUpTriggerEvidenceIds: [],
      followUpSkipReason: null,
      returnedDomains: [],
      openedDocuments: [],
      providerRequestCount: 0,
      providerFailureType: null,
      providerAttempts: [],
      discoveryAttempts: [],
      authorityRecords: [],
      secConnectorAttempts: [],
      sourceChannelTelemetry: [],
    };
    try {
      if (!concurrent) providerRequests += 1;
      const primary = await (prefetchedPrimary.get(category.categoryId) ?? retrieveCategory({
        categoryId: category.categoryId,
        query: category.requestedPrimaryQuery,
        attempt: "primary",
        remainingMs: Math.max(0, budget.deadlineMs - (now() - startedAtMs)),
        remainingToolCalls: Math.max(0, budget.maxToolCalls - toolCalls),
        authorizeAdditionalProviderRequest: () => {
          const remainingPrimaries = categories.length - categoryIndex - 1;
          if (providerRequests + 1 + remainingPrimaries > budget.maxProviderRequests) return false;
          providerRequests += 1;
          primaryAdditionalRequestsAuthorized += 1;
          return true;
        },
      }));
       const primaryRequestCost = Number.isInteger(primary?.providerRequestCount)
         ? Math.max(1, primary.providerRequestCount)
         : 1;
      if (concurrent) providerRequests += primaryRequestCost;
      else providerRequests += Math.max(0, primaryRequestCost - 1 - primaryAdditionalRequestsAuthorized);
      execution.providerRequestCount += primaryRequestCost;
      execution.providerAttempts.push(...(Array.isArray(primary?.providerAttempts) ? primary.providerAttempts : []));
      execution.discoveryAttempts.push(...(Array.isArray(primary?.discoveryAttempts) ? primary.discoveryAttempts : []));
      execution.authorityRecords.push(...(Array.isArray(primary?.authorityRecords) ? primary.authorityRecords : []));
      execution.secConnectorAttempts.push(...(Array.isArray(primary?.secConnectorAttempts) ? primary.secConnectorAttempts : []));
      execution.sourceChannelTelemetry.push(...(Array.isArray(primary?.sourceChannelTelemetry) ? primary.sourceChannelTelemetry : []));
      if (signal?.aborted) {
        const error = new Error("Project research was cancelled.");
        error.name = "ResearchCancelledError";
        error.researchErrorType = "cancelled";
        throw error;
      }
      const primaryToolCalls = Number.isInteger(primary?.toolCallCount) ? Math.max(0, primary.toolCallCount) : 0;
      if (primaryToolCalls > budget.maxToolCalls - toolCalls) toolCallBudgetExceeded = true;
      toolCalls = Math.min(budget.maxToolCalls, toolCalls + primaryToolCalls);
      if (primary?.categoryResult) categoryResults.push(primary.categoryResult);
      else categoryResults.push({ categoryId: category.categoryId, ...primary });
      const primaryObservedQueries = Array.isArray(primary?.observedQueries) ? primary.observedQueries : [];
      execution.providerObservedPrimaryQueries = primaryObservedQueries;
      executedQueries.push(...primaryObservedQueries);
      categoryCandidates = Array.isArray(primary?.candidates) ? primary.candidates.slice(0, budget.maxCandidatesPerCategory) : [];
      candidates.push(...categoryCandidates);
      (Array.isArray(primary?.resolvedEvidenceIds) ? primary.resolvedEvidenceIds : []).forEach((id) => {
        resolvedEvidenceIds.add(id);
        categoryResolvedEvidenceIds.add(id);
      });
      execution.returnedDomains = categoryReturnedDomains(categoryCandidates);
      execution.openedDocuments = categoryOpenedDocuments(categoryCandidates);
      execution.accessLimitations = [...new Set(categoryCandidates.flatMap((source) => source.accessOutcome?.extractionLimitations ?? []))].slice(0, 8);
      physicalOpenBudgetExceeded ||= primary?.physicalOpenBudgetExceeded === true;
      execution.followUpTriggerEvidenceIds = Array.isArray(primary?.unresolvedEvidenceIds) ? primary.unresolvedEvidenceIds : [];
      const globalEarlyStop = resolvedEvidenceIds.size >= RESEARCH_EVIDENCE_IDS.length;
       // A returned candidate or a zero-evidence response is not success. Only
       // the validated category resolver may close a category.
       const primaryCategoryResolved = primary?.categoryResolved === true;
       // Preserve one primary opportunity for every remaining category before
       // spending shared request slots on a gap repair/follow-up.
       const remainingPrimaryOpportunity = categories.length - categoryIndex - 1;
       const additionalRequestAvailable = concurrent
         ? categories.length + additionalRequestsAuthorized < budget.maxProviderRequests
         : providerRequests + 1 + remainingPrimaryOpportunity <= budget.maxProviderRequests;
      if (primary?.gapDrivenFollowUp === true
        && !globalEarlyStop
        && !primaryCategoryResolved
        && toolCalls < budget.maxToolCalls
        && followUps < budget.maxFollowUps
        && (budget.maxFollowUpsPerCategory ?? 1) > 0
         && providerRequests < budget.maxProviderRequests
         && additionalRequestAvailable
        && !physicalOpenBudgetExceeded
        && now() - startedAtMs < budget.deadlineMs) {
        followUps += 1;
        followUpWasRun = true;
        if (concurrent && !authorizeAdditionalRequest()) {
          followUps -= 1;
          followUpWasRun = false;
          execution.followUpSkipReason = "provider-request-budget";
          throw Object.assign(new Error("Provider request allowance was exhausted before the follow-up could be issued."), {
            name: "ResearchBudgetError",
            researchErrorType: "provider-request-budget",
            providerRequestCount: 0,
          });
        }
        providerRequests += 1;
        execution.providerRequestCount += 1;
        execution.issuedFollowUpQuery = primary?.followUpQuery ?? category.optionalFollowUpQuery;
        const followUp = await retrieveCategory({
          categoryId: category.categoryId,
          query: execution.issuedFollowUpQuery,
          attempt: "follow-up",
          remainingMs: Math.max(0, budget.deadlineMs - (now() - startedAtMs)),
          remainingToolCalls: Math.max(0, budget.maxToolCalls - toolCalls),
        });
         const followUpRequestCost = Number.isInteger(followUp?.providerRequestCount)
           ? Math.max(1, followUp.providerRequestCount)
           : 1;
        providerRequests += followUpRequestCost - 1;
        execution.providerRequestCount += followUpRequestCost - 1;
        execution.providerAttempts.push(...(Array.isArray(followUp?.providerAttempts) ? followUp.providerAttempts : []));
        execution.discoveryAttempts.push(...(Array.isArray(followUp?.discoveryAttempts) ? followUp.discoveryAttempts : []));
        execution.authorityRecords.push(...(Array.isArray(followUp?.authorityRecords) ? followUp.authorityRecords : []));
        execution.secConnectorAttempts.push(...(Array.isArray(followUp?.secConnectorAttempts) ? followUp.secConnectorAttempts : []));
        execution.sourceChannelTelemetry.push(...(Array.isArray(followUp?.sourceChannelTelemetry) ? followUp.sourceChannelTelemetry : []));
        if (signal?.aborted) {
          const error = new Error("Project research was cancelled.");
          error.name = "ResearchCancelledError";
          error.researchErrorType = "cancelled";
          throw error;
        }
        const followUpToolCalls = Number.isInteger(followUp?.toolCallCount) ? Math.max(0, followUp.toolCallCount) : 0;
        if (followUpToolCalls > budget.maxToolCalls - toolCalls) toolCallBudgetExceeded = true;
        toolCalls = Math.min(budget.maxToolCalls, toolCalls + followUpToolCalls);
        if (followUp?.categoryResult) categoryResults.push(followUp.categoryResult);
        else categoryResults.push({ categoryId: category.categoryId, ...followUp });
        const followUpObservedQueries = Array.isArray(followUp?.observedQueries) ? followUp.observedQueries : [];
        execution.providerObservedFollowUpQueries = followUpObservedQueries;
        executedQueries.push(...followUpObservedQueries);
        const followUpCandidates = Array.isArray(followUp?.candidates) ? followUp.candidates.slice(0, budget.maxCandidatesPerCategory - categoryCandidates.length) : [];
        categoryCandidates = [...categoryCandidates, ...followUpCandidates];
        candidates.push(...followUpCandidates);
        categoryExecutions[category.categoryId] = {
          followUpExecutedQuery: followUpObservedQueries[0] ?? null,
          followUpCount: 1,
        };
        execution.returnedDomains = categoryReturnedDomains(categoryCandidates);
        execution.openedDocuments = categoryOpenedDocuments(categoryCandidates);
        execution.accessLimitations = [...new Set(categoryCandidates.flatMap((source) => source.accessOutcome?.extractionLimitations ?? []))].slice(0, 8);
        (Array.isArray(followUp?.resolvedEvidenceIds) ? followUp.resolvedEvidenceIds : []).forEach((id) => {
          resolvedEvidenceIds.add(id);
          categoryResolvedEvidenceIds.add(id);
        });
        execution.followUpSkipReason = followUp?.categoryResolved === true ? null : "category-follow-up-limit";
      } else {
          execution.followUpSkipReason = physicalOpenBudgetExceeded
            ? "physical-open-budget"
            : globalEarlyStop
          ? "early-stop"
          : primaryCategoryResolved
            ? "evidence-resolved"
            : toolCalls >= budget.maxToolCalls || primary?.toolCallBudgetExceeded
              ? "tool-call-budget"
              : now() - startedAtMs >= budget.deadlineMs
                ? "deadline"
                : providerRequests >= budget.maxProviderRequests
                  ? "provider-request-budget"
                  : followUps >= budget.maxFollowUps
                    ? "provider-request-budget"
                    : "no-justified-gap";
      }
      state = categoryCandidates.length ? "Partial" : "No eligible evidence";
       if (primaryCategoryResolved || categoryResults
        .filter((result) => result.categoryId === category.categoryId)
        .some((result) => result.categoryResolved === true) || followUpWasRun) state = "Complete";
       if (followUpWasRun) {
         const followUpResult = categoryResults.filter((result) => result.categoryId === category.categoryId).at(-1);
         const hasSuccessfulCandidate = categoryCandidates.some((candidate) => candidate?.eligible === true);
         state = followUpResult?.categoryResolved === true || hasSuccessfulCandidate
           ? "Complete"
           : categoryCandidates.length ? "Partial" : "No eligible evidence";
       }
    } catch (error) {
      if ((signal?.aborted && !deadlineState.expired) || (error?.name === "ResearchCancelledError" && !deadlineState.expired)) throw error;
      if (Number.isInteger(error?.providerRequestCount)) {
        const alreadyCounted = followUpWasRun
          ? 1
          : concurrent ? 0 : 1 + primaryAdditionalRequestsAuthorized;
        const cost = Math.max(1, error.providerRequestCount);
        providerRequests += Math.max(0, cost - alreadyCounted);
        execution.providerRequestCount += followUpWasRun ? Math.max(0, cost - 1) : cost;
      } else if (concurrent && execution.providerRequestCount === 0) {
        // A rejected prefetched primary still consumed one provider opportunity
        // even when the adapter could not attach structured cost telemetry.
        providerRequests += 1;
        execution.providerRequestCount = 1;
      }
      lastError = error;
      const failure = classifyResearchFailure(error);
      execution.providerFailureType = failure.type === "timeout" ? "deadline" : failure.type;
      execution.providerAttempts.push(...(Array.isArray(error?.providerAttempts) ? error.providerAttempts : []));
      providerFailure = failure.type === "timeout" ? null : failure.message;
      state = categoryCandidates.length
        ? "Partial"
        : failure.type === "timeout" ? "Timed out" : "Provider failure";
      execution.followUpSkipReason = error?.name === "AbortError" ? "deadline" : "provider-failure";
    }
    categoryExecutions[category.categoryId] = {
      ...(categoryExecutions[category.categoryId] ?? {}),
      ...execution,
      state,
      executedQueries,
      providerFailure,
      unresolvedGaps: category.evidenceIds.filter((id) => !categoryResolvedEvidenceIds.has(id)),
    };
    if (concurrent && category.categoryId === "project-identity") {
      prefetchPrimaryCategories(categories.filter((candidate) => candidate.categoryId !== "project-identity"));
    }
    if (!concurrent && (resolvedEvidenceIds.size >= RESEARCH_EVIDENCE_IDS.length || deadlineState.expired)) break;
  }
  const finishedAtMs = now();
  return {
    policyVersion: RESEARCH_POLICY_VERSION,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    elapsedMs: Math.max(0, finishedAtMs - startedAtMs),
    providerRequests,
    toolCalls,
    toolCallBudgetExceeded,
    followUps,
    followUpLimit: budget.maxFollowUps,
    followUpLimitPerCategory: budget.maxFollowUpsPerCategory ?? 1,
    physicalOpensUsed: Number.isInteger(budget.physicalOpensUsed) ? budget.physicalOpensUsed : 0,
    physicalOpenBudgetExceeded,
    resolvedEvidenceIds: [...resolvedEvidenceIds],
    candidates: candidates.slice(0, budget.maxTotalCandidates),
    categoryResults,
    lastError,
    categoryExecutions,
    budget: { ...budget },
  };
}

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
  return isSourceProjectSpecific(source, summary, itemRelevance);
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

function containResearchRecord(item) {
  const reasons = [];
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const hasSource = Boolean(item.sourceUrl) || sources.length > 0;
  const sourceEligibility = evaluateEvidenceSourceEligibility({
    id: item.id,
    sources,
    sourceUrl: item.sourceUrl,
    classification: item.classification,
    sourceSupportConfidence: item.sourceSupportConfidence,
    coverageStatus: item.coverageStatus,
  });
  reasons.push(...sourceEligibility.reasons);
  const researchEligibility = evaluateResearchEvidenceEligibility({
    id: item.id,
    sources,
    sourceUrl: item.sourceUrl,
    sourceRelevance: item.sourceRelevance,
    sourceSupportConfidence: item.sourceSupportConfidence,
    classification: item.classification,
    coverageStatus: item.coverageStatus,
    conflictSummary: item.conflictSummary,
    claimMappings: item.claimMappings,
    semanticValidationStatus: item.semanticValidationStatus,
  });
  reasons.push(...researchEligibility.reasons);
  const rawValue = item.rawValue ?? item.value;
  const rawUnit = item.rawUnit ?? item.unit;
  const semantic = normalizeEvidenceRecord({
    id: item.id,
    value: item.rawValue !== undefined || item.numericValue !== undefined ? rawValue : undefined,
    unit: rawUnit,
    numericValue: item.rawValue === undefined ? item.numericValue : rawValue,
    qualitativeValue: item.qualitativeValue,
    description: item.description,
    citation: item.citation,
    sourceContext: sources.flatMap((source) => [source.title, source.excerpt]).join(" "),
    explicitZero: item.explicitZero === true || (rawValue === 0 && Boolean(item.sourceUrl)),
  });
  reasons.push(...semantic.quarantineReasons);
  if (item.coverageStatus === "conflicting" || item.conflictSummary) reasons.push("Conflicting source coverage requires reviewer resolution.");
  if (item.classification === "Model Inference" || item.classification === "User Assumption") {
    reasons.push(`${item.classification} is not source-backed and cannot activate custom economics.`);
  }
  const eligible = reasons.length === 0;
  return {
    ...item,
    rawValue: item.rawValue ?? item.value,
    rawUnit: item.rawUnit ?? item.unit,
    rawText: item.rawText ?? String(item.value ?? ""),
    normalizedValue: semantic.normalizedValue,
    normalizedUnit: semantic.normalizedUnit,
    ...(typeof semantic.normalizedValue === "number" ? { numericValue: semantic.normalizedValue } : {}),
    ...(typeof semantic.normalizedValue === "string" ? { qualitativeValue: semantic.normalizedValue } : {}),
    normalization: {
      policyVersion: semantic.policyVersion,
      conversion: semantic.conversion,
      validationStatus: semantic.validationStatus,
    },
    semanticValidationStatus: semantic.validationStatus,
    eligibleForModel: eligible && semantic.modelEligible,
    acceptedForModel: false,
    researchState: eligible ? "proposed" : hasSource ? "quarantined" : "retrieved-lead",
    quarantineReasons: [...new Set(reasons)],
    sourceValidation: {
      policyVersion: SOURCE_VALIDATION_POLICY_VERSION,
      state: researchEligibility.state,
      rejectionCodes: researchEligibility.rejectionCodes,
      claimMappings: item.claimMappings ?? [],
    },
  };
}

export function containResearchResult(result) {
  const evidence = (result.evidence ?? []).map(containResearchRecord);
  const sourceLedger = (result.sourceLedger ?? []).map((entry) => {
    const relatedEvidence = evidence.filter((item) =>
      (item.sources ?? []).some((source) =>
        (source.canonicalUrl ?? source.resolvedUrl ?? source.url) === entry.canonicalUrl));
    const eligible = relatedEvidence.some((item) => item.eligibleForModel === true);
    const rejected = relatedEvidence.length > 0 && !eligible;
    return {
      ...entry,
      financialEligibilityState: eligible ? "eligible" : rejected ? "ineligible" : entry.financialEligibilityState ?? "unknown",
      sourceState: eligible ? "financially-eligible" : entry.sourceState,
      transitions: eligible
        ? [...(entry.transitions ?? []), sourceStateTransition(entry.sourceState, "financially-eligible", "Recomputed from contained evidence eligibility.")]
        : entry.transitions,
    };
  });
  const eligibleEvidence = evidence.filter((item) => item.eligibleForModel === true);
  return {
    ...result,
    sourceLedger,
    semanticPolicyVersion: EVIDENCE_SEMANTIC_POLICY_VERSION,
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

function missingResearchEvidence(id) {
  return {
    id,
    label: id.replaceAll("_", " "),
    value: "Not established",
    unit: "Project evidence",
    classification: "Missing Evidence",
    citation: "The completed research categories did not establish a facility-level value for this item.",
    description: "This item remains unresolved because the relevant research category did not return validated data.",
    sourceRole: "Research gap · no validated category result",
    sourceUrl: null,
    sourceUrls: [],
    conflictSummary: null,
    coverageStatus: "searched-no-support",
    numericValue: null,
    modelReportedConfidence: null,
    sourceSupportConfidence: 0,
    classificationReason: "No validated category result established this facility-level value.",
    sourceRelevanceNote: "No validated source was mapped to this claim.",
    sourceRelevance: "unresolved",
    claimPassage: "No validated source passage was retained for this item.",
    facilityScope: "unknown",
    phaseScope: "unknown",
    claimTimePeriod: null,
    searchTerms: [],
    qualitativeValue: null,
  };
}

function createPartialResearchBody(project, categoryResults = []) {
  const firstResearch = categoryResults.find((result) => isRecord(result?.research))?.research;
  const projectSummary = isRecord(firstResearch?.projectSummary)
    ? firstResearch.projectSummary
    : {
        name: project.name,
        location: project.location,
        description: "Research returned partial or invalid category data. Valid findings are retained and unsupported items remain Missing Evidence.",
        capacityMW: normalizeReportedCapacityMW(project.knownData?.capacity) ?? DEFAULT_RESEARCH_CAPACITY_MW,
        capacityProvenance: normalizeReportedCapacityMW(project.knownData?.capacity) !== null
          ? "directory-reported"
          : "standardized-default",
      };
  const evidenceById = new Map(
    categoryResults.flatMap((result) =>
      Array.isArray(result?.research?.evidence)
        ? result.research.evidence.map((item) => [item.id, item])
        : []),
  );
  return {
    projectSummary: {
      name: stringOrFallback(projectSummary.name, project.name, 160),
      location: stringOrFallback(projectSummary.location, project.location, 160),
      description: stringOrFallback(
        projectSummary.description,
        "Research returned partial or invalid category data. Valid findings are retained and unsupported items remain Missing Evidence.",
        8_000,
      ),
      capacityMW: normalizeReportedCapacityMW(project.knownData?.capacity)
        ?? normalizeReportedCapacityMW(projectSummary.capacityMW)
        ?? DEFAULT_RESEARCH_CAPACITY_MW,
      capacityProvenance: normalizeReportedCapacityMW(project.knownData?.capacity) !== null
        ? "directory-reported"
        : normalizeReportedCapacityMW(projectSummary.capacityMW) !== null
          ? "ai-reported"
          : "standardized-default",
    },
    evidence: RESEARCH_EVIDENCE_IDS.map((id) => evidenceById.get(id) ?? missingResearchEvidence(id)),
  };
}

function parseResearchResponse(
  body,
  retrievedSources = [],
  accessedAt = new Date().toISOString().slice(0, 10),
  coverage = null,
  knownData = null,
  expectedEvidenceIds = RESEARCH_EVIDENCE_IDS,
) {
  const scopedEvidenceIds = [...new Set(expectedEvidenceIds.filter((id) => RESEARCH_EVIDENCE_IDS.includes(id)))];
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

  const rawEvidenceCandidates = Array.isArray(body.evidence)
    ? body.evidence
    : Object.entries(body.evidence).map(([id, item]) => ({ id, ...(isRecord(item) ? item : {}) }));
  const evidenceCandidates = scopedEvidenceIds.length === RESEARCH_EVIDENCE_IDS.length
    ? rawEvidenceCandidates
    : rawEvidenceCandidates.filter((item) => scopedEvidenceIds.includes(item?.id));
  if (
    evidenceCandidates.length !== scopedEvidenceIds.length ||
    (scopedEvidenceIds.length === RESEARCH_EVIDENCE_IDS.length
      && (!Array.isArray(body.evidence) && Object.keys(body.evidence).some((id) => !scopedEvidenceIds.includes(id))))
  ) {
    throw new Error(`Research response must contain exactly ${scopedEvidenceIds.length} category evidence records.`);
  }

  const expectedIds = new Set(scopedEvidenceIds);
  const packetLedger = retrievedSources?.sourceLedger
    ? retrievedSources.sourceLedger
    : createSourceLedger(
      Array.isArray(retrievedSources) ? retrievedSources : [],
      { maxRetained: RESEARCH_RUN_BUDGET.maxTotalCandidates },
    );
  const sourcePacket = packetLedger.retained;
  const sourceByUrl = new Map();
  for (const source of sourcePacket) {
    for (const alias of sourceUrlAliases(source)) sourceByUrl.set(alias, source);
  }
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
    const validatedSources = [...new Map([returnedSourceUrl, citedUrl, ...returnedSourceUrls]
      .map((url) => canonicalizeSourceUrl(url))
      .map((url) => [sourceByUrl.get(url)?.canonicalUrl ?? null, sourceByUrl.get(url)])
      .filter(([url, source]) => Boolean(url && source))).values()]
      .sort((left, right) => {
        const leftPriority = isTexasProject(summary)
          ? texasSourcePriority(left)
          : sourcePriority(left?.sourceClass);
        const rightPriority = isTexasProject(summary)
          ? texasSourcePriority(right)
          : sourcePriority(right?.sourceClass);
        return leftPriority - rightPriority
          || String(left.canonicalUrl).localeCompare(String(right.canonicalUrl));
      })
      .slice(0, 4);
    const sourceUrl = validatedSources[0]?.canonicalUrl ?? null;
    const supportingSources = validatedSources.map((metadata) => {
      const jurisdictionExcluded = isJurisdictionallyExcludedSource(metadata, summary);
      const exactProject = !jurisdictionExcluded
        && isExactProjectSource(metadata, { ...summary, knownData }, item.sourceRelevance);
      const resolvedUrl = canonicalizeSourceUrl(
        metadata?.accessOutcome?.canonicalUrl
          ?? metadata?.accessOutcome?.resolvedUrl
          ?? metadata?.resolvedUrl
          ?? metadata?.url
          ?? metadata?.canonicalUrl,
      ) ?? metadata.canonicalUrl;
      return {
        url: resolvedUrl,
        originalUrl: metadata?.originalUrl ?? metadata?.url ?? resolvedUrl,
        resolvedUrl,
        canonicalUrl: canonicalizeSourceUrl(metadata?.canonicalUrl ?? resolvedUrl) ?? resolvedUrl,
        title: typeof metadata?.title === "string" && metadata.title.trim() ? metadata.title.trim().slice(0, 500) : "not provided",
        publisher: new URL(resolvedUrl).hostname.replace(/^www\./, ""),
        publishedAt: normalizePublicDate(metadata?.date),
        accessedAt: normalizePublicDate(accessedAt),
        accessStatus: ["open", "paywall", "registration"].includes(metadata?.accessStatus) ? metadata.accessStatus : "not provided",
        excerpt: stringOrFallback(metadata?.excerpt, "No excerpt returned.", 1_000),
        sourceClass: metadata?.sourceClass ?? classifySource(url, metadata?.title),
        searchDomain: metadata?.searchDomain ?? "project-identity",
        exactProject,
         ...(jurisdictionExcluded ? {
           jurisdictionExcluded: true,
           relevanceNote: "ERCOT is not a project-evidence authority for a non-Texas project.",
         } : {}),
        sourceState: metadata?.sourceState ?? "retained",
        redirectChain: metadata?.redirectChain ?? [],
        contentType: metadata?.contentType ?? null,
          referringUrls: Array.isArray(metadata?.referringUrls) ? metadata.referringUrls : [metadata?.originalUrl ?? resolvedUrl],
         accessOutcome: metadata?.accessOutcome ?? null,
        claimCited: metadata?.claimCited === true,
         supportedEvidenceIds: Array.isArray(metadata?.supportedEvidenceIds) ? metadata.supportedEvidenceIds : [],
         claimSupport: metadata?.claimSupport ?? null,
         claimPassage: item.claimPassage,
         facilityScope: item.facilityScope ?? metadata?.facilityScope ?? "unknown",
         phaseScope: item.phaseScope ?? metadata?.phaseScope ?? "unknown",
         timePeriod: item.claimTimePeriod ?? metadata?.timePeriod ?? null,
         relevanceNote: stringOrFallback(
           jurisdictionExcluded
             ? "ERCOT is not a project-evidence authority for a non-Texas project."
             : metadata?.relevanceNote ?? item.sourceRelevanceNote,
          exactProject
            ? "This retrieved source is mapped to the claim and contains exact-project context."
            : "This retrieved source is mapped to the claim but may provide related context rather than facility-level proof.",
          500,
        ),
        relationship: metadata.canonicalUrl === sourceUrl ? "primary" : item.coverageStatus === "conflicting" ? "conflicting" : "corroborating",
      };
    });
    const claimMappings = buildClaimPassageMappings({
      id,
      sources: supportingSources,
      project: { ...summary, knownData },
      claim: {
        text: item.description,
        description: item.description,
        value: item.value,
        numericValue: item.numericValue,
         claimPassage: item.claimPassage,
        sourceRelevance: item.sourceRelevance,
      },
      coverageStatus: item.coverageStatus,
      conflictSummary: item.conflictSummary,
    });
    const claimSupportedSources = supportingSources.filter((source) =>
      claimMappings.some((mapping) =>
        mapping.sourceId === source.canonicalUrl && mapping.supportStatus === "supported"));
    const supportedByRetrievedSource = supportingSources.length > 0;
    const claimSupported = claimSupportedSources.length > 0;
    const rawClassification = nonEmptyString(item.classification, `evidence[${index}].classification`, 60);
    if (!VALID_CLASSIFICATIONS.includes(rawClassification)) {
      throw new Error(`Research evidence record ${id} has an invalid classification.`);
    }
    const explicitUnknownValue = isExplicitUnknownValue(item.value);
    const classification = claimSupported
      ? rawClassification
      : rawClassification === "Verified Evidence"
        ? "Management Assertion"
        : rawClassification;
    const sourceMismatchNote = !claimSupported && rawClassification === "Verified Evidence"
      ? " AI classification downgraded: no eligible project-specific claim passage was established. Original classification: Verified Evidence."
      : !claimSupported && rawClassification !== "Missing Evidence" && !supportingSources.length
        ? ` Based on AI training knowledge. No retrieved source independently confirmed this claim. Verify before relying on this ${rawClassification} classification.`
        : !claimSupported && rawClassification !== "Missing Evidence"
          ? ` No eligible project-specific claim passage independently confirmed this claim. Verify before relying on this ${rawClassification} classification.`
        : "";
    const record = {
      id,
      label: stringOrFallback(item.label, id.replaceAll("_", " "), 160),
      value: typeof item.value === "number" && Number.isFinite(item.value)
        ? item.value
        : stringOrFallback(item.value, "Not established", 1_000),
      unit: stringOrFallback(item.unit, "Not disclosed", 100),
      ...(item.rawValue !== undefined
        ? {
          rawValue: item.rawValue,
          rawUnit: item.rawUnit ?? item.unit,
          rawText: item.rawText ?? String(item.rawValue ?? ""),
        }
        : {}),
      classification,
      citation: claimSupported
        ? citation
        : supportingSources.length
          ? `No validated claim support for this claim.${sourceMismatchNote} ${citation}`
          : `No validated source match for this claim.${sourceMismatchNote} ${citation}`,
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
      claimMappings,
      sourceValidation: {
        policyVersion: SOURCE_VALIDATION_POLICY_VERSION,
        state: claimSupported ? "claim-supported" : supportingSources.length ? "evidence-mapped" : "discovered",
        rejectionCodes: claimMappings.flatMap((mapping) => mapping.rejectionCodes ?? []),
      },
    };
    const modelReportedConfidence = normalizeModelReportedConfidence(item.modelReportedConfidence);
    if (modelReportedConfidence !== null) record.modelReportedConfidence = modelReportedConfidence;
    const projectSpecificSources = supportingSources.filter((source) =>
      claimMappings.some((mapping) =>
        mapping.sourceId === source.canonicalUrl && mapping.supportStatus !== "context-only"));
    if (projectSpecificSources.length) {
      const metadata = projectSpecificSources[0];
      record.sourceUrl = metadata.url;
      record.sourceTitle = metadata.title;
      record.sourcePublisher = metadata.publisher;
      record.sourcePublishedAt = metadata.publishedAt;
      record.sourceAccessedAt = metadata.accessedAt;
      record.sourceAccessStatus = metadata.accessStatus;
      record.sources = supportingSources;
      const conflictSummary = stringOrFallback(item.conflictSummary, "", 1_000);
      if (record.coverageStatus === "conflicting" && conflictSummary) record.conflictSummary = conflictSummary;
    }
    if (claimSupported && item.numericValue !== undefined && item.numericValue !== null) {
      if (typeof item.numericValue !== "number" || !Number.isFinite(item.numericValue)) {
        throw new Error(`Research evidence record ${id} has an invalid numericValue.`);
      }
      record.numericValue = item.numericValue;
    }
    if (claimSupported && item.qualitativeValue !== undefined && item.qualitativeValue !== null) {
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
    record.sourceRelevance = claimSupportedSources.length
      ? "exact-project"
      : supportingSources.length ? "related-context"
      : "unresolved";
    record.classificationReason = stringOrFallback(
      item.classificationReason,
      defaultClassificationReason(record.classification, supportedByRetrievedSource, record.sourceSupportConfidence),
      500,
    );
    return record;
  });

  const auditedSourceLedger = packetLedger.ledger.map((entry) => {
    const matchingEvidence = evidence.filter((item) =>
      (item.sources ?? []).some((source) => (source.canonicalUrl ?? source.url) === entry.canonicalUrl));
    const mappings = matchingEvidence.flatMap((item) => item.claimMappings ?? [])
      .filter((mapping) => mapping.sourceId === entry.canonicalUrl);
    const supported = mappings.some((mapping) => mapping.supportStatus === "supported");
    const projectSpecific = mappings.some((mapping) => mapping.entityScope === "project");
    if (!matchingEvidence.length) return entry;
    return {
      ...entry,
      sourceState: supported ? "claim-supported" : projectSpecific ? "project-specific" : "evidence-mapped",
      evidenceMappingState: "mapped",
      claimSupportState: supported ? "supported" : "rejected",
      projectSpecificityState: projectSpecific ? "project-specific" : "related",
      financialEligibilityState: matchingEvidence.some((item) => item.eligibleForModel === true)
        ? "eligible"
        : "ineligible",
      rejectionCodes: supported ? [] : [...new Set(mappings.flatMap((mapping) => mapping.rejectionCodes ?? []))],
      transitions: [
        ...entry.transitions,
        sourceStateTransition(entry.sourceState, supported ? "claim-supported" : projectSpecific ? "project-specific" : "evidence-mapped", "Audited against immutable claim-to-passage mappings."),
      ],
    };
  });
  const parsedResult = {
    projectSummary: summaryFields,
    sourceLedger: auditedSourceLedger,
    sourceValidationPolicyVersion: SOURCE_VALIDATION_POLICY_VERSION,
    researchCoverage: {
      identityContext: buildProjectIdentityContext({
        name: summaryFields.name,
        location: summaryFields.location,
        knownData,
      }),
      searchedDomains: Array.isArray(coverage?.searchedDomains) ? coverage.searchedDomains : [],
      failedDomains: Array.isArray(coverage?.failedDomains) ? coverage.failedDomains : [],
      retrievedSourceCount: retrievedSources.length,
      sourceLedgerSummary: {
        rawOccurrenceCount: packetLedger.rawOccurrenceCount,
        retainedCount: packetLedger.retained.length,
        rejectedCount: packetLedger.rejectedCount,
        capDiscardCount: packetLedger.capDiscardCount,
      },
      searchTerms: observedSearchTerms,
      searchTermsSource: observedSearchTerms.length ? "tool-observed" : "unavailable",
      toolCallCount: Number.isInteger(coverage?.toolCallCount)
        ? Math.min(RESEARCH_RUN_BUDGET.maxToolCalls, Math.max(0, coverage.toolCallCount))
        : 0,
      toolCallLimit: RESEARCH_PROJECT_MAX_TOOL_CALLS,
      toolCallBudgetExceeded: coverage?.toolCallBudgetExceeded === true,
      physicalOpenBudget: Number.isInteger(coverage?.physicalOpenBudget)
        ? coverage.physicalOpenBudget
        : RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
      physicalOpensUsed: Number.isInteger(coverage?.physicalOpensUsed) ? coverage.physicalOpensUsed : 0,
      physicalOpensRemaining: Number.isInteger(coverage?.physicalOpensRemaining)
        ? coverage.physicalOpensRemaining
        : RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
      physicalOpenBudgetExceeded: coverage?.physicalOpenBudgetExceeded === true,
      observedQueriesByEvidence: Object.fromEntries(RESEARCH_EVIDENCE_IDS.flatMap((id) => {
        const terms = normalizeSearchTerms(coverage?.observedQueriesByEvidence?.[id]);
        return terms.length ? [[id, terms]] : [];
      })),
    },
    evidence,
  };
  const containedResult = containResearchResult(parsedResult);
  containedResult.researchAudit = buildResearchAudit({
    project: { name: summaryFields.name, location: summaryFields.location, knownData },
    coverage,
    sources: packetLedger.ledger,
    evidence: containedResult.evidence,
    responseId: coverage?.providerResponseId ?? null,
    startedAt: coverage?.startedAt ?? null,
    finishedAt: coverage?.finishedAt ?? null,
    runCorrelationId: coverage?.runCorrelationId ?? null,
  });
  return containedResult;
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

function sourceHostname(source = {}) {
  try {
    return new URL(source.url ?? source.resolvedUrl ?? source.canonicalUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isErcotSource(source = {}) {
  const hostname = sourceHostname(source);
  return hostname === "ercot.com"
    || hostname.endsWith(".ercot.com")
    || /\bercot\b/i.test(`${source.title ?? ""} ${source.publisher ?? ""}`);
}

function isJurisdictionallyExcludedSource(source = {}, project = {}) {
  return !isTexasProject(project) && isErcotSource(source);
}

function texasAuthorityMatch(source = {}) {
  const hostname = sourceHostname(source);
  const text = `${hostname} ${source.title ?? ""} ${source.publisher ?? ""}`.toLowerCase();
  const matches = [];
  if (hostname === "ercot.com" || hostname.endsWith(".ercot.com") || /\bercot\b/.test(text)) matches.push("ERCOT");
  if (hostname === "puc.texas.gov" || hostname.endsWith(".puc.texas.gov") || /\bpuct\b|puc\.texas/.test(text)) matches.push("PUCT");
  if (hostname === "twdb.texas.gov" || hostname.endsWith(".twdb.texas.gov") || /\btwdb\b|texas water development/.test(text)) matches.push("TWDB");
  if (hostname === "sec.gov" || hostname.endsWith(".sec.gov")) matches.push("SEC EDGAR");
  if (hostname === "fema.gov" || hostname.endsWith(".fema.gov") || /\bfema\b/.test(text)) matches.push("FEMA");
  if (hostname === "noaa.gov" || hostname.endsWith(".noaa.gov") || /\bnoaa\b/.test(text)) matches.push("NOAA");
  if (hostname === "eia.gov" || hostname.endsWith(".eia.gov") || /\beia\b/.test(text)) matches.push("EIA");
  if (hostname.endsWith(".tx.us") || hostname === "tx.us") matches.push("Texas local authority");
  return [...new Set(matches)];
}

function isTexasProject(project = {}) {
  return inferLocationAuthorityParts(project).state?.toLowerCase() === "texas"
    || /\b(?:texas|tx)\b/i.test(`${project.location ?? ""} ${project.knownData?.location ?? ""}`);
}

function texasSourcePriority(source = {}) {
  const authorities = texasAuthorityMatch(source);
  if (authorities.some((authority) => ["ERCOT", "PUCT", "TWDB", "SEC EDGAR", "FEMA", "NOAA"].includes(authority))) return 0;
  if (authorities.includes("Texas local authority")) return 1;
  if (/\b(texas|tx)\b/i.test(`${source.title ?? ""} ${source.publisher ?? ""}`) && (source.sourceClass === "primary-government" || source.sourceClass === "primary-utility")) return 1;
  if (source.sourceClass === "primary-utility") return 2;
  if (source.sourceClass === "primary-government") return 3;
  if (source.sourceClass === "primary-company" && source.exactProject === true) return 4;
  if (source.sourceClass === "primary-company") return 5;
  return 6;
}

function prioritizeResearchSources(sources = [], project = {}) {
  const rank = (source) => {
    const hostname = sourceHostname(source);
    const pathname = (() => {
      try { return new URL(source.url ?? source.resolvedUrl ?? source.canonicalUrl).pathname.toLowerCase(); } catch { return ""; }
    })();
    const official = source.sourceClass !== "secondary-reporting"
      || /(?:^|\.)(?:gov|mil)$/.test(hostname)
      || source.sourceChannel?.includes("official")
      || source.sourceChannel?.includes("declared-")
      || source.sourceChannel === "sec-public-data";
    const pdf = source.contentType === "application/pdf" || pathname.endsWith(".pdf");
    const api = /json|xml|arcgis/i.test(`${source.contentType ?? ""} ${pathname}`);
    const companyOrSec = source.sourceClass === "primary-company" || hostname === "sec.gov" || hostname.endsWith(".sec.gov");
    const utilityOrRegulator = source.sourceClass === "primary-utility"
      || /\b(utility|utilities|regulator|commission|department|authority)\b/i.test(`${source.title ?? ""} ${source.publisher ?? ""}`);
    const cityOrCounty = /\b(city|county|municipal|borough)\b/i.test(`${hostname} ${source.title ?? ""} ${source.publisher ?? ""}`);
    if (source.exactProject === true && official && (!pdf || api)) return 0;
    if (source.exactProject === true && official && pdf) return 1;
    if (companyOrSec) return 2;
    if (utilityOrRegulator) return 3;
    if (cityOrCounty || source.sourceClass === "primary-government") return 4;
    if (source.exactProject !== true && official) return 5;
    return 6;
  };
  return [...sources].sort((left, right) => {
    return Number(right.claimCited === true) - Number(left.claimCited === true)
      || Number(right.exactProject === true) - Number(left.exactProject === true)
      || rank(left) - rank(right)
      || String(left.url ?? "").localeCompare(String(right.url ?? ""));
  });
}

function sourcePriorityApplied(project = {}) {
  const state = inferLocationAuthorityParts(project).state ?? "State";
  return [
    "Exact-project official HTML or structured API",
    "Exact-project official PDF",
    "Company and public SEC filings",
    "Utility and regulator records",
    "City and county records",
    `${state} contextual official records`,
    "Secondary reporting",
  ];
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

function buildCategoryQuery({ name, location, knownData }, category, attempt, evidenceId) {
  const genericQuery = category.id === "project-identity"
    ? `"${name}" "${location}" ${attempt === "follow-up" ? "alternate name owner operator filing" : "project operator facility identity permit record"}`
    : buildVariableQueries({ name, location, knownData }, evidenceId ?? category.evidenceIds[0])[attempt === "follow-up" ? 1 : 0];
  const project = { name, location, knownData };
  const identity = buildProjectIdentityContext(project);
  const state = identity.state;
  const routing = categoryAuthorityTargets(project, category.id);
  const companyDomains = knownData?.companyDomains ?? [];
  const primarySites = [...new Set([
    ...routing.domains,
    ...companyDomains,
  ])].length
    ? ` (${[...new Set([...routing.domains, ...companyDomains])].map((domain) => `site:${domain}`).join(" OR ")})`
    : "";
  const identityTerms = [
    ...identity.aliases.map((alias) => `"${alias}"`),
    identity.operator ? `"${identity.operator}"` : "",
  ].filter(Boolean).join(" ");
  if (!isTexasProject(project)) {
    const stateNames = routing.names.join(" ");
    const stateLabel = state || "state";
    const base = `${genericQuery} ${stateLabel} ${stateNames} ${identityTerms} ${primarySites}`;
    return `${base} ${attempt === "follow-up" ? "exact project official record identity disambiguation" : "official government regulator utility record"}`.replace(/\s+/g, " ").trim();
  }
  const projectAndLocation = `"${name}" "${location}"`;
  const operatorAndProject = knownData?.operator
    ? `"${knownData.operator}" "${name}"`
    : projectAndLocation;
  const authorityTargets = categoryAuthorityTargets({ name, location, knownData }, category.id);
  const queryDomains = [...new Set([...authorityTargets.domains, ...(companyDomains ?? [])])];
  const txPrimarySites = queryDomains.length
    ? ` (${queryDomains.map((domain) => `site:${domain}`).join(" OR ")})`
    : "";
  const localNames = authorityTargets.localAuthorities?.map((authority) => `"${authority.name}"`).join(" ") ?? "";
  if (attempt === "follow-up") {
    const fallbackAngle = category.id === "construction-capital"
      ? "SEC EDGAR investor relations official developer project disclosure"
      : category.id === "tenant-counterparty"
        ? "SEC EDGAR investor relations official project developer customer offtake"
        : category.id === "water"
          ? "municipal county water demand consumption rights permit drought"
          : category.id === "permitting-community"
            ? "municipal county agenda permit public hearing agreement"
            : category.id === "grid"
              ? "ERCOT PUCT interconnection queue transmission study exact project"
              : category.id === "project-identity"
                ? "project operator facility identity permit record"
                : `${RESEARCH_QUERY_ANGLES[evidenceId ?? category.evidenceIds[0]]?.[1] ?? category.label} exact project`;
    return `${operatorAndProject} ${localNames} Texas ${fallbackAngle}`.replace(/\s+/g, " ").trim();
  }
  switch (category.id) {
    case "project-identity":
      return `${projectAndLocation} Texas project permit operator disclosure ERCOT PUCT${txPrimarySites} ${identityTerms}`;
    case "grid":
      return `${projectAndLocation} ERCOT PUCT Texas interconnection queue transmission study${txPrimarySites} ${identityTerms}`;
    case "electricity":
      return `${projectAndLocation} ERCOT PUCT Texas utility tariff rate case EIA market context${txPrimarySites} ${identityTerms}`;
    case "water":
      return `${projectAndLocation} ${localNames} TWDB municipal county water demand consumption rights permit${txPrimarySites} ${identityTerms}`;
    case "permitting-community":
      return `${projectAndLocation} ${localNames} Texas municipal county agenda permit public hearing agreement${txPrimarySites} ${identityTerms}`;
    case "construction-capital":
      return `${operatorAndProject} SEC EDGAR investor relations official developer project disclosure${txPrimarySites} ${identityTerms}`;
    case "tenant-counterparty":
      return `${operatorAndProject} SEC EDGAR investor relations official project developer disclosure customer offtake${txPrimarySites} ${identityTerms}`;
    case "climate-operational-hazard":
      return `${projectAndLocation} FEMA NOAA Texas exact site flood wildfire drought hazard${txPrimarySites} ${identityTerms}`;
    default:
      return `${projectAndLocation} ${genericQuery}${txPrimarySites} ${identityTerms}`;
  }
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

function buildResearchProjectPrompt({ name, location, knownData, focusIds, currentEvidence, activeCategory }) {
  const knownDataPrompt = knownData
    ? `\n\nThe following facts are already confirmed from the Compute Atlas public database: ${JSON.stringify(knownData)}. Use them as directory discovery context for project identity and summary fields, not as SafeLoc evidence or verified project economics. Focus your research on the 16 evidence variables, not on rediscovering basic project facts.`
    : "";
  const queryPlan = buildVariableQueryPlan({ name, location, knownData, focusIds });
  const categoryPlan = buildResearchCategoryPlan({ name, location, knownData }).categories
    .map((category) => `- ${category.label}: primary ${category.requestedPrimaryQuery}; optional gap follow-up ${category.optionalFollowUpQuery}`)
    .join("\n");
  const identityContext = buildProjectIdentityContext({ name, location, knownData });
  const activeCategoryPrompt = activeCategory
    ? `\n\nThis is the observed ${activeCategory.label} category attempt. Execute this exact query now and do not substitute a plan for execution: ${activeCategory.query}. Return only the category-scoped evidence keys ${activeCategory.evidenceIds?.join(", ") || "(none; return an empty evidence object)"}. The server validates and merges completed categories into the full 16-item contract. Do not emit unrelated evidence keys.${activeCategory.repair ? " This is one bounded repair attempt. Use compact descriptions and explicit Missing Evidence values for unresolved category items; never invent values." : ""}`
    : "";
  return `Research and analyze this exact data-center project using the built-in web-search tool: ${name}. Location: ${location}. Resolve identity first using the requested name, aliases, operator, city/county/state, and exact facility or campus references before making any exact-project claim. Treat a campus, metro, region, corridor, or county record as context unless the passage identifies the exact facility; surface campus-versus-region ambiguity instead of silently merging records. Identity context: ${JSON.stringify(identityContext)}. Search current project, operator, regulatory, utility, grid, water, permitting, community, environmental, capacity, customer, and infrastructure records. Prefer direct government, regulator, utility, land, permit, environmental, and filed-company records over summaries. Verify project, operator, and location identity so similarly named facilities are not mixed. Preserve exact URLs returned by web search, distinguish facility-level findings from regional context, and return the exact JSON contract from the system instruction. When no searched source independently confirms a claim, use Management Assertion or lower and state that verification is required. Do not replace genuine public information with Missing Evidence merely because one query fails. The server-governed run schedules these eight categories independently: project identity, grid, electricity, water, permitting/community, construction/capital, tenant/counterparty, and climate/operational hazard. Record only queries actually executed; each category may have at most one gap-driven follow-up. Try distinct primary-record and corroboration angles where useful, with no more than two targeted queries per variable and no more than 32 targeted queries overall. There is no minimum finding quota; exhausted searches must remain unresolved. The category schedule below is a requested plan, not proof of execution.${activeCategoryPrompt}

Bounded variable query plan:
${queryPlan}

Governed category schedule:
${categoryPlan}${focusIds?.length ? ` This is a focused refresh for these unresolved variables: ${focusIds.join(", ")}. Prioritize their query angles, then still return all 16 records. Preserve unrelated existing records unless new searched evidence directly contradicts them.` : ""}${currentEvidence?.length ? `\n\nExisting evidence context:\n${JSON.stringify(currentEvidence)}` : ""}${knownDataPrompt}`;
}

function normalizeRetrievedSources(body, searchDomain = "project-identity", project = {}, researchSourceUrls = []) {
  const candidates = [];
  const citedUrls = new Set();
  const sourceChannelTelemetry = [];
  const addProviderSources = (sources, sourceChannel, origin = sourceChannel) => {
    for (const source of Array.isArray(sources) ? sources : []) {
      const safeUrl = safePublicSourceUrl(source?.url);
      sourceChannelTelemetry.push({
        sourceChannel,
        outcome: safeUrl ? "candidate" : "rejected",
        reason: safeUrl ? null : (typeof source?.url === "string" && source.url.trim() ? "unsafe-url" : "missing-url"),
      });
      candidates.push({
        ...(isRecord(source) ? source : {}),
        url: safeUrl ?? "",
        sourceChannel,
        origin,
      });
    }
  };
  addProviderSources(body?.sources, "provider-structured-sources");
  const citedSourceIds = new Set(
    researchSourceUrls
      .map(canonicalizeSourceUrl)
      .filter(Boolean),
  );
  for (const output of Array.isArray(body?.output) ? body.output : []) {
    if (output?.type === "web_search_call" && Array.isArray(output.action?.sources)) {
      addProviderSources(output.action.sources, "web-search-action-sources", "action.sources");
    }
    addProviderSources(output?.sources, "provider-output-sources");
    for (const content of Array.isArray(output?.content) ? output.content : []) {
      for (const annotation of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (annotation?.type === "url_citation") {
          const citedUrl = safePublicSourceUrl(annotation.url);
          sourceChannelTelemetry.push({
            sourceChannel: "output-url-citation",
            outcome: citedUrl ? "candidate" : "rejected",
            reason: citedUrl ? null : (typeof annotation.url === "string" && annotation.url.trim() ? "unsafe-url" : "missing-url"),
          });
          if (citedUrl) {
            citedUrls.add(citedUrl);
            candidates.push({
              url: citedUrl,
              title: typeof annotation.title === "string" ? annotation.title : "Provider URL citation",
              excerpt: "",
              claimCited: true,
              sourceChannel: "output-url-citation",
              origin: "url_citation",
            });
          } else {
            candidates.push({
              url: "",
              title: "Rejected provider URL citation",
              excerpt: "",
              claimCited: false,
              sourceChannel: "output-url-citation",
              origin: "url_citation",
            });
          }
        }
      }
    }
  }
  for (const citedUrl of citedUrls) {
    const canonical = canonicalizeSourceUrl(citedUrl);
    if (canonical) citedSourceIds.add(canonical);
  }
  for (const researchSourceUrl of researchSourceUrls) {
    const canonical = canonicalizeSourceUrl(researchSourceUrl);
    if (canonical) citedSourceIds.add(canonical);
  }
  const actionSourceCanonicalIds = new Set(candidates.map((candidate) => canonicalizeSourceUrl(candidate.url)).filter(Boolean));
  const structuredSourceIds = new Set(researchSourceUrls.map(canonicalizeSourceUrl).filter(Boolean));
  for (const citedUrl of structuredSourceIds) {
    if (actionSourceCanonicalIds.has(citedUrl)) continue;
    candidates.push({
      url: citedUrl,
      title: "Provider-returned structured research source",
      excerpt: "",
      claimCited: true,
      origin: "structured-research-source",
      sourceChannel: "provider-structured-research",
      sourceUrlOrigin: "provider-structured-research",
    });
    actionSourceCanonicalIds.add(citedUrl);
  }
  for (const candidate of candidates) {
    if (citedSourceIds.has(canonicalizeSourceUrl(candidate.url))) candidate.claimCited = true;
  }
  if (!candidates.some((candidate) => safePublicSourceUrl(candidate.url))) {
    sourceChannelTelemetry.push({
      sourceChannel: "provider-response",
      outcome: "no-return",
      reason: "no-public-url",
    });
  }
  const prioritizedCandidates = prioritizeResearchSources(candidates.map((source) => {
    const url = safePublicSourceUrl(source.url) ?? "";
    const title = typeof source.title === "string" ? source.title.trim() : "Retrieved public source";
    return {
      ...source,
      url,
      sourceChannel: typeof source.sourceChannel === "string" ? source.sourceChannel : source.origin ?? "provider",
      title,
      date: typeof source.published_date === "string" ? source.published_date : typeof source.date === "string" ? source.date : null,
      excerpt: typeof source.snippet === "string" ? source.snippet.trim() : typeof source.excerpt === "string" ? source.excerpt.trim() : "",
      accessStatus: ["open", "paywall", "registration"].includes(source.access_status) ? source.access_status : "not provided",
      contentType: typeof source.content_type === "string" ? source.content_type : typeof source.contentType === "string" ? source.contentType : null,
      sourceClass: url ? classifySource(url, title) : "secondary-reporting",
      searchDomain,
      ...(safePublicSourceUrl(source.canonicalUrl)
        ? {
            canonicalUrl: canonicalizeSourceUrl(source.canonicalUrl),
            canonicalIdentityExplicit: true,
          }
        : {}),
      ...(typeof source.exactProject === "boolean" ? { exactProject: source.exactProject } : {}),
      ...(isJurisdictionallyExcludedSource({ url, title }, project)
        ? {
            exactProject: false,
            jurisdictionExcluded: true,
            relevanceNote: "ERCOT is not a project-evidence authority for a non-Texas project.",
          }
        : {}),
      relevanceNote: isJurisdictionallyExcludedSource({ url, title }, project)
        ? "ERCOT is not a project-evidence authority for a non-Texas project."
        : typeof source.relevanceNote === "string" ? source.relevanceNote.trim().slice(0, 500) : null,
    };
  }), project);
  const ledger = createSourceLedger(prioritizedCandidates, { maxRetained: RESEARCH_RUN_BUDGET.maxCandidatesPerCategory });
  const result = ledger.retained.map((source) => ({
    ...source,
    date: candidates.find((candidate) => safePublicSourceUrl(candidate.url) === source.originalUrl)?.date ?? null,
    excerpt: source.excerpt,
    accessStatus: source.accessStatus,
    sourceClass: source.sourceClass,
    searchDomain,
    ...(source.canonicalIdentityExplicit === true
      ? {
          canonicalUrl: canonicalizeSourceUrl(source.canonicalUrl),
          canonicalIdentityExplicit: true,
        }
      : {}),
    ...(typeof source.exactProject === "boolean" ? { exactProject: source.exactProject } : {}),
    relevanceNote: source.relevanceNote ?? null,
  }));
  result.sourceLedger = ledger;
  result.sourceChannelTelemetry = sourceChannelTelemetry.slice(0, 80);
  return result;
}

function extractResearchSourceUrls(research) {
  const evidence = Array.isArray(research?.evidence)
    ? research.evidence
    : Object.values(isRecord(research?.evidence) ? research.evidence : {});
  return evidence.flatMap((item) => [
    item?.sourceUrl,
    ...(Array.isArray(item?.sourceUrls) ? item.sourceUrls : []),
    ...(typeof item?.citation === "string"
      ? item.citation.match(/https?:\/\/[^\s)]+/g) ?? []
      : []),
  ]).filter((url) => typeof url === "string" && safePublicSourceUrl(url));
}

function redactUpstreamDetail(value) {
  return String(value ?? "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/\borg-[A-Za-z0-9_-]+\b/g, "org-[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(api[_ -]?key|authorization|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function safeDiagnosticToken(value, maxLength = 120) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized && /^[A-Za-z0-9_.:/ -]+$/.test(normalized) ? normalized : null;
}

function safeProviderErrorKind(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().slice(0, 80);
  return normalized && /^[a-z0-9_.-]+$/.test(normalized) ? normalized : null;
}

function selectedRateLimitIndicators(headers) {
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
    const value = safeDiagnosticToken(headers.get(header));
    return value ? [[key, value]] : [];
  }));
}

function parseRateLimitDurationMs(value) {
  if (typeof value !== "string" || !value.trim()) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.ceil(Number(value) * 1_000);
  let total = 0;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m)/gi)) {
    const amount = Number(match[1]);
    total += match[2].toLowerCase() === "m"
      ? amount * 60_000
      : match[2].toLowerCase() === "s"
        ? amount * 1_000
        : amount;
  }
  return Math.ceil(total);
}

function createResearchProviderGate({
  limit = RESEARCH_PROVIDER_MAX_CONCURRENCY,
  now = () => Date.now(),
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  let active = 0;
  let blockedUntil = 0;
  let wakeTimer = null;
  const queue = [];

  const drain = () => {
    if (wakeTimer) {
      cancelSchedule(wakeTimer);
      wakeTimer = null;
    }
    const delay = blockedUntil - now();
    if (delay > 0) {
      wakeTimer = schedule(() => {
        wakeTimer = null;
        drain();
      }, delay);
      return;
    }
    while (active < limit && queue.length) {
      const waiter = queue.shift();
      if (waiter.signal?.aborted) {
        waiter.reject(createResearchCancellationError());
        continue;
      }
      active += 1;
      waiter.cleanup();
      waiter.resolve(() => {
        active = Math.max(0, active - 1);
        drain();
      });
    }
  };

  const acquire = (signal) => new Promise((resolve, reject) => {
    const waiter = {
      signal,
      resolve,
      reject,
      cleanup: () => {},
    };
    const onAbort = () => {
      const index = queue.indexOf(waiter);
      if (index >= 0) queue.splice(index, 1);
      reject(createResearchCancellationError());
    };
    waiter.cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
    queue.push(waiter);
    drain();
  });

  const recordPressure = (error) => {
    const diagnostic = error?.providerDiagnostic;
    if (diagnostic?.upstreamStatus !== 429 || diagnostic?.errorCode !== "rate_limit_exceeded") return;
    const rateLimit = diagnostic.rateLimit ?? {};
    const delayMs = Math.max(
      parseRateLimitDurationMs(rateLimit.retryAfter),
      rateLimit.remainingTokens === "0" ? parseRateLimitDurationMs(rateLimit.resetTokens) : 0,
    );
    if (delayMs > 0) blockedUntil = Math.max(blockedUntil, now() + delayMs);
  };

  return {
    async run(task, { signal, onStart } = {}) {
      const release = await acquire(signal);
      try {
        onStart?.({ active, blockedUntil });
        return await task();
      } catch (error) {
        recordPressure(error);
        throw error;
      } finally {
        release();
      }
    },
    snapshot() {
      return { active, queued: queue.length, blockedUntil, limit };
    },
  };
}

const researchProviderGate = createResearchProviderGate();

function normalizeProviderUsage(value) {
  if (!isRecord(value)) return null;
  const number = (candidate) => Number.isInteger(candidate) && candidate >= 0 ? candidate : null;
  const inputTokens = number(value.input_tokens);
  const outputTokens = number(value.output_tokens);
  const totalTokens = number(value.total_tokens);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

async function createUpstreamRequestError(response, stage) {
  const rawBody = await response.text();
  let detail = "";
  let providerErrorCode = null;
  let providerErrorType = null;
  try {
    const body = JSON.parse(rawBody);
    const providerError = body?.error;
    detail = typeof providerError === "string"
      ? providerError
      : providerError?.message ?? body?.message ?? "";
    providerErrorCode = safeProviderErrorKind(providerError?.code ?? body?.code);
    providerErrorType = safeProviderErrorKind(providerError?.type ?? body?.type);
  } catch {
    detail = rawBody;
  }
  const suffix = redactUpstreamDetail(detail);
  const requestId = safeDiagnosticToken(
    response.headers.get("x-request-id") ?? response.headers.get("request-id"),
    160,
  );
  const rateLimit = selectedRateLimitIndicators(response.headers);
  const error = new Error(`${stage} upstream returned HTTP ${response.status}${suffix ? `: ${suffix}` : ""}`);
  error.name = "UpstreamRequestError";
  error.upstreamStatus = response.status;
  error.providerDiagnostic = {
    upstreamStatus: response.status,
    ...(providerErrorCode ? { errorCode: providerErrorCode } : {}),
    ...(providerErrorType ? { errorType: providerErrorType } : {}),
    ...(suffix ? { message: suffix } : {}),
    ...(requestId ? { requestId } : {}),
    ...(Object.keys(rateLimit).length ? { rateLimit } : {}),
  };
  error.publicMessage = response.status === 401
      ? "Project research provider authentication failed (HTTP 401); verify the server API credential."
      : "Project research provider is unavailable; retry later.";
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

function providerFinishReason(body) {
  return body?.incomplete_details?.reason
    ?? body?.incompleteDetails?.reason
    ?? body?.finish_reason
    ?? body?.finishReason
    ?? body?.status
    ?? null;
}

function estimateTokenCount(text) {
  return Math.ceil(String(text ?? "").length / 4);
}

function jsonLooksTruncated(text) {
  const value = String(text ?? "").trim();
  if (!value || value.endsWith("}") || value.endsWith("]")) return false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      inString = !inString;
      continue;
    }
    if (!inString && (character === "{" || character === "[")) depth += 1;
    if (!inString && (character === "}" || character === "]")) depth = Math.max(0, depth - 1);
  }
  return depth > 0 || inString;
}

function parseProviderJsonContent(content) {
  const original = String(content ?? "").trim();
  const diagnostics = {
    parseStage: "direct",
    outputCharacters: original.length,
    estimatedOutputTokens: estimateTokenCount(original),
    truncated: jsonLooksTruncated(original),
  };
  const attempts = [{ stage: "direct", text: original }];
  const fenced = original.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) attempts.push({ stage: "fenced", text: fenced[1].trim() });
  const firstObject = original.indexOf("{");
  const lastObject = original.lastIndexOf("}");
  const leadingCharacters = firstObject >= 0 ? firstObject : original.length;
  const trailingCharacters = lastObject >= 0 ? original.length - lastObject - 1 : original.length;
  if (firstObject >= 0 && lastObject > firstObject && leadingCharacters <= 1_000 && trailingCharacters <= 1_000) {
    attempts.push({ stage: "bounded-prose", text: original.slice(firstObject, lastObject + 1) });
  }
  for (const attempt of attempts) {
    try {
      return { value: JSON.parse(attempt.text), diagnostics: { ...diagnostics, parseStage: attempt.stage, truncated: false } };
    } catch {
      // Try only the explicitly bounded representations above.
    }
  }
  const error = new Error("Provider output was not valid JSON.");
  error.name = "ResearchParseError";
  Object.assign(error, diagnostics);
  throw error;
}

function logProviderDiagnostic(error, { runCorrelationId = null, categoryId = null } = {}) {
  const detail = {
    provider: "openai",
    categoryId,
    finishReason: error?.finishReason ?? null,
    outputCharacters: Number.isInteger(error?.outputCharacters) ? error.outputCharacters : null,
    estimatedOutputTokens: Number.isInteger(error?.estimatedOutputTokens) ? error.estimatedOutputTokens : null,
    parseStage: error?.parseStage ?? "unknown",
    truncated: error?.truncated === true,
    schemaErrors: Array.isArray(error?.schemaErrors) ? error.schemaErrors.slice(0, 8) : [],
    partialFindingsRetained: error?.partialFindingsRetained === true,
  };
  console.warn(`[research-project:${runCorrelationId ?? "unassigned"}] Provider response diagnostic:`, JSON.stringify(detail));
}

function boundProviderResponseToToolBudget(body, maxToolCalls) {
  const outputs = Array.isArray(body?.output) ? body.output : [];
  const allowed = Math.max(0, Number.isInteger(maxToolCalls) ? maxToolCalls : RESEARCH_PROJECT_MAX_TOOL_CALLS);
  let seen = 0;
  let accepted = 0;
  const boundedOutputs = outputs.filter((output) => {
    if (output?.type !== "web_search_call") return true;
    seen += 1;
    if (seen > allowed) return false;
    accepted += 1;
    return true;
  });
  const actualToolCallCount = seen;
  const toolCallBudgetExceeded = actualToolCallCount > allowed;
  return {
    body: toolCallBudgetExceeded ? { ...body, output: boundedOutputs } : body,
    acceptedToolCallCount: accepted,
    actualToolCallCount,
    toolCallBudgetExceeded,
  };
}

function restrictResearchToAcceptedSources(research, sources) {
  if (!isRecord(research) || !Array.isArray(research.evidence)) return research;
  const acceptedUrls = new Set(sources.map((source) => canonicalizeSourceUrl(source.url)).filter(Boolean));
  return {
    ...research,
    evidence: research.evidence.map((item) => {
      if (!isRecord(item)) return item;
      const sourceUrl = canonicalizeSourceUrl(item.sourceUrl);
      const sourceUrls = Array.isArray(item.sourceUrls)
        ? item.sourceUrls.filter((url) => acceptedUrls.has(canonicalizeSourceUrl(url)))
        : [];
      return {
        ...item,
        sourceUrl: sourceUrl && acceptedUrls.has(sourceUrl) ? item.sourceUrl : null,
        sourceUrls,
      };
    }),
  };
}

async function researchProjectWithWebSearch(project, apiKey, fetchImpl, signal, activeCategory = null, providerGate = researchProviderGate) {
  const queuedAtMs = Date.now();
  let issuedAtMs = null;
  const scopedEvidenceIds = Array.isArray(activeCategory?.evidenceIds)
    ? activeCategory.evidenceIds.filter((id) => RESEARCH_EVIDENCE_IDS.includes(id))
    : RESEARCH_EVIDENCE_IDS;
  const identityOnly = activeCategory?.categoryId === "project-identity";
  const requestedOutputTokens = activeCategory ? RESEARCH_CATEGORY_MAX_TOKENS : RESEARCH_PROJECT_MAX_TOKENS;
  const requestBody = JSON.stringify({
    model: RESEARCH_PROJECT_MODEL,
    tools: [{ type: "web_search_preview" }],
    input: [
      {
        role: "system",
        content: `${RESEARCH_PROJECT_SYSTEM_PROMPT}${WEB_SEARCH_SOURCE_BOUNDARY_PROMPT}${identityOnly
          ? "\nFor project-identity discovery, establish or reject the exact project name, location, and operator only. Do not create modeled evidence or infer financial inputs."
          : ""}`,
      },
      { role: "user", content: buildResearchProjectPrompt({ ...project, activeCategory }) },
    ],
    max_output_tokens: requestedOutputTokens,
    max_tool_calls: activeCategory?.maxToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS,
    include: ["web_search_call.action.sources"],
    text: {
      format: {
        type: "json_schema",
        name: identityOnly ? "safeloc_project_identity" : "safeloc_research_project",
        strict: true,
        schema: identityOnly
          ? RESEARCH_PROJECT_IDENTITY_RESPONSE_SCHEMA
          : buildResearchResponseSchema(scopedEvidenceIds),
      },
    },
  });
  const startedAt = new Date().toISOString();
  let response;
  try {
    response = await providerGate.run(async () => {
      const upstream = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
        signal,
      });
      if (!upstream.ok) throw await createUpstreamRequestError(upstream, "Research with web search");
      return upstream;
    }, {
      signal,
      onStart: () => {
        issuedAtMs = Date.now();
      },
    });
  } catch (error) {
    const finishedAtMs = Date.now();
    error.providerAttempt = {
      categoryId: activeCategory?.categoryId ?? null,
      attemptType: activeCategory?.attempt ?? "primary",
      queuedAt: new Date(queuedAtMs).toISOString(),
      issuedAt: issuedAtMs === null ? null : new Date(issuedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      queueWaitMs: issuedAtMs === null ? null : Math.max(0, issuedAtMs - queuedAtMs),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
      status: error?.providerDiagnostic?.upstreamStatus ?? null,
      outcome: error?.name === "ResearchCancelledError" ? "cancelled" : "failed",
      requestedOutputTokens,
      requestBodyBytes: Buffer.byteLength(requestBody),
      usage: null,
    };
    throw error;
  }
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
    research = parseProviderJsonContent(content).value;
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error("Provider output was not valid JSON.");
    parseError.message = "Project research provider returned malformed result JSON.";
    parseError.name = "ResearchParseError";
    parseError.finishReason = providerFinishReason(body);
    parseError.providerResponseId = typeof body.id === "string" ? body.id : null;
    parseError.toolCallCount = countWebSearchCalls(body);
    logProviderDiagnostic(parseError, {
      runCorrelationId: activeCategory?.runCorrelationId,
      categoryId: activeCategory?.categoryId,
    });
    throw parseError;
  }
  if (identityOnly) {
    research = {
      projectSummary: research.projectSummary,
      evidence: {},
      identityAssessment: research.identityAssessment ?? null,
    };
  }
  const bounded = boundProviderResponseToToolBudget(body, activeCategory?.maxToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS);
  const sources = normalizeRetrievedSources(
    bounded.body,
    "web-search",
    project,
    extractResearchSourceUrls(research),
  );
  research = restrictResearchToAcceptedSources(research, sources);
  const searchTerms = extractSearchTerms(bounded.body);
  const observedQueriesByEvidence = extractObservedQueriesByEvidence(bounded.body, project);
  const finishedAt = new Date().toISOString();
  const finishedAtMs = Date.now();
  const providerAttempt = {
    categoryId: activeCategory?.categoryId ?? null,
    attemptType: activeCategory?.attempt ?? "primary",
    queuedAt: new Date(queuedAtMs).toISOString(),
    issuedAt: issuedAtMs === null ? null : new Date(issuedAtMs).toISOString(),
    finishedAt,
    queueWaitMs: issuedAtMs === null ? null : Math.max(0, issuedAtMs - queuedAtMs),
    elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
    status: response.status,
    outcome: "completed",
    requestedOutputTokens,
    requestBodyBytes: Buffer.byteLength(requestBody),
    usage: normalizeProviderUsage(body.usage),
  };
  return {
    research,
    sources,
    coverage: {
      searchedDomains: [...new Set(sources.map((source) => sourceHostname(source)).filter(Boolean))],
      failedDomains: [],
      retrievedSourceCount: sources.length,
      sourceChannelTelemetry: sources.sourceChannelTelemetry ?? [],
      searchTerms,
      observedQueriesByEvidence,
      toolCallCount: bounded.acceptedToolCallCount,
      observedToolCallCount: bounded.actualToolCallCount,
      acceptedToolCallCount: bounded.acceptedToolCallCount,
      toolCallBudgetExceeded: bounded.toolCallBudgetExceeded,
      providerLimitations: bounded.toolCallBudgetExceeded
        ? ["Provider returned more web-search calls than the remaining run allowance; excess calls, sources, and source-linked findings were excluded."]
        : [],
      sourcePriorityApplied: sourcePriorityApplied(project),
      searchTermsSource: searchTerms.length ? "tool-observed" : "unavailable",
      provider: "openai",
      model: RESEARCH_PROJECT_MODEL,
      providerResponseId: typeof body.id === "string" ? body.id : null,
      activeCategoryId: activeCategory?.categoryId ?? null,
      executedQuery: activeCategory?.query ?? null,
      startedAt,
      finishedAt,
      providerAttempt,
      providerUsage: providerAttempt.usage,
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
  if (error?.name === "ResearchCancelledError" || error?.researchErrorType === "cancelled") {
    return { status: 499, type: "cancelled", message: "Project research was cancelled by the requesting client." };
  }
  if (error?.name === "ResearchBudgetError" || error?.researchErrorType === "provider-request-budget") {
    return { status: 502, type: "provider-request-budget", message: "Project research reached its provider-request ceiling; retry only if additional research is required." };
  }
  if (error?.name === "AbortError") return { status: 504, type: "timeout", message: "Project research reached its 90-second deadline; valid completed findings were retained and the run can be retried." };
  if (error?.name === "ResearchParseError") return { status: 502, type: "malformed-response", message: "Project research provider returned malformed structured data; retry the affected research." };
  if (error?.name === "UpstreamRequestError") {
    if (error.upstreamStatus === 429) {
      const diagnostic = error.providerDiagnostic ?? { upstreamStatus: 429 };
      const kinds = [diagnostic.errorCode, diagnostic.errorType].filter(Boolean);
      if (kinds.some((value) => ["insufficient_quota", "billing_hard_limit_reached", "quota_exceeded"].includes(value))) {
        return {
          status: 429,
          type: "quota-exhausted",
          message: "Project research provider reports insufficient quota or a billing limit; verify the OpenAI project used by this app.",
          providerDiagnostic: diagnostic,
        };
      }
      if (kinds.some((value) => ["rate_limit_exceeded", "rate_limit_error", "too_many_requests"].includes(value))) {
        return {
          status: 429,
          type: "provider-rate-limit",
          message: "Project research provider is temporarily rate-limited; retry after the indicated delay.",
          providerDiagnostic: diagnostic,
        };
      }
      return {
        status: 429,
        type: "provider-429",
        message: "Project research provider returned HTTP 429 without a confirmed quota or rate-limit code; inspect the provider diagnostic.",
        providerDiagnostic: diagnostic,
      };
    }
    if (error.upstreamStatus === 401) return { status: 502, type: "authentication", message: error.publicMessage };
    return {
      status: 502,
      type: "upstream",
      message: error.publicMessage ?? "Project research provider request failed.",
      ...(error.providerDiagnostic ? { providerDiagnostic: error.providerDiagnostic } : {}),
    };
  }
  if (error?.name === "RateLimitError") return { status: 429, type: "request-limit", message: RESEARCH_PROJECT_RATE_LIMIT_MESSAGE };
  if (error?.name === "ConfigurationError") return { status: 503, type: "not-configured", message: "Project research not configured." };
  if (error?.name === "StructuredResearchError") return { status: 502, type: "malformed-response", message: "Project research returned an invalid 16-item response." };
  return { status: 502, type: "upstream", message: "Project research upstream request failed." };
}

function mergeCategoryResearchResults(project, categoryResults) {
  const first = categoryResults.find((result) => isRecord(result?.research))?.research;
  if (!first || !isRecord(first.projectSummary)) return null;
  const evidenceById = new Map();
  const planByCategory = new Map(buildResearchCategoryPlan(project).categories.map((category) => [category.categoryId, category]));
  for (const result of categoryResults) {
    const category = planByCategory.get(result.categoryId);
    const retainedCategoryUrls = new Set((result.sources ?? []).flatMap((source) => sourceUrlAliases(source)));
    let containedResearch = result.research;
    const categoryEvidence = Array.isArray(result.research?.evidence) ? result.research.evidence : [];
    if (!categoryEvidence.some((item) => typeof item?.eligibleForModel === "boolean")) {
      try {
        containedResearch = containResearchResult(parseResearchResponse(
          result.research,
          result.sources ?? [],
          new Date().toISOString().slice(0, 10),
          result.coverage ?? null,
          project.knownData ?? null,
          category?.evidenceIds ?? RESEARCH_EVIDENCE_IDS,
        ));
      } catch {
      // The category was independently normalized before production merges. Keep
      // the raw category result available for a diagnostic-only merge fixture.
      }
    }
    const rawEvidence = new Map(
      Array.isArray(result.rawResearch?.evidence)
        ? result.rawResearch.evidence.map((item) => [item.id, item])
        : [],
    );
    const containedEvidence = new Map(
      Array.isArray(containedResearch?.evidence)
        ? containedResearch.evidence.map((item) => [item.id, item])
        : [],
    );
    for (const item of Array.isArray(result.research?.evidence) ? result.research.evidence : []) {
      if (!category?.evidenceIds.includes(item.id)) continue;
      const mappedUrls = [
        item.sourceUrl,
        ...(Array.isArray(item.sourceUrls) ? item.sourceUrls : []),
      ].map((url) => canonicalizeSourceUrl(url)).filter(Boolean);
      if (!mappedUrls.length) continue;
      if (!mappedUrls.some((url) => retainedCategoryUrls.has(url))) continue;
      const containedItem = containedEvidence.get(item.id);
      if (!containedItem) continue;
      const rawItem = rawEvidence.get(item.id);
      const sourceRecords = (result.sources ?? []).filter((source) => {
        const aliases = sourceUrlAliases(source);
        return mappedUrls.some((url) => aliases.includes(url));
      });
      const existing = evidenceById.get(item.id);
      const existingHasAccessibleSource = existing?.sources?.some((source) => source.accessOutcome?.state === "accessible") === true;
      const currentHasAccessibleSource = sourceRecords.some((source) => source.accessOutcome?.state === "accessible");
      if (existing && existingHasAccessibleSource && !currentHasAccessibleSource) continue;
      evidenceById.set(item.id, {
        ...item,
        ...containedItem,
        ...(containedItem.sourceUrl || !rawItem?.sourceUrl ? {} : { sourceUrl: rawItem.sourceUrl }),
        ...(Array.isArray(containedItem.sourceUrls) && containedItem.sourceUrls.length
          ? {}
          : Array.isArray(rawItem?.sourceUrls) ? { sourceUrls: rawItem.sourceUrls } : {}),
        ...(item.sources?.length || !sourceRecords.length ? {} : { sources: sourceRecords }),
      });
    }
  }
  return {
    ...first,
    evidence: RESEARCH_EVIDENCE_IDS.map((id) => evidenceById.get(id) ?? missingResearchEvidence(id)),
  };
}

function categoryResearchIsResolved(category, research, sources, project, coverage) {
  if (!category.evidenceIds.length) {
    const resolved = sources.some((source) =>
      source.accessOutcome?.state === "accessible"
      && (source.exactProject === true || isSourceProjectSpecific(source, project)));
    return { resolved, unresolvedEvidenceIds: resolved ? [] : [category.categoryId] };
  }
  try {
    const contained = containResearchResult(parseResearchResponse(
      research,
      sources,
      new Date().toISOString().slice(0, 10),
      coverage,
      project.knownData ?? null,
      category.evidenceIds,
    ));
    const unresolvedEvidenceIds = category.evidenceIds.filter((id) =>
      !contained.evidence.some((item) => item.id === id && item.eligibleForModel === true));
    return { resolved: unresolvedEvidenceIds.length === 0, unresolvedEvidenceIds };
  } catch {
    return { resolved: false, unresolvedEvidenceIds: [...category.evidenceIds] };
  }
}

const RESEARCH_OUTCOMES = Object.freeze({
  WITH_EVIDENCE: "complete-with-eligible-evidence",
  NO_ELIGIBLE: "complete-no-eligible-evidence",
  TECHNICAL: "incomplete-technical-limitation",
});

function technicalReasonCodesForRun({ orchestration, deadlineState }) {
  const reasons = new Set();
  if (deadlineState.expired) reasons.add("deadline");
  if (orchestration.toolCallBudgetExceeded) reasons.add("tool-call-budget");
  if (orchestration.physicalOpenBudgetExceeded) reasons.add("physical-open-budget");
  for (const execution of Object.values(orchestration.categoryExecutions)) {
    if (execution?.state === "Provider failure") reasons.add(execution.providerFailureType || "provider-failure");
    if (execution?.state === "Timed out") reasons.add("deadline");
    if (execution?.state === "Not searched") reasons.add(execution.followUpSkipReason || "required-discovery-not-searched");
    if (["physical-open-budget", "tool-call-budget", "provider-request-budget", "deadline", "provider-failure"].includes(execution?.followUpSkipReason)) {
      reasons.add(execution.followUpSkipReason);
    }
  }
  for (const source of orchestration.candidates) {
    const access = source?.accessOutcome;
    if (!access || access.state === "accessible") continue;
    if (access.reason === "physical-open-budget") reasons.add("physical-open-budget");
    else if (access.state === "not-attempted") reasons.add("document-not-attempted");
    else reasons.add("document-access-failure");
  }
  return [...reasons];
}

function candidateLineageForRun(result, orchestration) {
  const sources = Array.isArray(result?.sourceLedger) ? result.sourceLedger : [];
  const sourceLineage = sources.map((source) => {
    const access = source.accessOutcome ?? {};
    const rejectionReasons = [...new Set([
      ...(source.rejectionCodes ?? []),
      ...(access.state && access.state !== "accessible" ? [access.reason ?? `document-${access.state}`] : []),
      ...(source.claimSupportState === "supported" ? [] : ["No supported immutable claim-to-passage mapping was retained."]),
      ...(source.financialEligibilityState === "eligible" ? [] : ["Source did not reach governed evidence eligibility."]),
    ].filter(Boolean))];
    return {
      categoryId: source.categoryId ?? null,
      url: source.canonicalUrl ?? source.resolvedUrl ?? source.url ?? null,
      sourceChannel: source.sourceChannel ?? null,
      acquisitionPath: source.provenance ?? null,
      accessOutcome: {
        state: access.state ?? "unknown",
        reason: access.reason ?? null,
        physicalOpenIndex: access.physicalOpenIndex ?? null,
        reused: access.reused === true || source.documentAccessReused === true,
      },
      identityResult: {
        exactProject: source.exactProject === true,
        state: source.projectSpecificityState ?? (source.exactProject === true ? "project-specific" : "unresolved"),
      },
      passageResult: {
        state: access.passage || source.claimPassage ? "retained" : "not-retained",
        reason: access.passage || source.claimPassage ? null : access.reason ?? "No attributable passage was retained.",
      },
      eligibilityResult: {
        state: source.financialEligibilityState ?? "ineligible",
        rejectionReasons,
      },
      rejectionReason: rejectionReasons.join(" ") || null,
    };
  });
  const officialDiscoveryLineage = orchestration.categoryResults.flatMap((category) =>
    (category.coverage?.officialDiscoveryAttempts ?? []).map((attempt) => ({
      categoryId: category.categoryId,
      url: attempt.url ?? null,
      sourceChannel: attempt.sourceChannel ?? null,
      acquisitionPath: attempt.provenance ?? null,
      accessOutcome: {
        state: attempt.status === "completed" ? "accessible" : attempt.status ?? "unknown",
        reason: attempt.status === "completed" ? null : attempt.status ?? "discovery-failed",
        physicalOpenIndex: attempt.physicalOpenIndex ?? null,
        reused: false,
      },
      identityResult: {
        exactProject: false,
        state: "discovery-only",
      },
      passageResult: {
        state: attempt.status === "completed" && attempt.bytes > 0 ? "inspected" : "not-retained",
        reason: attempt.status === "completed" && attempt.bytes > 0 ? null : "Official discovery URL did not yield a retained exact-project passage.",
      },
      eligibilityResult: {
        state: "ineligible",
        rejectionReasons: ["Discovery-only URL did not reach governed claim eligibility."],
      },
      rejectionReason: "Discovery-only URL did not reach governed claim eligibility.",
    })));
  return [...sourceLineage, ...officialDiscoveryLineage].slice(0, RESEARCH_RUN_BUDGET.maxTotalCandidates + 32);
}

async function runValidatedResearch(project, {
  apiKey,
  fetchImpl,
  rateLimiter,
  req,
  documentFetchImpl = fetch,
  secConnector = null,
  ocrImpl,
  signal,
  categoryIds = null,
}) {
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
  const deadlineState = { expired: false };
  const externalSignal = signal;
  const abortFromRequest = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromRequest, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timeout = setTimeout(() => {
    deadlineState.expired = true;
    controller.abort();
  }, RESEARCH_PROJECT_TIMEOUT_MS);
  const runCorrelationId = randomUUID();
  const fetchedCandidatesByCategory = new Map();
  const reservedCandidatesByCategory = new Map();
  let reservedCandidateCount = 0;
  const openedDocumentsByCanonicalUrl = new Map();
  const documentAccessPromisesByCanonicalUrl = new Map();
  const discoveryAttemptedCategories = new Set();
  const secAttemptedCategories = new Set();
  let documentAccessQueue = Promise.resolve();
  let fetchedCandidateCount = 0;
  let physicalOpensUsed = 0;
  let physicalOpenBudgetExceeded = false;
  const authorizePhysicalOpen = () => {
    if (physicalOpensUsed >= RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens) {
      physicalOpenBudgetExceeded = true;
      return { allowed: false, physicalOpenIndex: null };
    }
    physicalOpensUsed += 1;
    return { allowed: true, physicalOpenIndex: physicalOpensUsed };
  };
  let activeSecConnector = secConnector;
  if (!activeSecConnector && process.env.SEC_USER_AGENT) {
    activeSecConnector = createSecConnector({
      userAgent: process.env.SEC_USER_AGENT,
      cache: SEC_CONNECTOR_CACHE,
      fetchImpl: async (url, init) => {
        const authorization = authorizePhysicalOpen();
        if (!authorization.allowed) throw new Error("physical-open-budget");
        return fetchPinnedPublicUrl(url, { ...init, signal: controller.signal });
      },
    });
  }
  try {
    const orchestration = await orchestrateCategoryResearch(project, {
      budget: RESEARCH_RUN_BUDGET,
      signal: controller.signal,
      deadlineState,
      concurrent: true,
    categoryIds,
      retrieveCategory: async ({ categoryId, query, attempt, remainingToolCalls, authorizeAdditionalProviderRequest }) => {
        const category = buildResearchCategoryPlan(project).categories.find((candidate) => candidate.categoryId === categoryId);
        const activeCategory = {
          categoryId,
          label: category?.label ?? categoryId,
          query,
          attempt,
          evidenceIds: category?.evidenceIds ?? [],
          runCorrelationId,
          maxToolCalls: Math.max(1, Math.min(RESEARCH_PROJECT_MAX_TOOL_CALLS, remainingToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS)),
        };
        let categoryResult;
        let repairAttempted = false;
        let providerRequestCount = 0;
        let observedToolCallCount = 0;
        const providerAttempts = [];
        const requestCategory = async (options) => {
          providerRequestCount += 1;
          try {
            const result = await researchProjectWithWebSearch(project, apiKey, fetchImpl, controller.signal, options);
            observedToolCallCount += Number.isInteger(result.coverage?.toolCallCount) ? result.coverage.toolCallCount : 0;
            if (result.coverage?.providerAttempt) providerAttempts.push(result.coverage.providerAttempt);
            return result;
          } catch (error) {
            observedToolCallCount += Number.isInteger(error?.toolCallCount) ? error.toolCallCount : 0;
            if (error?.providerAttempt) providerAttempts.push(error.providerAttempt);
            error.providerRequestCount = providerRequestCount;
            error.providerAttempts = [...providerAttempts];
            throw error;
          }
        };
        try {
          categoryResult = await requestCategory(activeCategory);
          categoryResult.requestCount = providerRequestCount;
          categoryResult.coverage.toolCallCount = observedToolCallCount;
          parseResearchResponse(
            categoryResult.research,
            [],
            new Date().toISOString().slice(0, 10),
            categoryResult.coverage,
            project.knownData ?? null,
            category?.evidenceIds ?? [],
          );
        } catch (error) {
          if (
            attempt === "primary"
            && error?.name === "ResearchParseError"
            && !controller.signal.aborted
            && !deadlineState.expired
            && observedToolCallCount < (activeCategory.maxToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS)
            && authorizeAdditionalProviderRequest?.() === true
          ) {
            repairAttempted = true;
            console.warn(
              `[research-project:${runCorrelationId}] Retrying malformed ${categoryId} category once with compact schema output.`,
            );
             categoryResult = await requestCategory({
              ...activeCategory,
              attempt: "repair",
              repair: true,
              maxToolCalls: Math.max(0, (activeCategory.maxToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS) - observedToolCallCount),
            });
            categoryResult.requestCount = providerRequestCount;
            categoryResult.coverage.toolCallCount = observedToolCallCount;
            parseResearchResponse(
              categoryResult.research,
              [],
              new Date().toISOString().slice(0, 10),
              categoryResult.coverage,
              project.knownData ?? null,
              category?.evidenceIds ?? [],
            );
          } else {
            if (error?.name === "ResearchParseError") {
              error.schemaErrors = [error.message];
              error.partialFindingsRetained = false;
              logProviderDiagnostic(error, { runCorrelationId, categoryId });
            }
            throw error;
          }
        }
        const discoveryAttempts = [];
        const authorityRecords = [];
        const secAttempts = [];
        const supplementalSources = [];
        if (
          categoryResult.sources.length === 0
          && !discoveryAttemptedCategories.has(categoryId)
          && !controller.signal.aborted
        ) {
          discoveryAttemptedCategories.add(categoryId);
          const discovery = await discoverOfficialSources({
            projectIdentity: project,
            knownData: project.knownData,
            category: categoryId,
            signal: controller.signal,
            maxAttempts: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
            authorizeAttempt: authorizePhysicalOpen,
            fetchImpl: documentFetchImpl === fetch
              ? (url, init) => fetchPinnedPublicUrl(url, init)
              : documentFetchImpl,
          });
          discoveryAttempts.push(...discovery.attempts);
          authorityRecords.push(...discovery.authorities);
          supplementalSources.push(...discovery.candidateUrls.map((candidate) => ({
            url: candidate.url,
            title: `Official exact-project discovery candidate for ${project.name}`,
            excerpt: "",
            accessStatus: "not provided",
            contentType: null,
            sourceClass: classifySource(candidate.url, project.knownData?.operator ?? project.name),
            sourceChannel: candidate.sourceChannel,
            origin: "official-domain-discovery",
            discoveryOnly: true,
            exactProject: Boolean(candidate.matchedAlias),
            relevanceNote: "Discovered through a bounded official-domain index; the document still requires access, passage retention, and claim mapping.",
          })));
        }
        const secRelevant = ["project-identity", "construction-capital", "tenant-counterparty"].includes(categoryId);
        const secIdentity = project.knownData?.ticker
          || project.knownData?.companyName
          || project.knownData?.operator;
        if (
          activeSecConnector
          && secRelevant
          && secIdentity
          && !secAttemptedCategories.has(categoryId)
          && !controller.signal.aborted
        ) {
          secAttemptedCategories.add(categoryId);
          try {
            const secResult = await activeSecConnector.search({
              ticker: project.knownData?.ticker,
              companyName: project.knownData?.companyName ?? project.knownData?.operator,
              projectName: project.name,
              terms: [project.name, ...(project.knownData?.aliases ?? [])],
              maxCandidates: 6,
            });
            secAttempts.push(...(secResult.attempts ?? []));
            supplementalSources.push(...(secResult.candidates ?? []).map((candidate) => ({
              ...candidate,
              url: candidate.url ?? candidate.archiveUrl,
              title: `${candidate.form ?? "SEC"} filing for ${project.knownData?.operator ?? project.name}`,
              excerpt: "",
              accessStatus: "not provided",
              contentType: "text/html",
              sourceClass: "primary-company",
              sourceChannel: "sec-public-data",
              origin: "sec-public-data",
              exactProject: false,
              relevanceNote: "Discovered through public read-only SEC submissions metadata; exact-project status requires retained filing text.",
            })));
          } catch (error) {
            secAttempts.push({
              sourceChannel: "sec-public-data",
              outcome: "failed",
              reason: sanitizeTransportText(error instanceof Error ? error.message : "SEC connector failed."),
            });
            categoryResult.coverage.providerLimitations = [
              ...(categoryResult.coverage.providerLimitations ?? []),
              "The public SEC connector did not return a usable candidate; other source families continued.",
            ];
          }
        }
        if (supplementalSources.length) {
          categoryResult.sources = prioritizeResearchSources([
            ...categoryResult.sources,
            ...supplementalSources,
          ], project);
          categoryResult.coverage.searchedDomains = [...new Set([
            ...(categoryResult.coverage.searchedDomains ?? []),
            ...supplementalSources.map(sourceHostname).filter(Boolean),
          ])];
          categoryResult.coverage.retrievedSourceCount = categoryResult.sources.length;
        }
        categoryResult.coverage.officialDiscoveryAttempts = discoveryAttempts;
        categoryResult.coverage.secConnectorAttempts = secAttempts;
        const categoryFetched = fetchedCandidatesByCategory.get(categoryId) ?? 0;
        const categoryReserved = reservedCandidatesByCategory.get(categoryId) ?? 0;
        const remainingCategory = Math.max(0, RESEARCH_RUN_BUDGET.maxCandidatesPerCategory - categoryFetched - categoryReserved);
        const remainingTotal = Math.max(0, RESEARCH_RUN_BUDGET.maxTotalCandidates - fetchedCandidateCount - reservedCandidateCount);
        reservedCandidatesByCategory.set(categoryId, categoryReserved + Math.max(0, remainingCategory));
        reservedCandidateCount += Math.max(0, remainingCategory);
        const boundedSources = categoryResult.sources.slice(0, Math.min(remainingCategory, remainingTotal));
        reservedCandidatesByCategory.set(categoryId, Math.max(0, (reservedCandidatesByCategory.get(categoryId) ?? 0) - boundedSources.length));
        reservedCandidateCount = Math.max(0, reservedCandidateCount - boundedSources.length);
        fetchedCandidatesByCategory.set(categoryId, categoryFetched + boundedSources.length);
        fetchedCandidateCount += boundedSources.length;
        const accessedSources = [];
        for (const source of boundedSources) {
          throwIfResearchCancelled(controller.signal);
          const originalUrl = source.originalUrl ?? source.url ?? null;
          const originalCanonicalUrl = canonicalizeSourceUrl(originalUrl);
          const announcedCanonicalUrl = canonicalizeSourceUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url);
          const hasProviderCanonicalIdentity = source.canonicalIdentityExplicit === true;
          const previousAccess = (originalCanonicalUrl && (
            openedDocumentsByCanonicalUrl.get(originalCanonicalUrl)
            ?? (hasProviderCanonicalIdentity ? documentAccessPromisesByCanonicalUrl.get(originalCanonicalUrl) : null)
          ))
            || (announcedCanonicalUrl && (
              openedDocumentsByCanonicalUrl.get(announcedCanonicalUrl)
              ?? (hasProviderCanonicalIdentity ? documentAccessPromisesByCanonicalUrl.get(announcedCanonicalUrl) : null)
            ))
            || null;
          let accessOutcome;
          if (previousAccess) {
            const priorReceipt = await previousAccess;
            accessOutcome = {
              ...priorReceipt,
              originalUrl,
              referringUrls: [...new Set([...(priorReceipt.referringUrls ?? []), originalUrl].filter(Boolean))],
            };
          } else {
            const preflight = evaluateResearchDocumentAccess(source);
            if (preflight.state !== "accessible") {
              accessOutcome = preflight;
            } else if (physicalOpensUsed >= RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens) {
              accessOutcome = {
                ...preflight,
                state: "not-attempted",
                reason: "physical-open-budget",
                originalUrl,
                resolvedUrl: null,
                canonicalUrl: announcedCanonicalUrl,
                referringUrls: [originalUrl].filter(Boolean),
                extractionLimitations: ["The hard physical document-open ceiling was reached; no additional document was fetched."],
              };
            } else {
              physicalOpensUsed += 1;
              const physicalOpenIndex = physicalOpensUsed;
              const accessTask = documentAccessQueue
                .then(() => accessResearchDocument(source, {
                  fetchImpl: documentFetchImpl,
                  signal: controller.signal,
                  ocrImpl,
                }))
                .then((outcome) => ({
                  ...outcome,
                  referringUrls: [originalUrl].filter(Boolean),
                  physicalOpenIndex,
                }));
              if (originalCanonicalUrl) documentAccessPromisesByCanonicalUrl.set(originalCanonicalUrl, accessTask);
              if (announcedCanonicalUrl) documentAccessPromisesByCanonicalUrl.set(announcedCanonicalUrl, accessTask);
              documentAccessQueue = accessTask.catch(() => {});
              accessOutcome = await accessTask;
              accessOutcome = {
                ...accessOutcome,
              };
              if (accessOutcome.underlyingDocumentUrl) {
                const underlyingAuthorization = authorizePhysicalOpen();
                if (underlyingAuthorization.allowed) {
                  const underlyingOutcome = await accessResearchDocument({
                    ...source,
                    url: accessOutcome.underlyingDocumentUrl,
                    originalUrl: accessOutcome.underlyingDocumentUrl,
                    javascriptOnly: false,
                    contentType: null,
                  }, {
                    fetchImpl: documentFetchImpl,
                    signal: controller.signal,
                    ocrImpl,
                  });
                  accessOutcome = {
                    ...underlyingOutcome,
                    originalUrl,
                    underlyingDocumentUrl: accessOutcome.underlyingDocumentUrl,
                    physicalOpenIndexes: [physicalOpenIndex, underlyingAuthorization.physicalOpenIndex],
                    physicalOpenIndex: underlyingAuthorization.physicalOpenIndex,
                    referringUrls: [originalUrl, accessOutcome.underlyingDocumentUrl].filter(Boolean),
                    extractionLimitations: [
                      ...(accessOutcome.extractionLimitations ?? []),
                      ...(underlyingOutcome.extractionLimitations ?? []),
                    ],
                  };
                }
              }
            }
          }
          if (hasProviderCanonicalIdentity && announcedCanonicalUrl) {
            accessOutcome = {
              ...accessOutcome,
              canonicalUrl: announcedCanonicalUrl,
            };
          }
          if (accessOutcome.reason === "physical-open-budget") {
            physicalOpenBudgetExceeded = true;
          }
          const finalCanonicalUrl = canonicalizeSourceUrl(accessOutcome.canonicalUrl ?? accessOutcome.resolvedUrl ?? announcedCanonicalUrl);
          if (!previousAccess) {
            if (originalCanonicalUrl) openedDocumentsByCanonicalUrl.set(originalCanonicalUrl, accessOutcome);
            if (hasProviderCanonicalIdentity && announcedCanonicalUrl) {
              openedDocumentsByCanonicalUrl.set(announcedCanonicalUrl, accessOutcome);
            }
            if (finalCanonicalUrl) openedDocumentsByCanonicalUrl.set(finalCanonicalUrl, accessOutcome);
          }
          accessedSources.push({
            ...source,
            searchDomain: categoryId,
            originalUrl,
            ...(finalCanonicalUrl ? { canonicalUrl: finalCanonicalUrl } : {}),
            ...(accessOutcome.resolvedUrl || accessOutcome.canonicalUrl
              ? { resolvedUrl: accessOutcome.resolvedUrl ?? accessOutcome.canonicalUrl }
              : {}),
            accessOutcome,
            ...(previousAccess ? { documentAccessReused: true } : {}),
            documentReferringUrls: accessOutcome.referringUrls ?? [originalUrl].filter(Boolean),
            accessibilityState: accessOutcome.state,
            parsingState: accessOutcome.state === "accessible" ? "parsed" : "failed",
            ...(accessOutcome.passage ? { excerpt: accessOutcome.passage } : {}),
          });
        }
        const eligibleCount = accessedSources.filter((source) => source.accessOutcome?.state === "accessible").length;
        const observedQueries = normalizeSearchTerms(
          categoryResult.coverage?.searchTerms,
          RESEARCH_PROJECT_MAX_TOOL_CALLS,
        );
        const normalizedCategoryResearch = containResearchResult(parseResearchResponse(
          categoryResult.research,
          accessedSources,
          new Date().toISOString().slice(0, 10),
          categoryResult.coverage,
          project.knownData ?? null,
          category?.evidenceIds ?? [],
        ));
        const categoryResolution = categoryResearchIsResolved(
          category,
          normalizedCategoryResearch,
          accessedSources,
          project,
          categoryResult.coverage,
        );
        return {
          candidates: accessedSources,
          eligibleCount,
          gapDrivenFollowUp: !categoryResolution.resolved && !repairAttempted,
          followUpQuery: buildCategoryFollowUpQuery(project, category, categoryResolution.unresolvedEvidenceIds),
          unresolvedEvidenceIds: categoryResolution.unresolvedEvidenceIds,
          resolvedEvidenceIds: category.evidenceIds.filter((id) => !categoryResolution.unresolvedEvidenceIds.includes(id)),
          categoryResolved: categoryResolution.resolved,
          repairAttempted,
          observedQueries,
          toolCallCount: categoryResult.coverage?.toolCallCount ?? 0,
           providerRequestCount,
          providerAttempts,
          discoveryAttempts,
          authorityRecords,
          secConnectorAttempts: secAttempts,
          sourceChannelTelemetry: categoryResult.coverage?.sourceChannelTelemetry ?? [],
          toolCallBudgetExceeded: categoryResult.coverage?.toolCallBudgetExceeded === true,
          physicalOpenBudgetExceeded,
          physicalOpensUsed,
          categoryResult: {
            categoryId,
            research: normalizedCategoryResearch,
            rawResearch: categoryResult.research,
            sources: accessedSources,
            coverage: { ...categoryResult.coverage, providerAttempts, officialDiscoveryAttempts: discoveryAttempts, authorityRecords, secConnectorAttempts: secAttempts },
          },
        };
      },
    });
    if (
      !orchestration.categoryResults.length
      && orchestration.lastError?.name === "UpstreamRequestError"
    ) {
      throw orchestration.lastError;
    }
    const mergedResearch = orchestration.categoryResults.length
      ? mergeCategoryResearchResults(project, orchestration.categoryResults)
      : createPartialResearchBody(project);
    if (!mergedResearch) throw new Error("Category research did not return a complete structured response.");
    const categoryFailureObserved = orchestration.lastError
      || Object.values(orchestration.categoryExecutions).some((execution) =>
        ["Provider failure", "Timed out"].includes(execution?.state));
    const technicalReasonCodes = technicalReasonCodesForRun({ orchestration, deadlineState });
    const terminalState = technicalReasonCodes.length
      ? RESEARCH_OUTCOMES.TECHNICAL
      : RESEARCH_OUTCOMES.NO_ELIGIBLE;
    const researchStatus = terminalState === RESEARCH_OUTCOMES.TECHNICAL ? "partial" : "completed";
    const providerLimitations = [
      ...orchestration.categoryResults.flatMap((category) => category.coverage?.providerLimitations ?? []),
       ...(categoryFailureObserved
        ? ["One or more category responses were invalid or unavailable; affected evidence remains Missing Evidence."]
        : []),
    ].slice(0, 12);
    const result = {
      research: mergedResearch,
      sources: orchestration.categoryResults.flatMap((category) => category.sources ?? []),
      coverage: {
        ...(orchestration.categoryResults[0]?.coverage ?? {}),
        searchedDomains: [...new Set(orchestration.categoryResults.flatMap((category) => category.coverage?.searchedDomains ?? []))],
        searchTerms: [...new Set(orchestration.categoryResults.flatMap((category) => category.coverage?.searchTerms ?? []))],
        toolCallCount: orchestration.toolCalls,
        observedToolCallCount: orchestration.categoryResults.reduce((total, category) => total + (category.coverage?.observedToolCallCount ?? category.coverage?.toolCallCount ?? 0), 0),
        acceptedToolCallCount: orchestration.toolCalls,
        physicalOpenBudget: RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
        physicalOpensUsed,
        physicalOpensRemaining: Math.max(0, RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens - physicalOpensUsed),
        physicalOpenBudgetExceeded: orchestration.physicalOpenBudgetExceeded,
        providerRequestCount: orchestration.providerRequests,
        providerAttempts: Object.values(orchestration.categoryExecutions).flatMap((execution) => execution?.providerAttempts ?? []),
        followUpCount: orchestration.followUps,
        followUpLimit: orchestration.followUpLimit,
        followUpLimitPerCategory: orchestration.followUpLimitPerCategory,
        sourcePriorityApplied: sourcePriorityApplied(project),
        toolCallBudgetExceeded: orchestration.toolCallBudgetExceeded,
        providerResponseIds: orchestration.categoryResults.map((category) => category.coverage?.providerResponseId).filter(Boolean),
        categoryExecutions: orchestration.categoryExecutions,
        providerLimitations,
        terminalReasonCodes: technicalReasonCodes,
        identityPhysicalOpenOpportunityReserved: !Array.isArray(categoryIds)
          || categoryIds.length === 0
          || categoryIds.includes("project-identity"),
        runCorrelationId,
        terminalState,
        startedAt: orchestration.startedAt,
        finishedAt: orchestration.finishedAt,
      },
    };
    try {
      const parsed = parseResearchResponse(
        result.research,
        result.sources,
        new Date().toISOString().slice(0, 10),
        result.coverage,
        project.knownData,
      );
      const eligibleEvidenceCount = parsed.evidence.filter((item) => item.eligibleForModel === true).length;
      const canonicalOutcome = technicalReasonCodes.length
        ? RESEARCH_OUTCOMES.TECHNICAL
        : eligibleEvidenceCount > 0
          ? RESEARCH_OUTCOMES.WITH_EVIDENCE
          : RESEARCH_OUTCOMES.NO_ELIGIBLE;
      parsed.researchOutcome = {
        state: canonicalOutcome,
        eligibleEvidenceCount,
        reasonCodes: technicalReasonCodes,
      };
      parsed.researchAudit.terminalState = canonicalOutcome;
      parsed.researchAudit.terminalReasonCodes = technicalReasonCodes;
      parsed.researchAudit.candidateLineage = candidateLineageForRun(parsed, orchestration);
      parsed.researchStatus = canonicalOutcome === RESEARCH_OUTCOMES.TECHNICAL ? researchStatus : "completed";
      if (canonicalOutcome === RESEARCH_OUTCOMES.TECHNICAL) {
        parsed.researchError = {
          type: deadlineState.expired ? "timeout" : "upstream",
          message: "A technical limitation prevented conclusive research. Retained findings remain proposals only.",
        };
      }
      const rawEvidenceById = new Map((mergedResearch.evidence ?? []).map((item) => [item.id, item]));
      parsed.evidence = parsed.evidence.map((item) => {
        const rawItem = rawEvidenceById.get(item.id);
        if (!rawItem) return item;
        return {
          ...item,
          ...(rawItem.sourceUrl && !item.sourceUrl ? { sourceUrl: rawItem.sourceUrl } : {}),
          ...(Array.isArray(rawItem.sourceUrls) && !item.sourceUrls?.length ? { sourceUrls: rawItem.sourceUrls } : {}),
          ...(Array.isArray(rawItem.sources) && !item.sources?.length ? { sources: rawItem.sources } : {}),
          ...(rawItem.eligibleForModel === true && item.eligibleForModel !== true
            ? {
                eligibleForModel: true,
                acceptedForModel: false,
                researchState: rawItem.researchState,
                sourceSupportConfidence: rawItem.sourceSupportConfidence,
                sourceValidation: rawItem.sourceValidation,
                quarantineReasons: rawItem.quarantineReasons ?? [],
              }
            : {}),
        };
      });
      parsed.cacheable = researchStatus === "completed";
      if (orchestration.categoryResults.length > 0 && !deadlineState.expired) parsed.cacheable = true;
      return parsed;
    } catch (error) {
      console.warn(
        `[research-project:${result?.coverage?.runCorrelationId ?? runCorrelationId}] Rejected structured research response:`,
        error instanceof Error ? error.message : "unknown validation error",
      );
      const structuredError = new Error("Invalid structured research response.");
      structuredError.name = "StructuredResearchError";
      structuredError.researchErrorType = "malformed-response";
      throw structuredError;
    }
  } catch (error) {
    if (externalSignal?.aborted) {
      const cancelled = new Error("Project research was cancelled.");
      cancelled.name = "ResearchCancelledError";
      cancelled.researchErrorType = "cancelled";
      throw cancelled;
    }
    if (error && !error.researchErrorType) error.researchErrorType = classifyResearchFailure(error).type;
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromRequest);
  }
}

export async function handleResearchProjectRequest(
  req,
  res,
  {
    apiKey = process.env.OPENAI_API_KEY,
    fetchImpl = fetch,
    documentFetchImpl = fetch,
    secConnector = null,
    ocrImpl,
    rateLimiter = defaultRateLimiter,
    cache = defaultResearchProjectCache,
    registry = defaultProjectResearchRegistry,
    categoryIds = null,
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
  const retainedNeedsRevalidation = retained?.needsRevalidation === true;
  if (!project.forceRefresh && containedRetained && !retainedNeedsRevalidation && (retainedState === "fresh" || retainedState === "recent")) {
    sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, retainedState)));
    return;
  }

  const requestController = new AbortController();
  const onRequestAborted = () => requestController.abort();
  req.once?.("aborted", onRequestAborted);
  const refresh = (foreground = true) => cache.refresh(key, () => runValidatedResearch(project, {
    apiKey,
    fetchImpl,
    documentFetchImpl,
    secConnector,
    ocrImpl,
    rateLimiter,
    req,
    categoryIds,
    signal: foreground ? requestController.signal : undefined,
  }).then(async (result) => {
    // Registry retention is deliberately best-effort: a local persistence
    // problem must never turn a valid research response into a provider error.
    await registry.retain(project, result, {
      runId: result?.researchAudit?.runCorrelationId ?? result?.researchCoverage?.runCorrelationId ?? null,
    }).catch((error) => {
      console.warn("[research-project] Registry retention failed:", error instanceof Error ? error.message : "unknown error");
    });
    return result;
  }));
  if (!project.forceRefresh && containedRetained && !retainedNeedsRevalidation && retainedState === "stale") {
    const background = refresh(false);
    void background.promise.catch((error) => {
      console.error("[research-project] Background refresh failed:", classifyResearchFailure(error).type);
    });
    req.removeListener?.("aborted", onRequestAborted);
    sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, "stale", "running")));
    return;
  }

  try {
    const { promise } = refresh();
    const entry = await promise;
    if (res.writableEnded || res.destroyed) return;
    sendJson(res, 200, withCacheMetadata(entry, cacheMetadata(key, entry, "updated")));
  } catch (error) {
    const failure = classifyResearchFailure(error);
    console.error("[research-project] Request failed:", failure.type);
    if (res.writableEnded || res.destroyed) return;
    if (containedRetained) {
      sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, "stale", "failed", {
        providerAvailable: false,
        errorType: failure.type,
        providerDiagnostic: failure.providerDiagnostic,
      })));
      return;
    }
    if (failure.type === "request-limit" && error?.retryAfterSeconds) {
      res.setHeader("retry-after", String(error.retryAfterSeconds));
    }
    sendJson(res, failure.status, {
      error: failure.message,
      errorType: failure.type,
      ...(failure.providerDiagnostic ? { providerDiagnostic: failure.providerDiagnostic } : {}),
    });
  } finally {
    req.removeListener?.("aborted", onRequestAborted);
  }
}

export {
  DEFAULT_RESEARCH_CAPACITY_MW,
  MAX_RESEARCH_CAPACITY_MW,
  OPENAI_RESPONSES_URL,
  RESEARCH_CATEGORIES,
  RESEARCH_CATEGORY_AUDIT_VERSION,
  RESEARCH_CATEGORY_STATES,
  RESEARCH_EVIDENCE_IDS,
  RESEARCH_PROJECT_MAX_TOKENS,
  RESEARCH_CATEGORY_MAX_TOKENS,
  RESEARCH_PROVIDER_MAX_CONCURRENCY,
  RESEARCH_PROJECT_MAX_TOOL_CALLS,
  RESEARCH_PROJECT_MODEL,
  RESEARCH_PROJECT_TIMEOUT_MS,
  RESEARCH_POLICY_VERSION,
  RESEARCH_RUN_BUDGET,
  RESEARCH_PROJECT_RESPONSE_SCHEMA,
  RESEARCH_PROJECT_SYSTEM_PROMPT,
  RESEARCH_QUERY_ANGLES,
  buildResearchAudit,
  buildResearchCategoryPlan,
  buildProjectIdentityContext,
  mergeCategoryResearchResults,
  buildCategoryFollowUpQuery,
  buildResearchProjectPrompt,
  buildVariableQueries,
  buildVariableQueryPlan,
  accessResearchDocument,
  createPinnedLookup,
  evaluateResearchDocumentAccess,
  extractResponseOutputText,
  orchestrateCategoryResearch,
  researchProjectWithWebSearch,
  normalizeCapacityMW,
  normalizeReportedCapacityMW,
  parseResearchProjectBody,
  parseResearchResponse,
  normalizeRetrievedSources,
  extractResearchSourceUrls,
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
  createResearchProviderGate,
  classifyResearchFailure,
  prioritizeResearchSources,
  sourcePriorityApplied,
  runValidatedResearch,
};