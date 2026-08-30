import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDot,
  ClipboardCheck,
  CloudLightning,
  Cpu,
  Factory,
  FileCheck2,
  FileText,
  Gauge,
  Info,
  Landmark,
  Leaf,
  MapPin,
  Menu,
  Network,
  Pencil,
  RefreshCw,
  Scale,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X,
  Zap,
  Droplets,
} from "lucide-react";
import {
  Classification,
  DiligenceProvider,
  EvidenceItem,
  SavedScenario,
  useDiligence,
} from "@/context/DiligenceContext";
import { calculateCashFlowModel } from "@/model/cashFlowEngine";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getAdvisorQuestionPresentation,
  getGovernanceIRRGap,
  getRiskTier,
  prioritizeAdvisorQuestions,
  type RiskTier,
} from "@/model/advisorLens";
import { HowItWorksTour } from "@/HowItWorksTour";

type Screen = "brief" | "evidence" | "materiality" | "decision" | "advisor";
type AppRoute = Screen | "home" | "value-chain" | "how-it-works";

const screens: { id: Screen; number: string; label: string; short: string; icon: typeof BookOpen }[] = [
  { id: "brief", number: "01", label: "Case Brief", short: "Frame", icon: BookOpen },
  { id: "evidence", number: "02", label: "Evidence Room", short: "Source", icon: FileCheck2 },
  { id: "materiality", number: "03", label: "Financial Materiality", short: "Model", icon: BarChart3 },
  { id: "decision", number: "04", label: "Decision Review", short: "Decide", icon: ClipboardCheck },
  { id: "advisor", number: "05", label: "Advisor Lens", short: "Transmit", icon: Network },
];

const classifications: Classification[] = [
  "Verified Evidence",
  "Management Assertion",
  "Model Inference",
  "User Assumption",
  "Missing Evidence",
];

const classMeta: Record<Classification, { color: string; bg: string; border: string; short: string }> = {
  "Verified Evidence": { color: "#0b7a63", bg: "#e0f4ed", border: "#9bd8c5", short: "Verified" },
  "Management Assertion": { color: "#8a6400", bg: "#fff6c7", border: "#e6cf70", short: "Management" },
  "Model Inference": { color: "#255bb7", bg: "#e5efff", border: "#aac6f4", short: "Inference" },
  "User Assumption": { color: "#a65a00", bg: "#fff0d6", border: "#f1cb8b", short: "Assumption" },
  "Missing Evidence": { color: "#ba2f45", bg: "#fde8eb", border: "#efabb8", short: "Missing" },
};
function formatCurrency(value: number, decimals = 1) {
  return `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(decimals)}M`;
}

function formatIRR(value: number | null) {
  return value === null ? "N/M" : `${value.toFixed(1)}%`;
}

function formatPayback(value: number | null) {
  return value === null ? "Not reached" : `${value.toFixed(1)} years`;
}

function formatNPV(value: number) {
  return formatCurrency(value, 0);
}
function formatScenarioMetric(value: number | null, metric: "irr" | "moic" | "npv" | "cashOnCash" | "payback" | "confidence") {
  if (metric === "irr") return formatIRR(value);
  if (metric === "payback") return formatPayback(value);
  if (value === null) return "Unavailable";
  if (metric === "moic") return `${value.toFixed(2)}x`;
  if (metric === "npv") return formatNPV(value);
  return `${value.toFixed(1)}%`;
}
function formatLineItemValue(value: number, unit: string) {
  if (unit.startsWith("$")) return formatCurrency(value);
  if (unit === "%") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)} ${unit}`;
}
function chartPoints(values: number[], min: number, max: number) {
  const width = 500;
  const height = 72;
  const range = max - min || 1;
  return values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function ClassificationBadge({ value, compact = false }: { value: Classification; compact?: boolean }) {
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
const riskMeta: Record<RiskTier, { color: string; bg: string; border: string }> = {
  HIGH: { color: "#ba2f45", bg: "#fde8eb", border: "#efabb8" },
  MODERATE: { color: "#8a6400", bg: "#fff6c7", border: "#e6cf70" },
  LOW: { color: "#0b7a63", bg: "#e0f4ed", border: "#9bd8c5" },
};
function RiskIndicator({ tier, testId }: { tier: RiskTier; testId: string }) {
  const meta = riskMeta[tier];
  return (
    <span
      data-testid={testId}
      aria-label={`${tier} unverified exposure risk`}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.1em]"
      style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {tier}
    </span>
  );
}
function SectionKicker({ children, tone = "default", className = "" }: { children: ReactNode; tone?: "default" | "warning" | "lime"; className?: string }) {
  return (
    <div className={`mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] ${tone === "warning" ? "text-[#ba2f45]" : tone === "lime" ? "text-[#607500]" : "text-[#60707d]"} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "warning" ? "bg-[#ba2f45]" : tone === "lime" ? "bg-[#b9d43a]" : "bg-[#255bb7]"}`} />
      {children}
    </div>
  );
}

function Disclosure({ title, children, defaultOpen = false, className = "", testId }: { title: string; children: ReactNode; defaultOpen?: boolean; className?: string; testId?: string }) {
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

const evidenceCategories = [
  { id: "power-grid", label: "Power & Grid", itemIds: ["electricity_cost", "grid_interconnection", "electricity_escalation", "renewable_percentage", "backup_power_capacity"] },
  { id: "water-climate", label: "Water & Climate", itemIds: ["water_consumption", "water_escalation", "water_rights", "site_hazard_exposure", "water_source_resilience"] },
  { id: "community-permitting", label: "Community & Permitting", itemIds: ["community_risk", "permitting_timeline"] },
  { id: "financial-counterparty", label: "Financial & Counterparty", itemIds: ["cooling_capex", "carbon_compliance", "customer_concentration", "downtime_cost"] },
] as const;

function MetricCard({ label, value, detail, accent = "navy", testId }: { label: string; value: string; detail: string; accent?: "navy" | "lime" | "coral" | "violet"; testId: string }) {
  const colors = { navy: "!bg-[#122232] !text-white", lime: "!bg-[#d4e86b] !text-[#1c2a16]", coral: "!bg-[#f5ddd5] !text-[#6d2b26]", violet: "!bg-[#e9e0f7] !text-[#482873]" };
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
function LowConfidenceWarning({ testId }: { testId: string }) {
  return (
    <div data-testid={testId} role="note" className="flex items-start gap-3 rounded-lg border-2 border-[#ba2f45] bg-[#fff3f4] px-4 py-3 text-[#7f2635]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-mono text-[10px] font-bold leading-5 tracking-[0.02em]">
        Evidence base insufficient for investment conclusions - outputs shown for sensitivity analysis only
      </p>
    </div>
  );
}
function ProgressNav({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  const currentIndex = screens.findIndex((screen) => screen.id === current);
  return (
    <div className="border-b border-[#d9e0e4] bg-[#f9faf8]/90 px-4 backdrop-blur-md md:px-8">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between">
        <div className="hidden items-center gap-2 py-3 text-[10px] font-bold uppercase tracking-[0.17em] text-[#52616b] md:flex">
          <span className="font-mono text-[#122232]">WORKBENCH /</span>
          <span>CASE ABI-26-001</span>
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

function Header({ onMenu, onReset, onHome, onHowItWorks, onValueChain, onWorkbench, route, sessionRestored, mobileOpen, menuButtonRef }: { onMenu: () => void; onReset: () => void; onHome: () => void; onHowItWorks: () => void; onValueChain: () => void; onWorkbench: () => void; route: AppRoute; sessionRestored: boolean; mobileOpen: boolean; menuButtonRef: RefObject<HTMLButtonElement | null> }) {
  return (
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
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#b9d43a]">Evidence-Governed Investment Intelligence</div>
            <div className="mt-1 text-[10px] text-[#96a4ad]">Taylor County, Texas / ERCOT · IC pre-read</div>
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
          {sessionRestored && <span role="status" data-testid="text-session-restored" className="absolute right-4 top-full z-20 rounded border border-[#b9d43a]/40 bg-[#122232] px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#d4e86b] shadow-md md:right-8">Session restored</span>}
          <button data-testid="button-reset-default" type="button" onClick={onReset} className="rounded border border-[#60717f] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#d4e86b] transition-colors hover:border-[#d4e86b] hover:bg-white/10">Reset to Default</button>
          <span className="hidden rounded border border-[#60717f] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#c8d0d5] sm:inline-flex">POC / v0.9</span>
          <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#e9e0f7] font-mono text-[10px] font-bold text-[#482873] sm:flex">AD</div>
        </div>
      </div>
    </header>
  );
}

function ShellAside({ screen, metrics, onNavigate, onReset }: { screen: Screen; metrics: ReturnType<typeof useDiligence>["metrics"]; onNavigate: (screen: Screen) => void; onReset: () => void }) {
  return (
    <aside className="hidden w-[246px] shrink-0 border-r border-[#d9e0e4] bg-[#eef2f1] px-5 py-7 lg:block">
      <SectionKicker>Active mandate</SectionKicker>
      <div className="mb-7">
        <div className="font-mono text-[11px] font-bold text-[#122232]">STARGATE / ABI-26-001</div>
         <div className="mt-1 text-xs leading-5 text-[#52616b]">AI infrastructure diligence case</div>
      </div>
      <div className="mb-8 rounded-lg border border-[#cbd8d4] bg-[#f9faf8] p-3.5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#60707d]">
          <MapPin className="h-3.5 w-3.5 text-[#ba2f45]" /> Taylor County, TX
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

function PageIntro({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: ReactNode }) {
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

function BottomNav({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
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

function DiligenceLiveRegions({ metrics }: { metrics: ReturnType<typeof useDiligence>["metrics"] }) {
  return (
    <div className="sr-only" aria-label="Diligence metric updates">
      <div data-testid="live-confidence" aria-live="polite" aria-atomic="true">
        Evidence confidence is now {metrics.confidenceScore} percent.
      </div>
      <div data-testid="live-current-irr" aria-live="polite" aria-atomic="true">
        Current IRR is now {formatIRR(metrics.projectIRR)}.
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

function CaseBrief({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
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

function EvidenceRow({ item, onChange }: { item: EvidenceItem; onChange: (id: string, value: Classification) => void }) {
  const meta = classMeta[item.classification];
  return (
    <details id={`evidence-item-${item.id}`} tabIndex={-1} data-testid={`row-evidence-${item.id}`} className="group border-b border-[#e4e9e8] last:border-0 focus-within:bg-[#fbfcfa]">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors hover:bg-[#fbfcfa] md:grid-cols-[1.55fr_0.8fr_1.55fr] md:items-center md:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} /><span className="truncate text-[12px] font-semibold text-[#243844]">{item.label}</span></span>
        <span className="min-w-0"><span className="font-mono text-[12px] font-bold text-[#122232]">{item.value}</span> <span className="text-[10px] text-[#52616b]">{item.unit}</span></span>
        <span className="flex items-center justify-between gap-3"><span className="relative w-full md:max-w-[220px]"><select data-testid={`select-classification-${item.id}`} aria-label={`Classification for ${item.label}`} value={item.classification} onChange={(event) => onChange(item.id, event.target.value as Classification)} onClick={(event) => event.stopPropagation()} className="w-full appearance-none rounded-md border bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-[#243844] outline-none focus:ring-2 focus:ring-[#b9d43a]/50" style={{ borderColor: meta.border }}>{classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#52616b]" /></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180 md:hidden" /></span>
      </summary>
      <div className="grid gap-3 bg-[#fbfcfa] px-4 pb-4 pt-1 md:grid-cols-[1.55fr_0.8fr_1.55fr] md:px-5">
        <p className="text-[10px] leading-4 text-[#52616b] md:col-span-2">{item.description}</p>
        <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[#52616b]"><FileText aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" /><span>{item.citation}</span></div>
      </div>
    </details>
  );
}

function EvidenceRoom({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, updateClassification, metrics } = useDiligence();
  const items = useMemo(() => Object.values(evidence), [evidence]);
  const counts = useMemo(() => classifications.map((classification) => ({ classification, count: items.filter((item) => item.classification === classification).length })), [items]);
  return (
    <div>
      <PageIntro
        eyebrow="02 / source the conviction"
        title="Evidence is not a footnote. It is an active model input."
        description={`${items.length} diligence inputs are classified by provenance. Change a classification to test what the return looks like when an assertion becomes an assumption, or when missing evidence is finally verified.`}
        right={<div data-testid="text-evidence-count" className="rounded-lg border border-[#cbd8d4] bg-[#f9faf8] px-4 py-3 text-right"><div className="font-mono text-xl font-bold text-[#122232]">{items.length}<span className="text-[#52616b]"> / {items.length}</span></div><div className="text-[9px] uppercase tracking-[0.14em] text-[#52616b]">Inputs registered</div></div>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {counts.map(({ classification, count }) => {
          const meta = classMeta[classification];
          return <div key={classification} data-testid={`count-classification-${meta.short.toLowerCase()}`} className="rounded-lg border p-3" style={{ borderColor: meta.border, backgroundColor: meta.bg }}><div className="flex items-center justify-between gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} /><span className="font-mono text-xl font-bold" style={{ color: meta.color }}>{count}</span></div><div className="mt-2 text-[9px] font-bold uppercase leading-3 tracking-[0.1em]" style={{ color: meta.color }}>{classification}</div></div>;
        })}
      </div>
      <div className="space-y-3">
        {evidenceCategories.map((category) => {
          const categoryItems = category.itemIds.map((id) => evidence[id]).filter(Boolean);
          const verified = categoryItems.filter((item) => item.classification === "Verified Evidence").length;
          const missing = categoryItems.filter((item) => item.classification === "Missing Evidence").length;
          return (
            <section key={category.id} id={`evidence-category-${category.id}`} data-testid={`evidence-category-${category.id}`} className="overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e0e4] bg-[#f1f5f3] px-4 py-3 md:px-5">
                <div><h2 className="text-[13px] font-semibold text-[#122232]">{category.label}</h2><p className="mt-0.5 text-[10px] text-[#7d898f]">{categoryItems.length} inputs · live provenance summary</p></div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em]"><span className="rounded-full bg-[#e0f4ed] px-2 py-1 text-[#0b7a63]">{verified} verified</span><span className={`rounded-full px-2 py-1 ${missing ? "bg-[#fde8eb] text-[#ba2f45]" : "bg-white text-[#7d898f]"}`}>{missing} missing</span></div>
              </header>
              <div className="hidden grid-cols-[1.55fr_0.8fr_1.55fr] gap-3 border-b border-[#e5eae8] px-5 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d898f] md:grid"><span>Variable</span><span>Value</span><span>Classification</span></div>
              {categoryItems.map((item) => <EvidenceRow key={item.id} item={item} onChange={updateClassification} />)}
            </section>
          );
        })}
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a65a00]" /><div><div className="text-[11px] font-bold text-[#6f460e]">Classification changes are live</div><div className="mt-1 text-[10px] leading-4 text-[#7f6337]">Materiality, confidence, and the recommendation status update as soon as a dropdown changes.</div></div></div>
        <div className="flex shrink-0 items-center gap-2 rounded border border-[#ecd39d] bg-white/50 px-2.5 py-2"><RefreshCw className="h-3.5 w-3.5 text-[#a65a00]" /><span data-testid="text-live-confidence" className="font-mono text-[10px] font-bold text-[#6f460e]">{metrics.confidenceScore}% confidence</span></div>
      </div>
      <BottomNav screen="evidence" onNavigate={onNavigate} />
    </div>
  );
}

function FinancialMateriality({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, metrics } = useDiligence();
  const impacts = Object.values(metrics.lineItems);
  const lowConfidence = metrics.confidenceScore < 25;
  const currentIRR = metrics.projectIRR;
  const baseIRR = metrics.baseIRR ?? null;
  const currentPath = metrics.schedule.map((year) => year.cumulativeEquityCashFlow);
  const basePath = metrics.baseModel?.schedule.map((year) => year.cumulativeEquityCashFlow) ?? currentPath;
  const chartValues = [...currentPath, ...basePath];
  const chartMin = Math.min(...chartValues, 0);
  const chartMax = Math.max(...chartValues, 0);
  const irrDelta = currentIRR === null || baseIRR === null ? null : currentIRR - baseIRR;
  const waterfallSteps = useMemo(() => {
    const baselineEvidence = Object.fromEntries(Object.entries(evidence).map(([id, item]) => [id, { ...item, classification: "Verified Evidence" as Classification }]));
    let beforeEvidence = baselineEvidence;
    const baseline = calculateCashFlowModel(beforeEvidence);
    return impacts.map((impact) => {
      const afterEvidence = { ...beforeEvidence, [impact.id]: { ...beforeEvidence[impact.id], classification: evidence[impact.id].classification } };
      const before = calculateCashFlowModel(beforeEvidence).projectIRR;
      const after = calculateCashFlowModel(afterEvidence).projectIRR;
      beforeEvidence = afterEvidence;
      return { ...impact, before, after };
    }).map((step, index) => ({ ...step, index, change: step.before === null || step.after === null ? null : step.after - step.before }));
  }, [evidence, impacts]);
  return (
    <div>
      <PageIntro
        eyebrow="03 / quantify the uncertainty"
        title="Trace each uncertainty into the return."
        description="A five-year annual equity cash-flow engine ties revenue timing, operating costs, CAPEX, debt service, and terminal value to each evidence classification."
        right={<div className="flex items-center gap-2 rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0b7a63]"><Sparkles className="h-3.5 w-3.5" /> Derived locally</div>}
      />
      <nav aria-label="Financial materiality sections" className="sticky top-0 z-10 mb-4 flex gap-1 overflow-x-auto rounded-lg border border-[#d9e0e4] bg-[#f9faf8]/95 p-1.5 backdrop-blur-md">
        {[
          ["materiality-summary", "Summary"],
          ["materiality-drivers", "Drivers"],
          ["materiality-full-model", "Full Model"],
        ].map(([id, label]) => <a key={id} href={`#${id}`} className="min-h-10 shrink-0 rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#52616b] hover:bg-white hover:text-[#122232]">{label}</a>)}
      </nav>
      {lowConfidence && <div className="mb-5"><LowConfidenceWarning testId="warning-low-confidence-materiality" /></div>}
      {metrics.mechanicalDisclaimer && (
        <div data-testid="banner-mechanical-disclaimer" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#ba2f45] bg-[#fff3f4] px-5 py-4 text-[#7f2635]">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-mono text-[12px] font-bold tracking-[0.08em]">MECHANICAL OUTPUTS ONLY · 0% EVIDENCE CONFIDENCE</div>
            <div className="mt-1 text-[11px] leading-5 text-[#96525d]">Every input is currently missing. Returns, payback, and terminal value are scenario mechanics—not investment-grade underwriting or a recommendation.</div>
          </div>
        </div>
      )}
      <div id="materiality-summary" className="scroll-mt-24 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
         <MetricCard testId="metric-project-irr" label="Project IRR" value={formatIRR(currentIRR)} detail={`${irrDelta === null ? "N/M" : formatIRRDelta(irrDelta, true)} vs verified baseline`} accent="lime" />
        <MetricCard testId="metric-moic" label="MOIC" value={`${metrics.moic.toFixed(2)}x`} detail="5-year hold period" accent="navy" />
        <MetricCard testId="metric-coc" label="Cash-on-cash" value={`${metrics.cashOnCash.toFixed(1)}%`} detail="Stabilized year 3" accent="violet" />
        <MetricCard testId="metric-payback" label="Payback" value={formatPayback(metrics.payback)} detail="Cumulative equity breakeven" accent="coral" />
        <MetricCard testId="metric-npv" label="NPV @ 10%" value={formatNPV(metrics.npv)} detail="Equity value created" accent="navy" />
      </div>
      <section id="materiality-drivers" data-testid="panel-irr-waterfall" aria-labelledby="irr-waterfall-title" className="mt-5 scroll-mt-24 rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-white/15 pb-4 md:flex-row md:items-end">
          <div><SectionKicker tone="lime" className="!text-[#d4e86b]">Evidence → return waterfall</SectionKicker><h2 id="irr-waterfall-title" className="text-[22px] font-semibold tracking-[-0.035em]">Every classification moves the same live model.</h2></div>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Sequential · baseline to current</span>
        </div>
        <p className="mt-3 max-w-3xl text-[11px] leading-5 text-[#c4d0d6]">This waterfall starts with every input treated as Verified Evidence, then applies the current classification one variable at a time. It is a model sensitivity view, not reported Stargate transaction performance.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b9d43a]">Verified baseline</div><div className="mt-1 font-mono text-2xl font-bold text-[#d4e86b]">{formatIRR(baseIRR)}</div></div>
          {waterfallSteps.map((step) => {
            const tone = step.change !== null && step.change < 0 ? "text-[#f5ddd5]" : "text-[#b9d43a]";
            return <div key={step.id} data-testid={`waterfall-step-${step.id}`} className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="truncate text-[10px] font-semibold text-[#e3eaed]">{evidence[step.id].label}</div><div className="mt-1 flex items-baseline justify-between gap-2"><span className={`font-mono text-sm font-bold ${tone}`}>{formatIRR(step.after)}</span><span className={`font-mono text-[9px] font-bold ${tone}`}>{formatIRRDelta(step.change, true)}</span></div><div className="mt-1 text-[9px] text-[#9dafb8]">{evidence[step.id].classification}</div></div>;
          })}
          <div className="rounded-lg border-2 border-[#f5ddd5]/60 bg-[#f5ddd5]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#f5ddd5]">Current case</div><div data-testid="waterfall-current-irr" className="mt-1 font-mono text-2xl font-bold text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
        </div>
        <div className="sr-only" aria-live="polite">Verified baseline {formatIRR(baseIRR)}. Current case {formatIRR(currentIRR)}. Change {irrDelta === null ? "unavailable" : `${formatIRRDelta(irrDelta, true).replace(" pts", " percentage points")}`}.</div>
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4"><div><SectionKicker>Evidence → financial materiality</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Where the model feels the uncertainty</h2></div><span className="font-mono text-[10px] text-[#52616b]">Δ IRR / variable</span></div>
          <div className="mt-2 divide-y divide-[#e5eae8]">
            {impacts.map((impact) => {
              const item = evidence[impact.id];
              const effectTone = impact.deltaIRR < 0 ? "text-[#ba2f45]" : impact.deltaIRR > 0 ? "text-[#0b7a63]" : "text-[#63717a]";
              return <div key={impact.id} data-testid={`row-materiality-${impact.id}`} className="grid grid-cols-[1fr_auto] gap-4 py-4 sm:grid-cols-[1.2fr_0.9fr_0.75fr_0.5fr] sm:items-center">
                <div><div className="text-[12px] font-semibold text-[#243844]">{item.label}</div><div className="mt-1 text-[10px] text-[#52616b]">{impact.driver}</div></div>
                <div className="sm:col-auto"><ClassificationBadge value={item.classification} compact /></div>
                <div className="text-right font-mono text-[11px] font-bold text-[#4d5c65] sm:text-left">{formatLineItemValue(impact.value, impact.unit)}</div>
                <div className={`hidden text-right font-mono text-[12px] font-bold sm:block ${effectTone}`}>{formatIRRDelta(impact.deltaIRR, true)}</div>
              </div>;
            })}
          </div>
        </section>
        <section data-testid="panel-baseline-current" className="rounded-xl border-2 border-[#d4e86b]/35 bg-[#122232] p-5 text-white md:p-6">
          <div className="flex items-start justify-between"><div><SectionKicker tone="lime" className="!text-[#d4e86b]">Return path</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em]">Verified baseline → current case</h2></div>{irrDelta !== null && irrDelta < 0 ? <TrendingDown className="h-5 w-5 text-[#f5ddd5]" /> : <TrendingUp className="h-5 w-5 text-[#d4e86b]" />}</div>
          {lowConfidence && <div className="mt-4"><LowConfidenceWarning testId="warning-low-confidence-materiality-return" /></div>}
          <div className="mt-8 flex items-end gap-5">
             <div><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#9dafb8]">Verified IRR baseline</div><div className="mt-2 font-mono text-[46px] font-bold leading-none tracking-[-0.07em] text-[#b9d43a]">{formatIRR(baseIRR)}</div></div>
            <ArrowRight className="mb-2 h-5 w-5 text-[#7c909d]" />
             <div><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#9dafb8]">Current evidence-adjusted IRR</div><div data-testid="text-current-irr-materiality" className="mt-2 font-mono text-[46px] font-bold leading-none tracking-[-0.07em] text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
          </div>
          <div className="mt-4 rounded-lg border border-[#f5ddd5]/30 bg-[#f5ddd5]/10 px-3 py-2 font-mono text-[12px] font-bold text-[#f5ddd5]">{irrDelta === null ? "Baseline delta unavailable" : `${formatIRRDelta(irrDelta, true).replace(" pts", " percentage points")} from verified baseline`}</div>
          {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && (
            <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[#f5ddd5]">
              <span className="line-through opacity-60">{formatIRR(metrics.lastChange.from)} prior</span>
              <span className="rounded bg-[#f5ddd5] px-2 py-1 font-bold text-[#ba2f45]">{formatIRRDelta(metrics.lastChange.delta, true)} since reclassification</span>
            </div>
          )}
          <div className="mt-5 h-28 border-b border-l border-white/20 px-3 pb-2 pt-3">
            <div className="relative h-full">
              <svg viewBox="0 0 500 72" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                <polyline points={chartPoints(basePath, chartMin, chartMax)} fill="none" stroke="#b9d43a" strokeWidth="3" strokeDasharray="5 4" />
                <polyline points={chartPoints(currentPath, chartMin, chartMax)} fill="none" stroke="#f5ddd5" strokeWidth="3" />
              </svg>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-[#c4d0d6]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#b9d43a]" />Verified baseline</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f5ddd5]" />Current case</span></div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-[#8299a6]"><span>Y0 / close</span><span>Y5 / exit</span><span>cumulative equity cash flow · $M</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Revenue delay</div><div className="mt-1 font-mono text-sm text-[#f5ddd5]">+{metrics.revenueDelayMonths} mo</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">CAPEX contingency</div><div className="mt-1 font-mono text-sm text-[#f5ddd5]">{formatCurrency(metrics.incrementalCapex)}</div></div>
          </div>
        </section>
      </div>
       <details id="materiality-full-model" data-testid="disclosure-full-model-detail" className="mt-5 scroll-mt-24 rounded-xl border border-[#d9e0e4] bg-[#eef2f1]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#122232] [&::-webkit-details-marker]:hidden"><span>Full Model Detail · assumptions and cash flow</span><ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform [details[open]_&]:rotate-180" /></summary>
        <section className="border-t border-[#d9e0e4] p-5 md:p-6">
        <div className="flex items-end justify-between border-b border-[#d6e0dc] pb-4">
          <div>
            <SectionKicker>Project-level return model</SectionKicker>
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">A transparent bridge from operations to returns.</h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#52616b]">5-year / client-side</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Revenue build", `${formatCurrency(metrics.assumptions.annualRevenueAtFullUtilization)} full run-rate`, `${metrics.assumptions.capacityMW} MW × $${metrics.assumptions.leaseRatePerKwMonth} / kW-mo · ${metrics.assumptions.revenueDelayMonths} mo delay`],
            ["OPEX build", `${formatCurrency(metrics.schedule[5]?.totalOpex ?? 0)} Y5 OPEX`, "Power, water, maintenance, labor, insurance, compliance, and climate disruption"],
            ["Climate disruption cost", `${formatCurrency(metrics.schedule[5]?.climateDisruptionOpex ?? 0)} Y5 OPEX`, `${(metrics.assumptions.adjustedHazardProbability * 100).toFixed(1)}% adjusted annual hazard × $${Math.round(metrics.assumptions.adjustedDowntimeCostPerDay / 1000)}K/day`],
            ["CAPEX schedule", `${formatCurrency(metrics.assumptions.totalCapex)} total`, `${formatCurrency(metrics.assumptions.entryValue)} entry + ${formatCurrency(metrics.assumptions.coolingCapex)} cooling + ${formatCurrency(metrics.assumptions.capexContingency)} contingency`],
            ["Climate contingencies", formatCurrency(metrics.assumptions.backupPowerCapex + metrics.assumptions.waterConversionCapex), `${formatCurrency(metrics.assumptions.backupPowerCapex)} backup power + ${formatCurrency(metrics.assumptions.waterConversionCapex)} cooling conversion`],
            ["Debt structure", `${formatCurrency(metrics.assumptions.debtAmount)} opening debt`, `60% LTV · 7.5% interest · ${formatCurrency(metrics.assumptions.annualPrincipalPayment)} annual principal`],
            ["Terminal value", `${formatCurrency(metrics.terminalValue)} gross exit`, `${formatCurrency(metrics.schedule[5]?.noi ?? 0)} Y5 NOI × ${metrics.assumptions.exitMultiple.toFixed(1)}x`],
            ["Equity cash flows", `${formatCurrency(metrics.equityInvested)} invested`, `${formatCurrency(metrics.totalDistributions)} total distributions · true equity returns`],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg border border-[#d9e0e4] bg-white p-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">{label}</div>
              <div className="mt-2 font-mono text-[12px] font-bold text-[#122232]">{value}</div>
              <div className="mt-1 text-[10px] leading-4 text-[#52616b]">{detail}</div>
            </div>
          ))}
         </div>
         {lowConfidence && <div className="mt-5"><LowConfidenceWarning testId="warning-low-confidence-materiality-model" /></div>}
        <div className="mt-5 overflow-x-auto rounded-lg border border-[#d9e0e4] bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">Five-year annual project cash-flow schedule</caption>
            <thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">
              <tr><th className="px-3 py-3">Year</th><th className="px-3 py-3">Revenue</th><th className="px-3 py-3">Climate disruption OPEX</th><th className="px-3 py-3">NOI</th><th className="px-3 py-3">Debt service</th><th className="px-3 py-3">Terminal value</th><th className="px-3 py-3">Net equity CF</th><th className="px-3 py-3">Cumulative CF</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e5eae8] font-mono text-[10px] text-[#344550]">
              {metrics.schedule.map((year) => (
                <tr key={year.year} className={year.year === 5 ? "bg-[#f8fbe8]" : undefined}>
                  <th className="px-3 py-3 font-bold text-[#122232]">{year.year === 0 ? "Close" : `Y${year.year}`}</th>
                  <td className="px-3 py-3">{formatCurrency(year.revenue)}</td>
                  <td data-testid={`text-climate-opex-y${year.year}`} className="px-3 py-3">{year.year === 0 ? "—" : formatCurrency(year.climateDisruptionOpex)}</td>
                  <td className="px-3 py-3">{formatCurrency(year.noi)}</td>
                  <td className="px-3 py-3">{formatCurrency(year.interest + year.principal)}</td>
                  <td className="px-3 py-3">{year.terminalValue ? formatCurrency(year.terminalValue) : "—"}</td>
                  <td className={`px-3 py-3 font-bold ${year.netEquityCashFlow < 0 ? "text-[#ba2f45]" : "text-[#0b7a63]"}`}>{formatCurrency(year.netEquityCashFlow)}</td>
                  <td className="px-3 py-3">{formatCurrency(year.cumulativeEquityCashFlow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       </section>
       </details>
      <section className="mt-5 rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6" aria-labelledby="mechanics-flow-title">
        <SectionKicker>Model mechanics</SectionKicker>
        <h2 id="mechanics-flow-title" className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Five links from evidence to return.</h2>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          {[
            ["01", "Evidence", "Classifications set confidence and stress inputs."],
            ["02", "Timing", `${metrics.revenueDelayMonths} months of modeled revenue delay.`],
            ["03", "Revenue / OPEX", "Power, water, climate, and operating costs flow through."],
            ["04", "Equity Cash Flow", "Debt, distributions, and terminal value create the equity path."],
            ["05", "Return", `${formatIRR(currentIRR)} current project IRR.`],
          ].map(([number, title, detail], index) => <div key={title} className="relative rounded-lg border border-[#d9e0e4] bg-[#f1f5f3] p-3 md:min-h-[116px]"><div className="font-mono text-[9px] font-bold text-[#255bb7]">{number}</div><div className="mt-2 text-[12px] font-semibold text-[#122232]">{title}</div><div className="mt-1 text-[10px] leading-4 text-[#52616b]">{detail}</div>{index < 4 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-white text-[#b9d43a] md:block" />}</div>)}
        </div>
        <p className="mt-4 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#6f460e]"><strong>SYNTHETIC transaction assumptions:</strong> entry value, lease rate, CAPEX, debt, and terminal multiple are representative underwriting inputs—not reported Stargate terms.</p>
      </section>
      <BottomNav screen="materiality" onNavigate={onNavigate} />
    </div>
  );
}
function ScenarioComparison({ scenarios }: { scenarios: SavedScenario[] }) {
  const [firstId, setFirstId] = useState(scenarios[0]?.id ?? "");
  const [secondId, setSecondId] = useState(scenarios[1]?.id ?? scenarios[0]?.id ?? "");

  useEffect(() => {
    setFirstId((current) => scenarios.some((scenario) => scenario.id === current) ? current : scenarios[0]?.id ?? "");
    setSecondId((current) => scenarios.some((scenario) => scenario.id === current) ? current : scenarios[1]?.id ?? scenarios[0]?.id ?? "");
  }, [scenarios]);

  if (scenarios.length < 2) {
    return (
      <section data-testid="panel-scenario-comparison" className="mt-5 rounded-xl border border-[#d9e0e4] bg-[#eef2f1] p-5 md:p-6">
        <SectionKicker>Scenario comparison</SectionKicker>
        <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Build a second case to compare</h2>
        <p className="mt-2 max-w-xl text-[11px] leading-5 text-[#65737d]">Save the current evidence-adjusted case, change one or more classifications, then save another named scenario. Both snapshots will remain independent of the live workbench.</p>
        <div className="mt-4 rounded-lg border border-[#ecd39d] bg-[#fff8e9] px-3 py-2 text-[10px] font-semibold text-[#7f6337]">At least two saved scenarios are required.</div>
      </section>
    );
  }

  const first = scenarios.find((scenario) => scenario.id === firstId) ?? scenarios[0];
  const second = scenarios.find((scenario) => scenario.id === secondId) ?? scenarios.find((scenario) => scenario.id !== first.id) ?? scenarios[1];
  const rows: { label: string; key: keyof SavedScenario["metrics"]; metric: "irr" | "moic" | "npv" | "cashOnCash" | "payback" | "confidence" }[] = [
    { label: "Project IRR", key: "projectIRR", metric: "irr" },
    { label: "MOIC", key: "moic", metric: "moic" },
    { label: "NPV @ 10%", key: "npv", metric: "npv" },
    { label: "Cash-on-cash", key: "cashOnCash", metric: "cashOnCash" },
    { label: "Payback", key: "payback", metric: "payback" },
    { label: "Confidence", key: "confidence", metric: "confidence" },
  ];

  const chooseFirst = (id: string) => {
    setFirstId(id);
    if (id === secondId) {
      setSecondId(scenarios.find((scenario) => scenario.id !== id)?.id ?? "");
    }
  };

  return (
    <section data-testid="panel-scenario-comparison" className="mt-5 rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-4 border-b border-[#e5eae8] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <SectionKicker>Scenario comparison</SectionKicker>
          <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Compare two evidence-driven cases</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#65737d]">Deltas are shown as second scenario minus first scenario. Saved values are fixed at capture time.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7d898f]">
            First scenario
            <select data-testid="select-scenario-first" value={first.id} onChange={(event) => chooseFirst(event.target.value)} className="mt-1 block min-w-[150px] rounded-md border border-[#cbd8d4] bg-white px-2.5 py-2 text-[11px] font-semibold normal-case tracking-normal text-[#243844]">
              {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select>
          </label>
          <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7d898f]">
            Second scenario
            <select data-testid="select-scenario-second" value={second.id} onChange={(event) => setSecondId(event.target.value)} className="mt-1 block min-w-[150px] rounded-md border border-[#cbd8d4] bg-white px-2.5 py-2 text-[11px] font-semibold normal-case tracking-normal text-[#243844]">
              {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id} disabled={scenario.id === first.id}>{scenario.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      {first.id === second.id ? (
        <div className="mt-4 rounded-lg border border-[#efabb8] bg-[#fff3f4] px-3 py-2 text-[10px] font-semibold text-[#ba2f45]">Choose two distinct saved scenarios to calculate deltas.</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Side-by-side comparison of saved scenarios</caption>
            <thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.13em] text-[#7d898f]">
              <tr><th className="px-3 py-3">Metric</th><th className="px-3 py-3">{first.name}</th><th className="px-3 py-3">{second.name}</th><th className="px-3 py-3">Signed delta</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e5eae8] text-[11px] text-[#344550]">
              {rows.map((row) => {
                const firstValue = first.metrics[row.key];
                const secondValue = second.metrics[row.key];
                const delta = formatScenarioDelta(firstValue, secondValue, row.metric);
                const isPositive = delta.startsWith("+");
                const isNegative = delta.startsWith("−") || delta.startsWith("-");
                return (
                  <tr key={row.key} data-testid={`row-scenario-comparison-${row.key}`}>
                    <th className="px-3 py-3 font-semibold text-[#52616b]">{row.label}</th>
                    <td className="px-3 py-3 font-mono font-bold text-[#122232]">{formatScenarioMetric(firstValue, row.metric)}</td>
                    <td className="px-3 py-3 font-mono font-bold text-[#122232]">{formatScenarioMetric(secondValue, row.metric)}</td>
                    <td className={`px-3 py-3 font-mono font-bold ${isPositive ? "text-[#0b7a63]" : isNegative ? "text-[#ba2f45]" : "text-[#65737d]"}`}>{delta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SavedScenarioList({
  scenarios,
  onRename,
  onRemove,
}: {
  scenarios: SavedScenario[];
  onRename: (scenario: SavedScenario) => void;
  onRemove: (scenario: SavedScenario) => void;
}) {
  if (scenarios.length === 0) return null;

  return (
    <section data-testid="panel-saved-scenarios" className="mt-5 rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-2 border-b border-[#e5eae8] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionKicker>Named snapshots</SectionKicker>
          <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Manage saved scenarios</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#65737d]">Rename an outdated case or remove it from the comparison set. These actions do not change the live evidence classifications.</p>
        </div>
        <span data-testid="text-scenario-count" className="font-mono text-[10px] text-[#7d898f]">{scenarios.length}/5 saved</span>
      </div>
      <div className="divide-y divide-[#e5eae8]">
        {scenarios.map((scenario) => (
          <div key={scenario.id} data-testid={`scenario-card-${scenario.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div data-testid={`text-scenario-name-${scenario.id}`} className="truncate text-[12px] font-semibold text-[#122232]">{scenario.name}</div>
              <time dateTime={scenario.savedAt} className="mt-1 block text-[10px] text-[#7d898f]">
                Saved {new Date(scenario.savedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
              </time>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" data-testid={`button-rename-scenario-${scenario.id}`} onClick={() => onRename(scenario)} className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd8d4] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#344550] hover:border-[#122232] hover:text-[#122232]">
                <Pencil aria-hidden="true" className="h-3 w-3" /> Rename
              </button>
              <button type="button" data-testid={`button-remove-scenario-${scenario.id}`} onClick={() => onRemove(scenario)} className="inline-flex items-center gap-1.5 rounded-md border border-[#efabb8] bg-[#fff3f4] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[#ba2f45] hover:bg-[#ba2f45] hover:text-white">
                <Trash2 aria-hidden="true" className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DecisionReview({ onNavigate, onResolve }: { onNavigate: (screen: Screen) => void; onResolve: (id: string) => void }) {
  const { evidence, metrics, scenarios, saveScenario, renameScenario, removeScenario } = useDiligence();
  const items = Object.values(evidence);
  const [saveOpen, setSaveOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameScenarioId, setRenameScenarioId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameFeedback, setRenameFeedback] = useState("");
  const [removeScenarioId, setRemoveScenarioId] = useState<string | null>(null);
  const lowConfidence = metrics.confidenceScore < 25;
  const scenarioToRemove = scenarios.find((scenario) => scenario.id === removeScenarioId);
  const statusMeta = {
    BLOCKED: { color: "#ba2f45", bg: "#fde8eb", border: "#efabb8" },
    CONDITIONAL: { color: "#a65a00", bg: "#fff0d6", border: "#f1cb8b" },
    "READY FOR REVIEW": { color: "#0b7a63", bg: "#e0f4ed", border: "#9bd8c5" },
  }[metrics.recommendationStatus];
  const decisionCopy = {
    BLOCKED: {
      title: "Do not advance on return alone.",
      description: "The asset may still be compelling, but material evidence gaps prevent a clean recommendation.",
      icon: <TriangleAlert className="h-5 w-5" />,
    },
    CONDITIONAL: {
      title: "Advance with explicit conditions.",
      description: "Material assumptions remain unverified. Carry the named evidence dependencies into the investment committee discussion.",
      icon: <CircleAlert className="h-5 w-5" />,
    },
    "READY FOR REVIEW": {
      title: "Advance to investment committee review.",
      description: "Every material input is supported by verified evidence or management assertion. Preserve the distinction between verified inputs and modeled interpretation.",
      icon: <ShieldCheck className="h-5 w-5" />,
    },
  }[metrics.recommendationStatus];
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to) {
      setFlash(true);
      const timer = window.setTimeout(() => setFlash(false), 1800);
      return () => window.clearTimeout(timer);
    }
    setFlash(false);
    return undefined;
  }, [metrics.lastChange]);
  const grouped = classifications.map((classification) => ({ classification, items: items.filter((item) => item.classification === classification) })).filter((group) => group.items.length);
  const disputed = items.filter((item) => item.classification === "Management Assertion" || item.classification === "Missing Evidence");
  return (
    <div>
      <PageIntro
        eyebrow="04 / make the call"
        title="A return without provenance is not a decision."
        description="Bring the evidence quality and the financial outcome into the same frame. The recommendation is derived from the status of material evidence, not from the return alone."
        right={<div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end"><div data-testid="card-recommendation-status" className="rounded-lg border px-4 py-3" style={{ color: statusMeta.color, backgroundColor: statusMeta.bg, borderColor: statusMeta.border }}><div className="text-[9px] font-bold uppercase tracking-[0.14em]">Recommendation status</div><div data-testid="status-recommendation" className="mt-1 font-mono text-sm font-bold">{metrics.recommendationStatus}</div></div><div className="flex gap-2"><button data-testid="button-save-scenario" disabled={scenarios.length >= 5} onClick={() => { setSaveFeedback(""); setSaveOpen(true); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#122232] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#87939a] disabled:text-white">Save Scenario <span className="font-mono text-[9px] opacity-70">({scenarios.length}/5)</span></button><button data-testid="button-compare-scenarios" onClick={() => setShowComparison((value) => !value)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-[#cbd8d4] bg-white px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#122232] hover:border-[#122232]">{showComparison ? "Hide comparison" : "Compare Scenarios"}</button></div></div>}
      />
      {scenarios.length >= 5 && <div role="status" data-testid="text-scenario-capacity" className="mb-5 rounded-lg border border-[#ecd39d] bg-[#fff8e9] px-4 py-3 text-[11px] font-semibold text-[#7f6337]">Scenario capacity reached (5/5). Save Scenario is disabled; named snapshots remain independent of the live case.</div>}
      {saveFeedback && <div role="status" data-testid="text-scenario-feedback" className={`mb-5 rounded-lg border px-4 py-3 text-[11px] font-semibold ${saveFeedback.startsWith("A scenario") || saveFeedback.startsWith("Five") ? "border-[#efabb8] bg-[#fff3f4] text-[#ba2f45]" : "border-[#9bd8c5] bg-[#e0f4ed] text-[#0b7a63]"}`}>{saveFeedback}</div>}
       <SavedScenarioList
         scenarios={scenarios}
         onRename={(scenario) => {
           setRenameScenarioId(scenario.id);
           setRenameName(scenario.name);
           setRenameFeedback("");
           setRenameOpen(true);
         }}
         onRemove={(scenario) => setRemoveScenarioId(scenario.id)}
       />
      {showComparison && <ScenarioComparison scenarios={scenarios} />}
      {metrics.recommendationStatus === "BLOCKED" && <div data-testid="banner-recommendation-blocked" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#ba2f45] bg-[#fff3f4] px-5 py-4 text-[#7f2635]"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">RECOMMENDATION BLOCKED: {metrics.missingMaterialCount} material items are missing evidence</div><div className="mt-1 text-[11px] leading-5 text-[#96525d]">Resolve the material evidence gaps below before treating the base return as investment-grade.</div></div></div>}
      {metrics.recommendationStatus === "CONDITIONAL" && <div data-testid="banner-recommendation-conditional" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#a65a00] bg-[#fff8e9] px-5 py-4 text-[#6f460e]"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">CONDITIONAL: {metrics.materialUnverifiedCount} material assumptions depend on unverified evidence</div><div className="mt-1 text-[11px] leading-5 text-[#806d51]">Name the evidence owners and carry these conditions into review.</div></div></div>}
      {metrics.recommendationStatus === "READY FOR REVIEW" && <div data-testid="banner-recommendation-ready" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#0b7a63] bg-[#f0faf5] px-5 py-4 text-[#0b6351]"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">READY FOR REVIEW: all material evidence is supported</div><div className="mt-1 text-[11px] leading-5 text-[#4b756b]">The return is ready for an IC discussion with its provenance preserved.</div></div></div>}
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className={`motion-scale rounded-xl border border-[#d9e0e4] bg-[#122232] p-6 text-white transition-transform ${flash ? "scale-[1.01]" : ""}`} data-testid="panel-decision-return">
          <div className="flex items-start justify-between"><div><SectionKicker tone="lime" className="!text-[#d4e86b]">Prominent base return</SectionKicker><div className="mt-2 text-[10px] uppercase tracking-[0.17em] text-[#a4b4bd]">Evidence-adjusted project IRR</div></div><Gauge className="h-5 w-5 text-[#b9d43a]" /></div>
          {lowConfidence && <div className="mt-4"><LowConfidenceWarning testId="warning-low-confidence-decision" /></div>}
          <div className="mt-5 flex items-end justify-between gap-3">
            <div data-testid="text-decision-irr" className="font-mono text-[64px] font-bold leading-none tracking-[-0.08em] text-[#d4e86b]">{formatIRR(metrics.projectIRR)}</div>
            {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && <div className={`mb-1 flex flex-col items-end gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold ${metrics.lastChange.delta < 0 ? "bg-[#f5ddd5] text-[#ba2f45]" : "bg-[#e0f4ed] text-[#0b7a63]"}`}><span className="opacity-60 line-through">{formatIRR(metrics.lastChange.from)} prior</span><span>{formatIRRDelta(metrics.lastChange.delta, true)}</span></div>}
          </div>
          <div className="mt-5 border-t border-white/15 pt-4 text-[11px] leading-5 text-[#afbdc4]">Verified underwriting: <span className="font-mono text-white">{formatIRR(metrics.baseIRR ?? null)}</span>. The current return reflects evidence quality, timeline drag, and infrastructure risk.</div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">MOIC</div><div className="mt-1 font-mono text-sm">{metrics.moic.toFixed(2)}x</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">NPV</div><div className="mt-1 font-mono text-sm">{formatNPV(metrics.npv)}</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">Confidence</div><div data-testid="text-decision-confidence" className="mt-1 font-mono text-sm text-[#d4e86b]">{metrics.confidenceScore}%</div></div>
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4"><div><SectionKicker>Evidence quality mix</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">What is carrying the case?</h2></div><span className="font-mono text-[10px] text-[#52616b]">{metrics.confidenceScore}% weighted</span></div>
          <div className="mt-4 space-y-3">
            {grouped.map((group) => <div key={group.classification} data-testid={`group-quality-${classMeta[group.classification].short.toLowerCase()}`} className="flex items-center gap-3"><ClassificationBadge value={group.classification} compact /><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#edf1ef]"><div className="motion-bar h-full rounded-full transition-all duration-500" style={{ width: `${(group.items.length / items.length) * 100}%`, backgroundColor: classMeta[group.classification].color }} /></div><span className="w-5 text-right font-mono text-[11px] font-bold text-[#52616b]">{group.items.length}</span></div>)}
          </div>
          <div className="mt-6 grid gap-3 border-t border-[#e5eae8] pt-5 sm:grid-cols-2">
            <div><div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">Disputed / unverified</div><div className="mt-2 font-mono text-2xl font-bold text-[#ba2f45]">{disputed.length}</div><div className="mt-1 text-[10px] text-[#52616b]">Assertions or missing source</div></div>
            <div><div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">Material gap count</div><div className="mt-2 font-mono text-2xl font-bold text-[#a65a00]">{metrics.missingMaterialCount}</div><div className="mt-1 text-[10px] text-[#52616b]">Blocking the recommendation</div></div>
          </div>
        </section>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-center justify-between"><div><SectionKicker tone="warning">Material evidence gaps</SectionKicker><h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">Items that need a named owner</h2></div><CircleAlert className="h-5 w-5 text-[#ba2f45]" /></div>
          <p data-testid="text-climate-material-dependencies" className="mt-3 rounded-md bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#7f6337]">Backup power capacity and water-source resilience are material recommendation dependencies. Missing evidence blocks review; model inference or user assumption keeps the decision conditional.</p>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {items.filter((item) => item.classification === "Missing Evidence").map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><div className="text-[11px] font-semibold text-[#344550]">{item.label}</div><div className="mt-1 text-[10px] text-[#52616b]">{item.citation}</div></div><button type="button" data-testid={`button-resolve-${item.id}`} onClick={() => onResolve(item.id)} className="shrink-0 rounded bg-[#fde8eb] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.11em] text-[#ba2f45] hover:bg-[#ba2f45] hover:text-white">Resolve <ArrowRight aria-hidden="true" className="ml-1 inline h-3 w-3" /></button></div>)}
            {items.filter((item) => item.classification === "Missing Evidence").length === 0 && <div className="rounded-md bg-[#e0f4ed] p-3 text-[11px] text-[#0b7a63]">No missing evidence items. The recommendation can move to review.</div>}
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-5 md:p-6">
          <SectionKicker>Decision posture</SectionKicker>
          <div className="mt-2 flex items-start gap-3"><div className={`rounded-md p-2.5 ${metrics.recommendationStatus === "BLOCKED" ? "bg-[#f5ddd5] text-[#ba2f45]" : metrics.recommendationStatus === "CONDITIONAL" ? "bg-[#fff0d6] text-[#a65a00]" : "bg-[#d4e86b] text-[#314207]"}`}>{decisionCopy.icon}</div><div><h2 className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">{decisionCopy.title}</h2><p className="mt-2 text-[11px] leading-5 text-[#65737d]">{decisionCopy.description}</p></div></div>
          <button data-testid="button-open-advisor-lens" onClick={() => onNavigate("advisor")} className="mt-6 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#122232] hover:text-[#607500]">Carry this into the advisor lens <ArrowRight className="h-3.5 w-3.5" /></button>
        </section>
      </div>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="border-[#cbd8d4] bg-[#f9faf8]">
          <DialogHeader>
            <DialogTitle className="text-[#122232]">Save Scenario</DialogTitle>
            <DialogDescription className="text-[#65737d]">Capture the current evidence classifications and calculated returns as a named snapshot. The snapshot will not change when the live case changes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => {
            event.preventDefault();
            const result = saveScenario(scenarioName);
            if (!result.ok) {
              setSaveFeedback(result.reason === "empty-name" ? "A scenario name is required." : result.reason === "duplicate-name" ? "A scenario with that name already exists." : "Five scenarios are already saved. Resetting does not remove named scenarios.");
              return;
            }
            setSaveFeedback(`Scenario “${result.scenario.name}” saved.`);
            setScenarioName("");
            setSaveOpen(false);
          }}>
            <label htmlFor="scenario-name" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Scenario name</label>
            <Input id="scenario-name" data-testid="input-scenario-name" autoFocus value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} placeholder="e.g. Water rights resolved" className="mt-2 border-[#cbd8d4] bg-white text-[#122232]" aria-invalid={Boolean(saveFeedback && !saveFeedback.startsWith("Scenario “"))} />
            {saveFeedback && !saveFeedback.startsWith("Scenario “") && <p role="alert" data-testid="text-scenario-dialog-error" className="mt-2 text-[10px] font-semibold text-[#ba2f45]">{saveFeedback}</p>}
            <DialogFooter className="mt-5">
              <button type="button" onClick={() => setSaveOpen(false)} className="rounded-md border border-[#cbd8d4] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#52616b] hover:border-[#122232]">Cancel</button>
              <button type="submit" data-testid="button-confirm-save-scenario" className="rounded-md bg-[#122232] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b]">Save Scenario</button>
            </DialogFooter>
          </form>
        </DialogContent>
       </Dialog>
       <Dialog open={renameOpen} onOpenChange={(open) => {
         setRenameOpen(open);
         if (!open) {
           setRenameScenarioId(null);
           setRenameFeedback("");
         }
       }}>
         <DialogContent className="border-[#cbd8d4] bg-[#f9faf8]">
           <DialogHeader>
             <DialogTitle className="text-[#122232]">Rename Scenario</DialogTitle>
             <DialogDescription className="text-[#65737d]">Give this saved snapshot a distinct name. Its classifications, metrics, and saved timestamp will remain unchanged.</DialogDescription>
           </DialogHeader>
           <form onSubmit={(event) => {
             event.preventDefault();
             if (!renameScenarioId) return;
             const result = renameScenario(renameScenarioId, renameName);
             if (!result.ok) {
               setRenameFeedback(result.reason === "empty-name" ? "A scenario name is required." : result.reason === "duplicate-name" ? "A scenario with that name already exists." : "That saved scenario is no longer available.");
               return;
             }
             setSaveFeedback(`Scenario “${result.scenario.name}” renamed.`);
             setRenameScenarioId(null);
             setRenameFeedback("");
             setRenameOpen(false);
           }}>
             <label htmlFor="rename-scenario-name" className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Scenario name</label>
             <Input id="rename-scenario-name" data-testid="input-rename-scenario-name" autoFocus value={renameName} onChange={(event) => setRenameName(event.target.value)} className="mt-2 border-[#cbd8d4] bg-white text-[#122232]" aria-invalid={Boolean(renameFeedback)} />
             {renameFeedback && <p role="alert" data-testid="text-rename-scenario-dialog-error" className="mt-2 text-[10px] font-semibold text-[#ba2f45]">{renameFeedback}</p>}
             <DialogFooter className="mt-5">
               <button type="button" onClick={() => setRenameOpen(false)} className="rounded-md border border-[#cbd8d4] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#52616b] hover:border-[#122232]">Cancel</button>
               <button type="submit" data-testid="button-confirm-rename-scenario" className="rounded-md bg-[#122232] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b]">Rename Scenario</button>
             </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>
       <AlertDialog open={Boolean(scenarioToRemove)} onOpenChange={(open) => {
         if (!open) setRemoveScenarioId(null);
       }}>
         <AlertDialogContent className="border-[#efabb8] bg-[#fffafa]">
           <AlertDialogHeader>
             <AlertDialogTitle className="text-[#122232]">Remove “{scenarioToRemove?.name}”?</AlertDialogTitle>
             <AlertDialogDescription className="text-[#65737d]">This permanently removes the saved snapshot from browser storage and the comparison set. Your live evidence classifications will not change.</AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel data-testid="button-cancel-remove-scenario" className="border-[#cbd8d4] text-[#52616b]">Keep Scenario</AlertDialogCancel>
             <AlertDialogAction data-testid="button-confirm-remove-scenario" onClick={() => {
               if (!removeScenarioId) return;
               const result = removeScenario(removeScenarioId);
               if (result.ok) setSaveFeedback(`Scenario “${result.scenario.name}” removed.`);
               setRemoveScenarioId(null);
             }} className="border-[#ba2f45] bg-[#ba2f45] text-white hover:bg-[#9c2439]">Remove Scenario</AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
       <BottomNav screen="decision" onNavigate={onNavigate} />
    </div>
  );
}
function AdvisorLens({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, metrics } = useDiligence();
  const verifiedCount = Object.values(evidence).filter((item) => item.classification === "Verified Evidence").length;
  const evidenceCount = Object.keys(evidence).length;
  const riskTier = getRiskTier(verifiedCount);
  const currentIRR = metrics.projectIRR ?? null;
  const baseIRR = metrics.baseIRR ?? null;
  const governanceGap = getGovernanceIRRGap(baseIRR, currentIRR);
  const prioritizedQuestions = useMemo(() => prioritizeAdvisorQuestions(evidence), [evidence]);
  const exposureChain = [
    { label: "Client’s Values-Aligned Portfolio", detail: "The allocation expresses the client’s values", tone: "neutral" },
    { label: "Sustainable Investment Fund", detail: "The fund screens for values-aligned exposure", tone: "blue" },
    { label: "NVIDIA", detail: "20%+ of the iShares fund", tone: "coral" },
    { label: "GPU Orders", detail: "Forward demand for accelerated computing", tone: "lime" },
    { label: "Hyperscaler CAPEX", detail: "$650B in planned spending", tone: "violet" },
    { label: "Stargate Abilene", detail: "Physical infrastructure under diligence", tone: "navy" },
  ] as const;
  const exposureTone: Record<(typeof exposureChain)[number]["tone"], { background: string; border: string; color: string }> = {
    neutral: { background: "#f1f5f3", border: "#cbd8d4", color: "#344550" },
    blue: { background: "#e5efff", border: "#aac6f4", color: "#255bb7" },
    coral: { background: "#fde8eb", border: "#efabb8", color: "#ba2f45" },
    lime: { background: "#eef5cd", border: "#c9db70", color: "#506600" },
    violet: { background: "#eee7fa", border: "#cbb7ec", color: "#7049b7" },
    navy: { background: "#122232", border: "#122232", color: "#d4e86b" },
  };
  const conversations = [
    {
      number: "01",
      topic: "Fund alignment",
      question: "Is my fund still aligned with my values?",
      framework: "The question is not about the rating. It is about whether the fund manager is applying evidence standards to the infrastructure assumptions driving the fund’s largest holding. The screening selected NVIDIA. The question is whether anyone verified what happens downstream.",
      action: "Ask your fund manager what site-level evidence standards they apply to AI infrastructure holdings.",
      accent: "blue",
    },
    {
      number: "02",
      topic: "AI risk in the portfolio",
        question: "Should I be worried about AI risk?",
        framework: "The risk is not AI itself. The risk is that the infrastructure build is outrunning the evidence base. Public reporting describes $130B in projects blocked—not because technology failed, but because water, power, and community assumptions were not verified.",
        action: "Review concentration in AI infrastructure-dependent holdings and the evidence quality behind them.",
      accent: "coral",
    },
    {
      number: "03",
      topic: "The client’s next step",
      question: "What should I do?",
        framework: "Not sell. Engage. The sustainability community helped build this. Walking away forfeits the standing to steer it. The advisor’s role is to interpret evidence quality, ask questions no screening tool asks, and decide whether unverified assumptions are acceptable for the client’s values, risk tolerance, and time horizon.",
        action: "Use the governance gap from this tool in your next client review as a conversation starter.",
      accent: "lime",
    },
  ] as const;
  return (
    <div>
      <PageIntro
        eyebrow="05 / advisor handoff"
        title="Turn evidence quality into a client conversation."
        description="A practical handoff for advisors reviewing how Stargate Abilene’s physical infrastructure assumptions may connect to public-market exposure. Use the live evidence posture, not a generic sustainability label, to frame the next question."
        right={<div className="flex items-center gap-2 rounded-md border border-[#cbb7ec] bg-[#eee7fa] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7049b7]"><Leaf className="h-3.5 w-3.5" /> Advisor handoff</div>}
      />
      <section data-testid="text-advisor-summary" className="mb-5 rounded-xl border border-[#cbd8d4] bg-[#f9faf8] p-5 md:p-6" aria-labelledby="advisor-live-posture-heading">
        <SectionKicker>Live evidence posture</SectionKicker>
         <h2 id="advisor-live-posture-heading" className="sr-only">Live evidence posture</h2>
        <p className="max-w-4xl text-[18px] font-semibold leading-7 tracking-[-0.025em] text-[#122232] md:text-[21px]">
          Based on current evidence quality, {verifiedCount} of {evidenceCount} inputs are verified. Data center exposure in common values-aligned funds carries {riskTier} unverified risk.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#e1e8e5] pt-4">
          <RiskIndicator tier={riskTier} testId="badge-advisor-summary-risk" />
          <span className="text-[10px] text-[#6b7882]">Tier thresholds: HIGH &lt; 4 verified · MODERATE 4–8 · LOW 9+</span>
        </div>
      </section>
      <section data-testid="section-client-exposure" className="rounded-xl bg-[#122232] p-5 text-white md:p-7" aria-labelledby="client-exposure-heading">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <SectionKicker tone="lime" className="!text-[#d4e86b]">Section 1 / client exposure</SectionKicker>
            <h2 id="client-exposure-heading" className="max-w-2xl text-[26px] font-semibold leading-tight tracking-[-0.035em] md:text-[31px]">Your Clients’ Values Are Invested Here</h2>
            <p className="mt-3 max-w-4xl text-[11px] leading-5 text-[#afbdc4]">A values-aligned fund can connect a client’s capital to NVIDIA, GPU demand, hyperscaler CAPEX, and the Stargate Abilene buildout. The exposure chain turns that connection into diligence questions; it is not proof that every link or statistic is independently verified.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[#c4d0d6]"><Network className="h-3.5 w-3.5 text-[#d4e86b]" /> Exposure chain</div>
        </div>
        <div className="mt-7 flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-1.5" aria-label="Client exposure chain">
          {exposureChain.map((node, index) => {
            const tone = exposureTone[node.tone];
            return (
              <div key={node.label} className="flex min-w-0 flex-1 items-center gap-2 md:block">
                <div data-testid={`exposure-node-${index + 1}`} className="min-h-[78px] flex-1 rounded-lg border p-3" style={{ backgroundColor: tone.background, borderColor: tone.border, color: tone.color }}>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] opacity-70">0{index + 1}</div>
                  <div className="mt-1 text-[12px] font-bold leading-4">{node.label}</div>
                  <div className="mt-1 text-[9px] leading-3.5 opacity-80">{node.detail}</div>
                </div>
                {index < exposureChain.length - 1 && <ArrowRight aria-hidden="true" className="mx-auto h-4 w-4 shrink-0 rotate-90 text-[#7f919b] md:my-8 md:rotate-0" />}
              </div>
            );
          })}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div data-testid="advisor-risk-stat-paused" className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-[24px] font-bold tracking-[-0.05em] text-[#f5ddd5]">$130B</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4d0d6]">Projects paused</div>
            <p className="mt-2 text-[10px] leading-4 text-[#9dafb8]">Reported aggregate context: $130B in AI projects paused in Q1 2026.</p>
          </div>
          <div data-testid="advisor-risk-stat-revenue" className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-[24px] font-bold tracking-[-0.05em] text-[#d4e86b]">$8B</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4d0d6]">Estimated revenue loss</div>
            <p className="mt-2 text-[10px] leading-4 text-[#9dafb8]">Estimated BloombergNEF context for data-center revenue losses by Q1 2027.</p>
          </div>
          <div data-testid="advisor-risk-stat-earnings" className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-[24px] font-bold tracking-[-0.05em] text-[#cbb7ec]">22.8% → 6.4%</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4d0d6]">S&amp;P 500 earnings context</div>
            <p className="mt-2 text-[10px] leading-4 text-[#9dafb8]">Reported market comparison: NVIDIA is the single largest contributor to S&amp;P 500 earnings growth; without NVIDIA’s AI leadership, the other 493 S&amp;P companies trail. This is market context, not a facility fact or modeled return.</p>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-[#b9d43a]/35 bg-[#d4e86b] p-4 text-[#1c2a16] md:p-5">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#607500]" />
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">The epistemic gap</div>
              <p data-testid="text-epistemic-gap" className="mt-2 text-[12px] font-semibold leading-5">The sustainability rating tells your client what NVIDIA reported: MSCI’s AAA sustainability rating is based on corporate disclosures. This tool tests whether the physical infrastructure that rating depends on has been independently verified. Those are two different questions.</p>
            </div>
          </div>
        </div>
      </section>
      <section data-testid="section-client-fund-indicators" className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]" aria-labelledby="fund-indicators-heading">
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <SectionKicker>Live fund indicators</SectionKicker>
              <h2 id="fund-indicators-heading" className="text-[20px] font-semibold tracking-[-0.03em] text-[#122232]">Carry the current posture into stewardship.</h2>
            </div>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-[#60707d] sm:block">Updates with evidence</span>
          </div>
          <p className="mt-3 max-w-2xl text-[11px] leading-5 text-[#63717a]">These indicators show the live unverified-exposure tier for funds and benchmarks that may carry AI infrastructure dependence. They are not a claim about fund quality by themselves.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div data-testid="card-fund-ishares" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#e9e0f7] text-[#482873]"><Landmark aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="text-[11px] font-bold text-[#122232]">iShares ESG Advanced MSCI USA ETF</div><RiskIndicator tier={riskTier} testId="badge-fund-ishares-risk" /></div><div className="mt-1 text-[10px] text-[#6b7882]">Public equity exposure · sustainability-screened broad market</div></div></div></div>
            <div data-testid="card-fund-msci" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#d4e86b] text-[#314207]"><BarChart3 aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="text-[11px] font-bold text-[#122232]">MSCI KLD 400 Social Index</div><RiskIndicator tier={riskTier} testId="badge-fund-msci-risk" /></div><div className="mt-1 text-[10px] text-[#6b7882]">Socially screened benchmark · stewardship reference</div></div></div></div>
          </div>
        </div>
        <div className="rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-5 md:p-6">
          <SectionKicker>What the chain means</SectionKicker>
          <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">Ask where the evidence changes quality.</h2>
          <p className="mt-3 text-[11px] leading-5 text-[#52616b]">The relevant sustainability question is not whether a fund owns this exact campus. It is whether portfolio holdings carry unpriced drought, extreme-heat, downtime, and adaptation exposure while those risks remain invisible in the diligence chain.</p>
          <div className="mt-5 flex items-start gap-3 border-t border-[#d9e0e4] pt-4"><CloudLightning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" /><p className="text-[10px] font-medium leading-4 text-[#344550]">A rating based on corporate disclosures and a site-level infrastructure review can both be valid—and still answer different questions.</p></div>
        </div>
      </section>
      <section data-testid="section-client-conversations" className="mt-5" aria-labelledby="client-conversations-heading">
        <div className="mb-5 flex flex-col justify-between gap-3 border-b border-[#d9e0e4] pb-5 md:flex-row md:items-end">
          <div>
            <SectionKicker>Section 2 / client conversations</SectionKicker>
            <h2 id="client-conversations-heading" className="text-[26px] font-semibold tracking-[-0.035em] text-[#122232] md:text-[31px]">How to Talk to Your Client</h2>
          </div>
          <p className="max-w-md text-[11px] leading-5 text-[#63717a]">Three pre-framed conversations turn the diligence record into a useful review without reducing uncertainty to a buy-or-sell signal.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {conversations.map((conversation) => {
            const accent = conversation.accent === "blue" ? { border: "#aac6f4", label: "#255bb7", background: "#f7faff" } : conversation.accent === "coral" ? { border: "#efabb8", label: "#ba2f45", background: "#fff9f9" } : { border: "#c9db70", label: "#607500", background: "#fbfdf1" };
            return (
              <article key={conversation.number} data-testid={`client-conversation-${conversation.number}`} className="flex flex-col rounded-xl border bg-white p-5" style={{ borderColor: accent.border }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] font-bold tracking-[0.14em]" style={{ color: accent.label }}>CONVERSATION {conversation.number}</span>
                  <span className="rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em]" style={{ backgroundColor: accent.background, color: accent.label }}>{conversation.topic}</span>
                </div>
                <div className="mt-5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Client asks</div>
                <h3 className="mt-2 text-[18px] font-semibold leading-6 tracking-[-0.025em] text-[#122232]">“{conversation.question}”</h3>
                <div className="mt-5 border-t border-[#e5eae8] pt-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Advisor response framework</div>
                  <p className="mt-2 text-[11px] leading-5 text-[#52616b]">{conversation.framework}</p>
                </div>
                <div className="mt-auto pt-5">
                  <div className="rounded-lg bg-[#122232] p-4 text-white">
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#d4e86b]"><ArrowRight aria-hidden="true" className="h-3 w-3" /> Specific action</div>
                    <p className="mt-2 text-[11px] font-semibold leading-5 text-[#f6f7f2]">{conversation.action}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section data-testid="section-practice-value" className="mt-5 rounded-xl bg-[#d4e86b] p-5 text-[#1c2a16] md:p-7" aria-labelledby="practice-value-heading">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <SectionKicker tone="lime" className="!text-[#607500]">Section 3 / advisor value</SectionKicker>
            <h2 id="practice-value-heading" className="max-w-2xl text-[26px] font-semibold leading-tight tracking-[-0.035em] md:text-[31px]">Why This Is Your Role</h2>
          </div>
          <div className="rounded-md border border-[#607500]/25 bg-white/35 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#607500]">Trust is human judgment</div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["79%", "trust advisors", "Gallup / Edward Jones"],
            ["3%", "trust AI", "Gallup / Edward Jones"],
            ["4x", "more likely to use a professional advisor", "Financially fulfilled adults"],
            ["0", "AI confidence has zero statistical association with financial fulfillment", "Gallup / Edward Jones"],
          ].map(([value, label, source]) => (
            <div key={label} data-testid={`practice-stat-${value}`} className="rounded-lg border border-[#607500]/20 bg-white/45 p-4">
              <div className="font-mono text-[26px] font-bold tracking-[-0.06em]">{value}</div>
              <div className="mt-1 text-[11px] font-bold leading-4">{label}</div>
              <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] opacity-65">{source}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 border-t border-[#607500]/25 pt-5 md:grid-cols-2">
          <div className="rounded-lg border border-[#607500]/25 bg-white/35 p-4"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">Traditional screening</div><p className="mt-2 text-[13px] font-semibold leading-5">Reads corporate disclosures, assigns a rating, and treats the reported record as the decision surface.</p></div>
          <div className="rounded-lg border-2 border-[#607500]/45 bg-white/55 p-4"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">Evidence-governed advising</div><p className="mt-2 text-[13px] font-semibold leading-5">Tests infrastructure assumptions, separates verified evidence from inference, and decides whether remaining exposure fits this client’s values, risk tolerance, and time horizon.</p></div>
        </div>
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <SectionKicker>Fund-manager questions</SectionKicker>
          <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Take these into the next meeting.</h2>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {prioritizedQuestions.map((question, index) => {
              const classification = question.classification;
              const { isActiveGap, isWaterGap, isEnergizationGap, isClimateGap, showDetail } = getAdvisorQuestionPresentation(question.id, classification);
              return (
                <div
                  key={question.id}
                  data-testid={`advisor-question-${question.id}`}
                  className={`rounded-lg px-3 py-4 transition-colors ${isWaterGap ? "my-2 border-2 border-[#efabb8] bg-[#fff3f4]" : isEnergizationGap || isClimateGap ? "my-2 border border-[#f1cb8b] bg-[#fff8e9]" : isActiveGap ? "bg-[#fffaf0]" : ""}`}
                >
                  <div className="flex gap-4">
                  <span className={`font-mono text-[10px] font-bold ${isActiveGap ? "text-[#ba2f45]" : "text-[#b9d43a]"} [text-shadow:0_0_0_#122232]`}>{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className={`text-[12px] font-medium leading-5 ${isActiveGap ? "font-semibold text-[#243844]" : "text-[#344550]"}`}>{question.question}</p>
                      {classification && <ClassificationBadge value={classification} compact />}
                    </div>
                    {showDetail && <p data-testid={`advisor-question-detail-${question.id}`} className={`mt-3 border-t pt-3 text-[10px] font-medium leading-4 ${question.id === "water-rights" ? "border-[#efabb8] text-[#96525d]" : "border-[#ecd39d] text-[#806d51]"}`}>{question.activeDetail}</p>}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#fff8e9] p-5 md:p-6">
          <SectionKicker tone="warning">Professional judgment</SectionKicker>
          <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.025em] text-[#122232]">Governance is the differentiator.</h2>
          <p className="mt-3 text-[11px] leading-5 text-[#6f5f49]">An advisor should be able to defend not only the conclusion, but the evidence standard applied to reach it. Document what is verified, what is inferred, and what remains a deliberate risk appetite choice.</p>
          <div className="mt-5 border-t border-[#ecd39d] pt-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#a65a00]" /><p className="text-[11px] font-semibold leading-5 text-[#6f460e]">Silent AI reclassification is not diligence.</p></div><p className="mt-2 pl-7 text-[10px] leading-4 text-[#806d51]">Any automated change to evidence provenance must be reviewable, attributable, and explicitly approved. Model assistance cannot silently convert uncertainty into fact.</p></div>
        </section>
      </div>
      <section data-testid="section-governance-gap" className="mt-5 rounded-xl border border-[#cbb7ec] bg-[#f8f4fd] p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <SectionKicker>Governance gap</SectionKicker>
            <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.025em] text-[#122232]">What evidence classification prevents the model from hiding.</h2>
            <p className="mt-3 text-[11px] leading-5 text-[#5e5870]">Without evidence classification, an AI screening tool would treat all {evidenceCount} inputs as equivalent. Here is what that hides:</p>
          </div>
          <div className="shrink-0 rounded-lg border-2 border-[#cbb7ec] bg-white px-5 py-4 md:max-w-[360px]">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#7049b7]">Governance gap</div>
            <div data-testid="text-governance-irr-gap" className="mt-1 font-mono text-[28px] font-bold leading-tight tracking-[-0.05em] text-[#482873]">
              {formatIRRDelta(governanceGap)}
            </div>
            <div className="mt-1 text-[10px] leading-4 text-[#5e5870]">assuming everything versus verifying everything</div>
            {governanceGap === null && <div className="mt-2 text-[10px] leading-4 text-[#706681]">The return gap is unavailable because one or both IRR calculations are non-numeric.</div>}
          </div>
        </div>
      </section>
      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-[#cbd8d4] bg-[#eef2f1] p-5 md:flex-row md:items-center md:justify-between md:p-6"><div><SectionKicker>Close the loop</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Return to the decision with the full context.</h2><p className="mt-1 text-[11px] text-[#65737d]">The evidence record and derived return remain live as you move through the workbench.</p></div><button data-testid="button-return-decision" onClick={() => onNavigate("decision")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#122232] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4e86b] hover:-translate-y-0.5"><ClipboardCheck className="h-3.5 w-3.5" /> Return to decision review</button></div>
      <BottomNav screen="advisor" onNavigate={onNavigate} />
    </div>
  );
}

type ChainStage = {
  id: string;
  number: string;
  title: string;
  description: string;
  players: string;
  evidence: string;
  accent: "blue" | "lime" | "coral" | "violet";
  icon: typeof Factory;
};

const chainStages: ChainStage[] = [
  {
    id: "chip-fabrication",
    number: "01",
    title: "CHIP FABRICATION",
    description: "Where AI begins physically.",
    players: "TSMC · Samsung · Intel",
    evidence: "Supply concentrated in geopolitically sensitive regions.",
    accent: "blue",
    icon: Factory,
  },
  {
    id: "chip-design",
    number: "02",
    title: "CHIP DESIGN",
    description: "The architectures that determine what AI can do.",
    players: "NVIDIA · AMD · Broadcom",
    evidence: "NVIDIA holds a top-tier sustainability rating and is the largest holding in major sustainable investment funds. Values-aligned investors were among the earliest to concentrate capital here.",
    accent: "violet",
    icon: Cpu,
  },
  {
    id: "hyperscaler-procurement",
    number: "03",
    title: "HYPERSCALER PROCUREMENT",
    description: "$650 billion in committed AI infrastructure spending.",
    players: "Microsoft · Meta · Google · Amazon",
    evidence: "Capital commitments are announced. Whether the physical infrastructure can absorb them is unverified.",
    accent: "coral",
    icon: Landmark,
  },
  {
    id: "data-center-infrastructure",
    number: "04",
    title: "DATA CENTER INFRASTRUCTURE",
    description: "Where capital meets physical reality: power, water, land, grid, community.",
    players: "Stargate Abilene · Oracle · Crusoe Energy",
    evidence: "$130 billion in projects paused in Q1 2026. The evidence behind the assumptions is what this tool tests.",
    accent: "lime",
    icon: Server,
  },
  {
    id: "ai-model-deployment",
    number: "05",
    title: "AI MODEL DEPLOYMENT",
    description: "Training and inference running on the infrastructure above.",
    players: "OpenAI · Anthropic · Google DeepMind · Meta AI",
    evidence: "Model capability depends on uninterrupted power at extreme densities. Cooling failures halt training runs.",
    accent: "blue",
    icon: Zap,
  },
  {
    id: "ai-governance-regulation",
    number: "06",
    title: "AI GOVERNANCE AND REGULATION",
    description: "The rules catching up to the technology.",
    players: "EU AI Act Article 14 (Aug 2, 2026) · FINRA Notice 26-02 · Texas Governor Abbott moratorium (Aug 3, 2026)",
    evidence: "Two regulatory frameworks arrived at the same conclusion in the same week: the buildout is moving faster than the evidence.",
    accent: "violet",
    icon: Scale,
  },
  {
    id: "client-facing-ai-applications",
    number: "07",
    title: "CLIENT-FACING AI APPLICATIONS",
    description: "Where AI meets the people your clients interact with.",
    players: "financial planning tools · robo-advisors · portfolio screeners",
    evidence: "45% of Americans have no confidence in AI for financial guidance. 79% trust financial advisors. The advisor's role starts here but depends on everything upstream.",
    accent: "coral",
    icon: Smartphone,
  },
];

const chainAccentClasses: Record<ChainStage["accent"], { marker: string; label: string }> = {
  blue: { marker: "bg-[#8dc8e8] text-[#122232]", label: "text-[#8dc8e8]" },
  lime: { marker: "bg-[#d4e86b] text-[#122232]", label: "text-[#d4e86b]" },
  coral: { marker: "bg-[#f5ddd5] text-[#54221f]", label: "text-[#f5ddd5]" },
  violet: { marker: "bg-[#cbb7ec] text-[#2b174d]", label: "text-[#cbb7ec]" },
};

function ValueChain({ onWorkbench }: { onWorkbench: () => void }) {
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
          {chainStages.map((stage) => {
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
  const illustrativeIRR = isVerified ? 18.4 : 8.7;
  const illustrativeDelta = isVerified ? null : -9.7;
  return (
    <div
      data-testid="home-evidence-visual"
      className="home-evidence-visual relative overflow-hidden rounded-2xl border border-white/15 bg-[#102b3b] p-4 shadow-2xl shadow-black/20 sm:p-5"
      role="img"
      aria-live="polite"
      aria-label={`Illustrative evidence-to-return example. Grid Interconnection Timeline is ${isVerified ? "Verified Evidence" : "Missing Evidence"} and the illustrative IRR is ${formatIRR(illustrativeIRR)}${illustrativeDelta === null ? "" : `, a ${formatIRRDelta(illustrativeDelta, true)} change when unverified`}.`}
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
              <span data-testid={`home-irr-${state}`}>{formatIRR(illustrativeIRR)}</span>
            </div>
            <div className={`mt-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${isVerified ? "text-[#8fd9bc]" : "text-[#f5aab0]"}`}>
              {isVerified ? <TrendingUp aria-hidden="true" className="h-3 w-3" /> : <TrendingDown aria-hidden="true" className="h-3 w-3" />}
              {isVerified ? "Evidence-supported case" : `${formatIRRDelta(illustrativeDelta, true)} when unverified`}
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

function LandingHome() {
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

function screenFromHash(hash: string): Screen | null {
  const route = hash.replace(/^#/, "") as Screen;
  return screens.some((screen) => screen.id === route) ? route : null;
}
function routeFromHash(hash: string): AppRoute | null {
  const routeName = hash.replace(/^#/, "");
  if (routeName === "") return "home";
  const route = routeName as AppRoute;
  return route === "home" || route === "value-chain" || route === "how-it-works" || screens.some((screen) => screen.id === route) ? route : null;
}
function AppShell() {
  const [route, setRoute] = useState<AppRoute>(() => typeof window === "undefined" ? "home" : routeFromHash(window.location.hash) ?? "home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [evidenceFocusId, setEvidenceFocusId] = useState<string | null>(null);
  const diligence = useDiligence();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const menuWasOpen = useRef(false);
  useEffect(() => {
    if (!diligence.metrics.lastChange) return undefined;
    const timer = window.setTimeout(diligence.clearLastChange, 8000);
    return () => window.clearTimeout(timer);
  }, [diligence.metrics.lastChange, diligence.clearLastChange]);

  useEffect(() => {
    let isInitialSync = true;
    const syncFromHash = () => {
      const next = routeFromHash(window.location.hash);
      if (!next) {
        window.history.replaceState(null, "", "#home");
        setRoute("home");
      } else {
        setRoute(next);
      }
      if (!isInitialSync) setMobileOpen(false);
    };
    syncFromHash();
    isInitialSync = false;
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    const activeScreen = screens.find((item) => item.id === route);
    document.title = route === "home" ? "SafeLoc · Home" : route === "value-chain" ? "SafeLoc · The AI Chain" : route === "how-it-works" ? "SafeLoc · How It Works" : activeScreen ? `SafeLoc · ${activeScreen.label}` : "SafeLoc Diligence Workbench";
    window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
  }, [route]);

  useEffect(() => {
    if (route !== "evidence" || !evidenceFocusId) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`evidence-item-${evidenceFocusId}`);
      target?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
      setEvidenceFocusId(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [route, evidenceFocusId]);

  const go = (next: AppRoute) => {
    if (next !== route) diligence.clearLastChange();
    setMobileOpen(false);
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    } else {
      setRoute(next);
    }
  };

  const confirmReset = () => {
    diligence.resetToDefault();
    setResetOpen(false);
    go("brief");
  };

  const resolveEvidence = (id: string) => {
    setEvidenceFocusId(id);
    go("evidence");
  };

  useEffect(() => {
    if (!mobileOpen) {
      if (menuWasOpen.current) {
        menuWasOpen.current = false;
        menuButtonRef.current?.focus();
      }
      return undefined;
    }

    menuWasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const menu = menuRef.current;
    const getFocusableElements = () =>
      menu
        ? Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        : [];
    const focusTimer = window.setTimeout(() => getFocusableElements()[0]?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (menu && !menu.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu?.contains(target) && !menuButtonRef.current?.contains(target)) {
        event.preventDefault();
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f4] text-[#122232]">
      <Header
        onMenu={() => setMobileOpen((value) => !value)}
        onReset={() => setResetOpen(true)}
        onHome={() => go("home")}
        onHowItWorks={() => go("how-it-works")}
        onValueChain={() => go("value-chain")}
        onWorkbench={() => go("brief")}
        route={route}
        sessionRestored={diligence.sessionRestored}
        mobileOpen={mobileOpen}
        menuButtonRef={menuButtonRef}
      />
      {route !== "home" && route !== "value-chain" && route !== "how-it-works" && <ProgressNav current={route} onNavigate={go} />}
      {mobileOpen && (
        <>
          <div
            data-testid="mobile-menu-backdrop"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-20 bg-[#122232]/60 md:hidden"
          />
          <nav
            ref={menuRef}
            id="mobile-navigation"
             data-testid="mobile-navigation"
            aria-label="Mobile navigation"
            className="fixed inset-x-4 top-[76px] z-30 max-h-[calc(100dvh-92px)] overflow-y-auto rounded-lg border border-[#cbd8d4] bg-[#f9faf8] p-2 shadow-lg md:hidden"
          >
            <button data-testid="mobile-navigate-home" type="button" aria-current={route === "home" ? "page" : undefined} onClick={() => go("home")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "home" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Target aria-hidden="true" className="h-4 w-4" /> Home
            </button>
            <div className="my-1 border-t border-[#d9e0e4]" />
            {screens.map((item, index) => (
              <button
                key={item.id}
                data-testid={`mobile-navigate-${item.id}`}
                type="button"
                 aria-current={route === item.id ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${item.label}`}
                onClick={() => go(item.id)}
                 className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === item.id ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}
              >
                <item.icon aria-hidden="true" className="h-4 w-4" /> {item.label}
              </button>
            ))}
            <div className="my-1 border-t border-[#d9e0e4]" />
            <button data-testid="mobile-navigate-value-chain" type="button" aria-current={route === "value-chain" ? "page" : undefined} onClick={() => go("value-chain")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "value-chain" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Network aria-hidden="true" className="h-4 w-4" /> The AI Chain
            </button>
            <button data-testid="mobile-navigate-how-it-works" type="button" aria-current={route === "how-it-works" ? "page" : undefined} onClick={() => go("how-it-works")} className={`flex min-h-11 w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "how-it-works" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Info aria-hidden="true" className="h-4 w-4" /> How It Works
            </button>
            {route === "value-chain" && <button data-testid="mobile-return-to-workbench" type="button" onClick={() => go("brief")} className="flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold text-[#ba2f45]"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Return to Workbench</button>}
          </nav>
        </>
      )}
      {diligence.metrics.lastChange && (
        <div data-testid="toast-reclassification" role="status" aria-live="polite" className="fixed bottom-5 right-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-[#cbd8d4] bg-[#122232] p-4 text-white shadow-xl md:bottom-7 md:right-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#b9d43a]">Evidence reclassified</div>
              <div className="mt-2 text-[11px] leading-5 text-[#dce4e7]">Return updated from <span className="font-mono text-white">{formatIRR(diligence.metrics.lastChange.from)}</span> to <span className="font-mono text-white">{formatIRR(diligence.metrics.lastChange.to)}</span>.</div>
              <div className={`mt-1 font-mono text-[12px] font-bold ${diligence.metrics.lastChange.delta < 0 ? "text-[#f5ddd5]" : "text-[#d4e86b]"}`}>{formatIRRDelta(diligence.metrics.lastChange.delta, true)} IRR</div>
            </div>
            <button data-testid="button-dismiss-reclassification" aria-label="Dismiss reclassification notification" onClick={diligence.clearLastChange} className="rounded p-1 text-[#a4b4bd] hover:bg-white/10 hover:text-white"><span aria-hidden="true">×</span></button>
          </div>
        </div>
      )}
      {route === "how-it-works" ? (
        <HowItWorksTour onReturn={() => go("brief")} onOpenScreen={go} />
      ) : (
        <>
          {route === "home" ? <LandingHome /> : <div className="mx-auto flex max-w-[1480px]">
            {route !== "value-chain" && <ShellAside screen={route} metrics={diligence.metrics} onNavigate={go} onReset={() => setResetOpen(true)} />}
            <main className="min-w-0 flex-1 px-4 py-7 md:px-8 md:py-10 xl:px-12">
              <div className={`mx-auto ${route === "value-chain" ? "max-w-[1320px]" : "max-w-[1160px]"}`}>
                {route === "value-chain" && <ValueChain onWorkbench={() => go("brief")} />}
                {route === "brief" && <CaseBrief onNavigate={go} />}
                {route === "evidence" && <EvidenceRoom onNavigate={go} />}
                {route === "materiality" && <FinancialMateriality onNavigate={go} />}
                {route === "decision" && <DecisionReview onNavigate={go} onResolve={resolveEvidence} />}
                {route === "advisor" && <AdvisorLens onNavigate={go} />}
              </div>
            </main>
          </div>}
          {route !== "home" && <><DiligenceLiveRegions metrics={diligence.metrics} /><footer className="border-t border-[#d9e0e4] bg-[#eef2f1] px-4 py-6 md:px-8">
            <div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-[#52616b] sm:flex-row sm:items-center"><span>SafeLoc Diligence Workbench</span><span>Proof of Concept | Transaction assumptions are synthetic | Environmental and infrastructure data from public sources</span><span className="font-mono">2024 / 24-017</span></div>
          </footer></>}
        </>
      )}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="border-[#cbd8d4] bg-[#f9faf8]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#122232]">Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#65737d]">This restores all 16 evidence classifications to the canonical starting state and clears the current session. Named scenarios are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#cbd8d4] text-[#52616b]">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-reset-default" onClick={confirmReset} className="border-[#ba2f45] bg-[#ba2f45] text-white hover:bg-[#9c2439]">Reset to Default</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function App() {
  return (
    <DiligenceProvider>
      <AppShell />
    </DiligenceProvider>
  );
}

export default App;

function formatScenarioDelta(first: number | null, second: number | null, metric: "irr" | "moic" | "npv" | "cashOnCash" | "payback" | "confidence") {
  if (first === null || second === null) return "Unavailable";
  const delta = second - first;
  const sign = delta >= 0 ? "+" : "";
  if (metric === "irr") return formatIRRDelta(delta, true);
  if (metric === "moic") return `${sign}${delta.toFixed(2)}x`;
  if (metric === "npv") return formatSignedCurrency(delta);
  if (metric === "payback") return `${sign}${delta.toFixed(1)} years`;
  return `${sign}${delta.toFixed(1)}%`;
}

function formatIRRDelta(value: number | null, signed = false) {
  if (value === null) return "N/M";
  return `${signed && value >= 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function formatSignedCurrency(value: number, decimals = 0) {
  return `${value >= 0 ? "+" : "−"}$${Math.abs(value).toFixed(decimals)}M`;
}
