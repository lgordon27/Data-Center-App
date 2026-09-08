import type { CustomResearchResponse } from "@/services/researchProjectService";

export function ResearchSearchAudit({ coverage }: { coverage?: CustomResearchResponse["researchCoverage"] }) {
  return (
    <details data-testid="research-search-audit" className="mb-4 rounded-lg border border-[#d9e0e4] bg-white text-[11px] text-[#52616b]">
      <summary className="cursor-pointer px-4 py-3 font-semibold">
        Research search audit · {coverage?.searchTermsSource === "tool-observed" ? `${coverage.searchTerms.length} observed queries` : "query telemetry unavailable"}
      </summary>
      <div className="space-y-2 border-t border-[#d9e0e4] px-4 py-3">
        <p>AI confidence is self-reported, not a verified probability. Validated source support measures captured source support separately. Neither score changes your classifications or financial assumptions.</p>
        <p>One provider request with a 90-second deadline and up to 32 tool calls. The per-variable query plan is an instruction, not proof that every search was completed.</p>
        {coverage?.toolCallCount !== undefined && <p>Observed search tool calls: {coverage.toolCallCount}.</p>}
        {coverage?.toolCallBudgetExceeded && <p role="status" className="font-semibold text-[#a65a00]">The provider reported more tool calls than the requested limit. Treat search coverage as incomplete; retained findings still require source review.</p>}
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