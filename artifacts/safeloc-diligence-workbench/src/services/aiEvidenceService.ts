import type { Classification, EvidenceItem } from "@/context/DiligenceContext";

export const AI_EVIDENCE_ENDPOINT = "/api/analyze-evidence";
export const AI_EVIDENCE_TIMEOUT_MS = 10_000;

export type AIEvidenceSuccess = {
  status: "success";
  classification: Classification;
  reasoning: string;
};

export type AIEvidenceFailure =
  | {
      status: "error";
      message: string;
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
  };
}

export async function analyzeEvidence(
  item: Pick<EvidenceItem, "label" | "value" | "citation">,
  fetchImpl: typeof fetch = fetch,
): Promise<AIEvidenceResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_EVIDENCE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(AI_EVIDENCE_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: item.label, value: String(item.value), source: item.citation }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      return {
        status: "error",
        message:
          response.status === 429
            ? "AI analysis request limit reached. Please wait before trying again and classify manually."
            : "AI analysis unavailable. Classify manually.",
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
      message: `AI analysis unavailable. Classify manually.${error instanceof Error && error.message ? ` ${error.message}` : ""}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}