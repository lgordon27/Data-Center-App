import { useState } from "react";
import {
  ClassificationBadge,
  ImpactRoleBadge,
  SectionKicker,
  MetricCard,
  LowConfidenceWarning,
  PageIntro,
  BottomNav
} from "@/components/Shell";

import {
  ArrowRight,
  ChevronDown,
  FileSearch,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert
} from "lucide-react";
import { DrawerField, DrawerSection, useWorkbenchDrawer } from "@/components/ContextDrawer";
import {
  useDiligence
} from "@/context/DiligenceContext";
import {
  formatImpactDelta
} from "@/model/cashFlowEngine";
import { getEvidenceImpactRoleDefinition } from "@/data/evidenceImpactRoles";




import {
  formatCurrency,
  formatIRR,
  formatScenarioMetric,
  formatPayback,
  formatLineItemValue,
  chartPoints
} from "@/components/Shell";
import type {
  Screen
} from "@/components/Shell";
import { formatElectricityCostAttribution } from "@/data/sources";

function reviewActionLabel(kind: "manual" | "ai" | undefined, reviewKind?: string) {
  if (reviewKind === "ai-accepted") return "AI-suggested, accepted by analyst";
  if (reviewKind === "ai-overridden") return "AI-suggested, overridden by analyst";
  if (kind) return "Reviewed by analyst";
  return "No human review recorded — baseline treatment applies";
}

type TraceContext = "waterfall" | "row" | "context-item";

function formatRecurringEffect(value: number, line: string) {
  if (value === 0) return "No recurring effect";
  const direction = value > 0 ? "higher" : "lower";
  const lineType = line.includes("OPEX") ? "cost" : line === "Revenue timing" ? "revenue" : "operating contribution";
  return `${formatCurrency(Math.abs(value))} ${direction} ${lineType}`;
}

function EvidenceTraceButton({ inputId, testId, context, tone = "light" }: { inputId: string; testId: string; context: TraceContext; tone?: "light" | "dark" }) {
  const { evidence, metrics } = useDiligence();
  const { openDrawer } = useWorkbenchDrawer();
  const item = evidence[inputId];
  if (!item) return null;
  const step = metrics.waterfall.find((candidate) => candidate.id === inputId);
  const lineItem = metrics.lineItems[inputId];
  const attribution = metrics.attribution[inputId];
  const reviewedAt = item.review ? new Date(item.review.reviewedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  // The trace must explain the exact number on the control that opened it:
  // waterfall steps are sequential attribution; driver rows are single-input sensitivity.
  const basisCopy = context === "waterfall"
    ? "Sequential attribution: inputs are applied in order, so an earlier stressed input can absorb an effect shared with this one. This trace matches the waterfall step you opened it from."
    : context === "row"
      ? "Single-input sensitivity: the effect of repairing this input alone against the current evidence posture. This matches the effect on the row you opened it from; the waterfall's sequential attribution can differ when inputs interact."
      : null;
  const treatmentSource = context === "waterfall" ? step : lineItem;
  return (
    <button
      data-testid={testId}
      type="button"
      aria-label={`Open financial effect trace for ${item.label}`}
      onClick={(event) => openDrawer({
        key: `financial-trace:${inputId}:${context}`,
        kicker: "Financial Effect trace",
        title: `${item.label} — input trace`,
        render: () => (
          <div className="space-y-4">
            <DrawerSection label="Original and approved values">
              <div className="grid gap-2 sm:grid-cols-2">
                <DrawerField label="Original value (underwriting baseline)" value={`${item.value} ${item.unit} · treated as verified`} />
                <DrawerField label="Approved current value" value={<span className="inline-flex flex-wrap items-center gap-1.5">{item.value} {item.unit} <ClassificationBadge value={item.classification} compact /></span>} />
                {attribution && attribution.modeledClassification !== attribution.currentClassification && <DrawerField label="Modeled classification" value={attribution.modeledClassification} />}
              </div>
            </DrawerSection>
            <DrawerSection label="Source">
              <p>{item.citation}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d898f]">Role: {item.sourceRole}</p>
            </DrawerSection>
            <DrawerSection label="Calculation">
              {basisCopy && <p className="font-semibold text-[#243844]">{basisCopy}</p>}
              {lineItem && <p><strong>Driver:</strong> {lineItem.driver}</p>}
               {attribution && <p><strong>Affected cash-flow line:</strong> {attribution.affectedCashFlowLine}</p>}
               {attribution && <div className="grid gap-2 sm:grid-cols-2">
                 <DrawerField label="Baseline treatment" value={attribution.baselineTreatment} />
                 <DrawerField label="Current treatment" value={attribution.currentTreatment} />
               </div>}
              {treatmentSource ? (
                <>
                  <p><strong>Applied treatment:</strong> {treatmentSource.impactTreatment}</p>
                  <p>{treatmentSource.impactExplanation}</p>
                </>
              ) : (
                <p>This input is a {item.impactRole === "Decision Gate" ? "decision gate" : "context indicator"}: it shapes decision posture, not the return calculation.</p>
              )}
            </DrawerSection>
            <DrawerSection label="Approving action">
              <div className="grid gap-2 sm:grid-cols-2">
                <DrawerField label="Human decision" value={reviewActionLabel(item.review ? "manual" : undefined, item.review?.kind)} />
                <DrawerField label="Recorded" value={reviewedAt ?? "—"} />
              </div>
              <p className="text-[#7a5313]">Unapproved AI or agent proposals never touch this input or any displayed return metric.</p>
            </DrawerSection>
            <DrawerSection label="Resulting effect">
              {context === "waterfall" && step ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <DrawerField label="Baseline IRR before input" value={formatIRR(step.before)} />
                  <DrawerField label="IRR after input" value={formatIRR(step.after)} />
                  <DrawerField label="Sequential effect" value={formatImpactDelta(step.deltaIRR)} testId={`trace-seq-effect-${inputId}`} />
                </div>
              ) : context === "row" && lineItem ? (
                 <div className="grid gap-2 sm:grid-cols-2">
                   <DrawerField label="Single-input effect on project IRR" value={formatImpactDelta(lineItem.deltaIRR)} testId={`trace-effect-${inputId}`} />
                   <DrawerField label="Marginal dollar impact" value={attribution ? formatCurrency(attribution.dollarImpact) : "Unavailable"} />
                   <DrawerField label="Recurring annual line effect (excludes exit)" value={attribution ? formatRecurringEffect(attribution.annualEffect, attribution.affectedCashFlowLine) : "Unavailable"} />
                 </div>
              ) : (
                <p>No direct return effect. See the Decision section for how this gate or context item shapes posture.</p>
              )}
            </DrawerSection>
          </div>
        ),
      }, { trigger: event.currentTarget })}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${tone === "dark" ? "border-white/20 bg-white/5 text-[#d4e86b] hover:border-[#d4e86b]" : "border-[#cbd8d4] bg-white text-[#255bb7] hover:border-[#255bb7]"}`}
    >
      <FileSearch aria-hidden="true" className="h-3 w-3" /> View trace
    </button>
  );
}

export function FinancialMateriality({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, hasChangedClassification, metrics, sourceStates, project } = useDiligence();
  const projectName = project.name;
  const customProject = project.kind === "custom";
  const impacts = Object.values(metrics.lineItems).filter((impact) => impact.impactRole === "Financial Driver");
  const decisionAndContextItems = Object.values(evidence).filter((item) => item.impactRole !== "Financial Driver");
  const lowConfidence = metrics.confidenceScore < 25;
  const currentIRR = metrics.projectIRR;
  const baseIRR = metrics.baseIRR ?? null;
  const currentPath = metrics.schedule.map((year) => year.cumulativeEquityCashFlow);
  const basePath = metrics.baseModel?.schedule.map((year) => year.cumulativeEquityCashFlow) ?? currentPath;
  const chartValues = [...currentPath, ...basePath];
  const chartMin = Math.min(...chartValues, 0);
  const chartMax = Math.max(...chartValues, 0);
  const irrDelta = currentIRR === null || baseIRR === null ? null : currentIRR - baseIRR;
  const waterfallSteps = metrics.waterfall;
  const [financialView, setFinancialView] = useState<"impact-chain" | "waterfall" | "full-model">("impact-chain");
  const rankedAttributions = Object.values(metrics.attribution)
    .filter((item) => item.impactRole === "Financial Driver")
    .sort((a, b) => Math.abs(b.singleInputSensitivityIRR ?? 0) - Math.abs(a.singleInputSensitivityIRR ?? 0));
  const formatDollarEffect = (value: number) => value === 0 ? "No direct effect" : formatCurrency(value);
  return (
    <div>
      <PageIntro
        eyebrow="03 / quantify the uncertainty"
        title="Trace each uncertainty into the return."
        description="Every evidence item affects the financial stress case, decision posture, or contextual assessment."
        right={<div className="flex items-center gap-2 rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0b7a63]"><Sparkles className="h-3.5 w-3.5" /> Derived locally</div>}
      />
      {!hasChangedClassification && (
        <aside data-testid="materiality-classification-prompt" role="note" className="mb-5 flex items-start gap-3 rounded-lg border border-[#aac6f4] bg-[#eef5ff] px-4 py-3 text-[11px] leading-5 text-[#344550]">
          <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" />
          <p><strong className="font-semibold text-[#122232]">Change a classification</strong> to see the financial stress case, decision posture, or contextual assessment update.</p>
        </aside>
      )}
      <nav aria-label="Financial materiality sections" className="sticky top-0 z-10 mb-4 flex gap-1 overflow-x-auto rounded-lg border border-[#d9e0e4] bg-[#f9faf8]/95 p-1.5 backdrop-blur-md">
        {[
          ["impact-chain", "Impact Chain"],
          ["waterfall", "Stress Waterfall"],
          ["full-model", "Full Assumptions"],
        ].map(([view, label]) => <button key={view} type="button" aria-pressed={financialView === view} onClick={() => setFinancialView(view as typeof financialView)} className={`min-h-10 shrink-0 rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] ${financialView === view ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b] hover:bg-white hover:text-[#122232]"}`}>{label}</button>)}
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
      {financialView === "impact-chain" && (
        <>
          <section data-testid="panel-impact-chain" aria-labelledby="impact-chain-title" className="rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
            <div className="flex flex-col justify-between gap-3 border-b border-white/15 pb-4 md:flex-row md:items-end">
              <div><SectionKicker tone="lime" className="!text-[#d4e86b]">Impact Chain</SectionKicker><h2 id="impact-chain-title" className="text-[22px] font-semibold tracking-[-0.035em]">Underwriting Baseline → Conservative Stress</h2></div>
              <span data-testid="impact-chain-evidence-gap" className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#f5ddd5]">{irrDelta === null ? "Evidence-quality gap unavailable" : `${Math.abs(irrDelta).toFixed(1)} pts evidence-quality gap`}</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b9d43a]">Baseline IRR</div><div data-testid="impact-chain-baseline-irr" className="mt-1 font-mono text-2xl font-bold text-[#d4e86b]">{formatIRR(baseIRR)}</div></div>
              <div className="rounded-lg border border-[#f5ddd5]/40 bg-[#f5ddd5]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#f5ddd5]">Stress IRR</div><div data-testid="impact-chain-stress-irr" className="mt-1 font-mono text-2xl font-bold text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Method</div><div className="mt-1 text-[11px] font-semibold text-[#e3eaed]">Marginal sensitivity, ranked by absolute IRR effect</div></div>
            </div>
            <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <caption className="sr-only">Financial impact chain ranked by marginal sensitivity</caption>
                <thead className="bg-white/10 text-[9px] font-bold uppercase tracking-[0.12em] text-[#c4d0d6]"><tr><th className="px-3 py-3">Financial driver</th><th className="px-3 py-3">Classification</th><th className="px-3 py-3">Cash-flow line</th><th className="px-3 py-3">Baseline treatment</th><th className="px-3 py-3">Current treatment</th><th className="px-3 py-3">Dollar effect</th><th className="px-3 py-3">Recurring annual</th><th className="px-3 py-3">Single-input IRR</th><th className="px-3 py-3">Trace</th></tr></thead>
                <tbody className="divide-y divide-white/10 text-[10px] text-[#e3eaed]">
                  {rankedAttributions.map((attribution) => {
                    const item = evidence[attribution.id];
                    const effect = attribution.singleInputSensitivityIRR ?? 0;
                    return <tr key={attribution.id} data-testid={`impact-chain-row-${attribution.id}`}>
                      <th className="px-3 py-3 align-top font-semibold text-white">{item.label}<div className="mt-1 font-normal text-[9px] text-[#9dafb8]">{metrics.lineItems[attribution.id]?.driver}</div></th>
                      <td className="px-3 py-3 align-top"><span data-testid={`impact-chain-classification-${attribution.id}`} className="sr-only">{item.classification}</span><ClassificationBadge value={item.classification} compact />{attribution.modeledClassification !== attribution.currentClassification && <div className="mt-1 text-[9px] text-[#f5ddd5]">Modeled as: {attribution.modeledClassification}</div>}</td>
                      <td className="px-3 py-3 align-top">{attribution.affectedCashFlowLine}</td>
                      <td className="max-w-[150px] px-3 py-3 align-top text-[9px] leading-4 text-[#c4d0d6]">{attribution.baselineTreatment}</td>
                      <td className="max-w-[150px] px-3 py-3 align-top text-[9px] leading-4 text-[#c4d0d6]">{attribution.currentTreatment}</td>
                      <td className={`px-3 py-3 align-top font-mono font-bold ${attribution.dollarImpact < 0 ? "text-[#f5ddd5]" : "text-[#b9d43a]"}`}>{formatDollarEffect(attribution.dollarImpact)}</td>
                      <td className="px-3 py-3 align-top font-mono">{formatRecurringEffect(attribution.annualEffect, attribution.affectedCashFlowLine)}</td>
                      <td data-testid={`impact-chain-sensitivity-${attribution.id}`} className={`px-3 py-3 align-top font-mono font-bold ${effect < 0 ? "text-[#f5ddd5]" : "text-[#b9d43a]"}`}>{formatImpactDelta(effect)}</td>
                      <td className="px-3 py-3 align-top"><EvidenceTraceButton inputId={attribution.id} testId={`button-trace-impact-chain-${attribution.id}`} context="row" tone="dark" /></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-[#9dafb8]">Dollar effects compare the live input with a one-input verified repair across the real equity cash-flow schedule. They are marginal sensitivities and do not add to the sequential Stress Waterfall.</p>
          </section>
          <section data-testid="panel-cash-flow-comparison" className="mt-5 rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
            <div className="flex flex-col justify-between gap-2 border-b border-[#e5eae8] pb-4 md:flex-row md:items-end"><div><SectionKicker>Cash-flow comparison</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Baseline and stress cash flows</h2></div><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#52616b]">Equity cash flow · $M</span></div>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><caption className="sr-only">Underwriting baseline and conservative stress equity cash flows</caption><thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b]"><tr><th className="px-3 py-3">Period</th><th className="px-3 py-3">Baseline equity CF</th><th className="px-3 py-3">Stress equity CF</th><th className="px-3 py-3">Marginal delta</th><th className="px-3 py-3">Treatment</th></tr></thead><tbody className="divide-y divide-[#e5eae8] font-mono text-[10px] text-[#344550]">{metrics.schedule.map((year, index) => { const baselineYear = metrics.baseModel?.schedule[index]; const delta = year.netEquityCashFlow - (baselineYear?.netEquityCashFlow ?? year.netEquityCashFlow); return <tr key={year.year} data-testid={`cash-flow-comparison-y${year.year}`} className={year.year === 0 ? "bg-[#fff8e9]" : year.year === 5 ? "bg-[#f8fbe8]" : undefined}><th className="px-3 py-3 font-bold text-[#122232]">{year.year === 0 ? "Close / Year 0" : `Year ${year.year}`}</th><td className="px-3 py-3">{formatCurrency(baselineYear?.netEquityCashFlow ?? 0)}</td><td className="px-3 py-3">{formatCurrency(year.netEquityCashFlow)}</td><td className={`px-3 py-3 font-bold ${delta < 0 ? "text-[#ba2f45]" : "text-[#0b7a63]"}`}>{formatCurrency(delta)}</td><td className="px-3 py-3 font-sans text-[9px]">{year.year === 0 ? "Initial equity funding; no annual CAPEX is fabricated." : year.year === 5 ? "Operations plus exit proceeds and debt repayment." : "Operating NOI less debt service."}</td></tr>; })}</tbody></table></div>
            <p className="mt-3 text-[10px] leading-4 text-[#7d898f]">Close / Year 0 is the modeled initial equity investment. Annual CAPEX is not invented; CAPEX enters the close treatment and any modeled contingency only.</p>
          </section>
        </>
      )}
      <div id="materiality-summary" className="scroll-mt-24 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard testId="metric-project-irr" label="Project IRR" value={formatIRR(currentIRR)} detail={`${irrDelta === null ? "N/M" : `${irrDelta >= 0 ? "+" : ""}${irrDelta.toFixed(1)} pts`} vs Underwriting Baseline`} accent="lime" />
         <MetricCard testId="metric-moic" label="MOIC" value={formatScenarioMetric(metrics.moic, "moic")} detail="5-year hold period" accent="navy" />
         <MetricCard testId="metric-coc" label="Cash-on-cash" value={formatScenarioMetric(metrics.cashOnCash, "cashOnCash")} detail="Stabilized year 3" accent="violet" />
        <MetricCard testId="metric-payback" label="Payback" value={formatPayback(metrics.payback)} detail="Cumulative equity breakeven" accent="coral" />
         <MetricCard testId="metric-npv" label="NPV @ 10%" value={formatCurrency(metrics.npv, 0)} detail="Equity value created" accent="navy" />
      </div>
      <p className="mt-2 text-[9px] leading-4 text-[#7d898f]">Only human-approved classifications feed these returns. AI assessments and agent findings never change a displayed metric until a person acts, and every evidence-adjusted input carries a <strong>View trace</strong> control.</p>
       <aside data-testid="portfolio-connection-strip" role="note" aria-labelledby="portfolio-connection-title" className="mt-4 rounded-lg border border-[#cbd8d4] bg-[#f1f5f3] px-4 py-3">
         <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
           <h2 id="portfolio-connection-title" className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Portfolio Connection</h2>
            <p data-testid="portfolio-connection-message" className="min-w-0 flex-1 text-[11px] leading-5 text-[#344550]">NVIDIA GPU contracts and hyperscaler CAPEX connect values-aligned funds to the infrastructure buildout. Evidence gaps at the project level can become exposure gaps in portfolio returns. This is market context, not facility-level {customProject ? `${projectName} evidence` : "Stargate evidence"} or a new modeled input.</p>
         </div>
       </aside>
        {financialView === "waterfall" && <section id="materiality-drivers" data-testid="panel-irr-waterfall" aria-labelledby="irr-waterfall-title" aria-describedby="irr-waterfall-description irr-waterfall-methodology" className="mt-5 scroll-mt-24 rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-white/15 pb-4 md:flex-row md:items-end">
          <div><SectionKicker tone="lime" className="!text-[#d4e86b]">Stress Waterfall</SectionKicker><h2 id="irr-waterfall-title" className="text-[22px] font-semibold tracking-[-0.035em]">Sequential stress attribution</h2></div>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Sequential · interacting effects are not additive</span>
        </div>
          <p id="irr-waterfall-description" data-testid="waterfall-description" className="mt-3 max-w-3xl text-[11px] leading-5 text-[#c4d0d6]">Lower evidence quality applies progressively conservative underwriting assumptions. This is a stress test, not a prediction. Unverified inputs are assigned worst-case values, not because negative outcomes are certain, but because conservative underwriting requires assuming the downside until evidence proves otherwise.</p>
          <p id="irr-waterfall-methodology" data-testid="waterfall-methodology" role="note" className="mt-3 max-w-3xl rounded-lg border border-[#8dc8e8]/35 bg-[#0d2b3d] px-3 py-2 text-[11px] leading-5 text-[#d7e8ee]">Evidence classifications do not predict whether an unknown outcome will be favorable or unfavorable. For this demonstration, weaker evidence triggers predefined conservative underwriting treatments to show the potential cost of unresolved uncertainty.</p>
         <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b9d43a]">Underwriting Baseline (All Inputs Verified)</div><div data-testid="waterfall-base-irr" className="mt-1 font-mono text-2xl font-bold text-[#d4e86b]">{formatIRR(baseIRR)}</div></div>
          {waterfallSteps.map((step) => {
             const tone = step.deltaIRR < 0 ? "text-[#f5ddd5]" : "text-[#b9d43a]";
             const item = evidence[step.id];
             return <div key={step.id} data-testid={`waterfall-step-${step.id}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[#e3eaed]">{item.label}</div><ImpactRoleBadge role="Financial Driver" compact testId={`waterfall-role-${step.id}`} /></div>
               <div className="mt-1 flex items-baseline justify-between gap-2">
                 <span className={`font-mono text-sm font-bold ${tone}`}>{formatIRR(step.after)}</span>
                 <span data-testid={`waterfall-impact-${step.id}`} className={`font-mono text-[9px] font-bold ${tone}`}>{formatImpactDelta(step.deltaIRR)}</span>
               </div>
                 <div data-testid={`waterfall-explanation-${step.id}`} className="mt-2 text-[9px] font-semibold text-[#d4e86b]">{step.impactExplanation}</div>
                <div className="mt-1 text-[9px] text-[#9dafb8]">Current classification: {item.classification}</div>
               {item.modelClassification && <div className="mt-1 text-[9px] text-[#9dafb8]">Modeled as: {item.modelClassification}</div>}
                <div data-testid={`waterfall-treatment-${step.id}`} aria-label={`Applied stress treatment for ${item.label}: ${step.impactTreatment}`} className="mt-2 border-t border-white/10 pt-2 text-[9px] leading-4 text-[#e3eaed]"><span className="font-semibold text-[#b9d43a]">Applied treatment:</span> {step.impactTreatment}</div>
                <div className="mt-2"><EvidenceTraceButton inputId={step.id} testId={`button-trace-${step.id}`} context="waterfall" tone="dark" /></div>
             </div>;
          })}
            <div className="rounded-lg border-2 border-[#f5ddd5]/60 bg-[#f5ddd5]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#f5ddd5]">Conservative Case (Stress-Adjusted)</div><div data-testid="waterfall-current-irr" className="mt-1 font-mono text-2xl font-bold text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
        </div>
          <aside data-testid="waterfall-underwriting-note" role="note" className="mt-5 rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 px-3 py-2 text-[11px] leading-5 text-[#e8f0d1]">A management assertion that proves accurate would improve the return. The conservative stress case shows the cost of not knowing, not the cost of a negative outcome.</aside>
          <div className="sr-only" aria-live="polite">Underwriting Baseline (All Inputs Verified) {formatIRR(baseIRR)}. Conservative Case (Stress-Adjusted) {formatIRR(currentIRR)}. Change {irrDelta === null ? "unavailable" : `${irrDelta.toFixed(1)} percentage points`}.</div>
      </section>}
       <section data-testid="panel-decision-context-treatment" aria-labelledby="decision-context-treatment-title" className="mt-5 rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
         <SectionKicker>Decision & context treatment</SectionKicker>
         <h2 id="decision-context-treatment-title" className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Decision gates and context indicators</h2>
         <p data-testid="decision-context-treatment-copy" className="mt-2 max-w-3xl text-[11px] leading-5 text-[#52616b]">These items affect the decision posture or provide diligence context but do not directly change the financial stress case.</p>
         <div className="mt-4 grid gap-3 md:grid-cols-2">
           {decisionAndContextItems.map((item) => {
             const definition = getEvidenceImpactRoleDefinition(item.id);
             return <article key={item.id} data-testid={`decision-context-item-${item.id}`} className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-4">
               <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-[12px] font-semibold text-[#243844]">{item.label}</h3><ImpactRoleBadge role={item.impactRole} compact testId={`decision-context-role-${item.id}`} /></div>
               <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{definition.description}</p>
               <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] text-[#60707d]"><span className="font-bold uppercase tracking-[0.1em]">Current provenance</span><ClassificationBadge value={item.classification} compact /></div>
               <div className="mt-3"><EvidenceTraceButton inputId={item.id} testId={`button-trace-context-${item.id}`} context="context-item" /></div>
             </article>;
           })}
         </div>
       </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4"><div><SectionKicker>Evidence → financial materiality</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Where the model feels the uncertainty</h2></div><span className="font-mono text-[10px] text-[#52616b]">Δ IRR / variable</span></div>
          <div className="mt-2 divide-y divide-[#e5eae8]">
             {impacts.map((impact) => {
              const item = evidence[impact.id];
              const effectTone = impact.deltaIRR < 0 ? "text-[#ba2f45]" : impact.deltaIRR > 0 ? "text-[#0b7a63]" : "text-[#63717a]";
              return <div key={impact.id} data-testid={`row-materiality-${impact.id}`} className="grid grid-cols-[1fr_auto] gap-4 py-4 sm:grid-cols-[1.2fr_0.9fr_0.75fr_0.5fr] sm:items-center">
                <div><div className="text-[12px] font-semibold text-[#243844]">{item.label}</div><div className="mt-1 text-[10px] text-[#52616b]">{impact.driver}</div><div className="mt-2"><EvidenceTraceButton inputId={impact.id} testId={`button-trace-materiality-${impact.id}`} context="row" /></div></div>
                <div className="sm:col-auto"><ClassificationBadge value={item.classification} compact /></div>
                <div className="text-right font-mono text-[11px] font-bold text-[#4d5c65] sm:text-left">{formatLineItemValue(impact.value, impact.unit)}</div>
                 <div className={`text-right font-mono text-[11px] font-bold sm:text-left ${effectTone}`}>
                   <div data-testid={`materiality-impact-${impact.id}`}>{formatImpactDelta(impact.deltaIRR)}</div>
                   <div data-testid={`materiality-explanation-${impact.id}`} className="mt-1 font-sans text-[9px] font-semibold leading-4 text-[#52616b]">{impact.impactExplanation}</div>
                 </div>
              </div>;
            })}
          </div>
        </section>
        <section data-testid="panel-baseline-current" className="rounded-xl border-2 border-[#d4e86b]/35 bg-[#122232] p-5 text-white md:p-6">
          <div className="flex items-start justify-between"><div><SectionKicker tone="lime" className="!text-[#d4e86b]">Return path</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em]">Underwriting Baseline → Conservative stress</h2></div>{irrDelta !== null && irrDelta < 0 ? <TrendingDown className="h-5 w-5 text-[#f5ddd5]" /> : <TrendingUp className="h-5 w-5 text-[#d4e86b]" />}</div>
          {lowConfidence && <div className="mt-4"><LowConfidenceWarning testId="warning-low-confidence-materiality-return" /></div>}
          <div className="mt-8 flex items-end gap-5">
             <div><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#9dafb8]">Underwriting Baseline IRR</div><div className="mt-2 font-mono text-[46px] font-bold leading-none tracking-[-0.07em] text-[#b9d43a]">{formatIRR(baseIRR)}</div></div>
            <ArrowRight className="mb-2 h-5 w-5 text-[#7c909d]" />
             <div><div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#9dafb8]">Conservative Stress Case IRR</div><div data-testid="text-current-irr-materiality" className="mt-2 font-mono text-[46px] font-bold leading-none tracking-[-0.07em] text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
          </div>
          <div className="mt-4 rounded-lg border border-[#f5ddd5]/30 bg-[#f5ddd5]/10 px-3 py-2 font-mono text-[12px] font-bold text-[#f5ddd5]">{irrDelta === null ? "Underwriting Baseline delta unavailable" : `${irrDelta >= 0 ? "+" : ""}${irrDelta.toFixed(1)} percentage points from Underwriting Baseline`}</div>
          {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && (
            <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-[#f5ddd5]">
              <span className="line-through opacity-60">{metrics.lastChange.from}% prior</span>
              <span className="rounded bg-[#f5ddd5] px-2 py-1 font-bold text-[#ba2f45]">{metrics.lastChange.delta > 0 ? "+" : ""}{metrics.lastChange.delta.toFixed(1)} pts since reclassification</span>
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
          <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-[#c4d0d6]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#b9d43a]" />Underwriting Baseline</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f5ddd5]" />Conservative stress</span></div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-[#8299a6]"><span>Y0 / close</span><span>Y5 / exit</span><span>cumulative equity cash flow · $M</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Revenue delay</div><div className="mt-1 font-mono text-sm text-[#f5ddd5]">+{metrics.revenueDelayMonths} mo</div></div>
            <div className="rounded border border-white/10 bg-white/5 p-3"><div className="text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">CAPEX contingency</div><div className="mt-1 font-mono text-sm text-[#f5ddd5]">{formatCurrency(metrics.incrementalCapex)}</div></div>
          </div>
        </section>
      </div>
       <details id="materiality-full-model" data-testid="disclosure-full-model-detail" open={financialView === "full-model"} className="mt-5 scroll-mt-24 rounded-xl border border-[#d9e0e4] bg-[#eef2f1]">
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
         <p data-testid="model-electricity-attribution" className="mt-4 rounded-lg border border-[#cbd8d4] bg-[#f1f5f3] px-3 py-2 font-mono text-[11px] font-bold text-[#344550]">{formatElectricityCostAttribution(metrics.assumptions.electricityRate, evidence.electricity_cost.sourceId === "eia" ? sourceStates.eia : { ...sourceStates.eia, status: "embedded", dataOrigin: "embedded", timestamp: undefined })}</p>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          {[
            ["01", "Evidence", "Classifications set confidence and stress inputs."],
            ["02", "Timing", `${metrics.revenueDelayMonths} months of modeled revenue delay.`],
            ["03", "Revenue / OPEX", "Power, water, climate, and operating costs flow through."],
            ["04", "Equity Cash Flow", "Debt, distributions, and terminal value create the equity path."],
            ["05", "Return", `${formatIRR(currentIRR)} current project IRR.`],
          ].map(([number, title, detail], index) => <div key={title} className="relative rounded-lg border border-[#d9e0e4] bg-[#f1f5f3] p-3 md:min-h-[116px]"><div className="font-mono text-[9px] font-bold text-[#255bb7]">{number}</div><div className="mt-2 text-[12px] font-semibold text-[#122232]">{title}</div><div className="mt-1 text-[10px] leading-4 text-[#52616b]">{detail}</div>{index < 4 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-white text-[#b9d43a] md:block" />}</div>)}
        </div>
        <p className="mt-4 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#6f460e]"><strong>SYNTHETIC transaction assumptions:</strong> entry value, lease rate, CAPEX, debt, and terminal multiple are representative underwriting inputs—not reported {projectName} terms.</p>
      </section>
      <BottomNav screen="materiality" onNavigate={onNavigate} />
    </div>
  );
}
