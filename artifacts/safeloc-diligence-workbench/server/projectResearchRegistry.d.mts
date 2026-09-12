export declare const PROJECT_RESEARCH_REGISTRY_VERSION: number;
export declare const PROJECT_RESEARCH_REGISTRY_FILE: string;
export declare function projectResearchIdentity(project?: unknown): {
  id: string;
  provider: string | null;
  canonicalId: string | null;
  name: string;
  location: string;
  operator: string | null;
  identityBasis: string;
};
export declare function createProjectResearchRegistry(options?: {
  directory?: string;
  now?: () => number;
}): {
  directory: string;
  projectIdFor(project: unknown): string;
  identityFor(project: unknown): ReturnType<typeof projectResearchIdentity>;
  retain(project: unknown, result: unknown, options?: { runId?: string | null }): Promise<any>;
  read(id: string): Promise<any>;
  list(): Promise<any[]>;
  clearMemory(): void;
};
export declare const defaultProjectResearchRegistry: ReturnType<typeof createProjectResearchRegistry>;
export declare function handleProjectResearchRegistryRequest(
  req: any,
  res: any,
  options?: { registry?: ReturnType<typeof createProjectResearchRegistry> },
): Promise<void>;