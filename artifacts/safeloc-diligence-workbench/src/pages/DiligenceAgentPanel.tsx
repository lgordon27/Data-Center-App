import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AgentStageBadge, Disclosure, RelationshipBadge, ReviewDecisionBadge, SectionKicker } from "@/components/Shell";
import { DrawerField, DrawerSection, useWorkbenchDrawer } from "@/components/ContextDrawer";
import { useDiligence } from "@/context/DiligenceContext";
import type { AgentFinding, AgentLensId, ReviewDecision } from "@/model/diligenceAgent";
import type { EvidenceItem } from "@/context/DiligenceContext";

const runStatusLabels = {
  idle: "Not run",
  running: "Running",
  "partial-failure": "Partial failure",
  "review-ready": "Review ready",
  failed: "Failed",
} as const;

function ReviewButtons({ findingId, decision }: { findingId: string; decision: ReviewDecision }) {
  const { reviewAgentFinding } = useDiligence();
  const actions: { value: ReviewDecision; label: string; icon: typeof Check }[] = [
    { value: "accepted", label: "Accept", icon: Check },
    { value: "overridden", label: "Override", icon: X },
    { value: "unresolved", label: "Leave Unresolved", icon: Clock3 },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Human review decision">
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

type FindingPresentation = { current: string; proposed: string; effect: string };

function describeFinding(finding: AgentFinding, evidence: Record<string, EvidenceItem>, relationshipProposal?: string): FindingPresentation {
  if (finding.kind === "classification" && finding.evidenceIds.length > 0) {
    const first = evidence[finding.evidenceIds[0]];
    return {
      current: first ? first.classification : "Current record",
      proposed: finding.proposedClassification ?? "Awaiting proposal",
      effect: "No return metric changes until a human approves a reclassification.",
    };
  }
  if (finding.kind === "relationship") {
    return {
      current: "Not established by this run",
      proposed: relationshipProposal ?? finding.proposedRelationship ?? "Human disposition required",
      effect: "Governs the review package only; establishes no ownership or control claim.",
    };
  }
  if (finding.kind === "financial-relevance") {
    return {
      current: finding.evidenceIds.map((id) => evidence[id]?.label).filter(Boolean).join("; ") || "Current evidence record",
      proposed: "Review topic prepared",
      effect: "No return metric changes until a human approves.",
    };
  }
  return {
    current: "Scoped from project identity",
    proposed: "Ready for human review",
    effect: "Governs review scope only; no evidence or economics change.",
  };
}

function FindingCard({ finding }: { finding: AgentFinding }) {
  const { agentRun, evidence } = useDiligence();
  const { openDrawer } = useWorkbenchDrawer();
  const linkedRelationship = agentRun.relationships.find((rel) => rel.findingId === finding.id && finding.kind === "relationship");
  const presentation = describeFinding(finding, evidence, linkedRelationship?.relationship);
  const evidenceLabels = finding.evidenceIds.map((id) => evidence[id]?.label ?? id);
  const decided = finding.decision !== "pending";

  const openDetails = (event: React.MouseEvent<HTMLButtonElement>) => {
    openDrawer({
      key: `agent-finding:${finding.id}`,
      kicker: "Proposed finding · human review required",
      title: finding.title,
      render: () => (
        <div className="space-y-4">
          <DrawerSection label="Proposal">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Current value" value={presentation.current} />
              <DrawerField label="Proposed value" value={presentation.proposed} />
            </div>
            <p>{finding.summary}</p>
          </DrawerSection>
          <DrawerSection label="Decision effect">
            <p>{presentation.effect}</p>
            <p className="text-[#7a5313]">Nothing here changes a displayed return metric, an evidence classification, or an issuer-level conclusion.</p>
          </DrawerSection>
          <DrawerSection label="Evidence and sources">
            {evidenceLabels.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4">{evidenceLabels.map((label) => <li key={label}>{label}</li>)}</ul>
            ) : (
              <p>No project evidence records are attached to this proposal.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Source support" value={finding.sourceSupportConfidence === null ? "Not rated" : `${Math.round(finding.sourceSupportConfidence * 100)}% of cited sources support`} />
              <DrawerField label="Model self-rating" value={finding.modelReportedConfidence === null ? "Not provided" : `${Math.round(finding.modelReportedConfidence * 100)}% (self-reported, not a probability)`} />
            </div>
            {finding.sourceIds.length > 0 && <p className="font-mono text-[9px] text-[#7c8b93]">Source ids: {finding.sourceIds.join(", ")}</p>}
          </DrawerSection>
          <DrawerSection label="Audit">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Decision state" value={<ReviewDecisionBadge value={finding.decision} />} />
              <DrawerField label="Agent run" value={agentRun.runId ?? "No active run"} />
            </div>
            {finding.reviewerNote && <p>Reviewer note: {finding.reviewerNote}</p>}
            <p className="text-[#7c8b93]">Recorded {agentRun.completedAt ?? agentRun.startedAt ?? "—"} · proposals remain unresolved until a human decides.</p>
          </DrawerSection>
        </div>
      ),
    }, { trigger: event.currentTarget, returnFocusSelector: `[data-testid='agent-finding-${finding.id}'] [data-drawer-close], [data-testid='agent-finding-${finding.id}'] button` });
  };

  return (
    <article data-testid={`agent-finding-${finding.id}`} className={`rounded-lg border bg-white p-4 ${decided ? (finding.decision === "accepted" ? "border-[#a9d7c8]" : finding.decision === "overridden" ? "border-[#e2b8a4]" : "border-[#e8cf9b]") : "border-[#d9e0e4]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">{finding.kind.replace("-", " ")}</div>
          <h4 className="mt-1 text-[13px] font-semibold leading-5 text-[#122232]">{finding.title}</h4>
        </div>
        <ReviewDecisionBadge value={finding.decision} testId={`agent-finding-decision-${finding.id}`} />
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[#e0e4e0] bg-[#f8faf8] px-2.5 py-1.5">
          <dt className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#7c8b93]">Current value</dt>
          <dd className="mt-0.5 text-[10px] font-semibold leading-4 text-[#1c2b33]">{presentation.current}</dd>
        </div>
        <div className="rounded-md border border-[#e0e4e0] bg-[#f8faf8] px-2.5 py-1.5">
          <dt className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#7c8b93]">Proposed value</dt>
          <dd className="mt-0.5 text-[10px] font-semibold leading-4 text-[#1c2b33]">{presentation.proposed}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[10px] leading-4 text-[#52616b]">{finding.summary}</p>
      <p className="mt-2 border-l-2 border-[#d4e86b] pl-2 text-[9px] font-semibold leading-4 text-[#33454e]">Financial effect: {presentation.effect}</p>
      {evidenceLabels.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{evidenceLabels.map((label) => <span key={label} className="rounded-full border border-[#d9e0e4] bg-[#f7f9f8] px-2 py-1 text-[8px] text-[#52616b]">{label}</span>)}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <ReviewButtons findingId={finding.id} decision={finding.decision} />
        <button
          data-testid={`button-agent-finding-details-${finding.id}`}
          type="button"
          onClick={openDetails}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#cbd8d4] bg-white px-3 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#255bb7] hover:border-[#255bb7]"
        >
          View details <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

const lensBridgeCopy: Record<AgentLensId, { heading: string; steps: string[]; note: string } | null> = {
  "project-investor": null,
  "asset-manager": {
    heading: "Project → issuer → effect → portfolio",
    steps: [
      "Project: evidence-backed execution and operating topics for this facility only.",
      "Issuer: no issuer-level materiality claim is made from project evidence alone.",
      "Effect: only approved reclassifications can move a displayed return metric.",
      "Portfolio: monitoring topics carry into holdings review; nothing auto-trades.",
    ],
    note: "The bridge documents what is known at each step; it never promotes project evidence into an issuer conclusion.",
  },
  "financial-advisor": {
    heading: "Client-conversation guidance",
    steps: [
      "Lead with what is evidenced, what is asserted, and what is missing.",
      "Frame value-at-risk as ranges to resolve, not as predicted losses.",
      "Separate this project's facts from any public-company or fund exposure.",
    ],
    note: "This lens produces no trading recommendation. Suitability and any client action remain with the advisor.",
  },
};

export function DiligenceAgentPanel() {
  const { agentRun, runDiligenceAgent, retryDiligenceStage, originatingCompany } = useDiligence();
  const [activeLens, setActiveLens] = useState<AgentLensId>(originatingCompany ? "financial-advisor" : "project-investor");
  const isRunning = agentRun.status === "running";
  const completedCount = agentRun.stages.filter((stage) => stage.status === "completed").length;
  const activeLensData = agentRun.lenses.find((lens) => lens.id === activeLens) ?? agentRun.lenses[0];
  const reviewedCount = agentRun.proposedFindings.filter((finding) => finding.decision !== "pending").length;
  const packageReady = (agentRun.status === "review-ready" || agentRun.status === "partial-failure") && agentRun.proposedFindings.length > 0;
  const pendingCount = agentRun.proposedFindings.length - reviewedCount;
  const lensBridge = activeLensData ? lensBridgeCopy[activeLensData.id] : null;

  return (
    <div className="space-y-5">
      <section data-testid="diligence-agent-panel" className="overflow-hidden rounded-xl border border-[#243844] bg-[#122232] text-white" aria-labelledby="diligence-agent-heading">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_.75fr]">
          <div className="p-5 md:p-7">
            <SectionKicker tone="lime" className="!text-[#d4e86b]">Governed diligence agent</SectionKicker>
            <h2 id="diligence-agent-heading" className="max-w-2xl text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] md:text-[30px]">Run the review. Keep the decision human.</h2>
            <p className="mt-3 max-w-2xl text-[11px] leading-5 text-[#b9c7cd]">The agent prepares bounded review proposals from the current evidence. It cannot approve evidence, alter economics, infer legal conclusions, or make an investment recommendation.</p>
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
                {runStatusLabels[agentRun.status]} · {completedCount}/{agentRun.stages.length}
              </div>
            </div>
            <p data-testid="agent-run-summary" className="mt-4 text-[10px] leading-4 text-[#9fb0b8]">{agentRun.summary}</p>
            <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
              <div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#82939c]">Current state</div><div data-testid="agent-current-state" className="mt-1 text-[11px] font-semibold text-white">{runStatusLabels[agentRun.status]}</div></div>
              <div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#82939c]">Last run</div><div data-testid="agent-last-run" className="mt-1 text-[11px] font-semibold text-white">{agentRun.completedAt ?? agentRun.startedAt ?? "Not run"}</div></div>
              <div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#82939c]">Awaiting review</div><div data-testid="agent-pending-count" className="mt-1 text-[11px] font-semibold text-[#d4e86b]">{pendingCount} {pendingCount === 1 ? "proposal" : "proposals"}</div></div>
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-5 lg:border-l lg:border-t-0 md:p-7">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#d4e86b]">Control boundary</div>
            <div className="mt-4 space-y-3 text-[10px] leading-4 text-[#c6d2d7]">
              {[
                "Approved-source and current-record review only",
                "Completed stages survive a partial failure",
                "Confidence never promotes provenance",
                "Accept, Override, or Leave Unresolved",
              ].map((item) => <div key={item} className="flex gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d4e86b]" /><span>{item}</span></div>)}
            </div>
          </div>
        </div>
      </section>

       <Disclosure title="View activity" testId="agent-activity-disclosure" className="mt-4">
       <section data-testid="agent-stage-list" className="rounded-xl border-0 bg-transparent p-0" aria-labelledby="agent-stages-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionKicker>Stage progress</SectionKicker>
            <h3 id="agent-stages-heading" className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Ten bounded stages</h3>
          </div>
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#71818a]">Waiting · Running · Complete · Needs review · Could not complete</span>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {agentRun.stages.map((stage, index) => (
            <li key={stage.id} data-testid={`agent-stage-${stage.id}`} className={`min-w-0 rounded-lg border p-3 ${stage.status === "running" ? "border-[#7aa7ed] bg-[#f3f7fd]" : stage.status === "completed" ? "border-[#a9d7c8] bg-[#f5fbf8]" : stage.status === "retryable" || stage.status === "failed" ? "border-[#efabb8] bg-[#fff8f8]" : "border-[#e0e5e7] bg-[#fafbfa]"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#71818a]">{String(index + 1).padStart(2, "0")}</span>
                <AgentStageBadge value={stage.status} testId={`agent-stage-status-${stage.id}`} />
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

       <Disclosure title="Activity log" testId="agent-activity-log" className="mt-4">
        <ol className="space-y-2">
          {agentRun.stages.filter((stage) => stage.summary || stage.error || stage.startedAt).map((stage) => (
            <li key={stage.id} className="flex flex-wrap items-baseline gap-x-2 rounded-md border border-[#e0e4e0] bg-[#fafbfa] px-3 py-2 text-[9px] leading-4 text-[#52616b]">
              <span className="font-bold text-[#243844]">{stage.label}</span>
              <AgentStageBadge value={stage.status} />
              {stage.startedAt && <span className="font-mono text-[8px] text-[#8b989f]">started {stage.startedAt}{stage.completedAt ? ` · done ${stage.completedAt}` : ""}</span>}
              <span className="basis-full">{stage.error ?? stage.summary ?? "Completed without additional notes."}</span>
            </li>
          ))}
          {agentRun.stages.every((stage) => !stage.summary && !stage.error && !stage.startedAt) && (
            <li className="text-[9px] leading-4 text-[#71818a]">No activity yet. Run the diligence agent to populate the log.</li>
          )}
        </ol>
       </Disclosure>
       </Disclosure>

      {packageReady && (
        <section data-testid="agent-results-summary" className="flex flex-col items-start justify-between gap-3 rounded-xl border border-[#cbd8d4] bg-[#f0f4ef] p-4 sm:flex-row sm:items-center md:px-5" aria-label="Run results summary">
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#0e3e2f]">Run complete — results summary</p>
            <p className="mt-1 text-[11px] leading-4 text-[#33454e]">
              {agentRun.proposedFindings.length} proposed findings · {pendingCount} pending decision · {agentRun.relationships.length} relationships · {agentRun.conditionsPrecedent.length + agentRun.dealProtection.length} review topics
            </p>
          </div>
          <button
            data-testid="button-review-proposed-findings"
            type="button"
            onClick={() => {
              const heading = document.getElementById("agent-review-heading");
              heading?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth", block: "start" });
              // Section navigation moves keyboard focus too, not just the viewport.
              heading?.focus({ preventScroll: true });
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-[#122232] px-4 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] hover:bg-[#1c2b33]"
          >
            Review Proposed Findings <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {packageReady && (
        <>
          <section data-testid="agent-review-package" className="rounded-xl border border-[#cbd8d4] bg-[#f8faf8] p-4 md:p-6" aria-labelledby="agent-review-heading">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <SectionKicker tone="lime">Human Review Required</SectionKicker>
                <h3 id="agent-review-heading" tabIndex={-1} className="scroll-mt-28 text-[21px] font-semibold tracking-[-0.03em] text-[#122232] outline-none">Review proposed findings</h3>
                <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#60707d]">Each proposal shows the current value, the proposed value, and its financial effect. Accepting a proposal does not reclassify evidence, change a financial assumption, establish issuer materiality, or approve an investment — and no return metric changes until a human approves.</p>
              </div>
              <span data-testid="agent-review-count" className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b]">{reviewedCount}/{agentRun.proposedFindings.length} dispositioned</span>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {agentRun.proposedFindings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </section>

          <section data-testid="agent-lenses" className="rounded-xl border border-[#d9e0e4] bg-white p-4 md:p-6" aria-labelledby="agent-lenses-heading">
            <SectionKicker>One record · three lenses</SectionKicker>
            <h3 id="agent-lenses-heading" className="text-[21px] font-semibold tracking-[-0.03em] text-[#122232]">Investment lenses over the same evidence</h3>
            <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#60707d]">The lens changes the question, not the underlying facts. Project evidence remains separate from issuer materiality and portfolio exposure.</p>
            <div className="mt-4" role="tablist" aria-label="Investment lens selector">
              <div className="inline-flex max-w-full flex-wrap gap-0 overflow-hidden rounded-md border border-[#cbd8d4] bg-[#f8faf8] p-0.5">
                {agentRun.lenses.map((lens) => (
                  <button key={lens.id} id={`agent-lens-tab-${lens.id}`} data-testid={`agent-lens-tab-${lens.id}`} type="button" role="tab" aria-selected={activeLens === lens.id} aria-controls="agent-lens-panel" onClick={() => setActiveLens(lens.id)} className={`min-h-10 rounded px-3 font-mono text-[8px] font-bold uppercase tracking-[0.09em] ${activeLens === lens.id ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b] hover:text-[#122232]"}`}>
                    {lens.label}
                  </button>
                ))}
              </div>
            </div>
            {activeLensData && (
              <div id="agent-lens-panel" data-testid="agent-lens-panel" role="tabpanel" aria-labelledby={`agent-lens-tab-${activeLensData.id}`} className="mt-4 grid gap-4 rounded-lg border border-[#cbd8d4] bg-[#f8faf8] p-4 md:grid-cols-[1.1fr_.9fr]">
                <div>
                  <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#255bb7]">{activeLensData.label}</div>
                  <h4 className="mt-2 text-[17px] font-semibold leading-6 text-[#122232]">{activeLensData.question}</h4>
                  <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{activeLensData.posture}</p>
                  {lensBridge && (
                    <div className="mt-3 rounded-md border border-[#d9e0e4] bg-white p-3">
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">{lensBridge.heading}</div>
                      <ul className="mt-2 space-y-1.5">
                        {lensBridge.steps.map((step) => <li key={step} className="text-[9px] leading-4 text-[#33454e]">{step}</li>)}
                      </ul>
                      <p className="mt-2 border-t border-[#e0e4e0] pt-2 text-[9px] font-semibold leading-4 text-[#7a5313]">{lensBridge.note}</p>
                    </div>
                  )}
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
                {agentRun.relationships.map((relationship) => (
                  <RelationshipCard key={relationship.id} relationshipId={relationship.id} />
                ))}
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

function RelationshipCard({ relationshipId }: { relationshipId: string }) {
  const { agentRun, evidence } = useDiligence();
  const { openDrawer } = useWorkbenchDrawer();
  const relationship = agentRun.relationships.find((item) => item.id === relationshipId);
  if (!relationship) return null;
  const linkedFinding = agentRun.proposedFindings.find((finding) => finding.id === relationship.findingId);
  return (
    <div className="rounded-lg border border-[#d9e0e4] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <RelationshipBadge value={relationship.relationship} />
        <ReviewDecisionBadge value={relationship.decision} />
      </div>
      <div className="mt-2 text-[11px] font-bold text-[#122232]">{relationship.label}</div>
      <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#52616b]">{relationship.basis}</p>
      <button
        data-testid={`button-relationship-evidence-${relationship.id}`}
        type="button"
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#cbd8d4] bg-white px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#255bb7] hover:border-[#255bb7]"
        onClick={(event) => openDrawer({
          key: `agent-relationship:${relationship.id}`,
          kicker: "Relationship evidence",
          title: relationship.label,
          render: () => (
            <div className="space-y-4">
              <DrawerSection label="Relationship">
                <div className="flex flex-wrap gap-2">
                  <RelationshipBadge value={relationship.relationship} />
                  <ReviewDecisionBadge value={relationship.decision} />
                </div>
                <p>{relationship.basis}</p>
              </DrawerSection>
              <DrawerSection label="Evidence">
                {relationship.evidenceIds.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-4">{relationship.evidenceIds.map((id) => <li key={id}>{evidence[id]?.label ?? id}</li>)}</ul>
                ) : (
                  <p>No project evidence records are attached; this relationship reflects review context only.</p>
                )}
              </DrawerSection>
              {linkedFinding && (
                <DrawerSection label="Linked proposal">
                  <p><strong>{linkedFinding.title}.</strong> {linkedFinding.summary}</p>
                </DrawerSection>
              )}
              <DrawerSection label="Boundary">
                <p className="text-[#7a5313]">A relationship label is review context. It never establishes ownership, financing, or issuer-level materiality by itself.</p>
              </DrawerSection>
            </div>
          ),
        }, { trigger: event.currentTarget })}
        aria-label={`View evidence for ${relationship.label}`}
      >
        View evidence <ArrowRight aria-hidden="true" className="h-3 w-3" />
      </button>
    </div>
  );
}
