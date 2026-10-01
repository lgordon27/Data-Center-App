import type { CustomResearchResponse } from "@/services/researchProjectService";
import {
  getPublicCategoryPresentation,
  getPublicResearchPresentation,
} from "@/services/publicResearchPresentation";

export function ResearchSearchAudit({
  coverage: _coverage,
  audit,
  evidence: _evidence = [],
  researchCache,
}: {
  coverage?: CustomResearchResponse["researchCoverage"];
  audit?: CustomResearchResponse["researchAudit"];
  evidence?: CustomResearchResponse["evidence"];
  researchCache?: CustomResearchResponse["researchCache"];
}) {
  const categories = Array.isArray(audit?.categories)
    ? audit.categories.filter((category) => category && typeof category === "object")
    : [];
  const retainedPassages = categories.reduce(
    (total, category) => total + (category.stageCounts?.retainedPassages ?? category.stageCounts?.parsed ?? 0),
    0,
  );
  const presentation = getPublicResearchPresentation({
    outcome: audit?.terminalState ? { state: audit.terminalState } : undefined,
    categories,
    hasRetainedEvidence: retainedPassages > 0,
    researchCache,
  });

  return (
    <details data-testid="research-search-audit" className="mb-4 rounded-lg border border-[#d9e0e4] bg-white text-[11px] text-[#52616b]">
      <summary className="cursor-pointer px-4 py-3 font-semibold">
        Search coverage and limitations
      </summary>
      <div className="space-y-3 border-t border-[#d9e0e4] px-4 py-3">
        <div data-testid="public-research-state" role="status" className="rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2">
          <strong>{presentation.label}</strong>
          <p className="mt-1">{presentation.explanation}</p>
          {researchCache?.refreshStatus === "failed" && (
            <p className="mt-1">The last refresh did not complete. Previously retained passages remain available and may be older.</p>
          )}
        </div>
        {categories.length > 0 ? (
          <ul className="space-y-2">
            {categories.map((category, index) => {
              const categoryPresentation = getPublicCategoryPresentation(category);
              const retained = category.stageCounts?.retainedPassages ?? category.stageCounts?.parsed ?? 0;
              return (
                <li
                  key={category.categoryId ?? index}
                  data-testid={`public-research-category-${category.categoryId}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#e5eae8] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="break-words text-[#243844]">{category.label ?? "Research category"}</strong>
                    <p className="mt-0.5 leading-4">{categoryPresentation.explanation}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#d9e0e4] bg-[#f7f9f8] px-2 py-1 text-[9px] font-semibold">
                    {categoryPresentation.label}
                  </span>
                  {retained > 0 && <span className="w-full text-[10px]">Retained passages: {retained}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p data-testid="public-research-category-coverage-unavailable" className="rounded-lg bg-[#f7f9f8] px-3 py-2">
            Category coverage was not recorded for this run. Search completeness is unknown; an unrecorded category is not a negative finding.
          </p>
        )}
        {retainedPassages === 0 && (
          <p data-testid="public-research-empty-explanation" className="rounded-lg bg-[#f7f9f8] px-3 py-2">
            No source passage is currently retained for these categories. Searches that were blocked, failed, skipped, or not recorded do not establish that information is non-public.
          </p>
        )}
        {_coverage?.searchTermsSource === "tool-observed" && Array.isArray(_coverage.searchTerms) && _coverage.searchTerms.length > 0 && (
          <p className="text-[10px]">The search record includes observed queries. Individual query details remain in the restricted research audit.</p>
        )}
      </div>
    </details>
  );
}