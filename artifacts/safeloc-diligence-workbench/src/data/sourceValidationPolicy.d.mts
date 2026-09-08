export const SOURCE_VALIDATION_POLICY_VERSION: number;
export const SOURCE_STATES: readonly string[];
export const SOURCE_REJECTION_CODES: readonly string[];
export function safeSourceUrl(value: unknown): string | null;
export function canonicalizeSourceUrl(value: unknown): string | null;
export function isSourceProjectSpecific(source?: Record<string, unknown>, project?: Record<string, unknown>, assertedRelevance?: unknown): boolean;
export function buildClaimPassageMappings(input: {
  id: string;
  sources?: readonly Record<string, unknown>[];
  project?: Record<string, unknown>;
  claim?: Record<string, unknown>;
  coverageStatus?: string;
  conflictSummary?: string;
}): Array<Record<string, unknown>>;
export function evaluateResearchEvidenceEligibility(input?: Record<string, unknown>): {
  eligible: boolean;
  reasons: string[];
  rejectionCodes: string[];
  state: string;
  supportingMapping: Record<string, unknown> | null;
};
export function createSourceLedger(candidates?: readonly Record<string, unknown>[], options?: { maxRetained?: number }): {
  ledger: Array<Record<string, unknown>>;
  occurrences: Array<Record<string, unknown>>;
  retained: Array<Record<string, unknown>>;
  canonicalSources: Array<Record<string, unknown>>;
  rawOccurrenceCount: number;
  rejectedCount: number;
  capDiscardCount: number;
};