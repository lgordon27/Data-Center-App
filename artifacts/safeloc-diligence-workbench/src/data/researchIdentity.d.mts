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