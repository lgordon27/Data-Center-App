import {
  getEvidenceImpactRole,
  type ImpactRole,
} from "@/data/evidenceImpactRoles";
import {
  EVIDENCE_SEMANTIC_POLICY_VERSION,
  evaluateEvidenceSourceEligibility,
  getEvidenceSemanticDefinition,
  normalizeEvidenceRecord,
} from "@/data/evidenceSemanticPolicy.mjs";

export type Classification =
  | "Verified Evidence"
  | "Management Assertion"
  | "Model Inference"
  | "User Assumption"
  | "Missing Evidence";

export type RecommendationStatus = "BLOCKED" | "CONDITIONAL" | "READY FOR REVIEW";

export const HAZARD_EXPOSURE_LEVELS = ["low", "moderate", "high"] as const;
export type HazardExposureLevel = (typeof HAZARD_EXPOSURE_LEVELS)[number];

export const WATER_SOURCE_RESILIENCE_STATES = ["single-source", "diversified"] as const;
export type WaterSourceResilienceState = (typeof WATER_SOURCE_RESILIENCE_STATES)[number];

export type QualitativeEvidenceValue = HazardExposureLevel | WaterSourceResilienceState;

export type EvidenceRecord = Record<
  string,
  {
    id: string;
    label?: string;
    value: string | number;
    classification: Classification;
     modelClassification?: Classification;
    numericValue?: number;
    qualitativeValue?: QualitativeEvidenceValue;
    sourceSupportConfidence?: number;
     unit?: string;
     researchState?: string;
     eligibleForModel?: boolean;
     acceptedForModel?: boolean;
     quarantineReasons?: string[];
     rawValue?: string | number;
     rawUnit?: string;
     rawText?: string;
     normalizedValue?: number | string;
     normalizedUnit?: string;
     normalization?: {
       policyVersion: number;
       conversion: string;
       validationStatus: "valid" | "unresolved" | "quarantined";
     };
     semanticValidationStatus?: "valid" | "unresolved" | "quarantined";
     description?: string;
     citation?: string;
     sourceRole?: string;
     sourceId?: string | null;
     sourceUrl?: string;
      coverageStatus?: string;
     sources?: Array<{ exactProject?: boolean; sourceClass?: string }>;
  }
>;

export type ModelBoundaryResult = {
  evidence: EvidenceRecord;
  quarantined: Record<string, string[]>;
};

export function containEvidenceForModel(evidence: EvidenceRecord): ModelBoundaryResult {
  const next: EvidenceRecord = {};
  const quarantined: Record<string, string[]> = {};
  for (const [id, item] of Object.entries(evidence)) {
    const reasons = [...(item.quarantineReasons ?? [])];
    const customInput = item.acceptedForModel !== undefined || item.researchState !== undefined;
    let semanticNormalization: ReturnType<typeof normalizeEvidenceRecord> | null = null;
    if (customInput && item.acceptedForModel !== true) reasons.push("Custom research has not been explicitly accepted by a reviewer.");
    if (customInput && item.eligibleForModel !== true) reasons.push("Custom research did not pass source-eligibility validation.");
    if (customInput) {
      reasons.push(...evaluateEvidenceSourceEligibility({
        id,
        sources: item.sources,
        sourceUrl: item.sourceUrl,
        classification: item.classification,
        sourceSupportConfidence: item.sourceSupportConfidence,
        coverageStatus: item.coverageStatus,
      }).reasons);
    }
    if (customInput) {
      if (item.researchState !== "accepted") {
        reasons.push("Custom research is not in the accepted state.");
      }
      const rawValue = item.rawValue ?? item.value;
      semanticNormalization = normalizeEvidenceRecord({
        id,
        value: rawValue,
        unit: item.rawUnit ?? item.unit,
        numericValue: item.rawValue === undefined ? item.numericValue : rawValue,
        qualitativeValue: item.qualitativeValue,
        description: item.description,
        citation: item.citation,
        sourceContext: item.rawText,
        explicitZero: rawValue === 0 && Boolean(item.sourceUrl),
      });
      reasons.push(...semanticNormalization.quarantineReasons);
      if (!getEvidenceSemanticDefinition(id)?.modelDestination) {
        reasons.push("This evidence variable is context-only or a decision gate and cannot enter cash-flow calculations.");
      }
    }
    if (reasons.length) {
      quarantined[id] = [...new Set(reasons)];
      next[id] = {
        ...item,
        classification: "Missing Evidence",
        modelClassification: "Missing Evidence",
        numericValue: undefined,
        qualitativeValue: undefined,
      };
    } else {
      next[id] = semanticNormalization?.normalizedValue !== undefined
        ? {
            ...item,
            numericValue: typeof semanticNormalization.normalizedValue === "number"
              ? semanticNormalization.normalizedValue
              : item.numericValue,
            unit: semanticNormalization.normalizedUnit,
            normalizedValue: semanticNormalization.normalizedValue,
            normalizedUnit: semanticNormalization.normalizedUnit,
            semanticValidationStatus: "valid",
            normalization: {
              policyVersion: semanticNormalization.policyVersion,
              conversion: semanticNormalization.conversion,
              validationStatus: "valid",
            },
          }
        : item;
    }
  }
  return { evidence: next, quarantined };
}

export type CashFlowYear = {
  year: number;
  calendarUtilization: number;
  operatingUtilization: number;
  activeMonths: number;
  revenue: number;
  electricityMwh: number;
  electricityOpex: number;
  waterGallons: number;
  waterOpex: number;
  maintenanceOpex: number;
  laborOpex: number;
  insuranceOpex: number;
  carbonComplianceOpex: number;
  climateDisruptionOpex: number;
  backupPowerOpex: number;
  totalOpex: number;
  noi: number;
  beginningDebt: number;
  interest: number;
  principal: number;
  endingDebt: number;
  terminalValue: number;
  terminalDebtRepayment: number;
  netEquityCashFlow: number;
  cumulativeEquityCashFlow: number;
  debtService: number;
  dscr: number | null;
};

export type ModelLineItem = {
  id: string;
  driver: string;
  value: number;
  unit: string;
  deltaIRR: number;
  impactRole: ImpactRole;
  impactExplanation: string;
  impactTreatment: string;
};

export type FinancialAttribution = {
  id: string;
  label: string;
  rawValue: string | number;
  rawUnit: string;
  appliedValue: number;
  appliedUnit: string;
  provenance: string;
  citation: string;
  sourceId?: string | null;
  impactRole: ImpactRole;
  currentClassification: Classification;
  modeledClassification: Classification;
  baselineClassification: "Verified Evidence";
  affectedCashFlowLine: string;
  baselineTreatment: string;
  currentTreatment: string;
  marginalAnnualDeltas: number[];
  dollarImpact: number;
  annualEffect: number;
  annualEffectBasis: string;
  singleInputSensitivityIRR: number | null;
  hasDirectModeledEffect: boolean;
};

export type ModelAssumptions = {
  capacityMW: number;
  leaseRatePerKwMonth: number;
  annualRevenueAtFullUtilization: number;
  utilizationRamp: number[];
  electricityRate: number;
  electricityEscalationRate: number;
  annualCoolingWaterMgal: number;
  waterCostPerGallon: number;
  waterEscalationRate: number;
  waterRightsCostMultiplier: number;
  maintenanceRate: number;
  annualLaborAtFullUtilization: number;
  insuranceRate: number;
  annualCarbonCompliance: number;
  siteHazardExposure: string;
  hazardProbability: number;
  adjustedHazardProbability: number;
  downtimeCostPerDay: number;
  adjustedDowntimeCostPerDay: number;
  backupPowerHours: number;
  backupPowerCapex: number;
  waterSourceResilience: string;
  waterSourceEscalationMultiplier: number;
  waterConversionCapex: number;
  waterConversionContingencyTriggered: boolean;
  effectiveRenewableProcurement: number;
  powerCostDifferential: number;
  gridInterconnectionMonths: number;
  permittingMonths: number;
  communityDelayMonths: number;
  revenueDelayMonths: number;
  customerUtilizationMultiplier: number;
  coolingCapexContingencyRate: number;
  communityCapexContingencyRate: number;
  backupPowerContingencyTriggered: boolean;
  entryValue: number;
  coolingCapex: number;
  capexContingency: number;
  totalCapex: number;
  debtAmount: number;
  debtLtv: number;
  interestRate: number;
  amortizationYears: number;
  annualPrincipalPayment: number;
  exitMultiple: number;
  discountRate: number;
  terminalValue: number;
  terminalDebtRepayment: number;
  initialInvestedEquity: number;
  sourcesAndUses: {
    sources: { debt: number; equity: number };
    uses: { entryValue: number; coolingCapex: number; capexContingency: number; total: number };
  };
  terminalFormula: string;
};

export type ReturnSensitivity = {
  powerPriceMultiplier: number;
  utilizationMultiplier: number;
  irr: number | null;
  irrStatus: IRRStatus;
  irrReason: IRRReason | null;
  moic: number;
};

export type IRRStatus = "meaningful" | "not-meaningful";
export type IRRReason = "invalid-input" | "no-sign-change" | "multiple-roots";

export type IRRResult = {
  value: number | null;
  status: IRRStatus;
  reason: IRRReason | null;
};

export type CashFlowModel = {
  projectIRR: number | null;
  projectIRRStatus: IRRStatus;
  projectIRRReason: IRRReason | null;
  moic: number;
  cashOnCash: number;
  initialInvestedEquity: number;
  cashOnCashDenominator: number;
  annualPreTaxEquityCashFlow: number;
  dscrMeaningfulYears: number[];
  returnSensitivity: ReturnSensitivity[];
  payback: number | null;
  npv: number;
  confidenceScore: number;
  revenueDelayMonths: number;
  incrementalCapex: number;
  opexChange: number;
  recommendationBlocked: boolean;
  recommendationStatus: RecommendationStatus;
  missingMaterialCount: number;
  unresolvedDecisionGateCount: number;
  unresolvedFinancialDriverCount: number;
  materialUnverifiedCount: number;
  totalDistributions: number;
  equityInvested: number;
  terminalValue: number;
  schedule: CashFlowYear[];
  assumptions: ModelAssumptions;
  lineItems: Record<string, ModelLineItem>;
  attribution: Record<string, FinancialAttribution>;
  waterfall: WaterfallStep[];
  waterfallClosureDelta: number | null;
  waterfallReconciles: boolean;
  mechanicalDisclaimer: boolean;
  baseIRR?: number | null;
  baseModel?: CashFlowModel;
};

export const DEFAULT_CAPACITY_MW = 1_200;
export const MAX_CAPACITY_MW = 10_000;
/** IRR is displayed to one decimal place; this is the maximum closure error in percentage points. */
export const WATERFALL_RECONCILIATION_TOLERANCE = 0.05;
const LEASE_RATE_PER_KW_MONTH = 185;
const UTILIZATION_RAMP = [0.6, 0.8, 0.92, 0.92, 0.92];
const HOURS_PER_YEAR = 8_760;
const WATER_COST_PER_GALLON = 0.015;
const MAINTENANCE_RATE = 0.045;
const ANNUAL_LABOR_AT_FULL_UTILIZATION = 18;
const INSURANCE_RATE = 0.0035;
const ENTRY_VALUE = 4_800;
const DEBT_LTV = 0.6;
const INTEREST_RATE = 0.075;
const AMORTIZATION_YEARS = 10;
// Representative acquisition economics scaled to the 1.2 GW Stargate target.
// These are explicit synthetic assumptions, not reported transaction terms.
const EXIT_MULTIPLE = 2.2;
const DISCOUNT_RATE = 0.1;

export const CLIMATE_QUALITY_MULTIPLIERS: Record<Classification, number> = {
  "Verified Evidence": 1,
  "Management Assertion": 1.25,
  "Model Inference": 1.5,
  "User Assumption": 1.15,
  "Missing Evidence": 2,
};

export const BACKUP_POWER_CAPEX_BY_CLASSIFICATION: Record<Classification, number> = {
  "Verified Evidence": 30,
  "Management Assertion": 35,
  "Model Inference": 40,
  "User Assumption": 45,
  "Missing Evidence": 50,
};

export const WATER_CONVERSION_CAPEX_BY_CLASSIFICATION: Record<Classification, number> = {
  "Verified Evidence": 80,
  "Management Assertion": 100,
  "Model Inference": 120,
  "User Assumption": 135,
  "Missing Evidence": 150,
};

const MIN_DOWNTIME_COST_PER_DAY = 5_000_000;

const CONFIDENCE_WEIGHTS: Record<Classification, number> = {
  "Verified Evidence": 10,
  "Management Assertion": 6,
  "Model Inference": 4,
  "User Assumption": 2,
  "Missing Evidence": 0,
};

const QUALITY_POLICY = {
  "Verified Evidence": {
    costMultiplier: 1,
    waterConsumptionMultiplier: 1,
    timelineAdder: 0,
    communityDelay: 3,
    coolingContingency: 0,
    communityContingency: 0,
    renewableCoverage: 1,
    electricityEscalationAdder: 0,
    waterEscalationAdder: 0,
    carbonMultiplier: 1,
    customerLossRate: 0.05,
    waterRightsMultiplier: 1,
    climateMultiplier: 1,
  },
  "Management Assertion": {
    costMultiplier: 1.08,
    waterConsumptionMultiplier: 1.1,
    timelineAdder: 2,
    communityDelay: 5,
    coolingContingency: 0.05,
    communityContingency: 0.05,
    renewableCoverage: 0.9,
    electricityEscalationAdder: 0.01,
    waterEscalationAdder: 0.015,
    carbonMultiplier: 1.1,
    customerLossRate: 0.07,
    waterRightsMultiplier: 1.1,
    climateMultiplier: 1.25,
  },
  "Model Inference": {
    costMultiplier: 1.15,
    waterConsumptionMultiplier: 1.2,
    timelineAdder: 4,
    communityDelay: 7,
    coolingContingency: 0.1,
    communityContingency: 0.1,
    renewableCoverage: 0.8,
    electricityEscalationAdder: 0.02,
    waterEscalationAdder: 0.03,
    carbonMultiplier: 1.2,
    customerLossRate: 0.15,
    waterRightsMultiplier: 1.2,
    climateMultiplier: 1.5,
  },
  "User Assumption": {
    costMultiplier: 1.05,
    waterConsumptionMultiplier: 1.3,
    timelineAdder: 6,
    communityDelay: 10,
    coolingContingency: 0.1,
    communityContingency: 0.15,
    renewableCoverage: 0.65,
    electricityEscalationAdder: 0.03,
    waterEscalationAdder: 0.05,
    carbonMultiplier: 1.35,
    customerLossRate: 0.22,
    waterRightsMultiplier: 1.35,
    climateMultiplier: 1.15,
  },
  "Missing Evidence": {
    costMultiplier: 1.2,
    waterConsumptionMultiplier: 1.5,
    timelineAdder: 5,
    communityDelay: 8,
    coolingContingency: 0.12,
    communityContingency: 0.12,
    renewableCoverage: 0.4,
    electricityEscalationAdder: 0.05,
    waterEscalationAdder: 0.08,
    carbonMultiplier: 1.5,
    customerLossRate: 0.1,
    waterRightsMultiplier: 1.6,
    climateMultiplier: 2,
  },
} satisfies Record<Classification, Record<string, number>>;

// Shared with Advisor Lens so materiality has one source of truth across
// recommendation status and evidence-completeness posture.
export const MATERIAL_EVIDENCE_IDS = [
  "water_rights",
  "customer_concentration",
  "backup_power_capacity",
  "water_source_resilience",
] as const;

export type MaterialEvidenceId = (typeof MATERIAL_EVIDENCE_IDS)[number];
export const EFFECTIVE_SUPPORT_CONFIDENCE_THRESHOLD = 70;
export const UNRESOLVED_SUPPORT_CONFIDENCE_THRESHOLD = 50;

export function getEffectiveSupportState(item: EvidenceRecord[string]) {
  if (item.classification === "Missing Evidence") return "unresolved" as const;
  if (typeof item.sourceSupportConfidence !== "number") return "unmeasured" as const;
  if (item.sourceSupportConfidence < UNRESOLVED_SUPPORT_CONFIDENCE_THRESHOLD) return "unresolved" as const;
  if (item.sourceSupportConfidence < EFFECTIVE_SUPPORT_CONFIDENCE_THRESHOLD) return "conditional" as const;
  return "supported" as const;
}
function finiteNumericValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isHazardExposureLevel(value: unknown): value is HazardExposureLevel {
  return typeof value === "string" && HAZARD_EXPOSURE_LEVELS.includes(value as HazardExposureLevel);
}

function isWaterSourceResilienceState(value: unknown): value is WaterSourceResilienceState {
  return (
    typeof value === "string" &&
    WATER_SOURCE_RESILIENCE_STATES.includes(value as WaterSourceResilienceState)
  );
}

const HAZARD_PROBABILITY_BY_LEVEL: Record<HazardExposureLevel, number> = {
  low: 0.005,
  moderate: 0.02,
  high: 0.05,
};

const HAZARD_EXPOSURE_LABELS: Record<HazardExposureLevel, string> = {
  low: "Extreme heat low; drought low; winter storm not documented",
  moderate: "Extreme heat moderate; drought moderate; winter storm not documented",
  high: "Extreme heat high; drought moderate; winter storm documented",
};

const WATER_SOURCE_RESILIENCE_LABELS: Record<WaterSourceResilienceState, string> = {
  "single-source": "Taylor County municipal — single source, no disclosed backup",
  diversified: "Municipal plus reclaimed-water backup",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * NPV is still meaningful for any finite cash-flow sequence, including
 * sequences with no IRR or more than one IRR. It is always reported at the
 * model's explicit discount rate rather than being suppressed with IRR.
 */
export function calculateNPV(cashFlows: number[], rate: number) {
  return cashFlows.reduce((total, cashFlow, index) => total + cashFlow / Math.pow(1 + rate, index), 0);
}

/**
 * Return IRR only when the cash flows have one economically unique root.
 *
 * A sequence with exactly one sign change has exactly one positive root in
 * discount-factor space (Descartes' rule of signs). Multiple sign changes
 * can produce multiple valid IRRs or no valid IRR, so both cases deliberately
 * return null instead of exposing whichever root a numerical iteration finds.
 * Negative interim cash flows are valid when they do not introduce another
 * sign change. The caller displays null as "N/M".
 */
export function calculateIRR(cashFlows: number[]) {
  return calculateIRRResult(cashFlows).value;
}

export function calculateIRRResult(cashFlows: number[]): IRRResult {
  const notMeaningful = (reason: IRRReason): IRRResult => ({
    value: null,
    status: "not-meaningful",
    reason,
  });

  if (cashFlows.some((cashFlow) => !Number.isFinite(cashFlow))) return notMeaningful("invalid-input");

  const nonZeroCashFlows = cashFlows.filter((cashFlow) => cashFlow !== 0);
  if (nonZeroCashFlows.length < 2) return notMeaningful("no-sign-change");

  let signChanges = 0;
  for (let index = 1; index < nonZeroCashFlows.length; index += 1) {
    if (Math.sign(nonZeroCashFlows[index]) !== Math.sign(nonZeroCashFlows[index - 1])) {
      signChanges += 1;
    }
  }
  if (signChanges === 0) return notMeaningful("no-sign-change");
  if (signChanges > 1) return notMeaningful("multiple-roots");

  // NPV(rate) = Σ cashFlow[t] / (1 + rate)^t. Solving in x = 1 / (1 + rate)
  // gives a polynomial on x > 0, where exactly one sign change guarantees
  // one positive root and makes bracketing deterministic.
  const npvAtDiscountFactor = (discountFactor: number) =>
    cashFlows.reduce((total, cashFlow, index) => total + cashFlow * discountFactor ** index, 0);
  const lower = 0;
  const lowerNPV = nonZeroCashFlows[0];
  let upper = 1;
  let upperNPV = npvAtDiscountFactor(upper);

  for (let expansion = 0; expansion < 1024 && lowerNPV * upperNPV > 0; expansion += 1) {
    upper *= 2;
    upperNPV = npvAtDiscountFactor(upper);
    if (!Number.isFinite(upperNPV)) return notMeaningful("invalid-input");
  }
  if (!Number.isFinite(upperNPV) || lowerNPV * upperNPV > 0) return notMeaningful("invalid-input");

  let bracketLower = lower;
  let bracketUpper = upper;
  let bracketLowerNPV = lowerNPV;
  let bracketUpperNPV = upperNPV;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const midpoint = (bracketLower + bracketUpper) / 2;
    const midpointNPV = npvAtDiscountFactor(midpoint);
    if (!Number.isFinite(midpointNPV)) return notMeaningful("invalid-input");
    if (Math.abs(midpointNPV) < 0.000000001) {
      return {
        value: 1 / midpoint - 1,
        status: "meaningful",
        reason: null,
      };
    }

    if (bracketLowerNPV * midpointNPV <= 0) {
      bracketUpper = midpoint;
      bracketUpperNPV = midpointNPV;
    } else {
      bracketLower = midpoint;
      bracketLowerNPV = midpointNPV;
    }
  }

  const discountFactor = (bracketLower + bracketUpper) / 2;
  return discountFactor > 0
    ? { value: 1 / discountFactor - 1, status: "meaningful", reason: null }
    : notMeaningful("invalid-input");
}

/**
 * MOIC counts every positive equity distribution against every negative equity
 * contribution, including negative interim cash flows. With no distributions
 * it is explicitly 0 rather than an undefined ratio.
 */
export function calculateMOIC(cashFlows: number[]) {
  const totalDistributions = cashFlows
    .slice(1)
    .filter((cashFlow) => cashFlow > 0)
    .reduce((total, cashFlow) => total + cashFlow, 0);
  const equityInvested = cashFlows
    .filter((cashFlow) => cashFlow < 0)
    .reduce((total, cashFlow) => total + Math.abs(cashFlow), 0);
  return equityInvested > 0 ? totalDistributions / equityInvested : 0;
}

/**
 * Payback is the first point cumulative equity cash flow reaches zero. A
 * negative interim flow delays recovery; if recovery never occurs the caller
 * displays null as "Not reached".
 */
export function calculatePayback(cashFlows: number[]) {
  let cumulative = 0;

  for (let index = 0; index < cashFlows.length; index += 1) {
    const previous = cumulative;
    cumulative += cashFlows[index];

    if (cumulative >= 0 && index > 0) {
      const change = cumulative - previous;
      const fraction = change > 0 ? Math.abs(previous) / change : 0;
      return (index - 1) + clamp(fraction, 0, 1);
    }
  }

  return null;
}

function buildVerifiedEvidence(evidence: EvidenceRecord): EvidenceRecord {
  return Object.fromEntries(
    Object.entries(evidence).map(([id, item]) => [
      id,
      {
        ...item,
        classification: "Verified Evidence" as Classification,
        modelClassification: undefined,
      },
    ]),
  );
}

export function formatImpactDelta(deltaIRR: number | null) {
  if (deltaIRR === null || !Number.isFinite(deltaIRR)) return "N/M";
  if (deltaIRR === 0) return "No adjustment at current classification";

  const direction = deltaIRR < 0 ? "down" : "up";
  const absoluteDelta = Math.abs(deltaIRR);
  if (absoluteDelta < 0.01) return `less than 0.01 pts ${direction}`;

  const decimals = absoluteDelta < 0.1 ? 2 : 1;
  return `${deltaIRR >= 0 ? "+" : ""}${deltaIRR.toFixed(decimals)} pts`;
}
function normalizeCapacityMW(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_CAPACITY_MW
    ? value
    : DEFAULT_CAPACITY_MW;
}

function runModel(
  evidence: EvidenceRecord,
  capacityMW: number,
  sensitivity: { powerPriceMultiplier?: number; utilizationMultiplier?: number } = {},
): CashFlowModel {
  const capacityScale = capacityMW / DEFAULT_CAPACITY_MW;
  const electricityItem = evidence.electricity_cost;
  const waterConsumptionItem = evidence.water_consumption;
  const gridItem = evidence.grid_interconnection;
  const waterEscalationItem = evidence.water_escalation;
  const communityItem = evidence.community_risk;
  const renewableItem = evidence.renewable_percentage;
  const coolingItem = evidence.cooling_capex;
  const electricityEscalationItem = evidence.electricity_escalation;
  const carbonItem = evidence.carbon_compliance;
  const permittingItem = evidence.permitting_timeline;
  const concentrationItem = evidence.customer_concentration;
  const waterRightsItem = evidence.water_rights;
  const hazardItem = evidence.site_hazard_exposure;
  const backupPowerItem = evidence.backup_power_capacity;
  const waterSourceItem = evidence.water_source_resilience;
  const downtimeCostItem = evidence.downtime_cost;

  const electricityQuality = QUALITY_POLICY[electricityItem.classification];
  const waterQuality = QUALITY_POLICY[waterConsumptionItem.classification];
  const gridQuality = QUALITY_POLICY[gridItem.classification];
  const waterEscalationQuality = QUALITY_POLICY[waterEscalationItem.classification];
  const communityQuality = QUALITY_POLICY[communityItem.classification];
  const renewableQuality = QUALITY_POLICY[renewableItem.classification];
  const coolingQuality = QUALITY_POLICY[coolingItem.classification];
  const electricityEscalationQuality = QUALITY_POLICY[electricityEscalationItem.classification];
  const carbonQuality = QUALITY_POLICY[carbonItem.classification];
  const permittingQuality = QUALITY_POLICY[permittingItem.classification];
  const concentrationQuality = QUALITY_POLICY[concentrationItem.classification];
  const waterRightsQuality = QUALITY_POLICY[waterRightsItem.classification];
  const hazardQuality = QUALITY_POLICY[hazardItem.modelClassification ?? hazardItem.classification];
  const backupPowerQuality = QUALITY_POLICY[backupPowerItem.classification];
  const waterSourceQuality = QUALITY_POLICY[waterSourceItem.classification];
  const downtimeCostQuality = QUALITY_POLICY[downtimeCostItem.classification];

  const electricityRate =
    finiteNumericValue(electricityItem.numericValue, 42) * electricityQuality.costMultiplier;
  const annualCoolingWaterMgal =
    finiteNumericValue(waterConsumptionItem.numericValue, 23) *
    waterQuality.waterConsumptionMultiplier *
    capacityScale;
  const waterEscalationRate =
    finiteNumericValue(waterEscalationItem.numericValue, 7) / 100 +
    waterEscalationQuality.waterEscalationAdder;
  const electricityEscalationRate =
    finiteNumericValue(electricityEscalationItem.numericValue, 6) / 100 +
    electricityEscalationQuality.electricityEscalationAdder;
  const effectiveRenewableProcurement = clamp(
    finiteNumericValue(renewableItem.numericValue, 25),
    0,
    100,
  );
  // Fixed synthetic transaction economics, not an effect of the Context
  // Indicator. Changing renewable provenance never changes cash flow.
  const powerCostDifferential = 0.0945;
  const powerPriceMultiplier = sensitivity.powerPriceMultiplier ?? 1;
  const utilizationMultiplier = sensitivity.utilizationMultiplier ?? 1;
  const gridInterconnectionMonths =
    finiteNumericValue(gridItem.numericValue, 14) + gridQuality.timelineAdder;
  const permittingMonths =
    finiteNumericValue(permittingItem.numericValue, 10) + permittingQuality.timelineAdder;
  const communityDelayMonths = 0;
  // Interconnection and permitting are parallel Financial Drivers; the later
  // timeline controls the start date. Community risk remains context only.
  const revenueDelayMonths = Math.round(
    Math.max(gridInterconnectionMonths, permittingMonths) + communityDelayMonths,
  );
  // Customer concentration is a Decision Gate. Preserve the calibrated base
  // utilization assumption without deriving it from gate provenance or value.
  const customerUtilizationMultiplier = 0.9;
  const coolingCapex = finiteNumericValue(coolingItem.numericValue, 450) * capacityScale;
  const communityCapexContingency = 0;
  const coolingCapexContingency = coolingQuality.coolingContingency;
  const hazardExposureLevel = isHazardExposureLevel(hazardItem.qualitativeValue)
    ? hazardItem.qualitativeValue
    : "high";
  const siteHazardExposure = HAZARD_EXPOSURE_LABELS[hazardExposureLevel];
  const baseHazardProbability = HAZARD_PROBABILITY_BY_LEVEL[hazardExposureLevel];
  const adjustedHazardProbability = clamp(
    baseHazardProbability * hazardQuality.climateMultiplier,
    0,
    1,
  );
  const downtimeCostPerDay = finiteNumericValue(
    downtimeCostItem.numericValue,
    MIN_DOWNTIME_COST_PER_DAY,
  );
  const qualityAdjustedDowntimeCost =
    downtimeCostPerDay * downtimeCostQuality.climateMultiplier;
  const adjustedDowntimeCostPerDay =
    downtimeCostItem.classification === "Missing Evidence"
      ? Math.max(MIN_DOWNTIME_COST_PER_DAY, qualityAdjustedDowntimeCost)
      : qualityAdjustedDowntimeCost;
  const backupPowerHours =
    backupPowerItem.classification === "Missing Evidence"
      ? 0
      : clamp(finiteNumericValue(backupPowerItem.numericValue, 0), 0, 8760);
  const backupPowerContingencyTriggered = false;
  const backupPowerCapex = 0;
  const waterSourceResilienceState = isWaterSourceResilienceState(
    waterSourceItem.qualitativeValue,
  )
    ? waterSourceItem.qualitativeValue
    : "single-source";
  const waterSourceResilience = WATER_SOURCE_RESILIENCE_LABELS[waterSourceResilienceState];
  // Fixed synthetic assumptions rather than effects of the water-source
  // Decision Gates. Reclassification changes recommendation posture only.
  const waterSourceEscalationMultiplier = 1.5;
  const waterConversionContingencyTriggered = false;
  const waterConversionCapex = 80 * capacityScale;
  const climateCapexContingency = backupPowerCapex + waterConversionCapex;
  const capexContingency =
    coolingCapex * (communityCapexContingency + coolingCapexContingency) +
    climateCapexContingency;
  const entryValue = ENTRY_VALUE * capacityScale;
  const totalCapex = entryValue + coolingCapex + capexContingency;
  const debtAmount = entryValue * DEBT_LTV;
  const annualPrincipalPayment = debtAmount / AMORTIZATION_YEARS;
  const annualCarbonCompliance =
    finiteNumericValue(carbonItem.numericValue, 20) * carbonQuality.carbonMultiplier;
  const waterRightsCostMultiplier = 1.5;
  const totalDirectCapex = entryValue + coolingCapex;
  const annualRevenueAtFullUtilization =
    capacityMW * 1_000 * LEASE_RATE_PER_KW_MONTH * 12 / 1_000_000;

  const adjustedWaterEscalationRate = waterEscalationRate * waterSourceEscalationMultiplier;
  const schedule: CashFlowYear[] = [];
  let cumulativeEquityCashFlow = 0;

  const initialEquityCashFlow = -(totalCapex - debtAmount);
  cumulativeEquityCashFlow += initialEquityCashFlow;
  schedule.push({
    year: 0,
    calendarUtilization: 0,
    operatingUtilization: 0,
    activeMonths: 0,
    revenue: 0,
    electricityMwh: 0,
    electricityOpex: 0,
    waterGallons: 0,
    waterOpex: 0,
    maintenanceOpex: 0,
    laborOpex: 0,
    insuranceOpex: 0,
    carbonComplianceOpex: 0,
    climateDisruptionOpex: 0,
    backupPowerOpex: 0,
    totalOpex: 0,
    noi: 0,
    beginningDebt: debtAmount,
    interest: 0,
    principal: 0,
    endingDebt: debtAmount,
    terminalValue: 0,
    terminalDebtRepayment: 0,
    netEquityCashFlow: initialEquityCashFlow,
    cumulativeEquityCashFlow,
    debtService: 0,
    dscr: null,
  });

  for (let year = 1; year <= 5; year += 1) {
    const calendarUtilization = clamp((UTILIZATION_RAMP[year - 1] ?? 0.92) * utilizationMultiplier, 0, 1);
    const monthsBeforeYear = (year - 1) * 12;
    const activeMonths = clamp(12 - Math.max(0, revenueDelayMonths - monthsBeforeYear), 0, 12);
    const operatingUtilization = calendarUtilization * (activeMonths / 12);
    const revenue =
      annualRevenueAtFullUtilization *
      calendarUtilization *
      (activeMonths / 12) *
      customerUtilizationMultiplier;
    const electricityMwh =
      capacityMW * HOURS_PER_YEAR * operatingUtilization;
    const powerRate =
        electricityRate *
      (1 + powerCostDifferential) *
        powerPriceMultiplier *
      Math.pow(1 + electricityEscalationRate, year - 1);
    const electricityOpex = (electricityMwh * powerRate) / 1_000_000;
    const waterGallons =
      annualCoolingWaterMgal * 1_000_000 * operatingUtilization;
    const waterRate =
      WATER_COST_PER_GALLON *
      waterRightsCostMultiplier *
      Math.pow(1 + adjustedWaterEscalationRate, year - 1);
    const waterOpex = (waterGallons * waterRate) / 1_000_000;
    const maintenanceOpex =
      totalDirectCapex * MAINTENANCE_RATE * operatingUtilization;
    const laborOpex =
      ANNUAL_LABOR_AT_FULL_UTILIZATION * capacityScale * operatingUtilization;
    const insuranceOpex =
      totalDirectCapex * INSURANCE_RATE * operatingUtilization;
    const carbonComplianceOpex = annualCarbonCompliance * capacityScale * operatingUtilization;
    const climateDisruptionOpex =
      (adjustedDowntimeCostPerDay *
        capacityScale *
        adjustedHazardProbability *
        365 *
        operatingUtilization) /
      1_000_000;
    const backupPowerOpex = backupPowerContingencyTriggered
      ? 2 * operatingUtilization
      : 0;
    const totalOpex =
      electricityOpex +
      waterOpex +
      maintenanceOpex +
      laborOpex +
      insuranceOpex +
      carbonComplianceOpex +
      climateDisruptionOpex +
      backupPowerOpex;
    const noi = revenue - totalOpex;
    const beginningDebt = Math.max(0, debtAmount - annualPrincipalPayment * (year - 1));
    const principal = Math.min(beginningDebt, annualPrincipalPayment);
    const interest = beginningDebt * INTEREST_RATE;
    const endingDebt = Math.max(0, beginningDebt - principal);
    const terminalValue = year === 5 ? Math.max(0, noi * EXIT_MULTIPLE) : 0;
    const terminalDebtRepayment = year === 5 ? endingDebt : 0;
    const netEquityCashFlow =
      noi - interest - principal + terminalValue - terminalDebtRepayment;
    const debtService = interest + principal;
    cumulativeEquityCashFlow += netEquityCashFlow;

    schedule.push({
      year,
      calendarUtilization,
      operatingUtilization,
      activeMonths,
      revenue,
      electricityMwh,
      electricityOpex,
      waterGallons,
      waterOpex,
      maintenanceOpex,
      laborOpex,
      insuranceOpex,
      carbonComplianceOpex,
      climateDisruptionOpex,
      backupPowerOpex,
      totalOpex,
      noi,
      beginningDebt,
      interest,
      principal,
      endingDebt,
      terminalValue,
      terminalDebtRepayment,
      netEquityCashFlow,
      cumulativeEquityCashFlow,
      debtService,
      dscr: debtService > 0 ? noi / debtService : null,
    });
  }

  const cashFlows = schedule.map((year) => year.netEquityCashFlow);
  const projectIRRResult = calculateIRRResult(cashFlows);
  const npv = calculateNPV(cashFlows, DISCOUNT_RATE);
  const totalDistributions = cashFlows
    .slice(1)
    .filter((cashFlow) => cashFlow > 0)
    .reduce((total, cashFlow) => total + cashFlow, 0);
  const equityInvested = cashFlows
    .filter((cashFlow) => cashFlow < 0)
    .reduce((total, cashFlow) => total + Math.abs(cashFlow), 0);
  const initialInvestedEquity = Math.abs(schedule[0]?.netEquityCashFlow ?? 0);
  const annualPreTaxEquityCashFlow = schedule[3]?.netEquityCashFlow ?? 0;
  const cashOnCash =
    initialInvestedEquity > 0
      ? (annualPreTaxEquityCashFlow / initialInvestedEquity) * 100
      : 0;
  const unresolvedDecisionGateCount = Object.values(evidence).filter(
    (item) => isMaterialEvidenceId(item.id) && getEffectiveSupportState(item) === "unresolved",
  ).length;
  const unresolvedFinancialDriverCount = Object.values(evidence).filter(
    (item) => getEvidenceImpactRole(item.id) === "Financial Driver" && getEffectiveSupportState(item) === "unresolved",
  ).length;
  const missingMaterialCount = unresolvedDecisionGateCount;
  const materialUnverifiedCount = Object.values(evidence).filter(
    (item) =>
      isMaterialEvidenceId(item.id) &&
      (item.classification === "Model Inference" ||
        item.classification === "User Assumption" ||
        getEffectiveSupportState(item) === "conditional"),
  ).length;
  const recommendationStatus: RecommendationStatus =
    missingMaterialCount > 0
      ? "BLOCKED"
      : materialUnverifiedCount > 0
        ? "CONDITIONAL"
        : "READY FOR REVIEW";
  const totalConfidence = Object.values(evidence).reduce(
    (total, item) => total + CONFIDENCE_WEIGHTS[item.classification],
    0,
  );
  const confidenceScore = Math.round(
    (totalConfidence / (Object.keys(evidence).length * 10)) * 100,
  );
  const yearFive = schedule[5];
  const firstOperatingYear = schedule.find((year) => year.year > 0 && year.operatingUtilization > 0);

  const assumptions: ModelAssumptions = {
    capacityMW,
    leaseRatePerKwMonth: LEASE_RATE_PER_KW_MONTH,
    annualRevenueAtFullUtilization,
    utilizationRamp: UTILIZATION_RAMP,
    electricityRate,
    electricityEscalationRate,
    annualCoolingWaterMgal,
    waterCostPerGallon: WATER_COST_PER_GALLON,
    waterEscalationRate: adjustedWaterEscalationRate,
    waterRightsCostMultiplier,
    maintenanceRate: MAINTENANCE_RATE,
    annualLaborAtFullUtilization: ANNUAL_LABOR_AT_FULL_UTILIZATION * capacityScale,
    insuranceRate: INSURANCE_RATE,
    annualCarbonCompliance,
    siteHazardExposure,
    hazardProbability: baseHazardProbability,
    adjustedHazardProbability,
    downtimeCostPerDay,
    adjustedDowntimeCostPerDay,
    backupPowerHours,
    backupPowerCapex,
    waterSourceResilience,
    waterSourceEscalationMultiplier,
    waterConversionCapex,
    waterConversionContingencyTriggered,
    effectiveRenewableProcurement,
    powerCostDifferential,
    gridInterconnectionMonths,
    permittingMonths,
    communityDelayMonths,
    revenueDelayMonths,
    customerUtilizationMultiplier,
    coolingCapexContingencyRate: coolingCapexContingency,
    communityCapexContingencyRate: communityCapexContingency,
    backupPowerContingencyTriggered,
    entryValue,
    coolingCapex,
    capexContingency,
    totalCapex,
    debtAmount,
    debtLtv: DEBT_LTV,
    interestRate: INTEREST_RATE,
    amortizationYears: AMORTIZATION_YEARS,
    annualPrincipalPayment,
    exitMultiple: EXIT_MULTIPLE,
    discountRate: DISCOUNT_RATE,
    terminalValue: yearFive?.terminalValue ?? 0,
    terminalDebtRepayment: yearFive?.terminalDebtRepayment ?? 0,
    initialInvestedEquity,
    sourcesAndUses: {
      sources: { debt: debtAmount, equity: initialInvestedEquity },
      uses: { entryValue, coolingCapex, capexContingency, total: totalCapex },
    },
    terminalFormula: "Terminal value = max(0, Year 5 NOI × synthetic exit multiple); terminal debt repayment = Year 5 ending debt.",
  };

  const createLineItem = (id: string, driver: string, value: number, unit: string): ModelLineItem => {
    const impactRole = getEvidenceImpactRole(id);
    return { id, driver, value, unit, deltaIRR: 0, impactRole, impactExplanation: getImpactExplanation(impactRole), impactTreatment: "" };
  };
  const lineItems: Record<string, ModelLineItem> = {
    electricity_cost: createLineItem("electricity_cost", "Power OPEX", electricityRate, "$/MWh"),
    water_consumption: createLineItem("water_consumption", "Water OPEX", annualCoolingWaterMgal, "M gal / yr"),
    grid_interconnection: createLineItem("grid_interconnection", "Revenue delay", revenueDelayMonths, "months"),
    water_escalation: createLineItem("water_escalation", "Water OPEX growth", adjustedWaterEscalationRate * 100, "%"),
    community_risk: createLineItem("community_risk", "Community diligence context", communityDelayMonths, "context"),
    renewable_percentage: createLineItem("renewable_percentage", "Renewable procurement context", effectiveRenewableProcurement, "%"),
    cooling_capex: createLineItem("cooling_capex", "Direct CAPEX", coolingCapex + capexContingency, "$M"),
    electricity_escalation: createLineItem("electricity_escalation", "Power OPEX escalation", electricityEscalationRate * 100, "%"),
    carbon_compliance: createLineItem("carbon_compliance", "Carbon compliance OPEX", annualCarbonCompliance, "$M / yr"),
    permitting_timeline: createLineItem("permitting_timeline", "Revenue delay", permittingMonths, "months"),
    customer_concentration: createLineItem("customer_concentration", "Customer exposure review", 0, "gate"),
    water_rights: createLineItem("water_rights", "Water access review", 0, "gate"),
    site_hazard_exposure: createLineItem("site_hazard_exposure", "Climate disruption OPEX", adjustedHazardProbability * 100, "%"),
    backup_power_capacity: createLineItem("backup_power_capacity", "Resilience review", backupPowerHours, "hours"),
    water_source_resilience: createLineItem("water_source_resilience", "Water resilience review", 0, "gate"),
    downtime_cost: createLineItem("downtime_cost", "Climate disruption OPEX", adjustedDowntimeCostPerDay / 1_000_000, "$M / day"),
  };

  return {
    projectIRR: projectIRRResult.value === null ? null : projectIRRResult.value * 100,
    projectIRRStatus: projectIRRResult.status,
    projectIRRReason: projectIRRResult.reason,
    moic: calculateMOIC(cashFlows),
    cashOnCash,
    initialInvestedEquity,
    cashOnCashDenominator: initialInvestedEquity,
    annualPreTaxEquityCashFlow,
    dscrMeaningfulYears: schedule
      .filter((year) => year.year > 0 && year.activeMonths > 0 && year.dscr !== null)
      .map((year) => year.year),
    returnSensitivity: [],
    payback: calculatePayback(cashFlows),
    npv,
    confidenceScore,
    revenueDelayMonths,
    incrementalCapex: capexContingency,
    opexChange: (yearFive?.totalOpex ?? 0) - (firstOperatingYear?.totalOpex ?? 0),
    recommendationBlocked: recommendationStatus === "BLOCKED",
    recommendationStatus,
    missingMaterialCount,
    unresolvedDecisionGateCount,
    unresolvedFinancialDriverCount,
    materialUnverifiedCount,
    totalDistributions,
    equityInvested,
    terminalValue: yearFive?.terminalValue ?? 0,
    schedule,
    assumptions,
    lineItems,
    attribution: {},
    waterfall: [],
    waterfallClosureDelta: null,
    waterfallReconciles: true,
    mechanicalDisclaimer: confidenceScore === 0,
  };
}

export function calculateCashFlowModel(evidence: EvidenceRecord, requestedCapacityMW = DEFAULT_CAPACITY_MW) {
  const capacityMW = normalizeCapacityMW(requestedCapacityMW);
  const safeEvidence = containEvidenceForModel(evidence).evidence;
  const current = runModel(safeEvidence, capacityMW);
  const verifiedBaseline = runModel(buildVerifiedEvidence(safeEvidence), capacityMW);
  const sensitivityGrid = [0.8, 1, 1.2];
  current.returnSensitivity = sensitivityGrid.flatMap((powerPriceMultiplier) =>
    sensitivityGrid.map((utilizationMultiplier) => {
      const scenario = runModel(safeEvidence, capacityMW, { powerPriceMultiplier, utilizationMultiplier });
      return {
        powerPriceMultiplier,
        utilizationMultiplier,
        // Keep an ambiguous return explicitly nullable across the model
        // boundary. JSON serialization preserves null, while undefined would
        // silently drop the field and invite consumers to treat it as zero.
        irr: scenario.projectIRR ?? null,
        irrStatus: scenario.projectIRRStatus,
        irrReason: scenario.projectIRRReason,
        moic: scenario.moic,
      };
    }),
  );

  const lineItems = Object.fromEntries(
    Object.entries(current.lineItems).map(([id, lineItem]) => {
      const repairedModel = runModel({
        ...safeEvidence,
        [id]: {
          ...safeEvidence[id],
          classification: "Verified Evidence" as Classification,
          modelClassification: undefined,
        },
      }, capacityMW);
      const rawDeltaIRR =
        current.projectIRR === null || repairedModel.projectIRR === null
          ? 0
          : current.projectIRR - repairedModel.projectIRR;
      const impactRole = getEvidenceImpactRole(id);
      const deltaIRR = impactRole === "Financial Driver" && rawDeltaIRR !== 0 ? rawDeltaIRR : 0;
      return [
        id,
        {
          ...lineItem,
          deltaIRR,
          impactRole,
          impactExplanation: getImpactExplanation(impactRole),
          impactTreatment: getImpactTreatment(id, impactRole, current.assumptions),
        },
      ];
    }),
  );

  const attribution: Record<string, FinancialAttribution> = Object.fromEntries(
    Object.entries(current.lineItems).map(([id, lineItem]) => {
      const impactRole = getEvidenceImpactRole(id);
      const modelInput = safeEvidence[id];
      const semanticDefinition = getEvidenceSemanticDefinition(id);
      if (!modelInput || !semanticDefinition) {
        throw new Error(`Financial attribution metadata is unavailable for governed evidence input "${id}".`);
      }
      const modeledClassification = modelInput.modelClassification ?? modelInput.classification;
      const repairedModel = runModel({
        ...safeEvidence,
        [id]: {
          ...safeEvidence[id],
          classification: "Verified Evidence" as Classification,
          modelClassification: undefined,
        },
      }, capacityMW);
      const directEffect = impactRole === "Financial Driver";
      const marginalAnnualDeltas = directEffect
        ? current.schedule.map((year, index) => year.netEquityCashFlow - (repairedModel.schedule[index]?.netEquityCashFlow ?? 0))
        : current.schedule.map(() => 0);
      const dollarImpact = marginalAnnualDeltas.reduce((total, delta) => total + delta, 0);
      const affectedCashFlowLine = getAffectedCashFlowLine(id, impactRole);
      const finalYearIndex = current.schedule.length - 1;
      const annualEffect = directEffect
        ? getRecurringCashFlowValue(current.schedule[finalYearIndex], affectedCashFlowLine) -
          getRecurringCashFlowValue(repairedModel.schedule[finalYearIndex], affectedCashFlowLine)
        : 0;
      const sensitivity = lineItems[id]?.deltaIRR ?? 0;
      return [
        id,
        {
          id,
          label: modelInput.label ?? semanticDefinition.label,
          rawValue: modelInput.rawValue ?? modelInput.value,
          rawUnit: modelInput.rawUnit ?? modelInput.unit ?? lineItem.unit,
          appliedValue: lineItem.value,
          appliedUnit: lineItem.unit,
          provenance: modelInput.sourceRole ?? "Synthetic underwriting model input",
          citation: modelInput.citation ?? "Synthetic underwriting assumption; no public-source claim is asserted.",
          sourceId: modelInput.sourceId,
          impactRole,
          currentClassification: modelInput.classification,
          modeledClassification,
          baselineClassification: "Verified Evidence",
          affectedCashFlowLine,
          baselineTreatment: getImpactTreatment(id, impactRole, repairedModel.assumptions),
          currentTreatment: getImpactTreatment(id, impactRole, current.assumptions),
          marginalAnnualDeltas,
          dollarImpact,
          annualEffect,
          annualEffectBasis: directEffect && affectedCashFlowLine !== "Close CAPEX"
            ? "Recurring operating line; excludes terminal value and debt repayment."
            : directEffect
              ? "Close treatment only; no recurring annual effect."
              : "No direct modeled effect.",
          singleInputSensitivityIRR: directEffect ? sensitivity : 0,
          hasDirectModeledEffect: directEffect && marginalAnnualDeltas.some((delta) => delta !== 0),
        } satisfies FinancialAttribution,
      ];
    }),
  );

  let beforeEvidence = buildVerifiedEvidence(safeEvidence);
  let beforeModel = verifiedBaseline;
  const waterfall = Object.entries(current.lineItems).flatMap(([id, lineItem]) => {
    const afterEvidence = {
      ...beforeEvidence,
       [id]: safeEvidence[id],
    };
    const afterModel = runModel(afterEvidence, capacityMW);
    const rawDeltaIRR =
      beforeModel.projectIRR === null || afterModel.projectIRR === null
        ? 0
        : afterModel.projectIRR - beforeModel.projectIRR;
    const impactRole = getEvidenceImpactRole(id);
    const deltaIRR = impactRole === "Financial Driver" && rawDeltaIRR !== 0 ? rawDeltaIRR : 0;
    const step = {
      ...lineItems[id],
      ...lineItem,
      deltaIRR,
      impactRole,
       impactExplanation: getImpactExplanation(impactRole),
       impactTreatment: getImpactTreatment(id, impactRole, afterModel.assumptions),
      index: 0,
      before: beforeModel.projectIRR,
      after: afterModel.projectIRR,
    };
    beforeEvidence = afterEvidence;
    beforeModel = afterModel;
    return impactRole === "Financial Driver" ? [step] : [];
  });
  waterfall.forEach((step, index) => {
    step.index = index;
  });
  const waterfallClosureDelta =
    waterfall.length === 0 || current.projectIRR === null || waterfall.at(-1)?.after === null
      ? null
      : (waterfall.at(-1)?.after ?? 0) - current.projectIRR;

  return {
    ...current,
    baseIRR: verifiedBaseline.projectIRR,
    baseModel: verifiedBaseline,
    lineItems,
    attribution,
    waterfall,
    waterfallClosureDelta,
    waterfallReconciles: waterfallClosureDelta === null || Math.abs(waterfallClosureDelta) <= WATERFALL_RECONCILIATION_TOLERANCE,
  };
}

export type WaterfallStep = ModelLineItem & {
  index: number;
  before: number | null;
  after: number | null;
};

export function isMaterialEvidenceId(id: string): id is MaterialEvidenceId {
  return MATERIAL_EVIDENCE_IDS.includes(id as MaterialEvidenceId);
}

function getImpactExplanation(role: ImpactRole) {
  switch (role) {
    case "Decision Gate":
      return "Decision posture";
    case "Context Indicator":
      return "Contextual assessment";
    default:
      return "Financial stress case";
  }
}

function getRecurringCashFlowValue(year: CashFlowYear, line: string) {
  switch (line) {
    case "Electricity OPEX":
      return year.electricityOpex;
    case "Water OPEX":
      return year.waterOpex;
    case "Revenue timing":
      return year.revenue;
    case "Carbon compliance OPEX":
      return year.carbonComplianceOpex;
    case "Climate disruption OPEX":
      return year.climateDisruptionOpex;
    default:
      return 0;
  }
}

function getAffectedCashFlowLine(id: string, role: ImpactRole) {
  if (role === "Decision Gate") return "Review gate";
  if (role === "Context Indicator") return "Context only";

  switch (id) {
    case "electricity_cost":
    case "electricity_escalation":
      return "Electricity OPEX";
    case "water_consumption":
    case "water_escalation":
      return "Water OPEX";
    case "grid_interconnection":
    case "permitting_timeline":
      return "Revenue timing";
    case "cooling_capex":
      return "Close CAPEX";
    case "carbon_compliance":
      return "Carbon compliance OPEX";
    case "site_hazard_exposure":
    case "downtime_cost":
      return "Climate disruption OPEX";
    default:
      return "Operating cash flow";
  }
}

function getImpactTreatment(id: string, role: ImpactRole, assumptions: ModelAssumptions) {
  if (role === "Decision Gate") return "Decision posture only; no financial adjustment is derived from this evidence item.";
  if (role === "Context Indicator") return "Contextual assessment only; no financial adjustment is derived from this evidence item.";

  switch (id) {
    case "electricity_cost":
      return `Applied rate: $${assumptions.electricityRate.toFixed(1)}/MWh.`;
    case "water_consumption":
      return `Applied water consumption: ${assumptions.annualCoolingWaterMgal.toFixed(1)} M gal/yr.`;
    case "grid_interconnection":
      return `Applied interconnection delay: ${assumptions.gridInterconnectionMonths.toFixed(0)} months; total revenue delay: ${assumptions.revenueDelayMonths} months.`;
    case "water_escalation":
      return `Applied water escalation: ${(assumptions.waterEscalationRate * 100).toFixed(1)}% annually.`;
    case "cooling_capex":
      return `Applied cooling CAPEX: $${assumptions.coolingCapex.toFixed(1)}M; total CAPEX contingency: $${assumptions.capexContingency.toFixed(1)}M.`;
    case "electricity_escalation":
      return `Applied electricity escalation: ${(assumptions.electricityEscalationRate * 100).toFixed(1)}% annually.`;
    case "carbon_compliance":
      return `Applied annual carbon compliance cost: $${assumptions.annualCarbonCompliance.toFixed(1)}M.`;
    case "permitting_timeline":
      return `Applied permitting delay: ${assumptions.permittingMonths.toFixed(0)} months; total revenue delay: ${assumptions.revenueDelayMonths} months.`;
    case "site_hazard_exposure":
      return `Applied annual hazard probability: ${(assumptions.adjustedHazardProbability * 100).toFixed(1)}%; climate disruption cost: $${(assumptions.adjustedDowntimeCostPerDay / 1_000_000).toFixed(2)}M/day.`;
    case "downtime_cost":
      return `Applied downtime cost: $${(assumptions.adjustedDowntimeCostPerDay / 1_000_000).toFixed(2)}M/day.`;
    default:
      return "Applied conservative underwriting treatment.";
  }
}
