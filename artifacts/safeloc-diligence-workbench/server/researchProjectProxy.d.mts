export declare const DEFAULT_RESEARCH_CAPACITY_MW: number;
export declare const OPENAI_RESPONSES_URL: string;
export declare const RESEARCH_EVIDENCE_IDS: string[];
export declare const RESEARCH_PROJECT_MAX_TOKENS: number;
export declare const RESEARCH_CATEGORY_MAX_TOKENS: number;
export declare const RESEARCH_PROVIDER_MAX_CONCURRENCY: number;
export declare const RESEARCH_PROJECT_MODEL: string;
export declare const RESEARCH_PROJECT_SYSTEM_PROMPT: string;
export declare const RESEARCH_PROJECT_TIMEOUT_MS: number;
export declare function buildResearchProjectPrompt(project: { name: string; location: string }): string;
export declare function normalizeCapacityMW(value: unknown): number;
export declare function parseResearchProjectBody(body: unknown): { name: string; location: string };
export declare function parseResearchResponse(body: unknown, retrievedSources?: Array<Record<string, unknown>>): {
  projectSummary: { name: string; location: string; description: string; capacityMW: number };
  evidence: Array<Record<string, unknown>>;
};
export declare function normalizeRetrievedSources(body: unknown): Array<{ url: string; title: string; date: string | null; excerpt: string }>;
export declare function canonicalizeSourceUrl(value: unknown): string | null;
export declare function createSourceLedger(candidates?: Array<Record<string, unknown>>, options?: { maxRetained?: number }): {
  ledger: Array<Record<string, unknown>>;
  retained: Array<Record<string, unknown>>;
  canonicalSources: Array<Record<string, unknown>>;
  rawOccurrenceCount: number;
  rejectedCount: number;
  capDiscardCount: number;
};
export declare function normalizeSearchTerms(value: unknown): string[];
export declare function extractSearchTerms(body: unknown): string[];
export declare function isExactProjectSource(source: Record<string, unknown>, summary: Record<string, unknown>, itemRelevance?: unknown): boolean;
export declare function calculateSourceSupportConfidence(options: {
  classification: string;
  sources?: Array<Record<string, unknown>>;
  coverageStatus?: string;
  conflictSummary?: string;
}): number;
export declare function extractResponseOutputText(body: unknown): string | null;
export declare function researchProjectWithWebSearch(project: { name: string; location: string }, apiKey: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<{
  research: Record<string, unknown>;
  sources: Array<Record<string, unknown>>;
  coverage: {
    searchedDomains: string[];
    failedDomains: string[];
    retrievedSourceCount: number;
    searchTerms: string[];
    searchTermsSource: "tool-observed" | "ai-reported" | "unavailable";
  };
}>;
export declare function createResearchProjectRateLimiter(options?: { limit?: number; windowMs?: number; now?: () => number }): {
  allow(req: unknown): { allowed: boolean; retryAfterSeconds: number };
};
export declare function createResearchProviderGate(options?: { limit?: number }): {
  run<T>(task: () => Promise<T>, options?: { signal?: AbortSignal; onStart?: () => void }): Promise<T>;
  snapshot(): { active: number; queued: number; blockedUntil: number; limit: number };
};
export declare function handleResearchProjectRequest(
  req: unknown,
  res: unknown,
  options?: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    rateLimiter?: ReturnType<typeof createResearchProjectRateLimiter>;
    researchTimeoutMs?: number;
    documentTimeoutMs?: number;
    analysisReserveMs?: number;
    maxConcurrentDocumentOpens?: number;
  },
): Promise<void>;
export declare function runValidatedResearch(
  project: { name: string; location: string; knownData?: Record<string, unknown> },
  options?: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    documentFetchImpl?: typeof fetch;
    signal?: AbortSignal;
    categoryIds?: string[];
    researchTimeoutMs?: number;
    documentTimeoutMs?: number;
    analysisReserveMs?: number;
    maxConcurrentDocumentOpens?: number;
  },
): Promise<Record<string, unknown>>;