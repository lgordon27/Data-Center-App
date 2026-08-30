import type { Classification, EvidenceItem } from "@/context/DiligenceContext";

export const AI_EVIDENCE_ENDPOINT = "https://api.anthropic.com/v1/messages";
export const AI_EVIDENCE_MODEL = "claude-sonnet-4-6";
export const AI_EVIDENCE_MAX_TOKENS = 300;
export const AI_EVIDENCE_TIMEOUT_MS = 10_000;
export const AI_EVIDENCE_SYSTEM_PROMPT =
  "You are an infrastructure diligence analyst specializing in AI data center investments. You assess evidence quality for investment underwriting. Respond with exactly two fields in JSON format: classification (one of: Verified Evidence, Management Assertion, Model Inference, User Assumption, Missing Evidence) and reasoning (one sentence explaining why).";

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

function textFromAnthropicBody(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.content)) return null;
  const textBlock = body.content.find(
    (block): block is Record<string, unknown> =>
      isRecord(block) && block.type === "text" && typeof block.text === "string",
  );
  return textBlock && typeof textBlock.text === "string" ? textBlock.text.trim() : null;
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

function rawResponsePreview(rawText: string) {
  const cleaned = rawText.trim();
  return cleaned.length > 400 ? `${cleaned.slice(0, 400)}…` : cleaned;
}

export function buildAIEvidencePrompt(item: Pick<EvidenceItem, "label" | "value" | "citation">) {
  return `Assess the evidence quality of this data point for the Stargate Abilene data center project (OpenAI/Oracle, Taylor County, Texas): Variable: ${item.label}. Current value: ${String(item.value)}. Cited source: ${item.citation}. Based on the source type and what is publicly verifiable about this project, classify the evidence quality.`;
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
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: AI_EVIDENCE_MODEL,
        max_tokens: AI_EVIDENCE_MAX_TOKENS,
        system: AI_EVIDENCE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildAIEvidencePrompt(item) }],
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    if (!response.ok) {
      const detail = rawResponsePreview(rawText);
      return {
        status: "error",
        message: detail
          ? `AI analysis unavailable (${response.status}). Classify manually. ${detail}`
          : `AI analysis unavailable (${response.status}). Classify manually.`,
      };
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText) as unknown;
    } catch {
      return {
        status: "unparseable",
        message: "Could not parse structured assessment. Review manually.",
        rawText,
      };
    }
    const assessmentText = textFromAnthropicBody(body);
    if (!assessmentText) {
      return {
        status: "unparseable",
        message: "Could not parse structured assessment. Review manually.",
        rawText,
      };
    }
    return parseAssessment(assessmentText);
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