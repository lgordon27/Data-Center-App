export const AI_EVIDENCE_RATE_LIMIT_MESSAGE: "AI analysis request limit reached. Please wait before trying again and classify manually.";
export const AI_EVIDENCE_REQUEST_LIMIT: 30;
export const AI_EVIDENCE_REQUEST_WINDOW_MS: 60000;
export const AI_EVIDENCE_MAX_TOKENS: 300;
export const AI_EVIDENCE_MODEL: "gpt-4o-mini";
export const AI_EVIDENCE_SYSTEM_PROMPT: string;
export const OPENAI_CHAT_COMPLETIONS_URL: "https://api.openai.com/v1/chat/completions";
export function buildAIEvidencePrompt(evidence: { name: string; value: string; source: string }): string;
export function parseEvidenceBody(body: unknown): { name: string; value: string; source: string };
export function createAIEvidenceRateLimiter(options?: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
}): {
  allow(req: unknown): { allowed: boolean; retryAfterSeconds: number };
};
export function handleAnalyzeEvidenceRequest(req: unknown, res: unknown, options?: unknown): Promise<void>;
