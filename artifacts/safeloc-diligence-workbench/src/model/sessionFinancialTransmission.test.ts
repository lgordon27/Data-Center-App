import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { INITIAL_EVIDENCE } from "@/context/DiligenceContext";
import type { CustomEvidenceRecord } from "@/services/researchProjectService";
import {
  applySessionFinancialDecisions,
  buildSessionFinancialPreview,
  decideSessionFinancialPreview,
  emptySessionFinancialHistory,
  restoreSessionFinancialHistory,
  type SessionFinancialCurrentContext,
  type SessionFinancialHistory,
  type SessionFinancialTarget,
} from "./sessionFinancialTransmission";
import { calculateCashFlowModel, containEvidenceForModel, type EvidenceRecord } from "./cashFlowEngine";

const PROJECT_KEY = "session-project-orion";
const PROJECT_NAME = "Orion Compute Data Center";
const SCOPE = { facility: "North Hall", phase: "Phase 2" };
const NOW = "2026-09-10T12:00:00.000Z";
const SOURCE_DATE = "2026-09-01";
const SOURCE_URL = "https://utility.example.test/records/orion-north-hall";
const QA_FIXTURE = JSON.parse(readFileSync(
  new URL("../../tests/fixtures/session-financial-review.json", import.meta.url),
  "utf8",
)) as {
  fixtureNotice: string;
  now: string;
  context: SessionFinancialCurrentContext;
  candidates: CustomEvidenceRecord[];
};

function quoteFor(target: SessionFinancialTarget, value: number, unit: string) {
  switch (target) {
    case "electricity_cost":
      return `Orion Compute Data Center North Hall Phase 2 electricity tariff is $${value}/MWh.`;
    case "water_consumption":
      return `Orion Compute Data Center North Hall Phase 2 annual water consumption is ${value} Mgal/year.`;
    case "grid_interconnection":
      return `Orion Compute Data Center North Hall Phase 2 grid interconnection timeline is ${value} ${unit}.`;
  }
}

/**
 * Deterministic, illustrative browser-QA source fixtures. These are unit-test
 * evidence only; they are not imported by or presented in application runtime.
 */
function candidate(
  target: SessionFinancialTarget,
  value: number,
  unit: string,
  options: {
    quote?: string;
    publishedAt?: string | null;
    publicationBasis?: string;
    sourceRelevance?: CustomEvidenceRecord["sourceRelevance"];
    facilityScope?: string;
    phaseScope?: string;
    sourceClass?: string;
    sourceState?: string;
    semanticPolicyVersion?: number;
    sourcePolicyVersion?: number;
    quarantineReasons?: string[];
    timePeriod?: string;
  } = {},
): CustomEvidenceRecord {
  const quote = options.quote ?? quoteFor(target, value, unit);
  const source = {
    url: SOURCE_URL,
    title: "Utility service statement",
    publisher: "Example Regional Utility",
    publishedAt: options.publishedAt === undefined ? SOURCE_DATE : options.publishedAt,
    publishedAtBasis: options.publicationBasis ?? "visible-publication-line",
    publicationDateStatus: "resolved",
    accessedAt: NOW,
    accessStatus: "accessible",
    excerpt: quote,
    claimPassage: quote,
    sourceClass: options.sourceClass ?? "primary-utility",
    searchDomain: "utility.example.test",
    relationship: "primary",
    exactProject: true,
    sourceState: options.sourceState ?? "retained",
    facilityScope: options.facilityScope ?? "exact-facility",
    phaseScope: options.phaseScope ?? "exact-phase",
    timePeriod: options.timePeriod ?? "2026 operating period",
    accessOutcome: {
      state: "accessible",
      reason: "Retained for unit fixture.",
      publicationDate: options.publishedAt === undefined ? SOURCE_DATE : options.publishedAt,
      publicationDateBasis: options.publicationBasis ?? "visible-publication-line",
      publicationDateStatus: "resolved",
      passage: quote,
    },
  } as unknown as NonNullable<CustomEvidenceRecord["sources"]>[number];
  return {
    id: target,
    label: target,
    value,
    rawValue: value,
    unit,
    rawUnit: unit,
    classification: "Verified Evidence",
    citation: quote,
    description: `${PROJECT_NAME} facility-level ${target.replaceAll("_", " ")} observation.`,
    sourceRole: "Unit-test fixture source",
    sourceUrl: SOURCE_URL,
    sourceTitle: "Utility service statement",
    sourcePublisher: "Example Regional Utility",
    sourcePublishedAt: options.publishedAt === undefined ? SOURCE_DATE : options.publishedAt,
    sourcePublishedAtBasis: options.publicationBasis as CustomEvidenceRecord["sourcePublishedAtBasis"]
      ?? "visible-publication-line",
    sourceSupportConfidence: 95,
    sourceRelevance: options.sourceRelevance ?? "exact-project",
    coverageStatus: "supported",
    // Mirrors a valid-but-not-yet-activated research item at the model boundary.
    eligibleForModel: false,
    acceptedForModel: false,
    researchState: "eligible-evidence",
    sources: [source],
    sourceValidation: {
      policyVersion: options.sourcePolicyVersion ?? 1,
      state: "claim-supported",
      rejectionCodes: [],
      claimMappings: [],
    },
    ...(options.semanticPolicyVersion === undefined ? {} : {
      normalization: {
        policyVersion: options.semanticPolicyVersion,
        conversion: "none",
        validationStatus: "valid" as const,
      },
    }),
    ...(options.quarantineReasons ? { quarantineReasons: options.quarantineReasons } : {}),
  };
}

function baselineEvidence(): EvidenceRecord {
  return structuredClone(INITIAL_EVIDENCE) as unknown as EvidenceRecord;
}

function emptyHistory() {
  return emptySessionFinancialHistory(PROJECT_KEY, SCOPE);
}

function context(overrides: Partial<SessionFinancialCurrentContext> = {}): SessionFinancialCurrentContext {
  return {
    projectKey: PROJECT_KEY,
    projectName: PROJECT_NAME,
    scope: SCOPE,
    baseEvidence: baselineEvidence(),
    capacityMW: 1_200,
    ...overrides,
  };
}

function preview(
  item: CustomEvidenceRecord,
  history: SessionFinancialHistory = emptyHistory(),
  current = context(),
  now = NOW,
) {
  return buildSessionFinancialPreview({
    ...current,
    candidate: item,
    history,
    now,
  });
}

function decide(
  item: CustomEvidenceRecord,
  priorHistory: SessionFinancialHistory,
  action: "accept" | "reject" | "evidence-only" = "accept",
  current = context(),
) {
  const currentPreview = preview(item, priorHistory, current);
  return decideSessionFinancialPreview({
    preview: currentPreview,
    action,
    candidate: item,
    currentContext: current,
    history: priorHistory,
    now: NOW,
  });
}

test("builds eligible current-policy previews for the exact three-point slice", () => {
  assert.match(QA_FIXTURE.fixtureNotice, /illustrative.*never import into application runtime/i);
  const fixtureContext = context(QA_FIXTURE.context);
  assert.equal(QA_FIXTURE.candidates.length, 3);

  for (const item of QA_FIXTURE.candidates) {
    const result = preview(item, emptyHistory(), fixtureContext, QA_FIXTURE.now);
    assert.equal(result.eligible, true, `${item.id}: ${result.blockedReasons.join("; ")}`);
    assert.equal(result.normalizedValue, item.rawValue);
    assert.equal(result.target, item.id);
    assert.equal(result.sourcePassage, item.citation);
    assert.equal(result.sourceDate, SOURCE_DATE);
    assert.equal(result.policyVersion, 2);
    assert.equal(item.eligibleForModel, false);
    assert.equal(item.acceptedForModel, false);
    assert.equal(result.hasModelChange, result.beforeModelFingerprint !== result.afterModelFingerprint);
    assert.equal(result.hasReturnChange, result.beforeReturnFingerprint !== result.afterReturnFingerprint);
  }
});

test("no-op previews disclose identical return fingerprints and the full current overlay", () => {
  const base = baselineEvidence();
  const grid = candidate("grid_interconnection", 14, "months");
  const sameAsBaseline = preview(grid, emptyHistory(), context({ baseEvidence: base }));
  assert.equal(sameAsBaseline.eligible, true);
  assert.equal(sameAsBaseline.hasModelChange, false);
  assert.equal(sameAsBaseline.beforeReturnFingerprint, sameAsBaseline.afterReturnFingerprint);
  assert.match(sameAsBaseline.noOpReason ?? "", /did not change/i);

  const electricity = candidate("electricity_cost", 78, "USD/MWh");
  const water = candidate("water_consumption", 12, "Mgal/year");
  const currentContext = context({
    currentCandidates: {
      electricity_cost: electricity,
      water_consumption: water,
      grid_interconnection: grid,
    },
  });
  const first = decide(electricity, emptyHistory(), "accept", currentContext);
  const second = decide(water, first, "accept", currentContext);
  const current = preview(grid, second, currentContext);
  assert.equal(current.baselineEvidenceSnapshot.electricity_cost.numericValue, 78);
  assert.equal(current.baselineEvidenceSnapshot.water_consumption.numericValue, 12);
  assert.equal(current.baselineEvidenceSnapshot.water_consumption.capacityBasis, "facility-absolute");
});

test("accept applies disclosed normalized points without source-quality multipliers or unrelated mutations", () => {
  const base = baselineEvidence();
  const current = context({ baseEvidence: base, capacityMW: 5_000 });
  const electricity = candidate("electricity_cost", 78, "USD/MWh");
  const water = candidate("water_consumption", 12, "Mgal/year");
  const grid = candidate("grid_interconnection", 18, "months");
  const completeCurrent = context({
    baseEvidence: base,
    capacityMW: 5_000,
    currentCandidates: {
      electricity_cost: electricity,
      water_consumption: water,
      grid_interconnection: grid,
    },
  });
  let history = decide(electricity, emptyHistory(), "accept", completeCurrent);
  history = decide(water, history, "accept", completeCurrent);
  history = decide(grid, history, "accept", completeCurrent);

  const applied = applySessionFinancialDecisions({
    ...current,
    candidates: {
      electricity_cost: electricity,
      water_consumption: water,
      grid_interconnection: grid,
    },
    history,
    now: NOW,
  });
  assert.deepEqual(applied.ignoredReasons, {});
  assert.equal(applied.evidence.electricity_cost.numericValue, 78);
  assert.equal(applied.evidence.water_consumption.numericValue, 12);
  assert.equal(applied.evidence.water_consumption.capacityBasis, "facility-absolute");
  assert.equal(applied.evidence.grid_interconnection.numericValue, 18);
  assert.equal(applied.evidence.electricity_cost.classification, electricity.classification);
  assert.equal(applied.evidence.water_consumption.classification, water.classification);
  assert.equal(applied.evidence.electricity_cost.modelClassification, base.electricity_cost.classification);
  assert.equal(applied.evidence.water_consumption.modelClassification, base.water_consumption.classification);
  assert.equal(applied.evidence.electricity_cost.modelTreatment, "source-neutral");
  assert.equal(applied.evidence.water_consumption.modelTreatment, "source-neutral");
  assert.equal(applied.evidence.grid_interconnection.modelTreatment, "source-neutral");
  assert.match(applied.evidence.electricity_cost.sourceRole ?? "", /^Session-only accepted financial observation/);
  assert.equal(applied.evidence.electricity_cost.origin, "session-only");
  assert.equal(applied.evidence.electricity_cost.sourceClassification, "primary-utility");
  assert.equal(applied.evidence.electricity_cost.acceptedForModel, true);
  assert.equal(applied.evidence.electricity_cost.eligibleForModel, true);
  assert.equal(applied.evidence.electricity_cost.researchState, "accepted");
  assert.equal(applied.evidence.electricity_cost.sourceSupportConfidence, electricity.sourceSupportConfidence);
  assert.equal(applied.evidence.electricity_cost.sources?.[0]?.sourceClass, "primary-utility");
  assert.equal(applied.evidence.electricity_cost.sources?.[0]?.exactProject, true);
  assert.deepEqual(applied.evidence.electricity_cost.quarantineReasons, undefined);
  assert.equal(applied.evidence.electricity_cost.value, 78);
  assert.equal(applied.evidence.water_consumption.value, 12);
  assert.equal(applied.evidence.grid_interconnection.value, 18);
  assert.equal(applied.evidence.permitting_timeline.numericValue, base.permitting_timeline.numericValue);
  assert.equal(base.water_consumption.numericValue, 23);

  const model = calculateCashFlowModel(applied.evidence, 5_000);
  const modelBoundary = containEvidenceForModel(applied.evidence);
  assert.deepEqual(modelBoundary.quarantined, {});
  assert.equal(modelBoundary.evidence.electricity_cost.numericValue, 78);
  assert.equal(modelBoundary.evidence.water_consumption.numericValue, 12);
  assert.equal(model.assumptions.electricityRate, 78);
  assert.equal(model.assumptions.annualCoolingWaterMgal, 12);
  assert.equal(model.assumptions.gridInterconnectionMonths, 18);
  assert.equal(model.confidenceScore, calculateCashFlowModel(base, 5_000).confidenceScore);
  for (const decision of history.decisions) {
    assert.equal("actorKind" in decision, false);
    assert.equal("authenticated" in decision, false);
    assert.equal("reviewerIdentity" in decision, false);
  }
});

test("preview and history snapshot inputs are detached; edited candidate or any base field makes preview stale", () => {
  const item = candidate("electricity_cost", 78, "USD/MWh");
  const base = baselineEvidence();
  const current = context({ baseEvidence: base });
  const result = preview(item, emptyHistory(), current);
  item.rawValue = 90;
  assert.equal(result.rawValue, 78);
  assert.equal((result.candidateSnapshot as CustomEvidenceRecord).rawValue, 78);

  assert.throws(() => decideSessionFinancialPreview({
    preview: result,
    action: "accept",
    candidate: item,
    currentContext: current,
    history: emptyHistory(),
    now: NOW,
  }), /candidate snapshot/i);

  const original = candidate("electricity_cost", 78, "USD/MWh");
  const pristine = preview(original, emptyHistory(), current);
  const changedBase = structuredClone(base);
  changedBase.water_consumption.numericValue = 24;
  assert.throws(() => decideSessionFinancialPreview({
    preview: pristine,
    action: "accept",
    candidate: original,
    currentContext: context({ baseEvidence: changedBase }),
    history: emptyHistory(),
    now: NOW,
  }), /baseline|binding/i);
});

test("reject and evidence-only each deactivate an earlier accepted target to canonical baseline", () => {
  const item = candidate("electricity_cost", 78, "USD/MWh");
  const current = context();
  const accepted = decide(item, emptyHistory(), "accept", current);
  const rejected = decide(item, accepted, "reject", current);
  const evidenceOnly = decide(item, accepted, "evidence-only", current);
  const base = current.baseEvidence;

  for (const history of [rejected, evidenceOnly]) {
    const decision = history.decisions.at(-1)!;
    const acceptance = accepted.decisions[0];
    assert.deepEqual(decision.modelEffect, decision.preview.nonAcceptanceEffect);
    assert.equal(decision.modelEffect.hasModelChange, true);
    assert.equal(decision.modelEffect.beforeReturnFingerprint, acceptance.preview.afterReturnFingerprint);
    assert.equal(decision.modelEffect.afterReturnFingerprint, acceptance.preview.beforeReturnFingerprint);
    const replay = applySessionFinancialDecisions({
      ...current,
      candidates: { electricity_cost: item },
      history,
      now: NOW,
    });
    assert.equal(replay.evidence.electricity_cost.numericValue, base.electricity_cost.numericValue);
    assert.equal(replay.evidence.electricity_cost.sourceRole, base.electricity_cost.sourceRole);
    assert.match(replay.ignoredReasons.electricity_cost, /inactive|evidence only/i);
  }

  const firstRejection = decide(item, emptyHistory(), "reject", current);
  const firstRejectEffect = firstRejection.decisions[0].modelEffect;
  assert.equal(firstRejectEffect.hasModelChange, false);
  assert.equal(firstRejectEffect.hasReturnChange, false);
  assert.equal(firstRejectEffect.beforeModelFingerprint, firstRejectEffect.afterModelFingerprint);
  assert.equal(firstRejectEffect.beforeReturnFingerprint, firstRejectEffect.afterReturnFingerprint);
  assert.deepEqual(firstRejectEffect.before, firstRejectEffect.after);
  assert.match(firstRejectEffect.noOpReason ?? "", /financial assumptions.*did not change/i);
});

test("a refreshed candidate cannot fall back to an older accepted value", () => {
  const accepted78 = candidate("electricity_cost", 78, "USD/MWh");
  const context78 = context({ currentCandidates: { electricity_cost: accepted78 } });
  const first = decide(accepted78, emptyHistory(), "accept", context78);

  const accepted82 = candidate("electricity_cost", 82, "USD/MWh");
  const context82 = context({ currentCandidates: { electricity_cost: accepted82 } });
  const second = decide(accepted82, first, "accept", context82);

  const refreshed83 = candidate("electricity_cost", 83, "USD/MWh");
  const replay = applySessionFinancialDecisions({
    ...context({ currentCandidates: { electricity_cost: refreshed83 } }),
    candidates: { electricity_cost: refreshed83 },
    history: second,
    now: NOW,
  });
  assert.equal(replay.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.match(replay.ignoredReasons.electricity_cost, /latest immutable accepted session snapshot/i);
});

test("a changed or tampered affirmative point cannot replay an older acceptance", () => {
  const valid = candidate("electricity_cost", 78, "USD/MWh");
  const accepted = decide(
    valid,
    emptyHistory(),
    "accept",
    context({ currentCandidates: { electricity_cost: valid } }),
  );
  const weakQuote = candidate("electricity_cost", 78, "USD/MWh", {
    quote: "Orion Compute Data Center North Hall Phase 2 electricity tariff is $64/MWh compared with the general market rate of $78/MWh.",
  });

  const changedReplay = applySessionFinancialDecisions({
    ...context({ currentCandidates: { electricity_cost: weakQuote } }),
    candidates: { electricity_cost: weakQuote },
    history: accepted,
    now: NOW,
  });
  assert.equal(changedReplay.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.match(changedReplay.ignoredReasons.electricity_cost, /latest immutable accepted session snapshot/i);

  const tamperedHistory = structuredClone(accepted);
  tamperedHistory.decisions[0].preview.candidateSnapshot = structuredClone(weakQuote);
  tamperedHistory.decisions[0].preview.sourcePassage = weakQuote.citation;
  const tamperedReplay = applySessionFinancialDecisions({
    ...context({ currentCandidates: { electricity_cost: weakQuote } }),
    candidates: { electricity_cost: weakQuote },
    history: tamperedHistory,
    now: NOW,
  });
  assert.equal(tamperedReplay.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.match(tamperedReplay.ignoredReasons.electricity_cost, /binding/i);

  const legacy = structuredClone(accepted);
  legacy.decisions[0].preview.policyVersion = 1;
  assert.equal(restoreSessionFinancialHistory(legacy, PROJECT_KEY), null);
  const legacyReplay = applySessionFinancialDecisions({
    ...context({ currentCandidates: { electricity_cost: valid } }),
    candidates: { electricity_cost: valid },
    history: legacy,
    now: NOW,
  });
  assert.equal(legacyReplay.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.match(legacyReplay.ignoredReasons.electricity_cost, /malformed|policy/i);
});

test("latest candidate refreshes fail closed to baseline for each allowed target", () => {
  const points: Array<{ target: SessionFinancialTarget; accepted: number; refreshed: number; unit: string }> = [
    { target: "electricity_cost", accepted: 78, refreshed: 79, unit: "USD/MWh" },
    { target: "water_consumption", accepted: 12, refreshed: 13, unit: "Mgal/year" },
    { target: "grid_interconnection", accepted: 18, refreshed: 19, unit: "months" },
  ];
  for (const { target, accepted: acceptedValue, refreshed, unit } of points) {
    const original = candidate(target, acceptedValue, unit);
    const acceptedHistory = decide(
      original,
      emptyHistory(),
      "accept",
      context({ currentCandidates: { [target]: original } }),
    );
    const currentCandidate = candidate(target, refreshed, unit);
    const replay = applySessionFinancialDecisions({
      ...context({ currentCandidates: { [target]: currentCandidate } }),
      candidates: { [target]: currentCandidate },
      history: acceptedHistory,
      now: NOW,
    });
    assert.equal(replay.evidence[target].numericValue, baselineEvidence()[target].numericValue, target);
    assert.match(replay.ignoredReasons[target], /latest immutable accepted session snapshot/i, target);
  }
});

test("requires valid capacity for acceptance and leaves return metrics unavailable otherwise", () => {
  const item = candidate("electricity_cost", 78, "USD/MWh");
  const invalidContext = context({
    capacityMW: null,
    currentCandidates: { electricity_cost: item },
  });
  const result = preview(item, emptyHistory(), invalidContext);
  assert.equal(result.eligible, false);
  assert.match(result.blockedReasons.join(" "), /valid explicit project capacity/i);
  assert.deepEqual(result.before, { irr: null, moic: null, npv: null, payback: null });
  assert.deepEqual(result.after, result.before);

  const rejection = decide(item, emptyHistory(), "reject", invalidContext);
  assert.equal(rejection.decisions[0].modelEffect.hasModelChange, false);
  assert.deepEqual(rejection.decisions[0].modelEffect.before, result.before);
  assert.deepEqual(rejection.decisions[0].modelEffect.after, result.before);
  assert.match(rejection.decisions[0].modelEffect.noOpReason ?? "", /capacity is missing or invalid/i);
  assert.throws(() => decide(item, emptyHistory(), "accept", invalidContext), /blocked/i);
});

test("replay rejects edited snapshots, changed baselines, missing candidates, and unsupported stored policies", () => {
  const item = candidate("electricity_cost", 78, "USD/MWh");
  const accepted = decide(item, emptyHistory());
  const changedCandidate = candidate("electricity_cost", 82, "USD/MWh");
  const changedBase = baselineEvidence();
  changedBase.grid_interconnection.numericValue = 15;
  const replay = applySessionFinancialDecisions({
    ...context({ baseEvidence: changedBase }),
    candidates: { electricity_cost: changedCandidate },
    history: accepted,
    now: NOW,
  });
  assert.equal(replay.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.match(replay.ignoredReasons.electricity_cost, /snapshot|baseline|candidate|binding/i);

  const edited = structuredClone(accepted);
  edited.decisions[0].preview.after.irr = (edited.decisions[0].preview.after.irr ?? 0) + 1;
  const editedReplay = applySessionFinancialDecisions({
    ...context(),
    candidates: { electricity_cost: item },
    history: edited,
    now: NOW,
  });
  assert.equal(editedReplay.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.match(editedReplay.ignoredReasons.electricity_cost, /edited|disclosure|malformed/i);

  const expired = applySessionFinancialDecisions({
    ...context(),
    candidates: { electricity_cost: item },
    history: accepted,
    now: "2027-09-10T12:00:00.000Z",
  });
  assert.equal(expired.evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  assert.ok(expired.ignoredReasons.electricity_cost);

  assert.deepEqual(applySessionFinancialDecisions({
    ...context(),
    candidates: {},
    history: accepted,
    now: NOW,
  }).evidence.electricity_cost.numericValue, baselineEvidence().electricity_cost.numericValue);
  const malformed = { ...accepted, decisions: accepted.decisions.map((decision) => ({
    ...decision,
    preview: { ...decision.preview, policyVersion: 999 },
  })) };
  assert.equal(restoreSessionFinancialHistory(malformed, PROJECT_KEY), null);
  assert.equal(restoreSessionFinancialHistory(accepted, "another-project"), null);
});

test("blocks stale, future, unknown-date, wrong-scope, context-only, bad-unit, and quarantined candidates", () => {
  const outOfSlice = { ...candidate("electricity_cost", 78, "USD/MWh"), id: "cooling_load" } as unknown as CustomEvidenceRecord;
  assert.match(preview(outOfSlice).blockedReasons.join(" "), /only electricity_cost/i);
  const stale = candidate("electricity_cost", 78, "USD/MWh", { publishedAt: "2025-09-01" });
  assert.match(preview(stale).blockedReasons.join(" "), /365-day/);
  const future = candidate("electricity_cost", 78, "USD/MWh", { publishedAt: "2026-09-11" });
  assert.match(preview(future).blockedReasons.join(" "), /Future-dated/);
  const unknownDate = candidate("electricity_cost", 78, "USD/MWh", { publicationBasis: "not-reported" });
  assert.match(preview(unknownDate).blockedReasons.join(" "), /publication date/i);
  const wrongScope = candidate("electricity_cost", 78, "USD/MWh", {
    quote: "Orion Compute Data Center South Hall Phase 2 electricity tariff is $78/MWh.",
  });
  assert.equal(preview(wrongScope).eligible, false);
  assert.match(preview(wrongScope).blockedReasons.join(" "), /facility, phase/i);
  const contextOnly = candidate("electricity_cost", 78, "USD/MWh", { sourceRelevance: "related-context" });
  assert.equal(preview(contextOnly).eligible, false);
  const badUnit = candidate("electricity_cost", 78, "MWh");
  assert.equal(preview(badUnit).normalizedValue, null);
  const quarantined = candidate("electricity_cost", 78, "USD/MWh", { quarantineReasons: ["Old semantic mismatch"] });
  assert.match(preview(quarantined).blockedReasons.join(" "), /quarantined/i);
  const oldPolicy = candidate("electricity_cost", 78, "USD/MWh", { semanticPolicyVersion: 0 });
  assert.match(preview(oldPolicy).blockedReasons.join(" "), /old semantic policy/i);
  const oldSourcePolicy = candidate("electricity_cost", 78, "USD/MWh", { sourcePolicyVersion: 0 });
  assert.match(preview(oldSourcePolicy).blockedReasons.join(" "), /old policy/i);

  const unknownScope = preview(
    candidate("electricity_cost", 78, "USD/MWh"),
    emptySessionFinancialHistory(PROJECT_KEY, { facility: "unknown", phase: "Phase 2" }),
    context({ scope: { facility: "unknown", phase: "Phase 2" } }),
  );
  assert.equal(unknownScope.eligible, false);
  assert.match(unknownScope.blockedReasons.join(" "), /explicit.*facility/i);
});

test("requires an explicit current or disclosed forward-forecast claim period", () => {
  const historicalPeriod = candidate("electricity_cost", 78, "USD/MWh", {
    timePeriod: "1999 operating period",
  });
  const historicalPreview = preview(historicalPeriod);
  assert.equal(historicalPreview.eligible, false);
  assert.match(historicalPreview.blockedReasons.join(" "), /claim time period is historical/i);

  const undisclosedFuture = candidate("electricity_cost", 78, "USD/MWh", {
    timePeriod: "2027 operating period",
  });
  const undisclosedPreview = preview(undisclosedFuture);
  assert.equal(undisclosedPreview.eligible, false);
  assert.match(undisclosedPreview.blockedReasons.join(" "), /explicitly identified as a forecast/i);

  const disclosedForecast = candidate("electricity_cost", 78, "USD/MWh", {
    timePeriod: "2027 forecast",
    quote: "The 2027 forecast for Orion Compute Data Center North Hall Phase 2 electricity tariff is $78/MWh.",
  });
  const forecastPreview = preview(disclosedForecast);
  assert.equal(forecastPreview.eligible, true, forecastPreview.blockedReasons.join("; "));
  assert.equal(forecastPreview.sourceTimePeriod, "2027 forecast");
  assert.equal(forecastPreview.sourceTimeScope, "forward-forecast");
});

test("keeps affirmative point validation compatible with supported unit conversions", () => {
  const converted = [
    candidate("electricity_cost", 0.078, "USD/kWh", {
      quote: "Orion Compute Data Center North Hall Phase 2 electricity tariff is 0.078 USD/kWh.",
    }),
    candidate("water_consumption", 12, "gallons/year", {
      quote: "Orion Compute Data Center North Hall Phase 2 annual water consumption is 12 gallons/year.",
    }),
    candidate("grid_interconnection", 1, "years", {
      quote: "Orion Compute Data Center North Hall Phase 2 grid interconnection timeline is 1 year.",
    }),
  ];
  const expected = [78, 0.000012, 12];
  converted.forEach((item, index) => {
    const result = preview(item);
    assert.equal(result.eligible, true, `${item.id}: ${result.blockedReasons.join("; ")}`);
    assert.equal(result.normalizedValue, expected[index]);
  });
});

test("requires quote-bound measure, quantity, unit, project, facility, and phase rather than nearby numbers", () => {
  const quote = "Orion Compute Data Center North Hall Phase 2 electricity tariff is $64/MWh. The general market rate is $78/MWh.";
  const item = candidate("electricity_cost", 78, "USD/MWh", { quote });
  const result = preview(item);
  assert.equal(result.eligible, false);
  assert.match(result.blockedReasons.join(" "), /does not bind the exact quantity/i);

  const itemWithUnknownPhase = candidate("grid_interconnection", 18, "months", {
    quote: "Orion Compute Data Center North Hall interconnection timeline is 18 months.",
  });
  assert.equal(preview(itemWithUnknownPhase).eligible, false);
});

test("fails closed on competing, denied, ranged, qualified, and wrong-recipient point assertions for all targets", () => {
  const quantity = (target: SessionFinancialTarget, value: number) => {
    if (target === "electricity_cost") return `$${value}/MWh`;
    if (target === "water_consumption") return `${value} Mgal/year`;
    return `${value} months`;
  };
  const targets: Array<{ target: SessionFinancialTarget; value: number; competingPoint: number; unit: string }> = [
    { target: "electricity_cost", value: 78, competingPoint: 64, unit: "USD/MWh" },
    { target: "water_consumption", value: 12, competingPoint: 8, unit: "Mgal/year" },
    { target: "grid_interconnection", value: 18, competingPoint: 14, unit: "months" },
  ];

  for (const { target, value, competingPoint, unit } of targets) {
    const exactQuote = quoteFor(target, value, unit);
    const competitor = quoteFor(target, competingPoint, unit).replace(
      /\.$/,
      `, compared with the general market rate ${quantity(target, value)}.`,
    );
    const denied = exactQuote.replace(" is ", " is not ");
    const range = target === "electricity_cost"
      ? exactQuote.replace(quantity(target, value), `$${value - 5} to $${value + 5}/MWh`)
      : exactQuote.replace(quantity(target, value), `${value - 5} to ${value + 5}${target === "water_consumption" ? " Mgal/year" : " months"}`);
    const qualified = exactQuote.replace(" is ", " is at least ");
    const uncertain = exactQuote.replace(" is ", " may be ");
    const wrongRecipient = exactQuote.replace(" is ", " for South Hall is ");
    const wrongSubjectScope = exactQuote.replace(
      "Orion Compute Data Center North Hall Phase 2",
      "North Hall Phase 2 associated with Orion Compute Data Center",
    );
    const hypotheticalBridge = exactQuote.replace(" is ", " is a hypothetical figure of ");
    const trailingRecipient = exactQuote.replace(/\.$/, " for a different customer.");
    const competingAssertion = `${exactQuote} ${quoteFor(target, competingPoint, unit)}`;
    const contradictingAssertion = `${exactQuote} ${denied}`;
    const accepted = decide(candidate(target, value, unit), emptyHistory());

    for (const quote of [competitor, denied, range, qualified, uncertain, wrongRecipient, wrongSubjectScope, hypotheticalBridge, trailingRecipient, competingAssertion, contradictingAssertion]) {
      const item = candidate(target, value, unit, { quote });
      const result = preview(item);
      assert.equal(result.eligible, false, `${target} unexpectedly accepted: ${quote}`);
      assert.match(result.blockedReasons.join(" "), /bind the exact quantity|not eligible/i);
      assert.throws(() => decide(item, emptyHistory(), "accept"), /blocked/i);
      const replay = applySessionFinancialDecisions({
        ...context(),
        candidates: { [target]: item },
        history: accepted,
        now: NOW,
      });
      assert.deepEqual(replay.evidence[target], baselineEvidence()[target], `${target} replay activated an unsupported point: ${quote}`);
      assert.ok(replay.ignoredReasons[target]);
    }
  }

  const pointWithSeparateContext = candidate("electricity_cost", 78, "USD/MWh", {
    quote: "Regional prices are compared with a national benchmark. Orion Compute Data Center North Hall Phase 2 electricity tariff is $78/MWh.",
  });
  assert.equal(preview(pointWithSeparateContext).eligible, true);
});

test("history changes invalidate old previews and restored histories retain only valid local decisions", () => {
  const first = candidate("electricity_cost", 78, "USD/MWh");
  const other = candidate("grid_interconnection", 18, "months");
  const history = emptyHistory();
  const oldPreview = preview(first, history);
  const changedHistory = decide(other, history, "evidence-only");
  assert.throws(() => decideSessionFinancialPreview({
    preview: oldPreview,
    action: "accept",
    candidate: first,
    currentContext: context(),
    history: changedHistory,
    now: NOW,
  }), /baseline|history|binding/i);

  const accepted = decide(first, history);
  const restored = restoreSessionFinancialHistory(JSON.parse(JSON.stringify(accepted)), PROJECT_KEY);
  assert.deepEqual(restored, accepted);
  assert.equal(restoreSessionFinancialHistory({ ...accepted, version: 2 }, PROJECT_KEY), null);
  const missingEffect = structuredClone(accepted) as unknown as {
    projectKey: string;
    decisions: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  delete missingEffect.decisions[0].modelEffect;
  assert.equal(restoreSessionFinancialHistory(missingEffect, PROJECT_KEY), null);
  const mismatchedEffect = structuredClone(accepted);
  const modelEffect = mismatchedEffect.decisions[0].modelEffect;
  modelEffect.afterModelFingerprint =
    `${modelEffect.afterModelFingerprint.startsWith("0") ? "1" : "0"}${modelEffect.afterModelFingerprint.slice(1)}`;
  assert.equal(restoreSessionFinancialHistory(mismatchedEffect, PROJECT_KEY), null);
});