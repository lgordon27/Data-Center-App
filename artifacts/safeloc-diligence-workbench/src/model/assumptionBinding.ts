import {
  MODEL_LEASE_RATE_PER_KW_MONTH,
  MODEL_UTILIZATION_RAMP,
} from "@/model/cashFlowEngine";

/** Positive capacity limits used by the financial model's capacityMW input. */
export const CAPACITY_MW_MAX = 10_000;

export type CapacityUnit = "kW" | "MW" | "GW";
export type CapacityPowerMeasure = "it-capacity" | "utility-interconnection";
export type CapacityClaimStatus = "current" | "superseded" | "withdrawn";

export type CapacityScope =
  | { kind: "campus"; campusId?: string }
  | { kind: "phase"; phaseId: string; buildingCount: number }
  | { kind: "building"; buildingId: string };

export type CapacityClaim = {
  value: number;
  unit: CapacityUnit;
  powerMeasure: CapacityPowerMeasure;
  scope: CapacityScope;
  status: CapacityClaimStatus;
  sourceTitle: string;
  sourceUrl: string;
  sourceDate: string;
  humanAccepted: boolean;
};

export type CapacityClaimCandidateFinding = {
  id: string;
  assessment: "source-supported" | "attributed-report" | "ambiguous-unresolved";
  applicability: "exact-project" | "ambiguous";
  financialProposalEligibility: "eligible" | "ineligible" | "unresolved";
  projectScope: string;
  powerClaimState: "resolved" | "unresolved" | "not-present";
  powerClaim: {
    quantity: string;
    measure: string;
    status: "operating" | "planned" | "unknown";
    phaseScope: string | null;
    facilityScope: string | null;
  } | null;
  reportingDate: string | null;
  accessedAt: string | null;
  sourceTitle: string;
  sourceUrl: string;
};

export type CapacityClaimCandidate = {
  findingId: string;
  claim: CapacityClaim;
};

export type CapacityRampTiming = {
  rampStartMonth: number;
  stabilizedAtMonth: number;
};

export type CapacityAssumptionBindingInput = {
  claim?: CapacityClaim | null;
  scenarioScope: CapacityScope;
  rampTiming?: CapacityRampTiming;
  /** Analyst-supplied fraction converting utility interconnection MW to IT MW. */
  utilityToItFactor?: number;
  /** Human-entered fallback; used only when no claim binds. */
  illustrativeCapacityMW?: number;
};

export type CapacityProvenanceClassification =
  | "Sourced (source, date, accepted by user)"
  | "Analyst assumption"
  | "Model constant";

export type CapacityAssumptionExplanationItem = {
  input: string;
  classification: CapacityProvenanceClassification;
  detail: string;
};

export type CapacityBindingKind = "approved-scenario" | "sourced" | "illustrative" | "unknown";

export type CapacityBindingResult = {
  /** `null` is intentional: callers must not substitute the engine's default capacity. */
  modelInput: { capacityMW: number | null };
  binding: {
    kind: CapacityBindingKind;
    reason: string;
    claim?: CapacityClaim;
  };
  explanation: CapacityAssumptionExplanationItem[];
};

type ClaimResolution =
  | { kind: "bound"; capacityMW: number; reason: string }
  | { kind: "unbound"; reason: string };

function scopesMatch(claimScope: CapacityScope, scenarioScope: CapacityScope): boolean {
  if (claimScope.kind !== scenarioScope.kind) return false;

  switch (claimScope.kind) {
    case "campus":
      return (
        scenarioScope.kind === "campus" &&
        (claimScope.campusId ?? null) === (scenarioScope.campusId ?? null)
      );
    case "phase":
      return (
        scenarioScope.kind === "phase" &&
        claimScope.phaseId === scenarioScope.phaseId &&
        claimScope.buildingCount === scenarioScope.buildingCount
      );
    case "building":
      return scenarioScope.kind === "building" && claimScope.buildingId === scenarioScope.buildingId;
  }
}

function toMegawatts(value: number, unit: CapacityUnit): number {
  switch (unit) {
    case "kW":
      return value / 1_000;
    case "MW":
      return value;
    case "GW":
      return value * 1_000;
  }
}

function isValidCapacityMW(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= CAPACITY_MW_MAX;
}

function parseCapacityQuantity(quantity: string): { value: number; unit: CapacityUnit } | null {
  const match = quantity.trim().match(/^(\d+(?:\.\d+)?)\s*(kW|MW|GW)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].toUpperCase();
  return { value, unit: unit === "KW" ? "kW" : unit === "GW" ? "GW" : "MW" };
}

function validHttpSource(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Qualify one unambiguous, resolved whole-project IT capacity finding.
 * Other power measures and narrower or unclear scopes remain research-only.
 */
export function qualifyCapacityClaimCandidate(
  findings: readonly CapacityClaimCandidateFinding[],
  scenarioScope: CapacityScope,
): CapacityClaimCandidate | null {
  if (scenarioScope.kind !== "campus" || !scenarioScope.campusId) return null;
  const candidates: CapacityClaimCandidate[] = [];
  for (const finding of findings) {
    if (
      finding.assessment === "ambiguous-unresolved" ||
      finding.applicability !== "exact-project" ||
      finding.financialProposalEligibility !== "eligible" ||
      finding.projectScope !== "Source passage identifies the submitted project name and requested location." ||
      finding.powerClaimState !== "resolved" ||
      !finding.powerClaim ||
      finding.powerClaim.status === "unknown" ||
      finding.powerClaim.phaseScope !== null ||
      !["campus", "site", "facility", "project"].includes(finding.powerClaim.facilityScope ?? "") ||
      !/\b(?:IT|information technology|computing)\s+(?:load|capacity)\b/i.test(finding.powerClaim.measure) ||
      !finding.sourceTitle.trim() ||
      !validHttpSource(finding.sourceUrl)
    ) continue;

    const quantity = parseCapacityQuantity(finding.powerClaim.quantity);
    const sourceDate = finding.reportingDate ?? finding.accessedAt;
    if (!quantity || !sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) continue;
    const claim: CapacityClaim = {
      ...quantity,
      powerMeasure: "it-capacity",
      scope: { ...scenarioScope },
      status: "current",
      sourceTitle: finding.sourceTitle,
      sourceUrl: finding.sourceUrl,
      sourceDate,
      humanAccepted: false,
    };
    if (scopesMatch(claim.scope, scenarioScope)) {
      candidates.push({ findingId: finding.id, claim });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function resolveClaim(input: CapacityAssumptionBindingInput): ClaimResolution {
  const { claim } = input;
  if (!claim) return { kind: "unbound", reason: "No capacity claim was supplied." };
  if (!claim.humanAccepted) {
    return { kind: "unbound", reason: "The capacity claim has not been accepted by a user into this scenario." };
  }
  if (claim.status !== "current") {
    return { kind: "unbound", reason: `The capacity claim is ${claim.status}, not current.` };
  }
  if (!scopesMatch(claim.scope, input.scenarioScope)) {
    return { kind: "unbound", reason: "The capacity claim scope does not exactly match the scenario scope." };
  }
  if (!Number.isFinite(claim.value) || claim.value <= 0) {
    return { kind: "unbound", reason: "The capacity claim must have a finite positive value." };
  }

  let capacityMW = toMegawatts(claim.value, claim.unit);
  if (claim.powerMeasure === "utility-interconnection") {
    const factor = input.utilityToItFactor;
    if (factor === undefined) {
      return {
        kind: "unbound",
        reason: "A utility-interconnection claim needs an explicit utility-to-IT conversion factor.",
      };
    }
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
      return {
        kind: "unbound",
        reason: "The utility-to-IT conversion factor must be greater than 0 and no greater than 1.",
      };
    }
    capacityMW *= factor;
  }

  if (!isValidCapacityMW(capacityMW)) {
    return {
      kind: "unbound",
      reason: `The converted capacity must be greater than 0 and no more than ${CAPACITY_MW_MAX} MW.`,
    };
  }

  return {
    kind: "bound",
    capacityMW,
    reason: `The current, human-accepted ${claim.powerMeasure} claim matches the scenario scope.`,
  };
}

function formatScope(scope: CapacityScope): string {
  switch (scope.kind) {
    case "campus":
      return `campus${scope.campusId ? ` ${scope.campusId}` : ""}`;
    case "phase":
      return `phase ${scope.phaseId} (${scope.buildingCount} buildings)`;
    case "building":
      return `building ${scope.buildingId}`;
  }
}

/**
 * Describes the provenance and treatment of every supplied capacity/model assumption.
 * An unaccepted claim is explicitly excluded rather than being presented as sourced model input.
 */
export function explainCapacityAssumptions(
  input: CapacityAssumptionBindingInput,
): CapacityAssumptionExplanationItem[] {
  const resolution = resolveClaim(input);
  const explanation: CapacityAssumptionExplanationItem[] = [];

  if (input.claim) {
    const accepted = input.claim.humanAccepted;
    explanation.push({
      input: "capacity claim",
      classification: accepted
        ? "Sourced (source, date, accepted by user)"
        : "Analyst assumption",
      detail: [
        `${input.claim.value} ${input.claim.unit} ${input.claim.powerMeasure}`,
        `scope: ${formatScope(input.claim.scope)}`,
        `status: ${input.claim.status}`,
        `source: ${input.claim.sourceTitle} (${input.claim.sourceDate}; ${input.claim.sourceUrl})`,
        accepted
          ? "accepted by user"
          : "not accepted by user; treated as an unverified candidate and excluded from sourced model inputs",
        `binding: ${resolution.kind === "bound" ? "bound" : "not bound"} — ${resolution.reason}`,
      ].join("; "),
    });
  }

  explanation.push({
    input: "scenario scope",
    classification: "Analyst assumption",
    detail: formatScope(input.scenarioScope),
  });

  explanation.push({
    input: "lease rate per kW-month",
    classification: "Model constant",
    detail: `${MODEL_LEASE_RATE_PER_KW_MONTH}`,
  });
  explanation.push({
    input: "utilization ramp",
    classification: "Model constant",
    detail: MODEL_UTILIZATION_RAMP.join(", "),
  });
  if (input.rampTiming !== undefined) {
    explanation.push({
      input: "ramp timing",
      classification: "Analyst assumption",
      detail: `ramp starts at month ${input.rampTiming.rampStartMonth}; stabilized at month ${input.rampTiming.stabilizedAtMonth}`,
    });
  }
  if (input.utilityToItFactor !== undefined) {
    explanation.push({
      input: "utility-to-IT conversion factor",
      classification: "Analyst assumption",
      detail: `${input.utilityToItFactor}; ${input.claim?.powerMeasure === "utility-interconnection" ? "applied only to a utility-interconnection claim" : "not applied to the supplied claim"}`,
    });
  }
  if (input.illustrativeCapacityMW !== undefined) {
    const used =
      resolution.kind === "unbound" && isValidCapacityMW(input.illustrativeCapacityMW);
    explanation.push({
      input: "illustrative capacity",
      classification: "Analyst assumption",
      detail: `${input.illustrativeCapacityMW} MW, labeled Illustrative${used ? " and used because no claim binds" : " and not used"}`,
    });
  }

  return explanation;
}

/**
 * Binds a sourced capacity claim only after human acceptance and scope/measure checks.
 * Missing capacity remains `null`; a provided illustrative value is a labeled fallback.
 */
export function bindCapacityAssumption(
  input: CapacityAssumptionBindingInput,
): CapacityBindingResult {
  const resolution = resolveClaim(input);
  if (resolution.kind === "bound") {
    return {
      modelInput: { capacityMW: resolution.capacityMW },
      binding: {
        kind: "sourced",
        reason: resolution.reason,
        claim: input.claim ?? undefined,
      },
      explanation: explainCapacityAssumptions(input),
    };
  }

  const illustrativeCapacityMW = input.illustrativeCapacityMW;
  if (illustrativeCapacityMW !== undefined && isValidCapacityMW(illustrativeCapacityMW)) {
    return {
      modelInput: { capacityMW: illustrativeCapacityMW },
      binding: {
        kind: "illustrative",
        reason: "No capacity claim binds; the human-entered fallback is used and remains labeled Illustrative.",
      },
      explanation: explainCapacityAssumptions(input),
    };
  }

  return {
    modelInput: { capacityMW: null },
    binding: {
      kind: "unknown",
      reason:
        illustrativeCapacityMW === undefined
          ? `${resolution.reason} Capacity remains unknown.`
          : `${resolution.reason} The illustrative capacity is outside the valid positive-MW bounds, so capacity remains unknown.`,
    },
    explanation: explainCapacityAssumptions(input),
  };
}