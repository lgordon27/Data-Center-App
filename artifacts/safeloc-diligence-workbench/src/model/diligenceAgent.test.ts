import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDiligenceStage,
  applyAgentFindingDecision,
  buildAgentReviewPackage,
  createInitialDiligenceAgent,
  hydrateReviewPackage,
  startDiligenceAgent,
} from "./diligenceAgent";

test("agent stages preserve completed work after a retryable failure", () => {
  let run = startDiligenceAgent(createInitialDiligenceAgent(), "2026-09-07T12:00:00.000Z");
  run = advanceDiligenceStage(run, "identity", { summary: "Identity bounded." }, "2026-09-07T12:00:01.000Z");
  run = advanceDiligenceStage(run, "planning", { error: "Approved-source request timed out.", retryable: true });
  assert.equal(run.status, "partial-failure");
  assert.equal(run.stages.find((stage) => stage.id === "identity")?.status, "completed");
  assert.equal(run.stages.find((stage) => stage.id === "planning")?.status, "retryable");
  assert.match(run.summary, /retained/i);
});

test("review decisions are explicit and do not change the finding into evidence", () => {
  const input = { projectName: "Test", location: "Texas", capacityMW: 100, evidenceIds: ["grid_interconnection"], communityUnresolvedCount: 1 };
  let run = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  run = applyAgentFindingDecision(run, "agent-finding-grid", "accepted", "Validate with ERCOT before close.");
  const finding = run.proposedFindings.find((item) => item.id === "agent-finding-grid");
  assert.equal(finding?.decision, "accepted");
  assert.equal(finding?.proposedClassification, undefined);
  assert.equal(finding?.reviewerNote, "Validate with ERCOT before close.");
});

test("review package keeps relationship categories distinct and ranges unresolved without support", () => {
  const pkg = buildAgentReviewPackage({ projectName: "Test", location: "Texas", capacityMW: 100, evidenceIds: [], communityUnresolvedCount: 0 });
  assert.deepEqual(pkg.relationships.map((item) => item.relationship), ["Direct", "Related", "Comparable", "Not found"]);
  assert.ok(pkg.valueAtRisk.every((item) => item.low === null && item.high === null && item.unit === "unresolved"));
  assert.ok(pkg.proposedFindings.every((item) => item.decision === "pending"));
});