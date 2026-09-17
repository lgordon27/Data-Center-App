export interface OfficialSourceDiscoveryOptions {
  projectIdentity?: Record<string, unknown>;
  project?: Record<string, unknown>;
  knownData?: Record<string, unknown>;
  category?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => number;
  maxAttempts?: number;
  authorizeAttempt?: (url: string) => boolean | { allowed: boolean; physicalOpenIndex?: number | null };
}

export interface OfficialSourceCandidate {
  url: string;
  sourceChannel: "declared-source-url" | "declared-official-endpoint" | "declared-company-domain" | "declared-authority-domain" | "declared-city-domain" | "declared-county-domain" | "declared-utility-domain" | "declared-economic-development-domain" | "verified-state-domain-registry";
  provenance: Record<string, unknown> & { discoveryOnly: true };
  matchedAlias: string | null;
  discoveryOnly: true;
}

export interface OfficialSourceDiscoveryResult {
  authorities: Array<{
    name: string;
    domain: string | null;
    status: "established" | "identified-no-domain";
    sourceChannel: string;
    jurisdiction: string;
    establishmentMethod: string;
    discoveredAt: string;
    urlsAttempted: string[];
    accessOutcomes: Array<{
      url: string;
      status: string;
      httpStatus: number | null;
      physicalOpenIndex: number | null;
    }>;
    provenance: Record<string, unknown>;
  }>;
  attempts: Array<{
    url: string;
    sourceChannel: string;
    provenance: Record<string, unknown>;
    startedAt: string;
    status: string;
    httpStatus: number | null;
    contentType: string | null;
    bytes: number;
    truncated: boolean;
    physicalOpenIndex: number | null;
    error?: string;
  }>;
  candidateUrls: OfficialSourceCandidate[];
  limits: { maxAttempts: number; maxDocumentBytes: number; maxCandidateUrls?: number };
  discoveryIsEvidence: false;
}

export function discoverOfficialSources(options?: OfficialSourceDiscoveryOptions): Promise<OfficialSourceDiscoveryResult>;

export const OFFICIAL_SOURCE_DISCOVERY_LIMITS: Readonly<{
  defaultMaxAttempts: number;
  hardMaxAttempts: number;
  maxDocumentBytes: number;
  maxCandidateUrls: number;
}>;