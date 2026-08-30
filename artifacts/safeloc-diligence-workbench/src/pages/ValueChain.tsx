import {
  chainAccentClasses,
  valueChainStages
} from "@/data/valueChainStages";

import {
  useState
} from "react";

import {
  ArrowLeft,
  ChevronDown,
  MapPin,
  Network,
  Droplets
} from "lucide-react";








export function ValueChain({ onWorkbench }: { onWorkbench: () => void }) {
  const [activeStage, setActiveStage] = useState("data-center-infrastructure");
  return (
    <div data-testid="value-chain-page" className="value-chain-page overflow-hidden rounded-2xl bg-[#0d1c2b] text-[#f6f7f2] shadow-xl">
      <section className="relative overflow-hidden border-b border-white/10 px-5 py-8 md:px-8 md:py-11 xl:px-10">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#294454_1px,transparent_1px),linear-gradient(90deg,#294454_1px,transparent_1px)] [background-size:42px_42px] [mask-image:linear-gradient(120deg,black,transparent_80%)]" />
        <div className="relative z-10">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="max-w-4xl">
              <div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#d4e86b]"><Network className="h-3.5 w-3.5" /> The AI Chain / seven linked layers</div>
              <h1 className="max-w-4xl text-[38px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[60px]">From the wafer to the <span className="text-[#d4e86b]">client conversation.</span></h1>
              <p data-testid="value-chain-narrative" className="mt-6 max-w-3xl text-[14px] leading-7 text-[#c4d0d6] md:text-[16px] md:leading-8">The AI economy runs from semiconductor fabs in Taiwan to financial planning tools on your client&apos;s phone. Sustainable investors helped capitalize this chain by concentrating capital in well-governed, high-performing companies like NVIDIA. Now the infrastructure layer of that chain is testing every value those investors hold. This tool analyzes the layer where the most capital is being deployed, the most uncertainty exists, and the most projects are being paused.</p>
            </div>
            <button data-testid="button-value-chain-return-hero" type="button" onClick={onWorkbench} className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-md border border-[#60717f] px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#d4e86b] transition-colors hover:border-[#d4e86b] hover:bg-white/10">Back to workbench <ArrowLeft className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-9 grid max-w-3xl grid-cols-2 gap-3 border-t border-white/15 pt-5 sm:grid-cols-4">
            <div><div className="font-mono text-[22px] font-bold text-[#d4e86b]">7</div><div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#9dafb8]">linked layers</div></div>
            <div><div className="font-mono text-[22px] font-bold text-[#f5ddd5]">$130B</div><div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#9dafb8]">paused in Q1 2026</div></div>
            <div><div className="font-mono text-[22px] font-bold text-[#cbb7ec]">1</div><div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#9dafb8]">physical bottleneck</div></div>
            <div><div className="font-mono text-[22px] font-bold text-[#8dc8e8]">∞</div><div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-[#9dafb8]">downstream assumptions</div></div>
          </div>
        </div>
      </section>
      <section className="px-5 py-7 md:px-8 md:py-9 xl:px-10">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8dc8e8]">Follow the dependency</div>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.04em] md:text-[29px]">Every layer carries a different proof burden.</h2>
          </div>
          <div className="max-w-sm text-[11px] leading-5 text-[#9dafb8]">Read left to right. The highlighted layer is where this diligence workbench starts.</div>
        </div>
        <ol data-testid="value-chain-stages" aria-label="Seven linked layers of the AI economy" className="value-chain-flow">
          {valueChainStages.map((stage) => {
            const Icon = stage.icon;
            const isFocal = stage.id === "data-center-infrastructure";
            const accent = chainAccentClasses[stage.accent];
            return (
              <li key={stage.id} data-testid={`value-chain-stage-${stage.id}`} className={`value-chain-stage ${isFocal ? "value-chain-stage-focal" : ""}`}>
                <details open={activeStage === stage.id} onToggle={(event) => setActiveStage(event.currentTarget.open ? stage.id : "")} className={`value-chain-card ${isFocal ? "value-chain-card-focal" : ""}`}>
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold ${accent.marker}`}>{stage.number}</span>
                    <Icon aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 ${accent.label}`} />
                  </div>
                  {isFocal && <div data-testid="value-chain-you-are-here" className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ba2f45] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-white"><MapPin className="h-3 w-3" /> YOU ARE HERE</div>}
                  <h3 className={`mt-4 text-[15px] font-bold leading-[1.08] tracking-[-0.025em] ${isFocal ? "text-[#122232]" : "text-white"}`}>{stage.title}</h3>
                  <div className={`mt-3 text-[10px] leading-4 ${isFocal ? "text-[#263416]" : "text-[#c4d0d6]"}`}>{stage.description}</div>
                  <div className={`mt-3 flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.14em] ${isFocal ? "text-[#4d6200]" : accent.label}`}><ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform [details[open]_&]:rotate-180" /> {activeStage === stage.id ? "Hide players & evidence" : "Show players & evidence"}</div>
                  </summary>
                  <div>
                  <div className={`mt-4 border-t pt-3 ${isFocal ? "border-[#75851e]/40" : "border-white/15"}`}>
                    <div className={`font-mono text-[8px] font-bold uppercase tracking-[0.16em] ${isFocal ? "text-[#4d6200]" : accent.label}`}>Players / references</div>
                    <p className={`mt-1.5 text-[10px] font-medium leading-4 ${isFocal ? "text-[#263416]" : "text-[#e3eaed]"}`}>{stage.players}</p>
                  </div>
                  <div className={`mt-4 border-t pt-3 ${isFocal ? "border-[#75851e]/40" : "border-white/15"}`}>
                    <div className={`font-mono text-[8px] font-bold uppercase tracking-[0.16em] ${isFocal ? "text-[#4d6200]" : accent.label}`}>Why evidence matters here</div>
                    <p className={`mt-1.5 text-[10px] leading-4 ${isFocal ? "text-[#263416]" : "text-[#c4d0d6]"}`}>{stage.evidence}</p>
                  </div>
                  {isFocal && <div className="mt-5 flex items-center gap-2 border-t border-[#75851e]/40 pt-4 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#ba2f45]"><Droplets className="h-3.5 w-3.5" /> Power · water · land · grid · community</div>}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
        <div className="mt-7 grid gap-4 border-t border-white/10 pt-6 md:grid-cols-[1fr_1.6fr]">
          <div className="rounded-lg border border-[#ba2f45]/50 bg-[#3a1e2b] p-4">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#f5ddd5]">The pause signal</div>
            <div className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-white">$130 billion in projects paused in Q1 2026.</div>
            <p className="mt-2 text-[10px] leading-4 text-[#e5c6c7]">Capital is meeting physical constraints before it reaches the model or application layer.</p>
          </div>
        </div>
      </section>
    </div>
  );
}


