import { useEffect } from "react";
import {
  milestones
} from "@/data/timeline";
import {
  walkthrough
} from "@/data/screenDescriptions";
import {
  evidenceTiers,
  sourceGroups
} from "@/data/sources";
import { SOURCE_FALLBACK_EXPLANATION } from "@/data/sources";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  ExternalLink,
  Gauge,
  Landmark,
  ShieldCheck,
  Target,
  Zap
} from "lucide-react";
import { ClaimCitation } from "@/components/ClaimCitation";
import { ProviderQueueSnapshot } from "@/components/ProviderQueueSnapshot";
import { useDiligence } from "@/context/DiligenceContext";


type HowItWorksProps = {
  onReturn: () => void;
  onOpenScreen: (screen: "brief" | "evidence" | "materiality" | "decision" | "advisor") => void;
  initialSection?: string | null;
};

const tourSections = [
  { id: "tour-context", number: "01", label: "Why this exists" },
  { id: "tour-workflow", number: "02", label: "The workflow" },
  { id: "tour-classification", number: "03", label: "Evidence tiers" },
  { id: "tour-sources", number: "04", label: "Sources & method" },
  { id: "tour-under-the-hood", number: "05", label: "Under the Hood" },
  { id: "tour-built-by", number: "06", label: "Who built this" },
] as const;

function TourJump({ id, children, className = "", testId = `link-tour-${id}` }: { id: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <a
      href="#how-it-works"
      data-testid={testId}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(id)?.scrollIntoView({
          behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
          block: "start",
        });
      }}
      className={className}
    >
      {children}
    </a>
  );
}

function ReturnButton({ onReturn, top = false }: { onReturn: () => void; top?: boolean }) {
  return (
    <button
      data-testid={top ? "button-return-workbench-top" : "button-return-workbench-bottom"}
      type="button"
      onClick={onReturn}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] transition-transform hover:-translate-y-0.5 ${top ? "bg-[#d4e86b] text-[#1c2a16] hover:bg-[#e3f18d]" : "border border-[#60717f] text-[#d4e86b] hover:border-[#d4e86b] hover:bg-white/10"}`}
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      Return to Analysis
    </button>
  );
}

function TourKicker({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${dark ? "text-[#9dafb8]" : "text-[#60707d]"}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#b9d43a]" />
      {children}
    </div>
  );
}

export function HowItWorks({ onReturn, onOpenScreen, initialSection }: HowItWorksProps) {
  const { ercotQueue } = useDiligence();
  useEffect(() => {
    if (!initialSection) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(initialSection);
      if (!target) return;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
        block: "start",
      });
      target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSection]);
  return (
    <div className="min-h-[100dvh] bg-[#f4f6f4] text-[#122232]">
      <a href="#tour-main" className="sr-only z-50 rounded bg-[#d4e86b] px-3 py-2 text-sm text-[#122232] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to tour content
      </a>
      <main id="tour-main" tabIndex={-1}>
        <section id="tour-context" aria-labelledby="tour-context-title" className="scroll-mt-6 bg-[#122232] px-4 pb-14 pt-12 text-white md:px-8 md:pb-20 md:pt-20">
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-10 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#9dafb8]">How it works / product tour</div>
              <ReturnButton onReturn={onReturn} top />
            </div>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)] lg:items-end">
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#b9d43a]">
                  <span>SafeLoc / Stargate Abilene</span>
                  <span aria-hidden="true" className="h-px w-8 bg-[#60717f]" />
                  <span>Analyst orientation</span>
                </div>
                <h1 id="tour-context-title" className="max-w-4xl text-balance text-[clamp(2.6rem,6vw,5.7rem)] font-semibold leading-[0.96] tracking-[-0.065em]">
                  A rating tells you what was reported. <span className="text-[#d4e86b]">Diligence tests what can be trusted.</span>
                </h1>
                <div data-testid="tour-sri-context" className="mt-7 max-w-3xl text-[15px] leading-7 text-[#d1dbe0] md:text-[17px] md:leading-8">
                  <p>Responsible investors helped capitalize the AI revolution; now its physical infrastructure is testing environmental stewardship, community impact, transparent governance, and evidence-based decision-making. With $130 billion in AI projects blocked or delayed in Q1 2026 and Texas pausing new grid connections for an energy and water audit, this tour asks whether the forward-looking assumptions behind a specific project are actually verified.</p>
                   <div className="flex flex-wrap gap-2"><ClaimCitation claimId="stargate-cancellation" dark /><ClaimCitation claimId="abbott-data-center-audit" dark /></div>
                   <div className="mt-5 max-w-2xl"><ProviderQueueSnapshot queue={ercotQueue} dark /></div>
                  <p data-testid="tour-bifurcation-context" className="mt-4">The market is bifurcating between projects that solved their constraints independently and projects still waiting on public infrastructure. This tool tests which side a specific project falls on.</p>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <TourJump id="tour-workflow" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#60717f] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f6f7f2] hover:border-[#d4e86b] hover:text-[#d4e86b]">
                    Explore the analysis sections <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </TourJump>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#9dafb8]">Q1 2026 / Texas / ERCOT</span>
                </div>
              </div>
              <aside className="border-l-2 border-[#d4e86b] pl-5 lg:mb-2">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#9dafb8]">The question underneath</div>
                <div className="mt-4 text-[27px] font-semibold leading-[1.05] tracking-[-0.04em] text-[#f5ddd5]">Can this project deliver what the model assumes?</div>
                <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#b9d43a]"><Target aria-hidden="true" className="h-4 w-4" /> Evidence before conviction</div>
              </aside>
            </div>
          </div>
        </section>

        <nav aria-label="Tour chapters" className="sticky top-0 z-20 border-b border-[#d9e0e4] bg-[#f9faf8]/95 px-4 py-3 backdrop-blur-md md:px-8">
          <div className="mx-auto flex max-w-[1240px] gap-2 overflow-x-auto pb-0.5">
            {tourSections.map((section) => (
              <TourJump
                key={section.id}
                id={section.id}
                testId={`link-tour-chapter-${section.id}`}
                className="group flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-[#52616b] hover:border-[#cbd8d4] hover:bg-white hover:text-[#122232]"
              >
                <span className="font-mono text-[#255bb7] group-hover:text-[#607500]">{section.number}</span>
                {section.label}
              </TourJump>
            ))}
          </div>
        </nav>

        <section aria-labelledby="tour-timeline-title" className="border-b border-[#d9e0e4] bg-[#eef2f1] px-4 py-12 md:px-8 md:py-16">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-5 md:grid-cols-[0.65fr_1.35fr] md:items-end">
              <div>
                <TourKicker>Context / the pressure is real</TourKicker>
                <h2 id="tour-timeline-title" className="text-[31px] font-semibold leading-[1] tracking-[-0.05em] md:text-[43px]">The infrastructure gap became the diligence case.</h2>
              </div>
              <p className="max-w-2xl text-[14px] leading-6 text-[#63717a]">The six moments below explain why a project-level view matters. Announced capacity is not delivered capacity, and a scorecard cannot tell you which assumption breaks first.</p>
            </div>
            <ol className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              {milestones.map((milestone, index) => (
                <li key={milestone.date} data-testid={`timeline-milestone-${index + 1}`} className={`relative rounded-xl border-2 p-4 ${milestone.tone}`}>
                  <div className="mb-6 flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b]">{milestone.date}</span>
                    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-[#122232] font-mono text-[9px] font-bold text-[#d4e86b]">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="font-mono text-[22px] font-bold tracking-[-0.05em] text-[#122232]">{milestone.signal}</div>
                  <h3 className="mt-2 text-[14px] font-semibold leading-5 text-[#243844]">{milestone.title}</h3>
                  <p className="mt-3 text-[11px] leading-5 text-[#52616b]">{milestone.detail}</p>
                  {milestone.claimIds.map((claimId) => <ClaimCitation key={claimId} claimId={claimId} />)}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="tour-workflow" aria-labelledby="tour-workflow-title" className="scroll-mt-20 px-4 py-14 md:px-8 md:py-20">
          <div className="mx-auto max-w-[1240px]">
            <div className="max-w-3xl">
              <TourKicker>02 / section-by-section walkthrough</TourKicker>
              <h2 id="tour-workflow-title" className="text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">One analysis surface. One evidence chain.</h2>
              <p className="mt-5 text-[15px] leading-7 text-[#63717a]">Move from context to conviction without losing the provenance of an input. Each section has a job, and each job leaves a visible trail for the next one.</p>
            </div>
            <div className="mt-10 space-y-4">
              {walkthrough.map((screen) => {
                const Icon = screen.icon;
                return (
                  <article key={screen.id} id={`tour-screen-${screen.id}`} data-testid={`tour-screen-${screen.id}`} className="scroll-mt-24 overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
                    <div className="grid lg:grid-cols-[180px_1fr_260px]">
                      <div className="flex items-start justify-between bg-[#122232] p-5 text-white lg:block lg:p-7">
                        <div>
                          <div className="font-mono text-[11px] font-bold tracking-[0.15em] text-[#d4e86b]">{screen.number}</div>
                          <h3 className="mt-4 text-[22px] font-semibold leading-tight tracking-[-0.035em]">{screen.title}</h3>
                        </div>
                        <Icon aria-hidden="true" className="h-6 w-6 text-[#b9d43a] lg:mt-16" />
                      </div>
                      <div className="p-5 md:p-7">
                        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#60707d]">What it does</div>
                        <p className="mt-2 max-w-2xl text-[16px] font-medium leading-6 text-[#243844]">{screen.purpose}</p>
                      </div>
                      <div className="m-5 mt-0 rounded-lg border border-[#d4e86b] bg-[#f8fbe8] p-4 lg:m-5 lg:mt-5">
                        <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]"><Check aria-hidden="true" className="h-3.5 w-3.5" /> What to look for</div>
                        <p className="mt-3 text-[12px] leading-5 text-[#344550]">{screen.lookFor}</p>
                        <button
                          data-testid={`button-open-tour-screen-${screen.id}`}
                          type="button"
                          onClick={() => onOpenScreen(screen.id)}
                          className="mt-4 inline-flex min-h-11 items-center gap-1 border-b border-[#607500] pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#415000] hover:text-[#122232]"
                        >
                          Open {screen.title} <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="tour-classification" aria-labelledby="tour-classification-title" className="scroll-mt-20 border-y border-[#d9e0e4] bg-[#eef2f1] px-4 py-14 md:px-8 md:py-20">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <TourKicker>03 / evidence classification system</TourKicker>
                <h2 id="tour-classification-title" className="text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">The label is part of the input.</h2>
              </div>
              <p className="max-w-2xl text-[14px] leading-6 text-[#63717a]">Every important number carries a provenance label. Color makes the pattern visible; plain language makes it reviewable. No classification is a conclusion by itself.</p>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evidenceTiers.map((tier, index) => (
                <article key={tier.name} data-testid={`tour-evidence-tier-${index + 1}`} className={`rounded-xl border-2 bg-white p-5 ${index === 0 ? "lg:col-span-2" : ""}`} style={{ borderColor: tier.border }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tier.color }} />
                      <h3 className="text-[15px] font-semibold text-[#122232]">{tier.name}</h3>
                    </div>
                    <span className="font-mono text-[10px] font-bold" style={{ color: tier.color }}>0{index + 1}</span>
                  </div>
                  <p className="mt-4 text-[13px] leading-5 text-[#52616b]">{tier.definition}</p>
                  <div className="mt-5 rounded-lg p-3" style={{ backgroundColor: tier.background }}>
                    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: tier.color }}>Everyday analogy</div>
                    <p className="mt-1 text-[12px] font-semibold leading-5 text-[#344550]">{tier.analogy}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-[#cbd8d4] bg-white p-4 text-[11px] leading-5 text-[#52616b]">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#0b7a63]" />
              <p><strong className="text-[#243844]">Use the words, not only the colors.</strong> The taxonomy is designed to survive a screenshot, a handoff, and a client conversation. A model inference can be useful without becoming a verified fact.</p>
            </div>
          </div>
        </section>

        <section id="tour-sources" aria-labelledby="tour-sources-title" className="scroll-mt-20 px-4 py-14 md:px-8 md:py-20">
          <div className="mx-auto max-w-[1240px]">
            <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <TourKicker>04 / sources and methodology</TourKicker>
                <h2 id="tour-sources-title" className="text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">Know what kind of record you are holding.</h2>
              </div>
              <p className="max-w-2xl text-[14px] leading-6 text-[#63717a]">The workbench uses public-source context to test a synthetic transaction frame. The source register below is a map of the domains behind the case—not a claim that every source proves every project-specific input.</p>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sourceGroups.map((group, index) => (
                <details key={group.title} data-testid={`tour-source-group-${index + 1}`} className={`group rounded-xl border border-[#d9e0e4] bg-white p-5 ${index === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-semibold text-[#122232] [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2"><span className="font-mono text-[10px] text-[#255bb7]">0{index + 1}</span>{group.title}</span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 text-[#52616b] transition-transform group-open:rotate-90" />
                  </summary>
                  <ul className="mt-4 space-y-2 border-t border-[#e5eae8] pt-4">
                    {group.sources.map((source) => (
                      <li key={source} className="flex items-start gap-2 text-[11px] leading-5 text-[#52616b]">
                        <ExternalLink aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 text-[#607500]" />
                        <span>{source}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
             <section data-testid="tour-data-sources" aria-labelledby="tour-data-sources-title" className="mt-8 rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
               <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4e86b]"><Gauge aria-hidden="true" className="h-4 w-4" /> Data Sources</div>
               <h3 id="tour-data-sources-title" className="mt-3 text-[24px] font-semibold tracking-[-0.035em]">Provider identity and freshness stay visible.</h3>
                <p className="mt-3 max-w-3xl text-[12px] leading-5 text-[#c4d0d6]">{SOURCE_FALLBACK_EXPLANATION} The Home directory uses Compute Atlas public facility metadata under CC BY 4.0; it is discovery context, not facility-level proof or a modeled financial input.</p>
                <div className="flex flex-wrap gap-2"><ClaimCitation claimId="ercot-market-pressure" dark /><ClaimCitation claimId="eia-texas-electricity" dark /><ClaimCitation claimId="fema-taylor-county" dark /></div>
               <div className="mt-5 grid gap-3 sm:grid-cols-2">
                 {[
                    ["ERCOTQueue.com", "Grid interconnection queue and timing context; live or cached when provider metadata is available."],
                    ["U.S. EIA Open Data", "Electricity market and price context; live or cached when provider metadata is available."],
                     ["FEMA National Risk Index v1.20", "Versioned hazard exposure profile embedded in this proof-of-concept."],
                     ["Compute Atlas directory", "Public facility metadata for discovery; live, retained-cache, or embedded snapshot state is shown in the Home directory."],
                 ].map(([name, detail]) => (
                   <div key={name} className="rounded-lg border border-white/15 bg-white/5 p-4">
                     <div className="text-[12px] font-semibold text-[#f6f7f2]">{name}</div>
                     <p className="mt-2 text-[11px] leading-5 text-[#9dafb8]">{detail}</p>
                   </div>
                 ))}
               </div>
             </section>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <aside className="rounded-xl border-2 border-[#f1cb8b] bg-[#fff8e9] p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a65a00]"><Landmark aria-hidden="true" className="h-4 w-4" /> Methodology note</div>
                <p className="mt-3 text-[13px] font-semibold leading-6 text-[#6f460e]">Transaction assumptions are synthetic. Environmental and infrastructure data are from public records.</p>
                <ClaimCitation claimId="synthetic-transaction" />
              </aside>
              <aside className="rounded-xl border border-[#cbd8d4] bg-[#eef2f1] p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#255bb7]"><Gauge aria-hidden="true" className="h-4 w-4" /> How to read the boundary</div>
                <p className="mt-3 text-[12px] leading-5 text-[#52616b]">Public records can establish context, events, and disclosures. They do not turn representative entry value, lease rate, CAPEX, or downtime cost into reported transaction terms.</p>
              </aside>
            </div>
          </div>
        </section>

         <section id="tour-under-the-hood" aria-labelledby="tour-under-the-hood-title" className="scroll-mt-20 border-y border-[#d9e0e4] bg-[#f9faf8] px-4 py-14 md:px-8 md:py-20">
           <div className="mx-auto max-w-[1240px]">
             <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
               <div>
                 <TourKicker>05 / technical architecture</TourKicker>
                 <h2 id="tour-under-the-hood-title" className="text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">What Powers This Tool</h2>
               </div>
               <p className="max-w-2xl text-[14px] leading-6 text-[#52616b]">SafeLoc is not a dashboard connected to APIs. It is a governed financial model with a domain-specific evidence methodology: deterministic math, inspectable wiring, honest source states, and a human decision at the point where judgment enters.</p>
             </div>

             <div data-testid="tour-under-the-hood-layers" className="mt-10 space-y-4">
               <article data-testid="tour-under-the-hood-layer-cash-flow" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-7">
                 <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                   <div>
                     <div className="flex items-center gap-3">
                       <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#122232] font-mono text-[11px] font-bold text-[#d4e86b]">01</span>
                       <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#607500]">Cash Flow Engine</div>
                     </div>
                     <h3 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-[#122232]">A model you can inspect, not a score you have to trust.</h3>
                     <p className="mt-4 text-[13px] leading-6 text-[#52616b]">A five-year equity cash flow model running entirely in your browser. Revenue ramp, OPEX by line item, CAPEX with contingencies, debt service, terminal value. IRR solved via Newton’s method. <strong className="text-[#122232]">Not a score. Not a penalty. Real project finance math.</strong></p>
                   </div>
                   <div data-testid="tour-under-the-hood-cash-flow-visual" className="rounded-lg border border-[#cbd8d4] bg-[#122232] p-4 text-[#e6eef0]">
                     <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em]">
                       <span className="text-[#b9d43a]">Equity cash flow / years 0—5 / Newton method IRR</span>
                       <span className="text-[#9dafb8]">deterministic</span>
                     </div>
                     <div className="grid grid-cols-6 items-end gap-2 border-b border-[#60717f] pb-3" aria-label="Illustration of equity cash flow rising from initial investment through terminal value">
                       {[
                         ["Y0", "−CAPEX", "h-8", "bg-[#f5ddd5]"],
                         ["Y1", "NOI − debt", "h-12", "bg-[#8bb7b0]"],
                         ["Y2", "NOI − debt", "h-16", "bg-[#8bb7b0]"],
                         ["Y3", "NOI − debt", "h-20", "bg-[#b9d43a]"],
                         ["Y4", "NOI − debt", "h-24", "bg-[#b9d43a]"],
                         ["Y5", "+ terminal", "h-32", "bg-[#d4e86b]"],
                       ].map(([year, label, height, tone]) => (
                         <div key={year} className="flex min-w-0 flex-col items-center gap-2 text-center">
                           <div className={`w-full rounded-t-sm ${height} ${tone}`} />
                           <span className="font-mono text-[8px] font-bold text-[#f6f7f2]">{year}</span>
                           <span className="min-h-8 text-[8px] leading-3 text-[#9dafb8]">{label}</span>
                         </div>
                       ))}
                     </div>
                     <pre className="mt-4 overflow-hidden whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-[#c4d0d6]" aria-label="Simplified Newton method IRR code"><code>rate = 0.15
repeat until NPV(rate) ≈ 0:
  rate = rate − NPV(rate) / NPV′(rate)</code></pre>
                   </div>
                 </div>
               </article>

               <article data-testid="tour-under-the-hood-layer-wiring" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-7">
                 <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                   <div>
                     <div className="flex items-center gap-3">
                       <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#122232] font-mono text-[11px] font-bold text-[#d4e86b]">02</span>
                       <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#255bb7]">Evidence-to-Model Wiring</div>
                     </div>
                       <h3 data-testid="impact-role-product-claim" className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-[#122232]">Every evidence item affects the financial stress case, decision posture, or contextual assessment.</h3>
                       <p className="mt-4 text-[13px] leading-6 text-[#52616b]">Each of the 16 evidence inputs has one audited impact role, separate from provenance. Financial Drivers recalculate the stress case, Decision Gates shape the recommendation posture, and Context Indicators preserve relevant diligence context.</p>
                   </div>
                   <div data-testid="tour-under-the-hood-wiring-visual" className="rounded-lg border border-[#cbd8d4] bg-[#eef2f1] p-4">
                     <div className="mb-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Input → linked model line item</div>
                     <ul className="space-y-2" aria-label="Examples of evidence inputs linked to financial model line items">
                       {[
                         ["Electricity cost", "Power OPEX", "rate × MWh"],
                         ["Grid delays", "Revenue timing", "months → ramp"],
                         ["Water rights", "Decision posture", "classification → gate"],
                         ["Hazard exposure", "Downtime risk", "quality → loss"],
                       ].map(([input, lineItem, formula]) => (
                         <li key={input} className="grid min-w-0 items-center gap-2 rounded-md border border-[#d9e0e4] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                           <span className="min-w-0 text-[11px] font-semibold text-[#243844]">{input}</span>
                           <ArrowRight aria-hidden="true" className="hidden h-4 w-4 text-[#607500] sm:block" />
                           <span className="min-w-0 text-[11px] text-[#52616b]"><strong className="text-[#122232]">{lineItem}</strong><span className="ml-1 font-mono text-[9px] text-[#607500]">({formula})</span></span>
                         </li>
                       ))}
                     </ul>
                       <div className="mt-3 rounded-md border border-[#9bd8c5] bg-[#e0f4ed] p-3 text-[11px] font-semibold leading-5 text-[#0b624f]"><span className="font-mono text-[9px] uppercase tracking-[0.1em]">Reclassify one input</span><span aria-hidden="true" className="mx-2">→</span>its financial, decision, or context treatment updates</div>
                   </div>
                 </div>
               </article>

               <article data-testid="tour-under-the-hood-layer-data" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-7">
                 <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                   <div>
                     <div className="flex items-center gap-3">
                       <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#122232] font-mono text-[11px] font-bold text-[#d4e86b]">03</span>
                       <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#0b7a63]">Live Data Integration</div>
                     </div>
                     <h3 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-[#122232]">Freshness is a state, not a label.</h3>
                     <p className="mt-4 text-[13px] leading-6 text-[#52616b]">ERCOT queue data from ERCOTQueue.com updates automatically. EIA electricity pricing comes from the U.S. Energy Information Administration. FEMA National Risk Index climate data is embedded at the county level. Each feed has a caching layer and graceful fallback if the source is unavailable.</p>
                   </div>
                   <div data-testid="tour-under-the-hood-data-visual" className="grid gap-2 sm:grid-cols-3">
                     {[
                       ["ERCOT queue", "Provider feed", "Live / Cached", "Bundled baseline if unavailable"],
                       ["EIA pricing", "Provider feed", "Live / Cached", "Bundled baseline if unavailable"],
                       ["FEMA NRI", "County profile", "Embedded", "Versioned v1.20 case context"],
                     ].map(([name, sourceType, status, detail]) => (
                       <div key={name} className="rounded-lg border border-[#cbd8d4] bg-[#f8fbe8] p-4">
                         <div className="text-[12px] font-semibold text-[#122232]">{name}</div>
                         <div className="mt-3 flex items-center gap-2">
                           <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#607500]" />
                           <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#607500]">{status}</span>
                         </div>
                         <div className="mt-2 text-[10px] font-semibold text-[#344550]">{sourceType}</div>
                         <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{detail}</p>
                       </div>
                     ))}
                     <p className="sm:col-span-3 rounded-md border border-[#f1cb8b] bg-[#fff8e9] p-3 text-[11px] leading-5 text-[#6f460e]"><strong>Provider state is validated.</strong> Embedded baselines are identified as embedded; a fallback value is never mislabeled as live data.</p>
                   </div>
                 </div>
               </article>

               <article data-testid="tour-under-the-hood-layer-ai" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-7">
                 <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                   <div>
                     <div className="flex items-center gap-3">
                       <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#122232] font-mono text-[11px] font-bold text-[#d4e86b]">04</span>
                       <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a65a00]">AI-Powered Evidence Analysis</div>
                     </div>
                     <h3 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-[#122232]">AI proposes. You decide.</h3>
                     <p className="mt-4 text-[13px] leading-6 text-[#52616b]">OpenAI classifies evidence quality by analyzing source documents and public records. Every AI assessment is a suggestion. The human accepts or overrides. The financial model only moves when the human acts.</p>
                   </div>
                   <ol data-testid="tour-under-the-hood-ai-visual" className="grid gap-2 sm:grid-cols-3" aria-label="AI evidence governance sequence">
                     {[
                       ["01", "OpenAI suggestion", "Proposes a provenance class and concise reasoning."],
                       ["02", "Human accepts or overrides", "An analyst reviews the suggestion before it becomes an input."],
                       ["03", "Model recalculates", "Only the human decision changes the linked financial model."],
                     ].map(([number, title, detail], index) => (
                       <li key={title} className="relative rounded-lg border border-[#cbd8d4] bg-[#eef2f1] p-4 sm:last:after:hidden">
                         <div className="font-mono text-[10px] font-bold text-[#a65a00]">{number}</div>
                         <div className="mt-3 text-[12px] font-semibold text-[#122232]">{title}</div>
                         <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{detail}</p>
                         {index < 2 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-[#f9faf8] text-[#a65a00] sm:block" />}
                       </li>
                     ))}
                   </ol>
                 </div>
               </article>

               <article data-testid="tour-under-the-hood-layer-research" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-7">
                 <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                   <div>
                     <div className="flex items-center gap-3">
                       <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#122232] font-mono text-[11px] font-bold text-[#d4e86b]">05</span>
                       <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#255bb7]">Custom Project Research</div>
                     </div>
                     <h3 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-[#122232]">A live surface with an explicit boundary.</h3>
                     <p className="mt-4 text-[13px] leading-6 text-[#52616b]">You can enter a data-center project and have SafeLoc retrieve public sources, research the same 16 evidence variables, propose classifications, and populate the financial model. The result is <strong className="text-[#122232]">retrieval-backed, high-level context—not verified project truth.</strong></p>
                   </div>
                   <div data-testid="tour-under-the-hood-research-visual" className="grid gap-3 sm:grid-cols-2">
                     <div className="rounded-lg border-2 border-[#0b7a63] bg-[#e0f4ed] p-4">
                       <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#0b624f]">Current / curated case</div>
                       <div className="mt-3 text-[15px] font-semibold text-[#122232]">Stargate Abilene</div>
                       <p className="mt-2 text-[11px] leading-5 text-[#34584f]">Hand-verified sources, explicit synthetic assumptions, and a documented evidence boundary.</p>
                     </div>
                     <div className="rounded-lg border-2 border-[#255bb7] bg-[#e5efff] p-4">
                       <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#255bb7]">Available / AI-researched</div>
                       <div className="mt-3 rounded border border-[#aac6f4] bg-white px-3 py-2 font-mono text-[10px] text-[#52616b]" aria-label="Illustration of a future project name input">project name →</div>
                       <p className="mt-2 text-[11px] leading-5 text-[#3f5577]">Public-source research would remain a proposal with transparent limitations—not verified project truth.</p>
                     </div>
                   </div>
                 </div>
               </article>
             </div>

             <aside data-testid="tour-under-the-hood-bottom-line" role="note" className="mt-6 rounded-xl border-2 border-[#122232] bg-[#122232] p-6 text-white md:p-8">
               <div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#b9d43a]">The bottom line</div>
               <p className="mt-4 max-w-4xl text-[22px] font-semibold leading-tight tracking-[-0.035em] text-[#f6f7f2] md:text-[31px]">Built by one person using Claude, Replit, and public data APIs. The APIs took hours. The financial model, evidence architecture, and domain expertise took years.</p>
             </aside>
           </div>
         </section>

        <section id="tour-built-by" aria-labelledby="tour-built-by-title" className="scroll-mt-20 border-t border-[#d9e0e4] bg-[#122232] px-4 py-14 text-white md:px-8 md:py-20">
          <div className="mx-auto grid max-w-[1240px] gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
               <TourKicker dark>06 / provenance of the work</TourKicker>
              <h2 id="tour-built-by-title" className="max-w-2xl text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">Built for the moment when a model needs a witness.</h2>
              <div data-testid="tour-builder-story" className="mt-6 max-w-2xl text-[15px] leading-7 text-[#d1dbe0]">
                <p>Built by LeAndrew Gordon, Founder and CEO of SafeLoc, a former Private Wealth Financial Advisor and Chartered SRI Counselor, for the Growth for Impact Conference. SafeLoc applies values-aligned evidence standards to the infrastructure layer so sustainability professionals can help steer the AI economy rather than watch from the sidelines.</p>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#9dafb8]">
                <span className="inline-flex items-center gap-2"><Zap aria-hidden="true" className="h-3.5 w-3.5 text-[#d4e86b]" /> SafeLoc</span>
                <span aria-hidden="true" className="h-px w-8 bg-[#60717f]" />
                <span>Evidence-governed investment intelligence</span>
              </div>
            </div>
            <div className="rounded-xl border border-[#60717f] bg-white/5 p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#b9d43a]">The handoff</div>
              <div className="mt-4 text-[23px] font-semibold leading-tight tracking-[-0.035em]">When you leave this tour, start with the evidence—not the IRR.</div>
              <div className="mt-5 flex items-center gap-2 text-[11px] leading-5 text-[#c4d0d6]"><CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[#d4e86b]" /> The workbench is a private working paper for structured review.</div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#122232] px-4 pb-8 pt-1 md:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 border-t border-[#60717f] pt-7 sm:flex-row sm:items-center sm:justify-between">
          <ReturnButton onReturn={onReturn} />
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]"><Zap aria-hidden="true" className="h-3.5 w-3.5 text-[#b9d43a]" /> SafeLoc / private working paper</div>
          <TourJump id="tour-context" className="inline-flex min-h-11 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4e86b] hover:text-white">Back to top <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 rotate-[-90deg]" /></TourJump>
        </div>
      </footer>
    </div>
  );
}
