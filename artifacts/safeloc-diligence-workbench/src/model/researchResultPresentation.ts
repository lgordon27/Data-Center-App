import type { EvidenceItem, FinancialModelingState, ProjectContext } from "../context/DiligenceContext";
import type { RetainedResearchFinding } from "../services/researchProjectService";
import { getResearchStatusPresentation } from "../services/researchProjectService";
import { getCommunityDocumentation, getConferenceEvidenceSummary } from "./conferenceEvidence";

/** Display-only shortening: never write this back to source records or hashes. */
export function shortSourceText(text: string, limit = 240) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

export function hasCapacityDurationMismatch(item: { id: string; unit?: string; rawUnit?: string; value?: unknown; rawValue?: unknown }) {
  return item.id === "grid_interconnection" &&
    /\b(?:MW|GW|megawatts?|gigawatts?)\b/i.test(`${item.rawUnit ?? item.unit ?? ""} ${item.rawValue ?? item.value ?? ""}`);
}

export function evidenceDisplayLabel(item: EvidenceItem) {
  return hasCapacityDurationMismatch(item) ? "Capacity assertion · field mismatch" : item.label;
}

function invalidValueReason(item: EvidenceItem) {
  return (item.quarantineReasons ?? []).find((reason) => /invalid.*(?:value|unit)|unsupported.*unit|unit.*(?:mismatch|invalid)|out.of.range/i.test(reason));
}

function categoryHasNoText(category: NonNullable<ProjectContext["researchAudit"]>["categories"][number]) {
  return category.notRunReason === "no-admitted-passage-text" ||
    category.accessLimitations?.some((reason) => /no admitted passage text/i.test(reason));
}

export function unresolvedEvidenceReason(item: EvidenceItem, project: ProjectContext) {
  if (hasCapacityDurationMismatch(item)) return "Capacity assertion, not an interconnection duration. Incorrectly typed record retained for source review; not a duration input.";
  const category = project.researchAudit?.categories.find((entry) => entry.evidenceIds.includes(item.id));
  if (category && category.analysisOutcome !== "completed") {
    if (categoryHasNoText(category)) return "Not assessed: no admitted passage text.";
    if (category.analysisOutcome === "failed") return `Not established in this run: assessment failed${category.providerFailure ? ` · ${category.providerFailure}` : ""}.`;
    return `Not established in this run${category.notRunReason ? `: ${category.notRunReason.replace(/[-_]+/g, " ")}` : ": assessment not completed"}.`;
  }
  if (item.conflictSummary && (item.sources?.some((source) => source.relationship === "conflicting") ||
      (item.claimMappings ?? item.sourceValidation?.claimMappings)?.some((mapping) => mapping.contradictionStatus !== "none"))) {
    return `Attributed contradiction: ${item.conflictSummary}`;
  }
  if (item.coverageStatus === "conflicting") return "Conflicting source records; not established in this run.";
  if (invalidValueReason(item)) return `Not established in this run: invalid value or unit · ${invalidValueReason(item)}. Original source remains reviewable.`;
  if (item.sourceRelevance === "related-context" || item.sourceRelevance === "unresolved") return "Applicability unresolved; related context is not an established project fact.";
  return "Not established in this run. No validated project-specific assessment is recorded.";
}

/** Keep expanded community content consistent with the shared assessment summary. */
export function getCommunityResultPresentation(evidence: Record<string, EvidenceItem>, project: ProjectContext) {
  const community = getCommunityDocumentation(evidence, project);
  return {
    ...community,
    statuses: community.statuses.map((status) => {
      if (status.label !== "No project-specific documentation found") return status;
      const reason = evidence.community_risk
        ? unresolvedEvidenceReason(evidence.community_risk, project)
        : "Not established in this run: community assessment not recorded.";
      return { ...status, label: project.kind === "custom" ? reason : "Not established in reviewed snapshot",
        detail: project.kind === "custom" ? `${reason} ${status.detail} This is not a finding of public-record absence.` : status.detail };
    }),
  };
}

/** No new normalization or eligibility: describe only the mapping receipts retained. */
export function retainedFindingReason(finding: RetainedResearchFinding, evidence: Record<string, EvidenceItem>) {
  if (!finding.passage?.trim()) return "Missing source text; no admitted passage to assess.";
  const items = Object.values(evidence).filter((item) =>
    item.sourceUrl === finding.sourceUrl || item.sources?.some((source) =>
      [source.url, source.originalUrl, source.resolvedUrl, source.canonicalUrl].includes(finding.sourceUrl)));
  const sourceIds = new Set([finding.sourceUrl, ...items.flatMap((item) =>
    (item.sources ?? []).filter((source) => [source.url, source.originalUrl, source.resolvedUrl, source.canonicalUrl].includes(finding.sourceUrl))
      .flatMap((source) => [source.url, source.originalUrl, source.resolvedUrl, source.canonicalUrl]))]);
  // Policy capturedPassage uses collapsed whitespace and case-insensitive
  // containment. Normalize only this comparison, never the stored evidence.
  const comparisonText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const sourceMappings = items.flatMap((item) => item.claimMappings ?? item.sourceValidation?.claimMappings ?? [])
    .filter((mapping) => mapping.sourceId !== null && sourceIds.has(mapping.sourceId) &&
      items.some((item) => item.id === mapping.variable));
  const mappings = sourceMappings.filter((mapping) => Boolean(mapping.exactQuotation?.trim()) &&
    comparisonText(finding.passage).includes(comparisonText(mapping.exactQuotation!)));
  if (!mappings.length && sourceMappings.length) {
    if (sourceMappings.some((mapping) => mapping.supportStatus === "missing-passage" || mapping.rejectionCodes?.includes("missing-passage"))) {
      return "Missing admitted source text in a canonical mapping receipt (missing-passage); the retained original passage remains reviewable. This is not a missing canonical field.";
    }
    return "Quotation support not established for this retained passage; canonical source mapping receipts exist but no matching admitted quotation is recorded.";
  }
  const associated = items.filter((item) => mappings.some((mapping) => mapping.variable === item.id));
  if (associated.some(invalidValueReason)) return "Invalid value or unit in an associated record; not a financial input.";
  if (mappings.some((mapping) => mapping.supportStatus !== "supported")) return "Quotation support not established; original passage retained for review.";
  if (!mappings.length) return "No matching canonical evidence field is established for this retained passage. This is a mapping gap, not missing source text.";
  if (mappings.some((mapping) => mapping.contradictionStatus !== "none")) return "Attributed contradiction retained; applicability requires review.";
  return "Passage mapping retained; source validation and financial acceptance remain separate.";
}

export const SESSION_REVIEW_IDS = ["electricity_cost", "water_consumption", "grid_interconnection"] as const;
export function getSessionReviewAvailability(
  project: ProjectContext,
  evidence: Record<string, { sourceUrl?: string; id: string; unit?: string; rawUnit?: string; value?: unknown; rawValue?: unknown; eligibleForModel?: boolean }>,
  model: FinancialModelingState,
) {
  const candidates = SESSION_REVIEW_IDS.flatMap((id) => {
    const rec = project.researchProposals?.[id] ?? (evidence[id]?.sourceUrl ? evidence[id] : undefined);
    return rec ? [{ id, rec, mismatch: hasCapacityDurationMismatch(rec) }] : [];
  });
  return { candidates, modelAvailable: model.status === "modeled", canPreview: model.status === "modeled" && candidates.some((entry) => !entry.mismatch) };
}

export function getResearchResultPresentation(project: ProjectContext, evidence: Record<string, EvidenceItem>) {
  const summary = getConferenceEvidenceSummary(evidence, project);
  // A dimensionally wrong record is not repaired or rebound by presentation.
  const mismatches = summary.established.filter(hasCapacityDurationMismatch);
  const established = summary.established.filter((item) => !hasCapacityDurationMismatch(item));
  const structuredReports = summary.reportedNotVerified.filter((item) => !hasCapacityDurationMismatch(item));
  const unresolvedIds = new Set([...summary.open, ...mismatches, ...summary.reportedNotVerified.filter(hasCapacityDurationMismatch)].map((item) => item.id));
  const open = Object.values(evidence).filter((item) => unresolvedIds.has(item.id));
  const retained = project.retainedFindings ?? [];
  const categories = (project.researchAudit?.categories ?? []).filter((category) => category.analysisOutcome !== "completed")
    .map((category) => ({
      id: category.categoryId,
      label: category.label,
      reason: categoryHasNoText(category)
        ? "Not assessed: no admitted passage text."
        : `Not established in this run: ${category.analysisOutcome ?? "assessment not recorded"}${category.notRunReason ? ` · ${category.notRunReason.replace(/[-_]+/g, " ")}` : ""}.`,
    }));
  const status = project.canonicalDossier || project.kind !== "custom"
    ? { label: "Reviewed snapshot", description: "Reviewed source record, not completed live research. Unresolved items remain separate." }
    : project.replay
      ? { label: "Saved partial research", description: "Offline saved response; no live provider request. Original assessment limitations remain." }
      : project.researchError?.type === "interrupted"
        ? { label: "Research interrupted", description: project.researchError.message }
      : { ...getResearchStatusPresentation({
        outcome: project.researchOutcome, researchMode: project.researchMode,
        researchStatus: project.researchStatus,
        eligibleProposalCount: Object.keys(project.researchProposals ?? {}).length,
        fallbackIncomplete: true,
      }), description: project.researchError?.message || "Run completion does not establish every claim or accept any financial input." };
  const reported = [
    ...structuredReports.map((item) => ({ id: item.id, text: `${item.label}: ${shortSourceText(String(item.value))}` })),
    ...retained.map((finding) => ({
      id: finding.id,
      text: `${finding.attribution}: “${shortSourceText(finding.passage)}” · ${finding.assessment === "ambiguous-unresolved" ? "Applicability unresolved" : "Retained reporting/context"}; no demonstrated financial effect.`,
    })),
  ];
  const evaluatedCandidates = Object.values(project.researchProposals ?? {}).filter((item) =>
    item.sourceValidation?.state === "financially-eligible" && item.semanticValidationStatus === "valid" && !hasCapacityDurationMismatch(item));
  return {
    ...summary, established, facts: established.slice(0, 3), open, unresolved: open.slice(0, 3),
    structuredReports, retained, reported, categories, status,
    unresolvedDecisionGateCount: open.filter((item) => item.impactRole === "Decision Gate").length,
    unresolvedFinancialDriverCount: open.filter((item) => item.impactRole === "Financial Driver").length,
    acceptedFinancialInputs: Object.values(evidence).filter((item) => item.acceptedForModel === true && item.impactRole === "Financial Driver" && item.semanticValidationStatus === "valid" && !hasCapacityDurationMismatch(item)),
    readiness: evaluatedCandidates.length ? `${evaluatedCandidates.length} evaluated candidate${evaluatedCandidates.length === 1 ? "" : "s"} · financial readiness not established; acceptance remains separate` : "Not assessed",
    nextAction: reported.length || established.length ? "Review sources and unresolved items" : "Inspect assessment limitations",
  };
}