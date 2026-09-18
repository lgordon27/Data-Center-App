import { useDiligence } from "@/context/DiligenceContext";
import { generateAdvisorBrief, generateAssetManagerBrief } from "@/model/conferencePresentation";
import { Lightbulb, Info, HelpCircle, AlertCircle, ArrowRight } from "lucide-react";

function formatAsOfDate(value: string | null) {
  if (!value) return "date unavailable";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function AdvisorBrief() {
  const diligence = useDiligence();
  const brief = generateAdvisorBrief(diligence);
  const assetManagerBrief = generateAssetManagerBrief(diligence);

  return (
    <div data-testid="conference-view-advisor" className="space-y-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">04 / Turn evidence into audience outputs</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Advisor Brief</h2><p className="mt-1 text-xs text-[#52616b]">Evidence as of {formatAsOfDate(brief.evidenceAsOf)}</p></div>
      <div data-testid="financial-advisor-coverage" className="rounded-lg border border-[#aac6f4] bg-[#eef5ff] px-4 py-3 text-xs text-[#122232]">
        <strong>{brief.coverageLabel}</strong> · No buy/sell recommendation. Project sensitivity is not an issuer, fund, or portfolio return.
      </div>
      <div data-testid="advisor-gap-summary" className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[#e3d4b6] bg-[#fffbf2] px-4 py-3 text-xs text-[#805000]"><strong className="font-semibold">Unresolved decision gates:</strong> {brief.gapSummary.unresolvedDecisionGates}</div>
        <div className="rounded-lg border border-[#f5ddd5] bg-[#fff3f4] px-4 py-3 text-xs text-[#7f2635]"><strong className="font-semibold">Unresolved financial drivers:</strong> {brief.gapSummary.unresolvedFinancialDrivers}</div>
      </div>
      <div data-testid="advisor-primary-case" className="rounded-xl border border-[#aac6f4] bg-[#eef5ff] p-4 text-xs leading-5 text-[#344550]">
        <strong className="text-[#122232]">{brief.primaryCase.label}:</strong>{" "}
        {brief.primaryCase.projectIRR === null ? "N/M" : `${brief.primaryCase.projectIRR.toFixed(1)}% IRR`} · {brief.primaryCase.recommendationStatus}.{" "}
        {brief.primaryCase.boundary}
      </div>
      {brief.monitoringConsiderations.length > 0 && (
        <section data-testid="advisor-monitoring-considerations" className="rounded-xl border border-[#d9e0e4] bg-white p-4">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#122232]">Monitoring considerations</h3>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-[#52616b]">
            {brief.monitoringConsiderations.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-4 shadow-sm">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#122232] mb-4 flex items-center gap-2">
            <Info className="h-4 w-4 text-[#122232]" />
            What We Know
          </h3>
          <ul className="space-y-3">
            {brief.whatWeKnow.map((item, i) => (
              <li key={i} className="text-[12px] text-[#122232] leading-tight flex gap-2">
                <span className="text-[#d9e0e4] mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {brief.whatWeKnow.length === 0 && <p className="text-xs leading-5 text-[#52616b]">No source-backed verified facts established. Review Project Reality for the retained research.</p>}
        </div>
        
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-4 shadow-sm">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#122232] mb-4 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-[#ba2f45]" />
            What We Do Not Know
          </h3>
          <ul className="space-y-3">
            {brief.whatWeDoNotKnow.map((item, i) => (
              <li key={i} className="text-[12px] text-[#52616b] leading-tight flex gap-2">
                <span className="text-[#ba2f45]/40 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {brief.whatWeDoNotKnow.length === 0 && <p className="text-xs leading-5 text-[#52616b]">No unresolved items in the available record; portfolio dependence still requires confirmation.</p>}
        </div>
      <div className="rounded-xl border border-[#d9e0e4] bg-[#f9faf8] p-4 shadow-sm">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#122232] mb-4 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-[#ba2f45]" />
          Why It Could Matter
        </h3>
        <ul className="space-y-3">
          {brief.whyItMatters.map((item, i) => (
            <li key={i} className="text-[13px] text-[#122232] font-medium leading-tight flex gap-2">
              <span className="text-[#ba2f45] mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-[#122232] bg-[#122232] p-4 text-white shadow-sm md:grid-cols-[0.85fr_1.15fr]">
        <h3 className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] md:col-span-2">
          <Lightbulb className="h-4 w-4" />
          Manager Engagement
        </h3>
        
        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-white/50 mb-2 font-mono">Suggested Action</div>
          <div data-testid="advisor-recommended-action" className="flex items-start gap-3 bg-[#0a1b2a] p-4 rounded-lg border border-white/10">
            <ArrowRight className="h-5 w-5 text-[#d4e86b] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[13px] text-white mb-1">{brief.action.label}</div>
              <div className="text-[12px] text-white/70 leading-relaxed">{brief.action.description}</div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-white/50 mb-2 font-mono">Questions for the Manager</div>
          <ul className="space-y-2">
            {brief.questions.slice(0, 3).map((item, i) => (
              <li key={i} data-testid={`advisor-manager-question-${i}`} className="flex gap-3 rounded-md bg-[#1a2e3f] p-2.5 text-[12px] leading-snug text-white">
                <span className="font-mono text-[#d4e86b] font-bold">{i + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details data-testid="asset-manager-brief" className="group rounded-xl border border-[#d9e0e4] bg-[#f7f8f5] shadow-sm">
        <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#607500]">Asset Manager brief</p>
          <h3 className="mt-1 text-lg font-semibold text-[#122232]">{assetManagerBrief.title} · evidence and materiality review</h3>
          <p className="mt-1 text-xs text-[#52616b]">Evidence as of {formatAsOfDate(assetManagerBrief.evidenceAsOf)} · No automatic portfolio conclusion · Expand for the asset-manager output.</p>
        </summary>
        <div className="space-y-4 border-t border-[#d9e0e4] p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-3 text-xs"><strong className="block text-[#122232]">Issuer / project</strong>{assetManagerBrief.relationship.type} · {assetManagerBrief.relationship.confidence}</div>
          <div className="rounded-lg bg-white p-3 text-xs"><strong className="block text-[#122232]">Issuer materiality</strong>{assetManagerBrief.issuerMateriality}</div>
          <div className="rounded-lg bg-white p-3 text-xs"><strong className="block text-[#122232]">Portfolio materiality</strong>{assetManagerBrief.portfolioMateriality}</div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-3 text-xs">
            <strong className="block mb-2 text-[#122232]">Open disclosure requests</strong>
            <ul className="space-y-2 text-[#52616b]">{assetManagerBrief.disclosureRequests.map((item) => <li key={item}>• {item}</li>)}</ul>
          </div>
          <div className="rounded-lg bg-white p-3 text-xs">
            <strong className="block mb-2 text-[#122232]">Engagement questions</strong>
            <ol className="space-y-2 text-[#52616b]">{assetManagerBrief.engagementQuestions.map((item, index) => <li key={item}>{index + 1}. {item}</li>)}</ol>
          </div>
        </div>
        <p className="text-xs text-[#52616b]"><strong>Financial boundary:</strong> {assetManagerBrief.projectMateriality.boundary}</p>
        {diligence.project.canonicalDossier && <>
          <div data-testid="asset-manager-monitoring" className="rounded-lg bg-white p-3 text-xs">
            <strong className="block text-[#122232]">Monitoring triggers</strong>
            <ul className="mt-2 space-y-1 text-[#52616b]">{assetManagerBrief.monitoringTriggers.map((item) => <li key={item}>• {item}</li>)}</ul>
          </div>
          <div data-testid="asset-manager-provenance" className="rounded-lg bg-white p-3 text-xs">
            <strong className="block text-[#122232]">Source provenance</strong>
            <ul className="mt-2 space-y-1 text-[#52616b]">{assetManagerBrief.provenance.map((item) => <li key={`${item.id}-${item.url ?? "none"}`}>{item.title}{item.url ? <> · <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[#255bb7] underline">source</a></> : null}</li>)}</ul>
          </div>
        </>}
        </div>
      </details>
    </div>
  );
}
