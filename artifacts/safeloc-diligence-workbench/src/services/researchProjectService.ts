import type { Classification, EvidenceItem } from "@/context/DiligenceContext";

export const RESEARCH_PROJECT_ENDPOINT = "/api/research-project";
export const RESEARCH_PROJECT_TIMEOUT_MS = 45_000;

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
  "id" | "label" | "value" | "unit" | "classification" | "citation" | "description" | "sourceRole" | "sourceUrl"
> & {
  numericValue?: number;
  qualitativeValue?: EvidenceItem["qualitativeValue"];
};

export type CustomResearchResponse = {
  projectSummary: {
    name: string;
    location: string;
    description: string;
    capacityMW: number;
  };
  evidence: CustomEvidenceRecord[];
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
  if (
    !isNonEmptyString(summary.name) ||
    !isNonEmptyString(summary.location) ||
    !isNonEmptyString(summary.description) ||
    typeof summary.capacityMW !== "number" ||
    !Number.isFinite(summary.capacityMW)
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
    return {
      id,
      label: candidate.label as string,
      value: candidate.value as string | number,
      unit: candidate.unit as string,
      classification: candidate.classification as Classification,
      citation: candidate.citation as string,
      description: candidate.description as string,
      sourceRole: candidate.sourceRole as string,
      ...(safePublicSourceUrl(candidate.sourceUrl) ? { sourceUrl: safePublicSourceUrl(candidate.sourceUrl) } : {}),
      ...(candidate.numericValue === undefined ? {} : { numericValue: candidate.numericValue as number }),
      ...(candidate.qualitativeValue === undefined ? {} : { qualitativeValue: candidate.qualitativeValue as EvidenceItem["qualitativeValue"] }),
    };
  });

  return {
    projectSummary: {
      name: summary.name as string,
      location: summary.location as string,
      description: summary.description as string,
      capacityMW: summary.capacityMW as number,
    },
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