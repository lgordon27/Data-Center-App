import type {
  CustomEvidenceRecord,
  ResearchAudit,
  ResearchCoverageStatus,
} from "@/services/researchProjectService";

export type ProposalDisposition = "pending" | "accepted" | "rejected" | "unresolved";

type ResearchHandoffSummaryProps = {
  evidence: CustomEvidenceRecord[];
  proposals: Record<string, CustomEvidenceRecord>;
  dispositions: Record<string, ProposalDisposition>;
  audit?: ResearchAudit;
  coverage?: {
    searchedDomains: string[];
    failedDomains: string[];
    retrievedSourceCount: number;
    sourcePriorityApplied?: string[];
    followUpCount?: number;
    followUpLimit?: number;
    followUpLimitPerCategory?: number;
  };
  onReviewFindings: () => void;
};

const coverageLabel: Record<ResearchCoverageStatus, string> = {
  supported: "supported",
  partial: "partial",
  conflicting: "conflicting",
  "searched-no-support": "searched · no support",
};

export function ResearchHandoffSummary({
  evidence,
  proposals,
  dispositions,
  audit,
  coverage,
  onReviewFindings,
}: ResearchHandoffSummaryProps) {
  const exactProjectSources = evidence.filter((item) => item.sourceRelevance === "exact-project" && (item.sources?.length ?? 0) > 0);
  const relatedContext = evidence.filter((item) => item.sourceRelevance === "related-context" || item.sources?.some((source) => source.relationship !== "primary"));
  const unresolved = evidence.filter((item) =>
    item.classification === "Missing Evidence"
    || item.sourceRelevance === "unresolved"
    || item.coverageStatus === "searched-no-support"
    || item.coverageStatus === "conflicting",
  );
  const pending = Object.values(dispositions).filter((value) => value === "pending").length;
  const accepted = Object.values(dispositions).filter((value) => value === "accepted").length;
  const rejected = Object.values(dispositions).filter((value) => value === "rejected").length;
  const unresolvedProposals = Object.values(dispositions).filter((value) => value === "unresolved").length;
  const completeCategories = audit?.categories.filter((category) => category.state === "Complete").length ?? 0;

  return (
    <section data-testid="research-handoff-summary" className="mb-5 rounded-xl border border-[#b8cde0] bg-[#f6fbfe] px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#255bb7]">Research handoff</div>
          <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#122232]">What the bounded search found</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-[#52616b]">Exact-project evidence can be proposed here, but it stays outside the model until a reviewer accepts it. Related and comparable material is context only.</p>
        </div>
        <button data-testid="button-review-research-findings" type="button" onClick={onReviewFindings} className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#122232] px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#d4e86b]">
          Review findings
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div data-testid="research-handoff-exact-project" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Exact-project sources</div>
          <div className="mt-2 text-[20px] font-semibold text-[#08644f]">{exactProjectSources.length}</div>
          <div className="text-[9px] text-[#60707d]">Inputs with project-specific source receipts</div>
        </div>
        <div data-testid="research-handoff-proposals" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Eligible proposals</div>
          <div className="mt-2 text-[20px] font-semibold text-[#255bb7]">{Object.keys(proposals).length}</div>
          <div className="text-[9px] text-[#60707d]">{pending} pending · {accepted} accepted · {rejected} rejected · {unresolvedProposals} unresolved</div>
        </div>
        <div data-testid="research-handoff-gaps" className="rounded-lg border border-[#efbac3] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#8f2437]">Material gaps</div>
          <div className="mt-2 text-[20px] font-semibold text-[#ba2f45]">{unresolved.length}</div>
          <div className="text-[9px] text-[#60707d]">Still unresolved or requiring reviewer confirmation</div>
        </div>
        <div data-testid="research-handoff-context" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Related context</div>
          <div className="mt-2 text-[20px] font-semibold text-[#7049b7]">{relatedContext.length}</div>
          <div className="text-[9px] text-[#60707d]">{completeCategories}/{audit?.categories.length ?? 0} categories complete</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-[#d9e0e4] bg-white p-3 text-[9px] leading-4 text-[#52616b]">
          <strong className="text-[#243844]">Search coverage:</strong> {coverage?.retrievedSourceCount ?? 0} retained source records across {coverage?.searchedDomains?.length ?? 0} executed domain(s).
          {coverage?.failedDomains?.length ? <span className="ml-1 text-[#8a5200]">Unavailable: {coverage.failedDomains.join(", ")}.</span> : null}
          {typeof coverage?.followUpCount === "number" && <span className="ml-1">Gap follow-ups: {coverage.followUpCount}/{coverage.followUpLimit ?? audit?.followUpLimit ?? "bounded"} total; max {coverage.followUpLimitPerCategory ?? audit?.followUpLimitPerCategory ?? 1} per category.</span>}
        </div>
        <div data-testid="research-handoff-priority" className="rounded-lg border border-[#d9e0e4] bg-white p-3 text-[9px] leading-4 text-[#52616b]">
          <strong className="text-[#243844]">Source priority:</strong> {coverage?.sourcePriorityApplied?.join(" · ") ?? "Authoritative public records first; comparable material remains context-only."}
        </div>
      </div>
      {unresolved.length > 0 && (
        <div data-testid="research-handoff-unresolved-list" className="mt-3 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[9px] leading-4 text-[#6f460e]">
          <strong>Unresolved material gaps:</strong> {unresolved.slice(0, 6).map((item) => `${item.label} (${coverageLabel[item.coverageStatus ?? "searched-no-support"]})`).join(" · ")}
          {unresolved.length > 6 ? ` · +${unresolved.length - 6} more` : ""}
        </div>
      )}
    </section>
  );
}