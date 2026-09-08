import type { Classification } from "./cashFlowEngine";

export const DILIGENCE_STAGE_DEFINITIONS = [
  { id: "identity", label: "Identity", description: "Confirm project, location, capacity, and scope boundaries." },
  { id: "planning", label: "Research plan", description: "Set bounded questions and approved-source priorities." },
  { id: "source-search", label: "Approved-source search", description: "Search public sources without treating directory hints as evidence." },
  { id: "evidence-extraction", label: "Evidence extraction", description: "Extract claims, provenance, conflicts, and missing fields." },
  { id: "community-review", label: "Community review", description: "Review agreement terms and keep benchmarks separate from project evidence." },
  { id: "precedent-comparison", label: "Precedent comparison", description: "Compare only to clearly labeled related or comparable agreements." },
  { id: "financial-relevance", label: "Financial relevance", description: "Map supported issues to model inputs without changing economics." },
  { id: "relationship-mapping", label: "Relationship mapping", description: "Separate direct, related, comparable, and not-found relationships." },
  { id: "citation-validation", label: "Citation validation", description: "Check source attribution, access state, and unresolved conflicts." },
  { id: "review-preparation", label: "Review preparation", description: "Prepare bounded proposals for a human reviewer." },
] as const;

export type DiligenceStageId = typeof DILIGENCE_STAGE_DEFINITIONS[number]["id"];
export type AgentStageStatus = "pending" | "running" | "completed" | "failed" | "retryable";
export type DiligenceRunStatus = "idle" | "running" | "partial-failure" | "review-ready" | "failed";
export type ReviewDecision = "pending" | "accepted" | "overridden" | "unresolved";
export type AgentRelationshipKind = "Direct" | "Related" | "Comparable" | "Not found";
export type AgentLensId = "project-investor" | "asset-manager" | "financial-advisor";
export type AgentFindingKind = "classification" | "relationship" | "financial-relevance" | "review-gap";

export type AgentStage = {
  id: DiligenceStageId;
  label: string;
  description: string;
  status: AgentStageStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryable?: boolean;
  summary?: string;
};

export type AgentFinding = {
  id: string;
  kind: AgentFindingKind;
  title: string;
  summary: string;
  evidenceIds: string[];
  proposedClassification?: Classification;
  proposedRelationship?: AgentRelationshipKind;
  sourceIds: string[];
  sourceSupportConfidence: number | null;
  modelReportedConfidence: number | null;
  consequential: boolean;
  decision: ReviewDecision;
  reviewerNote?: string;
};

export type AgentRelationship = {
  id: string;
  label: string;
  relationship: AgentRelationshipKind;
  basis: string;
  evidenceIds: string[];
  findingId: string;
  decision: ReviewDecision;
};

export type AgentLens = {
  id: AgentLensId;
  label: string;
  question: string;
  posture: string;
  focusAreas: string[];
  evidenceIds: string[];
  unresolvedCount: number;
};

export type RiskAllocationProposal = {
  id: string;
  topic: string;
  allocation: "project" | "counterparty" | "shared" | "unresolved";
  basis: string;
  findingId: string;
};

export type CapitalAtRiskProposal = {
  id: string;
  phase: "development" | "construction" | "energization" | "operations";
  exposure: "low" | "medium" | "high" | "unresolved";
  basis: string;
  findingId: string;
};

export type ReviewTopicProposal = {
  id: string;
  label: string;
  basis: string;
  findingId: string;
  decision: ReviewDecision;
};

export type ValueAtRiskRangeProposal = {
  id: string;
  label: string;
  low: number | null;
  high: number | null;
  unit: "USD" | "IRR points" | "days" | "unresolved";
  basis: string;
  findingId: string;
  decision: ReviewDecision;
};

export type DiligenceAgentState = {
  version: 1;
  runId: string | null;
  status: DiligenceRunStatus;
  startedAt?: string;
  completedAt?: string;
  activeStageId?: DiligenceStageId;
  lastError?: string;
  stages: AgentStage[];
  summary: string;
  proposedFindings: AgentFinding[];
  relationships: AgentRelationship[];
  lenses: AgentLens[];
  riskAllocation: RiskAllocationProposal[];
  capitalAtRisk: CapitalAtRiskProposal[];
  conditionsPrecedent: ReviewTopicProposal[];
  dealProtection: ReviewTopicProposal[];
  valueAtRisk: ValueAtRiskRangeProposal[];
};

export type AgentProjectInput = {
  projectName: string;
  location: string;
  capacityMW: number;
  evidenceIds: string[];
  communityUnresolvedCount: number;
};

export type AgentStageOutcome = {
  summary?: string;
  error?: string;
  retryable?: boolean;
};

const TERMINAL_STATUSES: AgentStageStatus[] = ["completed", "failed"];

export function createInitialDiligenceAgent(): DiligenceAgentState {
  return {
    version: 1,
    runId: null,
    status: "idle",
    stages: DILIGENCE_STAGE_DEFINITIONS.map((stage) => ({ ...stage, status: "pending" })),
    summary: "No agent run yet. Run the governed review to prepare proposals for a human decision.",
    proposedFindings: [],
    relationships: [],
    lenses: [],
    riskAllocation: [],
    capitalAtRisk: [],
    conditionsPrecedent: [],
    dealProtection: [],
    valueAtRisk: [],
  };
}

export function startDiligenceAgent(previous: DiligenceAgentState, now = new Date().toISOString()): DiligenceAgentState {
  const stages = previous.stages.map((stage) => ({
    ...stage,
    status: "pending" as AgentStageStatus,
    error: undefined,
    retryable: undefined,
    startedAt: undefined,
    completedAt: undefined,
    summary: undefined,
  }));
  const firstPending = stages[0]?.id ?? "identity";
  return {
    ...createInitialDiligenceAgent(),
    runId: `agent-${now.replace(/[^0-9]/g, "").slice(0, 14)}`,
    status: "running",
    startedAt: now,
    activeStageId: firstPending,
    stages,
    summary: "Agent is running bounded stages. No evidence, economics, or recommendation changes automatically.",
  };
}

function withStage(state: DiligenceAgentState, id: DiligenceStageId, patch: Partial<AgentStage>): AgentStage[] {
  return state.stages.map((stage) => stage.id === id ? { ...stage, ...patch } : stage);
}

export function advanceDiligenceStage(
  state: DiligenceAgentState,
  id: DiligenceStageId,
  outcome: AgentStageOutcome = {},
  now = new Date().toISOString(),
): DiligenceAgentState {
  const current = state.stages.find((stage) => stage.id === id);
  if (!current || (current.status !== "pending" && current.status !== "retryable" && current.status !== "running")) return state;
  if (outcome.error) {
    const stages = withStage(state, id, {
      status: outcome.retryable ? "retryable" : "failed",
      error: outcome.error,
      retryable: outcome.retryable,
      completedAt: undefined,
    });
    const hasCompleted = stages.some((stage) => stage.status === "completed");
    return { ...state, stages, status: hasCompleted ? "partial-failure" : "failed", activeStageId: id, lastError: outcome.error, summary: outcome.retryable ? "A bounded stage timed out. Completed work is retained and can be retried." : "The agent stopped before producing a review package. Completed work is retained." };
  }
  const stages = withStage(state, id, { status: "completed", completedAt: now, error: undefined, retryable: undefined, summary: outcome.summary });
  const next = stages.find((stage) => stage.status === "pending" || stage.status === "retryable");
  const complete = !next;
  return {
    ...state,
    stages,
    activeStageId: next?.id,
    status: complete ? "review-ready" : "running",
    completedAt: complete ? now : undefined,
    lastError: undefined,
    summary: complete ? "Review package prepared. Proposed changes remain unresolved until a human accepts or overrides them." : `${current.label} completed. Continuing through the governed review stages.`,
  };
}

export function beginDiligenceStage(state: DiligenceAgentState, id: DiligenceStageId, now = new Date().toISOString()): DiligenceAgentState {
  const stage = state.stages.find((item) => item.id === id);
  if (!stage || !["pending", "retryable"].includes(stage.status)) return state;
  return { ...state, status: "running", activeStageId: id, stages: withStage(state, id, { status: "running", startedAt: now, error: undefined }) };
}

export function retryDiligenceStage(state: DiligenceAgentState, id: DiligenceStageId, now = new Date().toISOString()): DiligenceAgentState {
  const stage = state.stages.find((item) => item.id === id);
  if (!stage || stage.status !== "retryable") return state;
  return beginDiligenceStage({ ...state, lastError: undefined }, id, now);
}

export function applyAgentFindingDecision(
  state: DiligenceAgentState,
  findingId: string,
  decision: ReviewDecision,
  reviewerNote?: string,
): DiligenceAgentState {
  if (!["accepted", "overridden", "unresolved"].includes(decision)) return state;
  return {
    ...state,
    proposedFindings: state.proposedFindings.map((finding) => finding.id === findingId ? { ...finding, decision, reviewerNote: reviewerNote?.trim() || undefined } : finding),
    relationships: state.relationships.map((relationship) => relationship.findingId === findingId ? { ...relationship, decision } : relationship),
    conditionsPrecedent: state.conditionsPrecedent.map((item) => item.findingId === findingId ? { ...item, decision } : item),
    dealProtection: state.dealProtection.map((item) => item.findingId === findingId ? { ...item, decision } : item),
    valueAtRisk: state.valueAtRisk.map((item) => item.findingId === findingId ? { ...item, decision } : item),
  };
}

export function buildAgentReviewPackage(input: AgentProjectInput): Pick<DiligenceAgentState, "proposedFindings" | "relationships" | "lenses" | "riskAllocation" | "capitalAtRisk" | "conditionsPrecedent" | "dealProtection" | "valueAtRisk"> {
  const ids = (requested: string[]) => requested.filter((id) => input.evidenceIds.includes(id));
  const findings: AgentFinding[] = [
    { id: "agent-finding-identity", kind: "review-gap", title: "Identity boundary is ready for review", summary: `${input.projectName} is scoped to ${input.location} at ${input.capacityMW.toLocaleString()} MW. This confirms scope only; it does not establish ownership or financing.`, evidenceIds: [], sourceIds: [], sourceSupportConfidence: null, modelReportedConfidence: null, consequential: true, decision: "pending" },
    { id: "agent-finding-grid", kind: "financial-relevance", title: "Grid and energization remain consequential", summary: "The existing grid record is a decision input. Validate queue status and milestone dates before changing any modeled assumption.", evidenceIds: ids(["grid_interconnection", "backup_power_capacity"]), sourceIds: ["ercot-queue"], sourceSupportConfidence: 0.68, modelReportedConfidence: null, consequential: true, decision: "pending" },
    { id: "agent-finding-community", kind: "relationship", title: "Community terms need human disposition", summary: input.communityUnresolvedCount > 0 ? `${input.communityUnresolvedCount} community terms remain unresolved. Benchmarks can inform questions but cannot become project evidence.` : "Community terms have a reviewed state; confirm whether any precedent is truly comparable before relying on it.", evidenceIds: ids(["community_risk", "permitting_timeline"]), sourceIds: ["community-snapshot"], sourceSupportConfidence: null, modelReportedConfidence: null, consequential: true, decision: "pending" },
    { id: "agent-finding-capital", kind: "financial-relevance", title: "Capital-at-risk timing is a review topic", summary: "The agent can organize timing questions, but it cannot infer probabilities, penalties, or an IRR impact from incomplete provisions.", evidenceIds: ids(["cooling_capex", "downtime_cost"]), sourceIds: [], sourceSupportConfidence: null, modelReportedConfidence: null, consequential: true, decision: "pending" },
  ];
  const relationships: AgentRelationship[] = [
    { id: "relationship-project", label: input.projectName, relationship: "Direct", basis: "Current case identity and supplied project context.", evidenceIds: [], findingId: "agent-finding-identity", decision: "pending" },
    { id: "relationship-community", label: "Community agreement snapshot", relationship: "Related", basis: "Community context can inform review questions but is not direct project evidence.", evidenceIds: ids(["community_risk"]), findingId: "agent-finding-community", decision: "pending" },
    { id: "relationship-precedent", label: "Comparable agreement precedents", relationship: "Comparable", basis: "A precedent is only comparable after a reviewer confirms scope, jurisdiction, and term alignment.", evidenceIds: [], findingId: "agent-finding-community", decision: "pending" },
    { id: "relationship-ownership", label: "Issuer ownership or control", relationship: "Not found", basis: "No automatic ownership conclusion is permitted from facility, directory, or market-context records.", evidenceIds: [], findingId: "agent-finding-identity", decision: "pending" },
  ];
  const lenses: AgentLens[] = [
    { id: "project-investor", label: "Project Investor", question: "Can the project earn approval without hiding unresolved execution risk?", posture: "Focus on evidence sufficiency, conditions precedent, and capital-at-risk timing.", focusAreas: ["Execution gates", "Downside support", "Conditions precedent"], evidenceIds: ids(["grid_interconnection", "water_rights", "permitting_timeline"]), unresolvedCount: 2 },
    { id: "asset-manager", label: "Asset Manager", question: "What must be monitored after close and who owns the mitigation?", posture: "Focus on operating milestones, risk allocation, and deal protection.", focusAreas: ["Operating readiness", "Counterparty responsibilities", "Monitoring triggers"], evidenceIds: ids(["backup_power_capacity", "water_source_resilience", "customer_concentration"]), unresolvedCount: 2 },
    { id: "financial-advisor", label: "Financial Advisor", question: "Which supported facts could change value, and which are still outside the model?", posture: "Focus on value-at-risk framing without inventing a probability or return penalty.", focusAreas: ["Model input boundaries", "Value-at-risk ranges", "Issuer materiality"], evidenceIds: ids(["electricity_cost", "downtime_cost", "cooling_capex"]), unresolvedCount: 2 },
  ];
  const riskAllocation: RiskAllocationProposal[] = [
    { id: "allocation-grid", topic: "Grid delay / energization", allocation: "shared", basis: "Responsibility and remedies were not established by the current evidence set.", findingId: "agent-finding-grid" },
    { id: "allocation-community", topic: "Community commitments", allocation: "unresolved", basis: "Agreement terms require human classification before allocation.", findingId: "agent-finding-community" },
    { id: "allocation-operations", topic: "Operational downtime", allocation: "project", basis: "Current input frames downtime as a project-side diligence topic; no legal allocation is inferred.", findingId: "agent-finding-capital" },
  ];
  const capitalAtRisk: CapitalAtRiskProposal[] = [
    { id: "capital-development", phase: "development", exposure: "medium", basis: "Project definition and approvals are not fully evidenced.", findingId: "agent-finding-identity" },
    { id: "capital-energization", phase: "energization", exposure: "high", basis: "Grid milestones are consequential but not a probability or loss estimate.", findingId: "agent-finding-grid" },
    { id: "capital-operations", phase: "operations", exposure: "unresolved", basis: "Operating safeguards and remedies remain review topics.", findingId: "agent-finding-capital" },
  ];
  const conditionsPrecedent: ReviewTopicProposal[] = [
    { id: "condition-grid", label: "Validate interconnection milestone and remedy package", basis: "Required before treating energization as investable.", findingId: "agent-finding-grid", decision: "pending" },
    { id: "condition-community", label: "Resolve material community agreement terms", basis: "Do not convert benchmark language into project evidence.", findingId: "agent-finding-community", decision: "pending" },
  ];
  const dealProtection: ReviewTopicProposal[] = [
    { id: "protection-delay", label: "Confirm delay allocation, notice, and termination rights", basis: "The current record does not support a legal conclusion or penalty.", findingId: "agent-finding-grid", decision: "pending" },
    { id: "protection-diligence", label: "Preserve evidence access and audit rights", basis: "Review topic for counsel and transaction teams; not drafted legal language.", findingId: "agent-finding-capital", decision: "pending" },
  ];
  const valueAtRisk: ValueAtRiskRangeProposal[] = [
    { id: "var-grid", label: "Grid delay value-at-risk", low: null, high: null, unit: "unresolved", basis: "No supported probability, penalty, or cash-flow adjustment is available.", findingId: "agent-finding-grid", decision: "pending" },
    { id: "var-community", label: "Community commitment value-at-risk", low: null, high: null, unit: "unresolved", basis: "Incomplete terms cannot create an invented IRR penalty.", findingId: "agent-finding-community", decision: "pending" },
  ];
  return { proposedFindings: findings, relationships, lenses, riskAllocation, capitalAtRisk, conditionsPrecedent, dealProtection, valueAtRisk };
}

export function hydrateReviewPackage(state: DiligenceAgentState, input: AgentProjectInput): DiligenceAgentState {
  return { ...state, ...buildAgentReviewPackage(input) };
}

export function isAgentStageTerminal(stage: AgentStage): boolean {
  return TERMINAL_STATUSES.includes(stage.status);
}