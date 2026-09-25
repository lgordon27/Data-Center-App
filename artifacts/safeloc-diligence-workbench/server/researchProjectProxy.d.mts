type ResearchDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

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
export declare function sourceEstablishesProjectIdentity(source: Record<string, unknown>, project?: Record<string, unknown>): boolean;
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
    googleApiKey?: string;
    fetchImpl?: typeof fetch;
    documentFetchImpl?: typeof fetch;
    googleDiscoveryImpl?: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    allowGoogleFallback?: boolean;
    allowCorrectiveRetries?: boolean;
    secConnector?: { search(query: Record<string, unknown>): Promise<Record<string, unknown>> } | null;
    ocrImpl?: (input: Record<string, unknown>) => Promise<unknown>;
    rateLimiter?: ReturnType<typeof createResearchProjectRateLimiter>;
    cache?: unknown;
    registry?: unknown;
    categoryIds?: string[] | null;
    researchTimeoutMs?: number;
    documentTimeoutMs?: number;
    analysisReserveMs?: number;
    maxConcurrentDocumentOpens?: number;
    dnsLookup?: ResearchDnsLookup;
  },
): Promise<void>;
export declare function runValidatedResearch(
  project: { name: string; location: string; knownData?: Record<string, unknown> },
  options?: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    documentFetchImpl?: typeof fetch;
    dnsLookup?: ResearchDnsLookup;
    signal?: AbortSignal;
    googleApiKey?: string;
    googleDiscoveryImpl?: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
    allowGoogleFallback?: boolean;
    allowCorrectiveRetries?: boolean;
    categoryIds?: string[];
    researchTimeoutMs?: number;
    documentTimeoutMs?: number;
    analysisReserveMs?: number;
    maxConcurrentDocumentOpens?: number;
    secConnector?: { search(query: Record<string, unknown>): Promise<Record<string, unknown>> } | null;
  },
): Promise<Record<string, unknown>>;