import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import {
  calculateCashFlowModel,
  calculateIRR,
  containEvidenceForModel,
  type EvidenceRecord,
} from "./cashFlowEngine";

type AuditYear = {
  year: number;
  activeMonths: number;
  calendarUtilization: number;
  operatingUtilization: number;
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

type AuditCase = {
  name: string;
  electricityRate: number;
  waterMgal: number;
  waterEscalationRate: number;
  coolingCapex: number;
  coolingContingencyRate: number;
  electricityEscalationRate: number;
  carbonCompliance: number;
  delayMonths: number;
  hazardProbability: number;
  downtimeCostPerDay: number;
};

const CAPACITY_MW = 1_200;
const CAPACITY_SCALE = 1;
const LEASE_RATE_PER_KW_MONTH = 185;
const UTILIZATION_RAMP = [0.6, 0.8, 0.92, 0.92, 0.92];
const HOURS_PER_YEAR = 8_760;
const WATER_COST_PER_GALLON = 0.015;
const WATER_RIGHTS_COST_MULTIPLIER = 1.5;
const WATER_SOURCE_ESCALATION_MULTIPLIER = 1.5;
const MAINTENANCE_RATE = 0.045;
const ANNUAL_LABOR = 18;
const INSURANCE_RATE = 0.0035;
const ENTRY_VALUE = 4_800;
const DEBT_LTV = 0.6;
const INTEREST_RATE = 0.075;
const AMORTIZATION_YEARS = 10;
const EXIT_MULTIPLE = 2.2;
const DISCOUNT_RATE = 0.1;
const CUSTOMER_UTILIZATION_MULTIPLIER = 0.9;
const POWER_COST_DIFFERENTIAL = 0.0945;

function close(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message}: ${actual} vs ${expected}`);
}

function independentNpv(cashFlows: number[], rate: number) {
  return cashFlows.reduce((total, cashFlow, index) => (
    total + cashFlow / (1 + rate) ** index
  ), 0);
}

function independentIrr(cashFlows: number[]): number | null {
  if (!cashFlows.some((value) => value < 0) || !cashFlows.some((value) => value > 0)) return null;
  let low = -0.999999;
  let high = 1;
  let lowNpv = independentNpv(cashFlows, low);
  let highNpv = independentNpv(cashFlows, high);
  while (lowNpv * highNpv > 0 && high < 128) {
    high *= 2;
    highNpv = independentNpv(cashFlows, high);
  }
  if (!Number.isFinite(lowNpv) || !Number.isFinite(highNpv) || lowNpv * highNpv > 0) return null;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const midpoint = (low + high) / 2;
    const midpointNpv = independentNpv(cashFlows, midpoint);
    if (Math.abs(midpointNpv) < 0.000000001) return midpoint;
    if (lowNpv * midpointNpv <= 0) {
      high = midpoint;
      highNpv = midpointNpv;
    } else {
      low = midpoint;
      lowNpv = midpointNpv;
    }
  }
  return (low + high) / 2;
}

function independentPayback(cashFlows: number[]): number | null {
  let cumulative = 0;
  for (let index = 0; index < cashFlows.length; index += 1) {
    const previous = cumulative;
    cumulative += cashFlows[index];
    if (index > 0 && cumulative >= 0) {
      const change = cumulative - previous;
      return (index - 1) + (change > 0 ? Math.min(1, Math.max(0, Math.abs(previous) / change)) : 0);
    }
  }
  return null;
}

function independentlyBuildCase(input: AuditCase) {
  const annualRevenueAtFullUtilization = CAPACITY_MW * 1_000 * LEASE_RATE_PER_KW_MONTH * 12 / 1_000_000;
  const entryValue = ENTRY_VALUE * CAPACITY_SCALE;
  const coolingCapex = input.coolingCapex * CAPACITY_SCALE;
  const capexContingency = coolingCapex * input.coolingContingencyRate + 80 * CAPACITY_SCALE;
  const totalCapex = entryValue + coolingCapex + capexContingency;
  const debtAmount = entryValue * DEBT_LTV;
  const annualPrincipalPayment = debtAmount / AMORTIZATION_YEARS;
  const initialEquity = totalCapex - debtAmount;
  const schedule: AuditYear[] = [{
    year: 0,
    activeMonths: 0,
    calendarUtilization: 0,
    operatingUtilization: 0,
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
    netEquityCashFlow: -initialEquity,
    cumulativeEquityCashFlow: -initialEquity,
  }];

  for (let year = 1; year <= 5; year += 1) {
    const calendarUtilization = UTILIZATION_RAMP[year - 1];
    const activeMonths = Math.min(12, Math.max(0, 12 - Math.max(0, input.delayMonths - (year - 1) * 12)));
    const operatingUtilization = calendarUtilization * activeMonths / 12;
    const revenue = annualRevenueAtFullUtilization * operatingUtilization * CUSTOMER_UTILIZATION_MULTIPLIER;
    const electricityMwh = CAPACITY_MW * HOURS_PER_YEAR * operatingUtilization;
    const powerRate = input.electricityRate * (1 + POWER_COST_DIFFERENTIAL) *
      (1 + input.electricityEscalationRate) ** (year - 1);
    const electricityOpex = electricityMwh * powerRate / 1_000_000;
    const waterGallons = input.waterMgal * 1_000_000 * operatingUtilization;
    const waterRate = WATER_COST_PER_GALLON * WATER_RIGHTS_COST_MULTIPLIER *
      (1 + input.waterEscalationRate * WATER_SOURCE_ESCALATION_MULTIPLIER) ** (year - 1);
    const waterOpex = waterGallons * waterRate / 1_000_000;
    const directCapex = entryValue + coolingCapex;
    const maintenanceOpex = directCapex * MAINTENANCE_RATE * operatingUtilization;
    const laborOpex = ANNUAL_LABOR * CAPACITY_SCALE * operatingUtilization;
    const insuranceOpex = directCapex * INSURANCE_RATE * operatingUtilization;
    const carbonComplianceOpex = input.carbonCompliance * CAPACITY_SCALE * operatingUtilization;
    const climateDisruptionOpex = input.downtimeCostPerDay * CAPACITY_SCALE *
      input.hazardProbability * 365 * operatingUtilization / 1_000_000;
    const backupPowerOpex = 0;
    const totalOpex = electricityOpex + waterOpex + maintenanceOpex + laborOpex +
      insuranceOpex + carbonComplianceOpex + climateDisruptionOpex + backupPowerOpex;
    const noi = revenue - totalOpex;
    const beginningDebt = Math.max(0, debtAmount - annualPrincipalPayment * (year - 1));
    const principal = Math.min(beginningDebt, annualPrincipalPayment);
    const interest = beginningDebt * INTEREST_RATE;
    const endingDebt = Math.max(0, beginningDebt - principal);
    const terminalValue = year === 5 ? Math.max(0, noi * EXIT_MULTIPLE) : 0;
    const terminalDebtRepayment = year === 5 ? endingDebt : 0;
    const netEquityCashFlow = noi - interest - principal + terminalValue - terminalDebtRepayment;
    const previousCumulative = schedule.at(-1)?.cumulativeEquityCashFlow ?? 0;
    schedule.push({
      year,
      activeMonths,
      calendarUtilization,
      operatingUtilization,
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
      cumulativeEquityCashFlow: previousCumulative + netEquityCashFlow,
    });
  }

  const cashFlows = schedule.map((year) => year.netEquityCashFlow);
  const distributions = cashFlows.slice(1).filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const invested = cashFlows.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
  return {
    schedule,
    cashFlows,
    initialEquity,
    debtAmount,
    annualPrincipalPayment,
    terminalValue: schedule[5].terminalValue,
    terminalDebtRepayment: schedule[5].terminalDebtRepayment,
    irr: independentIrr(cashFlows),
    npv: independentNpv(cashFlows, DISCOUNT_RATE),
    moic: invested > 0 ? distributions / invested : 0,
    payback: independentPayback(cashFlows),
  };
}

const BASELINE_CASE: AuditCase = {
  name: "underwriting baseline",
  electricityRate: 42,
  waterMgal: 23,
  waterEscalationRate: 0.07,
  coolingCapex: 450,
  coolingContingencyRate: 0,
  electricityEscalationRate: 0.06,
  carbonCompliance: 20,
  delayMonths: 14,
  hazardProbability: 0.05,
  downtimeCostPerDay: 2_850_000,
};

const STRESS_CASE: AuditCase = {
  name: "active conservative stress",
  electricityRate: 44.1,
  waterMgal: 34.5,
  waterEscalationRate: 0.1,
  coolingCapex: 450,
  coolingContingencyRate: 0.1,
  electricityEscalationRate: 0.08,
  carbonCompliance: 24,
  delayMonths: 14,
  hazardProbability: 0.075,
  downtimeCostPerDay: 2_850_000 * 1.15,
};

function allVerified(): EvidenceRecord {
  return Object.fromEntries(
    Object.entries(INITIAL_EVIDENCE).map(([id, item]) => [
      id,
      { ...item, classification: "Verified Evidence" as const, modelClassification: undefined },
    ]),
  );
}

const RECONCILED_SCHEDULE_FIELDS: Array<Exclude<keyof AuditYear, "year">> = [
  "activeMonths",
  "calendarUtilization",
  "operatingUtilization",
  "revenue",
  "electricityMwh",
  "electricityOpex",
  "waterGallons",
  "waterOpex",
  "maintenanceOpex",
  "laborOpex",
  "insuranceOpex",
  "carbonComplianceOpex",
  "climateDisruptionOpex",
  "backupPowerOpex",
  "totalOpex",
  "noi",
  "beginningDebt",
  "interest",
  "principal",
  "endingDebt",
  "terminalValue",
  "terminalDebtRepayment",
  "netEquityCashFlow",
  "cumulativeEquityCashFlow",
];

test("independent Stargate baseline and stress fixtures reconcile full schedules and returns", () => {
  const baselineFixture = independentlyBuildCase(BASELINE_CASE);
  const stressFixture = independentlyBuildCase(STRESS_CASE);
  const baseline = calculateCashFlowModel(allVerified());
  const stress = calculateCashFlowModel(INITIAL_EVIDENCE);

  for (const [name, fixture, production] of [
    ["baseline", baselineFixture, baseline],
    ["stress", stressFixture, stress],
  ] as const) {
    assert.equal(fixture.schedule.length, production.schedule.length, `${name} schedule length`);
    close(fixture.initialEquity, production.initialInvestedEquity, `${name} initial equity`);
    close(fixture.debtAmount, production.assumptions.debtAmount, `${name} debt draw`);
    close(fixture.terminalValue, production.terminalValue, `${name} terminal value`);
    close(fixture.terminalDebtRepayment, production.assumptions.terminalDebtRepayment, `${name} terminal debt`);
    close(fixture.irr! * 100, production.projectIRR!, `${name} IRR`);
    close(fixture.npv, production.npv, `${name} NPV`);
    close(fixture.moic, production.moic, `${name} MOIC`);
    close(fixture.payback!, production.payback!, `${name} payback`);
    fixture.schedule.forEach((year, index) => {
      const actual = production.schedule[index];
      assert.equal(year.year, actual.year, `${name} schedule year ${index}`);
      for (const field of RECONCILED_SCHEDULE_FIELDS) {
        close(year[field], actual[field], `${name} year ${year.year} ${field}`);
      }
    });
  }

  assert.equal(BASELINE_CASE.delayMonths, STRESS_CASE.delayMonths, "timing is unchanged in the active stress");
  assert.equal(baselineFixture.schedule[1].activeMonths, 0, "year one is pre-operation");
  assert.equal(baselineFixture.schedule[5].terminalDebtRepayment, 1440, "five years of straight-line principal leave 50% debt");
  assert.equal(baselineFixture.schedule[5].terminalValue, baselineFixture.schedule[5].noi * EXIT_MULTIPLE);
  close(baseline.assumptions.electricityRate, BASELINE_CASE.electricityRate, "baseline electricity multiplier");
  close(stress.assumptions.electricityRate, STRESS_CASE.electricityRate, "stress electricity multiplier");
  close(baseline.assumptions.annualCoolingWaterMgal, BASELINE_CASE.waterMgal, "baseline water multiplier");
  close(stress.assumptions.annualCoolingWaterMgal, STRESS_CASE.waterMgal, "stress water multiplier");
  close(baseline.assumptions.waterEscalationRate, 0.105, "baseline water escalation treatment");
  close(stress.assumptions.waterEscalationRate, 0.15, "stress water escalation treatment");
  close(baseline.assumptions.capexContingency, 80, "baseline close contingency");
  close(stress.assumptions.capexContingency, 125, "stress close contingency");
  close(baseline.assumptions.electricityEscalationRate, BASELINE_CASE.electricityEscalationRate, "baseline power escalation treatment");
  close(stress.assumptions.electricityEscalationRate, STRESS_CASE.electricityEscalationRate, "stress power escalation treatment");
  close(baseline.assumptions.annualCarbonCompliance, BASELINE_CASE.carbonCompliance, "baseline carbon treatment");
  close(stress.assumptions.annualCarbonCompliance, STRESS_CASE.carbonCompliance, "stress carbon treatment");
  close(baseline.assumptions.adjustedHazardProbability, BASELINE_CASE.hazardProbability, "baseline hazard treatment");
  close(stress.assumptions.adjustedHazardProbability, STRESS_CASE.hazardProbability, "stress hazard treatment");
  close(baseline.assumptions.adjustedDowntimeCostPerDay, BASELINE_CASE.downtimeCostPerDay, "baseline downtime treatment");
  close(stress.assumptions.adjustedDowntimeCostPerDay, STRESS_CASE.downtimeCostPerDay, "stress downtime treatment");
  close(baseline.assumptions.revenueDelayMonths, BASELINE_CASE.delayMonths, "baseline delay treatment");
  close(stress.assumptions.revenueDelayMonths, STRESS_CASE.delayMonths, "stress delay treatment");
  baselineFixture.schedule.forEach((year, index) => {
    for (const field of RECONCILED_SCHEDULE_FIELDS) {
      close(
        stressFixture.schedule[index][field] - year[field],
        stress.schedule[index][field] - baseline.schedule[index][field],
        `stress-minus-baseline year ${year.year} ${field}`,
      );
    }
  });
  assert.equal("unleveredIRR" in stress, false, "the model does not claim or display an unlevered return");
  assert.equal(calculateIRR([-100, -25, -10]), null, "production IRR is explicit when no sign change exists");
});

test("independent fixture proves each climate treatment enters exactly once", () => {
  const fixture = independentlyBuildCase(STRESS_CASE);
  const yearFive = fixture.schedule[5];
  close(
    yearFive.climateDisruptionOpex,
    STRESS_CASE.downtimeCostPerDay * STRESS_CASE.hazardProbability * 365 *
      yearFive.operatingUtilization / 1_000_000,
    "expected downtime loss",
  );
  close(yearFive.terminalValue, yearFive.noi * EXIT_MULTIPLE, "terminal NOI multiple");
  close(
    yearFive.netEquityCashFlow,
    yearFive.noi - yearFive.interest - yearFive.principal +
      yearFive.terminalValue - yearFive.terminalDebtRepayment,
    "terminal equity cash flow",
  );
  assert.equal(fixture.schedule.filter((year) => year.terminalValue !== 0).length, 1);
  assert.equal(fixture.schedule.filter((year) => year.terminalDebtRepayment !== 0).length, 1);
});

test("model boundary rejects non-accepted research and revalidates claimed normalization", () => {
  const acceptedElectricity = {
    ...INITIAL_EVIDENCE.electricity_cost,
    value: 55,
    numericValue: 55,
    unit: "$/MWh",
    classification: "Verified Evidence" as const,
    description: "Named facility project tariff contract",
    citation: "Named facility contract disclosure",
    sourceUrl: "https://example.com/facility-contract",
    sourceSupportConfidence: 95,
    coverageStatus: "supported",
    sources: [{ exactProject: true, sourceClass: "primary-company" }],
    acceptedForModel: true,
    eligibleForModel: true,
    researchState: "accepted",
    rawValue: 55,
    rawUnit: "$/MWh",
    semanticValidationStatus: "valid" as const,
    normalization: { policyVersion: 1, conversion: "none", validationStatus: "valid" as const },
  };
  const accepted = { ...INITIAL_EVIDENCE, electricity_cost: acceptedElectricity };
  const pending = {
    ...accepted,
    electricity_cost: { ...acceptedElectricity, researchState: "proposed" as const },
  };
  const forged = {
    ...accepted,
    electricity_cost: { ...acceptedElectricity, value: 900, numericValue: 900 },
  };

  const acceptedModel = calculateCashFlowModel(accepted);
  const pendingModel = calculateCashFlowModel(pending);
  const forgedModel = calculateCashFlowModel(forged);
  assert.equal(pendingModel.assumptions.electricityRate, 50.4);
  assert.notEqual(pendingModel.projectIRR, acceptedModel.projectIRR);
  assert.equal(forgedModel.assumptions.electricityRate, acceptedModel.assumptions.electricityRate);
  assert.equal(containEvidenceForModel(pending).quarantined.electricity_cost.length > 0, true);
});