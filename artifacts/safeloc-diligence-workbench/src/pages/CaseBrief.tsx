
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
import { useDiligence } from "@/context/DiligenceContext";
import { formatSourceTimestamp } from "@/data/sources";
import {
  ACTIVE_FEMA_NRI_PROFILE,
  FEMA_NRI_ATTRIBUTION,
  getTopFemaHazards,
} from "@/data/femaNRI";
export function CaseBrief({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { ercotQueue } = useDiligence();
  const topHazards = getTopFemaHazards(ACTIVE_FEMA_NRI_PROFILE);
  const queueStatus = ercotQueue.status === "live" ? "Live" : ercotQueue.status === "cached" ? "Cached" : "Embedded";
  const queueStatusClasses = ercotQueue.status === "live"
    ? "bg-[#e0f4ed] text-[#08644f]"
    : "bg-[#fff0d6] text-[#7c4c00]";
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
      <aside data-testid="brief-tier-2-callout" className="mt-5 border-l-2 border-[#255bb7] bg-[#eef2f1] px-4 py-4 md:px-5">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#255bb7]">Market context / Tier 2</div>
        <p className="mt-2 max-w-5xl text-[12px] leading-5 text-[#344550]">
          Stargate is a Tier 2 infrastructure project: grid-dependent, subject to ERCOT delays, affected by the August 2026 moratorium. Not all AI infrastructure faces these constraints. Chevron/Microsoft&apos;s Project Kilby bypassed the grid with behind-the-meter generation and is proceeding. This tool analyzes the evidence gap that separates projects that advance from projects that stall.
        </p>
      </aside>
      <section data-testid="ercot-queue-statistics" className="mt-5 rounded-xl border border-[#cbd8d4] bg-white p-5 md:p-6" aria-labelledby="ercot-queue-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5eae8] pb-4">
          <div>
            <SectionKicker>ERCOT large-load queue</SectionKicker>
            <h2 id="ercot-queue-title" className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">Public aggregate demand pressure</h2>
          </div>
          <span data-testid="ercot-queue-status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${queueStatusClasses}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ercotQueue.status === "live" ? "bg-[#0b7a63]" : "bg-[#a65a00]"}`} />
            {queueStatus}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-lg bg-[#122232] p-4 text-white">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#a9b8c0]">Total queue depth</div>
            <div data-testid="ercot-total-queue-gw" className="mt-2 break-words font-mono text-[25px] font-bold tracking-[-0.05em]">{ercotQueue.stats.totalGw.toFixed(1)} GW</div>
            <div className="mt-1 text-[10px] text-[#c4d0d6]">Large-load requests submitted</div>
          </div>
          <div className="min-w-0 rounded-lg bg-[#d4e86b] p-4 text-[#1c2a16]">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-65">Data-center share</div>
            <div data-testid="ercot-data-center-share" className="mt-2 break-words font-mono text-[25px] font-bold tracking-[-0.05em]">{ercotQueue.stats.dataCenterShare.toFixed(1)}%</div>
            <div className="mt-1 text-[10px] opacity-70">{(ercotQueue.stats.dataCenterMw / 1000).toFixed(1)} GW identified by sector</div>
          </div>
          <div className="min-w-0 rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Active data-center requests</div>
            <div data-testid="ercot-data-center-count" className="mt-2 break-words font-mono text-[20px] font-bold tracking-[-0.04em] text-[#122232]">{ercotQueue.stats.dataCenterRequestCount ?? "Not published"}</div>
            <div className="mt-1 text-[10px] leading-4 text-[#52616b]">The public aggregate does not expose a complete named customer/request count.</div>
          </div>
        </div>
        <p data-testid="ercot-source-attribution" className="mt-4 font-mono text-[9px] leading-4 text-[#52616b]">
          Source: ERCOTQueue.com, updated {formatSourceTimestamp(ercotQueue.sourceUpdatedAt ?? undefined)}. Aggregate queue activity is market context, not a named Stargate or Oracle confirmation.
        </p>
      </section>
      <section data-testid="card-fema-climate-risk" className="mt-5 rounded-xl border border-[#cbd8d4] bg-white p-5 md:p-6" aria-labelledby="fema-climate-risk-title">
        <div className="flex flex-col justify-between gap-3 border-b border-[#e5eae8] pb-4 sm:flex-row sm:items-start">
          <div>
            <SectionKicker>Public climate evidence</SectionKicker>
            <h2 id="fema-climate-risk-title" className="text-[20px] font-semibold tracking-[-0.025em] text-[#122232]">FEMA Climate Risk Profile</h2>
            <p data-testid="text-fema-county-fips" className="mt-1 font-mono text-[10px] uppercase tracking-[0.11em] text-[#52616b]">{ACTIVE_FEMA_NRI_PROFILE.county}, Texas · FIPS {ACTIVE_FEMA_NRI_PROFILE.fips}</p>
          </div>
          <span data-testid="badge-fema-attribution" className="self-start rounded-full border border-[#aac6f4] bg-[#e5efff] px-3 py-1.5 font-mono text-[9px] font-bold text-[#255bb7]">{FEMA_NRI_ATTRIBUTION}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-[#122232] p-4 text-white">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#a4b4bd]">Overall FEMA rating</div>
            <div data-testid="text-fema-overall-rating" className="mt-2 text-[18px] font-semibold text-[#d4e86b]">{ACTIVE_FEMA_NRI_PROFILE.overallRiskRating}</div>
            <div className="mt-1 font-mono text-[11px] text-[#dce4e7]">Score {ACTIVE_FEMA_NRI_PROFILE.overallRiskScore.toFixed(1)}</div>
          </div>
          <div data-testid="list-fema-top-hazards" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Top rated hazards</div>
            <ol className="mt-2 space-y-1.5">
              {topHazards.map((hazard) => <li key={hazard.key} className="flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold text-[#344550]">{hazard.label}</span><span className="font-mono text-[9px] text-[#52616b]">{hazard.rating}</span></li>)}
            </ol>
          </div>
          <div className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Social Vulnerability</div>
            <div data-testid="text-fema-social-vulnerability" className="mt-2 font-mono text-[18px] font-bold text-[#122232]">{ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityScore.toFixed(2)}</div>
            <div className="mt-1 text-[11px] font-semibold text-[#52616b]">{ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityRating}</div>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-[#60707d]">FEMA county measurements are public evidence. They do not replace SafeLoc’s separate synthetic transaction economics or CRVA/model assumptions.</p>
      </section>
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

