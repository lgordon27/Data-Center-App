import type { EvidenceItem } from "@/context/DiligenceContext";

export type FinancialInputProvenance = "Sourced" | "Derived from sourced evidence" | "Illustrative assumption" | "Unresolved";

export function getFinancialInputProvenance(
  item: EvidenceItem | undefined,
  _sourceClassification?: string,
): FinancialInputProvenance {
  if (!item) return "Unresolved";
  const derivedFromEvidence = /analyst inference from .*public records|derived from sourced evidence|calculated from sourced evidence/i.test(item.sourceRole);
  if (
    item.acceptedForModel === true
    && item.eligibleForModel === true
    && item.researchState === "accepted"
    && item.sourceValidation?.state === "financially-eligible"
    && Boolean(item.sourceUrl)
  ) return derivedFromEvidence ? "Derived from sourced evidence" : "Sourced";
  if (item.origin === "synthetic-default") return "Illustrative assumption";
  if (item.classification === "Missing Evidence" || /unresolved|missing evidence|not established/i.test(item.sourceRole)) {
    return "Unresolved";
  }
  if (
    item.origin === "dossier"
    && derivedFromEvidence
  ) return "Derived from sourced evidence";
  if (item.origin === "dossier" && (Boolean(item.sourceUrl) || Boolean(item.sources?.length))) return "Sourced";
  return "Unresolved";
}

export function getFinancialInputProvenanceDescription(label: FinancialInputProvenance): string {
  switch (label) {
    case "Sourced":
      return "This input has retained source evidence and an accepted or dossier lineage.";
    case "Derived from sourced evidence":
      return "This input is an inference or calculation based on sourced evidence, not a direct source statement.";
    case "Illustrative assumption":
      return "This is an underwriting assumption, not established project evidence.";
    case "Unresolved":
      return "No accepted source lineage is established for this input.";
  }
}