import type { Classification, EvidenceItem } from "@/context/DiligenceContext";

export const RESEARCH_PROJECT_ENDPOINT = "/api/research-project";
export const RESEARCH_PROJECT_TIMEOUT_MS = 45_000;
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
};

export type CustomResearchResponse = {
  projectSummary: {
    name: string;
    location: string;
    description: string;
    capacityMW: number;
    capacityProvenance: CapacityProvenance;
  };
  researchCoverage?: {
    searchedDomains: string[];
    failedDomains: string[];
    retrievedSourceCount: number;
  };
  evidence: CustomEvidenceRecord[];
};

export type CapacityProvenance = "ai-reported" | "standardized-default";

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
    const accessStatus = ["open", "paywall", "registration", "not provided"].includes(String(candidate.sourceAccessStatus))
      ? candidate.sourceAccessStatus as EvidenceItem["sourceAccessStatus"]
      : undefined;
    return {
      id,
      label: candidate.label as string,
      value: candidate.value as string | number,
      unit: candidate.unit as string,
      classification: candidate.classification as Classification,
      citation: candidate.citation as string,
      description: candidate.description as string,
      sourceRole: candidate.sourceRole as string,
      coverageStatus,
      searchCoverage: Array.isArray(candidate.searchCoverage) ? candidate.searchCoverage.filter(isNonEmptyString).map((entry) => entry.trim()) : [],
      failedSearchDomains: Array.isArray(candidate.failedSearchDomains) ? candidate.failedSearchDomains.filter(isNonEmptyString).map((entry) => entry.trim()) : [],
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
        ? "ai-reported"
        : "standardized-default",
    },
    ...(isRecord(value.researchCoverage) ? {
      researchCoverage: {
        searchedDomains: Array.isArray(value.researchCoverage.searchedDomains) ? value.researchCoverage.searchedDomains.filter(isNonEmptyString) : [],
        failedDomains: Array.isArray(value.researchCoverage.failedDomains) ? value.researchCoverage.failedDomains.filter(isNonEmptyString) : [],
        retrievedSourceCount: typeof value.researchCoverage.retrievedSourceCount === "number" && Number.isFinite(value.researchCoverage.retrievedSourceCount)
          ? value.researchCoverage.retrievedSourceCount
          : 0,
      },
    } : {}),
    evidence,
  };
}

export async function researchProject(
  name: string,
  location: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CustomResearchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_PROJECT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(RESEARCH_PROJECT_ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ name, location }),
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
      const message = isRecord(body) && isNonEmptyString(body.error) ? body.error : "Project research is unavailable. Try again or use the curated case.";
      throw new Error(message);
    }
    return parseResponse(body);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Project research timed out. Try again or use the curated case.");
    }
    throw error instanceof Error ? error : new Error("Project research is unavailable. Try again or use the curated case.");
  } finally {
    clearTimeout(timeout);
  }
}

export { parseResponse };