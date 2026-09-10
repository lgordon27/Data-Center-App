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
  { id: "review-preparation", label: "Review preparation", description: "Prepare bounded proposals for analyst review." },
] as const;

export type DiligenceStageId = typeof DILIGENCE_STAGE_DEFINITIONS[number]["id"];
export type AgentStageStatus = "pending" | "running" | "completed" | "failed" | "retryable";
export type DiligenceRunStatus = "idle" | "running" | "partial-failure" | "review-ready" | "failed";
export type ReviewDecision = "pending" | "accepted" | "overridden" | "rejected" | "unresolved" | "reversed";
export type AgentRelationshipKind = "Direct" | "Related" | "Comparable" | "Not found";
export type AgentLensId = "project-investor" | "asset-manager" | "financial-advisor";
export type AgentFindingKind = "classification" | "relationship" | "financial-relevance" | "review-gap";
export type AgentProposalAction = "reclassify-evidence" | "update-assumption" | "review-only";
export type AgentReadiness = "not-ready" | "conditionally-ready" | "ready-for-human-review";

export type AgentSupportingSource = {
  sourceId: string;
  title: string;
  url?: string;
  excerpt: string;
  classification: "validated-source" | "source-summary" | "unverified-lead";
  claimPassage?: string;
  exactProject?: boolean;
};

export type AgentAuditEvent = {
  id: string;
  proposalId: string;
  action: AgentProposalAction;
  outcome: Exclude<ReviewDecision, "pending">;
  actor: "analyst";
  recordedAt: string;
  affectedEvidenceId?: string;
  beforeValue?: string | number;
  proposedValue?: string | number;
  finalValue?: string | number;
  beforeClassification?: Classification;
  proposedClassification?: Classification;
  finalClassification?: Classification;
  sourceIds: string[];
  note?: string;
  projectKey?: string;
  evidenceSnapshotKey?: string;
  afterEvidenceSnapshotKey?: string;
  noOpAcknowledgment?: boolean;
  proposalCreatedEvidenceFingerprint?: string;
  proposalCreatedProjectFingerprint?: string;
  appliedAgainstEvidenceFingerprint?: string;
  appliedAgainstProjectFingerprint?: string;
  staleApplied?: boolean;
  staleReason?: string;
};

export type AppliedAgentChange = AgentAuditEvent & {
  reversedAt?: string;
};

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
  action: AgentProposalAction;
  affectedEvidenceId?: string;
  currentValue?: string | number;
  proposedValue?: string | number;
  currentClassification?: Classification;
  evidenceClassification?: Classification;
  supportingSources: AgentSupportingSource[];
  financialPreview: string;
  decisionPosture: string;
  reasoning: string;
  originalProposal?: {
    proposedValue?: string | number;
    proposedClassification?: Classification;
    reasoning: string;
    sourceIds: string[];
  };
  humanFinalClassification?: Classification;
  rawValue?: string | number;
  rawUnit?: string;
  normalizedValue?: string | number;
  normalizedUnit?: string;
  exactClaim?: string;
  exactPassage?: string;
  sourceIdentity?: string;
  sourceUrl?: string;
  eligibility?: "eligible" | "ineligible" | "unresolved";
  exactProjectRelevance?: "exact-project" | "related-context" | "unresolved";
  confidence?: number | null;
  affectedModelLine?: string;
  estimatedMetricEffect?: string;
  estimatedRecommendationEffect?: string;
  proposalCreatedEvidenceFingerprint?: string;
  proposalCreatedProjectFingerprint?: string;
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
  version: 2;
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
  readiness: AgentReadiness;
  readinessReason: string;
  retrievedSourceCount: number;
  validatedSourceCount: number;
  auditEvents: AgentAuditEvent[];
  appliedChanges: AppliedAgentChange[];
  projectKey: string | null;
  evidenceSnapshotKey: string | null;
};

export type AgentProjectInput = {
  projectName: string;
  location: string;
  capacityMW: number;
  evidenceIds: string[];
  communityUnresolvedCount: number;
  evidence?: Array<{
    id: string;
    label: string;
    value: string | number;
    classification: Classification;
    citation: string;
    sourceUrl?: string;
    sources?: AgentSupportingSource[];
    sourceSupportConfidence?: number;
    sourceRelevance?: "exact-project" | "related-context" | "unresolved";
    eligibleForModel?: boolean;
    sourceValidation?: {
      state?: string;
      rejectionCodes?: string[];
      claimMappings?: Array<{
        sourceId?: string | null;
        exactQuotation?: string | null;
        claimText?: string;
        supportStatus?: string;
      }>;
    };
    rawValue?: string | number;
    rawUnit?: string;
    normalizedValue?: string | number;
    normalizedUnit?: string;
    currentValue?: string | number;
    currentClassification?: Classification;
    affectedModelLine?: string;
    estimatedMetricEffect?: string;
    estimatedRecommendationEffect?: string;
  }>;
  retrievedSourceCount?: number;
  validatedSourceCount?: number;
  materialGapCount?: number;
};

export type AgentStageOutcome = {
  summary?: string;
  error?: string;
  retryable?: boolean;
};

const TERMINAL_STATUSES: AgentStageStatus[] = ["completed", "failed"];

export function createInitialDiligenceAgent(): DiligenceAgentState {
  return {
    version: 2,
    runId: null,
    status: "idle",
    stages: DILIGENCE_STAGE_DEFINITIONS.map((stage) => ({ ...stage, status: "pending" })),
    summary: "No assistant run yet. Prepare proposals from the active evidence set before analyst review.",
    proposedFindings: [],
    relationships: [],
    lenses: [],
    riskAllocation: [],
    capitalAtRisk: [],
    conditionsPrecedent: [],
    dealProtection: [],
    valueAtRisk: [],
    readiness: "not-ready",
    readinessReason: "Run the agent against the active evidence set before reviewing readiness.",
    retrievedSourceCount: 0,
    validatedSourceCount: 0,
    auditEvents: [],
    appliedChanges: [],
    projectKey: null,
    evidenceSnapshotKey: null,
  };
}

export function getAgentProjectKey(input: Pick<AgentProjectInput, "projectName" | "location" | "capacityMW">): string {
  return `${input.projectName.trim().toLowerCase()}|${input.location.trim().toLowerCase()}|${input.capacityMW}`;
}

export function getAgentEvidenceSnapshotKey(input: Pick<AgentProjectInput, "evidence">): string {
  return JSON.stringify((input.evidence ?? []).map((item) => [
    item.id,
    item.value,
    item.classification,
    item.citation,
    item.sourceUrl ?? "",
    (item.sources ?? []).map((source) => [source.sourceId, source.url ?? "", source.title, source.excerpt, source.classification]).sort(),
  ]).sort(([a], [b]) => String(a).localeCompare(String(b))));
}

export function countValidatedAgentSources(input: Pick<AgentProjectInput, "evidence">): number {
  return new Set((input.evidence ?? []).flatMap((item) => [
    ...(item.eligibleForModel === true || item.sourceValidation?.state === "financially-eligible"
      ? [item.sourceUrl, ...(item.sources ?? []).map((source) => source.url ?? source.sourceId)]
      : []),
  ].filter(Boolean))).size;
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
    proposedFindings: previous.proposedFindings,
    auditEvents: previous.auditEvents,
    appliedChanges: previous.appliedChanges,
    projectKey: previous.projectKey,
    evidenceSnapshotKey: previous.evidenceSnapshotKey,
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
    summary: complete ? "Review package prepared. Proposed changes remain separate until an analyst accepts or overrides them." : `${current.label} completed. Continuing through the recorded review operations.`,
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
  finalClassification?: Classification,
  now = new Date().toISOString(),
): DiligenceAgentState {
  if (!["accepted", "overridden", "rejected", "unresolved"].includes(decision)) return state;
  const finding = state.proposedFindings.find((item) => item.id === findingId);
  if (!finding) return state;
  if (finding.decision !== "pending") return state;
  if (decision === "overridden" && !finalClassification) return state;
  const finalValue = decision === "accepted" ? finding.proposedValue : undefined;
  const appliedClassification = decision === "accepted" ? finding.proposedClassification : finalClassification;
  const staleApplied = isAgentRunStale(finding, state);
  const noOpAcknowledgment = decision === "accepted" &&
    finding.proposedValue === finding.currentValue &&
    finding.proposedClassification === finding.currentClassification;
  const audit: AgentAuditEvent = {
    id: `audit-${findingId}-${now.replace(/[^0-9]/g, "")}-${state.auditEvents.length}`,
    proposalId: finding.id,
    action: finding.action,
    outcome: decision as Exclude<ReviewDecision, "pending">,
    actor: "analyst",
    recordedAt: now,
    affectedEvidenceId: finding.affectedEvidenceId,
    beforeValue: finding.currentValue,
    proposedValue: finding.proposedValue,
    finalValue,
    beforeClassification: finding.currentClassification,
    proposedClassification: finding.proposedClassification,
    finalClassification: appliedClassification,
    sourceIds: finding.supportingSources.map((source) => source.sourceId),
    note: reviewerNote?.trim() || undefined,
    projectKey: state.projectKey ?? undefined,
    evidenceSnapshotKey: state.evidenceSnapshotKey ?? undefined,
    noOpAcknowledgment,
    proposalCreatedEvidenceFingerprint: finding.proposalCreatedEvidenceFingerprint,
    proposalCreatedProjectFingerprint: finding.proposalCreatedProjectFingerprint,
    appliedAgainstEvidenceFingerprint: state.evidenceSnapshotKey ?? undefined,
    appliedAgainstProjectFingerprint: state.projectKey ?? undefined,
    staleApplied,
    staleReason: staleApplied ? "Evidence or project identity changed after proposal creation." : undefined,
  };
  return {
    ...state,
    proposedFindings: state.proposedFindings.map((item) => item.id === findingId ? {
      ...item,
      decision,
      reviewerNote: reviewerNote?.trim() || undefined,
      humanFinalClassification: appliedClassification,
    } : item),
    relationships: state.relationships.map((relationship) => relationship.findingId === findingId ? { ...relationship, decision } : relationship),
    conditionsPrecedent: state.conditionsPrecedent.map((item) => item.findingId === findingId ? { ...item, decision } : item),
    dealProtection: state.dealProtection.map((item) => item.findingId === findingId ? { ...item, decision } : item),
    valueAtRisk: state.valueAtRisk.map((item) => item.findingId === findingId ? { ...item, decision } : item),
    auditEvents: [...state.auditEvents, audit],
    appliedChanges: (decision === "accepted" || decision === "overridden") && !noOpAcknowledgment && finding.action !== "review-only" && Boolean(finding.affectedEvidenceId)
      ? [...state.appliedChanges, audit]
      : state.appliedChanges,
  };
}

export function reverseAgentChange(state: DiligenceAgentState, auditId: string, now = new Date().toISOString()): DiligenceAgentState {
  const applied = state.appliedChanges.find((change) => change.id === auditId && !change.reversedAt);
  if (!applied) return state;
  const reversal: AgentAuditEvent = {
    ...applied,
    id: `reversal-${auditId}`,
    outcome: "reversed",
    recordedAt: now,
    finalValue: applied.beforeValue,
    finalClassification: applied.beforeClassification,
    note: `Reversed applied change ${auditId}.`,
  };
  return {
    ...state,
    proposedFindings: state.proposedFindings.map((finding) => finding.id === applied.proposalId ? { ...finding, decision: "reversed" as const } : finding),
    appliedChanges: state.appliedChanges.map((change) => change.id === auditId ? { ...change, reversedAt: now } : change),
    auditEvents: [...state.auditEvents, reversal],
  };
}

/** Resolves the strongest citation attached to an evidence record without inventing a passage. */
export function resolveAgentEvidenceSource(evidence: NonNullable<AgentProjectInput["evidence"]>[number]): {
  sourceId?: string;
  sourceUrl?: string;
  claim?: string;
  passage?: string;
} {
  const source = evidence.sources?.find((item) => item.classification === "validated-source") ?? evidence.sources?.[0];
  const mapping = evidence.sourceValidation?.claimMappings?.find((item) => !item.sourceId || item.sourceId === source?.sourceId);
  return {
    sourceId: source?.sourceId,
    sourceUrl: source?.url ?? evidence.sourceUrl,
    claim: mapping?.claimText,
    passage: mapping?.exactQuotation ?? source?.claimPassage ?? source?.excerpt ?? evidence.citation,
  };
}

export function isAgentEvidenceEligible(evidence: NonNullable<AgentProjectInput["evidence"]>[number]): boolean {
  const supportedMapping = evidence.sourceValidation?.claimMappings?.some((mapping) => (
    mapping.supportStatus === "supported" &&
    Boolean(mapping.exactQuotation?.trim()) &&
    Boolean(mapping.sourceId)
  ));
  return (evidence.eligibleForModel === true || evidence.sourceValidation?.state === "financially-eligible") &&
    (evidence.sourceRelevance === "exact-project" || Boolean(evidence.sources?.some((source) => source.exactProject === true))) &&
    !(evidence.sourceValidation?.rejectionCodes?.length) &&
    Boolean(evidence.sources?.some((source) => source.classification === "validated-source")) &&
    Boolean(supportedMapping);
}

export function isAgentRunStale(
  proposal: Pick<AgentFinding, "proposalCreatedEvidenceFingerprint" | "proposalCreatedProjectFingerprint">,
  current: Pick<DiligenceAgentState, "evidenceSnapshotKey" | "projectKey">,
): boolean {
  return Boolean(
    (proposal.proposalCreatedEvidenceFingerprint && proposal.proposalCreatedEvidenceFingerprint !== current.evidenceSnapshotKey) ||
    (proposal.proposalCreatedProjectFingerprint && proposal.proposalCreatedProjectFingerprint !== current.projectKey),
  );
}

export const detectAgentRunStale = isAgentRunStale;

export function selectBulkAgentCandidates(findings: AgentFinding[]): AgentFinding[] {
  const candidates = findings.filter((finding) => finding.decision === "pending" && finding.consequential && finding.action !== "review-only" && finding.affectedEvidenceId);
  const ids = new Set<string>();
  return candidates.filter((finding) => {
    if (!finding.affectedEvidenceId || ids.has(finding.affectedEvidenceId)) return false;
    ids.add(finding.affectedEvidenceId);
    return true;
  });
}

export const selectBulkAgentProposalCandidates = selectBulkAgentCandidates;

/** Rejection is safe for review-only proposals too, provided one evidence record is not duplicated. */
export function selectBulkAgentRejections(findings: AgentFinding[]): AgentFinding[] {
  const ids = new Set<string>();
  return findings.filter((finding) => {
    if (finding.decision !== "pending") return false;
    if (!finding.affectedEvidenceId) return true;
    if (ids.has(finding.affectedEvidenceId)) return false;
    ids.add(finding.affectedEvidenceId);
    return true;
  });
}

export function buildAgentReviewPackage(input: AgentProjectInput): Pick<DiligenceAgentState, "proposedFindings" | "relationships" | "lenses" | "riskAllocation" | "capitalAtRisk" | "conditionsPrecedent" | "dealProtection" | "valueAtRisk"> {
  const ids = (requested: string[]) => requested.filter((id) => input.evidenceIds.includes(id));
  const evidenceById = new Map((input.evidence ?? []).map((item) => [item.id, item]));
  const grid = evidenceById.get("grid_interconnection");
  const gridSources = grid?.sources ?? [];
  const supportedGrid = Boolean(grid) && (grid?.sourceRelevance === "exact-project" || grid?.sources?.some((source) => source.exactProject === true)) && (isAgentEvidenceEligible(grid) ||
    ((input.validatedSourceCount ?? 0) > 0 && gridSources.some((source) => source.classification === "validated-source") &&
      !(grid?.sourceValidation?.rejectionCodes?.length)));
  const projectKey = getAgentProjectKey(input);
  const evidenceSnapshotKey = getAgentEvidenceSnapshotKey(input);
  const makeEvidenceFinding = (evidence: NonNullable<AgentProjectInput["evidence"]>[number]): AgentFinding => {
    const source = resolveAgentEvidenceSource(evidence);
    const eligible = isAgentEvidenceEligible(evidence);
    const exact = evidence.sourceRelevance === "exact-project" || Boolean(evidence.sources?.some((source) => source.exactProject === true));
    const consequential = eligible && exact;
    const currentValue = evidence.currentValue ?? evidence.value;
    const currentClassification = evidence.currentClassification ?? evidence.classification;
    const proposedValue = evidence.normalizedValue ?? evidence.value;
    const proposedClassification = consequential ? evidence.classification : undefined;
    const classificationChanges = consequential && currentClassification !== proposedClassification;
    const valueChanges = consequential && currentValue !== proposedValue;
    const action: AgentProposalAction = classificationChanges
      ? "reclassify-evidence"
      : valueChanges ? "update-assumption" : "review-only";
    return {
      id: `agent-finding-${evidence.id}`,
      kind: action === "reclassify-evidence" ? "classification" : "financial-relevance",
      title: `${evidence.label} requires analyst review`,
      summary: consequential
        ? `${evidence.label} is supported by an exact-project source and is proposed for analyst confirmation; it is not verified until accepted.`
        : `${evidence.label} is review-only because the record is ${evidence.sourceRelevance === "related-context" ? "context-only" : "not sufficiently source-backed"}; it is not verified.`,
      evidenceIds: [evidence.id],
      proposedClassification,
      sourceIds: evidence.sources?.map((item) => item.sourceId) ?? [],
      sourceSupportConfidence: typeof evidence.sourceSupportConfidence === "number" ? evidence.sourceSupportConfidence / 100 : null,
      modelReportedConfidence: null,
      consequential: consequential && (classificationChanges || valueChanges),
      decision: "pending",
      action,
      affectedEvidenceId: evidence.id,
      currentValue,
      proposedValue: consequential ? proposedValue : undefined,
      currentClassification,
      evidenceClassification: evidence.classification,
      supportingSources: evidence.sources ?? [],
      financialPreview: consequential
        ? (evidence.estimatedMetricEffect ?? "Acceptance may update the affected model input; no formula is changed.")
        : "No metric changes: unsupported or contextual evidence remains outside the model.",
      decisionPosture: consequential
        ? "A source-backed proposal remains an analyst decision and does not establish broader issuer or portfolio materiality."
        : "Context-only, related, or unmapped records remain unresolved and cannot be described as verified.",
      reasoning: consequential ? "Exact-project source support permits a bounded proposal." : "The evidence boundary fails closed when exact-project support or mapping is absent.",
      originalProposal: consequential ? { proposedValue: evidence.normalizedValue ?? evidence.value, proposedClassification, reasoning: "Deterministic proposal from one evidence record.", sourceIds: source.sourceId ? [source.sourceId] : [] } : undefined,
      rawValue: evidence.rawValue ?? evidence.value,
      rawUnit: evidence.rawUnit ?? evidence.normalizedUnit,
      normalizedValue: evidence.normalizedValue,
      normalizedUnit: evidence.normalizedUnit,
      exactClaim: source.claim,
      exactPassage: source.passage,
      sourceIdentity: source.sourceId,
      sourceUrl: source.sourceUrl,
      eligibility: eligible ? "eligible" : evidence.sourceRelevance ? "ineligible" : "unresolved",
      exactProjectRelevance: exact ? "exact-project" : evidence.sourceRelevance ?? "unresolved",
      confidence: typeof evidence.sourceSupportConfidence === "number" ? evidence.sourceSupportConfidence / 100 : null,
      affectedModelLine: evidence.affectedModelLine,
      estimatedMetricEffect: evidence.estimatedMetricEffect,
      estimatedRecommendationEffect: evidence.estimatedRecommendationEffect,
      proposalCreatedEvidenceFingerprint: evidenceSnapshotKey,
      proposalCreatedProjectFingerprint: projectKey,
    };
  };
  const generatedFindings = (input.evidence ?? [])
    .filter((evidence) => evidence.id !== "grid_interconnection")
    .map(makeEvidenceFinding);
  const gridFinding: AgentFinding = supportedGrid && grid
    ? {
      id: "agent-finding-grid",
      kind: "classification",
      title: "Grid evidence classification requires analyst review",
      summary: `${grid.label} is currently classified as ${grid.classification}. The assistant proposes a classification change because a source packet is attached; the analyst must confirm whether the source supports the exact project claim.`,
      evidenceIds: ["grid_interconnection"],
      proposedClassification: grid.sourceRelevance === "exact-project" ? "Verified Evidence" : "Management Assertion",
      sourceIds: gridSources.map((source) => source.sourceId).concat(grid.sourceUrl ? ["grid-interconnection-source"] : []),
      sourceSupportConfidence: typeof grid.sourceSupportConfidence === "number" ? grid.sourceSupportConfidence / 100 : supportedGrid ? 0.68 : null,
      modelReportedConfidence: null,
      consequential: true,
      decision: "pending",
      action: "reclassify-evidence",
      affectedEvidenceId: grid.id,
      currentValue: grid.value,
      proposedValue: grid.value,
      currentClassification: grid.classification,
      evidenceClassification: grid.classification,
      supportingSources: gridSources.length ? gridSources : [{
        sourceId: "grid-interconnection-source",
        title: "Attached grid-interconnection citation",
        url: grid.sourceUrl,
        excerpt: grid.citation,
        classification: "source-summary",
      }],
      financialPreview: "Acceptance recalculates the project stress return and confidence from the disclosed classification; it does not change the underlying value.",
      decisionPosture: "A supported classification can reduce an evidence gap, but it does not establish issuer, fund, or client-portfolio materiality.",
      reasoning: "The proposal is limited to the attached evidence record and preserves the source excerpt separately from the human decision.",
      originalProposal: {
        proposedValue: grid.value,
        proposedClassification: grid.sourceRelevance === "exact-project" ? "Verified Evidence" : "Management Assertion",
        reasoning: "Source-linked classification proposal; exact-project support controls whether Verified Evidence is permissible.",
        sourceIds: gridSources.map((source) => source.sourceId),
      },
       rawValue: grid.rawValue ?? grid.value,
       rawUnit: grid.rawUnit ?? grid.normalizedUnit,
       normalizedValue: grid.normalizedValue,
       normalizedUnit: grid.normalizedUnit,
       exactClaim: resolveAgentEvidenceSource(grid).claim,
       exactPassage: resolveAgentEvidenceSource(grid).passage,
       sourceIdentity: resolveAgentEvidenceSource(grid).sourceId,
       sourceUrl: resolveAgentEvidenceSource(grid).sourceUrl,
       eligibility: supportedGrid ? "eligible" : "ineligible",
       exactProjectRelevance: (grid.sourceRelevance === "exact-project" || gridSources.some((source) => source.exactProject === true)) ? "exact-project" : grid.sourceRelevance ?? "unresolved",
       confidence: typeof grid.sourceSupportConfidence === "number" ? grid.sourceSupportConfidence / 100 : null,
       affectedModelLine: grid.affectedModelLine,
       estimatedMetricEffect: grid.estimatedMetricEffect,
       estimatedRecommendationEffect: grid.estimatedRecommendationEffect,
       proposalCreatedEvidenceFingerprint: evidenceSnapshotKey,
       proposalCreatedProjectFingerprint: projectKey,
    }
    : {
      id: "agent-finding-grid",
      kind: grid && gridSources.length ? "classification" : "financial-relevance",
      title: grid && gridSources.length ? "Separate the project cancellation from ERCOT market context" : "Grid and energization remain consequential",
      summary: grid && gridSources.length ? "The retained record combines an exact-project cancellation claim with broader grid-process context. The assistant proposes Management Assertion so related context is not presented as facility-level verification." : "No validated source packet supports an evidence mutation. Keep the current record unchanged and resolve the grid gate through a source-backed review.",
      evidenceIds: ids(["grid_interconnection", "backup_power_capacity"]),
      sourceIds: gridSources.map((source) => source.sourceId),
      sourceSupportConfidence: grid?.sourceSupportConfidence ?? null,
      modelReportedConfidence: null,
      consequential: Boolean(grid && gridSources.length),
      decision: "pending",
      action: grid && gridSources.length ? "reclassify-evidence" : "review-only",
      proposedClassification: grid && gridSources.length ? "Management Assertion" : undefined,
      affectedEvidenceId: grid && gridSources.length ? grid.id : undefined,
      financialPreview: grid?.estimatedMetricEffect ?? "No metric changes: this is a review topic without an accepted state transition.",
      estimatedMetricEffect: grid?.estimatedMetricEffect,
      estimatedRecommendationEffect: grid?.estimatedRecommendationEffect,
      affectedModelLine: grid?.affectedModelLine,
      decisionPosture: "Project evidence remains separate from issuer, security, fund, and portfolio conclusions.",
      reasoning: grid ? "Mixed exact-project and market-context support should not be labeled fully verified." : "The assistant fails closed when it cannot attach a validated source.",
      supportingSources: gridSources,
      ...(grid ? {
        currentValue: grid.currentValue ?? grid.value,
        proposedValue: grid.value,
        currentClassification: grid.currentClassification ?? grid.classification,
        evidenceClassification: grid.classification,
        rawValue: grid.rawValue ?? grid.value,
        rawUnit: grid.rawUnit,
        normalizedValue: grid.normalizedValue ?? grid.value,
        normalizedUnit: grid.normalizedUnit,
        exactClaim: resolveAgentEvidenceSource(grid).claim,
        exactPassage: resolveAgentEvidenceSource(grid).passage,
        sourceIdentity: resolveAgentEvidenceSource(grid).sourceId,
        sourceUrl: resolveAgentEvidenceSource(grid).sourceUrl,
        eligibility: "ineligible",
        exactProjectRelevance: grid.sourceRelevance ?? "unresolved",
        proposalCreatedEvidenceFingerprint: evidenceSnapshotKey,
        proposalCreatedProjectFingerprint: projectKey,
        originalProposal: {
          proposedValue: grid.value,
          proposedClassification: "Management Assertion",
          reasoning: "Downgrade the mixed record so market context is not presented as facility verification.",
          sourceIds: gridSources.map((source) => source.sourceId),
        },
      } : {}),
    };
  const findings: AgentFinding[] = [
    { id: "agent-finding-identity", kind: "review-gap", title: "Identity boundary is ready for review", summary: `${input.projectName} is scoped to ${input.location} at ${input.capacityMW.toLocaleString()} MW. This confirms scope only; it does not establish ownership or financing.`, evidenceIds: [], sourceIds: [], sourceSupportConfidence: null, modelReportedConfidence: null, consequential: false, decision: "pending", action: "review-only", supportingSources: [], financialPreview: "No metric changes.", decisionPosture: "Project identity is separate from issuer, fund, and client-portfolio conclusions.", reasoning: "Identity is a scope boundary, not a modeled evidence claim." },
     gridFinding,
     ...generatedFindings,
    { id: "agent-finding-community", kind: "relationship", title: "Community terms need human disposition", summary: input.communityUnresolvedCount > 0 ? `${input.communityUnresolvedCount} community terms remain unresolved. Benchmarks can inform questions but cannot become project evidence.` : "Community terms have a reviewed state; confirm whether any precedent is truly comparable before relying on it.", evidenceIds: ids(["community_risk", "permitting_timeline"]), sourceIds: ["community-snapshot"], sourceSupportConfidence: null, modelReportedConfidence: null, consequential: false, decision: "pending", action: "review-only", supportingSources: [], financialPreview: "No automatic return adjustment is available for an unquantified community term.", decisionPosture: "Community readiness remains project-level stewardship context, not a fund-level rating.", reasoning: "Benchmarks are kept separate from project evidence.", },
    { id: "agent-finding-capital", kind: "financial-relevance", title: "Capital-at-risk timing is a review topic", summary: "The agent can organize timing questions, but it cannot infer probabilities, penalties, or an IRR impact from incomplete provisions.", evidenceIds: ids(["cooling_capex", "downtime_cost"]), sourceIds: [], sourceSupportConfidence: null, modelReportedConfidence: null, consequential: false, decision: "pending", action: "review-only", supportingSources: [], financialPreview: "No probability, penalty, or IRR change is proposed.", decisionPosture: "Capital-at-risk timing stays a project underwriting question.", reasoning: "Incomplete provisions cannot create invented economics.", },
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
  const pkg = buildAgentReviewPackage(input);
  const validatedSourceCount = Math.max(input.validatedSourceCount ?? 0, countValidatedAgentSources(input));
  const activeApplied = new Set(state.appliedChanges.filter((change) => !change.reversedAt).map((change) => change.proposalId));
  const findings = pkg.proposedFindings.map((finding) => {
    const prior = state.proposedFindings.find((item) => item.id === finding.id);
    return prior && activeApplied.has(finding.id)
      ? { ...finding, decision: prior.decision, reviewerNote: prior.reviewerNote, humanFinalClassification: prior.humanFinalClassification }
      : finding;
  });
  const readiness: AgentReadiness = validatedSourceCount === 0 && input.projectName !== "Stargate Abilene"
    ? "not-ready"
    : (input.materialGapCount ?? 0) > 0 ? "conditionally-ready" : "ready-for-human-review";
  const readinessReason = readiness === "not-ready"
    ? "Research incomplete: no validated sources are available, so unsupported generated content cannot become evidence."
    : readiness === "conditionally-ready"
      ? `${input.materialGapCount} material gap${input.materialGapCount === 1 ? "" : "s"} remain unresolved; stage completion is not review readiness.`
      : "Validated evidence is sufficient to present proposals for analyst review.";
  return {
    ...state,
    ...pkg,
    proposedFindings: findings,
    readiness,
    readinessReason,
    retrievedSourceCount: input.retrievedSourceCount ?? 0,
    validatedSourceCount,
    projectKey: getAgentProjectKey(input),
    evidenceSnapshotKey: getAgentEvidenceSnapshotKey(input),
  };
}

export function isAgentStageTerminal(stage: AgentStage): boolean {
  return TERMINAL_STATUSES.includes(stage.status);
}