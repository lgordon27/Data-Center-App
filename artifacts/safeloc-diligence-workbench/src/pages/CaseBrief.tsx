
import {
  SectionKicker,
  Disclosure,
  PageIntro,
  BottomNav
} from "@/components/Shell";

import {
  ArrowRight,
  MapPin,
  Target,
  Zap
} from "lucide-react";







import type {
  Screen
} from "@/components/Shell";
export function CaseBrief({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <div>
      <PageIntro
        eyebrow="01 / frame the opportunity"
        title="The return is only as durable as the evidence behind it."
        description="A public-source diligence case for Stargate Abilene, paired with clearly labeled synthetic acquisition economics. The operating facts are real-world evidence; the returns are a representative underwriting lens, not reported transaction terms."
        right={<div className="flex items-center gap-2 self-start rounded-full border border-[#cbd8d4] bg-[#f9faf8] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#60707d] md:self-auto"><span className="h-2 w-2 rounded-full bg-[#ba2f45]" /> Location · Taylor County, TX</div>}
      />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="relative min-h-[360px] overflow-hidden rounded-xl bg-[#122232] p-6 text-white md:p-8">
          <div className="absolute right-0 top-0 h-full w-1/2 opacity-40 [background-image:linear-gradient(#345063_1px,transparent_1px),linear-gradient(90deg,#345063_1px,transparent_1px)] [background-size:30px_30px] [mask-image:linear-gradient(90deg,transparent,black)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#b9d43a]">Case brief / STARGATE-ABI-26</div>
                <h2 className="mt-5 max-w-lg text-[30px] font-semibold leading-[1.06] tracking-[-0.04em] md:text-[39px]">Stargate<br /><span className="text-[#b9d43a]">Abilene</span></h2>
                <p className="mt-4 max-w-xl text-[11px] leading-5 text-[#c4d0d6]">OpenAI · Oracle · Crusoe Energy<br />Part of the $500 billion Stargate initiative backed by OpenAI, SoftBank, Oracle, and MGX.</p>
              </div>
              <div className="hidden rounded-md border border-white/15 px-3 py-2 text-right sm:block">
                <div className="text-[9px] uppercase tracking-[0.14em] text-[#a0b0b8]">Stage</div>
                <div className="mt-1 font-mono text-[12px] text-[#f5ddd5]">IC PRE-READ</div>
              </div>
            </div>
            <div className="grid max-w-xl grid-cols-2 gap-x-8 gap-y-5 border-t border-white/15 pt-5 sm:grid-cols-4">
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Current / target</div><div className="mt-1 font-mono text-base">0.3 / 1.2 GW</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Site</div><div className="mt-1 font-mono text-base">~1,000 acres</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Built form</div><div className="mt-1 font-mono text-base">8 buildings</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Floor area</div><div className="mt-1 font-mono text-base">~4M sq ft</div></div>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#f9faf8] p-6">
          <SectionKicker>Investment thesis</SectionKicker>
          <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">Contracted AI demand meets physical infrastructure limits.</h3>
          <p className="mt-4 text-[12px] leading-5 text-[#63717a]">Public reporting ties the campus to more than 450,000 NVIDIA GB200 GPUs under a reported 15-year Oracle lease. The core tension is no longer hypothetical: an expansion was cancelled after grid delays, while winter storms exposed cooling-system fragility.</p>
          <div className="mt-6 space-y-3 border-t border-[#d9e0e4] pt-5">
            {[
              ["Catalyst", "Oracle-backed contracted GPU capacity supports a long-duration demand case."],
              ["Tension", "The original 2.1 GW expansion was cancelled after grid delays exceeded one year."],
              ["Adjacent", "Microsoft partnered with Crusoe on a separately reported 900 MW site after OpenAI capped its expansion."],
              ["Underwrite", "Water use and water rights remain undisclosed despite the campus scale."],
            ].map(([key, value]) => (
              <div key={key} className="grid grid-cols-[76px_1fr] gap-3 text-[11px]"><span className="font-mono uppercase tracking-[0.1em] text-[#52616b]">{key}</span><span className="font-medium leading-4 text-[#344550]">{value}</span></div>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Disclosure title="Public-site context · Taylor County buildout" testId="disclosure-public-site-context">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded bg-[#f5ddd5] p-2 text-[#ba2f45]"><MapPin className="h-4 w-4" /></div>
            <div><p className="text-[11px] leading-5 text-[#6b7882]">The campus sits outside Abilene. Public reporting describes two buildings and roughly 0.3 GW operational since September 2025, with the eight-building core targeting approximately 1.2 GW.</p><div data-testid="text-climate-methodology" className="mt-3 border-t border-[#e5eae8] pt-2 font-mono text-[9px] leading-4 text-[#52616b]">Climate risk methodology: ISO 14091 CRVA framework</div></div>
          </div>
        </Disclosure>
        <Disclosure title="Transmission corridor · power mix" testId="disclosure-transmission-corridor">
          <div className="flex items-center gap-2.5 text-[#122232]">
            <Zap className="h-4 w-4 text-[#a65a00]" /><span className="font-mono text-sm font-bold">On-site gas + ERCOT grid</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#6b7882]">The power mix combines on-site natural-gas generation with ERCOT supply, including locally referenced wind. The delivered renewable percentage is not publicly verified.</p>
        </Disclosure>
        <div className="rounded-xl bg-[#d4e86b] p-5 text-[#1c2a16]">
          <div className="flex items-center justify-between"><SectionKicker tone="lime">The governing question</SectionKicker><Target className="h-5 w-5 opacity-60" /></div>
          <div className="mt-1 text-[19px] font-semibold leading-tight tracking-[-0.025em]">What does a cancelled expansion reveal about the value of verified grid evidence?</div>
          <button data-testid="button-open-evidence-from-brief" onClick={() => onNavigate("evidence")} className="mt-5 inline-flex items-center gap-2 border-b border-[#1c2a16] pb-1 text-[10px] font-bold uppercase tracking-[0.15em]">Open evidence room <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <section className="mt-5 rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-4" aria-labelledby="brief-risk-strip-title">
        <div className="flex items-center justify-between gap-3">
          <SectionKicker className="mb-0">Risk strip</SectionKicker>
          <span id="brief-risk-strip-title" className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7d898f]">Public operating signals</span>
        </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Water disclosure", "Missing", "Facility water use and water rights not publicly disclosed as of Aug 2026", "#ba2f45"],
          ["Grid expansion", "Cancelled", "Reported interconnection delays exceeded 12 months", "#a65a00"],
          ["Cooling resilience", "Tested", "Winter 2026 storms damaged liquid-cooling equipment", "#255bb7"],
          ["Construction peak", "~6,400", "Housing, childcare, and road strain documented locally", "#7049b7"],
        ].map(([label, value, detail, color]) => (
          <div key={label} className="rounded-lg border border-[#d9e0e4] bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">{label}</span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            </div>
            <div className="mt-2 flex items-baseline gap-2"><span className="font-mono text-base font-bold text-[#122232]">{value}</span><span className="text-[10px] font-medium text-[#52616b]">{detail}</span></div>
          </div>
        ))}
      </div>
      </section>
      <div className="mt-5 rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
        <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4">
          <div>
            <SectionKicker tone="warning">Synthetic transaction assumptions</SectionKicker>
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">The financial frame is explicit by design.</h2>
          </div>
          <span className="rounded bg-[#fff0d6] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#a65a00]">SYNTHETIC</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Acquisition price", "$4.8B", "Representative entry enterprise value"],
            ["Debt structure", "60% LTV", "7.5% interest · 10-year term"],
            ["Lease economics", "$185/kW-mo", "Representative modeled revenue rate"],
            ["Cooling CAPEX", "$450M", "Synthetic 1.2 GW analyst estimate"],
          ].map(([label, value, detail]) => (
            <div key={label} className="border-l-2 border-[#d4e86b] pl-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">{label}</div>
              <div className="mt-1 font-mono text-[15px] font-bold text-[#122232]">{value}</div>
              <div className="mt-1 text-[10px] text-[#52616b]">{detail}</div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav screen="brief" onNavigate={onNavigate} />
    </div>
  );
}

