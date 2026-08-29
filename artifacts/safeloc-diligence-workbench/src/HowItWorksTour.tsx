import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  Gauge,
  Landmark,
  Network,
  ShieldCheck,
  Target,
  Zap,
} from "lucide-react";
import type { Classification } from "@/context/DiligenceContext";

type HowItWorksTourProps = {
  onReturn: () => void;
  onOpenScreen: (screen: "brief" | "evidence" | "materiality" | "decision" | "advisor") => void;
};

const tourSections = [
  { id: "tour-context", number: "01", label: "Why this exists" },
  { id: "tour-workflow", number: "02", label: "The workflow" },
  { id: "tour-classification", number: "03", label: "Evidence tiers" },
  { id: "tour-sources", number: "04", label: "Sources & method" },
  { id: "tour-built-by", number: "05", label: "Who built this" },
] as const;

const milestones = [
  {
    date: "2025 / FULL YEAR",
    signal: "$156B",
    title: "AI projects blocked or delayed",
    detail: "Across the United States, the capital at risk made infrastructure constraints an investment question—not just a permitting footnote.",
    tone: "border-[#255bb7] bg-[#e5efff]",
  },
  {
    date: "Q1 2026",
    signal: "$130B",
    title: "Blocked or delayed in one quarter",
    detail: "The pace of disruption accelerated just as demand for AI compute was scaling, widening the gap between announced capacity and delivered capacity.",
    tone: "border-[#ba2f45] bg-[#fde8eb]",
  },
  {
    date: "MAY 2025",
    signal: "SANDERS–AOC",
    title: "Moratorium bill introduced",
    detail: "A federal proposal showed how quickly data-center growth had moved into the public-policy and community debate.",
    tone: "border-[#8a6400] bg-[#fff6c7]",
  },
  {
    date: "JULY 2026",
    signal: "142 / 42",
    title: "Protests across states",
    detail: "Reported protests in 42 states made local consent, water, power, and neighborhood impact part of the operating risk picture.",
    tone: "border-[#a65a00] bg-[#fff0d6]",
  },
  {
    date: "AUGUST 3, 2026",
    signal: "ABBOTT",
    title: "Texas orders a moratorium",
    detail: "Governor Greg Abbott ordered a moratorium on new data-center grid connections until ERCOT completes an energy and water-use audit.",
    tone: "border-[#ba2f45] bg-[#fde8eb]",
  },
  {
    date: "ERCOT / 2026",
    signal: "474 GW",
    title: "Interconnection queue",
    detail: "The request queue is more than five times Texas record peak demand, with 90% of requests attributed to data centers.",
    tone: "border-[#0b7a63] bg-[#e0f4ed]",
  },
] as const;

const walkthrough = [
  {
    id: "brief",
    number: "01",
    title: "Case Brief",
    icon: BookOpen,
    purpose: "Sets the scene: what the project is, where it sits, and which operating facts matter before anyone looks at a return.",
    why: "A good investment decision starts with a shared frame. The Case Brief separates the public operating story from the synthetic transaction frame, so a compelling headline cannot quietly stand in for a verified fact.",
    lookFor: "Look for the governing question, the location context, and the explicit SYNTHETIC label on modeled acquisition economics.",
  },
  {
    id: "evidence",
    number: "02",
    title: "Evidence Room",
    icon: FileCheck2,
    purpose: "Shows each important input, its source, and how strong the evidence is right now.",
    why: "This is where uncertainty becomes visible instead of disappearing into a spreadsheet. Reclassifying an input changes the downstream confidence and return, making the cost of an unsupported belief easy to see.",
    lookFor: "Look for the citation beside every input, the five provenance labels, and missing items such as facility water use or water rights.",
  },
  {
    id: "materiality",
    number: "03",
    title: "Financial Materiality",
    icon: BarChart3,
    purpose: "Traces evidence quality into revenue timing, costs, cash flow, and the project return.",
    why: "Not every unknown deserves the same amount of research. This screen shows which uncertainty can move IRR, payback, or terminal value, so diligence effort follows financial consequence rather than volume of information.",
    lookFor: "Look for the verified baseline beside the current case, the evidence-to-return bridge, and the mechanical-outputs warning when confidence is low.",
  },
  {
    id: "decision",
    number: "04",
    title: "Decision Review",
    icon: ClipboardCheck,
    purpose: "Turns the evidence and model into a decision posture: what is investable, what is gated, and what still needs proof.",
    why: "An attractive model is not the same as an investable opportunity. Decision Review puts recommendation status, material gaps, and underwriting gates next to each other so the investment committee can act on what is known and what is not.",
    lookFor: "Look for the recommendation status, the material evidence gaps, and the explicit next gates before a commitment can move forward.",
  },
  {
    id: "advisor",
    number: "05",
    title: "Advisor Lens",
    icon: Network,
    purpose: "Translates the case into questions and implications an advisor can carry into a client conversation.",
    why: "A diligence file has to travel beyond the analyst who built it. Advisor Lens preserves the distinction between fact, inference, and assumption while surfacing the questions most likely to change a recommendation.",
    lookFor: "Look for the prioritized questions, the sustainability and portfolio context, and the visible warning when an answer is still an evidence gap.",
  },
] as const;

const evidenceTiers: Array<{
  name: Classification;
  color: string;
  background: string;
  border: string;
  definition: string;
  analogy: string;
}> = [
  {
    name: "Verified Evidence",
    color: "#0b7a63",
    background: "#e0f4ed",
    border: "#9bd8c5",
    definition: "A public record or dependable source directly supports the input.",
    analogy: "Like a bank statement, not someone's word.",
  },
  {
    name: "Management Assertion",
    color: "#8a6400",
    background: "#fff6c7",
    border: "#e6cf70",
    definition: "The project or its representatives say it is true, but independent proof is limited.",
    analogy: "Like a resume, not a background check.",
  },
  {
    name: "Model Inference",
    color: "#255bb7",
    background: "#e5efff",
    border: "#aac6f4",
    definition: "The tool derives a reasonable estimate from related public facts.",
    analogy: "Like estimating tomorrow's weather from today's barometric pressure.",
  },
  {
    name: "User Assumption",
    color: "#a65a00",
    background: "#fff0d6",
    border: "#f1cb8b",
    definition: "An analyst-selected value is used because the project-specific fact is not established.",
    analogy: "Like a doctor's estimate before running tests.",
  },
  {
    name: "Missing Evidence",
    color: "#ba2f45",
    background: "#fde8eb",
    border: "#efabb8",
    definition: "The information needed to support an input has not been found or disclosed.",
    analogy: "Like a blank on a loan application.",
  },
];

const sourceGroups = [
  {
    title: "Infrastructure & Energy",
    sources: ["ERCOT", "Utility filings", "Bloomberg", "U.S. Energy Information Administration (EIA)"],
  },
  {
    title: "Water & Climate",
    sources: ["Ceres", "FEMA National Risk Index", "NOAA climate records", "Texas Water Development Board"],
  },
  {
    title: "Community & Social",
    sources: ["U.S. Census Bureau", "NAACP", "Data Center Watch"],
  },
  {
    title: "Regulatory",
    sources: ["EU AI Act", "FINRA", "Governor Abbott directive"],
  },
  {
    title: "Market & Investment",
    sources: ["Formative / FactSet", "Morningstar", "MSCI", "Gallup / Edward Jones"],
  },
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
      Return to Workbench
    </button>
  );
}

function TourKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#60707d]">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#b9d43a]" />
      {children}
    </div>
  );
}

export function HowItWorksTour({ onReturn, onOpenScreen }: HowItWorksTourProps) {
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
                <div data-testid="tour-sri-context" className="mt-7 max-w-3xl space-y-5 text-[15px] leading-7 text-[#d1dbe0] md:text-[17px] md:leading-8">
                  <p>
                    Responsible investors helped capitalize the AI revolution. Sustainability screening selected for well-governed, capital-efficient companies and concentrated capital in the stocks best positioned to lead the next technology wave. That thesis worked.
                  </p>
                  <p>
                    Now the infrastructure that revolution requires is testing every principle those investors hold: environmental stewardship, community impact, transparent governance, and evidence-based decision-making. $130 billion in AI data center projects were blocked or delayed in Q1 2026 alone. On August 3, 2026, Texas Governor Greg Abbott ordered a moratorium on all new data center grid connections until ERCOT audits energy and water usage across roughly 300 proposed facilities.
                  </p>
                  <p>
                    The sustainability community helped birth the AI economy. That creates a responsibility to understand the technology well enough to steer it. This tool was built by a sustainability professional who did exactly that: learned to build with AI, applied values-aligned evidence standards to the infrastructure layer, and created something the market does not have.
                  </p>
                  <p>
                    In Q1 2026, $130 billion worth of AI data center projects were blocked or delayed across the United States. On August 3, 2026, Texas Governor Greg Abbott ordered a moratorium on all new data center grid connections until ERCOT completes a comprehensive audit of energy and water usage. The ERCOT interconnection queue holds 474 GW of requests, more than five times Texas record peak demand, with 90% from data centers. Traditional sustainability scorecards grade companies on what they reported last year. This tool tests whether the forward-looking assumptions behind a specific project are actually verified. That is the difference between a rating and diligence.
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <TourJump id="tour-workflow" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#60717f] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f6f7f2] hover:border-[#d4e86b] hover:text-[#d4e86b]">
                    Explore the five screens <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
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
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="tour-workflow" aria-labelledby="tour-workflow-title" className="scroll-mt-20 px-4 py-14 md:px-8 md:py-20">
          <div className="mx-auto max-w-[1240px]">
            <div className="max-w-3xl">
              <TourKicker>02 / screen-by-screen walkthrough</TourKicker>
              <h2 id="tour-workflow-title" className="text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">Five screens. One evidence chain.</h2>
              <p className="mt-5 text-[15px] leading-7 text-[#63717a]">Move from context to conviction without losing the provenance of an input. Each screen has a job, and each job leaves a visible trail for the next one.</p>
            </div>
            <div className="mt-10 space-y-4">
              {walkthrough.map((screen, index) => {
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
                        <div className="mt-6 flex gap-3 border-t border-[#e5eae8] pt-5">
                          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" />
                          <div>
                            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#255bb7]">Why it matters</div>
                            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#52616b]">{screen.why}</p>
                          </div>
                        </div>
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
                <details key={group.title} open data-testid={`tour-source-group-${index + 1}`} className={`group rounded-xl border border-[#d9e0e4] bg-white p-5 ${index === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}>
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
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <aside className="rounded-xl border-2 border-[#f1cb8b] bg-[#fff8e9] p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a65a00]"><Landmark aria-hidden="true" className="h-4 w-4" /> Methodology note</div>
                <p className="mt-3 text-[13px] font-semibold leading-6 text-[#6f460e]">Transaction assumptions are synthetic. Environmental and infrastructure data are from public records.</p>
              </aside>
              <aside className="rounded-xl border border-[#cbd8d4] bg-[#eef2f1] p-5">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#255bb7]"><Gauge aria-hidden="true" className="h-4 w-4" /> How to read the boundary</div>
                <p className="mt-3 text-[12px] leading-5 text-[#52616b]">Public records can establish context, events, and disclosures. They do not turn representative entry value, lease rate, CAPEX, or downtime cost into reported transaction terms.</p>
              </aside>
            </div>
          </div>
        </section>

        <section id="tour-built-by" aria-labelledby="tour-built-by-title" className="scroll-mt-20 border-t border-[#d9e0e4] bg-[#122232] px-4 py-14 text-white md:px-8 md:py-20">
          <div className="mx-auto grid max-w-[1240px] gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <TourKicker>05 / provenance of the work</TourKicker>
              <h2 id="tour-built-by-title" className="max-w-2xl text-[35px] font-semibold leading-[0.98] tracking-[-0.055em] md:text-[52px]">Built for the moment when a model needs a witness.</h2>
              <div data-testid="tour-builder-story" className="mt-6 max-w-2xl space-y-5 text-[15px] leading-7 text-[#d1dbe0]">
                <p>Built by LeAndrew Gordon, Founder and CEO of SafeLoc. Former Private Wealth Financial Advisor. Chartered SRI Counselor. Top 25 AI Builder (Replit, top 1% of users). Built for the Growth for Impact Conference, November 2026, Phoenix, AZ.</p>
                <p>Sustainability professionals helped build the AI economy. This tool exists because that responsibility does not end at the screening level. It extends to the infrastructure layer, where the assumptions behind AI&apos;s growth are being tested by physical reality every day. Understanding AI well enough to build with it, and applying values-aligned evidence standards to what you build, is how the sustainability community steers this technology toward a better future rather than watching from the sidelines.</p>
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