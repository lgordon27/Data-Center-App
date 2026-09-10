import type { Classification } from "@/model/cashFlowEngine";

export const FINANCIAL_LINEAGE_STORAGE_KEY = "safeloc:diligence:financial-lineage:v1";

export type FinancialLineageAction =
  | "research"
  | "extraction"
  | "normalization"
  | "proposal-created"
  | "accepted"
  | "overridden"
  | "rejected"
  | "unresolved"
  | "reversal"
  | "refresh"
  | "financial-recalculation"
  | "scenario-saved"
  | "scenario-renamed"
  | "scenario-removed"
  | "reset";

export type FinancialLineageEvent = {
  id: string;
  recordedAt: string;
  action: FinancialLineageAction;
  actor: "system" | "analyst";
  projectKey: string;
  proposalId?: string;
  evidenceId?: string;
  scenarioId?: string;
  releaseIdentity?: string;
  modelIdentity?: string;
  previousValue?: string | number | null;
  resultingValue?: string | number | null;
  previousClassification?: Classification;
  resultingClassification?: Classification;
  rawValue?: string | number;
  rawUnit?: string;
  normalizedValue?: string | number;
  normalizedUnit?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  passage?: string;
  modelLine?: string;
  modelEffect?: string;
  staleApplied?: boolean;
  reversesEventId?: string;
  detail?: string;
};

export type FinancialLineageEventInput = Omit<FinancialLineageEvent, "id" | "recordedAt"> & {
  recordedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadFinancialLineage(): FinancialLineageEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FINANCIAL_LINEAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is FinancialLineageEvent => (
      isRecord(value) &&
      typeof value.id === "string" &&
      typeof value.recordedAt === "string" &&
      typeof value.action === "string" &&
      (value.actor === "system" || value.actor === "analyst") &&
      typeof value.projectKey === "string"
    )).map((event) => ({ ...event }));
  } catch {
    return [];
  }
}

export function appendFinancialLineage(input: FinancialLineageEventInput): FinancialLineageEvent {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const current = loadFinancialLineage();
  const event: FinancialLineageEvent = {
    ...input,
    recordedAt,
    id: `lineage-${recordedAt.replace(/[^0-9]/g, "")}-${current.length}`,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(FINANCIAL_LINEAGE_STORAGE_KEY, JSON.stringify([...current, event]));
      window.dispatchEvent(new CustomEvent("safeloc:financial-lineage", { detail: event }));
    } catch {
      // Audit persistence must not make the review workflow unusable when storage is unavailable.
    }
  }
  return event;
}

export function stableLineageFingerprint(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (!isRecord(candidate)) return candidate;
    return Object.fromEntries(
      Object.keys(candidate).sort().map((key) => [key, normalize(candidate[key])]),
    );
  };
  const text = JSON.stringify(normalize(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}