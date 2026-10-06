import { useState } from "react";
import { ChevronDown, Save, Scale } from "lucide-react";
import { SessionFinancialReview } from "@/components/conference/SessionFinancialReview";
import { useDiligence } from "@/context/DiligenceContext";
import { FinancialMateriality } from "@/pages/FinancialMateriality";
import { DecisionReview } from "@/pages/DecisionReview";
import { DiligenceLiveRegions, formatIRR } from "@/components/Shell";
import { isConferenceResearchIncomplete } from "@/model/conferenceEvidence";

export function FinancialTransmission({ onNavigate, onResolveEvidence }: { onNavigate: (screen: string) => void; onResolveEvidence: (id: string) => void }) {
  const { project, evidence, metrics, financialInputState, financialModeling, financialScenarios, sourceStates, eiaData } = useDiligence();
  const incomplete = isConferenceResearchIncomplete(project, evidence);
   const [showStressTest, setShowStressTest] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [requestedAction, setRequestedAction] = useState<"save" | "compare" | null>(null);
  const openScenario = (action: "save" | "compare" | null) => { setScenarioOpen(true); setRequestedAction(action); };
  const detailNavigate = (screen: string) => screen === "decision" ? openScenario(null) : onNavigate(screen);
  const syntheticPrimary = financialScenarios.scenarios["synthetic-current"];
  const eiaBaseline = financialScenarios.scenarios["eia-verified"];
  const eiaCurrent = financialScenarios.scenarios["eia-current"];
  const hasEiaObservation = eiaData.dataOrigin === "provider" && Boolean(eiaData.latestPricePeriod);
  const eiaRetrievedDate = eiaData.fetchedAt && Number.isFinite(Date.parse(eiaData.fetchedAt))
    ? new Date(eiaData.fetchedAt).toISOString().slice(0, 10)
    : null;
  const formatElectricityRate = (rate: number | undefined) =>
    rate !== undefined && Number.isFinite(rate) ? `$${rate.toFixed(1)}/MWh` : "Not available";
  return (
    <section data-testid="conference-view-transmission" className="space-y-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">03 / Trace a possible financial pathway</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">How could a physical constraint reach a holding?</h2></div>
      {incomplete && <div data-testid="transmission-research-incomplete" className="rounded-lg border border-[#e3d4b6] bg-[#fffbf2] p-5">
         <h3 className="font-semibold text-[#805000]">Evidence assessment remains incomplete</h3><p className="mt-2 text-sm leading-6 text-[#52616b]">Unresolved assessment does not prevent review of an available candidate. Candidate review requires matching scope and an available model; nothing applies without explicit acceptance. Synthetic returns are not project economics.</p>
      </div>}
       {financialModeling.status === "not-modeled" && (
        <section data-testid="canonical-financial-not-modeled" className="rounded-xl border border-[#e3d4b6] bg-[#fffbf2] p-5">
          <h3 className="font-semibold text-[#805000]">Not modeled</h3>
          <p data-testid="canonical-financial-not-modeled-reason" className="mt-2 text-sm leading-6 text-[#52616b]">{financialModeling.reason}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-[#60707d]">Required inputs</p>
          <ul data-testid="canonical-financial-required-inputs" className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#52616b]">
            {financialModeling.requiredInputs.map((input) => <li key={input}>{input}</li>)}
          </ul>
          <p className="mt-4 text-xs leading-5 text-[#60707d]">The reviewed dossier remains available in Project Reality. No project, issuer, fund, or portfolio return is inferred.</p>
        </section>
      )}
      <p data-testid="transmission-return-boundary" className="text-xs leading-5 text-[#60707d]">{project.kind === "custom" && financialModeling.status === "modeled"
        ? `Illustrative — not project economics. The ${project.name} scenario uses synthetic transaction assumptions, not reported project terms, issuer valuation or investment advice.`
        : `Synthetic ${project.name} scenario economics are not reported transaction terms, issuer valuation or investment advice.`} Any EIA electricity overlay below is statewide market context only—not a disclosed {project.name} tariff or an issuer/portfolio return.</p>
       <section data-testid="transmission-electricity-basis" aria-labelledby="transmission-electricity-basis-heading" className="grid gap-3 rounded-xl border border-[#d9e0e4] bg-white p-4 sm:grid-cols-2 sm:p-5">
         <div data-testid="transmission-primary-electricity-basis" className="rounded-lg border border-[#e3d4b6] bg-[#fffbf2] p-4">
           <h3 id="transmission-electricity-basis-heading" className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#805000]">Primary model input · illustrative assumption</h3>
           <p className="mt-2 text-xl font-semibold text-[#122232]">{formatElectricityRate(syntheticPrimary?.inputs.appliedElectricityRate)}</p>
           <p className="mt-2 text-[11px] leading-5 text-[#52616b]">
             The bundled synthetic starting value is {formatElectricityRate(syntheticPrimary?.inputs.rawElectricityRate)}; the model applies its existing electricity uncertainty treatment. It is an analyst-selected underwriting assumption, not a sourced Stargate tariff.
           </p>
           <p className="mt-2 font-mono text-[9px] text-[#71808a]">Source: illustrative case assumption · source publication date: none</p>
         </div>
         <div data-testid="transmission-eia-electricity-basis" className="rounded-lg border border-[#8dc8e8]/50 bg-[#f2f9fc] p-4">
           <h3 className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#164c67]">Separate EIA statewide market comparison</h3>
           {hasEiaObservation ? (
             <>
               <p className="mt-2 text-xl font-semibold text-[#122232]">{formatElectricityRate(eiaData.latestPrice)}</p>
               <p className="mt-2 text-[11px] leading-5 text-[#52616b]">
                 <a href="https://www.eia.gov/opendata/browser/electricity/retail-sales/data" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#164c67] underline underline-offset-2">U.S. EIA Open Data · Texas industrial retail-sales price series</a>
                 {" "}· observed period {eiaData.latestPricePeriod} · retrieved {eiaRetrievedDate ?? "date not reported"}. This is statewide market context, not a Stargate contract rate.
               </p>
             </>
           ) : (
             <p className="mt-2 text-[11px] leading-5 text-[#52616b]">No EIA provider observation is available in this session; no statewide rate, observation period, or retrieval date is reported. The bundled $42/MWh assumption is not an EIA series value.</p>
           )}
         </div>
         <div data-testid="transmission-eia-baseline-irr" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
           <h3 className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">EIA-rate baseline IRR · verified inputs</h3>
           <p className="mt-2 font-mono text-2xl font-bold text-[#122232]">{hasEiaObservation && eiaBaseline ? formatIRR(eiaBaseline.returns.projectIRR) : "Not available"}</p>
         </div>
         <div data-testid="transmission-eia-stress-irr" className="rounded-lg border border-[#cbd8d4] bg-[#eef5f2] p-4">
           <h3 className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#314207]">EIA-rate current-evidence stress IRR</h3>
           <p className="mt-2 font-mono text-2xl font-bold text-[#122232]">{hasEiaObservation && eiaCurrent ? formatIRR(eiaCurrent.returns.projectIRR) : "Not available"}</p>
         </div>
         <p className="sm:col-span-2 text-[10px] leading-4 text-[#60707d]">The EIA-rate baseline and current-evidence stress figures are existing sensitivity scenarios. They do not replace the primary synthetic model inputs or represent project, issuer, or portfolio returns.</p>
       </section>
       {financialModeling.status === "not-modeled" && <p data-testid="financial-session-model-unavailable" className="text-xs leading-5 text-[#805000]">Model unavailable: no financial preview or acceptance controls. Findings remain available for source review in Project Reality.</p>}
       <div className="rounded-xl border border-[#cbd8d4] bg-white">
        <button type="button" data-testid={incomplete && !showStressTest ? "button-opt-in-scenario" : "button-illustrative-stress-test"} aria-expanded={showStressTest} aria-controls="illustrative-stress-test"
          onClick={() => { setShowStressTest(!showStressTest); setScenarioOpen(false); setRequestedAction(null); }} className="flex min-h-14 w-full items-center justify-between gap-3 p-5 text-left">
          <span><span className="block text-sm font-semibold">Illustrative Project Stress Test</span><span className="mt-1 block text-xs text-[#52616b]">{financialModeling.status === "not-modeled" ? "Review source candidates and decision history · model unavailable" : incomplete && !showStressTest ? "Explore illustrative scenario — explicitly use synthetic assumptions" : "Optional project IRR, NPV, MOIC and cash-flow schedule"}</span></span>
          <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${showStressTest ? "rotate-180" : ""}`} />
        </button>
        {showStressTest && <div id="illustrative-stress-test" className="min-w-0 border-t border-[#e5eae8] p-3 sm:p-5">
          <p className="mb-4 rounded-md bg-[#fff8e9] p-3 text-xs leading-5 text-[#805000]">Illustrative only. Missing evidence uses the existing synthetic model policies; opening this view does not accept evidence or change any calculation.</p>
           <SessionFinancialReview />
           {financialModeling.status === "modeled" && <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button data-testid="rail-save-scenario" type="button" disabled={project.kind === "custom"} onClick={() => openScenario("save")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#cbd8d4] px-3 text-xs disabled:opacity-40"><Save aria-hidden="true" className="h-3 w-3" />Save scenario</button>
            <button data-testid="rail-compare-scenarios" type="button" disabled={project.kind === "custom"} onClick={() => openScenario("compare")} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#cbd8d4] px-3 text-xs disabled:opacity-40"><Scale aria-hidden="true" className="h-3 w-3" />Compare scenarios</button>
            {project.kind === "custom" && <span className="self-center text-xs text-[#60707d]">Named scenarios remain available for the curated case.</span>}
          </div>
           <DiligenceLiveRegions
             metrics={metrics}
             financialInputState={financialInputState}
             providerAvailability={`${sourceStates.eia.status} EIA source`}
             providerApplicability={project.kind === "custom" ? "not applied to this custom project" : "an optional project-level market sensitivity only"}
           />
          {scenarioOpen ? <section data-testid="conference-scenarios">
            <button type="button" onClick={() => setScenarioOpen(false)} className="mb-4 text-sm underline">Close scenario workspace</button>
            <DecisionReview onNavigate={detailNavigate} onResolve={onResolveEvidence} requestedAction={requestedAction} onRequestedActionHandled={() => setRequestedAction(null)} />
           </section> : <FinancialMateriality onNavigate={detailNavigate} />}
           </>}
        </div>}
       </div>
    </section>
  );
}