import type {
  CustomEvidenceRecord,
  ResearchAudit,
  ResearchCacheMetadata,
  ResearchCoverageStatus,
} from "@/services/researchProjectService";
import { getResearchTelemetryMode } from "@/services/researchProjectService";

export type ProposalDisposition = "pending" | "accepted" | "overridden" | "rejected" | "unresolved";

type ResearchHandoffSummaryProps = {
  projectName: string;
  projectLocation: string;
  researchStatus?: string;
  evidence: CustomEvidenceRecord[];
  proposals: Record<string, CustomEvidenceRecord>;
  dispositions: Record<string, ProposalDisposition>;
  audit?: ResearchAudit;
  researchCache?: ResearchCacheMetadata;
  coverage?: {
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
  onReviewFindings: () => void;
};

export function ResearchTelemetryStatus({
  audit,
  coverage,
  researchCache,
  compact = false,
}: {
  audit?: ResearchAudit;
  coverage?: ResearchHandoffSummaryProps["coverage"];
  researchCache?: ResearchCacheMetadata;
  compact?: boolean;
}) {
  const historical = getResearchTelemetryMode(researchCache) === "historical-retained";
  const used = coverage?.physicalOpensUsed ?? audit?.physicalOpensUsed ?? 0;
  const budget = coverage?.physicalOpenBudget ?? audit?.physicalOpenBudget ?? audit?.budget.maxPhysicalDocumentOpens ?? 24;
  const remaining = coverage?.physicalOpensRemaining ?? audit?.physicalOpensRemaining ?? Math.max(0, budget - used);
  const ceilingReached = coverage?.physicalOpenBudgetExceeded ?? audit?.physicalOpenBudgetExceeded ?? used >= budget;
  const cacheDescription = historical
    ? [
      researchCache?.state ? `${researchCache.state} cache` : "retained cache",
      researchCache?.refreshStatus === "failed" ? "refresh failed" : null,
      researchCache?.providerAvailable === false ? "provider unavailable" : null,
    ].filter(Boolean).join(" · ")
    : "provider response";
  return (
    <div
      data-testid={compact ? "research-telemetry-status-compact" : "research-telemetry-status"}
      role="status"
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-[9px] leading-4 ${
        historical ? "border-[#f1cb8b] bg-[#fff8e9] text-[#6f460e]" : "border-[#b7dfcf] bg-[#f2fbf7] text-[#08644f]"
      }`}
    >
      <strong>{historical ? "Historical retained/cached research telemetry" : "Current live research telemetry"}</strong>
      <span>{cacheDescription}</span>
      {researchCache?.storedAt && <time dateTime={researchCache.storedAt}>saved {new Date(researchCache.storedAt).toLocaleString()}</time>}
      <span className="font-mono">
        Physical opens: {used}/{budget} used · {remaining} remaining{ceilingReached ? " · ceiling reached" : ""}
      </span>
      {historical && <span className="sr-only">These counters describe the retained historical run, not a new live search.</span>}
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
  evidence,
  proposals,
  dispositions,
  audit,
  researchCache,
  coverage,
  onReviewFindings,
}: ResearchHandoffSummaryProps) {
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
  const returnedAuthorities = new Set(audit?.categories.flatMap((category) => category.returnedDomains ?? []) ?? []);
  const openedDocuments = (audit?.categories.flatMap((category) => category.openedDocuments ?? []) ?? []).filter((document) => document.opened).length;
  const reusedDocuments = (audit?.categories.flatMap((category) => category.openedDocuments ?? []) ?? []).filter((document) => !document.opened && document.reusedFromCanonicalUrl).length;
  const retainedPassages = (audit?.categories.flatMap((category) => category.openedDocuments ?? []) ?? []).filter((document) => Boolean(document.retainedPassage)).length;
  const targetedAuthorities = new Set(audit?.categories.flatMap((category) => category.authorityTargets?.names ?? []) ?? []);
  const localAuthorities = audit?.categories.flatMap((category) => category.localAuthorities ?? category.authorityTargets?.localAuthorities ?? []) ?? [];
  const authorityLimitations = [...new Set(audit?.categories.flatMap((category) => category.authorityLimitations ?? category.authorityTargets?.limitations ?? []) ?? [])];
  const unresolvedIds = [...new Set(audit?.categories.flatMap((category) => category.unresolvedGaps ?? []) ?? [])];

  return (
    <section data-testid="research-handoff-summary" className="mb-5 rounded-xl border border-[#b8cde0] bg-[#f6fbfe] px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#255bb7]">Research handoff</div>
          <h2 className="mt-1 break-words text-[16px] font-semibold tracking-[-0.02em] text-[#122232]">{projectName}</h2>
          <p className="mt-1 break-words text-[10px] text-[#52616b]">{projectLocation}</p>
          <p data-testid="research-handoff-status" className="mt-2 text-[10px] font-semibold text-[#243844]">
            Final status: {researchStatus ?? "not recorded"}
          </p>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-[#52616b]">Exact-project evidence can be proposed here, but it stays outside the model until a reviewer accepts it. Related and comparable material is context only.</p>
        </div>
        <button data-testid="button-review-research-findings" type="button" onClick={onReviewFindings} className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#122232] px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#d4e86b]">
          Review findings
        </button>
      </div>
      <div className="mt-4">
        <ResearchTelemetryStatus audit={audit} coverage={coverage} researchCache={researchCache} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          <div className="text-[9px] text-[#60707d]">Still unresolved or requiring reviewer confirmation</div>
        </div>
        <div data-testid="research-handoff-context" className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Related context</div>
          <div className="mt-2 text-[20px] font-semibold text-[#7049b7]">{relatedContext.length}</div>
          <div className="text-[9px] text-[#60707d]">{relatedContext.length} related/comparable context records</div>
        </div>
      </div>
      <details className="mt-4 rounded-lg border border-[#d9e0e4] bg-white">
        <summary data-testid="research-handoff-details" className="cursor-pointer list-none px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#60707d] [&::-webkit-details-marker]:hidden">Search and authority detail</summary>
        <div className="grid gap-3 border-t border-[#e5eae8] p-3 text-[9px] leading-4 text-[#52616b] sm:grid-cols-2">
          <p><strong className="text-[#243844]">Targeted:</strong> {targetedAuthorities.size} named authorities or authority groups. <strong className="text-[#243844]">Returned:</strong> {returnedAuthorities.size} domains.</p>
           <p><strong className="text-[#243844]">Local authority discovery:</strong> {localAuthorities.length} identified · {localAuthorities.filter((authority) => authority.status === "established").length} official domains established. {authorityLimitations.length ? "Limitations recorded below." : "No authority discovery limitation recorded."}</p>
           <p><strong className="text-[#243844]">Documents:</strong> {openedDocuments} physical opens · {reusedDocuments} reused receipts · {retainedPassages} retained passages. <strong className="text-[#243844]">Retained source records:</strong> {coverage?.retrievedSourceCount ?? 0}.</p>
           <p><strong className="text-[#243844]">Physical-open budget:</strong> {coverage?.physicalOpensUsed ?? audit?.physicalOpensUsed ?? openedDocuments}/{coverage?.physicalOpenBudget ?? audit?.physicalOpenBudget ?? audit?.budget.maxPhysicalDocumentOpens ?? 24} used · {coverage?.physicalOpensRemaining ?? audit?.physicalOpensRemaining ?? "unknown"} remaining{coverage?.physicalOpenBudgetExceeded || audit?.physicalOpenBudgetExceeded ? " · ceiling reached" : ""}.</p>
            <p className="sm:col-span-2"><strong className="text-[#243844]">Telemetry lineage:</strong> {getResearchTelemetryMode(researchCache) === "historical-retained" ? "The counts, category skip reasons, and limitations below describe the retained historical run; they are not a new live search." : "The counts below describe the current live provider run."}</p>
           <p><strong className="text-[#243844]">Queries:</strong> {audit?.categories.reduce((total, category) => total + category.executedQueries.length, 0) ?? 0} provider-observed query records. Follow-ups: {coverage?.followUpCount ?? 0}/{coverage?.followUpLimit ?? audit?.followUpLimit ?? "bounded"}. Unresolved IDs: {unresolvedIds.length ? unresolvedIds.join(", ") : "none recorded"}.</p>
          <p>{coverage?.failedDomains?.length ? <><strong className="text-[#8a5200]">Unavailable:</strong> {coverage.failedDomains.join(", ")}.</> : "No returned-domain access limitations were recorded."}</p>
           {authorityLimitations.length > 0 && <p className="sm:col-span-2 text-[#8a5200]"><strong>Authority limitations:</strong> {authorityLimitations.join(" · ")}</p>}
            {audit?.categories.some((category) => category.followUpSkipReason) && (
              <p className="sm:col-span-2 text-[#8a5200]"><strong>Category skips:</strong> {audit.categories.filter((category) => category.followUpSkipReason).map((category) => `${category.label}: ${category.followUpSkipReason}`).join(" · ")}</p>
            )}
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