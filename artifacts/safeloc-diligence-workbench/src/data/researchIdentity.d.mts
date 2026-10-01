export function assessResearchProjectIdentity(
  passage: unknown,
  candidate: Record<string, unknown> | undefined,
  identity: {
    name?: unknown;
    location?: unknown;
    knownData?: {
      aliases?: unknown;
      city?: unknown;
      county?: unknown;
      operator?: unknown;
      state?: unknown;
    };
  },
): "exact-project" | "ambiguous" | "unrelated";

export function corroborateRelatedFacilityAcrossPassages(
  passages: unknown[],
  identity: Record<string, unknown>,
): {
  identifiers: string[];
  conflictedIdentifiers: string[];
  reason?: string | null;
};