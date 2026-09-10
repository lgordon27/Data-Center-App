import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDiligenceStage,
  applyAgentFindingDecision,
  buildAgentReviewPackage,
  createInitialDiligenceAgent,
  hydrateReviewPackage,
  startDiligenceAgent,
  reverseAgentChange,
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

test("source-backed acceptance records an applied change and reversal without mutating the preview", () => {
  const input = {
    projectName: "Custom Texas project",
    location: "Texas",
    capacityMW: 100,
    evidenceIds: ["grid_interconnection"],
    communityUnresolvedCount: 1,
    retrievedSourceCount: 2,
    validatedSourceCount: 1,
    materialGapCount: 1,
    evidence: [{
      id: "grid_interconnection",
      label: "Grid interconnection",
      value: "Queue position confirmed",
      classification: "Management Assertion" as const,
      citation: "ERCOT queue filing, page 4",
      sourceRelevance: "exact-project" as const,
      sources: [{
        sourceId: "ercot-filing",
        title: "ERCOT queue filing",
        url: "https://example.com/ercot-filing",
        excerpt: "Queue position confirmed for the named project.",
        classification: "validated-source" as const,
      }],
    }],
  };
  const preview = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  assert.equal(preview.readiness, "conditionally-ready");
  assert.equal(preview.proposedFindings.find((item) => item.id === "agent-finding-grid")?.decision, "pending");
  const accepted = applyAgentFindingDecision(preview, "agent-finding-grid", "accepted", undefined, undefined, "2026-09-08T12:00:00.000Z");
  const finding = accepted.proposedFindings.find((item) => item.id === "agent-finding-grid");
  assert.equal(finding?.decision, "accepted");
  assert.equal(finding?.originalProposal?.proposedClassification, "Verified Evidence");
  assert.equal(accepted.auditEvents[0]?.beforeClassification, "Management Assertion");
  assert.equal(accepted.appliedChanges.length, 1);
  assert.equal(preview.proposedFindings.find((item) => item.id === "agent-finding-grid")?.decision, "pending");
  const reversed = reverseAgentChange(accepted, accepted.appliedChanges[0].id, "2026-09-08T12:01:00.000Z");
  assert.equal(reversed.appliedChanges[0]?.reversedAt, "2026-09-08T12:01:00.000Z");
  assert.equal(reversed.auditEvents.at(-1)?.outcome, "reversed");
});

test("override preserves the AI proposal and applies only the confirmed human classification", () => {
  const input = {
    projectName: "Custom Texas project",
    location: "Texas",
    capacityMW: 100,
    evidenceIds: ["grid_interconnection"],
    communityUnresolvedCount: 0,
    validatedSourceCount: 1,
    evidence: [{
      id: "grid_interconnection",
      label: "Grid interconnection",
      value: "Queue position confirmed",
      classification: "Management Assertion" as const,
      citation: "ERCOT queue filing, page 4",
      sourceRelevance: "related-context" as const,
      sources: [{
        sourceId: "ercot-filing",
        title: "ERCOT queue filing",
        excerpt: "The filing describes a regional queue.",
        classification: "validated-source" as const,
      }],
    }],
  };
  const preview = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const overridden = applyAgentFindingDecision(preview, "agent-finding-grid", "overridden", "Keep as assertion", "User Assumption", "2026-09-08T12:00:00.000Z");
  const finding = overridden.proposedFindings.find((item) => item.id === "agent-finding-grid");
  assert.equal(finding?.decision, "overridden");
  assert.equal(finding?.originalProposal?.proposedClassification, "Management Assertion");
  assert.equal(finding?.humanFinalClassification, "User Assumption");
  assert.equal(overridden.auditEvents[0]?.finalClassification, "User Assumption");
});

test("source-free custom research is not ready and cannot produce a consequential proposal", () => {
  const input = {
    projectName: "Unverified project",
    location: "Unknown",
    capacityMW: 100,
    evidenceIds: ["grid_interconnection"],
    communityUnresolvedCount: 0,
    retrievedSourceCount: 0,
    validatedSourceCount: 0,
    materialGapCount: 16,
    evidence: [{
      id: "grid_interconnection",
      label: "Grid interconnection",
      value: "Unknown",
      classification: "Management Assertion" as const,
      citation: "Generated lead; no source returned",
    }],
  };
  const run = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  assert.equal(run.readiness, "not-ready");
  const finding = run.proposedFindings.find((item) => item.id === "agent-finding-grid");
  assert.equal(finding?.action, "review-only");
  assert.equal(finding?.consequential, false);
});

test("review-only dispositions are auditable but never reversible, and finalized proposals are idempotent", () => {
  const input = { projectName: "Test", location: "Texas", capacityMW: 100, evidenceIds: [], communityUnresolvedCount: 0 };
  const preview = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const rejected = applyAgentFindingDecision(preview, "agent-finding-community", "rejected", "No project source.");
  assert.equal(rejected.auditEvents.length, 1);
  assert.equal(rejected.appliedChanges.length, 0);
  const repeated = applyAgentFindingDecision(rejected, "agent-finding-community", "accepted");
  assert.equal(repeated.auditEvents.length, 1);
  assert.equal(repeated.appliedChanges.length, 0);
});

test("rerunning retains active applied lineage and keeps the proposal finalized", () => {
  const input = {
    projectName: "Custom Texas project",
    location: "Texas",
    capacityMW: 100,
    evidenceIds: ["grid_interconnection"],
    communityUnresolvedCount: 0,
    validatedSourceCount: 1,
    evidence: [{
      id: "grid_interconnection",
      label: "Grid interconnection",
      value: "Queue position confirmed",
      classification: "Management Assertion" as const,
      citation: "ERCOT queue filing",
      sourceRelevance: "exact-project" as const,
      sources: [{ sourceId: "ercot", title: "ERCOT filing", excerpt: "Confirmed.", classification: "validated-source" as const }],
    }],
  };
  const prepared = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const accepted = applyAgentFindingDecision(prepared, "agent-finding-grid", "accepted", undefined, undefined, "2026-09-08T12:00:00.000Z");
  const rerun = hydrateReviewPackage(startDiligenceAgent(accepted, "2026-09-08T12:01:00.000Z"), input);
  assert.equal(rerun.auditEvents.length, 1);
  assert.equal(rerun.appliedChanges.length, 1);
  assert.equal(rerun.proposedFindings.find((item) => item.id === "agent-finding-grid")?.decision, "accepted");
});