import type { CustomResearchResponse, ResearchCategoryAudit } from "@/services/researchProjectService";

function categoryTone(category: ResearchCategoryAudit) {
  if (category.state === "Complete") return "bg-[#e0f4ed] text-[#08644f]";
  if (category.state === "Not searched" || category.state === "No eligible evidence") return "bg-[#fde8eb] text-[#ba2f45]";
  return "bg-[#fff0d6] text-[#7c4c00]";
}

export function ResearchSearchAudit({
  coverage,
  audit,
}: {
  coverage?: CustomResearchResponse["researchCoverage"];
  audit?: CustomResearchResponse["researchAudit"];
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
        {audit && (
          <div className="overflow-x-auto rounded border border-[#d9e0e4]">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">Governed research category audit</caption>
              <thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d]">
                <tr><th className="px-2 py-2">Category</th><th className="px-2 py-2">State</th><th className="px-2 py-2">Pipeline counts</th><th className="px-2 py-2">Queries and gaps</th></tr>
              </thead>
              <tbody className="divide-y divide-[#e5eae8]">
                {audit.categories.map((category) => (
                  <tr key={category.categoryId} data-testid={`research-category-${category.categoryId}`}>
                    <th scope="row" className="whitespace-nowrap px-2 py-2 align-top font-semibold text-[#243844]">{category.label}</th>
                    <td className="px-2 py-2 align-top"><span className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.05em] ${categoryTone(category)}`}>{category.state}</span></td>
                    <td className="px-2 py-2 align-top font-mono text-[9px] leading-4">{category.stageCounts.normalized} normalized · {category.stageCounts.accessed} accessed · {category.stageCounts.parsed} parsed · {category.stageCounts.claimMapped} mapped · {category.stageCounts.eligible} eligible</td>
                    <td className="max-w-[380px] px-2 py-2 align-top text-[9px] leading-4">
                      <div><strong>Requested:</strong> {category.requestedPrimaryQuery}</div>
                      <div className="mt-1"><strong>Executed:</strong> {category.executedQueries.length ? category.executedQueries.join(" · ") : "None observed"}</div>
                      {category.followUpExecutedQuery && <div className="mt-1"><strong>Follow-up:</strong> {category.followUpExecutedQuery}</div>}
                      {category.unresolvedGaps.length > 0 && <div className="mt-1 text-[#8a5200]"><strong>Gaps:</strong> {category.unresolvedGaps.join(", ")}</div>}
                      {Object.keys(category.rejectionCounts).length > 0 && <div className="mt-1 text-[#ba2f45]"><strong>Rejected:</strong> {Object.entries(category.rejectionCounts).map(([reason, count]) => `${reason} (${count})`).join(" · ")}</div>}
                    </td>
                  </tr>
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