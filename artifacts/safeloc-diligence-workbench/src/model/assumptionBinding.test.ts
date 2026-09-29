import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_LEASE_RATE_PER_KW_MONTH,
  MODEL_UTILIZATION_RAMP,
} from "./cashFlowEngine";
import {
  CAPACITY_MW_MAX,
  bindCapacityAssumption,
  explainCapacityAssumptions,
  qualifyCapacityClaimCandidate,
  type CapacityAssumptionBindingInput,
  type CapacityClaimCandidateFinding,
  type CapacityClaim,
  type CapacityScope,
} from "./assumptionBinding";

const campusScope: CapacityScope = { kind: "campus", campusId: "north-campus" };

function claim(overrides: Partial<CapacityClaim> = {}): CapacityClaim {
  return {
    value: 180,
    unit: "MW",
    powerMeasure: "it-capacity",
    scope: campusScope,
    status: "current",
    sourceTitle: "Project capacity announcement",
    sourceUrl: "https://example.com/capacity",
    sourceDate: "2026-09-01",
    humanAccepted: true,
    ...overrides,
  };
}

test("a current human-accepted IT capacity claim binds when its scope matches", () => {
  const result = bindCapacityAssumption({
    claim: claim(),
    scenarioScope: campusScope,
  });

  assert.equal(result.modelInput.capacityMW, 180);
  assert.equal(result.binding.kind, "sourced");
  assert.match(result.binding.reason, /matches the scenario scope/);
  assert.equal(result.explanation[0]?.classification, "Sourced (source, date, accepted by user)");
});

test("unaccepted, stale, or out-of-bounds claims remain unbound rather than using the engine default", () => {
  for (const candidate of [
    claim({ humanAccepted: false }),
    claim({ status: "superseded" }),
    claim({ value: CAPACITY_MW_MAX + 1, unit: "MW" }),
    claim({ value: 0 }),
  ]) {
    const result = bindCapacityAssumption({ claim: candidate, scenarioScope: campusScope });
    assert.equal(result.modelInput.capacityMW, null);
    assert.equal(result.binding.kind, "unknown");
  }

  const unaccepted = bindCapacityAssumption({
    claim: claim({ humanAccepted: false }),
    scenarioScope: campusScope,
  });
  assert.equal(unaccepted.explanation[0]?.classification, "Analyst assumption");
  assert.match(unaccepted.explanation[0]?.detail ?? "", /not accepted by user/);
});

test("capacity units normalize to MW and utility claims require an explicit analyst factor", () => {
  const gigawatts = bindCapacityAssumption({
    claim: claim({ value: 0.18, unit: "GW" }),
    scenarioScope: campusScope,
  });
  const kilowatts = bindCapacityAssumption({
    claim: claim({ value: 180_000, unit: "kW" }),
    scenarioScope: campusScope,
  });
  assert.equal(gigawatts.modelInput.capacityMW, 180);
  assert.equal(kilowatts.modelInput.capacityMW, 180);

  const utilityClaim = claim({ value: 240, powerMeasure: "utility-interconnection" });
  const withoutFactor = bindCapacityAssumption({ claim: utilityClaim, scenarioScope: campusScope });
  assert.equal(withoutFactor.modelInput.capacityMW, null);
  assert.match(withoutFactor.binding.reason, /explicit utility-to-IT conversion factor/);

  const withFactor = bindCapacityAssumption({
    claim: utilityClaim,
    scenarioScope: campusScope,
    utilityToItFactor: 0.75,
  });
  assert.equal(withFactor.modelInput.capacityMW, 180);
  assert.ok(
    withFactor.explanation.some(
      (item) =>
        item.input === "utility-to-IT conversion factor" &&
        item.classification === "Analyst assumption" &&
        item.detail.includes("0.75"),
    ),
  );

  for (const invalidFactor of [0, -0.1, 1.01, Number.NaN]) {
    const invalidConversion = bindCapacityAssumption({
      claim: utilityClaim,
      scenarioScope: campusScope,
      utilityToItFactor: invalidFactor,
    });
    assert.equal(invalidConversion.modelInput.capacityMW, null);
  }
});

test("phase capacity binds only to the identical phase and building count, never campus capacity", () => {
  const threeBuildingPhase: CapacityScope = {
    kind: "phase",
    phaseId: "phase-one",
    buildingCount: 3,
  };
  const phaseClaim = claim({ value: 180, scope: threeBuildingPhase });

  const matching = bindCapacityAssumption({
    claim: phaseClaim,
    scenarioScope: threeBuildingPhase,
  });
  assert.equal(matching.modelInput.capacityMW, 180);

  const campus = bindCapacityAssumption({
    claim: phaseClaim,
    scenarioScope: campusScope,
  });
  assert.equal(campus.modelInput.capacityMW, null);
  assert.equal(campus.binding.kind, "unknown");
  assert.match(campus.binding.reason, /does not exactly match/);
  assert.match(campus.explanation[0]?.detail ?? "", /phase phase-one \(3 buildings\)/);

  const differentBuildingCount = bindCapacityAssumption({
    claim: phaseClaim,
    scenarioScope: { kind: "phase", phaseId: "phase-one", buildingCount: 2 },
  });
  assert.equal(differentBuildingCount.modelInput.capacityMW, null);

  const buildingScope: CapacityScope = { kind: "building", buildingId: "building-a" };
  const buildingClaim = claim({ value: 60, scope: buildingScope });
  assert.equal(
    bindCapacityAssumption({ claim: buildingClaim, scenarioScope: buildingScope }).modelInput.capacityMW,
    60,
  );
  assert.equal(
    bindCapacityAssumption({
      claim: buildingClaim,
      scenarioScope: { kind: "building", buildingId: "building-b" },
    }).modelInput.capacityMW,
    null,
  );
});

test("a valid human-entered capacity is used only as an explicitly labeled illustrative fallback", () => {
  const result = bindCapacityAssumption({
    claim: claim({ humanAccepted: false }),
    scenarioScope: campusScope,
    illustrativeCapacityMW: 900,
  });

  assert.equal(result.modelInput.capacityMW, 900);
  assert.equal(result.binding.kind, "illustrative");
  assert.match(result.binding.reason, /Illustrative/);
  const fallback = result.explanation.find((item) => item.input === "illustrative capacity");
  assert.equal(fallback?.classification, "Analyst assumption");
  assert.match(fallback?.detail ?? "", /900 MW, labeled Illustrative and used/);

  const outOfBounds = bindCapacityAssumption({
    scenarioScope: campusScope,
    illustrativeCapacityMW: CAPACITY_MW_MAX + 1,
  });
  assert.equal(outOfBounds.modelInput.capacityMW, null);
  assert.equal(outOfBounds.binding.kind, "unknown");
});

test("an illustrative value is not used when a sourced claim binds", () => {
  const result = bindCapacityAssumption({
    claim: claim(),
    scenarioScope: campusScope,
    illustrativeCapacityMW: 900,
  });
  assert.equal(result.modelInput.capacityMW, 180);
  assert.equal(result.binding.kind, "sourced");
  assert.match(
    result.explanation.find((item) => item.input === "illustrative capacity")?.detail ?? "",
    /not used/,
  );
});

test("explanation classifies every supplied source and analyst assumption", () => {
  const input: CapacityAssumptionBindingInput = {
    claim: claim({ powerMeasure: "utility-interconnection" }),
    scenarioScope: campusScope,
    rampTiming: { rampStartMonth: 0, stabilizedAtMonth: 24 },
    utilityToItFactor: 0.75,
    illustrativeCapacityMW: 900,
  };
  const explanation = explainCapacityAssumptions(input);

  assert.deepEqual(
    explanation.map(({ input: name, classification }) => [name, classification]),
    [
      ["capacity claim", "Sourced (source, date, accepted by user)"],
      ["scenario scope", "Analyst assumption"],
      ["lease rate per kW-month", "Model constant"],
      ["utilization ramp", "Model constant"],
      ["ramp timing", "Analyst assumption"],
      ["utility-to-IT conversion factor", "Analyst assumption"],
      ["illustrative capacity", "Analyst assumption"],
    ],
  );
  assert.match(explanation[0]?.detail ?? "", /Project capacity announcement/);
  assert.match(explanation[0]?.detail ?? "", /2026-09-01/);
  assert.match(explanation[0]?.detail ?? "", /accepted by user/);
  assert.equal(
    explanation.find((item) => item.input === "lease rate per kW-month")?.detail,
    String(MODEL_LEASE_RATE_PER_KW_MONTH),
  );
  assert.equal(
    explanation.find((item) => item.input === "utilization ramp")?.detail,
    MODEL_UTILIZATION_RAMP.join(", "),
  );
});

test("only one resolved, exact-project, whole-campus IT capacity finding qualifies", () => {
  const finding: CapacityClaimCandidateFinding = {
    id: "finding-capacity",
    assessment: "source-supported",
    applicability: "exact-project",
    financialProposalEligibility: "eligible",
    projectScope: "Source passage identifies the submitted project name and requested location.",
    powerClaimState: "resolved",
    powerClaim: {
      quantity: "180 MW",
      measure: "IT capacity",
      status: "operating",
      phaseScope: null,
      facilityScope: "campus",
    },
    reportingDate: "2026-09-01",
    accessedAt: "2026-09-02",
    sourceTitle: "Project capacity announcement",
    sourceUrl: "https://example.com/capacity",
  };

  const candidate = qualifyCapacityClaimCandidate([finding], campusScope);
  assert.equal(candidate?.findingId, "finding-capacity");
  assert.equal(candidate?.claim.scope.kind, "campus");
  assert.equal(candidate?.claim.humanAccepted, false);
  assert.equal(candidate?.claim.value, 180);
  assert.equal(candidate?.claim.unit, "MW");

  for (const invalid of [
    { ...finding, applicability: "ambiguous" as const },
    { ...finding, assessment: "ambiguous-unresolved" as const },
    { ...finding, financialProposalEligibility: "unresolved" as const },
    { ...finding, projectScope: "Related project, location not resolved." },
    { ...finding, powerClaimState: "unresolved" as const },
    { ...finding, powerClaim: { ...finding.powerClaim!, phaseScope: "phase-one" } },
    { ...finding, powerClaim: { ...finding.powerClaim!, facilityScope: "building" } },
    { ...finding, powerClaim: { ...finding.powerClaim!, measure: "utility interconnection" } },
  ]) {
    assert.equal(qualifyCapacityClaimCandidate([invalid], campusScope), null);
  }
  assert.equal(qualifyCapacityClaimCandidate([finding, { ...finding, id: "duplicate" }], campusScope), null);
  assert.equal(
    qualifyCapacityClaimCandidate([finding], { kind: "campus", campusId: "different-campus" })?.claim.scope.campusId,
    "different-campus",
  );
});