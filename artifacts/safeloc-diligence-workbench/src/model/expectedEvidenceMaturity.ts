import {
  type EvidenceObservation,
  type ProjectStateRecord,
  type SafeLocProofDimension,
} from "./safelocProofContract.js";

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
  reason: string;
  supportingEvidenceIds: string[];
  asOfDate: string | null;
  state: ProjectStateRecord | null;
};

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
const TRUSTED_MATURITY_QUALITY = new Set(["Verified Evidence", "Management Assertion"]);
const MATURITY_SUPPORT_DIMENSION: Record<ProjectMaturity["stateKey"], SafeLocProofDimension> = {
  "facility-lifecycle": "construction-phasing",
  "power-delivery": "power-grid-interconnection",
};

type MaturityTextRule = { positive: readonly RegExp[]; disqualifying: readonly RegExp[] };
const FACILITY_STAGE_TEXT_RULES: Partial<Record<MaturityStage, MaturityTextRule>> = {
  announced: {
    positive: [/\bannounced?\s+(?:plans?|a plan|proposals?)\s+to\s+(?:build|develop|construct)\b/i],
    disqualifying: [/\b(?:cancelled|canceled|withdrawn|abandoned)\b.{0,40}\b(?:plan|project|facility|campus)\b/i],
  },
  "site-control": {
    positive: [
      /\b(?:acquired|purchased|secured|leased)\b.{0,45}\b(?:site|land|parcel|property)\b/i,
      /\bsite control\b.{0,20}\b(?:secured|obtained|established)\b/i,
    ],
    disqualifying: [
      /\b(?:plans?|seeks?|seeking|negotiating)\b.{0,35}\b(?:acquire|purchase|secure|lease)\b.{0,20}\b(?:site|land|parcel)\b/i,
      /\b(?:site control|site|land|parcel|property)\b.{0,35}\b(?:not yet|not|never|has not|have not|did not|will not)\b.{0,20}\b(?:secured|obtained|acquired|purchased|leased)\b/i,
    ],
  },
  permitting: {
    positive: [
      /\b(?:permit|entitlement|zoning approval)\b.{0,35}\b(?:approved|issued|granted|filed|obtained)\b/i,
      /\b(?:approved|issued|granted|filed|obtained)\b.{0,35}\b(?:permit|entitlement|zoning approval)\b/i,
    ],
    disqualifying: [
      /\b(?:plans?|expects?|seeks?|seeking|applied for)\b.{0,30}\b(?:permit|entitlement|zoning approval)\b/i,
      /\b(?:permit|entitlement|zoning approval)\b.{0,35}\b(?:not yet|not|never|has not|have not|did not|will not)\b.{0,20}\b(?:approved|issued|granted|filed|obtained)\b/i,
      /\b(?:not yet|not|never|has not|have not|did not|will not)\b.{0,25}\b(?:approved|issued|granted|filed|obtained)\b.{0,25}\b(?:permit|entitlement|zoning approval)\b/i,
    ],
  },
  construction: {
    positive: [
      /\b(?:construction|site work|building work)\b.{0,40}\b(?:is underway|underway|in progress|has begun|has started|began|started|commenced)\b/i,
      /\b(?:began|started|commenced)\b.{0,35}\b(?:construction|site work|building work)\b/i,
      /\bunder construction\b/i,
    ],
    disqualifying: [
      /\bnot\s+(?:yet\s+)?under construction\b/i,
      /\b(?:not yet|not|never|has not|have not|had not|did not|will not)\b.{0,45}\b(?:begun|started|commenced|underway)\b.{0,25}\b(?:construction|building|site work)\b/i,
      /\b(?:construction|building|site work)\b.{0,45}\b(?:not yet|not|never|has not|have not|had not|did not|will not)\b.{0,25}\b(?:begun|started|commenced|underway)\b/i,
      /\b(?:planned|expected|scheduled|forecast|will|would|could|may|might|plans? to|intends? to|target(?:s|ed)? to)\b.{0,45}\b(?:begin|start|commence)\b.{0,25}\b(?:construction|building|site work)\b/i,
    ],
  },
  commissioning: {
    positive: [
      /\bcommissioning\b.{0,35}\b(?:is underway|underway|in progress|has begun|has started|began|started|commenced|completed)\b/i,
      /\b(?:began|started|commenced|completed)\b.{0,35}\bcommissioning\b/i,
    ],
    disqualifying: [
      /\b(?:not yet|not|never|has not|have not|had not|did not|will not)\b.{0,40}\b(?:begin|start|commence|complete)\b.{0,20}\bcommissioning\b/i,
      /\b(?:planned|expected|scheduled|forecast|will|would|could|may|might|plans? to|intends? to|target(?:s|ed)? to)\b.{0,45}\b(?:begin|start|commence)\b.{0,20}\bcommissioning\b/i,
    ],
  },
  operational: {
    positive: [
      /\b(?:is now|is currently|is|became|has become|entered|began|commenced)\b.{0,25}\b(?:operational|commercial operation|operations)\b/i,
      /\b(?:began|commenced|started)\s+(?:commercial\s+)?operations\b/i,
      /\b(?:up and running|open for service|serving customers)\b/i,
    ],
    disqualifying: [
      /\b(?:not yet|not|never|no longer|has not|have not|had not|did not|will not)\b.{0,40}\b(?:operational|commercial operation|operations|up and running)\b/i,
      /\b(?:planned|expected|scheduled|forecast|will|would|could|may|might|plans? to|intends? to|target(?:s|ed)? to)\b.{0,50}\b(?:become|enter|reach|begin|commence|start|be)\b.{0,25}\b(?:operational|commercial operation|operations)\b/i,
      /\b(?:planned|expected|scheduled|forecast)\s+(?:to be\s+)?operational\b/i,
    ],
  },
  decommissioned: {
    positive: [/\b(?:decommissioned|closed|shut down|ceased operations)\b/i],
    disqualifying: [
      /\b(?:not|never|will not|plans? to)\b.{0,35}\b(?:decommission|close|shut down)\b/i,
      /\bplanned\s+(?:decommissioning|closure)\b/i,
    ],
  },
};
const POWER_STAGE_TEXT_RULES: Partial<Record<MaturityStage, MaturityTextRule>> = {
  application: {
    positive: [
      /\b(?:filed|submitted)\b.{0,40}\b(?:interconnection|grid connection|service)\s+application\b/i,
      /\b(?:interconnection|grid connection|service)\s+application\b.{0,30}\b(?:filed|submitted|accepted|pending)\b/i,
    ],
    disqualifying: [
      /\b(?:has not|have not|had not|did not|will not|not yet)\b.{0,35}\b(?:filed|submitted|accepted)\b.{0,25}\bapplication\b/i,
      /\b(?:interconnection|grid connection|service)\s+application\b.{0,35}\b(?:has not|have not|had not|did not|will not|not yet)\b.{0,20}\b(?:filed|submitted|accepted)\b/i,
      /\b(?:plans?|expects?|intends?)\s+to\s+(?:file|submit)\b.{0,25}\bapplication\b/i,
    ],
  },
  study: {
    positive: [
      /\b(?:interconnection|system impact|feasibility|grid)\s+study\b.{0,35}\b(?:underway|in progress|completed|complete|issued|delivered)\b/i,
      /\b(?:completed|complete|issued|delivered)\b.{0,35}\b(?:interconnection|system impact|feasibility|grid)\s+study\b/i,
    ],
    disqualifying: [
      /\b(?:study|studies)\b.{0,35}\b(?:not yet started|not started|not complete|not completed|has not begun)\b/i,
      /\b(?:planned|expected|scheduled|will|plans? to)\b.{0,40}\b(?:conduct|complete|issue)\b.{0,25}\bstud(?:y|ies)\b/i,
    ],
  },
  queue: {
    positive: [
      /\b(?:entered|joined|is in|remains in)\b.{0,35}\b(?:interconnection|grid connection|transmission)\s+queue\b/i,
      /\b(?:interconnection|grid connection|transmission)\s+queue\b.{0,35}\b(?:position|number|entry|active)\b/i,
    ],
    disqualifying: [
      /\b(?:not in|has not entered|did not enter|withdrawn from|removed from)\b.{0,35}\b(?:interconnection|grid connection|transmission)\s+queue\b/i,
      /\b(?:interconnection|grid connection|transmission)\s+queue\b.{0,40}\b(?:not active|inactive|withdrawn|removed|cancelled|canceled)\b/i,
      /\b(?:plans?|expects?|seeks?)\s+to\s+enter\b.{0,25}\bqueue\b/i,
    ],
  },
  agreement: {
    positive: [
      /\b(?:signed|executed|approved|effective)\b.{0,40}\b(?:interconnection|grid connection|service)\s+agreement\b/i,
      /\b(?:interconnection|grid connection|service)\s+agreement\b.{0,35}\b(?:signed|executed|approved|effective)\b/i,
    ],
    disqualifying: [
      /\b(?:not yet|not|has not|have not|had not|did not)\b.{0,35}\b(?:signed|executed|approved)\b.{0,25}\bagreement\b/i,
      /\b(?:interconnection|grid connection|service)\s+agreement\b.{0,35}\b(?:not yet|not|has not|have not|had not|did not)\b.{0,20}\b(?:signed|executed|approved)\b/i,
      /\b(?:planned|expected|scheduled|will|plans? to)\b.{0,35}\b(?:sign|execute|approve)\b.{0,25}\bagreement\b/i,
    ],
  },
  construction: {
    positive: [
      /\b(?:upgrade|interconnection|substation|transmission|grid)\b.{0,45}\b(?:construction|work)\b.{0,35}\b(?:underway|in progress|began|started|commenced)\b/i,
      /\b(?:began|started|commenced)\b.{0,35}\b(?:upgrade|interconnection|substation|transmission|grid)\b.{0,20}\b(?:construction|work)\b/i,
    ],
    disqualifying: [
      /\b(?:not yet|not|never|has not|have not|had not|did not|will not)\b.{0,45}\b(?:begun|started|commenced|underway)\b.{0,25}\b(?:upgrade|interconnection|substation|transmission|grid)\b/i,
      /\b(?:planned|expected|scheduled|forecast|will|would|could|may|might|plans? to|intends? to)\b.{0,45}\b(?:begin|start|commence)\b.{0,30}\b(?:upgrade|interconnection|substation|transmission|grid)\b/i,
    ],
  },
  energized: {
    positive: [
      /\b(?:facility|site|substation|connection|load)\b.{0,35}\b(?:is energized|was energized|has been energized|connected to the grid|receiving power|delivering power)\b/i,
      /\b(?:energized|connected to the grid|receiving power|delivering power)\b/i,
    ],
    disqualifying: [
      /\b(?:not yet|not|never|has not|have not|had not|did not|will not)\b.{0,40}\b(?:energized|connected to the grid|receiving power|delivering power)\b/i,
      /\b(?:planned|expected|scheduled|forecast|will|would|could|may|might|plans? to|target(?:s|ed)? to)\b.{0,45}\b(?:energize|energized|connect to the grid|receive power|deliver power)\b/i,
    ],
  },
};

function observationAffirmsStage(
  stateKey: ProjectMaturity["stateKey"],
  stage: MaturityStage,
  observation: EvidenceObservation,
): boolean {
  const rules = stateKey === "facility-lifecycle" ? FACILITY_STAGE_TEXT_RULES : POWER_STAGE_TEXT_RULES;
  const stageRule = rules[stage];
  if (!stageRule) return false;
  const valueText = typeof observation.value === "string" ? observation.value : "";
  const statement = [
    observation.claim,
    valueText,
    observation.developmentQualifier ?? "",
    observation.retainedPassage,
  ].join(" ").replace(/\s+/g, " ").trim();
  if (!stageRule.positive.some((pattern) => pattern.test(statement))) return false;
  if (stageRule.disqualifying.some((pattern) => pattern.test(statement))) return false;
  return true;
}

export function resolveProjectMaturity(
  state: ProjectStateRecord | undefined,
  stateKey: ProjectMaturity["stateKey"],
  observationsById: Map<string, EvidenceObservation>,
  freshnessById: ReadonlyMap<string, { status: "current" | "stale" | "future" | "unknown" }>,
  supersededIds: Set<string>,
  conflictingIds: Set<string>,
): ProjectMaturity {
  const base = {
    stateKey,
    state: state ?? null,
    supportingEvidenceIds: state ? [...state.supportingEvidenceIds].sort() : [],
    asOfDate: state?.asOfDate ?? null,
  };
  if (!state || state.state.status === "unknown") {
    return { ...base, status: "unknown", stage: null, reason: "No known maturity state was recorded." };
  }
  if (state.state.status === "not-applicable") {
    return { ...base, status: "not-applicable", stage: null, reason: state.state.reason };
  }
  if (typeof state.state.value !== "string" || !state.state.value.trim()) {
    return { ...base, status: "unknown", stage: null, reason: `Recorded state value is not a valid ${stateKey} stage.` };
  }
  const normalizedStage = state.state.value.trim().toLocaleLowerCase("en-US");
  const stage = MATURITY_STAGES[stateKey].find((candidate) => candidate === normalizedStage);
  if (!stage) {
    return { ...base, status: "unknown", stage: null, reason: `Recorded state value is not a recognized ${stateKey} stage.` };
  }
  if (state.supportingEvidenceIds.length === 0) {
    return { ...base, status: "unknown", stage: null, reason: "Maturity cannot advance without supporting evidence references." };
  }
  const failedReasons: string[] = [];
  for (const evidenceId of state.supportingEvidenceIds) {
    const observation = observationsById.get(evidenceId);
    if (!observation) {
      failedReasons.push(`Supporting evidence ${evidenceId} is not present in this projection.`);
      continue;
    }
    if (observation.dimension !== MATURITY_SUPPORT_DIMENSION[stateKey]) {
      failedReasons.push(`Supporting evidence ${evidenceId} is not from ${MATURITY_SUPPORT_DIMENSION[stateKey]}.`);
    }
    const freshness = freshnessById.get(evidenceId);
    if (!observation.eligibility.eligible) failedReasons.push(`Supporting evidence ${evidenceId} is ineligible.`);
    if (supersededIds.has(evidenceId)) failedReasons.push(`Supporting evidence ${evidenceId} is superseded.`);
    if (freshness?.status === "stale") failedReasons.push(`Supporting evidence ${evidenceId} is stale.`);
    if (freshness?.status === "future") failedReasons.push(`Supporting evidence ${evidenceId} has a future as-of, publication, observation, or effective date.`);
    if (!freshness || freshness.status === "unknown") failedReasons.push(`Supporting evidence ${evidenceId} has unknown freshness.`);
    if (conflictingIds.has(evidenceId)) failedReasons.push(`Supporting evidence ${evidenceId} is conflicting.`);
    if (!TRUSTED_MATURITY_QUALITY.has(observation.sourceQualityClassification)) {
      failedReasons.push(`Supporting evidence ${evidenceId} is not a direct verified or reported source.`);
    }
    if (observation.valueStatus !== "actual") {
      failedReasons.push(`Supporting evidence ${evidenceId} is not an actual observation.`);
    }
    if (!observationAffirmsStage(stateKey, stage, observation)) {
      failedReasons.push(
        `Supporting evidence ${evidenceId} does not affirm the current ${stateKey} stage ${stage} in its claim, value, qualifier, or retained passage.`,
      );
    }
  }
  if (failedReasons.length > 0) {
    return { ...base, status: "unknown", stage: null, reason: failedReasons.join(" ") };
  }
  return {
    ...base,
    status: "known",
    stage,
    reason: "Stage is supported by current, eligible, non-superseded, non-conflicting source evidence.",
  };
}