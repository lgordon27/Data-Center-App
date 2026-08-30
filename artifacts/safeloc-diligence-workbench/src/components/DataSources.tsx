import {
  Database,
  Gauge,
  Network,
  RadioTower,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import {
  formatSourceTimestamp,
  sourceStatusLabel,
  SOURCE_FALLBACK_EXPLANATION,
  type SourceState,
} from "@/data/sources";
import { useDiligence } from "@/context/DiligenceContext";

const sourceIcons = {
  fema: ShieldCheck,
  ercot: RadioTower,
  eia: Gauge,
  gridtracker: Network,
} as const;

const statusColors = {
  embedded: { dot: "#a65a00", text: "#7c4c00", bg: "#fff0d6" },
  live: { dot: "#0b7a63", text: "#08644f", bg: "#e0f4ed" },
  cached: { dot: "#a65a00", text: "#7c4c00", bg: "#fff0d6" },
  connected: { dot: "#0b7a63", text: "#08644f", bg: "#e0f4ed" },
  disconnected: { dot: "#ba2f45", text: "#9b263b", bg: "#fde8eb" },
} as const;

export function SourceStatusBadge({ source, compact = false, testId }: { source: SourceState; compact?: boolean; testId?: string }) {
  const colors = statusColors[source.status];
  const timestamp = source.timestamp && (source.status === "live" || source.status === "cached")
    ? ` · ${formatSourceTimestamp(source.timestamp)}`
    : "";
  const accessibleDetails = [
    source.fullName,
    sourceStatusLabel(source),
    source.timestamp ? formatSourceTimestamp(source.timestamp) : "timestamp unavailable",
    source.version ? `version ${source.version}` : null,
    source.dataOrigin === "provider" ? "provider response" : "embedded data",
  ].filter(Boolean).join(", ");
  return (
    <span
      data-testid={testId}
      aria-label={accessibleDetails}
      className={`inline-flex items-center gap-1.5 rounded-full border border-transparent font-mono font-bold uppercase tracking-[0.09em] ${compact ? "px-2 py-1 text-[8px]" : "px-2.5 py-1 text-[9px]"}`}
      style={{ color: colors.text, backgroundColor: colors.bg }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
      {sourceStatusLabel(source)}{timestamp}
    </span>
  );
}

function SourceDetail({ source }: { source: SourceState }) {
  const Icon = sourceIcons[source.icon];
  return (
    <article data-testid={`source-detail-${source.id}`} className="rounded-lg border border-[#d9e0e4] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" />
          <div className="min-w-0">
            <h3 className="text-[11px] font-bold text-[#122232]">{source.fullName}</h3>
            <p className="mt-1 text-[10px] leading-4 text-[#52616b]">{source.description}</p>
          </div>
        </div>
        <SourceStatusBadge source={source} testId={`source-detail-status-${source.id}`} />
      </div>
      <dl className="mt-3 grid gap-1 border-t border-[#e5eae8] pt-2 text-[10px] sm:grid-cols-3">
        <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Meaning</dt><dd className="mt-1 text-[#344550]">{source.statusMeaning}</dd></div>
        <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Timestamp / version</dt><dd className="mt-1 font-mono text-[#344550]">{formatSourceTimestamp(source.timestamp)} · {source.version ?? "Not provided"}</dd></div>
        <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Data role</dt><dd className="mt-1 text-[#344550]">{source.role}</dd></div>
      </dl>
      <p className="mt-2 text-[10px] leading-4 text-[#60707d]">{source.fallbackText}</p>
      {source.id === "eia" && <p data-testid="eia-persistent-attribution" className="mt-2 font-mono text-[9px] text-[#344550]">Electricity data: U.S. Energy Information Administration Open Data</p>}
    </article>
  );
}

export function DataSources() {
  const { sourceStates } = useDiligence();
  const sources = Object.values(sourceStates);
  return (
    <section data-testid="data-sources" aria-label="Data sources" className="mx-auto mt-8 max-w-[1160px] px-4 md:px-8 xl:px-12">
      <details className="group overflow-hidden rounded-xl border border-[#cbd8d4] bg-[#f9faf8]">
        <summary data-testid="data-sources-toggle" className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#122232]">
              <Database aria-hidden="true" className="h-4 w-4 text-[#255bb7]" />
              Data Sources
              <span className="font-normal tracking-normal text-[#60707d]">/ identity, freshness, attribution</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="hidden font-mono text-[9px] text-[#60707d] sm:inline">Expand attribution</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-[#52616b] transition-transform group-open:rotate-180" />
            </span>
          </span>
          <div data-testid="data-sources-bar" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {sources.map((source) => {
              const Icon = sourceIcons[source.icon];
              return (
                <div key={source.id} data-testid={`data-source-${source.id}`} className="flex items-center gap-2 rounded-md border border-[#e5eae8] bg-white px-2.5 py-2">
                  <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#255bb7]" />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[#344550]">{source.shortName}</span>
                  <SourceStatusBadge source={source} compact testId={`data-source-status-${source.id}`} />
                </div>
              );
            })}
          </div>
        </summary>
        <div className="border-t border-[#d9e0e4] px-4 pb-4 pt-3">
          <div data-testid="data-sources-details" className="grid gap-2 md:grid-cols-2">{sources.map((source) => <SourceDetail key={source.id} source={source} />)}</div>
          <p data-testid="data-sources-fallback" className="mt-3 rounded-md border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#6f460e]">
            {SOURCE_FALLBACK_EXPLANATION}
          </p>
        </div>
      </details>
    </section>
  );
}