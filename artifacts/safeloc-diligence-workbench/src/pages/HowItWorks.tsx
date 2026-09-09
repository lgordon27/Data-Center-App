import { type ReactNode, useEffect } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, ExternalLink, Gauge, Network, ShieldCheck, Target, Zap } from "lucide-react";
import { ClaimCitation } from "@/components/ClaimCitation";
import { ProviderQueueSnapshot } from "@/components/ProviderQueueSnapshot";
import { useDiligence } from "@/context/DiligenceContext";
import { evidenceTiers, sourceGroups, SOURCE_FALLBACK_EXPLANATION } from "@/data/sources";
import { milestones } from "@/data/timeline";

type AnalysisView = "market" | "reality" | "transmission" | "advisor";

type HowItWorksProps = {
  onReturn: () => void;
  onOpenScreen: (screen: AnalysisView) => void;
  initialSection?: string | null;
};

const stages: Array<{
  id: string;
  number: string;
  title: string;
  description: string;
  cta: string;
  view: AnalysisView;
}> = [
  {
    id: "market-exposure",
    number: "01",
    title: "Market Exposure",
    description: "Establish the documented relationship between a public company and the infrastructure project.",
    cta: "Open Market Exposure",
    view: "market",
  },
  {
    id: "project-reality",
    number: "02",
    title: "Project Reality",
    description: "Separate verified project facts from unresolved power, water, construction, climate and community claims.",
    cta: "Open Project Reality",
    view: "reality",
  },
  {
    id: "financial-transmission",
    number: "03",
    title: "Financial Transmission",
    description: "Trace how a physical constraint could affect project timing, costs, an issuer and ultimately a portfolio.",
    cta: "Open Financial Transmission",
    view: "transmission",
  },
  {
    id: "advisor-brief",
    number: "04",
    title: "Advisor Brief",
    description: "Convert the analysis into concise questions for a company, fund manager or client conversation.",
    cta: "Open Advisor Brief",
    view: "advisor",
  },
];

function TourKicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={`mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${dark ? "text-[#9dafb8]" : "text-[#60707d]"}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#b9d43a]" />
      {children}
    </div>
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

function Disclosure({ id, title, preview, children }: { id: string; title: string; preview: string; children: ReactNode }) {
  return (
    <details data-testid={`tour-disclosure-${id}`} className="group rounded-xl border border-[#d9e0e4] bg-white">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden md:px-6">
        <span>
          <span className="block text-[14px] font-semibold text-[#122232]">{title}</span>
          <span className="mt-1 block text-[11px] leading-5 text-[#63717a]">{preview}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#e5eae8] px-5 pb-5 pt-4 md:px-6">{children}</div>
    </details>
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

  const openStargate = () => {
    window.dispatchEvent(new CustomEvent("safeloc-return-to-curated"));
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f4] text-[#122232]">
      <a href="#tour-main" className="sr-only z-50 rounded bg-[#d4e86b] px-3 py-2 text-sm text-[#122232] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to tour content
      </a>

      <main id="tour-main" tabIndex={-1}>
        <section id="tour-context" aria-labelledby="tour-context-title" className="scroll-mt-6 bg-[#122232] px-4 pb-12 pt-10 text-white md:px-8 md:pb-16 md:pt-16">
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#9dafb8]">How it works / advisor orientation</div>
              <ReturnButton onReturn={onReturn} top />
            </div>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-end">
              <div>
                <div className="mb-5 flex flex-wrap items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#b9d43a]">
                  <span>SafeLoc / Stargate Abilene</span>
                  <span aria-hidden="true" className="h-px w-8 bg-[#60717f]" />
                  <span>Four-stage walkthrough</span>
                </div>
                <h1 id="tour-context-title" className="max-w-4xl text-balance text-[clamp(2.6rem,6vw,5.7rem)] font-semibold leading-[0.96] tracking-[-0.065em]">
                  See how an infrastructure constraint could become an <span className="text-[#d4e86b]">investment question.</span>
                </h1>
                <p data-testid="tour-sri-context" className="mt-6 max-w-3xl text-[15px] leading-7 text-[#d1dbe0] md:text-[17px] md:leading-8">
                  Start with a public company, inspect the project evidence, trace the possible financial pathway, and leave with questions an advisor or investor can use.
                </p>
                <button data-testid="button-open-stargate-demonstration" type="button" onClick={openStargate} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#d4e86b] px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-[#122232] transition-transform hover:-translate-y-0.5">
                  Open the Stargate demonstration <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
              <aside className="rounded-xl border border-white/15 bg-white/5 p-5 lg:mb-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#9dafb8]">The boundary</div>
                <p data-testid="tour-bifurcation-context" className="mt-3 text-[17px] font-semibold leading-6 text-[#f5ddd5]">A documented infrastructure relationship is a starting point for diligence, not proof of security-level or fund-level materiality.</p>
                <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#b9d43a]"><Target aria-hidden="true" className="h-4 w-4" /> Evidence before conclusion</div>
              </aside>
            </div>
          </div>
        </section>

        <section id="tour-workflow" aria-labelledby="tour-workflow-title" className="scroll-mt-6 px-4 py-10 md:px-8 md:py-14">
          <div className="mx-auto max-w-[1240px]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <TourKicker>01 / the current workbench</TourKicker>
                <h2 id="tour-workflow-title" className="text-[31px] font-semibold leading-[1] tracking-[-0.05em] md:text-[43px]">Four views. One question.</h2>
              </div>
              <p className="max-w-xl text-[13px] leading-6 text-[#63717a]">Follow the constraint from public-company exposure to a conversation an advisor can use.</p>
            </div>
            <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {stages.map((stage) => (
                <article key={stage.id} data-testid={`tour-stage-${stage.id}`} className="flex flex-col rounded-xl border border-[#d9e0e4] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] font-bold text-[#255bb7]">{stage.number}</span>
                    <Network aria-hidden="true" className="h-4 w-4 text-[#607500]" />
                  </div>
                  <h3 className="mt-5 text-[21px] font-semibold leading-tight tracking-[-0.035em]">{stage.title}</h3>
                  <p className="mt-3 flex-1 text-[12px] leading-5 text-[#52616b]">{stage.description}</p>
                  <button data-testid={`button-open-tour-stage-${stage.id}`} type="button" onClick={() => onOpenScreen(stage.view)} className="mt-6 inline-flex min-h-11 items-center justify-between gap-2 border-t border-[#e5eae8] pt-4 text-left font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#607500] hover:text-[#122232]">
                    {stage.cta} <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="tour-boundary-title" className="border-y border-[#d9e0e4] bg-[#eef2f1] px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-[1240px]">
            <div className="flex items-start gap-3 rounded-xl border border-[#cbd8d4] bg-white p-5">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#0b7a63]" />
              <div>
                <h2 id="tour-boundary-title" className="text-[14px] font-semibold text-[#122232]">Evidence stays visible and correctable.</h2>
                <p className="mt-2 max-w-4xl text-[12px] leading-5 text-[#52616b]">AI helps locate and organize public evidence. Sources, assumptions and unresolved gaps remain visible and correctable.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="tour-methodology" aria-labelledby="tour-methodology-title" className="scroll-mt-6 px-4 py-10 md:px-8 md:py-14">
          <div className="mx-auto max-w-[1240px]">
            <TourKicker>02 / details when you need them</TourKicker>
            <h2 id="tour-methodology-title" className="text-[31px] font-semibold leading-[1] tracking-[-0.05em] md:text-[43px]">Methodology, sources and context.</h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#63717a]">Open a section for the evidence taxonomy, source register, freshness state, model boundary, research process or builder background.</p>
            <div className="mt-7 space-y-3">
              <Disclosure id="classification" title="Evidence classification methodology" preview="How verified, inferred, assumed and missing information stay distinct.">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {evidenceTiers.map((tier, index) => (
                    <div key={tier.name} data-testid={`tour-evidence-tier-${index + 1}`} className="rounded-lg border-2 bg-[#f9faf8] p-4" style={{ borderColor: tier.border }}>
                      <div className="flex items-center gap-2 text-[13px] font-semibold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tier.color }} />{tier.name}</div>
                      <p className="mt-2 text-[11px] leading-5 text-[#52616b]">{tier.definition}</p>
                    </div>
                  ))}
                </div>
              </Disclosure>

              <Disclosure id="sources" title="Data-source methodology" preview="Provider identity, source roles and direct access remain available for review.">
                <p data-testid="tour-data-sources" className="text-[12px] leading-5 text-[#52616b]">{SOURCE_FALLBACK_EXPLANATION} Compute Atlas metadata is discovery context, not facility-level proof or a modeled financial input.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {sourceGroups.map((group, index) => (
                    <div key={group.title} data-testid={`tour-source-group-${index + 1}`} className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
                      <div className="text-[12px] font-semibold text-[#122232]">{group.title}</div>
                      <ul className="mt-3 space-y-2 border-t border-[#e5eae8] pt-3">
                        {group.sources.map((source) => <li key={source} className="flex items-start gap-2 text-[10px] leading-4 text-[#52616b]"><ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#607500]" />{source}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </Disclosure>

              <Disclosure id="freshness" title="Provider freshness" preview="Live, retained, embedded and unavailable states are labeled separately.">
                <ProviderQueueSnapshot queue={ercotQueue} />
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold text-[#52616b]">
                  <span className="rounded border border-[#cbd8d4] bg-[#f9faf8] px-3 py-2">Provider state is validated</span>
                  <span className="rounded border border-[#cbd8d4] bg-[#f9faf8] px-3 py-2">Fallback values stay labeled</span>
                </div>
              </Disclosure>

              <Disclosure id="financial-model" title="Financial-model methodology" preview="The financial view is a synthetic transmission frame, not reported transaction data.">
                <p className="max-w-3xl text-[12px] leading-5 text-[#52616b]">The workbench traces how timing, cost, operating and risk assumptions could transmit through a project and issuer. Entry value, lease rate, CAPEX, downtime cost and other transaction terms remain explicitly synthetic.</p>
                <ClaimCitation claimId="synthetic-transaction" />
              </Disclosure>

              <Disclosure id="ai-research" title="AI research process" preview="AI organizes public-source leads while unresolved gaps remain visible.">
                <p className="max-w-3xl text-[12px] leading-5 text-[#52616b]">Custom-project research retrieves bounded public-source context for the same evidence categories used by the workbench. Source support, project scope and unresolved gaps remain distinct from any synthetic economics.</p>
              </Disclosure>

              <Disclosure id="market-context" title="Detailed market timeline and statistics" preview="Open the dated context and source citations behind the demonstration.">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {milestones.map((milestone, index) => (
                    <article key={milestone.date} data-testid={`timeline-milestone-${index + 1}`} className={`rounded-lg border-2 p-4 ${milestone.tone}`}>
                      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b]">{milestone.date}</div>
                      <div className="mt-3 font-mono text-[20px] font-bold tracking-[-0.05em] text-[#122232]">{milestone.signal}</div>
                      <h3 className="mt-1 text-[13px] font-semibold text-[#243844]">{milestone.title}</h3>
                      <p className="mt-2 text-[11px] leading-5 text-[#52616b]">{milestone.detail}</p>
                      {milestone.claimIds.map((claimId) => <ClaimCitation key={claimId} claimId={claimId} />)}
                    </article>
                  ))}
                </div>
              </Disclosure>

              <Disclosure id="builder" title="Builder background" preview="Why SafeLoc starts with physical infrastructure evidence.">
                <p data-testid="tour-builder-story" className="max-w-3xl text-[12px] leading-5 text-[#52616b]">Built by LeAndrew Gordon, Founder and CEO of SafeLoc, a former Private Wealth Financial Advisor and Chartered SRI Counselor, for the Growth for Impact Conference. SafeLoc applies values-aligned evidence standards to the infrastructure layer so sustainability professionals can help steer the AI economy.</p>
                <div className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#607500]"><Zap aria-hidden="true" className="h-3.5 w-3.5" /> SafeLoc / evidence-governed investment intelligence</div>
              </Disclosure>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#122232] px-4 pb-8 pt-1 md:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 border-t border-[#60717f] pt-7 sm:flex-row sm:items-center sm:justify-between">
          <ReturnButton onReturn={onReturn} />
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]"><Zap aria-hidden="true" className="h-3.5 w-3.5 text-[#b9d43a]" /> SafeLoc / private working paper</div>
          <a href="#tour-context" className="inline-flex min-h-11 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4e86b] hover:text-white">Back to top <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 rotate-[-90deg]" /></a>
        </div>
      </footer>
    </div>
  );
}