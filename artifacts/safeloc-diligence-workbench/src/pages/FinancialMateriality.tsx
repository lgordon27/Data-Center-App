import {
  useMemo
} from "react";
import {
  ClassificationBadge,
  SectionKicker,
  MetricCard,
  LowConfidenceWarning,
  PageIntro,
  BottomNav
} from "@/components/Shell";

import {
  ArrowRight,
  ChevronDown,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert
} from "lucide-react";
import {
  Classification,
  useDiligence
} from "@/context/DiligenceContext";
import {
  calculateCashFlowModel
} from "@/model/cashFlowEngine";




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
export function FinancialMateriality({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, hasChangedClassification, metrics, sourceStates, project } = useDiligence();
  const projectName = project.name;
  const customProject = project.kind === "custom";
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
    const baselineEvidence = Object.fromEntries(Object.entries(evidence).map(([id, item]) => [id, {
      ...item,
      classification: "Verified Evidence" as Classification,
      modelClassification: item.modelClassification
        ? "Verified Evidence" as Classification
        : undefined,
    }]));
    let beforeEvidence = baselineEvidence;
    return impacts.map((impact) => {
      const afterEvidence = {
        ...beforeEvidence,
        [impact.id]: {
          ...beforeEvidence[impact.id],
          classification: evidence[impact.id].classification,
          modelClassification: evidence[impact.id].modelClassification,
        },
      };
      const before = calculateCashFlowModel(beforeEvidence, project.capacityMW).projectIRR;
      const after = calculateCashFlowModel(afterEvidence, project.capacityMW).projectIRR;
      beforeEvidence = afterEvidence;
      return { ...impact, before, after };
    }).map((step, index) => ({ ...step, index, change: step.before === null || step.after === null ? null : Number((step.after - step.before).toFixed(1)) }));
  }, [evidence, impacts, project.capacityMW]);
  return (
    <div>
      <PageIntro
        eyebrow="03 / quantify the uncertainty"
        title="Trace each uncertainty into the return."
        description="A five-year annual equity cash-flow engine ties revenue timing, operating costs, CAPEX, debt service, and terminal value to each evidence classification."
        right={<div className="flex items-center gap-2 rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0b7a63]"><Sparkles className="h-3.5 w-3.5" /> Derived locally</div>}
      />
      {!hasChangedClassification && (
        <aside data-testid="materiality-classification-prompt" role="note" className="mb-5 flex items-start gap-3 rounded-lg border border-[#aac6f4] bg-[#eef5ff] px-4 py-3 text-[11px] leading-5 text-[#344550]">
          <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" />
          <p><strong className="font-semibold text-[#122232]">Change a classification</strong> to see the return update.</p>
        </aside>
      )}
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
         <MetricCard testId="metric-project-irr" label="Project IRR" value={formatIRR(currentIRR)} detail={`${irrDelta === null ? "N/M" : `${irrDelta >= 0 ? "+" : ""}${irrDelta.toFixed(1)} pts`} vs verified baseline`} accent="lime" />
         <MetricCard testId="metric-moic" label="MOIC" value={formatScenarioMetric(metrics.moic, "moic")} detail="5-year hold period" accent="navy" />
         <MetricCard testId="metric-coc" label="Cash-on-cash" value={formatScenarioMetric(metrics.cashOnCash, "cashOnCash")} detail="Stabilized year 3" accent="violet" />
        <MetricCard testId="metric-payback" label="Payback" value={formatPayback(metrics.payback)} detail="Cumulative equity breakeven" accent="coral" />
         <MetricCard testId="metric-npv" label="NPV @ 10%" value={formatCurrency(metrics.npv, 0)} detail="Equity value created" accent="navy" />
      </div>
       <aside data-testid="portfolio-connection-strip" role="note" aria-labelledby="portfolio-connection-title" className="mt-4 rounded-lg border border-[#cbd8d4] bg-[#f1f5f3] px-4 py-3">
         <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
           <h2 id="portfolio-connection-title" className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Portfolio Connection</h2>
            <p data-testid="portfolio-connection-message" className="min-w-0 flex-1 text-[11px] leading-5 text-[#344550]">NVIDIA GPU contracts and hyperscaler CAPEX connect values-aligned funds to the infrastructure buildout. Evidence gaps at the project level can become exposure gaps in portfolio returns. This is market context, not facility-level {customProject ? `${projectName} evidence` : "Stargate evidence"} or a new modeled input.</p>
         </div>
       </aside>
       <section id="materiality-drivers" data-testid="panel-irr-waterfall" aria-labelledby="irr-waterfall-title" aria-describedby="irr-waterfall-description" className="mt-5 scroll-mt-24 rounded-xl border-2 border-[#122232] bg-[#122232] p-5 text-white md:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-white/15 pb-4 md:flex-row md:items-end">
           <div><SectionKicker tone="lime" className="!text-[#d4e86b]">Evidence-Quality Stress Test</SectionKicker><h2 id="irr-waterfall-title" className="text-[22px] font-semibold tracking-[-0.035em]">Evidence-Quality Stress Test</h2></div>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9dafb8]">Sequential · baseline to current</span>
        </div>
         <p id="irr-waterfall-description" data-testid="waterfall-description" className="mt-3 max-w-3xl text-[11px] leading-5 text-[#c4d0d6]">Lower evidence quality applies progressively conservative assumptions. This is a stress test, not a prediction. Unverified inputs are assigned worst-case values, not because negative outcomes are certain, but because conservative underwriting requires assuming the downside until evidence proves otherwise.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
           <div className="rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#b9d43a]">Base Case (All Inputs Verified)</div><div data-testid="waterfall-base-irr" className="mt-1 font-mono text-2xl font-bold text-[#d4e86b]">{formatIRR(baseIRR)}</div></div>
          {waterfallSteps.map((step) => {
            const tone = step.change !== null && step.change < 0 ? "text-[#f5ddd5]" : "text-[#b9d43a]";
            return <div key={step.id} data-testid={`waterfall-step-${step.id}`} className="rounded-lg border border-white/10 bg-white/5 p-3"><div className="truncate text-[10px] font-semibold text-[#e3eaed]">{evidence[step.id].label}</div><div className="mt-1 flex items-baseline justify-between gap-2"><span className={`font-mono text-sm font-bold ${tone}`}>{formatIRR(step.after)}</span><span className={`font-mono text-[9px] font-bold ${tone}`}>{step.change === null ? "N/M" : `${step.change >= 0 ? "+" : ""}${step.change.toFixed(1)} pts`}</span></div><div className="mt-1 text-[9px] text-[#9dafb8]">{evidence[step.id].classification}</div></div>;
          })}
           <div className="rounded-lg border-2 border-[#f5ddd5]/60 bg-[#f5ddd5]/10 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#f5ddd5]">Conservative Case (Evidence-Adjusted)</div><div data-testid="waterfall-current-irr" className="mt-1 font-mono text-2xl font-bold text-[#f5ddd5]">{formatIRR(currentIRR)}</div></div>
        </div>
         <aside data-testid="waterfall-underwriting-note" role="note" className="mt-5 rounded-lg border border-[#b9d43a]/40 bg-[#b9d43a]/10 px-3 py-2 text-[11px] leading-5 text-[#e8f0d1]">A management assertion that proves accurate would improve the return. This stress test shows the cost of not knowing, not the cost of a negative outcome.</aside>
         <div className="sr-only" aria-live="polite">Base Case (All Inputs Verified) {formatIRR(baseIRR)}. Conservative Case (Evidence-Adjusted) {formatIRR(currentIRR)}. Change {irrDelta === null ? "unavailable" : `${irrDelta.toFixed(1)} percentage points`}.</div>
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
                <div className={`hidden text-right font-mono text-[12px] font-bold sm:block ${effectTone}`}>{impact.deltaIRR > 0 ? "+" : ""}{impact.deltaIRR.toFixed(1)} pts</div>
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
          <div className="mt-4 rounded-lg border border-[#f5ddd5]/30 bg-[#f5ddd5]/10 px-3 py-2 font-mono text-[12px] font-bold text-[#f5ddd5]">{irrDelta === null ? "Baseline delta unavailable" : `${irrDelta >= 0 ? "+" : ""}${irrDelta.toFixed(1)} percentage points from verified baseline`}</div>
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
