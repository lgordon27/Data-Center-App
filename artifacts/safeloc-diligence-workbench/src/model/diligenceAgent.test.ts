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
  resolveAgentEvidenceSource,
  selectBulkAgentCandidates,
  isAgentRunStale,
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

test("resolves each evidence proposal to its mapped source and exact passage", () => {
  const evidence = {
    id: "water",
    label: "Water",
    value: "12",
    classification: "Management Assertion" as const,
    citation: "Retained citation",
    sourceUrl: "https://example.test/fallback",
    sources: [{
      sourceId: "source-a",
      title: "Context source",
      url: "https://example.test/a",
      excerpt: "Context excerpt",
      classification: "source-summary" as const,
    }, {
      sourceId: "source-b",
      title: "Validated source",
      url: "https://example.test/b",
      excerpt: "Validated excerpt",
      classification: "validated-source" as const,
      claimPassage: "Claim passage retained from the source.",
    }],
    sourceValidation: {
      claimMappings: [{
        sourceId: "source-b",
        claimText: "Water use is twelve units.",
        exactQuotation: "The facility uses twelve units of water.",
      }],
    },
  };
  assert.deepEqual(resolveAgentEvidenceSource(evidence), {
    sourceId: "source-b",
    sourceUrl: "https://example.test/b",
    claim: "Water use is twelve units.",
    passage: "The facility uses twelve units of water.",
  });
  const pkg = buildAgentReviewPackage({
    projectName: "Exact project",
    location: "Texas",
    capacityMW: 100,
    evidenceIds: ["water"],
    communityUnresolvedCount: 0,
    evidence: [{ ...evidence, sourceRelevance: "exact-project", eligibleForModel: true }],
  });
  const proposal = pkg.proposedFindings.find((item) => item.id === "agent-finding-water");
  assert.equal(proposal?.sourceIdentity, "source-b");
  assert.equal(proposal?.exactClaim, "Water use is twelve units.");
  assert.equal(proposal?.exactPassage, "The facility uses twelve units of water.");
});

test("proposals remain isolated until an explicit decision and support every audit outcome", () => {
  const input = {
    projectName: "Isolated project", location: "Texas", capacityMW: 100,
    evidenceIds: ["grid_interconnection"], communityUnresolvedCount: 0,
    validatedSourceCount: 1,
    evidence: [{
      id: "grid_interconnection", label: "Grid", value: "Queue confirmed",
      classification: "Management Assertion" as const, citation: "Filing p. 4",
      sourceRelevance: "exact-project" as const, eligibleForModel: true,
      sources: [{ sourceId: "grid-source", title: "Filing", excerpt: "Confirmed.", classification: "validated-source" as const, exactProject: true }],
      sourceValidation: { claimMappings: [{ sourceId: "grid-source", claimText: "Queue confirmed", exactQuotation: "Queue confirmed.", supportStatus: "supported" }] },
    }],
  };
  const preview = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const pending = preview.proposedFindings.find((item) => item.id === "agent-finding-grid")!;
  assert.equal(pending.decision, "pending");
  assert.equal(preview.auditEvents.length, 0);
  assert.equal(preview.appliedChanges.length, 0);
  const outcomes = ["accepted", "overridden", "rejected", "unresolved"] as const;
  for (const [index, outcome] of outcomes.entries()) {
    const state = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
    const final = applyAgentFindingDecision(state, "agent-finding-grid", outcome, outcome === "overridden" ? "Human confirmation" : undefined, outcome === "overridden" ? "User Assumption" : undefined, `2026-09-08T12:0${index}:00.000Z`);
    assert.equal(final.auditEvents.at(-1)?.outcome, outcome);
    assert.equal(final.proposedFindings.find((item) => item.id === "agent-finding-grid")?.decision, outcome);
    if (outcome === "accepted") assert.equal(final.appliedChanges.length, 1);
    else if (outcome === "overridden") assert.equal(final.appliedChanges.length, 1);
    else assert.equal(final.appliedChanges.length, 0);
  }
});

test("bulk candidates are pending consequential proposals, unique by evidence", () => {
  const base = {
    kind: "classification" as const, title: "x", summary: "x", evidenceIds: ["e"],
    proposedClassification: "Verified Evidence" as const, sourceIds: [], sourceSupportConfidence: 1,
    modelReportedConfidence: null, consequential: true, decision: "pending" as const,
    action: "reclassify-evidence" as const, affectedEvidenceId: "e", supportingSources: [],
    financialPreview: "x", decisionPosture: "x", reasoning: "x",
  };
  const candidates = selectBulkAgentCandidates([
    { ...base, id: "first" },
    { ...base, id: "duplicate", affectedEvidenceId: "e" },
    { ...base, id: "review-only", action: "review-only", affectedEvidenceId: "r" },
    { ...base, id: "decided", decision: "rejected", affectedEvidenceId: "d" },
    { ...base, id: "second", affectedEvidenceId: "f" },
  ]);
  assert.deepEqual(candidates.map((item) => item.id), ["first", "second"]);
});

test("stale detection and deliberate stale application retain fingerprints and metadata", () => {
  const input = {
    projectName: "Stale project", location: "Texas", capacityMW: 100,
    evidenceIds: ["grid_interconnection"], communityUnresolvedCount: 0,
    validatedSourceCount: 1,
    evidence: [{
      id: "grid_interconnection", label: "Grid", value: "Old",
      classification: "Management Assertion" as const, citation: "Filing",
      sourceRelevance: "exact-project" as const, eligibleForModel: true,
      sources: [{ sourceId: "grid", title: "Filing", excerpt: "Old", classification: "validated-source" as const, exactProject: true }],
      sourceValidation: { claimMappings: [{ sourceId: "grid", exactQuotation: "Old", supportStatus: "supported" }] },
    }],
  };
  const prepared = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const finding = prepared.proposedFindings.find((item) => item.id === "agent-finding-grid")!;
  const newer = { ...prepared, evidenceSnapshotKey: "new-evidence" };
  assert.equal(isAgentRunStale(finding, newer), true);
  const applied = applyAgentFindingDecision(newer, finding.id, "accepted", undefined, undefined, "2026-09-08T13:00:00.000Z");
  assert.equal(applied.auditEvents[0]?.staleApplied, true);
  assert.equal(applied.auditEvents[0]?.staleReason, "Evidence or project identity changed after proposal creation.");
  assert.equal(applied.auditEvents[0]?.proposalCreatedEvidenceFingerprint, finding.proposalCreatedEvidenceFingerprint);
  assert.equal(applied.auditEvents[0]?.appliedAgainstEvidenceFingerprint, "new-evidence");
});

test("reversal is append-only and preserves the original applied history", () => {
  const input = {
    projectName: "Reversible project", location: "Texas", capacityMW: 100,
    evidenceIds: ["grid_interconnection"], communityUnresolvedCount: 0,
    validatedSourceCount: 1,
    evidence: [{
      id: "grid_interconnection", label: "Grid", value: "Confirmed",
      classification: "Management Assertion" as const, citation: "Filing",
      sourceRelevance: "exact-project" as const,
      sources: [{ sourceId: "grid", title: "Filing", excerpt: "Confirmed", classification: "validated-source" as const }],
    }],
  };
  const accepted = applyAgentFindingDecision(
    hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input),
    "agent-finding-grid", "accepted", undefined, undefined, "2026-09-08T14:00:00.000Z",
  );
  const originalId = accepted.appliedChanges[0].id;
  const reversed = reverseAgentChange(accepted, originalId, "2026-09-08T14:01:00.000Z");
  assert.equal(reversed.auditEvents.length, 2);
  assert.equal(reversed.auditEvents[0].outcome, "accepted");
  assert.equal(reversed.auditEvents[1].outcome, "reversed");
  assert.equal(reversed.appliedChanges[0].id, originalId);
  assert.equal(reversed.appliedChanges[0].reversedAt, "2026-09-08T14:01:00.000Z");
});