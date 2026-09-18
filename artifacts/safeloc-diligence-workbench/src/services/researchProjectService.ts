import type { Classification, EvidenceItem } from "@/context/DiligenceContext";
import {
  EVIDENCE_SEMANTIC_POLICY_VERSION,
  EVIDENCE_SEMANTIC_POLICY,
  evaluateEvidenceSourceEligibility,
  normalizeEvidenceRecord,
} from "@/data/evidenceSemanticPolicy.mjs";
import {
  SOURCE_VALIDATION_POLICY_VERSION,
  buildClaimPassageMappings,
  evaluateResearchEvidenceEligibility,
} from "@/data/sourceValidationPolicy.mjs";

export const RESEARCH_PROJECT_ENDPOINT = "/api/research-project";
// The server owns the single research deadline.  Keep the client request
// budget aligned, but do not add a second browser wall-clock terminal state.
export const RESEARCH_PROJECT_TIMEOUT_MS = 90_000;
export const DEFAULT_RESEARCH_CAPACITY_MW = 1_200;
export const MAX_RESEARCH_CAPACITY_MW = 10_000;

export const CUSTOM_EVIDENCE_IDS = [
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
] as const;

export type CustomEvidenceRecord = Pick<
  EvidenceItem,
  "id" | "label" | "value" | "unit" | "classification" | "citation" | "description" | "sourceRole" | "sourceUrl" | "sourceTitle" | "sourcePublisher" | "sourcePublishedAt" | "sourceAccessedAt" | "sourceAccessStatus"
> & {
  numericValue?: number;
  qualitativeValue?: EvidenceItem["qualitativeValue"];
  sourceSupportConfidence?: number;
  modelReportedConfidence?: number;
  classificationReason?: string;
  sourceRelevanceNote?: string;
  sourceRelevance?: "exact-project" | "related-context" | "unresolved";
  searchTerms?: string[];
  searchTermsSource?: "tool-observed" | "ai-reported" | "unavailable";
  sources?: ResearchEvidenceSource[];
  coverageStatus?: ResearchCoverageStatus;
  searchCoverage?: string[];
  failedSearchDomains?: string[];
  conflictSummary?: string;
  rawValue?: string | number;
  rawUnit?: string;
  rawText?: string;
  normalizedValue?: number | string;
  normalizedUnit?: string;
  normalization?: {
    policyVersion: number;
    conversion: string;
    validationStatus: "valid" | "unresolved" | "quarantined";
  };
  semanticValidationStatus?: "valid" | "unresolved" | "quarantined";
  noOpAcknowledged?: boolean;
  researchState?: ResearchEvidenceState;
  eligibleForModel?: boolean;
  acceptedForModel?: boolean;
  quarantineReasons?: string[];
  claimMappings?: ResearchClaimPassageMapping[];
  sourceValidation?: ResearchSourceValidation;
  reviewerSubmittedSource?: ResearchEvidenceSource;
};

export type ResearchEvidenceState = "retrieved-lead" | "eligible-evidence" | "proposed" | "accepted" | "quarantined";

export type ResearchCoverageStatus = "supported" | "searched-no-support" | "partial" | "conflicting";
export type ResearchEvidenceSource = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  accessedAt: string | null;
  accessStatus: EvidenceItem["sourceAccessStatus"];
  excerpt: string;
  claimPassage?: string;
  sourceClass: "primary-government" | "primary-utility" | "primary-company" | "secondary-reporting" | "reviewer-submitted";
  searchDomain: string;
  relationship: "primary" | "corroborating" | "conflicting";
  exactProject?: boolean;
  relevanceNote?: string;
  originalUrl?: string;
  resolvedUrl?: string;
  canonicalUrl?: string;
  sourceState?: string;
  sourceChannel?: string;
  redirectChain?: string[];
  contentType?: string | null;
  claimCited?: boolean;
  accessOutcome?: {
    state: "accessible" | "blocked" | "unsupported" | "not-attempted";
    reason: string;
    format?: string;
    resolvedUrl?: string | null;
    canonicalUrl?: string | null;
    retrievalTime?: string | null;
    passage?: string | null;
    pageOrSection?: string | number | null;
    extractionLimitations?: string[];
    extractionMethod?: string | null;
    extractionOutcome?: string | null;
    contentHash?: string | null;
    underlyingDocumentUrl?: string | null;
  };
  documentAccessReused?: boolean;
  referringUrls?: string[];
};
export type ResearchClaimPassageMapping = {
  id: string;
  sourceId: string | null;
  passageId: string | null;
  variable: string;
  claimText: string;
  entityScope: "project" | "related";
  facilityScope: string;
  phaseScope: string;
  timePeriod: string | null;
  sourceType: string;
  contradictionStatus: "none" | "blocking";
  supportStatus: "supported" | "context-only" | "missing-passage" | "unsupported-source-type" | "blocked";
  exactQuotation: string | null;
  rejectionCodes: string[];
};
export type ResearchSourceValidation = {
  policyVersion: number;
  state: string;
  rejectionCodes: string[];
  claimMappings: ResearchClaimPassageMapping[];
};

export type CustomResearchResponse = {
  projectSummary: {
    name: string;
    location: string;
    description: string;
    capacityMW: number;
    capacityProvenance: CapacityProvenance;
  };
  researchMode?: ResearchMode;
  researchOutcome?: {
    state: ResearchOutcomeState;
    eligibleEvidenceCount: number;
    reasonCodes: string[];
  };
  researchStatus?: "researching" | "completed" | "partial" | "timed-out" | "failed" | "cancelled";
  researchError?: {
    type: "timeout" | "malformed-response" | "upstream" | "cancelled";
    message: string;
  };
  researchCache?: ResearchCacheMetadata;
  semanticPolicyVersion?: number;
  sourceValidationPolicyVersion?: number;
  sourceLedger?: Array<Record<string, unknown>>;
  researchCoverage?: {
    identityContext?: ResearchCategoryAudit["identityContext"];
    searchedDomains: string[];
    failedDomains: string[];
    retrievedSourceCount: number;
    searchTerms: string[];
    searchTermsSource: "tool-observed" | "ai-reported" | "unavailable";
    toolCallCount?: number;
    toolCallLimit?: number;
    toolCallBudgetExceeded?: boolean;
     followUpCount?: number;
     followUpLimit?: number;
     followUpLimitPerCategory?: number;
     sourcePriorityApplied?: string[];
     observedToolCallCount?: number;
     acceptedToolCallCount?: number;
     providerLimitations?: string[];
      physicalOpenBudget?: number;
      physicalOpensUsed?: number;
      physicalOpensRemaining?: number;
      physicalOpenBudgetExceeded?: boolean;
    sourceLedgerSummary?: {
      rawOccurrenceCount: number;
      retainedCount: number;
      rejectedCount: number;
      capDiscardCount: number;
    };
  };
  canonicalProvenance?: Array<{
    title: string;
    url: string;
    publisher: string;
    publishedAt: string | null;
    accessedAt: string | null;
    exactPassage: string;
    provenanceType: "evidence-claim" | "ownership-conflict";
    variableId?: string;
    claim?: string;
    attributedTo?: string;
  }>;
  researchAudit?: ResearchAudit;
  evidence: CustomEvidenceRecord[];
  retrievedLeads?: CustomEvidenceRecord[];
  eligibleEvidence?: CustomEvidenceRecord[];
  proposedInputs?: CustomEvidenceRecord[];
  acceptedModelInputs?: CustomEvidenceRecord[];
  quarantineReasons?: string[];
};
export type ResearchOutcomeState =
  | "complete-with-eligible-evidence"
  | "complete-no-eligible-evidence"
  | "incomplete-technical-limitation";

export type ResearchStatusPresentation = {
  state: ResearchOutcomeState | null;
  label: string;
  proposalReview: boolean;
  mode: ResearchMode | undefined;
};

/**
 * The server-owned terminal outcome is authoritative for status copy. The
 * visible proposal count is an additional guard: a result cannot be presented
 * as "proposal review" when there is nothing a reviewer can actually review.
 */
export function getResearchStatusPresentation({
  outcome,
  researchMode,
  eligibleProposalCount = 0,
  researchStatus,
  fallbackIncomplete = false,
}: {
  outcome?: CustomResearchResponse["researchOutcome"];
  researchMode?: ResearchMode;
  eligibleProposalCount?: number;
  researchStatus?: string;
  fallbackIncomplete?: boolean;
}): ResearchStatusPresentation {
  const state = outcome?.state ?? null;
  const hasVisibleProposal = Number.isFinite(eligibleProposalCount) && eligibleProposalCount > 0;
  const proposalReview = state === "complete-with-eligible-evidence" && hasVisibleProposal;

  if (state === "complete-with-eligible-evidence") {
    return {
      state,
      label: proposalReview
        ? "Research complete · proposal review"
        : "Research complete · eligible evidence found",
      proposalReview,
      mode: researchMode,
    };
  }
  if (state === "complete-no-eligible-evidence") {
    return {
      state,
      label: "Research complete · no eligible evidence",
      proposalReview: false,
      mode: "research-incomplete",
    };
  }
  if (state === "incomplete-technical-limitation") {
    return {
      state,
      label: "Research incomplete · technical limitation",
      proposalReview: false,
      mode: "research-incomplete",
    };
  }
  if (researchStatus === "researching") {
    return { state, label: "Research in progress", proposalReview: false, mode: researchMode };
  }
  if (researchMode === "default-assumptions") {
    return { state, label: "Research unavailable", proposalReview: false, mode: researchMode };
  }
  if (researchMode === "research-incomplete") {
    return { state, label: "Research Incomplete", proposalReview: false, mode: researchMode };
  }
  if (researchMode === "partial-public-source") {
    return { state, label: "Partial public-source research", proposalReview: false, mode: researchMode };
  }
  if (fallbackIncomplete || researchStatus === "timed-out" || researchStatus === "failed") {
    return { state, label: "Research Incomplete", proposalReview: false, mode: "research-incomplete" };
  }
  return {
    state,
    label: hasVisibleProposal ? "Research complete · proposal review" : "Project evidence review",
    proposalReview: hasVisibleProposal,
    mode: researchMode,
  };
}

export type ResearchCategoryState = "Complete" | "Partial" | "No eligible evidence" | "Provider failure" | "Timed out" | "Not searched";
export type ResearchAuditStageCounts = {
  normalized: number;
  accessed: number;
  parsed: number;
  claimMapped: number;
  eligible: number;
  retainedCandidates: number;
  candidates?: number;
  attemptedRetrievals?: number;
  successfulAccesses?: number;
  retainedPassages?: number;
  reusedReceipts?: number;
  notAttempted?: number;
  issuedProviderRequests?: number;
  observedSearches?: number;
  successfulExtractions?: number;
};
export type ResearchLocalAuthority = {
  name: string;
  kind: string;
  domain: string | null;
  establishmentMethod: string;
  status: "established" | "identified-no-domain";
};
export type ResearchProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};
export type ResearchProviderAttempt = {
  categoryId: string | null;
  attemptType: "primary" | "repair" | "follow-up";
  queuedAt: string | null;
  issuedAt: string | null;
  finishedAt: string | null;
  queueWaitMs: number | null;
  elapsedMs: number | null;
  status: number | null;
  outcome: "completed" | "failed" | "cancelled";
  requestedOutputTokens: number;
  requestBodyBytes: number;
  usage: ResearchProviderUsage | null;
};
export type ResearchCategoryAudit = {
  categoryId: string;
  label: string;
  evidenceIds: string[];
  requestedPrimaryQuery: string;
  primaryQueryRole?: "authoritative-primary";
  plannedPrimaryQuery?: string | null;
  issuedPrimaryQuery?: string | null;
  executedQueries: string[];
  providerObservedPrimaryQueries?: string[];
  optionalFollowUpQuery?: string | null;
  fallbackQueryRole?: "unrestricted-exact-project-fallback";
  plannedFollowUpQuery?: string | null;
  issuedFollowUpQuery?: string | null;
  providerObservedFollowUpQueries?: string[];
  followUpExecutedQuery?: string | null;
  followUpCount: number;
  followUpLimit: number;
  followUpTriggerEvidenceIds?: string[];
  followUpSkipReason?: string | null;
  authorityTargets?: { names: string[]; domains: string[]; localAuthorities?: ResearchLocalAuthority[]; limitations?: string[] };
  identityContext?: {
    requestedName: string;
    aliases: string[];
    operator: string | null;
    location: string;
    city: string | null;
    county: string | null;
    state: string | null;
    ambiguities: string[];
    resolutionRequired: boolean;
  };
  identityAmbiguities?: string[];
  localAuthorities?: ResearchLocalAuthority[];
  authorityLimitations?: string[];
  returnedDomains?: string[];
  openedDocuments?: Array<{
    originalUrl: string | null;
    referringUrls?: string[];
    resolvedUrl: string | null;
    canonicalUrl: string | null;
    opened: boolean;
    attempted?: boolean;
    reusedReceipt?: boolean;
    reusedFromCanonicalUrl: string | null;
    accessState: "accessible" | "blocked" | "unsupported" | "not-attempted";
    accessOutcome: string;
    retainedPassage: string | null;
    extractionLimitations: string[];
    sourceChannel?: string;
    extractionMethod?: string | null;
    extractionOutcome?: string | null;
    contentHash?: string | null;
  }>;
  discoveryAttempts?: Array<{
    sourceChannel: string;
    url: string | null;
    status: string | null;
    httpStatus: number | null;
    contentType: string | null;
    physicalOpenIndex: number | null;
  }>;
  sourceChannelTelemetry?: Array<{
    sourceChannel: string;
    outcome: string;
    reason: string | null;
  }>;
  noReturnCounts?: {
    total: number;
    missingUrl: number;
    unsafeUrl: number;
    noPublicUrl: number;
    byChannel: Record<string, number>;
  };
  authorityRecords?: Array<{
    name: string;
    domain: string | null;
    jurisdiction: string;
    establishmentMethod: string;
    discoveredAt: string;
    sourceChannel: string;
    urlsAttempted: string[];
    accessOutcomes: Array<{
      url: string | null;
      status: string;
      httpStatus: number | null;
      physicalOpenIndex: number | null;
    }>;
  }>;
  secConnectorAttempts?: Array<{
    sourceChannel: "sec-public-data";
    sourceOrigin: string | null;
    sourcePathname: string | null;
    status: number | null;
    outcome: string | null;
    reason: string | null;
  }>;
  state: ResearchCategoryState;
  stageCounts: ResearchAuditStageCounts;
  rejectionCounts: Record<string, number>;
  accessLimitations: string[];
  unresolvedGaps: string[];
  providerFailure?: string | null;
  providerFailureType?: "quota-exhausted" | "provider-rate-limit" | "provider-429" | "authentication" | "deadline" | "malformed-response" | "upstream" | "provider-request-budget" | null;
  providerRequestCount?: number;
  providerAttempts?: ResearchProviderAttempt[];
};
export type ResearchCategoryClaimAudit = {
  evidenceId: string;
  evidenceLabel: string;
  claimText: string;
  supportStatus: ResearchClaimPassageMapping["supportStatus"];
  rejectionCodes: string[];
  sourceTitle: string | null;
  sourcePublisher: string | null;
  sourceUrl: string | null;
  resolvedUrl: string | null;
  sourceState: string | null;
  accessState: "accessible" | "blocked" | "unsupported" | "not-attempted" | null;
  accessReason: string | null;
  retainedPassage: string | null;
  exactQuotation: string | null;
  pageOrSection: string | number | null;
  extractionLimitations: string[];
  format: string | null;
  sourceChannel: string | null;
  extractionMethod: string | null;
  extractionOutcome: string | null;
};
export type ResearchEvidenceAuditItem = Pick<
  CustomEvidenceRecord,
  "id" | "label" | "description" | "sources" | "claimMappings" | "sourceValidation"
>;
export type ResearchAudit = {
  version: number;
  policyVersion: number;
  provider: string;
  model: string;
  providerResponseId: string | null;
  runCorrelationId?: string | null;
  terminalState?: ResearchOutcomeState | null;
  terminalReasonCodes?: string[];
  identityPhysicalOpenOpportunityReserved?: boolean;
  candidateLineage?: Array<Record<string, unknown>>;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  budget: {
    deadlineMs: number;
    maxProviderRequests: number;
    maxFollowUps: number;
    maxFollowUpsPerCategory: number;
    maxCandidatesPerCategory: number;
    maxTotalCandidates: number;
    maxToolCalls: number;
    maxPhysicalDocumentOpens: number;
  };
  toolCallCount: number;
  observedToolCallCount?: number;
  acceptedToolCallCount?: number;
  providerRequestCount: number;
  providerAttempts?: ResearchProviderAttempt[];
  physicalOpenBudget: number;
  physicalOpensUsed: number;
  physicalOpensRemaining: number;
  physicalOpenBudgetExceeded: boolean;
  followUpCount: number;
  followUpLimit: number;
  followUpLimitPerCategory: number;
  sourcePriorityApplied: string[];
  categories: ResearchCategoryAudit[];
  categoryGaps: string[];
  providerLimitations: string[];
};

function sourceMatchesMapping(source: ResearchEvidenceSource, mapping: ResearchClaimPassageMapping) {
  const sourceIds = [source.canonicalUrl, source.url, source.resolvedUrl].filter(Boolean);
  return mapping.sourceId ? sourceIds.includes(mapping.sourceId) : false;
}

/**
 * Projects retained source receipts into the category audit without changing
 * the 16-item evidence contract or the human acceptance state.
 */
export function getResearchCategoryClaimAudits(
  category: ResearchCategoryAudit,
  evidence: ResearchEvidenceAuditItem[] = [],
): ResearchCategoryClaimAudit[] {
  return category.evidenceIds.flatMap((evidenceId) => {
    const item = evidence.find((candidate) => candidate.id === evidenceId);
    if (!item) return [];
    const mappings = item.claimMappings ?? item.sourceValidation?.claimMappings ?? [];
    return mappings.map((mapping) => {
      const source = item.sources?.find((candidate) => sourceMatchesMapping(candidate, mapping));
      const accessOutcome = source?.accessOutcome;
      const resolvedUrl = accessOutcome?.resolvedUrl ?? source?.resolvedUrl ?? source?.canonicalUrl ?? source?.url ?? null;
      return {
        evidenceId,
        evidenceLabel: item.label,
        claimText: mapping.claimText || item.description,
        supportStatus: mapping.supportStatus,
        rejectionCodes: mapping.rejectionCodes,
        sourceTitle: source?.title ?? null,
        sourcePublisher: source?.publisher ?? null,
        sourceUrl: source?.url ?? null,
        resolvedUrl,
        sourceState: source?.sourceState ?? null,
        accessState: accessOutcome?.state ?? null,
        accessReason: accessOutcome?.reason ?? null,
        retainedPassage: accessOutcome?.state === "accessible"
          ? accessOutcome.passage ?? source?.excerpt ?? null
          : null,
        exactQuotation: mapping.exactQuotation ?? source?.claimPassage ?? null,
        pageOrSection: accessOutcome?.pageOrSection ?? null,
        extractionLimitations: accessOutcome?.extractionLimitations ?? [],
        format: accessOutcome?.format ?? null,
        sourceChannel: source?.sourceChannel ?? null,
        extractionMethod: accessOutcome?.extractionMethod ?? null,
        extractionOutcome: accessOutcome?.extractionOutcome ?? null,
      };
    });
  });
}

export type ResearchCacheMetadata = {
  key: string;
  state: "fresh" | "recent" | "stale" | "expired" | "updated";
  storedAt: string | null;
  refreshStatus: "idle" | "running" | "completed" | "failed";
  providerAvailable: boolean;
  validationPolicyVersion?: number;
  researchPolicyVersion?: number;
  modelVersion?: string;
  errorType?: "quota-exhausted" | "provider-rate-limit" | "provider-429" | "authentication" | "timeout" | "malformed-response" | "request-limit" | "not-configured" | "upstream";
};

export type ResearchTelemetryMode = "current-live" | "historical-retained";

/**
 * Cache metadata describes the provenance of the audit counters, not whether
 * the response itself was HTTP-successful. A fresh/recent cache or a failed
 * refresh is historical telemetry; only the explicitly updated result from a
 * live provider response is current-run telemetry.
 */
export function getResearchTelemetryMode(cache?: ResearchCacheMetadata): ResearchTelemetryMode {
  if (!cache) return "current-live";
  return cache.state === "updated" && cache.refreshStatus !== "failed" && cache.providerAvailable !== false
    ? "current-live"
    : "historical-retained";
}

export type ResearchStatusResponse = {
  researchCache: ResearchCacheMetadata;
  result?: CustomResearchResponse;
};

export type CapacityProvenance = "ai-reported" | "directory-reported" | "standardized-default";
export type ResearchMode = "ai-researched" | "partial-public-source" | "default-assumptions" | "research-incomplete";
export type KnownProjectData = {
  capacity?: number | null;
  operator?: string | null;
  ticker?: string | null;
  companyName?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  providerId?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  waterAuthority?: string | null;
  permittingAuthority?: string | null;
  authorityNames?: string[];
  authorityDomains?: string[];
  companyDomains?: string[];
  cityDomains?: string[];
  countyDomains?: string[];
  utilityDomains?: string[];
  economicDevelopmentDomains?: string[];
  knownOfficialEndpoints?: string[];
  aliases?: string[];
};
export type ResearchProgress = "researching" | "retrying";
export type ResearchProjectOptions = {
  knownData?: KnownProjectData;
  onProgress?: (progress: ResearchProgress) => void;
  signal?: AbortSignal;
  focusIds?: string[];
  currentEvidence?: Array<Pick<CustomEvidenceRecord, "id" | "label" | "value" | "classification" | "citation">>;
  forceRefresh?: boolean;
};

export function summarizeSourceCoverage(evidence: CustomEvidenceRecord[]) {
  return evidence.reduce((summary, item) => {
    if (item.classification === "Missing Evidence") {
      summary.missing += 1;
    } else if (item.sourceValidation?.state === "financially-eligible" || item.sourceValidation?.state === "claim-supported") {
      summary.supported += 1;
    } else {
      summary.aiKnowledge += 1;
    }
    return summary;
  }, { supported: 0, aiKnowledge: 0, missing: 0 });
}

export function summarizeResearchAudit(evidence: CustomEvidenceRecord[]) {
  const uniqueSources = new Set(
    evidence.flatMap((item) => [
      ...(item.sourceValidation?.state === "financially-eligible" || item.sourceValidation?.state === "claim-supported"
        ? (item.sources ?? []).map((source) => source.canonicalUrl ?? source.resolvedUrl ?? source.url)
        : []),
      ...(item.sourceValidation?.state === "financially-eligible" || item.sourceValidation?.state === "claim-supported"
        ? (item.sourceUrl ? [item.sourceUrl] : [])
        : []),
    ]),
  );
  const confidenceTotal = evidence.reduce((total, item) => total + (item.sourceSupportConfidence ?? 0), 0);
  return {
    uniqueValidatedSourceCount: uniqueSources.size,
    averageSourceSupportConfidence: evidence.length ? Math.round(confidenceTotal / evidence.length) : 0,
    strongSupportItemCount: evidence.filter((item) => (item.sourceSupportConfidence ?? 0) >= 90).length,
    noSourceItemCount: evidence.filter((item) => !item.sourceUrl && !(item.sources?.length)).length,
  };
}

const DEFAULT_EVIDENCE_DEFINITIONS = Object.fromEntries(
  CUSTOM_EVIDENCE_IDS.map((id) => [
    id,
    {
      label: EVIDENCE_SEMANTIC_POLICY[id].label,
      unit: EVIDENCE_SEMANTIC_POLICY[id].canonicalUnit,
    },
  ]),
) as Record<(typeof CUSTOM_EVIDENCE_IDS)[number], { label: string; unit: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safePublicSourceUrl(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function optionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (!isNonEmptyString(value)) return undefined;
  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))
    ? date
    : undefined;
}

function normalizeReportedCapacityMW(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_RESEARCH_CAPACITY_MW
    ? value
    : null;
}

function normalizeKnownData(value: KnownProjectData | undefined): KnownProjectData | undefined {
  if (!value) return undefined;
  const capacity = normalizeReportedCapacityMW(value.capacity);
  const operator = isNonEmptyString(value.operator) ? value.operator.trim().slice(0, 160) : undefined;
  const ticker = isNonEmptyString(value.ticker) && /^[A-Za-z0-9.-]{1,20}$/.test(value.ticker.trim())
    ? value.ticker.trim().toUpperCase()
    : undefined;
  const companyName = isNonEmptyString(value.companyName) ? value.companyName.trim().slice(0, 160) : undefined;
  const status = isNonEmptyString(value.status) ? value.status.trim().slice(0, 80) : undefined;
  const sourceUrl = safePublicSourceUrl(value.sourceUrl);
  const providerId = isNonEmptyString(value.providerId) ? value.providerId.trim().slice(0, 160) : undefined;
  const knownText = (candidate: unknown, maxLength = 160) => isNonEmptyString(candidate) ? candidate.trim().slice(0, maxLength) : undefined;
  const city = knownText(value.city);
  const county = knownText(value.county);
  const state = knownText(value.state, 80);
  const waterAuthority = knownText(value.waterAuthority);
  const permittingAuthority = knownText(value.permittingAuthority);
  const authorityNames = Array.isArray(value.authorityNames) ? [...new Set(value.authorityNames.map((item) => knownText(item)).filter((item): item is string => Boolean(item)))].slice(0, 8) : [];
  const authorityDomains = Array.isArray(value.authorityDomains) ? [...new Set(value.authorityDomains.map((item) => knownText(item, 120)).filter((item): item is string => Boolean(item)))].slice(0, 12) : [];
  const companyDomains = Array.isArray(value.companyDomains) ? [...new Set(value.companyDomains.map((item) => knownText(item, 120)).filter((item): item is string => Boolean(item)))].slice(0, 8) : [];
  const domainList = (items: unknown, limit = 8) => Array.isArray(items)
    ? [...new Set(items.map((item) => knownText(item, 120)).filter((item): item is string => typeof item === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(item)))].slice(0, limit)
    : [];
  const cityDomains = domainList(value.cityDomains);
  const countyDomains = domainList(value.countyDomains);
  const utilityDomains = domainList(value.utilityDomains);
  const economicDevelopmentDomains = domainList(value.economicDevelopmentDomains);
  const knownOfficialEndpoints = Array.isArray(value.knownOfficialEndpoints)
    ? [...new Set(value.knownOfficialEndpoints.map(safePublicSourceUrl).filter((item): item is string => Boolean(item)))].slice(0, 16)
    : [];
  const aliases = Array.isArray(value.aliases) ? [...new Set(value.aliases.map((item) => knownText(item)).filter((item): item is string => Boolean(item)))].slice(0, 12) : [];
  const normalized = {
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
  return Object.keys(normalized).length ? normalized : undefined;
}

export function deriveLocationContext(location: string): Pick<KnownProjectData, "city" | "county" | "state"> {
  const parts = location
    .split(/\s*(?:·|\||,)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return {};
  const isState = (part: string) => /^[A-Z]{2}$/.test(part) || /^(?:Texas|Ohio|Virginia|California|New York)$/i.test(part);
  const county = parts.find((part) => /\bcounty\b/i.test(part));
  const state = parts.find(isState);
  const city = parts.find((part) => part !== county && part !== state && !/\bcounty\b/i.test(part));
  return {
    ...(city ? { city } : {}),
    ...(county ? { county } : {}),
    ...(state ? { state } : {}),
  };
}

function parseSource(value: unknown): ResearchEvidenceSource | null {
  if (!isRecord(value)) return null;
  const url = safePublicSourceUrl(value.url);
  if (!url || !isNonEmptyString(value.title) || !isNonEmptyString(value.publisher) || !isNonEmptyString(value.excerpt)) return null;
  const sourceClass = ["primary-government", "primary-utility", "primary-company", "secondary-reporting", "reviewer-submitted"].includes(String(value.sourceClass))
    ? value.sourceClass as ResearchEvidenceSource["sourceClass"]
    : "secondary-reporting";
  const relationship = ["primary", "corroborating", "conflicting"].includes(String(value.relationship))
    ? value.relationship as ResearchEvidenceSource["relationship"]
    : "corroborating";
  const rawAccessOutcome = isRecord(value.accessOutcome) ? value.accessOutcome : null;
  const accessOutcome = rawAccessOutcome && ["accessible", "blocked", "unsupported", "not-attempted"].includes(String(rawAccessOutcome.state)) && isNonEmptyString(rawAccessOutcome.reason)
    ? {
        state: rawAccessOutcome.state as NonNullable<ResearchEvidenceSource["accessOutcome"]>["state"],
        reason: rawAccessOutcome.reason.trim(),
        ...(isNonEmptyString(rawAccessOutcome.format) ? { format: rawAccessOutcome.format.trim() } : {}),
         ...(safePublicSourceUrl(rawAccessOutcome.resolvedUrl) ? { resolvedUrl: safePublicSourceUrl(rawAccessOutcome.resolvedUrl) } : {}),
         ...(safePublicSourceUrl(rawAccessOutcome.canonicalUrl) ? { canonicalUrl: safePublicSourceUrl(rawAccessOutcome.canonicalUrl) } : {}),
        ...(optionalDate(rawAccessOutcome.retrievalTime) ? { retrievalTime: optionalDate(rawAccessOutcome.retrievalTime) } : {}),
        ...(isNonEmptyString(rawAccessOutcome.passage) ? { passage: rawAccessOutcome.passage.trim() } : {}),
        ...(typeof rawAccessOutcome.pageOrSection === "number" || isNonEmptyString(rawAccessOutcome.pageOrSection) ? { pageOrSection: rawAccessOutcome.pageOrSection } : {}),
        ...(Array.isArray(rawAccessOutcome.extractionLimitations) ? { extractionLimitations: rawAccessOutcome.extractionLimitations.filter(isNonEmptyString) } : {}),
        ...(isNonEmptyString(rawAccessOutcome.extractionMethod) ? { extractionMethod: rawAccessOutcome.extractionMethod.trim() } : {}),
        ...(isNonEmptyString(rawAccessOutcome.extractionOutcome) ? { extractionOutcome: rawAccessOutcome.extractionOutcome.trim() } : {}),
        ...(isNonEmptyString(rawAccessOutcome.contentHash) && /^[a-f0-9]{64}$/i.test(rawAccessOutcome.contentHash) ? { contentHash: rawAccessOutcome.contentHash.toLowerCase() } : {}),
        ...(safePublicSourceUrl(rawAccessOutcome.underlyingDocumentUrl) ? { underlyingDocumentUrl: safePublicSourceUrl(rawAccessOutcome.underlyingDocumentUrl) } : {}),
      }
    : null;
  return {
    url,
    originalUrl: optionalString(value.originalUrl) ?? url,
    resolvedUrl: safePublicSourceUrl(value.resolvedUrl) ?? url,
    canonicalUrl: safePublicSourceUrl(value.canonicalUrl) ?? url,
    title: value.title.trim(),
    publisher: value.publisher.trim(),
    publishedAt: optionalDate(value.publishedAt) ?? null,
    accessedAt: optionalDate(value.accessedAt) ?? null,
    accessStatus: ["open", "paywall", "registration", "not provided"].includes(String(value.accessStatus))
      ? value.accessStatus as EvidenceItem["sourceAccessStatus"]
      : "not provided",
    excerpt: value.excerpt.trim(),
    ...(isNonEmptyString(value.claimPassage) ? { claimPassage: value.claimPassage.trim() } : {}),
    sourceClass,
    searchDomain: isNonEmptyString(value.searchDomain) ? value.searchDomain.trim() : "project-identity",
    relationship,
    ...(typeof value.exactProject === "boolean" ? { exactProject: value.exactProject } : {}),
    ...(Array.isArray(value.claimSupport) ? { claimSupport: value.claimSupport } : {}),
    ...(typeof value.facilityScope === "string" ? { facilityScope: value.facilityScope } : {}),
    ...(typeof value.phaseScope === "string" ? { phaseScope: value.phaseScope } : {}),
    ...(value.timePeriod !== undefined ? { timePeriod: value.timePeriod } : {}),
    ...(isNonEmptyString(value.relevanceNote) ? { relevanceNote: value.relevanceNote.trim() } : {}),
    ...(isNonEmptyString(value.sourceState) ? { sourceState: value.sourceState.trim() } : {}),
    ...(isNonEmptyString(value.sourceChannel) ? { sourceChannel: value.sourceChannel.trim().slice(0, 120) } : {}),
    ...(Array.isArray(value.redirectChain) ? { redirectChain: value.redirectChain.filter(isNonEmptyString) } : {}),
    ...(typeof value.contentType === "string" ? { contentType: value.contentType } : {}),
    ...(accessOutcome ? { accessOutcome } : {}),
    ...(value.claimCited === true ? { claimCited: true } : {}),
    ...(Array.isArray(value.referringUrls) ? { referringUrls: value.referringUrls.filter(isNonEmptyString).slice(0, 12) } : {}),
  };
}

function optionalConfidence(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? Math.round(value)
    : undefined;
}

function parseSearchTerms(value: unknown, limit = 8): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter(isNonEmptyString).map((term) => term.trim().replace(/\s+/g, " ").slice(0, 240)))].slice(0, limit)
    : [];
}

function parseSearchTermsSource(value: unknown, terms: string[]): NonNullable<CustomEvidenceRecord["searchTermsSource"]> {
  if (value === "tool-observed" && terms.length) return "tool-observed";
  if (value === "ai-reported" && terms.length) return "ai-reported";
  return "unavailable";
}

function parseResearchCache(value: unknown): ResearchCacheMetadata | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.key) || !/^[a-f0-9]{64}$/.test(value.key)) return undefined;
  const states = ["fresh", "recent", "stale", "expired", "updated"] as const;
  const refreshStatuses = ["idle", "running", "completed", "failed"] as const;
  if (!states.includes(value.state as typeof states[number]) || !refreshStatuses.includes(value.refreshStatus as typeof refreshStatuses[number])) return undefined;
  const errorTypes = ["quota-exhausted", "provider-rate-limit", "provider-429", "authentication", "timeout", "malformed-response", "request-limit", "not-configured", "upstream"] as const;
  return {
    key: value.key,
    state: value.state as ResearchCacheMetadata["state"],
    storedAt: isNonEmptyString(value.storedAt) && Number.isFinite(Date.parse(value.storedAt)) ? value.storedAt : null,
    refreshStatus: value.refreshStatus as ResearchCacheMetadata["refreshStatus"],
    providerAvailable: value.providerAvailable !== false,
    ...(typeof value.validationPolicyVersion === "number" ? { validationPolicyVersion: value.validationPolicyVersion } : {}),
    ...(typeof value.researchPolicyVersion === "number" ? { researchPolicyVersion: value.researchPolicyVersion } : {}),
    ...(isNonEmptyString(value.modelVersion) ? { modelVersion: value.modelVersion } : {}),
    ...(errorTypes.includes(value.errorType as typeof errorTypes[number]) ? { errorType: value.errorType as ResearchCacheMetadata["errorType"] } : {}),
  };
}

function parseProviderAttempts(value: unknown): ResearchProviderAttempt[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).slice(0, 16).map((attempt) => {
    const usage = isRecord(attempt.usage) ? attempt.usage : null;
    const nullableNumber = (candidate: unknown) => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
    return {
      categoryId: isNonEmptyString(attempt.categoryId) ? attempt.categoryId : null,
      attemptType: ["primary", "repair", "follow-up"].includes(String(attempt.attemptType))
        ? attempt.attemptType as ResearchProviderAttempt["attemptType"]
        : "primary",
      queuedAt: isNonEmptyString(attempt.queuedAt) ? attempt.queuedAt : null,
      issuedAt: isNonEmptyString(attempt.issuedAt) ? attempt.issuedAt : null,
      finishedAt: isNonEmptyString(attempt.finishedAt) ? attempt.finishedAt : null,
      queueWaitMs: nullableNumber(attempt.queueWaitMs),
      elapsedMs: nullableNumber(attempt.elapsedMs),
      status: nullableNumber(attempt.status),
      outcome: ["completed", "failed", "cancelled"].includes(String(attempt.outcome))
        ? attempt.outcome as ResearchProviderAttempt["outcome"]
        : "failed",
      requestedOutputTokens: Math.max(0, Number(attempt.requestedOutputTokens) || 0),
      requestBodyBytes: Math.max(0, Number(attempt.requestBodyBytes) || 0),
      usage: usage ? {
        inputTokens: nullableNumber(usage.inputTokens),
        outputTokens: nullableNumber(usage.outputTokens),
        totalTokens: nullableNumber(usage.totalTokens),
      } : null,
    };
  });
}

function parseResearchAudit(value: unknown): ResearchAudit | undefined {
  if (!isRecord(value) || !Array.isArray(value.categories)) return undefined;
  const states: ResearchCategoryState[] = ["Complete", "Partial", "No eligible evidence", "Provider failure", "Timed out", "Not searched"];
  const categories = value.categories.flatMap((candidate) => {
    if (!isRecord(candidate) || !isNonEmptyString(candidate.categoryId) || !isNonEmptyString(candidate.label)) return [];
    const counts = isRecord(candidate.stageCounts) ? candidate.stageCounts : {};
    const state = states.includes(candidate.state as ResearchCategoryState) ? candidate.state as ResearchCategoryState : "Not searched";
    return [{
      categoryId: candidate.categoryId,
      label: candidate.label,
      evidenceIds: Array.isArray(candidate.evidenceIds) ? candidate.evidenceIds.filter(isNonEmptyString) : [],
      requestedPrimaryQuery: isNonEmptyString(candidate.requestedPrimaryQuery) ? candidate.requestedPrimaryQuery : "Not available",
      ...(isNonEmptyString(candidate.plannedPrimaryQuery) ? { plannedPrimaryQuery: candidate.plannedPrimaryQuery } : {}),
      ...(isNonEmptyString(candidate.issuedPrimaryQuery) ? { issuedPrimaryQuery: candidate.issuedPrimaryQuery } : {}),
      primaryQueryRole: "authoritative-primary",
      executedQueries: parseSearchTerms(candidate.executedQueries, 9),
      providerObservedPrimaryQueries: parseSearchTerms(candidate.providerObservedPrimaryQueries, 8),
      ...(isNonEmptyString(candidate.optionalFollowUpQuery) ? { optionalFollowUpQuery: candidate.optionalFollowUpQuery } : {}),
      ...(isNonEmptyString(candidate.plannedFollowUpQuery) ? { plannedFollowUpQuery: candidate.plannedFollowUpQuery } : {}),
      ...(isNonEmptyString(candidate.issuedFollowUpQuery) ? { issuedFollowUpQuery: candidate.issuedFollowUpQuery } : {}),
      fallbackQueryRole: "unrestricted-exact-project-fallback",
      providerObservedFollowUpQueries: parseSearchTerms(candidate.providerObservedFollowUpQueries, 8),
      ...(isNonEmptyString(candidate.followUpExecutedQuery) ? { followUpExecutedQuery: candidate.followUpExecutedQuery } : {}),
      followUpCount: Number(candidate.followUpCount) || (isNonEmptyString(candidate.followUpExecutedQuery) ? 1 : 0),
      followUpLimit: Number(candidate.followUpLimit) || 1,
      followUpTriggerEvidenceIds: Array.isArray(candidate.followUpTriggerEvidenceIds) ? candidate.followUpTriggerEvidenceIds.filter(isNonEmptyString).slice(0, 8) : [],
      ...(isNonEmptyString(candidate.followUpSkipReason) ? { followUpSkipReason: candidate.followUpSkipReason } : {}),
      authorityTargets: isRecord(candidate.authorityTargets) ? {
        names: Array.isArray(candidate.authorityTargets.names) ? candidate.authorityTargets.names.filter(isNonEmptyString).slice(0, 12) : [],
        domains: Array.isArray(candidate.authorityTargets.domains) ? candidate.authorityTargets.domains.filter(isNonEmptyString).slice(0, 12) : [],
        localAuthorities: Array.isArray(candidate.authorityTargets.localAuthorities) ? candidate.authorityTargets.localAuthorities.filter(isRecord).map((authority) => ({
          name: isNonEmptyString(authority.name) ? authority.name : "Unnamed authority",
          kind: isNonEmptyString(authority.kind) ? authority.kind : "local",
          domain: isNonEmptyString(authority.domain) ? authority.domain : null,
          establishmentMethod: isNonEmptyString(authority.establishmentMethod) ? authority.establishmentMethod : "unknown",
          status: authority.status === "established" ? "established" : "identified-no-domain",
        })) : [],
        limitations: Array.isArray(candidate.authorityTargets.limitations) ? candidate.authorityTargets.limitations.filter(isNonEmptyString).slice(0, 8) : [],
      } : { names: [], domains: [] },
      localAuthorities: Array.isArray(candidate.localAuthorities) ? candidate.localAuthorities.filter(isRecord).map((authority) => ({
        name: isNonEmptyString(authority.name) ? authority.name : "Unnamed authority",
        kind: isNonEmptyString(authority.kind) ? authority.kind : "local",
        domain: isNonEmptyString(authority.domain) ? authority.domain : null,
        establishmentMethod: isNonEmptyString(authority.establishmentMethod) ? authority.establishmentMethod : "unknown",
        status: authority.status === "established" ? "established" : "identified-no-domain",
      })) : [],
      authorityLimitations: Array.isArray(candidate.authorityLimitations) ? candidate.authorityLimitations.filter(isNonEmptyString).slice(0, 8) : [],
      ...(isRecord(candidate.identityContext) ? {
        identityContext: {
          requestedName: isNonEmptyString(candidate.identityContext.requestedName) ? candidate.identityContext.requestedName : "",
          aliases: Array.isArray(candidate.identityContext.aliases) ? candidate.identityContext.aliases.filter(isNonEmptyString).slice(0, 12) : [],
          operator: isNonEmptyString(candidate.identityContext.operator) ? candidate.identityContext.operator : null,
          location: isNonEmptyString(candidate.identityContext.location) ? candidate.identityContext.location : "",
          city: isNonEmptyString(candidate.identityContext.city) ? candidate.identityContext.city : null,
          county: isNonEmptyString(candidate.identityContext.county) ? candidate.identityContext.county : null,
          state: isNonEmptyString(candidate.identityContext.state) ? candidate.identityContext.state : null,
          ambiguities: Array.isArray(candidate.identityContext.ambiguities) ? candidate.identityContext.ambiguities.filter(isNonEmptyString).slice(0, 8) : [],
          resolutionRequired: candidate.identityContext.resolutionRequired !== false,
        },
      } : {}),
      identityAmbiguities: Array.isArray(candidate.identityAmbiguities) ? candidate.identityAmbiguities.filter(isNonEmptyString).slice(0, 8) : [],
      returnedDomains: Array.isArray(candidate.returnedDomains) ? candidate.returnedDomains.filter(isNonEmptyString).slice(0, 20) : [],
      openedDocuments: Array.isArray(candidate.openedDocuments) ? candidate.openedDocuments.slice(0, 20).filter((document) => isRecord(document)).map((document) => ({
        sourceChannel: isNonEmptyString(document.sourceChannel) ? document.sourceChannel.slice(0, 120) : "provider",
        originalUrl: isNonEmptyString(document.originalUrl) ? document.originalUrl : null,
        referringUrls: Array.isArray(document.referringUrls) ? document.referringUrls.filter(isNonEmptyString).slice(0, 12) : [],
        resolvedUrl: isNonEmptyString(document.resolvedUrl) ? document.resolvedUrl : null,
        canonicalUrl: isNonEmptyString(document.canonicalUrl) ? document.canonicalUrl : null,
        opened: document.opened === true,
         attempted: document.attempted === true,
         reusedReceipt: document.reusedReceipt === true,
        reusedFromCanonicalUrl: isNonEmptyString(document.reusedFromCanonicalUrl) ? document.reusedFromCanonicalUrl : null,
        accessState: ["accessible", "blocked", "unsupported", "not-attempted"].includes(document.accessState as string) ? document.accessState as NonNullable<ResearchCategoryAudit["openedDocuments"]>[number]["accessState"] : "not-attempted",
        accessOutcome: isNonEmptyString(document.accessOutcome) ? document.accessOutcome : "not-attempted",
        retainedPassage: isNonEmptyString(document.retainedPassage) ? document.retainedPassage : null,
        extractionLimitations: Array.isArray(document.extractionLimitations) ? document.extractionLimitations.filter(isNonEmptyString).slice(0, 8) : [],
        extractionMethod: isNonEmptyString(document.extractionMethod) ? document.extractionMethod : null,
        extractionOutcome: isNonEmptyString(document.extractionOutcome) ? document.extractionOutcome : null,
        contentHash: isNonEmptyString(document.contentHash) && /^[a-f0-9]{64}$/i.test(document.contentHash) ? document.contentHash.toLowerCase() : null,
      })) : [],
      discoveryAttempts: Array.isArray(candidate.discoveryAttempts) ? candidate.discoveryAttempts.slice(0, 24).filter(isRecord).map((attempt) => ({
        sourceChannel: isNonEmptyString(attempt.sourceChannel) ? attempt.sourceChannel.slice(0, 120) : "official-domain-discovery",
        url: safePublicSourceUrl(attempt.url) ?? null,
        status: isNonEmptyString(attempt.status) ? attempt.status.slice(0, 80) : null,
        httpStatus: Number.isInteger(attempt.httpStatus) ? Number(attempt.httpStatus) : null,
        contentType: isNonEmptyString(attempt.contentType) ? attempt.contentType.slice(0, 120) : null,
        physicalOpenIndex: Number.isInteger(attempt.physicalOpenIndex) ? Number(attempt.physicalOpenIndex) : null,
      })) : [],
      sourceChannelTelemetry: Array.isArray(candidate.sourceChannelTelemetry) ? candidate.sourceChannelTelemetry.slice(0, 80).filter(isRecord).map((entry) => ({
        sourceChannel: isNonEmptyString(entry.sourceChannel) ? entry.sourceChannel.slice(0, 120) : "provider",
        outcome: isNonEmptyString(entry.outcome) ? entry.outcome.slice(0, 80) : "unknown",
        reason: isNonEmptyString(entry.reason) ? entry.reason.slice(0, 120) : null,
      })) : [],
      noReturnCounts: isRecord(candidate.noReturnCounts) ? {
        total: Math.max(0, Number(candidate.noReturnCounts.total) || 0),
        missingUrl: Math.max(0, Number(candidate.noReturnCounts.missingUrl) || 0),
        unsafeUrl: Math.max(0, Number(candidate.noReturnCounts.unsafeUrl) || 0),
        noPublicUrl: Math.max(0, Number(candidate.noReturnCounts.noPublicUrl) || 0),
        byChannel: isRecord(candidate.noReturnCounts.byChannel)
          ? Object.fromEntries(Object.entries(candidate.noReturnCounts.byChannel).slice(0, 20).map(([channel, count]) => [channel.slice(0, 120), Math.max(0, Number(count) || 0)]))
          : {},
      } : { total: 0, missingUrl: 0, unsafeUrl: 0, noPublicUrl: 0, byChannel: {} },
      authorityRecords: Array.isArray(candidate.authorityRecords) ? candidate.authorityRecords.slice(0, 24).filter(isRecord).map((authority) => ({
        name: isNonEmptyString(authority.name) ? authority.name.slice(0, 200) : "Unknown authority",
        domain: isNonEmptyString(authority.domain) ? authority.domain.slice(0, 160) : null,
        jurisdiction: isNonEmptyString(authority.jurisdiction) ? authority.jurisdiction.slice(0, 160) : "unknown",
        establishmentMethod: isNonEmptyString(authority.establishmentMethod) ? authority.establishmentMethod.slice(0, 120) : "unknown",
        discoveredAt: isNonEmptyString(authority.discoveredAt) ? authority.discoveredAt.slice(0, 80) : "",
        sourceChannel: isNonEmptyString(authority.sourceChannel) ? authority.sourceChannel.slice(0, 120) : "unknown",
        urlsAttempted: Array.isArray(authority.urlsAttempted) ? authority.urlsAttempted.map(safePublicSourceUrl).filter((url): url is string => Boolean(url)).slice(0, 12) : [],
        accessOutcomes: Array.isArray(authority.accessOutcomes) ? authority.accessOutcomes.slice(0, 12).filter(isRecord).map((outcome) => ({
          url: safePublicSourceUrl(outcome.url) ?? null,
          status: isNonEmptyString(outcome.status) ? outcome.status.slice(0, 80) : "unknown",
          httpStatus: Number.isInteger(outcome.httpStatus) ? Number(outcome.httpStatus) : null,
          physicalOpenIndex: Number.isInteger(outcome.physicalOpenIndex) ? Number(outcome.physicalOpenIndex) : null,
        })) : [],
      })) : [],
      secConnectorAttempts: Array.isArray(candidate.secConnectorAttempts) ? candidate.secConnectorAttempts.slice(0, 12).filter(isRecord).map((attempt) => ({
        sourceChannel: "sec-public-data" as const,
        sourceOrigin: safePublicSourceUrl(attempt.sourceOrigin) ?? null,
        sourcePathname: isNonEmptyString(attempt.sourcePathname) ? attempt.sourcePathname.slice(0, 500) : null,
        status: Number.isInteger(attempt.status) ? Number(attempt.status) : null,
        outcome: isNonEmptyString(attempt.outcome) ? attempt.outcome.slice(0, 80) : null,
        reason: isNonEmptyString(attempt.reason) ? attempt.reason.slice(0, 160) : null,
      })) : [],
      state,
      stageCounts: {
        normalized: Number(counts.normalized) || 0,
        accessed: Number(counts.accessed) || 0,
        parsed: Number(counts.parsed) || 0,
        claimMapped: Number(counts.claimMapped) || 0,
        eligible: Number(counts.eligible) || 0,
        retainedCandidates: Number(counts.retainedCandidates) || 0,
         ...(Number.isFinite(Number(counts.candidates)) ? { candidates: Number(counts.candidates) } : {}),
         ...(Number.isFinite(Number(counts.attemptedRetrievals)) ? { attemptedRetrievals: Number(counts.attemptedRetrievals) } : {}),
         ...(Number.isFinite(Number(counts.successfulAccesses)) ? { successfulAccesses: Number(counts.successfulAccesses) } : {}),
         ...(Number.isFinite(Number(counts.retainedPassages)) ? { retainedPassages: Number(counts.retainedPassages) } : {}),
         ...(Number.isFinite(Number(counts.reusedReceipts)) ? { reusedReceipts: Number(counts.reusedReceipts) } : {}),
         ...(Number.isFinite(Number(counts.notAttempted)) ? { notAttempted: Number(counts.notAttempted) } : {}),
         ...(Number.isFinite(Number(counts.issuedProviderRequests)) ? { issuedProviderRequests: Number(counts.issuedProviderRequests) } : {}),
         ...(Number.isFinite(Number(counts.observedSearches)) ? { observedSearches: Number(counts.observedSearches) } : {}),
         ...(Number.isFinite(Number(counts.successfulExtractions)) ? { successfulExtractions: Number(counts.successfulExtractions) } : {}),
      },
      rejectionCounts: isRecord(candidate.rejectionCounts)
        ? Object.fromEntries(Object.entries(candidate.rejectionCounts).map(([key, count]) => [key, Number(count) || 0]))
        : {},
      accessLimitations: Array.isArray(candidate.accessLimitations) ? candidate.accessLimitations.filter(isNonEmptyString).slice(0, 8) : [],
      unresolvedGaps: Array.isArray(candidate.unresolvedGaps) ? candidate.unresolvedGaps.filter(isNonEmptyString).slice(0, 8) : [],
      ...(isNonEmptyString(candidate.providerFailure) ? { providerFailure: candidate.providerFailure } : {}),
      ...(["quota-exhausted", "provider-rate-limit", "provider-429", "authentication", "deadline", "malformed-response", "upstream", "provider-request-budget"].includes(String(candidate.providerFailureType))
        ? { providerFailureType: candidate.providerFailureType as NonNullable<ResearchCategoryAudit["providerFailureType"]> }
        : {}),
      ...(Number.isInteger(candidate.providerRequestCount) ? { providerRequestCount: Math.max(0, Number(candidate.providerRequestCount)) } : {}),
      providerAttempts: parseProviderAttempts(candidate.providerAttempts),
    } satisfies ResearchCategoryAudit];
  });
  const budget = isRecord(value.budget) ? value.budget : {};
  return {
    version: Number(value.version) || 1,
    policyVersion: Number(value.policyVersion) || 1,
    provider: isNonEmptyString(value.provider) ? value.provider : "unknown",
    model: isNonEmptyString(value.model) ? value.model : "unknown",
    providerResponseId: value.providerResponseId === null || isNonEmptyString(value.providerResponseId) ? value.providerResponseId as string | null : null,
    ...(isNonEmptyString(value.runCorrelationId) ? { runCorrelationId: value.runCorrelationId } : {}),
    ...(["complete-with-eligible-evidence", "complete-no-eligible-evidence", "incomplete-technical-limitation"].includes(String(value.terminalState))
      ? { terminalState: value.terminalState as ResearchAudit["terminalState"] }
      : {}),
    terminalReasonCodes: Array.isArray(value.terminalReasonCodes) ? value.terminalReasonCodes.filter(isNonEmptyString).slice(0, 16) : [],
    identityPhysicalOpenOpportunityReserved: value.identityPhysicalOpenOpportunityReserved === true,
    candidateLineage: Array.isArray(value.candidateLineage)
      ? value.candidateLineage.filter(isRecord).slice(0, 112)
      : [],
    startedAt: isNonEmptyString(value.startedAt) ? value.startedAt : null,
    finishedAt: isNonEmptyString(value.finishedAt) ? value.finishedAt : null,
    elapsedMs: typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) ? value.elapsedMs : null,
    budget: {
      deadlineMs: Number(budget.deadlineMs) || 90_000,
      maxProviderRequests: Number(budget.maxProviderRequests) || 16,
      maxFollowUps: Number(budget.maxFollowUps) || 8,
      maxFollowUpsPerCategory: Number(budget.maxFollowUpsPerCategory) || 1,
      maxCandidatesPerCategory: Number(budget.maxCandidatesPerCategory) || 10,
      maxTotalCandidates: Number(budget.maxTotalCandidates) || 80,
      maxToolCalls: Number(budget.maxToolCalls) || 32,
      maxPhysicalDocumentOpens: Number(budget.maxPhysicalDocumentOpens) || 24,
    },
    toolCallCount: Number(value.toolCallCount) || 0,
    ...(typeof value.observedToolCallCount === "number" ? { observedToolCallCount: value.observedToolCallCount } : {}),
    ...(typeof value.acceptedToolCallCount === "number" ? { acceptedToolCallCount: value.acceptedToolCallCount } : {}),
    providerRequestCount: Number(value.providerRequestCount) || 0,
    providerAttempts: parseProviderAttempts(value.providerAttempts),
    physicalOpenBudget: Number(value.physicalOpenBudget) || Number(budget.maxPhysicalDocumentOpens) || 24,
    physicalOpensUsed: Number(value.physicalOpensUsed) || 0,
    physicalOpensRemaining: Number.isFinite(Number(value.physicalOpensRemaining)) ? Math.max(0, Number(value.physicalOpensRemaining)) : Number(value.physicalOpenBudget) || 24,
    physicalOpenBudgetExceeded: value.physicalOpenBudgetExceeded === true,
    followUpCount: Number(value.followUpCount) || 0,
    followUpLimit: Number(value.followUpLimit) || 8,
    followUpLimitPerCategory: Number(value.followUpLimitPerCategory) || 1,
    sourcePriorityApplied: Array.isArray(value.sourcePriorityApplied) ? value.sourcePriorityApplied.filter(isNonEmptyString).slice(0, 8) : [],
    categories,
    categoryGaps: Array.isArray(value.categoryGaps) ? value.categoryGaps.filter(isNonEmptyString) : categories.filter((category) => category.state !== "Complete").map((category) => category.categoryId),
    providerLimitations: Array.isArray(value.providerLimitations) ? value.providerLimitations.filter(isNonEmptyString).slice(0, 12) : [],
  };
}

function parseIdentityContext(value: unknown): ResearchCategoryAudit["identityContext"] | undefined {
  if (!isRecord(value)) return undefined;
  return {
    requestedName: isNonEmptyString(value.requestedName) ? value.requestedName : "",
    aliases: Array.isArray(value.aliases) ? value.aliases.filter(isNonEmptyString).slice(0, 12) : [],
    operator: isNonEmptyString(value.operator) ? value.operator : null,
    location: isNonEmptyString(value.location) ? value.location : "",
    city: isNonEmptyString(value.city) ? value.city : null,
    county: isNonEmptyString(value.county) ? value.county : null,
    state: isNonEmptyString(value.state) ? value.state : null,
    ambiguities: Array.isArray(value.ambiguities) ? value.ambiguities.filter(isNonEmptyString).slice(0, 8) : [],
    resolutionRequired: value.resolutionRequired !== false,
  };
}

const VALID_CLASSIFICATIONS: Classification[] = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

export function isCompatibleResearchUnit(id: string, unit: string): boolean {
  const definition = EVIDENCE_SEMANTIC_POLICY[id];
  if (!definition) return false;
  if (definition.valueKind === "qualitative") {
    return definition.allowedUnits.some((allowed) => allowed.toLowerCase() === unit.trim().toLowerCase());
  }
  return normalizeEvidenceRecord({
    id,
    value: 1,
    numericValue: 1,
    unit,
    description: "facility project tariff",
    explicitZero: true,
  }).validationStatus === "valid";
}

export function containCustomResearchEvidence(item: CustomEvidenceRecord): CustomEvidenceRecord {
  const reasons: string[] = [];
  const hasSource = Boolean(item.sourceUrl) || Boolean(item.sources?.length);
  const sourceEligibility = evaluateEvidenceSourceEligibility({
    id: item.id,
    sources: item.sources,
    sourceUrl: item.sourceUrl,
    classification: item.classification,
    sourceSupportConfidence: item.sourceSupportConfidence,
    coverageStatus: item.coverageStatus,
  });
  const rawValue = item.rawValue ?? item.value;
  const rawUnit = item.rawUnit ?? item.unit;
  const claimMappings = item.claimMappings ?? buildClaimPassageMappings({
    id: item.id,
    sources: item.sources,
    project: {},
    claim: {
      description: item.description,
      value: item.rawValue ?? item.value,
      numericValue: item.numericValue,
      sourceRelevance: item.sourceRelevance,
    },
    coverageStatus: item.coverageStatus,
    conflictSummary: item.conflictSummary,
  }) as ResearchClaimPassageMapping[];
  const semantic = normalizeEvidenceRecord({
    id: item.id,
    value: item.rawValue !== undefined || item.numericValue !== undefined ? rawValue : undefined,
    unit: rawUnit,
    numericValue: item.rawValue === undefined ? item.numericValue : rawValue,
    qualitativeValue: item.qualitativeValue,
    description: item.description,
    citation: item.citation,
    sourceContext: (item.sources ?? []).flatMap((source) => [source.title, source.excerpt]).join(" "),
    explicitZero: rawValue === 0 && Boolean(item.sourceUrl),
  });
  const researchEligibility = evaluateResearchEvidenceEligibility({
    id: item.id,
    sources: item.sources,
    sourceUrl: item.sourceUrl,
    sourceRelevance: item.sourceRelevance,
    classification: item.classification,
    sourceSupportConfidence: item.sourceSupportConfidence,
    coverageStatus: item.coverageStatus,
    conflictSummary: item.conflictSummary,
    claimMappings,
    semanticValidationStatus: semantic.validationStatus,
  });
  reasons.push(...sourceEligibility.reasons, ...researchEligibility.reasons, ...semantic.quarantineReasons);
  if (item.conflictSummary || item.coverageStatus === "conflicting") reasons.push("Conflicting source coverage requires reviewer resolution.");
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
    ...(typeof semantic.normalizedValue === "string" ? { qualitativeValue: semantic.normalizedValue as EvidenceItem["qualitativeValue"] } : {}),
    normalization: {
      policyVersion: semantic.policyVersion,
      conversion: semantic.conversion,
      validationStatus: semantic.validationStatus,
    },
    semanticValidationStatus: semantic.validationStatus,
    eligibleForModel: eligible && semantic.modelEligible,
    acceptedForModel: item.acceptedForModel === true && eligible,
    researchState: item.acceptedForModel === true && eligible ? "accepted" : eligible ? "proposed" : hasSource ? "quarantined" : "retrieved-lead",
    quarantineReasons: [...new Set(reasons)],
    sourceValidation: {
      policyVersion: SOURCE_VALIDATION_POLICY_VERSION,
      state: researchEligibility.state,
      rejectionCodes: researchEligibility.rejectionCodes,
      claimMappings,
    },
  };
}

function parseResponse(value: unknown): CustomResearchResponse {
  if (!isRecord(value) || !isRecord(value.projectSummary) || !Array.isArray(value.evidence)) {
    throw new Error("Project research returned an incomplete response.");
  }
  const summary = value.projectSummary;
  const reportedCapacityMW = normalizeReportedCapacityMW(summary.capacityMW);
  if (
    !isNonEmptyString(summary.name) ||
    !isNonEmptyString(summary.location) ||
    !isNonEmptyString(summary.description)
  ) {
    throw new Error("Project research returned an invalid project summary.");
  }
  if (value.evidence.length !== CUSTOM_EVIDENCE_IDS.length) {
    throw new Error("Project research must return exactly 16 evidence items.");
  }

  const expectedIds = new Set<string>(CUSTOM_EVIDENCE_IDS);
  const seenIds = new Set<string>();
  const evidence = value.evidence.map((candidate) => {
    if (!isRecord(candidate)) throw new Error("Project research returned an invalid evidence item.");
    const required = ["id", "label", "unit", "classification", "citation", "description", "sourceRole"];
    if (required.some((field) => !isNonEmptyString(candidate[field])) || (
      typeof candidate.value !== "string" &&
      (typeof candidate.value !== "number" || !Number.isFinite(candidate.value))
    )) {
      throw new Error("Project research returned an incomplete evidence item.");
    }
    const id = candidate.id as string;
    if (!expectedIds.has(id) || seenIds.has(id)) {
      throw new Error("Project research must return each modeled evidence item exactly once.");
    }
    seenIds.add(id);
    if (!VALID_CLASSIFICATIONS.includes(candidate.classification as Classification)) {
      throw new Error("Project research returned an invalid evidence classification.");
    }
    if (candidate.numericValue !== undefined && (typeof candidate.numericValue !== "number" || !Number.isFinite(candidate.numericValue))) {
      throw new Error("Project research returned an invalid numeric evidence value.");
    }
    const sourceUrl = safePublicSourceUrl(candidate.sourceUrl);
    const sources = Array.isArray(candidate.sources)
      ? candidate.sources.map(parseSource).filter((source): source is ResearchEvidenceSource => Boolean(source)).slice(0, 4)
      : [];
    const coverageStatus = ["supported", "searched-no-support", "partial", "conflicting"].includes(String(candidate.coverageStatus))
      ? candidate.coverageStatus as ResearchCoverageStatus
      : sourceUrl ? "supported" : "searched-no-support";
    const sourceRelevance: NonNullable<CustomEvidenceRecord["sourceRelevance"]> =
      candidate.sourceRelevance === "exact-project" || candidate.sourceRelevance === "related-context" || candidate.sourceRelevance === "unresolved"
        ? candidate.sourceRelevance
        : sourceUrl ? "related-context" : "unresolved";
    const accessStatus = ["open", "paywall", "registration", "not provided"].includes(String(candidate.sourceAccessStatus))
      ? candidate.sourceAccessStatus as EvidenceItem["sourceAccessStatus"]
      : undefined;
    const hasValidatedSource = sources.length > 0 || Boolean(sourceUrl);
    const classification = candidate.classification as Classification;
    const claimMappings = buildClaimPassageMappings({
      id,
      sources,
      project: summary,
      claim: {
        text: candidate.description,
        description: candidate.description,
        value: candidate.rawValue ?? candidate.value,
        numericValue: candidate.numericValue,
        sourceRelevance,
      },
      coverageStatus,
      conflictSummary: isNonEmptyString(candidate.conflictSummary) ? candidate.conflictSummary : undefined,
    }) as ResearchClaimPassageMapping[];
    const safeClassification = classification === "Verified Evidence" && !hasValidatedSource
      ? "Management Assertion"
      : classification;
    return containCustomResearchEvidence({
      id,
      label: candidate.label as string,
      value: candidate.value as string | number,
      unit: candidate.unit as string,
      classification: safeClassification,
      citation: candidate.citation as string,
      description: candidate.description as string,
      sourceRole: candidate.sourceRole as string,
      coverageStatus,
      searchCoverage: Array.isArray(candidate.searchCoverage) ? candidate.searchCoverage.filter(isNonEmptyString).map((entry) => entry.trim()) : [],
      failedSearchDomains: Array.isArray(candidate.failedSearchDomains) ? candidate.failedSearchDomains.filter(isNonEmptyString).map((entry) => entry.trim()) : [],
      sourceSupportConfidence: optionalConfidence(candidate.sourceSupportConfidence),
      modelReportedConfidence: optionalConfidence(candidate.modelReportedConfidence),
      classificationReason: isNonEmptyString(candidate.classificationReason)
        ? candidate.classificationReason.trim()
        : safeClassification === "Management Assertion" && !hasValidatedSource
          ? "Generated lead has no validated source and cannot be treated as Verified Evidence."
          : "The research response did not provide a concise classification reason.",
      sourceRelevanceNote: isNonEmptyString(candidate.sourceRelevanceNote)
        ? candidate.sourceRelevanceNote.trim()
        : sourceUrl ? "The returned source is mapped to this claim; review it before relying on the finding." : "No validated source was mapped to this claim.",
      sourceRelevance,
      claimMappings,
      sourceValidation: {
        policyVersion: SOURCE_VALIDATION_POLICY_VERSION,
        state: claimMappings.some((mapping) => mapping.supportStatus === "supported")
          ? "claim-supported"
          : sources.length ? "evidence-mapped" : "discovered",
        rejectionCodes: claimMappings.flatMap((mapping) => mapping.rejectionCodes),
        claimMappings,
      },
      searchTerms: parseSearchTerms(candidate.searchTerms),
      searchTermsSource: parseSearchTermsSource(candidate.searchTermsSource, parseSearchTerms(candidate.searchTerms)),
      ...(isNonEmptyString(candidate.conflictSummary) ? { conflictSummary: candidate.conflictSummary.trim() } : {}),
      ...(candidate.rawValue !== undefined ? {
        rawValue: candidate.rawValue as string | number,
        rawUnit: isNonEmptyString(candidate.rawUnit) ? candidate.rawUnit : candidate.unit as string,
        rawText: isNonEmptyString(candidate.rawText) ? candidate.rawText : String(candidate.rawValue ?? ""),
      } : {}),
      ...(sources.length ? { sources } : {}),
      ...(sourceUrl ? {
        sourceUrl,
        sourceTitle: optionalString(candidate.sourceTitle),
        sourcePublisher: optionalString(candidate.sourcePublisher),
        sourcePublishedAt: optionalDate(candidate.sourcePublishedAt),
        sourceAccessedAt: optionalDate(candidate.sourceAccessedAt),
        sourceAccessStatus: accessStatus ?? "not provided",
      } : {}),
      ...(candidate.numericValue === undefined ? {} : { numericValue: candidate.numericValue as number }),
      ...(candidate.qualitativeValue === undefined ? {} : { qualitativeValue: candidate.qualitativeValue as EvidenceItem["qualitativeValue"] }),
    });
  });

  const containedEvidence = evidence.map(containCustomResearchEvidence);
  const eligibleEvidence = containedEvidence.filter((item) => item.eligibleForModel);
  const retrievedLeads = containedEvidence.filter((item) => item.researchState === "retrieved-lead" || item.researchState === "quarantined");
  const terminalOutcome = isRecord(value.researchOutcome) ? value.researchOutcome.state : null;
  const outcomeRequiresIncompleteMode = terminalOutcome === "incomplete-technical-limitation"
    || terminalOutcome === "complete-no-eligible-evidence";

  return {
    projectSummary: {
      name: summary.name as string,
      location: summary.location as string,
      description: summary.description as string,
      capacityMW: summary.capacityProvenance === "standardized-default"
        ? DEFAULT_RESEARCH_CAPACITY_MW
        : reportedCapacityMW ?? DEFAULT_RESEARCH_CAPACITY_MW,
      capacityProvenance: summary.capacityProvenance !== "standardized-default" && reportedCapacityMW !== null
        ? summary.capacityProvenance === "directory-reported" ? "directory-reported" : "ai-reported"
        : "standardized-default",
    },
    ...(value.researchStatus === "researching" || value.researchStatus === "completed" || value.researchStatus === "partial" || value.researchStatus === "timed-out" || value.researchStatus === "failed" || value.researchStatus === "cancelled"
      ? { researchStatus: value.researchStatus }
      : {}),
    ...(isRecord(value.researchOutcome)
      && ["complete-with-eligible-evidence", "complete-no-eligible-evidence", "incomplete-technical-limitation"].includes(String(value.researchOutcome.state))
      ? {
        researchOutcome: {
          state: value.researchOutcome.state as ResearchOutcomeState,
          eligibleEvidenceCount: Math.max(0, Number(value.researchOutcome.eligibleEvidenceCount) || 0),
          reasonCodes: Array.isArray(value.researchOutcome.reasonCodes)
            ? value.researchOutcome.reasonCodes.filter(isNonEmptyString).slice(0, 16)
            : [],
        },
      }
      : {}),
    ...(isRecord(value.researchError) && isNonEmptyString(value.researchError.message)
      ? {
        researchError: {
          type: value.researchError.type === "timeout" || value.researchError.type === "cancelled" || value.researchError.type === "upstream"
            ? value.researchError.type
            : "malformed-response",
          message: value.researchError.message.trim().slice(0, 500),
        },
      }
      : {}),
    researchMode: value.researchMode === "default-assumptions"
      ? "default-assumptions"
      : outcomeRequiresIncompleteMode
        ? "research-incomplete"
      : eligibleEvidence.length > 0 || (Array.isArray(value.sourceLedger) && value.sourceLedger.length > 0) || Boolean(value.researchCache)
        ? eligibleEvidence.length > 0 && containedEvidence.some((item) => item.classification === "Missing Evidence")
          ? "partial-public-source"
          : "ai-researched"
        : "research-incomplete",
     ...(parseResearchCache(value.researchCache) ? { researchCache: parseResearchCache(value.researchCache) } : {}),
     semanticPolicyVersion: typeof value.semanticPolicyVersion === "number" ? value.semanticPolicyVersion : EVIDENCE_SEMANTIC_POLICY_VERSION,
      sourceValidationPolicyVersion: typeof value.sourceValidationPolicyVersion === "number"
        ? value.sourceValidationPolicyVersion
        : SOURCE_VALIDATION_POLICY_VERSION,
      ...(Array.isArray(value.sourceLedger) ? { sourceLedger: value.sourceLedger } : {}),
     ...(parseResearchAudit(value.researchAudit) ? { researchAudit: parseResearchAudit(value.researchAudit) } : {}),
    ...(isRecord(value.researchCoverage) ? {
      researchCoverage: {
         ...(parseIdentityContext(value.researchCoverage.identityContext) ? { identityContext: parseIdentityContext(value.researchCoverage.identityContext) } : {}),
        searchedDomains: Array.isArray(value.researchCoverage.searchedDomains) ? value.researchCoverage.searchedDomains.filter(isNonEmptyString) : [],
        failedDomains: Array.isArray(value.researchCoverage.failedDomains) ? value.researchCoverage.failedDomains.filter(isNonEmptyString) : [],
        retrievedSourceCount: typeof value.researchCoverage.retrievedSourceCount === "number" && Number.isFinite(value.researchCoverage.retrievedSourceCount)
          ? value.researchCoverage.retrievedSourceCount
          : 0,
        searchTerms: parseSearchTerms(value.researchCoverage.searchTerms, 32),
        searchTermsSource: parseSearchTermsSource(value.researchCoverage.searchTermsSource, parseSearchTerms(value.researchCoverage.searchTerms, 32)),
        ...(typeof value.researchCoverage.toolCallCount === "number" && Number.isInteger(value.researchCoverage.toolCallCount) && value.researchCoverage.toolCallCount >= 0
          ? { toolCallCount: value.researchCoverage.toolCallCount } : {}),
        ...(value.researchCoverage.toolCallLimit === 32 ? { toolCallLimit: 32 } : {}),
        toolCallBudgetExceeded: value.researchCoverage.toolCallBudgetExceeded === true,
        ...(typeof value.researchCoverage.observedToolCallCount === "number" ? { observedToolCallCount: value.researchCoverage.observedToolCallCount } : {}),
        ...(typeof value.researchCoverage.acceptedToolCallCount === "number" ? { acceptedToolCallCount: value.researchCoverage.acceptedToolCallCount } : {}),
        ...(Array.isArray(value.researchCoverage.providerLimitations)
          ? { providerLimitations: value.researchCoverage.providerLimitations.filter(isNonEmptyString).slice(0, 12) }
          : {}),
         ...(typeof value.researchCoverage.physicalOpenBudget === "number" ? { physicalOpenBudget: value.researchCoverage.physicalOpenBudget } : {}),
         ...(typeof value.researchCoverage.physicalOpensUsed === "number" ? { physicalOpensUsed: value.researchCoverage.physicalOpensUsed } : {}),
         ...(typeof value.researchCoverage.physicalOpensRemaining === "number" ? { physicalOpensRemaining: value.researchCoverage.physicalOpensRemaining } : {}),
         ...(typeof value.researchCoverage.physicalOpenBudgetExceeded === "boolean" ? { physicalOpenBudgetExceeded: value.researchCoverage.physicalOpenBudgetExceeded } : {}),
        ...(typeof value.researchCoverage.followUpCount === "number" ? { followUpCount: value.researchCoverage.followUpCount } : {}),
        ...(typeof value.researchCoverage.followUpLimit === "number" ? { followUpLimit: value.researchCoverage.followUpLimit } : {}),
        ...(typeof value.researchCoverage.followUpLimitPerCategory === "number" ? { followUpLimitPerCategory: value.researchCoverage.followUpLimitPerCategory } : {}),
        ...(Array.isArray(value.researchCoverage.sourcePriorityApplied)
          ? { sourcePriorityApplied: value.researchCoverage.sourcePriorityApplied.filter(isNonEmptyString).slice(0, 8) }
          : {}),
         ...(isRecord(value.researchCoverage.sourceLedgerSummary) ? {
           sourceLedgerSummary: {
             rawOccurrenceCount: Number(value.researchCoverage.sourceLedgerSummary.rawOccurrenceCount) || 0,
             retainedCount: Number(value.researchCoverage.sourceLedgerSummary.retainedCount) || 0,
             rejectedCount: Number(value.researchCoverage.sourceLedgerSummary.rejectedCount) || 0,
             capDiscardCount: Number(value.researchCoverage.sourceLedgerSummary.capDiscardCount) || 0,
           },
         } : {}),
      },
    } : {}),
     evidence: containedEvidence,
     retrievedLeads,
     eligibleEvidence,
     proposedInputs: eligibleEvidence,
     acceptedModelInputs: containedEvidence.filter((item) => item.acceptedForModel),
     quarantineReasons: [...new Set(containedEvidence.flatMap((item) => item.quarantineReasons ?? []))],
  };
}

export function createDefaultAssumptionResearch(
  name: string,
  location: string,
  knownData?: KnownProjectData,
): CustomResearchResponse {
  const normalizedKnownData = normalizeKnownData(knownData);
  const capacityMW = normalizeReportedCapacityMW(normalizedKnownData?.capacity) ?? DEFAULT_RESEARCH_CAPACITY_MW;
  const context = [
    normalizedKnownData?.operator ? `Operator: ${normalizedKnownData.operator}.` : null,
    normalizedKnownData?.status ? `Directory status: ${normalizedKnownData.status}.` : null,
    normalizedKnownData?.sourceUrl ? `Compute Atlas discovery record: ${normalizedKnownData.sourceUrl}` : null,
  ].filter(Boolean).join(" ");
  return {
    projectSummary: {
      name: name.trim(),
      location: location.trim(),
      description: `AI research was unavailable. This case uses default assumptions and no project-specific evidence. ${context}`.trim(),
      capacityMW,
      capacityProvenance: normalizedKnownData?.capacity ? "directory-reported" : "standardized-default",
    },
    researchMode: "default-assumptions",
    researchCoverage: {
      searchedDomains: [],
      failedDomains: [],
      retrievedSourceCount: 0,
      searchTerms: [],
      searchTermsSource: "unavailable",
    },
    retrievedLeads: [],
    eligibleEvidence: [],
    proposedInputs: [],
    acceptedModelInputs: [],
    quarantineReasons: ["No project-specific research was available."],
    evidence: CUSTOM_EVIDENCE_IDS.map((id) => ({
      id,
      label: DEFAULT_EVIDENCE_DEFINITIONS[id].label,
      value: "Not established",
      unit: DEFAULT_EVIDENCE_DEFINITIONS[id].unit,
      classification: "Missing Evidence",
      citation: "AI research unavailable; no project-specific public evidence was established.",
      description: "This item is intentionally unresolved in the default-assumptions fallback.",
      sourceRole: "Default-assumptions fallback · no public evidence applied",
      coverageStatus: "searched-no-support",
      searchCoverage: [],
      failedSearchDomains: [],
      sourceSupportConfidence: 0,
      classificationReason: "Default assumptions contain no project-specific evidence.",
      sourceRelevanceNote: "No validated source was mapped to this claim.",
      searchTerms: [],
      searchTermsSource: "unavailable",
      researchState: "retrieved-lead",
      eligibleForModel: false,
      acceptedForModel: false,
      quarantineReasons: ["No project-specific research was available."],
    })),
  };
}

export function createProvisionalResearch(
  name: string,
  location: string,
  knownData?: KnownProjectData,
): CustomResearchResponse {
  const normalizedKnownData = normalizeKnownData({
    ...deriveLocationContext(location),
    ...knownData,
  });
  const capacityMW = normalizeReportedCapacityMW(normalizedKnownData?.capacity) ?? DEFAULT_RESEARCH_CAPACITY_MW;
  return {
    projectSummary: {
      name: name.trim(),
      location: location.trim(),
      description: "Research is running for this submitted project. No synthetic economics have been applied; unresolved items remain Missing Evidence until validated findings arrive.",
      capacityMW,
      capacityProvenance: normalizedKnownData?.capacity ? "directory-reported" : "standardized-default",
    },
    researchMode: "research-incomplete",
    researchStatus: "researching",
    researchCoverage: {
      searchedDomains: [],
      failedDomains: [],
      retrievedSourceCount: 0,
      searchTerms: [],
      searchTermsSource: "unavailable",
    },
    retrievedLeads: [],
    eligibleEvidence: [],
    proposedInputs: [],
    acceptedModelInputs: [],
    quarantineReasons: ["Research is still running; no findings have been accepted into the model."],
    evidence: CUSTOM_EVIDENCE_IDS.map((id) => ({
      id,
      label: DEFAULT_EVIDENCE_DEFINITIONS[id].label,
      value: "Not established",
      unit: DEFAULT_EVIDENCE_DEFINITIONS[id].unit,
      classification: "Missing Evidence",
      citation: "Research is running; no validated project-specific source has been retained yet.",
      description: "This item remains unresolved until a category result passes source validation.",
      sourceRole: "Research in progress · no validated category result",
      coverageStatus: "searched-no-support",
      searchCoverage: [],
      failedSearchDomains: [],
      sourceSupportConfidence: 0,
      classificationReason: "Research has not returned a validated finding for this item.",
      sourceRelevanceNote: "No validated source was mapped to this claim.",
      searchTerms: [],
      searchTermsSource: "unavailable",
      researchState: "retrieved-lead",
      eligibleForModel: false,
      acceptedForModel: false,
      quarantineReasons: ["Research is still running."],
    })),
  };
}

class ResearchTimeoutError extends Error {
  constructor(message = "Project research timed out. Try again or use the curated case.") {
    super(message);
    this.name = "ResearchTimeoutError";
  }
}

class ResearchCancelledError extends Error {
  constructor() {
    super("Project research was cancelled.");
    this.name = "ResearchCancelledError";
  }
}

async function requestResearchProject(
  name: string,
  location: string,
  knownData: KnownProjectData | undefined,
  focusIds: string[] | undefined,
  currentEvidence: ResearchProjectOptions["currentEvidence"],
  forceRefresh: boolean,
  signal: AbortSignal | undefined,
  onProgress: ResearchProjectOptions["onProgress"],
  fetchImpl: typeof fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_PROJECT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    onProgress?.("researching");
    const response = await fetchImpl(RESEARCH_PROJECT_ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        name,
        location,
        ...(knownData ? { knownData } : {}),
        ...(focusIds?.length ? { focusIds } : {}),
        ...(currentEvidence?.length ? { currentEvidence } : {}),
        ...(forceRefresh ? { forceRefresh: true } : {}),
      }),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
    if (!response.ok) {
      if (isRecord(body) && isRecord(body.result)) {
        const partial = parseResponse(body.result);
        const researchMode: ResearchMode = partial.researchMode === "default-assumptions" || partial.researchMode === "research-incomplete"
          ? partial.researchMode
          : "partial-public-source";
        return {
          ...partial,
          researchMode,
        };
      }
      if (response.status === 504) throw new ResearchTimeoutError();
      const message = isRecord(body) && isNonEmptyString(body.error) ? body.error : "Project research is unavailable. Try again or use the curated case.";
      throw new Error(message);
    }
    return parseResponse(body);
  } catch (error) {
    if (signal?.aborted) throw new ResearchCancelledError();
    if (error instanceof ResearchTimeoutError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ResearchTimeoutError();
    throw error instanceof Error ? error : new Error("Project research is unavailable. Try again or use the curated case.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function researchProject(
  name: string,
  location: string,
  optionsOrFetch: ResearchProjectOptions | typeof fetch = {},
  legacyOptions: ResearchProjectOptions = {},
): Promise<CustomResearchResponse> {
  const fetchImpl = typeof optionsOrFetch === "function" ? optionsOrFetch : fetch;
  const options = typeof optionsOrFetch === "function" ? legacyOptions : optionsOrFetch;
  const knownData = normalizeKnownData({
    ...deriveLocationContext(location),
    ...options.knownData,
  });
  const focusIds = options.focusIds?.filter((id) => CUSTOM_EVIDENCE_IDS.includes(id as (typeof CUSTOM_EVIDENCE_IDS)[number]));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (options.signal?.aborted) throw new ResearchCancelledError();
    try {
      return await requestResearchProject(name, location, knownData, focusIds, options.currentEvidence, options.forceRefresh === true, options.signal, options.onProgress, fetchImpl);
    } catch (error) {
      if (error instanceof ResearchCancelledError) throw error;
      if (error instanceof ResearchTimeoutError && attempt === 0) {
        options.onProgress?.("retrying");
        continue;
      }
      throw error;
    }
  }
  throw new ResearchTimeoutError();
}

export async function checkResearchStatus(cacheKey: string, fetchImpl: typeof fetch = fetch): Promise<ResearchStatusResponse> {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error("A valid research cache key is required.");
  const response = await fetchImpl(`${RESEARCH_PROJECT_ENDPOINT}?cacheKey=${encodeURIComponent(cacheKey)}`, {
    headers: { accept: "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !isRecord(body)) {
    throw new Error(isRecord(body) && isNonEmptyString(body.error) ? body.error : "Research update status is unavailable.");
  }
  const researchCache = parseResearchCache(body.researchCache);
  if (!researchCache) throw new Error("Research update status returned an invalid response.");
  return {
    researchCache,
    ...(isRecord(body.result) ? { result: parseResponse({ ...body.result, researchCache: body.researchCache }) } : {}),
  };
}

export { parseResponse, parseResearchCache };