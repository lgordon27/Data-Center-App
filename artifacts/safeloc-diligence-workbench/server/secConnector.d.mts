export interface SecFilingCandidate {
  cik: string;
  accession: string;
  accessionNumber: string;
  form: string;
  filingDate: string;
  primaryDocument: string;
  archiveUrl: string;
  url: string;
  retrievedAt: string;
}

export interface SecSearchResult {
  candidates: SecFilingCandidate[];
  attempts: Array<Record<string, unknown>>;
}

export function normalizeCik(value: unknown): string;
export function isAllowedSecUrl(value: unknown): boolean;
export function buildSecArchiveUrl(cik: unknown, accessionNumber: unknown, primaryDocument: unknown): string;
export function resolveSecCompany(payload: unknown, query?: Record<string, unknown>): { cik: string; ticker: string; companyName: string };
export function parseRetryAfter(value: unknown, nowMs: number): number | null;
export function createSecConnector(options?: Record<string, unknown>): {
  search(query?: Record<string, unknown>): Promise<SecSearchResult>;
  cache: Map<string, unknown>;
};
export function fetchSecFilings(query?: Record<string, unknown>, options?: Record<string, unknown>): Promise<SecSearchResult>;
export const SEC_URLS: Readonly<Record<string, string>>;