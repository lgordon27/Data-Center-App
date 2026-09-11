import {
  getResearchCategoryClaimAudits,
  type CustomResearchResponse,
  type ResearchCategoryAudit,
  type ResearchCategoryClaimAudit,
  type ResearchEvidenceAuditItem,
} from "@/services/researchProjectService";

function categoryTone(category: ResearchCategoryAudit) {
  if (category.state === "Complete") return "bg-[#e0f4ed] text-[#08644f]";
  if (category.state === "Not searched" || category.state === "No eligible evidence") return "bg-[#fde8eb] text-[#ba2f45]";
  return "bg-[#fff0d6] text-[#7c4c00]";
}

function claimTone(claim: ResearchCategoryClaimAudit) {
  if (claim.supportStatus === "supported" && claim.accessState === "accessible") return "border-[#b7dfcf] bg-[#f2fbf7] text-[#08644f]";
  if (claim.accessState === "blocked" || claim.accessState === "unsupported" || claim.supportStatus === "blocked") return "border-[#efbac3] bg-[#fff4f6] text-[#8f2437]";
  return "border-[#f1cb8b] bg-[#fff8e9] text-[#6f460e]";
}

function claimStatusLabel(claim: ResearchCategoryClaimAudit) {
  if (claim.accessState === "blocked") return "Blocked · not evidence";
  if (claim.accessState === "unsupported" && claim.accessReason === "scanned-pdf") return "Scanned PDF · not evidence";
  if (claim.accessState === "unsupported") return "Unsupported · not evidence";
  if (claim.supportStatus === "supported" && claim.accessState === "accessible") return "Retained · claim supported";
  if (claim.supportStatus === "context-only") return "Context only · not evidence";
  if (claim.supportStatus === "missing-passage") return "Missing passage · not evidence";
  return `${claim.supportStatus.replaceAll("-", " ")} · not accepted`;
}

function CategoryClaimTrace({ claim }: { claim: ResearchCategoryClaimAudit }) {
  const hasPassage = Boolean(claim.retainedPassage || claim.exactQuotation);
  return (
    <li className={`rounded border px-2.5 py-2 ${claimTone(claim)}`} data-testid={`research-claim-trace-${claim.evidenceId}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-semibold text-[#243844]">{claim.evidenceLabel}</span>
        <span className="rounded-full border border-current px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.05em]">{claimStatusLabel(claim)}</span>
      </div>
      <p className="mt-1 leading-4"><strong>Claim:</strong> {claim.claimText || "Claim text unavailable."}</p>
      {claim.retainedPassage && (
        <blockquote className="mt-1 border-l-2 border-current pl-2 leading-4">
          <strong>Retained passage:</strong> “{claim.retainedPassage}”
        </blockquote>
      )}
      {!claim.retainedPassage && claim.exactQuotation && (
        <blockquote className="mt-1 border-l-2 border-current pl-2 leading-4">
          <strong>Claim quotation:</strong> “{claim.exactQuotation}”
        </blockquote>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[8px] uppercase tracking-[0.05em]">
        {claim.sourceTitle && <span>{claim.sourceTitle}{claim.sourcePublisher ? ` · ${claim.sourcePublisher}` : ""}</span>}
        {claim.pageOrSection !== null && <span>Page/section: {claim.pageOrSection}</span>}
        {claim.format && <span>Format: {claim.format}</span>}
      </div>
      {claim.resolvedUrl && (
        <a
          data-testid={`research-claim-link-${claim.evidenceId}`}
          href={claim.resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center font-semibold text-[#255bb7] underline underline-offset-2"
        >
          Open {claim.accessState === "accessible" ? "resolved source" : "source for review"}
        </a>
      )}
      {claim.accessReason && <p className="mt-1"><strong>Access:</strong> {claim.accessReason}</p>}
      {claim.extractionLimitations.length > 0 && (
        <p className="mt-1"><strong>Extraction limitation:</strong> {claim.extractionLimitations.join(" · ")}</p>
      )}
      {claim.rejectionCodes.length > 0 && <p className="mt-1"><strong>Why not evidence:</strong> {claim.rejectionCodes.join(" · ")}</p>}
      {!hasPassage && !claim.accessReason && <p className="mt-1">No retained passage was returned; this record remains non-evidence.</p>}
    </li>
  );
}

export function ResearchSearchAudit({
  coverage,
  audit,
  evidence = [],
}: {
  coverage?: CustomResearchResponse["researchCoverage"];
  audit?: CustomResearchResponse["researchAudit"];
  evidence?: ResearchEvidenceAuditItem[];
}) {
  return (
    <details data-testid="research-search-audit" className="mb-4 rounded-lg border border-[#d9e0e4] bg-white text-[11px] text-[#52616b]">
      <summary className="cursor-pointer px-4 py-3 font-semibold">
        Research search audit · {audit ? `${audit.categories.length} governed categories` : coverage?.searchTermsSource === "tool-observed" ? `${coverage.searchTerms.length} observed queries` : "query telemetry unavailable"}
      </summary>
      <div className="space-y-2 border-t border-[#d9e0e4] px-4 py-3">
        <p>AI confidence is self-reported, not a verified probability. Validated source support measures captured source support separately. Neither score changes your classifications or financial assumptions.</p>
        <p>{audit ? `Governed run: ${audit.provider} · ${audit.model} · ${audit.providerRequestCount} provider requests · ${audit.budget.deadlineMs / 1000}s deadline · ${audit.budget.maxToolCalls} total tool-call limit.` : "One provider request with a 90-second deadline and up to 32 tool calls."} Requested work is not proof that a search completed.</p>
        {coverage?.toolCallCount !== undefined && <p>Observed search tool calls: {coverage.toolCallCount}.</p>}
        {coverage?.toolCallBudgetExceeded && <p role="status" className="font-semibold text-[#a65a00]">The provider reported more tool calls than the requested limit. Treat search coverage as incomplete; retained findings still require source review.</p>}
        {audit?.providerResponseId && <p className="font-mono text-[10px]">Provider response: {audit.providerResponseId}{audit.elapsedMs !== null ? ` · elapsed ${audit.elapsedMs} ms` : ""}</p>}
         {audit?.providerLimitations.map((limitation) => <p key={limitation} className="rounded border border-[#f1cb8b] bg-[#fff8e9] px-2 py-1 text-[#6f460e]">Provider limitation: {limitation}</p>)}
         {audit && <p>Physical document opens: {audit.physicalOpensUsed}/{audit.physicalOpenBudget} used · {audit.physicalOpensRemaining} remaining{audit.physicalOpenBudgetExceeded ? " · hard ceiling reached; later documents were not fetched" : ""}.</p>}
        {audit && (
          <div className="overflow-x-auto rounded border border-[#d9e0e4]">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">Governed research category audit</caption>
              <thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d]">
                <tr><th className="px-2 py-2">Category</th><th className="px-2 py-2">State</th><th className="px-2 py-2">Pipeline counts</th><th className="px-2 py-2">Queries and gaps</th></tr>
              </thead>
              <tbody className="divide-y divide-[#e5eae8]">
                {audit.categories.map((category) => (
                  <CategoryAuditRow key={category.categoryId} category={category} evidence={evidence} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {coverage?.searchTerms.length ? (
          <>
            <p>{coverage.searchTermsSource === "tool-observed" ? "Response-level observed queries" : "AI-reported queries"} · queries are linked to an individual variable only when they match its planned query. Other observed searches remain here.</p>
            <ul className="list-disc space-y-1 pl-5">
              {coverage.searchTerms.map((term) => <li className="break-words" key={term}>{term}</li>)}
            </ul>
          </>
        ) : <p>No query telemetry was returned. We do not claim the planned searches were completed.</p>}
      </div>
    </details>
  );
}

function CategoryAuditRow({
  category,
  evidence,
}: {
  category: ResearchCategoryAudit;
  evidence: ResearchEvidenceAuditItem[];
}) {
  const claimAudits = getResearchCategoryClaimAudits(category, evidence);
  return (
    <tr data-testid={`research-category-${category.categoryId}`}>
                    <th scope="row" className="whitespace-nowrap px-2 py-2 align-top font-semibold text-[#243844]">{category.label}</th>
                    <td className="px-2 py-2 align-top"><span className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.05em] ${categoryTone(category)}`}>{category.state}</span></td>
                    <td className="px-2 py-2 align-top font-mono text-[9px] leading-4">{category.stageCounts.normalized} normalized · {category.stageCounts.accessed} accessed · {category.stageCounts.parsed} parsed · {category.stageCounts.claimMapped} mapped · {category.stageCounts.eligible} eligible</td>
                    <td className="max-w-[380px] px-2 py-2 align-top text-[9px] leading-4">
                       <div><strong>Issued primary · {category.primaryQueryRole ?? "authoritative-primary"}:</strong> {category.issuedPrimaryQuery ?? "Not issued"}</div>
                       <div className="mt-1"><strong>Provider-observed primary:</strong> {category.providerObservedPrimaryQueries?.length ? category.providerObservedPrimaryQueries.join(" · ") : "None observed"}</div>
                       <div className="mt-1"><strong>Issued fallback · {category.fallbackQueryRole ?? "unrestricted-exact-project-fallback"}:</strong> {category.issuedFollowUpQuery ?? "Not issued"}</div>
                       <div className="mt-1"><strong>Provider-observed fallback:</strong> {category.providerObservedFollowUpQueries?.length ? category.providerObservedFollowUpQueries.join(" · ") : "None observed"}</div>
                       {category.followUpTriggerEvidenceIds?.length ? <div className="mt-1"><strong>Fallback trigger IDs:</strong> {category.followUpTriggerEvidenceIds.join(", ")}</div> : null}
                       {category.followUpSkipReason && <div className="mt-1"><strong>Fallback skip:</strong> {category.followUpSkipReason}</div>}
                       {category.localAuthorities?.length ? <div className="mt-1"><strong>Local authorities:</strong> {category.localAuthorities.map((authority) => `${authority.name} · ${authority.domain ?? "domain not established"}`).join(" | ")}</div> : null}
                       {category.authorityLimitations?.length ? <div className="mt-1 text-[#8a5200]"><strong>Authority limitation:</strong> {category.authorityLimitations.join(" · ")}</div> : null}
                       <div className="mt-1"><strong>Returned domains:</strong> {category.returnedDomains?.length ? category.returnedDomains.join(" · ") : "None returned"}</div>
                       <div className="mt-1"><strong>Documents:</strong> {category.openedDocuments?.length ?? 0} receipts · {category.openedDocuments?.filter((document) => document.opened).length ?? 0} physical opens · {category.openedDocuments?.filter((document) => Boolean(document.retainedPassage)).length ?? 0} retained passages.</div>
                       {category.accessLimitations.length > 0 && <div className="mt-1 text-[#8a5200]"><strong>Access limitations:</strong> {category.accessLimitations.join(" · ")}</div>}
                       {category.unresolvedGaps.length > 0 && <div className="mt-1 text-[#8a5200]"><strong>Gaps:</strong> {category.unresolvedGaps.join(", ")}</div>}
                      {Object.keys(category.rejectionCounts).length > 0 && <div className="mt-1 text-[#ba2f45]"><strong>Rejected:</strong> {Object.entries(category.rejectionCounts).map(([reason, count]) => `${reason} (${count})`).join(" · ")}</div>}
                       {claimAudits.length > 0 && (
                         <details className="mt-2 rounded border border-[#d9e0e4] bg-white">
                           <summary className="cursor-pointer list-none px-2 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#60707d] [&::-webkit-details-marker]:hidden">
                             Claim/source trace · {claimAudits.length} mapping{claimAudits.length === 1 ? "" : "s"}
                           </summary>
                           <ul className="space-y-2 border-t border-[#e5eae8] px-2 py-2">
                             {claimAudits.map((claim, index) => <CategoryClaimTrace key={`${claim.evidenceId}-${claim.sourceUrl ?? "unresolved"}-${index}`} claim={claim} />)}
                           </ul>
                         </details>
                       )}
                    </td>
                  </tr>
  );
}