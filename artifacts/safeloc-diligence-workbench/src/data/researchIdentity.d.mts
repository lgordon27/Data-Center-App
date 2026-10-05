export function assessResearchPassageExaminationEligibility(
  passage: unknown,
  identity?: Record<string, unknown>,
): {
  eligible: boolean;
  basis: string[];
  reason: "exact-project" | "scope-unconfirmed";
};

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
  options?: {
    onDecision?: (decision: {
      admissionGate?: "exact-project" | "related-facility";
      resolver: { verdict: "exact-project" | "related-facility" | "ambiguous" | "unrelated"; reason: string };
      trace: Record<string, unknown>;
    }) => void;
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