
import { useEffect, useState } from "react";
import type {
  ReactNode,
  RefObject
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Info,
  MapPin,
  Menu,
  Network,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X
} from "lucide-react";
import {
  Classification,
  useDiligence
} from "@/context/DiligenceContext";


import {
  type EvidenceCompletenessTier
} from "@/model/advisorLens";
import { CustomProjectDialog } from "@/pages/Home";
import type { ImpactRole } from "@/data/evidenceImpactRoles";

export type Screen = "brief" | "evidence" | "materiality" | "decision" | "advisor";
type AppRoute = Screen | "home" | "directory" | "value-chain" | "how-it-works";

export const screens: { id: Screen; number: string; label: string; short: string; icon: typeof BookOpen }[] = [
  { id: "brief", number: "01", label: "Case Brief", short: "Frame", icon: BookOpen },
  { id: "evidence", number: "02", label: "Evidence Room", short: "Source", icon: FileCheck2 },
  { id: "materiality", number: "03", label: "Financial Materiality", short: "Model", icon: BarChart3 },
  { id: "decision", number: "04", label: "Decision Review", short: "Decide", icon: ClipboardCheck },
  { id: "advisor", number: "05", label: "Advisor Lens", short: "Transmit", icon: Network },
];

export const classifications: Classification[] = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

export const classMeta: Record<Classification, { color: string; bg: string; border: string; short: string }> = {
  "Verified Evidence": { color: "#0b7a63", bg: "#e0f4ed", border: "#9bd8c5", short: "Verified" },
  "Management Assertion": { color: "#8a6400", bg: "#fff6c7", border: "#e6cf70", short: "Management" },
  "Model Inference": { color: "#255bb7", bg: "#e5efff", border: "#aac6f4", short: "Inference" },
  "User Assumption": { color: "#a65a00", bg: "#fff0d6", border: "#f1cb8b", short: "Assumption" },
  "Missing Evidence": { color: "#ba2f45", bg: "#fde8eb", border: "#efabb8", short: "Missing" },
};
export function formatCurrency(value: number, decimals = 1) {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(decimals)}M`;
}

export function formatIRR(value: number | null) {
  return value === null ? "N/M" : `${value.toFixed(1)}%`;
}

export function formatPayback(value: number | null) {
  return value === null ? "Not reached" : `${value.toFixed(1)} years`;
}

export function formatScenarioMetric(value: number | null, metric: "irr" | "moic" | "npv" | "cashOnCash" | "payback" | "confidence") {
  if (metric === "irr") return formatIRR(value);
  if (metric === "payback") return formatPayback(value);
  if (value === null) return "Unavailable";
  if (metric === "moic") return `${value.toFixed(2)}x`;
  if (metric === "npv") return formatCurrency(value, 0);
  return `${value.toFixed(1)}%`;
}
export function formatLineItemValue(value: number, unit: string) {
  if (unit.startsWith("$")) return formatCurrency(value);
  if (unit === "%") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)} ${unit}`;
}
export function chartPoints(values: number[], min: number, max: number) {
  const width = 500;
  const height = 72;
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function ClassificationBadge({ value, compact = false }: { value: Classification; compact?: boolean }) {
  const meta = classMeta[value];
  return (
    <span
      data-testid={`badge-classification-${meta.short.toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${compact ? "px-2 py-0.5" : ""}`}
      style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {compact ? meta.short : value}
    </span>
  );
}

const impactRoleMeta: Record<ImpactRole, { color: string; bg: string; border: string }> = {
  "Financial Driver": { color: "#255bb7", bg: "#e5efff", border: "#aac6f4" },
  "Decision Gate": { color: "#8a6400", bg: "#fff6c7", border: "#e6cf70" },
  "Context Indicator": { color: "#5d477b", bg: "#f0eafb", border: "#cbbbe5" },
};
const evidenceCompletenessMeta: Record<EvidenceCompletenessTier, { color: string; bg: string; border: string }> = {
  HIGH: { color: "#ba2f45", bg: "#fde8eb", border: "#efabb8" },
  MODERATE: { color: "#8a6400", bg: "#fff6c7", border: "#e6cf70" },
  LOW: { color: "#0b7a63", bg: "#e0f4ed", border: "#9bd8c5" },
};
export function EvidenceCompletenessIndicator({ tier, testId }: { tier: EvidenceCompletenessTier; testId: string }) {
  const meta = evidenceCompletenessMeta[tier];
  return (
    <span
      data-testid={testId}
      aria-label={`${tier} Stargate infrastructure evidence completeness`}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.1em]"
      style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {tier}
    </span>
  );
}
export function SectionKicker({ children, tone = "default", className = "" }: { children: ReactNode; tone?: "default" | "warning" | "lime"; className?: string }) {
  return (
    <div className={`mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] ${tone === "warning" ? "text-[#ba2f45]" : tone === "lime" ? "text-[#607500]" : "text-[#60707d]"} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "warning" ? "bg-[#ba2f45]" : tone === "lime" ? "bg-[#b9d43a]" : "bg-[#255bb7]"}`} />
      {children}
    </div>
  );
}

export function Disclosure({ title, children, defaultOpen = false, className = "", testId }: { title: string; children: ReactNode; defaultOpen?: boolean; className?: string; testId?: string }) {
  return (
    <details data-testid={testId} open={defaultOpen || undefined} className={`disclosure group rounded-xl border border-[#d9e0e4] bg-white ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#344550] [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#e5eae8] px-4 py-4">{children}</div>
    </details>
  );
}

export const evidenceCategories = [
  { id: "power-grid", label: "Power & Grid", itemIds: ["electricity_cost", "grid_interconnection", "electricity_escalation", "renewable_percentage", "backup_power_capacity"] },
  { id: "water-climate", label: "Water & Climate", itemIds: ["water_consumption", "water_escalation", "water_rights", "site_hazard_exposure", "water_source_resilience"] },
  { id: "community-permitting", label: "Community & Permitting", itemIds: ["community_risk", "permitting_timeline"] },
  { id: "financial-counterparty", label: "Financial & Counterparty", itemIds: ["cooling_capex", "carbon_compliance", "customer_concentration", "downtime_cost"] },
] as const;

export function MetricCard({ label, value, detail, accent = "navy", testId }: { label: string; value: string; detail: string; accent?: "navy" | "lime" | "coral" | "violet"; testId: string }) {
  const colors = { navy: "bg-[#122232] text-white", lime: "bg-[#d4e86b] text-[#1c2a16]", coral: "bg-[#f5ddd5] text-[#6d2b26]", violet: "bg-[#e9e0f7] text-[#482873]" };
  return (
    <div data-testid={testId} className={`metric-card min-h-[116px] !border-0 ${colors[accent]}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-65">{label}</span>
        {accent === "lime" ? <TrendingUp className="h-4 w-4 opacity-60" /> : accent === "coral" ? <TrendingDown className="h-4 w-4 opacity-60" /> : <Gauge className="h-4 w-4 opacity-50" />}
      </div>
      <div data-testid={`${testId}-value`} className="mt-3 font-mono text-[27px] font-bold tracking-[-0.05em]">{value}</div>
      <div className="mt-1 text-[11px] opacity-65">{detail}</div>
    </div>
  );
}
export function LowConfidenceWarning({ testId }: { testId: string }) {
  return (
    <div data-testid={testId} role="note" className="flex items-start gap-3 rounded-lg border-2 border-[#ba2f45] bg-[#fff3f4] px-4 py-3 text-[#7f2635]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-mono text-[10px] font-bold leading-5 tracking-[0.02em]">
        Evidence base insufficient for investment conclusions - outputs shown for sensitivity analysis only
      </p>
    </div>
  );
}
export function ProgressNav({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  const { project, originatingCompany } = useDiligence();
  const currentIndex = screens.findIndex((screen) => screen.id === current);
  return (
    <div className="border-b border-[#d9e0e4] bg-[#f9faf8]/90 px-4 backdrop-blur-md md:px-8">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between">
        <div className="hidden items-center gap-2 py-3 text-[10px] font-bold uppercase tracking-[0.17em] text-[#52616b] md:flex">
          <span data-testid="workbench-breadcrumb" className="font-mono text-[#122232]">
            {originatingCompany ? `${originatingCompany} → ${project.name} → ${screens.find((screen) => screen.id === current)?.label}` : "WORKBENCH / CASE ABI-26-001"}
          </span>
        </div>
        <nav aria-label="Diligence progress" className="flex w-full items-stretch justify-between gap-1 md:w-auto md:gap-2">
          {screens.map((screen, index) => {
            const Icon = screen.icon;
            const isActive = screen.id === current;
            const isDone = index < currentIndex;
            return (
              <button
                key={screen.id}
                data-testid={`button-navigate-${screen.id}`}
                type="button"
                aria-label={`Step ${index + 1}: ${screen.label}`}
                aria-current={isActive ? "step" : undefined}
                onClick={() => onNavigate(screen.id)}
                className={`group relative flex min-w-0 items-center gap-2 border-b-2 px-2 py-3.5 text-left transition-colors md:min-w-[132px] md:px-3 ${isActive ? "border-[#b9d43a] text-[#122232]" : "border-transparent text-[#52616b] hover:border-[#c8d5dd] hover:text-[#122232]"}`}
              >
                <span className={`hidden h-6 w-6 items-center justify-center rounded-full font-mono text-[9px] font-bold md:flex ${isActive ? "bg-[#122232] text-[#d4e86b]" : isDone ? "bg-[#e0f4ed] text-[#0b7a63]" : "bg-[#e7ecef] text-[#52616b]"}`}>
                  {isDone ? <Check className="h-3 w-3" /> : screen.number}
                </span>
                <span className="flex items-center gap-1.5 md:hidden">
                  <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="font-mono text-[10px] font-bold">{index + 1}</span>
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block truncate text-[10px] font-bold uppercase tracking-[0.11em]">{screen.label}</span>
                  <span className="text-[10px] text-[#52616b]">{screen.short}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 py-3 md:flex">
           <span className="h-2 w-2 rounded-full bg-[#0b7a63]" aria-hidden="true" />
           <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#52616b]">Client-side model · static data</span>
        </div>
      </div>
    </div>
  );
}

export function Header({ onMenu, onReset, onHome, onHowItWorks, onValueChain, onWorkbench, onAnalyzeCustom, route, sessionRestored, mobileOpen, menuButtonRef }: { onMenu: () => void; onReset: () => void; onHome: () => void; onHowItWorks: () => void; onValueChain: () => void; onWorkbench: () => void; onAnalyzeCustom?: () => void; route: AppRoute; sessionRestored: boolean; mobileOpen: boolean; menuButtonRef: RefObject<HTMLButtonElement | null> }) {
  const { sessionMigrated, project, loadCustomProject } = useDiligence();
  const [customProjectOpen, setCustomProjectOpen] = useState(false);
  useEffect(() => {
    const openCustomProject = () => setCustomProjectOpen(true);
    window.addEventListener("safeloc-open-custom-project", openCustomProject);
    return () => window.removeEventListener("safeloc-open-custom-project", openCustomProject);
  }, []);
  return (
    <>
    <header className="border-b border-[#d9e0e4] bg-[#122232] px-4 py-4 text-[#f6f7f2] md:px-8 md:py-5">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            ref={menuButtonRef}
            data-testid="button-open-menu"
            type="button"
            aria-label="Navigation menu"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={onMenu}
            className="rounded-md p-2 text-[#d4e86b] hover:bg-white/10 md:hidden"
          >
            {mobileOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
          <div className="relative flex h-9 w-9 items-center justify-center rounded border border-[#d4e86b]/50 bg-[#d4e86b] text-[#122232]">
            <span className="absolute h-4 w-4 rounded-sm border-2 border-[#122232]" />
            <span className="absolute h-1.5 w-1.5 rounded-full bg-[#122232]" />
          </div>
          <div>
            <div className="font-mono text-[13px] font-bold tracking-[0.14em]">SAFELOC</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-[#b9c3c9]">Diligence Workbench</div>
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="text-center">
             <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#b9d43a]">{project.kind === "custom" ? project.researchMode === "default-assumptions" ? "Default assumptions · research unavailable" : "AI-researched · high-level project" : "Evidence-Governed Investment Intelligence"}</div>
             <div className="mt-1 text-[10px] text-[#96a4ad]">{project.name} / {project.location} · IC pre-read</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="button-home"
            type="button"
            onClick={onHome}
            aria-current={route === "home" ? "page" : undefined}
            className={`hidden rounded border px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] transition-colors md:inline-flex ${route === "home" ? "border-[#d4e86b] bg-[#d4e86b] text-[#122232]" : "border-[#60717f] text-[#d4e86b] hover:border-[#d4e86b] hover:bg-white/10"}`}
          >
            Home
          </button>
          <button
            data-testid="button-open-value-chain"
            type="button"
            onClick={onValueChain}
            aria-current={route === "value-chain" ? "page" : undefined}
            className={`hidden rounded border px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] transition-colors md:inline-flex ${route === "value-chain" ? "border-[#d4e86b] bg-[#d4e86b] text-[#122232]" : "border-[#60717f] text-[#d4e86b] hover:border-[#d4e86b] hover:bg-white/10"}`}
          >
            The AI Chain
          </button>
           <button
             data-testid="button-analyze-different-project"
             type="button"
             onClick={onAnalyzeCustom ?? (() => setCustomProjectOpen(true))}
             className="hidden min-h-11 items-center rounded border border-[#60717f] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] transition-colors hover:border-[#d4e86b] hover:bg-white/10 lg:inline-flex"
           >
             Analyze a different project
           </button>
           <button
             data-testid="button-how-it-works"
             type="button"
             onClick={onHowItWorks}
             aria-current={route === "how-it-works" ? "page" : undefined}
             className={`hidden min-h-11 items-center gap-2 rounded border px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] transition-colors sm:inline-flex ${route === "how-it-works" ? "border-[#d4e86b] bg-[#d4e86b] text-[#122232]" : "border-[#60717f] text-[#d4e86b] hover:border-[#d4e86b] hover:bg-white/10"}`}
           >
             <Info aria-hidden="true" className="h-3.5 w-3.5" /> How It Works
           </button>
          {route === "value-chain" && (
            <button
              data-testid="button-return-to-workbench"
              type="button"
              onClick={onWorkbench}
              className="hidden items-center rounded border border-[#60717f] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#f5ddd5] transition-colors hover:border-[#f5ddd5] hover:bg-white/10 sm:inline-flex"
            >
              Return to Workbench
            </button>
          )}
          {sessionRestored && <span role="status" data-testid="text-session-restored" className="absolute right-4 top-full z-20 rounded border border-[#b9d43a]/40 bg-[#122232] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#d4e86b] shadow-md md:right-8">{sessionMigrated ? "Session updated to audited defaults" : "Session restored"}</span>}
          <button data-testid="button-reset-default" type="button" onClick={onReset} className="rounded border border-[#60717f] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#d4e86b] transition-colors hover:border-[#d4e86b] hover:bg-white/10">Reset to Default</button>
          <span className="hidden rounded border border-[#60717f] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#c8d0d5] sm:inline-flex">POC / v0.9</span>
          <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#e9e0f7] font-mono text-[10px] font-bold text-[#482873] sm:flex">AD</div>
        </div>
      </div>
    </header>
    <CustomProjectDialog
      open={customProjectOpen}
      onClose={() => setCustomProjectOpen(false)}
      onSuccess={(research) => {
        loadCustomProject(research);
        setCustomProjectOpen(false);
        window.location.hash = "brief";
      }}
    />
    <CustomResearchBanner />
    </>
  );
}

export function ShellAside({ screen, metrics, onNavigate, onReset }: { screen: Screen; metrics: ReturnType<typeof useDiligence>["metrics"]; onNavigate: (screen: Screen) => void; onReset: () => void }) {
  const { project } = useDiligence();
  return (
    <aside className="hidden w-[246px] shrink-0 border-r border-[#d9e0e4] bg-[#eef2f1] px-5 py-7 lg:block">
      <SectionKicker>Active mandate</SectionKicker>
      <div className="mb-7">
         <div className="font-mono text-[11px] font-bold text-[#122232]">{project.kind === "custom" ? "CUSTOM / SESSION-ONLY" : "STARGATE / ABI-26-001"}</div>
          <div className="mt-1 text-xs leading-5 text-[#52616b]">{project.kind === "custom" ? project.researchMode === "default-assumptions" ? "Default-assumptions project" : "AI-researched project" : "AI infrastructure diligence case"}</div>
      </div>
      <div className="mb-8 rounded-lg border border-[#cbd8d4] bg-[#f9faf8] p-3.5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#60707d]">
           <MapPin className="h-3.5 w-3.5 text-[#ba2f45]" /> {project.location}
        </div>
        <div className="mt-3 h-px bg-[#dfe6e3]" />
        <div className="mt-3 flex justify-between text-[10px]">
          <span className="text-[#52616b]">Screen</span>
          <span className="font-mono font-bold text-[#122232]">{screens.findIndex((item) => item.id === screen) + 1} / 5</span>
        </div>
      </div>
      <div className="space-y-1">
        {screens.map((item, index) => {
          const active = item.id === screen;
          return (
            <button
              key={item.id}
              data-testid={`aside-navigate-${item.id}`}
               type="button"
               aria-current={active ? "step" : undefined}
               aria-label={`Step ${index + 1}: ${item.label}`}
               onClick={() => onNavigate(item.id)}
               className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors ${active ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b] hover:bg-white hover:text-[#122232]"}`}
            >
              <span className="font-mono text-[10px] opacity-70">0{index + 1}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
              {active && <CircleDot className="ml-auto h-3 w-3" />}
            </button>
          );
        })}
      </div>
      <button data-testid="aside-reset-default" onClick={onReset} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#cbd8d4] bg-[#f9faf8] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#52616b] transition-colors hover:border-[#ba2f45] hover:text-[#ba2f45]"><RefreshCw className="h-3.5 w-3.5" /> Reset to Default</button>
      <div className="mt-auto pt-16">
        <div className="mb-2 flex items-end justify-between">
           <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Evidence confidence</span>
           <span data-testid="text-aside-confidence" className="font-mono text-sm font-bold text-[#122232]">{metrics.confidenceScore}%</span>
        </div>
           <div className="h-1.5 overflow-hidden rounded-full bg-[#d9e2df]" role="progressbar" aria-label="Evidence confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.confidenceScore}>
           <div className="motion-bar h-full rounded-full bg-[#b9d43a] transition-all duration-500" style={{ width: `${metrics.confidenceScore}%` }} />
        </div>
         <div className="mt-2 text-[10px] leading-4 text-[#52616b]">Weighted by source quality and recency.</div>
      </div>
    </aside>
  );
}

export function CustomResearchBanner() {
  const { project } = useDiligence();
  if (project.kind !== "custom") return null;
  const isDefaultAssumptions = project.researchMode === "default-assumptions";
  return (
    <aside data-testid="custom-research-banner" role="note" className="mb-5 flex items-start gap-3 rounded-lg border-2 border-[#f1cb8b] bg-[#fff8e9] px-4 py-3 text-[#6f460e]">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-[11px] leading-5"><strong className="font-semibold">{isDefaultAssumptions ? "Default assumptions · AI research unavailable" : "AI-researched · high-level custom analysis"}: {project.name}.</strong> {isDefaultAssumptions ? "All modeled evidence remains Missing Evidence. Directory facts provide identity context only and do not count as SafeLoc evidence." : "Public findings and regional context are shown for interpretation; they are not facility-level proof unless the cited source supports that project."} Financial outputs remain synthetic assumptions scaled to the displayed capacity.</p>
    </aside>
  );
}

export function PageIntro({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 border-b border-[#d9e0e4] pb-6 md:flex-row md:items-end">
      <div>
        <SectionKicker>{eyebrow}</SectionKicker>
        <h1 className="max-w-3xl text-[32px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#122232] md:text-[44px]">{title}</h1>
        <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#63717a]">{description}</p>
      </div>
      {right}
    </div>
  );
}

export function BottomNav({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  const index = screens.findIndex((item) => item.id === screen);
  return (
    <div className="mt-10 flex items-center justify-between border-t border-[#d9e0e4] pt-5">
      <button
        data-testid="button-previous-screen"
        onClick={() => index > 0 && onNavigate(screens[index - 1].id)}
        disabled={index === 0}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6b7882] transition-colors hover:bg-white hover:text-[#122232] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Previous
      </button>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#52616b]">SafeLoc / private working paper</div>
      <button
        data-testid="button-next-screen"
        onClick={() => index < screens.length - 1 && onNavigate(screens[index + 1].id)}
        disabled={index === screens.length - 1}
        className="inline-flex items-center gap-2 rounded-md bg-[#122232] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#d4e86b] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {index === screens.length - 1 ? "Review complete" : "Continue"} <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DiligenceLiveRegions({ metrics }: { metrics: ReturnType<typeof useDiligence>["metrics"] }) {
  return (
    <div className="sr-only" aria-label="Diligence metric updates">
      <div data-testid="live-confidence" aria-live="polite" aria-atomic="true">
        Evidence confidence is now {metrics.confidenceScore} percent.
      </div>
      <div data-testid="live-current-irr" aria-live="polite" aria-atomic="true">
        Conservative stress case IRR is now {formatIRR(metrics.projectIRR)}.
      </div>
      <div data-testid="live-recommendation" aria-live="polite" aria-atomic="true">
        Recommendation status is now {metrics.recommendationStatus}.
      </div>
      <div data-testid="live-material-gaps" aria-live="polite" aria-atomic="true">
        Material evidence gap count is now {metrics.missingMaterialCount}.
      </div>
    </div>
  );
}
export function formatScenarioDelta(first: number | null, second: number | null, metric: "irr" | "moic" | "npv" | "cashOnCash" | "payback" | "confidence") { if (first === null || second === null) return "Unavailable"; const delta = second - first; const sign = delta >= 0 ? "+" : ""; if (metric === "irr") return `${sign}${delta.toFixed(1)} pts`; if (metric === "moic") return `${sign}${delta.toFixed(2)}x`; if (metric === "npv") return `${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toFixed(0)}M`; if (metric === "payback") return `${sign}${delta.toFixed(1)} years`; return `${sign}${delta.toFixed(1)}%`; }

export function ImpactRoleBadge({ role, testId, compact = false }: { role: ImpactRole; testId?: string; compact?: boolean }) {
  const meta = impactRoleMeta[role];
  return (
    <span
      data-testid={testId}
      aria-label={`Impact role: ${role}`}
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono text-[9px] font-bold uppercase tracking-[0.09em] ${compact ? "px-2 py-0.5" : "px-2.5 py-1"}`}
      style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {role}
    </span>
  );
}
