import type { Classification, EvidenceItem, ProjectContext } from "@/context/DiligenceContext";
import { parseBoundedRetryAfter } from "@/services/publicResearchPresentation";

export const AI_EVIDENCE_ENDPOINT = "/api/analyze-evidence";
export const AI_EVIDENCE_TIMEOUT_MS = 10_000;
const AI_EVIDENCE_SOURCE_TEXT_LIMIT = 2_000;

export type AIEvidenceSuccess = {
  status: "success";
  classification: Classification;
  reasoning: string;
  downgradeSuggested: boolean;
};

export type AIEvidenceFailure =
  | {
      status: "error";
      message: string;
      capacity?: "rate-limited" | "daily-capacity";
      retryAfterSeconds?: number;
    }
  | {
      status: "timeout";
      message: string;
    }
  | {
      status: "unparseable";
      message: string;
      rawText: string;
    };

export type AIEvidenceResult = AIEvidenceSuccess | AIEvidenceFailure;

const VALID_CLASSIFICATIONS: Classification[] = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function classification(value: unknown): value is Classification {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  const match = VALID_CLASSIFICATIONS.find((candidate) => candidate.toLowerCase() === normalized);
  return Boolean(match);
}

function normalizeClassification(value: string): Classification {
  return VALID_CLASSIFICATIONS.find((candidate) => candidate.toLowerCase() === value.trim().toLowerCase())!;
}

function cleanReasoning(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

function stripMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

type AIEvidenceItem = Pick<EvidenceItem, "label" | "value" | "citation"> &
  Partial<Pick<EvidenceItem, "classification" | "sources" | "claimMappings" | "sourceValidation">>;

function retainedSourceText(item: AIEvidenceItem): string | undefined {
  const sources = (item.sources ?? [])
    .filter((source) =>
      typeof source.claimPassage === "string" &&
      source.claimPassage.trim() &&
      source.claimCited !== false &&
      source.exactProject !== false &&
      source.relationship !== "conflicting",
    )
    .sort((left, right) => {
      const score = (source: NonNullable<EvidenceItem["sources"]>[number]) =>
        Number(source.claimCited === true) * 4 +
        Number(source.exactProject === true) * 2 +
        Number(source.relationship === "primary");
      return score(right) - score(left);
    });
  const claimPassage = sources[0]?.claimPassage?.trim();
  if (claimPassage) return claimPassage.slice(0, AI_EVIDENCE_SOURCE_TEXT_LIMIT);

  const mappings = [...(item.claimMappings ?? []), ...(item.sourceValidation?.claimMappings ?? [])];
  const exactQuotation = mappings.find((mapping) =>
    mapping.supportStatus === "supported" &&
    mapping.contradictionStatus === "none" &&
    typeof mapping.exactQuotation === "string" &&
    mapping.exactQuotation.trim(),
  )?.exactQuotation?.trim();
  if (exactQuotation) return exactQuotation.slice(0, AI_EVIDENCE_SOURCE_TEXT_LIMIT);

  const retainedPassage = (item.sources ?? []).find((source) =>
    source.accessOutcome?.state === "accessible" &&
    typeof source.accessOutcome.passage === "string" &&
    source.accessOutcome.passage.trim(),
  )?.accessOutcome?.passage?.trim();
  return retainedPassage?.slice(0, AI_EVIDENCE_SOURCE_TEXT_LIMIT);
}

function parseAssessment(rawText: string): AIEvidenceResult {
  const candidateText = stripMarkdownFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateText);
  } catch {
    return {
      status: "unparseable",
      message: "Could not parse structured assessment. Review manually.",
      rawText,
    };
  }

  if (!isRecord(parsed) || !classification(parsed.classification)) {
    return {
      status: "unparseable",
      message: "The response did not include a valid provenance class. Review manually.",
      rawText,
    };
  }

  if (typeof parsed.downgradeSuggested !== "boolean") {
    return {
      status: "unparseable",
      message: "The response did not include a valid downgrade signal. Review manually.",
      rawText,
    };
  }

  const reasoning = cleanReasoning(parsed.reasoning);
  if (!reasoning) {
    return {
      status: "unparseable",
      message: "The response did not include concise reasoning. Review manually.",
      rawText,
    };
  }

  return {
    status: "success",
    classification: normalizeClassification(parsed.classification),
    reasoning,
    downgradeSuggested: parsed.downgradeSuggested,
  };
}

function isDailyCapacityResponse(rawText: string): boolean {
  try {
    const parsed: unknown = JSON.parse(rawText);
    return typeof parsed === "object"
      && parsed !== null
      && "error" in parsed
      && (parsed as { error?: unknown }).error === "Daily research capacity reached. Please try again tomorrow.";
  } catch {
    return false;
  }
}

export async function analyzeEvidence(
  item: AIEvidenceItem,
  project: Pick<ProjectContext, "name" | "location" | "kind">,
  fetchImpl: typeof fetch = fetch,
): Promise<AIEvidenceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_EVIDENCE_TIMEOUT_MS);
  const sourceText = retainedSourceText(item);

  try {
    const response = await fetchImpl(AI_EVIDENCE_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: item.label,
        value: String(item.value),
        source: item.citation,
        ...(sourceText ? { sourceText } : {}),
        ...(item.classification ? { existingClassification: item.classification } : {}),
        projectName: project.name,
        projectLocation: project.location,
        projectKind: project.kind,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      if (response.status === 429) {
        if (isDailyCapacityResponse(rawText)) {
          return {
            status: "error",
            message: "Daily AI analysis capacity is reached. Try again later.",
            capacity: "daily-capacity",
          };
        }
        const retryAfterSeconds = parseBoundedRetryAfter(response.headers.get("retry-after"));
        return {
          status: "error",
          message: "AI analysis is rate-limited. Wait before trying again.",
          capacity: "rate-limited",
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        };
      }
      return {
        status: "error",
        message: "AI analysis unavailable. Classify manually.",
      };
    }

    try {
      JSON.parse(rawText);
    } catch {
      return {
        status: "unparseable",
        message: "Could not parse structured assessment. Review manually.",
        rawText,
      };
    }
    return parseAssessment(rawText);
  } catch (error) {
    if (
      (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return {
        status: "timeout",
        message: "AI analysis timed out after 10 seconds. Classify manually.",
      };
    }
    return {
      status: "error",
      message: "AI analysis unavailable. Classify manually.",
    };
  } finally {
    clearTimeout(timeout);
  }
}