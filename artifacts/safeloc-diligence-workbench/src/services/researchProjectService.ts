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
  redirectChain?: string[];
  contentType?: string | null;
  claimCited?: boolean;
  accessOutcome?: {
    state: "accessible" | "blocked" | "unsupported";
    reason: string;
    format?: string;
    resolvedUrl?: string | null;
    canonicalUrl?: string | null;
    retrievalTime?: string | null;
    passage?: string | null;
    pageOrSection?: string | number | null;
    extractionLimitations?: string[];
  };
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
  researchCache?: ResearchCacheMetadata;
  semanticPolicyVersion?: number;
  sourceValidationPolicyVersion?: number;
  sourceLedger?: Array<Record<string, unknown>>;
  researchCoverage?: {
    searchedDomains: string[];
    failedDomains: string[];
    retrievedSourceCount: number;
    searchTerms: string[];
    searchTermsSource: "tool-observed" | "ai-reported" | "unavailable";
    toolCallCount?: number;
    toolCallLimit?: number;
    toolCallBudgetExceeded?: boolean;
    sourceLedgerSummary?: {
      rawOccurrenceCount: number;
      retainedCount: number;
      rejectedCount: number;
      capDiscardCount: number;
    };
  };
  researchAudit?: ResearchAudit;
  evidence: CustomEvidenceRecord[];
  retrievedLeads?: CustomEvidenceRecord[];
  eligibleEvidence?: CustomEvidenceRecord[];
  proposedInputs?: CustomEvidenceRecord[];
  acceptedModelInputs?: CustomEvidenceRecord[];
  quarantineReasons?: string[];
};

export type ResearchCategoryState = "Complete" | "Partial" | "No eligible evidence" | "Provider failure" | "Timed out" | "Not searched";
export type ResearchAuditStageCounts = {
  normalized: number;
  accessed: number;
  parsed: number;
  claimMapped: number;
  eligible: number;
  retainedCandidates: number;
};
export type ResearchCategoryAudit = {
  categoryId: string;
  label: string;
  evidenceIds: string[];
  requestedPrimaryQuery: string;
  executedQueries: string[];
  optionalFollowUpQuery?: string | null;
  followUpExecutedQuery?: string | null;
  state: ResearchCategoryState;
  stageCounts: ResearchAuditStageCounts;
  rejectionCounts: Record<string, number>;
  accessLimitations: string[];
  unresolvedGaps: string[];
  providerFailure?: string | null;
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
  accessState: "accessible" | "blocked" | "unsupported" | null;
  accessReason: string | null;
  retainedPassage: string | null;
  exactQuotation: string | null;
  pageOrSection: string | number | null;
  extractionLimitations: string[];
  format: string | null;
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
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  budget: {
    deadlineMs: number;
    maxProviderRequests: number;
    maxFollowUps: number;
    maxCandidatesPerCategory: number;
    maxTotalCandidates: number;
    maxToolCalls: number;
  };
  toolCallCount: number;
  providerRequestCount: number;
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
  errorType?: "quota-exhausted" | "authentication" | "timeout" | "malformed-response" | "request-limit" | "not-configured" | "upstream";
};

export type ResearchStatusResponse = {
  researchCache: ResearchCacheMetadata;
  result?: CustomResearchResponse;
};

export type CapacityProvenance = "ai-reported" | "directory-reported" | "standardized-default";
export type ResearchMode = "ai-researched" | "default-assumptions" | "research-incomplete";
export type KnownProjectData = {
  capacity?: number | null;
  operator?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
};
export type ResearchProgress = "researching" | "retrying";
export type ResearchProjectOptions = {
  knownData?: KnownProjectData;
  onProgress?: (progress: ResearchProgress) => void;
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
  const status = isNonEmptyString(value.status) ? value.status.trim().slice(0, 80) : undefined;
  const sourceUrl = safePublicSourceUrl(value.sourceUrl);
  const normalized = {
    ...(capacity === null ? {} : { capacity }),
    ...(operator ? { operator } : {}),
    ...(status ? { status } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
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
  const accessOutcome = rawAccessOutcome && ["accessible", "blocked", "unsupported"].includes(String(rawAccessOutcome.state)) && isNonEmptyString(rawAccessOutcome.reason)
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
    ...(Array.isArray(value.redirectChain) ? { redirectChain: value.redirectChain.filter(isNonEmptyString) } : {}),
    ...(typeof value.contentType === "string" ? { contentType: value.contentType } : {}),
    ...(accessOutcome ? { accessOutcome } : {}),
    ...(value.claimCited === true ? { claimCited: true } : {}),
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
  const errorTypes = ["quota-exhausted", "authentication", "timeout", "malformed-response", "request-limit", "not-configured", "upstream"] as const;
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
      executedQueries: parseSearchTerms(candidate.executedQueries, 9),
      ...(isNonEmptyString(candidate.optionalFollowUpQuery) ? { optionalFollowUpQuery: candidate.optionalFollowUpQuery } : {}),
      ...(isNonEmptyString(candidate.followUpExecutedQuery) ? { followUpExecutedQuery: candidate.followUpExecutedQuery } : {}),
      state,
      stageCounts: {
        normalized: Number(counts.normalized) || 0,
        accessed: Number(counts.accessed) || 0,
        parsed: Number(counts.parsed) || 0,
        claimMapped: Number(counts.claimMapped) || 0,
        eligible: Number(counts.eligible) || 0,
        retainedCandidates: Number(counts.retainedCandidates) || 0,
      },
      rejectionCounts: isRecord(candidate.rejectionCounts)
        ? Object.fromEntries(Object.entries(candidate.rejectionCounts).map(([key, count]) => [key, Number(count) || 0]))
        : {},
      accessLimitations: Array.isArray(candidate.accessLimitations) ? candidate.accessLimitations.filter(isNonEmptyString).slice(0, 8) : [],
      unresolvedGaps: Array.isArray(candidate.unresolvedGaps) ? candidate.unresolvedGaps.filter(isNonEmptyString).slice(0, 8) : [],
      ...(isNonEmptyString(candidate.providerFailure) ? { providerFailure: candidate.providerFailure } : {}),
    } satisfies ResearchCategoryAudit];
  });
  const budget = isRecord(value.budget) ? value.budget : {};
  return {
    version: Number(value.version) || 1,
    policyVersion: Number(value.policyVersion) || 1,
    provider: isNonEmptyString(value.provider) ? value.provider : "unknown",
    model: isNonEmptyString(value.model) ? value.model : "unknown",
    providerResponseId: value.providerResponseId === null || isNonEmptyString(value.providerResponseId) ? value.providerResponseId as string | null : null,
    startedAt: isNonEmptyString(value.startedAt) ? value.startedAt : null,
    finishedAt: isNonEmptyString(value.finishedAt) ? value.finishedAt : null,
    elapsedMs: typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) ? value.elapsedMs : null,
    budget: {
      deadlineMs: Number(budget.deadlineMs) || 90_000,
      maxProviderRequests: Number(budget.maxProviderRequests) || 16,
      maxFollowUps: Number(budget.maxFollowUps) || 8,
      maxCandidatesPerCategory: Number(budget.maxCandidatesPerCategory) || 10,
      maxTotalCandidates: Number(budget.maxTotalCandidates) || 80,
      maxToolCalls: Number(budget.maxToolCalls) || 32,
    },
    toolCallCount: Number(value.toolCallCount) || 0,
    providerRequestCount: Number(value.providerRequestCount) || 0,
    categories,
    categoryGaps: Array.isArray(value.categoryGaps) ? value.categoryGaps.filter(isNonEmptyString) : categories.filter((category) => category.state !== "Complete").map((category) => category.categoryId),
    providerLimitations: Array.isArray(value.providerLimitations) ? value.providerLimitations.filter(isNonEmptyString).slice(0, 12) : [],
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
    researchMode: value.researchMode === "default-assumptions"
      ? "default-assumptions"
       : eligibleEvidence.length > 0 || (Array.isArray(value.sourceLedger) && value.sourceLedger.length > 0) || Boolean(value.researchCache)
        ? "ai-researched"
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

class ResearchTimeoutError extends Error {
  constructor(message = "Project research timed out. Try again or use the curated case.") {
    super(message);
    this.name = "ResearchTimeoutError";
  }
}

async function requestResearchProject(
  name: string,
  location: string,
  knownData: KnownProjectData | undefined,
  focusIds: string[] | undefined,
  currentEvidence: ResearchProjectOptions["currentEvidence"],
  forceRefresh: boolean,
  fetchImpl: typeof fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_PROJECT_TIMEOUT_MS);
  try {
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
      if (response.status === 504) throw new ResearchTimeoutError();
      const message = isRecord(body) && isNonEmptyString(body.error) ? body.error : "Project research is unavailable. Try again or use the curated case.";
      throw new Error(message);
    }
    return parseResponse(body);
  } catch (error) {
    if (error instanceof ResearchTimeoutError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new ResearchTimeoutError();
    throw error instanceof Error ? error : new Error("Project research is unavailable. Try again or use the curated case.");
  } finally {
    clearTimeout(timeout);
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
  const knownData = normalizeKnownData(options.knownData);
  const focusIds = options.focusIds?.filter((id) => CUSTOM_EVIDENCE_IDS.includes(id as (typeof CUSTOM_EVIDENCE_IDS)[number]));
  options.onProgress?.("researching");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestResearchProject(name, location, knownData, focusIds, options.currentEvidence, options.forceRefresh === true, fetchImpl);
    } catch (error) {
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