import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Info,
  Leaf,
  Network,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { researchProject, type CustomResearchResponse } from "@/services/researchProjectService";

const homeEntryPoints = [
  {
    id: "value-chain",
    title: "The AI Chain",
    subtitle: "Trace the $725B from chip fabs to your portfolio.",
    href: "#value-chain",
    icon: Network,
    accent: "blue",
  },
  {
    id: "how-it-works",
    title: "How It Works",
    subtitle: "Evidence methodology, sources, and the builder's story.",
    href: "#how-it-works",
    icon: Info,
    accent: "coral",
  },
  {
    id: "advisor",
    title: "Advisor Lens",
    subtitle: "What this means for client conversations Monday morning.",
    href: "#advisor",
    icon: Leaf,
    accent: "violet",
  },
] as const;

type CustomProjectFormProps = {
  onSuccess: (research: CustomResearchResponse) => void;
  compact?: boolean;
};

/**
 * The inline home form and the shell dialog intentionally use this same form.
 * Research validation, loading, errors, and the service call therefore remain
 * one shared flow while the home can make analysis the primary entry point.
 */
export function CustomProjectForm({ onSuccess, compact = false }: CustomProjectFormProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !location.trim()) {
      setError("Enter a project name and location to begin research.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await researchProject(name.trim(), location.trim());
      onSuccess(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Project research is unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = compact
    ? "mt-2 w-full rounded-md border border-white/20 bg-[#081722] px-3 py-3.5 text-[14px] text-white placeholder:text-[#718894] outline-none transition-colors focus:border-[#d4e86b] focus:ring-2 focus:ring-[#d4e86b]/30 disabled:cursor-wait disabled:opacity-60"
    : "mt-1.5 w-full rounded-md border border-[#cbd8d4] bg-white px-3 py-3 text-[13px] text-[#122232] outline-none focus:border-[#255bb7] focus:ring-2 focus:ring-[#255bb7]/20";
  const submitButton = (
    <button
      data-testid={compact ? "button-run-ai-analysis" : "button-submit-custom-project"}
      type="submit"
      disabled={busy}
      className={compact
        ? "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#d4e86b] px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-[#122232] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        : "inline-flex min-h-11 items-center gap-2 rounded-md bg-[#122232] px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#d4e86b] disabled:cursor-wait disabled:opacity-60"}
    >
      {busy ? "Researching project…" : compact ? "Run AI Analysis" : "Research project"}
      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <form
      data-testid={compact ? "home-custom-analysis" : "custom-project-form"}
      className={compact ? "space-y-3" : "mt-6 space-y-4"}
      onSubmit={(event) => void submit(event)}
      aria-describedby={compact ? "home-analysis-subtitle" : undefined}
    >
      <div className={compact ? "grid gap-3 sm:grid-cols-[1.15fr_0.72fr_auto] sm:items-end" : "space-y-4"}>
        <label className="block">
          <span className={compact ? "font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#d4e86b]" : "font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]"}>
            Project name
          </span>
          <input
            data-testid="input-custom-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            autoFocus={false}
            maxLength={160}
            aria-required="true"
            placeholder="Enter any data center project..."
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={compact ? "font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#9dafb8]" : "font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]"}>
            Location
          </span>
          <input
            data-testid="input-custom-project-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={busy}
            maxLength={160}
            aria-required="true"
            placeholder="City, county, state, or country"
            className={inputClass}
          />
        </label>
        {compact && submitButton}
      </div>
      {!compact && submitButton}
      {compact && (
        <p id="home-analysis-subtitle" className="text-[10px] leading-4 text-[#9dafb8]">
          AI researches public sources and classifies 16 evidence variables.
        </p>
      )}
      {error && (
        <div
          data-testid={compact ? "home-custom-analysis-error" : "custom-project-error"}
          role="alert"
          className={compact
            ? "rounded-md border border-[#efabb8]/60 bg-[#552c3a] px-3 py-2.5 text-[11px] leading-5 text-[#ffc8ce]"
            : "rounded-md border border-[#efabb8] bg-[#fde8eb] px-3 py-2.5 text-[11px] leading-5 text-[#7f2635]"}
        >
          {error}
        </div>
      )}
      {busy && (
        <div
          data-testid={compact ? "home-custom-analysis-loading" : "custom-project-loading"}
          role="status"
          aria-live="polite"
          className={compact
            ? "rounded-md border border-[#8dc8e8]/30 bg-[#0d2b3d] px-3 py-2.5 text-[10px] leading-4 text-[#b9e1f2]"
            : "rounded-md bg-[#eef5ff] px-3 py-2.5 text-[10px] text-[#255bb7]"}
        >
          Searching public sources and building the 16-item evidence set. This can take up to 45 seconds.
        </div>
      )}
    </form>
  );
}

export function CustomProjectDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (research: CustomResearchResponse) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      data-testid="custom-project-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#071521]/75 px-4 py-8 md:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-project-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-[#cbd8d4] bg-[#f9faf8] p-5 shadow-2xl md:p-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#607500]">New analysis / AI research</div>
            <h2 id="custom-project-title" className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#122232]">Analyze a different project</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#63717a]">SafeLoc will research a high-level public-source summary and return the same 16 modeled evidence inputs used by the workbench.</p>
          </div>
          <button data-testid="button-close-custom-project" type="button" onClick={onClose} className="rounded-md px-2 py-1 text-xl leading-none text-[#52616b] hover:bg-[#e7ecef]" aria-label="Close custom project form">×</button>
        </div>
        <CustomProjectForm onSuccess={onSuccess} />
        <p className="mt-4 border-t border-[#e5eae8] pt-4 text-[10px] leading-4 text-[#7d898f]">
          The active custom result is session-only and is not saved locally. The curated Stargate case remains available through Reset to Default.
        </p>
      </div>
    </div>
  );
}

function BifurcationCard({
  tier,
  title,
  constraints,
  example,
  evidence,
  tone,
  icon: Icon,
}: {
  tier: string;
  title: string;
  constraints: string;
  example: string;
  evidence: string;
  tone: "proceeding" | "stalling";
  icon: typeof ShieldCheck;
}) {
  const proceeding = tone === "proceeding";
  return (
    <article
      data-testid={`home-tier-${tone}`}
      className={`home-tier-card rounded-xl border p-5 md:p-6 ${proceeding ? "border-[#83d6b8]/45 bg-[#123b3b]" : "border-[#f1cb8b]/50 bg-[#3d2d24]"}`}
    >
      <div className={`flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.17em] ${proceeding ? "text-[#8fe0bf]" : "text-[#f1cb8b]"}`}>
        <Icon aria-hidden="true" className="h-4 w-4" />
        {tier}
      </div>
      <h3 className="mt-4 text-[25px] font-semibold tracking-[-0.04em] text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-5 text-[#e0e8e2]">{constraints}</p>
      <div className={`mt-6 border-t pt-4 ${proceeding ? "border-[#83d6b8]/20" : "border-[#f1cb8b]/20"}`}>
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#9dafb8]">Example</div>
        <div className="mt-1 text-[14px] font-semibold text-white">{example}</div>
        <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${proceeding ? "border-[#83d6b8]/45 bg-[#1b5950] text-[#b9f0d9]" : "border-[#f1cb8b]/45 bg-[#60452e] text-[#ffe0a9]"}`}>
          {evidence}
        </span>
      </div>
    </article>
  );
}

export function Home() {
  const { loadCustomProject } = useDiligence();
  const handleResearchSuccess = (research: CustomResearchResponse) => {
    loadCustomProject(research);
    window.location.hash = "brief";
  };
  const accentClasses = {
    blue: "border-[#8dc8e8]/35 bg-[#8dc8e8]/[0.07] text-[#8dc8e8]",
    coral: "border-[#f5ddd5]/35 bg-[#f5ddd5]/[0.07] text-[#f5ddd5]",
    violet: "border-[#cbb7ec]/35 bg-[#cbb7ec]/[0.07] text-[#cbb7ec]",
  };

  return (
    <div data-testid="home-page" className="home-page overflow-x-hidden bg-[#0a1b2a] text-[#f6f7f2]">
      <main>
        <section className="home-hero relative">
          <div className="home-hero-grid absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto max-w-[1240px] px-5 pb-12 pt-10 sm:px-8 md:pb-16 md:pt-14 xl:px-10">
            <div className="mb-10 flex items-center justify-between gap-4 md:mb-14">
              <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4e86b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#d4e86b]" /> SafeLoc / Evidence-Governed AI Infrastructure
              </div>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-[#8299a5] sm:block">Launch brief · 2026</span>
            </div>

            <div className="grid gap-10 lg:grid-cols-[1.03fr_0.97fr] lg:items-start lg:gap-16">
              <div>
                <h1 data-testid="home-hero-heading" className="max-w-3xl text-[42px] font-semibold leading-[0.98] tracking-[-0.06em] sm:text-[54px] md:text-[60px] xl:text-[64px]">
                  The AI infrastructure market is splitting in two. <span className="text-[#d4e86b]">Which side are your holdings on?</span>
                </h1>
                <div data-testid="home-supporting-lines" className="mt-6 max-w-2xl space-y-2 text-[14px] leading-6 text-[#c4d0d6] md:text-[16px]">
                  <p data-testid="home-context-sentence">$725 billion is being invested in AI infrastructure this year. $130 billion has already stalled.</p>
                  <p>Projects that solved their constraints are proceeding. Projects that didn&apos;t are stuck. The evidence determines which is which.</p>
                </div>

                <div data-testid="home-analysis-choice" className="mt-8 rounded-xl border border-white/15 bg-[#102b3b]/90 p-4 shadow-2xl shadow-black/20 sm:p-5">
                  <div className="mb-4 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#d4e86b]">
                    <Zap aria-hidden="true" className="h-3.5 w-3.5" /> Start with a project
                  </div>
                  <CustomProjectForm compact onSuccess={handleResearchSuccess} />
                  <div className="my-4 flex items-center gap-3 text-[#718894]" aria-hidden="true">
                    <span className="h-px flex-1 bg-white/15" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em]">or</span>
                    <span className="h-px flex-1 bg-white/15" />
                  </div>
                  <a data-testid="button-analyze-stargate" href="#brief" className="group flex min-h-11 w-full items-center justify-between gap-4 rounded-md border border-[#f1cb8b]/50 bg-[#f1cb8b]/[0.08] px-4 py-3 transition-colors hover:border-[#f1cb8b] hover:bg-[#f1cb8b]/[0.14]">
                    <span>
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#f1cb8b]">Analyze Stargate Abilene</span>
                      <span className="mt-1 block text-[10px] leading-4 text-[#b9c5c9]">OpenAI&apos;s $500B flagship. The curated deep dive.</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#f1cb8b] transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>

              <section data-testid="home-bifurcation" aria-labelledby="home-bifurcation-heading" className="lg:pt-8">
                <div className="mb-4">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#8299a5]">Public context / the market split</div>
                  <h2 id="home-bifurcation-heading" className="mt-2 max-w-xl text-[27px] font-semibold leading-[1.04] tracking-[-0.04em] text-white md:text-[35px]">Evidence determines who gets to build.</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <BifurcationCard
                    tier="Tier 1: Proceeding"
                    title="Built independently"
                    constraints="Behind-the-meter power. Secured water. No grid dependency."
                    example="Chevron/Microsoft Project Kilby"
                    evidence="Evidence: Mostly Verified"
                    tone="proceeding"
                    icon={ShieldCheck}
                  />
                  <BifurcationCard
                    tier="Tier 2: Stalling"
                    title="Waiting on public systems"
                    constraints="Grid-dependent. Municipal water. Public permitting."
                    example="OpenAI Stargate Abilene"
                    evidence="Evidence: Key Gaps"
                    tone="stalling"
                    icon={TriangleAlert}
                  />
                </div>
                <p data-testid="home-bifurcation-direction" className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#d4e86b]">Analyze any project to see which tier it falls in.</p>
                <p data-testid="home-bifurcation-qualifier" className="mt-3 font-mono text-[9px] uppercase leading-4 tracking-[0.08em] text-[#8299a5]">Public market context/examples — not facility-level Stargate evidence or synthetic financial inputs.</p>
              </section>
            </div>
          </div>
        </section>

        <section data-testid="home-context-strip" aria-label="Public editorial market context" className="border-y border-white/10 bg-[#0d2435]">
          <div className="mx-auto max-w-[1240px] px-5 py-5 sm:px-8 md:py-6 xl:px-10">
            <div className="mb-3 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#718894]">Public / editorial market context · not facility-level Stargate evidence</div>
            <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:gap-y-0">
              {[
                ["$725B", "spent"],
                ["$130B", "paused"],
                ["474 GW", "queued"],
                ["1.6%", "operating"],
              ].map(([value, label]) => (
                <div key={value} data-testid={`home-context-${label}`} className="border-white/10 px-4 first:pl-0 sm:border-l sm:py-1 sm:first:border-l-0 sm:first:pl-0">
                  <div className="font-mono text-[24px] font-bold tracking-[-0.06em] text-[#d4e86b] md:text-[29px]">{value}</div>
                  <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.13em] text-[#9dafb8]">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-[8px] uppercase tracking-[0.1em] text-[#718894]">The largest technology infrastructure investment in human history.</p>
          </div>
        </section>

        <section data-testid="home-trust-anchor" className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 md:py-10 xl:px-10">
          <p className="max-w-3xl border-l-2 border-[#d4e86b]/70 pl-4 text-[12px] leading-5 text-[#c4d0d6] md:text-[14px]">
            79% of Americans trust financial advisors. 3% trust AI. This tool uses AI to accelerate the analysis. You make the call.
          </p>
        </section>

        <section data-testid="home-entry-points" className="mx-auto max-w-[1240px] px-5 pb-12 sm:px-8 md:pb-16 xl:px-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#8299a5]">Explore SafeLoc</div>
              <h2 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-white md:text-[32px]">Go deeper when you&apos;re ready.</h2>
            </div>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-[#718894] sm:block">Three ways in</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {homeEntryPoints.map(({ id, title, subtitle, href, icon: Icon, accent }) => (
              <a key={id} data-testid={`home-entry-${id}`} href={href} className={`group flex min-h-[145px] flex-col justify-between rounded-xl border p-4 transition-transform hover:-translate-y-1 ${accentClasses[accent]}`}>
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

        <p data-testid="home-blend-line" className="mx-auto max-w-[1240px] px-5 pb-8 text-[11px] leading-5 text-[#8299a5] sm:px-8 xl:px-10">
          The AI infrastructure boom was partly financed by values-aligned investors. Now the evidence behind it is being tested by physical reality. This tool shows what that looks like, whether you are an infrastructure investor, a fund manager, or an advisor explaining it to a client.
        </p>
      </main>
      <footer data-testid="home-footer" className="border-t border-white/10 bg-[#071521] px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8299a5] sm:flex-row sm:items-center">
          <span>Built by LeAndrew Gordon | SafeLoc | Growth for Impact Conference, November 2026</span>
          <span className="text-[#526f7c]">Public Context · Synthetic Returns</span>
        </div>
      </footer>
    </div>
  );
}