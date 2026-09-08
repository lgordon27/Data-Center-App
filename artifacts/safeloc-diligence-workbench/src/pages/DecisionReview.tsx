import {
  useEffect,
  useState
} from "react";
import {
  ClassificationBadge,
  SectionKicker,
  LowConfidenceWarning,
  PageIntro,
  BottomNav
  ,formatCount
} from "@/components/Shell";

import {
  ArrowRight,
  CircleAlert,
  Gauge,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert
} from "lucide-react";
import {
  SavedScenario,
  useDiligence
} from "@/context/DiligenceContext";
import {
  isMaterialEvidenceId,
  getEffectiveSupportState,
  formatImpactDelta,
  type RecommendationStatus,
} from "@/model/cashFlowEngine";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Input
} from "@/components/ui/input";

import {
  formatCurrency,
  formatIRR,
  formatScenarioMetric,
  formatPayback,
  formatPercentagePoints,
  formatScenarioDelta,
  classifications,
  classMeta
} from "@/components/Shell";
import type {
  Screen
} from "@/components/Shell";
import { ClaimCitation } from "@/components/ClaimCitation";
import { COMMUNITY_TERM_DEFINITIONS } from "@/data/communityAgreements";

const holdingsConnectionCopy: Record<RecommendationStatus, string> = {
  BLOCKED: "NVIDIA GPU contracts and hyperscaler CAPEX may connect values-aligned funds to this buildout, but unresolved project evidence leaves a material exposure gap. This blocked status is a diligence signal—not a facility-level Stargate fact or a holdings recommendation.",
  CONDITIONAL: "NVIDIA GPU contracts and hyperscaler CAPEX may connect values-aligned funds to this buildout. The exposure gap remains conditional while unverified project assumptions are carried into review; this is market context, not a holdings recommendation.",
  "READY FOR REVIEW": "NVIDIA GPU contracts and hyperscaler CAPEX connect values-aligned funds to this buildout. The project evidence is ready for review, while portfolio exposure remains market context—not proof of facility-level Stargate exposure or a holdings recommendation.",
};

export function DecisionReview({ onNavigate, onResolve, requestedAction, onRequestedActionHandled }: { onNavigate: (screen: Screen) => void; onResolve: (id: string) => void; requestedAction?: "save" | "compare" | null; onRequestedActionHandled?: () => void }) {
  const { evidence, metrics, scenarios, saveScenario, renameScenario, removeScenario, project, communityReview, communityUnresolvedCount } = useDiligence();
  const scenarioItems = project.kind === "custom" ? [] : scenarios;
  const holdingsCopy = project.kind === "custom"
    ? {
        BLOCKED: "The selected project has unresolved evidence gaps. This blocked status is a diligence signal—not facility-level proof or a holdings recommendation.",
        CONDITIONAL: "The selected project remains conditional while unverified assumptions are carried into review. This is project context, not a holdings recommendation.",
        "READY FOR REVIEW": "The selected project evidence is ready for review, while any portfolio connection remains context—not proof of facility-level exposure or a holdings recommendation.",
      }
    : holdingsConnectionCopy;
  const items = Object.values(evidence);
  const materialItems = items.filter((item) => isMaterialEvidenceId(item.id));
  const materialGapItems = materialItems.filter((item) => getEffectiveSupportState(item) === "unresolved");
  const materialDependencyLabels = materialItems.map((item) => item.label);
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
  const scenarioToRemove = scenarioItems.find((scenario) => scenario.id === removeScenarioId);
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
  useEffect(() => {
    if (!requestedAction) return;
    if (requestedAction === "save" && project.kind !== "custom" && scenarioItems.length < 5) {
      setSaveFeedback("");
      setSaveOpen(true);
    }
    if (requestedAction === "compare" && project.kind !== "custom") setShowComparison(true);
    onRequestedActionHandled?.();
  }, [requestedAction, project.kind, scenarioItems.length, onRequestedActionHandled]);
  const grouped = classifications.map((classification) => ({ classification, items: items.filter((item) => item.classification === classification) })).filter((group) => group.items.length);
  const disputed = items.filter((item) => item.classification === "Management Assertion" || item.classification === "Missing Evidence");
  const consequenceItems = items.filter((item) => (item.modelClassification ?? item.classification) !== "Verified Evidence");
  return (
    <div>
      <PageIntro
        eyebrow="04 / make the call"
        title="A return without provenance is not a decision."
        description="Bring the evidence quality and the financial outcome into the same frame. The recommendation is derived from the status of material evidence, not from the return alone."
        right={<div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end"><div data-testid="card-recommendation-status" className="rounded-lg border px-4 py-3" style={{ color: statusMeta.color, backgroundColor: statusMeta.bg, borderColor: statusMeta.border }}><div className="text-[9px] font-bold uppercase tracking-[0.14em]">Recommendation status</div><div data-testid="status-recommendation" className="mt-1 font-mono text-sm font-bold">{metrics.recommendationStatus}</div></div><div className="flex gap-2"><button data-testid="button-save-scenario" disabled={project.kind === "custom" || scenarioItems.length >= 5} onClick={() => { setSaveFeedback(""); setSaveOpen(true); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#122232] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#87939a] disabled:text-white">Save Scenario <span className="font-mono text-[9px] opacity-70">({scenarioItems.length}/5)</span></button><button data-testid="button-compare-scenarios" onClick={() => setShowComparison((value) => !value)} disabled={project.kind === "custom"} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-[#cbd8d4] bg-white px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#122232] hover:border-[#122232] disabled:cursor-not-allowed disabled:opacity-60">{showComparison ? "Hide comparison" : "Compare Scenarios"}</button></div></div>}
      />
      {project.kind === "custom" && <div role="status" data-testid="custom-scenario-disabled" className="mb-5 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-4 py-3 text-[11px] leading-5 font-semibold text-[#7f6337]">Named scenarios and comparisons are disabled for custom research. Custom results remain session-only and are not saved to browser storage.</div>}
      {project.kind !== "custom" && scenarioItems.length >= 5 && <div role="status" data-testid="text-scenario-capacity" className="mb-5 rounded-lg border border-[#ecd39d] bg-[#fff8e9] px-4 py-3 text-[11px] font-semibold text-[#7f6337]">Scenario capacity reached (5/5). Save Scenario is disabled; named snapshots remain independent of the live case.</div>}
      {saveFeedback && <div role="status" data-testid="text-scenario-feedback" className={`mb-5 rounded-lg border px-4 py-3 text-[11px] font-semibold ${saveFeedback.startsWith("A scenario") || saveFeedback.startsWith("Five") ? "border-[#efabb8] bg-[#fff3f4] text-[#ba2f45]" : "border-[#9bd8c5] bg-[#e0f4ed] text-[#0b7a63]"}`}>{saveFeedback}</div>}
       <SavedScenarioList
         scenarios={scenarioItems}
         onRename={(scenario) => {
           setRenameScenarioId(scenario.id);
           setRenameName(scenario.name);
           setRenameFeedback("");
           setRenameOpen(true);
         }}
         onRemove={(scenario) => setRemoveScenarioId(scenario.id)}
       />
      {showComparison && <ScenarioComparison scenarios={scenarioItems} />}
      {metrics.recommendationStatus === "BLOCKED" && <div data-testid="banner-recommendation-blocked" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#ba2f45] bg-[#fff3f4] px-5 py-4 text-[#7f2635]"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">RECOMMENDATION BLOCKED: {formatCount(metrics.missingMaterialCount, "material item")} missing evidence</div><div className="mt-1 text-[11px] leading-5 text-[#96525d]">Resolve the material evidence gaps below before treating the Underwriting Baseline as investment-grade.</div></div></div>}
      {metrics.recommendationStatus === "CONDITIONAL" && <div data-testid="banner-recommendation-conditional" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#a65a00] bg-[#fff8e9] px-5 py-4 text-[#6f460e]"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">CONDITIONAL: {formatCount(metrics.materialUnverifiedCount, "material assumption")} remain unverified</div><div className="mt-1 text-[11px] leading-5 text-[#806d51]">Name the evidence owners and carry these conditions into review.</div></div></div>}
      {metrics.recommendationStatus === "READY FOR REVIEW" && <div data-testid="banner-recommendation-ready" className="mb-5 flex items-start gap-3 rounded-xl border-2 border-[#0b7a63] bg-[#f0faf5] px-5 py-4 text-[#0b6351]"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">READY FOR REVIEW: all material evidence is supported</div><div className="mt-1 text-[11px] leading-5 text-[#4b756b]">The return is ready for an IC discussion with its provenance preserved.</div></div></div>}
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className={`motion-scale rounded-xl border border-[#d9e0e4] bg-[#122232] p-6 text-white transition-transform ${flash ? "scale-[1.01]" : ""}`} data-testid="panel-decision-return">
          <div className="flex items-start justify-between"><div><SectionKicker tone="lime" className="!text-[#d4e86b]">Conservative stress case return</SectionKicker><div className="mt-2 text-[10px] uppercase tracking-[0.17em] text-[#a4b4bd]">Conservative Stress Case project IRR</div></div><Gauge className="h-5 w-5 text-[#b9d43a]" /></div>
          {lowConfidence && <div className="mt-4"><LowConfidenceWarning testId="warning-low-confidence-decision" /></div>}
          <div className="mt-5 flex items-end justify-between gap-3">
            <div data-testid="text-decision-irr" className="font-mono text-[64px] font-bold leading-none tracking-[-0.08em] text-[#d4e86b]">{formatIRR(metrics.projectIRR)}</div>
            {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && <div className={`mb-1 flex flex-col items-end gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold ${metrics.lastChange.delta < 0 ? "bg-[#f5ddd5] text-[#ba2f45]" : "bg-[#e0f4ed] text-[#0b7a63]"}`}><span className="opacity-60 line-through">{formatIRR(metrics.lastChange.from)} prior</span><span>{formatPercentagePoints(metrics.lastChange.delta, { signed: true })}</span></div>}
          </div>
          <div className="mt-5 border-t border-white/15 pt-4 text-[11px] leading-5 text-[#afbdc4]">Underwriting Baseline: <span className="font-mono text-white">{formatIRR(metrics.baseIRR ?? null)}</span>. The Conservative Stress Case reflects evidence quality, timeline drag, and infrastructure risk.</div>
           <div className="mt-6 grid grid-cols-3 gap-2">
           <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">MOIC</div><div className="mt-1 font-mono text-sm">{formatScenarioMetric(metrics.moic, "moic")}</div></div>
           <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">NPV</div><div className="mt-1 font-mono text-sm">{formatCurrency(metrics.npv, 0)}</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">Confidence</div><div data-testid="text-decision-confidence" className="mt-1 font-mono text-sm text-[#d4e86b]">{metrics.confidenceScore}%</div></div>
          </div>
           <div data-testid="decision-return-companions" className="mt-2 grid grid-cols-3 gap-2">
             <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">Cash-on-cash</div><div className="mt-1 font-mono text-sm">{formatScenarioMetric(metrics.cashOnCash, "cashOnCash")}</div></div>
             <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">Payback</div><div className="mt-1 font-mono text-sm">{formatPayback(metrics.payback)}</div></div>
             <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.1em] text-[#9dafb8]">Evidence gap</div><div className="mt-1 font-mono text-sm">{formatPercentagePoints(metrics.baseIRR !== null && metrics.projectIRR !== null ? Math.abs(metrics.baseIRR - metrics.projectIRR) : null)}</div></div>
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
          <p data-testid="text-climate-material-dependencies" className="mt-3 rounded-md bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#7f6337]">Material recommendation dependencies: {materialDependencyLabels.join(", ")}. Missing evidence blocks review; model inference or user assumption keeps the decision conditional.</p>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {materialGapItems.map((item) => <div key={item.id} data-testid={`material-gap-row-${item.id}`} className="flex items-center justify-between gap-4 py-3"><div><div className="text-[11px] font-semibold text-[#344550]">{item.label}</div><div className="mt-1 text-[10px] text-[#52616b]">{item.citation}</div></div><button type="button" data-testid={`button-resolve-${item.id}`} onClick={() => onResolve(item.id)} className="shrink-0 rounded bg-[#fde8eb] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.11em] text-[#ba2f45] hover:bg-[#ba2f45] hover:text-white">Resolve <ArrowRight aria-hidden="true" className="ml-1 inline h-3 w-3" /></button></div>)}
            {materialGapItems.length === 0 && <div data-testid="material-gap-empty" className="rounded-md bg-[#e0f4ed] p-3 text-[11px] text-[#0b7a63]">No material evidence gaps. The recommendation is not blocked by missing evidence.</div>}
          </div>
          <section data-testid="decision-consequence-register" className="mt-5 border-t border-[#e5eae8] pt-4" aria-labelledby="decision-consequence-title">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">Decision consequence register</div>
            <h3 id="decision-consequence-title" className="mt-1 text-[14px] font-semibold text-[#122232]">What each unresolved classification means</h3>
            <div className="mt-3 divide-y divide-[#e5eae8]">
              {consequenceItems.map((item) => {
                const attribution = metrics.attribution[item.id];
                const isDriver = item.impactRole === "Financial Driver";
                const modeledClassification = attribution?.modeledClassification ?? item.modelClassification ?? item.classification;
                return <div key={item.id} data-testid={`decision-consequence-${item.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-[11px] font-semibold text-[#344550]">{item.label}</div><div className="mt-1 text-[10px] leading-4 text-[#52616b]">Source classification: {item.classification}{modeledClassification !== item.classification ? ` · modeled treatment: ${modeledClassification}` : ""}</div><div className="mt-1 text-[10px] leading-4 text-[#52616b]">{isDriver ? `Calculated project consequence on ${attribution?.affectedCashFlowLine ?? "cash flow"}: ${attribution ? formatCurrency(attribution.dollarImpact) : "Unavailable"} total marginal effect; ${attribution ? formatImpactDelta(attribution.singleInputSensitivityIRR) : "N/M"} single-input IRR sensitivity.` : `${item.impactRole} review consequence: resolve or condition the decision; no direct modeled adjustment.`}</div></div>
                  <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${isDriver ? "bg-[#fde8eb] text-[#ba2f45]" : "bg-[#fff0d6] text-[#8a6400]"}`}>{isDriver ? "Calculated consequence" : "Review consequence"}</span>
                </div>;
              })}
              {consequenceItems.length === 0 && <p className="py-3 text-[10px] text-[#0b7a63]">No unresolved classifications currently require a consequence statement.</p>}
            </div>
            <p className="mt-2 text-[9px] leading-4 text-[#7d898f]">Financial Driver amounts are project-model sensitivities only. Decision Gates and Context Indicators never promise an IRR improvement.</p>
          </section>
           <div data-testid="community-material-gaps" className="mt-5 border-t border-[#e5eae8] pt-4">
             <div className="flex flex-wrap items-baseline justify-between gap-2">
               <div className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">Community terms requiring resolution</div>
               <span data-testid="community-material-gap-count" className="font-mono text-[10px] font-bold text-[#ba2f45]">{communityUnresolvedCount}</span>
             </div>
             <p className="mt-1 text-[9px] leading-4 text-[#7d898f]">These project-level gaps use the same Resolve path, but they do not create automatic IRR penalties or a fund-level risk rating.</p>
             <div className="mt-2 divide-y divide-[#e5eae8]">
               {COMMUNITY_TERM_DEFINITIONS.filter((definition) => communityReview.terms[definition.id]?.humanStatus === "unresolved" || communityReview.terms[definition.id]?.conclusion === "Unknown").map((definition) => (
                 <div key={definition.id} data-testid={`community-material-gap-row-${definition.id}`} className="flex items-center justify-between gap-4 py-3">
                   <div><div className="text-[11px] font-semibold text-[#344550]">{definition.label}</div><div className="mt-1 text-[10px] text-[#52616b]">{definition.treatment} · project-specific documentation unresolved</div></div>
                   <button type="button" data-testid={`button-resolve-community-${definition.id}`} onClick={() => onResolve(`community-${definition.id}`)} className="shrink-0 rounded bg-[#fde8eb] px-2.5 py-2 text-[9px] font-bold uppercase tracking-[0.11em] text-[#ba2f45] hover:bg-[#ba2f45] hover:text-white">Resolve <ArrowRight aria-hidden="true" className="ml-1 inline h-3 w-3" /></button>
                 </div>
               ))}
             </div>
           </div>
           <div data-testid="material-audit-register" className="mt-5 border-t border-[#e5eae8] pt-4">
             <div className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">Material support register</div>
             <div className="mt-2 divide-y divide-[#e5eae8]">
               {materialItems.map((item) => (
                 <div key={item.id} data-testid={`material-support-row-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                   <span className="text-[10px] font-semibold text-[#344550]">{item.label}</span>
                   <span data-testid={`material-support-confidence-${item.id}`} aria-label={`Source-support confidence for ${item.label}: ${typeof item.sourceSupportConfidence === "number" ? `${item.sourceSupportConfidence}%` : "not measured"}`} className="font-mono text-[9px] font-bold text-[#52616b]">
                     {typeof item.sourceSupportConfidence === "number" ? `${item.sourceSupportConfidence}% support` : "Support not measured"} · {getEffectiveSupportState(item)}
                   </span>
                 </div>
               ))}
             </div>
             <p className="mt-2 text-[9px] leading-4 text-[#7d898f]">Effective support is a decision gate only: scores below 50% remain unresolved and scores from 50–69% remain conditional. It never rewrites the financial assumption or provenance class.</p>
           </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-5 md:p-6">
          <SectionKicker>Decision posture</SectionKicker>
          <div className="mt-2 flex items-start gap-3"><div className={`rounded-md p-2.5 ${metrics.recommendationStatus === "BLOCKED" ? "bg-[#f5ddd5] text-[#ba2f45]" : metrics.recommendationStatus === "CONDITIONAL" ? "bg-[#fff0d6] text-[#a65a00]" : "bg-[#d4e86b] text-[#314207]"}`}>{decisionCopy.icon}</div><div><h2 className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">{decisionCopy.title}</h2><p className="mt-2 text-[11px] leading-5 text-[#65737d]">{decisionCopy.description}</p></div></div>
           <aside data-testid="holdings-connection-indicator" role="note" aria-labelledby="holdings-connection-title" className="mt-5 rounded-lg border bg-white/70 px-3 py-3" style={{ borderColor: statusMeta.border }}>
             <h3 id="holdings-connection-title" className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: statusMeta.color }}>What This Means for Holdings</h3>
              <p data-testid="holdings-connection-message" aria-live="polite" className="mt-2 min-w-0 break-words text-[11px] leading-5 text-[#344550]">{holdingsCopy[metrics.recommendationStatus]}</p>
              {project.kind === "curated" && <div className="flex flex-wrap gap-2"><ClaimCitation claimId="stargate-oracle-gpus" /><ClaimCitation claimId="fund-usxf" /></div>}
           </aside>
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
        <p className="mt-2 max-w-xl text-[11px] leading-5 text-[#65737d]">Save the current Conservative Stress Case, change one or more classifications, then save another named scenario. Both snapshots will remain independent of the live workbench.</p>
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
