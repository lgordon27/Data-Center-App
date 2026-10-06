import {
  calculateCashFlowModel,
  GOVERNED_FINANCIAL_OVERRIDE_MAPPING_POLICY_VERSION,
  MAX_CAPACITY_MW,
  type EvidenceRecord,
  type GovernedFinancialOverrides,
  calculateTraceableCashFlowModel,
  inventoryFinancialMethodology,
  type TraceableFinancialValues,
} from "./cashFlowEngine.js";
import {
  buildFinancialRegistry,
  type FinancialRegistry,
  type FinancialRegistryContext,
  type FinancialInputType,
} from "./financialInputProvenance";

export const ADJUSTABLE_FINANCIAL_INPUTS = [
  "discountRate", "exitCapRate", "leaseRate", "electricityPrice", "interestRate", "debtShare", "costPerMW", "deliveryDelay",
] as const;
export type AdjustableFinancialInput = typeof ADJUSTABLE_FINANCIAL_INPUTS[number];
export type FinancialAssumptionAudit = Readonly<{
  input: AdjustableFinancialInput; action: "edit" | "reset"; value: number | null; timestamp: string;
}>;
export type FinancialAssumptionSession = Readonly<{
  overrides: Readonly<Partial<Record<AdjustableFinancialInput, number>>>;
  audit: readonly FinancialAssumptionAudit[];
}>;
export const EMPTY_FINANCIAL_ASSUMPTIONS: FinancialAssumptionSession = Object.freeze({
  overrides: Object.freeze({}), audit: Object.freeze([]),
});
export function validFinancialAssumption(id: AdjustableFinancialInput, value: number) {
  if (!Number.isFinite(value)) return false;
  if (id === "discountRate") return value > -100;
  if (id === "debtShare") return value >= 0 && value < 100;
  if (id === "exitCapRate" || id === "costPerMW") return value > 0;
  return value >= 0;
}
export function editFinancialAssumption(session: FinancialAssumptionSession, input: AdjustableFinancialInput,
  value: number | null, timestamp: string): FinancialAssumptionSession {
  if (!ADJUSTABLE_FINANCIAL_INPUTS.includes(input) || (value !== null && !validFinancialAssumption(input, value))
    || !Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid financial assumption or timestamp.");
  const overrides = { ...session.overrides };
  if (value === null) delete overrides[input]; else overrides[input] = value;
  return Object.freeze({
    overrides: Object.freeze(overrides),
    audit: Object.freeze([...session.audit, Object.freeze({ input, value, action: value === null ? "reset" as const : "edit" as const, timestamp })]),
  });
}

export type FinancialRangeDriver = {
  id: string; label: string; lowDelta: number | null; highDelta: number | null; magnitude: number;
  lowReason: string | null; highReason: string | null;
  lowInput?: number; highInput?: number; unit?: string;
};
export type FinancialReturnRange = ReturnType<typeof buildEstimatedFinancialRange>;
const UNFAVORABLE_HIGH = new Set(["interestRate", "costPerMW", "deliveryDelay", "maintenancePerMW", "laborPerMW",
  "propertyTaxPerGW", "insuranceRate", "exitCapRate", "discountRate"]);

export function buildEstimatedFinancialRange(args: {
  evidence: EvidenceRecord; context: FinancialRegistryContext; session?: FinancialAssumptionSession;
}) {
  const defaults = inventoryFinancialMethodology(buildFinancialRegistry(args.context), args.evidence);
  const overrides = args.session?.overrides ?? {};
  const resolved = Object.fromEntries(Object.entries(defaults).map(([id, entry]) => {
    const value = overrides[id as AdjustableFinancialInput];
    return [id, value === undefined ? entry : Object.freeze({
      ...entry, value, low: value, high: value, type: "user-assumption" as const,
      applicability: "Your assumption — session only; the retained sourced default is unchanged.",
    })];
  }));
  // Dependent values remain derived, not independently frozen copies of old economics.
  if (resolved.capacityMW.value !== null && resolved.costPerMW.value !== null) {
    const directCost = resolved.capacityMW.value * resolved.costPerMW.value;
    if (overrides.debtShare === undefined && resolved.debtAmount.value !== null && directCost > 0) {
      const share = resolved.debtAmount.value / directCost * 100;
      resolved.debtShare = Object.freeze({ ...resolved.debtShare, value: share, low: share, high: share });
    }
    if (resolved.leaseRate.value !== null && resolved.leaseRate.low !== null && resolved.leaseRate.high !== null) {
      const daily = (lease: number) => resolved.capacityMW.value! * 1000 * lease * 12 / 365;
      resolved.downtimeCost = Object.freeze({ ...resolved.downtimeCost,
        value: daily(resolved.leaseRate.value), low: daily(resolved.leaseRate.low), high: daily(resolved.leaseRate.high) });
    }
  }
  const active: FinancialRegistry = Object.freeze(resolved);
  const counts: Record<FinancialInputType, number> = { disclosed: 0, benchmark: 0, derived: 0, "user-assumption": 0, blank: 0 };
  const publicInputs = Object.values(active).filter(entry => entry.visibility === "public");
  for (const entry of publicInputs) counts[entry.type]++;
  const missing = publicInputs.filter(entry => entry.required && (entry.type === "blank" || entry.provisional));
  const unsourced = publicInputs.filter(entry => entry.type === "blank" || entry.provisional
    || !entry.sourceUrl || !entry.asOfDate);
  function valuesFor(caseName: "cautious" | "central" | "favorable", single?: { id: string; value: number }) {
    const values: Record<string, number | null> = {};
    for (const entry of Object.values(active)) {
      values[entry.id] = caseName === "central" ? entry.value
        : caseName === "cautious" ? UNFAVORABLE_HIGH.has(entry.id) ? entry.high : entry.low
          : UNFAVORABLE_HIGH.has(entry.id) ? entry.low : entry.high;
    }
    if (single) values[single.id] = single.value;
    const debtShareOverride = overrides.debtShare !== undefined || single?.id === "debtShare";
    return {
      ...values,
      debtAmount: debtShareOverride && values.debtShare !== null && values.capacityMW !== null && values.costPerMW !== null
        ? values.debtShare * values.capacityMW * values.costPerMW / 100 : values.debtAmount,
    } as TraceableFinancialValues;
  }
  const cases = {
    cautious: calculateTraceableCashFlowModel(args.evidence, valuesFor("cautious")),
    central: calculateTraceableCashFlowModel(args.evidence, valuesFor("central")),
    favorable: calculateTraceableCashFlowModel(args.evidence, valuesFor("favorable")),
  };
  const central = cases.central.model?.projectIRR ?? null;
  const drivers: FinancialRangeDriver[] = publicInputs.filter(entry =>
    !["buildings", "reportedEquity", "leaseYears", "sofr", "totalCost", "downtimeCost", "utilityPassThrough"].includes(entry.id)
      && entry.low !== null && entry.high !== null
      && defaults[entry.id].low !== null && defaults[entry.id].high !== null).map(entry => {
    const low = calculateTraceableCashFlowModel(args.evidence, valuesFor("central", { id: entry.id, value: defaults[entry.id].low! }));
    const high = calculateTraceableCashFlowModel(args.evidence, valuesFor("central", { id: entry.id, value: defaults[entry.id].high! }));
    const lowDelta = central !== null && low.status === "meaningful" ? low.model.projectIRR! - central : null;
    const highDelta = central !== null && high.status === "meaningful" ? high.model.projectIRR! - central : null;
    return { id: entry.id, label: entry.label, lowDelta, highDelta, lowReason: low.reason, highReason: high.reason,
      lowInput: defaults[entry.id].low!, highInput: defaults[entry.id].high!, unit: entry.unit,
      magnitude: Math.max(Math.abs(lowDelta ?? 0), Math.abs(highDelta ?? 0)) };
  }).sort((a, b) => b.magnitude - a.magnitude || a.id.localeCompare(b.id)).slice(0, 6);
  const allMeaningful = Object.values(cases).every(result => result.status === "meaningful");
  const ordered = allMeaningful && cases.cautious.model!.projectIRR! <= central!
    && central! <= cases.favorable.model!.projectIRR!;
  const status = missing.length > 3 ? "insufficient-data" as const
    : !allMeaningful ? "undefined-return" as const
      : !ordered ? "unordered-return" as const : "estimated" as const;
  const label = status === "estimated"
    ? `Estimated return: roughly ${Math.round(cases.cautious.model!.projectIRR!)}-${Math.round(cases.favorable.model!.projectIRR!)}%`
    : status === "insufficient-data" ? "Not enough sourced data for an estimate"
      : "A meaningful return range is unavailable";
  return { defaults, active, counts, missing, unsourced, cases, drivers, status, label };
}
import {
  assertSameProjectScope,
  SAFELOC_PROOF_POLICY_VERSION,
  SAFELOC_PROOF_SCHEMA_VERSION,
  type ProofLedgerEvent,
  type AcceptedModelInput,
  type EvidenceObservation,
  type ProofAcceptedInputEvent,
  type ProofLedgerProjection,
  type ProofTransmissionEvent,
  type ProofUserDecision,
  type ProjectIdentity,
  type ProofVersions,
  type SearchAssessment,
  type StoredProofLedgerEvent,
  type TransmissionProposal,
} from "./safelocProofContract.js";

export const FINANCIAL_TRANSMISSION_POLICY_VERSION = 3;
export const FINANCIAL_TRANSMISSION_MAX_EVIDENCE_AGE_DAYS = 365;

export type FinancialTransmissionTarget =
  | "electricity_cost"
  | "electricity_escalation"
  | "water_consumption"
  | "water_escalation"
  | "grid_interconnection"
  | "cooling_capex"
  | "permitting_timeline"
  | "capacity_mw"
  | "cod_date"
  | "tenant_commencement_date"
  | "documented_direct_project_capex";

const CURRENT_FINANCIAL_TRANSMISSION_TARGETS = new Set<FinancialTransmissionTarget>([
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
]);

function isCurrentFinancialTransmissionTarget(target: unknown): target is FinancialTransmissionTarget {
  return typeof target === "string" &&
    CURRENT_FINANCIAL_TRANSMISSION_TARGETS.has(target as FinancialTransmissionTarget);
}

function requireCurrentFinancialTransmissionTarget(target: unknown): asserts target is FinancialTransmissionTarget {
  if (!isCurrentFinancialTransmissionTarget(target)) {
    throw new Error("Financial target is outside the current first-slice allowlist.");
  }
}

const DATE_TARGETS = {
  cod_date: {
    dimension: "construction-phasing",
    formulaId: "cod-date-to-readiness-months-v1",
    kind: "cod",
  },
  tenant_commencement_date: {
    dimension: "tenant-counterparty",
    formulaId: "tenant-date-to-readiness-months-v1",
    kind: "tenant-commencement",
  },
} as const;

const DIRECT_CAPEX_SCOPE = "facility-total-direct-capex-excluding-contingency" as const;
const DIRECT_CAPEX_AFFECTED_VARIABLE = `documented_direct_project_capex:${DIRECT_CAPEX_SCOPE}`;
type NormalizedTargetValue = { value: number | string; unit: string };

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
  cod_date: {
    dimension: "construction-phasing",
    minimum: 0,
    maximum: 0,
    unitConversions: {},
  },
  tenant_commencement_date: {
    dimension: "tenant-counterparty",
    minimum: 0,
    maximum: 0,
    unitConversions: {},
  },
  documented_direct_project_capex: {
    dimension: "financing-capital",
    minimum: 0,
    maximum: 100_000,
    unitConversions: {
      "usd millions": conversion("USD millions", 1),
      "usd million": conversion("USD millions", 1),
      usd: conversion("USD millions", 0.000001),
      "usd thousands": conversion("USD millions", 0.001),
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
  if (target in DATE_TARGETS) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const policy = TARGET_POLICIES[target];
  const conversion = policy.unitConversions[normalizedUnit(unit)];
  if (!conversion) return null;
  const converted = conversion.convert(value);
  return Number.isFinite(converted) ? { value: converted, unit: conversion.canonicalUnit } : null;
}

function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function normalizeTargetValue(
  target: FinancialTransmissionTarget,
  value: string | number,
  unit: string | null | undefined,
): NormalizedTargetValue | null {
  const dateTarget = DATE_TARGETS[target as keyof typeof DATE_TARGETS];
  if (dateTarget) {
    return normalizedUnit(unit) === "date" && isISODate(value)
      ? { value, unit: "date" }
      : null;
  }
  if (!isFinancialTarget(target)) return null;
  return convertedValue(target, value, unit ?? "");
}

function normalizedValueWithinPolicy(target: FinancialTransmissionTarget, normalized: NormalizedTargetValue | null) {
  if (!normalized) return false;
  if (typeof normalized.value !== "number") return target in DATE_TARGETS;
  if (
    (target === "capacity_mw" || target === "documented_direct_project_capex") &&
    normalized.value <= 0
  ) return false;
  const policy = TARGET_POLICIES[target];
  return normalized.value >= policy.minimum && normalized.value <= policy.maximum;
}

export function expectedAffectedVariable(target: FinancialTransmissionTarget) {
  requireCurrentFinancialTransmissionTarget(target);
  return target === "documented_direct_project_capex" ? DIRECT_CAPEX_AFFECTED_VARIABLE : target;
}

function formulaIdForTarget(target: FinancialTransmissionTarget) {
  if (target in DATE_TARGETS) {
    return DATE_TARGETS[target as keyof typeof DATE_TARGETS].formulaId;
  }
  if (target === "documented_direct_project_capex") return "absolute-facility-direct-capex-v1";
  return `${target}-unit-normalization-v1`;
}

function sameModelStartDate(
  left: GovernedFinancialOverrides["modelStartDate"] | undefined,
  right: GovernedFinancialOverrides["modelStartDate"] | undefined,
) {
  return Boolean(left && right && left.date === right.date && left.reference.trim() === right.reference.trim());
}

function dateFormulaId(target: FinancialTransmissionTarget) {
  return target === "cod_date"
    ? "cod-date-to-readiness-months-v1"
    : "tenant-date-to-readiness-months-v1";
}

function parseDateFormulaAnchor(target: FinancialTransmissionTarget, formula: string | null) {
  if (target !== "cod_date" && target !== "tenant_commencement_date") return null;
  const prefix = `${dateFormulaId(target)}|model-start=`;
  if (!formula?.startsWith(prefix)) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(formula.slice(prefix.length))) as Record<string, unknown>;
    if (
      Object.keys(parsed).sort().join(",") !== "date,reference" ||
      !isISODate(parsed.date) ||
      typeof parsed.reference !== "string" ||
      !parsed.reference.trim()
    ) return null;
    const anchor = { date: parsed.date, reference: parsed.reference.trim() };
    return formula === `${prefix}${encodeURIComponent(JSON.stringify(anchor))}` ? anchor : null;
  } catch {
    return null;
  }
}

export function financialTransmissionFormulaDescription(
  target: FinancialTransmissionTarget,
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"],
) {
  requireCurrentFinancialTransmissionTarget(target);
  if (target === "cod_date" || target === "tenant_commencement_date") {
    if (!modelStartDate || !isISODate(modelStartDate.date) || !modelStartDate.reference.trim()) {
      throw new Error("Date formula descriptors require a valid explicit model-start anchor.");
    }
    return `${dateFormulaId(target)}|model-start=${encodeURIComponent(JSON.stringify({
      date: modelStartDate.date,
      reference: modelStartDate.reference.trim(),
    }))}`;
  }
  if (target === "documented_direct_project_capex") {
    return "replace-facility-total-direct-capex-excluding-contingency; no capacity rescale; synthetic debt unchanged";
  }
  return `normalize-${target}-with-versioned-unit-whitelist-v${FINANCIAL_TRANSMISSION_POLICY_VERSION}`;
}

function proposalFormulaMatches(
  target: FinancialTransmissionTarget,
  formula: string | null,
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"],
) {
  if (target === "cod_date" || target === "tenant_commencement_date") {
    const storedAnchor = parseDateFormulaAnchor(target, formula);
    return Boolean(storedAnchor && (!modelStartDate || sameModelStartDate(storedAnchor, modelStartDate)));
  }
  return formula === financialTransmissionFormulaDescription(target);
}

function sameValue(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * 1e-9;
}

function stableCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableCanonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableCanonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameProject(expected: ProjectIdentity, actual: ProjectIdentity) {
  try {
    assertSameProjectScope(expected, actual, "Transmission event");
    return true;
  } catch {
    return false;
  }
}

function orderedProjectEvents(
  events: StoredProofLedgerEvent[],
  project: ProjectIdentity,
  asOfRecordedAt?: string,
) {
  const cutoff = asOfRecordedAt ? Date.parse(asOfRecordedAt) : Number.POSITIVE_INFINITY;
  return events
    .filter((event) =>
      sameProject(project, event.project) &&
      Number.isFinite(Date.parse(event.recordedAt)) &&
      Date.parse(event.recordedAt) <= cutoff,
    )
    .slice()
    .sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt) || left.eventId.localeCompare(right.eventId),
    );
}

function latestInputEvents(events: StoredProofLedgerEvent[], project: ProjectIdentity) {
  const latest = new Map<string, ProofAcceptedInputEvent>();
  for (const event of orderedProjectEvents(events, project)) {
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
  acceptedValue: NormalizedTargetValue,
  project: ProjectIdentity,
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"],
): Extract<StoredProofLedgerEvent, { eventType: "transmission-proposal" }> | null {
  const targetKey = expectedAffectedVariable(target);
  const latestProposal = orderedProjectEvents(events, project)
    .filter((event): event is Extract<StoredProofLedgerEvent, { eventType: "transmission-proposal" }> =>
      event.eventType === "transmission-proposal" &&
      event.payload.proposal.affectedVariable === targetKey,
    )
    .at(-1);
  if (!latestProposal) return null;
  const proposal: TransmissionProposal = latestProposal.payload.proposal;
  const proposed = normalizeTargetValue(target, proposal.proposedValue.value as string | number, proposal.proposedValue.unit);
  const sameProposedValue = proposed && proposed.unit === acceptedValue.unit &&
    (typeof proposed.value === "number" && typeof acceptedValue.value === "number"
      ? sameValue(proposed.value, acceptedValue.value)
      : proposed.value === acceptedValue.value);
  return proposal.status === "accepted" &&
    proposal.quantificationClass === "quantified" &&
    (proposal.supportLevel === "supported" || proposal.supportLevel === "strong") &&
    proposal.mappingPolicyVersion === FINANCIAL_TRANSMISSION_POLICY_VERSION &&
    proposalFormulaMatches(target, proposal.formula, modelStartDate) &&
    sameProject(project, proposal.project) &&
    proposal.sourceEvidenceIds.includes(source.evidenceId) &&
    sameProposedValue &&
    input.dimension === source.dimension
    ? latestProposal
    : null;
}

function sourceHasConflict(
  projection: ProofLedgerProjection,
  project: ProjectIdentity,
  source: EvidenceObservation,
) {
  const projectEvents = orderedProjectEvents(projection.events, project, projection.asOfRecordedAt);
  const supersededEvidenceIds = new Set<string>();
  for (const event of projectEvents) {
    if (event.eventType === "supersession") supersededEvidenceIds.add(event.payload.supersededEvidenceId);
    if (event.eventType === "evidence-observation") {
      event.payload.evidence.supersedesEvidenceIds.forEach((id) => supersededEvidenceIds.add(id));
    }
  }
  if (supersededEvidenceIds.has(source.evidenceId)) return true;
  return projection.evidence.some((observation) =>
    observation.evidenceId !== source.evidenceId &&
    sameProject(project, observation.project) &&
    (
      observation.conflictsWithEvidenceIds.includes(source.evidenceId) ||
      source.conflictsWithEvidenceIds.includes(observation.evidenceId)
    ),
  );
}

function latestProjectSearch(
  projection: ProofLedgerProjection,
  project: ProjectIdentity,
  dimension: EvidenceObservation["dimension"],
): SearchAssessment | null {
  const searchEvent = orderedProjectEvents(projection.events, project, projection.asOfRecordedAt)
    .filter((event) =>
      event.eventType === "search-assessment" &&
      event.payload.search.dimension === dimension,
    )
    .at(-1);
  return searchEvent?.eventType === "search-assessment" ? searchEvent.payload.search : null;
}

function passageAssertions(passage: string) {
  return passage.split(/(?<=[.!?])\s+|[;\n]+/u).map((assertion) => assertion.trim()).filter(Boolean);
}

type PassageUnitPattern = { unit: string; pattern: RegExp; requiresDollarPrefix?: boolean };

function passageUnitPatterns(target: FinancialTransmissionTarget): PassageUnitPattern[] {
  if (target === "electricity_cost") return [
    { unit: "cents/kwh", pattern: /^\s*cents?\s*(?:\/|per)\s*kwh\b/i },
    { unit: "usd/mwh", pattern: /^\s*usd\s*\/\s*mwh\b/i },
    { unit: "usd/mwh", pattern: /^\s*\/\s*mwh\b/i, requiresDollarPrefix: true },
    { unit: "usd/kwh", pattern: /^\s*usd\s*\/\s*kwh\b/i },
    { unit: "usd/gwh", pattern: /^\s*usd\s*\/\s*gwh\b/i },
  ];
  if (target === "electricity_escalation" || target === "water_escalation") return [
    { unit: "%", pattern: /^\s*%/i },
    { unit: "percent", pattern: /^\s*percent(?:age)?\b/i },
    { unit: "basis points", pattern: /^\s*basis points?\b/i },
    { unit: "bps", pattern: /^\s*bps\b/i },
    { unit: "fraction", pattern: /^\s*fractions?\b/i },
    { unit: "fraction", pattern: /^\s*ratios?\b/i },
  ];
  if (target === "water_consumption") return [
    { unit: "mgal/year", pattern: /^\s*mgal(?:lons?)?\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "million gallons/year", pattern: /^\s*million gallons?\s*(?:\/|per)\s*year\b/i },
    { unit: "gallons/year", pattern: /^\s*gallons?\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "gal/year", pattern: /^\s*gal\s*\/\s*(?:year|yr)\b/i },
    { unit: "m3/year", pattern: /^\s*m3\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "m³/year", pattern: /^\s*m³\s*(?:\/|per)\s*(?:year|yr)\b/i },
    { unit: "m3/year", pattern: /^\s*cubic meters?\s*(?:\/|per)\s*year\b/i },
  ];
  if (target === "cooling_capex" || target === "documented_direct_project_capex") return [
    { unit: "usd millions", pattern: /^\s*usd\s*(?:millions?|mm)\b/i },
    { unit: "usd thousands", pattern: /^\s*usd\s*(?:thousands?|k)\b/i },
    { unit: "usd", pattern: /^\s*usd\b/i },
    { unit: "usd millions", pattern: /^\s*(?:millions?|m|mn)\b/i, requiresDollarPrefix: true },
    { unit: "usd thousands", pattern: /^\s*(?:thousands?|k)\b/i, requiresDollarPrefix: true },
  ];
  if (target === "capacity_mw") return [
    { unit: "mw", pattern: /^\s*mw\b/i },
    { unit: "gw", pattern: /^\s*gw\b/i },
    { unit: "mw", pattern: /^\s*megawatts?\b/i },
    { unit: "gw", pattern: /^\s*gigawatts?\b/i },
  ];
  if (target === "grid_interconnection" || target === "permitting_timeline") return [
    { unit: "months", pattern: /^\s*months?\b/i },
    { unit: "months", pattern: /^\s*mos?\b/i },
    { unit: "days", pattern: /^\s*days?\b/i },
    { unit: "weeks", pattern: /^\s*weeks?\b/i },
    { unit: "weeks", pattern: /^\s*wks?\b/i },
    { unit: "years", pattern: /^\s*years?\b/i },
    { unit: "years", pattern: /^\s*yrs?\b/i },
  ];
  return [];
}

function passageMeasurements(assertion: string, target: FinancialTransmissionTarget) {
  const result: NormalizedTargetValue[] = [];
  const numericMatches = assertion.matchAll(/[-+]?\d[\d,]*(?:\.\d+)?/g);
  const unitPatterns = passageUnitPatterns(target);
  for (const match of numericMatches) {
    const index = match.index ?? 0;
    const numericValue = Number(match[0].replaceAll(",", ""));
    if (!Number.isFinite(numericValue)) continue;
    const preceding = assertion.slice(Math.max(0, index - 8), index);
    const dollarPrefix = /\$\s*$/.test(preceding);
    const suffix = assertion.slice(index + match[0].length);
    for (const { unit, pattern, requiresDollarPrefix } of unitPatterns) {
      if (requiresDollarPrefix && !dollarPrefix) continue;
      if (!pattern.test(suffix)) continue;
      const normalized = normalizeTargetValue(target, numericValue, unit);
      if (normalized && typeof normalized.value === "number") result.push(normalized);
    }
    if (
      dollarPrefix &&
      (target === "cooling_capex" || target === "documented_direct_project_capex") &&
      !unitPatterns.some(({ pattern }) => pattern.test(suffix))
    ) {
      const normalized = normalizeTargetValue(target, numericValue, "USD");
      if (normalized && typeof normalized.value === "number") result.push(normalized);
    }
  }
  return result;
}

function normalizedPhraseInAssertion(assertion: string, phrase: string) {
  const normalizedAssertion = ` ${normalizedUnit(assertion).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const normalizedPhrase = ` ${normalizedUnit(phrase).replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  return normalizedPhrase.trim().length > 0 && normalizedAssertion.includes(normalizedPhrase);
}

function exactFacilityScopeInAssertion(project: ProjectIdentity, assertion: string) {
  return project.scope.kind === "facility" &&
    [project.scope.key, project.scope.label]
      .some((reference) => Boolean(reference?.trim()) && normalizedPhraseInAssertion(assertion, reference!));
}

function dateBoundToMilestone(assertion: string, target: FinancialTransmissionTarget, date: string) {
  const label = target === "cod_date"
    ? /\b(?:cod|commercial\s+operation\s+date)\b/gi
    : /\btenant\s+commencement(?:\s+date)?\b/gi;
  const otherMilestone = target === "cod_date"
    ? /\btenant\s+commencement(?:\s+date)?\b/gi
    : /\b(?:cod|commercial\s+operation\s+date)\b/gi;
  for (const match of assertion.matchAll(label)) {
    const labelStart = match.index ?? 0;
    const start = labelStart + match[0].length;
    const following = assertion.slice(start, start + 100);
    const nextDate = following.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (!nextDate || nextDate[0] !== date || nextDate.index === undefined || nextDate.index > 80) continue;
    const relation = following.slice(0, nextDate.index);
    if (new RegExp(otherMilestone.source, "i").test(relation)) continue;
    const previousMilestoneEnd = [...assertion.matchAll(otherMilestone)]
      .filter((previous) => (previous.index ?? 0) + previous[0].length <= labelStart)
      .reduce((latest, previous) => Math.max(latest, (previous.index ?? 0) + previous[0].length), 0);
    const relationStart = Math.max(previousMilestoneEnd, labelStart - 120);
    return { relation: assertion.slice(relationStart, start + nextDate.index + date.length) };
  }
  return null;
}

function statusSupportedByAssertion(
  target: FinancialTransmissionTarget,
  source: EvidenceObservation,
  assertion: string,
  targetRelation = assertion,
) {
  if (source.valueStatus === "unknown") return false;
  const plannedLanguage = /\b(?:planned|target(?:ed)?|scheduled|forecast|expected|anticipated|projected)\b/i;
  const estimateLanguage = /\b(?:budget(?:ed)?|estimate(?:d)?|preliminary)\b/i;
  if (source.valueStatus === "actual") {
    return !/\b(?:planned|forecast|expected|anticipated|projected|budget(?:ed)?|estimate(?:d)?)\b/i.test(assertion);
  }
  const qualifier = source.developmentQualifier?.trim();
  if (!qualifier || !normalizedPhraseInAssertion(assertion, qualifier)) return false;
  if (target === "cod_date" || target === "tenant_commencement_date") {
    return source.valueStatus === "forecast" && plannedLanguage.test(targetRelation);
  }
  if (target === "capacity_mw") {
    return (source.valueStatus === "forecast" || source.valueStatus === "estimate") &&
      /\b(?:it load|information technology load)\b/i.test(assertion) &&
      plannedLanguage.test(assertion);
  }
  if (target === "cooling_capex" || target === "documented_direct_project_capex") {
    return (source.valueStatus === "estimate" || source.valueStatus === "forecast") &&
      (estimateLanguage.test(assertion) || plannedLanguage.test(assertion));
  }
  if (target === "water_consumption") {
    return (source.valueStatus === "estimate" || source.valueStatus === "forecast") &&
      /\b(?:cooling|design)\b/i.test(assertion) &&
      (estimateLanguage.test(assertion) || plannedLanguage.test(assertion));
  }
  return false;
}

function passageSupportsFinancialTarget(
  project: ProjectIdentity,
  target: FinancialTransmissionTarget,
  source: EvidenceObservation,
) {
  const assertions = passageAssertions(source.retainedPassage)
    .filter((assertion) => exactFacilityScopeInAssertion(project, assertion));
  if (!assertions.length) return false;
  if (target in DATE_TARGETS) {
    if (typeof source.value !== "string" || !isISODate(source.value)) return false;
    return assertions.some((assertion) => {
      const match = dateBoundToMilestone(assertion, target, source.value as string);
      return Boolean(match && statusSupportedByAssertion(target, source, assertion, match.relation));
    });
  }
  if (typeof source.value !== "number" || !source.unit) return false;
  const normalizedSource = normalizeTargetValue(target, source.value, source.unit);
  if (!normalizedSource || typeof normalizedSource.value !== "number") return false;
  return assertions.some((assertion) => {
    const measurements = passageMeasurements(assertion, target);
    const measureSupported = (() => {
      const text = assertion.toLocaleLowerCase("en-US");
      switch (target) {
        case "electricity_cost":
          return /\b(?:electricity|power)\b/.test(text) && /\b(?:tariff|rate|price|cost)\b/.test(text);
        case "electricity_escalation":
          return /\b(?:electricity|power)\b/.test(text) && /\b(?:escalation|increase|growth)\b/.test(text);
        case "water_consumption":
          return /\bwater\b/.test(text) && /\b(?:annual|annually|per year|yearly)\b/.test(text);
        case "water_escalation":
          return /\bwater\b/.test(text) && /\b(?:escalation|increase|growth)\b/.test(text);
        case "grid_interconnection":
          return /\b(?:grid|interconnection|utility connection)\b/.test(text) && /\b(?:timeline|delay|interconnection)\b/.test(text);
        case "cooling_capex":
          return /\bcooling\b/.test(text) && /\b(?:capex|capital|cost|expenditure)\b/.test(text);
        case "permitting_timeline":
          return /\b(?:permitting|permit|entitlement)\b/.test(text) && /\b(?:timeline|duration|delay|period)\b/.test(text);
        case "capacity_mw":
          return /\b(?:it load|information technology load)\b/.test(text) &&
            !/\b(?:utility|interconnection|nameplate|generator)\b/.test(text);
        case "documented_direct_project_capex":
          return /\b(?:total|aggregate|entire|overall)\b/.test(text) &&
            /\b(?:direct (?:project )?capex|direct capital (?:cost|expenditure)s?)\b/.test(text) &&
            /\bfacility\b/.test(text) &&
            /\bexcluding contingenc(?:y|ies)\b/.test(text) &&
            !/\b(?:campus|cooling[- ]only|phase[- ](?:only|one|1)|building[- ]only)\b/.test(text);
        case "cod_date":
        case "tenant_commencement_date":
          return false;
      }
    })();
    return measureSupported &&
      statusSupportedByAssertion(target, source, assertion) &&
      measurements.some((measurement) =>
        typeof measurement.value === "number" &&
        sameValue(measurement.value, normalizedSource.value as number),
      );
  });
}

function sourceIsEligible(
  projection: ProofLedgerProjection,
  project: ProjectIdentity,
  source: EvidenceObservation | undefined,
  input: AcceptedModelInput,
  target: FinancialTransmissionTarget,
) {
  if (!source || source.evidenceId !== input.sourceEvidenceId || source.dimension !== input.dimension) return false;
  if (!sameProject(project, source.project)) return false;
  if (
    !source.eligibility.eligible ||
    source.valueStatus === "unknown" ||
    source.sourceQualityClassification !== "Verified Evidence" ||
    source.value === null
  ) return false;
  if (
    !source.retainedPassageId.trim() ||
    !source.retainedPassage.trim() ||
    !source.sourceIds.some((sourceId) => sourceId.trim()) ||
    !source.eligibility.reason.trim()
  ) return false;
  if (source.conflictsWithEvidenceIds.length > 0) return false;
  const latestSearch = latestProjectSearch(projection, project, source.dimension);
  if (!latestSearch) return false;
  if (latestSearch.state !== "complete" || latestSearch.resolution !== "supported") return false;
  const projectionTime = Date.parse(projection.asOfRecordedAt);
  const sourceTime = Date.parse(source.asOfDate ?? source.publicationDate ?? "");
  const publicationTime = source.publicationDate ? Date.parse(source.publicationDate) : null;
  const searchTime = Date.parse(latestSearch.observedAt);
  const observationTime = Date.parse(source.observedAt);
  const maximumAgeMs = FINANCIAL_TRANSMISSION_MAX_EVIDENCE_AGE_DAYS * 24 * 60 * 60 * 1_000;
  if (
    !Number.isFinite(projectionTime) ||
    !Number.isFinite(sourceTime) ||
    (publicationTime !== null && !Number.isFinite(publicationTime)) ||
    !Number.isFinite(searchTime) ||
    !Number.isFinite(observationTime) ||
    sourceTime > projectionTime ||
    (publicationTime !== null && publicationTime > projectionTime) ||
    searchTime > projectionTime ||
    observationTime > projectionTime ||
    projectionTime - sourceTime > maximumAgeMs ||
    projectionTime - searchTime > maximumAgeMs
  ) return false;
  if (!passageSupportsFinancialTarget(project, target, source)) return false;
  return !sourceHasConflict(projection, project, source);
}

type FinancialSourceQualification =
  | { ok: true; sourceValue: NormalizedTargetValue; acceptedValue: NormalizedTargetValue }
  | { ok: false; reason: string };

function qualifyFinancialSourceValue({
  projection,
  project,
  target,
  source,
  proposedValue,
  proposedUnit,
}: {
  projection: ProofLedgerProjection;
  project: ProjectIdentity;
  target: FinancialTransmissionTarget;
  source: EvidenceObservation;
  proposedValue: string | number;
  proposedUnit: string;
}): FinancialSourceQualification {
  const input: AcceptedModelInput = {
    inputId: target,
    sourceEvidenceId: source.evidenceId,
    dimension: TARGET_POLICIES[target].dimension,
    value: proposedValue,
    unit: proposedUnit,
    acceptanceReason: "Qualification only; no acceptance is implied.",
  };
  if (!sourceIsEligible(projection, project, source, input, target)) {
    return { ok: false, reason: "Source passage, target-compatible value status, facility scope, freshness, or supported search does not qualify." };
  }
  const acceptedValue = normalizeTargetValue(target, proposedValue, proposedUnit);
  const sourceValue = typeof source.value === "string" || typeof source.value === "number"
    ? normalizeTargetValue(target, source.value, source.unit)
    : null;
  if (!acceptedValue || !normalizedValueWithinPolicy(target, acceptedValue) || !sourceValue) {
    return { ok: false, reason: "Accepted and source values must use whitelisted units and remain within the target range." };
  }
  return { ok: true, acceptedValue, sourceValue };
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
    capacityBasis: target === "water_consumption" || target === "cooling_capex"
      ? "facility-absolute"
      : existing?.capacityBasis,
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
  modelOverrides: GovernedFinancialOverrides;
  appliedInputIds: string[];
  appliedInputs: AppliedFinancialProofInput[];
  ignoredInputReasons: Record<string, string>;
};

export type VerifiedFinancialDecisionContext = {
  decisionId: string;
  project: ProjectIdentity;
  actorKind: "authenticated";
  action: "accept";
  targetRef: string;
};

export type AppliedFinancialProofInput = {
  inputId: FinancialTransmissionTarget;
  project: ProjectIdentity;
  projectScope: ProjectIdentity["scope"];
  inputEventId: string;
  proposalId: string;
  sourceEvidenceId: string;
  sourceValue: string | number | null;
  sourceUnit: string | null;
  sourceValueStatus: EvidenceObservation["valueStatus"];
  sourceQualityClassification: EvidenceObservation["sourceQualityClassification"];
  sourceDevelopmentQualifier: string | null;
  sourceAsOfDate: string | null;
  sourcePublicationDate: string | null;
  sourceObservedAt: string;
  sourceIds: string[];
  retainedPassageId: string;
  retainedPassage: string;
  searchAssessmentId: string;
  searchState: SearchAssessment["state"];
  searchResolution: SearchAssessment["resolution"];
  searchObservedAt: string;
  projectionAsOfRecordedAt: string;
  evidenceAgeDays: number;
  valueTreatment: "source-matched" | "reviewer-adjusted";
  currentValue: { value: string | number | null; unit: string | null };
  proposedValue: { value: string | number | null; unit: string | null };
  acceptedValue: NormalizedTargetValue;
  acceptanceReason: string;
  decisionRef: string;
  decisionAction: "accept";
  decisionActorKind: "authenticated";
  formulaId: string;
  formulaVersion: number;
  mappingPolicyVersion: number;
  proposalQuantificationClass: TransmissionProposal["quantificationClass"];
  proposalSupportLevel: TransmissionProposal["supportLevel"];
  proposalStatus: TransmissionProposal["status"];
  descriptiveFormula: string | null;
  modelStartDate: string | null;
  modelStartDateReference: string | null;
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
  modelStartDate,
  verifiedDecisions = [],
}: {
  evidence: EvidenceRecord;
  project: ProjectIdentity;
  projection: ProofLedgerProjection;
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"];
  verifiedDecisions?: readonly VerifiedFinancialDecisionContext[];
}): FinancialTransmissionResult {
  const nextEvidence: EvidenceRecord = { ...evidence };
  const appliedInputIds: string[] = [];
  const appliedInputs: AppliedFinancialProofInput[] = [];
  const ignoredInputReasons: Record<string, string> = {};
  let acceptedCapacityMW: number | null = null;
  const modelOverrides: GovernedFinancialOverrides = {};
  const projectEvents = orderedProjectEvents(projection.events, project, projection.asOfRecordedAt);
  const sourceById = new Map<string, EvidenceObservation[]>();
  for (const item of projection.evidence.filter((item) => sameProject(project, item.project))) {
    sourceById.set(item.evidenceId, [...(sourceById.get(item.evidenceId) ?? []), item]);
  }
  const acceptedEvents = latestInputEvents(projectEvents, project);

  for (const [inputId, event] of acceptedEvents) {
    const input = event.payload.input;
    const sourceCandidates = sourceById.get(input.sourceEvidenceId) ?? [];
    const source = sourceCandidates.length === 1 ? sourceCandidates[0] : undefined;
    const reject = (reason: string) => {
      ignoredInputReasons[inputId] = reason;
    };
    try {
      assertSameProjectScope(project, event.project, "Accepted model input");
    } catch {
      reject("Accepted input belongs to a different project scope.");
      continue;
    }
    if (!event.decisionRef?.trim() || !input.acceptanceReason.trim()) {
      reject("Accepted input has no identified human decision or acceptance reason.");
      continue;
    }
    if (!isCurrentFinancialTransmissionTarget(inputId)) {
      reject("Financial input is outside the current first-slice allowlist.");
      continue;
    }
    if (!isFinancialTarget(inputId)) {
      reject("No whitelisted financial formula exists for this model input.");
      continue;
    }
    const policy = TARGET_POLICIES[inputId];
    if (project.scope.kind !== "facility") {
      reject("Financial inputs require facility-scoped proof.");
      continue;
    }
    if (input.dimension !== policy.dimension) {
      reject("Accepted input dimension does not match its whitelisted model target.");
      continue;
    }
    try {
      assertSameProjectScope(project, source!.project, "Accepted input source evidence");
    } catch {
      reject("Source evidence belongs to a different project scope.");
      continue;
    }
    const qualification = qualifyFinancialSourceValue({
      projection,
      project,
      target: inputId,
      source: source!,
      proposedValue: input.value,
      proposedUnit: input.unit,
    });
    if (!qualification.ok) {
      reject(qualification.reason);
      continue;
    }
    const normalized = qualification.acceptedValue;
    const sourceValue = qualification.sourceValue;
    const proposalEvent = proposalMatches(projectEvents, input, source!, inputId, normalized, project, modelStartDate);
    if (!proposalEvent) {
      reject("The latest proposal is not accepted, quantified, supported, version-compatible, and source-matched.");
      continue;
    }
    const proposal = proposalEvent.payload.proposal;
    const verifiedDecision = verifiedDecisions.find((decision) =>
      decision.decisionId === event.decisionRef &&
      decision.actorKind === "authenticated" &&
      decision.action === "accept" &&
      decision.targetRef === proposal.proposalId &&
      sameProject(project, decision.project),
    );
    if (!verifiedDecision) {
      reject("Accepted input is not bound to a verified authenticated acceptance decision for this exact proposal.");
      continue;
    }
    const proposalAnchor = parseDateFormulaAnchor(inputId, proposal.formula);
    if (
      proposalAnchor &&
      ((modelStartDate && !sameModelStartDate(proposalAnchor, modelStartDate)) ||
        (modelOverrides.modelStartDate && !sameModelStartDate(proposalAnchor, modelOverrides.modelStartDate)))
    ) {
      reject("Accepted date proposal model-start anchor differs from the requested or previously accepted replay anchor.");
      continue;
    }
    const sourceAsOfDate = source!.asOfDate ?? source!.publicationDate;
    const sourceTime = Date.parse(sourceAsOfDate ?? "");
    const projectionTime = Date.parse(projection.asOfRecordedAt);
    const latestSearch = latestProjectSearch(projection, project, source!.dimension);
    if (!latestSearch) {
      reject("No current supported search assessment is available for source evidence.");
      continue;
    }
    const valueTreatment = sourceValue.unit === normalized.unit &&
      (typeof sourceValue.value === "number" && typeof normalized.value === "number"
        ? sameValue(sourceValue.value, normalized.value)
        : sourceValue.value === normalized.value)
      ? "source-matched" as const
      : "reviewer-adjusted" as const;
    appliedInputs.push({
      inputId,
      project,
      projectScope: project.scope,
      inputEventId: event.eventId,
      proposalId: proposal.proposalId,
      sourceEvidenceId: source!.evidenceId,
      sourceValue: source!.value,
      sourceUnit: source!.unit,
      sourceValueStatus: source!.valueStatus,
      sourceQualityClassification: source!.sourceQualityClassification,
      sourceDevelopmentQualifier: source!.developmentQualifier,
      sourceAsOfDate,
      sourcePublicationDate: source!.publicationDate,
      sourceObservedAt: source!.observedAt,
      sourceIds: [...source!.sourceIds],
      retainedPassageId: source!.retainedPassageId,
      retainedPassage: source!.retainedPassage,
      searchAssessmentId: latestSearch.searchId,
      searchState: latestSearch.state,
      searchResolution: latestSearch.resolution,
      searchObservedAt: latestSearch.observedAt,
      projectionAsOfRecordedAt: projection.asOfRecordedAt,
      evidenceAgeDays: Math.floor((projectionTime - sourceTime) / (24 * 60 * 60 * 1_000)),
      valueTreatment,
      currentValue: proposal.currentValue,
      proposedValue: proposal.proposedValue,
      acceptedValue: normalized,
      acceptanceReason: input.acceptanceReason,
      decisionRef: event.decisionRef,
      decisionAction: verifiedDecision.action,
      decisionActorKind: verifiedDecision.actorKind,
      formulaId: formulaIdForTarget(inputId),
      formulaVersion: 1,
      mappingPolicyVersion: proposal.mappingPolicyVersion,
      proposalQuantificationClass: proposal.quantificationClass,
      proposalSupportLevel: proposal.supportLevel,
      proposalStatus: proposal.status,
      descriptiveFormula: proposal.formula,
      modelStartDate: proposalAnchor?.date ?? null,
      modelStartDateReference: proposalAnchor?.reference ?? null,
    });
    if (inputId === "capacity_mw") {
      if (typeof normalized.value !== "number" || normalized.value <= 0) {
        reject("Accepted facility capacity must be greater than zero.");
        appliedInputs.pop();
        continue;
      }
      acceptedCapacityMW = normalized.value;
      appliedInputIds.push(inputId);
      continue;
    }
    if (inputId in DATE_TARGETS) {
      const replayAnchor = proposalAnchor ?? modelStartDate;
      if (typeof normalized.value !== "string" || !replayAnchor) {
        reject("Absolute readiness dates require a valid ISO date and explicit model start reference.");
        appliedInputs.pop();
        continue;
      }
      const dateTarget = DATE_TARGETS[inputId as keyof typeof DATE_TARGETS];
      modelOverrides.modelStartDate = replayAnchor;
      modelOverrides.readinessDates = [
        ...(modelOverrides.readinessDates ?? []),
        {
          kind: dateTarget.kind,
          date: normalized.value,
          sourceEvidenceIds: [source!.evidenceId],
          formulaId: dateTarget.formulaId,
          formulaVersion: 1,
          mappingPolicyVersion: GOVERNED_FINANCIAL_OVERRIDE_MAPPING_POLICY_VERSION,
        },
      ];
      appliedInputIds.push(inputId);
      continue;
    }
    if (inputId === "documented_direct_project_capex") {
      if (typeof normalized.value !== "number" || normalized.value <= 0) {
        reject("Documented facility direct CAPEX must be a positive scoped amount.");
        appliedInputs.pop();
        continue;
      }
      modelOverrides.directCapex = {
        scope: DIRECT_CAPEX_SCOPE,
        amountUSDMillions: normalized.value,
        sourceEvidenceIds: [source!.evidenceId],
        formulaId: "absolute-facility-direct-capex-v1",
        formulaVersion: 1,
        mappingPolicyVersion: GOVERNED_FINANCIAL_OVERRIDE_MAPPING_POLICY_VERSION,
      };
      appliedInputIds.push(inputId);
      continue;
    }
    if (typeof normalized.value !== "number") {
      reject("A numeric financial model target cannot accept a date value.");
      appliedInputs.pop();
      continue;
    }
    const converted = { value: normalized.value, unit: normalized.unit };
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

  if (modelOverrides.directCapex) {
    const coolingIndex = appliedInputIds.indexOf("cooling_capex");
    if (coolingIndex >= 0) {
      appliedInputIds.splice(coolingIndex, 1);
      const auditIndex = appliedInputs.findIndex((item) => item.inputId === "cooling_capex");
      if (auditIndex >= 0) appliedInputs.splice(auditIndex, 1);
      nextEvidence.cooling_capex = evidence.cooling_capex;
      ignoredInputReasons.cooling_capex =
        "The accepted total direct project CAPEX replaces the cooling component to prevent double counting.";
    }
  }

  return {
    evidence: nextEvidence,
    acceptedCapacityMW,
    modelOverrides,
    appliedInputIds: appliedInputIds.sort(),
    appliedInputs: appliedInputs.sort((left, right) => left.inputId.localeCompare(right.inputId)),
    ignoredInputReasons,
  };
}

export type FinancialTransmissionRepository = {
  recordDecision: (decision: ProofUserDecision) => Promise<void>;
  appendEvent: (event: ProofLedgerEvent) => Promise<StoredProofLedgerEvent>;
};

export type FinancialTransmissionDecisionTransactionContext = {
  projection: ProofLedgerProjection;
  repository: FinancialTransmissionRepository;
  verifyDecision: (decisionId: string) => Promise<VerifiedFinancialDecisionContext | null>;
};

export type FinancialTransmissionDecisionTransaction = {
  withLockedProject<T>(
    project: ProjectIdentity,
    operation: (context: FinancialTransmissionDecisionTransactionContext) => Promise<T>,
  ): Promise<T>;
};

export type TrustedFinancialTransmissionActorResolver = () =>
  Promise<ProofUserDecision["actor"] | null>;

export type FinancialTransmissionDecisionRequest = {
  project: ProjectIdentity;
  proposal: TransmissionProposal;
  target: FinancialTransmissionTarget;
  action: "accept" | "reject" | "defer";
  decisionId: string;
  acceptedInputEventId: string;
  proposalStatusEventId: string;
  rationale: string;
  acceptanceReason?: string;
  versions: ProofVersions;
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"];
  decidedAt?: string;
};

export function createFinancialTransmissionDecisionService({
  transaction,
  resolveTrustedActor,
}: {
  transaction: FinancialTransmissionDecisionTransaction;
  resolveTrustedActor: TrustedFinancialTransmissionActorResolver;
}) {
  return async function decideFinancialTransmissionProposal(request: FinancialTransmissionDecisionRequest) {
    requireCurrentFinancialTransmissionTarget(request.target);
    const actor = await resolveTrustedActor();
    if (!actor) throw new Error("Financial decisions require an injected trusted server authentication capability.");
    return transaction.withLockedProject(request.project, async (context) => {
      const existingDecisionRefs = [...new Set(context.projection.events
        .filter((event) => event.eventType === "accepted-model-input" && event.decisionRef)
        .map((event) => event.decisionRef!)
      )];
      const existingVerifiedDecisions = (await Promise.all(
        existingDecisionRefs.map((decisionRef) => context.verifyDecision(decisionRef)),
      )).filter((decision): decision is VerifiedFinancialDecisionContext => Boolean(decision));
      const guardedRepository: FinancialTransmissionRepository = {
        recordDecision: async (decision) => {
          if (
            stableCanonical(decision.actor) !== stableCanonical(actor) ||
            !sameProject(request.project, decision.project) ||
            decision.targetRef !== request.proposal.proposalId ||
            decision.decision !== request.action
          ) {
            throw new Error("Decision does not match the trusted actor, project, action, or exact proposal.");
          }
          await context.repository.recordDecision(decision);
        },
        appendEvent: async (event) => {
          if (event.eventType === "accepted-model-input") {
            const verified = event.decisionRef
              ? await context.verifyDecision(event.decisionRef)
              : null;
            if (
              !verified ||
              verified.actorKind !== "authenticated" ||
              verified.action !== "accept" ||
              verified.targetRef !== request.proposal.proposalId ||
              !sameProject(request.project, verified.project)
            ) {
              throw new Error("Accepted input requires a verified authenticated accept decision for this exact proposal.");
            }
          }
          return context.repository.appendEvent(event);
        },
      };
      return decideFinancialTransmissionProposalWithinTransaction({
        ...request,
        actor,
        projection: context.projection,
        verifiedDecisions: existingVerifiedDecisions,
        repository: guardedRepository,
      });
    });
  };
}

export function generateFinancialTransmissionProposal({
  target,
  project,
  projection,
  sourceEvidenceId,
  proposalId,
  currentValue,
  modelStartDate,
}: {
  target: FinancialTransmissionTarget;
  project: ProjectIdentity;
  projection: ProofLedgerProjection;
  sourceEvidenceId: string;
  proposalId: string;
  currentValue?: TransmissionProposal["currentValue"];
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"];
}): TransmissionProposal {
  requireCurrentFinancialTransmissionTarget(target);
  if (!isFinancialTarget(target)) throw new Error("No whitelisted financial formula exists for this proposal.");
  if (!proposalId.trim()) throw new Error("Financial transmission proposals require an ID.");
  if (project.scope.kind !== "facility") throw new Error("Financial transmission proposals require facility scope.");
  if (target in DATE_TARGETS &&
    (!modelStartDate || !isISODate(modelStartDate.date) || !modelStartDate.reference.trim())) {
    throw new Error("Date-based proposals require an explicit model start date and reference.");
  }
  const matches = projection.evidence.filter((item) =>
    item.evidenceId === sourceEvidenceId && sameProject(project, item.project),
  );
  if (matches.length !== 1) throw new Error("Proposal source evidence is missing, duplicated, or outside project scope.");
  const source = matches[0];
  if (typeof source.value !== "string" && typeof source.value !== "number") {
    throw new Error("Proposal source evidence must have a quantified value.");
  }
  const qualification = qualifyFinancialSourceValue({
    projection,
    project,
    target,
    source,
    proposedValue: source.value,
    proposedUnit: source.unit ?? "",
  });
  if (!qualification.ok) {
    throw new Error(qualification.reason);
  }
  const normalized = qualification.acceptedValue;
  return {
    proposalId,
    project,
    sourceEvidenceIds: [sourceEvidenceId],
    affectedVariable: expectedAffectedVariable(target),
    currentValue: currentValue ?? { value: null, unit: normalized.unit },
    proposedValue: { value: normalized.value, unit: normalized.unit },
    mechanism: `${source.claim} — ${financialTransmissionFormulaDescription(target, modelStartDate)}.`,
    quantificationClass: "quantified",
    formula: financialTransmissionFormulaDescription(target, modelStartDate),
    supportLevel: "supported",
    status: "proposed",
    mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
  };
}

export async function appendFinancialTransmissionProposal({
  repository,
  project,
  proposal,
  eventId,
  versions,
  effectiveAt = new Date().toISOString(),
}: {
  repository: Pick<FinancialTransmissionRepository, "appendEvent">;
  project: ProjectIdentity;
  proposal: TransmissionProposal;
  eventId: string;
  versions: ProofVersions;
  effectiveAt?: string;
}) {
  requireCurrentFinancialTransmissionTarget(proposal.affectedVariable);
  if (
    proposal.mappingPolicyVersion !== FINANCIAL_TRANSMISSION_POLICY_VERSION ||
    !proposalFormulaMatches(proposal.affectedVariable, proposal.formula)
  ) {
    throw new Error("Only a current first-slice proposal with an approved formula can be appended.");
  }
  assertSameProjectScope(project, proposal.project, "Transmission proposal");
  const event: ProofTransmissionEvent = {
    eventId,
    eventType: "transmission-proposal",
    project,
    effectiveAt,
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: { proposal },
  };
  return repository.appendEvent(event);
}

export function previewFinancialTransmissionProposal({
  evidence,
  project,
  projection,
  proposal,
  target,
  modelStartDate,
  capacityMW,
  allowGeneratedProposal = false,
  verifiedDecisions = [],
}: {
  evidence: EvidenceRecord;
  project: ProjectIdentity;
  projection: ProofLedgerProjection;
  proposal: TransmissionProposal;
  target: FinancialTransmissionTarget;
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"];
  capacityMW: number | null;
  allowGeneratedProposal?: boolean;
  verifiedDecisions?: readonly VerifiedFinancialDecisionContext[];
}) {
  requireCurrentFinancialTransmissionTarget(target);
  assertSameProjectScope(project, proposal.project, "Transmission preview");
  const targetProposals = orderedProjectEvents(projection.events, project, projection.asOfRecordedAt)
    .filter((event) =>
      event.eventType === "transmission-proposal" &&
      event.payload.proposal.affectedVariable === expectedAffectedVariable(target),
    );
  const latestStoredProposalEvent = targetProposals.at(-1);
  const latestStoredProposal = latestStoredProposalEvent?.eventType === "transmission-proposal"
    ? latestStoredProposalEvent.payload.proposal
    : null;
  const proposalAlreadyStored = targetProposals.some((event) =>
    event.eventType === "transmission-proposal" &&
    event.payload.proposal.proposalId === proposal.proposalId,
  );
  if (
    proposal.status === "rejected" ||
    proposal.status === "withdrawn" ||
    proposal.status === "superseded" ||
    proposal.affectedVariable !== expectedAffectedVariable(target)
  ) {
    throw new Error("Only a current, in-scope proposal for the requested target can be previewed.");
  }
  if (proposalAlreadyStored && latestStoredProposal?.proposalId !== proposal.proposalId) {
    throw new Error("A superseded transmission proposal cannot be previewed as the current candidate.");
  }
  if (latestStoredProposal?.proposalId === proposal.proposalId) {
    if (
      latestStoredProposal.status !== proposal.status ||
      stableCanonical(latestStoredProposal) !== stableCanonical(proposal)
    ) {
      throw new Error("Proposal contents differ from the latest canonical ledger state.");
    }
  } else if (!allowGeneratedProposal || proposalAlreadyStored || proposal.status !== "proposed") {
    throw new Error("Only the latest canonical proposal or an explicitly generated, unstored proposal can be previewed.");
  }
  if (!proposalFormulaMatches(target, proposal.formula, modelStartDate)) {
    throw new Error("Proposal formula descriptor or replay anchor is not an approved whitelist descriptor.");
  }
  const currentMapping = applyAcceptedProofInputsToFinancialEvidence({
    evidence,
    project,
    projection,
    modelStartDate,
    verifiedDecisions,
  });
  const versions = projection.events.at(-1)?.versions ?? {
    schemaVersion: SAFELOC_PROOF_SCHEMA_VERSION,
    policyVersion: SAFELOC_PROOF_POLICY_VERSION,
    modelVersion: null,
  };
  const recordedAt = new Date(Date.parse(projection.asOfRecordedAt) + 1).toISOString();
  const acceptedProposal = { ...proposal, status: "accepted" as const };
  const proposalEvent: StoredProofLedgerEvent = {
    eventId: `financial-preview-${target}-proposal`,
    eventType: "transmission-proposal",
    project,
    effectiveAt: recordedAt,
    recordedAt,
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: { proposal: acceptedProposal },
  };
  const input: AcceptedModelInput = {
    inputId: target,
    sourceEvidenceId: proposal.sourceEvidenceIds[0],
    dimension: TARGET_POLICIES[target].dimension,
    value: proposal.proposedValue.value as string | number,
    unit: proposal.proposedValue.unit ?? "",
    acceptanceReason: "Preview only; no human model acceptance has been recorded.",
  };
  const acceptedInputEvent: StoredProofLedgerEvent = {
    eventId: `financial-preview-${target}-accepted-input`,
    eventType: "accepted-model-input",
    project,
    effectiveAt: recordedAt,
    recordedAt,
    researchRunId: null,
    versions,
    decisionRef: `preview-only:${proposal.proposalId}`,
    payload: { input },
  };
  const previewDecision: VerifiedFinancialDecisionContext = {
    decisionId: acceptedInputEvent.decisionRef!,
    project,
    actorKind: "authenticated",
    action: "accept",
    targetRef: proposal.proposalId,
  };
  const mapped = applyAcceptedProofInputsToFinancialEvidence({
    evidence,
    project,
    projection: {
      ...projection,
      asOfRecordedAt: recordedAt,
      events: [...projection.events, proposalEvent, acceptedInputEvent],
    },
    modelStartDate,
    verifiedDecisions: [...verifiedDecisions, previewDecision],
  });
  if (!mapped.appliedInputIds.includes(target)) {
    throw new Error(mapped.ignoredInputReasons[target] ?? "Proposal did not pass the financial model boundary.");
  }
  const before = calculateCashFlowModel(
    currentMapping.evidence,
    currentMapping.acceptedCapacityMW ?? capacityMW ?? undefined,
    currentMapping.modelOverrides,
  );
  const after = calculateCashFlowModel(
    mapped.evidence,
    mapped.acceptedCapacityMW ?? capacityMW ?? undefined,
    mapped.modelOverrides,
  );
  return {
    status: "preview-only" as const,
    proposal,
    mappedInputIds: mapped.appliedInputIds,
    modelOverrides: mapped.modelOverrides,
    ignoredInputReasons: mapped.ignoredInputReasons,
    before,
    after,
    projectIRRDelta: before.projectIRR === null || after.projectIRR === null
      ? null
      : after.projectIRR - before.projectIRR,
  };
}

async function decideFinancialTransmissionProposalWithinTransaction({
  repository,
  project,
  projection,
  proposal,
  target,
  action,
  actor,
  decisionId,
  acceptedInputEventId,
  proposalStatusEventId,
  rationale,
  acceptanceReason,
  versions,
  modelStartDate,
  verifiedDecisions,
  decidedAt = new Date().toISOString(),
}: {
  repository: FinancialTransmissionRepository;
  project: ProjectIdentity;
  projection: ProofLedgerProjection;
  proposal: TransmissionProposal;
  target: FinancialTransmissionTarget;
  action: "accept" | "reject" | "defer";
  actor: ProofUserDecision["actor"];
  decisionId: string;
  acceptedInputEventId: string;
  proposalStatusEventId: string;
  rationale: string;
  acceptanceReason?: string;
  versions: ProofVersions;
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"];
  verifiedDecisions: readonly VerifiedFinancialDecisionContext[];
  decidedAt?: string;
}) {
  requireCurrentFinancialTransmissionTarget(target);
  assertSameProjectScope(project, proposal.project, "Transmission decision");
  if (!rationale.trim() || !decisionId.trim()) throw new Error("Transmission decisions require an ID and rationale.");
  const targetKey = expectedAffectedVariable(target);
  const latestProposalEvent = orderedProjectEvents(projection.events, project, projection.asOfRecordedAt)
    .filter((event) =>
      event.eventType === "transmission-proposal" &&
      event.payload.proposal.affectedVariable === targetKey,
    )
    .at(-1);
  const latestProposal = latestProposalEvent?.eventType === "transmission-proposal"
    ? latestProposalEvent.payload.proposal
    : null;
  if (
    !latestProposal ||
    latestProposal.proposalId !== proposal.proposalId ||
    latestProposal.status !== "proposed" ||
    proposal.status !== "proposed" ||
    proposal.affectedVariable !== targetKey ||
    proposal.mappingPolicyVersion !== FINANCIAL_TRANSMISSION_POLICY_VERSION ||
    !proposalFormulaMatches(target, proposal.formula, modelStartDate) ||
    !sameProject(project, latestProposal.project) ||
    !sameProject(project, proposal.project) ||
    stableCanonical(latestProposal) !== stableCanonical(proposal)
  ) {
      throw new Error("Only the exact latest proposed, scope-compatible, version-compatible transmission proposal can be decided.");
  }
  if (action === "accept") {
    if (
      project.scope.kind !== "facility" ||
      proposal.quantificationClass !== "quantified" ||
      (proposal.supportLevel !== "supported" && proposal.supportLevel !== "strong")
    ) {
      throw new Error("Accepted proposals require quantified, supported, facility-scoped proof.");
    }
    if (proposal.sourceEvidenceIds.length !== 1) {
      throw new Error("Accepted financial proposals require exactly one source observation.");
    }
    const sourceMatches = projection.evidence.filter((item) =>
      item.evidenceId === proposal.sourceEvidenceIds[0] && sameProject(project, item.project),
    );
    if (sourceMatches.length !== 1) throw new Error("Accepted proposal must have exactly one in-scope source record.");
    const source = sourceMatches[0];
    const input: AcceptedModelInput = {
      inputId: target,
      sourceEvidenceId: source.evidenceId,
      dimension: TARGET_POLICIES[target].dimension,
      value: proposal.proposedValue.value as string | number,
      unit: proposal.proposedValue.unit ?? "",
      acceptanceReason: acceptanceReason?.trim() ?? "",
    };
    const qualification = qualifyFinancialSourceValue({
      projection,
      project,
      target,
      source,
      proposedValue: input.value,
      proposedUnit: input.unit,
    });
    if (!qualification.ok) {
      throw new Error(qualification.reason);
    }
    if (
      target in DATE_TARGETS &&
      (!modelStartDate || !sameModelStartDate(
        parseDateFormulaAnchor(target, proposal.formula) ?? undefined,
        modelStartDate,
      ))
    ) {
      throw new Error("Date acceptance requires the exact model-start anchor persisted in the proposal formula descriptor.");
    }
    if (!input.acceptanceReason) throw new Error("Proposal acceptance requires a human acceptance reason.");
    const decision: ProofUserDecision = {
      decisionId,
      project,
      actor,
      decision: action,
      targetRef: proposal.proposalId,
      rationale: rationale.trim(),
      decidedAt,
      versions,
    };
    const inputEvent: ProofAcceptedInputEvent = {
      eventId: acceptedInputEventId,
      eventType: "accepted-model-input",
      project,
      effectiveAt: decidedAt,
      researchRunId: null,
      versions,
      decisionRef: decisionId,
      payload: { input },
    };
    const acceptedProposalEvent: ProofTransmissionEvent = {
      eventId: proposalStatusEventId,
      eventType: "transmission-proposal",
      project,
      effectiveAt: decidedAt,
      researchRunId: null,
      versions,
      decisionRef: null,
      payload: { proposal: { ...proposal, status: "accepted" } },
    };
    if (actor.kind === "authenticated") {
      const projectionTime = Date.parse(projection.asOfRecordedAt);
      if (!Number.isFinite(projectionTime)) {
        throw new Error("The locked project projection has an invalid replay timestamp.");
      }
      const prospectiveRecordedAt = new Date(projectionTime + 1).toISOString();
      const prospectiveProjection: ProofLedgerProjection = {
        ...projection,
        asOfRecordedAt: prospectiveRecordedAt,
        events: [
          ...projection.events,
          { ...inputEvent, recordedAt: prospectiveRecordedAt },
          { ...acceptedProposalEvent, recordedAt: prospectiveRecordedAt },
        ],
      };
      const prospective = applyAcceptedProofInputsToFinancialEvidence({
        evidence: {},
        project,
        projection: prospectiveProjection,
        verifiedDecisions: [
          ...verifiedDecisions,
          {
            decisionId,
            project,
            actorKind: "authenticated",
            action: "accept",
            targetRef: proposal.proposalId,
          },
        ],
      });
      if (!prospective.appliedInputIds.includes(target)) {
        throw new Error("Accepted proposal does not qualify for the complete prospective replay overlay.");
      }
      const conflictingDateReplay = Object.entries(prospective.ignoredInputReasons).find(([inputId, reason]) =>
        inputId in DATE_TARGETS && /anchor/i.test(reason),
      );
      if (conflictingDateReplay) {
        throw new Error("Acceptance would create inconsistent replay anchors across the prospective date overlay.");
      }
      if (
        target in DATE_TARGETS &&
        !sameModelStartDate(
          prospective.modelOverrides.modelStartDate,
          parseDateFormulaAnchor(target, proposal.formula) ?? undefined,
        )
      ) {
        throw new Error("Date acceptance would not replay with its exact persisted model-start anchor.");
      }
    }
    if (actor.kind === "anonymous-session") {
      return {
        persisted: false as const,
        sessionOnly: true as const,
        action,
        proposalId: proposal.proposalId,
        reason: "Anonymous session decisions are not written to canonical history.",
      };
    }
    await repository.recordDecision(decision);
    const storedInputEvent = await repository.appendEvent(inputEvent);
    const proposalStatus = await repository.appendEvent(acceptedProposalEvent);
    return {
      persisted: true as const,
      sessionOnly: false as const,
      decision,
      inputEvent: storedInputEvent,
      proposalStatus,
    };
  }
  if (actor.kind === "anonymous-session") {
    return {
      persisted: false as const,
      sessionOnly: true as const,
      action,
      proposalId: proposal.proposalId,
      reason: "Anonymous session decisions are not written to canonical history.",
    };
  }
  const decision: ProofUserDecision = {
    decisionId,
    project,
    actor,
    decision: action,
    targetRef: proposal.proposalId,
    rationale: rationale.trim(),
    decidedAt,
    versions,
  };
  await repository.recordDecision(decision);
  if (action === "defer") return { persisted: true as const, sessionOnly: false as const, decision };
  const rejectedProposalEvent: ProofTransmissionEvent = {
    eventId: proposalStatusEventId,
    eventType: "transmission-proposal",
    project,
    effectiveAt: decidedAt,
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: { proposal: { ...proposal, status: "rejected" } },
  };
  const proposalStatus = await repository.appendEvent(rejectedProposalEvent);
  return { persisted: true as const, sessionOnly: false as const, decision, proposalStatus };
}