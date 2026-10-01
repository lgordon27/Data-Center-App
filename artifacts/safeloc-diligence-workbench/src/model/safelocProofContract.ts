import type { Classification } from "./cashFlowEngine.js";

export const SAFELOC_PROOF_SCHEMA_VERSION = 1;
export const SAFELOC_PROOF_POLICY_VERSION = 1;

export const SAFELOC_PROOF_DIMENSIONS = [
  "project-identity",
  "power-grid-interconnection",
  "electricity-tariff",
  "water-cooling",
  "land-site-civil",
  "permitting-entitlement",
  "community-local-government",
  "environmental-air-generation",
  "climate-operational-hazard",
  "construction-phasing",
  "financing-capital",
  "tenant-counterparty",
  "incentives-taxes",
] as const;

export type SafeLocProofDimension = (typeof SAFELOC_PROOF_DIMENSIONS)[number];

export type ProjectScope =
  | { kind: "campus"; key: string; label?: string }
  | { kind: "phase"; key: string; label?: string }
  | { kind: "facility"; key: string; label?: string }
  | { kind: "unknown"; key: "unknown"; label?: string };

export type ProjectIdentity = {
  /** Deterministic, scope-qualified identifier. Never use a campus ID for a facility. */
  projectId: string;
  /** Stable dossier/provider slug or other caller-owned project reference. */
  projectReference: string;
  name: string;
  scope: ProjectScope;
};

export type ProjectIdentityInput = {
  projectReference: string;
  name: string;
  scope: ProjectScope;
};

function normalizedIdentityPart(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function requireText(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
  return value.trim();
}

export function createProjectIdentity(input: ProjectIdentityInput): ProjectIdentity {
  const projectReference = requireText(input.projectReference, "Project reference");
  const name = requireText(input.name, "Project name");
  const scopeKey = input.scope.kind === "unknown"
    ? "unknown"
    : requireText(input.scope.key, `${input.scope.kind} scope key`);
  const scope: ProjectScope = {
    ...input.scope,
    key: input.scope.kind === "unknown" ? "unknown" : normalizedIdentityPart(scopeKey),
  } as ProjectScope;
  const stableKey = JSON.stringify([
    normalizedIdentityPart(projectReference),
    scope.kind,
    normalizedIdentityPart(scopeKey),
  ]);
  return {
    projectId: `safeloc-project:v1:${encodeURIComponent(stableKey)}`,
    projectReference,
    name,
    scope,
  };
}

export function assertCanonicalProjectIdentity(identity: ProjectIdentity): void {
  const canonical = createProjectIdentity({
    projectReference: identity.projectReference,
    name: identity.name,
    scope: identity.scope,
  });
  if (
    canonical.projectId !== identity.projectId ||
    canonical.scope.kind !== identity.scope.kind ||
    canonical.scope.key !== identity.scope.key
  ) {
    throw new Error("Project identity is not the canonical scope-qualified identity.");
  }
}

export function assertSameProjectScope(
  expected: ProjectIdentity,
  actual: ProjectIdentity,
  context = "Record",
): void {
  assertCanonicalProjectIdentity(expected);
  assertCanonicalProjectIdentity(actual);
  if (
    expected.projectId !== actual.projectId ||
    expected.scope.kind !== actual.scope.kind ||
    expected.scope.key !== actual.scope.key
  ) {
    throw new Error(`${context} project identity or scope does not match its ledger event.`);
  }
}

export const SAFELOC_SEARCH_STATES = [
  "complete",
  "partial",
  "not-run",
  "blocked",
  "failed",
] as const;
export type SafeLocSearchState = (typeof SAFELOC_SEARCH_STATES)[number];

/** Search outcome is separate from the evidence-quality classification. */
export type EvidenceResolution =
  | "not-assessed"
  | "supported"
  | "searched-not-found"
  | "conflicting";

export type SearchAssessment = {
  searchId: string;
  project: ProjectIdentity;
  dimension: SafeLocProofDimension;
  state: SafeLocSearchState;
  resolution: EvidenceResolution;
  reason: string | null;
  queryIds: string[];
  researchRunId: string | null;
  observedAt: string;
};

export function validateSearchAssessment(search: SearchAssessment): void {
  if (search.resolution === "searched-not-found" && search.state !== "complete") {
    throw new Error("Searched-not-found requires a complete search.");
  }
  if (search.state === "complete" && search.resolution === "searched-not-found" && !search.reason?.trim()) {
    throw new Error("A searched-not-found result requires a recorded search reason.");
  }
}

export type EvidenceValueStatus = "actual" | "estimate" | "forecast" | "unknown";

export type EvidenceObservation = {
  evidenceId: string;
  project: ProjectIdentity;
  dimension: SafeLocProofDimension;
  claim: string;
  value: string | number | null;
  unit: string | null;
  valueStatus: EvidenceValueStatus;
  developmentQualifier: string | null;
  publicationDate: string | null;
  asOfDate: string | null;
  retainedPassageId: string;
  retainedPassage: string;
  sourceIds: string[];
  /** Reuses the governed cash-flow evidence labels; it is not project-state maturity. */
  sourceQualityClassification: Classification;
  eligibility: {
    eligible: boolean;
    reason: string;
  };
  conflictsWithEvidenceIds: string[];
  supersedesEvidenceIds: string[];
  researchRunId: string | null;
  observedAt: string;
};

export type ProjectStateValue =
  | { status: "unknown"; value: null }
  | { status: "not-applicable"; value: null; reason: string }
  | { status: "known"; value: string };

export type ProjectStateRecord = {
  project: ProjectIdentity;
  stateKey: string;
  state: ProjectStateValue;
  supportingEvidenceIds: string[];
  stateVersion: string;
  asOfDate: string | null;
};

export type TransmissionQuantificationClass = "qualitative" | "directional" | "quantified";
export type TransmissionSupportLevel = "unsupported" | "limited" | "supported" | "strong";
export type TransmissionProposalStatus = "proposed" | "accepted" | "rejected" | "withdrawn" | "superseded";

export type TransmissionProposal = {
  proposalId: string;
  project: ProjectIdentity;
  sourceEvidenceIds: string[];
  affectedVariable: string;
  currentValue: { value: string | number | null; unit: string | null };
  proposedValue: { value: string | number | null; unit: string | null };
  mechanism: string;
  quantificationClass: TransmissionQuantificationClass;
  /** Descriptive only; consumers must not execute this as a financial mapping. */
  formula: string | null;
  supportLevel: TransmissionSupportLevel;
  status: TransmissionProposalStatus;
  mappingPolicyVersion: number;
};

const FORBIDDEN_TRANSMISSION_FIELDS = new Set([
  "probability",
  "llmProbability",
  "financialMapping",
  "modelEffect",
  "cashFlowEffect",
]);

export function validateTransmissionProposal(proposal: TransmissionProposal): void {
  const forbidden = Object.keys(proposal).find((key) => FORBIDDEN_TRANSMISSION_FIELDS.has(key));
  if (forbidden) {
    throw new Error(`Transmission proposal cannot define ${forbidden}.`);
  }
  if (!proposal.affectedVariable.trim() || !proposal.mechanism.trim()) {
    throw new Error("Transmission proposals require an affected variable and mechanism.");
  }
  if (!Number.isInteger(proposal.mappingPolicyVersion) || proposal.mappingPolicyVersion < 1) {
    throw new Error("Transmission proposal mapping-policy version must be a positive integer.");
  }
}

export type AcceptedModelInput = {
  inputId: string;
  sourceEvidenceId: string;
  dimension: SafeLocProofDimension;
  value: string | number;
  unit: string;
  acceptanceReason: string;
};

export type ProofVersions = {
  schemaVersion: number;
  policyVersion: number;
  modelVersion: string | null;
};

export type ProofEventBase<EventType extends string, Payload> = {
  eventId: string;
  eventType: EventType;
  project: ProjectIdentity;
  effectiveAt: string;
  /** Assigned by PostgreSQL; distinguishes what SafeLoc knew from source as-of dates. */
  recordedAt?: string;
  researchRunId: string | null;
  versions: ProofVersions;
  decisionRef: string | null;
  payload: Payload;
};

export type ProofSearchEvent = ProofEventBase<"search-assessment", { search: SearchAssessment }>;
export type ProofEvidenceEvent = ProofEventBase<"evidence-observation", { evidence: EvidenceObservation }>;
export type ProofStateEvent = ProofEventBase<"project-state-change", { state: ProjectStateRecord }>;
export type ProofSupersessionEvent = ProofEventBase<"supersession", {
  supersededEvidenceId: string;
  supersedingEvidenceId: string;
  reason: string;
}>;
export type ProofTransmissionEvent = ProofEventBase<"transmission-proposal", { proposal: TransmissionProposal }>;
export type ProofAcceptedInputEvent = ProofEventBase<"accepted-model-input", { input: AcceptedModelInput }>;

export type ProofLedgerEvent =
  | ProofSearchEvent
  | ProofEvidenceEvent
  | ProofStateEvent
  | ProofSupersessionEvent
  | ProofTransmissionEvent
  | ProofAcceptedInputEvent;

export type ProofDecisionActor =
  | { kind: "anonymous-session"; sessionRef: string }
  | { kind: "authenticated"; actorRef: string };

export type ProofUserDecision = {
  decisionId: string;
  project: ProjectIdentity;
  actor: ProofDecisionActor;
  decision: "accept" | "reject" | "override" | "defer" | "note";
  targetRef: string;
  rationale: string;
  decidedAt: string;
  versions: ProofVersions;
};

export type StoredProofLedgerEvent = ProofLedgerEvent & { recordedAt: string };

function referencedEvidenceIds(event: ProofLedgerEvent): string[] {
  switch (event.eventType) {
    case "evidence-observation":
      return [
        ...event.payload.evidence.conflictsWithEvidenceIds,
        ...event.payload.evidence.supersedesEvidenceIds,
      ];
    case "supersession":
      return [event.payload.supersededEvidenceId, event.payload.supersedingEvidenceId];
    case "transmission-proposal":
      return event.payload.proposal.sourceEvidenceIds;
    case "accepted-model-input":
      return [event.payload.input.sourceEvidenceId];
    case "project-state-change":
      return event.payload.state.supportingEvidenceIds;
    default:
      return [];
  }
}

export function validateProofLedgerEvent(event: ProofLedgerEvent): void {
  assertCanonicalProjectIdentity(event.project);
  if (!Number.isInteger(event.versions.schemaVersion) || event.versions.schemaVersion < 1) {
    throw new Error("Proof schema version must be a positive integer.");
  }
  if (!Number.isInteger(event.versions.policyVersion) || event.versions.policyVersion < 1) {
    throw new Error("Proof policy version must be a positive integer.");
  }
  if (event.decisionRef && event.eventType !== "accepted-model-input") {
    throw new Error("Only an accepted model input may reference a user decision.");
  }

  switch (event.eventType) {
    case "search-assessment":
      assertSameProjectScope(event.project, event.payload.search.project, "Search assessment");
      if (event.researchRunId !== event.payload.search.researchRunId) {
        throw new Error("Search assessment research-run reference does not match its ledger event.");
      }
      validateSearchAssessment(event.payload.search);
      break;
    case "evidence-observation":
      assertSameProjectScope(event.project, event.payload.evidence.project, "Evidence observation");
      if (event.researchRunId !== event.payload.evidence.researchRunId) {
        throw new Error("Evidence research-run reference does not match its ledger event.");
      }
      if (!event.payload.evidence.evidenceId.trim() || !event.payload.evidence.claim.trim()) {
        throw new Error("Evidence observations require an ID and claim.");
      }
      if (!event.payload.evidence.retainedPassageId.trim() || !event.payload.evidence.retainedPassage.trim()) {
        throw new Error("Evidence observations require a retained passage ID and passage.");
      }
      if (typeof event.payload.evidence.value === "number" && !Number.isFinite(event.payload.evidence.value)) {
        throw new Error("Evidence values must be finite numbers.");
      }
      if (
        event.payload.evidence.conflictsWithEvidenceIds.includes(event.payload.evidence.evidenceId) ||
        event.payload.evidence.supersedesEvidenceIds.includes(event.payload.evidence.evidenceId)
      ) {
        throw new Error("Evidence cannot conflict with or supersede itself.");
      }
      break;
    case "project-state-change":
      assertSameProjectScope(event.project, event.payload.state.project, "Project state");
      if (!event.payload.state.stateKey.trim() || !event.payload.state.stateVersion.trim()) {
        throw new Error("Project-state key and version are required.");
      }
      if (!Array.isArray(event.payload.state.supportingEvidenceIds)) {
        throw new Error("Project state must retain its supporting evidence references.");
      }
      if (event.payload.state.state.status === "known" && !event.payload.state.state.value.trim()) {
        throw new Error("Known project state requires a value.");
      }
      if (
        event.payload.state.state.status === "not-applicable" &&
        !event.payload.state.state.reason.trim()
      ) {
        throw new Error("Not-applicable project state requires a reason.");
      }
      break;
    case "supersession":
      if (
        !event.payload.supersededEvidenceId ||
        !event.payload.supersedingEvidenceId ||
        event.payload.supersededEvidenceId === event.payload.supersedingEvidenceId
      ) {
        throw new Error("Supersession requires two distinct evidence IDs.");
      }
      break;
    case "transmission-proposal":
      assertSameProjectScope(event.project, event.payload.proposal.project, "Transmission proposal");
      validateTransmissionProposal(event.payload.proposal);
      break;
    case "accepted-model-input":
      if (!event.payload.input.sourceEvidenceId || !event.payload.input.unit.trim()) {
        throw new Error("Accepted model input requires source evidence and a unit.");
      }
      if (typeof event.payload.input.value === "number" && !Number.isFinite(event.payload.input.value)) {
        throw new Error("Accepted model input values must be finite numbers.");
      }
      if (event.decisionRef === null) {
        throw new Error("Accepted model input requires an identified user decision reference.");
      }
      break;
  }
}

export function validateProofUserDecision(decision: ProofUserDecision): void {
  assertCanonicalProjectIdentity(decision.project);
  if (
    !Number.isInteger(decision.versions.schemaVersion) || decision.versions.schemaVersion < 1 ||
    !Number.isInteger(decision.versions.policyVersion) || decision.versions.policyVersion < 1
  ) {
    throw new Error("Proof decision schema and policy versions must be positive integers.");
  }
  if (decision.actor.kind === "anonymous-session" && !decision.actor.sessionRef.trim()) {
    throw new Error("Anonymous decisions require a session reference.");
  }
  if (decision.actor.kind === "authenticated" && !decision.actor.actorRef.trim()) {
    throw new Error("Authenticated decisions require an actor reference.");
  }
  if (!decision.targetRef.trim()) throw new Error("User decisions require a target reference.");
}

export type ProofLedgerProjection = {
  asOfRecordedAt: string;
  events: StoredProofLedgerEvent[];
  evidence: EvidenceObservation[];
  searchesByDimension: Partial<Record<SafeLocProofDimension, SearchAssessment>>;
  statesByKey: Record<string, ProjectStateRecord>;
  acceptedInputsById: Record<string, AcceptedModelInput>;
  supersededEvidenceIds: string[];
};

export function deriveProofLedgerProjection(
  events: StoredProofLedgerEvent[],
  asOfRecordedAt: string,
): ProofLedgerProjection {
  const cutoff = Date.parse(asOfRecordedAt);
  if (!Number.isFinite(cutoff)) throw new Error("Projection as-of time must be a valid date.");
  const expectedProject = events[0]?.project;
  if (expectedProject) {
    for (const event of events) assertSameProjectScope(expectedProject, event.project, "Projection event");
  }
  const ordered = events
    .filter((event) => Date.parse(event.recordedAt) <= cutoff)
    .slice()
    .sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) || left.eventId.localeCompare(right.eventId),
    );
  const evidence: EvidenceObservation[] = [];
  const searchesByDimension: ProofLedgerProjection["searchesByDimension"] = {};
  const statesByKey: ProofLedgerProjection["statesByKey"] = {};
  const acceptedInputsById: ProofLedgerProjection["acceptedInputsById"] = {};
  const supersededEvidenceIds = new Set<string>();

  for (const event of ordered) {
    switch (event.eventType) {
      case "evidence-observation":
        evidence.push(event.payload.evidence);
        for (const id of event.payload.evidence.supersedesEvidenceIds) supersededEvidenceIds.add(id);
        break;
      case "search-assessment":
        searchesByDimension[event.payload.search.dimension] = event.payload.search;
        break;
      case "project-state-change":
        statesByKey[event.payload.state.stateKey] = event.payload.state;
        break;
      case "supersession":
        supersededEvidenceIds.add(event.payload.supersededEvidenceId);
        break;
      case "accepted-model-input":
        acceptedInputsById[event.payload.input.inputId] = event.payload.input;
        break;
      case "transmission-proposal":
        break;
    }
  }

  return {
    asOfRecordedAt,
    events: ordered,
    evidence,
    searchesByDimension,
    statesByKey,
    acceptedInputsById,
    supersededEvidenceIds: [...supersededEvidenceIds].sort(),
  };
}

export function evidenceIdsReferencedBy(event: ProofLedgerEvent): string[] {
  return [...new Set(referencedEvidenceIds(event))];
}