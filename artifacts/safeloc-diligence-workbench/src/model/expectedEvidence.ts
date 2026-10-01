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

export const SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION = 1;

export type ExpectedEvidenceRule = {
  dimension: SafeLocProofDimension;
  expectedClaims: readonly string[];
  preferredSourceKinds: readonly string[];
};

/** Versioned diligence guidance; applicability is never inferred from geography or missing evidence. */
export const SAFELOC_EXPECTED_EVIDENCE_RULES: readonly ExpectedEvidenceRule[] = [
  {
    dimension: "project-identity",
    expectedClaims: ["Project or legal entity identity", "Named campus, phase, and facility relationships", "Location and project-specific capacity"],
    preferredSourceKinds: ["regulatory filing", "company disclosure", "local-government record"],
  },
  {
    dimension: "power-grid-interconnection",
    expectedClaims: ["Requested and deliverable load", "Utility or grid study and queue position", "Interconnection agreement, milestones, and energization date"],
    preferredSourceKinds: ["utility filing", "grid-operator record", "interconnection agreement", "regulatory filing"],
  },
  {
    dimension: "electricity-tariff",
    expectedClaims: ["Applicable tariff and rate structure", "Demand, energy, and pass-through charges", "Facility-specific effective period and rate"],
    preferredSourceKinds: ["utility tariff", "regulatory filing", "executed supply agreement"],
  },
  {
    dimension: "water-cooling",
    expectedClaims: ["Water source, allocation, and permitted use", "Cooling design and consumption basis", "Discharge, reuse, and drought constraints"],
    preferredSourceKinds: ["water authority record", "permit", "engineering filing", "company disclosure"],
  },
  {
    dimension: "land-site-civil",
    expectedClaims: ["Site control and parcel boundaries", "Zoning and land-use status", "Site preparation, grading, and civil constraints"],
    preferredSourceKinds: ["deed or land filing", "planning record", "permit", "company disclosure"],
  },
  {
    dimension: "permitting-entitlement",
    expectedClaims: ["Required permits and entitlement path", "Application, approval, and conditions", "Permit holder, location, and covered phase"],
    preferredSourceKinds: ["permitting authority record", "planning commission record", "permit"],
  },
  {
    dimension: "community-local-government",
    expectedClaims: ["Local-government actions and agreements", "Community commitments and public concerns", "Incentives or obligations approved locally"],
    preferredSourceKinds: ["public meeting record", "local-government agreement", "public notice", "independent reporting"],
  },
  {
    dimension: "environmental-air-generation",
    expectedClaims: ["Air and emissions permits", "On-site generation and fuel arrangements", "Environmental review, limits, and monitoring"],
    preferredSourceKinds: ["environmental regulator record", "air permit", "environmental review"],
  },
  {
    dimension: "climate-operational-hazard",
    expectedClaims: ["Site-specific flood, heat, storm, and other hazards", "Operational exposure and resilience measures", "Source dates and geographic resolution"],
    preferredSourceKinds: ["government hazard data", "site assessment", "engineering study", "insurance disclosure"],
  },
  {
    dimension: "construction-phasing",
    expectedClaims: ["Phase and facility scope", "Construction schedule, status, and dependencies", "Commissioning and completion milestones"],
    preferredSourceKinds: ["construction permit", "regulatory filing", "company disclosure", "independent reporting"],
  },
  {
    dimension: "financing-capital",
    expectedClaims: ["Project-level capital requirement and funding", "Debt, equity, and committed financing", "Funding scope, timing, and conditions"],
    preferredSourceKinds: ["financing filing", "credit agreement", "company disclosure", "lender disclosure"],
  },
  {
    dimension: "tenant-counterparty",
    expectedClaims: ["Tenant, operator, and counterparty identity", "Lease, capacity, or offtake commitment", "Term, conditions, and project scope"],
    preferredSourceKinds: ["executed agreement", "regulatory filing", "company disclosure", "counterparty disclosure"],
  },
  {
    dimension: "incentives-taxes",
    expectedClaims: ["Tax treatment and applicable incentive programs", "Awarding authority, value, and conditions", "Beneficiary, project scope, and obligation period"],
    preferredSourceKinds: ["tax agreement", "government award record", "statute or regulation", "regulatory filing"],
  },
] as const;

export type ExpectedEvidenceResolution =
  | "not-assessed"
  | "supported"
  | "searched-not-found"
  | "conflicting"
  | "not-applicable";

export type ExpectedEvidenceApplicability = "unknown" | "applicable" | "not-applicable";

export type ExpectedEvidenceDimensionResult = {
  dimension: SafeLocProofDimension;
  rule: ExpectedEvidenceRule;
  applicability: ExpectedEvidenceApplicability;
  search: SearchAssessment | null;
  searchState: SafeLocSearchState | "not-run";
  resolution: ExpectedEvidenceResolution;
  evidence: EvidenceObservation[];
  supersededEvidence: EvidenceObservation[];
  ineligibleEvidenceIds: string[];
  applicabilityState: ProjectStateRecord | null;
};

export type MaturityStage =
  | "announced"
  | "site-control"
  | "permitting"
  | "construction"
  | "commissioning"
  | "operational"
  | "decommissioned"
  | "application"
  | "study"
  | "queue"
  | "agreement"
  | "energized";

export type ProjectMaturity = {
  status: "unknown" | "known" | "not-applicable";
  stateKey: "facility-lifecycle" | "power-delivery";
  stage: MaturityStage | null;
  asOfDate: string | null;
  supportingEvidenceIds: string[];
  state: ProjectStateRecord | null;
};

const RULE_BY_DIMENSION = new Map(SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => [rule.dimension, rule]));
const APPLICABILITY_STATE_PREFIX = "expected-evidence:";
const MATURITY_STAGES: Record<ProjectMaturity["stateKey"], readonly MaturityStage[]> = {
  "facility-lifecycle": [
    "announced",
    "site-control",
    "permitting",
    "construction",
    "commissioning",
    "operational",
    "decommissioned",
  ],
  "power-delivery": ["application", "study", "queue", "agreement", "construction", "energized"],
};

export function expectedEvidenceApplicabilityStateKey(dimension: SafeLocProofDimension): string {
  return `${APPLICABILITY_STATE_PREFIX}${dimension}:applicability`;
}

function applicabilityFor(state: ProjectStateRecord | undefined): ExpectedEvidenceApplicability {
  if (!state || state.state.status === "unknown") return "unknown";
  return state.state.status === "not-applicable" ? "not-applicable" : "applicable";
}

function stateMaturity(state: ProjectStateRecord | undefined, stateKey: ProjectMaturity["stateKey"]): ProjectMaturity {
  const base = {
    stateKey,
    asOfDate: state?.asOfDate ?? null,
    supportingEvidenceIds: state ? [...state.supportingEvidenceIds] : [],
    state: state ?? null,
  };
  if (!state || state.state.status === "unknown") return { ...base, status: "unknown", stage: null };
  if (state.state.status === "not-applicable") return { ...base, status: "not-applicable", stage: null };
  const normalizedStage = state.state.value.trim().toLocaleLowerCase("en-US");
  const stage = MATURITY_STAGES[stateKey].find((candidate) => candidate === normalizedStage);
  return stage
    ? { ...base, status: "known", stage }
    : { ...base, status: "unknown", stage: null };
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

function resolveEvidence(
  search: SearchAssessment | undefined,
  eligible: EvidenceObservation[],
  conflicts: Set<string>,
  applicability: ExpectedEvidenceApplicability,
): ExpectedEvidenceResolution {
  if (applicability === "not-applicable") return "not-applicable";
  if (search?.resolution === "conflicting" || eligible.some((item) => conflicts.has(item.evidenceId))) {
    return "conflicting";
  }
  if (search?.resolution === "searched-not-found" && eligible.length > 0) return "conflicting";
  if (eligible.length > 0) return "supported";
  if (search?.state === "complete" && search.resolution === "searched-not-found") return "searched-not-found";
  return "not-assessed";
}

/** Evaluates a historical ledger projection without changing its evidence or source-quality labels. */
export function evaluateExpectedEvidence(
  project: ProjectIdentity,
  projection: ProofLedgerProjection,
): {
  policyVersion: number;
  project: ProjectIdentity;
  dimensions: ExpectedEvidenceDimensionResult[];
  maturity: {
    facilityLifecycle: ProjectMaturity;
    powerDelivery: ProjectMaturity;
  };
} {
  assertCanonicalProjectIdentity(project);
  for (const event of projection.events) assertSameProjectScope(project, event.project, "Expected-evidence projection event");
  const stateFor = (stateKey: string) => projection.statesByKey[stateKey];
  for (const [stateKey, state] of Object.entries(projection.statesByKey)) {
    assertSameProjectScope(project, state.project, "Expected-evidence project state");
    if (state.stateKey !== stateKey) throw new Error("Expected-evidence project state is indexed under the wrong key.");
  }
  const eligibleByDimension = new Map<SafeLocProofDimension, EvidenceObservation[]>();
  const supersededByDimension = new Map<SafeLocProofDimension, EvidenceObservation[]>();
  const ineligibleByDimension = new Map<SafeLocProofDimension, string[]>();
  for (const observation of projection.evidence) {
    assertSameProjectScope(project, observation.project, "Expected-evidence observation");
    if (observation.eligibility.eligible) {
      const isSuperseded = projection.supersededEvidenceIds.includes(observation.evidenceId);
      const target = isSuperseded ? supersededByDimension : eligibleByDimension;
      const current = target.get(observation.dimension) ?? [];
      current.push(observation);
      target.set(observation.dimension, current);
    } else {
      const current = ineligibleByDimension.get(observation.dimension) ?? [];
      current.push(observation.evidenceId);
      ineligibleByDimension.set(observation.dimension, current);
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
  const conflictIds = conflictingEvidenceIds([...eligibleByDimension.values()].flat());
  const dimensions = SAFELOC_PROOF_DIMENSIONS.map((dimension): ExpectedEvidenceDimensionResult => {
    const search = projection.searchesByDimension[dimension] ?? null;
    const applicabilityState = stateFor(expectedEvidenceApplicabilityStateKey(dimension)) ?? null;
    const applicability = applicabilityFor(applicabilityState ?? undefined);
    const evidence = eligibleByDimension.get(dimension) ?? [];
    return {
      dimension,
      rule: RULE_BY_DIMENSION.get(dimension)!,
      applicability,
      search,
      searchState: search?.state ?? "not-run",
      resolution: resolveEvidence(search ?? undefined, evidence, conflictIds, applicability),
      evidence: [...evidence].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
      supersededEvidence: [...(supersededByDimension.get(dimension) ?? [])]
        .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
      ineligibleEvidenceIds: [...(ineligibleByDimension.get(dimension) ?? [])].sort(),
      applicabilityState,
    };
  });

  return {
    policyVersion: SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION,
    project,
    dimensions,
    maturity: {
      facilityLifecycle: stateMaturity(stateFor("facility-lifecycle"), "facility-lifecycle"),
      powerDelivery: stateMaturity(stateFor("power-delivery"), "power-delivery"),
    },
  };
}

export const SAFELOC_EXPECTED_EVIDENCE_RULE_DIMENSIONS = SAFELOC_EXPECTED_EVIDENCE_RULES.map((rule) => rule.dimension);