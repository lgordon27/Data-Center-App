import {
  useMemo,
  useEffect,
  useState
} from "react";
import {
  PageIntro,
  BottomNav,
  ClassificationBadge,
  classifications,
  classMeta,
  evidenceCategories
} from "@/components/Shell";

import {
  ChevronDown,
  FileText,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  X
} from "lucide-react";
import { SourceStatusBadge } from "@/components/DataSources";
import {
  EVIDENCE_TIP_DISMISSED_STORAGE_KEY,
  type Classification,
  type EvidenceItem,
  useDiligence
} from "@/context/DiligenceContext";
import { formatSourceTimestamp } from "@/data/sources";
import {
  AI_EVIDENCE_CUTOFF_LABEL,
  AI_EVIDENCE_REPORTING_WINDOW,
  AI_EVIDENCE_TEMPORAL_CONFIG,
  AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL,
} from "@/data/aiEvidenceTemporal.mjs";
import type { EiaElectricityData, EiaFuel } from "@/services/eiaService";
import {
  analyzeEvidence,
  type AIEvidenceResult,
  type AIEvidenceSuccess,
} from "@/services/aiEvidenceService";
import {
  DECISION_HISTORY_EVENT,
  getDecisionHistory,
  logSessionAction,
  recordAIDecision,
  type DecisionHistoryEntry,
} from "@/services/sessionLog";
import type {
  Screen
} from "@/components/Shell";

type AssessmentNotice = "accepted" | "overridden";

function EvidenceAssessment({
  item,
  assessment,
  notice,
  onAccept,
  onOverride,
}: {
  item: EvidenceItem;
  assessment?: AIEvidenceResult;
  notice?: AssessmentNotice;
  onAccept: (item: EvidenceItem, assessment: AIEvidenceSuccess) => void;
  onOverride: (item: EvidenceItem) => void;
}) {
  if (notice) {
    return (
      <div
        data-testid={`status-ai-decision-${item.id}`}
        role="status"
        className="border-t border-[#d8e4de] bg-[#f4faf6] px-4 py-2.5 text-[10px] font-semibold text-[#0b7a63] md:px-5"
      >
        {notice === "accepted" ? "Classification updated." : "AI suggestion overridden; classification unchanged."}
      </div>
    );
  }
  if (!assessment || assessment.status === "success") {
    if (!assessment) return null;
    return (
      <div
        data-testid={`ai-assessment-${item.id}`}
        role="region"
        aria-label={`AI Assessment for ${item.label}`}
        className="border-t border-[#cbd8d4] bg-[#f4f8f5] px-4 py-3.5 md:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#607500]" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#607500]">AI Assessment</span>
              <span className="text-[9px] uppercase tracking-[0.1em] text-[#7d898f]">Suggestion, not a determination</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ClassificationBadge value={assessment.classification} compact />
              <p data-testid={`text-ai-reasoning-${item.id}`} className="text-[10px] leading-4 text-[#344550]">{assessment.reasoning}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              data-testid={`button-accept-ai-${item.id}`}
              type="button"
              onClick={() => onAccept(item, assessment)}
              className="rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#08644f] hover:bg-[#d2eee3]"
            >
              Accept
            </button>
            <button
              data-testid={`button-override-ai-${item.id}`}
              type="button"
              onClick={() => onOverride(item)}
              className="rounded-md border border-[#cbd8d4] bg-white px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b] hover:border-[#7d898f] hover:text-[#243844]"
            >
              Override
            </button>
          </div>
        </div>
         <div className="mt-3 border-t border-[#d8e4de] pt-3">
           <p data-testid={`ai-trust-context-${item.id}`} className="text-[10px] leading-4 text-[#52616b]">Only 3% of Americans have high confidence in AI for financial guidance. This suggestion is a starting point, not a conclusion. Your classification is the one the model uses.</p>
           <p data-testid={`ai-trust-source-${item.id}`} className="mt-1 font-mono text-[9px] tracking-[0.08em] text-[#60707d]">Gallup/Edward Jones, August 2026</p>
         </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`ai-assessment-${item.id}`}
      role="status"
      className={`border-t px-4 py-3 text-[10px] leading-4 md:px-5 ${assessment.status === "unparseable" ? "border-[#f1cb8b] bg-[#fff8e9] text-[#6f460e]" : "border-[#d9e0e4] bg-[#f7faf8] text-[#60707d]"}`}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <div className="font-semibold">{assessment.message}</div>
          {assessment.status === "unparseable" && (
            <pre data-testid={`text-ai-raw-response-${item.id}`} className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-[#ecd39d] bg-white/70 p-2 font-mono text-[9px] text-[#52616b]">{assessment.rawText}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({
  item,
  onChange,
  onAnalyze,
  onAccept,
  onOverride,
  assessment,
  notice,
  analysisBusy,
  analysisDisabled,
}: {
  item: EvidenceItem;
  onChange: (id: string, value: Classification) => void;
  onAnalyze: (item: EvidenceItem) => void;
  onAccept: (item: EvidenceItem, assessment: AIEvidenceSuccess) => void;
  onOverride: (item: EvidenceItem) => void;
  assessment?: AIEvidenceResult;
  notice?: AssessmentNotice;
  analysisBusy: boolean;
  analysisDisabled: boolean;
}) {
  const meta = classMeta[item.classification];
  const { sourceStates } = useDiligence();
  const source = item.sourceId ? sourceStates[item.sourceId] : null;
  const providerSource = item.providerSourceId ? sourceStates[item.providerSourceId] : null;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (assessment || notice) setOpen(true);
  }, [assessment, notice]);
  return (
    <details id={`evidence-item-${item.id}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} tabIndex={-1} data-testid={`row-evidence-${item.id}`} className="group border-b border-[#e4e9e8] last:border-0 focus-within:bg-[#fbfcfa]">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors hover:bg-[#fbfcfa] md:grid-cols-[1.55fr_0.8fr_1.55fr] md:items-center md:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} /><span className="truncate text-[12px] font-semibold text-[#243844]">{item.label}</span></span>
         <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-bold text-[#122232]">{item.value}</span> <span className="text-[10px] text-[#52616b]">{item.unit}</span>{source ? <SourceStatusBadge source={source} compact testId={`evidence-source-status-${item.id}`} /> : <span data-testid={`evidence-origin-${item.id}`} className="rounded-full bg-[#e7ecef] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.09em] text-[#52616b]">Embedded</span>}</span></span>
         <span className="flex flex-wrap items-center justify-between gap-2"><span className="flex min-w-0 flex-1 items-center gap-2"><span className="relative min-w-0 flex-1 md:max-w-[220px]"><select data-testid={`select-classification-${item.id}`} aria-label={`Classification for ${item.label}`} value={item.classification} onChange={(event) => onChange(item.id, event.target.value as Classification)} onClick={(event) => event.stopPropagation()} className="w-full appearance-none rounded-md border bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-[#243844] outline-none focus:ring-2 focus:ring-[#b9d43a]/50" style={{ borderColor: meta.border }}>{classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#52616b]" /></span><button data-testid={`button-analyze-ai-${item.id}`} type="button" aria-label={`Analyze ${item.label} with AI`} aria-busy={analysisBusy} disabled={analysisDisabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); onAnalyze(item); }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#cbd8d4] bg-white px-2 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#52616b] hover:border-[#7d898f] hover:text-[#243844] disabled:cursor-wait disabled:opacity-60"><Sparkles aria-hidden="true" className="h-3 w-3 text-[#607500]" />{analysisBusy ? "Analyzing…" : "Analyze with AI"}</button></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180 md:hidden" /></span>
      </summary>
       {analysisBusy && <div data-testid={`status-ai-analysis-${item.id}`} role="status" aria-live="polite" className="border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-2 text-[10px] text-[#60707d] md:px-5"><LoaderCircle aria-hidden="true" className="mr-1.5 inline h-3 w-3 animate-spin" />Analyzing source quality…</div>}
      <div className="grid gap-3 bg-[#fbfcfa] px-4 pb-4 pt-1 md:grid-cols-[1.55fr_0.8fr_1.55fr] md:px-5">
        <p className="text-[10px] leading-4 text-[#52616b] md:col-span-2">{item.description}</p>
         <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[#52616b]"><FileText aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" /><span>{item.citation}<span className="mt-1 block text-[9px] uppercase tracking-[0.08em] text-[#7d898f]">Role: {item.sourceRole}{source ? ` · ${source.fullName}` : " · Embedded case record"}{providerSource ? ` · Provider-ready: ${providerSource.shortName}` : ""}</span></span></div>
      </div>
       <EvidenceAssessment item={item} assessment={assessment} notice={notice} onAccept={onAccept} onOverride={onOverride} />
    </details>
  );
}

const fuelLabels: Record<EiaFuel, string> = {
  naturalGas: "Natural gas",
  wind: "Wind",
  solar: "Solar",
  nuclear: "Nuclear",
  coal: "Coal",
  other: "Other",
};

function monthLabel(period?: string) {
  if (!period) return "month unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${period}-01T00:00:00.000Z`));
}

function isStorageFlagSet(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function sparklinePoints(data: EiaElectricityData["priceHistory"]) {
  if (data.length === 0) return "";
  const values = data.map((point) => point.pricePerMwh);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return data.map((point, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * 220;
    const y = 54 - ((point.pricePerMwh - min) / range) * 46;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function EiaElectricityEvidence({
  data,
  loading,
  source,
  classification,
  onSuggestVerified,
}: {
  data: EiaElectricityData;
  loading: boolean;
  source: ReturnType<typeof useDiligence>["sourceStates"]["eia"];
  classification: Classification;
  onSuggestVerified: () => void;
}) {
  const mix = data.latestGenerationMix;
  const historyText = data.priceHistory.map((point) => `${monthLabel(point.period)}: $${point.pricePerMwh.toFixed(1)} per MWh`).join("; ");
  const trendCopy = data.trend === "unavailable"
    ? "Unavailable — 25 monthly calculation points are required to compare consecutive year-over-year windows."
    : `${data.trend[0].toUpperCase()}${data.trend.slice(1)} versus the preceding 12-month window.`;
  return (
    <article data-testid="eia-electricity-evidence" className="border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-5 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Federal electricity context</div>
          <h3 className="mt-1 text-[14px] font-semibold text-[#122232]">Texas industrial price, trend, and generation mix</h3>
          <p data-testid="eia-attribution" className="mt-1 font-mono text-[9px] text-[#52616b]">Electricity data: U.S. Energy Information Administration Open Data</p>
        </div>
        <SourceStatusBadge source={source} testId="eia-evidence-source-status" />
      </div>
      {loading ? (
        <p data-testid="eia-loading" className="mt-4 text-[10px] text-[#52616b]">Checking the server-backed EIA source…</p>
      ) : data.dataOrigin === "provider" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <section data-testid="eia-price-history" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Industrial retail rate</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span data-testid="eia-latest-rate" className="font-mono text-2xl font-bold text-[#122232]">${data.latestPrice.toFixed(1)}</span>
              <span className="text-[10px] text-[#52616b]">/ MWh</span>
            </div>
            <p className="mt-1 text-[10px] text-[#52616b]">Source: U.S. EIA, {monthLabel(data.latestPricePeriod)}</p>
            <figure className="mt-3">
              <svg role="img" aria-label={`Texas industrial electricity price history for ${data.priceHistory.length} months`} viewBox="0 0 220 60" className="h-16 w-full overflow-visible">
                <title>Texas industrial electricity-price history</title>
                <polyline points={sparklinePoints(data.priceHistory)} fill="none" stroke="#255bb7" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <figcaption className="text-[9px] text-[#7d898f]">{data.priceHistory.length}-month monthly trend · oldest to latest</figcaption>
              <span className="sr-only">{historyText}</span>
            </figure>
            {data.status === "live" ? (
              <button
                data-testid="button-suggest-verified-eia"
                type="button"
                onClick={onSuggestVerified}
                disabled={classification === "Verified Evidence"}
                className="mt-3 rounded-md border border-[#0b7a63] bg-[#e0f4ed] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#08644f] disabled:cursor-default disabled:opacity-60"
              >
                {classification === "Verified Evidence" ? "Verified Evidence retained" : "Suggest Verified Evidence"}
              </button>
            ) : <p className="mt-3 text-[9px] text-[#7d898f]">Cached federal observation — no live verification suggestion.</p>}
          </section>
          <section data-testid="eia-price-trend" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Year-over-year movement</div>
            <div className="mt-2 font-mono text-xl font-bold text-[#122232]">{data.yoyChangePercent === null ? "Unavailable" : `${data.yoyChangePercent >= 0 ? "+" : ""}${data.yoyChangePercent.toFixed(1)}%`}</div>
            <dl className="mt-3 space-y-2 text-[10px]">
              <div><dt className="font-bold text-[#52616b]">Latest 12-month change</dt><dd className="mt-0.5 text-[#243844]">{data.yoyChangePercent === null ? "Insufficient history" : `${data.yoyChangePercent.toFixed(1)}%`}</dd></div>
              <div><dt className="font-bold text-[#52616b]">Preceding 12-month change</dt><dd className="mt-0.5 text-[#243844]">{data.precedingYoyChangePercent === null ? "Insufficient history" : `${data.precedingYoyChangePercent.toFixed(1)}%`}</dd></div>
              <div><dt className="font-bold text-[#52616b]">Trend</dt><dd data-testid="eia-acceleration-trend" className="mt-0.5 text-[#243844]">{trendCopy}</dd></div>
            </dl>
          </section>
          <section data-testid="eia-generation-mix" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Texas generation mix · {monthLabel(mix?.period)}</div>
            {mix ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                {(Object.keys(fuelLabels) as EiaFuel[]).map((fuel) => (
                  <div key={fuel} className="rounded bg-[#f1f5f3] px-2 py-1.5">
                    <dt className="text-[#60707d]">{fuelLabels[fuel]}</dt>
                    <dd data-testid={`eia-mix-${fuel}`} className="mt-0.5 font-mono font-bold text-[#122232]">{mix.shares[fuel].toFixed(1)}%</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="mt-3 text-[10px] text-[#52616b]">Generation mix unavailable.</p>}
            <p className="mt-3 text-[9px] leading-4 text-[#6f460e]">Statewide generation mix is market context only. It does not prove Stargate’s delivered renewable procurement or contract supply.</p>
            {data.consumptionHistory.at(-1) && <p className="mt-2 text-[9px] text-[#7d898f]">Latest total consumption: {Math.round(data.consumptionHistory.at(-1)!.consumptionMwh).toLocaleString()} MWh.</p>}
          </section>
        </div>
      ) : (
        <div data-testid="eia-fallback-state" className="mt-4 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4 text-[10px] leading-5 text-[#6f460e]">
          EIA observations are unavailable. The workbench remains usable with the embedded $42/MWh underwriting assumption; it is not presented as current federal data.
          {data.error && <span className="mt-1 block text-[9px] text-[#7f6337]">{data.error}</span>}
        </div>
      )}
    </article>
  );
}

export function EvidenceRoom({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, updateClassification, metrics, ercotQueue, eiaData, eiaLoading, sourceStates } = useDiligence();
  const items = useMemo(() => Object.values(evidence), [evidence]);
  const counts = useMemo(() => classifications.map((classification) => ({ classification, count: items.filter((item) => item.classification === classification).length })), [items]);
  const match = ercotQueue.matchingProject;
  const canSuggestVerified = ercotQueue.providerStatus === "live" && Boolean(match?.explicitDelayOrCancellation);
  const [showClassificationTip, setShowClassificationTip] = useState(() => !isStorageFlagSet(EVIDENCE_TIP_DISMISSED_STORAGE_KEY));
  const [assessments, setAssessments] = useState<Record<string, AIEvidenceResult | undefined>>({});
  const [notices, setNotices] = useState<Record<string, AssessmentNotice | undefined>>({});
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>(getDecisionHistory);
  const isAnalysisBusy = activeAnalysisId !== null;

  useEffect(() => {
    const syncDecisionHistory = () => setDecisionHistory(getDecisionHistory());
    window.addEventListener(DECISION_HISTORY_EVENT, syncDecisionHistory);
    return () => window.removeEventListener(DECISION_HISTORY_EVENT, syncDecisionHistory);
  }, []);

  const dismissClassificationTip = () => {
    setShowClassificationTip(false);
    try {
      window.localStorage.setItem(EVIDENCE_TIP_DISMISSED_STORAGE_KEY, "true");
    } catch {
      // Storage is optional; the dismissal still applies for this visit.
    }
  };

  const analyzeOne = async (item: EvidenceItem) => {
    if (isAnalysisBusy) return;
    setAssessments((current) => ({ ...current, [item.id]: undefined }));
    setNotices((current) => ({ ...current, [item.id]: undefined }));
    setActiveAnalysisId(item.id);
    try {
      const result = await analyzeEvidence(item);
      setAssessments((current) => ({ ...current, [item.id]: result }));
    } catch {
      setAssessments((current) => ({
        ...current,
        [item.id]: { status: "error", message: "AI analysis unavailable. Classify manually." },
      }));
    } finally {
      setActiveAnalysisId(null);
    }
  };

  const analyzeAll = async () => {
    if (isAnalysisBusy) return;
    setNotices({});
    setBatchProgress({ current: 1, total: items.length });
    for (const [index, item] of items.entries()) {
      setAssessments((current) => ({ ...current, [item.id]: undefined }));
      setActiveAnalysisId(item.id);
      setBatchProgress({ current: index + 1, total: items.length });
      try {
        const result = await analyzeEvidence(item);
        setAssessments((current) => ({ ...current, [item.id]: result }));
      } catch {
        setAssessments((current) => ({
          ...current,
          [item.id]: { status: "error", message: "AI analysis unavailable. Classify manually." },
        }));
      }
    }
    setActiveAnalysisId(null);
    setBatchProgress(null);
  };

  const acceptAssessment = (item: EvidenceItem, assessment: AIEvidenceSuccess) => {
    updateClassification(item.id, assessment.classification, "ai");
    logSessionAction("AI-proposed, human-accepted", item.id);
    recordAIDecision(item.id, assessment.classification, assessment.reasoning, "accepted", assessment.classification);
    setAssessments((current) => ({ ...current, [item.id]: undefined }));
    setNotices((current) => ({ ...current, [item.id]: "accepted" }));
    window.setTimeout(() => {
      setNotices((current) => current[item.id] === "accepted" ? { ...current, [item.id]: undefined } : current);
    }, 4000);
  };

  const overrideAssessment = (item: EvidenceItem) => {
    logSessionAction("AI-proposed, human-overridden", item.id);
    const assessment = assessments[item.id];
    if (assessment?.status === "success") {
      recordAIDecision(item.id, assessment.classification, assessment.reasoning, "overridden", item.classification);
    }
    setAssessments((current) => ({ ...current, [item.id]: undefined }));
    setNotices((current) => ({ ...current, [item.id]: "overridden" }));
    window.setTimeout(() => {
      setNotices((current) => current[item.id] === "overridden" ? { ...current, [item.id]: undefined } : current);
    }, 4000);
  };

  return (
    <div>
      <PageIntro
        eyebrow="02 / source the conviction"
        title="Evidence is not a footnote. It is an active model input."
        description={`${items.length} diligence inputs are classified by provenance. Change a classification to test what the return looks like when an assertion becomes an assumption, or when missing evidence is finally verified.`}
        right={
          <div className="flex flex-wrap items-end justify-end gap-2">
            <div data-testid="text-evidence-count" className="rounded-lg border border-[#cbd8d4] bg-[#f9faf8] px-4 py-3 text-right">
              <div className="font-mono text-xl font-bold text-[#122232]">{items.length}<span className="text-[#52616b]"> / {items.length}</span></div>
              <div className="text-[9px] uppercase tracking-[0.14em] text-[#52616b]">Inputs registered</div>
            </div>
            <div className="flex flex-col items-stretch gap-1">
              <button
                data-testid="button-analyze-all-ai"
                type="button"
                disabled={isAnalysisBusy}
                aria-busy={isAnalysisBusy}
                onClick={() => void analyzeAll()}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#9aaec0] bg-[#122232] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] hover:border-[#d4e86b] disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                {batchProgress ? `Analyzing ${batchProgress.current} of ${batchProgress.total}…` : "Analyze All with AI"}
              </button>
              {batchProgress && <span data-testid="status-ai-batch" role="status" aria-live="polite" className="text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[#60707d]">One item at a time · suggestions only</span>}
            </div>
          </div>
        }
      />
      <aside data-testid="ai-evidence-time-contract" role="note" className="mb-5 rounded-lg border border-[#cbd8d4] bg-[#f4f8f5] px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#607500]">AI evidence time contract</div>
            <h2 className="mt-1 text-[12px] font-semibold text-[#243844]">Review the diligence cutoff before running analysis</h2>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#52616b]">
            <span data-testid="ai-evidence-cutoff" className="rounded-full bg-white px-2.5 py-1">Cutoff: <time dateTime={AI_EVIDENCE_TEMPORAL_CONFIG.cutoffDate}>{AI_EVIDENCE_CUTOFF_LABEL}</time></span>
            <span data-testid="ai-evidence-reporting-window" className="rounded-full bg-white px-2.5 py-1">Valid reporting: {AI_EVIDENCE_REPORTING_WINDOW}</span>
          </div>
        </div>
        <p className="mt-2 max-w-4xl text-[10px] leading-4 text-[#52616b]">
          The AI prompt and this Evidence Room use the same reviewed temporal record. Dated {AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL} reporting remains valid and potentially current as of the cutoff; update the shared temporal configuration when the diligence cutoff changes.
        </p>
      </aside>
      {showClassificationTip && (
        <aside data-testid="evidence-classification-tip" role="note" className="classification-tip mb-5 flex items-start gap-3 rounded-lg border border-[#b9d43a]/70 bg-[#f8fbe8] px-4 py-3 text-[#344550]">
          <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#607500]" />
          <p className="min-w-0 flex-1 text-[11px] leading-5">
            <strong className="font-semibold text-[#122232]">Try it:</strong> Click any dropdown and change a classification. Watch what happens.
          </p>
          <button
            data-testid="button-dismiss-evidence-classification-tip"
            type="button"
            aria-label="Dismiss classification tip"
            title="Dismiss classification tip"
            onClick={dismissClassificationTip}
            className="shrink-0 rounded p-1 text-[#607500] transition-colors hover:bg-[#d4e86b]/40 hover:text-[#344550]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </aside>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {counts.map(({ classification, count }) => {
          const meta = classMeta[classification];
          return <div key={classification} data-testid={`count-classification-${meta.short.toLowerCase()}`} className="rounded-lg border p-3" style={{ borderColor: meta.border, backgroundColor: meta.bg }}><div className="flex items-center justify-between gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} /><span className="font-mono text-xl font-bold" style={{ color: meta.color }}>{count}</span></div><div className="mt-2 text-[9px] font-bold uppercase leading-3 tracking-[0.1em]" style={{ color: meta.color }}>{classification}</div></div>;
        })}
      </div>
      <DecisionHistory items={decisionHistory} evidence={evidence} />
      <div className="space-y-3">
        {evidenceCategories.map((category) => {
          const categoryItems = category.itemIds.map((id) => evidence[id]).filter(Boolean);
          const verified = categoryItems.filter((item) => item.classification === "Verified Evidence").length;
          const missing = categoryItems.filter((item) => item.classification === "Missing Evidence").length;
          return (
            <section key={category.id} id={`evidence-category-${category.id}`} data-testid={`evidence-category-${category.id}`} className="overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e0e4] bg-[#f1f5f3] px-4 py-3 md:px-5">
                 <div><h2 className="text-[13px] font-semibold text-[#122232]">{category.label}</h2><p className="mt-0.5 text-[10px] text-[#7d898f]">{categoryItems.length} inputs · provenance summary</p></div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em]"><span className="rounded-full bg-[#e0f4ed] px-2 py-1 text-[#0b7a63]">{verified} verified</span><span className={`rounded-full px-2 py-1 ${missing ? "bg-[#fde8eb] text-[#ba2f45]" : "bg-white text-[#7d898f]"}`}>{missing} missing</span></div>
              </header>
              <div className="hidden grid-cols-[1.55fr_0.8fr_1.55fr] gap-3 border-b border-[#e5eae8] px-5 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d898f] md:grid"><span>Variable</span><span>Value</span><span>Classification</span></div>
              {categoryItems.map((item) => (
                <EvidenceRow
                  key={item.id}
                  item={item}
                  onChange={updateClassification}
                  onAnalyze={analyzeOne}
                  onAccept={acceptAssessment}
                  onOverride={overrideAssessment}
                  assessment={assessments[item.id]}
                  notice={notices[item.id]}
                  analysisBusy={activeAnalysisId === item.id}
                  analysisDisabled={isAnalysisBusy}
                />
              ))}
              {category.id === "power-grid" && (
                <>
                  <EiaElectricityEvidence
                    data={eiaData}
                    loading={eiaLoading}
                    source={sourceStates.eia}
                    classification={evidence.electricity_cost.classification}
                    onSuggestVerified={() => updateClassification("electricity_cost", "Verified Evidence")}
                  />
                <article data-testid="ercot-grid-evidence" className="border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-4 md:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">ERCOT Interconnection Queue citation</div>
                      <h3 className="mt-1 text-[12px] font-semibold text-[#122232]">Grid Interconnection Timeline · public queue check</h3>
                    </div>
                    <SourceStatusBadge source={sourceStates["ercot-queue"]} testId="ercot-evidence-source-status" />
                  </div>
                  {match ? (
                    <dl data-testid="ercot-matching-record" className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Project</dt><dd className="mt-1 text-[#243844]">{match.name} · {match.inr}</dd></div>
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Capacity / status</dt><dd className="mt-1 text-[#243844]">{match.capacityMw.toFixed(1)} MW · {match.currentStatus}</dd></div>
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">COD / IA</dt><dd className="mt-1 text-[#243844]">{match.projectedCod ? formatSourceTimestamp(match.projectedCod) : "Projected COD not published"} · {match.iaStatus ?? "IA status not published"}</dd></div>
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Slips / position</dt><dd className="mt-1 text-[#243844]">{match.codSlipCount} slips · {match.totalDaysSlipped} days{match.queuePosition !== null ? ` · Queue position ${match.queuePosition}` : " · Queue position not published"}</dd></div>
                    </dl>
                  ) : (
                    <p data-testid="ercot-no-named-match" className="mt-3 text-[10px] leading-4 text-[#52616b]">
                       No named Stargate, Oracle, or Crusoe customer-specific record was published in the generation queue. The existing cancellation and delay evidence remains public-reporting context; this feed does not independently confirm it.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8e5] pt-3">
                    <p className="text-[9px] text-[#60707d]">Last updated {formatSourceTimestamp(ercotQueue.sourceUpdatedAt ?? undefined)} · Feed freshness does not change evidence classification.</p>
                    {canSuggestVerified ? (
                      <button
                        data-testid="button-suggest-verified-grid"
                        type="button"
                        onClick={() => updateClassification("grid_interconnection", "Verified Evidence")}
                        className="rounded-md border border-[#0b7a63] bg-[#e0f4ed] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#08644f]"
                      >
                        Suggest VERIFIED
                      </button>
                    ) : (
                      <span data-testid="text-no-ercot-suggestion" className="text-[9px] text-[#7d898f]">
                        No suggestion: a live named record with an explicit delay or cancellation is required.
                      </span>
                    )}
                  </div>
                </article>
                </>
              )}
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

function DecisionHistory({ items, evidence }: { items: DecisionHistoryEntry[]; evidence: Record<string, EvidenceItem> }) {
  const orderedItems = [...items].reverse();
  return (
    <section data-testid="ai-decision-history" aria-labelledby="ai-decision-history-title" className="mb-5 overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
      <header className="border-b border-[#d9e0e4] bg-[#122232] px-4 py-4 text-white md:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#b9d43a]">Reviewable decision trail</div>
            <h2 id="ai-decision-history-title" className="mt-1 text-[16px] font-semibold">AI decisions behind the classification</h2>
          </div>
          <span data-testid="ai-decision-history-count" className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#aebdc5]">{items.length} {items.length === 1 ? "entry" : "entries"}</span>
        </div>
        <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#c4d0d6]">Model suggestions and human decisions are recorded separately. This history explains how the current classification was reached; it does not change the live model.</p>
      </header>
      {orderedItems.length === 0 ? (
        <p data-testid="ai-decision-history-empty" className="px-4 py-4 text-[10px] leading-4 text-[#60707d] md:px-5">No AI decisions or manual classification changes have been recorded in this session.</p>
      ) : (
        <ol className="divide-y divide-[#e5eae8]">
          {orderedItems.map((entry, index) => {
            const item = evidence[entry.itemId];
            if (!item) return null;
            return (
              <li key={`${entry.recordedAt}-${entry.itemId}-${index}`} data-testid={`decision-history-entry-${index}`} className="px-4 py-4 md:px-5">
                {entry.kind === "ai" ? (
                  <AIDecisionHistoryEntry entry={entry} item={item} />
                ) : (
                  <ManualDecisionHistoryEntry entry={entry} item={item} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function AIDecisionHistoryEntry({ entry, item }: { entry: Extract<DecisionHistoryEntry, { kind: "ai" }>; item: EvidenceItem }) {
  const accepted = entry.decision === "accepted";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#607500]" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">Model suggestion</span>
            <span className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${accepted ? "bg-[#e0f4ed] text-[#0b7a63]" : "bg-[#fff0d6] text-[#a65a00]"}`}>{accepted ? "Accepted by human" : "Overridden by human"}</span>
          </div>
          <h3 className="mt-2 text-[12px] font-semibold text-[#243844]">{item.label}</h3>
        </div>
        <time dateTime={entry.recordedAt} className="font-mono text-[9px] text-[#7d898f]">{formatDecisionTime(entry.recordedAt)}</time>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">AI proposed</div>
          <div className="mt-2"><ClassificationBadge value={entry.proposedClassification} compact /></div>
          <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{entry.reasoning}</p>
        </div>
        <div className="rounded-lg border border-[#d9e0e4] bg-[#fbfcfa] p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Human decision / resulting classification</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-[#52616b]">{accepted ? "Accepted" : "Override retained"}</span>
            <ClassificationBadge value={entry.resultingClassification} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualDecisionHistoryEntry({ entry, item }: { entry: Extract<DecisionHistoryEntry, { kind: "manual" }>; item: EvidenceItem }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#255bb7]" aria-hidden="true" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#255bb7]">Human decision · manual classification change</span>
        </div>
        <h3 className="mt-2 text-[12px] font-semibold text-[#243844]">{item.label}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#52616b]">
          <ClassificationBadge value={entry.previousClassification} compact />
          <span aria-hidden="true">→</span>
          <ClassificationBadge value={entry.resultingClassification} compact />
        </div>
      </div>
      <time dateTime={entry.recordedAt} className="font-mono text-[9px] text-[#7d898f]">{formatDecisionTime(entry.recordedAt)}</time>
    </div>
  );
}

function formatDecisionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

