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
    value: string | number;
    classification: Classification;
     modelClassification?: Classification;
    numericValue?: number;
    qualitativeValue?: QualitativeEvidenceValue;
  }
>;

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
};

export type ModelLineItem = {
  id: string;
  driver: string;
  value: number;
  unit: string;
  deltaIRR: number;
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
  effectiveRenewableProcurement: number;
  powerCostDifferential: number;
  gridInterconnectionMonths: number;
  permittingMonths: number;
  communityDelayMonths: number;
  revenueDelayMonths: number;
  customerUtilizationMultiplier: number;
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
};

export type CashFlowModel = {
  projectIRR: number | null;
  moic: number;
  cashOnCash: number;
  payback: number | null;
  npv: number;
  confidenceScore: number;
  revenueDelayMonths: number;
  incrementalCapex: number;
  opexChange: number;
  recommendationBlocked: boolean;
  recommendationStatus: RecommendationStatus;
  missingMaterialCount: number;
  materialUnverifiedCount: number;
  totalDistributions: number;
  equityInvested: number;
  terminalValue: number;
  schedule: CashFlowYear[];
  assumptions: ModelAssumptions;
  lineItems: Record<string, ModelLineItem>;
  mechanicalDisclaimer: boolean;
  baseIRR?: number | null;
  baseModel?: CashFlowModel;
};

export const DEFAULT_CAPACITY_MW = 1_200;
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
export const MATERIAL_EVIDENCE_IDS: readonly string[] = [
  "community_risk",
  "water_rights",
  "grid_interconnection",
  "customer_concentration",
  "permitting_timeline",
  "backup_power_capacity",
  "water_source_resilience",
];

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

function calculateNPV(cashFlows: number[], rate: number) {
  return cashFlows.reduce((total, cashFlow, index) => total + cashFlow / Math.pow(1 + rate, index), 0);
}

function calculateIRR(cashFlows: number[]) {
  const hasPositive = cashFlows.some((cashFlow) => cashFlow > 0);
  const hasNegative = cashFlows.some((cashFlow) => cashFlow < 0);
  if (!hasPositive || !hasNegative) return null;

  const npvAt = (rate: number) => calculateNPV(cashFlows, rate);
  const derivativeAt = (rate: number) =>
    cashFlows.reduce((total, cashFlow, index) => {
      if (index === 0) return total;
      return total - (index * cashFlow) / Math.pow(1 + rate, index + 1);
    }, 0);

  let rate = 0.15;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const npv = npvAt(rate);
    if (Math.abs(npv) < 0.000001) return rate;

    const derivative = derivativeAt(rate);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 0.0000001) break;

    const nextRate = rate - npv / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -0.9999 || nextRate > 100) break;
    rate = nextRate;
  }

  let lower = -0.99;
  let upper = 1;
  let lowerNPV = npvAt(lower);
  let upperNPV = npvAt(upper);

  while (lowerNPV * upperNPV > 0 && upper < 100) {
    upper *= 2;
    upperNPV = npvAt(upper);
  }

  if (!Number.isFinite(lowerNPV) || !Number.isFinite(upperNPV) || lowerNPV * upperNPV > 0) {
    return null;
  }

  for (let iteration = 0; iteration < 120; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const midpointNPV = npvAt(midpoint);
    if (Math.abs(midpointNPV) < 0.000001) return midpoint;

    if (lowerNPV * midpointNPV <= 0) {
      upper = midpoint;
      upperNPV = midpointNPV;
    } else {
      lower = midpoint;
      lowerNPV = midpointNPV;
    }
  }

  return (lower + upper) / 2;
}

function calculatePayback(cashFlows: number[]) {
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
        modelClassification: item.modelClassification
          ? "Verified Evidence" as Classification
          : undefined,
      },
    ]),
  );
}

function normalizeCapacityMW(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, 100_000)
    : DEFAULT_CAPACITY_MW;
}

function runModel(evidence: EvidenceRecord, capacityMW: number): CashFlowModel {
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
    finiteNumericValue(renewableItem.numericValue, 25) * renewableQuality.renewableCoverage,
    0,
    100,
  );
  const powerCostDifferential =
    ((100 - effectiveRenewableProcurement) / 100) * 0.12;
  const gridInterconnectionMonths =
    finiteNumericValue(gridItem.numericValue, 14) + gridQuality.timelineAdder;
  const permittingMonths =
    finiteNumericValue(permittingItem.numericValue, 10) + permittingQuality.timelineAdder;
  const communityDelayMonths = communityQuality.communityDelay;
  // Interconnection and permitting are parallel gates; the later gate controls
  // the start date, while community risk adds an independent permitting delay.
  const revenueDelayMonths = Math.round(
    Math.max(gridInterconnectionMonths, permittingMonths) + communityDelayMonths,
  );
  const concentration = clamp(
    finiteNumericValue(concentrationItem.numericValue, 100) / 100,
    0,
    1,
  );
  const customerUtilizationMultiplier = clamp(
    1 - concentration * concentrationQuality.customerLossRate,
    0.4,
    1,
  );
  const coolingCapex = finiteNumericValue(coolingItem.numericValue, 450) * capacityScale;
  const communityCapexContingency = communityQuality.communityContingency;
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
  const backupPowerContingencyTriggered =
    backupPowerHours < 72 && gridItem.classification !== "Verified Evidence";
  const backupPowerCapex = backupPowerContingencyTriggered
    ? BACKUP_POWER_CAPEX_BY_CLASSIFICATION[backupPowerItem.classification] * capacityScale
    : 0;
  const waterSourceResilienceState = isWaterSourceResilienceState(
    waterSourceItem.qualitativeValue,
  )
    ? waterSourceItem.qualitativeValue
    : "single-source";
  const waterSourceResilience = WATER_SOURCE_RESILIENCE_LABELS[waterSourceResilienceState];
  const stressedSingleSourceWater =
    hazardExposureLevel === "high" && waterSourceResilienceState === "single-source";
  const waterSourceEscalationMultiplier = stressedSingleSourceWater ? 1.5 : 1;
  const waterConversionContingencyTriggered =
    waterSourceItem.classification !== "Verified Evidence" &&
    waterRightsItem.classification !== "Verified Evidence";
  const waterConversionCapex = waterConversionContingencyTriggered
    ? WATER_CONVERSION_CAPEX_BY_CLASSIFICATION[waterSourceItem.classification] * capacityScale
    : 0;
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
  const waterRightsCostMultiplier = waterRightsQuality.waterRightsMultiplier;
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
  });

  for (let year = 1; year <= 5; year += 1) {
    const calendarUtilization = UTILIZATION_RAMP[year - 1] ?? 0.92;
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
    });
  }

  const cashFlows = schedule.map((year) => year.netEquityCashFlow);
  const projectIRR = calculateIRR(cashFlows);
  const npv = calculateNPV(cashFlows, DISCOUNT_RATE);
  const totalDistributions = cashFlows
    .slice(1)
    .filter((cashFlow) => cashFlow > 0)
    .reduce((total, cashFlow) => total + cashFlow, 0);
  const equityInvested = cashFlows
    .filter((cashFlow) => cashFlow < 0)
    .reduce((total, cashFlow) => total + Math.abs(cashFlow), 0);
  const cashOnCash =
    equityInvested > 0
      ? ((schedule[3]?.netEquityCashFlow ?? 0) / equityInvested) * 100
      : 0;
  const missingMaterialCount = Object.values(evidence).filter(
    (item) => item.classification === "Missing Evidence" && MATERIAL_EVIDENCE_IDS.includes(item.id),
  ).length;
  const materialUnverifiedCount = Object.values(evidence).filter(
    (item) =>
      MATERIAL_EVIDENCE_IDS.includes(item.id) &&
      (item.classification === "Model Inference" || item.classification === "User Assumption"),
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
    effectiveRenewableProcurement,
    powerCostDifferential,
    gridInterconnectionMonths,
    permittingMonths,
    communityDelayMonths,
    revenueDelayMonths,
    customerUtilizationMultiplier,
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
  };

  const lineItems: Record<string, ModelLineItem> = {
    electricity_cost: { id: "electricity_cost", driver: "Power OPEX", value: electricityRate, unit: "$/MWh", deltaIRR: 0 },
    water_consumption: { id: "water_consumption", driver: "Water OPEX", value: annualCoolingWaterMgal, unit: "M gal / yr", deltaIRR: 0 },
    grid_interconnection: { id: "grid_interconnection", driver: "Revenue delay", value: revenueDelayMonths, unit: "months", deltaIRR: 0 },
    water_escalation: { id: "water_escalation", driver: "Water OPEX growth", value: adjustedWaterEscalationRate * 100, unit: "%", deltaIRR: 0 },
    community_risk: { id: "community_risk", driver: "Permitting delay / CAPEX", value: communityDelayMonths, unit: "months", deltaIRR: 0 },
    renewable_percentage: { id: "renewable_percentage", driver: "Power cost differential", value: powerCostDifferential * 100, unit: "%", deltaIRR: 0 },
    cooling_capex: { id: "cooling_capex", driver: "Direct CAPEX", value: coolingCapex + capexContingency, unit: "$M", deltaIRR: 0 },
    electricity_escalation: { id: "electricity_escalation", driver: "Power OPEX escalation", value: electricityEscalationRate * 100, unit: "%", deltaIRR: 0 },
    carbon_compliance: { id: "carbon_compliance", driver: "Carbon compliance OPEX", value: annualCarbonCompliance, unit: "$M / yr", deltaIRR: 0 },
    permitting_timeline: { id: "permitting_timeline", driver: "Revenue delay", value: permittingMonths, unit: "months", deltaIRR: 0 },
    customer_concentration: { id: "customer_concentration", driver: "Utilization discount", value: (1 - customerUtilizationMultiplier) * 100, unit: "%", deltaIRR: 0 },
    water_rights: { id: "water_rights", driver: "Water cost contingency", value: (waterRightsCostMultiplier - 1) * 100, unit: "%", deltaIRR: 0 },
    site_hazard_exposure: { id: "site_hazard_exposure", driver: "Climate disruption OPEX", value: adjustedHazardProbability * 100, unit: "%", deltaIRR: 0 },
    backup_power_capacity: { id: "backup_power_capacity", driver: "Backup power CAPEX / OPEX", value: backupPowerCapex, unit: "$M", deltaIRR: 0 },
    water_source_resilience: { id: "water_source_resilience", driver: "Water conversion CAPEX", value: waterConversionCapex, unit: "$M", deltaIRR: 0 },
    downtime_cost: { id: "downtime_cost", driver: "Climate disruption OPEX", value: adjustedDowntimeCostPerDay / 1_000_000, unit: "$M / day", deltaIRR: 0 },
  };

  return {
    projectIRR: projectIRR === null ? null : projectIRR * 100,
    moic: equityInvested > 0 ? totalDistributions / equityInvested : 0,
    cashOnCash,
    payback: calculatePayback(cashFlows),
    npv,
    confidenceScore,
    revenueDelayMonths,
    incrementalCapex: capexContingency,
    opexChange: (yearFive?.totalOpex ?? 0) - (firstOperatingYear?.totalOpex ?? 0),
    recommendationBlocked: recommendationStatus === "BLOCKED",
    recommendationStatus,
    missingMaterialCount,
    materialUnverifiedCount,
    totalDistributions,
    equityInvested,
    terminalValue: yearFive?.terminalValue ?? 0,
    schedule,
    assumptions,
    lineItems,
    mechanicalDisclaimer: confidenceScore === 0,
  };
}

export function calculateCashFlowModel(evidence: EvidenceRecord, requestedCapacityMW = DEFAULT_CAPACITY_MW) {
  const capacityMW = normalizeCapacityMW(requestedCapacityMW);
  const current = runModel(evidence, capacityMW);
  const verifiedBaseline = runModel(buildVerifiedEvidence(evidence), capacityMW);

  const lineItems = Object.fromEntries(
    Object.entries(current.lineItems).map(([id, lineItem]) => {
      const repairedModel = runModel({
        ...evidence,
        [id]: {
          ...evidence[id],
          classification: "Verified Evidence" as Classification,
          modelClassification: evidence[id].modelClassification
            ? "Verified Evidence" as Classification
            : undefined,
        },
      }, capacityMW);
      const deltaIRR =
        current.projectIRR === null || repairedModel.projectIRR === null
          ? 0
          : current.projectIRR - repairedModel.projectIRR;
      return [id, { ...lineItem, deltaIRR }];
    }),
  );

  return {
    ...current,
    baseIRR: verifiedBaseline.projectIRR,
    baseModel: verifiedBaseline,
    lineItems,
  };
}
