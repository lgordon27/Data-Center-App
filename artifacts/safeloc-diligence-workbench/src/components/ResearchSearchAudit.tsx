import type { CustomResearchResponse } from "@/services/researchProjectService";
import {
  getPublicCategoryPresentation,
  getPublicResearchPresentation,
} from "@/services/publicResearchPresentation";

const SOURCE_FAMILY_LABELS: Record<string, string> = {
  "declared-project-endpoint": "declared project endpoint",
  "government-project-record": "government project record",
  "utility-regulator": "utility or regulator",
  "project-operator": "project operator",
  "independent-reporting": "independent reporting",
  "government-agency": "government agency",
  "news-aggregator": "news aggregator",
  other: "other",
};

function displayCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? Math.max(0, value) : 0;
}

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
  const outcomeMetrics = audit?.outcomeMetrics;
  const sourceFamilies = Object.entries(outcomeMetrics?.sourceFamilyCounts ?? {})
    .filter(([family, count]) => Object.hasOwn(SOURCE_FAMILY_LABELS, family)
      && typeof count === "number"
      && Number.isSafeInteger(count)
      && count > 0)
    .sort(([leftFamily, leftCount], [rightFamily, rightCount]) =>
      rightCount - leftCount || leftFamily.localeCompare(rightFamily))
    .slice(0, 8);

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
        {outcomeMetrics && (
          <section data-testid="research-run-yield" className="rounded-lg border border-[#e5eae8] bg-[#f7f9f8] px-3 py-3">
            <strong className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#243844]">Run yield</strong>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <p><strong data-testid="yield-project-sources">{displayCount(outcomeMetrics.uniqueProjectSpecificSourcesOpened)}</strong> unique project-specific sources opened <span className="text-[#71808a]">({displayCount(outcomeMetrics.uniqueSourcesOpened)} total)</span></p>
              <p><strong data-testid="yield-retained-sources">{displayCount(outcomeMetrics.uniqueUsableRetainedSources)}</strong> unique usable retained sources</p>
              <p><strong data-testid="yield-retained-passages">{displayCount(outcomeMetrics.uniqueRetainedPassages)}</strong> unique retained passages</p>
              <p><strong data-testid="yield-eligible-claims">{displayCount(outcomeMetrics.eligibleClaims)}</strong> eligible claims</p>
              <p className="sm:col-span-2 lg:col-span-3">
                Categories: {displayCount(outcomeMetrics.categoryCompletion.complete)} complete · {displayCount(outcomeMetrics.categoryCompletion.partial)} partial · {displayCount(outcomeMetrics.categoryCompletion.conclusiveNoEvidence)} conclusive no evidence · {displayCount(outcomeMetrics.categoryCompletion.technicalIncomplete)} technically incomplete · {displayCount(outcomeMetrics.categoryCompletion.notSearched)} not searched
                <span className="text-[#71808a]"> ({displayCount(outcomeMetrics.categoryCompletion.executed)} of {displayCount(outcomeMetrics.categoryCompletion.requested)} requested work executed)</span>
              </p>
              <p className="sm:col-span-2 lg:col-span-3">
                Excluded or reused: {displayCount(outcomeMetrics.exclusions.blocked)} blocked · {displayCount(outcomeMetrics.exclusions.duplicateOccurrencesReused)} duplicate occurrences reused · {displayCount(outcomeMetrics.exclusions.irrelevantCandidates)} irrelevant
              </p>
            </div>
            {sourceFamilies.length > 0 && (
              <p data-testid="yield-source-families" className="mt-2 border-t border-[#e5eae8] pt-2">
                Source families: {sourceFamilies
                  .map(([family, count]) => `${SOURCE_FAMILY_LABELS[family]} (${displayCount(count)})`)
                  .join(" · ")}
              </p>
            )}
          </section>
        )}
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