import { useState } from "react";
import { ArrowLeft, ChevronDown, Droplets, MapPin, Network } from "lucide-react";
import { ClaimCitation } from "@/components/ClaimCitation";
import { ProviderQueueSnapshot } from "@/components/ProviderQueueSnapshot";
import { useDiligence } from "@/context/DiligenceContext";
import { chainAccentClasses, valueChainStages } from "@/data/valueChainStages";

export function ValueChain({ onWorkbench }: { onWorkbench: () => void }) {
  const [activeStage, setActiveStage] = useState("data-center-infrastructure");
  const { ercotQueue } = useDiligence();

  return (
    <div data-testid="value-chain-page" className="value-chain-page overflow-hidden rounded-2xl bg-[#0d1c2b] text-[#f6f7f2] shadow-xl">
      <section className="relative overflow-hidden border-b border-white/10 px-5 py-8 md:px-8 md:py-11 xl:px-10">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#294454_1px,transparent_1px),linear-gradient(90deg,#294454_1px,transparent_1px)] [background-size:42px_42px] [mask-image:linear-gradient(120deg,black,transparent_80%)]" />
        <div className="relative z-10">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="max-w-4xl">
              <div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#d4e86b]"><Network aria-hidden="true" className="h-3.5 w-3.5" /> The AI Chain / seven linked layers</div>
              <h1 className="max-w-4xl text-[38px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[60px]">Follow AI demand from chips to <span className="text-[#d4e86b]">client portfolios.</span></h1>
              <p data-testid="value-chain-narrative" className="mt-6 max-w-3xl text-[14px] leading-7 text-[#c4d0d6] md:text-[16px] md:leading-8">SafeLoc focuses on the infrastructure layer, where power, water, grid, construction and community constraints can interrupt the chain.</p>
            </div>
            <button data-testid="button-value-chain-return-hero" type="button" onClick={onWorkbench} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[#60717f] px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#d4e86b] transition-colors hover:border-[#d4e86b] hover:bg-white/10">Back to workbench <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </section>

      <section className="px-5 py-7 md:px-8 md:py-9 xl:px-10">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8dc8e8]">Follow the dependency</div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] md:text-[29px]">Seven layers. One physical starting point.</h2>
          </div>
          <div className="max-w-sm text-[11px] leading-5 text-[#9dafb8]">Each layer has a different proof burden. SafeLoc starts where AI demand encounters physical reality.</div>
        </div>

        <ol data-testid="value-chain-stages" aria-label="Seven linked layers of the AI economy" className="value-chain-flow">
          {valueChainStages.map((stage) => {
            const Icon = stage.icon;
            const isFocal = stage.id === "data-center-infrastructure";
            const accent = chainAccentClasses[stage.accent];
            return (
              <li key={stage.id} data-testid={`value-chain-stage-${stage.id}`} className={`value-chain-stage ${isFocal ? "value-chain-stage-focal" : ""}`}>
                <details
                  open={activeStage === stage.id}
                  className={`value-chain-card ${isFocal ? "value-chain-card-focal" : ""}`}
                >
                  <summary
                    aria-expanded={activeStage === stage.id}
                    onClick={(event) => {
                      event.preventDefault();
                      setActiveStage((current) => current === stage.id ? "" : stage.id);
                    }}
                    className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold ${accent.marker}`}>{stage.number}</span>
                      <Icon aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 ${isFocal ? "text-[#4d6200]" : accent.label}`} />
                    </div>
                    {isFocal && <div data-testid="value-chain-you-are-here" className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ba2f45] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-white"><MapPin aria-hidden="true" className="h-3 w-3" /> YOU ARE HERE</div>}
                    <h3 className={`mt-4 text-[15px] font-bold leading-[1.08] tracking-[-0.025em] ${isFocal ? "text-[#122232]" : "text-white"}`}>{stage.title}</h3>
                    <div className={`mt-3 text-[10px] leading-4 ${isFocal ? "text-[#263416]" : "text-[#c4d0d6]"}`}>{stage.description}</div>
                    <div className={`mt-3 flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.14em] ${isFocal ? "text-[#4d6200]" : accent.label}`}><ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform [details[open]_&]:rotate-180" /> {activeStage === stage.id ? "Collapse details" : "Expand details"}</div>
                  </summary>
                  <div className={`mt-4 border-t pt-3 ${isFocal ? "border-[#75851e]/40" : "border-white/15"}`}>
                    {isFocal ? (
                      <>
                        <p className="text-[11px] leading-5 text-[#263416]">This is where AI demand encounters power, water, grid, construction and community constraints. SafeLoc begins its analysis at this layer.</p>
                        <p className="mt-3 text-[11px] leading-5 text-[#263416]">Project-level evidence does not automatically establish issuer or portfolio materiality.</p>
                        <div className="mt-3">{stage.claimIds.map((claimId) => <ClaimCitation key={claimId} claimId={claimId} />)}</div>
                        <div className="mt-4 flex items-center gap-2 border-t border-[#75851e]/40 pt-4 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#ba2f45]"><Droplets aria-hidden="true" className="h-3.5 w-3.5" /> Power · water · land · grid · community</div>
                      </>
                    ) : (
                      <>
                        <div className={`font-mono text-[8px] font-bold uppercase tracking-[0.16em] ${accent.label}`}>Players / references</div>
                        <p className="mt-1.5 text-[10px] font-medium leading-4 text-[#e3eaed]">{stage.players}</p>
                        <div className={`mt-4 border-t pt-3 ${isFocal ? "border-[#75851e]/40" : "border-white/15"}`}>
                          <div className={`font-mono text-[8px] font-bold uppercase tracking-[0.16em] ${accent.label}`}>Why evidence matters here</div>
                          <p className="mt-1.5 text-[10px] leading-4 text-[#c4d0d6]">{stage.evidence}</p>
                          {stage.claimIds.map((claimId) => <ClaimCitation key={claimId} claimId={claimId} dark />)}
                        </div>
                      </>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>

        <div className="mt-7 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[#8dc8e8]/35 bg-white/5 p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8dc8e8]">Why this layer matters</div>
            <p className="mt-2 text-[12px] leading-5 text-[#c4d0d6]">Investors evaluating AI exposure increasingly need to understand the physical infrastructure and community conditions beneath public-company growth assumptions.</p>
          </div>
          <div className="rounded-lg border border-[#f5ddd5]/35 bg-white/5 p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#f5ddd5]">Investment boundary</div>
            <p className="mt-2 text-[12px] leading-5 text-[#c4d0d6]">A documented infrastructure relationship is a starting point for diligence, not proof of security-level or fund-level materiality.</p>
          </div>
        </div>

        <section data-testid="value-chain-evidence-workflow" className="mt-4 rounded-lg border border-[#d4e86b]/35 bg-[#102b3b] p-5">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#d4e86b]">SafeLoc evidence workflow</div>
          <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[#c4d0d6]">The market chain explains where infrastructure risk may arise. The evidence workflow determines what SafeLoc can responsibly say about one exact project.</p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Candidate discovery", "Directory metadata proposes a project and originating-company context; it is not facility proof."],
              ["02", "Exact-project identity", "Names, location, operator and authoritative domains must resolve to the same project."],
              ["03", "Bounded passages", "Fixed request and document-open limits retain exact quotations, dates and source URLs."],
              ["04", "Evidence review", "Claims are classified by scope and unit; missing or conflicting evidence stays visible."],
              ["05", "Human acceptance", "AI proposals remain pending and model-neutral until a reviewer explicitly accepts them."],
              ["06", "Eligible model inputs", "Only accepted, semantically compatible project inputs may enter an approved scenario."],
              ["07", "Audience outputs", "Financial Advisor and Asset Manager outputs remain separate from issuer, fund or portfolio conclusions."],
            ].map(([number, title, description]) => (
              <li key={number} className="rounded-md border border-white/10 bg-[#0d1c2b] p-3">
                <span className="font-mono text-[9px] font-bold text-[#8dc8e8]">{number}</span>
                <strong className="mt-2 block text-[11px] text-white">{title}</strong>
                <span className="mt-1 block text-[10px] leading-4 text-[#9dafb8]">{description}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[11px] font-semibold leading-5 text-[#f5ddd5]">AI does not automatically create verified facts, accepted inputs or investment conclusions.</p>
        </section>

        <details data-testid="value-chain-supporting-context" className="group mt-4 rounded-lg border border-white/10 bg-white/5">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#9dafb8] [&::-webkit-details-marker]:hidden">
            Supporting market context and sources <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-white/10 px-4 pb-4 pt-4">
            <ProviderQueueSnapshot queue={ercotQueue} dark />
            <div className="mt-4 rounded-lg border border-[#ba2f45]/50 bg-[#3a1e2b] p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#f5ddd5]">The pause signal</div>
              <div className="mt-2 text-[19px] font-semibold tracking-[-0.04em] text-white">$130 billion in projects paused in Q1 2026.</div>
              <p className="mt-2 text-[10px] leading-4 text-[#e5c6c7]">Capital is meeting physical constraints before it reaches the model or application layer.</p>
              <ClaimCitation claimId="stargate-cancellation" dark />
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}