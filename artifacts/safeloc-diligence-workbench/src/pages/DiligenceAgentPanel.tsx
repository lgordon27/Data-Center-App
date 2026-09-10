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
import type { Classification } from "@/model/cashFlowEngine";
import type { EvidenceItem } from "@/context/DiligenceContext";

const runStatusLabels = {
  idle: "Not run",
  running: "Running",
  "partial-failure": "Partial failure",
  "review-ready": "Review ready",
  failed: "Failed",
} as const;

function ReviewButtons({ finding, onOverride }: { finding: AgentFinding; onOverride: () => void }) {
  const { reviewAgentFinding } = useDiligence();
  const actions: { value: ReviewDecision; label: string; icon: typeof Check }[] = [
    ...(finding.consequential && finding.action !== "review-only" ? [{ value: "accepted" as const, label: "Accept", icon: Check }, { value: "overridden" as const, label: "Override", icon: X }] : []),
    { value: "rejected", label: "Reject", icon: X },
    { value: "unresolved", label: "Leave Unresolved", icon: Clock3 },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Human review decision">
      {actions.map((action) => {
        const Icon = action.icon;
        const selected = finding.decision === action.value;
        return (
          <button
            key={action.value}
            data-testid={`agent-decision-${finding.id}-${action.value}`}
            type="button"
            aria-pressed={selected}
            onClick={() => action.value === "overridden" ? onOverride() : reviewAgentFinding(finding.id, action.value)}
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
      effect: "No return metric changes until an analyst accepts a reclassification.",
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
      effect: "No return metric changes until an analyst accepts.",
    };
  }
  return {
    current: "Scoped from project identity",
    proposed: "Ready for analyst review",
    effect: "Governs review scope only; no evidence or economics change.",
  };
}

function FindingCard({ finding }: { finding: AgentFinding }) {
  const { agentRun, evidence, reviewAgentFinding, reverseAgentChange, agentProposalsStale } = useDiligence();
  const { openDrawer } = useWorkbenchDrawer();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideClassification, setOverrideClassification] = useState<Classification>(finding.currentClassification ?? "Missing Evidence");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideValue, setOverrideValue] = useState(String(finding.proposedValue ?? finding.currentValue ?? ""));
  const linkedRelationship = agentRun.relationships.find((rel) => rel.findingId === finding.id && finding.kind === "relationship");
  const presentation = describeFinding(finding, evidence, linkedRelationship?.relationship);
  const evidenceLabels = finding.evidenceIds.map((id) => evidence[id]?.label ?? id);
  const decided = finding.decision !== "pending";
  const appliedChange = agentRun.appliedChanges.find((change) => change.proposalId === finding.id && !change.reversedAt);

  const openDetails = (event: React.MouseEvent<HTMLButtonElement>) => {
    openDrawer({
      key: `agent-finding:${finding.id}`,
      kicker: "Proposed finding · analyst action",
      title: finding.title,
      render: () => (
        <div className="space-y-4">
          <DrawerSection label="Proposal">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Current value / classification" value={`${finding.currentValue ?? presentation.current} · ${finding.currentClassification ?? "Not classified"}`} />
              <DrawerField label="Proposed value / classification" value={`${finding.proposedValue ?? presentation.proposed} · ${finding.proposedClassification ?? "No model change"}`} />
            </div>
            <p>{finding.summary}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Action" value={finding.action.replaceAll("-", " ")} />
              <DrawerField label="Evidence classification" value={finding.evidenceClassification ?? finding.currentClassification ?? "Not applicable"} />
            </div>
          </DrawerSection>
          <DrawerSection label="Decision effect">
            <DrawerField label="Affected financial-model line" value={finding.affectedModelLine ?? "No direct modeled line"} />
            <p>{finding.estimatedMetricEffect ?? finding.financialPreview}</p>
            <p>{finding.estimatedRecommendationEffect ?? "No recommendation effect estimated."}</p>
            <p>{finding.decisionPosture}</p>
          </DrawerSection>
          <DrawerSection label="Evidence and sources">
            {evidenceLabels.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4">{evidenceLabels.map((label) => <li key={label}>{label}</li>)}</ul>
            ) : (
              <p>No project evidence records are attached to this proposal.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Raw value / units" value={`${finding.rawValue ?? "Not retained"} ${finding.rawUnit ?? ""}`.trim()} />
              <DrawerField label="Normalized value / units" value={`${finding.normalizedValue ?? "Not retained"} ${finding.normalizedUnit ?? ""}`.trim()} />
              <DrawerField label="Source eligibility" value={finding.eligibility ?? "unresolved"} />
              <DrawerField label="Project relevance" value={finding.exactProjectRelevance ?? "unresolved"} />
              <DrawerField label="Source support" value={finding.sourceSupportConfidence === null ? "Not rated" : `${Math.round(finding.sourceSupportConfidence * 100)}% of cited sources support`} />
              <DrawerField label="Model self-rating" value={finding.modelReportedConfidence === null ? "Not provided" : `${Math.round(finding.modelReportedConfidence * 100)}% (self-reported, not a probability)`} />
            </div>
            {finding.exactClaim && <p><strong>Exact supporting claim:</strong> {finding.exactClaim}</p>}
            {finding.exactPassage && <blockquote className="border-l-2 border-[#aac6f4] pl-3">{finding.exactPassage}</blockquote>}
            {finding.supportingSources.length > 0 && <ul className="space-y-2">{finding.supportingSources.map((source) => <li key={source.sourceId} className="rounded border border-[#e0e4e0] bg-[#fafbfa] p-2"><strong>{source.title}</strong> · {source.classification}<span className="mt-1 block">{source.claimPassage ?? source.excerpt}</span>{source.url && <a className="mt-1 block text-[#255bb7] underline" href={source.url} target="_blank" rel="noreferrer">Open retained source</a>}</li>)}</ul>}
          </DrawerSection>
          <DrawerSection label="Audit">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Decision state" value={<ReviewDecisionBadge value={finding.decision} />} />
              <DrawerField label="Agent run" value={agentRun.runId ?? "No active run"} />
            </div>
            {finding.reviewerNote && <p>Reviewer note: {finding.reviewerNote}</p>}
            <p className="text-[#7c8b93]">Recorded {agentRun.completedAt ?? agentRun.startedAt ?? "—"} · the preview remains separate from accepted state until an analyst acts.</p>
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
       <div className="mt-3 grid gap-2 sm:grid-cols-2">
         <div className="rounded-md border border-[#e0e4e0] bg-[#f8faf8] px-2.5 py-1.5"><div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#7c8b93]">Action / classification</div><div className="mt-0.5 text-[10px] font-semibold text-[#1c2b33]">{finding.action.replaceAll("-", " ")} · {finding.evidenceClassification ?? finding.currentClassification ?? "Review topic"}</div></div>
         <div className="rounded-md border border-[#e0e4e0] bg-[#f8faf8] px-2.5 py-1.5"><div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#7c8b93]">Source support</div><div className="mt-0.5 text-[10px] font-semibold text-[#1c2b33]">{finding.sourceSupportConfidence === null ? "Not validated" : `${Math.round(finding.sourceSupportConfidence * 100)}%`} · {finding.supportingSources.length} source{finding.supportingSources.length === 1 ? "" : "s"}</div></div>
       </div>
       <p className="mt-2 border-l-2 border-[#d4e86b] pl-2 text-[9px] font-semibold leading-4 text-[#33454e]">Financial preview: {finding.financialPreview}</p>
       {agentProposalsStale && finding.decision === "pending" && <div role="alert" data-testid={`agent-stale-${finding.id}`} className="mt-3 rounded-md border border-[#d99a47] bg-[#fff7e8] p-3 text-[9px] leading-4 text-[#704600]"><strong>Proposal is stale.</strong> Refresh it, or deliberately apply it against the newer state.</div>}
       <p className="mt-1 border-l-2 border-[#aac6f4] pl-2 text-[9px] leading-4 text-[#52616b]">Decision posture: {finding.decisionPosture}</p>
       {finding.supportingSources.length > 0 && <p className="mt-2 text-[9px] leading-4 text-[#60707d]"><strong>Supporting source:</strong> {finding.supportingSources[0].title} — {finding.supportingSources[0].excerpt}</p>}
       <p className="mt-2 text-[9px] leading-4 text-[#52616b]"><strong>Reasoning:</strong> {finding.reasoning}</p>
      {evidenceLabels.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{evidenceLabels.map((label) => <span key={label} className="rounded-full border border-[#d9e0e4] bg-[#f7f9f8] px-2 py-1 text-[8px] text-[#52616b]">{label}</span>)}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
         {!decided && !agentProposalsStale && <ReviewButtons finding={finding} onOverride={() => setOverrideOpen(true)} />}
         {!decided && agentProposalsStale && finding.consequential && <button data-testid={`agent-apply-stale-${finding.id}`} type="button" onClick={() => reviewAgentFinding(finding.id, "accepted", undefined, undefined, true)} className="min-h-10 rounded-md border border-[#a76516] bg-white px-3 font-mono text-[8px] font-bold uppercase text-[#704600]">Apply against newer state</button>}
        <button
          data-testid={`button-agent-finding-details-${finding.id}`}
          type="button"
          onClick={openDetails}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#cbd8d4] bg-white px-3 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#255bb7] hover:border-[#255bb7]"
        >
          View details <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
      {appliedChange && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#a9d7c8] bg-[#f1fbf6] px-3 py-2 text-[9px] text-[#0e3e2f]"><span><strong>Applied and audited.</strong> Before: {appliedChange.beforeClassification}; after: {appliedChange.finalClassification}.</span><button data-testid={`agent-reverse-${finding.id}`} type="button" onClick={() => reverseAgentChange(appliedChange.id)} className="min-h-8 rounded border border-[#0e3e2f] px-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em]">Reverse change</button></div>}
      {overrideOpen && finding.action === "reclassify-evidence" && (
        <div data-testid={`agent-override-form-${finding.id}`} className="mt-3 rounded-md border border-[#cbb7ec] bg-[#f8f4fd] p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#7049b7]">Confirm analyst override</div>
          <p className="mt-1 text-[9px] leading-4 text-[#5e5870]">The AI proposal stays recorded separately. Choose the final classification and confirm before any metric recalculation.</p>
          <label className="mt-2 block text-[9px] font-semibold text-[#52616b]">Final classification
            <select data-testid={`agent-override-classification-${finding.id}`} value={overrideClassification} onChange={(event) => setOverrideClassification(event.target.value as Classification)} className="mt-1 block min-h-9 w-full rounded border border-[#cbb7ec] bg-white px-2 text-[10px] text-[#243844]">
              {["Verified Evidence", "Management Assertion", "Model Inference", "User Assumption", "Missing Evidence"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-[9px] font-semibold text-[#52616b]">Reviewer note
            <textarea data-testid={`agent-override-note-${finding.id}`} value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} className="mt-1 block min-h-16 w-full rounded border border-[#cbb7ec] bg-white p-2 text-[10px] text-[#243844]" placeholder="Why does the source support this final value?" />
          </label>
          <label className="mt-2 block text-[9px] font-semibold text-[#52616b]">Final value
            <input data-testid={`agent-override-value-${finding.id}`} value={overrideValue} onChange={(event) => setOverrideValue(event.target.value)} className="mt-1 block min-h-9 w-full rounded border border-[#cbb7ec] bg-white px-2 text-[10px] text-[#243844]" />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button data-testid={`agent-confirm-override-${finding.id}`} type="button" onClick={() => { reviewAgentFinding(finding.id, "overridden", overrideClassification, overrideNote, agentProposalsStale, overrideValue); setOverrideOpen(false); }} className="rounded bg-[#7049b7] px-3 py-2 font-mono text-[8px] font-bold uppercase text-white">Confirm override</button>
            <button type="button" onClick={() => setOverrideOpen(false)} className="rounded border border-[#cbb7ec] bg-white px-3 py-2 font-mono text-[8px] font-bold uppercase text-[#7049b7]">Cancel</button>
          </div>
        </div>
      )}
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
  const { agentRun, runDiligenceAgent, retryDiligenceStage, originatingCompany, bulkReviewAgentFindings, agentProposalsStale, activityHistory } = useDiligence();
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
            <SectionKicker tone="lime" className="!text-[#d4e86b]">Analyst review assistant</SectionKicker>
            <h2 id="diligence-agent-heading" className="max-w-2xl text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] md:text-[30px]">Research, compare, decide.</h2>
            <p className="mt-3 max-w-2xl text-[11px] leading-5 text-[#b9c7cd]">The assistant reads retained research operations, matches source passages to evidence variables, previews the existing financial model, and prepares proposals. Nothing accepted changes until you act.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                data-testid="button-run-diligence-agent"
                type="button"
                disabled={isRunning}
                onClick={() => void runDiligenceAgent()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#d4e86b] px-5 font-mono text-[10px] font-bold uppercase tracking-[0.11em] text-[#122232] hover:bg-[#e1ef8a] disabled:cursor-wait disabled:opacity-70"
              >
                {isRunning ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
                {isRunning ? "Preparing proposals" : agentRun.runId ? "Refresh proposals" : "Prepare proposals"}
              </button>
              <div data-testid="agent-run-status" role="status" aria-live="polite" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#dce5e8]">
                <span className={`h-2 w-2 rounded-full ${agentRun.status === "review-ready" ? "bg-[#d4e86b]" : agentRun.status === "running" ? "animate-pulse bg-[#7aa7ed]" : agentRun.status.includes("failure") || agentRun.status === "failed" ? "bg-[#ef8193]" : "bg-[#82939c]"}`} />
                {runStatusLabels[agentRun.status]} · {completedCount}/{agentRun.stages.length}
              </div>
            </div>
            <p data-testid="agent-run-summary" className="mt-4 text-[10px] leading-4 text-[#9fb0b8]">{agentRun.summary}</p>
            <div data-testid="agent-readiness" className={`mt-4 rounded-md border px-3 py-2 text-[10px] leading-4 ${agentRun.readiness === "ready-for-human-review" ? "border-[#76c8a9] bg-[#0d3d31] text-[#d8f3e6]" : agentRun.readiness === "conditionally-ready" ? "border-[#f1cb8b] bg-[#4b3518] text-[#ffe5b2]" : "border-[#efabb8] bg-[#4a2029] text-[#ffd9df]"}`}>
              <strong className="uppercase tracking-[0.1em]">{agentRun.readiness.replaceAll("-", " ")}</strong>
              <span className="ml-2">{agentRun.readinessReason}</span>
            </div>
            <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
              <div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#82939c]">Current state</div><div data-testid="agent-current-state" className="mt-1 text-[11px] font-semibold text-white">{runStatusLabels[agentRun.status]}</div></div>
              <div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#82939c]">Last run</div><div data-testid="agent-last-run" className="mt-1 text-[11px] font-semibold text-white">{agentRun.completedAt ?? agentRun.startedAt ?? "Not run"}</div></div>
              <div><div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#82939c]">Awaiting review</div><div data-testid="agent-pending-count" className="mt-1 text-[11px] font-semibold text-[#d4e86b]">{pendingCount} {pendingCount === 1 ? "proposal" : "proposals"}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#a7bbc2]">
              <span data-testid="agent-retrieved-source-count">Retrieved sources: {agentRun.retrievedSourceCount}</span>
              <span data-testid="agent-validated-source-count">Validated sources: {agentRun.validatedSourceCount}</span>
              <span>Stages: recorded operations</span>
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] p-5 lg:border-l lg:border-t-0 md:p-7">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#d4e86b]">Fast analyst controls</div>
            <div className="mt-4 space-y-3 text-[10px] leading-4 text-[#c6d2d7]">
              {[
                "Approved-source and current-record review only",
                "Completed stages survive a partial failure",
                "Confidence never promotes provenance",
                "One-click Accept, plus Override, Reject, or Leave unresolved",
              ].map((item) => <div key={item} className="flex gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d4e86b]" /><span>{item}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      {agentProposalsStale && <div data-testid="agent-stale-warning" role="alert" className="rounded-lg border border-[#d99a47] bg-[#fff7e8] p-4 text-[10px] leading-5 text-[#704600]"><strong>Proposals are stale.</strong> Evidence, source lineage, model inputs, or project identity changed after they were prepared. Refresh proposals, or deliberately apply an individual proposal against the newer state.</div>}

       <Disclosure title="View activity" testId="agent-activity-disclosure" className="mt-4">
       <section data-testid="agent-stage-list" className="rounded-xl border-0 bg-transparent p-0" aria-labelledby="agent-stages-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionKicker>Stage progress</SectionKicker>
            <h3 id="agent-stages-heading" className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Ten recorded operations</h3>
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
                 <SectionKicker tone="lime">Analyst action</SectionKicker>
                 <h3 id="agent-review-heading" tabIndex={-1} className="scroll-mt-28 text-[21px] font-semibold tracking-[-0.03em] text-[#122232] outline-none">Review proposed findings</h3>
                 <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#60707d]">Accepting or overriding an eligible proposal updates accepted evidence and recalculates the existing model. Reject and Leave unresolved preserve the model. Project evidence never establishes issuer, security, fund, or portfolio materiality by itself.</p>
              </div>
               <div className="flex flex-wrap items-center gap-2"><button data-testid="agent-bulk-accept" type="button" disabled={agentProposalsStale} onClick={() => bulkReviewAgentFindings("accepted")} className="min-h-10 rounded-md bg-[#365b4c] px-3 font-mono text-[8px] font-bold uppercase text-white disabled:opacity-40">Accept non-conflicting</button><button data-testid="agent-bulk-reject" type="button" disabled={agentProposalsStale} onClick={() => bulkReviewAgentFindings("rejected")} className="min-h-10 rounded-md border border-[#9b3d4d] bg-white px-3 font-mono text-[8px] font-bold uppercase text-[#9b3d4d] disabled:opacity-40">Reject non-conflicting</button><span data-testid="agent-review-count" className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b]">{reviewedCount}/{agentRun.proposedFindings.length} dispositioned</span></div>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {agentRun.proposedFindings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))}
            </div>
          </section>

           <Disclosure title="Analyst decision history" testId="agent-audit-timeline" defaultOpen={agentRun.auditEvents.length > 0}>
            <p className="mb-3 text-[10px] leading-4 text-[#60707d]">Every accepted, overridden, rejected, unresolved, and reversed outcome remains visible. Audit events do not themselves change evidence.</p>
            {agentRun.auditEvents.length === 0 ? <p className="text-[10px] text-[#71818a]">No analyst decisions recorded yet.</p> : (
              <ol className="space-y-2">
                {[...agentRun.auditEvents].reverse().map((event) => (
                  <li key={event.id} data-testid={`agent-audit-event-${event.id}`} className="rounded-md border border-[#d9e0e4] bg-white p-3 text-[9px] leading-4 text-[#52616b]">
                    <div className="flex flex-wrap items-center gap-2"><ReviewDecisionBadge value={event.outcome} /><strong className="text-[#243844]">{event.action.replaceAll("-", " ")}</strong><time dateTime={event.recordedAt} className="font-mono text-[8px] text-[#82939c]">{event.recordedAt}</time></div>
                    <div className="mt-1">Evidence: {event.affectedEvidenceId ?? "review topic"} · before: {event.beforeClassification ?? event.beforeValue ?? "unchanged"} · proposed: {event.proposedClassification ?? event.proposedValue ?? "none"} · final: {event.finalClassification ?? event.finalValue ?? "unchanged"}</div>
                    <div className="mt-1">Sources: {event.sourceIds.length ? event.sourceIds.join(", ") : "none attached"}{event.note ? ` · note: ${event.note}` : ""}</div>
                  </li>
                ))}
              </ol>
            )}
          </Disclosure>

           <Disclosure title="Research and financial lineage" testId="financial-lineage-history">
             <p className="mb-3 text-[10px] leading-4 text-[#60707d]">Append-only events retain research, proposal, analyst action, reversal, scenario, and recalculation lineage. Corrections add events; they do not rewrite prior history.</p>
             <ol className="max-h-96 space-y-2 overflow-auto">
               {[...activityHistory].reverse().map((event) => <li key={event.id} data-testid={`lineage-event-${event.id}`} className="rounded-md border border-[#d9e0e4] bg-white p-3 text-[9px] leading-4 text-[#52616b]"><div className="flex flex-wrap gap-2"><strong className="text-[#243844]">{event.action.replaceAll("-", " ")}</strong><span>{event.actor}</span><time dateTime={event.recordedAt}>{event.recordedAt}</time></div><div>{event.evidenceId ?? event.proposalId ?? event.scenarioId ?? event.projectKey}</div>{event.modelEffect && <div>{event.modelEffect}</div>}{event.passage && <details><summary className="cursor-pointer">Supporting passage</summary><blockquote className="mt-1 border-l-2 pl-2">{event.passage}</blockquote></details>}</li>)}
               {!activityHistory.length && <li className="text-[10px] text-[#71818a]">No lineage events recorded yet.</li>}
             </ol>
           </Disclosure>

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
