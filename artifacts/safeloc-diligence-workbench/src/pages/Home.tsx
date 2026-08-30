import {
  useEffect,
  useState
} from "react";

import {
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  Gauge,
  Info,
  Leaf,
  Network,
  TrendingDown,
  TrendingUp
} from "lucide-react";








type HomeEvidenceState = "verified" | "missing";
function HomeEvidenceVisual() {
  const [state, setState] = useState<HomeEvidenceState>("verified");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setState("verified");
      return undefined;
    }
    const timer = window.setInterval(() => setState((current) => current === "verified" ? "missing" : "verified"), 3200);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const isVerified = state === "verified";
  return (
    <div
      data-testid="home-evidence-visual"
      className="home-evidence-visual relative overflow-hidden rounded-2xl border border-white/15 bg-[#102b3b] p-4 shadow-2xl shadow-black/20 sm:p-5"
      role="img"
      aria-live="polite"
      aria-label={`Illustrative evidence-to-return example. Grid Interconnection Timeline is ${isVerified ? "Verified Evidence" : "Missing Evidence"} and the illustrative IRR is ${isVerified ? "18.4%" : "8.7%"}.`}
    >
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#31566a_1px,transparent_1px),linear-gradient(90deg,#31566a_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(135deg,black,transparent_78%)]" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#9dafb8]">
            <Gauge aria-hidden="true" className="h-3.5 w-3.5 text-[#d4e86b]" /> Evidence → IRR
          </div>
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8299a5]">Illustrative / synthetic</span>
        </div>
        <div className="grid gap-4 pt-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8299a5]">Evidence item</div>
            <div className="mt-2 text-[15px] font-semibold leading-tight text-white sm:text-[17px]">Grid Interconnection Timeline</div>
            <div data-testid="home-evidence-state" className="mt-3 min-h-7">
              <span
                data-testid={`home-evidence-${state}`}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.09em] transition-colors ${isVerified ? "border-[#6cbea4]/70 bg-[#174a4a] text-[#b7efd8]" : "border-[#e98b9b]/70 bg-[#552c3a] text-[#ffc8ce]"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isVerified ? "bg-[#7ee0bc]" : "bg-[#f28b9b]"}`} />
                {isVerified ? "Verified Evidence" : "Missing Evidence"}
              </span>
            </div>
            <div className="mt-3 text-[10px] leading-4 text-[#a9bac2]">
              {isVerified ? "Expansion timing is supported by public reporting." : "The timing assumption is not supported by facility-level evidence."}
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8299a5]">Illustrative project IRR</div>
            <div data-testid="home-irr-value" className={`mt-1 font-mono text-[42px] font-bold leading-none tracking-[-0.07em] transition-colors sm:text-[48px] ${isVerified ? "text-[#d4e86b]" : "text-[#f5ddd5]"}`}>
              <span data-testid={`home-irr-${state}`}>{isVerified ? "18.4%" : "8.7%"}</span>
            </div>
            <div className={`mt-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${isVerified ? "text-[#8fd9bc]" : "text-[#f5aab0]"}`}>
              {isVerified ? <TrendingUp aria-hidden="true" className="h-3 w-3" /> : <TrendingDown aria-hidden="true" className="h-3 w-3" />}
              {isVerified ? "Evidence-supported case" : "−9.7 pts when unverified"}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3 font-mono text-[8px] uppercase tracking-[0.1em] text-[#8299a5]">
          <span>One input changes the conclusion</span>
          <span aria-hidden="true" className="text-[#d4e86b]">{isVerified ? "→" : "←"} evidence posture</span>
        </div>
      </div>
    </div>
  );
}

const homeEntryPoints = [
  {
    id: "workbench",
    title: "The Workbench",
    subtitle: "Analyze the evidence behind the largest AI project on Earth.",
    href: "#brief",
    icon: ClipboardCheck,
    accent: "lime",
  },
  {
    id: "value-chain",
    title: "The AI Chain",
    subtitle: "See where your portfolio connects to the $725B buildout.",
    href: "#value-chain",
    icon: Network,
    accent: "blue",
  },
  {
    id: "how-it-works",
    title: "How It Works",
    subtitle: "Plain-English tour of every screen and method.",
    href: "#how-it-works",
    icon: Info,
    accent: "coral",
  },
  {
    id: "advisor",
    title: "Advisor Lens",
    subtitle: "What this means for your clients Monday morning.",
    href: "#advisor",
    icon: Leaf,
    accent: "violet",
  },
] as const;

export function Home() {
  const contextMetrics = [
    ["$725B", "Hyperscaler AI infrastructure spending in 2026 alone"],
    ["$130B", "In projects paused or blocked in Q1 2026"],
    ["474 GW", "Requested in the Texas grid queue, 5x peak demand"],
    ["1.6%", "Of requested capacity actually operating"],
  ];
  const accentClasses = {
    lime: "border-[#d4e86b]/35 bg-[#d4e86b]/[0.07] text-[#d4e86b]",
    blue: "border-[#8dc8e8]/35 bg-[#8dc8e8]/[0.07] text-[#8dc8e8]",
    coral: "border-[#f5ddd5]/35 bg-[#f5ddd5]/[0.07] text-[#f5ddd5]",
    violet: "border-[#cbb7ec]/35 bg-[#cbb7ec]/[0.07] text-[#cbb7ec]",
  };
  return (
    <div data-testid="home-page" className="home-page overflow-hidden bg-[#0a1b2a] text-[#f6f7f2]">
      <main>
        <section className="home-hero relative">
          <div className="home-hero-grid absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1240px] px-5 pb-12 pt-12 sm:px-8 md:pb-16 md:pt-16 xl:px-10">
            <div className="mb-10 flex items-center justify-between gap-4 md:mb-14">
              <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4e86b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#d4e86b]" /> SafeLoc / Evidence-Governed AI Infrastructure
              </div>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-[#8299a5] sm:block">Launch brief · 2026</span>
            </div>
            <div className="grid items-center gap-10 lg:grid-cols-[1.07fr_0.93fr] lg:gap-16">
              <div>
                <h1 data-testid="home-hero-heading" className="max-w-3xl text-[42px] font-semibold leading-[0.98] tracking-[-0.06em] sm:text-[54px] md:text-[68px] xl:text-[76px]">
                  $725 billion is being invested in AI infrastructure this year. <span className="text-[#d4e86b]">How much of it is built on verified evidence?</span>
                </h1>
                <p data-testid="home-context-sentence" className="mt-6 max-w-2xl text-[15px] leading-7 text-[#c4d0d6] md:text-[17px] md:leading-8">
                  This is the largest technology infrastructure investment in human history. It exceeds the GDP of Switzerland. It is nearly six times what was spent in 2022. And there is a decent chance your portfolio is exposed.
                </p>
                <div data-testid="home-bifurcation-framing" className="mt-5 max-w-2xl border-l-2 border-[#d4e86b]/70 pl-4">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#d4e86b]">Public context / the market split</div>
                  <p className="mt-2 text-[13px] leading-6 text-[#e0e8e2] md:text-[15px] md:leading-7">
                    The AI infrastructure market is splitting in two. Projects that solved their constraints independently are proceeding. Projects dependent on public infrastructure are stalling. The companies in your portfolio are on both sides.
                  </p>
                </div>
                <a data-testid="button-open-workbench" href="#brief" className="mt-7 inline-flex items-center gap-3 rounded-md bg-[#d4e86b] px-5 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#122232] transition-transform hover:-translate-y-0.5">
                  Open the Workbench <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <p data-testid="home-stargate-teaser" className="mt-4 max-w-xl font-mono text-[9px] uppercase leading-5 tracking-[0.1em] text-[#8299a5]">
                  Analyzing Stargate Abilene: OpenAI&apos;s $500B flagship project that hit the evidence wall
                </p>
              </div>
              <HomeEvidenceVisual />
            </div>
          </div>
        </section>

        <section data-testid="home-context-strip" aria-label="Public editorial context" className="border-y border-white/10 bg-[#0d2435]">
          <div className="mx-auto grid max-w-[1240px] grid-cols-2 divide-x divide-y divide-white/10 px-5 sm:grid-cols-4 sm:divide-y-0 sm:px-8 xl:px-10">
            {contextMetrics.map(([value, label]) => (
              <div key={value} className="min-w-0 px-4 py-5 first:pl-0 sm:px-5 sm:py-6 sm:first:pl-0 sm:last:pr-0">
                <div className="font-mono text-[25px] font-bold tracking-[-0.06em] text-[#d4e86b] md:text-[31px]">{value}</div>
                <div className="mt-1 max-w-[190px] text-[10px] leading-4 text-[#9dafb8]">{label}</div>
              </div>
            ))}
          </div>
          <p className="mx-auto max-w-[1240px] px-5 pb-4 pt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#718894] sm:px-8 xl:px-10">Editorial context from public reporting and market sources · Not facility-level Stargate facts</p>
        </section>

        <section data-testid="home-entry-points" className="mx-auto max-w-[1240px] px-5 pb-14 sm:px-8 md:pb-20 xl:px-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#8299a5]">Choose your entry point</div>
              <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-white md:text-[32px]">Start where the question lives.</h2>
            </div>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[#718894] sm:block">Four ways in</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {homeEntryPoints.map(({ id, title, subtitle, href, icon: Icon, accent }) => (
              <a key={id} data-testid={`home-entry-${id}`} href={href} className={`group flex min-h-[164px] flex-col justify-between rounded-xl border p-4 transition-transform hover:-translate-y-1 ${accentClasses[accent]}`}>
                <div className="flex items-start justify-between gap-3">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold tracking-[-0.025em] text-white">{title}</h3>
                  <p className="mt-1 text-[11px] leading-5 text-[#b6c4ca]">{subtitle}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
      <footer data-testid="home-footer" className="border-t border-white/10 bg-[#071521] px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8299a5] sm:flex-row sm:items-center">
          <span>Built by LeAndrew Gordon | SafeLoc | Growth for Impact Conference, November 2026</span>
          <span className="text-[#526f7c]">Public context · Synthetic returns</span>
        </div>
      </footer>
    </div>
  );
}

