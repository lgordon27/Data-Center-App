import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  ExternalLink,
  FileCheck2,
  Gauge,
  Info,
  Landmark,
  Leaf,
  MapPin,
  Menu,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  Classification,
  DiligenceProvider,
  EvidenceItem,
  useDiligence,
} from "@/context/DiligenceContext";

type Screen = "brief" | "evidence" | "materiality" | "decision" | "advisor";

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
  return value === null ? "Not reached" : `${value.toFixed(2)} yrs`;
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

function SectionKicker({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warning" | "lime" }) {
  return (
    <div className={`mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] ${tone === "warning" ? "text-[#ba2f45]" : tone === "lime" ? "text-[#607500]" : "text-[#60707d]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === "warning" ? "bg-[#ba2f45]" : tone === "lime" ? "bg-[#b9d43a]" : "bg-[#255bb7]"}`} />
      {children}
    </div>
  );
}

function MetricCard({ label, value, detail, accent = "navy", testId }: { label: string; value: string; detail: string; accent?: "navy" | "lime" | "coral" | "violet"; testId: string }) {
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

function ProgressNav({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  const currentIndex = screens.findIndex((screen) => screen.id === current);
  return (
    <div className="border-b border-[#d9e0e4] bg-[#f9faf8]/90 px-4 backdrop-blur-md md:px-8">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between">
        <div className="hidden items-center gap-2 py-3 text-[10px] font-bold uppercase tracking-[0.17em] text-[#6b7882] md:flex">
          <span className="font-mono text-[#122232]">WORKBENCH /</span>
          <span>CASE 24-017</span>
        </div>
        <div className="flex w-full items-stretch justify-between gap-1 md:w-auto md:gap-2">
          {screens.map((screen, index) => {
            const Icon = screen.icon;
            const isActive = screen.id === current;
            const isDone = index < currentIndex;
            return (
              <button
                key={screen.id}
                data-testid={`button-navigate-${screen.id}`}
                onClick={() => onNavigate(screen.id)}
                className={`group relative flex min-w-0 items-center gap-2 border-b-2 px-2 py-3.5 text-left transition-colors md:min-w-[132px] md:px-3 ${isActive ? "border-[#b9d43a] text-[#122232]" : "border-transparent text-[#8a969e] hover:border-[#c8d5dd] hover:text-[#42515d]"}`}
              >
                <span className={`hidden h-6 w-6 items-center justify-center rounded-full font-mono text-[9px] font-bold md:flex ${isActive ? "bg-[#122232] text-[#d4e86b]" : isDone ? "bg-[#e0f4ed] text-[#0b7a63]" : "bg-[#e7ecef] text-[#7a8790]"}`}>
                  {isDone ? <Check className="h-3 w-3" /> : screen.number}
                </span>
                <Icon className="h-3.5 w-3.5 md:hidden" />
                <span className="min-w-0">
                  <span className="block truncate text-[10px] font-bold uppercase tracking-[0.11em]">{screen.label}</span>
                  <span className="hidden text-[10px] opacity-60 md:block">{screen.short}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="hidden items-center gap-2 py-3 md:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0b7a63]" />
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#63717a]">Local model · live</span>
        </div>
      </div>
    </div>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="border-b border-[#d9e0e4] bg-[#122232] px-4 py-4 text-[#f6f7f2] md:px-8 md:py-5">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button data-testid="button-open-menu" onClick={onMenu} className="rounded-md p-2 text-[#d4e86b] hover:bg-white/10 md:hidden">
            <Menu className="h-5 w-5" />
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
            <div className="mt-1 text-[10px] text-[#96a4ad]">Phoenix metro / Southwest corridor · IC pre-read</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded border border-[#60717f] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#c8d0d5] sm:inline-flex">POC / v0.9</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e9e0f7] font-mono text-[10px] font-bold text-[#482873]">AD</div>
        </div>
      </div>
    </header>
  );
}

function ShellAside({ screen, metrics, onNavigate }: { screen: Screen; metrics: ReturnType<typeof useDiligence>["metrics"]; onNavigate: (screen: Screen) => void }) {
  return (
    <aside className="hidden w-[246px] shrink-0 border-r border-[#d9e0e4] bg-[#eef2f1] px-5 py-7 lg:block">
      <SectionKicker>Active mandate</SectionKicker>
      <div className="mb-7">
        <div className="font-mono text-[11px] font-bold text-[#122232]">SW-DC / PHX-24-017</div>
        <div className="mt-1 text-xs leading-5 text-[#6b7882]">Southwest digital infrastructure platform</div>
      </div>
      <div className="mb-8 rounded-lg border border-[#cbd8d4] bg-[#f9faf8] p-3.5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#60707d]">
          <MapPin className="h-3.5 w-3.5 text-[#ba2f45]" /> Goodyear, AZ
        </div>
        <div className="mt-3 h-px bg-[#dfe6e3]" />
        <div className="mt-3 flex justify-between text-[10px]">
          <span className="text-[#7a8790]">Screen</span>
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
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors ${active ? "bg-[#122232] text-[#d4e86b]" : "text-[#65737d] hover:bg-white hover:text-[#122232]"}`}
            >
              <span className="font-mono text-[10px] opacity-70">0{index + 1}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
              {active && <CircleDot className="ml-auto h-3 w-3" />}
            </button>
          );
        })}
      </div>
      <div className="mt-auto pt-16">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Evidence confidence</span>
          <span data-testid="text-aside-confidence" className="font-mono text-sm font-bold text-[#122232]">{metrics.confidenceScore}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#d9e2df]">
          <div className="h-full rounded-full bg-[#b9d43a] transition-all duration-500" style={{ width: `${metrics.confidenceScore}%` }} />
        </div>
        <div className="mt-2 text-[10px] leading-4 text-[#829099]">Weighted by source quality and recency.</div>
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
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9aa5ab]">SafeLoc / private working paper</div>
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

function CaseBrief({ metrics, onNavigate }: { metrics: ReturnType<typeof useDiligence>["metrics"]; onNavigate: (screen: Screen) => void }) {
  return (
    <div>
      <PageIntro
        eyebrow="01 / frame the opportunity"
        title="The return is only as durable as the evidence behind it."
        description="A representative diligence case for a 120 MW hyperscale campus in the Southwest corridor. This is the starting frame — synthetic transaction assumptions, public-site context, and the investment questions that deserve scrutiny."
        right={<div className="flex items-center gap-2 self-start rounded-full border border-[#cbd8d4] bg-[#f9faf8] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#60707d] md:self-auto"><span className="h-2 w-2 rounded-full bg-[#ba2f45]" /> Location signal · Goodyear, AZ</div>}
      />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="relative min-h-[360px] overflow-hidden rounded-xl bg-[#122232] p-6 text-white md:p-8">
          <div className="absolute right-0 top-0 h-full w-1/2 opacity-40 [background-image:linear-gradient(#345063_1px,transparent_1px),linear-gradient(90deg,#345063_1px,transparent_1px)] [background-size:30px_30px] [mask-image:linear-gradient(90deg,transparent,black)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#b9d43a]">Case brief / SW-DC-24-017</div>
                <h2 className="mt-5 max-w-lg text-[30px] font-semibold leading-[1.06] tracking-[-0.04em] md:text-[39px]">Desert Mesa<br /><span className="text-[#b9d43a]">Campus</span></h2>
              </div>
              <div className="hidden rounded-md border border-white/15 px-3 py-2 text-right sm:block">
                <div className="text-[9px] uppercase tracking-[0.14em] text-[#a0b0b8]">Stage</div>
                <div className="mt-1 font-mono text-[12px] text-[#f5ddd5]">IC PRE-READ</div>
              </div>
            </div>
            <div className="grid max-w-xl grid-cols-2 gap-x-8 gap-y-5 border-t border-white/15 pt-5 sm:grid-cols-4">
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Capacity</div><div className="mt-1 font-mono text-base">120 MW</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Site</div><div className="mt-1 font-mono text-base">84 acres</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Entry EV</div><div className="mt-1 font-mono text-base">$480M</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Vintage</div><div className="mt-1 font-mono text-base">2024</div></div>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#f9faf8] p-6">
          <SectionKicker>Investment thesis</SectionKicker>
          <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">A contracted, power-constrained asset with a hidden water story.</h3>
          <p className="mt-4 text-[12px] leading-5 text-[#63717a]">Demand for low-latency compute creates durable pricing power. Yet the proposed cooling architecture sits inside a water-stressed basin and relies on an interconnection window that is not yet fully evidenced.</p>
          <div className="mt-6 space-y-3 border-t border-[#d9e0e4] pt-5">
            {[
              ["Catalyst", "Tenant LOI covers 85% of stabilized revenue."],
              ["Tension", "Water rights seniority and community response are unresolved."],
              ["Underwrite", "Returns hold only if energization lands inside the 24-month plan."],
            ].map(([key, value]) => (
              <div key={key} className="grid grid-cols-[76px_1fr] gap-3 text-[11px]"><span className="font-mono uppercase tracking-[0.1em] text-[#7f8b92]">{key}</span><span className="font-medium leading-4 text-[#344550]">{value}</span></div>
            ))}
          </div>
        </section>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1fr_1.25fr]">
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-5">
          <SectionKicker>Public-site context</SectionKicker>
          <div className="flex gap-3">
            <div className="mt-0.5 rounded bg-[#f5ddd5] p-2 text-[#ba2f45]"><MapPin className="h-4 w-4" /></div>
            <div><div className="text-sm font-semibold text-[#122232]">West Valley growth edge</div><p className="mt-1 text-[11px] leading-5 text-[#6b7882]">Goodyear sits inside the Phoenix-Mesa-Scottsdale MSA, where population and industrial load are growing into a drought-constrained utility system.</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-5">
          <SectionKicker>Transmission corridor</SectionKicker>
          <div className="flex items-center gap-2.5 text-[#122232]">
            <Zap className="h-4 w-4 text-[#a65a00]" /><span className="font-mono text-sm font-bold">APS → SRP → ERCOT adjacencies</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#6b7882]">A regional power story, not a single-site story. Interconnection and renewable procurement are central to the risk case.</p>
        </div>
        <div className="rounded-xl bg-[#d4e86b] p-5 text-[#1c2a16]">
          <div className="flex items-center justify-between"><SectionKicker tone="lime">The governing question</SectionKicker><Target className="h-5 w-5 opacity-60" /></div>
          <div className="mt-1 text-[19px] font-semibold leading-tight tracking-[-0.025em]">What must be true for the 18.5% base return to deserve conviction?</div>
          <button data-testid="button-open-evidence-from-brief" onClick={() => onNavigate("evidence")} className="mt-5 inline-flex items-center gap-2 border-b border-[#1c2a16] pb-1 text-[10px] font-bold uppercase tracking-[0.15em]">Open evidence room <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Water stress", "High", "Colorado River Basin · drought-constrained utility system", "#ba2f45"],
          ["Grid capacity", "Constrained", "APS / SRP queue pressure around West Valley load growth", "#a65a00"],
          ["Power price trend", "+5.0% / 5 yr", "Public utility and Bloomberg forward pricing signal", "#255bb7"],
          ["Community profile", "+3.1% YoY", "Phoenix West Valley growth edge · Census ACS", "#7049b7"],
        ].map(([label, value, detail, color]) => (
          <div key={label} className="rounded-xl border border-[#d9e0e4] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7d898f]">{label}</span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            </div>
            <div className="mt-3 font-mono text-lg font-bold text-[#122232]">{value}</div>
            <div className="mt-1 text-[10px] leading-4 text-[#7d898f]">{detail}</div>
          </div>
        ))}
      </div>
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
            ["Acquisition price", "$480M", "Entry enterprise value"],
            ["Debt structure", "60% LTV", "7.5% interest · 10-year term"],
            ["Target return", "18.5% IRR", "2.4x MOIC · 5-year hold"],
            ["Cooling type", "Hybrid", "Closed-loop + evaporative trim"],
          ].map(([label, value, detail]) => (
            <div key={label} className="border-l-2 border-[#d4e86b] pl-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#7d898f]">{label}</div>
              <div className="mt-1 font-mono text-[15px] font-bold text-[#122232]">{value}</div>
              <div className="mt-1 text-[10px] text-[#87939a]">{detail}</div>
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
    <div data-testid={`row-evidence-${item.id}`} className="group grid gap-3 border-b border-[#e4e9e8] px-4 py-4 transition-colors last:border-0 hover:bg-[#fbfcfa] md:grid-cols-[1.55fr_0.7fr_1.1fr_1.55fr] md:items-center md:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
          <span className="text-[12px] font-semibold text-[#243844]">{item.label}</span>
        </div>
        <div className="mt-1 pl-3.5 text-[10px] leading-4 text-[#87939a]">{item.description}</div>
      </div>
      <div className="pl-3.5 md:pl-0"><span className="font-mono text-[13px] font-bold text-[#122232]">{item.value}</span> <span className="text-[10px] text-[#7e8b92]">{item.unit}</span></div>
      <div className="pl-3.5 md:pl-0"><div className="flex items-start gap-1.5 text-[10px] leading-4 text-[#66757e]"><ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[#9aa5ab]" /><span>{item.citation}</span></div></div>
      <div className="relative pl-3.5 md:pl-0">
        <select
          data-testid={`select-classification-${item.id}`}
          value={item.classification}
          onChange={(event) => onChange(item.id, event.target.value as Classification)}
          className="w-full appearance-none rounded-md border bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-[#243844] outline-none transition-shadow focus:ring-2 focus:ring-[#b9d43a]/50"
          style={{ borderColor: meta.border }}
        >
          {classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#7a8790]" />
      </div>
    </div>
  );
}

function EvidenceRoom({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, updateClassification, metrics } = useDiligence();
  const items = Object.values(evidence);
  const counts = useMemo(() => classifications.map((classification) => ({ classification, count: items.filter((item) => item.classification === classification).length })), [items]);
  return (
    <div>
      <PageIntro
        eyebrow="02 / source the conviction"
        title="Evidence is not a footnote. It is an active model input."
        description="Twelve diligence inputs are classified by provenance. Change a classification to test what the return looks like when an assertion becomes an assumption, or when missing evidence is finally verified."
        right={<div data-testid="text-evidence-count" className="rounded-lg border border-[#cbd8d4] bg-[#f9faf8] px-4 py-3 text-right"><div className="font-mono text-xl font-bold text-[#122232]">{items.length}<span className="text-[#9aa5ab]"> / 12</span></div><div className="text-[9px] uppercase tracking-[0.14em] text-[#7a8790]">Inputs registered</div></div>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {counts.map(({ classification, count }) => {
          const meta = classMeta[classification];
          return <div key={classification} data-testid={`count-classification-${meta.short.toLowerCase()}`} className="rounded-lg border p-3" style={{ borderColor: meta.border, backgroundColor: meta.bg }}><div className="flex items-center justify-between gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} /><span className="font-mono text-xl font-bold" style={{ color: meta.color }}>{count}</span></div><div className="mt-2 text-[9px] font-bold uppercase leading-3 tracking-[0.1em]" style={{ color: meta.color }}>{classification}</div></div>;
        })}
      </div>
      <div className="overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
        <div className="hidden grid-cols-[1.55fr_0.7fr_1.1fr_1.55fr] gap-3 border-b border-[#d9e0e4] bg-[#f1f5f3] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d898f] md:grid">
          <span>Evidence variable</span><span>Current value</span><span>Citation / provenance</span><span>Classification · editable</span>
        </div>
        {items.map((item) => <EvidenceRow key={item.id} item={item} onChange={updateClassification} />)}
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
  const currentIRR = metrics.projectIRR;
  const baseIRR = metrics.baseIRR ?? null;
  const currentPath = metrics.schedule.map((year) => year.cumulativeEquityCashFlow);
  const basePath = metrics.baseModel?.schedule.map((year) => year.cumulativeEquityCashFlow) ?? currentPath;
  const chartValues = [...currentPath, ...basePath];
  const chartMin = Math.min(...chartValues, 0);
  const chartMax = Math.max(...chartValues, 0);
  const irrDelta = currentIRR === null || baseIRR === null ? null : currentIRR - baseIRR;
  return (
    <div>
      <PageIntro
        eyebrow="03 / quantify the uncertainty"
        title="Trace each uncertainty into the return."
        description="A five-year annual equity cash-flow engine ties revenue timing, operating costs, CAPEX, debt service, and terminal value to each evidence classification."
        right={<div className="flex items-center gap-2 rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0b7a63]"><Sparkles className="h-3.5 w-3.5" /> Derived locally</div>}
      />
      {metrics.mechanicalDisclaimer && (
        <div data-testid="banner-mechanical-disclaimer" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#ba2f45] bg-[#fff3f4] px-5 py-4 text-[#7f2635]">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-mono text-[12px] font-bold tracking-[0.08em]">MECHANICAL OUTPUTS ONLY · 0% EVIDENCE CONFIDENCE</div>
            <div className="mt-1 text-[11px] leading-5 text-[#96525d]">Every input is currently missing. Returns, payback, and terminal value are scenario mechanics—not investment-grade underwriting or a recommendation.</div>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard testId="metric-project-irr" label="Project IRR" value={formatIRR(currentIRR)} detail={`${irrDelta === null ? "N/M" : `${irrDelta >= 0 ? "+" : ""}${irrDelta.toFixed(1)} pts`} vs verified baseline`} accent="lime" />
        <MetricCard testId="metric-moic" label="MOIC" value={`${metrics.moic}x`} detail="5-year hold period" accent="navy" />
        <MetricCard testId="metric-coc" label="Cash-on-cash" value={`${metrics.cashOnCash}%`} detail="Stabilized year 3" accent="violet" />
        <MetricCard testId="metric-payback" label="Payback" value={formatPayback(metrics.payback)} detail="Cumulative equity breakeven" accent="coral" />
        <MetricCard testId="metric-npv" label="NPV @ 10%" value={formatCurrency(metrics.npv)} detail="Equity value created" accent="navy" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4"><div><SectionKicker>Evidence → financial materiality</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Where the model feels the uncertainty</h2></div><span className="font-mono text-[10px] text-[#87939a]">Δ IRR / variable</span></div>
          <div className="mt-2 divide-y divide-[#e5eae8]">
            {impacts.map((impact) => {
              const item = evidence[impact.id];
              const effectTone = impact.deltaIRR < 0 ? "text-[#ba2f45]" : impact.deltaIRR > 0 ? "text-[#0b7a63]" : "text-[#63717a]";
              return <div key={impact.id} data-testid={`row-materiality-${impact.id}`} className="grid grid-cols-[1fr_auto] gap-4 py-4 sm:grid-cols-[1.2fr_0.9fr_0.75fr_0.5fr] sm:items-center">
                <div><div className="text-[12px] font-semibold text-[#243844]">{item.label}</div><div className="mt-1 text-[10px] text-[#87939a]">{impact.driver}</div></div>
                <div className="sm:col-auto"><ClassificationBadge value={item.classification} compact /></div>
                <div className="text-right font-mono text-[11px] font-bold text-[#4d5c65] sm:text-left">{formatLineItemValue(impact.value, impact.unit)}</div>
                <div className={`hidden text-right font-mono text-[12px] font-bold sm:block ${effectTone}`}>{impact.deltaIRR > 0 ? "+" : ""}{impact.deltaIRR.toFixed(1)} pts</div>
              </div>;
            })}
          </div>
        </section>
        <section className="rounded-xl bg-[#122232] p-5 text-white md:p-6">
          <div className="flex items-start justify-between"><div><SectionKicker tone="lime">Return path</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em]">Verified baseline → current case</h2></div>{irrDelta !== null && irrDelta < 0 ? <TrendingDown className="h-5 w-5 text-[#f5ddd5]" /> : <TrendingUp className="h-5 w-5 text-[#d4e86b]" />}</div>
          <div className="mt-8 flex items-end gap-5">
            <div><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#9dafb8]">Verified IRR</div><div className="mt-2 font-mono text-3xl font-bold text-[#b9d43a]">{formatIRR(baseIRR)}</div></div>
            <ArrowRight className="mb-2 h-5 w-5 text-[#7c909d]" />
            <div><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#9dafb8]">Current IRR</div><div data-testid="text-current-irr-materiality" className="mt-2 font-mono text-3xl font-bold text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
          </div>
          {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && (
            <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[#f5ddd5]">
              <span className="line-through opacity-60">{metrics.lastChange.from}% prior</span>
              <span className="rounded bg-[#f5ddd5] px-2 py-1 font-bold text-[#ba2f45]">{metrics.lastChange.delta > 0 ? "+" : ""}{metrics.lastChange.delta.toFixed(1)} pts since reclassification</span>
            </div>
          )}
          <div className="mt-7 h-28 border-b border-l border-white/20 px-3 pb-2 pt-3">
            <div className="relative h-full">
              <svg viewBox="0 0 500 72" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                <polyline points={chartPoints(basePath, chartMin, chartMax)} fill="none" stroke="#b9d43a" strokeWidth="3" strokeDasharray="5 4" />
                <polyline points={chartPoints(currentPath, chartMin, chartMax)} fill="none" stroke="#f5ddd5" strokeWidth="3" />
              </svg>
            </div>
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-[#8299a6]"><span>Y0 / close</span><span>Y5 / exit</span><span>cumulative equity cash flow · $M</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Revenue delay</div><div className="mt-1 font-mono text-sm text-[#f5ddd5]">+{metrics.revenueDelayMonths} mo</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">CAPEX contingency</div><div className="mt-1 font-mono text-sm text-[#f5ddd5]">{formatCurrency(metrics.incrementalCapex)}</div></div>
          </div>
        </section>
      </div>
      <section className="mt-5 rounded-xl border border-[#d9e0e4] bg-[#eef2f1] p-5 md:p-6">
        <div className="flex items-end justify-between border-b border-[#d6e0dc] pb-4">
          <div>
            <SectionKicker>Project-level return model</SectionKicker>
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">A transparent bridge from operations to returns.</h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7d898f]">5-year / client-side</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Revenue build", `${formatCurrency(metrics.assumptions.annualRevenueAtFullUtilization)} full run-rate`, `${metrics.assumptions.capacityMW} MW × $${metrics.assumptions.leaseRatePerKwMonth} / kW-mo · ${metrics.assumptions.revenueDelayMonths} mo delay`],
            ["OPEX build", `${formatCurrency(metrics.schedule[5]?.totalOpex ?? 0)} Y5 OPEX`, "Power, water, maintenance, labor, insurance, compliance"],
            ["CAPEX schedule", `${formatCurrency(metrics.assumptions.totalCapex)} total`, `${formatCurrency(metrics.assumptions.entryValue)} entry + ${formatCurrency(metrics.assumptions.coolingCapex)} cooling + ${formatCurrency(metrics.assumptions.capexContingency)} contingency`],
            ["Debt structure", `${formatCurrency(metrics.assumptions.debtAmount)} opening debt`, `60% LTV · 7.5% interest · ${formatCurrency(metrics.assumptions.annualPrincipalPayment)} annual principal`],
            ["Terminal value", `${formatCurrency(metrics.terminalValue)} gross exit`, `${formatCurrency(metrics.schedule[5]?.noi ?? 0)} Y5 NOI × ${metrics.assumptions.exitMultiple.toFixed(1)}x`],
            ["Equity cash flows", `${formatCurrency(metrics.equityInvested)} invested`, `${formatCurrency(metrics.totalDistributions)} total distributions · true equity returns`],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg border border-[#d9e0e4] bg-white p-4">
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7d898f]">{label}</div>
              <div className="mt-2 font-mono text-[12px] font-bold text-[#122232]">{value}</div>
              <div className="mt-1 text-[10px] leading-4 text-[#87939a]">{detail}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 overflow-x-auto rounded-lg border border-[#d9e0e4] bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <caption className="sr-only">Five-year annual project cash-flow schedule</caption>
            <thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.13em] text-[#7d898f]">
              <tr><th className="px-3 py-3">Year</th><th className="px-3 py-3">Revenue</th><th className="px-3 py-3">NOI</th><th className="px-3 py-3">Debt service</th><th className="px-3 py-3">Terminal value</th><th className="px-3 py-3">Net equity CF</th><th className="px-3 py-3">Cumulative CF</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e5eae8] font-mono text-[10px] text-[#344550]">
              {metrics.schedule.map((year) => (
                <tr key={year.year} className={year.year === 5 ? "bg-[#f8fbe8]" : undefined}>
                  <th className="px-3 py-3 font-bold text-[#122232]">{year.year === 0 ? "Close" : `Y${year.year}`}</th>
                  <td className="px-3 py-3">{formatCurrency(year.revenue)}</td>
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
      <div className="mt-5 rounded-lg border border-[#d9e0e4] bg-[#eef2f1] px-4 py-3 text-[11px] leading-5 text-[#65737d]"><Info className="mr-2 inline h-3.5 w-3.5 text-[#255bb7]" /><strong className="text-[#344550]">Model mechanics:</strong> annual revenue uses partial operating months after the later of grid and permitting gates; OPEX includes power, water, maintenance, labor, insurance, and carbon compliance; debt is equal-principal senior debt; terminal value is Y5 NOI × {metrics.assumptions.exitMultiple.toFixed(1)}x less remaining debt. Quality classifications change the underwritten inputs themselves rather than applying a generic return penalty.</div>
      <BottomNav screen="materiality" onNavigate={onNavigate} />
    </div>
  );
}

function DecisionReview({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, metrics } = useDiligence();
  const items = Object.values(evidence);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to) {
      setFlash(true);
      const timer = window.setTimeout(() => setFlash(false), 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [metrics.lastChange]);
  const grouped = classifications.map((classification) => ({ classification, items: items.filter((item) => item.classification === classification) })).filter((group) => group.items.length);
  const disputed = items.filter((item) => item.classification === "Management Assertion" || item.classification === "Missing Evidence");
  return (
    <div>
      <PageIntro
        eyebrow="04 / make the call"
        title="A return without provenance is not a decision."
        description="Bring the evidence quality and the financial outcome into the same frame. The recommendation stays blocked when material assumptions cannot be supported."
        right={<div className={`rounded-lg border px-4 py-3 transition-colors ${metrics.recommendationBlocked ? "border-[#efabb8] bg-[#fde8eb] text-[#ba2f45]" : "border-[#9bd8c5] bg-[#e0f4ed] text-[#0b7a63]"}`}><div className="text-[9px] font-bold uppercase tracking-[0.14em]">Recommendation status</div><div data-testid="status-recommendation" className="mt-1 font-mono text-sm font-bold">{metrics.recommendationBlocked ? "BLOCKED" : "READY FOR REVIEW"}</div></div>}
      />
      {metrics.recommendationBlocked && <div data-testid="banner-recommendation-blocked" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#ba2f45] bg-[#fff3f4] px-5 py-4 text-[#7f2635]"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">RECOMMENDATION BLOCKED: {metrics.missingMaterialCount} material assumptions lack sufficient evidence</div><div className="mt-1 text-[11px] leading-5 text-[#96525d]">Resolve the material evidence gaps below before treating the base return as investment-grade.</div></div></div>}
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className={`rounded-xl border border-[#d9e0e4] bg-[#122232] p-6 text-white transition-transform ${flash ? "scale-[1.01]" : ""}`} data-testid="panel-decision-return">
          <div className="flex items-start justify-between"><div><SectionKicker tone="lime">Prominent base return</SectionKicker><div className="mt-2 text-[10px] uppercase tracking-[0.17em] text-[#a4b4bd]">Evidence-adjusted project IRR</div></div><Gauge className="h-5 w-5 text-[#b9d43a]" /></div>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div data-testid="text-decision-irr" className="font-mono text-[64px] font-bold leading-none tracking-[-0.08em] text-[#d4e86b]">{formatIRR(metrics.projectIRR)}</div>
            {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && <div className={`mb-1 flex flex-col items-end gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold ${metrics.lastChange.delta < 0 ? "bg-[#f5ddd5] text-[#ba2f45]" : "bg-[#e0f4ed] text-[#0b7a63]"}`}><span className="opacity-60 line-through">{metrics.lastChange.from}% prior</span><span>{metrics.lastChange.delta > 0 ? "+" : ""}{metrics.lastChange.delta.toFixed(1)} pts</span></div>}
          </div>
          <div className="mt-5 border-t border-white/15 pt-4 text-[11px] leading-5 text-[#afbdc4]">Verified underwriting: <span className="font-mono text-white">{formatIRR(metrics.baseIRR ?? null)}</span>. The current return reflects evidence quality, timeline drag, and infrastructure risk.</div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">MOIC</div><div className="mt-1 font-mono text-sm">{metrics.moic}x</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">NPV</div><div className="mt-1 font-mono text-sm">{formatCurrency(metrics.npv)}</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">Confidence</div><div data-testid="text-decision-confidence" className="mt-1 font-mono text-sm text-[#d4e86b]">{metrics.confidenceScore}%</div></div>
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4"><div><SectionKicker>Evidence quality mix</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">What is carrying the case?</h2></div><span className="font-mono text-[10px] text-[#87939a]">{metrics.confidenceScore}% weighted</span></div>
          <div className="mt-4 space-y-3">
            {grouped.map((group) => <div key={group.classification} data-testid={`group-quality-${classMeta[group.classification].short.toLowerCase()}`} className="flex items-center gap-3"><ClassificationBadge value={group.classification} compact /><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#edf1ef]"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${(group.items.length / 12) * 100}%`, backgroundColor: classMeta[group.classification].color }} /></div><span className="w-5 text-right font-mono text-[11px] font-bold text-[#52616b]">{group.items.length}</span></div>)}
          </div>
          <div className="mt-6 grid gap-3 border-t border-[#e5eae8] pt-5 sm:grid-cols-2">
            <div><div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#7d898f]">Disputed / unverified</div><div className="mt-2 font-mono text-2xl font-bold text-[#ba2f45]">{disputed.length}</div><div className="mt-1 text-[10px] text-[#87939a]">Assertions or missing source</div></div>
            <div><div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#7d898f]">Material gap count</div><div className="mt-2 font-mono text-2xl font-bold text-[#a65a00]">{metrics.missingMaterialCount}</div><div className="mt-1 text-[10px] text-[#87939a]">Blocking the recommendation</div></div>
          </div>
        </section>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-center justify-between"><div><SectionKicker tone="warning">Material evidence gaps</SectionKicker><h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">Items that need a named owner</h2></div><CircleAlert className="h-5 w-5 text-[#ba2f45]" /></div>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {items.filter((item) => item.classification === "Missing Evidence").map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><div className="text-[11px] font-semibold text-[#344550]">{item.label}</div><div className="mt-1 text-[10px] text-[#87939a]">{item.citation}</div></div><span className="shrink-0 rounded bg-[#fde8eb] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-[#ba2f45]">Resolve</span></div>)}
            {items.filter((item) => item.classification === "Missing Evidence").length === 0 && <div className="rounded-md bg-[#e0f4ed] p-3 text-[11px] text-[#0b7a63]">No missing evidence items. The recommendation can move to review.</div>}
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-5 md:p-6">
          <SectionKicker>Decision posture</SectionKicker>
          <div className="mt-2 flex items-start gap-3"><div className={`rounded-md p-2.5 ${metrics.recommendationBlocked ? "bg-[#f5ddd5] text-[#ba2f45]" : "bg-[#d4e86b] text-[#314207]"}`}>{metrics.recommendationBlocked ? <TriangleAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</div><div><h2 className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">{metrics.recommendationBlocked ? "Do not advance on return alone." : "Advance to investment committee review."}</h2><p className="mt-2 text-[11px] leading-5 text-[#65737d]">{metrics.recommendationBlocked ? "The asset may still be compelling, but the evidence chain is not yet complete enough to support a clean recommendation." : "The evidence chain is sufficiently mature for an IC discussion. Preserve the distinction between verified inputs and modeled interpretation."}</p></div></div>
          <button data-testid="button-open-advisor-lens" onClick={() => onNavigate("advisor")} className="mt-6 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#122232] hover:text-[#607500]">Carry this into the advisor lens <ArrowRight className="h-3.5 w-3.5" /></button>
        </section>
      </div>
      <BottomNav screen="decision" onNavigate={onNavigate} />
    </div>
  );
}

function AdvisorLens({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const questions = [
    ["01", "What evidence would make the water allocation risk investable rather than merely disclosed?"],
    ["02", "How does the manager price a 9–12 month energization slip into the underwriting hurdle?"],
    ["03", "Is 100% renewable procurement a physical PPA, a bundled certificate, or an aspiration?"],
    ["04", "Where does customer concentration become a public-market governance signal?"],
  ];
  return (
    <div>
      <PageIntro
        eyebrow="05 / broaden the lens"
        title="Infrastructure risk does not stay inside the asset."
        description="For SRI and ESG advisors, the question is how a local evidence gap can travel from a private data center project into public-market exposure, stewardship priorities, and reputational risk."
        right={<div className="flex items-center gap-2 rounded-md border border-[#cbb7ec] bg-[#eee7fa] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7049b7]"><Leaf className="h-3.5 w-3.5" /> Public-market transmission</div>}
      />
      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-xl bg-[#122232] p-6 text-white md:p-7">
          <SectionKicker tone="lime">Public-market exposure</SectionKicker>
          <h2 className="max-w-md text-[25px] font-semibold leading-tight tracking-[-0.035em]">The facility is private. The consequences may not be.</h2>
          <p className="mt-3 max-w-lg text-[11px] leading-5 text-[#afbdc4]">Data center demand, chip concentration, power procurement, and resource intensity can transmit into listed companies and the funds that hold them.</p>
          <div className="mt-7 space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded bg-[#e9e0f7] text-[#482873]"><Landmark className="h-4 w-4" /></div><div><div className="text-[11px] font-bold">iShares ESG Advanced MSCI USA ETF</div><div className="mt-1 text-[10px] text-[#9dafb8]">Public equity exposure · ESG-screened broad market</div></div></div></div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded bg-[#d4e86b] text-[#314207]"><BarChart3 className="h-4 w-4" /></div><div><div className="text-[11px] font-bold">MSCI KLD 400 Social Index</div><div className="mt-1 text-[10px] text-[#9dafb8]">Socially screened benchmark · stewardship reference</div></div></div></div>
          </div>
          <div className="mt-7 flex items-center gap-3 border-t border-white/15 pt-5"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5ddd5] font-mono text-[10px] font-bold text-[#ba2f45]">NVDA</div><div><div className="text-[10px] uppercase tracking-[0.13em] text-[#9dafb8]">Largest holding signal</div><div className="mt-1 text-sm font-semibold text-[#f5ddd5]">NVIDIA</div></div><ArrowUpRight className="ml-auto h-4 w-4 text-[#b9d43a]" /></div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-7">
          <SectionKicker>Risk transmission map</SectionKicker>
          <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-[#122232]">From basin constraint to portfolio conversation</h2>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            {[
              ["Local water rights", "Missing", "#fde8eb", "#ba2f45"],
              ["Asset delay / CAPEX", "Return", "#fff0d6", "#a65a00"],
              ["Operator credibility", "Engagement", "#eee7fa", "#7049b7"],
              ["Fund exposure", "Stewardship", "#e5efff", "#255bb7"],
            ].map(([title, label, bg, color], index) => <div key={title} className="flex items-center gap-2.5"><div className="rounded-md border px-3 py-2.5" style={{ backgroundColor: bg, borderColor: `${color}55`, color }}><div className="text-[10px] font-bold">{title}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.11em] opacity-75">{label}</div></div>{index < 3 && <ArrowRight className="h-4 w-4 shrink-0 text-[#a0adb3]" />}</div>)}
          </div>
          <div className="mt-7 rounded-lg bg-[#f1f5f3] p-4"><div className="flex gap-3"><CloudLightning className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" /><p className="text-[11px] leading-5 text-[#52616b]">The relevant ESG question is not whether a fund owns this exact campus. It is whether its holdings benefit from the demand while the infrastructure externalities remain invisible in the diligence chain.</p></div></div>
        </section>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <SectionKicker>Fund-manager questions</SectionKicker>
          <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Take these into the next meeting.</h2>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {questions.map(([number, question]) => <div key={number} className="flex gap-4 py-4"><span className="font-mono text-[10px] font-bold text-[#b9d43a] [text-shadow:0_0_0_#122232]">{number}</span><p className="text-[12px] font-medium leading-5 text-[#344550]">{question}</p></div>)}
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#fff8e9] p-5 md:p-6">
          <SectionKicker tone="warning">Professional judgment</SectionKicker>
          <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.025em] text-[#122232]">Governance is the differentiator.</h2>
          <p className="mt-3 text-[11px] leading-5 text-[#6f5f49]">An advisor should be able to defend not only the conclusion, but the evidence standard applied to reach it. Document what is verified, what is inferred, and what remains a deliberate risk appetite choice.</p>
          <div className="mt-5 border-t border-[#ecd39d] pt-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#a65a00]" /><p className="text-[11px] font-semibold leading-5 text-[#6f460e]">Silent AI reclassification is not diligence.</p></div><p className="mt-2 pl-7 text-[10px] leading-4 text-[#806d51]">Any automated change to evidence provenance must be reviewable, attributable, and explicitly approved. Model assistance cannot silently convert uncertainty into fact.</p></div>
        </section>
      </div>
      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-[#cbd8d4] bg-[#eef2f1] p-5 md:flex-row md:items-center md:justify-between md:p-6"><div><SectionKicker>Close the loop</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Return to the decision with the full context.</h2><p className="mt-1 text-[11px] text-[#65737d]">The evidence record and derived return remain live as you move through the workbench.</p></div><button data-testid="button-return-decision" onClick={() => onNavigate("decision")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#122232] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4e86b] hover:-translate-y-0.5"><ClipboardCheck className="h-3.5 w-3.5" /> Return to decision review</button></div>
      <BottomNav screen="advisor" onNavigate={onNavigate} />
    </div>
  );
}

function AppShell() {
  const [screen, setScreen] = useState<Screen>("brief");
  const [mobileOpen, setMobileOpen] = useState(false);
  const diligence = useDiligence();
  const go = (next: Screen) => { setScreen(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <div className="min-h-[100dvh] bg-[#f4f6f4] text-[#122232]">
      <Header onMenu={() => setMobileOpen((value) => !value)} />
      <ProgressNav current={screen} onNavigate={go} />
      {mobileOpen && <div className="fixed inset-x-4 top-[76px] z-30 rounded-lg border border-[#cbd8d4] bg-[#f9faf8] p-2 shadow-lg md:hidden">{screens.map((item) => <button key={item.id} data-testid={`mobile-navigate-${item.id}`} onClick={() => go(item.id)} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${screen === item.id ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}><item.icon className="h-4 w-4" /> {item.label}</button>)}</div>}
      <div className="mx-auto flex max-w-[1480px]">
        <ShellAside screen={screen} metrics={diligence.metrics} onNavigate={go} />
        <main className="min-w-0 flex-1 px-4 py-7 md:px-8 md:py-10 xl:px-12">
          <div className="mx-auto max-w-[1160px]">
            {screen === "brief" && <CaseBrief metrics={diligence.metrics} onNavigate={go} />}
            {screen === "evidence" && <EvidenceRoom onNavigate={go} />}
            {screen === "materiality" && <FinancialMateriality onNavigate={go} />}
            {screen === "decision" && <DecisionReview onNavigate={go} />}
            {screen === "advisor" && <AdvisorLens onNavigate={go} />}
          </div>
        </main>
      </div>
      <footer className="border-t border-[#d9e0e4] bg-[#eef2f1] px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-[#7b888f] sm:flex-row sm:items-center"><span>SafeLoc Diligence Workbench</span><span>Proof of Concept | Transaction assumptions are synthetic | Environmental and infrastructure data from public sources</span><span className="font-mono">2024 / 24-017</span></div>
      </footer>
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