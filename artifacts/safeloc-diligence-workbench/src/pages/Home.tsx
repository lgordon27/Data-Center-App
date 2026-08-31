import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  ExternalLink,
  Info,
  Leaf,
  Loader2,
  MapPin,
  Network,
  Search,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { researchProject, type CustomResearchResponse } from "@/services/researchProjectService";
import {
  directoryFreshness,
  fetchDirectory,
  fetchDirectoryStats,
  type DirectoryFacility,
  type DirectoryResponse,
  type DirectoryStatsResponse,
} from "@/services/directoryService";
import {
  COMPANY_PROFILES,
  companyProjects,
  profileForCompany,
  projectSummary,
  type CompanyKey,
  type CompanyProject,
} from "@/data/companyExposure";

type HomeRoute = "advisor" | "directory" | "how-it-works" | "value-chain";

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

const DIRECTORY_STATES = ["All", "TX", "AZ", "VA", "GA", "OH", "Other"] as const;
const DIRECTORY_COMPANIES = ["NVIDIA", "Microsoft", "Meta", "Google", "Amazon", "Oracle"] as const;
const DIRECTORY_PAGE_SIZE = 24;
const ETF_CONTEXT: Record<string, string[]> = {
  NVIDIA: ["QQQ", "SMH"],
  Microsoft: ["QQQ", "XLK"],
  Meta: ["QQQ", "XLC"],
  Google: ["QQQ", "XLK"],
  Amazon: ["QQQ", "XLY"],
  Oracle: ["QQQ", "XLK"],
};

const companyAccentClasses = {
  lime: "border-[#c9db70]/45 bg-[#eef5cd] text-[#314207]",
  blue: "border-[#aac6f4]/55 bg-[#e5efff] text-[#173f85]",
  coral: "border-[#efabb8]/55 bg-[#fde8eb] text-[#7f2635]",
  violet: "border-[#cbb7ec]/55 bg-[#eee7fa] text-[#482873]",
  sky: "border-[#8dc8e8]/55 bg-[#e5f5fb] text-[#164c67]",
  gold: "border-[#f1cb8b]/65 bg-[#fff3d8] text-[#704508]",
} as const;

function formatCapacityGW(capacityMW: number) {
  return `${(capacityMW / 1000).toFixed(capacityMW >= 1000 ? 1 : 2)} GW`;
}

function CompanyCard({ company, onSelect }: { company: typeof COMPANY_PROFILES[number]; onSelect: () => void }) {
  return (
    <button
      data-testid={`company-card-${company.key.toLowerCase()}`}
      type="button"
      onClick={onSelect}
      className="group min-w-0 rounded-xl border border-white/15 bg-[#102b3b] p-4 text-left transition-transform hover:-translate-y-1 hover:border-[#d4e86b]/70 focus:outline-none focus:ring-2 focus:ring-[#d4e86b] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md border font-mono text-[11px] font-bold ${companyAccentClasses[company.accent]}`}>
          {company.ticker}
        </div>
        <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[#718894] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <div className="mt-6">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#d4e86b]">Public company</div>
        <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.03em] text-white">{company.displayName}</h3>
        <p className="mt-3 text-[11px] font-semibold leading-4 text-[#f6f7f2]">{company.headline}</p>
        <p className="mt-2 min-h-[32px] text-[10px] leading-4 text-[#9dafb8]">{company.detail}</p>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#b9e1f2]">
        <span>View infrastructure exposure</span>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-[#d4e86b]" />
      </div>
    </button>
  );
}

function CompanyProjectCard({
  project,
  onSelect,
  researching,
}: {
  project: CompanyProject;
  onSelect: () => void;
  researching: boolean;
}) {
  const isTierOne = project.tier === 1;
  return (
    <article data-testid={`company-project-${project.id}`} className="rounded-lg border border-[#d9e0e4] bg-white p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#122232]">{project.name}</h3>
            <span data-testid={`company-project-tier-${project.id}`} className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${isTierOne ? "border-[#9bd8c5] bg-[#e0f4ed] text-[#0b624f]" : "border-[#e6cf70] bg-[#fff6c7] text-[#8a6400]"}`}>
              {project.tierLabel}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[#63717a]">{project.operator}</p>
        </div>
        <button
          data-testid={`company-project-open-${project.id}`}
          type="button"
          onClick={onSelect}
          disabled={researching}
          aria-busy={researching}
          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-md px-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] disabled:cursor-wait disabled:opacity-60 ${project.kind === "curated" ? "bg-[#122232] text-[#d4e86b] hover:bg-[#203a4c]" : "border border-[#255bb7] text-[#255bb7] hover:bg-[#e5efff]"}`}
        >
          {researching ? "Researching…" : project.kind === "curated" ? "Open curated deep dive" : "Research with AI"}
          <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-4 grid gap-3 border-y border-[#e5eae8] py-3 sm:grid-cols-3">
        <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Location</div><div className="mt-1 text-[11px] font-semibold text-[#344550]">{project.location}</div></div>
        <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Capacity</div><div className="mt-1 font-mono text-[11px] font-bold text-[#122232]">{project.capacityMW === null ? "Undisclosed" : `${project.capacityMW.toLocaleString()} MW`}</div></div>
        <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Status</div><div className="mt-1 text-[11px] font-semibold text-[#344550]">{project.status}</div></div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[#52616b]">{project.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#71808a]">
        <span>{project.kind === "curated" ? "Reviewed case context" : "Compute Atlas discovery metadata"}</span>
        <span aria-hidden="true">·</span>
        <span>Not ownership proof or a modeled input</span>
      </div>
    </article>
  );
}

function CompanyExposure({
  company,
  facilities,
  loading,
  error,
  researchError,
  researchingProjectId,
  onBack,
  onCurated,
  onResearch,
}: {
  company: CompanyKey;
  facilities: DirectoryFacility[];
  loading: boolean;
  error: string | null;
  researchError: string | null;
  researchingProjectId: string | null;
  onBack: () => void;
  onCurated: (company: CompanyKey) => void;
  onResearch: (project: CompanyProject, company: CompanyKey) => void;
}) {
  const profile = profileForCompany(company);
  const projects = companyProjects(company, facilities);
  const summary = projectSummary(projects);
  return (
    <section data-testid="company-exposure-view" aria-labelledby="company-exposure-heading" className="border-y border-[#d9e0e4] bg-[#f1f5f3] px-5 py-9 text-[#122232] sm:px-8 md:py-12 xl:px-10">
      <div className="mx-auto max-w-[1240px]">
        <button data-testid="button-company-back" type="button" onClick={onBack} className="mb-6 inline-flex min-h-10 items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b] hover:text-[#122232]">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back to companies
        </button>
        <div className="flex flex-col justify-between gap-5 border-b border-[#cbd8d4] pb-6 md:flex-row md:items-end">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#607500]">Holdings / infrastructure exposure</div>
            <h2 id="company-exposure-heading" className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.05em] md:text-[46px]">{profile.displayName} AI Infrastructure Exposure</h2>
            <p className="mt-3 max-w-2xl text-[12px] leading-5 text-[#52616b]">{profile.headline}. The projects below show public market-context connections and discovery metadata—not proof that {profile.displayName} owns or controls a facility.</p>
          </div>
          <div data-testid="company-fund-context" className="max-w-xs rounded-lg border border-[#cbb7ec] bg-[#eee7fa] p-4 text-[10px] leading-4 text-[#482873]">
            <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em]">Held in:</div>
            <div className="mt-2 font-semibold">{profile.funds.join(", ")}</div>
            <div className="mt-2 border-t border-[#cbb7ec]/60 pt-2 font-mono text-[8px] uppercase tracking-[0.08em]">Mapped context: {profile.marketFunds.join(", ")}</div>
          </div>
        </div>
        {loading && <div data-testid="company-exposure-loading" role="status" className="mt-6 rounded-lg border border-[#aac6f4] bg-[#e5efff] px-4 py-3 text-[11px] text-[#255bb7]">Loading connected public directory records…</div>}
        {error && <div data-testid="company-exposure-error" role="alert" className="mt-6 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-4 py-3 text-[11px] leading-5 text-[#704508]">The directory could not be reached. Reviewed company context remains available; discovery records may be incomplete.</div>}
        {researchError && <div data-testid="company-research-error" role="alert" className="mt-6 rounded-lg border border-[#efabb8] bg-[#fde8eb] px-4 py-3 text-[11px] leading-5 text-[#7f2635]">{researchError}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div data-testid="company-summary-project-count" className="rounded-lg bg-[#122232] p-4 text-white"><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#a4b4bd]">Connected projects</div><div className="mt-2 font-mono text-[25px] font-bold text-[#d4e86b]">{summary.count}</div></div>
          <div data-testid="company-summary-capacity" className="rounded-lg bg-[#d4e86b] p-4 text-[#1c2a16]"><div className="font-mono text-[8px] uppercase tracking-[0.12em] opacity-65">Disclosed capacity</div><div className="mt-2 font-mono text-[25px] font-bold">{formatCapacityGW(summary.capacityMW)}</div></div>
          <div data-testid="company-summary-tier1" className="rounded-lg border border-[#9bd8c5] bg-[#e0f4ed] p-4 text-[#0b624f]"><div className="font-mono text-[8px] uppercase tracking-[0.12em]">Tier 1 / proceeding</div><div className="mt-2 font-mono text-[25px] font-bold">{summary.tier1}</div></div>
          <div data-testid="company-summary-tier2" className="rounded-lg border border-[#e6cf70] bg-[#fff6c7] p-4 text-[#8a6400]"><div className="font-mono text-[8px] uppercase tracking-[0.12em]">Tier 2 / review</div><div className="mt-2 font-mono text-[25px] font-bold">{summary.tier2}</div></div>
        </div>
        <p data-testid="company-summary-sentence" className="mt-4 text-[11px] leading-5 text-[#52616b]">
          {profile.displayName} is connected to <strong>{summary.count} projects</strong> totaling <strong>{formatCapacityGW(summary.capacityMW)}</strong> in disclosed capacity. <strong>{summary.tier1}</strong> are Tier 1 (proceeding) and <strong>{summary.tier2}</strong> are Tier 2 (at risk of delay or requiring review). {summary.undisclosedCapacity > 0 ? `${summary.undisclosedCapacity} project has undisclosed capacity.` : ""}
        </p>
        <div className="mt-6 flex items-end justify-between gap-3">
          <div><div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#607500]">Connected project trail</div><h3 className="mt-1 text-[20px] font-semibold tracking-[-0.03em]">Pick one to inspect the evidence path.</h3></div>
          <span className="hidden font-mono text-[8px] uppercase tracking-[0.1em] text-[#71808a] sm:block">Public context only</span>
        </div>
        <div data-testid="company-project-list" className="mt-4 space-y-3">
          {projects.length === 0 && <div data-testid="company-project-empty" className="rounded-lg border border-dashed border-[#cbd8d4] bg-white p-6 text-[12px] text-[#52616b]">No operator-mapped facilities are available for this company in the current directory snapshot. That is an evidence boundary, not a claim of no exposure.</div>}
          {projects.map((project) => <CompanyProjectCard key={project.id} project={project} researching={researchingProjectId === project.id} onSelect={() => project.kind === "curated" ? onCurated(company) : onResearch(project, company)} />)}
        </div>
      </div>
    </section>
  );
}

function statusLabel(status: DirectoryFacility["status"]) {
  return { operating: "Operating", construction: "Construction", planned: "Planned", delayed: "Delayed", cancelled: "Cancelled", unknown: "Unknown" }[status];
}

function capacityLabel(capacity: number | null) {
  if (capacity === null) return "Undisclosed";
  return `${capacity.toLocaleString("en-US", { maximumFractionDigits: 1 })} MW`;
}

function locationLabel(facility: DirectoryFacility) {
  return [facility.city, facility.county ? `${facility.county} County` : "", facility.state].filter(Boolean).join(" · ");
}

function sourceLabel(response: DirectoryResponse | DirectoryStatsResponse | null) {
  const source = response?.sourceMetadata;
  if (!source) return "Source unavailable";
  if (source.status === "live") return "Live provider data";
  if (source.status === "cached") return "Retained provider data";
  return "Embedded snapshot";
}

function isStargate(facility: DirectoryFacility) {
  return facility.name.toLowerCase().includes("stargate") && facility.city.toLowerCase().includes("abilene");
}

function DirectoryCard({
  facility,
  onCurated,
  onResearch,
  researchState,
}: {
  facility: DirectoryFacility;
  onCurated: () => void;
  onResearch: () => void;
  researchState: { busy: boolean; error: string | null };
}) {
  const confidenceTone = {
    confirmed: "border-[#83d6b8]/50 bg-[#e0f4ed] text-[#0b624f]",
    reported: "border-[#f1cb8b]/60 bg-[#fff8e9] text-[#8a6400]",
    rumored: "border-[#efabb8]/60 bg-[#fde8eb] text-[#ba2f45]",
  }[facility.confidence];
  return (
    <article
      data-testid={`compute-atlas-record-${facility.id}`}
      className="rounded-lg border border-white/15 bg-[#102b3b] p-4 transition-colors hover:border-[#8dc8e8]/55 sm:p-3.5"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.35fr)_minmax(190px,1fr)_120px_120px_minmax(145px,auto)] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#d4e86b]" />
            <div className="min-w-0">
              <h3 data-testid={`compute-atlas-record-name-${facility.id}`} className="truncate text-[14px] font-semibold text-white">{facility.name}</h3>
              <p className="mt-1 truncate text-[10px] text-[#9dafb8]">{facility.operator}</p>
            </div>
          </div>
        </div>
        <div data-testid={`compute-atlas-record-location-${facility.id}`} className="flex min-w-0 items-start gap-2 text-[11px] text-[#c4d0d6]">
          <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5ddd5]" />
          <span className="truncate">{locationLabel(facility)}</span>
        </div>
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#718894]">Capacity</div>
          <div className="mt-1 font-mono text-[12px] font-bold text-[#d4e86b]">{capacityLabel(facility.capacityMW)}</div>
        </div>
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#718894]">Status</div>
          <span data-testid={`compute-atlas-record-status-${facility.id}`} className="mt-1 inline-flex rounded-full border border-[#8dc8e8]/40 bg-[#0d2435] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#b9e1f2]">{statusLabel(facility.status)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${confidenceTone}`}>{facility.confidence}</span>
          {facility.sourceUrl && (
            <a data-testid={`compute-atlas-source-${facility.id}`} href={facility.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded border border-white/20 px-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#b9e1f2] hover:border-[#d4e86b] hover:text-[#d4e86b]">
              Source <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          )}
          {isStargate(facility) ? (
            <button data-testid={`compute-atlas-open-${facility.id}`} type="button" onClick={onCurated} className="inline-flex min-h-9 items-center gap-1 rounded bg-[#d4e86b] px-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#122232] hover:bg-[#e3f18d]">
              Curated Deep Dive <ArrowRight aria-hidden="true" className="h-3 w-3" />
            </button>
          ) : (
            <button data-testid={`compute-atlas-open-${facility.id}`} type="button" onClick={onResearch} disabled={researchState.busy} className="inline-flex min-h-9 items-center gap-1 rounded border border-[#d4e86b]/60 px-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#d4e86b] hover:bg-[#d4e86b]/10 disabled:cursor-wait disabled:opacity-60">
              {researchState.busy ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> : null}
              {researchState.busy ? "Researching…" : "Research with AI"}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
        {facility.aiClassification && <span className="rounded-full border border-[#cbb7ec]/45 bg-[#482873]/40 px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#e9e0f7]">AI: {facility.aiClassification.replaceAll("_", " ")}</span>}
        {facility.connectedCompanies.map((company) => <span key={company} className="text-[9px] text-[#b9e1f2]">Mapped: {company}</span>)}
        {facility.connectedFunds.length > 0 && <span className="text-[9px] text-[#718894]">Market context: {facility.connectedFunds.join(", ")}</span>}
      </div>
      {researchState.error && <div data-testid={`compute-atlas-error-${facility.id}`} role="alert" className="mt-2 rounded border border-[#efabb8]/60 bg-[#552c3a] px-2.5 py-2 text-[10px] leading-4 text-[#ffc8ce]">{researchState.error}</div>}
    </article>
  );
}

export function ComputeAtlasDirectory({ onCurated, onResearchSuccess }: { onCurated: () => void; onResearchSuccess: (research: CustomResearchResponse) => void }) {
  const [directory, setDirectory] = useState<DirectoryResponse | null>(null);
  const [statsResponse, setStatsResponse] = useState<DirectoryStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<(typeof DIRECTORY_STATES)[number]>("All");
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(DIRECTORY_PAGE_SIZE);
  const [researching, setResearching] = useState<Record<string, { busy: boolean; error: string | null }>>({});

  useEffect(() => {
    let active = true;
    void fetchDirectory()
      .then((records) => {
        if (!active) return;
        setDirectory(records);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "The directory is unavailable. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchDirectoryStats()
      .then((totals) => {
        if (active) setStatsResponse(totals);
      })
      .catch(() => {
        // Directory cards remain useful when aggregate stats are unavailable.
      });
    return () => { active = false; };
  }, []);

  const facilities = directory?.facilities ?? [];
  const filteredFacilities = facilities.filter((facility) => {
    const matchesState = stateFilter === "All" || (stateFilter === "Other" ? !["TX", "AZ", "VA", "GA", "OH"].includes(facility.state) : facility.state === stateFilter);
    const haystack = `${facility.name} ${facility.operator} ${facility.city} ${facility.county} ${facility.state} ${facility.aiClassification ?? ""}`.toLowerCase();
    const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
    const matchesCompany = !companyFilter || facility.connectedCompanies.includes(companyFilter);
    return matchesState && matchesQuery && matchesCompany;
  });
  const connectedCount = companyFilter ? filteredFacilities.length : 0;
  const contextFunds = companyFilter ? [...new Set(filteredFacilities.flatMap((facility) => facility.connectedFunds).concat(ETF_CONTEXT[companyFilter] ?? []))] : [];
  const visibleFacilities = filteredFacilities.slice(0, visibleCount);
  const total = statsResponse?.stats.totalFacilities ?? facilities.length;
  const freshness = directoryFreshness(directory?.sourceMetadata);

  const handleResearch = async (facility: DirectoryFacility) => {
    setResearching((current) => ({ ...current, [facility.id]: { busy: true, error: null } }));
    try {
      const result = await researchProject(facility.name, locationLabel(facility));
      onResearchSuccess(result);
    } catch (requestError) {
      setResearching((current) => ({ ...current, [facility.id]: { busy: false, error: requestError instanceof Error ? requestError.message : "AI research is unavailable. Try again." } }));
    }
  };

  return (
    <section data-testid="compute-atlas-page" aria-labelledby="compute-atlas-heading" className="border-t border-white/10 bg-[#0a1b2a] px-5 py-10 sm:px-8 md:py-14 xl:px-10">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4e86b]"><span className="h-1.5 w-1.5 rounded-full bg-[#d4e86b]" /> Compute Atlas / public directory</div>
            <h2 id="compute-atlas-heading" className="max-w-3xl text-[34px] font-semibold leading-[0.98] tracking-[-0.055em] text-white md:text-[48px]">Find the facilities behind the buildout.</h2>
            <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#c4d0d6]">Browse public facility metadata, then open a curated workbench or ask AI to research a different project. Directory records are provider context—not facility-level proof or modeled economics.</p>
          </div>
          <div data-testid="compute-atlas-live-count" className="shrink-0 rounded-lg border border-[#8dc8e8]/30 bg-[#102b3b] px-4 py-3">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#718894]">{sourceLabel(directory)}</div>
            <div className="mt-1 font-mono text-[24px] font-bold tracking-[-0.05em] text-[#d4e86b]">{total.toLocaleString()}</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">facilities in directory</div>
            <div data-testid="compute-atlas-freshness" className="mt-2 border-t border-white/10 pt-2 font-mono text-[9px] leading-4 text-[#b9e1f2]">{freshness.label}</div>
          </div>
        </div>
        {loading && <div data-testid="compute-atlas-loading" role="status" className="mt-6 space-y-2"><div className="h-16 animate-pulse rounded-lg bg-[#102b3b]" /><div className="h-16 animate-pulse rounded-lg bg-[#102b3b]" /><p className="font-mono text-[10px] text-[#9dafb8]">Loading public facility directory…</p></div>}
        {error && <div data-testid="compute-atlas-error" role="alert" className="mt-6 rounded-lg border border-[#f1cb8b]/60 bg-[#3d2d24] px-4 py-3 text-[11px] leading-5 text-[#ffe0a9]">The provider could not be reached. {error} The embedded directory snapshot remains available when supplied by the server.</div>}
        {!loading && (
          <>
            <div data-testid="compute-atlas-controls" className="mt-6 space-y-4">
              <label className="relative block max-w-xl">
                <span className="sr-only">Search facilities</span>
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718894]" />
                <input data-testid="compute-atlas-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facility, operator, city, or county" className="min-h-11 w-full rounded-md border border-white/20 bg-[#102b3b] py-3 pl-10 pr-3 text-[12px] text-white placeholder:text-[#718894] outline-none focus:border-[#d4e86b] focus:ring-2 focus:ring-[#d4e86b]/30" />
              </label>
              <div role="tablist" aria-label="Filter directory by state" className="flex gap-2 overflow-x-auto pb-1">
                {DIRECTORY_STATES.map((state) => <button key={state} data-testid={`compute-atlas-state-${state.toLowerCase()}`} type="button" role="tab" aria-selected={stateFilter === state} onClick={() => setStateFilter(state)} className={`min-h-10 shrink-0 rounded-full border px-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${stateFilter === state ? "border-[#d4e86b] bg-[#d4e86b] text-[#122232]" : "border-white/20 text-[#b9e1f2] hover:border-[#8dc8e8]"}`}>{state}</button>)}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by mapped company">
                {DIRECTORY_COMPANIES.map((company) => <button key={company} data-testid={`compute-atlas-company-${company.toLowerCase()}`} type="button" aria-pressed={companyFilter === company} onClick={() => setCompanyFilter(companyFilter === company ? null : company)} className={`min-h-10 shrink-0 rounded-md border px-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] ${companyFilter === company ? "border-[#8dc8e8] bg-[#173b52] text-[#d4e86b]" : "border-white/15 bg-[#102b3b] text-[#9dafb8] hover:border-[#8dc8e8] hover:text-white"}`}>{company}</button>)}
              </div>
              <button data-testid="compute-atlas-analyze-custom" type="button" onClick={() => window.dispatchEvent(new Event("safeloc-open-custom-project"))} className="inline-flex min-h-10 items-center rounded border border-white/20 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#b9e1f2] hover:border-[#d4e86b] hover:text-[#d4e86b]">Analyze a different project</button>
            </div>
            <div data-testid="compute-atlas-result-count" aria-live="polite" className="mt-5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9dafb8]">
              <span>Showing {visibleFacilities.length.toLocaleString()} of {filteredFacilities.length.toLocaleString()} matching · {total.toLocaleString()} total</span>
              {companyFilter && <span className="text-[#d4e86b]">{connectedCount.toLocaleString()} connected to {companyFilter}</span>}
            </div>
            {freshness.caution && (
              <div data-testid="compute-atlas-retained-warning" role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-[#f1cb8b]/70 bg-[#3d2d24] px-3 py-2.5 text-[11px] leading-5 text-[#ffe0a9]">
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span><strong className="font-semibold">Retained directory data is nearing its 24-hour refresh window.</strong> Treat this as discovery context and verify current details before relying on it.</span>
              </div>
            )}
            {companyFilter && <p className="mt-2 text-[10px] leading-4 text-[#8299a5]">ETF context: {contextFunds.join(", ") || "No mapped fund context"}. This is market exposure context, not evidence that a fund owns or controls a facility.</p>}
            <div data-testid="compute-atlas-results" className="mt-3 space-y-2">
              {filteredFacilities.length === 0 ? (
                <div data-testid="compute-atlas-empty" className="rounded-lg border border-white/15 bg-[#102b3b] px-4 py-8 text-center text-[12px] text-[#b9c5c9]">No facilities match these filters. Try another state, company, or search term.</div>
              ) : visibleFacilities.map((facility) => (
                <DirectoryCard key={facility.id} facility={facility} onCurated={onCurated} onResearch={() => void handleResearch(facility)} researchState={researching[facility.id] ?? { busy: false, error: null }} />
              ))}
            </div>
            {visibleFacilities.length < filteredFacilities.length && (
              <button
                data-testid="compute-atlas-load-more"
                type="button"
                onClick={() => setVisibleCount((count) => Math.min(count + DIRECTORY_PAGE_SIZE, filteredFacilities.length))}
                className="mt-4 min-h-11 w-full rounded-md border border-white/20 bg-[#102b3b] px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#b9e1f2] hover:border-[#d4e86b] hover:text-[#d4e86b]"
              >
                Show next {Math.min(DIRECTORY_PAGE_SIZE, filteredFacilities.length - visibleFacilities.length)} facilities
              </button>
            )}
            <div data-testid="compute-atlas-attribution" className="mt-6 border-t border-white/10 pt-4 text-[10px] leading-5 text-[#8299a5]">
              Directory metadata by <a href="https://compute-atlas.com" target="_blank" rel="noreferrer" className="text-[#b9e1f2] underline underline-offset-2 hover:text-[#d4e86b]">Compute Atlas</a>, CC BY 4.0. {sourceLabel(directory)} is shown explicitly; it does not change the SafeLoc public-facts versus synthetic-economics boundary.
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function Home({ onNavigate }: { onNavigate?: (route: HomeRoute) => void } = {}) {
  const { loadCustomProject, resetToDefault, originatingCompany } = useDiligence();
  const initialCompany = COMPANY_PROFILES.some((profile) => profile.key === originatingCompany) ? originatingCompany as CompanyKey : null;
  const [selectedCompany, setSelectedCompany] = useState<CompanyKey | null>(initialCompany);
  const [companyDirectory, setCompanyDirectory] = useState<DirectoryResponse | null>(null);
  const [companyDirectoryLoading, setCompanyDirectoryLoading] = useState(false);
  const [companyDirectoryError, setCompanyDirectoryError] = useState<string | null>(null);
  const [companyResearchingId, setCompanyResearchingId] = useState<string | null>(null);
  const [companyResearchError, setCompanyResearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompany || companyDirectory) return undefined;
    let active = true;
    setCompanyDirectoryLoading(true);
    setCompanyDirectoryError(null);
    void fetchDirectory()
      .then((response) => {
        if (active) setCompanyDirectory(response);
      })
      .catch((requestError) => {
        if (active) setCompanyDirectoryError(requestError instanceof Error ? requestError.message : "Directory unavailable.");
      })
      .finally(() => {
        if (active) setCompanyDirectoryLoading(false);
      });
    return () => { active = false; };
  }, [companyDirectory, selectedCompany]);

  const handleResearchSuccess = (research: CustomResearchResponse, company: CompanyKey | null = null) => {
    loadCustomProject(research, company);
    window.location.hash = "brief";
  };
  const goSecondary = (route: HomeRoute) => {
    if (onNavigate) onNavigate(route);
    else window.location.hash = route;
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
                     <Zap aria-hidden="true" className="h-3.5 w-3.5" /> Start with the directory
                   </div>
                   <p className="text-[11px] leading-5 text-[#c4d0d6]">Search public facility metadata first. Choose the curated Stargate case or launch session-only AI research from any other record.</p>
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
         <section data-testid="home-stock-picker" aria-labelledby="home-stock-picker-heading" className="border-y border-white/10 bg-[#0d2435] px-5 py-10 sm:px-8 md:py-14 xl:px-10">
           <div className="mx-auto max-w-[1240px]">
             <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end">
               <div>
                 <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4e86b]">Holdings / start here</div>
                 <h2 id="home-stock-picker-heading" className="mt-2 text-[31px] font-semibold leading-none tracking-[-0.05em] text-white md:text-[45px]">Start from what your clients hold.</h2>
                 <p className="mt-3 max-w-2xl text-[13px] leading-5 text-[#c4d0d6]">Select a company to see the AI infrastructure its revenue depends on.</p>
               </div>
               <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#718894]">Six public-company lenses</span>
             </div>
             <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
               {COMPANY_PROFILES.map((company) => <CompanyCard key={company.key} company={company} onSelect={() => setSelectedCompany(company.key)} />)}
             </div>
           </div>
         </section>
         {selectedCompany && (
           <CompanyExposure
             company={selectedCompany}
             facilities={companyDirectory?.facilities ?? []}
             loading={companyDirectoryLoading}
             error={companyDirectoryError}
             researchError={companyResearchError}
             researchingProjectId={companyResearchingId}
             onBack={() => setSelectedCompany(null)}
             onCurated={(company) => {
               resetToDefault(company);
               window.location.hash = "brief";
             }}
             onResearch={(project, company) => {
               if (!project.facility) return;
               setCompanyResearchingId(project.id);
               setCompanyResearchError(null);
               void researchProject(project.name, project.location)
                 .then((research) => handleResearchSuccess(research, company))
                 .catch(() => setCompanyResearchError("AI research is unavailable. Try again."))
                 .finally(() => setCompanyResearchingId(null));
             }}
           />
         )}
         <section data-testid="home-secondary-paths" className="mx-auto max-w-[1240px] px-5 py-9 sm:px-8 md:py-12 xl:px-10">
           <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
             <div className="rounded-xl border border-[#d4e86b]/35 bg-[#102b3b] p-5">
               <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#d4e86b]">Curated case</div>
               <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-white">Or dive straight into Stargate Abilene.</h2>
               <p className="mt-2 text-[11px] leading-5 text-[#b9c5c9]">OpenAI&apos;s $500B flagship. The curated deep dive.</p>
               <button data-testid="button-analyze-stargate" type="button" onClick={() => { resetToDefault(null); window.location.hash = "brief"; }} className="mt-5 inline-flex min-h-11 flex-wrap items-center gap-2 rounded-md bg-[#d4e86b] px-3 py-2.5 text-left font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#122232] hover:bg-[#e3f18d]">Analyze Stargate Abilene <span className="normal-case tracking-normal">OpenAI&apos;s $500B flagship. The curated deep dive.</span> <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></button>
             </div>
             <div className="rounded-xl border border-white/15 bg-[#102b3b] p-5">
               <div className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#d4e86b]">Tertiary paths</div>
               <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.03em] text-white">Don&apos;t see your project?</h2>
               <p className="mt-2 text-[11px] leading-5 text-[#b9c5c9]">Search by name and location. SafeLoc will research public sources, then open the same evidence workbench.</p>
               <div className="mt-4"><CustomProjectForm compact onSuccess={(research) => handleResearchSuccess(research)} /></div>
               <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                 <button data-testid="button-browse-all-facilities" type="button" onClick={() => goSecondary("directory")} className="inline-flex min-h-10 items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#b9e1f2] hover:text-[#d4e86b]">Browse All Facilities <ArrowRight aria-hidden="true" className="h-3 w-3" /></button>
                 <span className="font-mono text-[9px] text-[#718894]">Or browse all 1,280+ tracked facilities by state.</span>
               </div>
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
           <span className="text-[#526f7c]">Public Context · Synthetic Returns · Compute Atlas directory</span>
        </div>
      </footer>
    </div>
  );
}

export function DirectoryPage({ onCurated, onResearchSuccess }: { onCurated: () => void; onResearchSuccess: (research: CustomResearchResponse) => void }) {
  return <ComputeAtlasDirectory onCurated={onCurated} onResearchSuccess={onResearchSuccess} />;
}