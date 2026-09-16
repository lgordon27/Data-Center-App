import { useRef, useState } from "react";
import { ArrowRight, ChevronDown, FileSearch, Sparkles, TriangleAlert } from "lucide-react";
import {
  BottomNav,
  ClassificationBadge,
  ImpactRoleBadge,
  LowConfidenceWarning,
  MetricCard,
  SectionKicker,
  formatCurrency,
  formatIRR,
  formatLineItemValue,
  formatPayback,
  formatPercentagePoints,
  formatScenarioMetric,
  type Screen,
} from "@/components/Shell";
import { DrawerField, DrawerSection, useWorkbenchDrawer } from "@/components/ContextDrawer";
import { useDiligence } from "@/context/DiligenceContext";
import { formatImpactDelta } from "@/model/cashFlowEngine";
import { getEvidenceImpactRoleDefinition } from "@/data/evidenceImpactRoles";
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

function formatDriverValue(value: number, unit: string) {
  if (unit === "$/MWh" || unit === "USD/MWh") return `$${value.toFixed(1)}/MWh`;
  return formatLineItemValue(value, unit);
}

function formatCoverage(year: { activeMonths: number; debtService: number; dscr: number | null }) {
  if (year.activeMonths === 0 && year.debtService > 0) return "Pre-op";
  return year.dscr === null || !Number.isFinite(year.dscr) ? "—" : `${year.dscr.toFixed(2)}x`;
}

function ProviderOverlayComparison({
  financialInputState,
  projectKind,
  currentIRR,
}: {
  financialInputState: ReturnType<typeof useDiligence>["financialInputState"];
  projectKind: "curated" | "custom";
  currentIRR: number | null;
}) {
  const isCustom = projectKind === "custom";
  const hasProviderOverlay = !isCustom && financialInputState.providerDataOrigin === "provider";
  const originLabel = financialInputState.basis === "live"
    ? "U.S. EIA Open Data · live provider response"
    : financialInputState.basis === "cached"
      ? "U.S. EIA Open Data · cached provider response"
      : isCustom
        ? "Not applicable to custom project"
        : "Embedded case baseline · no provider response";
  return (
    <section data-testid="provider-overlay-comparison" className="mb-4 rounded-xl border border-[#aac6f4] bg-[#eef5ff] p-4 md:p-5">
      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
        <div>
          <SectionKicker>Provider overlay audit</SectionKicker>
          <h3 className="mt-1 text-[17px] font-semibold text-[#122232]">
            {isCustom ? "Market context is not applied to this custom project" : "Synthetic baseline → electricity market overlay"}
          </h3>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[#aac6f4] bg-white px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#255bb7]">
          {hasProviderOverlay ? `${financialInputState.basis} overlay` : isCustom ? "custom project" : "no provider overlay"}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#344550]">
        {isCustom
          ? "The EIA electricity series remains separate market context; it does not replace custom-project research or change this synthetic scenario."
          : "The EIA rate is a statewide market-context input used to sensitivity-test the synthetic case. It is not a disclosed Stargate tariff, issuer return or portfolio return."}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div data-testid="provider-overlay-rate" className="rounded-lg border border-[#d9e5f5] bg-white p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60707d]">{hasProviderOverlay ? "Provider rate" : "Synthetic rate"}</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#122232]">
            {isCustom ? "Not applicable" : `$${(hasProviderOverlay ? financialInputState.electricityRate ?? financialInputState.syntheticElectricityRate ?? 0 : financialInputState.syntheticElectricityRate ?? financialInputState.electricityRate ?? 0).toFixed(1)}/MWh`}
          </div>
        </div>
        <div data-testid="provider-overlay-origin" className="rounded-lg border border-[#d9e5f5] bg-white p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60707d]">Origin</div>
          <div className="mt-1 text-[11px] font-semibold leading-4 text-[#122232]">{originLabel}</div>
        </div>
        <div data-testid="provider-overlay-period" className="rounded-lg border border-[#d9e5f5] bg-white p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60707d]">Provider period</div>
          <div className="mt-1 font-mono text-[12px] font-bold text-[#122232]">{isCustom || !hasProviderOverlay ? "Not reported" : financialInputState.electricityPeriod ?? "Not reported"}</div>
        </div>
        <div data-testid="provider-overlay-baseline-irr" className="rounded-lg border border-[#d9e5f5] bg-white p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60707d]">Synthetic baseline IRR</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#122232]">{formatIRR(financialInputState.syntheticBaselineIRR)}</div>
        </div>
        <div data-testid="provider-overlay-delta" className="rounded-lg border border-[#d9e5f5] bg-white p-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60707d]">Return delta from overlay</div>
          <div className="mt-1 font-mono text-lg font-bold text-[#255bb7]">
            {hasProviderOverlay ? formatPercentagePoints(financialInputState.providerOverlayDeltaIRR, { signed: true }) : "Not calculated"}
          </div>
          {hasProviderOverlay && <div className="mt-1 text-[9px] text-[#60707d]">Overlay result: {formatIRR(financialInputState.providerOverlayIRR ?? currentIRR)}</div>}
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-[#52616b]">
        {financialInputState.sourceUpdatedAt && hasProviderOverlay
          ? `Provider dataset freshness: ${new Date(financialInputState.sourceUpdatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}.`
          : isCustom
            ? "Custom-project calculations retain their own research and assumptions; no EIA overlay is applied."
            : "The embedded $42/MWh case baseline remains distinct from any future provider response."}
      </p>
    </section>
  );
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
  const basisCopy = context === "waterfall"
    ? "Sequential attribution: inputs are applied in order, so interacting effects are not additive."
    : context === "row"
      ? "Single-input sensitivity: the effect of repairing this input alone against the current evidence posture."
      : null;
  const treatmentSource = context === "waterfall" ? step : lineItem;
  return (
    <button
      data-testid={testId}
      type="button"
      aria-label={`Open financial effect trace for ${item.label}`}
      onClick={(event) => openDrawer({
        key: `financial-trace:${inputId}:${context}`,
        kicker: "Financial effect trace",
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
              {attribution && <div className="grid gap-2 sm:grid-cols-2"><DrawerField label="Baseline treatment" value={attribution.baselineTreatment} /><DrawerField label="Current treatment" value={attribution.currentTreatment} /></div>}
              {treatmentSource ? <><p><strong>Applied treatment:</strong> {treatmentSource.impactTreatment}</p><p>{treatmentSource.impactExplanation}</p></> : <p>This input shapes decision posture or context rather than the return calculation.</p>}
            </DrawerSection>
            <DrawerSection label="Review record">
              <div className="grid gap-2 sm:grid-cols-2"><DrawerField label="Human decision" value={reviewActionLabel(item.review ? "manual" : undefined, item.review?.kind)} /><DrawerField label="Recorded" value={reviewedAt ?? "—"} /></div>
              <p className="text-[#7a5313]">Unaccepted research proposals never change this input or a displayed return metric.</p>
            </DrawerSection>
            <DrawerSection label="Resulting effect">
              {context === "waterfall" && step ? (
                <div className="grid gap-2 sm:grid-cols-3"><DrawerField label="Baseline IRR before input" value={formatIRR(step.before)} /><DrawerField label="IRR after input" value={formatIRR(step.after)} /><DrawerField label="Sequential effect" value={formatImpactDelta(step.deltaIRR)} testId={`trace-seq-effect-${inputId}`} /></div>
              ) : context === "row" && lineItem ? (
                <div className="grid gap-2 sm:grid-cols-2"><DrawerField label="Single-input effect on project IRR" value={formatImpactDelta(lineItem.deltaIRR)} testId={`trace-effect-${inputId}`} /><DrawerField label="Marginal dollar impact" value={attribution ? formatCurrency(attribution.dollarImpact) : "Unavailable"} /><DrawerField label="Recurring annual line effect (excludes exit)" value={attribution ? formatRecurringEffect(attribution.annualEffect, attribution.affectedCashFlowLine) : "Unavailable"} /></div>
              ) : <p>No direct return effect. This item remains available as decision or diligence context.</p>}
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

type FinancialView = "overview" | "key-drivers" | "cash-flows" | "assumptions";
const FINANCIAL_VIEWS: Array<{ id: FinancialView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "key-drivers", label: "Key Drivers" },
  { id: "cash-flows", label: "Cash Flows" },
  { id: "assumptions", label: "Assumptions" },
];

function NextViewButton({ label, target, onClick }: { label: string; target: FinancialView; onClick: () => void }) {
  return <button data-testid={`financial-next-${target}`} type="button" onClick={onClick} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#122232] px-4 text-xs font-semibold text-[#d4e86b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d43a]">Next: {label}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>;
}

export function FinancialMateriality({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, hasChangedClassification, metrics, sourceStates, project, originatingCompany, financialInputState } = useDiligence();
  const [financialView, setFinancialView] = useState<FinancialView>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentIRR = metrics.projectIRR;
  const baseIRR = metrics.baseIRR ?? null;
  const irrDelta = currentIRR === null || baseIRR === null ? null : currentIRR - baseIRR;
  const lowConfidence = metrics.confidenceScore < 25;
  const rankedAttributions = Object.values(metrics.attribution)
    .filter((item) => item.impactRole === "Financial Driver")
    .sort((a, b) => Math.abs(b.singleInputSensitivityIRR ?? 0) - Math.abs(a.singleInputSensitivityIRR ?? 0));
  const prominentAttributions = rankedAttributions.slice(0, 5);
  const additionalAttributions = rankedAttributions.slice(5);
  const decisionAndContextItems = Object.values(evidence).filter((item) => item.impactRole !== "Financial Driver");
  const baselineAssumptions = metrics.baseModel?.assumptions;
  const assumptionComparison = baselineAssumptions ? [
    ["Electricity rate", `$${baselineAssumptions.electricityRate.toFixed(1)}/MWh`, `$${metrics.assumptions.electricityRate.toFixed(1)}/MWh`],
    ["Water use", `${baselineAssumptions.annualCoolingWaterMgal.toFixed(1)} M gal / yr`, `${metrics.assumptions.annualCoolingWaterMgal.toFixed(1)} M gal / yr`],
    ["Permitting delay", `${baselineAssumptions.permittingMonths} months`, `${metrics.assumptions.permittingMonths} months`],
    ["CAPEX contingency", formatCurrency(baselineAssumptions.capexContingency), formatCurrency(metrics.assumptions.capexContingency)],
    ["Adjusted hazard probability", `${(baselineAssumptions.adjustedHazardProbability * 100).toFixed(1)}%`, `${(metrics.assumptions.adjustedHazardProbability * 100).toFixed(1)}%`],
  ] : [];
  const moveTab = (current: FinancialView, direction: "next" | "previous" | "first" | "last") => {
    const index = FINANCIAL_VIEWS.findIndex((item) => item.id === current);
    const nextIndex = direction === "first" ? 0 : direction === "last" ? 3 : (index + (direction === "next" ? 1 : -1) + 4) % 4;
    setFinancialView(FINANCIAL_VIEWS[nextIndex].id);
    window.setTimeout(() => tabRefs.current[nextIndex]?.focus(), 0);
  };
  const selectFinancialView = (next: FinancialView, moveFocus = false) => {
    setFinancialView(next);
    if (moveFocus) {
      const nextIndex = FINANCIAL_VIEWS.findIndex((item) => item.id === next);
      window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus({ preventScroll: true }));
    }
  };
  const recommendationCopy = metrics.recommendationStatus === "READY FOR REVIEW"
    ? "Evidence supports moving to advisor review, subject to issuer exposure and portfolio context."
    : metrics.recommendationStatus === "CONDITIONAL"
      ? "Proceed only with explicit conditions around the unresolved evidence and modeled treatments."
      : "Resolve material evidence gaps before using the output as an investment conclusion.";

  if (financialInputState.phase === "updating") {
    return (
      <section data-testid="financial-inputs-updating" role="status" className="rounded-xl border-2 border-[#aac6f4] bg-[#eef5ff] p-5 md:p-6">
        <SectionKicker>Illustrative project economics</SectionKicker>
        <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.035em] text-[#122232]">Updating live inputs</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#52616b]">The baseline and conservative stress results are temporarily withheld while the electricity provider response settles. No interim fallback return is presented as final.</p>
      </section>
    );
  }

  const calculationBasis = financialInputState.basis === "fallback"
    ? "Fallback-based calculation"
    : financialInputState.basis === "cached"
      ? "Cached provider-based calculation"
      : financialInputState.basis === "live"
        ? "Live provider-based calculation"
        : "Custom project calculation";
  const calculationTimestamp = financialInputState.calculatedAt
    ? new Date(financialInputState.calculatedAt).toLocaleString()
    : "not reported";
  const providerAvailability = sourceStates.eia.status === "live"
    ? "live EIA response available"
    : sourceStates.eia.status === "cached"
      ? "cached EIA response available"
      : "bundled EIA estimate available";
  const providerApplicability = project.kind === "custom"
    ? "not applied to this custom project"
    : "applied to the curated electricity input";

  return (
    <div data-testid="financial-transmission-model" className="min-w-0">
       <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
         <div><SectionKicker>Illustrative project economics</SectionKicker><h2 className="text-[24px] font-semibold tracking-[-0.035em] text-[#122232]">Start with the project scenario.</h2><p className="mt-2 max-w-3xl text-[11px] leading-5 text-[#52616b]">These returns are synthetic project-scenario outputs—not issuer impacts, portfolio returns or reported transaction economics.</p></div>
        <div className="flex items-center gap-2 rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0b7a63]"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Derived locally</div>
      </div>
       <div data-testid="financial-input-state" role="status" className="mb-4 rounded-lg border border-[#cbd8d4] bg-[#f9faf8] px-4 py-3 text-[11px] leading-5 text-[#52616b]">
         <strong className="font-semibold text-[#122232]">{calculationBasis}.</strong>{" "}
         Electricity input: {financialInputState.electricityRate === null ? "not applicable" : `$${financialInputState.electricityRate.toFixed(1)}/MWh`}
         {financialInputState.electricityPeriod ? ` · period ${financialInputState.electricityPeriod}` : ""}
         {` · provider availability: ${providerAvailability} · project applicability: ${providerApplicability} · calculated ${calculationTimestamp}.`}
       </div>
      <ProviderOverlayComparison financialInputState={financialInputState} projectKind={project.kind} currentIRR={currentIRR} />
      {!hasChangedClassification && <aside data-testid="materiality-classification-prompt" role="note" className="mb-4 flex items-start gap-3 rounded-lg border border-[#aac6f4] bg-[#eef5ff] px-4 py-3 text-[11px] leading-5 text-[#344550]"><Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" /><p><strong className="font-semibold text-[#122232]">Change a classification</strong> to see the return, driver ranking, confidence and recommendation update.</p></aside>}
       <div data-testid="financial-gap-counts" className="mb-4 grid gap-2 sm:grid-cols-2">
         <div className="rounded-lg border border-[#e3d4b6] bg-[#fffbf2] px-3 py-2 text-[11px] text-[#805000]"><strong className="font-semibold">Unresolved decision gates:</strong> {metrics.unresolvedDecisionGateCount}</div>
         <div className="rounded-lg border border-[#f5ddd5] bg-[#fff3f4] px-3 py-2 text-[11px] text-[#7f2635]"><strong className="font-semibold">Unresolved financial drivers:</strong> {metrics.unresolvedFinancialDriverCount}</div>
       </div>
       <div role="tablist" aria-label="Financial transmission views" className="sticky top-0 z-10 mb-4 flex gap-1 overflow-x-auto rounded-lg border border-[#d9e0e4] bg-[#f9faf8]/95 p-1.5 backdrop-blur-md">
        {FINANCIAL_VIEWS.map((item, index) => <button key={item.id} ref={(element) => { tabRefs.current[index] = element; }} id={`financial-tab-${item.id}`} data-testid={`financial-tab-${item.id}`} type="button" role="tab" aria-selected={financialView === item.id} aria-controls={`financial-panel-${item.id}`} tabIndex={financialView === item.id ? 0 : -1} onClick={() => setFinancialView(item.id)} onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); moveTab(item.id, "next"); } else if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(item.id, "previous"); } else if (event.key === "Home") { event.preventDefault(); moveTab(item.id, "first"); } else if (event.key === "End") { event.preventDefault(); moveTab(item.id, "last"); } }} className={`min-h-10 shrink-0 rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d43a] ${financialView === item.id ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b] hover:bg-white hover:text-[#122232]"}`}>{item.label}</button>)}
      </div>
      {lowConfidence && <div className="mb-4"><LowConfidenceWarning testId="warning-low-confidence-materiality" /></div>}
      {metrics.mechanicalDisclaimer && <div data-testid="banner-mechanical-disclaimer" className="mb-4 flex items-start gap-3 rounded-xl border-2 border-[#ba2f45] bg-[#fff3f4] px-5 py-4 text-[#7f2635]"><TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-mono text-[12px] font-bold tracking-[0.08em]">MECHANICAL OUTPUTS ONLY · 0% EVIDENCE CONFIDENCE</div><div className="mt-1 text-[11px] leading-5 text-[#96525d]">Returns are scenario mechanics, not investment-grade underwriting or a recommendation.</div></div></div>}

      {financialView === "overview" && <section id="financial-panel-overview" data-testid="panel-impact-chain" role="tabpanel" aria-labelledby="financial-tab-overview" tabIndex={0} className="rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-white/15 pb-4 md:flex-row md:items-end"><div><SectionKicker tone="lime" className="!text-[#d4e86b]">Overview</SectionKicker><h3 className="text-[22px] font-semibold tracking-[-0.035em]">Underwriting baseline → conservative stress</h3></div><span data-testid="impact-chain-evidence-gap" className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#f5ddd5]">{irrDelta === null ? "Difference unavailable" : `${formatPercentagePoints(Math.abs(irrDelta))} difference`}</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 p-4"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b9d43a]">Baseline return</div><div data-testid="impact-chain-baseline-irr" className="mt-1 font-mono text-3xl font-bold text-[#d4e86b]">{formatIRR(baseIRR)}</div></div>
          <div className="rounded-lg border border-[#f5ddd5]/40 bg-[#f5ddd5]/10 p-4"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#f5ddd5]">Conservative stress</div><div data-testid="impact-chain-stress-irr" className="mt-1 font-mono text-3xl font-bold text-[#f5ddd5]">{formatIRR(currentIRR)}</div><div data-testid="text-current-irr-materiality" className="sr-only">{formatIRR(currentIRR)}</div></div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Difference</div><div className="mt-1 font-mono text-2xl font-bold">{formatPercentagePoints(irrDelta, { signed: true })}</div></div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-4"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Recommendation context</div><div className="mt-1 text-sm font-semibold text-[#d4e86b]">{metrics.recommendationStatus}</div><p className="mt-2 text-[10px] leading-4 text-[#c4d0d6]">{recommendationCopy}</p></div>
        </div>
        {metrics.lastChange && metrics.lastChange.from !== metrics.lastChange.to && <div className="mt-3 rounded-lg border border-[#f5ddd5]/30 bg-[#f5ddd5]/10 px-3 py-2 font-mono text-[10px] text-[#f5ddd5]">{formatPercentagePoints(metrics.lastChange.delta, { signed: true })} since reclassification</div>}
        <div data-testid="transmission-pathway" className="mt-5 grid gap-2 md:grid-cols-4">
          {[
            ["01", "Real factor", "Power, water, grid, construction or community conditions."],
            ["02", "Project consequence", "Timing, capital cost and operating effects enter the project model."],
            ["03", "Issuer evidence boundary", originatingCompany ? `No ${originatingCompany} effect is calculated here; documented contracts and financial dependence would be required.` : "No issuer effect is calculated or attributed without a documented relationship."],
            ["04", "Portfolio evidence boundary", "No portfolio impact is calculated; test actual holding weight, issuer dependence and the client decision separately."],
          ].map(([number, title, detail], index) => <div key={title} className="relative rounded-lg border border-white/10 bg-white/5 p-3"><div className="font-mono text-[9px] font-bold text-[#d4e86b]">{number}</div><h4 className="mt-2 text-[12px] font-semibold">{title}</h4><p className="mt-1 text-[10px] leading-4 text-[#c4d0d6]">{detail}</p>{index < 3 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-[#122232] text-[#d4e86b] md:block" />}</div>)}
        </div>
        <p className="mt-4 text-[10px] leading-4 text-[#9dafb8]">These illustrative project returns do not establish issuer valuation, security-level materiality or a portfolio conclusion.</p>
        <NextViewButton label="Key Drivers" target="key-drivers" onClick={() => selectFinancialView("key-drivers", true)} />
        <div className="sr-only" aria-live="polite">Baseline return {formatIRR(baseIRR)}. Conservative stress return {formatIRR(currentIRR)}. Recommendation status {metrics.recommendationStatus}.</div>
      </section>}

      {financialView === "key-drivers" && <section id="financial-panel-key-drivers" role="tabpanel" aria-labelledby="financial-tab-key-drivers" tabIndex={0} className="space-y-4">
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6"><SectionKicker>Ranked financial effects</SectionKicker><h3 className="text-[21px] font-semibold tracking-[-0.03em] text-[#122232]">What moves the conservative return?</h3><p className="mt-2 text-[11px] leading-5 text-[#52616b]">Ranked by absolute single-input IRR sensitivity. Each row shows direction, magnitude, evidence status and the treatment behind it.</p>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {prominentAttributions.map((attribution, index) => {
              const item = evidence[attribution.id];
              const effect = attribution.singleInputSensitivityIRR ?? 0;
              const differsFromModel = attribution.modeledClassification !== attribution.currentClassification;
              return <article key={attribution.id} data-testid={`impact-chain-row-${attribution.id}`} className="grid gap-3 py-4 lg:grid-cols-[2rem_1.2fr_0.7fr_0.8fr_1.5fr_auto] lg:items-center">
                <div className="font-mono text-[10px] font-bold text-[#607500]">{String(index + 1).padStart(2, "0")}</div>
                <div data-testid={`row-materiality-${attribution.id}`}><h4 className="text-[12px] font-semibold text-[#122232]">{item.label}</h4><p className="mt-1 text-[9px] leading-4 text-[#52616b]">{metrics.lineItems[attribution.id]?.driver}</p><div className="mt-1 font-mono text-[9px] text-[#60707d]">{formatDriverValue(metrics.lineItems[attribution.id]?.value ?? Number(item.value), metrics.lineItems[attribution.id]?.unit ?? item.unit)}</div></div>
                <div><div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7d898f]">Direction</div><div className={`mt-1 text-[11px] font-semibold ${effect < 0 ? "text-[#ba2f45]" : "text-[#0b7a63]"}`}>{effect < 0 ? "Lower return" : "Higher return"}</div></div>
                <div><div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7d898f]">Magnitude</div><div data-testid={`impact-chain-sensitivity-${attribution.id}`} className="mt-1 font-mono text-[11px] font-bold">{formatImpactDelta(effect)}</div><div data-testid={`materiality-impact-${attribution.id}`} className="sr-only">{formatImpactDelta(effect)}</div><div data-testid={`materiality-explanation-${attribution.id}`} className="sr-only">{metrics.lineItems[attribution.id]?.impactExplanation}</div></div>
                <div data-testid={`driver-treatment-${attribution.id}`}><div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#7d898f]">Evidence / treatment</div><p className="mt-1 text-[9px] font-semibold text-[#344550]">Evidence: {attribution.currentClassification}</p>{differsFromModel && <p className="mt-1 text-[9px] font-semibold text-[#7a5313]">Modeled as: {attribution.modeledClassification}</p>}<p className="mt-1 text-[9px] leading-4 text-[#52616b]">{differsFromModel ? `Reason: ${item.classificationReason ?? item.description}` : attribution.currentTreatment}</p><span data-testid={`impact-chain-classification-${attribution.id}`} className="sr-only">{item.classification}</span></div>
                <EvidenceTraceButton inputId={attribution.id} testId={`button-trace-impact-chain-${attribution.id}`} context="row" />
              </article>;
            })}
          </div>
          {additionalAttributions.length > 0 && <details data-testid="disclosure-additional-minor-effects" className="mt-4 rounded-lg border border-[#d9e0e4] bg-[#f7faf8]"><summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-semibold text-[#52616b] [&::-webkit-details-marker]:hidden">Additional minor effects <span className="font-normal">({additionalAttributions.length})</span><ChevronDown aria-hidden="true" className="ml-2 inline h-4 w-4" /></summary><div className="divide-y divide-[#e5eae8] border-t border-[#d9e0e4] px-4">{additionalAttributions.map((attribution) => {
            const item = evidence[attribution.id];
            const effect = attribution.singleInputSensitivityIRR ?? 0;
            const differsFromModel = attribution.modeledClassification !== attribution.currentClassification;
            return <article key={attribution.id} data-testid={`minor-impact-row-${attribution.id}`} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div data-testid={`row-materiality-${attribution.id}`}><h4 className="text-[10px] font-semibold text-[#122232]">{item.label}</h4><p className="mt-1 font-mono text-[9px] text-[#60707d]">{formatDriverValue(metrics.lineItems[attribution.id]?.value ?? Number(item.value), metrics.lineItems[attribution.id]?.unit ?? item.unit)}</p><p className="mt-1 text-[9px] text-[#60707d]">{effect === 0 ? "No adjustment at current classification" : `${formatImpactDelta(effect)} · nonzero, below prominent-display materiality`}</p></div><div data-testid={`driver-treatment-${attribution.id}`}><p className="text-[9px] font-semibold text-[#344550]">Evidence: {attribution.currentClassification}</p>{differsFromModel && <p className="mt-1 text-[9px] font-semibold text-[#7a5313]">Modeled as: {attribution.modeledClassification}</p>}<p className="mt-1 text-[9px] leading-4 text-[#52616b]">{differsFromModel ? `Reason: ${item.classificationReason ?? item.description}` : attribution.currentTreatment}</p></div><EvidenceTraceButton inputId={attribution.id} testId={`button-trace-minor-${attribution.id}`} context="row" /></article>;
          })}</div></details>}
        </div>
        <section id="financial-panel-waterfall" data-testid="panel-irr-waterfall" className="rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
          <details><summary className="cursor-pointer list-none text-left [&::-webkit-details-marker]:hidden"><SectionKicker tone="lime" className="!text-[#d4e86b]">Sequential stress attribution</SectionKicker><h3 className="text-[19px] font-semibold">Open the full stress waterfall</h3><p id="waterfall-methodology" data-testid="waterfall-methodology" className="mt-2 text-[10px] leading-4 text-[#c4d0d6]">Weaker evidence triggers predefined conservative treatments; interacting effects are sequential and not additive.</p></summary><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border border-[#b9d43a]/40 p-3"><div className="text-[9px] text-[#b9d43a]">Underwriting Baseline</div><div data-testid="waterfall-base-irr" className="mt-1 font-mono text-xl font-bold">{formatIRR(baseIRR)}</div></div>{metrics.waterfall.map((step) => <div key={step.id} data-testid={`waterfall-step-${step.id}`} className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="text-[10px] font-semibold">{evidence[step.id].label}</div><div data-testid={`waterfall-impact-${step.id}`} className="mt-1 font-mono text-[10px]">{formatImpactDelta(step.deltaIRR)}</div><div data-testid={`waterfall-explanation-${step.id}`} className="mt-1 text-[9px] text-[#d4e86b]">{step.impactExplanation}</div><div data-testid={`waterfall-treatment-${step.id}`} className="mt-2 text-[9px] leading-4">{step.impactTreatment}</div><EvidenceTraceButton inputId={step.id} testId={`button-trace-${step.id}`} context="waterfall" tone="dark" /></div>)}<div className="rounded-lg border border-[#f5ddd5]/40 p-3"><div className="text-[9px] text-[#f5ddd5]">Conservative Case (Stress-Adjusted)</div><div data-testid="waterfall-current-irr" className="mt-1 font-mono text-xl font-bold">{formatIRR(currentIRR)}</div></div></div><div data-testid="waterfall-reconciliation" className="mt-3 text-[9px] text-[#9dafb8]">Waterfall closure: {metrics.waterfallReconciles ? "reconciled" : "outside tolerance"} · {formatPercentagePoints(metrics.waterfallClosureDelta, { signed: true })} residual</div></details>
        </section>
        <NextViewButton label="Cash Flows" target="cash-flows" onClick={() => selectFinancialView("cash-flows", true)} />
      </section>}

      {financialView === "cash-flows" && <section id="financial-panel-cash-flows" data-testid="financial-panel-cash-flows" role="tabpanel" aria-labelledby="financial-tab-cash-flows" tabIndex={0} className="space-y-5">
         <div id="materiality-summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><MetricCard testId="metric-project-irr" label="Project IRR" value={formatIRR(currentIRR)} detail={`${formatPercentagePoints(irrDelta, { signed: true })} vs baseline`} accent="lime" /><MetricCard testId="metric-moic" label="MOIC" value={formatScenarioMetric(metrics.moic, "moic")} detail="5-year hold period" accent="navy" /><MetricCard testId="metric-coc" label="Pre-tax equity CoC" value={formatScenarioMetric(metrics.cashOnCash, "cashOnCash")} detail={`Year 3 CF ${formatCurrency(metrics.annualPreTaxEquityCashFlow)} ÷ initial equity ${formatCurrency(metrics.cashOnCashDenominator)}`} accent="violet" /><MetricCard testId="metric-payback" label="Payback" value={formatPayback(metrics.payback)} detail="Cumulative equity breakeven" accent="coral" /><MetricCard testId="metric-npv" label="NPV @ 10%" value={formatCurrency(metrics.npv, 0)} detail="Value relative to 10% discount rate" accent="navy" /></div>
         <section data-testid="panel-cash-flow-comparison" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6"><SectionKicker>Cash-flow comparison</SectionKicker><h3 className="text-[19px] font-semibold text-[#122232]">Baseline and stress equity cash flows</h3><div className="mt-4 max-w-full overflow-x-auto rounded border border-[#d9e0e4]"><table className="w-full min-w-[760px] border-collapse text-left"><caption className="sr-only">Underwriting baseline and conservative stress equity cash flows, displayed in USD millions</caption><thead className="sticky top-0 bg-[#f1f5f3] text-[9px] uppercase text-[#52616b]"><tr><th scope="col" className="sticky left-0 bg-[#f1f5f3] px-3 py-3">Period</th><th scope="col" className="px-3 py-3">Baseline equity CF</th><th scope="col" className="px-3 py-3">Stress equity CF</th><th scope="col" className="px-3 py-3">Marginal delta</th><th scope="col" className="px-3 py-3">Treatment</th></tr></thead><tbody className="divide-y divide-[#e5eae8] font-mono text-[10px]">{metrics.schedule.map((year, index) => { const baselineYear = metrics.baseModel?.schedule[index]; const delta = baselineYear ? year.netEquityCashFlow - baselineYear.netEquityCashFlow : null; return <tr key={year.year} data-testid={`cash-flow-comparison-y${year.year}`}><th scope="row" className="sticky left-0 bg-white px-3 py-3 text-[#122232]">{year.year === 0 ? "Close / Year 0" : `Year ${year.year}`}</th><td className="px-3 py-3">{baselineYear ? formatCurrency(baselineYear.netEquityCashFlow) : "—"}</td><td className="px-3 py-3">{formatCurrency(year.netEquityCashFlow)}</td><td className="px-3 py-3">{delta === null ? "—" : formatCurrency(delta)}</td><td className="px-3 py-3 font-sans text-[9px]">{year.year === 0 ? "Initial equity funding" : year.activeMonths === 0 ? "Pre-operation debt service; no operating coverage ratio" : year.year === 5 ? "Operating NOI plus exit value, less scheduled and terminal debt repayment" : "Operating NOI less scheduled debt service"}</td></tr>; })}</tbody></table></div><p className="mt-3 text-[10px] text-[#52616b]">Currency values display in USD millions (M). Equity cash flow includes operating NOI less scheduled debt service; Year 5 also includes terminal value less terminal debt repayment.</p></section>
          <section data-testid="annual-cash-flow-schedule" className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6"><SectionKicker>Complete annual schedule</SectionKicker><h3 className="text-[19px] font-semibold text-[#122232]">Five-year project-level cash-flow schedule</h3><div className="mt-4 max-w-full overflow-x-auto rounded border border-[#d9e0e4]"><table className="w-full min-w-[1080px] border-collapse text-left"><caption className="sr-only">Five-year annual project cash-flow schedule, displayed in USD millions</caption><thead className="sticky top-0 bg-[#f1f5f3] text-[9px] uppercase text-[#52616b]"><tr><th scope="col" className="sticky left-0 bg-[#f1f5f3] px-3 py-3">Year</th><th scope="col" className="px-3 py-3">Revenue</th><th scope="col" className="px-3 py-3">Total OPEX</th><th scope="col" className="px-3 py-3">NOI</th><th scope="col" className="px-3 py-3">Scheduled debt service</th><th scope="col" className="px-3 py-3">Coverage</th><th scope="col" className="px-3 py-3">Terminal value</th><th scope="col" className="px-3 py-3">Terminal debt repayment</th><th scope="col" className="px-3 py-3">Net equity CF</th></tr></thead><tbody className="divide-y divide-[#e5eae8] font-mono text-[10px]">{metrics.schedule.map((year) => <tr key={year.year} data-testid={`annual-schedule-y${year.year}`}><th scope="row" className="sticky left-0 bg-white px-3 py-3 text-[#122232]">{year.year === 0 ? "Close" : `Y${year.year}`}</th><td className="px-3 py-3">{year.year === 0 ? "—" : formatCurrency(year.revenue)}</td><td data-testid={`text-total-opex-y${year.year}`} className="px-3 py-3">{year.year === 0 ? "—" : formatCurrency(year.totalOpex)}</td><td className="px-3 py-3">{year.year === 0 ? "—" : formatCurrency(year.noi)}</td><td className="px-3 py-3">{year.debtService > 0 ? formatCurrency(year.debtService) : "—"}</td><td data-testid={`coverage-y${year.year}`} className="px-3 py-3">{formatCoverage(year)}</td><td className="px-3 py-3">{year.terminalValue > 0 ? formatCurrency(year.terminalValue) : "—"}</td><td className="px-3 py-3">{year.terminalDebtRepayment > 0 ? formatCurrency(year.terminalDebtRepayment) : "—"}</td><td className="px-3 py-3">{formatCurrency(year.netEquityCashFlow)}</td></tr>)}</tbody></table></div><p data-testid="coverage-explanation" className="mt-3 text-[10px] leading-4 text-[#52616b]">Currency values display in USD millions (M). “Pre-op” means scheduled interest and principal are due before operations begin, so no operating DSCR is presented. In operating periods, DSCR = NOI ÷ scheduled interest and principal. Terminal debt repayment is shown separately and deducted, with scheduled debt service, from equity cash flow.</p></section>
        <NextViewButton label="Assumptions" target="assumptions" onClick={() => selectFinancialView("assumptions", true)} />
      </section>}

      {financialView === "assumptions" && <section id="financial-panel-assumptions" data-testid="financial-panel-assumptions" role="tabpanel" aria-labelledby="financial-tab-assumptions" tabIndex={0} className="space-y-4">
        <div className="rounded-xl border border-[#f1cb8b] bg-[#fff8e9] p-5"><SectionKicker>Model boundary</SectionKicker><h3 className="text-[19px] font-semibold text-[#122232]">Synthetic assumptions stay separate from public evidence.</h3><p className="mt-2 text-[11px] leading-5 text-[#6f460e]">Entry value, lease rate, CAPEX, debt, downtime cost and terminal multiple are representative underwriting inputs—not reported {project.name} transaction terms. Public-source research does not activate project economics without the explicit opt-in shown before this model.</p><p data-testid="model-electricity-attribution" className="mt-3 rounded-md border border-[#e3d4b6] bg-white px-3 py-2 font-mono text-[11px] font-bold text-[#344550]">{formatElectricityCostAttribution(metrics.assumptions.electricityRate, evidence.electricity_cost.sourceId === "eia" ? sourceStates.eia : { ...sourceStates.eia, status: "embedded", dataOrigin: "embedded", timestamp: undefined })}</p></div>
        <details id="materiality-full-model" data-testid="disclosure-full-model-detail" className="rounded-xl border border-[#d9e0e4] bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] [&::-webkit-details-marker]:hidden">Transaction and return assumptions <ChevronDown aria-hidden="true" className="h-4 w-4" /></summary><div className="border-t border-[#d9e0e4] p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[
          ["Revenue build", `${formatCurrency(metrics.assumptions.annualRevenueAtFullUtilization)} full run-rate`, `${metrics.assumptions.capacityMW} MW × $${metrics.assumptions.leaseRatePerKwMonth} / kW-mo · ${metrics.assumptions.revenueDelayMonths} mo delay`],
          ["OPEX build", `${formatCurrency(metrics.schedule[5]?.totalOpex ?? 0)} Y5 OPEX`, "Power, water, maintenance, labor, insurance, compliance and climate disruption"],
          ["Climate disruption cost", `${formatCurrency(metrics.schedule[5]?.climateDisruptionOpex ?? 0)} Y5 OPEX`, `${(metrics.assumptions.adjustedHazardProbability * 100).toFixed(1)}% adjusted annual hazard × $${Math.round(metrics.assumptions.adjustedDowntimeCostPerDay / 1000)}K/day`],
          ["CAPEX schedule", `${formatCurrency(metrics.assumptions.totalCapex)} total`, `${formatCurrency(metrics.assumptions.entryValue)} entry + ${formatCurrency(metrics.assumptions.coolingCapex)} cooling + ${formatCurrency(metrics.assumptions.capexContingency)} contingency`],
          ["Debt structure", `${formatCurrency(metrics.assumptions.debtAmount)} opening debt`, `60% LTV · 7.5% interest · ${formatCurrency(metrics.assumptions.annualPrincipalPayment)} annual principal`],
          ["Terminal value", `${formatCurrency(metrics.terminalValue)} gross exit`, `${formatCurrency(metrics.schedule[5]?.noi ?? 0)} Y5 NOI × ${metrics.assumptions.exitMultiple.toFixed(1)}x`],
        ].map(([label, value, detail]) => <div key={label} className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-4"><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b]">{label}</div><div className="mt-2 font-mono text-[12px] font-bold">{value}</div><div className="mt-1 text-[10px] leading-4 text-[#52616b]">{detail}</div></div>)}</div></div></details>
         <details data-testid="disclosure-sources-uses" className="rounded-xl border border-[#d9e0e4] bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] [&::-webkit-details-marker]:hidden">Sources & uses / equity bridge <ChevronDown aria-hidden="true" className="h-4 w-4" /></summary><div className="border-t border-[#d9e0e4] p-5 text-[11px]"><p className="mb-3 text-[#52616b]">Synthetic transaction inputs are visibly separated from accepted evidence; sources reconcile exactly to uses.</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-[#f7faf8] p-3"><strong>Sources</strong><div className="mt-2 flex justify-between"><span>Debt</span><span>{formatCurrency(metrics.assumptions.sourcesAndUses.sources.debt)}</span></div><div className="flex justify-between"><span>Initial invested equity</span><span data-testid="text-initial-equity">{formatCurrency(metrics.initialInvestedEquity)}</span></div></div><div className="rounded-lg bg-[#f7faf8] p-3"><strong>Uses</strong><div className="mt-2 flex justify-between"><span>Entry value</span><span>{formatCurrency(metrics.assumptions.sourcesAndUses.uses.entryValue)}</span></div><div className="flex justify-between"><span>Cooling CAPEX</span><span>{formatCurrency(metrics.assumptions.sourcesAndUses.uses.coolingCapex)}</span></div><div className="flex justify-between"><span>Contingency</span><span>{formatCurrency(metrics.assumptions.sourcesAndUses.uses.capexContingency)}</span></div><div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Total uses</span><span>{formatCurrency(metrics.assumptions.sourcesAndUses.uses.total)}</span></div></div></div></div></details>
         <details data-testid="disclosure-opex-debt-schedules" className="rounded-xl border border-[#d9e0e4] bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] [&::-webkit-details-marker]:hidden">Full OPEX and debt schedules <ChevronDown aria-hidden="true" className="h-4 w-4" /></summary><div className="max-w-full overflow-x-auto border-t border-[#d9e0e4] p-5"><table className="w-full min-w-[760px] text-left text-[10px]"><thead><tr><th className="p-2">Year</th><th className="p-2">Power</th><th className="p-2">Water</th><th className="p-2">Maintenance</th><th className="p-2">Labor</th><th className="p-2">Insurance</th><th className="p-2">Compliance</th><th className="p-2">Climate</th><th className="p-2">Interest</th><th className="p-2">Principal</th></tr></thead><tbody>{metrics.schedule.filter((year) => year.year > 0).map((year) => <tr key={year.year} className="border-t"><th className="p-2">Y{year.year}</th><td className="p-2">{formatCurrency(year.electricityOpex)}</td><td className="p-2">{formatCurrency(year.waterOpex)}</td><td className="p-2">{formatCurrency(year.maintenanceOpex)}</td><td className="p-2">{formatCurrency(year.laborOpex)}</td><td className="p-2">{formatCurrency(year.insuranceOpex)}</td><td className="p-2">{formatCurrency(year.carbonComplianceOpex)}</td><td className="p-2">{formatCurrency(year.climateDisruptionOpex)}</td><td className="p-2">{formatCurrency(year.interest)}</td><td className="p-2">{formatCurrency(year.principal)}</td></tr>)}</tbody></table></div></details>
         <details data-testid="disclosure-revenue-bridge" className="rounded-xl border border-[#d9e0e4] bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] [&::-webkit-details-marker]:hidden">Revenue bridge & return sensitivity <ChevronDown aria-hidden="true" className="h-4 w-4" /></summary><div className="border-t border-[#d9e0e4] p-5"><p className="text-[10px] text-[#52616b]">Revenue = full-utilization lease run-rate × ramp × active months × customer utilization. Terminal value is synthetic: {metrics.assumptions.terminalFormula}</p><div className="mt-3 max-w-full overflow-x-auto"><table className="w-full text-left text-[10px]"><thead><tr><th className="p-2">Power price</th>{[0.8,1,1.2].map((u) => <th key={u} className="p-2">Util. {Math.round(u * 100)}%</th>)}</tr></thead><tbody>{[0.8,1,1.2].map((p) => <tr key={p} className="border-t"><th className="p-2">{Math.round(p * 100)}%</th>{[0.8,1,1.2].map((u) => { const cell = metrics.returnSensitivity.find((s) => s.powerPriceMultiplier === p && s.utilizationMultiplier === u); return <td key={u} className="p-2 font-mono">{cell?.irr === null ? "N/M" : `${cell?.irr.toFixed(1)}% / ${cell?.moic.toFixed(2)}x`}</td>; })}</tr>)}</tbody></table></div></div></details>
        <details data-testid="assumption-set-reconciliation" className="rounded-xl border border-[#aac6f4] bg-[#eef5ff]"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#255bb7] [&::-webkit-details-marker]:hidden">Verified baseline vs active stress <ChevronDown aria-hidden="true" className="h-4 w-4" /></summary><div className="border-t border-[#aac6f4] p-5"><p className="text-[10px] leading-4"><strong>Verified baseline:</strong> {formatIRR(baseIRR)}. <strong>Active conservative stress:</strong> {formatIRR(currentIRR)}. Both use the same synthetic transaction inputs and cash-flow schedule.</p><div className="mt-3 max-w-full overflow-x-auto"><table className="w-full min-w-[520px] text-left"><thead><tr><th className="p-2">Assumption</th><th className="p-2">Verified baseline</th><th className="p-2">Active stress</th></tr></thead><tbody>{assumptionComparison.map(([label, baseline, stress]) => <tr key={label} className="border-t border-[#d9e5f5]"><th className="p-2">{label}</th><td className="p-2">{baseline}</td><td className="p-2">{stress}</td></tr>)}</tbody></table></div></div></details>
        <details data-testid="panel-decision-context-treatment" className="rounded-xl border border-[#d9e0e4] bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] [&::-webkit-details-marker]:hidden">Evidence mappings and non-financial context <ChevronDown aria-hidden="true" className="h-4 w-4" /></summary><div className="border-t border-[#d9e0e4] p-5"><p data-testid="decision-context-treatment-copy" className="text-[11px] leading-5 text-[#52616b]">These items affect decision posture or provide diligence context but do not directly change the financial stress case.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{decisionAndContextItems.map((item) => { const definition = getEvidenceImpactRoleDefinition(item.id); return <article key={item.id} data-testid={`decision-context-item-${item.id}`} className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-4"><div className="flex justify-between gap-2"><h4 className="text-[12px] font-semibold">{item.label}</h4><ImpactRoleBadge role={item.impactRole} compact testId={`decision-context-role-${item.id}`} /></div><p className="mt-2 text-[10px] leading-4 text-[#52616b]">{definition.description}</p><div className="mt-2 text-[9px] text-[#60707d]">Source provenance: {item.sourceRole}</div><div className="mt-1 flex gap-2 text-[9px] text-[#60707d]">Current classification: <ClassificationBadge value={item.classification} compact /></div><div className="mt-1 text-[9px] text-[#60707d]">Financial role: <ImpactRoleBadge role={item.impactRole} compact testId={`decision-context-role-inline-${item.id}`} /></div><div className="mt-3"><EvidenceTraceButton inputId={item.id} testId={`button-trace-context-${item.id}`} context="context-item" /></div></article>; })}</div></div></details>
        <button data-testid="financial-next-advisor" type="button" onClick={() => onNavigate("advisor")} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#122232] px-4 text-xs font-semibold text-[#d4e86b]">Next: Advisor Brief <ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
      </section>}
      <BottomNav screen="materiality" onNavigate={onNavigate} />
    </div>
  );
}