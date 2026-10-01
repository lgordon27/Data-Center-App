import {
  SAFELOC_PROOF_DIMENSIONS,
  assertCanonicalProjectIdentity,
  assertSameProjectScope,
  type EvidenceObservation,
  type ProjectIdentity,
  type ProjectStateRecord,
  type ProofLedgerProjection,
  type SafeLocProofDimension,
  type SafeLocSearchState,
  type SearchAssessment,
  validateSearchAssessment,
} from "./safelocProofContract.js";
import {
  SAFELOC_EXPECTED_EVIDENCE_RULES,
  SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
  SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION,
  decideExpectedEvidenceDimension,
  expectedEvidenceApplicabilityStateKey,
  expectedEvidenceSourceGuidance,
  validateExpectedEvidenceProfile,
  type ExpectedDecision,
  type ExpectedEvidenceProfile,
  type ExpectedEvidenceRule,
  type EvidencePosture,
  type JurisdictionSourceGuidance,
} from "./expectedEvidenceProfile.js";
import {
  resolveProjectMaturity,
  type ProjectMaturity,
} from "./expectedEvidenceMaturity.js";

export {
  SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
  SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION,
  SAFELOC_EXPECTED_EVIDENCE_RULES,
  expectedEvidenceApplicabilityStateKey,
  validateExpectedEvidenceProfile,
  type CoolingDesign,
  type EvidencePosture,
  type ExpectedDecision,
  type ExpectedEvidenceProfile,
  type ExpectedEvidenceRule,
  type ProfileProvenance,
  type ProfileProvenanceKind,
  type ProfileSignal,
  type ProjectDevelopmentStage,
  type ProjectJurisdiction,
  type ProjectScale,
  type ProjectType,
  type JurisdictionSourceGuidance,
  type JurisdictionSourceTarget,
} from "./expectedEvidenceProfile.js";
export { type MaturityStage, type ProjectMaturity } from "./expectedEvidenceMaturity.js";

export type ExpectedEvidenceResolution =
  | "not-assessed"
  | "supported"
  | "searched-not-found"
  | "conflicting"
  | "not-expected";

export type ExpectedEvidenceApplicability = "unknown" | "applicable" | "not-applicable";

export type EvidenceFreshness = {
  observation: EvidenceObservation;
  status: "current" | "stale" | "future" | "unknown";
  basis: "as-of-date" | "publication-date" | "undated";
  basisDate: string | null;
  ageDays: number | null;
  freshnessLimitDays: number;
  futureDates: string[];
};

export type ExpectedEvidenceDimensionResult = {
  dimension: SafeLocProofDimension;
  rule: ExpectedEvidenceRule;
  expectation: ExpectedDecision;
  decisionReason: string;
  expectedClaims: string[];
  likelyPublicConfidential: EvidencePosture;
  jurisdictionSourceGuidance: JurisdictionSourceGuidance;
  ledgerApplicability: ExpectedEvidenceApplicability;
  search: SearchAssessment | null;
  searchState: SafeLocSearchState | "not-run";
  evidenceResolution: ExpectedEvidenceResolution;
  evidence: EvidenceObservation[];
  staleEvidence: EvidenceFreshness[];
  futureEvidence: EvidenceFreshness[];
  undatedEvidence: EvidenceFreshness[];
  supersededEvidence: EvidenceFreshness[];
  conflictingEvidence: EvidenceObservation[];
  unsupportedEvidence: EvidenceObservation[];
  applicabilityState: ProjectStateRecord | null;
};

export type ExpectedEvidenceEvaluation = {
  policyVersion: number;
  profileVersion: number;
  project: ProjectIdentity;
  profile: ExpectedEvidenceProfile;
  dimensions: ExpectedEvidenceDimensionResult[];
  maturity: {
    facilityLifecycle: ProjectMaturity;
    powerDelivery: ProjectMaturity;
  };
};

const RULE_BY_DIMENSION = new Map(SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => [rule.dimension, rule]));

function applicabilityFor(state: ProjectStateRecord | undefined): ExpectedEvidenceApplicability {
  if (!state || state.state.status === "unknown") return "unknown";
  return state.state.status === "not-applicable" ? "not-applicable" : "applicable";
}

function parseFreshness(
  observation: EvidenceObservation,
  asOfRecordedAt: string,
  freshnessLimitDays: number,
  eventEffectiveAt: string | null,
): EvidenceFreshness {
  const basisDate = observation.asOfDate ?? observation.publicationDate;
  const basis = observation.asOfDate
    ? "as-of-date"
    : observation.publicationDate
      ? "publication-date"
      : "undated";
  const projectionTime = Date.parse(asOfRecordedAt);
  const candidateDates = [
    observation.asOfDate,
    observation.publicationDate,
    observation.observedAt,
    eventEffectiveAt,
  ].filter((date): date is string => date !== null);
  if (candidateDates.some((date) => !Number.isFinite(Date.parse(date)))) {
    return { observation, status: "unknown", basis, basisDate, ageDays: null, freshnessLimitDays, futureDates: [] };
  }
  const futureDates = candidateDates.filter((date) => Date.parse(date) > projectionTime);
  if (futureDates.length > 0) {
    return { observation, status: "future", basis, basisDate, ageDays: null, freshnessLimitDays, futureDates };
  }
  if (!basisDate) {
    return { observation, status: "unknown", basis, basisDate: null, ageDays: null, freshnessLimitDays, futureDates: [] };
  }
  const evidenceTime = Date.parse(basisDate);
  if (!Number.isFinite(evidenceTime) || !Number.isFinite(projectionTime)) {
    return { observation, status: "unknown", basis, basisDate, ageDays: null, freshnessLimitDays, futureDates: [] };
  }
  const ageDays = Math.floor((projectionTime - evidenceTime) / 86_400_000);
  return {
    observation,
    status: ageDays > freshnessLimitDays ? "stale" : "current",
    basis,
    basisDate,
    ageDays,
    freshnessLimitDays,
    futureDates: [],
  };
}

function conflictingEvidenceIds(evidence: EvidenceObservation[]): Set<string> {
  const byId = new Map(evidence.map((item) => [item.evidenceId, item]));
  const conflicts = new Set<string>();
  for (const item of evidence) {
    for (const conflictId of item.conflictsWithEvidenceIds) {
      if (byId.has(conflictId)) {
        conflicts.add(item.evidenceId);
        conflicts.add(conflictId);
      }
    }
  }
  return conflicts;
}

function evidenceResolution(
  search: SearchAssessment | null,
  expectation: ExpectedDecision,
  freshEvidence: EvidenceObservation[],
  conflictingEvidence: EvidenceObservation[],
  staleEvidence: EvidenceFreshness[],
  futureEvidence: EvidenceFreshness[],
  undatedEvidence: EvidenceFreshness[],
  supersededEvidence: EvidenceFreshness[],
  unsupportedEvidence: EvidenceObservation[],
): ExpectedEvidenceResolution {
  if (expectation === "not-expected") return "not-expected";
  if (search?.resolution === "conflicting" || conflictingEvidence.length > 0) return "conflicting";
  if (freshEvidence.length > 0) return "supported";
  if (
    staleEvidence.length > 0 ||
    futureEvidence.length > 0 ||
    undatedEvidence.length > 0 ||
    supersededEvidence.length > 0 ||
    unsupportedEvidence.length > 0
  ) return "not-assessed";
  if (search?.state === "complete" && search.resolution === "searched-not-found") return "searched-not-found";
  return "not-assessed";
}

/** Evaluates profile-dependent expectations over a historical ledger projection. */
export function evaluateExpectedEvidence(
  profile: ExpectedEvidenceProfile,
  projection: ProofLedgerProjection,
): ExpectedEvidenceEvaluation {
  validateExpectedEvidenceProfile(profile);
  const project = profile.project;
  assertCanonicalProjectIdentity(project);
  for (const event of projection.events) assertSameProjectScope(project, event.project, "Expected-evidence projection event");
  const stateFor = (stateKey: string) => projection.statesByKey[stateKey];
  for (const [stateKey, state] of Object.entries(projection.statesByKey)) {
    assertSameProjectScope(project, state.project, "Expected-evidence project state");
    if (state.stateKey !== stateKey) throw new Error("Expected-evidence project state is indexed under the wrong key.");
  }

  const observationsById = new Map<string, EvidenceObservation>();
  const freshnessById = new Map<string, EvidenceFreshness>();
  const effectiveAtByEvidenceId = new Map<string, string>();
  for (const event of projection.events) {
    if (event.eventType === "evidence-observation") {
      effectiveAtByEvidenceId.set(event.payload.evidence.evidenceId, event.effectiveAt);
    }
  }
  const supersededIds = new Set(projection.supersededEvidenceIds);
  const eligibleByDimension = new Map<SafeLocProofDimension, EvidenceFreshness[]>();
  const supersededByDimension = new Map<SafeLocProofDimension, EvidenceFreshness[]>();
  const unsupportedByDimension = new Map<SafeLocProofDimension, EvidenceObservation[]>();
  for (const observation of projection.evidence) {
    assertSameProjectScope(project, observation.project, "Expected-evidence observation");
    observationsById.set(observation.evidenceId, observation);
    const rule = RULE_BY_DIMENSION.get(observation.dimension);
    if (!rule) continue;
    const freshness = parseFreshness(
      observation,
      projection.asOfRecordedAt,
      rule.freshnessLimitDays,
      effectiveAtByEvidenceId.get(observation.evidenceId) ?? null,
    );
    freshnessById.set(observation.evidenceId, freshness);
    if (!observation.eligibility.eligible) {
      const current = unsupportedByDimension.get(observation.dimension) ?? [];
      current.push(observation);
      unsupportedByDimension.set(observation.dimension, current);
    } else if (supersededIds.has(observation.evidenceId)) {
      const current = supersededByDimension.get(observation.dimension) ?? [];
      current.push(freshness);
      supersededByDimension.set(observation.dimension, current);
    } else {
      const current = eligibleByDimension.get(observation.dimension) ?? [];
      current.push(freshness);
      eligibleByDimension.set(observation.dimension, current);
    }
  }

  for (const search of Object.values(projection.searchesByDimension)) {
    if (!search) continue;
    assertSameProjectScope(project, search.project, "Expected-evidence search");
    validateSearchAssessment(search);
    if (projection.searchesByDimension[search.dimension] !== search) {
      throw new Error("Expected-evidence search is indexed under the wrong dimension.");
    }
  }
  const freshEvidence = [...eligibleByDimension.values()].flat()
    .filter((item) => item.status === "current")
    .map((item) => item.observation);
  const conflictIds = conflictingEvidenceIds(freshEvidence);
  const dimensions = SAFELOC_PROOF_DIMENSIONS.map((dimension): ExpectedEvidenceDimensionResult => {
    const rule = RULE_BY_DIMENSION.get(dimension)!;
    const search = projection.searchesByDimension[dimension] ?? null;
    const applicabilityState = stateFor(expectedEvidenceApplicabilityStateKey(dimension)) ?? null;
    const applicability = applicabilityFor(applicabilityState ?? undefined);
    const decision = decideExpectedEvidenceDimension(rule, profile, applicabilityState);
    const eligible = eligibleByDimension.get(dimension) ?? [];
    const activeFresh = eligible.filter((item) => item.status === "current");
    const conflicting = activeFresh
      .filter((item) => conflictIds.has(item.observation.evidenceId))
      .map((item) => item.observation)
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
    const evidence = activeFresh
      .filter((item) => !conflictIds.has(item.observation.evidenceId))
      .map((item) => item.observation)
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
    const staleEvidence = eligible.filter((item) => item.status === "stale")
      .sort((left, right) => left.observation.evidenceId.localeCompare(right.observation.evidenceId));
    const futureEvidence = eligible.filter((item) => item.status === "future")
      .sort((left, right) => left.observation.evidenceId.localeCompare(right.observation.evidenceId));
    const undatedEvidence = eligible.filter((item) => item.status === "unknown")
      .sort((left, right) => left.observation.evidenceId.localeCompare(right.observation.evidenceId));
    const supersededEvidence = (supersededByDimension.get(dimension) ?? [])
      .sort((left, right) => left.observation.evidenceId.localeCompare(right.observation.evidenceId));
    const unsupportedEvidence = (unsupportedByDimension.get(dimension) ?? [])
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
    return {
      dimension,
      rule,
      expectation: decision.expectation,
      decisionReason: decision.reason,
      expectedClaims: decision.claims,
      likelyPublicConfidential: rule.likelyPublicConfidential,
      jurisdictionSourceGuidance: expectedEvidenceSourceGuidance(rule, profile.jurisdiction),
      ledgerApplicability: applicability,
      search,
      searchState: search?.state ?? "not-run",
      evidenceResolution: evidenceResolution(
        search,
        decision.expectation,
        evidence,
        conflicting,
        staleEvidence,
        futureEvidence,
        undatedEvidence,
        supersededEvidence,
        unsupportedEvidence,
      ),
      evidence,
      staleEvidence,
      futureEvidence,
      undatedEvidence,
      supersededEvidence,
      conflictingEvidence: conflicting,
      unsupportedEvidence,
      applicabilityState,
    };
  });

  return {
    policyVersion: SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
    profileVersion: SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION,
    project,
    profile,
    dimensions,
    maturity: {
      facilityLifecycle: resolveProjectMaturity(
        stateFor("facility-lifecycle"),
        "facility-lifecycle",
        observationsById,
        freshnessById,
        supersededIds,
        conflictIds,
      ),
      powerDelivery: resolveProjectMaturity(
        stateFor("power-delivery"),
        "power-delivery",
        observationsById,
        freshnessById,
        supersededIds,
        conflictIds,
      ),
    },
  };
}

export const SAFELOC_EXPECTED_EVIDENCE_RULE_DIMENSIONS = SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => rule.dimension);