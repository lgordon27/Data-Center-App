import { useState } from "react";
import { ArrowRight, ChevronDown, Save, Scale } from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { FinancialMateriality } from "@/pages/FinancialMateriality";
import { DecisionReview } from "@/pages/DecisionReview";
import { DiligenceLiveRegions } from "@/components/Shell";
import { getConferenceRelationship, isConferenceResearchIncomplete } from "@/model/conferenceEvidence";

export function FinancialTransmission({ onNavigate, onResolveEvidence }: { onNavigate: (screen: string) => void; onResolveEvidence: (id: string) => void }) {
  const { project, evidence, originatingCompany, metrics } = useDiligence();
  const incomplete = isConferenceResearchIncomplete(project, evidence);
  const [showStressTest, setShowStressTest] = useState(() => !incomplete);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [requestedAction, setRequestedAction] = useState<"save" | "compare" | null>(null);
  const openScenario = (action: "save" | "compare" | null) => { setScenarioOpen(true); setRequestedAction(action); };
  const detailNavigate = (screen: string) => screen === "decision" ? openScenario(null) : onNavigate(screen);
  const relationship = getConferenceRelationship(project, originatingCompany);
  const links = [
    { label: "Real Factor", title: "Power, water & community conditions", detail: "Timing, availability and documented obligations are reviewed in Project Reality." },
    { label: "Project Consequence", title: "Project Delay & Cost Overrun", detail: "A constraint could defer commissioning or change operating and capital costs. This is a possible pathway, not a forecast." },
    { label: "Potential Issuer Implication", title: relationship.established ? relationship.company!.displayName : "Issuer link not established", detail: relationship.established ? "Depending on contracts, delivery timing or input costs could affect revenue or margins. The amount is not established." : "Do not attribute project outcomes to a company without a documented relationship." },
    { label: "Portfolio Relevance", title: "Materiality remains unquantified", detail: "Check actual holding weights, issuer dependence and diversification. A single project cannot establish a fund-risk rating." },
  ];
  return (
    <section data-testid="conference-view-transmission" className="space-y-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">03 / Trace a possible financial pathway</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">How could a physical constraint reach a holding?</h2></div>
      {incomplete && <div data-testid="transmission-research-incomplete" className="rounded-lg border border-[#e3d4b6] bg-[#fffbf2] p-5">
        <h3 className="font-semibold text-[#805000]">Research Incomplete</h3><p className="mt-2 text-sm leading-6 text-[#52616b]">The custom project lacks sufficient accepted, source-backed material evidence. No return conclusion is presented. You can inspect the research or explicitly explore a synthetic scenario.</p>
      </div>}
      <p className="text-xs leading-5 text-[#60707d]">Synthetic project economics are not reported transaction terms, issuer valuation or investment advice.</p>
      <div className="rounded-xl border border-[#cbd8d4] bg-white">
        <button type="button" data-testid={incomplete && !showStressTest ? "button-opt-in-scenario" : "button-illustrative-stress-test"} aria-expanded={showStressTest} aria-controls="illustrative-stress-test"
          onClick={() => { setShowStressTest(!showStressTest); setScenarioOpen(false); setRequestedAction(null); }} className="flex min-h-14 w-full items-center justify-between gap-3 p-5 text-left">
          <span><span className="block text-sm font-semibold">Illustrative Project Stress Test</span><span className="mt-1 block text-xs text-[#52616b]">{incomplete && !showStressTest ? "Explore illustrative scenario — explicitly use synthetic assumptions" : "Optional project IRR, NPV, MOIC and cash-flow schedule"}</span></span>
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${showStressTest ? "rotate-180" : ""}`} />
        </button>
        {showStressTest && <div id="illustrative-stress-test" className="min-w-0 border-t border-[#e5eae8] p-3 sm:p-5">
          <p className="mb-4 rounded-md bg-[#fff8e9] p-3 text-xs leading-5 text-[#805000]">Illustrative only. Missing evidence uses the existing synthetic model policies; opening this view does not accept evidence or change any calculation.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button data-testid="rail-save-scenario" type="button" disabled={project.kind === "custom"} onClick={() => openScenario("save")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#cbd8d4] px-3 text-xs disabled:opacity-40"><Save aria-hidden="true" className="h-3 w-3" />Save scenario</button>
            <button data-testid="rail-compare-scenarios" type="button" disabled={project.kind === "custom"} onClick={() => openScenario("compare")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#cbd8d4] px-3 text-xs disabled:opacity-40"><Scale aria-hidden="true" className="h-3 w-3" />Compare scenarios</button>
            {project.kind === "custom" && <span className="self-center text-xs text-[#60707d]">Named scenarios remain available for the curated case.</span>}
          </div>
          <DiligenceLiveRegions metrics={metrics} />
          {scenarioOpen ? <section data-testid="conference-scenarios">
            <button type="button" onClick={() => setScenarioOpen(false)} className="mb-4 text-sm underline">Close scenario workspace</button>
            <DecisionReview onNavigate={detailNavigate} onResolve={onResolveEvidence} requestedAction={requestedAction} onRequestedActionHandled={() => setRequestedAction(null)} />
          </section> : <FinancialMateriality onNavigate={detailNavigate} />}
        </div>}
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {links.map((link, index) => <article key={link.label} className={`relative min-w-0 rounded-xl border p-5 ${index === 3 ? "border-[#122232] bg-[#122232] text-white" : "border-[#cbd8d4] bg-white"}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${index === 3 ? "text-[#d4e86b]" : "text-[#607500]"}`}>{index + 1} / {link.label}</div>
          <h3 className="mt-3 text-base font-semibold">{link.title}</h3><p className={`mt-3 text-xs leading-5 ${index === 3 ? "text-[#c4d0d6]" : "text-[#52616b]"}`}>{link.detail}</p>
          {index < 3 && <ArrowRight aria-hidden="true" className="mt-4 h-4 w-4 rotate-90 text-[#607500] lg:rotate-0" />}
        </article>)}
      </div>
    </section>
  );
}