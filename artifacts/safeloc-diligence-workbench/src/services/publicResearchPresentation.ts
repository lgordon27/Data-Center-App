import type {
  ResearchAudit,
  ResearchCategoryAudit,
  ResearchCategoryState,
  ResearchOutcomeState,
  ResearchMode,
  ResearchStatusResponse,
} from "@/services/researchProjectService";

export type PublicResearchState =
  | "researching"
  | "partial-results"
  | "search-incomplete"
  | "source-blocked"
  | "provider-busy"
  | "no-qualifying-evidence"
  | "evidence-likely-non-public"
  | "not-assessed"
  | "research-failed-safely"
  | "research-interrupted"
  | "ready";

export type PublicResearchPresentation = {
  state: PublicResearchState;
  label: string;
  explanation: string;
  incomplete: boolean;
};

export type PublicResearchInput = {
  outcome?: { state?: ResearchOutcomeState | null } | null;
  researchMode?: ResearchMode;
  researchStatus?: string;
  errorType?: string;
  evidenceCount?: number;
  hasRetainedEvidence?: boolean;
  categories?: ResearchCategoryAudit[];
  researchCache?: ResearchStatusResponse["researchCache"];
};

const STATE_COPY: Record<PublicResearchState, Omit<PublicResearchPresentation, "state">> = {
  researching: {
    label: "Researching",
    explanation: "Bounded public-source research is in progress. Current findings are not accepted into the financial model.",
    incomplete: true,
  },
  "partial-results": {
    label: "Partial results available",
    explanation: "Some useful evidence is retained, but one or more searches or categories remain incomplete. Unresolved items stay unresolved.",
    incomplete: true,
  },
  "search-incomplete": {
    label: "Search incomplete",
    explanation: "One or more searches did not complete. Missing results are not a conclusive finding.",
    incomplete: true,
  },
  "not-assessed": {
    label: "Not assessed",
    explanation: "Not assessed: no admitted passage text was available. This is not a negative finding.",
    incomplete: true,
  },
  "source-blocked": {
    label: "Source blocked",
    explanation: "At least one source could not be accessed. The blocked source does not count as evidence and its absence is not a negative finding.",
    incomplete: true,
  },
  "provider-busy": {
    label: "Provider busy / rate-limited",
    explanation: "Research could not be admitted or the provider is rate-limited. Previously retained evidence remains available. Try again later; capacity is not guaranteed.",
    incomplete: true,
  },
  "no-qualifying-evidence": {
    label: "No qualifying evidence located",
    explanation: "The recorded search completed but did not retain qualifying evidence. This does not establish that information is confidential or unavailable.",
    incomplete: false,
  },
  "evidence-likely-non-public": {
    label: "Evidence likely non-public",
    explanation: "The recorded research metadata explicitly identifies this item as likely non-public. This is not inferred from an empty search.",
    incomplete: false,
  },
  "research-failed-safely": {
    label: "Research failed safely",
    explanation: "Research did not return a usable update. Any previously retained evidence remains available for review.",
    incomplete: true,
  },
  "research-interrupted": {
    label: "Research interrupted",
    explanation: "The server restarted or lost connection before returning a research result. The run can be retried; previously retained evidence remains available.",
    incomplete: true,
  },
  ready: {
    label: "Research results available",
    explanation: "Review the retained evidence, its source, and any unresolved limitations before relying on it.",
    incomplete: false,
  },
};

const RATE_LIMIT_TYPES = new Set([
  "request-limit",
  "provider-rate-limit",
  "provider-429",
  "quota-exhausted",
  "research-capacity-busy",
  "research-admission-unavailable",
]);

function hasBlockedSource(categories: ResearchCategoryAudit[] = []): boolean {
  return categories.some((category) => Array.isArray(category.openedDocuments)
    && category.openedDocuments.some((document) => document?.accessState === "blocked"));
}

function hasExplicitNonPublicEvidence(categories: ResearchCategoryAudit[] = []): boolean {
  // Only accept canonical metadata codes; free-form limitations and no-result states
  // are not enough to claim that evidence is non-public.
  const explicitCodes = new Set(["evidence-likely-non-public", "likely-non-public"]);
  return categories.some((category) => [
    ...(Array.isArray(category.accessLimitations) ? category.accessLimitations : []),
    ...(Array.isArray(category.unresolvedGaps) ? category.unresolvedGaps : []),
  ].some((code) => typeof code === "string" && explicitCodes.has(code.trim().toLowerCase())));
}

export function getPublicCategoryPresentation(category: ResearchCategoryAudit): PublicResearchPresentation {
  if (category.providerFailureType && RATE_LIMIT_TYPES.has(category.providerFailureType)) {
    return { state: "provider-busy", ...STATE_COPY["provider-busy"] };
  }
  if (hasBlockedSource([category])) {
    return { state: "source-blocked", ...STATE_COPY["source-blocked"] };
  }
  if (category.providerFailureType || category.state === "Timed out" || category.state === "Provider failure") {
    return { state: "search-incomplete", ...STATE_COPY["search-incomplete"] };
  }
  if (
    (category.state === "Complete" || category.state === "No eligible evidence")
    && hasExplicitNonPublicEvidence([category])
  ) {
    return { state: "evidence-likely-non-public", ...STATE_COPY["evidence-likely-non-public"] };
  }
  if (category.state === "Complete") {
    return { state: "ready", label: "Search complete", explanation: "The recorded category search completed.", incomplete: false };
  }
  if (category.state === "No eligible evidence") {
    return { state: "no-qualifying-evidence", ...STATE_COPY["no-qualifying-evidence"] };
  }
  if (category.state === "Partial") {
    return { state: "partial-results", ...STATE_COPY["partial-results"] };
  }
  if (category.state === "Not assessed") {
    return { state: "not-assessed", ...STATE_COPY["not-assessed"] };
  }
  // "Not searched" and unknown legacy states must never be interpreted as a
  // completed negative search.
  return { state: "search-incomplete", ...STATE_COPY["search-incomplete"] };
}

export function getPublicResearchPresentation(input: PublicResearchInput): PublicResearchPresentation {
  const categories = Array.isArray(input.categories)
    ? input.categories.filter((category) => category && typeof category === "object")
    : [];
  const hasRetainedEvidence = input.hasRetainedEvidence === true || (input.evidenceCount ?? 0) > 0;
  const refreshFailed = input.researchCache?.refreshStatus === "failed";
  const knownErrorType = typeof input.errorType === "string" ? input.errorType : input.researchCache?.errorType;

  if (input.researchStatus === "researching") {
    return { state: "researching", ...STATE_COPY.researching };
  }
  if (knownErrorType === "interrupted") {
    return { state: "research-interrupted", ...STATE_COPY["research-interrupted"] };
  }
  if (knownErrorType && RATE_LIMIT_TYPES.has(knownErrorType)) {
    return { state: "provider-busy", ...STATE_COPY["provider-busy"] };
  }
  if (hasBlockedSource(categories)) {
    return { state: "source-blocked", ...STATE_COPY["source-blocked"] };
  }
  if (categories.some((category) => category.providerFailureType && RATE_LIMIT_TYPES.has(category.providerFailureType))) {
    return { state: "provider-busy", ...STATE_COPY["provider-busy"] };
  }

  const outcome = input.outcome?.state;
  const incompleteCategory = categories.some((category) => getPublicCategoryPresentation(category).incomplete);

  if (input.researchStatus === "failed" || input.researchStatus === "timed-out" || refreshFailed) {
    if (hasRetainedEvidence) return { state: "partial-results", ...STATE_COPY["partial-results"] };
    return { state: "research-failed-safely", ...STATE_COPY["research-failed-safely"] };
  }
  if (input.researchStatus === "cancelled") {
    return { state: "search-incomplete", ...STATE_COPY["search-incomplete"] };
  }
  if (outcome === "incomplete-technical-limitation"
    || (input.researchMode === "research-incomplete" && outcome !== "incomplete-not-assessed")) {
    if (hasRetainedEvidence) return { state: "partial-results", ...STATE_COPY["partial-results"] };
    return { state: "search-incomplete", ...STATE_COPY["search-incomplete"] };
  }
  if (outcome === "incomplete-not-assessed") {
    if (hasRetainedEvidence) return { state: "partial-results", ...STATE_COPY["partial-results"] };
    return { state: "not-assessed", ...STATE_COPY["not-assessed"] };
  }
  if (incompleteCategory || input.researchMode === "partial-public-source") {
    if (hasRetainedEvidence) return { state: "partial-results", ...STATE_COPY["partial-results"] };
    return { state: "search-incomplete", ...STATE_COPY["search-incomplete"] };
  }
  if (hasExplicitNonPublicEvidence(categories)) {
    return { state: "evidence-likely-non-public", ...STATE_COPY["evidence-likely-non-public"] };
  }
  if (outcome === "complete-no-eligible-evidence") {
    return { state: "no-qualifying-evidence", ...STATE_COPY["no-qualifying-evidence"] };
  }
  if (outcome === "complete-with-eligible-evidence" || hasRetainedEvidence) {
    return { state: "ready", ...STATE_COPY.ready };
  }
  if (categories.length > 0 && categories.every((category) => category.state === "No eligible evidence")) {
    return { state: "no-qualifying-evidence", ...STATE_COPY["no-qualifying-evidence"] };
  }
  return { state: "search-incomplete", ...STATE_COPY["search-incomplete"] };
}

export type SafeResearchFailureKind = "busy" | "failed" | "interrupted" | "upstream";

export class PublicResearchRequestError extends Error {
  readonly kind: SafeResearchFailureKind;
  readonly retryAfterSeconds: number | null;

  constructor(kind: SafeResearchFailureKind, retryAfterSeconds: number | null = null) {
    super(kind === "busy"
      ? STATE_COPY["provider-busy"].explanation
      : kind === "interrupted" ? STATE_COPY["research-interrupted"].explanation
      : STATE_COPY["research-failed-safely"].explanation);
    this.name = "PublicResearchRequestError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function parseBoundedRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  let seconds: number;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    seconds = Number(trimmed);
  } else {
    const dateMs = Date.parse(trimmed);
    if (!Number.isFinite(dateMs)) return null;
    seconds = Math.ceil((dateMs - now) / 1000);
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(300, Math.max(1, Math.ceil(seconds)));
}

export function getPublicResearchFailure(error: unknown): {
  message: string;
  kind: SafeResearchFailureKind | null;
  retryAfterSeconds: number | null;
} {
  if (error instanceof PublicResearchRequestError) {
    return { message: error.message, kind: error.kind, retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error instanceof Error && (error.name === "ResearchCancelledError" || error.name === "AbortError")) {
    return { message: "Research was cancelled. Previously retained evidence remains available.", kind: null, retryAfterSeconds: null };
  }
  return { message: STATE_COPY["research-failed-safely"].explanation, kind: "failed", retryAfterSeconds: null };
}

export function getPublicResearchErrorType(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const errorType = (value as Record<string, unknown>).errorType;
  return typeof errorType === "string" ? errorType : null;
}

export function categoryStateIsIncomplete(state: ResearchCategoryState): boolean {
  return state === "Not searched" || state === "Provider failure" || state === "Timed out";
}