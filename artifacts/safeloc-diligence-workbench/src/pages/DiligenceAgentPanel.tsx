import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Disclosure, SectionKicker } from "@/components/Shell";
import { useDiligence } from "@/context/DiligenceContext";
import type { AgentLensId, ReviewDecision } from "@/model/diligenceAgent";

const statusLabels = {
  idle: "Not run",
  running: "Running",
  "partial-failure": "Partial failure",
  "review-ready": "Review ready",
  failed: "Failed",
} as const;

const relationshipTone = {
  Direct: "border-[#8bc7b3] bg-[#f1fbf6] text-[#08644f]",
  Related: "border-[#9eb9e3] bg-[#f3f7fd] text-[#255bb7]",
  Comparable: "border-[#d3c0ea] bg-[#faf7ff] text-[#674392]",
  "Not found": "border-[#d9e0e4] bg-[#f7f8f7] text-[#52616b]",
} as const;

const decisionLabels: Record<ReviewDecision, string> = {
  pending: "Pending decision",
  accepted: "Accepted",
  overridden: "Overridden",
  unresolved: "Leave unresolved",
};

function StageIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[#0b765c]" />;
  if (status === "running") return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-[#255bb7]" />;
  if (status === "retryable" || status === "failed") return <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[#ba2f45]" />;
  return <Circle aria-hidden="true" className="h-4 w-4 text-[#9aa7ae]" />;
}

function ReviewButtons({ findingId, decision }: { findingId: string; decision: ReviewDecision }) {
  const { reviewAgentFinding } = useDiligence();
  const actions: { value: ReviewDecision; label: string; icon: typeof Check }[] = [
    { value: "accepted", label: "Accept", icon: Check },
    { value: "overridden", label: "Override", icon: X },
    { value: "unresolved", label: "Leave unresolved", icon: Clock3 },
  ];
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Human review decision">
      {actions.map((action) => {
        const Icon = action.icon;
        const selected = decision === action.value;
        return (
          <button
            key={action.value}
            data-testid={`agent-decision-${findingId}-${action.value}`}
            type="button"
            aria-pressed={selected}
            onClick={() => reviewAgentFinding(findingId, action.value)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${selected ? "border-[#122232] bg-[#122232] text-[#d4e86b]" : "border-[#cbd8d4] bg-white text-[#52616b] hover:border-[#8da0aa]"}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function DiligenceAgentPanel() {
  const { agentRun, runDiligenceAgent, retryDiligenceStage, evidence } = useDiligence();
  const [activeLens, setActiveLens] = useState<AgentLensId>("project-investor");
  const isRunning = agentRun.status === "running";
  const completedCount = agentRun.stages.filter((stage) => stage.status === "completed").length;
  const activeLensData = agentRun.lenses.find((lens) => lens.id === activeLens) ?? agentRun.lenses[0];
  const reviewedCount = agentRun.proposedFindings.filter((finding) => finding.decision !== "pending").length;
  const packageReady = agentRun.status === "review-ready" && agentRun.proposedFindings.length > 0;
  const evidenceLabels = useMemo(() => Object.fromEntries(Object.entries(evidence).map(([id, item]) => [id, item.label])), [evidence]);

  return (
    <div className="space-y-5">
      <section data-testid="diligence-agent-panel" className="overflow-hidden rounded-xl border border-[#243844] bg-[#122232] text-white" aria-labelledby="diligence-agent-heading">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_.75fr]">
          <div className="p-5 md:p-7">
            <SectionKicker tone="lime" className="!text-[#d4e86b]">Governed diligence agent</SectionKicker>
            <h2 id="diligence-agent-heading" className="max-w-2xl text-[28px] font-semibold leading-[1.08] tracking-[-0.04em] md:text-[38px]">Run the review. Keep the decision human.</h2>
            <p className="mt-4 max-w-2xl text-[11px] leading-5 text-[#b9c7cd]">The agent works through bounded stages using the current evidence, community review, and financial model. It prepares proposals only—it cannot approve evidence, alter economics, infer legal conclusions, or make an investment recommendation.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                data-testid="button-run-diligence-agent"
                type="button"
                disabled={isRunning}
                onClick={() => void runDiligenceAgent()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#d4e86b] px-5 font-mono text-[10px] font-bold uppercase tracking-[0.11em] text-[#122232] hover:bg-[#e1ef8a] disabled:cursor-wait disabled:opacity-70"
              >
                {isRunning ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
                {isRunning ? "Running diligence agent" : agentRun.runId ? "Run diligence agent again" : "Run Diligence Agent"}
              </button>
              <div data-testid="agent-run-status" role="status" aria-live="polite" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#dce5e8]">
                <span className={`h-2 w-2 rounded-full ${agentRun.status === "review-ready" ? "bg-[#d4e86b]" : agentRun.status === "running" ? "animate-pulse bg-[#7aa7ed]" : agentRun.status.includes("failure") || agentRun.status === "failed" ? "bg-[#ef8193]" : "bg-[#82939c]"}`} />
                {statusLabels[agentRun.status]} · {completedCount}/{agentRun.stages.length}
              </div>
            </div>
            <p data-testid="agent-run-summary" className="mt-4 text-[10px] leading-4 text-[#9fb0b8]">{agentRun.summary}</p>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-5 lg:border-l lg:border-t-0 md:p-7">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#d4e86b]">Control boundary</div>
            <div className="mt-4 space-y-3 text-[10px] leading-4 text-[#c6d2d7]">
              {[
                "Approved-source and current-record review only",
                "Completed stages survive a partial failure",
                "Confidence never promotes provenance",
                "Accept, override, or leave unresolved",
              ].map((item) => <div key={item} className="flex gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d4e86b]" /><span>{item}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <section data-testid="agent-stage-list" className="rounded-xl border border-[#d9e0e4] bg-white p-4 md:p-5" aria-labelledby="agent-stages-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionKicker>Visible execution</SectionKicker>
            <h3 id="agent-stages-heading" className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Ten bounded stages</h3>
          </div>
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#71818a]">Current · completed · failed · retryable</span>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {agentRun.stages.map((stage, index) => (
            <li key={stage.id} data-testid={`agent-stage-${stage.id}`} className={`min-w-0 rounded-lg border p-3 ${stage.status === "running" ? "border-[#7aa7ed] bg-[#f3f7fd]" : stage.status === "completed" ? "border-[#a9d7c8] bg-[#f5fbf8]" : stage.status === "retryable" || stage.status === "failed" ? "border-[#efabb8] bg-[#fff8f8]" : "border-[#e0e5e7] bg-[#fafbfa]"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#71818a]">{String(index + 1).padStart(2, "0")}</span>
                <StageIcon status={stage.status} />
              </div>
              <div className="mt-2 text-[11px] font-bold leading-4 text-[#243844]">{stage.label}</div>
              <div className="mt-1 text-[9px] leading-4 text-[#667680]">{stage.description}</div>
              {stage.error && <p role="alert" className="mt-2 text-[9px] leading-4 text-[#9a2639]">{stage.error}</p>}
              {stage.status === "retryable" && (
                <button data-testid={`button-retry-agent-stage-${stage.id}`} type="button" onClick={() => void retryDiligenceStage(stage.id)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#d8a0aa] bg-white px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#8f2437]">
                  <RefreshCw aria-hidden="true" className="h-3 w-3" /> Retry stage
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      {packageReady && (
        <>
          <section data-testid="agent-review-package" className="rounded-xl border border-[#cbd8d4] bg-[#f8faf8] p-4 md:p-6" aria-labelledby="agent-review-heading">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <SectionKicker tone="lime">Human review required</SectionKicker>
                <h3 id="agent-review-heading" className="text-[21px] font-semibold tracking-[-0.03em] text-[#122232]">Review proposed findings</h3>
                <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#60707d]">These decisions govern the review package only. Accepting a proposal does not reclassify evidence, change a financial assumption, establish issuer materiality, or approve an investment.</p>
              </div>
              <span data-testid="agent-review-count" className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b]">{reviewedCount}/{agentRun.proposedFindings.length} dispositioned</span>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {agentRun.proposedFindings.map((finding) => (
                <article key={finding.id} data-testid={`agent-finding-${finding.id}`} className="rounded-lg border border-[#d9e0e4] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">{finding.kind.replace("-", " ")}</div>
                      <h4 className="mt-1 text-[13px] font-semibold leading-5 text-[#122232]">{finding.title}</h4>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 font-mono text-[7px] font-bold uppercase tracking-[0.08em] ${finding.decision === "accepted" ? "bg-[#e0f4ed] text-[#08644f]" : finding.decision === "overridden" ? "bg-[#f5ddd5] text-[#8f2437]" : finding.decision === "unresolved" ? "bg-[#fff0d4] text-[#7a5313]" : "bg-[#eef1f2] text-[#60707d]"}`}>{decisionLabels[finding.decision]}</span>
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-[#52616b]">{finding.summary}</p>
                  {finding.evidenceIds.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{finding.evidenceIds.map((id) => <span key={id} className="rounded-full border border-[#d9e0e4] bg-[#f7f9f8] px-2 py-1 text-[8px] text-[#52616b]">{evidenceLabels[id] ?? id}</span>)}</div>}
                  <ReviewButtons findingId={finding.id} decision={finding.decision} />
                </article>
              ))}
            </div>
          </section>

          <section data-testid="agent-lenses" className="rounded-xl border border-[#d9e0e4] bg-white p-4 md:p-6" aria-labelledby="agent-lenses-heading">
            <SectionKicker>One record · three lenses</SectionKicker>
            <h3 id="agent-lenses-heading" className="text-[21px] font-semibold tracking-[-0.03em] text-[#122232]">Investment lenses over the same evidence</h3>
            <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#60707d]">The lens changes the question, not the underlying facts. Project evidence remains separate from issuer materiality and portfolio exposure.</p>
            <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Diligence lens">
              {agentRun.lenses.map((lens) => (
                <button key={lens.id} id={`agent-lens-tab-${lens.id}`} data-testid={`agent-lens-tab-${lens.id}`} type="button" role="tab" aria-selected={activeLens === lens.id} aria-controls="agent-lens-panel" onClick={() => setActiveLens(lens.id)} className={`min-h-10 rounded-md px-3 font-mono text-[8px] font-bold uppercase tracking-[0.09em] ${activeLens === lens.id ? "bg-[#122232] text-[#d4e86b]" : "border border-[#cbd8d4] bg-[#f8faf8] text-[#52616b]"}`}>
                  {lens.label}
                </button>
              ))}
            </div>
            {activeLensData && (
              <div id="agent-lens-panel" data-testid="agent-lens-panel" role="tabpanel" aria-labelledby={`agent-lens-tab-${activeLensData.id}`} className="mt-4 grid gap-4 rounded-lg border border-[#cbd8d4] bg-[#f8faf8] p-4 md:grid-cols-[1.1fr_.9fr]">
                <div>
                  <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#255bb7]">{activeLensData.label}</div>
                  <h4 className="mt-2 text-[17px] font-semibold leading-6 text-[#122232]">{activeLensData.question}</h4>
                  <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{activeLensData.posture}</p>
                </div>
                <div className="space-y-2">
                  {activeLensData.focusAreas.map((area) => <div key={area} className="flex items-center gap-2 rounded-md border border-[#d9e0e4] bg-white px-3 py-2 text-[10px] font-semibold text-[#344550]"><ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-[#255bb7]" />{area}</div>)}
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Disclosure title="Relationship map · direct, related, comparable, not found" testId="agent-relationship-disclosure" defaultOpen>
              <div className="grid gap-2 sm:grid-cols-2">
                {agentRun.relationships.map((relationship) => <div key={relationship.id} className={`rounded-lg border p-3 ${relationshipTone[relationship.relationship]}`}><div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em]">{relationship.relationship}</div><div className="mt-1 text-[11px] font-bold">{relationship.label}</div><p className="mt-1 text-[9px] leading-4 opacity-80">{relationship.basis}</p></div>)}
              </div>
            </Disclosure>
            <Disclosure title="Risk allocation and capital-at-risk timing" testId="agent-risk-disclosure">
              <div className="space-y-2">
                {agentRun.riskAllocation.map((item) => <div key={item.id} className="rounded-lg border border-[#d9e0e4] bg-[#f8faf8] p-3"><div className="flex justify-between gap-3"><span className="text-[10px] font-bold text-[#243844]">{item.topic}</span><span className="font-mono text-[8px] uppercase text-[#60707d]">{item.allocation}</span></div><p className="mt-1 text-[9px] leading-4 text-[#60707d]">{item.basis}</p></div>)}
                <div className="grid gap-2 sm:grid-cols-3">{agentRun.capitalAtRisk.map((item) => <div key={item.id} className="rounded-lg border border-[#d9e0e4] p-3"><div className="font-mono text-[8px] font-bold uppercase text-[#60707d]">{item.phase}</div><div className="mt-1 text-[11px] font-bold capitalize text-[#122232]">{item.exposure}</div></div>)}</div>
              </div>
            </Disclosure>
            <Disclosure title="Conditions precedent and deal protection" testId="agent-protection-disclosure">
              <div className="space-y-3">
                {([["Conditions precedent", agentRun.conditionsPrecedent], ["Deal-protection topics", agentRun.dealProtection]] as const).map(([label, items]) => <div key={label}><div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#60707d]">{label}</div><ul className="mt-2 space-y-2">{items.map((item) => <li key={item.id} className="flex gap-2 text-[10px] leading-4 text-[#344550]"><FileSearch aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#255bb7]" /><span><strong>{item.label}.</strong> {item.basis}</span></li>)}</ul></div>)}
              </div>
            </Disclosure>
            <Disclosure title="Value-at-risk ranges" testId="agent-var-disclosure">
              <div className="space-y-2">
                {agentRun.valueAtRisk.map((item) => <div key={item.id} className="rounded-lg border border-[#efcf9c] bg-[#fffaf0] p-3"><div className="flex items-start justify-between gap-3"><span className="text-[10px] font-bold text-[#4f3b18]">{item.label}</span><span className="font-mono text-[8px] font-bold uppercase text-[#8c651f]">{item.low === null || item.high === null ? "Unresolved" : `${item.low}–${item.high} ${item.unit}`}</span></div><p className="mt-1 text-[9px] leading-4 text-[#745b2d]">{item.basis}</p></div>)}
                <p className="text-[9px] leading-4 text-[#60707d]">No probability, financial penalty, legal conclusion, or trade recommendation is generated when support is absent.</p>
              </div>
            </Disclosure>
          </div>
        </>
      )}
    </div>
  );
}