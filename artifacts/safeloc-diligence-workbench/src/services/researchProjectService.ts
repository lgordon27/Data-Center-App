import type { Classification, EvidenceItem } from "@/context/DiligenceContext";

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
};

export type ResearchCoverageStatus = "supported" | "searched-no-support" | "partial" | "conflicting";
export type ResearchEvidenceSource = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  accessedAt: string | null;
  accessStatus: EvidenceItem["sourceAccessStatus"];
  excerpt: string;
  sourceClass: "primary-government" | "primary-utility" | "primary-company" | "secondary-reporting" | "reviewer-submitted";
  searchDomain: string;
  relationship: "primary" | "corroborating" | "conflicting";
  exactProject?: boolean;
  relevanceNote?: string;
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
  researchCoverage?: {
    searchedDomains: string[];
    failedDomains: string[];
    retrievedSourceCount: number;
    searchTerms: string[];
    searchTermsSource: "tool-observed" | "ai-reported" | "unavailable";
    toolCallCount?: number;
    toolCallLimit?: number;
    toolCallBudgetExceeded?: boolean;
  };
  evidence: CustomEvidenceRecord[];
};

export type ResearchCacheMetadata = {
  key: string;
  state: "fresh" | "recent" | "stale" | "expired" | "updated";
  storedAt: string | null;
  refreshStatus: "idle" | "running" | "completed" | "failed";
  providerAvailable: boolean;
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
    } else if (item.sourceUrl || item.sources?.length) {
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
      ...(item.sources ?? []).map((source) => source.url),
      ...(item.sourceUrl ? [item.sourceUrl] : []),
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

const DEFAULT_EVIDENCE_DEFINITIONS: Record<(typeof CUSTOM_EVIDENCE_IDS)[number], { label: string; unit: string }> = {
  electricity_cost: { label: "Electricity Cost / MWh", unit: "$/MWh" },
  water_consumption: { label: "Annual Cooling Water", unit: "Facility total" },
  grid_interconnection: { label: "Grid Interconnection Timeline", unit: "Project timeline" },
  water_escalation: { label: "5-Yr Water Cost Escalation", unit: "%" },
  community_risk: { label: "Community Infrastructure Strain", unit: "Local impact" },
  renewable_percentage: { label: "Renewable Procurement", unit: "Power mix" },
  cooling_capex: { label: "Cooling Infrastructure CAPEX", unit: "$M" },
  electricity_escalation: { label: "5-Yr Electricity Price Increase", unit: "%" },
  carbon_compliance: { label: "Carbon Compliance Cost", unit: "$M/yr" },
  permitting_timeline: { label: "Core Build Timeline", unit: "Project timeline" },
  customer_concentration: { label: "Customer Terms & Concentration", unit: "Customer mix" },
  water_rights: { label: "Local Water Rights & Allocation", unit: "Facility rights" },
  site_hazard_exposure: { label: "Site Hazard Exposure Profile", unit: "Facility exposure" },
  backup_power_capacity: { label: "Backup Power Capacity", unit: "Resilience" },
  water_source_resilience: { label: "Water Source Resilience", unit: "Supply" },
  downtime_cost: { label: "Estimated Downtime Cost", unit: "Operating loss" },
};

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
  return {
    url,
    title: value.title.trim(),
    publisher: value.publisher.trim(),
    publishedAt: optionalDate(value.publishedAt) ?? null,
    accessedAt: optionalDate(value.accessedAt) ?? null,
    accessStatus: ["open", "paywall", "registration", "not provided"].includes(String(value.accessStatus))
      ? value.accessStatus as EvidenceItem["sourceAccessStatus"]
      : "not provided",
    excerpt: value.excerpt.trim(),
    sourceClass,
    searchDomain: isNonEmptyString(value.searchDomain) ? value.searchDomain.trim() : "project-identity",
    relationship,
    ...(typeof value.exactProject === "boolean" ? { exactProject: value.exactProject } : {}),
    ...(isNonEmptyString(value.relevanceNote) ? { relevanceNote: value.relevanceNote.trim() } : {}),
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
    ...(errorTypes.includes(value.errorType as typeof errorTypes[number]) ? { errorType: value.errorType as ResearchCacheMetadata["errorType"] } : {}),
  };
}

const VALID_CLASSIFICATIONS: Classification[] = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

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
    const safeClassification = classification === "Verified Evidence" && !hasValidatedSource
      ? "Management Assertion"
      : classification;
    return {
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
      searchTerms: parseSearchTerms(candidate.searchTerms),
      searchTermsSource: parseSearchTermsSource(candidate.searchTermsSource, parseSearchTerms(candidate.searchTerms)),
      ...(isNonEmptyString(candidate.conflictSummary) ? { conflictSummary: candidate.conflictSummary.trim() } : {}),
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
    };
  });

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
      : evidence.some((item) => item.sources?.length || item.sourceUrl)
        ? "ai-researched"
        : "research-incomplete",
    ...(parseResearchCache(value.researchCache) ? { researchCache: parseResearchCache(value.researchCache) } : {}),
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
      },
    } : {}),
    evidence,
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