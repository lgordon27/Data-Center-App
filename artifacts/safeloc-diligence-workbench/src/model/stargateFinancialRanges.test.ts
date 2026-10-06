import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import { createEiaFallback, type EiaElectricityData } from "@/services/eiaService";
import { calculateTraceableCashFlowModel, type EvidenceRecord, type TraceableFinancialValues } from "./cashFlowEngine";
import { authenticEiaObservation, buildFinancialRegistry, resolveFinancialInput } from "./financialInputProvenance";
import {
  ADJUSTABLE_FINANCIAL_INPUTS, EMPTY_FINANCIAL_ASSUMPTIONS, buildEstimatedFinancialRange,
  editFinancialAssumption, validFinancialAssumption,
} from "./financialTransmission";

const context = { isStargate: true, state: "TX" };
const evidence = INITIAL_EVIDENCE as EvidenceRecord;
const range = (session = EMPTY_FINANCIAL_ASSUMPTIONS) => buildEstimatedFinancialRange({ evidence, context, session });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function receipt(value = 71.3): EiaElectricityData {
  return {
    ...createEiaFallback(), dataOrigin: "provider", status: "cached",
    fetchedAt: "2026-09-20T12:00:00.000Z", latestPrice: value, latestPricePeriod: "2026-08",
    priceHistory: [{ period: "2026-08", pricePerMwh: value }],
    sourceMetadata: { dataOrigin: "provider", status: "cached", fetchedAt: "2026-09-20T12:00:00.000Z" },
  };
}

test("immutable complete registry covers ordinary inputs, evidence, constants and private tables", () => {
  const r = range();
  const required = [
    ...ADJUSTABLE_FINANCIAL_INPUTS, "capacityMW", "totalCost", "debtAmount", "reportedEquity", "leaseYears",
    "maintenancePerMW", "laborPerMW", "propertyTaxPerGW", "deliveredFirstYearMW", "insuranceRate",
    "utilityPassThrough", "downtimeCost", "waterTariff", "waterConversionCapex", "waterRightsMultiplier",
    "waterSourceMultiplier", "carbonFallback", "amortizationYears", "customerUtilization", "powerDifferential",
    ...Object.keys(evidence).map(id => `evidence:${id}`),
  ];
  for (const id of required) assert.ok(r.defaults[id], `missing registry entry ${id}`);
  for (const item of Object.values(r.defaults)) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "label", "value", "low", "high", "unit", "type", "sourceTier",
      "specificity", "sourceName", "sourceUrl", "asOfDate", "applicability", "resolutionRule", "provisional",
      "visibility", "required"].sort());
    assert.ok(Object.isFrozen(item));
    if (item.type === "disclosed") assert.equal(item.low, item.high);
    if (item.type === "blank") assert.equal(item.value, null);
  }
  assert.ok(Object.keys(r.defaults).some(id => id.startsWith("backupPowerCapex:")));
  assert.ok(Object.keys(r.defaults).some(id => id.startsWith("quality:")));
  assert.ok(Object.isFrozen(r.defaults));
  assert.equal(r.defaults.insuranceRate.sourceUrl, null);
  assert.equal(r.defaults.insuranceRate.provisional, true);
  assert.equal(r.defaults.carbonFallback.visibility, "methodology");
  assert.equal(r.defaults.reportedEquity.value, 5000);
});

test("resolution prefers disclosed project then local then public state/national then blank", () => {
  const original = buildFinancialRegistry(context).leaseRate;
  const blank = { ...original, value: null, low: null, high: null, type: "blank" as const };
  const national = { ...original, value: 172 };
  const local = { ...original, value: 169, specificity: "local" as const };
  const project = { ...original, value: 180, low: 180, high: 180, specificity: "project" as const, type: "disclosed" as const };
  assert.equal(resolveFinancialInput(blank, [national, local, project]).value, 180);
  assert.equal(resolveFinancialInput(blank, [national, local]).value, 169);
  assert.equal(resolveFinancialInput(blank, [national]).value, 172);
  assert.equal(resolveFinancialInput(blank, []).value, null);
  assert.equal(resolveFinancialInput(blank, [{ ...project, sourceUrl: null }]).value, null);
  assert.equal(resolveFinancialInput(blank, [{ ...project, value: Number.NaN }]).value, null);
  assert.equal(resolveFinancialInput(blank, [{ ...project, low: 190 }]).value, null);
});

test("input-specific rules prohibit national water and non-disclosed capex guesses", () => {
  const defaults = buildFinancialRegistry(context);
  const other = buildFinancialRegistry({ isStargate: false, state: "CA", candidates: [
    { ...defaults.waterTariff, specificity: "national" },
    { ...defaults.costPerMW, type: "benchmark", specificity: "national" },
    { ...defaults.deliveredFirstYearMW, type: "benchmark", specificity: "national" },
  ] });
  for (const id of ["waterTariff", "costPerMW", "deliveredFirstYearMW", "capacityMW", "debtAmount"]) {
    assert.equal(other[id].value, null);
    assert.equal(other[id].type, "blank");
  }
  const exact = buildFinancialRegistry({ ...context, candidates: [
    { ...defaults.leaseRate, type: "disclosed", specificity: "project", value: 200, low: 200, high: 200 },
  ] });
  assert.equal(exact.leaseRate.value, 200);
  assert.match(defaults.waterTariff.sourceUrl!, /abilenetx\.gov/);
  assert.equal(defaults.waterTariff.value, 11.65);
});

test("electricity requires authentic existing TX industrial provider history and timestamp, never embedded numbers", () => {
  assert.equal(authenticEiaObservation(createEiaFallback(), "TX"), null);
  assert.equal(buildFinancialRegistry({ ...context, eia: createEiaFallback() }).electricityPrice.value, null);
  assert.equal(authenticEiaObservation(receipt(), "CA"), null);
  assert.equal(authenticEiaObservation({ ...receipt(), fetchedAt: undefined }, "TX"), null);
  assert.equal(authenticEiaObservation({ ...receipt(), priceHistory: [] }, "TX"), null);
  assert.equal(authenticEiaObservation({ ...receipt(), latestPrice: 80 }, "TX"), null);
  assert.equal(authenticEiaObservation({ ...receipt(), latestPricePeriod: "2026-99" }, "TX"), null);
  const r = buildFinancialRegistry({ ...context, eia: createEiaFallback(), retainedEia: receipt(71.3) });
  assert.equal(r.electricityPrice.value, 71.3);
  assert.equal(r.electricityPrice.asOfDate, "2026-08");
  assert.equal(r.electricityPrice.type, "benchmark");
  assert.equal(r.electricityPrice.specificity, "state");
  assert.match(r.electricityPrice.applicability, /not a project tariff/);
});

test("disclosed debt, cap-rate forward exit, annual costs, delivery and no double-counted capex reconcile independently", () => {
  const r = range();
  assert.equal(r.status, "estimated");
  const m = r.cases.central.model!;
  assert.equal(m.assumptions.debtAmount, 9600);
  assert.equal(m.assumptions.entryValue, 15000);
  assert.equal(m.assumptions.coolingCapex, 0);
  assert.equal(m.assumptions.initialInvestedEquity, 15000 + m.assumptions.capexContingency - 9600);
  assert.notEqual(m.assumptions.initialInvestedEquity, r.defaults.reportedEquity.value);
  assert.deepEqual(m.assumptions.utilizationRamp, [206 / 1200, 1, 1, 1, 1]);
  assert.equal(m.assumptions.leaseRatePerKwMonth, 172);
  close(m.assumptions.downtimeCostPerDay, 1200 * 1000 * 172 * 12 / 365);
  const last = m.schedule[5];
  close(last.maintenanceOpex, 1200 * .12);
  close(last.laborOpex, 1200 * .04);
  close(last.propertyTaxOpex!, 1.2 * 143);
  close(last.terminalValue, last.noi / .06);
  close(last.netEquityCashFlow, last.noi - last.interest - last.principal + last.terminalValue - last.endingDebt);
  assert.equal(m.schedule.filter(y => y.terminalDebtRepayment > 0).length, 1);
  assert.equal(m.schedule.filter(y => y.terminalValue > 0).length, 1);
});

test("tenant utilities are context only and missing price stays unavailable without changing landlord returns", () => {
  const a = range();
  const b = buildEstimatedFinancialRange({ evidence, context: { ...context, eia: receipt() } });
  assert.equal(a.cases.central.model!.projectIRR, b.cases.central.model!.projectIRR);
  assert.equal(a.cases.central.model!.schedule[5].tenantElectricityCost, null);
  assert.ok(b.cases.central.model!.schedule[5].tenantElectricityCost! > 0);
  assert.ok(b.cases.central.model!.schedule[5].tenantWaterCost! > 0);
  for (const y of b.cases.central.model!.schedule) {
    assert.equal(y.electricityOpex, 0);
    assert.equal(y.waterOpex, 0);
  }
  const s = editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "electricityPrice", 1000, "2026-10-06T10:00:00Z");
  assert.equal(range(s).cases.central.model!.projectIRR, a.cases.central.model!.projectIRR);
});

test("cautious central favorable are ordered, whole-percent range is never an exact singleton", () => {
  const r = range();
  assert.equal(r.status, "estimated");
  assert.ok(r.cases.cautious.model!.projectIRR! <= r.cases.central.model!.projectIRR!);
  assert.ok(r.cases.central.model!.projectIRR! <= r.cases.favorable.model!.projectIRR!);
  assert.match(r.label, /^Estimated return: roughly -?\d+--?\d+%$/);
  assert.doesNotMatch(r.label, /\d\.\d/);
});

test("more than three required blank or provisional inputs blocks estimate with an explicit missing list", () => {
  const r = buildEstimatedFinancialRange({ evidence, context: { isStargate: false, state: "CA" } });
  assert.equal(r.status, "insufficient-data");
  assert.equal(r.label, "Not enough sourced data for an estimate");
  assert.ok(r.missing.length > 3);
  assert.ok(r.missing.some(item => item.id === "capacityMW"));
});

test("mathematically undefined returns are typed and never coerced into a numeric range", () => {
  const s = editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "leaseRate", 0, "2026-10-06T10:00:00Z");
  const r = range(s);
  assert.equal(r.status, "undefined-return");
  assert.equal(r.cases.central.model!.projectIRR, null);
  assert.equal(r.cases.central.reason, "no-sign-change");
  assert.doesNotMatch(r.label, /\d+%/);
  assert.ok(Number.isFinite(r.cases.central.model!.npv));
});

test("drivers are the top six ranked ordinary one-input sensitivities, not stress policies", () => {
  const r = range();
  assert.equal(r.drivers.length, 6);
  r.drivers.forEach((driver, index) => {
    assert.equal(r.defaults[driver.id].visibility, "public");
    assert.ok(!driver.id.startsWith("quality:"));
    if (index) assert.ok(r.drivers[index - 1].magnitude >= driver.magnitude);
  });
  assert.ok(r.drivers.some(d => d.id === "leaseRate"));
  assert.ok(r.drivers.some(d => d.id === "exitCapRate"));
  assert.ok(r.drivers.some(d => d.id === "interestRate"));
  assert.ok(r.drivers.some(d => d.id === "propertyTaxPerGW"));
});

test("all eight edits reset and append timestamped immutable audit events without mutating defaults or canonical evidence", () => {
  const before = JSON.stringify(evidence);
  const defaults = range().defaults;
  let session = EMPTY_FINANCIAL_ASSUMPTIONS;
  const edits = [16, 7, 190, 100, 8, 60, 13, 6];
  for (let index = 0; index < ADJUSTABLE_FINANCIAL_INPUTS.length; index++) {
    const input = ADJUSTABLE_FINANCIAL_INPUTS[index];
    session = editFinancialAssumption(session, input, edits[index], `2026-10-06T10:00:0${index}Z`);
    assert.equal(range(session).active[input].type, "user-assumption");
    assert.equal(range(session).defaults[input].value, defaults[input].value);
  }
  assert.equal(session.audit.length, 8);
  assert.equal(range(session).status, "estimated");
  assert.notEqual(range(session).cases.central.model!.projectIRR, range().cases.central.model!.projectIRR);
  for (const input of ADJUSTABLE_FINANCIAL_INPUTS) session = editFinancialAssumption(session, input, null, "2026-10-06T10:01:00Z");
  assert.equal(session.audit.length, 16);
  assert.deepEqual(session.overrides, {});
  assert.equal(range(session).cases.central.model!.projectIRR, range().cases.central.model!.projectIRR);
  assert.equal(JSON.stringify(evidence), before);
  assert.equal(EMPTY_FINANCIAL_ASSUMPTIONS.audit.length, 0);
});

test("sourced ranges warn independently of numerical validity; debt follows amount until explicitly overridden", () => {
  assert.equal(validFinancialAssumption("leaseRate", 500), true);
  assert.equal(validFinancialAssumption("debtShare", 100), false);
  assert.equal(validFinancialAssumption("deliveryDelay", -1), false);
  assert.equal(validFinancialAssumption("exitCapRate", 0), false);
  assert.throws(() => editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "interestRate", NaN, "2026-10-06"));
  let s = editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "costPerMW", 15, "2026-10-06T10:00:00Z");
  assert.equal(range(s).cases.central.model!.assumptions.debtAmount, 9600);
  close(range(s).active.debtShare.value!, 9600 / 18000 * 100);
  s = editFinancialAssumption(s, "debtShare", 50, "2026-10-06T10:00:01Z");
  assert.equal(range(s).cases.central.model!.assumptions.debtAmount, 9000);
  const leaseEdit = editFinancialAssumption(s, "leaseRate", 190, "2026-10-06T10:00:02Z");
  close(range(leaseEdit).active.downtimeCost.value!, 1200 * 1000 * 190 * 12 / 365);
});

test("traceable engine rejects invalid equity and bad rates instead of manufacturing a return", () => {
  const r = range();
  const values = Object.fromEntries(Object.entries(r.defaults).map(([id, entry]) => [id, entry.value])) as TraceableFinancialValues;
  assert.equal(calculateTraceableCashFlowModel(evidence, { ...values, debtAmount: 15000 }).reason, "invalid-input");
  assert.equal(calculateTraceableCashFlowModel(evidence, { ...values, exitCapRate: 0 }).reason, "invalid-input");
});

test("delivery delay shifts both capacity stages and forward exit rather than granting undelivered revenue", () => {
  const r = range(editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "deliveryDelay", 6, "2026-10-06T10:00:00Z"));
  const m = r.cases.central.model!;
  // Default retained stress adds two further months; eight months move the entire plan.
  close(m.schedule[1].operatingUtilization, (206 / 1200) * 4 / 12);
  close(m.schedule[2].operatingUtilization, ((206 / 1200) * 8 + 4) / 12);
  const longDelay = range(editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "deliveryDelay", 80, "2026-10-06T10:00:00Z"));
  assert.equal(longDelay.cases.central.model!.terminalValue, 0);
  assert.equal(longDelay.cases.central.reason, "no-sign-change");
  const smallerRevenue = range(editFinancialAssumption(EMPTY_FINANCIAL_ASSUMPTIONS, "leaseRate", 1, "2026-10-06T10:00:00Z"));
  assert.ok(smallerRevenue.cases.central.model!.assumptions.downtimeCostPerDay < 5_000_000);
  close(smallerRevenue.cases.central.model!.assumptions.downtimeCostPerDay, 1200 * 1000 * 1 * 12 / 365);
});
