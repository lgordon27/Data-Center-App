export type ResearchCacheState = "fresh" | "recent" | "stale" | "expired";
export declare const RESEARCH_CACHE_VERSION: number;
export declare const RESEARCH_CACHE_FRESH_MS: number;
export declare const RESEARCH_CACHE_RECENT_MS: number;
export declare const RESEARCH_CACHE_STALE_MS: number;
export declare function researchProjectCacheKey(project: unknown): string;
export declare function classifyResearchCacheAge(storedAt: string, now?: number): ResearchCacheState;
export declare function createResearchProjectCache(options?: {
  directory?: string;
  now?: () => number;
}): {
  keyFor(project: unknown): string;
  read(key: string): Promise<any>;
  write(key: string, result: unknown): Promise<any>;
  refresh(key: string, runner: () => Promise<unknown>): { promise: Promise<any>; started: boolean };
  status(key: string): any;
  age(entry: unknown): ResearchCacheState;
  clearMemory(): void;
};
export declare const defaultResearchProjectCache: ReturnType<typeof createResearchProjectCache>;