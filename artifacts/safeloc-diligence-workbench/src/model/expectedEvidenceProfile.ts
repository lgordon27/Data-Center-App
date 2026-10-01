import {
  assertCanonicalProjectIdentity,
  assertSameProjectScope,
  type ProjectIdentity,
  type ProjectScope,
  type ProjectStateRecord,
  type SafeLocProofDimension,
} from "./safelocProofContract.js";

export const SAFELOC_EXPECTED_EVIDENCE_POLICY_VERSION = 2;
export const SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION = 1;

export type ProjectDevelopmentStage =
  | "announced"
  | "site-control"
  | "permitting"
  | "pre-construction"
  | "construction"
  | "commissioning"
  | "operational";

export type ProjectScale = {
  category: "small" | "medium" | "large" | "hyperscale";
  itLoadMW: number | null;
};

export type ProjectType =
  | "hyperscale-cloud"
  | "ai-compute-campus"
  | "colocation-provider"
  | "enterprise-owner-operated"
  | "mixed";

export type ProjectJurisdiction = {
  countryCode: string;
  subdivisionCode: string | null;
  locality: string | null;
};

export type CoolingDesign = {
  technology: "air-cooled" | "evaporative" | "direct-liquid" | "hybrid" | "custom";
  waterUse: "none" | "process-water" | "unknown";
};

export type ProfileProvenanceKind = "sourced" | "derived" | "illustrative";
export type ProfileProvenance = {
  kind: ProfileProvenanceKind;
  sourceIds: string[];
  rationale: string;
  asOfDate: string;
  scope: ProjectScope;
};

export type ProfileSignal<Value> =
  | {
      status: "known";
      value: Value;
      provenance: ProfileProvenance;
    }
  | {
      status: "unknown";
      value: null;
      provenance: {
        kind: "unknown";
        sourceIds: [];
        rationale: string;
        asOfDate: null;
        scope: ProjectScope;
      };
    };

/** Every profile input carries its own basis; illustrative values are never evidence. */
export type ExpectedEvidenceProfile = {
  profileVersion: typeof SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION;
  project: ProjectIdentity;
  stage: ProfileSignal<ProjectDevelopmentStage>;
  scale: ProfileSignal<ProjectScale>;
  projectType: ProfileSignal<ProjectType>;
  jurisdiction: ProfileSignal<ProjectJurisdiction>;
  coolingDesign: ProfileSignal<CoolingDesign>;
};

export type EvidencePosture = "likely-public" | "likely-confidential" | "mixed" | "unknown";
export type ExpectedDecision = "expected" | "not-expected" | "unknown";

export type ExpectedEvidenceRule = {
  dimension: SafeLocProofDimension;
  expectedClaims: readonly string[];
  preferredSourceKinds: readonly string[];
  likelyPublicConfidential: EvidencePosture;
  freshnessLimitDays: number;
};

export const SAFELOC_EXPECTED_EVIDENCE_RULES: readonly ExpectedEvidenceRule[] = [
  {
    dimension: "project-identity",
    expectedClaims: ["Project or legal entity identity", "Named campus, phase, and facility relationships", "Location and project-specific capacity"],
    preferredSourceKinds: ["regulatory filing", "company disclosure", "local-government record"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 3650,
  },
  {
    dimension: "power-grid-interconnection",
    expectedClaims: ["Requested and deliverable load", "Utility or grid study and queue position", "Interconnection agreement, milestones, and energization date"],
    preferredSourceKinds: ["utility filing", "grid-operator record", "interconnection agreement", "regulatory filing"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 365,
  },
  {
    dimension: "electricity-tariff",
    expectedClaims: ["Applicable tariff and rate structure", "Demand, energy, and pass-through charges", "Facility-specific effective period and rate"],
    preferredSourceKinds: ["utility tariff", "regulatory filing", "executed supply agreement"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 365,
  },
  {
    dimension: "water-cooling",
    expectedClaims: ["Water source, allocation, and permitted use", "Cooling design and consumption basis", "Discharge, reuse, and drought constraints"],
    preferredSourceKinds: ["water authority record", "permit", "engineering filing", "company disclosure"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 730,
  },
  {
    dimension: "land-site-civil",
    expectedClaims: ["Site control and parcel boundaries", "Zoning and land-use status", "Site preparation, grading, and civil constraints"],
    preferredSourceKinds: ["deed or land filing", "planning record", "permit", "company disclosure"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 730,
  },
  {
    dimension: "permitting-entitlement",
    expectedClaims: ["Required permits and entitlement path", "Application, approval, and conditions", "Permit holder, location, and covered phase"],
    preferredSourceKinds: ["permitting authority record", "planning commission record", "permit"],
    likelyPublicConfidential: "likely-public",
    freshnessLimitDays: 1095,
  },
  {
    dimension: "community-local-government",
    expectedClaims: ["Local-government actions and agreements", "Community commitments and public concerns", "Incentives or obligations approved locally"],
    preferredSourceKinds: ["public meeting record", "local-government agreement", "public notice", "independent reporting"],
    likelyPublicConfidential: "likely-public",
    freshnessLimitDays: 1095,
  },
  {
    dimension: "environmental-air-generation",
    expectedClaims: ["Air and emissions permits", "On-site generation and fuel arrangements", "Environmental review, limits, and monitoring"],
    preferredSourceKinds: ["environmental regulator record", "air permit", "environmental review"],
    likelyPublicConfidential: "likely-public",
    freshnessLimitDays: 1095,
  },
  {
    dimension: "climate-operational-hazard",
    expectedClaims: ["Site-specific flood, heat, storm, and other hazards", "Operational exposure and resilience measures", "Source dates and geographic resolution"],
    preferredSourceKinds: ["government hazard data", "site assessment", "engineering study", "insurance disclosure"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 1095,
  },
  {
    dimension: "construction-phasing",
    expectedClaims: ["Phase and facility scope", "Construction schedule, status, and dependencies", "Commissioning and completion milestones"],
    preferredSourceKinds: ["construction permit", "regulatory filing", "company disclosure", "independent reporting"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 180,
  },
  {
    dimension: "financing-capital",
    expectedClaims: ["Project-level capital requirement and funding", "Debt, equity, and committed financing", "Funding scope, timing, and conditions"],
    preferredSourceKinds: ["financing filing", "credit agreement", "company disclosure", "lender disclosure"],
    likelyPublicConfidential: "likely-confidential",
    freshnessLimitDays: 365,
  },
  {
    dimension: "tenant-counterparty",
    expectedClaims: ["Tenant, operator, and counterparty identity", "Lease, capacity, or offtake commitment", "Term, conditions, and project scope"],
    preferredSourceKinds: ["executed agreement", "regulatory filing", "company disclosure", "counterparty disclosure"],
    likelyPublicConfidential: "mixed",
    freshnessLimitDays: 365,
  },
  {
    dimension: "incentives-taxes",
    expectedClaims: ["Tax treatment and applicable incentive programs", "Awarding authority, value, and conditions", "Beneficiary, project scope, and obligation period"],
    preferredSourceKinds: ["tax agreement", "government award record", "statute or regulation", "regulatory filing"],
    likelyPublicConfidential: "likely-public",
    freshnessLimitDays: 1095,
  },
] as const;

export type JurisdictionSourceTarget = {
  level: "national" | "subnational" | "local" | "grid-or-utility" | "counterparty";
  jurisdiction: string | null;
  sourceKinds: string[];
};

export type JurisdictionSourceGuidance = {
  jurisdictionStatus: "known" | "unknown";
  targets: JurisdictionSourceTarget[];
  caveat: string;
  geographyImpliesAbsence: false;
};

const PROJECT_STAGES: readonly ProjectDevelopmentStage[] = [
  "announced",
  "site-control",
  "permitting",
  "pre-construction",
  "construction",
  "commissioning",
  "operational",
];
const SCALE_CATEGORIES: readonly ProjectScale["category"][] = ["small", "medium", "large", "hyperscale"];
const PROJECT_TYPES: readonly ProjectType[] = [
  "hyperscale-cloud",
  "ai-compute-campus",
  "colocation-provider",
  "enterprise-owner-operated",
  "mixed",
];
const COOLING_TECHNOLOGIES: readonly CoolingDesign["technology"][] = [
  "air-cooled",
  "evaporative",
  "direct-liquid",
  "hybrid",
  "custom",
];
const WATER_USE_CLASSES: readonly CoolingDesign["waterUse"][] = ["none", "process-water", "unknown"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function validateSignal<Value>(
  signal: ProfileSignal<Value>,
  label: string,
  project: ProjectIdentity,
  validateKnownValue: (value: unknown) => value is Value,
): void {
  if (!isRecord(signal) || (signal.status !== "known" && signal.status !== "unknown")) {
    throw new Error(`${label} profile signal must explicitly be known or unknown.`);
  }
  if (!isRecord(signal.provenance)) throw new Error(`${label} profile provenance is required.`);
  if (typeof signal.provenance.rationale !== "string" || !signal.provenance.rationale.trim()) {
    throw new Error(`${label} profile provenance requires a rationale.`);
  }
  if (!isRecord(signal.provenance.scope)) throw new Error(`${label} profile provenance requires project scope.`);
  assertSameProjectScope(project, { ...project, scope: signal.provenance.scope as ProjectScope }, `${label} profile provenance`);
  if (!Array.isArray(signal.provenance.sourceIds) || signal.provenance.sourceIds.some(
    (sourceId: unknown) => typeof sourceId !== "string" || !sourceId.trim(),
  )) {
    throw new Error(`${label} profile source references must be non-empty strings.`);
  }
  if (signal.status === "unknown") {
    if (
      signal.value !== null ||
      signal.provenance.kind !== "unknown" ||
      signal.provenance.sourceIds.length !== 0 ||
      signal.provenance.asOfDate !== null
    ) {
      throw new Error(`${label} unknown profile inputs must carry no value, sources, or as-of date.`);
    }
    return;
  }
  if (!isOneOf(signal.provenance.kind, ["sourced", "derived", "illustrative"] as const)) {
    throw new Error(`${label} known profile input requires sourced, derived, or illustrative provenance.`);
  }
  if (signal.provenance.kind !== "illustrative" && signal.provenance.sourceIds.length === 0) {
    throw new Error(`${label} sourced or derived profile inputs require source references.`);
  }
  if (
    typeof signal.provenance.asOfDate !== "string" ||
    !Number.isFinite(Date.parse(signal.provenance.asOfDate))
  ) {
    throw new Error(`${label} known profile provenance requires a valid as-of date.`);
  }
  if (!validateKnownValue(signal.value)) throw new Error(`${label} profile value is outside the supported taxonomy.`);
}

function isScale(value: unknown): value is ProjectScale {
  if (!isRecord(value) || !isOneOf(value.category, SCALE_CATEGORIES)) return false;
  return value.itLoadMW === null || (
    typeof value.itLoadMW === "number" &&
    Number.isFinite(value.itLoadMW) &&
    value.itLoadMW > 0
  );
}

function isJurisdiction(value: unknown): value is ProjectJurisdiction {
  return isRecord(value) &&
    typeof value.countryCode === "string" &&
    /^[A-Za-z]{2}$/.test(value.countryCode) &&
    (value.subdivisionCode === null || (typeof value.subdivisionCode === "string" && !!value.subdivisionCode.trim())) &&
    (value.locality === null || (typeof value.locality === "string" && !!value.locality.trim()));
}

function isCoolingDesign(value: unknown): value is CoolingDesign {
  return isRecord(value) &&
    isOneOf(value.technology, COOLING_TECHNOLOGIES) &&
    isOneOf(value.waterUse, WATER_USE_CLASSES);
}

export function validateExpectedEvidenceProfile(profile: ExpectedEvidenceProfile): void {
  if (!isRecord(profile) || !Number.isInteger(profile.profileVersion) ||
    profile.profileVersion !== SAFELOC_EXPECTED_EVIDENCE_PROFILE_VERSION) {
    throw new Error(`Unsupported Expected Evidence profile version ${profile?.profileVersion}.`);
  }
  if (!isRecord(profile.project)) throw new Error("Expected Evidence profile requires a canonical project identity.");
  assertCanonicalProjectIdentity(profile.project);
  validateSignal(profile.stage, "Stage", profile.project, (value): value is ProjectDevelopmentStage =>
    isOneOf(value, PROJECT_STAGES));
  validateSignal(profile.scale, "Scale", profile.project, isScale);
  validateSignal(profile.projectType, "Project type", profile.project, (value): value is ProjectType =>
    isOneOf(value, PROJECT_TYPES));
  validateSignal(profile.jurisdiction, "Jurisdiction", profile.project, isJurisdiction);
  validateSignal(profile.coolingDesign, "Cooling design", profile.project, isCoolingDesign);
}

const APPLICABILITY_STATE_PREFIX = "expected-evidence:";

export function expectedEvidenceApplicabilityStateKey(dimension: SafeLocProofDimension): string {
  return `${APPLICABILITY_STATE_PREFIX}${dimension}:applicability`;
}

export function expectedEvidenceSourceGuidance(
  rule: ExpectedEvidenceRule,
  jurisdiction: ProfileSignal<ProjectJurisdiction>,
): JurisdictionSourceGuidance {
  const sourceKinds = [...rule.preferredSourceKinds];
  const targets: JurisdictionSourceTarget[] = [];
  if (jurisdiction.status === "known") {
    const location = jurisdiction.value;
    targets.push({ level: "national", jurisdiction: location.countryCode.toUpperCase(), sourceKinds });
    if (location.subdivisionCode) {
      targets.push({
        level: "subnational",
        jurisdiction: `${location.countryCode.toUpperCase()}-${location.subdivisionCode}`,
        sourceKinds,
      });
    }
    if (location.locality) {
      targets.push({ level: "local", jurisdiction: location.locality, sourceKinds });
    }
    targets.push({ level: "grid-or-utility", jurisdiction: location.subdivisionCode ?? location.countryCode, sourceKinds });
  } else {
    targets.push({ level: "national", jurisdiction: null, sourceKinds });
    targets.push({ level: "subnational", jurisdiction: null, sourceKinds });
    targets.push({ level: "local", jurisdiction: null, sourceKinds });
    targets.push({ level: "grid-or-utility", jurisdiction: null, sourceKinds });
  }
  targets.push({ level: "counterparty", jurisdiction: null, sourceKinds });
  return {
    jurisdictionStatus: jurisdiction.status,
    targets,
    caveat: "Jurisdiction guides where to search; it never implies a record exists, is public, or is absent.",
    geographyImpliesAbsence: false,
  };
}

function stageSpecificClaims(
  dimension: SafeLocProofDimension,
  profile: ExpectedEvidenceProfile,
): { expectation?: ExpectedDecision; reason?: string; claims?: string[] } | undefined {
  if (dimension === "power-grid-interconnection") {
    const stage = profile.stage;
    if (stage.status === "unknown") {
      return {
        expectation: "expected",
        reason: "Power availability and delivery are material for every data-center profile; the development stage is unknown, so stage-specific milestones must be established rather than assumed.",
        claims: ["Requested and deliverable load", "Utility or grid study and queue position", "Applicable service, agreement, and energization milestones for the established project stage"],
      };
    }
    const requirements: Record<ProjectDevelopmentStage, string[]> = {
      announced: ["Planning load/capacity basis", "Utility or grid feasibility and available capacity", "Known queue or application status; do not imply an agreement exists"],
      "site-control": ["Site-specific deliverable load", "Queue/application status and utility study", "Interconnection path and material dependencies"],
      permitting: ["Requested load and studied capacity", "Queue position, study outcomes, and required upgrades", "Expected agreement and energization milestones"],
      "pre-construction": ["Agreed capacity and required upgrades", "Interconnection agreement and conditions", "Scheduled energization milestones and dependencies"],
      construction: ["Agreed capacity and delivery obligations", "Construction progress on utility/network upgrades", "Energization schedule, tests, and dependencies"],
      commissioning: ["Energization and commissioning milestones", "Delivered versus contracted capacity", "Remaining utility conditions and reliability arrangements"],
      operational: ["Energized and contracted capacity", "Actual service arrangement and tariff linkage", "Reliability, curtailment, and expansion constraints"],
    };
    return {
      expectation: "expected",
      reason: `Power delivery is expected at the ${stage.value} stage; requirements are stage-specific and do not presume a queue position, agreement, or energization.`,
      claims: requirements[stage.value],
    };
  }

  if (dimension === "construction-phasing") {
    if (profile.stage.status === "unknown") {
      return {
        expectation: "unknown",
        reason: "The project stage is unknown, so it is not yet possible to decide whether active construction/phasing requirements apply.",
        claims: [],
      };
    }
    if (profile.stage.value === "operational") {
      return {
        expectation: "expected",
        reason: "An operational stage does not establish that expansions or additional phases are absent; check for active or planned construction before narrowing schedule requirements.",
        claims: [
          "Confirm whether an active or planned expansion/new phase exists",
          "If active, identify phase/facility schedule and commissioning dependencies",
          "Distinguish an explicitly confirmed no-build status from an unsearched or undisclosed expansion",
        ],
      };
    }
    const claims = profile.stage.value === "construction"
      ? ["Current phase, facility, and in-service capacity", "Construction progress, critical path, and schedule changes", "Commissioning, completion, and remaining dependencies"]
      : profile.stage.value === "commissioning"
        ? ["Phase/facility commissioning status", "Testing, completion, and acceptance milestones", "Remaining schedule dependencies and capacity by phase"]
        : ["Planned phases and facility scope", "Expected construction schedule and dependencies", "Permitting, procurement, and site-readiness milestones"];
    return {
      expectation: "expected",
      reason: `Construction/phasing evidence is expected for the ${profile.stage.value} stage; the claim set is tuned to that stage.`,
      claims,
    };
  }

  if (dimension === "water-cooling") {
    if (profile.coolingDesign.status === "unknown" || profile.coolingDesign.value.waterUse === "unknown") {
      return {
        expectation: "unknown",
        reason: "Cooling design or its process-water use is unknown; water/cooling evidence expectations cannot be narrowed safely.",
        claims: [],
      };
    }
    if (profile.coolingDesign.value.waterUse === "none") {
      return {
        expectation: "expected",
        reason: `The profile records ${profile.coolingDesign.value.technology} cooling with no process-water use; verify cooling/heat rejection and the declared water-use boundary rather than dropping this dimension.`,
        claims: [
          "Cooling technology and heat-rejection design",
          "Evidence basis and scope for the declared absence of process-water use",
          "Any non-process water source, allocation, or permit relevant to facility operations",
        ],
      };
    }
    return {
      expectation: "expected",
      reason: `The profile explicitly records ${profile.coolingDesign.value.technology} cooling with process-water use.`,
      claims: ["Water source, allocation, and permitted use", "Cooling design and consumption basis", "Discharge, reuse, and drought constraints"],
    };
  }

  if (dimension === "tenant-counterparty") {
    if (profile.projectType.status === "unknown") {
      return {
        expectation: "unknown",
        reason: "Project type and operating model are unknown, so third-party tenant/offtake relevance cannot be decided.",
        claims: [],
      };
    }
    if (profile.projectType.value === "enterprise-owner-operated") {
      return {
        expectation: "not-expected",
        reason: "The profile identifies an owner-operated enterprise facility rather than a third-party tenant/offtake model.",
        claims: [],
      };
    }
    if (profile.projectType.value === "mixed") {
      return {
        expectation: "unknown",
        reason: "The mixed project type does not establish whether a third-party tenant/offtake commitment applies.",
        claims: [],
      };
    }
    const claims = profile.projectType.value === "colocation-provider"
      ? ["Tenant/customer concentration and contracted capacity", "Lease/service term, renewal, and termination conditions", "Facility-specific utilization and counterparty credit"]
      : ["Tenant/offtake commitments and capacity by phase", "Counterparty identity and credit support where disclosed", "Term, conditions, and project scope"];
    return {
      expectation: "expected",
      reason: `The ${profile.projectType.value} profile indicates a third-party tenant, customer, or offtake relationship is relevant.`,
      claims,
    };
  }

  return undefined;
}

export function decideExpectedEvidenceDimension(
  rule: ExpectedEvidenceRule,
  profile: ExpectedEvidenceProfile,
  applicabilityState: ProjectStateRecord | null,
): { expectation: ExpectedDecision; reason: string; claims: string[] } {
  if (applicabilityState?.state.status === "not-applicable") {
    return {
      expectation: "not-expected",
      reason: `Explicit project state marks this dimension not applicable: ${applicabilityState.state.reason}`,
      claims: [],
    };
  }
  const stageDecision = stageSpecificClaims(rule.dimension, profile);
  if (stageDecision) {
    return {
      expectation: stageDecision.expectation ?? "expected",
      reason: stageDecision.reason ?? "Profile-dependent expected evidence decision.",
      claims: stageDecision.claims ?? [],
    };
  }
  const claims = [...rule.expectedClaims];
  if (rule.dimension === "financing-capital" && profile.scale.status === "known") {
    if (profile.scale.value.category === "hyperscale" || profile.scale.value.category === "large") {
      claims.push("Capital and funding by development phase, including major capacity and infrastructure commitments");
    } else if (profile.scale.value.category === "small") {
      claims.push("Owner funding, available credit, and project-level capital needs at the stated small scale");
    }
  }
  return {
    expectation: "expected",
    reason: `This diligence dimension is expected across project profiles; jurisdiction and missing records do not establish non-applicability.`,
    claims,
  };
}