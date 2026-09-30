import type {
  RetainedResearchFinding,
  RetainedResearchFindingAudit,
} from "@/services/researchProjectService";

const statusPresentation: Record<RetainedResearchFinding["assessment"], { label: string; style: string }> = {
  "source-supported": { label: "Source-supported passage", style: "border-[#9bd8c5] bg-[#eff8f4] text-[#08644f]" },
  "attributed-report": { label: "Attributed reporting", style: "border-[#aac6f4] bg-[#eef5ff] text-[#255bb7]" },
  "ambiguous-unresolved": { label: "Ambiguous applicability", style: "border-[#f1cb8b] bg-[#fff8e9] text-[#8a5200]" },
};

const eligibilityLabel: Record<RetainedResearchFinding["financialProposalEligibility"], string> = {
  eligible: "Eligible proposal status reported",
  ineligible: "Not financially eligible",
  unresolved: "Financial eligibility unresolved",
};

const reportingDateBasisLabel: Record<RetainedResearchFinding["reportingDateBasis"], string> = {
  "semantic-metadata": "article publication metadata",
  "json-ld-date-published": "JSON-LD datePublished",
  "visible-publication-line": "visible publication line",
  "provider-source-metadata": "provider/source metadata",
  "ambiguous-publication-metadata": "ambiguous publication metadata",
  "not-reported": "not reported",
};

export function RetainedResearchFindings({
  findings,
  audit,
  testId = "retained-research-findings",
}: {
  findings?: RetainedResearchFinding[];
  audit?: RetainedResearchFindingAudit;
  testId?: string;
}) {
  const entries = findings ?? [];
  if (entries.length === 0 && !audit) return null;

  return (
    <section data-testid={testId} className="rounded-xl border border-[#d9e0e4] bg-[#f8fafb] p-5">
      <h3 className="font-semibold text-[#122232]">Retained source passages · not accepted into the model</h3>
      <p className="mt-1 text-xs leading-5 text-[#52616b]">
        Exact retrieved passages remain available for review. Applicability and financial eligibility are separate assessments; none of these passages changes project capacity, cash flows, or returns.
      </p>
      {audit && <div data-testid={`${testId}-audit`} className="mt-3 rounded-lg bg-white p-3 text-[10px] leading-5 text-[#52616b]">
        {audit.accessiblePassagesReviewed} accessible passages reviewed · {audit.sourceSupportedCount} source-supported · {audit.attributedReportCount} attributed · {audit.ambiguousUnresolvedCount} ambiguous · {audit.unrelatedExcludedCount} unrelated excluded · {audit.duplicateExcludedCount} duplicate passages excluded · {audit.financiallyEligibleCount} financially eligible
        {" · "}{audit.shownFindingCount} shown of {audit.totalFindingCount} retained findings (cap 8; {audit.capDiscardCount} cap-discarded)
      </div>}
      {entries.length === 0 ? (
        <p className="mt-3 rounded-lg bg-white p-3 text-xs leading-5 text-[#52616b]">No passage was retained as potentially relevant to this project. Excluded unrelated passages are not project findings.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {entries.map((finding) => (
            <article key={finding.id} data-testid={`${testId}-${finding.id}`} className="rounded-lg border border-[#cbd8d4] bg-white p-3 text-xs leading-5">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${statusPresentation[finding.assessment].style}`}>
                  {statusPresentation[finding.assessment].label}
                </span>
                <span className="rounded-full border border-[#d9e0e4] bg-[#f5f7f6] px-2 py-1 text-[9px] font-bold uppercase text-[#52616b]">
                  {eligibilityLabel[finding.financialProposalEligibility]}
                </span>
              </div>
              <p className="mt-2 font-semibold text-[#122232]">{finding.attribution}</p>
              <p className="mt-1 text-[#344550]">{finding.statement}</p>
              <p className="mt-1 text-[#52616b]">{finding.projectScope}</p>
              <p className="mt-1 text-[#60707d]">
                Scope metadata (unverified): {finding.phaseScope}
                {finding.timePeriod ? ` · Claim period metadata: ${finding.timePeriod}` : ""}
                {finding.powerClaimState === "resolved" && finding.powerClaim
                  ? ` · Power claim: ${finding.powerClaim.quantity} · ${finding.powerClaim.measure} · status ${finding.powerClaim.status}${finding.powerClaim.phaseScope ? ` · ${finding.powerClaim.phaseScope}` : ""}${finding.powerClaim.facilityScope ? ` · ${finding.powerClaim.facilityScope}` : ""}`
                  : finding.powerClaimState === "unresolved"
                    ? " · Power claim unresolved; see exact passage"
                    : ""}
              </p>
              <p className="mt-1 text-[#60707d]">
                Source publication date: {finding.reportingDate ?? "not reported"} ({reportingDateBasisLabel[finding.reportingDateBasis]}) · Accessed: {finding.accessedAt ?? "not recorded"} (retrieval time)
              </p>
              <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-[#aac6f4] pl-3 text-[#344550]">
                <span className="sr-only">Exact retained source passage: </span>{finding.passage}
              </blockquote>
              <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[#255bb7] underline">
                {finding.sourceTitle}
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}