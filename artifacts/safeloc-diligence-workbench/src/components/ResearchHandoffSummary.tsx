import type {
  CustomEvidenceRecord,
  ResearchAudit,
  ResearchCacheMetadata,
  ResearchCoverageStatus,
  ResearchOutcomeState,
} from "@/services/researchProjectService";
import {
  getResearchTelemetryMode,
} from "@/services/researchProjectService";
import { getPublicResearchPresentation } from "@/services/publicResearchPresentation";

export type ProposalDisposition = "pending" | "accepted" | "overridden" | "rejected" | "unresolved";

export type ResearchCoverageSummary = {
  searchedDomains: string[];
  failedDomains: string[];
  retrievedSourceCount: number;
  sourcePriorityApplied?: string[];
  followUpCount?: number;
  followUpLimit?: number;
  followUpLimitPerCategory?: number;
  physicalOpenBudget?: number;
  physicalOpensUsed?: number;
  physicalOpensRemaining?: number;
  physicalOpenBudgetExceeded?: boolean;
};

type ResearchHandoffSummaryProps = {
  projectName: string;
  projectLocation: string;
  researchStatus?: string;
  researchOutcome?: {
    state: ResearchOutcomeState;
    eligibleEvidenceCount: number;
    reasonCodes: string[];
  };
  researchMode?: "ai-researched" | "partial-public-source" | "default-assumptions" | "research-incomplete";
  evidence: CustomEvidenceRecord[];
  proposals: Record<string, CustomEvidenceRecord>;
  dispositions: Record<string, ProposalDisposition>;
  audit?: ResearchAudit;
  researchCache?: ResearchCacheMetadata;
  coverage?: ResearchCoverageSummary;
  onReviewFindings: () => void;
};

export function ResearchTelemetryStatus({
  audit,
  researchCache,
  coverage,
  compact = false,
}: {
  audit?: ResearchAudit;
  researchCache?: ResearchCacheMetadata;
  coverage?: ResearchCoverageSummary;
  compact?: boolean;
}) {
  const historical = getResearchTelemetryMode(researchCache) === "historical-retained";
  const cacheDescription = historical
    ? researchCache?.refreshStatus === "failed"
      ? "Previously retained research · latest refresh did not complete"
      : "Previously retained research"
    : "Research returned during this visit";
  return (
    <div
      data-testid={compact ? "research-telemetry-status-compact" : "research-telemetry-status"}
      role="status"
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-[10px] leading-4 ${
        historical ? "border-[#f1cb8b] bg-[#fff8e9] text-[#6f460e]" : "border-[#b7dfcf] bg-[#f2fbf7] text-[#08644f]"
      }`}
    >
      <strong>{historical ? "Retained research" : "Current research"}</strong>
      <span>{cacheDescription}</span>
      {researchCache?.storedAt && <time dateTime={researchCache.storedAt}>saved {new Date(researchCache.storedAt).toLocaleString()}</time>}
      {historical && <span>The results describe the retained run, not a new search.</span>}
      {researchCache?.refreshStatus === "failed" && <span>Some results may be older; retained source links remain available for review.</span>}
      {coverage && (
        <span data-testid="research-coverage-summary" className="w-full">
          {coverage.retrievedSourceCount} source record{coverage.retrievedSourceCount === 1 ? "" : "s"} retrieved.
          {typeof coverage.physicalOpenBudget === "number"
            && typeof coverage.physicalOpensUsed === "number"
            && typeof coverage.physicalOpensRemaining === "number"
            ? ` ${coverage.physicalOpensUsed} of ${coverage.physicalOpenBudget} source opens used; ${coverage.physicalOpensRemaining} remaining.`
            : ""}
          {coverage.physicalOpenBudgetExceeded ? " The source-opening limit was reached; remaining candidates were not opened." : ""}
        </span>
      )}
    </div>
  );
}

const coverageLabel: Record<ResearchCoverageStatus, string> = {
  supported: "supported",
  partial: "partial",
  conflicting: "conflicting",
  "searched-no-support": "searched · no support",
};

export function ResearchHandoffSummary({
  projectName,
  projectLocation,
  researchStatus,
  evidence = [],
  proposals = {},
  dispositions = {},
  researchOutcome,
  researchMode,
  audit,
  researchCache,
  coverage,
  onReviewFindings,
}: ResearchHandoffSummaryProps) {
  const categories = Array.isArray(audit?.categories) ? audit.categories : [];
  const eligibleSourceUrls = new Set(
    evidence.flatMap((item) => {
      if (item.sourceValidation?.state !== "financially-eligible") return [];
      const mappings = item.claimMappings ?? item.sourceValidation.claimMappings ?? [];
      const supportedSourceIds = new Set(
        mappings
          .filter((mapping) => mapping.supportStatus === "supported" && typeof mapping.sourceId === "string")
          .map((mapping) => mapping.sourceId),
      );
      return (item.sources ?? [])
        .filter((source) =>
          source.accessOutcome?.state === "accessible"
          && source.exactProject === true
          && [source.canonicalUrl, source.resolvedUrl, source.url]
            .filter((value): value is string => typeof value === "string")
            .some((value) => supportedSourceIds.has(value)),
        )
        .map((source) => source.canonicalUrl ?? source.resolvedUrl ?? source.url);
    }),
  );
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
  const overridden = Object.values(dispositions).filter((value) => value === "overridden").length;
  const openedDocuments = categories.flatMap((category) => Array.isArray(category.openedDocuments) ? category.openedDocuments : []).filter((document) => document.opened).length;
  const retainedPassages = categories.flatMap((category) => Array.isArray(category.openedDocuments) ? category.openedDocuments : []).filter((document) => Boolean(document.retainedPassage)).length;
  const publicPresentation = getPublicResearchPresentation({
    outcome: researchOutcome,
    researchMode,
    researchStatus,
    evidenceCount: evidence.filter((item) => item.classification !== "Missing Evidence").length,
    categories,
    researchCache,
  });
  const outcomeLabel = publicPresentation.label;

  return (
    <section data-testid="research-handoff-summary" className="mb-5 rounded-xl border border-[#b8cde0] bg-[#f6fbfe] px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#255bb7]">Research handoff</div>
          <h2 className="mt-1 break-words text-[16px] font-semibold tracking-[-0.02em] text-[#122232]">{projectName}</h2>
          <p className="mt-1 break-words text-[10px] text-[#52616b]">{projectLocation}</p>
          <p data-testid="research-handoff-status" className="mt-2 text-[10px] font-semibold text-[#243844]">
            Final status: {outcomeLabel}
          </p>
          <p data-testid="research-handoff-explanation" className="mt-1 max-w-3xl text-[10px] leading-4 text-[#6f460e]">
            {publicPresentation.explanation}
          </p>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-[#52616b]">Exact-project evidence can be proposed here, but it stays outside the model until a user accepts it into their scenario. Related and comparable material is context only.</p>
        </div>
        <button data-testid="button-review-research-findings" type="button" onClick={onReviewFindings} className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#122232] px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#d4e86b]">
          Review findings
        </button>
      </div>
      <div className="mt-4">
        <ResearchTelemetryStatus audit={audit} researchCache={researchCache} coverage={coverage} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div data-testid="research-handoff-exact-project" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Eligible sources</div>
          <div className="mt-2 text-[20px] font-semibold text-[#08644f]">{eligibleSourceUrls.size}</div>
          <div className="text-[9px] text-[#60707d]">Accessible exact-project sources mapped to governed evidence</div>
        </div>
        <div data-testid="research-handoff-proposals" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Eligible proposals</div>
          <div className="mt-2 text-[20px] font-semibold text-[#255bb7]">{Object.keys(proposals).length}</div>
          <div className="text-[9px] text-[#60707d]">{pending} pending · {accepted} accepted · {overridden} overridden · {rejected} rejected · {unresolvedProposals} unresolved</div>
        </div>
        <div data-testid="research-handoff-gaps" className="rounded-lg border border-[#efbac3] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#8f2437]">Material gaps</div>
          <div className="mt-2 text-[20px] font-semibold text-[#ba2f45]">{unresolved.length}</div>
          <div className="text-[9px] text-[#60707d]">Still unresolved or requiring user review</div>
        </div>
        <div data-testid="research-handoff-context" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Related context</div>
          <div className="mt-2 text-[20px] font-semibold text-[#7049b7]">{relatedContext.length}</div>
          <div className="text-[9px] text-[#60707d]">{relatedContext.length} related/comparable context records</div>
        </div>
      </div>
      <details className="mt-4 rounded-lg border border-[#d9e0e4] bg-white">
        <summary data-testid="research-handoff-details" className="cursor-pointer list-none px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d] [&::-webkit-details-marker]:hidden">Research scope and limitations</summary>
        <div className="grid gap-3 border-t border-[#e5eae8] p-3 text-[10px] leading-4 text-[#52616b] sm:grid-cols-2">
          <p><strong className="text-[#243844]">Search categories recorded:</strong> {categories.length}.</p>
          <p><strong className="text-[#243844]">Retained passages:</strong> {retainedPassages} across {openedDocuments} reviewed source records.</p>
          <p className="sm:col-span-2">{publicPresentation.explanation} A blocked, failed, or unrun category is incomplete and is not evidence of absence.</p>
          {researchCache?.storedAt && <p><strong className="text-[#243844]">Retained run saved:</strong> {new Date(researchCache.storedAt).toLocaleString()}.</p>}
          {researchCache?.refreshStatus === "failed" && <p className="text-[#8a5200]">The latest refresh was unsuccessful. Existing source links and retained passages remain available; check their dates before relying on them.</p>}
          {categories.length === 0 && <p className="sm:col-span-2">Category detail was not recorded for this run. Search completeness is unknown.</p>}
        </div>
      </details>
      {unresolved.length > 0 && (
        <div data-testid="research-handoff-unresolved-list" className="mt-3 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[9px] leading-4 text-[#6f460e]">
          <strong>Unresolved material gaps:</strong> {unresolved.slice(0, 6).map((item) => `${item.label} (${coverageLabel[item.coverageStatus ?? "searched-no-support"]})`).join(" · ")}
          {unresolved.length > 6 ? ` · +${unresolved.length - 6} more` : ""}
        </div>
      )}
    </section>
  );
}