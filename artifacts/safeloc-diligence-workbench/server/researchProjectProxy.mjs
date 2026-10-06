import { defaultResearchProjectCache } from "./researchProjectCache.mjs";
import { RESEARCH_MODEL_CONFIG, resolveResearchModelConfig } from "./researchModelConfig.mjs";
import { boundedAuditOperation, retryDatabaseConnectionOperation } from "./databaseResilience.mjs";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
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
import { extractClaimScopeFromPassage } from "../src/data/claimScopeExtractor.mjs";
import {
  hasUsableResearchPassage,
  researchContentRejectionReason,
} from "../src/data/researchContentQuality.mjs";
import {
  assessResearchProjectIdentity,
  assessResearchPassageExaminationEligibility,
  corroborateRelatedFacilityAcrossPassages,
} from "../src/data/researchIdentity.mjs";
import { defaultProjectResearchRegistry } from "./projectResearchRegistry.mjs";
import { discoverOfficialSources } from "./officialSourceDiscovery.mjs";
import {
  discoverGoogleGroundedProject,
  GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES,
  GOOGLE_GEMINI_MODEL,
} from "./googleGroundedDiscovery.mjs";
import {
  extractResearchDocument,
  normalizePublicationDate,
} from "./researchDocumentExtraction.mjs";
import { rankAcquisitionCandidates } from "./researchAcquisitionRanking.mjs";
import { createSecConnector } from "./secConnector.mjs";
import { releaseIdentity } from "./version.mjs";
import { createResearchFunnelDiagnostics } from "./researchFunnelDiagnostics.mjs";
import { consumeAcceptanceCaptureOptIn } from "./researchAcceptanceCapture.mjs";
import { buildReportedResearchFindings, reportedFindingsFromVerifiedFindings } from "./researchReportedFindings.mjs";
import {
  extractResearchFindings, findingsConfig, defaultFindingsTokenBudget,
  boundedFindingsDiscoveryFetch,
} from "./researchFindings.mjs";
export { buildReportedResearchFindings } from "./researchReportedFindings.mjs";

const RESEARCH_PROJECT_PROMPT_VERSION = "safeloc-project-research-prompt-v1";
const GOOGLE_DISCOVERY_PROMPT_VERSION = "safeloc-google-grounding-prompt-v3";
const CLAIM_REVIEW_VERSION = "policy-check-trace-v2";
const RESEARCH_REQUEST_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const RESEARCH_REQUEST_IDEMPOTENCY_MAX_ENTRIES = 1_024;
const RESEARCH_RUN_INITIATORS = new Set([
  "user-action",
  "user-retry",
  "background-refresh",
  "api-client",
]);
const researchRunRequests = new Map();

function parseResearchRequestIdentity(body) {
  const requestId = body.requestId === undefined ? randomUUID() : body.requestId;
  if (typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) {
    throw new Error('Research field "requestId" must be a 1–128 character request identifier.');
  }
  const initiator = body.initiator === undefined ? "api-client" : body.initiator;
  if (typeof initiator !== "string" || !RESEARCH_RUN_INITIATORS.has(initiator)) {
    throw new Error('Research field "initiator" is not supported.');
  }
  return { requestId, initiator };
}

function researchRunRequestKey(projectCacheKey, { requestId, initiator }) {
  return `${projectCacheKey}:${initiator}:${requestId}`;
}

function findResearchRunRequest(key) {
  const now = Date.now();
  for (const [entryKey, entry] of researchRunRequests) {
    if (now - entry.createdAt > RESEARCH_REQUEST_IDEMPOTENCY_TTL_MS) researchRunRequests.delete(entryKey);
  }
  const entry = researchRunRequests.get(key);
  if (!entry) return null;
  researchRunRequests.delete(key);
  researchRunRequests.set(key, entry);
  return entry;
}

function rememberResearchRunRequest(key, entry) {
  researchRunRequests.delete(key);
  researchRunRequests.set(key, { ...entry, createdAt: Date.now() });
  while (researchRunRequests.size > RESEARCH_REQUEST_IDEMPOTENCY_MAX_ENTRIES) {
    researchRunRequests.delete(researchRunRequests.keys().next().value);
  }
}

function sourceStateTransition(from, to, reason) {
  return { from, to, reason };
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const RESEARCH_PROJECT_MODEL = RESEARCH_MODEL_CONFIG.model;
const RESEARCH_PROJECT_MAX_TOKENS = RESEARCH_MODEL_CONFIG.projectOutputTokens;
const RESEARCH_CATEGORY_MAX_TOKENS = RESEARCH_MODEL_CONFIG.categoryOutputTokens;
const DEFAULT_RESEARCH_CATEGORY_INPUT_TOKEN_CAP = 5_000;
const PROVIDER_TOKEN_WINDOW_MS = 60_000;
const PROVIDER_RESPONSE_RESERVE_MS = 1_000;
const RESEARCH_CATEGORY_ORDER = Object.freeze([
  "project-identity",
  "grid",
  "construction-capital",
  "permitting-community",
  "water",
  "tenant-counterparty",
  "electricity",
  "climate-operational-hazard",
]);
const RESEARCH_PROVIDER_MAX_CONCURRENCY = 1;
// The browser retains its 90s limit; leave room for partial serialization and delivery.
const RESEARCH_PROJECT_TIMEOUT_MS = 75_000;
const DEFAULT_PROVIDER_RATE_LIMIT_PRESSURE_MS = 1_000;
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
const RESEARCH_BUDGET_OVERRIDE_FIELDS = Object.freeze([
  "maxProviderRequests",
  "maxFollowUps",
  "maxFollowUpsPerCategory",
  "maxCandidatesPerCategory",
  "maxTotalCandidates",
  "maxToolCalls",
  "maxPhysicalDocumentOpens",
]);

function boundedResearchBudget(overrides) {
  const budget = { ...RESEARCH_RUN_BUDGET };
  if (!isRecord(overrides)) return budget;
  for (const key of RESEARCH_BUDGET_OVERRIDE_FIELDS) {
    const requested = overrides[key];
    const maximum = RESEARCH_RUN_BUDGET[key];
    if (Number.isInteger(requested) && requested >= 0) {
      budget[key] = Math.min(maximum, requested);
    }
  }
  return budget;
}
const MAX_RESEARCH_PROVIDER_ATTEMPT_RECORDS = 64;
const MAX_RESEARCH_PROVIDER_RESPONSE_IDS = RESEARCH_RUN_BUDGET.maxProviderRequests;
const MAX_RESEARCH_DISCOVERY_AUDIT_CANDIDATES = GOOGLE_GROUNDED_DISCOVERY_MAX_CANDIDATES;
const MAX_RESEARCH_SOURCE_ATTEMPT_AUDIT_RECORDS =
  MAX_RESEARCH_DISCOVERY_AUDIT_CANDIDATES + MAX_RESEARCH_PROVIDER_ATTEMPT_RECORDS;
export const PROTECTED_SOURCE_OPPORTUNITIES = Object.freeze([
  "exact-project-identity",
  "company-developer",
  "city-county-authority",
  "construction-permitting",
  "grid-power",
  "water",
  "community",
  "counterparty",
  "climate",
]);
const PROTECTED_OPPORTUNITY_CATEGORIES = Object.freeze({
  "project-identity": ["exact-project-identity"],
  "construction-capital": ["company-developer", "construction-permitting"],
  "permitting-community": ["city-county-authority", "community"],
  grid: ["grid-power"],
  water: ["water"],
  "tenant-counterparty": ["counterparty"],
  "climate-operational-hazard": ["climate"],
});
const RESEARCH_DOCUMENT_MAX_BYTES = 1_000_000;
const RESEARCH_DOCUMENT_MAX_REDIRECTS = 3;
const RESEARCH_DOCUMENT_TIMEOUT_MS = 12_000;
const RESEARCH_DOCUMENT_ANALYSIS_RESERVE_MS = 20_000;
const RESEARCH_DOCUMENT_MAX_CONCURRENCY = 4;
const NON_RETAINED_DOCUMENT_OUTCOMES = new Set(["blocked-or-shell", "low-content", "site-boilerplate"]);
const SEC_CONNECTOR_CACHE = new Map();
const RESEARCH_CATEGORY_STATES = Object.freeze([
  "Complete",
  "Partial",
  "No eligible evidence",
  "Not assessed",
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

function protectedOpportunityForSource(categoryId, source = {}, categoryCounts = new Map()) {
  const channel = String(source.sourceChannel ?? "").toLowerCase();
  if (/city|county|municipal|authority/.test(channel)) return "city-county-authority";
  if (/company|developer|sec|investor/.test(channel)) return "company-developer";
  const opportunities = PROTECTED_OPPORTUNITY_CATEGORIES[categoryId] ?? [];
  if (!opportunities.length) return null;
  const count = categoryCounts.get(categoryId) ?? 0;
  return opportunities[Math.min(count, opportunities.length - 1)] ?? null;
}

/**
 * A run-wide physical-open scheduler. Canonical identities are receipts, not
 * opportunities: a failed receipt still consumes one open, while a later
 * occurrence of that identity reuses the same receipt at zero cost.
 *
 * The first candidate for each protected source role is admitted before a
 * category can spend the remaining ceiling on generic context. This is
 * deliberately independent of evidence eligibility; all downstream gates
 * still apply after access.
 */
export function createPhysicalOpenScheduler({
  maxPhysicalOpens = RESEARCH_RUN_BUDGET.maxPhysicalDocumentOpens,
  activeCategoryIds = Object.keys(PROTECTED_OPPORTUNITY_CATEGORIES),
} = {}) {
  const receipts = new Map();
  const protectedRoles = new Set();
  const openedCategories = new Set();
  const activeCategories = new Set(activeCategoryIds);
  const categoryCounts = new Map();
  let used = 0;

  const authorize = ({ categoryId = "unknown", canonicalUrl = null, source = {} } = {}) => {
    const canonical = canonicalizeSourceUrl(canonicalUrl ?? source.url);
    if (canonical && receipts.has(canonical)) {
      return { allowed: true, reused: true, physicalOpenIndex: receipts.get(canonical).physicalOpenIndex, canonicalUrl: canonical };
    }
    const role = protectedOpportunityForSource(categoryId, source, categoryCounts);
    const unfilledProtectedRoles = PROTECTED_SOURCE_OPPORTUNITIES.filter((item) => !protectedRoles.has(item));
    if (role && !protectedRoles.has(role)) {
      if (used >= maxPhysicalOpens) return { allowed: false, reused: false, reason: "physical-open-budget", canonicalUrl: canonical };
      used += 1;
      protectedRoles.add(role);
      openedCategories.add(categoryId);
      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
      const receipt = { physicalOpenIndex: used, role, canonicalUrl: canonical };
      if (canonical) receipts.set(canonical, receipt);
      return { allowed: true, reused: false, physicalOpenIndex: used, canonicalUrl: canonical, protectedRole: role };
    }
    if (activeCategories.has(categoryId) && !openedCategories.has(categoryId)) {
      if (used >= maxPhysicalOpens) return { allowed: false, reused: false, reason: "physical-open-budget", canonicalUrl: canonical };
      used += 1;
      openedCategories.add(categoryId);
      categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
      const receipt = { physicalOpenIndex: used, role: role ?? null, canonicalUrl: canonical };
      if (canonical) receipts.set(canonical, receipt);
      return { allowed: true, reused: false, physicalOpenIndex: used, canonicalUrl: canonical, protectedRole: role ?? null };
    }
    const unattemptedCategories = [...activeCategories].filter((categoryId) => !openedCategories.has(categoryId));
    if (unattemptedCategories.length > 0 && used >= maxPhysicalOpens - unattemptedCategories.length) {
      return {
        allowed: false,
        reused: false,
        reason: "protected-opportunity",
        canonicalUrl: canonical,
        protectedRolesRemaining: unfilledProtectedRoles,
        categoriesRemaining: unattemptedCategories,
      };
    }
    if (used >= maxPhysicalOpens) return { allowed: false, reused: false, reason: "physical-open-budget", canonicalUrl: canonical };
    used += 1;
    openedCategories.add(categoryId);
    categoryCounts.set(categoryId, (categoryCounts.get(categoryId) ?? 0) + 1);
    const receipt = { physicalOpenIndex: used, role: null, canonicalUrl: canonical };
    if (canonical) receipts.set(canonical, receipt);
    return { allowed: true, reused: false, physicalOpenIndex: used, canonicalUrl: canonical };
  };

  const registerReceipt = ({ canonicalUrl, receipt } = {}) => {
    const canonical = canonicalizeSourceUrl(canonicalUrl);
    if (!canonical || !receipt) return;
    const authorization = receipts.get(canonical);
    receipts.set(canonical, {
      ...receipt,
      physicalOpenIndex: Number.isInteger(receipt.physicalOpenIndex)
        ? receipt.physicalOpenIndex
        : authorization?.physicalOpenIndex ?? null,
      canonicalUrl: receipt.canonicalUrl ?? canonical,
    });
  };

  return {
    authorize,
    registerReceipt,
    getReceipt: (canonicalUrl) => {
      const canonical = canonicalizeSourceUrl(canonicalUrl);
      return canonical ? receipts.get(canonical) ?? null : null;
    },
    get used() { return used; },
    get protectedRoles() { return [...protectedRoles]; },
    get receipts() { return new Map(receipts); },
  };
}

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
          capacityProvenance: { type: "string", enum: ["ai-reported", "directory-reported", "unknown"] },
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
    ...(typeof extras.runId === "string" ? { runId: extras.runId } : {}),
    ...(typeof extras.initiator === "string" ? { initiator: extras.initiator } : {}),
    ...(typeof extras.requestId === "string" ? { requestId: extras.requestId } : {}),
    ...(Array.isArray(extras.providerAttempts)
      ? { providerAttempts: extras.providerAttempts.slice(0, RESEARCH_RUN_BUDGET.maxProviderRequests) }
      : {}),
    ...(Number.isInteger(extras.inFlightAnalysisCount)
      ? { inFlightAnalysisCount: Math.max(0, extras.inFlightAnalysisCount) }
      : {}),
  };
}

function withCacheMetadata(entry, metadata) {
  const { cacheable: _cacheable, ...publicResult } = entry.result ?? {};
  return { ...publicResult, researchCache: metadata };
}

const RESEARCH_CATEGORY_SYSTEM_PROMPT = `You are SafeLoc's evidence analyst. Analyze only the category and evidence identifiers in the user message, using the physically retrieved passages supplied in that request. Do not browse or treat titles, URLs, snippets, directory context, or search plans as evidence. Return the exact strict JSON schema, with no extra keys. Quote claimPassage exactly from a supplied passage; preserve names, values, units, dates, status, facility/phase scope, and qualifiers. Use Missing Evidence when the packet does not support a claim. Classify independent government records as Verified Evidence and company statements as Management Assertion; never upgrade confidence from model self-ratings.`;

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

function scopeValueIsKnown(value) {
  return typeof value === "string"
    && value.trim() !== ""
    && !/^(?:unknown|n\/a|na|not applicable|not disclosed|not established)$/i.test(value.trim());
}

function normalizedScopeValue(field, value) {
  if (field === "facilityScope") {
    const normalized = value.trim().toLowerCase();
    return ["exact-project", "project"].includes(normalized) ? "project"
      : ["exact-facility", "facility"].includes(normalized) ? "facility"
        : normalized;
  }
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function mergeClaimScopeMetadata(item, sourceMetadata, extracted) {
  const merged = {};
  const conflicts = new Set();
  const fields = [
    ["facilityScope", "unknown"],
    ["phaseScope", "unknown"],
    ["claimTimePeriod", null],
    ["phaseIdentity", null],
  ];
  for (const [field, unknownValue] of fields) {
    const sourceField = field === "claimTimePeriod" ? "timePeriod" : field;
    const candidates = [item?.[field], sourceMetadata?.[sourceField], extracted?.[field]]
      .filter(scopeValueIsKnown);
    const distinctValues = new Set(candidates.map((value) => normalizedScopeValue(field, value)));
    if (distinctValues.size > 1) {
      conflicts.add(field);
      merged[field] = unknownValue;
      continue;
    }
    merged[field] = candidates[0] ?? unknownValue;
  }
  if (conflicts.has("facilityScope") || conflicts.has("phaseScope")) {
    merged.phaseIdentity = null;
  }
  return merged;
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

function safePublicDiagnosticUrl(value) {
  const safeUrl = safePublicSourceUrl(value);
  if (!safeUrl) return null;
  try {
    const url = new URL(safeUrl);
    url.search = "";
    url.hash = "";
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

function prohibitedAddressRule(address) {
  const value = String(address?.address ?? "").replace(/^\[|\]$/g, "");
  const family = Number(address?.family);
  if (![4, 6].includes(family) || isIP(value) !== family) return "unsupported-answer-family";
  if (family === 4) {
    const octets = value.split(".").map(Number);
    const [a, b, c, d] = octets;
    if (a === 0) return "ipv4-this-network";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "ipv4-private-use";
    if (a === 127) return "ipv4-loopback";
    if (a === 169 && b === 254) return "ipv4-link-local";
    if (a === 100 && b >= 64 && b <= 127) return "ipv4-carrier-grade-nat";
    if ((a === 192 && b === 0) || (a === 192 && b === 88 && c === 99)) return "ipv4-special-purpose";
    if ((a === 192 && b === 2) || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)) return "ipv4-documentation";
    if (a === 198 && (b === 18 || b === 19)) return "ipv4-benchmark";
    if (a >= 224) return "ipv4-multicast-or-reserved";
    if (a === 255 && b === 255 && c === 255 && d === 255) return "ipv4-limited-broadcast";
    return "ipv4-prohibited-special-purpose";
  }
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (isIP(mapped) === 4) return prohibitedAddressRule({ address: mapped, family: 4 });
  }
  const normalized = value.toLowerCase();
  if (normalized === "::") return "ipv6-unspecified";
  if (normalized === "::1") return "ipv6-loopback";
  const firstGroup = normalized.split(":").find(Boolean) ?? "";
  const first = Number.parseInt(firstGroup.padStart(4, "0").slice(0, 4), 16);
  if ((first & 0xfe00) === 0xfc00) return "ipv6-unique-local";
  if ((first & 0xffc0) === 0xfe80) return "ipv6-link-local";
  if ((first & 0xff00) === 0xff00) return "ipv6-multicast";
  if (normalized.startsWith("2001:db8:")) return "ipv6-documentation";
  if ((first & 0xff00) === 0xfe00) return "ipv6-special-purpose";
  return "ipv6-prohibited-special-purpose";
}

export async function resolvePublicAddress(url, dnsLookup = dns.lookup, signal) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error("malformed-destination");
    error.name = "PublicAddressValidationError";
    error.addressValidationReason = "malformed-destination";
    error.addressValidationCategory = "destination-syntax";
    error.addressValidationRule = "invalid-url";
    throw error;
  }
  if (isPrivateNetworkHostname(parsed.hostname)) {
    const error = new Error("private-destination");
    error.name = "PublicAddressValidationError";
    error.addressValidationReason = "prohibited-address-class";
    error.addressValidationCategory = "hostname-policy";
    error.addressValidationRule = "local-or-reserved-hostname";
    throw error;
  }
  let addresses;
  try {
    addresses = await awaitWithResearchSignal(
      Promise.resolve().then(() => dnsLookup(parsed.hostname, { all: true, verbatim: true })),
      signal,
    );
  } catch (caught) {
    if (signal?.aborted || caught?.name === "ResearchCancelledError") throw createResearchCancellationError();
    const error = new Error("dns-lookup-failure");
    error.name = "PublicAddressValidationError";
    error.addressValidationReason = "dns-lookup-failure";
    error.addressValidationCategory = "resolver";
    error.addressValidationRule = "resolver-error";
    throw error;
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    const error = new Error("private-destination");
    error.name = "PublicAddressValidationError";
    error.addressValidationReason = "no-usable-public-address";
    error.addressValidationCategory = "dns-answer-policy";
    error.addressValidationRule = "no-usable-answer";
    error.addressValidationTelemetry = {
      answerCount: 0,
      addressFamilies: [],
      addressFamilyCounts: { ipv4: 0, ipv6: 0, other: 0 },
      publicAnswerCount: 0,
      prohibitedAnswerCount: 0,
      rejectingRules: ["no-usable-answer"],
    };
    throw error;
  }
  const validAnswers = addresses.filter((address) =>
    address && [4, 6].includes(address.family) && isIP(String(address.address ?? "")) === address.family);
  const publicAnswers = validAnswers.filter((address) => !isPrivateNetworkHostname(address.address));
  const rejectingRules = [...new Set(addresses
    .filter((address) =>
      !address
      || ![4, 6].includes(address.family)
      || isIP(String(address.address ?? "")) !== address.family
      || isPrivateNetworkHostname(address.address))
    .map((address) => prohibitedAddressRule(address)))].sort();
  const validationTelemetry = {
    answerCount: addresses.length,
    addressFamilies: [...new Set(validAnswers.map((address) => address.family))].sort(),
    addressFamilyCounts: {
      ipv4: addresses.filter((address) => address?.family === 4).length,
      ipv6: addresses.filter((address) => address?.family === 6).length,
      other: addresses.filter((address) => ![4, 6].includes(address?.family)).length,
    },
    publicAnswerCount: publicAnswers.length,
    prohibitedAnswerCount: addresses.length - publicAnswers.length,
    rejectingRules,
  };
  if (addresses.some((address) =>
    !address
    || ![4, 6].includes(address.family)
    || isIP(String(address.address ?? "")) !== address.family
    || isPrivateNetworkHostname(address.address))) {
    const error = new Error("private-destination");
    error.name = "PublicAddressValidationError";
    error.addressValidationReason = "prohibited-address-class";
    error.addressValidationCategory = "dns-answer-policy";
    error.addressValidationRule = rejectingRules[0] ?? "prohibited-special-purpose-address";
    error.addressValidationTelemetry = validationTelemetry;
    throw error;
  }
  return Object.assign(addresses[0], { validationTelemetry });
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
  return resolvePublicAddress(url, dnsLookup, init.signal).then((address) => new Promise((resolve, reject) => {
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
      const result = new Response(Readable.toWeb(response), {
        status: response.statusCode ?? 502,
        headers,
      });
      Object.defineProperty(result, "dnsValidationTelemetry", {
        value: address.validationTelemetry ?? null,
        enumerable: false,
      });
      resolve(result);
    });
    request.once("error", reject);
    request.end();
  }));
}

async function fetchResearchDocumentUrl(url, init, {
  fetchImpl,
  dnsLookup,
  transportImpl,
} = {}) {
  const requestPromise = Promise.resolve().then(async () => {
    if (typeof transportImpl === "function") {
      const address = await resolvePublicAddress(url, dnsLookup, init.signal);
      return transportImpl(url, init, { address });
    }
    if (fetchImpl === fetch) return fetchPinnedPublicUrl(url, init, dnsLookup);
    return fetchImpl(url, init);
  });
  void requestPromise.then((response) => {
    if (init.signal?.aborted) {
      void Promise.resolve(response?.body?.cancel?.()).catch(() => {});
    }
  }, () => {});
  return await awaitWithResearchSignal(requestPromise, init.signal);
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
    const facilityIdentifiers = Array.isArray(body.knownData.facilityIdentifiers)
      ? [...new Set(body.knownData.facilityIdentifiers.map((value) => normalizeKnownText(value, 80)).filter(Boolean))].slice(0, 12)
      : [];
    const operatorAliases = Array.isArray(body.knownData.operatorAliases)
      ? [...new Set(body.knownData.operatorAliases.map((value) => normalizeKnownText(value, 160)).filter(Boolean))].slice(0, 8)
      : [];
    const ownerAliases = Array.isArray(body.knownData.ownerAliases)
      ? [...new Set(body.knownData.ownerAliases.map((value) => normalizeKnownText(value, 160)).filter(Boolean))].slice(0, 8)
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
      ...(facilityIdentifiers.length ? { facilityIdentifiers } : {}),
      ...(operatorAliases.length ? { operatorAliases } : {}),
      ...(ownerAliases.length ? { ownerAliases } : {}),
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
  const normalizedName = nonEmptyString(name, "name", 160);
  const rawProjectIdentity = body.projectIdentity;
  if (rawProjectIdentity !== undefined && !isRecord(rawProjectIdentity)) {
    throw new Error('Research field "projectIdentity" must be an object.');
  }
  const identityText = (value, field) => {
    if (value === null || value === undefined) return null;
    return nonEmptyString(value, field, 160);
  };
  const projectIdentity = rawProjectIdentity
    ? {
        projectId: identityText(rawProjectIdentity.projectId, "projectIdentity.projectId"),
        providerId: identityText(rawProjectIdentity.providerId, "projectIdentity.providerId"),
        name: nonEmptyString(rawProjectIdentity.name, "projectIdentity.name", 160),
        location: nonEmptyString(rawProjectIdentity.location, "projectIdentity.location", 160),
        operator: identityText(rawProjectIdentity.operator, "projectIdentity.operator"),
      }
    : {
        projectId: null,
        providerId: knownData?.providerId ?? null,
        name: normalizedName,
        location: displayLocation,
        operator: knownData?.operator ?? null,
      };
  if (
    projectIdentity.name !== normalizedName ||
    projectIdentity.location !== displayLocation ||
    (knownData?.operator !== undefined && projectIdentity.operator !== knownData.operator) ||
    (knownData?.providerId !== undefined && projectIdentity.providerId !== knownData.providerId)
  ) {
    throw new Error("Research project identity does not match the submitted project.");
  }
  if (projectIdentity.operator || projectIdentity.providerId) {
    knownData = {
      ...(knownData ?? {}),
      ...(!knownData?.operator && projectIdentity.operator ? { operator: projectIdentity.operator } : {}),
      ...(!knownData?.providerId && projectIdentity.providerId ? { providerId: projectIdentity.providerId } : {}),
    };
  }
  return {
    name: normalizedName,
    location: displayLocation,
    projectIdentity,
    ...(knownData ? { knownData } : {}),
    ...(focusIds ? { focusIds } : {}),
    ...(currentEvidence ? { currentEvidence } : {}),
    ...(body.forceRefresh === true ? { forceRefresh: true } : {}),
  };
}

function extractProviderUserMessages(requestBody) {
  try {
    const parsed = JSON.parse(requestBody);
    const input = Array.isArray(parsed?.input)
      ? parsed.input
      : typeof parsed?.input === "string"
        ? [{ role: "user", content: parsed.input }]
        : Array.isArray(parsed?.messages) ? parsed.messages : [];
    return input
      .filter((message) => message?.role === "user")
      .flatMap((message) => {
        if (typeof message.content === "string") return [message.content];
        if (!Array.isArray(message.content)) return [];
        const parts = message.content
          .filter((part) => typeof part?.text === "string")
          .map((part) => part.text);
        return parts.length ? [parts.join("")] : [];
      });
  } catch {
    return [];
  }
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

function projectClaimValidationContext(project = {}) {
  const knownData = isRecord(project.knownData) ? project.knownData : {};
  return {
    ...knownData,
    name: project.name ?? knownData.name ?? knownData.projectName ?? "",
    location: project.location ?? knownData.location ?? "",
    operator: knownData.operator ?? project.operator ?? null,
    aliases: knownData.aliases ?? project.aliases ?? [],
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

function registerOrFindSiteBoilerplate(tracker, sourceUrl, passage) {
  let host;
  try {
    host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const words = String(passage).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? [];
  const shingles = new Set();
  for (let index = 0; index <= words.length - 5; index += 1) {
    shingles.add(words.slice(index, index + 5).join(" "));
  }
  if (shingles.size < 10) return null;
  const existing = tracker.get(host) ?? [];
  for (const prior of existing) {
    const lengthRatio = Math.min(shingles.size, prior.shingles.size) / Math.max(shingles.size, prior.shingles.size);
    if (lengthRatio < 0.85) continue;
    const smaller = shingles.size <= prior.shingles.size ? shingles : prior.shingles;
    const larger = smaller === shingles ? prior.shingles : shingles;
    let overlap = 0;
    for (const shingle of smaller) if (larger.has(shingle)) overlap += 1;
    if (overlap / smaller.size >= 0.9) {
      return "near-identical-article-already-retained-on-site";
    }
  }
  if (existing.length < 80) tracker.set(host, [...existing, { shingles }]);
  return null;
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

function createResearchBudgetError(reason, timeSliceMs = null) {
  const error = new Error(reason === "analysis-budget-reserved"
    ? "Research work was deferred to preserve the analysis budget."
    : "Research work did not finish within its bounded time slice.");
  error.name = "ResearchBudgetExceededError";
  error.researchBudgetReason = reason;
  if (reason === "provider-deadline-admission") error.researchErrorType = reason;
  if (Number.isFinite(timeSliceMs)) error.timeSliceMs = timeSliceMs;
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

function normalizeProviderResponseId(value) {
  if (typeof value !== "string") return null;
  const normalized = sanitizeTransportText(value, 180);
  return /^[A-Za-z0-9._-]{1,180}$/.test(normalized) ? normalized : null;
}

function structuredEvidenceRecords(research) {
  const evidence = research?.evidence;
  if (Array.isArray(evidence)) return evidence.filter(isRecord).slice(0, RESEARCH_EVIDENCE_IDS.length);
  if (isRecord(evidence)) return Object.values(evidence).filter(isRecord).slice(0, RESEARCH_EVIDENCE_IDS.length);
  return [];
}

function countStructuredResearchClaims(research) {
  const unavailable = /^(?:not disclosed|not established|not available|unavailable|unknown|missing evidence|n\/a|none|null)[.!]?$/i;
  return structuredEvidenceRecords(research).filter((item) => {
    if (typeof item.numericValue === "number" && Number.isFinite(item.numericValue)) return true;
    return [item.value, item.qualitativeValue].some((value) => (
      (typeof value === "string" && value.trim().length > 0 && !unavailable.test(value.trim()))
      || typeof value === "number" && Number.isFinite(value)
      || typeof value === "boolean"
    ));
  }).length;
}

function createStructuredResponseDiagnostic(research, {
  outcome = "validated",
  validationErrorType = null,
} = {}) {
  const evidenceRecords = structuredEvidenceRecords(research);
  const claimCount = countStructuredResearchClaims(research);
  if (outcome === "unparseable" || outcome === "no-structured-output") {
    return {
      state: outcome,
      evidenceRecordCount: null,
      returnedClaimCount: null,
      rejectedClaimCount: null,
      validationErrorType: null,
    };
  }
  const rejected = outcome === "rejected";
  const receivedOnly = outcome === "received";
  return {
    state: rejected
      ? claimCount > 0 ? "claims-rejected" : "zero-claims-rejected"
      : receivedOnly
        ? claimCount > 0 ? "claims-received" : "zero-claims-received"
        : claimCount > 0 ? "claims-validated" : "zero-claims",
    evidenceRecordCount: Math.min(RESEARCH_EVIDENCE_IDS.length, evidenceRecords.length),
    returnedClaimCount: Math.min(RESEARCH_EVIDENCE_IDS.length, claimCount),
    rejectedClaimCount: rejected ? Math.min(RESEARCH_EVIDENCE_IDS.length, claimCount) : 0,
    validationErrorType: rejected && ["malformed-response", "claim-validation", "schema-validation"].includes(validationErrorType)
      ? validationErrorType
      : null,
  };
}

function sanitizeStructuredResponseDiagnostic(diagnostic) {
  if (!isRecord(diagnostic)) return null;
  const state = [
    "claims-validated",
    "zero-claims",
    "claims-received",
    "zero-claims-received",
    "claims-rejected",
    "zero-claims-rejected",
    "unparseable",
    "no-structured-output",
  ].includes(diagnostic.state) ? diagnostic.state : null;
  if (!state) return null;
  const boundedCount = (value) => Number.isInteger(value)
    ? Math.min(RESEARCH_EVIDENCE_IDS.length, Math.max(0, value))
    : null;
  return {
    state,
    evidenceRecordCount: boundedCount(diagnostic.evidenceRecordCount),
    returnedClaimCount: boundedCount(diagnostic.returnedClaimCount),
    rejectedClaimCount: boundedCount(diagnostic.rejectedClaimCount),
    validationErrorType: ["malformed-response", "claim-validation", "schema-validation"].includes(diagnostic.validationErrorType)
      ? diagnostic.validationErrorType
      : null,
  };
}

function sanitizeProviderAttemptForAudit(attempt) {
  if (!isRecord(attempt)) return attempt;
  return {
    ...attempt,
    providerResponseId: normalizeProviderResponseId(attempt.providerResponseId),
    ...(attempt.structuredResponseDiagnostic
      ? { structuredResponseDiagnostic: sanitizeStructuredResponseDiagnostic(attempt.structuredResponseDiagnostic) }
      : {}),
    ...(attempt.cancellationReason
      ? { cancellationReason: ["deadline", "requesting-client-cancelled"].includes(attempt.cancellationReason)
        ? attempt.cancellationReason
        : null }
      : {}),
  };
}

function collectProviderAttempts(error) {
  const attempts = [
    ...(Array.isArray(error?.providerAttempts) ? error.providerAttempts : []),
    ...(isRecord(error?.providerAttempt) ? [error.providerAttempt] : []),
    ...(Array.isArray(error?.coverage?.providerAttempts) ? error.coverage.providerAttempts : []),
    ...(isRecord(error?.coverage?.providerAttempt) ? [error.coverage.providerAttempt] : []),
    ...(Array.isArray(error?.categoryResult?.coverage?.providerAttempts)
      ? error.categoryResult.coverage.providerAttempts
      : []),
    ...(isRecord(error?.categoryResult?.coverage?.providerAttempt)
      ? [error.categoryResult.coverage.providerAttempt]
      : []),
  ];
  return [...new Set(attempts)];
}

function issuedProviderAttemptCount(attempts) {
  return attempts.filter((attempt) => typeof attempt?.issuedAt === "string" && attempt.issuedAt.length > 0).length;
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
  addressValidationReason = null,
  addressValidationCategory = null,
  addressValidationRule = null,
  addressValidationTelemetry = null,
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
    ...(addressValidationReason ? { addressValidationReason } : {}),
    ...(addressValidationCategory ? { addressValidationCategory } : {}),
    ...(addressValidationRule ? { addressValidationRule } : {}),
    ...(addressValidationTelemetry ? { addressValidationTelemetry } : {}),
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
  transportImpl = null,
  ocrImpl,
  siteBoilerplateTracker = null,
} = {}) {
  const documentStartedAtMs = Date.now();
  throwIfResearchCancelled(signal);
  const initial = evaluateResearchDocumentAccess(candidate);
  if (initial.state !== "accessible") return initial;
  let currentUrl = initial.resolvedUrl;
  const redirectChain = [];
  const redirectHops = [];
  const fetchMetricsFor = (response, bytesRead = 0) => ({
    elapsedMs: Math.max(0, Date.now() - documentStartedAtMs),
    responseStatus: Number.isInteger(response?.status) ? response.status : null,
    contentType: response?.headers?.get?.("content-type")?.split(";")[0]?.trim()?.toLowerCase() ?? null,
    bytesRead,
    redirectCount: redirectHops.length,
    dnsValidation: response?.dnsValidationTelemetry ?? null,
  });
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
      response = await fetchResearchDocumentUrl(currentUrl, requestInit, {
        fetchImpl,
        dnsLookup,
        transportImpl,
      });
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
    reason: error?.name === "PublicAddressValidationError"
      ? error.message === "private-destination"
        ? "private-destination"
        : error.addressValidationReason ?? error.message
      : "network-failure",
        resolvedUrl: currentUrl,
        redirectChain,
        redirectHops,
        fetchMetrics: fetchMetricsFor(null),
        transportDiagnostic: buildTransportDiagnostic({
          stage: error?.name === "PublicAddressValidationError" ? "dns-validation" : "request",
          url: currentUrl,
          startedAtMs: requestStartedAtMs,
          redirectChain,
          error,
          ...(error?.addressValidationReason
            ? { addressValidationReason: error.addressValidationReason }
            : {}),
          ...(error?.addressValidationCategory
            ? { addressValidationCategory: error.addressValidationCategory }
            : {}),
          ...(error?.addressValidationRule
            ? { addressValidationRule: error.addressValidationRule }
            : {}),
          ...(error?.addressValidationTelemetry
            ? { addressValidationTelemetry: error.addressValidationTelemetry }
            : {}),
        }),
        extractionLimitations: ["The destination could not be retrieved by the bounded server reader."],
      };
    }
    throwIfResearchCancelled(signal);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      let resolvedLocation = null;
      try {
        resolvedLocation = location ? new URL(location, currentUrl) : null;
      } catch {
        resolvedLocation = null;
      }
      const privateRedirect = resolvedLocation && isPrivateNetworkHostname(resolvedLocation.hostname);
      const safeLocation = safePublicSourceUrl(resolvedLocation?.href ?? null);
      const sourceIdentity = safeSourceIdentity(currentUrl);
      const targetIdentity = safeSourceIdentity(safeLocation);
      redirectHops.push({
        index: redirect + 1,
        sourceOrigin: sourceIdentity.origin,
        sourcePathname: sourceIdentity.pathname,
        status: response.status,
        targetOrigin: targetIdentity.origin,
        targetPathname: targetIdentity.pathname,
        dnsValidation: response.dnsValidationTelemetry ?? null,
      });
      if (privateRedirect || !safeLocation || redirect === maxRedirects) {
        void Promise.resolve(response.body?.cancel?.()).catch(() => {});
        const reason = privateRedirect
          ? "private-destination"
          : safeLocation
            ? "redirect-limit"
            : "unsafe-redirect";
        return {
          ...initial,
          state: "blocked",
          reason,
          resolvedUrl: currentUrl,
          redirectChain,
          redirectHops,
          fetchMetrics: fetchMetricsFor(response),
          transportDiagnostic: buildTransportDiagnostic({
            stage: "redirect-validation",
            url: currentUrl,
            startedAtMs: requestStartedAtMs,
            responseReceived: true,
            response,
            redirectChain,
            ...(privateRedirect ? { addressValidationReason: "prohibited-address-class" } : {}),
            ...(privateRedirect ? { addressValidationCategory: "literal-destination-policy" } : {}),
            ...(privateRedirect ? { addressValidationRule: "local-or-reserved-hostname" } : {}),
          }),
          extractionLimitations: [
            privateRedirect
              ? "Redirect target resolved to a private, loopback, link-local, or reserved destination."
              : safeLocation
                ? "Redirect chain exceeded the bounded access limit."
                : "Redirect target was malformed, unsupported, or contained credentials.",
          ],
        };
      }
      void Promise.resolve(response.body?.cancel?.()).catch(() => {});
      redirectChain.push(safeLocation);
      currentUrl = safeLocation;
      continue;
    }
    if (!response.ok) {
      void Promise.resolve(response.body?.cancel?.()).catch(() => {});
      return {
        ...initial,
        state: "blocked",
        reason: `http-${response.status}`,
        resolvedUrl: currentUrl,
        redirectChain,
        redirectHops,
        fetchMetrics: fetchMetricsFor(response),
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
      void Promise.resolve(response.body?.cancel?.()).catch(() => {});
      return {
        ...initial,
        state: "blocked",
        reason: "size-limit",
        resolvedUrl: currentUrl,
        redirectChain,
        redirectHops,
        fetchMetrics: fetchMetricsFor(response),
        contentType,
        extractionLimitations: [`Document exceeds the ${maxBytes}-byte access limit.`],
      };
    }
    let bytes;
    let bytesRead = 0;
    try {
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const cancelReader = () => { void Promise.resolve(reader.cancel()).catch(() => {}); };
        signal?.addEventListener("abort", cancelReader, { once: true });
        const chunks = [];
        let total = 0;
        try {
          while (true) {
            throwIfResearchCancelled(signal);
            const part = await awaitWithResearchSignal(reader.read(), signal);
            if (part.done) break;
            total += part.value.byteLength;
            bytesRead = total;
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
        const buffered = await awaitWithResearchSignal(Promise.resolve().then(() => response.arrayBuffer()), signal);
        if (buffered.byteLength > maxBytes) throw new Error("size-limit");
        bytes = Buffer.from(buffered);
        bytesRead = bytes.byteLength;
      }
    } catch (error) {
      if (error?.name === "ResearchCancelledError" || signal?.aborted) throw createResearchCancellationError();
      return {
        ...initial,
        state: "blocked",
        reason: error?.message === "size-limit" ? "size-limit" : "read-failure",
        resolvedUrl: currentUrl,
        redirectChain,
        redirectHops,
        contentType,
        fetchMetrics: fetchMetricsFor(response, bytesRead),
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
    if (!format) return {
      ...initial,
      state: "unsupported",
      reason: "unsupported-source-type",
      resolvedUrl: currentUrl,
      redirectChain,
      redirectHops,
      fetchMetrics: fetchMetricsFor(response, bytesRead),
      contentType,
      extractionLimitations: ["The response content type is outside the bounded reader."],
    };
    throwIfResearchCancelled(signal);
    const extraction = await extractResearchDocument({
      bytes,
      contentType,
      sourceUrl: currentUrl,
      format: format === "text-pdf" ? "pdf" : format,
    }, { ocrImpl });
    throwIfResearchCancelled(signal);
    const passage = extraction.passage;
    const siteDuplicateReason = format === "html" && passage && siteBoilerplateTracker instanceof Map
      ? registerOrFindSiteBoilerplate(siteBoilerplateTracker, currentUrl, passage)
      : null;
    const rejectedOutcome = ["blocked-or-shell", "low-content"].includes(extraction.outcome)
      ? extraction.outcome
      : siteDuplicateReason ? "site-boilerplate" : null;
    if (rejectedOutcome || !passage) {
      return {
        ...initial,
        state: rejectedOutcome ?? "unsupported",
        reason: rejectedOutcome
          ? extraction.reason ?? siteDuplicateReason
          : extraction.outcome === "underlying-document"
            ? "underlying-document"
            : format === "text-pdf" ? "scanned-pdf" : extraction.outcome === "malformed" ? "malformed-document" : "empty-passage",
        format,
        resolvedUrl: currentUrl,
        canonicalUrl: canonicalizeSourceUrl(currentUrl),
        redirectChain,
        redirectHops,
        fetchMetrics: fetchMetricsFor(response, bytesRead),
        contentType,
        retrievalTime: now(),
        contentHash: extraction.contentHash,
        extractionMethod: extraction.extractionMethod,
        extractionOutcome: rejectedOutcome ?? extraction.outcome,
        publicationDate: extraction.publicationDate ?? null,
        publicationDateBasis: extraction.publicationDateBasis ?? null,
        publicationDateStatus: extraction.publicationDateStatus ?? "absent",
        underlyingDocumentUrl: extraction.underlyingDocumentUrl,
        candidateLinks: extraction.candidateLinks,
        structuredFields: extraction.structuredFields ?? [],
        transportDiagnostic: buildTransportDiagnostic({
          stage: "extraction",
          url: currentUrl,
          startedAtMs: documentStartedAtMs,
          responseReceived: true,
          response,
          redirectChain,
        }),
        extractionLimitations: [
          ...extraction.limitations,
          ...(siteDuplicateReason ? ["Near-identical article text was already retained from another URL on this site."] : []),
        ],
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
      redirectHops,
      fetchMetrics: fetchMetricsFor(response, bytesRead),
      retrievalTime: now(),
      contentHash: extraction.contentHash,
      extractionMethod: extraction.extractionMethod,
      extractionOutcome: extraction.outcome,
      publicationDate: extraction.publicationDate ?? null,
      publicationDateBasis: extraction.publicationDateBasis ?? null,
      publicationDateStatus: extraction.publicationDateStatus ?? "absent",
      candidateLinks: extraction.candidateLinks,
      structuredFields: extraction.structuredFields ?? [],
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
      && sourceEstablishesProjectIdentity(source, project));
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
  const knownCategoryIds = new Set(RESEARCH_CATEGORIES.map((candidate) => candidate.id));
  const explicitCategoryIds = new Set([
    ...(knownCategoryIds.has(source.searchDomain) ? [source.searchDomain] : []),
    ...(Array.isArray(source.categoryIds)
      ? source.categoryIds.filter((categoryId) => knownCategoryIds.has(categoryId))
      : []),
  ]);
  if (explicitCategoryIds.size > 0) return explicitCategoryIds.has(category.categoryId);
  if (Array.isArray(source.supportedEvidenceIds)
    && source.supportedEvidenceIds.some((id) => category.evidenceIds.includes(id))) return true;
  const identityScoped = [source.identityRole, source.sourceRole, source.categoryRole]
    .some((role) => typeof role === "string" && /\b(identity|project identity|facility identity)\b/i.test(role));
  if (identityScoped) return category.categoryId === "project-identity";
  // A source without any usable explicit route remains available for relevance
  // assessment, but this does not make it project-specific or evidence-eligible.
  return source.categoryRoutingUnknown === true || explicitCategoryIds.size === 0;
}

function categorySourceMatchesForAnalysis(category, source, project = {}, onIdentityDecision = null) {
  if (!category || !source) return false;
  const knownCategoryIds = new Set(RESEARCH_CATEGORIES.map((candidate) => candidate.id));
  const explicitCategoryIds = new Set(Array.isArray(source.categoryIds)
    ? source.categoryIds.filter((categoryId) => knownCategoryIds.has(categoryId))
    : []);
  if (explicitCategoryIds.size > 0) return explicitCategoryIds.has(category.categoryId);
  if (source.categoryRoutingUnknown !== true && knownCategoryIds.has(source.searchDomain)) {
    return source.searchDomain === category.categoryId;
  }
  if (source.categoryRoutingUnknown !== true) {
    const evidenceIds = new Set([
      ...(Array.isArray(source.supportedEvidenceIds) ? source.supportedEvidenceIds : []),
      ...(Array.isArray(source.claimSupport)
        ? source.claimSupport.flatMap((support) => [support?.evidenceId, support?.variable])
        : isRecord(source.claimSupport) ? [source.claimSupport.evidenceId, source.claimSupport.variable] : []),
    ].filter((id) => RESEARCH_EVIDENCE_IDS.includes(id)));
    if (evidenceIds.size > 0) return [...evidenceIds].some((id) => category.evidenceIds.includes(id));
    const identityScoped = [source.identityRole, source.sourceRole, source.categoryRole]
      .some((role) => typeof role === "string" && /\b(identity|project identity|facility identity)\b/i.test(role));
    if (identityScoped) return category.categoryId === "project-identity";
  }
  if (!hasRetrievedPassage(source)) return false;
  // Missing labels alone must not broaden routing. Permit exact-project
  // context only after the existing retained-text identity check passes;
  // generic indexes, snippets, and ambiguous related campuses stay excluded.
  // This admits context to assessment, never a claim to eligibility.
  return sourceEstablishesProjectIdentity(source, project, onIdentityDecision);
}

function hasRetrievedPassage(source) {
  return source?.accessOutcome?.state === "accessible"
    && hasUsableResearchPassage(source.accessOutcome.passage);
}

function discoveryCandidateRetentionOutcome(source) {
  const accessOutcome = source?.accessOutcome ?? {};
  if (accessOutcome.state !== "accessible") {
    return {
      retained: false,
      usability: "not-assessed",
      reason: accessOutcome.reason ?? accessOutcome.state ?? "not-attempted",
    };
  }
  const passage = accessOutcome.passage;
  const rejectionReason = researchContentRejectionReason(passage);
  if (typeof passage !== "string" || !passage.trim() || rejectionReason) {
    return {
      retained: false,
      usability: "unusable",
      reason: rejectionReason ?? "empty-passage",
    };
  }
  return { retained: true, usability: "usable", reason: null };
}

export function selectResearchPassagesForStructuredAnalysis(sources = []) {
  return (Array.isArray(sources) ? sources : []).filter(hasRetrievedPassage);
}

function passageShingles(passage) {
  const words = String(passage).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? [];
  const shingles = new Set();
  for (let index = 0; index <= words.length - 3; index += 1) {
    shingles.add(words.slice(index, index + 3).join(" "));
  }
  return shingles;
}

function substantiallyDuplicatePassages(left, right) {
  const normalize = (value) => String(value).toLowerCase().replace(/\s+/g, " ").trim();
  const leftText = normalize(left);
  const rightText = normalize(right);
  if (leftText === rightText) return true;
  const materialSignature = (text) => ({
    quantities: text.match(/\b\d[\d,]*(?:\.\d+)?%?\b/g) ?? [],
    qualifiers: text.match(/\b(?:not|no|never|without|except|pending|approved|denied|rejected|completed|operational|planned|proposed|expected|delayed|cancelled|canceled|verified|confirmed|mw|mwh|kw|kwh|mgal|gallons?|acre-feet|days?|weeks?|months?|years?)\b/g) ?? [],
  });
  if (JSON.stringify(materialSignature(leftText)) !== JSON.stringify(materialSignature(rightText))) return false;
  const leftShingles = passageShingles(left);
  const rightShingles = passageShingles(right);
  if (leftShingles.size < 10 || rightShingles.size < 10) return false;
  const lengthRatio = Math.min(leftShingles.size, rightShingles.size)
    / Math.max(leftShingles.size, rightShingles.size);
  if (lengthRatio < 0.85) return false;
  const smaller = leftShingles.size <= rightShingles.size ? leftShingles : rightShingles;
  const larger = smaller === leftShingles ? rightShingles : leftShingles;
  let overlap = 0;
  for (const shingle of smaller) if (larger.has(shingle)) overlap += 1;
  return overlap / smaller.size >= 0.9;
}

function categoryAnalysisPatterns(categoryId) {
  const patterns = {
    "project-identity": /\b(?:project|facility|building|campus|owner|operator|applicant|company|data center|data-centre|dfw\d+)\b/i,
    grid: /\b(?:grid|interconnection|interconnect|substation|transmission|load|mw|mwh|kw|kwh|service date|energization|ercot|utility)\b/i,
    "construction-capital": /\b(?:estimated cost|construction cost|project cost|capital|capex|square feet|sq\.?\s*ft|area|building|construction|start date|completion date|schedule|contractor|backup power|generator)\b/i,
    "permitting-community": /\b(?:permit|application|approved|approval|denied|hearing|community|public comment|filing|status|start date|completion date|construction|inspection)\b/i,
    water: /\b(?:water|gallons?|acre-feet|mgal|withdrawal|supply|discharge|wastewater|permit|rights)\b/i,
    "tenant-counterparty": /\b(?:tenant|customer|counterparty|lease|offtake|contract|owner|operator|customer concentration)\b/i,
    electricity: /\b(?:electricity|power|rate|tariff|energy|mwh|kwh|renewable|carbon|utility|cost)\b/i,
    "climate-operational-hazard": /\b(?:flood|fema|noaa|wildfire|drought|hazard|climate|storm|heat|water|backup power|resilience)\b/i,
  };
  return patterns[categoryId] ?? /\b(?:project|facility|building|campus|owner|operator|status|date|mw|mwh|cost|area|permit)\b/i;
}

function structuredFieldsForCategory(source, categoryId, project = {}) {
  const fields = Array.isArray(source?.accessOutcome?.structuredFields)
    ? source.accessOutcome.structuredFields
    : Array.isArray(source?.structuredFields) ? source.structuredFields : [];
  const identityTerms = [
    project?.name,
    project?.knownData?.operator,
    ...(Array.isArray(project?.knownData?.aliases) ? project.knownData.aliases : []),
  ].map((value) => String(value ?? "").trim()).filter((value) => value.length >= 3);
  const identityPattern = new RegExp(
    `(?:${["project", "facility", "building", "campus", "owner", "operator", "applicant", "location", "county", "city", "state", "status", "start", "completion", "estimated cost", "square feet", ...identityTerms]
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "i",
  );
  const categoryPattern = categoryAnalysisPatterns(categoryId);
  return fields
    .filter((field) => isRecord(field)
      && typeof field.label === "string"
      && typeof field.value === "string"
      && (identityPattern.test(field.label) || categoryPattern.test(field.label)))
    .slice(0, 32)
    .map((field) => ({
      label: sanitizeTransportText(field.label, 120),
      value: sanitizeTransportText(field.value, 400),
    }))
    .filter((field) => field.label && field.value);
}

function categoryPassageWindow(source, categoryId, project = {}, maxChars = 2_400) {
  const passage = String(source?.accessOutcome?.passage ?? "");
  if (passage.length <= maxChars) return passage;
  const sentences = [...passage.matchAll(/[^.!?]+(?:[.!?]+["')\]]*)?|[.!?]+/gu)]
    .map((match) => ({ text: match[0].trim(), start: match.index, end: match.index + match[0].length }))
    .filter((sentence) => sentence.text);
  if (!sentences.length) return "";
  const categoryPattern = categoryAnalysisPatterns(categoryId);
  const identityTerms = [
    project?.name,
    project?.knownData?.operator,
    ...(Array.isArray(project?.knownData?.aliases) ? project.knownData.aliases : []),
  ].map((value) => String(value ?? "").trim().toLowerCase()).filter((value) => value.length >= 3);
  const windows = [];
  sentences.forEach(({ text: sentence }, index) => {
    const lower = sentence.toLowerCase();
    const isIdentity = identityTerms.some((term) => lower.includes(term))
      || /\b(?:project|facility|building|campus|dfw\d+|owner|operator)\b/i.test(sentence);
    const isCategory = categoryPattern.test(sentence);
    const isQualifier = /\b(?:not|no|never|without|except|pending|approved|denied|rejected|completed|operational|planned|proposed|expected|delayed|cancelled|canceled|verified|confirmed|start|completion|as of|effective)\b/i.test(sentence);
    const isQuantity = /\b\d[\d,]*(?:\.\d+)?\b/i.test(sentence);
    if (!isIdentity && !isCategory && !isQualifier && !isQuantity) return;
    // Admit the surrounding sentences as one unit. A token cap must not keep
    // a quantity while dropping its adjacent qualification or scope.
    windows.push({
      first: Math.max(0, index - 1),
      last: Math.min(sentences.length - 1, index + 1),
      score: (isIdentity ? 8 : 0) + (isCategory ? 5 : 0) + (isQualifier ? 4 : 0) + (isQuantity ? 4 : 0),
      index,
    });
  }
  );
  if (!windows.length) windows.push({ first: 0, last: Math.min(3, sentences.length - 1), score: 0, index: 0 });
  const mergeRanges = (ranges) => {
    const merged = [];
    for (const range of [...ranges].sort((left, right) => left.first - right.first)) {
      const prior = merged.at(-1);
      if (prior && range.first <= prior.last + 1) prior.last = Math.max(prior.last, range.last);
      else merged.push({ first: range.first, last: range.last });
    }
    return merged;
  };
  const render = (ranges) => ranges.map(({ first, last }) =>
    passage.slice(sentences[first].start, sentences[last].end).trim()).join("\n\n");
  let selected = [];
  for (const window of windows.sort((left, right) => right.score - left.score || left.index - right.index)) {
    const candidate = mergeRanges([...selected, window]);
    if (render(candidate).length <= maxChars) selected = candidate;
  }
  // No partial-sentence fallback: keep the full receipt separately and omit
  // an oversized atomic window rather than manufacturing a safe-looking quote.
  return render(selected);
}

function prepareCategoryAnalysisPassages(category, sources = [], project = {}) {
  const indexedSources = sources.map((source, index) => ({ source, index }));
  const candidates = indexedSources.filter(({ source }) => hasRetrievedPassage(source));
  const decisions = [];
  const relevant = [];
  for (const { source, index } of candidates) {
    let identityAdmission = { state: "not-evaluated", verdict: null, reason: null, trace: null };
    const observeIdentity = (decision) => {
      const accepted = decision.admissionGate === "related-facility"
        ? decision.resolver.verdict === "related-facility"
        : decision.resolver.verdict === "exact-project";
      identityAdmission = {
        state: accepted ? "passed"
          : decision.resolver.verdict === "unrelated" ? "rejected" : "unknown",
        admissionGate: decision.admissionGate ?? "exact-project",
        verdict: decision.resolver.verdict,
        reason: decision.resolver.reason,
        trace: decision.trace,
      };
    };
    const categoryMatch = categorySourceMatchesForAnalysis(category, source, project, observeIdentity);
    let exactIdentityMatch = false;
    if (!categoryMatch && category?.includeExactProjectIdentityContext === true) {
      exactIdentityMatch = sourceEstablishesProjectIdentity(source, project, observeIdentity);
    }
    let relatedIdentityMatch = false;
    if (!categoryMatch && !exactIdentityMatch && category?.includeRelatedFacilityIdentityContext === true) {
      relatedIdentityMatch = sourceEstablishesRelatedFacilityIdentity(source, project, observeIdentity);
    }
    let examination = null;
    let examinationMatch = false;
    if (!categoryMatch && !exactIdentityMatch && !relatedIdentityMatch
      && source.categoryRoutingUnknown === true
      && (!Array.isArray(source.categoryIds) || source.categoryIds.length === 0)) {
      const fields = source.accessOutcome?.structuredFields ?? source.structuredFields ?? [];
      const examinationText = [
        source.accessOutcome.passage,
        ...(Array.isArray(fields) ? fields.filter((field) =>
          typeof field?.label === "string" && typeof field?.value === "string")
          .map((field) => `${field.label}: ${field.value}`) : []),
      ].join("\n");
      examination = assessResearchPassageExaminationEligibility(examinationText, project);
      examinationMatch = examination.eligible && (category.categoryId === "project-identity"
        || categoryAnalysisPatterns(category.categoryId).test(examinationText));
    }
    const included = categoryMatch || exactIdentityMatch || relatedIdentityMatch || examinationMatch;
    const identityScope = exactIdentityMatch || identityAdmission.verdict === "exact-project"
      ? "exact-project" : relatedIdentityMatch ? "related-facility"
        : categoryMatch ? "route-labeled-identity-unchecked" : "scope-unconfirmed";
    const explicitRoutes = [
      ...(Array.isArray(source.categoryIds)
        ? source.categoryIds.filter((id) => RESEARCH_CATEGORIES.some((item) => item.id === id))
        : []),
      ...(source.categoryRoutingUnknown !== true
        && RESEARCH_CATEGORIES.some((item) => item.id === source.searchDomain) ? [source.searchDomain] : []),
    ];
    const routeState = categoryMatch ? "matched"
      : exactIdentityMatch ? "matched-by-exact-project-identity-context"
        : relatedIdentityMatch ? "matched-by-related-facility-identity-context"
          : examinationMatch ? "matched-by-examination-eligibility" : "rejected";
    const routeReason = categoryMatch
      ? identityAdmission.state === "passed" && !explicitRoutes.length
        ? "category-routing-matched-by-retained-exact-project-identity"
        : "category-routing-matched"
      : exactIdentityMatch
        ? "category-context-included-by-retained-exact-project-identity"
        : relatedIdentityMatch
          ? "category-context-included-by-retained-related-facility-identity"
        : examinationMatch
          ? "category-context-included-for-examination-scope-unconfirmed"
        : examination?.eligible
          ? "passage-lacks-category-subject-matter"
      : explicitRoutes.length
        ? "source-has-no-route-to-requested-category"
        : identityAdmission.verdict === "unrelated"
          ? "explicit-identity-conflict"
          : identityAdmission.verdict === "ambiguous"
            ? "identity-not-established"
            : "no-category-route";
    const record = {
      source,
      occurrenceId: source.occurrenceId ?? source.sourceId
        ?? `occ-${createHash("sha256").update([
          source.originalUrl ?? source.url ?? source.canonicalUrl ?? "source-unavailable",
          source.accessOutcome?.contentHash ?? "",
          createHash("sha256").update(source.accessOutcome.passage).digest("hex"),
          index,
        ].join("|")).digest("hex").slice(0, 24)}`,
      included,
      routeState,
      routeReason,
      identityAdmission,
      identityScope,
      examination,
      decision: included ? "included-for-category-analysis" : "excluded-before-deduplication",
      reasonCode: included ? null : routeReason,
      explanation: included ? null : identityAdmission.reason ?? routeReason,
      deduplicationState: "not-evaluated",
      windowState: "not-evaluated",
      tokenFitState: "not-evaluated",
      postFilterPassage: included ? source.accessOutcome.passage : "",
      deduplicatedPassage: "",
      windowedPassage: "",
      suppliedPassage: "",
    };
    decisions.push(record);
    if (included) relevant.push(source);
  }
  const unique = [];
  for (const source of relevant) {
    const passage = source.accessOutcome.passage;
    const decision = decisions.find((item) => item.source === source);
    const representative = unique.find((prior) =>
      substantiallyDuplicatePassages(prior.accessOutcome.passage, passage));
    if (representative) {
      const representativeDecision = decisions.find((item) => item.source === representative);
      decision.deduplicationState = "duplicate";
      decision.reasonCode = "duplicate-passage";
      decision.explanation = "A substantially identical retained passage was already selected for this category.";
      decision.duplicateRepresentative = representativeDecision?.occurrenceId ?? null;
      decision.deduplicatedPassage = "";
      decision.decision = "excluded-as-duplicate";
      continue;
    }
    unique.push(source);
    decision.deduplicationState = "unique";
    decision.deduplicatedPassage = passage;
  }
  const analysisSources = unique.map((source) => ({
    ...source,
    identityScope: decisions.find((decision) => decision.source === source)?.identityScope ?? "scope-unconfirmed",
    analysisPassage: categoryPassageWindow(source, category.categoryId, project),
    analysisStructuredFields: structuredFieldsForCategory(source, category.categoryId, project),
  }));
  for (const analysisSource of analysisSources) {
    const uniqueSource = unique.find((source) =>
      source.originalUrl === analysisSource.originalUrl
        && source.accessOutcome.passage === analysisSource.accessOutcome.passage);
    const decision = decisions.find((item) => item.source === uniqueSource);
    if (!decision) continue;
    decision.windowedPassage = analysisSource.analysisPassage;
    decision.windowState = analysisSource.analysisPassage ? "selected" : "excluded";
    if (!analysisSource.analysisPassage) {
      decision.reasonCode = "category-window-exclusion";
      decision.explanation = "The category window selector returned no complete context window.";
      decision.decision = "excluded-by-category-window";
    }
  }
  return {
    candidateCount: candidates.length,
    uniqueCount: unique.length,
    suppliedCount: analysisSources.length,
    sources: analysisSources,
    decisions,
  };
}

function categoryOpenedDocuments(sources = [], category = null) {
  return sources.map((source) => {
    const outcome = source.accessOutcome ?? {};
    const diagnostic = outcome.transportDiagnostic;
    let rejectedHostname = null;
    if (diagnostic?.stage === "dns-validation") {
      try {
        const hostname = new URL(outcome.resolvedUrl ?? source.resolvedUrl ?? source.url).hostname;
        if (!isIP(hostname)) rejectedHostname = hostname;
      } catch { /* No validated hostname to retain. */ }
    }
    const reusedReceipt = source.documentAccessReused === true || outcome.reused === true;
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
      opened: !reusedReceipt && Number.isInteger(outcome.physicalOpenIndex),
      attempted: Number.isInteger(outcome.physicalOpenIndex),
      physicalOpenIndex: Number.isInteger(outcome.physicalOpenIndex) ? outcome.physicalOpenIndex : null,
      reusedReceipt,
      reusedFromCanonicalUrl: reusedReceipt
        ? outcome.canonicalUrl ?? source.canonicalUrl ?? source.url ?? null
        : null,
      accessState: outcome.state ?? "blocked",
      accessOutcome: outcome.reason ?? "not-attempted",
      ...(diagnostic?.stage === "dns-validation" ? {
        dnsRejection: {
          hostname: rejectedHostname,
          rule: diagnostic.addressValidationRule ?? "unknown",
          answerCount: diagnostic.addressValidationTelemetry?.answerCount ?? 0,
          addressFamilyCounts: diagnostic.addressValidationTelemetry?.addressFamilyCounts ?? {
            ipv4: 0,
            ipv6: 0,
            other: 0,
          },
          publicAnswerCount: diagnostic.addressValidationTelemetry?.publicAnswerCount ?? 0,
          prohibitedAnswerCount: diagnostic.addressValidationTelemetry?.prohibitedAnswerCount ?? 0,
          rejectingRules: diagnostic.addressValidationTelemetry?.rejectingRules ?? [],
        },
      } : {}),
      redirectHops: Array.isArray(outcome.redirectHops) ? outcome.redirectHops.slice(0, 4) : [],
      fetchMetrics: isRecord(outcome.fetchMetrics) ? outcome.fetchMetrics : null,
      transportDiagnostic: isRecord(diagnostic) ? diagnostic : null,
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

export function sourceEstablishesProjectIdentity(source, project = {}, onIdentityDecision = null) {
  return retainedSourceIdentityVerdict(source, project, onIdentityDecision, "exact-project") === "exact-project";
}

export function sourceEstablishesRelatedFacilityIdentity(source, project = {}, onIdentityDecision = null) {
  return retainedSourceIdentityVerdict(source, project, onIdentityDecision, "related-facility") === "related-facility";
}

function retainedSourceIdentityVerdict(source, project = {}, onIdentityDecision = null, admissionGate = "exact-project") {
  if (!hasRetrievedPassage(source)) return "ambiguous";
  const passage = [
    source?.accessOutcome?.passage,
    source?.claimPassage,
    source?.excerpt,
  ].find((value) => typeof value === "string" && value.trim()) ?? "";
  return assessResearchProjectIdentity(passage, {}, project, {
    onDecision: (decision) => onIdentityDecision?.({ ...decision, admissionGate }),
  });
}

export function evaluateCanaryGridIdentityGate(sources = [], project = {}) {
  const retainedPassages = (Array.isArray(sources) ? sources : []).filter(hasRetrievedPassage);
  const exactProjectPassages = retainedPassages.filter((source) =>
    sourceEstablishesProjectIdentity(source, project));
  const retainedPassageTexts = retainedPassages.map((source) =>
    source?.accessOutcome?.passage ?? source?.claimPassage ?? source?.excerpt ?? "");
  const crossPassageIdentity = corroborateRelatedFacilityAcrossPassages(retainedPassageTexts, project);
  const conflictedIdentifiers = new Set(crossPassageIdentity.conflictedIdentifiers ?? []);
  const relatedFacilityPassages = retainedPassages.filter((source) => {
    if (!sourceEstablishesRelatedFacilityIdentity(source, project)) return false;
    const identifiers = [...String(
      source?.accessOutcome?.passage ?? source?.claimPassage ?? source?.excerpt ?? "",
    ).matchAll(/\bDFW\s*[- ]?\s*(\d{1,2})\b/giu)].map((match) => `DFW${match[1]}`);
    return !identifiers.some((identifier) => conflictedIdentifiers.has(identifier));
  });
  const directRelatedFacilityIdentifiers = relatedFacilityPassages.flatMap((source) => {
    const passage = source?.accessOutcome?.passage ?? source?.claimPassage ?? source?.excerpt ?? "";
    return [...String(passage).matchAll(/\bDFW\s*[- ]?\s*(\d{1,2})\b/giu)]
      .map((match) => `DFW${match[1]}`);
  });
  const directRelatedFacilityIdentifierSet = new Set(directRelatedFacilityIdentifiers);
  const crossPassageCorroboratedIdentifiers = (crossPassageIdentity.identifiers ?? [])
    .filter((identifier) => !directRelatedFacilityIdentifierSet.has(identifier));
  const relatedFacilityIdentifiers = [...new Set([
    ...directRelatedFacilityIdentifiers,
    ...(crossPassageIdentity.identifiers ?? []),
  ])].slice(0, 8);
  const state = exactProjectPassages.length
    ? "exact-project"
    : relatedFacilityPassages.length || relatedFacilityIdentifiers.length
      ? "related-facility"
      : retainedPassages.length
        ? "unresolved"
        : "no-usable-retained-passage";
  return {
    required: true,
    state,
    usableRetainedPassageCount: retainedPassages.length,
    exactProjectPassageCount: exactProjectPassages.length,
    relatedFacilityPassageCount: relatedFacilityPassages.length,
    relatedFacilityIdentifiers,
    crossPassageCorroboratedFacilityIdentifiers: state === "exact-project"
      ? []
      : crossPassageCorroboratedIdentifiers.slice(0, 8),
    conflictedRelatedFacilityIdentifiers: [...conflictedIdentifiers].slice(0, 8),
    reason: state === "exact-project"
      ? "At least one successfully retrieved retained passage establishes the exact requested project identity."
      : state === "related-facility"
        ? crossPassageCorroboratedIdentifiers.length
          ? crossPassageIdentity.reason
          ?? "A successfully retrieved retained passage establishes a named facility related to the requested project, but not exact campus identity."
          : "A successfully retrieved retained passage establishes a named facility related to the requested project, but not exact campus identity."
        : state === "unresolved"
        ? "No successfully retrieved retained passage establishes the exact requested project identity."
        : "No successfully retrieved usable passage is available to establish exact-project identity.",
  };
}

function auditSafePassage(value) {
  return typeof value === "string"
    ? value.slice(0, 20_000)
      .replace(/(?:\d{1,3}\.){3}\d{1,3}/g, "[redacted-address]")
      .replace(/\[[a-f0-9:]+:[a-f0-9:]+\]/gi, "[redacted-address]")
    : "";
}

function buildClaimEligibilityReviews(evidence, sources) {
  return evidence.slice(0, RESEARCH_EVIDENCE_IDS.length).map((claim) => {
    const claimUrls = new Set([
      claim.sourceUrl,
      ...(Array.isArray(claim.sourceUrls) ? claim.sourceUrls : []),
      ...(Array.isArray(claim.sources) ? claim.sources.map((source) => source?.url) : []),
    ].map((url) => canonicalizeSourceUrl(url)).filter(Boolean));
    const source = sources.find((candidate) => {
      const url = canonicalizeSourceUrl(
        candidate.canonicalUrl ?? candidate.resolvedUrl ?? candidate.originalUrl ?? candidate.url,
      );
      return url && claimUrls.has(url);
    });
    const sourcePassage = auditSafePassage(
      claim.claimPassage
      ?? claim.sourceValidation?.passage
      ?? source?.accessOutcome?.passage
      ?? source?.claimPassage
      ?? source?.excerpt,
    );
    const eligible = claim.eligibleForModel === true;
    const policyTrace = claim.sourceValidation?.eligibilityTrace;
    const gates = Array.isArray(policyTrace?.checks)
      ? policyTrace.checks.map((check) => ({
        id: check.id,
        passed: check.passed === true,
        reason: typeof check.reason === "string" ? check.reason : null,
      }))
      : [];
    const firstFailure = policyTrace?.firstFailure ?? gates.find((gate) => !gate.passed) ?? null;
    return {
      evidenceId: claim.id ?? null,
      sourceUrl: source
        ? safePublicSourceUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.originalUrl ?? source.url)
        : (claim.sourceUrl ? safePublicSourceUrl(claim.sourceUrl) : null),
      sourcePassageHash: sourcePassage
        ? createHash("sha256").update(sourcePassage).digest("hex")
        : null,
      sourcePassage: sourcePassage || null,
      eligibleForModel: eligible,
      gates,
      firstFailure: firstFailure ? { id: firstFailure.id, reason: firstFailure.reason } : null,
      firstFailedGate: firstFailure?.id ?? null,
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
  const runBudget = boundedResearchBudget(coverage.budget);
  sources = Array.isArray(sources) ? sources : [];
  evidence = Array.isArray(evidence) ? evidence : [];
  const plan = buildResearchCategoryPlan(project);
  const observedQueries = normalizeSearchTerms(coverage.searchTerms, RESEARCH_PROJECT_MAX_TOOL_CALLS);
  const executions = isRecord(coverage.categoryExecutions) ? coverage.categoryExecutions : {};
  const eligibilityReviews = buildClaimEligibilityReviews(evidence, sources);
  const providerAttempts = Array.isArray(coverage.providerAttempts)
    ? coverage.providerAttempts.slice(0, MAX_RESEARCH_PROVIDER_ATTEMPT_RECORDS).map(sanitizeProviderAttemptForAudit)
    : [];
  const providerResponseIds = [...new Set([
    ...(Array.isArray(coverage.providerResponseIds) ? coverage.providerResponseIds : []),
    ...providerAttempts.map((attempt) => attempt?.providerResponseId),
    responseId,
  ].map(normalizeProviderResponseId).filter(Boolean))].slice(0, MAX_RESEARCH_PROVIDER_RESPONSE_IDS);
  const sourceAttemptRecords = [
    ...(Array.isArray(coverage.sourceAttemptRecords) ? coverage.sourceAttemptRecords : []),
    ...sources,
  ].slice(0, MAX_RESEARCH_SOURCE_ATTEMPT_AUDIT_RECORDS);
  const categories = plan.categories.map((category) => {
    const supplied = isRecord(executions[category.categoryId]) ? executions[category.categoryId] : {};
    const executedQueries = normalizeSearchTerms(
      supplied.executedQueries ?? observedQueries.filter((query) => categoryQueryMatches(category, query)),
      (runBudget.maxFollowUpsPerCategory ?? 1) + 1,
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
    const explicitFailureState = ["Provider failure", "Timed out", "Not searched", "Not assessed"].includes(supplied.state)
      && !(supplied.state === "Not searched" && primaryWasIssued)
      ? supplied.state
      : null;
    const state = explicitFailureState ?? (
      counts.allEvidenceEligible && !supplied.providerFailureType ? "Complete"
        : supplied.primaryAnalysisCompleted === true || counts.claimMapped > 0 || counts.retainedCandidates > 0 ? "Partial"
          : executedQueries.length || primaryWasIssued ? "No eligible evidence"
            : "Not searched"
    );
    const categoryAttempts = Array.isArray(supplied.providerAttempts) ? supplied.providerAttempts : [];
    const executionOutcome = ["completed", "failed", "skipped", "not-run"].includes(supplied.executionOutcome)
      ? supplied.executionOutcome
      : primaryWasIssued ? "completed" : "not-run";
    const analysisOutcome = ["completed", "failed", "skipped", "not-run", "not-assessed"].includes(supplied.analysisOutcome)
      ? supplied.analysisOutcome
      : supplied.primaryAnalysisCompleted === true
        ? "completed"
        : categoryAttempts.some((attempt) => attempt?.issuedAt)
          ? "failed"
          : "not-run";
    const notRunReason = /^[a-z0-9-]{1,80}$/i.test(String(supplied.notRunReason ?? ""))
      ? supplied.notRunReason
      : null;
    const searchCompleteness = executedQueries.length
      ? "observed"
      : primaryWasIssued ? "unavailable" : "incomplete";
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
      followUpAttemptState: [
        "queued",
        "completed",
        "failed",
        "issued",
        "cancelled-before-issue",
      ].includes(supplied.followUpAttemptState) ? supplied.followUpAttemptState : null,
      followUpCancellationReason: ["deadline", "requesting-client-cancelled"].includes(supplied.followUpCancellationReason)
        ? supplied.followUpCancellationReason
        : null,
      providerObservedFollowUpQueries: normalizeSearchTerms(supplied.providerObservedFollowUpQueries, 8),
      followUpExecutedQuery: typeof supplied.followUpExecutedQuery === "string" ? supplied.followUpExecutedQuery : null,
      followUpCount: Number.isInteger(supplied.followUpCount) ? Math.max(0, supplied.followUpCount) : (supplied.followUpExecutedQuery ? 1 : 0),
      followUpLimit: runBudget.maxFollowUpsPerCategory,
      followUpTriggerEvidenceIds: Array.isArray(supplied.followUpTriggerEvidenceIds) ? supplied.followUpTriggerEvidenceIds.filter((id) => category.evidenceIds.includes(id)).slice(0, 8) : [],
      followUpSkipReason: supplied.followUpSkipReason ?? (category.evidenceIds.length ? "no-justified-gap" : "evidence-resolved"),
      authorityTargets: category.authorityTargets,
      identityContext: category.identityContext,
      identityAmbiguities: category.identityContext?.ambiguities ?? [],
      localAuthorities: category.authorityTargets?.localAuthorities ?? [],
      authorityLimitations: category.authorityTargets?.limitations ?? [],
      returnedDomains: Array.isArray(supplied.returnedDomains) ? supplied.returnedDomains.filter(Boolean).slice(0, 20) : categoryReturnedDomains(sources.filter((source) => categorySourceMatches(category, source))),
      openedDocuments: Array.isArray(supplied.openedDocuments) && supplied.openedDocuments.length
        ? supplied.openedDocuments.slice(0, 20).map((document) => ({
          ...document,
          categoryId: document.categoryId ?? category.categoryId,
          categoryLabel: document.categoryLabel ?? category.label,
          identityRole: document.identityRole ?? (category.categoryId === "project-identity" ? document.sourceRole ?? null : null),
        }))
        : categoryOpenedDocuments(sources.filter((source) => categorySourceMatches(category, source)), category),
      state,
      executionOutcome,
      analysisOutcome,
      notRunReason,
      searchCompleteness,
      searchCompletenessLabel: searchCompleteness === "incomplete" ? "SEARCH INCOMPLETE" : null,
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
      analysisState: supplied.analysisState ?? null,
      primaryAnalysisCompleted: supplied.primaryAnalysisCompleted === true,
      providerRequestCount: counts.issuedProviderRequests,
      providerAttempts: Array.isArray(supplied.providerAttempts)
        ? supplied.providerAttempts.slice(0, 8).map(sanitizeProviderAttemptForAudit)
        : [],
      retryCount: categoryAttempts.reduce((count, attempt) => Math.max(
        count,
        Number.isInteger(attempt?.retryCount) ? Math.max(0, attempt.retryCount) : 0,
      ), 0),
      tpmWaitMs: categoryAttempts.reduce((sum, attempt) => sum + (Number.isFinite(attempt?.tpmWaitMs)
        ? Math.max(0, attempt.tpmWaitMs)
        : 0), 0),
      rateLimitWaitMs: categoryAttempts.reduce((sum, attempt) => sum + (Number.isFinite(attempt?.rateLimitWaitMs)
        ? Math.max(0, attempt.rateLimitWaitMs)
        : 0), 0),
      categoryPromptTelemetry: Array.isArray(supplied.categoryPromptTelemetry)
        ? supplied.categoryPromptTelemetry.slice(0, 8).filter((entry) => isRecord(entry)).map((entry) => ({
          candidatePassageCount: Number.isInteger(entry.candidatePassageCount) ? Math.max(0, entry.candidatePassageCount) : 0,
          uniquePassageCount: Number.isInteger(entry.uniquePassageCount) ? Math.max(0, entry.uniquePassageCount) : 0,
          passageCountSent: Number.isInteger(entry.passageCountSent) ? Math.max(0, entry.passageCountSent) : 0,
          requestBodyBytesBeforeFiltering: Number.isInteger(entry.requestBodyBytesBeforeFiltering)
            ? Math.max(0, entry.requestBodyBytesBeforeFiltering)
            : null,
          requestBodyBytesAfterFiltering: Number.isInteger(entry.requestBodyBytesAfterFiltering)
            ? Math.max(0, entry.requestBodyBytesAfterFiltering)
            : null,
          requestBodyBytesReduced: Number.isInteger(entry.requestBodyBytesReduced)
            ? entry.requestBodyBytesReduced
            : null,
          requestBodyReductionPercent: Number.isFinite(entry.requestBodyReductionPercent)
            ? Math.max(-100, Math.min(100, entry.requestBodyReductionPercent))
            : null,
          estimatedInputTokens: Number.isInteger(entry.estimatedInputTokens)
            ? Math.max(0, entry.estimatedInputTokens)
            : null,
          inputTokenCap: Number.isInteger(entry.inputTokenCap)
            ? Math.max(0, entry.inputTokenCap)
            : null,
          omittedPassageCount: Number.isInteger(entry.omittedPassageCount)
            ? Math.max(0, entry.omittedPassageCount)
            : 0,
          outcome: ["within-cap", "capped"].includes(entry.outcome) ? entry.outcome : null,
        }))
        : (Array.isArray(supplied.providerAttempts)
          ? supplied.providerAttempts.map((attempt) => attempt?.categoryPromptTelemetry).filter(isRecord).slice(0, 8).map((entry) => ({
            candidatePassageCount: Number.isInteger(entry.candidatePassageCount) ? Math.max(0, entry.candidatePassageCount) : 0,
            uniquePassageCount: Number.isInteger(entry.uniquePassageCount) ? Math.max(0, entry.uniquePassageCount) : 0,
            passageCountSent: Number.isInteger(entry.passageCountSent) ? Math.max(0, entry.passageCountSent) : 0,
            requestBodyBytesBeforeFiltering: Number.isInteger(entry.requestBodyBytesBeforeFiltering)
              ? Math.max(0, entry.requestBodyBytesBeforeFiltering)
              : null,
            requestBodyBytesAfterFiltering: Number.isInteger(entry.requestBodyBytesAfterFiltering)
              ? Math.max(0, entry.requestBodyBytesAfterFiltering)
              : null,
            requestBodyBytesReduced: Number.isInteger(entry.requestBodyBytesReduced)
              ? entry.requestBodyBytesReduced
              : null,
            requestBodyReductionPercent: Number.isFinite(entry.requestBodyReductionPercent)
              ? Math.max(-100, Math.min(100, entry.requestBodyReductionPercent))
              : null,
            estimatedInputTokens: Number.isInteger(entry.estimatedInputTokens)
              ? Math.max(0, entry.estimatedInputTokens)
              : null,
            inputTokenCap: Number.isInteger(entry.inputTokenCap)
              ? Math.max(0, entry.inputTokenCap)
              : null,
            omittedPassageCount: Number.isInteger(entry.omittedPassageCount)
              ? Math.max(0, entry.omittedPassageCount)
              : 0,
            windowedPassageCount: Number.isInteger(entry.windowedPassageCount)
              ? Math.max(0, entry.windowedPassageCount)
              : 0,
            omissionReasons: Array.isArray(entry.omissionReasons)
              ? entry.omissionReasons.filter((reason) => [
                "passage-window-selection", "input-cap", "no-complete-context-window",
              ].includes(reason))
              : [],
            outcome: ["within-cap", "capped"].includes(entry.outcome) ? entry.outcome : null,
          }))
          : []),
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
  const uniqueOpenedSources = new Map();
  sourceAttemptRecords.forEach((source, index) => {
    const physicalOpenIndex = source?.accessOutcome?.physicalOpenIndex ?? source?.physicalOpenIndex;
    if (!Number.isInteger(physicalOpenIndex)) return;
    const canonicalUrl = canonicalizeSourceUrl(
      source.canonicalUrl ?? source.resolvedUrl ?? source.originalUrl ?? source.url,
    );
    uniqueOpenedSources.set(canonicalUrl ?? `physical-open-${physicalOpenIndex}-${index}`, source);
  });
  const uniqueRetainedSources = [...uniqueOpenedSources.values()].filter(hasRetrievedPassage);
  const uniqueRetainedPassageHashes = new Set(uniqueRetainedSources.map((source) => {
    const passage = String(source?.accessOutcome?.passage ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    return passage ? createHash("sha256").update(passage).digest("hex") : null;
  }).filter(Boolean));
  const sourceFamilies = new Map();
  for (const source of uniqueOpenedSources.values()) {
    const family = [
      "declared-project-endpoint",
      "government-project-record",
      "utility-regulator",
      "project-operator",
      "independent-reporting",
      "government-agency",
      "news-aggregator",
      "other",
    ].includes(source.sourceFamily) ? source.sourceFamily : "other";
    sourceFamilies.set(family, (sourceFamilies.get(family) ?? 0) + 1);
  }
  const duplicateOccurrenceKeys = new Set();
  for (const [index, source] of sourceAttemptRecords.entries()) {
    if (source.documentAccessReused !== true && source.accessOutcome?.reused !== true
      && source.acquisitionSelectionReason !== "existing-receipt-reused") continue;
    const canonicalUrl = canonicalizeSourceUrl(
      source.canonicalUrl ?? source.resolvedUrl ?? source.originalUrl ?? source.url,
    ) ?? `duplicate-${index}`;
    duplicateOccurrenceKeys.add(`${source.discoveryCandidateRank ?? source.discoveryRank ?? index}:${source.categoryId ?? ""}:${canonicalUrl}`);
  }
  const irrelevantExclusionCount = (Array.isArray(coverage.discoveryCandidates) ? coverage.discoveryCandidates : sourceAttemptRecords)
    .filter((source) => /(?:irrelevant|unrelated|low-specificity)/i.test([
      source.selectionReason,
      source.rejectionReason,
      source.projectSpecificityState,
      source.relevanceState,
    ].filter((value) => typeof value === "string").join(" "))).length;
  const outcomeMetrics = {
    uniqueSourcesOpened: uniqueOpenedSources.size,
    uniqueProjectSpecificSourcesOpened: [...uniqueOpenedSources.values()]
      .filter((source) => sourceEstablishesProjectIdentity(source, project)).length,
    uniqueUsableRetainedSources: uniqueRetainedSources.length,
    uniqueRetainedPassages: uniqueRetainedPassageHashes.size,
    eligibleClaims: eligibilityReviews.filter((review) => review.eligibleForModel).length,
    sourceFamilyCounts: Object.fromEntries(sourceFamilies),
    categoryCompletion: {
      requested: categories.length,
      executed: categories.filter((category) => category.executionOutcome === "completed"
        || typeof category.issuedPrimaryQuery === "string" && Boolean(category.issuedPrimaryQuery.trim())
        || (category.providerAttempts ?? []).some((attempt) => Boolean(attempt.issuedAt))).length,
      complete: categories.filter((category) => category.state === "Complete").length,
      partial: categories.filter((category) => category.state === "Partial").length,
      conclusiveNoEvidence: categories.filter((category) => category.state === "No eligible evidence").length,
      technicalIncomplete: categories.filter((category) => category.state === "Provider failure"
        || category.state === "Timed out"
        || category.executionOutcome === "failed"
        || category.analysisOutcome === "failed").length,
      notSearched: categories.filter((category) => category.state === "Not searched").length,
      notAssessed: categories.filter((category) => category.state === "Not assessed").length,
    },
    exclusions: {
      blocked: [...uniqueOpenedSources.values()].filter((source) =>
        String(source.accessOutcome?.state ?? source.accessibilityState ?? "").startsWith("blocked")).length,
      duplicateOccurrencesReused: duplicateOccurrenceKeys.size,
      irrelevantCandidates: irrelevantExclusionCount,
    },
  };
  return {
    version: RESEARCH_CATEGORY_AUDIT_VERSION,
    policyVersion: RESEARCH_POLICY_VERSION,
    runtime: {
      applicationVersion: releaseIdentity.applicationVersion,
      buildId: releaseIdentity.releaseId,
      commitSha: releaseIdentity.commitSha,
      sourceCommitSha: releaseIdentity.sourceCommitSha,
    },
    promptVersions: {
      projectResearch: RESEARCH_PROJECT_PROMPT_VERSION,
      googleDiscovery: GOOGLE_DISCOVERY_PROMPT_VERSION,
      claimEligibility: CLAIM_REVIEW_VERSION,
    },
    provider: coverage.provider ?? "openai",
    model: coverage.model ?? RESEARCH_PROJECT_MODEL,
    reasoningEffort: coverage.reasoningEffort ?? (coverage.model && coverage.model !== RESEARCH_PROJECT_MODEL
      ? null : RESEARCH_MODEL_CONFIG.reasoningEffort),
    providers: {
      research: { provider: coverage.provider ?? "openai", model: coverage.model ?? RESEARCH_PROJECT_MODEL,
        reasoningEffort: coverage.reasoningEffort ?? (coverage.model && coverage.model !== RESEARCH_PROJECT_MODEL
          ? null : RESEARCH_MODEL_CONFIG.reasoningEffort) },
      discovery: {
        provider: coverage.discoveryProvider ?? "google-gemini-grounding",
        model: coverage.discoveryModel ?? null,
      },
    },
    discovery: {
      provider: coverage.discoveryProvider ?? "google-gemini-grounding",
      model: coverage.discoveryModel ?? null,
      status: coverage.discoveryStatus ?? null,
      state: coverage.discoveryState ?? null,
      queries: normalizeSearchTerms(coverage.discoveryQueries, 24),
      requestedQueryPlan: normalizeSearchTerms(coverage.discoveryRequestedQueryPlan, 12),
      candidateCount: Number.isInteger(coverage.discoveryCandidateCount)
        ? coverage.discoveryCandidateCount
        : 0,
      annotationCount: Number.isInteger(coverage.discoveryAnnotationCount)
        ? coverage.discoveryAnnotationCount
        : Array.isArray(coverage.discoveryRawAnnotationSummaries)
          ? coverage.discoveryRawAnnotationSummaries.length
          : 0,
      rawAnnotationSummaries: Array.isArray(coverage.discoveryRawAnnotationSummaries)
        ? coverage.discoveryRawAnnotationSummaries.slice(0, 80).map((annotation, index) => ({
          discoveryRank: Number.isInteger(annotation?.discoveryRank) ? annotation.discoveryRank : index + 1,
          type: sanitizeTransportText(annotation?.type, 80),
          title: sanitizeTransportText(annotation?.title, 240),
          url: safePublicDiagnosticUrl(annotation?.url),
          canonicalUrl: safePublicDiagnosticUrl(annotation?.canonicalUrl),
          originatingQuery: sanitizeTransportText(annotation?.discoveryOriginatingQuery, 500) || null,
          queryAttributionStatus: annotation?.discoveryQueryAttributionStatus === "provider-attributed"
            ? "provider-attributed"
            : "unavailable",
          candidateRankWithinQuery: Number.isInteger(annotation?.discoveryCandidateRankWithinQuery)
            ? annotation.discoveryCandidateRankWithinQuery
            : null,
          queryRankAvailability: annotation?.discoveryQueryRankAvailability === "provider-reported"
            ? "provider-reported"
            : "unavailable",
          deduplicatedAgainstDiscoveryRank: Number.isInteger(annotation?.deduplicatedAgainstDiscoveryRank)
            ? annotation.deduplicatedAgainstDiscoveryRank
            : null,
          accepted: annotation?.accepted === true,
          rejectionReason: sanitizeTransportText(annotation?.rejectionReason, 120),
        }))
        : [],
      acceptedCitationUrls: Array.isArray(coverage.discoveryAcceptedCitationUrls)
        ? coverage.discoveryAcceptedCitationUrls.slice(0, 80)
          .map(safePublicDiagnosticUrl).filter(Boolean)
        : [],
      rejectedCitationUrls: Array.isArray(coverage.discoveryRejectedCitationUrls)
        ? coverage.discoveryRejectedCitationUrls.slice(0, 80).map((entry) => ({
          discoveryRank: Number.isInteger(entry?.discoveryRank) ? entry.discoveryRank : null,
          url: safePublicDiagnosticUrl(entry?.url),
          reason: sanitizeTransportText(entry?.reason, 120),
        }))
        : [],
    },
    providerResponseId: providerResponseIds[0] ?? null,
    terminalState: coverage.terminalState ?? null,
    terminalReasonCodes: Array.isArray(coverage.terminalReasonCodes) ? coverage.terminalReasonCodes.slice(0, 16) : [],
    identityPhysicalOpenOpportunityReserved: coverage.identityPhysicalOpenOpportunityReserved === true,
    canaryIdentityGate: isRecord(coverage.canaryIdentityGate)
      ? {
        required: coverage.canaryIdentityGate.required === true,
        state: sanitizeTransportText(coverage.canaryIdentityGate.state, 80),
        usableRetainedPassageCount: Number.isInteger(coverage.canaryIdentityGate.usableRetainedPassageCount)
          ? Math.max(0, coverage.canaryIdentityGate.usableRetainedPassageCount)
          : 0,
        exactProjectPassageCount: Number.isInteger(coverage.canaryIdentityGate.exactProjectPassageCount)
          ? Math.max(0, coverage.canaryIdentityGate.exactProjectPassageCount)
          : 0,
        relatedFacilityPassageCount: Number.isInteger(coverage.canaryIdentityGate.relatedFacilityPassageCount)
          ? Math.max(0, coverage.canaryIdentityGate.relatedFacilityPassageCount)
          : 0,
        crossPassageCorroboratedFacilityIdentifiers: Array.isArray(coverage.canaryIdentityGate.crossPassageCorroboratedFacilityIdentifiers)
          ? coverage.canaryIdentityGate.crossPassageCorroboratedFacilityIdentifiers
            .slice(0, 8)
            .map((identifier) => sanitizeTransportText(identifier, 24))
            .filter(Boolean)
          : [],
        conflictedRelatedFacilityIdentifiers: Array.isArray(coverage.canaryIdentityGate.conflictedRelatedFacilityIdentifiers)
          ? coverage.canaryIdentityGate.conflictedRelatedFacilityIdentifiers
            .slice(0, 8)
            .map((identifier) => sanitizeTransportText(identifier, 24))
            .filter(Boolean)
          : [],
        relatedFacilityIdentifiers: Array.isArray(coverage.canaryIdentityGate.relatedFacilityIdentifiers)
          ? coverage.canaryIdentityGate.relatedFacilityIdentifiers
            .slice(0, 8)
            .map((identifier) => sanitizeTransportText(identifier, 24))
            .filter(Boolean)
          : [],
        reason: sanitizeTransportText(coverage.canaryIdentityGate.reason, 240) || null,
      }
      : null,
    runCorrelationId,
    providerResponseIds,
    startedAt,
    deadlineAt: coverage.deadlineAt ?? null,
    finishedAt,
    budget: { ...runBudget },
    elapsedMs: startedAt && finishedAt ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) : null,
    toolCallCount: Number.isInteger(coverage.toolCallCount)
      ? Math.min(runBudget.maxToolCalls, Math.max(0, coverage.toolCallCount))
      : 0,
    providerRequestCount: Number.isInteger(coverage.providerRequestCount)
      ? Math.min(runBudget.maxProviderRequests, Math.max(0, coverage.providerRequestCount))
      : issuedProviderAttemptCount(providerAttempts),
    providerAttemptCount: providerAttempts.length,
    providerAttempts,
    providerRequestBudget: {
      maximum: runBudget.maxProviderRequests,
      issued: Number.isInteger(coverage.providerRequestCount)
        ? Math.min(runBudget.maxProviderRequests, Math.max(0, coverage.providerRequestCount))
        : issuedProviderAttemptCount(providerAttempts),
      attempts: providerAttempts.map((attempt, index) => ({
        index: index + 1,
        provider: attempt?.provider ?? null,
        model: attempt?.model ?? null,
        requestState: attempt?.requestState ?? attempt?.outcome ?? "unknown",
        queuedAt: attempt?.queuedAt ?? null,
        issuedAt: attempt?.issuedAt ?? null,
        finishedAt: attempt?.finishedAt ?? null,
        queueWaitMs: attempt?.queueWaitMs ?? null,
        elapsedMs: attempt?.elapsedMs ?? null,
        status: Number.isInteger(attempt?.status) ? attempt.status : null,
        retryAfter: attempt?.retryAfter ?? attempt?.providerDiagnostic?.rateLimit?.retryAfter ?? null,
        retryCount: Number.isInteger(attempt?.retryCount) ? attempt.retryCount : null,
        inFlightAnalysisCountAtIssue: attempt?.inFlightAnalysisCountAtIssue ?? null,
        inFlightAnalysisCount: attempt?.inFlightAnalysisCount ?? null,
        budget: attempt?.budget ?? null,
        error: attempt?.providerDiagnostic ?? null,
      })),
    },
    inFlightAnalysisCount: Number.isInteger(coverage.inFlightAnalysisCount) ? coverage.inFlightAnalysisCount : 0,
    peakInFlightAnalysisCount: Number.isInteger(coverage.peakInFlightAnalysisCount) ? coverage.peakInFlightAnalysisCount : 0,
    phaseTiming: isRecord(coverage.phaseTiming) ? coverage.phaseTiming : null,
    dnsRejections: categories.flatMap((category) => category.openedDocuments
      .filter((document) => document.dnsRejection)
      .map((document) => ({ categoryId: category.categoryId, ...document.dnsRejection }))),
    physicalOpenBudget: runBudget.maxPhysicalDocumentOpens,
    physicalOpensUsed: Number.isInteger(coverage.physicalOpensUsed) ? coverage.physicalOpensUsed : 0,
    physicalOpensRemaining: Math.max(0, runBudget.maxPhysicalDocumentOpens - (Number.isInteger(coverage.physicalOpensUsed) ? coverage.physicalOpensUsed : 0)),
    physicalOpenBudgetExceeded: coverage.physicalOpenBudgetExceeded === true,
    sourceAttempts: sourceAttemptRecords.map((source, index) => ({
      discoveryRank: Number.isInteger(source.discoveryCandidateRank) ? source.discoveryCandidateRank : index + 1,
      acquisitionRank: Number.isInteger(source.acquisitionRank) ? source.acquisitionRank : null,
      acquisitionPriority: Number.isFinite(source.acquisitionPriority) ? source.acquisitionPriority : null,
      acquisitionReasons: Array.isArray(source.acquisitionReasons) ? source.acquisitionReasons.slice(0, 12) : [],
      candidateLimitSelected: typeof source.acquisitionCandidateSelected === "boolean"
        ? source.acquisitionCandidateSelected
        : null,
      acquisitionSelected: typeof source.acquisitionSelected === "boolean" ? source.acquisitionSelected : null,
      acquisitionSelectionReason: source.acquisitionSelectionReason ?? null,
      physicalOpenAdmission: source.physicalOpenAdmission ?? null,
      candidateUrl: safePublicDiagnosticUrl(source.discoveryCandidateUrl),
      originatingQuery: sanitizeTransportText(source.discoveryOriginatingQuery, 500) || null,
      queryAttributionStatus: source.discoveryQueryAttributionStatus === "provider-attributed"
        ? "provider-attributed"
        : "unavailable",
      candidateRankWithinQuery: Number.isInteger(source.discoveryCandidateRankWithinQuery)
        ? source.discoveryCandidateRankWithinQuery
        : null,
      queryRankAvailability: source.discoveryQueryRankAvailability === "provider-reported"
        ? "provider-reported"
        : "unavailable",
      deduplicationLineage: isRecord(source.discoveryDeduplicationLineage)
        ? {
          duplicateAnnotationRanks: Array.isArray(source.discoveryDeduplicationLineage.duplicateAnnotationRanks)
            ? source.discoveryDeduplicationLineage.duplicateAnnotationRanks.slice(0, 80).filter(Number.isInteger)
            : [],
          deduplicatedAcrossQueries: typeof source.discoveryDeduplicationLineage.deduplicatedAcrossQueries === "boolean"
            ? source.discoveryDeduplicationLineage.deduplicatedAcrossQueries
            : null,
        }
        : null,
      retainedPassageOutcome: isRecord(source.retainedPassageOutcome)
        ? {
          retained: source.retainedPassageOutcome.retained === true,
          usability: sanitizeTransportText(source.retainedPassageOutcome.usability, 80),
          reason: sanitizeTransportText(source.retainedPassageOutcome.reason, 160) || null,
        }
        : null,
      categoryId: source.categoryId ?? null,
      url: safePublicSourceUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.originalUrl ?? source.url),
      sourceChannel: source.sourceChannel ?? source.origin ?? null,
      state: source.accessOutcome?.state ?? source.accessibilityState ?? source.accessState ?? "unknown",
      reason: source.accessOutcome?.reason ?? source.accessOutcome ?? null,
      physicalOpenIndex: source.accessOutcome?.physicalOpenIndex ?? source.physicalOpenIndex ?? null,
      redirectHops: Array.isArray(source.accessOutcome?.redirectHops)
        ? source.accessOutcome.redirectHops.slice(0, 4)
        : [],
      fetchMetrics: isRecord(source.accessOutcome?.fetchMetrics) ? source.accessOutcome.fetchMetrics : null,
    })),
    discoveryCandidates: Array.isArray(coverage.discoveryCandidates)
      ? coverage.discoveryCandidates.slice(0, MAX_RESEARCH_DISCOVERY_AUDIT_CANDIDATES).map((candidate, index) => ({
        discoveryRank: Number.isInteger(candidate.discoveryRank) ? candidate.discoveryRank : index + 1,
        acquisitionRank: Number.isInteger(candidate.acquisitionRank) ? candidate.acquisitionRank : null,
        acquisitionPriority: Number.isFinite(candidate.acquisitionPriority) ? candidate.acquisitionPriority : null,
        acquisitionReasons: Array.isArray(candidate.acquisitionReasons)
          ? candidate.acquisitionReasons.slice(0, 12).map((reason) => sanitizeTransportText(reason, 100))
          : [],
        candidateLimitSelected: candidate.candidateLimitSelected === true,
        selectedForOpen: candidate.selectedForOpen === true,
        selectionReason: sanitizeTransportText(candidate.selectionReason, 100),
        physicalOpenAdmission: sanitizeTransportText(candidate.physicalOpenAdmission, 80),
        candidateUrl: safePublicDiagnosticUrl(candidate.discoveryCandidateUrl),
        url: safePublicSourceUrl(candidate.url),
        originalUrl: safePublicSourceUrl(candidate.originalUrl),
        resolvedUrl: safePublicSourceUrl(candidate.resolvedUrl),
        originatingQuery: sanitizeTransportText(candidate.discoveryOriginatingQuery, 500) || null,
        queryAttributionStatus: candidate.discoveryQueryAttributionStatus === "provider-attributed"
          ? "provider-attributed"
          : "unavailable",
        candidateRankWithinQuery: Number.isInteger(candidate.discoveryCandidateRankWithinQuery)
          ? candidate.discoveryCandidateRankWithinQuery
          : null,
        queryRankAvailability: candidate.discoveryQueryRankAvailability === "provider-reported"
          ? "provider-reported"
          : "unavailable",
        deduplicationLineage: isRecord(candidate.discoveryDeduplicationLineage)
          ? {
            duplicateAnnotationRanks: Array.isArray(candidate.discoveryDeduplicationLineage.duplicateAnnotationRanks)
              ? candidate.discoveryDeduplicationLineage.duplicateAnnotationRanks.slice(0, 80)
                .filter(Number.isInteger)
              : [],
            deduplicatedAcrossQueries: typeof candidate.discoveryDeduplicationLineage.deduplicatedAcrossQueries === "boolean"
              ? candidate.discoveryDeduplicationLineage.deduplicatedAcrossQueries
              : null,
          }
          : { duplicateAnnotationRanks: [], deduplicatedAcrossQueries: null },
        retainedPassageOutcome: isRecord(candidate.retainedPassageOutcome)
          ? {
            retained: candidate.retainedPassageOutcome.retained === true,
            usability: sanitizeTransportText(candidate.retainedPassageOutcome.usability, 80),
            reason: sanitizeTransportText(candidate.retainedPassageOutcome.reason, 160) || null,
          }
          : null,
        title: sanitizeTransportText(candidate.title, 300),
        categoryIds: Array.isArray(candidate.categoryIds)
          ? candidate.categoryIds.slice(0, 8).map((categoryId) => sanitizeTransportText(categoryId, 100))
          : [],
        accessState: sanitizeTransportText(candidate.accessOutcome?.state, 80),
        accessReason: sanitizeTransportText(candidate.accessOutcome?.reason, 160),
        physicalOpenIndex: Number.isInteger(candidate.accessOutcome?.physicalOpenIndex)
          ? candidate.accessOutcome.physicalOpenIndex
          : null,
      }))
      : [],
    retrievalOnlyStop: coverage.retrievalOnlyStop ?? null,
    eligibilityReview: {
      version: CLAIM_REVIEW_VERSION,
      claims: eligibilityReviews,
    },
    followUpCount: Number.isInteger(coverage.followUpCount)
      ? Math.max(0, coverage.followUpCount)
      : categories.reduce((total, category) => total + category.followUpCount, 0),
    followUpLimit: runBudget.maxFollowUps,
    followUpLimitPerCategory: runBudget.maxFollowUpsPerCategory,
    categories,
    categoryGaps: categories.filter((category) => category.state !== "Complete").map((category) => category.categoryId),
    outcomeMetrics,
    providerLimitations: Array.isArray(coverage.providerLimitations) ? coverage.providerLimitations.slice(0, 12) : [],
  };
}

async function orchestrateCategoryResearch(project, {
  retrieveCategory,
  onCategoryFailure,
  now = () => Date.now(),
  budget = RESEARCH_RUN_BUDGET,
  signal,
  deadlineState = { expired: false },
  concurrent = false,
  categoryIds = null,
  retrievalOnly = false,
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
  categories.sort((left, right) => RESEARCH_CATEGORY_ORDER.indexOf(left.categoryId)
    - RESEARCH_CATEGORY_ORDER.indexOf(right.categoryId));
  if (retrievalOnly) {
    for (const category of categories) {
      categoryExecutions[category.categoryId] = {
        issuedPrimaryQuery: null,
        providerObservedPrimaryQueries: [],
        issuedFollowUpQuery: null,
        providerObservedFollowUpQueries: [],
        followUpTriggerEvidenceIds: [],
        followUpSkipReason: "retrieval-only-stop",
        returnedDomains: [],
        openedDocuments: [],
        state: "Not searched",
        executedQueries: [],
        unresolvedGaps: category.evidenceIds,
        providerFailure: null,
        providerFailureType: null,
        providerRequestCount: 0,
        executionOutcome: "not-run",
        analysisOutcome: "not-run",
        notRunReason: "retrieval-only-stop",
        searchCompleteness: "incomplete",
      };
    }
    const finishedAtMs = now();
    return {
      policyVersion: RESEARCH_POLICY_VERSION,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: Math.max(0, finishedAtMs - startedAtMs),
      providerRequests: 0,
      toolCalls: 0,
      toolCallBudgetExceeded: false,
      followUps: 0,
      followUpLimit: budget.maxFollowUps,
      followUpLimitPerCategory: budget.maxFollowUpsPerCategory ?? 1,
      physicalOpensUsed: Number.isInteger(budget.physicalOpensUsed) ? budget.physicalOpensUsed : 0,
      physicalOpenBudgetExceeded: false,
      resolvedEvidenceIds: [],
      candidates: [],
      categoryResults: [],
      lastError: null,
      categoryExecutions,
      budget: { ...budget },
      retrievalOnlyStop: "discovery-prefetch-complete",
    };
  }
  const prefetchedPrimary = new Map();
  const pendingPrimaryCategories = new Set();
  const additionalReservationsByCategory = new Map();
  let additionalRequestsAuthorized = 0;
  const releaseAdditionalReservations = (categoryId) => {
    const reserved = additionalReservationsByCategory.get(categoryId) ?? 0;
    additionalReservationsByCategory.delete(categoryId);
    additionalRequestsAuthorized = Math.max(0, additionalRequestsAuthorized - reserved);
  };
  const authorizeAdditionalRequest = (categoryId) => {
    const remainingPrimaryOpportunity = categories.filter((candidate) =>
      candidate.categoryId !== categoryId
      && !prefetchedPrimary.has(candidate.categoryId)
      && !categoryExecutions[candidate.categoryId]).length;
    if (providerRequests + pendingPrimaryCategories.size
      + remainingPrimaryOpportunity + additionalRequestsAuthorized >= budget.maxProviderRequests) return false;
    additionalRequestsAuthorized += 1;
    additionalReservationsByCategory.set(
      categoryId,
      (additionalReservationsByCategory.get(categoryId) ?? 0) + 1,
    );
    return true;
  };
  const prefetchPrimaryCategories = (targetCategories) => {
    for (const category of targetCategories) {
      const index = categories.findIndex((candidate) => candidate.categoryId === category.categoryId);
      if (
        index < 0
        || prefetchedPrimary.has(category.categoryId)
        || deadlineState.expired
        || signal?.aborted
        || physicalOpenBudgetExceeded
        || toolCalls >= budget.maxToolCalls
        || resolvedEvidenceIds.size >= RESEARCH_EVIDENCE_IDS.length
      ) continue;
      if (providerRequests + pendingPrimaryCategories.size + additionalRequestsAuthorized
        >= budget.maxProviderRequests) break;
      pendingPrimaryCategories.add(category.categoryId);
      const primaryPromise = Promise.resolve().then(() => retrieveCategory({
          categoryId: category.categoryId,
          query: category.requestedPrimaryQuery,
          attempt: "primary",
          remainingMs: Math.max(0, budget.deadlineMs - (now() - startedAtMs)),
          remainingToolCalls: Math.max(1, Math.floor(budget.maxToolCalls / categories.length)),
          authorizeAdditionalProviderRequest: () => authorizeAdditionalRequest(category.categoryId),
      }));
      primaryPromise.catch(() => {});
      prefetchedPrimary.set(category.categoryId, primaryPromise);
    }
  };
  if (concurrent) {
    prefetchPrimaryCategories(categories);
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
    if (!issuedPrimary && (physicalOpenBudgetExceeded
      || deadlineState.expired
      || elapsed >= budget.deadlineMs
      || toolCalls >= budget.maxToolCalls
      || providerRequests + pendingPrimaryCategories.size + additionalRequestsAuthorized >= budget.maxProviderRequests)) {
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
        executionOutcome: "not-run",
        analysisOutcome: "not-run",
        notRunReason: physicalOpenBudgetExceeded
          ? "physical-open-budget"
          : elapsed >= budget.deadlineMs || deadlineState.expired
            ? "deadline"
            : toolCalls >= budget.maxToolCalls
              ? "tool-call-budget"
              : providerRequests >= budget.maxProviderRequests
                ? "provider-request-budget"
                : "unavailable",
        searchCompleteness: "incomplete",
      };
      continue;
    }
    const executedQueries = [];
    let categoryCandidates = [];
    let followUpWasRun = false;
    let queuedFollowUpQuery = null;
    let primaryAdditionalRequestsAuthorized = 0;
    let state = "No eligible evidence";
    let providerFailure = null;
    let cancellationToRethrow = null;
    const categoryResolvedEvidenceIds = new Set();
    const execution = {
      issuedPrimaryQuery: category.requestedPrimaryQuery,
      providerObservedPrimaryQueries: [],
      issuedFollowUpQuery: null,
      providerObservedFollowUpQueries: [],
      followUpTriggerEvidenceIds: [],
      followUpSkipReason: null,
      followUpAttemptState: null,
      followUpCancellationReason: null,
      returnedDomains: [],
      openedDocuments: [],
      providerRequestCount: 0,
      providerFailureType: null,
      primaryAnalysisCompleted: false,
      followUpCount: 0,
      providerAttempts: [],
      categoryPromptTelemetry: [],
      discoveryAttempts: [],
      authorityRecords: [],
      secConnectorAttempts: [],
      sourceChannelTelemetry: [],
      executionOutcome: "running",
      analysisOutcome: "not-run",
      notRunReason: null,
      searchCompleteness: "incomplete",
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
      if (concurrent) pendingPrimaryCategories.delete(category.categoryId);
      const primaryRequestCost = Number.isInteger(primary?.providerRequestCount)
        ? Math.max(0, primary.providerRequestCount)
        : 1;
      if (concurrent) providerRequests += primaryRequestCost;
      else providerRequests = Math.max(
        0,
        providerRequests + primaryRequestCost - 1 - primaryAdditionalRequestsAuthorized,
      );
      if (concurrent) releaseAdditionalReservations(category.categoryId);
      execution.providerRequestCount += primaryRequestCost;
      if (primary?.analysisState) execution.analysisState = primary.analysisState;
      const primaryAttempts = collectProviderAttempts(primary);
      execution.providerAttempts.push(...primaryAttempts);
      execution.categoryPromptTelemetry.push(...primaryAttempts
        .map((attempt) => attempt?.categoryPromptTelemetry)
        .filter(isRecord));
      execution.primaryAnalysisCompleted = primaryAttempts.some((attempt) =>
        attempt?.requestState === "completed" || attempt?.outcome === "completed");
      const primaryAnalysisFailure = primary?.categoryResult?.coverage?.analysisFailureType;
      if (primaryAnalysisFailure) {
        execution.providerFailureType = primaryAnalysisFailure;
        execution.analysisOutcome = primary?.categoryResult?.coverage?.analysisState === "not-analyzed-429"
          ? "not-run" : "failed";
        providerFailure = "Structured category assessment failed; retained documents do not establish completed analysis.";
      }
      execution.discoveryAttempts.push(...(Array.isArray(primary?.discoveryAttempts) ? primary.discoveryAttempts : []));
      execution.authorityRecords.push(...(Array.isArray(primary?.authorityRecords) ? primary.authorityRecords : []));
      execution.secConnectorAttempts.push(...(Array.isArray(primary?.secConnectorAttempts) ? primary.secConnectorAttempts : []));
      execution.sourceChannelTelemetry.push(...(Array.isArray(primary?.sourceChannelTelemetry) ? primary.sourceChannelTelemetry : []));
      if (signal?.aborted && !deadlineState.expired) {
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
      execution.executionOutcome = "completed";
      execution.searchCompleteness = primaryObservedQueries.length ? "observed" : "unavailable";
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
        ? providerRequests + pendingPrimaryCategories.size + remainingPrimaryOpportunity
          + additionalRequestsAuthorized < budget.maxProviderRequests
        : providerRequests + 1 + remainingPrimaryOpportunity <= budget.maxProviderRequests;
      if (primary?.gapDrivenFollowUp === true
        && primary?.analysisState !== "not-assessed-no-admitted-passage-text"
        && !globalEarlyStop
        && !primaryCategoryResolved
        && toolCalls < budget.maxToolCalls
        && followUps < budget.maxFollowUps
        && (budget.maxFollowUpsPerCategory ?? 1) > 0
        && providerRequests < budget.maxProviderRequests
        && additionalRequestAvailable
        && !physicalOpenBudgetExceeded
        && !deadlineState.expired
        && !signal?.aborted
        && now() - startedAtMs < budget.deadlineMs) {
        followUps += 1;
        followUpWasRun = true;
        if (concurrent && !authorizeAdditionalRequest(category.categoryId)) {
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
        queuedFollowUpQuery = primary?.followUpQuery ?? category.optionalFollowUpQuery;
        execution.followUpAttemptState = "queued";
        const followUp = await retrieveCategory({
          categoryId: category.categoryId,
          query: queuedFollowUpQuery,
          attempt: "follow-up",
          remainingMs: Math.max(0, budget.deadlineMs - (now() - startedAtMs)),
          remainingToolCalls: Math.max(0, budget.maxToolCalls - toolCalls),
        });
        if (concurrent) releaseAdditionalReservations(category.categoryId);
        const followUpRequestCost = Number.isInteger(followUp?.providerRequestCount)
          ? Math.max(0, followUp.providerRequestCount)
          : 1;
        providerRequests += followUpRequestCost - 1;
        execution.providerRequestCount += followUpRequestCost - 1;
        const followUpAttempts = collectProviderAttempts(followUp);
        execution.providerAttempts.push(...followUpAttempts);
        execution.categoryPromptTelemetry.push(...followUpAttempts
          .map((attempt) => attempt?.categoryPromptTelemetry)
          .filter(isRecord));
        execution.issuedFollowUpQuery = queuedFollowUpQuery;
        execution.followUpAttemptState = "completed";
        execution.discoveryAttempts.push(...(Array.isArray(followUp?.discoveryAttempts) ? followUp.discoveryAttempts : []));
        execution.authorityRecords.push(...(Array.isArray(followUp?.authorityRecords) ? followUp.authorityRecords : []));
        execution.secConnectorAttempts.push(...(Array.isArray(followUp?.secConnectorAttempts) ? followUp.secConnectorAttempts : []));
        execution.sourceChannelTelemetry.push(...(Array.isArray(followUp?.sourceChannelTelemetry) ? followUp.sourceChannelTelemetry : []));
        if (signal?.aborted && !deadlineState.expired) {
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
        execution.followUpCount = 1;
        execution.returnedDomains = categoryReturnedDomains(categoryCandidates);
        execution.openedDocuments = categoryOpenedDocuments(categoryCandidates);
        execution.accessLimitations = [...new Set(categoryCandidates.flatMap((source) => source.accessOutcome?.extractionLimitations ?? []))].slice(0, 8);
        (Array.isArray(followUp?.resolvedEvidenceIds) ? followUp.resolvedEvidenceIds : []).forEach((id) => {
          resolvedEvidenceIds.add(id);
          categoryResolvedEvidenceIds.add(id);
        });
        execution.followUpSkipReason = followUp?.categoryResolved === true ? null : "category-follow-up-limit";
      } else {
        execution.followUpSkipReason = deadlineState.expired || now() - startedAtMs >= budget.deadlineMs
          ? "deadline"
          : physicalOpenBudgetExceeded
            ? "physical-open-budget"
            : globalEarlyStop
              ? "early-stop"
              : primaryCategoryResolved
                ? "evidence-resolved"
                : toolCalls >= budget.maxToolCalls || primary?.toolCallBudgetExceeded
                  ? "tool-call-budget"
                  : providerRequests >= budget.maxProviderRequests
                    ? "provider-request-budget"
                    : followUps >= budget.maxFollowUps
                      ? "provider-request-budget"
                      : "no-justified-gap";
      }
      const noAdmittedPassageText = primary?.analysisState === "not-assessed-no-admitted-passage-text";
      state = noAdmittedPassageText ? "Not assessed" : categoryCandidates.length ? "Partial" : "No eligible evidence";
      if (noAdmittedPassageText) {
        execution.issuedPrimaryQuery = null;
        execution.executionOutcome = "skipped";
        execution.analysisOutcome = "not-assessed";
        execution.primaryAnalysisCompleted = false;
        execution.analysisState = "not-assessed-no-admitted-passage-text";
        execution.notRunReason = "no-admitted-passage-text";
        execution.followUpSkipReason = "no-admitted-passage-text";
      }
      if (!noAdmittedPassageText && (
        primaryCategoryResolved
        || categoryResults
          .filter((result) => result.categoryId === category.categoryId)
          .some((result) => result.categoryResolved === true)
        || followUpWasRun
      )) state = "Complete";
      if (!noAdmittedPassageText && followUpWasRun) {
        const followUpResult = categoryResults.filter((result) => result.categoryId === category.categoryId).at(-1);
        const hasSuccessfulCandidate = categoryCandidates.some((candidate) => candidate?.eligible === true);
        state = followUpResult?.categoryResolved === true || hasSuccessfulCandidate
          ? "Complete"
          : categoryCandidates.length ? "Partial" : "No eligible evidence";
      }
      if (!noAdmittedPassageText && execution.primaryAnalysisCompleted && !primaryCategoryResolved && deadlineState.expired) {
        state = "Partial";
      }
      if (primaryAnalysisFailure && !execution.primaryAnalysisCompleted && !noAdmittedPassageText) {
        state = categoryCandidates.length ? "Partial" : "Provider failure";
      }
    } catch (error) {
      if (concurrent) {
        pendingPrimaryCategories.delete(category.categoryId);
        releaseAdditionalReservations(category.categoryId);
      }
      const errorAttempts = collectProviderAttempts(error);
      const cancellationError = error?.name === "ResearchCancelledError"
        || error?.name === "AbortError"
        || error?.researchErrorType === "cancelled";
      const deadlineCancellation = cancellationError && deadlineState.expired;
      const clientCancellation = cancellationError && signal?.aborted && !deadlineState.expired;
      const actualRequestCost = errorAttempts.length
        ? issuedProviderAttemptCount(errorAttempts)
        : Number.isInteger(error?.providerRequestCount)
          ? Math.max(0, error.providerRequestCount)
          : (followUpWasRun ? 1 : 1 + primaryAdditionalRequestsAuthorized);
      const reservedProviderRequests = (followUpWasRun ? 1 : concurrent ? 0 : 1)
        + primaryAdditionalRequestsAuthorized;
      providerRequests = Math.max(0, providerRequests + actualRequestCost - reservedProviderRequests);
      execution.providerRequestCount = Math.max(
        0,
        execution.providerRequestCount - (followUpWasRun ? 1 : 0) + actualRequestCost,
      );
      for (const attempt of errorAttempts) {
        if (deadlineCancellation && String(attempt?.requestState ?? "").startsWith("cancelled")) {
          attempt.failureClassification = "timeout";
          attempt.cancellationReason = "deadline";
        } else if (clientCancellation && String(attempt?.requestState ?? "").startsWith("cancelled")) {
          attempt.cancellationReason = "requesting-client-cancelled";
        }
        if (!execution.providerAttempts.includes(attempt)) execution.providerAttempts.push(attempt);
      }
      if (followUpWasRun) {
        const followUpAttempt = [...errorAttempts].reverse().find((attempt) =>
          attempt?.attemptType === "follow-up" || !attempt?.attemptType);
        const followUpWasIssued = errorAttempts.some((attempt) =>
          (attempt?.attemptType === "follow-up" || !attempt?.attemptType)
          && typeof attempt?.issuedAt === "string"
          && attempt.issuedAt.length > 0);
        execution.followUpCount = followUpWasIssued ? 1 : 0;
        if (!followUpWasIssued) followUps = Math.max(0, followUps - 1);
        execution.issuedFollowUpQuery = followUpWasIssued ? queuedFollowUpQuery : null;
        execution.followUpAttemptState = followUpAttempt?.requestState
          ?? (followUpWasIssued ? "failed" : "cancelled-before-issue");
        if (execution.followUpAttemptState === "cancelled-before-issue") {
          execution.followUpCancellationReason = deadlineCancellation
            ? "deadline"
            : clientCancellation ? "requesting-client-cancelled" : null;
        }
      }
      if (deadlineCancellation) {
        error.researchErrorType = "deadline";
        error.deadlineExpired = true;
      }
      lastError = error;
      onCategoryFailure?.({ categoryId: category.categoryId, stage: "category-orchestration", error });
      const failure = classifyResearchFailure(error);
      execution.providerFailureType = failure.type === "timeout" ? "deadline" : failure.type;
      providerFailure = failure.type === "timeout" ? null : failure.message;
      state = execution.primaryAnalysisCompleted && followUpWasRun
        ? "Partial"
        : categoryCandidates.length
          ? "Partial"
          : failure.type === "timeout" ? "Timed out" : "Provider failure";
      execution.followUpSkipReason = error?.retrySkippedForDeadline
        ? "provider-429-deadline"
        : deadlineCancellation || failure.type === "timeout"
          ? "deadline"
          : failure.type === "provider-request-budget"
            ? "provider-request-budget"
            : clientCancellation
              ? "requesting-client-cancelled"
              : "provider-failure";
      if (clientCancellation) cancellationToRethrow = error;
      if (error?.retrySkippedForDeadline) execution.analysisState = "not-analyzed-429";
      execution.executionOutcome = "failed";
      execution.analysisOutcome = issuedProviderAttemptCount(errorAttempts) > 0 ? "failed" : "not-run";
      execution.notRunReason = execution.analysisOutcome === "not-run"
        ? error?.researchErrorType ?? failure.type
        : null;
      execution.searchCompleteness = "incomplete";
    }
    categoryExecutions[category.categoryId] = {
      ...(categoryExecutions[category.categoryId] ?? {}),
      ...execution,
      state,
      executedQueries,
      providerFailure,
      unresolvedGaps: category.evidenceIds.filter((id) => !categoryResolvedEvidenceIds.has(id)),
    };
    if (execution.primaryAnalysisCompleted) {
      categoryExecutions[category.categoryId].analysisOutcome = "completed";
      categoryExecutions[category.categoryId].notRunReason = null;
    }
    if (cancellationToRethrow) {
      cancellationToRethrow.partialCategoryResults = categoryResults;
      cancellationToRethrow.partialCategoryExecutions = categoryExecutions;
      throw cancellationToRethrow;
    }
    if (concurrent) {
      prefetchPrimaryCategories(categories.filter((candidate) => !categoryExecutions[candidate.categoryId]));
    }
    if (!concurrent && (resolvedEvidenceIds.size >= RESEARCH_EVIDENCE_IDS.length || deadlineState.expired)) break;
  }
  for (const category of categories) {
    if (categoryExecutions[category.categoryId]) continue;
    categoryExecutions[category.categoryId] = {
      issuedPrimaryQuery: null,
      providerObservedPrimaryQueries: [],
      executedQueries: [],
      issuedFollowUpQuery: null,
      providerObservedFollowUpQueries: [],
      followUpTriggerEvidenceIds: [],
      followUpSkipReason: resolvedEvidenceIds.size >= RESEARCH_EVIDENCE_IDS.length
        ? "early-stop"
        : deadlineState.expired || now() - startedAtMs >= budget.deadlineMs
          ? "deadline"
          : "not-scheduled",
      state: "Not searched",
      unresolvedGaps: category.evidenceIds,
      providerFailure: null,
      providerFailureType: null,
      providerRequestCount: 0,
      executionOutcome: "not-run",
      analysisOutcome: "not-run",
      notRunReason: resolvedEvidenceIds.size >= RESEARCH_EVIDENCE_IDS.length
        ? "early-stop"
        : deadlineState.expired || now() - startedAtMs >= budget.deadlineMs
          ? "deadline"
          : "not-scheduled",
      searchCompleteness: "incomplete",
    };
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

function isExactProjectSource(source, summary, itemRelevance, onDecision = null) {
  return isSourceProjectSpecific(source, summary, itemRelevance, onDecision);
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
  const originalSources = Array.isArray(item.sources) ? item.sources : [];
  const sourceQualityReasons = (source) => [
    source?.excerpt,
    source?.claimPassage,
    source?.accessOutcome?.passage,
  ].map(researchContentRejectionReason).filter(Boolean);
  const excludedSourceQualityReasons = [...new Set(originalSources.flatMap(sourceQualityReasons))];
  const sources = originalSources.filter((source) => sourceQualityReasons(source).length === 0);
  const claimPassageQualityReason = researchContentRejectionReason(item.claimPassage);
  const contentQualityReasons = [...new Set([
    ...(claimPassageQualityReason ? [claimPassageQualityReason] : []),
    ...(originalSources.length > 0 && sources.length === 0 ? excludedSourceQualityReasons : []),
  ])];
  const contentQualityExcluded = contentQualityReasons.length > 0;
  const sourceUrl = contentQualityExcluded ? null : item.sourceUrl;
  const hasSource = Boolean(item.sourceUrl) || originalSources.length > 0;
  reasons.push(...contentQualityReasons.map((reason) => `Source passage excluded by content-quality check: ${reason}.`));
  const sourceEligibility = evaluateEvidenceSourceEligibility({
    id: item.id,
    sources,
    sourceUrl,
    classification: item.classification,
    sourceSupportConfidence: item.sourceSupportConfidence,
    coverageStatus: item.coverageStatus,
  });
  reasons.push(...sourceEligibility.reasons);
  const researchEligibility = evaluateResearchEvidenceEligibility({
    id: item.id,
    sources,
    sourceUrl,
    sourceRelevance: item.sourceRelevance,
    sourceSupportConfidence: item.sourceSupportConfidence,
    classification: item.classification,
    coverageStatus: item.coverageStatus,
    conflictSummary: item.conflictSummary,
    claimMappings: item.claimMappings,
    semanticValidationStatus: item.semanticValidationStatus,
  }, { includeCheckTrace: true });
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
    explicitZero: item.explicitZero === true || (rawValue === 0 && Boolean(sourceUrl)),
  });
  reasons.push(...semantic.quarantineReasons);
  const semanticCheck = {
    id: "semantic-validation",
    passed: semantic.modelEligible === true,
    reason: semantic.modelEligible === true
      ? "Evidence passed semantic validation."
      : semantic.quarantineReasons.join("; ") || "Semantic validation rejected this evidence item.",
  };
  const policyChecks = researchEligibility.checkTrace?.checks ?? [];
  const contentQualityChecks = contentQualityReasons.map((reason) => ({
    id: "content-quality",
    passed: false,
    reason: `Source passage excluded by content-quality check: ${reason}.`,
  }));
  const eligibilityChecks = [
    ...contentQualityChecks,
    ...policyChecks,
    semanticCheck,
  ];
  const earlierFailure = contentQualityChecks[0] ?? policyChecks.find((check) => check.passed === false) ?? null;
  let firstFailure = earlierFailure
    ? { id: earlierFailure.id, reason: earlierFailure.reason }
    : null;
  if (!firstFailure && !semanticCheck.passed) {
    firstFailure = { id: semanticCheck.id, reason: semanticCheck.reason };
  }
  if (item.coverageStatus === "conflicting" || item.conflictSummary) reasons.push("Conflicting source coverage requires reviewer resolution.");
  if (item.classification === "Model Inference" || item.classification === "User Assumption") {
    reasons.push(`${item.classification} is not source-backed and cannot activate custom economics.`);
  }
  const eligible = reasons.length === 0;
  const eligibleForModel = eligible && semantic.modelEligible;
  if (eligibleForModel === false && !eligibilityChecks.some((check) => check.passed === false)) {
    const finalEligibilityCheck = {
      id: "final-eligibility",
      passed: false,
      reason: "Rejected without a recorded check",
    };
    eligibilityChecks.push(finalEligibilityCheck);
    firstFailure = { id: finalEligibilityCheck.id, reason: finalEligibilityCheck.reason };
  }
  const eligibilityTrace = {
    ...researchEligibility.checkTrace,
    checks: eligibilityChecks,
    firstFailure,
  };
  return {
    ...item,
    ...(Array.isArray(item.sources) ? { sources } : {}),
    ...(contentQualityExcluded ? { sourceUrl: null, sourceUrls: [] } : {}),
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
    eligibleForModel,
    acceptedForModel: false,
    researchState: eligible ? "proposed" : hasSource ? "quarantined" : "retrieved-lead",
    quarantineReasons: [...new Set(reasons)],
    sourceValidation: {
      policyVersion: SOURCE_VALIDATION_POLICY_VERSION,
      state: contentQualityExcluded ? "rejected" : researchEligibility.state,
      rejectionCodes: contentQualityExcluded
        ? [...new Set(["content-quality-excluded", ...researchEligibility.rejectionCodes])]
        : researchEligibility.rejectionCodes,
      claimMappings: contentQualityExcluded ? [] : item.claimMappings ?? [],
      eligibilityTrace,
    },
  };
}

export function containResearchResult(result) {
  if (result.financialMapping?.reason === "financial-mapping-not-run") {
    return markFinancialMappingNotRun(result);
  }
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

function markFinancialMappingNotRun(result) {
  return {
    ...result,
    financialMapping: { state: "not-assessed", reason: "financial-mapping-not-run" },
    evidence: (result.evidence ?? []).map((item) => ({
      ...item, classification: "Not assessed", coverageStatus: "not-assessed",
      assessmentState: "not-assessed", assessmentReason: "financial-mapping-not-run",
      classificationReason: "financial-mapping-not-run",
      eligibleForModel: false, acceptedForModel: false, researchState: "not-assessed",
      numericValue: null, normalizedValue: null, qualitativeValue: null,
      sourceUrl: null, sourceUrls: [], sources: [], claimMappings: [],
      quarantineReasons: ["financial-mapping-not-run"],
      sourceValidation: {
        ...item.sourceValidation, state: "not-assessed", rejectionCodes: ["financial-mapping-not-run"],
        eligibilityTrace: { checks: [{ id: "financial-mapping", passed: false, reason: "financial-mapping-not-run" }] },
      },
    })),
    eligibleEvidence: [], proposedInputs: [], acceptedInputs: [], acceptedModelInputs: [],
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
        capacityMW: normalizeReportedCapacityMW(project.knownData?.capacity),
        capacityProvenance: normalizeReportedCapacityMW(project.knownData?.capacity) !== null
          ? "directory-reported"
          : "unknown",
      };
  const evidenceById = new Map(
    categoryResults.flatMap((result) =>
      Array.isArray(result?.research?.evidence)
        ? result.research.evidence.map((item) => [item.id, item])
        : []),
  );
  return {
    projectIdentity: project.projectIdentity,
    projectSummary: {
      name: stringOrFallback(projectSummary.name, project.name, 160),
      location: stringOrFallback(projectSummary.location, project.location, 160),
      description: stringOrFallback(
        projectSummary.description,
        "Research returned partial or invalid category data. Valid findings are retained and unsupported items remain Missing Evidence.",
        8_000,
      ),
      capacityMW: normalizeReportedCapacityMW(project.knownData?.capacity)
        ?? (["unknown", "standardized-default"].includes(projectSummary.capacityProvenance)
          ? null : normalizeReportedCapacityMW(projectSummary.capacityMW)),
      capacityProvenance: normalizeReportedCapacityMW(project.knownData?.capacity) !== null
        ? "directory-reported"
        : !["unknown", "standardized-default"].includes(projectSummary.capacityProvenance)
          && normalizeReportedCapacityMW(projectSummary.capacityMW) !== null
          ? "ai-reported"
          : "unknown",
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
  claimTraceContext = null,
) {
  const scopedEvidenceIds = [...new Set(expectedEvidenceIds.filter((id) => RESEARCH_EVIDENCE_IDS.includes(id)))];
  if (!isRecord(body) || !isRecord(body.projectSummary) || (!Array.isArray(body.evidence) && !isRecord(body.evidence))) {
    throw new Error("Research response must include projectSummary and evidence.");
  }

  const summary = body.projectSummary;
  // A second parse must not promote an earlier synthetic fallback into a
  // provider claim. Only a numeric provider value can become ai-reported.
  const reportedCapacityMW = ["unknown", "standardized-default"].includes(summary.capacityProvenance)
    ? null : normalizeReportedCapacityMW(summary.capacityMW);
  const summaryFields = {
    name: nonEmptyString(summary.name, "projectSummary.name", 160),
    location: nonEmptyString(summary.location, "projectSummary.location", 160),
    description: nonEmptyString(summary.description, "projectSummary.description", 8_000),
    capacityMW: normalizeReportedCapacityMW(knownData?.capacity) ?? reportedCapacityMW,
    capacityProvenance: normalizeReportedCapacityMW(knownData?.capacity) !== null
      ? "directory-reported"
      : reportedCapacityMW === null ? "unknown" : "ai-reported",
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
    const extractedClaimScope = extractClaimScopeFromPassage({
      claimPassage: item.claimPassage,
      claimValue: item.value,
      numericValue: item.numericValue,
      unit: item.unit,
    });
    const hasReportedClaimTimePeriod = [
      item?.claimTimePeriod,
      validatedSources[0]?.timePeriod,
      extractedClaimScope?.claimTimePeriod,
    ].some(scopeValueIsKnown);
    const publicationTimePeriod = !hasReportedClaimTimePeriod
      && VALID_EXTRACTED_PUBLICATION_BASES.has(validatedSources[0]?.accessOutcome?.publicationDateBasis)
      ? normalizePublicDate(validatedSources[0]?.accessOutcome?.publicationDate)
      : null;
    const supportingSources = validatedSources.map((metadata) => {
      const jurisdictionExcluded = isJurisdictionallyExcludedSource(metadata, summary);
      const resolverIdentity = { ...summary, knownData };
      const reportIdentityDecision = (source, decision, evaluationPass = "claim-source-project-specificity") => {
        claimTraceContext?.claimTrace?.recordIdentityEvaluation?.({
          runId: claimTraceContext.runId,
          projectId: claimTraceContext.projectId,
          categoryId: claimTraceContext.categoryId,
          attemptType: claimTraceContext.attemptType,
          providerResponseId: claimTraceContext.providerResponseId,
          claimId: id,
          source,
          requestedProject: claimTraceContext.requestedProject ?? {},
          evaluationPass,
          decision,
        });
      };
      if (jurisdictionExcluded) {
        reportIdentityDecision(metadata, {
          state: "not-evaluated",
          reasonCode: "jurisdiction-filtered-before-project-identity",
          resolver: null,
          trace: null,
        });
      }
      const exactProject = !jurisdictionExcluded
        && isExactProjectSource(metadata, resolverIdentity, item.sourceRelevance,
          (decision) => reportIdentityDecision(metadata, decision));
      const claimScope = mergeClaimScopeMetadata(item, metadata, extractedClaimScope);
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
        ...choosePublicationMetadata(metadata?.accessOutcome, metadata),
        accessedAt: normalizePublicDate(metadata?.accessOutcome?.retrievalTime)
          ?? normalizePublicDate(metadata?.accessedAt),
        accessStatus: ["open", "paywall", "registration"].includes(metadata?.accessStatus) ? metadata.accessStatus : "not provided",
        excerpt: stringOrFallback(
          metadata?.accessOutcome?.passage ?? metadata?.excerpt,
          "No excerpt returned.",
          1_000,
        ),
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
         ...claimScope,
      timePeriod: claimScope.claimTimePeriod ?? publicationTimePeriod,
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
      onIdentityDecision: (decision) => {
        const source = decision?.source;
        claimTraceContext?.claimTrace?.recordIdentityEvaluation?.({
          runId: claimTraceContext.runId,
          projectId: claimTraceContext.projectId,
          categoryId: claimTraceContext.categoryId,
          attemptType: claimTraceContext.attemptType,
          providerResponseId: claimTraceContext.providerResponseId,
          claimId: id,
          source,
          requestedProject: claimTraceContext.requestedProject ?? {},
          evaluationPass: "claim-passage-mapping",
          decision,
        });
      },
      onMappingDecision: (decision) => {
        claimTraceContext?.claimTrace?.recordMappingEvaluation?.({
          runId: claimTraceContext.runId,
          projectId: claimTraceContext.projectId,
          categoryId: claimTraceContext.categoryId,
          attemptType: claimTraceContext.attemptType,
          providerResponseId: claimTraceContext.providerResponseId,
          claimId: id,
          requestedProject: claimTraceContext.requestedProject ?? {},
          claimValue: item.normalizedValue ?? item.numericValue ?? item.value,
          claimUnit: item.normalizedUnit ?? item.unit,
          claimStatus: item.status,
          ...decision,
        });
      },
    }).map((mapping) => ({
      ...mapping,
      phaseIdentity: supportingSources.find((source) => source.canonicalUrl === mapping.sourceId)?.phaseIdentity ?? null,
    }));
    const claimSupportedSources = supportingSources.filter((source) =>
      claimMappings.some((mapping) =>
        mapping.sourceId === source.canonicalUrl && mapping.supportStatus === "supported"));
    const supportedByRetrievedSource = supportingSources.length > 0;
    const claimSupported = claimSupportedSources.length > 0;
    const primaryClaimScope = supportingSources[0] ?? {
      facilityScope: item.facilityScope ?? "unknown",
      phaseScope: item.phaseScope ?? "unknown",
      claimTimePeriod: item.claimTimePeriod ?? null,
      phaseIdentity: item.phaseIdentity ?? null,
    };
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
      claimPassage: typeof item.claimPassage === "string" ? item.claimPassage : null,
      facilityScope: primaryClaimScope.facilityScope,
      phaseScope: primaryClaimScope.phaseScope,
      claimTimePeriod: primaryClaimScope.claimTimePeriod,
      phaseIdentity: primaryClaimScope.phaseIdentity,
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
      record.sourcePublishedAtBasis = metadata.publishedAtBasis;
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
      discoveryProvider: coverage?.discoveryProvider ?? null,
      discoveryModel: coverage?.discoveryModel ?? null,
      discoveryStatus: coverage?.discoveryStatus ?? null,
      discoveryQueries: Array.isArray(coverage?.discoveryQueries) ? coverage.discoveryQueries.slice(0, 24) : [],
      discoveryCandidateCount: Number.isInteger(coverage?.discoveryCandidateCount) ? coverage.discoveryCandidateCount : 0,
      discoveryCandidates: Array.isArray(coverage?.discoveryCandidates)
        ? coverage.discoveryCandidates.slice(0, MAX_RESEARCH_DISCOVERY_AUDIT_CANDIDATES).map((candidate, index) => ({
          discoveryRank: Number.isInteger(candidate.discoveryRank) ? candidate.discoveryRank : index + 1,
          acquisitionRank: Number.isInteger(candidate.acquisitionRank) ? candidate.acquisitionRank : null,
          acquisitionPriority: Number.isFinite(candidate.acquisitionPriority) ? candidate.acquisitionPriority : null,
          acquisitionReasons: Array.isArray(candidate.acquisitionReasons)
            ? candidate.acquisitionReasons.slice(0, 12)
            : [],
          candidateLimitSelected: candidate.candidateLimitSelected === true,
          selectedForOpen: candidate.selectedForOpen === true,
          selectionReason: candidate.selectionReason ?? null,
          physicalOpenAdmission: candidate.physicalOpenAdmission ?? null,
          candidateUrl: safePublicDiagnosticUrl(candidate.discoveryCandidateUrl),
          url: safePublicSourceUrl(candidate.url),
          originalUrl: safePublicSourceUrl(candidate.originalUrl),
          resolvedUrl: safePublicSourceUrl(candidate.resolvedUrl),
          originatingQuery: sanitizeTransportText(candidate.discoveryOriginatingQuery, 500) || null,
          queryAttributionStatus: candidate.discoveryQueryAttributionStatus === "provider-attributed"
            ? "provider-attributed"
            : "unavailable",
          candidateRankWithinQuery: Number.isInteger(candidate.discoveryCandidateRankWithinQuery)
            ? candidate.discoveryCandidateRankWithinQuery
            : null,
          queryRankAvailability: candidate.discoveryQueryRankAvailability === "provider-reported"
            ? "provider-reported"
            : "unavailable",
          deduplicationLineage: isRecord(candidate.discoveryDeduplicationLineage)
            ? {
              duplicateAnnotationRanks: Array.isArray(candidate.discoveryDeduplicationLineage.duplicateAnnotationRanks)
                ? candidate.discoveryDeduplicationLineage.duplicateAnnotationRanks.slice(0, 80)
                  .filter(Number.isInteger)
                : [],
              deduplicatedAcrossQueries: typeof candidate.discoveryDeduplicationLineage.deduplicatedAcrossQueries === "boolean"
                ? candidate.discoveryDeduplicationLineage.deduplicatedAcrossQueries
                : null,
            }
            : { duplicateAnnotationRanks: [], deduplicatedAcrossQueries: null },
          retainedPassageOutcome: isRecord(candidate.retainedPassageOutcome)
            ? {
              retained: candidate.retainedPassageOutcome.retained === true,
              usability: sanitizeTransportText(candidate.retainedPassageOutcome.usability, 80),
              reason: sanitizeTransportText(candidate.retainedPassageOutcome.reason, 160) || null,
            }
            : null,
          title: sanitizeTransportText(candidate.title, 300),
          categoryIds: Array.isArray(candidate.categoryIds) ? candidate.categoryIds.slice(0, 8) : [],
          accessState: candidate.accessOutcome?.state ?? null,
          accessReason: candidate.accessOutcome?.reason ?? null,
          physicalOpenIndex: Number.isInteger(candidate.accessOutcome?.physicalOpenIndex)
            ? candidate.accessOutcome.physicalOpenIndex
            : null,
        }))
        : [],
      retrievalOnlyStop: coverage?.retrievalOnlyStop ?? null,
      fallbackProvider: coverage?.fallbackProvider ?? null,
      fallbackReason: coverage?.fallbackReason ?? null,
      fallbackRequestCount: Number.isInteger(coverage?.fallbackRequestCount) ? coverage.fallbackRequestCount : 0,
      providerRequestCount: Number.isInteger(coverage?.providerRequestCount) ? coverage.providerRequestCount : 0,
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
      phaseTiming: coverage?.phaseTiming && typeof coverage.phaseTiming === "object"
        ? coverage.phaseTiming
        : null,
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
  return normalizePublicationDate(value);
}

const VALID_EXTRACTED_PUBLICATION_BASES = new Set([
  "semantic-metadata",
  "json-ld-date-published",
  "visible-publication-line",
]);

function choosePublicationMetadata(accessOutcome = {}, source = {}) {
  if (accessOutcome?.publicationDateStatus === "ambiguous") {
    return {
      date: null,
      publishedAt: null,
      dateBasis: "ambiguous-publication-metadata",
      publishedAtBasis: "ambiguous-publication-metadata",
      publicationDateStatus: "ambiguous",
    };
  }

  const extractedDate = normalizePublicDate(accessOutcome?.publicationDate);
  if (extractedDate && VALID_EXTRACTED_PUBLICATION_BASES.has(accessOutcome?.publicationDateBasis)) {
    return {
      date: extractedDate,
      publishedAt: extractedDate,
      dateBasis: accessOutcome.publicationDateBasis,
      publishedAtBasis: accessOutcome.publicationDateBasis,
      publicationDateStatus: "resolved",
    };
  }
  if (source?.providerPublicationDateStatus === "ambiguous" || source?.publicationDateStatus === "ambiguous") {
    return {
      date: null,
      publishedAt: null,
      dateBasis: "ambiguous-publication-metadata",
      publishedAtBasis: "ambiguous-publication-metadata",
      publicationDateStatus: "ambiguous",
    };
  }

  const providerDates = [...new Set([
    source?.date,
    source?.publishedAt,
    source?.published_date,
    source?.sourcePublishedAt,
  ].map(normalizePublicDate).filter(Boolean))];
  if (providerDates.length > 1) {
    return {
      date: null,
      publishedAt: null,
      dateBasis: "ambiguous-publication-metadata",
      publishedAtBasis: "ambiguous-publication-metadata",
      publicationDateStatus: "ambiguous",
    };
  }
  if (providerDates.length === 1) {
    return {
      date: providerDates[0],
      publishedAt: providerDates[0],
      dateBasis: "provider-source-metadata",
      publishedAtBasis: "provider-source-metadata",
      publicationDateStatus: "resolved",
    };
  }
  return {
    date: null,
    publishedAt: null,
    dateBasis: "not-reported",
    publishedAtBasis: "not-reported",
    publicationDateStatus: "absent",
  };
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

function classifySourceForProject(url, title = "", project = {}) {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const companyDomains = [
    ...(Array.isArray(project?.knownData?.companyDomains) ? project.knownData.companyDomains : []),
    ...(Array.isArray(project?.companyDomains) ? project.companyDomains : []),
  ].map((value) => String(value).toLowerCase().replace(/^www\./, ""));
  if (companyDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return "primary-company";
  }
  return classifySource(url, title);
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
  const categoryId = category.id ?? category.categoryId;
  const genericQuery = categoryId === "project-identity"
    ? `"${name}" "${location}" ${attempt === "follow-up" ? "alternate name owner operator filing" : "project operator facility identity permit record"}`
    : buildVariableQueries({ name, location, knownData }, evidenceId ?? category.evidenceIds[0])[attempt === "follow-up" ? 1 : 0];
  const project = { name, location, knownData };
  const identity = buildProjectIdentityContext(project);
  const state = identity.state;
  const routing = categoryAuthorityTargets(project, categoryId);
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
  switch (categoryId) {
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
  const identityContext = buildProjectIdentityContext({ name, location, knownData });
  if (activeCategory?.categoryId) {
    const scopeInstruction = activeCategory.includeRelatedFacilityIdentityContext === true
      ? "Keep claims scoped to the named facility; do not generalize facility facts to its campus or other buildings."
      : "Distinguish exact facility evidence from campus, regional, and similarly named project context.";
    const knownDataPrompt = knownData
      ? ` Directory context (not SafeLoc evidence): ${JSON.stringify(knownData)}.`
      : "";
    return `Analyze the exact data-center project ${name} in ${location}. This is the observed ${activeCategory.label} category attempt. Execute this exact query: ${activeCategory.query}. Return only these category-scoped evidence keys: ${activeCategory.evidenceIds?.join(", ") || "(none; return an empty evidence object)"}. ${scopeInstruction} Use only physically retrieved source passages supplied below for source-backed claims; never treat titles, URLs, snippets, or search plans as evidence. Copy each claimPassage exactly from a supplied passage. Preserve identity, dates, units, status, scope, and material qualifiers. Use Missing Evidence where a supplied passage does not support a claim. ${JSON.stringify(identityContext)}${knownDataPrompt}${activeCategory.repair ? " This is one bounded repair attempt; use compact descriptions and explicit Missing Evidence values for unresolved items." : ""}`;
  }
  const knownDataPrompt = knownData
    ? `\n\nThe following facts are already confirmed from the Compute Atlas public database: ${JSON.stringify(knownData)}. Use them as directory discovery context for project identity and summary fields, not as SafeLoc evidence or verified project economics. Focus your research on the 16 evidence variables, not on rediscovering basic project facts.`
    : "";
  const queryPlan = buildVariableQueryPlan({ name, location, knownData, focusIds });
  const categoryPlan = buildResearchCategoryPlan({ name, location, knownData }).categories
    .map((category) => `- ${category.label}: primary ${category.requestedPrimaryQuery}; optional gap follow-up ${category.optionalFollowUpQuery}`)
    .join("\n");
  const activeCategoryPrompt = activeCategory
    ? `\n\nThis is the observed ${activeCategory.label} category attempt. Execute this exact query now and do not substitute a plan for execution: ${activeCategory.query}. Return only the category-scoped evidence keys ${activeCategory.evidenceIds?.join(", ") || "(none; return an empty evidence object)"}. The server validates and merges completed categories into the full 16-item contract. Do not emit unrelated evidence keys.${activeCategory.repair ? " This is one bounded repair attempt. Use compact descriptions and explicit Missing Evidence values for unresolved category items; never invent values." : ""}`
    : "";
  return `Research and analyze this exact data-center project using the built-in web-search tool: ${name}. Location: ${location}. Resolve identity first using the requested name, aliases, operator, city/county/state, and exact facility or campus references before making any exact-project claim. Treat a campus, metro, region, corridor, or county record as context unless the passage identifies the exact facility; surface campus-versus-region ambiguity instead of silently merging records. Identity context: ${JSON.stringify(identityContext)}. Search current project, operator, regulatory, utility, grid, water, permitting, community, environmental, capacity, customer, and infrastructure records. Prefer direct government, regulator, utility, land, permit, environmental, and filed-company records over summaries. Verify project, operator, and location identity so similarly named facilities are not mixed. Preserve exact URLs returned by web search, distinguish facility-level findings from regional context, and return the exact JSON contract from the system instruction. When no searched source independently confirms a claim, use Management Assertion or lower and state that verification is required. Do not replace genuine public information with Missing Evidence merely because one query fails. The server-governed run schedules these eight categories independently: project identity, grid, electricity, water, permitting/community, construction/capital, tenant/counterparty, and climate/operational hazard. Record only queries actually executed; each category may have at most one gap-driven follow-up. Try distinct primary-record and corroboration angles where useful, with no more than two targeted queries per variable and no more than 32 targeted queries overall. There is no minimum finding quota; exhausted searches must remain unresolved. The category schedule below is a requested plan, not proof of execution.${activeCategoryPrompt}

Bounded variable query plan:
${queryPlan}

Governed category schedule:
${categoryPlan}${focusIds?.length ? ` This is a focused refresh for these unresolved variables: ${focusIds.join(", ")}. Prioritize their query angles, then still return all 16 records. Preserve unrelated existing records unless new searched evidence directly contradicts them.` : ""}${currentEvidence?.length ? `\n\nExisting evidence context:\n${JSON.stringify(currentEvidence)}` : ""}${knownDataPrompt}`;
}

function buildCategoryAnalysisPrompt(project, activeCategory) {
  const identityContext = buildProjectIdentityContext(project);
  const evidenceIds = (activeCategory.evidenceIds ?? []).filter((id) => RESEARCH_EVIDENCE_IDS.includes(id));
  const scopeInstruction = activeCategory.includeRelatedFacilityIdentityContext === true
    ? "A passage about a related building does not establish the whole campus; keep claims limited to the specifically named facility."
    : "Distinguish the named facility from its campus, other buildings, similarly named projects, and regional context.";
  const identityInstruction = activeCategory.categoryId === "project-identity"
    ? "Assess exact identity only. Do not create or alter modeled evidence."
    : `Assess only these evidence identifiers: ${evidenceIds.join(", ") || "(none)"}.`;
  return [
    `Requested project: ${project.name}. Location: ${project.location}.`,
    `Identity context: ${JSON.stringify(identityContext)}.`,
    `Category: ${activeCategory.label} (${activeCategory.categoryId}). ${identityInstruction}`,
    scopeInstruction,
    "Scope-unconfirmed passages name the requested operator/project and location, but SafeLoc has not confirmed which facility, campus or phase they describe. Report their facility/phase labels exactly as written; do not assert requested-project identity unless the passage says so.",
    "The response schema requires projectSummary and only the supplied category evidence keys. Use Missing Evidence when the retrieved packet does not support a value.",
  ].join("\n");
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
    const providerDates = [...new Set([
      source.published_date,
      source.date,
      source.publishedAt,
      source.sourcePublishedAt,
    ].map(normalizePublicDate).filter(Boolean))];
    const providerDateAmbiguous = providerDates.length > 1;
    return {
      ...source,
      url,
      sourceChannel: typeof source.sourceChannel === "string" ? source.sourceChannel : source.origin ?? "provider",
      title,
      date: providerDateAmbiguous ? null : providerDates[0] ?? null,
      publishedAt: providerDateAmbiguous ? null : providerDates[0] ?? null,
      dateBasis: providerDateAmbiguous ? "ambiguous-publication-metadata"
        : providerDates.length ? "provider-source-metadata" : "not-reported",
      publishedAtBasis: providerDateAmbiguous ? "ambiguous-publication-metadata"
        : providerDates.length ? "provider-source-metadata" : "not-reported",
      publicationDateStatus: providerDateAmbiguous ? "ambiguous" : providerDates.length ? "resolved" : "absent",
      providerPublicationDateStatus: providerDateAmbiguous ? "ambiguous" : providerDates.length ? "resolved" : "absent",
      excerpt: typeof source.snippet === "string" ? source.snippet.trim() : typeof source.excerpt === "string" ? source.excerpt.trim() : "",
      accessStatus: ["open", "paywall", "registration"].includes(source.access_status) ? source.access_status : "not provided",
      contentType: typeof source.content_type === "string" ? source.content_type : typeof source.contentType === "string" ? source.contentType : null,
      sourceClass: url ? classifySourceForProject(url, title, project) : "secondary-reporting",
      searchDomain,
      ...(safePublicSourceUrl(source.canonicalUrl)
        ? {
            canonicalUrl: canonicalizeSourceUrl(source.canonicalUrl),
            canonicalIdentityExplicit: true,
          }
        : {}),
      ...(typeof source.exactProject === "boolean" ? { exactProject: source.exactProject } : {}),
      ...(Array.isArray(source.categoryIds)
        ? { categoryIds: [...new Set(source.categoryIds.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].slice(0, 12) }
        : {}),
      ...(Array.isArray(source.discoveryCategoryIds)
        ? { discoveryCategoryIds: source.discoveryCategoryIds.slice(0, 12) }
        : {}),
      ...(Array.isArray(source.unknownCategoryLabels)
        ? { unknownCategoryLabels: source.unknownCategoryLabels.slice(0, 12) }
        : {}),
      ...(source.categoryRoutingUnknown === true ? { categoryRoutingUnknown: true } : {}),
      ...(typeof source.claimPassage === "string" ? { claimPassage: source.claimPassage } : {}),
      ...(Array.isArray(source.claimSupport) ? { claimSupport: source.claimSupport } : {}),
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
  const result = ledger.retained.map((source) => {
    const canonical = canonicalizeSourceUrl(source.canonicalUrl ?? source.originalUrl ?? source.url);
    const matchedCandidate = candidates.find((candidate) =>
      canonicalizeSourceUrl(candidate.canonicalUrl ?? candidate.resolvedUrl ?? candidate.url) === canonical);
    return {
      ...source,
      date: matchedCandidate?.date ?? source.date ?? null,
      publishedAt: matchedCandidate?.publishedAt ?? source.publishedAt ?? source.date ?? null,
      dateBasis: matchedCandidate?.dateBasis ?? source.dateBasis ?? null,
      publishedAtBasis: matchedCandidate?.publishedAtBasis ?? source.publishedAtBasis ?? source.dateBasis ?? null,
      publicationDateStatus: matchedCandidate?.publicationDateStatus ?? source.publicationDateStatus ?? null,
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
      ...(Array.isArray(source.categoryIds) ? { categoryIds: source.categoryIds.slice(0, 12) } : {}),
      ...(Array.isArray(source.discoveryCategoryIds) ? { discoveryCategoryIds: source.discoveryCategoryIds.slice(0, 12) } : {}),
      ...(Array.isArray(source.unknownCategoryLabels) ? { unknownCategoryLabels: source.unknownCategoryLabels.slice(0, 12) } : {}),
      ...(source.categoryRoutingUnknown === true ? { categoryRoutingUnknown: true } : {}),
      relevanceNote: source.relevanceNote ?? null,
    };
  });
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

function buildGroundedSourceContext(sources = []) {
  return sources
    .slice(0, RESEARCH_RUN_BUDGET.maxTotalCandidates)
    .map((source) => ({
      sourceId: source.occurrenceId ?? source.sourceId ?? source.canonicalUrl ?? source.url ?? null,
      canonicalUrl: source.canonicalUrl
        ?? canonicalizeSourceUrl(source.resolvedUrl ?? source.url)
        ?? null,
      sourceUrl: source.originalUrl ?? source.url ?? null,
      title: source.title ?? null,
      publisher: source.publisher ?? null,
      publicationDate: source.publicationDate ?? source.publishedAt ?? source.published_date ?? source.date ?? null,
      reportingDate: source.reportingDate ?? source.reportedAt ?? null,
      sourceIdentity: {
        occurrenceId: source.occurrenceId ?? null,
        sourceChannel: source.sourceChannel ?? null,
        origin: source.origin ?? null,
      },
      categoryIds: Array.isArray(source.categoryIds) ? source.categoryIds.slice(0, 12) : [],
      identityScope: source.identityScope ?? "scope-unconfirmed",
      referringQueries: Array.isArray(source.referringQueries) ? source.referringQueries.slice(0, 12) : [],
      accessReceipt: {
        state: source.accessOutcome?.state ?? "unknown",
        reason: source.accessOutcome?.reason ?? null,
        physicalOpenIndex: Number.isInteger(source.accessOutcome?.physicalOpenIndex)
          ? source.accessOutcome.physicalOpenIndex
          : null,
        retrievedAt: source.accessOutcome?.retrievalTime ?? source.retrievedAt ?? source.retrievalTime ?? null,
        originalUrl: source.accessOutcome?.originalUrl ?? source.originalUrl ?? null,
        resolvedUrl: source.accessOutcome?.resolvedUrl ?? source.resolvedUrl ?? null,
        canonicalUrl: source.accessOutcome?.canonicalUrl ?? source.canonicalUrl ?? null,
        reused: source.documentAccessReused === true || source.accessOutcome?.reused === true,
        extractionMethod: source.accessOutcome?.extractionMethod ?? source.extractionMethod ?? null,
        contentHash: source.accessOutcome?.contentHash ?? source.contentHash ?? null,
        pageOrSection: source.accessOutcome?.pageOrSection ?? source.accessOutcome?.sectionOrPage ?? null,
      },
      structuredFields: (Array.isArray(source.analysisStructuredFields)
        ? source.analysisStructuredFields
        : Array.isArray(source.accessOutcome?.structuredFields) ? source.accessOutcome.structuredFields : [])
        .slice(0, 32)
        .map((field) => ({
          label: sanitizeTransportText(field?.label, 120),
          value: sanitizeTransportText(field?.value, 400),
        }))
        .filter((field) => field.label && field.value),
      passage: source.analysisPassage ?? source.accessOutcome.passage,
    }))
    .filter((source) => source.passage);
}

function hasUsableCategoryPacketText(packet) {
  return Array.isArray(packet)
    && packet.some((source) => typeof source?.passage === "string" && source.passage.trim().length > 0);
}

function configuredCategoryInputTokenCap() {
  const configured = Number.parseInt(process.env.RESEARCH_CATEGORY_INPUT_TOKEN_CAP ?? "", 10);
  return Number.isInteger(configured) && configured >= 1
    ? Math.min(configured, 100_000)
    : DEFAULT_RESEARCH_CATEGORY_INPUT_TOKEN_CAP;
}

function configuredOpenAiTokensPerMinute() {
  return resolveResearchModelConfig({
    OPENAI_RESEARCH_MODEL: RESEARCH_PROJECT_MODEL,
    OPENAI_TPM_LIMIT: process.env.OPENAI_TPM_LIMIT,
  }).tokensPerMinute;
}

function estimateProviderInputTokens(requestBody) {
  // Counting the serialized request at three bytes per token is intentionally
  // conservative and includes message, schema, and request-envelope overhead.
  return Math.ceil(Buffer.byteLength(requestBody) / 3);
}

function fitCategoryAnalysisInput(sources, buildRequestBody, category, project) {
  const inputTokenCap = configuredCategoryInputTokenCap();
  const baselineBody = buildRequestBody("");
  const baselineEstimate = estimateProviderInputTokens(baselineBody);
  if (baselineEstimate > inputTokenCap) {
    const error = new Error("The configured category input cap is smaller than the fixed prompt and response schema.");
    error.name = "ResearchBudgetExceededError";
    error.researchErrorType = "category-input-budget";
    error.categoryInputTokenEstimate = baselineEstimate;
    error.categoryInputTokenCap = inputTokenCap;
    throw error;
  }
  const accepted = [];
  let requestBody = baselineBody;
  let estimate = baselineEstimate;
  let omittedPassageCount = 0;
  let windowedPassageCount = 0;
  const omissionReasons = new Set();
  const prepared = sources.map((source) => ({
    ...source,
    analysisPassage: source.analysisPassage ?? categoryPassageWindow(source, category.categoryId, project),
    analysisStructuredFields: source.analysisStructuredFields
      ?? structuredFieldsForCategory(source, category.categoryId, project),
  }));
  for (const source of prepared) {
    if (!source.analysisPassage) {
      omittedPassageCount += 1;
      omissionReasons.add("no-complete-context-window");
      continue;
    }
    if (source.analysisPassage !== source.accessOutcome?.passage) {
      windowedPassageCount += 1;
      omissionReasons.add("passage-window-selection");
    }
    const fullCandidate = [...accepted, source];
    const fullBody = buildRequestBody(`\n\nThe following public document passages were physically retrieved by SafeLoc. Use only these passages for source-backed claims. Do not browse, call a search tool, or treat a URL, snippet, title, or generated summary as evidence. Every claimPassage must be copied exactly from one supplied passage.\n${JSON.stringify(buildGroundedSourceContext(fullCandidate))}`);
    if (estimateProviderInputTokens(fullBody) <= inputTokenCap) {
      accepted.push(source);
      requestBody = fullBody;
      estimate = estimateProviderInputTokens(fullBody);
      continue;
    }
    let low = 0;
    let high = source.analysisPassage.length;
    let best = null;
    let bestBody = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const compact = {
        ...source,
        analysisPassage: categoryPassageWindow(source, category.categoryId, project, middle),
      };
      const candidate = [...accepted, compact];
      const candidateBody = buildRequestBody(`\n\nThe following public document passages were physically retrieved by SafeLoc. Use only these passages for source-backed claims. Do not browse, call a search tool, or treat a URL, snippet, title, or generated summary as evidence. Every claimPassage must be copied exactly from one supplied passage.\n${JSON.stringify(buildGroundedSourceContext(candidate))}`);
      if (estimateProviderInputTokens(candidateBody) <= inputTokenCap) {
        best = compact;
        bestBody = candidateBody;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best && best.analysisPassage) {
      accepted.push(best);
      requestBody = bestBody;
      estimate = estimateProviderInputTokens(bestBody);
      omissionReasons.add("input-cap");
    } else {
      omittedPassageCount += 1;
      omissionReasons.add("input-cap");
    }
  }
  if (accepted.length === 0) requestBody = baselineBody;
  return {
    sources: accepted,
    requestBody,
    inputTokenEstimate: estimate,
    inputTokenCap,
    omittedPassageCount,
    windowedPassageCount,
    omissionReasons: [...omissionReasons],
  };
}

function buildCategoryAnalysisRequestBody({
  project,
  activeCategory,
  groundedContext,
  scopedEvidenceIds,
  requestedOutputTokens,
}) {
  const identityOnly = activeCategory?.categoryId === "project-identity";
  const webSearchEnabled = activeCategory?.webSearchEnabled !== false;
  return JSON.stringify({
    model: RESEARCH_PROJECT_MODEL,
    ...(RESEARCH_MODEL_CONFIG.reasoningEffort
      ? { reasoning: { effort: RESEARCH_MODEL_CONFIG.reasoningEffort } } : {}),
    ...(webSearchEnabled ? { tools: [{ type: "web_search_preview" }] } : {}),
    input: [
      {
        role: "system",
        content: activeCategory?.categoryId
          ? `${RESEARCH_CATEGORY_SYSTEM_PROMPT}${identityOnly
            ? "\nEstablish or reject exact project name, location, and operator only."
            : ""}`
          : `${RESEARCH_PROJECT_SYSTEM_PROMPT}${WEB_SEARCH_SOURCE_BOUNDARY_PROMPT}`,
      },
      {
        role: "user",
        content: `${activeCategory?.categoryId
          ? buildCategoryAnalysisPrompt(project, activeCategory)
          : buildResearchProjectPrompt({ ...project, activeCategory })}${groundedContext}`,
      },
    ],
    max_output_tokens: requestedOutputTokens,
    ...(webSearchEnabled ? { max_tool_calls: activeCategory?.maxToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS } : {}),
    ...(webSearchEnabled ? { include: ["web_search_call.action.sources"] } : {}),
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
}

function safeReplayPublicUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === "vertexaisearch.cloud.google.com"
      || /\/(?:redirect|redirection|out|click|link|url)\/[^/]{16,}$/i.test(url.pathname)) {
      url.pathname = `/redirect/redacted-${createHash("sha256").update(url.pathname).digest("hex").slice(0, 16)}`;
      url.search = "";
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|secret|signature|^sig$|auth|credential|password|api.?key|session|jwt)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.href;
  } catch { return null; }
}

/**
 * Runs the production category route, identity admission, deduplication,
 * category window, token-fit and request-serialization functions without
 * queueing or issuing any provider call. The result deliberately contains
 * hashes and bounded metadata, never the serialized provider request.
 */
export function replayResearchCategoryPassageInput(project = {}, category = {}, sources = []) {
  if (!category?.categoryId) throw new TypeError("A categoryId is required for offline passage replay.");
  const metaText = (value, limit = 240) => sanitizeTransportText(value, limit);
  const fingerprint = (value) => {
    const text = typeof value === "string" ? value : "";
    return { sha256: text ? createHash("sha256").update(text).digest("hex") : null, length: text.length };
  };
  const safeIdentifier = (value, fallback, limit = 240) => {
    if (typeof value !== "string") return fallback;
    if (/^https?:\/\//i.test(value)) return safeReplayPublicUrl(value) ?? fallback;
    return metaText(value, limit) ?? fallback;
  };
  const candidates = sources
    .slice(0, RESEARCH_RUN_BUDGET.maxTotalCandidates)
    .filter(hasRetrievedPassage);
  const prepared = prepareCategoryAnalysisPassages(category, candidates, project);
  const scopedEvidenceIds = Array.isArray(category.evidenceIds)
    ? category.evidenceIds.filter((id) => RESEARCH_EVIDENCE_IDS.includes(id))
    : RESEARCH_EVIDENCE_IDS;
  const buildRequestBody = (groundedContext) => buildCategoryAnalysisRequestBody({
    project,
    activeCategory: category,
    groundedContext,
    scopedEvidenceIds,
    requestedOutputTokens: RESEARCH_CATEGORY_MAX_TOKENS,
  });
  const contextFor = (selected) => selected.length
    ? `\n\nThe following public document passages were physically retrieved by SafeLoc. Use only these passages for source-backed claims. Do not browse, call a search tool, or treat a URL, snippet, title, or generated summary as evidence. Every claimPassage must be copied exactly from one supplied passage.\n${JSON.stringify(buildGroundedSourceContext(selected))}`
    : "";
  const fitted = fitCategoryAnalysisInput(prepared.sources, buildRequestBody, category, project);
  const finalPacket = buildGroundedSourceContext(fitted.sources);
  const finalByKey = new Map(fitted.sources.map((source) => {
    const passage = source.accessOutcome?.passage ?? "";
    const key = `${canonicalizeSourceUrl(source.originalUrl ?? source.url ?? source.canonicalUrl) ?? ""}|${createHash("sha256").update(passage).digest("hex")}`;
    return [key, source];
  }));
  const preparedBySource = new Map(prepared.decisions.map((decision) => [decision.source, decision]));
  const decisions = candidates.map((source, index) => {
    const decision = preparedBySource.get(source);
    const passage = source.accessOutcome?.passage ?? "";
    const canonicalUrl = canonicalizeSourceUrl(source.originalUrl ?? source.url ?? source.canonicalUrl) ?? "";
    const key = `${canonicalUrl}|${createHash("sha256").update(passage).digest("hex")}`;
    const finalSource = finalByKey.get(key);
    const supplied = finalSource?.analysisPassage ?? "";
    let reasonCode = decision?.reasonCode ?? null;
    let decisionState = decision?.decision ?? "excluded-before-passage-selection";
    let explanation = decision?.explanation ?? null;
    let tokenFitState = "not-evaluated";
    if (decision?.included && decision.deduplicationState === "duplicate") {
      reasonCode = "duplicate-passage";
    } else if (decision?.included && decision.windowState === "excluded") {
      reasonCode = "category-window-exclusion";
    } else if (decision?.included && !finalSource) {
      reasonCode = "token-clipping";
      decisionState = "excluded-by-token-fit";
      explanation = "A category passage window existed but token fitting omitted the passage completely.";
      tokenFitState = "fully-removed";
    } else if (decision?.included && supplied && supplied !== decision.windowedPassage) {
      reasonCode = "token-clipping";
      decisionState = "included-after-token-clipping";
      explanation = "Token fitting shortened the selected category window.";
      tokenFitState = "partially-clipped";
    } else if (finalSource) {
      reasonCode = null;
      decisionState = "included-in-prepared-packet";
      tokenFitState = "included";
    }
    return {
      sourceId: safeIdentifier(source.sourceId ?? source.occurrenceId, `occ-${index + 1}`),
      occurrenceId: safeIdentifier(decision?.occurrenceId ?? source.occurrenceId ?? source.sourceId, `occ-${index + 1}`),
      sourceUrl: safeReplayPublicUrl(source.originalUrl ?? source.url ?? source.canonicalUrl),
      canonicalUrl: safeReplayPublicUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url),
      sourceFamily: metaText(source.sourceFamily ?? source.sourceClass ?? source.sourceChannel ?? "unavailable", 100),
      routeState: decision?.routeState ?? "not-evaluated",
      routeReason: decision?.routeReason ?? "not-evaluated",
      identityAdmission: decision?.identityAdmission ?? { state: "not-evaluated", verdict: null, reason: null },
      identityScope: decision?.identityScope ?? "scope-unconfirmed",
      included: Boolean(finalSource),
      decision: decisionState,
      reasonCode,
      explanation,
      duplicateRepresentative: decision?.duplicateRepresentative ?? null,
      deduplicationState: decision?.deduplicationState ?? "not-evaluated",
      windowState: decision?.windowState ?? "not-evaluated",
      tokenFitState,
      original: fingerprint(passage),
      postFilter: fingerprint(decision?.postFilterPassage ?? ""),
      deduplicated: fingerprint(decision?.deduplicatedPassage ?? ""),
      windowed: fingerprint(decision?.windowedPassage ?? ""),
      finalSupplied: fingerprint(supplied),
      partial: Boolean(supplied && supplied !== passage),
    };
  });
  const body = fitted.requestBody ?? buildRequestBody(contextFor(fitted.sources));
  return {
    state: "prepared-but-not-issued",
    runId: metaText(category.runCorrelationId, 160),
    projectId: metaText(project.projectId ?? project.id ?? project.name, 200),
    categoryId: metaText(category.categoryId, 80),
    attemptType: metaText(category.attempt ?? "primary", 40),
    promptVersion: `${RESEARCH_PROJECT_PROMPT_VERSION}:${category.categoryId}`,
    schemaVersion: category.categoryId === "project-identity" ? "identity-response-v1" : RESEARCH_POLICY_VERSION,
    providerCallStartedAt: null,
    inputSnapshot: {
      sourceIds: finalPacket.map((source, index) => ({
        sourceId: safeIdentifier(source.sourceId ?? source.occurrenceId, `packet-${index + 1}`),
        occurrenceId: metaText(source.sourceIdentity?.occurrenceId, 240),
        sourceUrl: safeReplayPublicUrl(source.sourceUrl ?? source.canonicalUrl),
        identityScope: source.identityScope ?? "scope-unconfirmed",
        passageSha256: fingerprint(source.passage).sha256,
        passageLength: typeof source.passage === "string" ? source.passage.length : 0,
        facilityScope: metaText(source.facilityScope, 120),
        phaseScope: metaText(source.phaseScope, 100),
        campusScope: metaText(source.campusScope, 120),
        buildingScope: metaText(source.buildingScope, 120),
      })),
      suppliedIdentity: {
        projectId: metaText(project.projectId ?? project.id ?? project.name, 200),
        name: metaText(project.name ?? project.projectName, 240),
        operator: metaText(project.operator ?? project.knownData?.operator, 200),
        location: metaText(project.location, 240),
        city: metaText(project.city ?? project.knownData?.city, 100),
        county: metaText(project.county ?? project.knownData?.county, 100),
        state: metaText(project.state ?? project.knownData?.state, 80),
        campus: metaText(project.campus ?? project.knownData?.campus, 120),
        facility: metaText(project.facility ?? project.knownData?.facility, 120),
        phase: metaText(project.phase ?? project.knownData?.phase, 100),
        building: metaText(project.building ?? project.knownData?.building, 100),
      },
      sourceCount: finalPacket.length,
      estimatedInputTokens: fitted.inputTokenEstimate,
      inputTokenCap: fitted.inputTokenCap,
      requestBodyBytes: Buffer.byteLength(body),
      requestBodySha256: createHash("sha256").update(body).digest("hex"),
      omittedPassageCount: fitted.omittedPassageCount,
      windowedPassageCount: fitted.windowedPassageCount,
      omissionReasons: fitted.omissionReasons,
    },
    candidateCount: prepared.candidateCount,
    uniqueCount: prepared.uniqueCount,
    suppliedCount: prepared.suppliedCount,
    issuedPassageCount: 0,
    decisions,
  };
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
    const raw = headers.get(header);
    const value = key === "retryAfter"
      ? typeof raw === "string" && /^[A-Za-z0-9,.:/+ -]{1,80}$/.test(raw.trim()) ? raw.trim() : null
      : safeDiagnosticToken(raw);
    return value ? [[key, value]] : [];
  }));
}

function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const delay = Number(normalized) * 1_000;
    return Number.isFinite(delay) ? Math.max(0, Math.ceil(delay)) : null;
  }
  // Accept HTTP-date forms, not Date.parse's loose numeric/date guesses or
  // provider reset-duration syntax (which belongs to a different header).
  if (!/^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4})$/.test(normalized)) return null;
  const dateMs = Date.parse(normalized);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
}

function parseRateLimitDurationMs(value, nowMs = Date.now()) {
  if (typeof value !== "string") return 0;
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d+)?\s*(?:ms|s|m)\s*)+$/i.test(normalized)) {
    return parseRetryAfterMs(value, nowMs) ?? 0;
  }
  let total = 0;
  const durationParts = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m)/gi)];
  for (const match of durationParts) {
    const amount = Number(match[1]);
    total += match[2].toLowerCase() === "m"
      ? amount * 60_000
      : match[2].toLowerCase() === "s"
        ? amount * 1_000
        : amount;
  }
  return Number.isFinite(total) ? Math.max(0, Math.ceil(total)) : 0;
}

function createResearchProviderGate({
  limit = RESEARCH_PROVIDER_MAX_CONCURRENCY,
  tokensPerMinute = configuredOpenAiTokensPerMinute(),
  tokenWindowMs = PROVIDER_TOKEN_WINDOW_MS,
  now = () => Date.now(),
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  let active = 0;
  let blockedUntil = 0;
  let wakeTimer = null;
  const queue = [];
  const tokenReservations = [];

  const pruneReservations = (currentTime) => {
    while (tokenReservations.length && currentTime - tokenReservations[0].reservedAt >= tokenWindowMs) {
      tokenReservations.shift();
    }
  };

  const tokenWaitFor = (requestedTokens, currentTime) => {
    pruneReservations(currentTime);
    if (requestedTokens > tokensPerMinute) {
      return { waitMs: null, usedTokens: tokenReservations.reduce((sum, item) => sum + item.tokens, 0) };
    }
    let remaining = tokenReservations.reduce((sum, item) => sum + item.tokens, 0) + requestedTokens - tokensPerMinute;
    if (remaining <= 0) {
      return { waitMs: 0, usedTokens: tokenReservations.reduce((sum, item) => sum + item.tokens, 0) };
    }
    for (const reservation of tokenReservations) {
      remaining -= reservation.tokens;
      if (remaining <= 0) {
        return {
          waitMs: Math.max(0, reservation.reservedAt + tokenWindowMs - currentTime),
          usedTokens: tokenReservations.reduce((sum, item) => sum + item.tokens, 0),
        };
      }
    }
    return { waitMs: tokenWindowMs, usedTokens: tokenReservations.reduce((sum, item) => sum + item.tokens, 0) };
  };

  const drain = () => {
    if (wakeTimer) {
      cancelSchedule(wakeTimer);
      wakeTimer = null;
    }
    const currentTime = now();
    pruneReservations(currentTime);
    const delay = Math.max(0, blockedUntil - currentTime);
    if (delay > 0) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const waiter = queue[index];
        if (Number.isFinite(waiter.deadlineAt)
          && currentTime + delay + waiter.minimumResponseMs >= waiter.deadlineAt) {
          queue.splice(index, 1);
          waiter.cleanup();
          const error = createResearchBudgetError("provider-rate-limit-deadline");
          error.researchErrorType = "provider-rate-limit-deadline";
          error.providerRateLimitWaitMs = delay;
          waiter.reject(error);
        }
      }
      if (!queue.length) return;
      wakeTimer = schedule(() => {
        wakeTimer = null;
        drain();
      }, delay);
      return;
    }
    while (active < limit && queue.length) {
      const waiter = queue[0];
      if (waiter.signal?.aborted) {
        queue.shift();
        waiter.cleanup();
        waiter.reject(createResearchCancellationError());
        continue;
      }
      const tokenPressure = tokenWaitFor(waiter.reservedTokens, now());
      if (tokenPressure.waitMs === null) {
        queue.shift();
        waiter.cleanup();
        const error = createResearchBudgetError("provider-tpm-exceeds-ceiling");
        error.researchErrorType = "provider-tpm-budget";
        error.providerTpmCeiling = tokensPerMinute;
        error.providerTokenReservation = waiter.reservedTokens;
        waiter.reject(error);
        continue;
      }
      if (tokenPressure.waitMs > 0) {
        const waitMs = tokenPressure.waitMs;
        if (Number.isFinite(waiter.deadlineAt)
          && now() + waitMs + waiter.minimumResponseMs >= waiter.deadlineAt) {
          queue.shift();
          waiter.cleanup();
          const error = createResearchBudgetError("provider-tpm-deadline");
          error.researchErrorType = "provider-tpm-deadline";
          error.providerTpmWaitMs = waitMs;
          waiter.reject(error);
          continue;
        }
        waiter.tpmWaitStartedAt ??= now();
        wakeTimer = schedule(() => {
          wakeTimer = null;
          drain();
        }, waitMs);
        return;
      }
      if (Number.isFinite(waiter.deadlineAt)
        && now() + waiter.minimumResponseMs >= waiter.deadlineAt) {
        queue.shift();
        waiter.cleanup();
        const error = createResearchBudgetError("provider-deadline-admission");
        error.researchErrorType = "provider-deadline-admission";
        waiter.reject(error);
        continue;
      }
      queue.shift();
      active += 1;
      waiter.cleanup();
      const reservedAt = now();
      const tokenReservation = { reservedAt, tokens: waiter.reservedTokens, spent: false };
      tokenReservations.push(tokenReservation);
      waiter.resolve({
        release: ({ refundTokens = false } = {}) => {
          if (refundTokens && !tokenReservation.spent) {
            const index = tokenReservations.indexOf(tokenReservation);
            if (index >= 0) tokenReservations.splice(index, 1);
          }
          active = Math.max(0, active - 1);
          drain();
        },
        markSpent: () => { tokenReservation.spent = true; },
        details: {
        admittedAt: reservedAt,
        queueWaitMs: Math.max(0, reservedAt - waiter.queuedAt),
        rateLimitWaitMs: Math.min(
          Math.max(0, reservedAt - waiter.queuedAt),
          Math.max(0, blockedUntil - waiter.queuedAt),
        ),
        tpmWaitMs: waiter.tpmWaitStartedAt === null ? 0 : Math.max(0, reservedAt - waiter.tpmWaitStartedAt),
        reservedTokens: waiter.reservedTokens,
        usedTokensBeforeReservation: tokenPressure.usedTokens,
        tokensPerMinute,
        },
      });
    }
  };

  const acquire = (signal, {
    estimatedTokens = 0,
    deadlineAt = null,
    minimumResponseMs = PROVIDER_RESPONSE_RESERVE_MS,
  } = {}) => new Promise((resolve, reject) => {
    const requestedTokens = Number.isFinite(estimatedTokens) ? Math.max(0, Math.ceil(estimatedTokens)) : 0;
    if (requestedTokens > tokensPerMinute) {
      const error = createResearchBudgetError("provider-tpm-exceeds-ceiling");
      error.researchErrorType = "provider-tpm-budget";
      error.providerTpmCeiling = tokensPerMinute;
      error.providerTokenReservation = requestedTokens;
      reject(error);
      return;
    }
    const waiter = {
      signal,
      resolve,
      reject,
      cleanup: () => {},
      queuedAt: now(),
      reservedTokens: requestedTokens,
      deadlineAt: Number.isFinite(deadlineAt) ? deadlineAt : null,
      minimumResponseMs: Math.max(0, minimumResponseMs),
      tpmWaitStartedAt: null,
      rateLimitWaitMs: 0,
    };
    const onAbort = () => {
      const index = queue.indexOf(waiter);
      if (index >= 0) queue.splice(index, 1);
      waiter.cleanup();
      reject(createResearchCancellationError());
      drain();
    };
    waiter.cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
    queue.push(waiter);
    drain();
  });

  const recordPressure = (error) => {
    const diagnostic = error?.providerDiagnostic;
    const rateLimitCodes = new Set(["rate_limit_exceeded", "rate_limit_error", "too_many_requests"]);
    if (
      diagnostic?.upstreamStatus !== 429
      || ![diagnostic?.errorCode, diagnostic?.errorType].some((kind) => rateLimitCodes.has(kind))
    ) return;
    const rateLimit = diagnostic.rateLimit ?? {};
    const retryAfterMs = parseRetryAfterMs(rateLimit.retryAfter, now());
    const indicatedDelayMs = Math.max(
      retryAfterMs ?? 0,
      rateLimit.remainingTokens === "0" ? parseRateLimitDurationMs(rateLimit.resetTokens) : 0,
      rateLimit.remainingRequests === "0" ? parseRateLimitDurationMs(rateLimit.resetRequests) : 0,
    );
    const delayMs = retryAfterMs !== null
      ? retryAfterMs
      : indicatedDelayMs > 0 ? indicatedDelayMs : DEFAULT_PROVIDER_RATE_LIMIT_PRESSURE_MS;
    if (delayMs > 0) blockedUntil = Math.max(blockedUntil, now() + delayMs);
  };

  return {
    async run(task, {
      signal,
      onStart,
      estimatedTokens = 0,
      deadlineAt = null,
      minimumResponseMs = PROVIDER_RESPONSE_RESERVE_MS,
    } = {}) {
      const admission = await acquire(signal, {
        estimatedTokens,
        deadlineAt,
        minimumResponseMs,
      });
      const { release, markSpent, details } = admission;
      let issueStarted = false;
      try {
        onStart?.({ active, blockedUntil, ...details });
        issueStarted = true;
        markSpent();
        return await task();
      } catch (error) {
        recordPressure(error);
        throw error;
      } finally {
        release({ refundTokens: !issueStarted });
      }
    },
    snapshot() {
      pruneReservations(now());
      return {
        active,
        queued: queue.length,
        blockedUntil,
        limit,
        tokensPerMinute,
        reservedTokensInWindow: tokenReservations.reduce((sum, item) => sum + item.tokens, 0),
      };
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
    ...(suffix && response.status !== 401 ? { message: suffix } : {}),
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
  let queuedAtMs = null;
  let issuedAtMs = null;
  let providerRequestTracked = false;
  let receivedSuccessfulResponse = false;
  const analysisTracker = activeCategory?.analysisTracker;
  const scopedEvidenceIds = Array.isArray(activeCategory?.evidenceIds)
    ? activeCategory.evidenceIds.filter((id) => RESEARCH_EVIDENCE_IDS.includes(id))
    : RESEARCH_EVIDENCE_IDS;
  const identityOnly = activeCategory?.categoryId === "project-identity";
  const webSearchEnabled = activeCategory?.webSearchEnabled !== false;
  const groundedCategoryAnalysis = Boolean(activeCategory?.categoryId && !webSearchEnabled);
  const groundedSources = Array.isArray(activeCategory?.groundedSources)
    ? activeCategory.groundedSources
    : [];
  const passageCandidates = groundedSources
    .slice(0, RESEARCH_RUN_BUDGET.maxTotalCandidates)
    .filter(hasRetrievedPassage);
  const categoryPassagePreparation = activeCategory?.categoryId
    ? prepareCategoryAnalysisPassages(activeCategory, passageCandidates, project)
    : {
      candidateCount: passageCandidates.length,
      uniqueCount: passageCandidates.length,
      suppliedCount: passageCandidates.length,
      sources: passageCandidates,
    };
  const categoryGroundedSources = activeCategory?.categoryId
    ? groundedSources.flatMap((source) => {
      const decision = categoryPassagePreparation.decisions.find((item) => item.source === source);
      // Deduplication/window fitting affects the prompt, not routed source
      // receipts. Retain admitted duplicates and inaccessible routed records.
      if (decision?.included || (!hasRetrievedPassage(source)
        && categorySourceMatchesForAnalysis(activeCategory, source, project))) {
        return [{ ...source, identityScope: decision?.identityScope ?? "route-labeled-identity-unchecked" }];
      }
      return [];
    })
    : groundedSources;
  const categoryAnalysisSources = categoryPassagePreparation.sources;
  let categoryAnalysisPacket = buildGroundedSourceContext(categoryAnalysisSources);
  const maxRequestedOutputTokens = activeCategory?.categoryId
    ? RESEARCH_CATEGORY_MAX_TOKENS
    : RESEARCH_PROJECT_MAX_TOKENS;
  let requestedOutputTokens = maxRequestedOutputTokens * (activeCategory?.retryState?.outputLimitRetry ? 2 : 1);
  const groundedContextFor = (sources) => sources.length
    ? `\n\nThe following public document passages were physically retrieved by SafeLoc. Use only these passages for source-backed claims. Do not browse, call a search tool, or treat a URL, snippet, title, or generated summary as evidence. Every claimPassage must be copied exactly from one supplied passage.\n${JSON.stringify(buildGroundedSourceContext(sources))}`
    : "";
  const buildRequestBody = (groundedContext) => buildCategoryAnalysisRequestBody({
    project,
    activeCategory,
    groundedContext,
    scopedEvidenceIds,
    requestedOutputTokens,
  });
  let groundedContext = categoryAnalysisSources.length
    ? `\n\nThe following public document passages were physically retrieved by SafeLoc. Use only these passages for source-backed claims. Do not browse, call a search tool, or treat a URL, snippet, title, or generated summary as evidence. Every claimPassage must be copied exactly from one supplied passage.\n${JSON.stringify(categoryAnalysisPacket)}`
    : "";
  let requestBody = buildRequestBody(groundedContext);
  let categoryInputTelemetry = null;
  let categoryPassageSelectionRecords = [];
  if (activeCategory?.categoryId) {
    const fitted = fitCategoryAnalysisInput(
      categoryAnalysisSources,
      buildRequestBody,
      activeCategory,
      project,
    );
    categoryAnalysisSources.splice(0, categoryAnalysisSources.length, ...fitted.sources);
    categoryAnalysisPacket = buildGroundedSourceContext(categoryAnalysisSources);
    groundedContext = categoryAnalysisSources.length
      ? `\n\nThe following public document passages were physically retrieved by SafeLoc. Use only these passages for source-backed claims. Do not browse, call a search tool, or treat a URL, snippet, title, or generated summary as evidence. Every claimPassage must be copied exactly from one supplied passage.\n${JSON.stringify(categoryAnalysisPacket)}`
      : "";
    requestBody = fitted.requestBody;
    categoryInputTelemetry = {
      estimatedInputTokens: fitted.inputTokenEstimate,
      inputTokenCap: fitted.inputTokenCap,
      omittedPassageCount: fitted.omittedPassageCount,
      windowedPassageCount: fitted.windowedPassageCount,
      omissionReasons: fitted.omissionReasons,
      outcome: fitted.omissionReasons.length > 0 ? "capped" : "within-cap",
    };
    const preparedBySource = new Map(categoryPassagePreparation.decisions.map((item) => [item.source, item]));
    const finalByKey = new Map(categoryAnalysisSources.map((source) => {
      const originalPassage = source.accessOutcome?.passage ?? "";
      const key = `${canonicalizeSourceUrl(source.originalUrl ?? source.url ?? source.canonicalUrl) ?? ""}|${createHash("sha256").update(originalPassage).digest("hex")}`;
      return [key, source];
    }));
    categoryPassageSelectionRecords = groundedSources
      .map((source, index) => {
        const prepared = preparedBySource.get(source);
        const originalPassage = source.accessOutcome?.passage ?? "";
        const canonicalUrl = canonicalizeSourceUrl(source.originalUrl ?? source.url ?? source.canonicalUrl) ?? "";
        const key = `${canonicalUrl}|${createHash("sha256").update(originalPassage).digest("hex")}`;
        const finalSource = finalByKey.get(key);
        const suppliedPassage = finalSource?.analysisPassage ?? "";
        let reasonCode = prepared?.reasonCode ?? null;
        let decision = prepared?.decision ?? "excluded-before-passage-selection";
        let explanation = prepared?.explanation ?? null;
        let tokenFitState = "not-evaluated";
        if (!hasRetrievedPassage(source)) {
          const access = source?.accessOutcome ?? {};
          reasonCode = "blocked-source";
          decision = "excluded-before-passage-selection";
          explanation = `Source passage unavailable: ${access.reason ?? access.state ?? "not-retained"}.`;
        } else if (prepared?.included && prepared.deduplicationState === "duplicate") {
          reasonCode = "duplicate-passage";
        } else if (prepared?.included && prepared.windowState === "excluded") {
          reasonCode = "category-window-exclusion";
        } else if (prepared?.included && !finalSource) {
          reasonCode = "token-clipping";
          decision = "excluded-by-token-fit";
          explanation = "A category passage window existed but token fitting omitted the passage completely.";
          tokenFitState = "fully-removed";
        } else if (prepared?.included && suppliedPassage
          && suppliedPassage !== prepared.windowedPassage) {
          reasonCode = "token-clipping";
          tokenFitState = "partially-clipped";
          decision = "included-after-token-clipping";
          explanation = "Token fitting shortened the selected category window; exact before/after hashes are recorded.";
        } else if (finalSource) {
          tokenFitState = "included";
          decision = "included-in-prepared-packet";
          reasonCode = null;
          explanation = null;
        }
        return {
          source,
          sourceId: source.sourceId ?? source.occurrenceId
            ?? prepared?.occurrenceId
            ?? `occ-${createHash("sha256").update(`${canonicalUrl}|${source.accessOutcome?.contentHash ?? ""}|${index}`).digest("hex").slice(0, 24)}`,
          occurrenceId: prepared?.occurrenceId
            ?? source.occurrenceId
            ?? `occ-${createHash("sha256").update(`${canonicalUrl}|${source.accessOutcome?.contentHash ?? ""}|${index}`).digest("hex").slice(0, 24)}`,
          included: Boolean(finalSource),
          decision,
          reasonCode,
          explanation,
          routeState: prepared?.routeState ?? "not-evaluated",
          routeReason: prepared?.routeReason ?? (hasRetrievedPassage(source) ? "not-evaluated" : "blocked-before-routing"),
          identityScope: prepared?.identityScope ?? "scope-unconfirmed",
          identityAdmission: prepared?.identityAdmission ?? {
            state: "not-evaluated",
            verdict: null,
            reason: null,
          },
          duplicateRepresentative: prepared?.duplicateRepresentative ?? null,
          deduplicationState: prepared?.deduplicationState ?? "not-evaluated",
          windowState: prepared?.windowState ?? "not-evaluated",
          tokenFitState,
          passageRetained: hasRetrievedPassage(source) ? "retained" : "not-retained",
          postFilterPassage: prepared?.postFilterPassage ?? "",
          deduplicatedPassage: prepared?.deduplicatedPassage ?? "",
          windowedPassage: prepared?.windowedPassage ?? "",
          suppliedPassage,
          partial: Boolean(suppliedPassage && suppliedPassage !== originalPassage),
        };
      });
  } else {
    // The legacy full-project fallback has a larger schema than category
    // calls. Shrink the output reservation to the configured model's TPM
    // ceiling, retaining headroom for tokenization variance. This also keeps
    // the conservative 30k ceiling when configured back to gpt-4o.
    const inputEstimate = estimateProviderInputTokens(requestBody);
    const outputBudget = configuredOpenAiTokensPerMinute() - inputEstimate - 512;
    requestedOutputTokens = Math.min(
      requestedOutputTokens,
      Math.max(1_000, outputBudget),
    );
    requestBody = buildRequestBody(groundedContext);
  }
  const requestBodyBytesBeforeFiltering = Buffer.byteLength(buildRequestBody(groundedContextFor(passageCandidates)));
  const requestBodyBytesAfterFiltering = Buffer.byteLength(requestBody);
  const categoryPromptTelemetry = activeCategory?.categoryId
    ? {
      candidatePassageCount: categoryPassagePreparation.candidateCount,
      uniquePassageCount: categoryPassagePreparation.uniqueCount,
      passageCountSent: activeCategory?.categoryId
        ? categoryAnalysisSources.length
        : categoryPassagePreparation.suppliedCount,
      requestBodyBytesBeforeFiltering,
      requestBodyBytesAfterFiltering,
      requestBodyBytesReduced: requestBodyBytesBeforeFiltering - requestBodyBytesAfterFiltering,
      requestBodyReductionPercent: requestBodyBytesBeforeFiltering > 0
        ? Math.round(((requestBodyBytesBeforeFiltering - requestBodyBytesAfterFiltering) / requestBodyBytesBeforeFiltering) * 10_000) / 100
        : null,
      ...categoryInputTelemetry,
    }
    : null;
  const startedAt = new Date().toISOString();
  let response;
  const preparedAt = new Date().toISOString();
  const estimatedInputTokens = categoryInputTelemetry?.estimatedInputTokens
    ?? estimateProviderInputTokens(requestBody);
  const requestedTokenReservation = estimatedInputTokens + requestedOutputTokens;
  const providerAttempt = {
    model: RESEARCH_PROJECT_MODEL,
    reasoningEffort: RESEARCH_MODEL_CONFIG.reasoningEffort,
    projectId: project.projectId ?? project.id ?? project.name ?? null,
    runId: activeCategory?.runCorrelationId ?? null,
    categoryId: activeCategory?.categoryId ?? null,
    attemptType: activeCategory?.attempt ?? "primary",
    requestState: "prepared",
    issueOutcome: "prepared",
    attemptId: randomUUID(),
    preparedAt,
    queuedAt: null,
    issuedAt: null,
    finishedAt: null,
    queueWaitMs: null,
    elapsedMs: null,
    status: null,
    outcome: "not-assessed",
    requestedOutputTokens,
    requestBodyBytes: Buffer.byteLength(requestBody),
    preparedRequestBodyBytes: Buffer.byteLength(requestBody),
    retryCount: activeCategory?.retryState?.retryCount ?? 0,
    rateLimitWaitMs: activeCategory?.retryState?.rateLimitWaitMs ?? 0,
    ...(categoryPromptTelemetry ? { categoryPromptTelemetry } : {}),
    estimatedInputTokens,
    requestedTokenReservation,
    reservedTokens: 0,
    reservationDisposition: "not-reserved",
    usage: null,
  };
  const preparedProviderEvent = activeCategory?.claimTrace?.recordProviderEvent?.({
    state: "prepared",
    runId: activeCategory.runCorrelationId,
    projectId: project.projectId ?? project.id ?? project.name,
    project,
    categoryId: activeCategory.categoryId,
    attemptType: activeCategory.attempt,
    attemptId: providerAttempt.attemptId,
    promptVersion: `${RESEARCH_PROJECT_PROMPT_VERSION}:${activeCategory.categoryId ?? "project"}`,
    schemaVersion: identityOnly ? "identity-response-v1"
      : `safeloc-research-schema-v${RESEARCH_POLICY_VERSION}:${activeCategory.categoryId}`,
    preparedAt,
    issueOutcome: "prepared",
    queuedAt: null,
    bodyBytes: providerAttempt.requestBodyBytes,
    requestBodySha256: createHash("sha256").update(requestBody).digest("hex"),
    estimatedInputTokens: providerAttempt.estimatedInputTokens,
    packet: categoryAnalysisPacket,
    outcome: "prepared-not-yet-issued",
  }) ?? null;
  providerAttempt.attemptId = preparedProviderEvent?.attemptId ?? providerAttempt.attemptId;
  if (activeCategory?.categoryId) {
    activeCategory.claimTrace?.recordPassageSelection?.({
      runId: activeCategory.runCorrelationId,
      projectId: project.projectId ?? project.id ?? project.name,
      project,
      categoryId: activeCategory.categoryId,
      attemptType: activeCategory.attempt,
      attemptId: preparedProviderEvent?.attemptId ?? null,
      records: categoryPassageSelectionRecords,
    });
  }
  if (analysisTracker) analysisTracker.attempts.push(providerAttempt);
  let unissuedEmptyRecorded = false;
  const recordUnissuedEmpty = () => {
    if (unissuedEmptyRecorded) throw new Error("An empty category packet was already recorded as unissued.");
    unissuedEmptyRecorded = true;
    const finishedAt = new Date().toISOString();
    Object.assign(providerAttempt, {
      requestState: "unissued-empty",
      issueOutcome: "unissued-empty",
      outcome: "not-assessed",
      finishedAt,
      elapsedMs: null,
      queueWaitMs: providerAttempt.queueWaitMs ?? null,
      tpmWaitMs: providerAttempt.tpmWaitMs ?? 0,
      reservedTokens: 0,
      reservationDisposition: providerAttempt.reservationDisposition === "reserved"
        ? "refunded-before-issue"
        : "not-reserved",
      requestBodyBytes: 0,
      requestBodySha256: null,
      noIssueReason: "no-admitted-passage-text",
    });
    activeCategory?.claimTrace?.recordProviderEvent?.({
      state: "unissued-empty",
      runId: activeCategory.runCorrelationId,
      projectId: project.projectId ?? project.id ?? project.name,
      project,
      categoryId: activeCategory.categoryId,
      attemptType: activeCategory.attempt,
      attemptId: providerAttempt.attemptId,
      promptVersion: `${RESEARCH_PROJECT_PROMPT_VERSION}:${activeCategory.categoryId}`,
      schemaVersion: identityOnly ? "identity-response-v1"
        : `safeloc-research-schema-v${RESEARCH_POLICY_VERSION}:${activeCategory.categoryId}`,
      preparedAt,
      issueOutcome: "unissued-empty",
      queuedAt: providerAttempt.queuedAt,
      bodyBytes: 0,
      requestBodySha256: null,
      estimatedInputTokens: 0,
      packet: [],
      outcome: "not-assessed",
      reason: "Not assessed: no admitted passage text.",
    });
    return {
      research: {
        projectSummary: {
          name: project.name,
          location: project.location,
          description: "Not assessed: no admitted passage text was available for category analysis.",
          capacityMW: null,
          capacityProvenance: "unknown",
        },
        evidence: [],
      },
      sources: categoryGroundedSources,
      coverage: {
        provider: "not-issued",
        model: RESEARCH_PROJECT_MODEL,
        providerRequestCount: 0,
        providerAttempts: [providerAttempt],
        providerAttempt,
        searchTerms: [],
        providerLimitations: ["Not assessed: no admitted passage text."],
        webSearchEnabled: false,
        googleGroundedSourceCount: categoryGroundedSources.length,
        noUsableGroundedPassages: true,
        noAdmittedPassageText: true,
        activeCategoryId: activeCategory.categoryId,
        analysisState: "not-assessed-no-admitted-passage-text",
        analysisOutcome: "not-assessed",
        attemptType: activeCategory.attempt ?? "primary",
        ...(categoryPromptTelemetry ? { categoryPromptTelemetry } : {}),
      },
    };
  };
  try {
    if (groundedCategoryAnalysis && !hasUsableCategoryPacketText(categoryAnalysisPacket)) {
      return recordUnissuedEmpty();
    }
    if (groundedCategoryAnalysis && signal?.aborted) throw createResearchCancellationError();
    if (groundedCategoryAnalysis
      && Number.isFinite(activeCategory.deadlineAt)
      && Date.now() + Math.max(0, activeCategory.minimumResponseMs ?? PROVIDER_RESPONSE_RESERVE_MS)
        >= activeCategory.deadlineAt) {
      throw createResearchBudgetError("provider-deadline-admission");
    }
    queuedAtMs = Date.now();
    providerAttempt.queuedAt = new Date(queuedAtMs).toISOString();
    providerAttempt.requestState = "queued";
    providerAttempt.outcome = "cancelled-before-issue";
    response = await providerGate.run(async () => {
      try {
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
        receivedSuccessfulResponse = true;
        return upstream;
      } finally {
        if (providerRequestTracked && !receivedSuccessfulResponse) {
          analysisTracker.inFlight = Math.max(0, analysisTracker.inFlight - 1);
          providerRequestTracked = false;
        }
      }
    }, {
      signal,
      estimatedTokens: providerAttempt.requestedTokenReservation,
      deadlineAt: activeCategory?.deadlineAt ?? null,
      minimumResponseMs: activeCategory?.minimumResponseMs ?? PROVIDER_RESPONSE_RESERVE_MS,
      onStart: (admission = {}) => {
        providerAttempt.queueWaitMs = admission.queueWaitMs
          ?? Math.max(0, Date.now() - (queuedAtMs ?? Date.now()));
        providerAttempt.tpmWaitMs = admission.tpmWaitMs ?? 0;
        providerAttempt.rateLimitWaitMs = Math.max(
          providerAttempt.rateLimitWaitMs ?? 0,
          admission.rateLimitWaitMs ?? 0,
        );
        providerAttempt.reservedTokens = admission.reservedTokens ?? providerAttempt.reservedTokens;
        providerAttempt.reservationDisposition = "reserved";
        providerAttempt.providerTpmCeiling = admission.tokensPerMinute ?? null;
        if (groundedCategoryAnalysis && !hasUsableCategoryPacketText(categoryAnalysisPacket)) {
          const error = new Error("Category packet has no admitted passage text.");
          error.name = "UnissuedEmptyCategoryPacketError";
          error.researchErrorType = "unissued-empty-category-input";
          throw error;
        }
        if (groundedCategoryAnalysis && signal?.aborted) throw createResearchCancellationError();
        if (groundedCategoryAnalysis
          && Number.isFinite(activeCategory.deadlineAt)
          && Date.now() + Math.max(0, activeCategory.minimumResponseMs ?? PROVIDER_RESPONSE_RESERVE_MS)
            >= activeCategory.deadlineAt) {
          throw createResearchBudgetError("provider-deadline-admission");
        }
        issuedAtMs = Date.now();
        providerAttempt.requestState = "issued";
        providerAttempt.issueOutcome = groundedCategoryAnalysis ? "issued-with-text" : "issued";
        providerAttempt.issuedAt = new Date(issuedAtMs).toISOString();
        activeCategory?.claimTrace?.recordProviderEvent?.({
          state: "issued-to-provider",
          runId: activeCategory.runCorrelationId,
          projectId: project.projectId ?? project.id ?? project.name,
          project,
          categoryId: activeCategory.categoryId,
          attemptType: activeCategory.attempt,
          attemptId: providerAttempt.attemptId,
          promptVersion: `${RESEARCH_PROJECT_PROMPT_VERSION}:${activeCategory.categoryId ?? "project"}`,
          schemaVersion: identityOnly ? "identity-response-v1"
            : `safeloc-research-schema-v${RESEARCH_POLICY_VERSION}:${activeCategory.categoryId}`,
          queuedAt: providerAttempt.queuedAt,
          preparedAt,
          providerCallStartedAt: providerAttempt.issuedAt,
          bodyBytes: providerAttempt.requestBodyBytes,
          requestBodySha256: createHash("sha256").update(requestBody).digest("hex"),
          estimatedInputTokens: providerAttempt.estimatedInputTokens,
          packet: categoryAnalysisPacket,
          outcome: providerAttempt.issueOutcome,
        });
        activeCategory?.claimTrace?.recordAnalysisPacket?.({
          categoryId: activeCategory.categoryId,
          attemptType: activeCategory.attempt,
          packet: categoryAnalysisPacket,
          analysisUserMessages: extractProviderUserMessages(requestBody),
          attemptId: providerAttempt.attemptId,
          requestBodySha256: createHash("sha256").update(requestBody).digest("hex"),
        });
        if (analysisTracker) {
          analysisTracker.inFlight += 1;
          analysisTracker.peak = Math.max(analysisTracker.peak, analysisTracker.inFlight);
          providerRequestTracked = true;
          providerAttempt.inFlightAnalysisCountAtIssue = analysisTracker.inFlight;
        }
      },
    });
  } catch (error) {
    if (error?.researchErrorType === "unissued-empty-category-input") return recordUnissuedEmpty();
    const finishedAtMs = Date.now();
    providerAttempt.finishedAt = new Date(finishedAtMs).toISOString();
    providerAttempt.elapsedMs = issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs);
    providerAttempt.status = error?.providerDiagnostic?.upstreamStatus
      ?? error?.providerDiagnostic?.status
      ?? error?.upstreamStatus
      ?? error?.status
      ?? null;
    providerAttempt.failureClassification = classifyResearchFailure(error).type;
    providerAttempt.providerDiagnostic = error?.providerDiagnostic ?? null;
    const cancelled = error?.name === "ResearchCancelledError"
      || error?.name === "AbortError"
      || signal?.aborted === true;
    providerAttempt.requestState = issuedAtMs === null
      ? cancelled ? "cancelled-before-issue" : "failed-before-issue"
      : cancelled ? "cancelled-after-issue" : "failed";
    providerAttempt.issueOutcome = issuedAtMs === null
      ? "failed-before-issue"
      : groundedCategoryAnalysis ? "issued-with-text" : "issued";
    providerAttempt.outcome = issuedAtMs === null
      ? cancelled ? "cancelled-before-issue" : "failed"
      : cancelled ? "cancelled-after-issue" : "failed";
    if (issuedAtMs === null) {
      const reservationWasAcquired = providerAttempt.reservationDisposition === "reserved";
      providerAttempt.reservedTokens = 0;
      providerAttempt.reservationDisposition = reservationWasAcquired
        ? "refunded-before-issue"
        : "not-reserved";
    }
    if (issuedAtMs === null) activeCategory?.claimTrace?.recordProviderEvent?.({
      state: "failed-before-issue",
      runId: activeCategory.runCorrelationId,
      projectId: project.projectId ?? project.id ?? project.name,
      project,
      categoryId: activeCategory.categoryId,
      attemptType: activeCategory.attempt,
      attemptId: providerAttempt.attemptId,
      promptVersion: `${RESEARCH_PROJECT_PROMPT_VERSION}:${activeCategory.categoryId ?? "project"}`,
      schemaVersion: identityOnly ? "identity-response-v1"
        : `safeloc-research-schema-v${RESEARCH_POLICY_VERSION}:${activeCategory.categoryId}`,
      queuedAt: providerAttempt.queuedAt,
      preparedAt,
      issueOutcome: providerAttempt.issueOutcome,
      bodyBytes: providerAttempt.requestBodyBytes,
      estimatedInputTokens: providerAttempt.estimatedInputTokens,
      packet: categoryAnalysisPacket,
      outcome: cancelled ? "cancelled-before-issue" : providerAttempt.failureClassification,
      reason: error?.message,
    });
    if (analysisTracker) providerAttempt.inFlightAnalysisCount = analysisTracker.inFlight;
    error.providerAttempt = providerAttempt;
    throw error;
  }
  let rawText;
  let responseBodyError = null;
  try {
    rawText = await response.text();
  } catch (error) {
    responseBodyError = error;
  } finally {
    if (providerRequestTracked && analysisTracker) {
      analysisTracker.inFlight = Math.max(0, analysisTracker.inFlight - 1);
      providerRequestTracked = false;
    }
    if (analysisTracker) providerAttempt.inFlightAnalysisCount = analysisTracker.inFlight;
  }
  if (responseBodyError) {
    const finishedAtMs = Date.now();
    const cancelled = responseBodyError?.name === "AbortError" || signal?.aborted === true;
    Object.assign(providerAttempt, {
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
      status: response.status,
      requestState: cancelled ? "cancelled-after-issue" : "failed",
      outcome: cancelled ? "cancelled-after-issue" : "failed",
      failureClassification: cancelled ? "timeout" : "upstream",
      providerDiagnostic: {
        upstreamStatus: response.status,
        errorType: cancelled ? "response-body-cancelled" : "response-body-read-failure",
      },
    });
    responseBodyError.providerAttempt = providerAttempt;
    throw responseBodyError;
  }
  let body;
  try {
    body = JSON.parse(rawText);
  } catch (error) {
    const parseError = new Error("Project research provider returned invalid JSON.");
    parseError.name = "ResearchParseError";
    const finishedAtMs = Date.now();
    const structuredResponseDiagnostic = createStructuredResponseDiagnostic(null, { outcome: "unparseable" });
    Object.assign(providerAttempt, {
      requestState: "failed",
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
      status: response.status,
      outcome: "failed",
      structuredResponseDiagnostic,
    });
    parseError.structuredResponseDiagnostic = structuredResponseDiagnostic;
    parseError.providerAttempt = providerAttempt;
    throw parseError;
  }
  const content = extractResponseOutputText(body);
  const providerResponseId = normalizeProviderResponseId(body?.id);
  providerAttempt.providerResponseId = providerResponseId;
  if (["max_output_tokens", "max_tokens", "length"].includes(providerFinishReason(body))) {
    const error = new Error("Project research provider reached its output token limit; no partial JSON was parsed.");
    error.name = "ResearchOutputLimitError";
    error.researchErrorType = "provider-output-limit";
    error.retryable = true;
    error.providerResponseId = providerResponseId;
    Object.assign(providerAttempt, {
      requestState: "failed", outcome: "failed", failureClassification: "provider-output-limit",
      retryable: true, finishReason: providerFinishReason(body),
      finishedAt: new Date().toISOString(),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, Date.now() - issuedAtMs),
      status: response.status, usage: normalizeProviderUsage(body.usage),
    });
    error.providerAttempt = providerAttempt;
    throw error;
  }
  activeCategory?.claimTrace?.recordProviderOutput?.({
    runId: activeCategory.runCorrelationId,
    projectId: project.projectId ?? project.id ?? project.name,
    categoryId: activeCategory.categoryId,
    attemptType: activeCategory.attempt,
    attemptId: providerAttempt.attemptId,
    providerResponseId,
    sourceIds: categoryAnalysisPacket.flatMap((source) => [
      source?.sourceId,
      source?.occurrenceId,
      source?.canonicalUrl,
      source?.sourceUrl,
      source?.url,
    ].filter((value) => typeof value === "string" && value.length > 0)),
    content,
  });
  activeCategory?.claimTrace?.recordAnalysisPacket?.({
    categoryId: activeCategory.categoryId,
    providerResponseId,
    attemptType: activeCategory.attempt,
  });
  if (!content) {
    const parseError = new Error("Project research provider returned no JSON output.");
    parseError.name = "ResearchParseError";
    const finishedAtMs = Date.now();
    Object.assign(providerAttempt, {
      requestState: "failed",
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
      status: response.status,
      outcome: "failed",
      usage: normalizeProviderUsage(body.usage),
      structuredResponseDiagnostic: createStructuredResponseDiagnostic(null, { outcome: "no-structured-output" }),
    });
    parseError.providerAttempt = providerAttempt;
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
    parseError.providerResponseId = providerResponseId;
    parseError.toolCallCount = countWebSearchCalls(body);
    const finishedAtMs = Date.now();
    Object.assign(providerAttempt, {
      requestState: "failed",
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
      status: response.status,
      outcome: "failed",
      usage: normalizeProviderUsage(body.usage),
      structuredResponseDiagnostic: createStructuredResponseDiagnostic(null, { outcome: "unparseable" }),
    });
    parseError.providerAttempt = providerAttempt;
    logProviderDiagnostic(parseError, {
      runCorrelationId: activeCategory?.runCorrelationId,
      categoryId: activeCategory?.categoryId,
    });
    throw parseError;
  }
  const providerOriginalResearch = research;
  activeCategory?.claimTrace?.recordProviderOriginal?.({
    runId: activeCategory.runCorrelationId,
    projectId: project.projectId ?? project.id ?? project.name,
    categoryId: activeCategory.categoryId,
    attemptType: activeCategory.attempt,
    attemptId: providerAttempt.attemptId,
    providerResponseId,
    parsedAt: new Date().toISOString(),
    expectedEvidenceIds: scopedEvidenceIds,
    research: providerOriginalResearch,
  });
  providerAttempt.structuredResponseDiagnostic = createStructuredResponseDiagnostic(research, { outcome: "received" });
  if (identityOnly) {
    research = {
      projectSummary: research.projectSummary,
      evidence: {},
      identityAssessment: research.identityAssessment ?? null,
    };
    activeCategory?.claimTrace?.recordTransformation?.({
      runId: activeCategory.runCorrelationId,
      projectId: project.projectId ?? project.id ?? project.name,
      categoryId: activeCategory.categoryId,
      attemptType: activeCategory.attempt,
      providerResponseId,
      stage: "identity-only-projection",
      reason: "The identity-only category intentionally projects away evidence after preserving the immutable provider-original snapshot.",
      before: providerOriginalResearch,
      after: research,
    });
  }
  const bounded = boundProviderResponseToToolBudget(body, activeCategory?.maxToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS);
  const sources = categoryGroundedSources.length
    ? normalizeRetrievedSources(
      { sources: categoryGroundedSources },
      "google-grounded-search",
      project,
      activeCategory?.canaryRetainedSourceBoundary === true
        ? []
        : extractResearchSourceUrls(research),
    )
    : normalizeRetrievedSources(
      bounded.body,
      "web-search",
      project,
      extractResearchSourceUrls(research),
    );
  const beforeSourceRestriction = research;
  research = restrictResearchToAcceptedSources(research, sources);
  activeCategory?.claimTrace?.recordTransformation?.({
    runId: activeCategory.runCorrelationId,
    projectId: project.projectId ?? project.id ?? project.name,
    categoryId: activeCategory.categoryId,
    attemptType: activeCategory.attempt,
    providerResponseId,
    stage: "accepted-source-restriction",
    reason: "Provider source URLs not in the retained-source allowlist are removed before normalization.",
    before: beforeSourceRestriction,
    after: research,
  });
  const searchTerms = categoryGroundedSources.length
    ? [...new Set(categoryGroundedSources.flatMap((source) => source.referringQueries ?? []))].slice(0, RESEARCH_PROJECT_MAX_TOOL_CALLS)
    : extractSearchTerms(bounded.body);
  const observedQueriesByEvidence = extractObservedQueriesByEvidence(bounded.body, project);
  const finishedAt = new Date().toISOString();
  const finishedAtMs = Date.now();
  Object.assign(providerAttempt, {
    requestState: "completed",
    finishedAt,
    elapsedMs: issuedAtMs === null ? null : Math.max(0, finishedAtMs - issuedAtMs),
    status: response.status,
    outcome: "completed",
    usage: normalizeProviderUsage(body.usage),
  });
  return {
    research,
    rawResearch: providerOriginalResearch,
    sources,
    coverage: {
      searchedDomains: [...new Set(sources.map((source) => sourceHostname(source)).filter(Boolean))],
      failedDomains: [],
      attemptType: activeCategory?.attempt ?? "primary",
      runCorrelationId: activeCategory?.runCorrelationId ?? null,
      projectId: project.projectId ?? project.id ?? project.name,
      retrievedSourceCount: sources.length,
      sourceChannelTelemetry: sources.sourceChannelTelemetry ?? [],
      searchTerms,
      observedQueriesByEvidence,
      toolCallCount: webSearchEnabled ? bounded.acceptedToolCallCount : 0,
      observedToolCallCount: webSearchEnabled ? bounded.actualToolCallCount : 0,
      acceptedToolCallCount: webSearchEnabled ? bounded.acceptedToolCallCount : 0,
      toolCallBudgetExceeded: webSearchEnabled ? bounded.toolCallBudgetExceeded : false,
      providerLimitations: bounded.toolCallBudgetExceeded
        ? ["Provider returned more web-search calls than the remaining run allowance; excess calls, sources, and source-linked findings were excluded."]
        : [],
      sourcePriorityApplied: sourcePriorityApplied(project),
      searchTermsSource: searchTerms.length ? "tool-observed" : "unavailable",
      provider: webSearchEnabled ? "openai-web-fallback" : "openai-structured-from-grounded-passages",
      model: RESEARCH_PROJECT_MODEL,
      reasoningEffort: RESEARCH_MODEL_CONFIG.reasoningEffort,
      webSearchEnabled,
      googleGroundedSourceCount: categoryGroundedSources.length,
      providerResponseId,
      activeCategoryId: activeCategory?.categoryId ?? null,
      executedQuery: activeCategory?.query ?? null,
      ...(categoryPromptTelemetry ? { categoryPromptTelemetry } : {}),
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
  if (error?.name === "ResearchFindingsLimitError") {
    return { type: error.researchErrorType, message: error.message, status: error.status ?? 422, retryable: false };
  }
  if (error?.researchErrorType === "provider-output-limit") {
    return { status: 502, type: "provider-output-limit",
      message: "Research provider reached its output token limit. A larger-output retry is permitted only within the remaining run budget." };
  }
  if (error?.researchErrorType === "category-input-budget") {
    return {
      status: 502,
      type: "category-input-budget",
      message: "The category request could not fit its fixed prompt and response schema inside the configured input cap.",
    };
  }
  if (error?.researchErrorType === "provider-tpm-budget") {
    return {
      status: 502,
      type: "provider-tpm-budget",
      message: "The request's conservative token reservation exceeds the configured provider TPM ceiling; no request was issued.",
    };
  }
  if ([
    "provider-tpm-deadline",
    "provider-rate-limit-deadline",
    "provider-deadline-admission",
  ].includes(error?.researchErrorType)) {
    return {
      status: 504,
      type: error.researchErrorType,
      message: "The provider request was not issued because the shared token/rate-limit wait would leave insufficient time before the research deadline.",
    };
  }
  if (error?.researchErrorType === "audit-storage") {
    return {
      status: 503,
      type: "audit-storage",
      message: "Research audit storage is unavailable. No research provider request was issued.",
    };
  }
  if (error?.name === "ResearchDeadlineError" || error?.researchErrorType === "deadline") {
    return {
      status: 504,
      type: "timeout",
      message: "Project research reached the overall run deadline; completed findings were retained.",
      ...(error?.providerDiagnostic ? { providerDiagnostic: error.providerDiagnostic } : {}),
      ...(Array.isArray(error?.providerAttempts) ? { providerAttempts: error.providerAttempts } : {}),
    };
  }
  if (error?.name === "ResearchCancelledError" || error?.researchErrorType === "cancelled") {
    return {
      status: 499,
      type: "cancelled",
      message: "Project research was cancelled by the requesting client.",
      ...(error?.providerDiagnostic ? { providerDiagnostic: error.providerDiagnostic } : {}),
      ...(Number.isInteger(error?.inFlightAnalysisCount)
        ? { inFlightAnalysisCount: error.inFlightAnalysisCount }
        : {}),
      ...(Array.isArray(error?.providerAttempts) ? { providerAttempts: error.providerAttempts } : {}),
    };
  }
  if (error?.name === "ResearchBudgetError" || error?.researchErrorType === "provider-request-budget") {
    return { status: 502, type: "provider-request-budget", message: "Project research reached its provider-request ceiling; retry only if additional research is required." };
  }
  if (error?.name === "AbortError") return { status: 504, type: "timeout", message: "Project research reached its 90-second deadline; valid completed findings were retained and the run can be retried." };
  if (error?.name === "GoogleDiscoveryTimeoutError") {
    return {
      status: 504,
      type: "timeout",
      message: "Project research discovery reached the run deadline.",
      ...(error?.providerDiagnostic ? { providerDiagnostic: error.providerDiagnostic } : {}),
      ...(error?.providerAttempt ? { providerAttempts: [error.providerAttempt] } : {}),
      ...(Number.isInteger(error?.providerAttempt?.inFlightAnalysisCount)
        ? { inFlightAnalysisCount: error.providerAttempt.inFlightAnalysisCount }
        : {}),
    };
  }
  if (error?.name === "ResearchParseError" || error?.researchErrorType === "malformed-response") {
    return { status: 502, type: "malformed-response", message: "Project research provider returned malformed structured data; retry the affected research." };
  }
  if (error?.name === "GoogleDiscoveryProviderError") {
    const diagnostic = error.providerDiagnostic ?? {};
    const status = diagnostic.upstreamStatus ?? diagnostic.status;
    if (status === 429) {
      const kinds = [diagnostic.errorCode, diagnostic.errorType].filter(Boolean);
      if (kinds.some((value) =>
        ["insufficient_quota", "billing_hard_limit_reached", "quota_exceeded", "daily_limit_exceeded"].includes(value))) {
        return {
          status: 429,
          type: "quota-exhausted",
          message: "Project research discovery provider reports an explicit quota or billing limit.",
          providerDiagnostic: diagnostic,
        };
      }
      if (kinds.some((value) => ["rate_limit_exceeded", "rate_limit_error", "too_many_requests"].includes(value))
        || /\brate[\s_-]*limit\b|\btoo many requests\b/i.test(diagnostic.message ?? "")) {
        return {
          status: 429,
          type: "provider-rate-limit",
          message: "Project research discovery provider is temporarily rate-limited; use the supplied delay if present.",
          providerDiagnostic: diagnostic,
        };
      }
      return {
        status: 429,
        type: "provider-429",
        message: "Project research discovery provider returned HTTP 429 without evidence distinguishing quota from rate limiting.",
        providerDiagnostic: diagnostic,
      };
    }
    return {
      status: 502,
      type: error.researchErrorType ?? "google-provider-failure",
      message: "Project research discovery provider request failed.",
      ...(Object.keys(diagnostic).length ? { providerDiagnostic: diagnostic } : {}),
    };
  }
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

function mergeCategoryResearchResults(project, categoryResults, claimTrace = null) {
  const first = categoryResults.find((result) => isRecord(result?.research))?.research;
  if (!first || !isRecord(first.projectSummary)) return null;
  const evidenceById = new Map();
  const planByCategory = new Map(buildResearchCategoryPlan(project).categories.map((category) => [category.categoryId, category]));
  for (const result of categoryResults) {
    const category = planByCategory.get(result.categoryId);
    const retainedCategoryUrls = new Set((result.sources ?? []).flatMap((source) => sourceUrlAliases(source)));
    const responseId = result.coverage?.providerResponseId
      ?? result.coverage?.providerAttempts?.find((attempt) => attempt?.providerResponseId)?.providerResponseId
      ?? result.coverage?.providerAttempt?.providerResponseId
      ?? null;
    const rawProviderEvidence = result.rawResearch?.evidence ?? result.research?.evidence;
    const rawProviderClaims = Array.isArray(rawProviderEvidence)
      ? rawProviderEvidence
      : isRecord(rawProviderEvidence)
        ? Object.entries(rawProviderEvidence).map(([id, item]) => ({
          ...(isRecord(item) ? item : {}),
          id: item?.id ?? id,
        }))
        : [];
    let containedResearch = result.research;
    const categoryEvidence = Array.isArray(result.research?.evidence) ? result.research.evidence : [];
    if (!categoryEvidence.some((item) => typeof item?.eligibleForModel === "boolean")) {
      try {
        const parsedResearch = parseResearchResponse(
          result.research,
          result.sources ?? [],
          new Date().toISOString().slice(0, 10),
          result.coverage ?? null,
          projectClaimValidationContext(project),
          category?.evidenceIds ?? RESEARCH_EVIDENCE_IDS,
          {
            claimTrace,
            categoryId: result.categoryId,
            providerResponseId: responseId,
            attemptType: result.coverage?.attemptType ?? "primary",
            runId: result.coverage?.runCorrelationId ?? null,
            projectId: project.projectId ?? project.id ?? project.name,
            requestedProject: project,
          },
        );
        claimTrace?.recordTransformation?.({
          runId: result.coverage?.runCorrelationId ?? null,
          projectId: project.projectId ?? project.id ?? project.name,
          categoryId: result.categoryId,
          providerResponseId: responseId,
          attemptType: result.coverage?.attemptType ?? "primary",
          stage: "normalization-parsing-mapping",
          reason: "The retained category response was normalized and evaluated by the shared identity and source-mapping functions.",
          before: result.research,
          after: parsedResearch,
        });
        containedResearch = containResearchResult(parsedResearch);
        claimTrace?.recordTransformation?.({
          runId: result.coverage?.runCorrelationId ?? null,
          projectId: project.projectId ?? project.id ?? project.name,
          categoryId: result.categoryId,
          providerResponseId: responseId,
          attemptType: result.coverage?.attemptType ?? "primary",
          stage: "claim-containment",
          reason: "The parsed category response was passed through the existing containment policy.",
          before: parsedResearch,
          after: containedResearch,
        });
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
    for (const item of rawProviderClaims.slice(0, 48)) {
      const claimId = item?.id;
      if (!category?.evidenceIds.includes(claimId)) {
        claimTrace?.recordStage?.({
          categoryId: result.categoryId,
          providerResponseId: responseId,
          claimId,
          stage: "categoryRestriction",
          passed: false,
          reasonCode: "outside-category-schema",
        });
        continue;
      }
      claimTrace?.recordStage?.({
        categoryId: result.categoryId,
        providerResponseId: responseId,
        claimId,
        stage: "categoryRestriction",
        passed: true,
      });
      const mappedUrls = [
        item.sourceUrl,
        ...(Array.isArray(item.sourceUrls) ? item.sourceUrls : []),
      ].map((url) => canonicalizeSourceUrl(url)).filter(Boolean);
      if (!mappedUrls.length) {
        claimTrace?.recordStage?.({
          categoryId: result.categoryId,
          providerResponseId: responseId,
          claimId,
          stage: "sourceRestriction",
          passed: false,
          reasonCode: "claim-has-no-source-url",
        });
      } else if (!mappedUrls.some((url) => retainedCategoryUrls.has(url))) {
        claimTrace?.recordStage?.({
          categoryId: result.categoryId,
          providerResponseId: responseId,
          claimId,
          stage: "sourceRestriction",
          passed: false,
          reasonCode: "source-not-retained-for-category",
        });
      } else if (!containedEvidence.has(claimId)) {
        claimTrace?.recordStage?.({
          categoryId: result.categoryId,
          providerResponseId: responseId,
          claimId,
          stage: "sourceRestriction",
          passed: false,
          reasonCode: "source-containment-rejected",
        });
      } else {
        claimTrace?.recordStage?.({
          categoryId: result.categoryId,
          providerResponseId: responseId,
          claimId,
          stage: "sourceRestriction",
          passed: true,
        });
      }
    }
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
      const mergedItem = {
        ...item,
        ...containedItem,
        // A category may be normalized before its source has been physically
        // accessed. Once an accessible receipt exists, restore the raw claim
        // fields and let the final run-wide parse evaluate them against that
        // receipt instead of carrying forward a pre-access quarantine value.
        ...(currentHasAccessibleSource && rawItem ? rawItem : {}),
        ...(containedItem.sourceUrl || !rawItem?.sourceUrl ? {} : { sourceUrl: rawItem.sourceUrl }),
        ...(Array.isArray(containedItem.sourceUrls) && containedItem.sourceUrls.length
          ? {}
          : Array.isArray(rawItem?.sourceUrls) ? { sourceUrls: rawItem.sourceUrls } : {}),
        ...(!containedItem.claimPassage && rawItem?.claimPassage
          ? { claimPassage: rawItem.claimPassage }
          : {}),
        ...(!containedItem.facilityScope && rawItem?.facilityScope
          ? { facilityScope: rawItem.facilityScope }
          : {}),
        ...(!containedItem.phaseScope && rawItem?.phaseScope
          ? { phaseScope: rawItem.phaseScope }
          : {}),
        ...(!containedItem.claimTimePeriod && rawItem?.claimTimePeriod
          ? { claimTimePeriod: rawItem.claimTimePeriod }
          : {}),
        ...(item.sources?.length || !sourceRecords.length ? {} : { sources: sourceRecords }),
      };
      evidenceById.set(item.id, mergedItem);
      claimTrace?.recordTransformation?.({
        runId: result.coverage?.runCorrelationId ?? null,
        projectId: project.projectId ?? project.id ?? project.name,
        categoryId: result.categoryId,
        providerResponseId: responseId,
        attemptType: result.coverage?.attemptType ?? "primary",
        stage: "category-merge",
        reason: existing
          ? "A category claim replaced the prior merged representative after retained-source accessibility arbitration."
          : "The category claim and its validated source receipts were added to the merged project evidence.",
        before: { projectSummary: first.projectSummary, evidence: [existing ?? item] },
        after: { projectSummary: first.projectSummary, evidence: [mergedItem] },
      });
      claimTrace?.recordStage?.({
        categoryId: result.categoryId,
        providerResponseId: responseId,
        claimId: item.id,
        stage: "merge",
        passed: true,
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
      && sourceEstablishesProjectIdentity(source, project));
    return { resolved, unresolvedEvidenceIds: resolved ? [] : [category.categoryId] };
  }
  try {
    const contained = containResearchResult(parseResearchResponse(
      research,
      sources,
      new Date().toISOString().slice(0, 10),
      coverage,
      projectClaimValidationContext(project),
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
  NOT_ASSESSED: "incomplete-not-assessed",
});

function classifyCanonicalResearchOutcome(
  eligibleEvidenceCount,
  technicalReasonCodes = [],
  notAssessedCategoryCount = 0,
) {
  if (technicalReasonCodes.length > 0) return RESEARCH_OUTCOMES.TECHNICAL;
  if (notAssessedCategoryCount > 0) return RESEARCH_OUTCOMES.NOT_ASSESSED;
  return eligibleEvidenceCount > 0
    ? RESEARCH_OUTCOMES.WITH_EVIDENCE
    : RESEARCH_OUTCOMES.NO_ELIGIBLE;
}

function technicalReasonCodesForRun({ orchestration, deadlineState, clientDisconnected = false }) {
  const reasons = new Set();
  if (deadlineState.expired) reasons.add("deadline");
  if (orchestration.lastError) {
    const failureType = classifyResearchFailure(orchestration.lastError).type;
    reasons.add(failureType === "timeout"
      ? "deadline"
      : failureType === "cancelled" ? (clientDisconnected ? "requesting-client-cancelled" : "cancelled") : failureType);
  }
  if (orchestration.toolCallBudgetExceeded) reasons.add("tool-call-budget");
  if (orchestration.physicalOpenBudgetExceeded) reasons.add("physical-open-budget");
  for (const execution of Object.values(orchestration.categoryExecutions)) {
    if (execution?.state === "Provider failure") reasons.add(execution.providerFailureType || "provider-failure");
    if (execution?.providerFailureType) {
      reasons.add(execution.providerFailureType === "timeout"
        ? "deadline"
        : execution.providerFailureType === "cancelled" ? (clientDisconnected ? "requesting-client-cancelled" : "cancelled") : execution.providerFailureType);
    }
    if (execution?.state === "Timed out") reasons.add("deadline");
    if (execution?.state === "Not searched") reasons.add(execution.followUpSkipReason || "required-discovery-not-searched");
    if (["physical-open-budget", "tool-call-budget", "provider-request-budget", "deadline", "provider-failure", "requesting-client-cancelled"].includes(execution?.followUpSkipReason)) {
      reasons.add(execution.followUpSkipReason);
    }
  }
  for (const category of orchestration.categoryResults) {
    if (category.coverage?.analysisFailureType) reasons.add(category.coverage.analysisFailureType);
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
      discoveryRank: Number.isInteger(source.discoveryCandidateRank) ? source.discoveryCandidateRank : null,
      acquisitionRank: Number.isInteger(source.acquisitionRank) ? source.acquisitionRank : null,
      acquisitionPriority: Number.isFinite(source.acquisitionPriority) ? source.acquisitionPriority : null,
      acquisitionReasons: Array.isArray(source.acquisitionReasons) ? source.acquisitionReasons.slice(0, 12) : [],
      acquisitionSelected: typeof source.acquisitionSelected === "boolean" ? source.acquisitionSelected : null,
      acquisitionSelectionReason: source.acquisitionSelectionReason ?? null,
      physicalOpenAdmission: source.physicalOpenAdmission ?? null,
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
        exactProject: sourceEstablishesProjectIdentity(source, result?.projectSummary ?? {}),
        state: sourceEstablishesProjectIdentity(source, result?.projectSummary ?? {})
          ? "project-specific"
          : "unresolved",
      },
      passageResult: {
        state: access.passage || source.claimPassage ? "retained" : "not-retained",
        reason: access.passage || source.claimPassage ? null : access.reason ?? "No attributable passage was retained.",
        passageSha256: typeof access.passage === "string" && access.passage.trim()
          ? createHash("sha256").update(access.passage).digest("hex")
          : null,
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
  googleApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY,
  googleDiscoveryImpl = discoverGoogleGroundedProject,
  googleModel = GOOGLE_GEMINI_MODEL,
  googleDiscoveryPrompt = null,
  canaryDiagnosticCollector = null,
  allowGoogleFallback = true,
  allowCorrectiveRetries = true,
  fetchImpl,
  rateLimiter,
  req,
  documentFetchImpl = fetch,
  dnsLookup = dns.lookup,
  secConnector = null,
  ocrImpl,
  signal,
  categoryIds = null,
  researchTimeoutMs = RESEARCH_PROJECT_TIMEOUT_MS,
  documentTimeoutMs = RESEARCH_DOCUMENT_TIMEOUT_MS,
  analysisReserveMs = RESEARCH_DOCUMENT_ANALYSIS_RESERVE_MS,
  maxConcurrentDocumentOpens = RESEARCH_DOCUMENT_MAX_CONCURRENCY,
  researchBudgetOverrides = null,
  allowProviderRetries = true,
  useDefaultSecConnector = true,
  retrievalOnly = false,
  canaryGridIdentityGate = false,
  runCorrelationId: requestedRunCorrelationId = null,
  auditStartedAt = null,
  auditDeadlineAt = null,
  claimTrace = null,
  providerGate = researchProviderGate,
  findingsFirst = false,
  findingsOptions = {},
}) {
  const researchBudget = boundedResearchBudget(researchBudgetOverrides);
  researchTimeoutMs = Math.min(RESEARCH_PROJECT_TIMEOUT_MS, Math.max(1,
    Number.isFinite(researchTimeoutMs) ? researchTimeoutMs : RESEARCH_PROJECT_TIMEOUT_MS));
  documentTimeoutMs = Math.min(RESEARCH_DOCUMENT_TIMEOUT_MS, Math.max(1,
    Number.isFinite(documentTimeoutMs) ? documentTimeoutMs : RESEARCH_DOCUMENT_TIMEOUT_MS));
  analysisReserveMs = researchTimeoutMs < RESEARCH_PROJECT_TIMEOUT_MS
    ? Math.min(RESEARCH_DOCUMENT_ANALYSIS_RESERVE_MS, Math.max(0,
      Number.isFinite(analysisReserveMs) ? analysisReserveMs : RESEARCH_DOCUMENT_ANALYSIS_RESERVE_MS))
    : RESEARCH_DOCUMENT_ANALYSIS_RESERVE_MS;
  maxConcurrentDocumentOpens = Math.min(
    RESEARCH_DOCUMENT_MAX_CONCURRENCY,
    Math.max(1, Number.isInteger(maxConcurrentDocumentOpens)
      ? maxConcurrentDocumentOpens
      : RESEARCH_DOCUMENT_MAX_CONCURRENCY),
  );
  if (!apiKey && !retrievalOnly) {
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
  const extractionConfig = findingsFirst ? findingsOptions.config ?? findingsConfig() : null;
  const extractionRunBudget = findingsFirst && !retrievalOnly
    ? (findingsOptions.tokenBudget ?? defaultFindingsTokenBudget).begin(extractionConfig)
    : null;
  if (extractionRunBudget) {
    try { extractionRunBudget.reserve(extractionConfig.discoveryTokens); }
    catch (error) { extractionRunBudget.finish(); throw error; }
  }
  const controller = new AbortController();
  const deadlineState = { expired: false };
  const runStartedAtMs = Date.now();
  const phaseTiming = {
    runStartedAt: auditStartedAt ?? new Date(runStartedAtMs).toISOString(),
    discoveryStartedAt: null,
    discoveryFinishedAt: null,
    orchestrationStartedAt: null,
    orchestrationFinishedAt: null,
    cancellationAt: null,
  };
  const externalSignal = signal;
  const abortFromRequest = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromRequest, { once: true });
  if (externalSignal?.aborted) controller.abort();
  const timeout = setTimeout(() => {
    deadlineState.expired = true;
    phaseTiming.cancellationAt = new Date().toISOString();
    controller.abort();
  }, researchTimeoutMs);
  const runCorrelationId = requestedRunCorrelationId ?? randomUUID();
  const analysisTracker = { inFlight: 0, peak: 0, attempts: [] };
  const fetchedCandidatesByCategory = new Map();
  const reservedCandidatesByCategory = new Map();
  let reservedCandidateCount = 0;
  const openedDocumentsByCanonicalUrl = new Map();
  const documentAccessPromisesByCanonicalUrl = new Map();
  const discoveryAttemptedCategories = new Set();
  const secAttemptedCategories = new Set();
  let activeDocumentOpens = 0;
  const documentOpenWaiters = [];
  const acquireDocumentOpenSlot = async (openSignal) => {
    if (openSignal?.aborted) throw createResearchCancellationError();
    if (activeDocumentOpens < maxConcurrentDocumentOpens) {
      activeDocumentOpens += 1;
      return;
    }
    await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal: openSignal, onAbort: null };
      waiter.onAbort = () => {
        const index = documentOpenWaiters.indexOf(waiter);
        if (index >= 0) documentOpenWaiters.splice(index, 1);
        reject(createResearchCancellationError());
      };
      openSignal?.addEventListener("abort", waiter.onAbort, { once: true });
      documentOpenWaiters.push(waiter);
    });
    if (openSignal?.aborted) {
      releaseDocumentOpenSlot();
      throw createResearchCancellationError();
    }
  };
  const releaseDocumentOpenSlot = () => {
    const next = documentOpenWaiters.shift();
    if (next) {
      next.signal?.removeEventListener("abort", next.onAbort);
      next.resolve();
    } else {
      activeDocumentOpens = Math.max(0, activeDocumentOpens - 1);
    }
  };
  const withResearchTimeSlice = async (operation, maximumMs = documentTimeoutMs) => {
    const availableMs = researchTimeoutMs - (Date.now() - runStartedAtMs) - analysisReserveMs;
    if (availableMs <= 0) throw createResearchBudgetError("analysis-budget-reserved");
    const sliceMs = Math.max(1, Math.min(maximumMs, availableMs));
    const localController = new AbortController();
    const abortFromRun = () => localController.abort(controller.signal.reason);
    controller.signal.addEventListener("abort", abortFromRun, { once: true });
    let timedOut = false;
    const localTimeout = setTimeout(() => {
      timedOut = true;
      localController.abort(Object.assign(new Error("Document access time slice expired."), { name: "TimeoutError" }));
    }, sliceMs);
    try {
      const operationPromise = Promise.resolve().then(() => operation(localController.signal));
      return await awaitWithResearchSignal(operationPromise, localController.signal);
    } catch (error) {
      if (timedOut && !controller.signal.aborted) throw createResearchBudgetError("time-slice", sliceMs);
      throw error;
    } finally {
      clearTimeout(localTimeout);
      controller.signal.removeEventListener("abort", abortFromRun);
    }
  };
  const withDocumentOpenBudget = async (operation) => {
    let acquired = false;
    return withResearchTimeSlice(async (openSignal) => {
      await acquireDocumentOpenSlot(openSignal);
      acquired = true;
      try {
        return await operation(openSignal);
      } finally {
        if (acquired) {
          acquired = false;
          releaseDocumentOpenSlot();
        }
      }
    });
  };
  const siteBoilerplateTracker = new Map();
  const openDocumentWithBudget = async (source) => {
    try {
      return await withDocumentOpenBudget((openSignal) => accessResearchDocument(source, {
        fetchImpl: documentFetchImpl,
        dnsLookup,
        signal: openSignal,
        ocrImpl,
        siteBoilerplateTracker,
      }));
    } catch (error) {
      if (error?.name !== "ResearchBudgetExceededError") throw error;
      const deferred = error.researchBudgetReason === "analysis-budget-reserved";
      return {
        ...evaluateResearchDocumentAccess(source),
        state: deferred ? "not-attempted" : "blocked",
        reason: deferred ? "analysis-budget-reserved" : "document-time-slice",
        extractionLimitations: [deferred
          ? "Document access was deferred to preserve the remaining structured-analysis budget."
          : "The document did not finish within its bounded access time slice."],
        transportDiagnostic: {
          stage: deferred ? "analysis-budget-reserved" : "document-time-slice",
          elapsedMs: error.timeSliceMs ?? null,
        },
      };
    }
  };
  let fetchedCandidateCount = 0;
  let physicalOpensUsed = 0;
  let physicalOpenBudgetExceeded = false;
  const physicalOpenScheduler = createPhysicalOpenScheduler({
    maxPhysicalOpens: researchBudget.maxPhysicalDocumentOpens,
    activeCategoryIds: buildResearchCategoryPlan(project).categories
      .filter((category) => !Array.isArray(categoryIds) || !categoryIds.length || categoryIds.includes(category.categoryId))
      .map((category) => category.categoryId),
  });
  const authorizePhysicalOpen = (details = {}) => {
    const authorization = physicalOpenScheduler.authorize(details);
    physicalOpensUsed = physicalOpenScheduler.used;
    if (authorization.reason === "physical-open-budget") physicalOpenBudgetExceeded = true;
    if (authorization.allowed && !authorization.reused) {
      canaryDiagnosticCollector?.recordPhysicalOpenAuthorization?.({
        categoryId: details.categoryId,
        source: {
          ...details.source,
          acquisitionSelected: true,
          acquisitionSelectionReason: "physical-open-authorized",
        },
        canonicalUrl: details.canonicalUrl,
        physicalOpenIndex: authorization.physicalOpenIndex,
      });
    }
    return authorization;
  };
  const activeCategoryIds = buildResearchCategoryPlan(project).categories
    .filter((category) => !Array.isArray(categoryIds) || !categoryIds.length || categoryIds.includes(category.categoryId))
    .map((category) => category.categoryId);
  const declaredProjectEndpointCandidates = (project.knownData?.knownOfficialEndpoints ?? [])
    .map((url, index) => ({
      url,
      discoveryCandidateUrl: url,
      title: "Supplied official project endpoint",
      sourceChannel: "submitted-project-endpoint",
      sourceType: "declared-project-endpoint",
      categoryIds: activeCategoryIds,
      searchDomain: "project-identity",
      discoveryCandidateRank: index + 1,
    }));
  const openedGoogleDocuments = [];
  const retainedDocumentReceipts = [];
  const documentAuditReceipts = [];
  const prefetchGoogleGroundedSources = async (candidates) => {
    const rankedCandidates = rankAcquisitionCandidates(
      Array.isArray(candidates) ? candidates : [],
      project,
    );
    const identityOpportunityIndex = activeCategoryIds.includes("project-identity")
      ? rankedCandidates.findIndex((source) => {
        const categories = Array.isArray(source.categoryIds) ? source.categoryIds : [];
        const routedCategory = categories.find((categoryId) => activeCategoryIds.includes(categoryId))
          ?? "project-identity";
        return routedCategory === "project-identity";
      })
      : -1;
    if (identityOpportunityIndex > 0) {
      rankedCandidates.unshift(rankedCandidates.splice(identityOpportunityIndex, 1)[0]);
      rankedCandidates.forEach((source, index) => { source.acquisitionRank = index + 1; });
    }
    const boundedRankedCandidates = rankedCandidates.map((source, index) => ({
      ...source,
      acquisitionCandidateSelected: index < researchBudget.maxTotalCandidates,
      candidateLimitSelected: index < researchBudget.maxTotalCandidates,
      acquisitionSelected: false,
      acquisitionSelectionReason: index < researchBudget.maxTotalCandidates
        ? "awaiting-physical-open-admission"
        : "candidate-limit",
    }));
    canaryDiagnosticCollector?.recordDiscoveryCandidates?.(boundedRankedCandidates);
    const openedCandidates = await Promise.all(boundedRankedCandidates.map(async (source) => {
      throwIfResearchCancelled(controller.signal);
      const candidateRank = source.discoveryCandidateRank;
      const originalUrl = source.discoveryCandidateUrl ?? source.originalUrl ?? source.url ?? null;
      const originalCanonicalUrl = canonicalizeSourceUrl(originalUrl);
      const announcedCanonicalUrl = canonicalizeSourceUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url);
      if (!source.acquisitionCandidateSelected) {
        const accessOutcome = {
          state: "not-attempted",
          reason: "candidate-limit",
          attempted: false,
          originalUrl,
          resolvedUrl: source.resolvedUrl ?? null,
          canonicalUrl: announcedCanonicalUrl,
          referringUrls: [originalUrl].filter(Boolean),
          extractionLimitations: [
            "The candidate remained auditable but was not selected within the governed candidate limit.",
          ],
        };
        const deferredSource = {
          ...source,
          originalUrl,
          accessOutcome,
          acquisitionSelected: false,
          acquisitionSelectionReason: "candidate-limit",
          documentAccessReused: false,
          physicalOpenAdmission: "not-selected",
          accessibilityState: accessOutcome.state,
          parsingState: "not-attempted",
          retainedPassageOutcome: discoveryCandidateRetentionOutcome({ ...source, accessOutcome }),
        };
        documentAuditReceipts.push(deferredSource);
        canaryDiagnosticCollector?.recordPhysicalReceipt?.({
          phase: "grounded-discovery-prefetch",
          candidateIndex: candidateRank,
          categoryId: source.searchDomain ?? null,
          candidate: deferredSource,
          accessOutcome,
          attempted: false,
          reused: false,
        });
        return deferredSource;
      }
      const previousAccess = (originalCanonicalUrl && (
        openedDocumentsByCanonicalUrl.get(originalCanonicalUrl)
        ?? documentAccessPromisesByCanonicalUrl.get(originalCanonicalUrl)
      ))
        || (announcedCanonicalUrl && (
          openedDocumentsByCanonicalUrl.get(announcedCanonicalUrl)
          ?? documentAccessPromisesByCanonicalUrl.get(announcedCanonicalUrl)
        ))
        || null;
      let accessOutcome;
      let documentAccessReused = false;
      let physicalOpenAdmission = "authorized";
      let acquisitionSelected = true;
      let acquisitionSelectionReason = "physical-open-authorized";
      if (previousAccess) {
        const reusedAccess = await previousAccess;
        accessOutcome = {
          ...reusedAccess,
          reused: true,
          referringUrls: [...new Set([
            ...(Array.isArray(reusedAccess?.referringUrls) ? reusedAccess.referringUrls : []),
            originalUrl,
          ].filter(Boolean))],
        };
        documentAccessReused = true;
        physicalOpenAdmission = "reused-receipt";
        acquisitionSelectionReason = "existing-receipt-reused";
      } else {
        const categoryId = (Array.isArray(source.categoryIds)
          ? source.categoryIds.find((candidate) => activeCategoryIds.includes(candidate))
          : null)
          ?? "project-identity";
        const authorization = authorizePhysicalOpen({
          categoryId,
          canonicalUrl: announcedCanonicalUrl ?? originalUrl,
          source,
        });
        if (!authorization.allowed) {
          physicalOpenAdmission = "deferred";
          acquisitionSelected = false;
          acquisitionSelectionReason = authorization.reason;
          accessOutcome = {
            state: "not-attempted",
            reason: authorization.reason,
            attempted: false,
            originalUrl,
            resolvedUrl: null,
            canonicalUrl: announcedCanonicalUrl,
            referringUrls: [originalUrl].filter(Boolean),
            extractionLimitations: [
              authorization.reason === "physical-open-budget"
                ? "The hard physical document-open ceiling was reached; no additional document was fetched."
                : "The document was deferred so protected source-acquisition roles retain an opportunity.",
          ],
          };
        } else if (authorization.reused) {
          physicalOpenAdmission = "reused-receipt";
          documentAccessReused = true;
          acquisitionSelectionReason = "existing-physical-open-receipt-reused";
          accessOutcome = {
            ...physicalOpenScheduler.getReceipt(announcedCanonicalUrl ?? originalUrl),
            state: "not-attempted",
            reason: "physical-open-receipt-reused-without-document-access-receipt",
            attempted: false,
            reused: true,
            originalUrl,
            resolvedUrl: announcedCanonicalUrl,
            canonicalUrl: announcedCanonicalUrl,
            referringUrls: [originalUrl].filter(Boolean),
            extractionLimitations: [
              "This canonical source already has a physical-open receipt, but no reusable document-access receipt was retained.",
            ],
          };
        } else {
          const physicalOpenIndex = authorization.physicalOpenIndex;
          const accessTask = openDocumentWithBudget(source)
            .then((outcome) => ({
              ...outcome,
              attempted: true,
              physicalOpenIndex,
              originalUrl,
              referringUrls: [...new Set([...(outcome.referringUrls ?? []), originalUrl].filter(Boolean))],
            }));
          if (originalCanonicalUrl) documentAccessPromisesByCanonicalUrl.set(originalCanonicalUrl, accessTask);
          if (announcedCanonicalUrl) documentAccessPromisesByCanonicalUrl.set(announcedCanonicalUrl, accessTask);
          accessOutcome = await accessTask;
        }
        if (originalCanonicalUrl) openedDocumentsByCanonicalUrl.set(originalCanonicalUrl, accessOutcome);
        if (announcedCanonicalUrl) openedDocumentsByCanonicalUrl.set(announcedCanonicalUrl, accessOutcome);
        const finalCanonicalUrl = canonicalizeSourceUrl(accessOutcome.canonicalUrl ?? accessOutcome.resolvedUrl ?? announcedCanonicalUrl);
        if (finalCanonicalUrl) {
          openedDocumentsByCanonicalUrl.set(finalCanonicalUrl, accessOutcome);
          physicalOpenScheduler.registerReceipt({ canonicalUrl: finalCanonicalUrl, receipt: accessOutcome });
        }
      }
      const openedSource = {
        ...source,
        ...choosePublicationMetadata(accessOutcome, source),
        discoveryCandidateRank: candidateRank,
        originalUrl,
        canonicalUrl: source.canonicalIdentityExplicit === true
          ? announcedCanonicalUrl
          : canonicalizeSourceUrl(accessOutcome.canonicalUrl ?? accessOutcome.resolvedUrl ?? announcedCanonicalUrl) ?? announcedCanonicalUrl,
        resolvedUrl: accessOutcome.resolvedUrl ?? accessOutcome.canonicalUrl ?? announcedCanonicalUrl,
        accessOutcome,
        documentAccessReused,
        physicalOpenAdmission,
        acquisitionSelected,
        acquisitionSelectionReason,
        documentReferringUrls: accessOutcome.referringUrls ?? [originalUrl].filter(Boolean),
        accessibilityState: accessOutcome.state,
        parsingState: accessOutcome.state === "accessible" ? "parsed" : "failed",
        ...(accessOutcome.passage ? { excerpt: accessOutcome.passage, claimPassage: accessOutcome.passage } : {}),
        ...(NON_RETAINED_DOCUMENT_OUTCOMES.has(accessOutcome.state) ? { excerpt: null, claimPassage: null } : {}),
      };
      openedSource.retainedPassageOutcome = discoveryCandidateRetentionOutcome(openedSource);
      documentAuditReceipts.push(openedSource);
      if (hasRetrievedPassage(openedSource)) retainedDocumentReceipts.push(openedSource);
      canaryDiagnosticCollector?.recordPhysicalReceipt?.({
        phase: "grounded-discovery-prefetch",
        candidateIndex: candidateRank,
        categoryId: source.searchDomain ?? null,
        candidate: openedSource,
        accessOutcome,
        attempted: Number.isInteger(accessOutcome.physicalOpenIndex)
          && !documentAccessReused
          && accessOutcome.reused !== true,
        reused: documentAccessReused,
      });
      return openedSource;
    }));
    openedCandidates.forEach((openedSource) => {
      openedGoogleDocuments.push(openedSource);
    });
    return openedGoogleDocuments;
  };
  let activeSecConnector = secConnector;
  if (!retrievalOnly && !activeSecConnector && useDefaultSecConnector && process.env.SEC_USER_AGENT) {
    activeSecConnector = createSecConnector({
      userAgent: process.env.SEC_USER_AGENT,
      cache: SEC_CONNECTOR_CACHE,
      fetchImpl: async (url, init) => {
        const authorization = authorizePhysicalOpen();
        if (!authorization.allowed) throw new Error("physical-open-budget");
        return fetchPinnedPublicUrl(url, { ...init, signal: init.signal ?? controller.signal }, dnsLookup);
      },
    });
  }
  let googleRequestCount = 0;
  let googleDiscovery = {
    status: googleApiKey || googleDiscoveryImpl !== discoverGoogleGroundedProject ? "pending" : "not-configured",
    provider: "google-gemini-grounding",
    model: googleModel,
    queries: [],
    candidates: [],
    fallbackUsed: false,
    fallbackReason: googleApiKey || googleDiscoveryImpl !== discoverGoogleGroundedProject
      ? null
      : "google-not-configured",
  };
  if (googleApiKey || googleDiscoveryImpl !== discoverGoogleGroundedProject) {
    googleRequestCount = 1;
    phaseTiming.discoveryStartedAt = new Date().toISOString();
    try {
      extractionRunBudget?.issued();
      const discovery = await googleDiscoveryImpl({
        project,
        apiKey: googleApiKey,
        fetchImpl: findingsFirst ? boundedFindingsDiscoveryFetch(fetchImpl, extractionConfig) : fetchImpl,
        signal: controller.signal,
        model: googleModel,
        ...(typeof googleDiscoveryPrompt === "string" && googleDiscoveryPrompt.trim()
          ? { prompt: googleDiscoveryPrompt }
          : {}),
        analysisTracker,
      });
      extractionRunBudget?.usage(discovery.providerAttempt?.usage ?? null);
      const discoveredCandidates = Array.isArray(discovery.candidates) ? discovery.candidates : [];
      const discoveredUrls = new Set(discoveredCandidates
        .map((source) => canonicalizeSourceUrl(source?.url ?? source?.canonicalUrl ?? source?.resolvedUrl))
        .filter(Boolean));
      const suppliedCandidates = declaredProjectEndpointCandidates.filter((source) =>
        !discoveredUrls.has(canonicalizeSourceUrl(source.url)));
      const groundedSources = await prefetchGoogleGroundedSources([
        ...discoveredCandidates,
        ...suppliedCandidates,
      ]);
      googleDiscovery = {
        ...googleDiscovery,
        ...discovery,
        status: "completed",
        candidates: groundedSources,
        physicalOpenCount: groundedSources.filter((source) => Number.isInteger(source.accessOutcome?.physicalOpenIndex)).length,
      };
    } catch (error) {
      extractionRunBudget?.usage(error?.providerAttempt?.usage ?? null);
      googleDiscovery = {
        ...googleDiscovery,
        status: "technical-failure",
        fallbackUsed: findingsFirst ? false : allowGoogleFallback,
        fallbackReason: classifyResearchFailure(error).type,
        providerAttempt: error?.providerAttempt ?? {
          provider: "google-gemini-grounding",
          model: googleModel,
          requestCount: googleRequestCount,
          outcome: "failed",
          status: error?.providerDiagnostic?.upstreamStatus ?? error?.providerDiagnostic?.status ?? null,
          providerDiagnostic: error?.providerDiagnostic ?? null,
        },
      };
    } finally {
      phaseTiming.discoveryFinishedAt = new Date().toISOString();
    }
  }
  if (googleDiscovery.status === "pending") {
    googleDiscovery.status = "technical-failure";
    googleDiscovery.fallbackUsed = allowGoogleFallback;
    googleDiscovery.fallbackReason = "google-not-configured";
  }
  const canaryIdentityGate = canaryGridIdentityGate
    ? evaluateCanaryGridIdentityGate(googleDiscovery.candidates, project)
    : null;
  let fallbackProjectRequest = null;
  let fallbackRequestConsumed = false;
  let fallbackRequestCost = 0;
  const retryProviderLimitationOnce = async (issue, reserve, retryState = { retryCount: 0, rateLimitWaitMs: 0 }) => {
    if (!allowProviderRetries) return issue();
    try {
      return await issue();
    } catch (error) {
      const outputLimited = error?.researchErrorType === "provider-output-limit";
      if ((!outputLimited && error?.upstreamStatus !== 429)
        || retryState.retryCount >= 1
        || controller.signal.aborted) throw error;
      const retryAfter = error?.providerDiagnostic?.rateLimit?.retryAfter;
      const parsedDelayMs = parseRetryAfterMs(retryAfter);
      const delayMs = outputLimited ? 0 : parsedDelayMs ?? DEFAULT_PROVIDER_RATE_LIMIT_PRESSURE_MS;
      const waitMs = Math.max(delayMs, providerGate.snapshot().blockedUntil - Date.now());
      const deadlineAt = runStartedAtMs + researchTimeoutMs;
      // Reserve time for a response, not just for starting the retry.
      if (Date.now() + waitMs + PROVIDER_RESPONSE_RESERVE_MS >= deadlineAt) {
        error.retrySkippedForDeadline = true;
        error.retrySkippedReason = "deadline";
        throw error;
      }
      if (reserve?.() !== true) {
        error.retrySkippedReason = "provider-request-budget";
        if (error.providerAttempt) error.providerAttempt.retrySkippedReason = "provider-request-budget";
        throw error;
      }
      retryState.retryCount = 1;
      retryState.outputLimitRetry = outputLimited;
      retryState.rateLimitWaitMs = Math.max(0, retryState.rateLimitWaitMs ?? 0) + waitMs;
      if (error.providerAttempt) {
        error.providerAttempt.retryAfterMs = parsedDelayMs;
        error.providerAttempt.retryAfterWaitMs = waitMs;
      }
      if (waitMs > 0) {
        await awaitWithResearchSignal(new Promise((resolve) => setTimeout(resolve, waitMs)), controller.signal);
      }
      if (Date.now() + PROVIDER_RESPONSE_RESERVE_MS >= deadlineAt) {
        error.retrySkippedForDeadline = true;
        error.retrySkippedReason = "deadline";
        throw error;
      }
      return issue();
    }
  };
  try {
    if (findingsFirst && !retrievalOnly) {
      const extracted = await extractResearchFindings({
        project, sources: googleDiscovery.candidates, apiKey, fetchImpl,
        signal: controller.signal, deadlineAt: runStartedAtMs + researchTimeoutMs,
        providerGate, runBudget: extractionRunBudget, config: extractionConfig,
        evidenceIds: RESEARCH_EVIDENCE_IDS,
      });
      const financialExecutions = Object.fromEntries(buildResearchCategoryPlan(project).categories.map((category) => [
        category.categoryId, {
          state: "Not assessed", executionOutcome: "not-run", analysisOutcome: "not-assessed",
          primaryAnalysisCompleted: false, providerRequestCount: 0, providerAttempts: [],
          issuedPrimaryQuery: null, issuedFollowUpQuery: null,
          notRunReason: "financial-mapping-not-run", followUpSkipReason: "financial-mapping-not-run",
          unresolvedGaps: category.evidenceIds,
        },
      ]));
      const attempts = [...(googleDiscovery.providerAttempt ? [googleDiscovery.providerAttempt] : []),
        ...extracted.audit.providerAttempts];
      const reasons = [...new Set(Object.values(extracted.topicCoverage)
        .filter((topic) => topic.state === "not-analyzed").map((topic) => topic.reason))];
      if (deadlineState.expired) reasons.push("deadline");
      if (externalSignal?.aborted === true) reasons.push("requesting-client-cancelled");
      if (googleDiscovery.status === "technical-failure") reasons.push("discovery-failed");
      const coverage = {
        provider: "findings-first", model: "gpt-6.1-sol", reasoningEffort: "low",
        runtime: releaseIdentity, runCorrelationId,
        startedAt: new Date(runStartedAtMs).toISOString(), finishedAt: new Date().toISOString(),
        elapsedMs: Math.max(0, Date.now() - runStartedAtMs),
        categoryExecutions: financialExecutions, requestedCategoryIds: RESEARCH_CATEGORY_ORDER,
        providerAttempts: attempts, providerRequestCount: issuedProviderAttemptCount(attempts),
        physicalOpensUsed: physicalOpensUsed,
        googleDiscovery, terminalReasonCodes: reasons,
        discoveryProvider: googleDiscovery.provider, discoveryModel: googleDiscovery.model,
        discoveryStatus: googleDiscovery.status, discoveryQueries: googleDiscovery.queries,
        discoveryRequestedQueryPlan: googleDiscovery.requestedQueryPlan ?? [],
        discoveryState: googleDiscovery.groundingSearchExecuted ? "search-executed" : "provider-response-without-search-proof",
        discoveryCandidateCount: googleDiscovery.candidates.length,
        deadlineAt: new Date(runStartedAtMs + researchTimeoutMs).toISOString(),
        phaseTiming,
        terminalState: reasons.length ? RESEARCH_OUTCOMES.TECHNICAL : RESEARCH_OUTCOMES.NO_ELIGIBLE,
      };
      const parsed = parseResearchResponse(
        createPartialResearchBody(project), googleDiscovery.candidates,
        new Date().toISOString().slice(0, 10), coverage, projectClaimValidationContext(project),
      );
      parsed.findings = extracted.findings;
      parsed.topicCoverage = extracted.topicCoverage;
      parsed.reportedFindings = reportedFindingsFromVerifiedFindings(extracted.findings);
      parsed.researchAudit.findingsExtraction = {
        ...extracted.audit, tokenBudget: extractionRunBudget.snapshot(),
        expectedCallMs: extractionConfig.expectedCallMs, inputTokenBudget: extractionConfig.inputTokens,
      };
      parsed.researchAudit.providerAttempts = attempts;
      parsed.researchAudit.providerRequestCount = coverage.providerRequestCount;
      parsed.researchAudit.terminalReasonCodes = reasons;
      parsed.researchAudit.terminalState = coverage.terminalState;
      parsed.researchOutcome = { state: coverage.terminalState, eligibleEvidenceCount: 0,
        reportedFindingCount: extracted.findings.length, reasonCodes: reasons };
      parsed.researchStatus = reasons.length ? "partial" : "completed";
      parsed.providerAttempts = attempts;
      return markFinancialMappingNotRun(parsed);
    }
    phaseTiming.orchestrationStartedAt = new Date().toISOString();
    phaseTiming.orchestrationBudgetMs = Math.max(
      0,
      researchTimeoutMs - (Date.now() - runStartedAtMs),
    );
    const orchestration = await orchestrateCategoryResearch(project, {
      onCategoryFailure: (details) => canaryDiagnosticCollector?.recordEngineFailure?.(details),
      budget: {
        ...researchBudget,
        deadlineMs: phaseTiming.orchestrationBudgetMs,
        maxProviderRequests: Math.max(0, researchBudget.maxProviderRequests - googleRequestCount),
      },
      signal: controller.signal,
      deadlineState,
      concurrent: true,
      categoryIds,
      retrievalOnly,
      retrieveCategory: async ({ categoryId, query, attempt, remainingToolCalls, authorizeAdditionalProviderRequest }) => {
        const category = buildResearchCategoryPlan(project).categories.find((candidate) => candidate.categoryId === categoryId);
        const activeCategory = {
          categoryId,
          label: category?.label ?? categoryId,
          query,
          attempt,
          evidenceIds: category?.evidenceIds ?? [],
          runCorrelationId,
          analysisTracker,
          claimTrace,
          maxToolCalls: Math.max(1, Math.min(RESEARCH_PROJECT_MAX_TOOL_CALLS, remainingToolCalls ?? RESEARCH_PROJECT_MAX_TOOL_CALLS)),
        };
        let categoryResult;
        let repairAttempted = false;
        let providerRequestCount = 0;
        let observedToolCallCount = 0;
        const providerAttempts = [];
        const requestCategory = async (options) => {
          const retryState = { retryCount: 0, rateLimitWaitMs: 0 };
          const retryBoundOptions = {
            ...options,
            retryState,
            deadlineAt: runStartedAtMs + researchTimeoutMs,
          };
          const groundedMode = googleDiscovery.status === "completed";
          const fallbackMode = !groundedMode;
           const usableGroundedSources = groundedMode
             ? selectResearchPassagesForStructuredAnalysis(googleDiscovery.candidates)
             : [];
           const categoryUsableGroundedSources = prepareCategoryAnalysisPassages(
             activeCategory, usableGroundedSources, project,
           ).sources;
          const canaryIdentityGate = canaryGridIdentityGate && categoryId === "grid"
            ? evaluateCanaryGridIdentityGate(usableGroundedSources, project)
            : null;
          if (
            canaryIdentityGate
            && !["exact-project", "related-facility"].includes(canaryIdentityGate.state)
          ) {
            return {
              research: createPartialResearchBody(project),
              sources: usableGroundedSources,
              coverage: {
                provider: "google-gemini-grounding",
                model: googleModel,
                providerRequestCount: 0,
                providerAttempts: [],
                searchTerms: googleDiscovery.queries ?? [],
                providerLimitations: ["Grid analysis was not issued because the retained-passage exact-project identity gate was not established."],
                webSearchEnabled: false,
                googleGroundedSourceCount: usableGroundedSources.length,
                noUsableGroundedPassages: usableGroundedSources.length === 0,
                activeCategoryId: categoryId,
                canaryIdentityGate,
              },
            };
          }
          const gridAnalysisSources = canaryIdentityGate
            ? [...new Map([
              ...usableGroundedSources.filter((source) =>
                sourceEstablishesProjectIdentity(source, project)
                || sourceEstablishesRelatedFacilityIdentity(source, project)),
              ...categoryUsableGroundedSources,
            ].map((source) => [
              canonicalizeSourceUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url) ?? source,
              source,
            ])).values()]
            : categoryUsableGroundedSources;
           if (groundedMode && categoryUsableGroundedSources.length === 0) {
             if (
               canaryIdentityGate
               && ["exact-project", "related-facility"].includes(canaryIdentityGate.state)
               && gridAnalysisSources.length > 0
             ) {
                // Verified retained identity context can support the one bounded
                // Grid analysis even when the provider supplied no category labels.
                // Related-facility passages remain facility-scoped, not evidence.
             } else {
             const categoryGroundedSources = googleDiscovery.candidates.filter((source) =>
               categorySourceMatches(activeCategory, source));
             return {
               research: createPartialResearchBody(project),
               sources: categoryGroundedSources,
               coverage: {
                 provider: "google-gemini-grounding",
                 model: googleModel,
                 providerRequestCount: 0,
                 providerAttempts: [],
                 searchTerms: googleDiscovery.queries ?? [],
                 providerLimitations: ["No usable retained Google-grounded passage was available for this category; structured analysis was not issued."],
                 webSearchEnabled: false,
                 googleGroundedSourceCount: 0,
                 noUsableGroundedPassages: true,
                 activeCategoryId: activeCategory?.categoryId ?? null,
                 ...(canaryIdentityGate ? { canaryIdentityGate } : {}),
               },
             };
             }
           }
          const requestOptions = groundedMode
            ? {
              ...retryBoundOptions,
              webSearchEnabled: false,
              ...(canaryIdentityGate?.state === "exact-project"
                ? {
                  includeExactProjectIdentityContext: true,
                  canaryRetainedSourceBoundary: true,
                }
                : {}),
              ...(canaryIdentityGate?.state === "related-facility"
                ? {
                  includeRelatedFacilityIdentityContext: true,
                  canaryRetainedSourceBoundary: true,
                }
                : {}),
              groundedSources: canaryIdentityGate ? gridAnalysisSources : googleDiscovery.candidates,
            }
            : retryBoundOptions;
          if (fallbackMode) {
            if (!allowGoogleFallback) {
              const validationError = new Error("Google grounding failed; OpenAI fallback is disabled for this validation.");
              validationError.name = "GoogleValidationFallbackDisabledError";
              validationError.researchErrorType = "google-validation-fallback-disabled";
              throw validationError;
            }
            if (!fallbackProjectRequest) {
              fallbackProjectRequest = retryProviderLimitationOnce(() => {
                fallbackRequestCost += 1;
                return researchProjectWithWebSearch(
                project,
                apiKey,
                fetchImpl,
                controller.signal,
                {
                  categoryId: null,
                  label: "project-wide fallback",
                  query: buildResearchProjectPrompt(project),
                  attempt: "google-fallback",
                  evidenceIds: RESEARCH_EVIDENCE_IDS,
                  runCorrelationId,
                  analysisTracker,
                  maxToolCalls: RESEARCH_PROJECT_MAX_TOOL_CALLS,
                  retryState,
                  deadlineAt: runStartedAtMs + researchTimeoutMs,
                },
                providerGate,
                ).catch((error) => {
                  if (error.providerAttempt && !providerAttempts.includes(error.providerAttempt)) {
                    providerAttempts.push(error.providerAttempt);
                  }
                  throw error;
                });
              }, authorizeAdditionalProviderRequest, retryState);
            }
            try {
              const result = await fallbackProjectRequest;
              if (!fallbackRequestConsumed) {
                fallbackRequestConsumed = true;
                providerRequestCount += fallbackRequestCost;
              }
              observedToolCallCount += Number.isInteger(result.coverage?.toolCallCount) ? result.coverage.toolCallCount : 0;
              if (result.coverage?.providerAttempt && !providerAttempts.includes(result.coverage.providerAttempt)) {
                providerAttempts.push(result.coverage.providerAttempt);
              }
              return result;
            } catch (error) {
              if (!fallbackRequestConsumed) {
                fallbackRequestConsumed = true;
                providerRequestCount += fallbackRequestCost;
              }
              observedToolCallCount += Number.isInteger(error?.toolCallCount) ? error.toolCallCount : 0;
              if (error?.providerAttempt && !providerAttempts.includes(error.providerAttempt)) {
                providerAttempts.push(error.providerAttempt);
              }
              error.providerRequestCount = providerRequestCount;
              error.providerAttempts = [...providerAttempts];
              throw error;
            }
          }
          const issue = async () => {
            providerRequestCount += 1;
            try {
              const result = await researchProjectWithWebSearch(
                project,
                apiKey,
                fetchImpl,
                controller.signal,
                requestOptions,
                providerGate,
              );
              if (!result.coverage?.providerAttempt?.issuedAt) {
                providerRequestCount = Math.max(0, providerRequestCount - 1);
              }
              return result;
            } catch (error) {
              observedToolCallCount += Number.isInteger(error?.toolCallCount) ? error.toolCallCount : 0;
              if (error?.providerAttempt) providerAttempts.push(error.providerAttempt);
              if (!error?.providerAttempt?.issuedAt) {
                providerRequestCount = Math.max(0, providerRequestCount - 1);
              }
              error.providerRequestCount = providerRequestCount;
              error.providerAttempts = [...providerAttempts];
              throw error;
            }
          };
          try {
            const result = await retryProviderLimitationOnce(issue, authorizeAdditionalProviderRequest, retryState);
            observedToolCallCount += Number.isInteger(result.coverage?.toolCallCount) ? result.coverage.toolCallCount : 0;
            if (result.coverage?.providerAttempt) providerAttempts.push(result.coverage.providerAttempt);
            return result;
          } catch (error) {
            error.providerRequestCount = providerRequestCount;
            error.providerAttempts = [...providerAttempts];
            throw error;
          }
        };
        const validateCategoryResult = (result) => {
          if (result.coverage?.analysisState === "not-assessed-no-admitted-passage-text") {
            claimTrace?.recordUnavailableStructuredResponse?.({
              categoryId,
              providerResponseId: null,
              expectedEvidenceIds: category?.evidenceIds ?? [],
              state: "not-issued",
              reasonCode: "no-admitted-passage-text",
            });
            return;
          }
          const responseId = result.coverage?.providerResponseId
            ?? result.coverage?.providerAttempts?.find((attempt) => attempt?.providerResponseId)?.providerResponseId
            ?? result.coverage?.providerAttempt?.providerResponseId
            ?? null;
          const providerAttemptsForResult = [
            ...(Array.isArray(result.coverage?.providerAttempts) ? result.coverage.providerAttempts : []),
            ...(isRecord(result.coverage?.providerAttempt) ? [result.coverage.providerAttempt] : []),
          ];
          const responseProvider = typeof result.coverage?.provider === "string"
            ? result.coverage.provider.toLowerCase()
            : "";
          const receivedStructuredResponse = responseProvider.startsWith("openai-")
            || providerAttemptsForResult.some((providerAttempt) =>
              providerAttempt?.structuredResponseDiagnostic?.outcome === "received");
          if (receivedStructuredResponse) {
            claimTrace?.recordStructuredReceipt?.({
              categoryId,
              providerResponseId: responseId,
              research: result.research,
              expectedEvidenceIds: category?.evidenceIds ?? [],
            });
          } else {
            const structuredRequestIssued = providerAttemptsForResult.some((providerAttempt) =>
              Boolean(providerAttempt?.issuedAt));
            claimTrace?.recordUnavailableStructuredResponse?.({
              categoryId,
              providerResponseId: responseId,
              expectedEvidenceIds: category?.evidenceIds ?? [],
              state: structuredRequestIssued ? "unavailable" : "not-issued",
              reasonCode: structuredRequestIssued
                ? "no-structured-response-received"
                : "structured-analysis-not-issued",
            });
          }
          const setStructuredDiagnostic = (outcome, validationErrorType = null) => {
            const diagnostic = createStructuredResponseDiagnostic(result.research, {
              outcome,
              validationErrorType,
            });
            for (const providerAttempt of providerAttemptsForResult) {
              if (isRecord(providerAttempt)) providerAttempt.structuredResponseDiagnostic = diagnostic;
            }
          };
          try {
            parseResearchResponse(
              result.research,
              [],
              new Date().toISOString().slice(0, 10),
              result.coverage,
              projectClaimValidationContext(project),
              category?.evidenceIds ?? [],
            );
            if (receivedStructuredResponse) {
              claimTrace?.recordStructuredParseResult?.({
                categoryId,
                providerResponseId: responseId,
                passed: true,
              });
            }
            setStructuredDiagnostic("validated");
          } catch (error) {
            if (receivedStructuredResponse) {
              claimTrace?.recordStructuredParseResult?.({
                categoryId,
                providerResponseId: responseId,
                passed: false,
                reasonCode: "malformed-response",
              });
            }
            if (error instanceof Error) {
              error.name = "ResearchParseError";
              error.researchErrorType = "malformed-response";
            }
            setStructuredDiagnostic("rejected", "malformed-response");
            throw error;
          }
        };
        try {
          categoryResult = await requestCategory(activeCategory);
          categoryResult.requestCount = providerRequestCount;
          categoryResult.coverage.toolCallCount = observedToolCallCount;
          validateCategoryResult(categoryResult);
        } catch (error) {
          if (
            allowCorrectiveRetries
            &&
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
            validateCategoryResult(categoryResult);
          } else {
            const retainedGroundedSources = googleDiscovery.status === "completed"
              ? googleDiscovery.candidates.filter((source) =>
                categorySourceMatches(activeCategory, source)
                && hasRetrievedPassage(source))
              : [];
            if (retainedGroundedSources.length && !externalSignal?.aborted) {
              categoryResult = {
                research: createPartialResearchBody(project),
                sources: retainedGroundedSources,
                coverage: {
                  provider: "google-gemini-grounding",
                  model: googleModel,
                  providerRequestCount,
                  providerAttempts: [...providerAttempts],
                  searchTerms: googleDiscovery.queries ?? [],
                  providerLimitations: [
                    `Structured category analysis failed (${classifyResearchFailure(error).type}); retrieved passages were retained with Missing Evidence pending analysis.`,
                  ],
                  analysisFailureType: classifyResearchFailure(error).type,
                  analysisState: error?.retrySkippedForDeadline ? "not-analyzed-429" : null,
                  activeCategoryId: categoryId,
                  noUsableGroundedPassages: false,
                  toolCallCount: observedToolCallCount,
                },
              };
            } else {
            if (error?.name === "ResearchParseError") {
              error.schemaErrors = [error.message];
              error.partialFindingsRetained = false;
              logProviderDiagnostic(error, { runCorrelationId, categoryId });
            }
            throw error;
            }
          }
        }
        if (canaryIdentityGate && categoryResult?.coverage) {
          categoryResult.coverage.canaryIdentityGate = canaryIdentityGate;
        }
        const discoveryAttempts = [];
        const authorityRecords = [];
        const secAttempts = [];
        const supplementalSources = [];
        if (
          !canaryGridIdentityGate && (
            categoryResult.coverage?.noUsableGroundedPassages === true
            || categoryResult.sources.length === 0
          )
          && !discoveryAttemptedCategories.has(categoryId)
          && !controller.signal.aborted
        ) {
          discoveryAttemptedCategories.add(categoryId);
          const discovery = await discoverOfficialSources({
            projectIdentity: project,
            knownData: project.knownData,
            category: categoryId,
            signal: controller.signal,
            maxAttempts: researchBudget.maxPhysicalDocumentOpens,
            authorizeAttempt: (url) => authorizePhysicalOpen({
              categoryId,
              canonicalUrl: url,
              source: { url, sourceChannel: "official-domain-discovery" },
            }),
            fetchImpl: documentFetchImpl === fetch
              ? (url, init) => fetchPinnedPublicUrl(url, init, dnsLookup)
              : documentFetchImpl,
            withRequestBudget: (operation) => withDocumentOpenBudget(operation),
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
            discoveryCandidateRank: candidate.discoveryCandidateRank,
            acquisitionRank: candidate.acquisitionRank,
            acquisitionPriority: candidate.acquisitionPriority,
            acquisitionReasons: candidate.acquisitionReasons,
            relevanceNote: "Discovered through a bounded official-domain index; the document still requires access, passage retention, and claim mapping.",
          })));
        }
        const secRelevant = ["project-identity", "construction-capital", "tenant-counterparty"].includes(categoryId);
        const secIdentity = project.knownData?.ticker
          || project.knownData?.companyName
          || project.knownData?.operator;
        if (
          !canaryGridIdentityGate
          &&
          activeSecConnector
          && secRelevant
          && secIdentity
          && !secAttemptedCategories.has(categoryId)
          && !controller.signal.aborted
        ) {
          secAttemptedCategories.add(categoryId);
          try {
            const secResult = await withResearchTimeSlice((secSignal) => activeSecConnector.search({
              ticker: project.knownData?.ticker,
              companyName: project.knownData?.companyName ?? project.knownData?.operator,
              projectName: project.name,
              terms: [project.name, ...(project.knownData?.aliases ?? [])],
              maxCandidates: 6,
              signal: secSignal,
            }));
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
              outcome: error?.name === "ResearchBudgetExceededError"
                ? error.researchBudgetReason === "analysis-budget-reserved" ? "skipped-analysis-reserve" : "timed-out"
                : "failed",
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
        const remainingCategory = Math.max(0, researchBudget.maxCandidatesPerCategory - categoryFetched - categoryReserved);
        const remainingTotal = Math.max(0, researchBudget.maxTotalCandidates - fetchedCandidateCount - reservedCandidateCount);
        reservedCandidatesByCategory.set(categoryId, categoryReserved + Math.max(0, remainingCategory));
        reservedCandidateCount += Math.max(0, remainingCategory);
        const boundedSources = categoryResult.sources.slice(0, Math.min(remainingCategory, remainingTotal));
        reservedCandidatesByCategory.set(categoryId, Math.max(0, (reservedCandidatesByCategory.get(categoryId) ?? 0) - boundedSources.length));
        reservedCandidateCount = Math.max(0, reservedCandidateCount - boundedSources.length);
        fetchedCandidatesByCategory.set(categoryId, categoryFetched + boundedSources.length);
        fetchedCandidateCount += boundedSources.length;
        const accessedSources = [];
        for (const source of boundedSources) {
          if (controller.signal.aborted && !deadlineState.expired) throw createResearchCancellationError();
          const originalUrl = source.originalUrl ?? source.url ?? null;
          const originalCanonicalUrl = canonicalizeSourceUrl(originalUrl);
          const announcedCanonicalUrl = canonicalizeSourceUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url);
          const hasProviderCanonicalIdentity = source.canonicalIdentityExplicit === true;
          const previousAccess = (originalCanonicalUrl && (
            openedDocumentsByCanonicalUrl.get(originalCanonicalUrl)
            ?? documentAccessPromisesByCanonicalUrl.get(originalCanonicalUrl)
          ))
            || (announcedCanonicalUrl && (
              openedDocumentsByCanonicalUrl.get(announcedCanonicalUrl)
              ?? documentAccessPromisesByCanonicalUrl.get(announcedCanonicalUrl)
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
            } else {
              const authorization = authorizePhysicalOpen({
                categoryId,
                canonicalUrl: announcedCanonicalUrl ?? originalUrl,
                source,
              });
              if (authorization.reused) {
                const priorReceipt = physicalOpenScheduler.getReceipt(authorization.canonicalUrl);
                accessOutcome = {
                  ...(priorReceipt?.accessOutcome ?? priorReceipt ?? preflight),
                  state: priorReceipt?.accessOutcome?.state ?? priorReceipt?.state ?? "unknown",
                  reused: true,
                  originalUrl,
                  referringUrls: [...new Set([...(priorReceipt?.accessOutcome?.referringUrls ?? priorReceipt?.referringUrls ?? []), originalUrl].filter(Boolean))],
                };
              } else if (!authorization.allowed) {
                accessOutcome = {
                  ...preflight,
                  state: "not-attempted",
                  reason: authorization.reason,
                  originalUrl,
                  resolvedUrl: null,
                  canonicalUrl: announcedCanonicalUrl,
                  referringUrls: [originalUrl].filter(Boolean),
                  extractionLimitations: [authorization.reason === "physical-open-budget"
                    ? "The hard physical document-open ceiling was reached; no additional document was fetched."
                    : "The document was deferred so every protected source-acquisition role receives an opportunity before generic context."],
                };
              } else {
                const physicalOpenIndex = authorization.physicalOpenIndex;
                const accessTask = openDocumentWithBudget(source)
                  .then((outcome) => ({
                    ...outcome,
                    referringUrls: [originalUrl].filter(Boolean),
                    physicalOpenIndex,
                  }));
                if (originalCanonicalUrl) documentAccessPromisesByCanonicalUrl.set(originalCanonicalUrl, accessTask);
                if (announcedCanonicalUrl) documentAccessPromisesByCanonicalUrl.set(announcedCanonicalUrl, accessTask);
                accessOutcome = await accessTask;
                if (accessOutcome.underlyingDocumentUrl) {
                  const underlyingAuthorization = authorizePhysicalOpen({
                    categoryId,
                    canonicalUrl: accessOutcome.underlyingDocumentUrl,
                    source: { ...source, url: accessOutcome.underlyingDocumentUrl },
                  });
                  if (underlyingAuthorization.allowed) {
                    const underlyingOutcome = await openDocumentWithBudget({
                      ...source,
                      url: accessOutcome.underlyingDocumentUrl,
                      originalUrl: accessOutcome.underlyingDocumentUrl,
                      javascriptOnly: false,
                      contentType: null,
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
          if (finalCanonicalUrl) physicalOpenScheduler.registerReceipt({
            canonicalUrl: finalCanonicalUrl,
            receipt: accessOutcome,
          });
          const accessedSource = {
            ...source,
            ...choosePublicationMetadata(accessOutcome, source),
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
            ...(NON_RETAINED_DOCUMENT_OUTCOMES.has(accessOutcome.state)
              ? { excerpt: null, claimPassage: null }
              : {
                ...(accessOutcome.passage ? { excerpt: accessOutcome.passage } : {}),
                ...((accessOutcome.passage ?? source.excerpt) ? { claimPassage: accessOutcome.passage ?? source.excerpt } : {}),
              }),
          };
          canaryDiagnosticCollector?.recordPhysicalReceipt?.({
            phase: "category-source-access",
            candidateIndex: source.discoveryCandidateRank ?? null,
            categoryId,
            candidate: source,
            accessOutcome,
            attempted: Number.isInteger(accessOutcome.physicalOpenIndex)
              && !previousAccess
              && accessOutcome.reused !== true,
            reused: Boolean(previousAccess || accessOutcome.reused),
          });
          accessedSources.push(accessedSource);
          documentAuditReceipts.push(accessedSource);
          if (hasRetrievedPassage(accessedSource)) retainedDocumentReceipts.push(accessedSource);
        }
        const eligibleCount = accessedSources.filter((source) => source.accessOutcome?.state === "accessible").length;
        const observedQueries = normalizeSearchTerms(
          categoryResult.coverage?.searchTerms,
          RESEARCH_PROJECT_MAX_TOOL_CALLS,
        );
           if (categoryResult.coverage?.noUsableGroundedPassages
             && accessedSources.some(hasRetrievedPassage)
             && !controller.signal.aborted
             && Date.now() + 1_000 < runStartedAtMs + researchTimeoutMs
             && authorizeAdditionalProviderRequest?.() === true
           ) {
              const supplementalAnalysis = await retryProviderLimitationOnce(async () => {
               providerRequestCount += 1;
                try {
                  const result = await researchProjectWithWebSearch(
                    project,
                    apiKey,
                    fetchImpl,
                    controller.signal,
                    {
                      ...activeCategory,
                      webSearchEnabled: false,
                      groundedSources: accessedSources,
                    },
                    providerGate,
                  );
                  if (!result.coverage?.providerAttempt?.issuedAt) {
                    providerRequestCount = Math.max(0, providerRequestCount - 1);
                  }
                  return result;
                } catch (error) {
                  if (!error?.providerAttempt?.issuedAt) {
                    providerRequestCount = Math.max(0, providerRequestCount - 1);
                  }
                  throw error;
                }
             }, authorizeAdditionalProviderRequest);
              validateCategoryResult(supplementalAnalysis);
             categoryResult = supplementalAnalysis;
             if (supplementalAnalysis.coverage?.providerAttempt) providerAttempts.push(supplementalAnalysis.coverage.providerAttempt);
           }
         const categoryResponseId = categoryResult.coverage?.providerResponseId
           ?? categoryResult.coverage?.providerAttempts?.find((attempt) => attempt?.providerResponseId)?.providerResponseId
           ?? categoryResult.coverage?.providerAttempt?.providerResponseId
           ?? null;
          const noAdmittedPassageText = categoryResult.coverage?.analysisState
            === "not-assessed-no-admitted-passage-text";
          const parsedCategoryResearch = noAdmittedPassageText
            ? categoryResult.research
            : parseResearchResponse(
              categoryResult.research,
              accessedSources,
              new Date().toISOString().slice(0, 10),
              categoryResult.coverage,
              projectClaimValidationContext(project),
              category?.evidenceIds ?? [],
              {
                claimTrace,
                categoryId,
                providerResponseId: categoryResponseId,
                attemptType: categoryResult.coverage?.attemptType ?? "primary",
                runId: runCorrelationId,
                projectId: project.projectId ?? project.id ?? project.name,
                requestedProject: project,
              },
            );
          if (!noAdmittedPassageText) {
            claimTrace?.recordTransformation?.({
              runId: runCorrelationId,
              projectId: project.projectId ?? project.id ?? project.name,
              categoryId,
              attemptType: categoryResult.coverage?.attemptType ?? "primary",
              providerResponseId: categoryResponseId,
              stage: "normalization-parsing-mapping",
              reason: "The category response was normalized against retained receipts and passed through the shared identity and source-mapping functions.",
              before: categoryResult.research,
              after: parsedCategoryResearch,
            });
          }
          const normalizedCategoryResearch = noAdmittedPassageText
            ? parsedCategoryResearch
            : containResearchResult(parsedCategoryResearch);
          if (!noAdmittedPassageText) {
            claimTrace?.recordTransformation?.({
              runId: runCorrelationId,
              projectId: project.projectId ?? project.id ?? project.name,
              categoryId,
              attemptType: categoryResult.coverage?.attemptType ?? "primary",
              providerResponseId: categoryResponseId,
              stage: "claim-containment",
              reason: "The normalized category response was passed through the existing containment policy.",
              before: parsedCategoryResearch,
              after: normalizedCategoryResearch,
            });
            claimTrace?.recordMappingReceipts?.({
              runId: runCorrelationId,
              projectId: project.projectId ?? project.id ?? project.name,
              categoryId,
              attemptType: categoryResult.coverage?.attemptType ?? "primary",
              attemptId: categoryResult.coverage?.providerAttempt?.attemptId ?? null,
              providerResponseId: categoryResponseId,
              evidence: normalizedCategoryResearch.evidence,
            });
            claimTrace?.recordValidatedEvidence?.({
              categoryId,
              providerResponseId: categoryResponseId,
              evidence: normalizedCategoryResearch.evidence,
              project,
            });
          }
        const categoryResolution = noAdmittedPassageText
          ? { resolved: false, unresolvedEvidenceIds: [...(category?.evidenceIds ?? [])] }
          : categoryResult.coverage?.analysisFailureType
          ? { resolved: false, unresolvedEvidenceIds: category.evidenceIds.length ? [...category.evidenceIds] : [category.categoryId] }
          : categoryResearchIsResolved(
          category,
          normalizedCategoryResearch,
          accessedSources,
          project,
          categoryResult.coverage,
        );
        return {
          candidates: accessedSources,
          eligibleCount,
          gapDrivenFollowUp: !noAdmittedPassageText
            && !categoryResolution.resolved
            && !repairAttempted
            && !categoryResult.coverage?.providerLimitations?.some((message) => /structured category analysis failed/i.test(message)),
          followUpQuery: buildCategoryFollowUpQuery(project, category, categoryResolution.unresolvedEvidenceIds),
          unresolvedEvidenceIds: categoryResolution.unresolvedEvidenceIds,
          resolvedEvidenceIds: category.evidenceIds.filter((id) => !categoryResolution.unresolvedEvidenceIds.includes(id)),
          categoryResolved: categoryResolution.resolved,
          repairAttempted,
          observedQueries,
          toolCallCount: categoryResult.coverage?.toolCallCount ?? 0,
           providerRequestCount,
          analysisState: categoryResult.coverage?.analysisState ?? null,
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
            rawResearch: categoryResult.rawResearch ?? categoryResult.research,
            sources: accessedSources,
            coverage: { ...categoryResult.coverage, providerAttempts, officialDiscoveryAttempts: discoveryAttempts, authorityRecords, secConnectorAttempts: secAttempts },
          },
        };
      },
    });
    phaseTiming.orchestrationFinishedAt = new Date().toISOString();
    const allRetainedReceipts = [
      ...retainedDocumentReceipts,
      ...[...openedDocumentsByCanonicalUrl.values()].map((accessOutcome) => ({
        url: accessOutcome?.canonicalUrl ?? accessOutcome?.resolvedUrl ?? null,
        originalUrl: accessOutcome?.originalUrl ?? null,
        title: accessOutcome?.title ?? null,
        date: accessOutcome?.date ?? null,
        excerpt: accessOutcome?.passage ?? null,
        claimPassage: accessOutcome?.passage ?? null,
        sourceChannel: accessOutcome?.sourceChannel ?? "document-access",
        accessOutcome,
      })),
    ].filter((source, index, sources) => hasRetrievedPassage(source)
      && sources.findIndex((candidate) => canonicalizeSourceUrl(
        candidate.canonicalUrl ?? candidate.url ?? candidate.accessOutcome?.canonicalUrl,
      ) === canonicalizeSourceUrl(source.canonicalUrl ?? source.url ?? source.accessOutcome?.canonicalUrl)) === index);
    for (const category of buildResearchCategoryPlan(project).categories) {
      if ((Array.isArray(categoryIds) && categoryIds.length && !categoryIds.includes(category.categoryId))
        || orchestration.categoryResults.some((result) => result.categoryId === category.categoryId)) continue;
      const retainedSources = allRetainedReceipts.filter((source) => categorySourceMatches(category, source));
      if (!retainedSources.length) continue;
      orchestration.categoryResults.push({
        categoryId: category.categoryId,
        research: createPartialResearchBody(project),
        sources: retainedSources,
        coverage: {
          providerLimitations: ["The run deadline prevented structured category analysis; retrieved passages and their access receipts were retained."],
          categoryExecutions: orchestration.categoryExecutions,
        },
      });
      orchestration.candidates.push(...retainedSources);
    }
    phaseTiming.discoveryElapsedMs = phaseTiming.discoveryStartedAt && phaseTiming.discoveryFinishedAt
      ? Math.max(0, Date.parse(phaseTiming.discoveryFinishedAt) - Date.parse(phaseTiming.discoveryStartedAt))
      : 0;
    phaseTiming.orchestrationElapsedMs = Math.max(
      0,
      Date.parse(phaseTiming.orchestrationFinishedAt) - Date.parse(phaseTiming.orchestrationStartedAt),
    );
    const phaseProviderAttempts = Object.values(orchestration.categoryExecutions)
      .flatMap((execution) => execution?.providerAttempts ?? []);
    phaseTiming.providerQueueElapsedMs = phaseProviderAttempts.reduce(
      (total, attempt) => total + (Number.isFinite(attempt?.queueWaitMs) ? attempt.queueWaitMs : 0),
      0,
    );
    phaseTiming.analysisElapsedMs = phaseProviderAttempts.reduce(
      (total, attempt) => total + (Number.isFinite(attempt?.elapsedMs) ? attempt.elapsedMs : 0),
      0,
    );
    const physicalReceipts = new Map();
    for (const source of [...openedGoogleDocuments, ...orchestration.candidates]) {
      const access = source?.accessOutcome;
      if (!Number.isInteger(access?.physicalOpenIndex) || physicalReceipts.has(access.physicalOpenIndex)) continue;
      physicalReceipts.set(access.physicalOpenIndex, access);
    }
    phaseTiming.retrievalElapsedMs = [...physicalReceipts.values()].reduce(
      (total, access) => total + (Number.isFinite(access?.transportDiagnostic?.elapsedMs)
        ? access.transportDiagnostic.elapsedMs
        : 0),
      0,
    );
    phaseTiming.totalElapsedMs = Math.max(0, Date.now() - runStartedAtMs);
    if (
      !orchestration.categoryResults.length
      && orchestration.lastError?.name === "UpstreamRequestError"
    ) {
      throw orchestration.lastError;
    }
    const mergedResearch = orchestration.categoryResults.length
      ? mergeCategoryResearchResults(project, orchestration.categoryResults, claimTrace)
      : createPartialResearchBody(project);
    if (!mergedResearch) throw new Error("Category research did not return a complete structured response.");
    const categoryExecutions = Object.values(orchestration.categoryExecutions);
    const categoryFailureObserved = orchestration.lastError
      || categoryExecutions.some((execution) =>
        ["Provider failure", "Timed out"].includes(execution?.state)
        || Boolean(execution?.providerFailureType));
    const deadlineCancelledOptionalFollowUp = categoryExecutions.some((execution) =>
      execution?.followUpCancellationReason === "deadline");
    const clientCancelledOptionalFollowUp = categoryExecutions.some((execution) =>
      execution?.followUpCancellationReason === "requesting-client-cancelled");
    const optionalFollowUpFailureAfterPrimary = categoryExecutions.some((execution) =>
      execution?.primaryAnalysisCompleted === true
      && execution?.followUpAttemptState === "failed");
    const technicalReasonCodes = technicalReasonCodesForRun({
      orchestration, deadlineState, clientDisconnected: externalSignal?.aborted === true,
    });
    const notAssessedCategoryCount = categoryExecutions.filter((execution) =>
      execution?.state === "Not assessed"
      || execution?.analysisOutcome === "not-assessed").length;
    const terminalState = technicalReasonCodes.length
      ? RESEARCH_OUTCOMES.TECHNICAL
      : notAssessedCategoryCount > 0
        ? RESEARCH_OUTCOMES.NOT_ASSESSED
        : RESEARCH_OUTCOMES.NO_ELIGIBLE;
    const researchStatus = terminalState === RESEARCH_OUTCOMES.NO_ELIGIBLE ? "completed" : "partial";
    const providerAttemptsForRun = [...new Set([
      ...(googleDiscovery.providerAttempt ? [googleDiscovery.providerAttempt] : []),
      ...analysisTracker.attempts,
      ...Object.values(orchestration.categoryExecutions).flatMap((execution) => execution?.providerAttempts ?? []),
    ])].slice(0, MAX_RESEARCH_PROVIDER_ATTEMPT_RECORDS);
    const providerResponseIds = [...new Set([
      ...orchestration.categoryResults.map((category) => category.coverage?.providerResponseId),
      ...providerAttemptsForRun.map((attempt) => attempt?.providerResponseId),
    ].map(normalizeProviderResponseId).filter(Boolean))].slice(0, MAX_RESEARCH_PROVIDER_RESPONSE_IDS);
    const providerLimitations = [
      ...orchestration.categoryResults.flatMap((category) => category.coverage?.providerLimitations ?? []),
      ...(deadlineCancelledOptionalFollowUp
        ? ["The overall run deadline cancelled an optional follow-up before it was issued; the completed primary result was retained."]
        : []),
      ...(clientCancelledOptionalFollowUp
        ? ["The requesting client cancelled an optional follow-up before it was issued; the completed primary result was retained."]
        : []),
      ...(optionalFollowUpFailureAfterPrimary
        ? ["An optional follow-up failed after primary analysis completed; primary findings were retained and unresolved evidence remains Missing Evidence."]
        : []),
      ...(categoryFailureObserved
        && !deadlineCancelledOptionalFollowUp
        && !clientCancelledOptionalFollowUp
        && !optionalFollowUpFailureAfterPrimary
        ? ["One or more category responses were invalid or unavailable; affected evidence remains Missing Evidence."]
        : []),
    ].slice(0, 12);
    const result = {
      research: mergedResearch,
      sources: [
        ...orchestration.categoryResults.flatMap((category) => category.sources ?? []),
        ...allRetainedReceipts,
      ],
      coverage: {
        ...(orchestration.categoryResults[0]?.coverage ?? {}),
        searchedDomains: [...new Set([
          ...orchestration.categoryResults.flatMap((category) => category.coverage?.searchedDomains ?? []),
          ...googleDiscovery.candidates.map((source) => sourceHostname(source)).filter(Boolean),
        ])],
        searchTerms: [...new Set([
          ...googleDiscovery.queries,
          ...orchestration.categoryResults.flatMap((category) => category.coverage?.searchTerms ?? []),
        ])],
        toolCallCount: orchestration.toolCalls,
        observedToolCallCount: orchestration.categoryResults.reduce((total, category) => total + (category.coverage?.observedToolCallCount ?? category.coverage?.toolCallCount ?? 0), 0),
        acceptedToolCallCount: orchestration.toolCalls,
        budget: { ...researchBudget },
        physicalOpenBudget: researchBudget.maxPhysicalDocumentOpens,
        physicalOpensUsed,
        physicalOpensRemaining: Math.max(0, researchBudget.maxPhysicalDocumentOpens - physicalOpensUsed),
        physicalOpenBudgetExceeded: orchestration.physicalOpenBudgetExceeded,
        providerRequestCount: issuedProviderAttemptCount(providerAttemptsForRun),
        providerAttempts: providerAttemptsForRun,
        inFlightAnalysisCount: analysisTracker.inFlight,
        peakInFlightAnalysisCount: analysisTracker.peak,
        followUpCount: orchestration.followUps,
        followUpLimit: orchestration.followUpLimit,
        followUpLimitPerCategory: orchestration.followUpLimitPerCategory,
        sourcePriorityApplied: sourcePriorityApplied(project),
        toolCallBudgetExceeded: orchestration.toolCallBudgetExceeded,
        providerResponseIds,
        categoryExecutions: orchestration.categoryExecutions,
        providerLimitations,
        discoveryProvider: "google-gemini-grounding",
        discoveryModel: googleModel,
        discoveryStatus: googleDiscovery.status,
         discoveryState: googleDiscovery.usableCitationMetadataPresent
           ? "usable-citations"
           : googleDiscovery.groundingSearchExecuted
             ? "search-executed-no-usable-citations"
             : "provider-response-without-search-proof",
        discoveryQueries: googleDiscovery.queries,
        discoveryRequestedQueryPlan: googleDiscovery.requestedQueryPlan ?? [],
        ...(canaryIdentityGate ? { canaryIdentityGate } : {}),
         discoveryRawAnnotationSummaries: googleDiscovery.rawAnnotationSummaries ?? [],
          discoveryAnnotationCount: googleDiscovery.urlCitationCount ?? googleDiscovery.rawAnnotationSummaries?.length ?? 0,
         discoveryAcceptedCitationUrls: googleDiscovery.acceptedCitationUrls ?? [],
         discoveryRejectedCitationUrls: googleDiscovery.rejectedCitationUrls ?? [],
        discoveryCandidateCount: googleDiscovery.candidates.length,
        discoveryCandidates: googleDiscovery.candidates.map((source) => ({
          discoveryRank: source.discoveryCandidateRank ?? null,
          acquisitionRank: source.acquisitionRank ?? null,
          acquisitionPriority: source.acquisitionPriority ?? null,
          acquisitionReasons: source.acquisitionReasons ?? [],
          candidateLimitSelected: source.acquisitionCandidateSelected === true,
          selectedForOpen: source.acquisitionSelected === true,
          selectionReason: source.acquisitionSelectionReason ?? null,
          physicalOpenAdmission: source.physicalOpenAdmission ?? null,
          discoveryCandidateUrl: source.discoveryCandidateUrl ?? null,
          url: source.canonicalUrl ?? source.url ?? null,
          originalUrl: source.originalUrl ?? source.url ?? null,
          resolvedUrl: source.resolvedUrl ?? null,
          title: source.title ?? null,
          discoveryOriginatingQuery: source.discoveryOriginatingQuery ?? null,
          discoveryQueryAttributionStatus: source.discoveryQueryAttributionStatus ?? "unavailable",
          discoveryCandidateRankWithinQuery: source.discoveryCandidateRankWithinQuery ?? null,
          discoveryQueryRankAvailability: source.discoveryQueryRankAvailability ?? "unavailable",
          discoveryDeduplicationLineage: source.discoveryDeduplicationLineage ?? null,
          referringQueries: source.referringQueries ?? [],
          categoryIds: source.categoryIds ?? [],
          accessOutcome: source.accessOutcome ?? null,
          retainedPassageOutcome: source.retainedPassageOutcome ?? null,
          skipReason: source.accessOutcome?.reason ?? null,
        })),
        retrievalOnlyStop: retrievalOnly ? "discovery-prefetch-complete" : null,
        sourceAttemptRecords: documentAuditReceipts.slice(0, MAX_RESEARCH_SOURCE_ATTEMPT_AUDIT_RECORDS),
        fallbackProvider: googleDiscovery.fallbackUsed ? "openai-web-search" : null,
        fallbackReason: googleDiscovery.fallbackReason,
        fallbackRequestCount: googleDiscovery.fallbackUsed ? 1 : 0,
        terminalReasonCodes: technicalReasonCodes,
        identityPhysicalOpenOpportunityReserved: !Array.isArray(categoryIds)
          || categoryIds.length === 0
          || categoryIds.includes("project-identity"),
        runCorrelationId,
        terminalState,
         startedAt: phaseTiming.runStartedAt,
         deadlineAt: auditDeadlineAt,
         finishedAt: new Date().toISOString(),
         elapsedMs: Math.max(0, Date.now() - runStartedAtMs),
         phaseTiming,
      },
    };
    try {
      const parsed = parseResearchResponse(
        result.research,
        result.sources,
        new Date().toISOString().slice(0, 10),
        result.coverage,
        projectClaimValidationContext(project),
      );
      const eligibleEvidenceCount = parsed.evidence.filter((item) => item.eligibleForModel === true).length;
      parsed.reportedFindings = buildReportedResearchFindings(
        project, orchestration.categoryResults, parsed.evidence.filter((item) => item.eligibleForModel === true),
      );
      const canonicalNotAssessedCount = parsed.researchAudit.categories.filter((category) =>
        category.state === "Not assessed" || category.analysisOutcome === "not-assessed").length;
      const canonicalOutcome = classifyCanonicalResearchOutcome(
        eligibleEvidenceCount,
        technicalReasonCodes,
        canonicalNotAssessedCount,
      );
      const outcomeReasonCodes = canonicalOutcome === RESEARCH_OUTCOMES.NOT_ASSESSED
        ? [parsed.reportedFindings.length > 0 || orchestration.categoryResults.some((category) =>
          (Array.isArray(category.coverage?.categoryPromptTelemetry)
            ? category.coverage.categoryPromptTelemetry
            : [category.coverage?.categoryPromptTelemetry])
            .some((telemetry) => telemetry?.passageCountSent > 0))
          ? "some-categories-not-assessed" : "no-admitted-passage-text"]
        : technicalReasonCodes;
      parsed.researchOutcome = {
        state: canonicalOutcome,
        eligibleEvidenceCount,
        reportedFindingCount: parsed.reportedFindings.length,
        reasonCodes: outcomeReasonCodes,
      };
      parsed.researchAudit.terminalState = canonicalOutcome;
      parsed.researchAudit.terminalReasonCodes = outcomeReasonCodes;
      parsed.researchAudit.candidateLineage = candidateLineageForRun(parsed, orchestration);
      if (retrievalOnly) {
        parsed.researchAudit.retrievalOnlyStop = "discovery-prefetch-complete";
      }
      parsed.researchStatus = canonicalOutcome === RESEARCH_OUTCOMES.TECHNICAL
        || canonicalOutcome === RESEARCH_OUTCOMES.NOT_ASSESSED
        ? "partial"
        : "completed";
      if (canonicalOutcome === RESEARCH_OUTCOMES.TECHNICAL) {
        const primaryTechnicalReason = technicalReasonCodes[0] ?? "upstream";
        const malformedResponseObserved = technicalReasonCodes.includes("malformed-response")
          || (
            orchestration.categoryResults.length === 0
            && orchestration.lastError?.name === "ResearchParseError"
          )
          || Object.values(orchestration.categoryExecutions).some((execution) =>
            execution?.providerFailureType === "malformed-response"
            || /invalid json|structured|schema|missing required/i.test(execution?.providerFailure ?? ""));
        parsed.researchError = {
          type: deadlineState.expired || technicalReasonCodes.some((reason) => [
            "deadline", "timeout", "provider-tpm-deadline",
            "provider-rate-limit-deadline", "provider-deadline-admission",
          ].includes(reason))
            ? "timeout"
            : primaryTechnicalReason === "malformed-response" || malformedResponseObserved
              ? "malformed-response"
              : "upstream",
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
      parsed.cacheable = !retrievalOnly && researchStatus === "completed";
      if (!retrievalOnly && orchestration.categoryResults.length > 0 && !deadlineState.expired) parsed.cacheable = true;
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
    const attempts = analysisTracker.attempts.slice(0, MAX_RESEARCH_PROVIDER_ATTEMPT_RECORDS);
    const requestingClientCancelled = externalSignal?.aborted === true;
    if (requestingClientCancelled) {
      const cancelled = new Error("Project research was cancelled.");
      cancelled.name = "ResearchCancelledError";
      cancelled.researchErrorType = "cancelled";
      cancelled.providerAttempts = attempts;
      cancelled.inFlightAnalysisCount = analysisTracker.inFlight;
      const latestDiagnostic = [...analysisTracker.attempts].reverse()
        .find((attempt) => attempt?.providerDiagnostic)?.providerDiagnostic;
      if (latestDiagnostic) cancelled.providerDiagnostic = latestDiagnostic;
      error = cancelled;
    } else if (
      deadlineState.expired
      && (error?.name === "ResearchCancelledError" || error?.researchErrorType === "cancelled" || error?.name === "AbortError")
    ) {
      error.name = "ResearchDeadlineError";
      error.researchErrorType = "deadline";
      error.deadlineExpired = true;
    }
    for (const attempt of attempts) {
      if (!String(attempt?.requestState ?? "").startsWith("cancelled")) continue;
      attempt.cancellationReason = requestingClientCancelled ? "requesting-client-cancelled" : deadlineState.expired ? "deadline" : null;
      if (attempt.cancellationReason === "deadline") attempt.failureClassification = "timeout";
    }
    if (error && !error.researchErrorType) error.researchErrorType = classifyResearchFailure(error).type;
    phaseTiming.totalElapsedMs = Math.max(0, Date.now() - runStartedAtMs);
    const terminalReasonCodes = requestingClientCancelled
      ? ["requesting-client-cancelled"]
      : [...new Set([
        ...(deadlineState.expired ? ["deadline"] : []),
        error.researchErrorType,
      ])];
    error.researchAudit = buildResearchAudit({
      project,
      sources: documentAuditReceipts,
      coverage: {
        providerAttempts: [...new Set([
          ...(googleDiscovery.providerAttempt ? [googleDiscovery.providerAttempt] : []),
          ...attempts,
        ])].slice(0, MAX_RESEARCH_PROVIDER_ATTEMPT_RECORDS),
        providerRequestCount: issuedProviderAttemptCount([
          ...(googleDiscovery.providerAttempt ? [googleDiscovery.providerAttempt] : []),
          ...attempts,
        ]),
        ...(canaryIdentityGate ? { canaryIdentityGate } : {}),
        discoveryProvider: googleDiscovery.provider ?? "google-gemini-grounding",
        discoveryModel: googleDiscovery.model ?? googleModel,
        discoveryStatus: googleDiscovery.status ?? null,
        discoveryState: googleDiscovery.usableCitationMetadataPresent
          ? "usable-citations"
          : googleDiscovery.groundingSearchExecuted
            ? "search-executed-no-usable-citations"
            : googleDiscovery.status === "technical-failure"
              ? "technical-failure"
              : "provider-response-without-search-proof",
        discoveryQueries: googleDiscovery.queries ?? [],
        discoveryRequestedQueryPlan: googleDiscovery.requestedQueryPlan ?? [],
        discoveryCandidateCount: Array.isArray(googleDiscovery.candidates) ? googleDiscovery.candidates.length : 0,
        discoveryAnnotationCount: googleDiscovery.urlCitationCount ?? googleDiscovery.rawAnnotationSummaries?.length ?? 0,
        discoveryRawAnnotationSummaries: googleDiscovery.rawAnnotationSummaries ?? [],
        discoveryAcceptedCitationUrls: googleDiscovery.acceptedCitationUrls ?? [],
        discoveryRejectedCitationUrls: googleDiscovery.rejectedCitationUrls ?? [],
        categoryExecutions: error.partialCategoryExecutions ?? {},
        inFlightAnalysisCount: analysisTracker.inFlight,
        peakInFlightAnalysisCount: analysisTracker.peak,
        sourceAttemptRecords: documentAuditReceipts.slice(0, MAX_RESEARCH_SOURCE_ATTEMPT_AUDIT_RECORDS),
        deadlineAt: auditDeadlineAt,
        phaseTiming,
        terminalState: RESEARCH_OUTCOMES.TECHNICAL,
        terminalReasonCodes,
      },
      runCorrelationId,
      startedAt: phaseTiming.runStartedAt,
      finishedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    extractionRunBudget?.finish();
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromRequest);
  }
}

/**
 * @typedef {{
 *   runId: string,
 *   projectName: string,
 *   projectLocation: string,
 *   researchStatus: string,
 *   projectSummary: Record<string, unknown>,
 *   audit: Record<string, unknown>,
 *   startedAt?: string | null,
 *   finishedAt?: string | null,
 * }} ResearchRunAuditRecord
 */
/**
 * @typedef {{
 *   startRun?: (record: ResearchRunAuditRecord) => Promise<void>,
 *   finishRun?: (record: ResearchRunAuditRecord) => Promise<void>,
 *   markFinalizationFailed?: (record: ResearchRunAuditRecord) => Promise<void>,
 *   progressRun?: (record: ResearchRunAuditRecord) => Promise<void>,
 *   updateDelivery?: (record: ResearchRunAuditRecord) => Promise<void>,
 *   connectionRetryManaged?: boolean,
 *   save?: (record: ResearchRunAuditRecord) => Promise<void>,
 * }} ResearchAuditRepository
 */
export async function handleResearchProjectRequest(
  req,
  res,
  {
    apiKey = process.env.OPENAI_API_KEY,
    googleApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY,
    googleDiscoveryImpl = discoverGoogleGroundedProject,
    googleModel = GOOGLE_GEMINI_MODEL,
    googleDiscoveryPrompt = null,
    canaryDiagnosticCollector = null,
    allowGoogleFallback = true,
    allowCorrectiveRetries = true,
    fetchImpl = fetch,
    documentFetchImpl = fetch,
    secConnector = null,
    ocrImpl,
    dnsLookup = dns.lookup,
    rateLimiter = defaultRateLimiter,
    cache = defaultResearchProjectCache,
    registry = defaultProjectResearchRegistry,
    auditRepository = null,
    categoryIds = null,
    researchTimeoutMs = RESEARCH_PROJECT_TIMEOUT_MS,
    documentTimeoutMs = RESEARCH_DOCUMENT_TIMEOUT_MS,
    analysisReserveMs = RESEARCH_DOCUMENT_ANALYSIS_RESERVE_MS,
    maxConcurrentDocumentOpens = RESEARCH_DOCUMENT_MAX_CONCURRENCY,
    claimTrace = null,
    researchBudgetOverrides = null,
    allowProviderRetries = true,
    useDefaultSecConnector = true,
    retrievalOnly = false,
    canaryGridIdentityGate = false,
    runId: requestedRunId = null,
    acceptanceCapture = null,
    signal = null,
    providerGate = researchProviderGate,
    findingsFirst = null,
    findingsOptions = {},
  } = {},
) {
  const requestBudget = boundedResearchBudget(researchBudgetOverrides);
  const auditStore = /** @type {ResearchAuditRepository | null} */ (auditRepository);
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
        runId: status.runId,
        initiator: status.initiator,
        requestId: status.requestId,
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
  let requestIdentity;
  let retrievalOnlyRequest = retrievalOnly === true;
  try {
    const requestBody = await readRequestBody(req);
    if (!isRecord(requestBody)) throw new Error("Research project body must be a JSON object.");
    if (requestBody.retrievalOnly !== undefined && typeof requestBody.retrievalOnly !== "boolean") {
      throw new Error('Research field "retrievalOnly" must be a boolean.');
    }
    retrievalOnlyRequest ||= requestBody.retrievalOnly === true;
    requestIdentity = parseResearchRequestIdentity(requestBody);
    project = parseResearchProjectBody(requestBody);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid research project request." });
    return;
  }

  const key = cache.keyFor(project);
  const requestKey = researchRunRequestKey(key, requestIdentity);
  const existingRequest = findResearchRunRequest(requestKey);
  if (existingRequest) {
    try {
      const entry = await existingRequest.promise;
      const contained = { ...entry, result: containResearchResult(entry.result) };
      sendJson(res, 200, withCacheMetadata(contained, cacheMetadata(
        key,
        contained,
        "updated",
        "completed",
        {
          runId: existingRequest.runId,
          initiator: existingRequest.initiator,
          requestId: existingRequest.requestId,
        },
      )));
    } catch (error) {
      const failure = classifyResearchFailure(error);
      sendJson(res, failure.status, {
        error: failure.message,
        errorType: failure.type,
        researchStatus: "failed",
        researchOutcome: {
          state: RESEARCH_OUTCOMES.TECHNICAL,
          eligibleEvidenceCount: 0,
          reasonCodes: [failure.type],
        },
      });
    }
    return;
  }
  const retained = await cache.read(key);
  const containedRetained = retained ? { ...retained, result: containResearchResult(retained.result) } : null;
  const retainedState = retained ? cache.age(retained) : "expired";
  const retainedNeedsRevalidation = retained?.needsRevalidation === true;
  if (!retrievalOnlyRequest && !project.forceRefresh && containedRetained && !retainedNeedsRevalidation && (retainedState === "fresh" || retainedState === "recent")) {
    const priorAudit = containedRetained.result?.researchAudit ?? {};
    sendJson(res, 200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, retainedState, "idle", {
      runId: priorAudit.runCorrelationId,
      initiator: priorAudit.initiator,
      requestId: priorAudit.requestId,
    })));
    return;
  }

  const boundedResearchTimeoutMs = Math.min(
    RESEARCH_PROJECT_TIMEOUT_MS,
    Math.max(1, Number.isFinite(researchTimeoutMs) ? researchTimeoutMs : RESEARCH_PROJECT_TIMEOUT_MS),
  );
  const requestController = new AbortController();
  const abortFromExternalSignal = () => requestController.abort();
  if (signal?.aborted) requestController.abort();
  else signal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  const runPolicyHeader = typeof req.get === "function"
    ? req.get("x-safeloc-research-policy")
    : req.headers?.["x-safeloc-research-policy"];
  const singleShotRun = runPolicyHeader === "single-shot";
  const onRequestAborted = () => requestController.abort();
  req.once?.("aborted", onRequestAborted);
  const responseDelivery = {
    responseStartedAt: null,
    responseFinishedAt: null,
    browserDisconnectedBeforeFinish: false,
    clientDisconnectedAt: null,
  };
  let responseLifecycleAttached = false;
  let responseSettled = false;
  let settleResponse;
  const responseCompletion = new Promise((resolve) => { settleResponse = resolve; });
  const onResponseFinish = () => {
    responseDelivery.responseFinishedAt = new Date().toISOString();
    responseSettled = true;
    settleResponse();
  };
  const onResponseClose = () => {
    if (!res.writableFinished) {
      responseDelivery.browserDisconnectedBeforeFinish = true;
      responseDelivery.clientDisconnectedAt = new Date().toISOString();
      requestController.abort();
    } else if (!responseDelivery.responseFinishedAt) {
      responseDelivery.responseFinishedAt = new Date().toISOString();
    }
    responseSettled = true;
    settleResponse();
  };
  const attachResponseLifecycle = () => {
    if (responseLifecycleAttached || typeof res.once !== "function") return;
    responseLifecycleAttached = true;
    res.once("finish", onResponseFinish);
    res.once("close", onResponseClose);
  };
  const sendTrackedJson = (status, body) => {
    attachResponseLifecycle();
    responseDelivery.responseStartedAt = new Date().toISOString();
    if (runContext?.auditRowPersisted) res.setHeader("X-SafeLoc-Research-Run-Id", runContext.runId);
    sendJson(res, status, body);
    if (!responseLifecycleAttached) {
      responseDelivery.responseFinishedAt = new Date().toISOString();
      responseSettled = true;
      settleResponse();
    }
  };
  const waitForResponseCompletion = async () => {
    if (!responseLifecycleAttached) return;
    if (!responseSettled) await responseCompletion;
  };
  attachResponseLifecycle();

  let runContext = null;
  const writeAudit = (method, record) => auditStore.connectionRetryManaged
    ? auditStore[method](record)
    : retryDatabaseConnectionOperation(() => boundedAuditOperation(() => auditStore[method](record)));
  const refresh = (foreground = true, {
    deferRunUntilResponse = false,
    initiator = requestIdentity.initiator,
    requestId = requestIdentity.requestId,
  } = {}) => {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const deadlineAtMs = startedAtMs + boundedResearchTimeoutMs;
    const runId = requestedRunId ?? randomUUID();
    let resolveStartReady;
    let rejectStartReady;
    const startReady = new Promise((resolve, reject) => {
      resolveStartReady = resolve;
      rejectStartReady = reject;
    });
    startReady.catch(() => {});
    let releaseRun;
    const launchGate = deferRunUntilResponse
      ? new Promise((resolve) => { releaseRun = resolve; })
      : Promise.resolve();
    const context = {
      runId,
      startedAt,
      deadlineAt: new Date(deadlineAtMs).toISOString(),
      projectCacheKey: key,
      initiator,
      requestId,
      auditRowPersisted: false,
      auditPersistence: { state: "pending", reasonCodes: [], runId },
      startReady,
      resolveStartReady,
      rejectStartReady,
    };
    const initialAudit = {
      version: RESEARCH_CATEGORY_AUDIT_VERSION,
      policyVersion: RESEARCH_POLICY_VERSION,
      runCorrelationId: runId,
      projectCacheKey: key,
      initiator,
      requestId,
      startedAt,
      deadlineAt: context.deadlineAt,
      finishedAt: null,
      terminalState: "running",
      terminalReasonCodes: [],
      runtime: {
        applicationVersion: releaseIdentity.applicationVersion,
        buildId: releaseIdentity.releaseId,
        commitSha: releaseIdentity.commitSha,
        sourceCommitSha: releaseIdentity.sourceCommitSha,
      },
      promptVersions: {
        projectResearch: RESEARCH_PROJECT_PROMPT_VERSION,
        googleDiscovery: GOOGLE_DISCOVERY_PROMPT_VERSION,
        claimEligibility: CLAIM_REVIEW_VERSION,
      },
      providers: {
        research: { provider: "openai", model: RESEARCH_PROJECT_MODEL, reasoningEffort: RESEARCH_MODEL_CONFIG.reasoningEffort },
        discovery: { provider: "google-gemini-grounding", model: googleModel },
      },
      budget: { ...requestBudget },
      providerAttempts: [],
      categories: [],
      response: { ...responseDelivery },
    };
    const refreshResult = cache.refresh(key, async () => {
      runContext = context;
      const projectForCapture = {
        ...project,
        projectId: project.projectId ?? project.id ?? project.name,
      };
      const captureSink = acceptanceCapture ?? consumeAcceptanceCaptureOptIn({
        project: projectForCapture,
        runId,
      });
      const funnelDiagnostics = createResearchFunnelDiagnostics({
        runId,
        project: projectForCapture,
        acceptanceCapture: captureSink,
      });
      context.funnelDiagnostics = funnelDiagnostics;
      try {
        if (auditStore?.startRun) {
          await writeAudit("startRun", {
            runId,
            projectName: project.name,
            projectLocation: project.location,
            researchStatus: "running",
            projectSummary: {
              name: project.name,
              location: project.location,
              capacityMW: normalizeReportedCapacityMW(project.knownData?.capacity),
            },
            audit: initialAudit,
            startedAt,
            finishedAt: null,
          });
          context.auditRowPersisted = true;
        }
        resolveStartReady();
      } catch {
        context.auditPersistence.state = "persistence-incomplete";
        context.auditPersistence.reasonCodes.push("audit-start-write-failed");
        console.warn("[research-project] Audit start persistence incomplete.", { runId });
        resolveStartReady();
      }
      await launchGate;
      const researchResult = await runValidatedResearch(project, {
        findingsFirst: findingsFirst ?? (categoryIds === null && !project.focusIds?.length),
        findingsOptions,
        apiKey,
        googleApiKey,
        googleDiscoveryImpl,
        googleModel,
        googleDiscoveryPrompt,
        canaryDiagnosticCollector: canaryDiagnosticCollector ?? funnelDiagnostics.collector,
        allowGoogleFallback: allowGoogleFallback && !singleShotRun,
        allowCorrectiveRetries: allowCorrectiveRetries && !singleShotRun,
        fetchImpl,
        documentFetchImpl,
        secConnector,
        ocrImpl,
        rateLimiter,
        req,
        categoryIds,
        researchTimeoutMs: Math.max(1, deadlineAtMs - Date.now()),
        documentTimeoutMs,
        analysisReserveMs,
        maxConcurrentDocumentOpens,
        researchBudgetOverrides: requestBudget,
        allowProviderRetries: allowProviderRetries && !singleShotRun,
        useDefaultSecConnector,
        retrievalOnly: retrievalOnlyRequest,
        canaryGridIdentityGate,
        dnsLookup,
        signal: foreground ? requestController.signal : undefined,
        runCorrelationId: runId,
        auditStartedAt: startedAt,
        auditDeadlineAt: context.deadlineAt,
        claimTrace: claimTrace ?? funnelDiagnostics.claimTrace,
        providerGate,
      });
      const completedResult = { ...researchResult, projectIdentity: project.projectIdentity };
      if (isRecord(completedResult.researchAudit)) {
        completedResult.researchAudit.projectCacheKey = key;
        completedResult.researchAudit.initiator = initiator;
        completedResult.researchAudit.requestId = requestId;
        completedResult.researchAudit.funnelDiagnostics = funnelDiagnostics.toJSON();
      }
      return completedResult;
    }, {
      flightKey: `${key}:${initiator}:${requestId}`,
      runId,
      initiator,
      requestId,
    });
    const refreshRequestKey = researchRunRequestKey(key, { requestId, initiator });
    const existingRefreshRequest = refreshResult.started ? null : findResearchRunRequest(refreshRequestKey);
    const effectiveRunId = existingRefreshRequest?.runId ?? runId;
    if (refreshResult.started || !existingRefreshRequest) {
      rememberResearchRunRequest(
        refreshRequestKey,
        { promise: refreshResult.promise, runId: effectiveRunId, requestId, initiator },
      );
    }
    context.runId = effectiveRunId;
    if (!refreshResult.started) {
      resolveStartReady();
      if (runContext === context) runContext = null;
    }
    return {
      ...refreshResult,
      startReady,
      launch: () => releaseRun?.(),
      context,
    };
  };
  const retainRun = async (result, error = null) => {
    const context = runContext;
    const audit = result?.researchAudit ?? error?.researchAudit ?? {
      version: RESEARCH_CATEGORY_AUDIT_VERSION,
      policyVersion: RESEARCH_POLICY_VERSION,
      runCorrelationId: context?.runId ?? randomUUID(),
      startedAt: context?.startedAt ?? new Date().toISOString(),
      deadlineAt: context?.deadlineAt ?? null,
      finishedAt: new Date().toISOString(),
      terminalState: RESEARCH_OUTCOMES.TECHNICAL,
      terminalReasonCodes: [classifyResearchFailure(error).type],
      providerAttempts: error?.providerAttempts ?? (error?.providerAttempt ? [error.providerAttempt] : []),
      inFlightAnalysisCount: error?.inFlightAnalysisCount ?? 0,
      categories: [],
      phaseTiming: null,
    };
    audit.runCorrelationId = context?.runId ?? audit.runCorrelationId;
    if (result) result.researchAudit = audit;
    audit.projectCacheKey = context?.projectCacheKey ?? key;
    audit.initiator = context?.initiator ?? requestIdentity.initiator;
    audit.requestId = context?.requestId ?? requestIdentity.requestId;
    if (context?.funnelDiagnostics) audit.funnelDiagnostics = context.funnelDiagnostics.toJSON();
    audit.deadlineAt = audit.deadlineAt ?? context?.deadlineAt ?? null;
    audit.response = { ...responseDelivery };
    audit.responseStartedAt = responseDelivery.responseStartedAt;
    audit.responseFinishedAt = responseDelivery.responseFinishedAt;
    audit.clientDisconnectedAt = responseDelivery.clientDisconnectedAt;
    audit.browserDisconnectedBeforeFinish = responseDelivery.browserDisconnectedBeforeFinish;
    const status = result?.researchStatus ?? (error?.researchErrorType === "cancelled" ? "cancelled" : "failed");
    context?.funnelDiagnostics?.finalizeAcceptanceCapture?.({ status });
    const capacityMW = result?.projectSummary?.capacityMW ?? normalizeReportedCapacityMW(project.knownData?.capacity);
    const projectSummary = result?.projectSummary ?? {
      name: project.name,
      location: project.location,
      capacityMW,
      capacityProvenance: capacityMW === null ? "unknown" : "directory-reported",
    };
    if (result) {
      void Promise.resolve().then(() => registry.retain(project, result, { runId: audit.runCorrelationId }))
        .catch((failure) => console.warn("[research-project] Registry retention failed:", failure instanceof Error ? failure.message : "unknown error"));
    }
    const canFinishStartedRow = Boolean(context?.auditRowPersisted && auditStore?.finishRun);
    const canUseLegacySave = Boolean(auditStore?.save && !canFinishStartedRow);
    if (canFinishStartedRow || canUseLegacySave) {
      await (async () => {
        const finishedAt = new Date().toISOString();
        audit.response = { ...responseDelivery };
        audit.responseStartedAt = responseDelivery.responseStartedAt;
        audit.responseFinishedAt = responseDelivery.responseFinishedAt;
        audit.clientDisconnectedAt = responseDelivery.clientDisconnectedAt;
        audit.browserDisconnectedBeforeFinish = responseDelivery.browserDisconnectedBeforeFinish;
        audit.finishedAt = audit.finishedAt ?? finishedAt;
        audit.lifecycleState = status;
        const record = {
          runId: audit.runCorrelationId,
          projectName: project.name,
          projectLocation: project.location,
          researchStatus: status,
          projectSummary,
          audit,
          startedAt: context?.startedAt ?? audit.startedAt,
          finishedAt,
        };
        let resultPersisted = false;
        if (canFinishStartedRow && auditStore.progressRun) {
          try {
            await writeAudit("progressRun", record);
          } catch {
            context.auditPersistence.state = "persistence-incomplete";
            context.auditPersistence.reasonCodes.push("audit-progress-write-failed");
          }
        }
        if (canFinishStartedRow) {
          try {
            await writeAudit("finishRun", record);
            resultPersisted = true;
          } catch (retryFailure) {
              context.auditPersistence.state = "persistence-incomplete";
              context.auditPersistence.reasonCodes.push("audit-finalize-write-failed");
              const finalizationFailureRecord = {
                ...record,
                researchStatus: "finalization-failed",
                audit: {
                  ...record.audit,
                  lifecycleState: "finalization-failed",
                  finalizationFailure: {
                    retry: retryFailure instanceof Error ? retryFailure.name : "unknown",
                  },
                },
              };
              try {
                if (auditStore.markFinalizationFailed) {
                  await writeAudit("markFinalizationFailed", finalizationFailureRecord);
                }
              } catch (markerFailure) {
                console.error(JSON.stringify({
                  level: "error",
                  event: "research_audit_finalization_failed",
                  runId: record.runId,
                  failureState: "finalization-failed",
                  retryError: retryFailure instanceof Error ? retryFailure.name : "unknown",
                  markerError: markerFailure instanceof Error ? markerFailure.name : "unknown",
                }));
              }
          }
        } else {
          await writeAudit("save", record);
          resultPersisted = true;
          context.auditRowPersisted = true;
        }
        if (resultPersisted && auditStore.updateDelivery) {
          void waitForResponseCompletion().then(async () => {
            audit.response = { ...responseDelivery };
            audit.responseStartedAt = responseDelivery.responseStartedAt;
            audit.responseFinishedAt = responseDelivery.responseFinishedAt;
            audit.clientDisconnectedAt = responseDelivery.clientDisconnectedAt;
            audit.browserDisconnectedBeforeFinish = responseDelivery.browserDisconnectedBeforeFinish;
            await writeAudit("updateDelivery", { ...record, audit });
          }).catch(() => console.warn("[research-project] Audit delivery metadata persistence incomplete.", { runId: record.runId }));
        }
      })().catch(() => {
        context.auditPersistence.state = "persistence-incomplete";
        context.auditPersistence.reasonCodes.push("audit-result-write-failed");
        console.warn("[research-project] Audit persistence incomplete.", { runId: context.runId });
      });
    }
    if (context) {
      if (context.auditPersistence.state === "pending") {
        context.auditPersistence.state = auditStore ? "persisted" : "not-configured";
      }
      if (result) result.auditPersistence = { ...context.auditPersistence, reasonCodes: [...context.auditPersistence.reasonCodes] };
    }
  };
  if (!retrievalOnlyRequest && !project.forceRefresh && containedRetained && !retainedNeedsRevalidation && retainedState === "stale") {
    const background = refresh(false, {
      deferRunUntilResponse: true,
      initiator: "background-refresh",
    });
    rememberResearchRunRequest(requestKey, {
      promise: background.promise,
      runId: background.context.runId,
      requestId: requestIdentity.requestId,
      initiator: background.context.initiator,
    });
    if (background.started) {
      try {
        await background.startReady;
      } catch (error) {
        void background.promise.catch(() => {});
        const failure = classifyResearchFailure(error);
        sendTrackedJson(failure.status, {
          error: failure.message,
          errorType: failure.type,
          researchStatus: "failed",
          researchOutcome: {
            state: RESEARCH_OUTCOMES.TECHNICAL,
            eligibleEvidenceCount: 0,
            reasonCodes: [failure.type],
          },
        });
        return;
      }
    }
    req.removeListener?.("aborted", onRequestAborted);
    const backgroundStatus = cache.status(key);
    sendTrackedJson(200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, "stale", "running", {
      runId: backgroundStatus.runId,
      initiator: backgroundStatus.initiator,
      requestId: backgroundStatus.requestId,
    })));
    background.launch();
    if (background.started) void background.promise.then((entry) => retainRun(entry.result), (error) => {
      retainRun(null, error);
      console.error("[research-project] Background refresh failed:", classifyResearchFailure(error).type);
    });
    return;
  }

  let activeRefresh = null;
  try {
    activeRefresh = refresh();
    const entry = await activeRefresh.promise;
    if (activeRefresh.started) await retainRun(entry.result);
    if (!res.writableEnded && !res.destroyed) {
      sendTrackedJson(200, withCacheMetadata(entry, cacheMetadata(key, entry, "updated", "completed", {
        runId: activeRefresh.context.runId,
        initiator: activeRefresh.context.initiator,
        requestId: activeRefresh.context.requestId,
      })));
    }
  } catch (error) {
    const failure = classifyResearchFailure(error);
    console.error("[research-project] Request failed:", failure.type);
    if (res.writableEnded || res.destroyed) {
      if (!activeRefresh || activeRefresh.started) await retainRun(null, error);
      return;
    }
    if (!activeRefresh || activeRefresh.started) await retainRun(null, error);
    if (failure.type === "audit-storage") {
      sendTrackedJson(failure.status, {
        error: failure.message,
        errorType: failure.type,
        researchStatus: "failed",
        researchOutcome: {
          state: RESEARCH_OUTCOMES.TECHNICAL,
          eligibleEvidenceCount: 0,
          reasonCodes: [failure.type],
        },
      });
      return;
    }
    if (containedRetained) {
      sendTrackedJson(200, withCacheMetadata(containedRetained, cacheMetadata(key, containedRetained, "stale", "failed", {
        providerAvailable: false,
        errorType: failure.type,
        providerDiagnostic: failure.providerDiagnostic,
        providerAttempts: failure.providerAttempts
          ?? (error?.providerAttempt ? [error.providerAttempt] : undefined),
        inFlightAnalysisCount: failure.inFlightAnalysisCount
          ?? error?.providerAttempt?.inFlightAnalysisCount,
      })));
      return;
    }
    if (failure.type === "request-limit" && error?.retryAfterSeconds) {
      res.setHeader("retry-after", String(error.retryAfterSeconds));
    }
    sendTrackedJson(failure.status, {
      error: failure.message,
      errorType: failure.type,
      ...(runContext ? { auditPersistence: runContext.auditPersistence } : {}),
      researchStatus: failure.type === "timeout" ? "timed-out" : "failed",
      researchOutcome: {
        state: RESEARCH_OUTCOMES.TECHNICAL,
        eligibleEvidenceCount: 0,
        reasonCodes: [failure.type],
      },
      ...(failure.providerDiagnostic ? { providerDiagnostic: failure.providerDiagnostic } : {}),
      ...((failure.providerAttempts?.length || error?.providerAttempt)
        ? {
            providerAttempts: (failure.providerAttempts
              ?? (error?.providerAttempts?.length ? error.providerAttempts : [error.providerAttempt]))
              .slice(0, RESEARCH_RUN_BUDGET.maxProviderRequests),
          }
        : {}),
      ...(Number.isInteger(failure.inFlightAnalysisCount ?? error?.inFlightAnalysisCount ?? error?.providerAttempt?.inFlightAnalysisCount)
        ? {
            inFlightAnalysisCount: failure.inFlightAnalysisCount
              ?? error?.inFlightAnalysisCount
              ?? error?.providerAttempt?.inFlightAnalysisCount,
          }
        : {}),
    });
  } finally {
    req.removeListener?.("aborted", onRequestAborted);
    signal?.removeEventListener("abort", abortFromExternalSignal);
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
  classifyCanonicalResearchOutcome,
  prioritizeResearchSources,
  sourcePriorityApplied,
  runValidatedResearch,
};