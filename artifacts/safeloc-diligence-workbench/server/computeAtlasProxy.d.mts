export type DirectorySourceMetadata = {
  provider: "Compute Atlas";
  attributionUrl: string;
  status: "live" | "cached" | "embedded";
  dataOrigin: "provider" | "embedded";
  fetchedAt?: string;
  sourceUpdatedAt?: string | null;
  snapshotVersion?: string;
  reason?: string;
};

export type DirectoryFacility = {
  id: string;
  name: string;
  operator: string;
  city: string;
  county: string;
  state: string;
  capacityMW: number | null;
  availableCapacityMW: number | null;
  status: "operating" | "construction" | "planned" | "delayed" | "cancelled" | "unknown";
  confidence: "confirmed" | "reported" | "rumored";
  aiClassification: string | null;
  sourceUrl: string | null;
  connectedCompanies: string[];
  connectedFunds: string[];
  lastUpdated: string | null;
};

export declare const DIRECTORY_CACHE_TTL_MS: number;
export declare const EMBEDDED_SNAPSHOT: DirectoryFacility[];
export declare const CORPORATE_ALIASES: readonly {
  match: string;
  company: string;
  funds: readonly string[];
}[];
export declare function handleDirectoryRequest(req: unknown, res: unknown, options?: unknown): Promise<void>;
export declare function handleDirectoryStatsRequest(req: unknown, res: unknown, options?: unknown): Promise<void>;
export declare function getDirectory(options?: unknown): Promise<unknown>;
export declare function getDirectoryStats(options?: unknown): Promise<unknown>;
export declare function clearDirectoryCache(): void;