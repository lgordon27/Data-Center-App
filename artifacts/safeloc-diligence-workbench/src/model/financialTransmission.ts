import { MAX_CAPACITY_MW, type EvidenceRecord } from "./cashFlowEngine.js";
import {
  assertSameProjectScope,
  type AcceptedModelInput,
  type EvidenceObservation,
  type ProofAcceptedInputEvent,
  type ProofLedgerProjection,
  type ProjectIdentity,
  type StoredProofLedgerEvent,
  type TransmissionProposal,
} from "./safelocProofContract.js";

export const FINANCIAL_TRANSMISSION_POLICY_VERSION = 1;
export const FINANCIAL_TRANSMISSION_MAX_EVIDENCE_AGE_DAYS = 365;

type FinancialTransmissionTarget =
  | "electricity_cost"
  | "electricity_escalation"
  | "water_consumption"
  | "water_escalation"
  | "grid_interconnection"
  | "cooling_capex"
  | "permitting_timeline"
  | "capacity_mw";

type UnitConversion = {
  canonicalUnit: string;
  convert: (value: number) => number;
};

type TargetPolicy = {
  dimension: EvidenceObservation["dimension"];
  minimum: number;
  maximum: number;
  unitConversions: Record<string, UnitConversion>;
};

const conversion = (canonicalUnit: string, multiplier: number): UnitConversion => ({
  canonicalUnit,
  convert: (value) => value * multiplier,
});

const TARGET_POLICIES: Record<FinancialTransmissionTarget, TargetPolicy> = {
  electricity_cost: {
    dimension: "electricity-tariff",
    minimum: 0,
    maximum: 5_000,
    unitConversions: {
      "usd/mwh": conversion("USD/MWh", 1),
      "cents/kwh": conversion("USD/MWh", 10),
      "usd/kwh": conversion("USD/MWh", 1_000),
      "usd/gwh": conversion("USD/MWh", 0.001),
    },
  },
  electricity_escalation: {
    dimension: "electricity-tariff",
    minimum: -100,
    maximum: 1_000,
    unitConversions: {
      "%": conversion("%", 1),
      percent: conversion("%", 1),
      fraction: conversion("%", 100),
      "basis points": conversion("%", 0.01),
      bps: conversion("%", 0.01),
    },
  },
  water_consumption: {
    dimension: "water-cooling",
    minimum: 0,
    maximum: 1_000_000,
    unitConversions: {
      "mgal/year": conversion("Mgal/year", 1),
      "million gallons/year": conversion("Mgal/year", 1),
      "gallons/year": conversion("Mgal/year", 0.000001),
      "gal/year": conversion("Mgal/year", 0.000001),
      "m3/year": conversion("Mgal/year", 0.000264172052),
      "m³/year": conversion("Mgal/year", 0.000264172052),
    },
  },
  water_escalation: {
    dimension: "water-cooling",
    minimum: -100,
    maximum: 1_000,
    unitConversions: {
      "%": conversion("%", 1),
      percent: conversion("%", 1),
      fraction: conversion("%", 100),
      "basis points": conversion("%", 0.01),
      bps: conversion("%", 0.01),
    },
  },
  grid_interconnection: {
    dimension: "power-grid-interconnection",
    minimum: 0,
    maximum: 240,
    unitConversions: {
      months: conversion("months", 1),
      days: conversion("months", 1 / 30.4375),
      weeks: conversion("months", 7 / 30.4375),
      years: conversion("months", 12),
    },
  },
  cooling_capex: {
    dimension: "water-cooling",
    minimum: 0,
    maximum: 100_000,
    unitConversions: {
      "usd millions": conversion("USD millions", 1),
      "usd million": conversion("USD millions", 1),
      "usd": conversion("USD millions", 0.000001),
      "usd thousands": conversion("USD millions", 0.001),
    },
  },
  permitting_timeline: {
    dimension: "permitting-entitlement",
    minimum: 0,
    maximum: 240,
    unitConversions: {
      months: conversion("months", 1),
      days: conversion("months", 1 / 30.4375),
      weeks: conversion("months", 7 / 30.4375),
      years: conversion("months", 12),
    },
  },
  capacity_mw: {
    dimension: "construction-phasing",
    minimum: 0,
    maximum: MAX_CAPACITY_MW,
    unitConversions: {
      mw: conversion("MW", 1),
      gw: conversion("MW", 1_000),
    },
  },
};

function isFinancialTarget(id: string): id is FinancialTransmissionTarget {
  return Object.prototype.hasOwnProperty.call(TARGET_POLICIES, id);
}

function normalizedUnit(unit: string | null | undefined) {
  return (unit ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function convertedValue(target: FinancialTransmissionTarget, value: string | number, unit: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const policy = TARGET_POLICIES[target];
  const conversion = policy.unitConversions[normalizedUnit(unit)];
  if (!conversion) return null;
  const converted = conversion.convert(value);
  return Number.isFinite(converted) ? { value: converted, unit: conversion.canonicalUnit } : null;
}

function sameValue(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * 1e-9;
}

function latestInputEvents(events: StoredProofLedgerEvent[]) {
  const latest = new Map<string, ProofAcceptedInputEvent>();
  for (const event of events) {
    if (event.eventType === "accepted-model-input") {
      latest.set(event.payload.input.inputId, event);
    }
  }
  return latest;
}

function proposalMatches(
  events: StoredProofLedgerEvent[],
  input: AcceptedModelInput,
  source: EvidenceObservation,
  target: FinancialTransmissionTarget,
  acceptedValue: { value: number; unit: string },
  project: ProjectIdentity,
): Extract<StoredProofLedgerEvent, { eventType: "transmission-proposal" }> | null {
  const latestProposals = new Map<string, Extract<StoredProofLedgerEvent, { eventType: "transmission-proposal" }>>();
  for (const event of events) {
    if (event.eventType === "transmission-proposal") {
      latestProposals.set(event.payload.proposal.proposalId, event);
    }
  }
  return [...latestProposals.values()].find((event) => {
    if (event.eventType !== "transmission-proposal") return false;
    const proposal: TransmissionProposal = event.payload.proposal;
    const proposed = convertedValue(target, proposal.proposedValue.value as string | number, proposal.proposedValue.unit ?? "");
    if (event.project.projectId !== project.projectId || proposal.project.projectId !== project.projectId) return false;
    return proposal.status === "accepted" &&
      proposal.mappingPolicyVersion === FINANCIAL_TRANSMISSION_POLICY_VERSION &&
      proposal.affectedVariable === target &&
      proposal.sourceEvidenceIds.includes(source.evidenceId) &&
      proposed !== null &&
      proposed.unit === acceptedValue.unit &&
      sameValue(proposed.value, acceptedValue.value) &&
      input.dimension === source.dimension;
  }) ?? null;
}

function sourceHasConflict(projection: ProofLedgerProjection, source: EvidenceObservation) {
  if (projection.supersededEvidenceIds.includes(source.evidenceId)) return true;
  return projection.evidence.some((observation) =>
    observation.evidenceId !== source.evidenceId &&
    observation.project.projectId === source.project.projectId &&
    (
      observation.conflictsWithEvidenceIds.includes(source.evidenceId) ||
      source.conflictsWithEvidenceIds.includes(observation.evidenceId)
    ),
  );
}

function sourceIsEligible(
  projection: ProofLedgerProjection,
  source: EvidenceObservation | undefined,
  input: AcceptedModelInput,
) {
  if (!source || source.evidenceId !== input.sourceEvidenceId || source.dimension !== input.dimension) return false;
  if (!source.eligibility.eligible || source.valueStatus === "unknown" || source.value === null) return false;
  if (
    !source.retainedPassageId.trim() ||
    !source.retainedPassage.trim() ||
    !source.sourceIds.some((sourceId) => sourceId.trim()) ||
    !source.eligibility.reason.trim()
  ) return false;
  if (source.sourceQualityClassification === "Missing Evidence" || source.conflictsWithEvidenceIds.length > 0) return false;
  const search = projection.searchesByDimension[source.dimension];
  if (!search || search.state !== "complete" || search.resolution !== "supported") return false;
  const projectionTime = Date.parse(projection.asOfRecordedAt);
  const sourceTime = Date.parse(source.asOfDate ?? source.publicationDate ?? "");
  const searchTime = Date.parse(search.observedAt);
  const maximumAgeMs = FINANCIAL_TRANSMISSION_MAX_EVIDENCE_AGE_DAYS * 24 * 60 * 60 * 1_000;
  if (
    !Number.isFinite(projectionTime) ||
    !Number.isFinite(sourceTime) ||
    !Number.isFinite(searchTime) ||
    sourceTime > projectionTime ||
    searchTime > projectionTime ||
    projectionTime - sourceTime > maximumAgeMs ||
    projectionTime - searchTime > maximumAgeMs
  ) return false;
  return !sourceHasConflict(projection, source);
}

function modelEvidenceFromAcceptedInput(
  existing: EvidenceRecord[string] | undefined,
  source: EvidenceObservation,
  input: AcceptedModelInput,
  target: FinancialTransmissionTarget,
  converted: { value: number; unit: string },
  classification: EvidenceObservation["sourceQualityClassification"],
): EvidenceRecord[string] {
  const label = existing?.label ?? target;
  return {
    ...(existing ?? {
      id: target,
      value: input.value,
      classification,
    }),
    id: target,
    label,
    value: source.value ?? input.value,
    numericValue: converted.value,
    rawValue: source.value ?? input.value,
    rawUnit: source.unit ?? input.unit,
    normalizedValue: converted.value,
    normalizedUnit: converted.unit,
    unit: converted.unit,
    classification,
    modelClassification: undefined,
    origin: "dossier",
    eligibleForModel: undefined,
    acceptedForModel: undefined,
    researchState: undefined,
    quarantineReasons: undefined,
    sources: undefined,
    coverageStatus: undefined,
    sourceId: source.sourceIds[0],
    sourceRole: `Accepted SafeLoc evidence (${source.valueStatus})`,
    citation: `${source.claim} — retained passage ${source.retainedPassageId}; source ${source.sourceIds.join(", ")}${source.asOfDate ? `; as of ${source.asOfDate}` : ""}. Human acceptance: ${input.acceptanceReason}`,
    description: source.retainedPassage,
  };
}

export type FinancialTransmissionResult = {
  evidence: EvidenceRecord;
  acceptedCapacityMW: number | null;
  appliedInputIds: string[];
  appliedInputs: AppliedFinancialProofInput[];
  ignoredInputReasons: Record<string, string>;
};

export type AppliedFinancialProofInput = {
  inputId: FinancialTransmissionTarget;
  inputEventId: string;
  proposalId: string;
  sourceEvidenceId: string;
  sourceValue: string | number | null;
  sourceUnit: string | null;
  sourceValueStatus: EvidenceObservation["valueStatus"];
  sourceQualityClassification: EvidenceObservation["sourceQualityClassification"];
  valueTreatment: "source-matched" | "reviewer-adjusted";
  currentValue: { value: string | number | null; unit: string | null };
  proposedValue: { value: string | number | null; unit: string | null };
  acceptedValue: { value: number; unit: string };
  acceptanceReason: string;
  decisionRef: string;
  mappingPolicyVersion: number;
  descriptiveFormula: string | null;
};

/**
 * Applies only explicitly accepted, ledger-backed proof inputs that satisfy a
 * versioned financial whitelist. Proposals themselves are descriptive and
 * never reach this model boundary without a separately accepted input event.
 */
export function applyAcceptedProofInputsToFinancialEvidence({
  evidence,
  project,
  projection,
}: {
  evidence: EvidenceRecord;
  project: ProjectIdentity;
  projection: ProofLedgerProjection;
}): FinancialTransmissionResult {
  const nextEvidence: EvidenceRecord = { ...evidence };
  const appliedInputIds: string[] = [];
  const appliedInputs: AppliedFinancialProofInput[] = [];
  const ignoredInputReasons: Record<string, string> = {};
  let acceptedCapacityMW: number | null = null;
  const sourceById = new Map(projection.evidence.map((item) => [item.evidenceId, item]));
  const acceptedEvents = latestInputEvents(projection.events);

  for (const [inputId, event] of acceptedEvents) {
    const input = event.payload.input;
    const source = sourceById.get(input.sourceEvidenceId);
    const reject = (reason: string) => {
      ignoredInputReasons[inputId] = reason;
    };
    try {
      assertSameProjectScope(project, event.project, "Accepted model input");
    } catch {
      reject("Accepted input belongs to a different project scope.");
      continue;
    }
    if (!event.decisionRef) {
      reject("Accepted input has no identified human decision.");
      continue;
    }
    if (!isFinancialTarget(inputId)) {
      reject("No whitelisted financial formula exists for this model input.");
      continue;
    }
    const policy = TARGET_POLICIES[inputId];
    if (inputId === "capacity_mw" && project.scope.kind !== "facility") {
      reject("Capacity inputs require facility-scoped proof.");
      continue;
    }
    if (input.dimension !== policy.dimension) {
      reject("Accepted input dimension does not match its whitelisted model target.");
      continue;
    }
    if (!sourceIsEligible(projection, source, input)) {
      reject("Source evidence is ineligible, unresolved, conflicting, superseded, or incompletely searched.");
      continue;
    }
    try {
      assertSameProjectScope(project, source!.project, "Accepted input source evidence");
    } catch {
      reject("Source evidence belongs to a different project scope.");
      continue;
    }
    const converted = convertedValue(inputId, input.value, input.unit);
    const sourceValue = convertedValue(inputId, source!.value as string | number, source!.unit ?? "");
    if (
      !converted ||
      converted.value < policy.minimum ||
      converted.value > policy.maximum ||
      !sourceValue
    ) {
      reject("Accepted input value or unit is unsupported by the whitelisted formula.");
      continue;
    }
    const proposalEvent = proposalMatches(projection.events, input, source!, inputId, converted, project);
    if (!proposalEvent) {
      reject("No accepted, version-compatible transmission proposal matches this input and source.");
      continue;
    }
    const proposal = proposalEvent.payload.proposal;
    const valueTreatment = sourceValue.unit === converted.unit && sameValue(sourceValue.value, converted.value)
      ? "source-matched" as const
      : "reviewer-adjusted" as const;
    appliedInputs.push({
      inputId,
      inputEventId: event.eventId,
      proposalId: proposal.proposalId,
      sourceEvidenceId: source!.evidenceId,
      sourceValue: source!.value,
      sourceUnit: source!.unit,
      sourceValueStatus: source!.valueStatus,
      sourceQualityClassification: source!.sourceQualityClassification,
      valueTreatment,
      currentValue: proposal.currentValue,
      proposedValue: proposal.proposedValue,
      acceptedValue: converted,
      acceptanceReason: input.acceptanceReason,
      decisionRef: event.decisionRef,
      mappingPolicyVersion: proposal.mappingPolicyVersion,
      descriptiveFormula: proposal.formula,
    });
    if (inputId === "capacity_mw") {
      if (converted.value <= 0) {
        reject("Accepted facility capacity must be greater than zero.");
        continue;
      }
      acceptedCapacityMW = converted.value;
      appliedInputIds.push(inputId);
      continue;
    }
    nextEvidence[inputId] = modelEvidenceFromAcceptedInput(
      evidence[inputId],
      source!,
      input,
      inputId,
      converted,
      valueTreatment === "source-matched" ? source!.sourceQualityClassification : "User Assumption",
    );
    appliedInputIds.push(inputId);
  }

  return {
    evidence: nextEvidence,
    acceptedCapacityMW,
    appliedInputIds: appliedInputIds.sort(),
    appliedInputs: appliedInputs.sort((left, right) => left.inputId.localeCompare(right.inputId)),
    ignoredInputReasons,
  };
}