import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDiligenceStage,
  applyAgentFindingDecision,
  buildAgentReviewPackage,
  createInitialDiligenceAgent,
  getAgentReviewTelemetry,
  groupAgentFindings,
  hydrateReviewPackage,
  normalizeRestoredAgentRun,
  startDiligenceAgent,
  reverseAgentChange,
  resolveAgentEvidenceSource,
  selectBulkAgentCandidates,
  isAgentRunStale,
  type AgentProjectInput,
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
      classification: "Verified Evidence" as const,
      currentClassification: "Management Assertion" as const,
      citation: "ERCOT queue filing, page 4",
      sourceRelevance: "exact-project" as const,
      eligibleForModel: true,
      sourceValidation: { claimMappings: [{ sourceId: "ercot-filing", claimText: "Queue position confirmed", exactQuotation: "Queue position confirmed for the named project.", supportStatus: "supported" }] },
      sources: [{
        sourceId: "ercot-filing",
        title: "ERCOT queue filing",
        url: "https://example.com/ercot-filing",
        excerpt: "Queue position confirmed for the named project.",
        classification: "validated-source" as const,
        exactProject: true,
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
      classification: "Verified Evidence" as const,
      currentClassification: "Management Assertion" as const,
      citation: "ERCOT queue filing, page 4",
      sourceRelevance: "exact-project" as const,
      eligibleForModel: true,
      sourceValidation: { claimMappings: [{ sourceId: "ercot-filing", claimText: "Queue position confirmed", exactQuotation: "Queue position confirmed for the named project.", supportStatus: "supported" }] },
      sources: [{
        sourceId: "ercot-filing",
        title: "ERCOT queue filing",
        excerpt: "Queue position confirmed for the named project.",
        classification: "validated-source" as const,
        exactProject: true,
      }],
    }],
  };
  const preview = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const overridden = applyAgentFindingDecision(preview, "agent-finding-grid", "overridden", "Keep as assertion", "User Assumption", "2026-09-08T12:00:00.000Z");
  const finding = overridden.proposedFindings.find((item) => item.id === "agent-finding-grid");
  assert.equal(finding?.decision, "overridden");
  assert.equal(finding?.originalProposal?.proposedClassification, "Verified Evidence");
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
      classification: "Verified Evidence" as const,
      currentClassification: "Missing Evidence" as const,
      citation: "ERCOT queue filing",
      sourceRelevance: "exact-project" as const,
      eligibleForModel: true,
      sourceValidation: { claimMappings: [{ sourceId: "ercot", claimText: "Confirmed", exactQuotation: "Confirmed.", supportStatus: "supported" }] },
      sources: [{ sourceId: "ercot", title: "ERCOT filing", excerpt: "Confirmed.", classification: "validated-source" as const, exactProject: true }],
    }],
  };
  const prepared = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  const accepted = applyAgentFindingDecision(prepared, "agent-finding-grid", "accepted", undefined, undefined, "2026-09-08T12:00:00.000Z");
  // The rerun sees the actual accepted state, not the pre-acceptance input.
  const acceptedInput = {
    ...input,
    evidence: input.evidence.map((item) => ({ ...item, currentClassification: "Verified Evidence" as const })),
  };
  const rerun = hydrateReviewPackage(startDiligenceAgent(accepted, "2026-09-08T12:01:00.000Z"), acceptedInput);
  assert.equal(rerun.auditEvents.length, 1);
  assert.equal(rerun.appliedChanges.length, 1);
  const rerunFinding = rerun.proposedFindings.find((item) => item.id === "agent-finding-grid");
  assert.equal(rerunFinding?.decision, "accepted");
  assert.equal(rerunFinding?.consequential, false);
  assert.equal(rerunFinding?.action, "review-only");
  assert.equal(rerunFinding?.group, "context");
  assert.equal(rerunFinding?.proposedClassification, undefined);
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
      classification: "Verified Evidence" as const, currentClassification: "Management Assertion" as const, citation: "Filing p. 4",
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

function telemetryInput(): AgentProjectInput {
  return {
    projectName: "Telemetry project",
    location: "Texas",
    capacityMW: 100,
    evidenceIds: ["evidence_a", "evidence_b", "evidence_c"],
    communityUnresolvedCount: 0,
    evidence: [
      {
        id: "evidence_a", label: "Eligible exact record", value: "Confirmed",
        classification: "Verified Evidence" as const, currentClassification: "Missing Evidence" as const,
        citation: "Filing", sourceRelevance: "exact-project" as const, eligibleForModel: true,
        sourceValidation: { claimMappings: [{ sourceId: "source-a", claimText: "Confirmed", exactQuotation: "Confirmed.", supportStatus: "supported" }] },
        sources: [{ sourceId: "source-a", title: "Filing A", url: "https://a.test", excerpt: "Confirmed.", classification: "validated-source" as const, exactProject: true }],
      },
      {
        id: "evidence_b", label: "Related context record", value: "Regional",
        classification: "Management Assertion" as const, citation: "Regional filing",
        sourceRelevance: "related-context" as const,
        sources: [{ sourceId: "source-b", title: "Filing B", url: "https://b.test", excerpt: "Regional context.", classification: "source-summary" as const }],
      },
      {
        id: "evidence_c", label: "Missing record", value: "Not established",
        classification: "Missing Evidence" as const, citation: "No source retained",
      },
    ],
  };
}

test("review telemetry separates new, retained, eligible, and mapped counters and reconciles with the run", () => {
  const input = telemetryInput();
  const telemetry = getAgentReviewTelemetry(input);
  assert.equal(telemetry.newSourceCount, 0);
  assert.equal(telemetry.retainedSourceCount, 2);
  assert.equal(telemetry.eligibleValidatedSourceCount, 1);
  assert.equal(telemetry.mappedVariableCount, 1);
  const run = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  assert.equal(run.retrievedSourceCount, telemetry.newSourceCount);
  assert.equal(run.retainedSourceCount, telemetry.retainedSourceCount);
  assert.equal(run.eligibleValidatedSourceCount, telemetry.eligibleValidatedSourceCount);
  assert.equal(run.mappedVariableCount, telemetry.mappedVariableCount);
});

test("findings group into actionable changes, open evidence gaps, and related context", () => {
  const pkg = buildAgentReviewPackage(telemetryInput());
  const groups = groupAgentFindings(pkg.proposedFindings);
  assert.deepEqual(groups.actionable.map((finding) => finding.id), ["agent-finding-evidence_a"]);
  assert.ok(groups.context.some((finding) => finding.id === "agent-finding-evidence_b"));
  assert.ok(groups.gap.some((finding) => finding.id === "agent-finding-evidence_c"));
  assert.ok(groups.gap.every((finding) => finding.gapQuestion || finding.id === "agent-finding-grid"));
  for (const finding of [...groups.gap, ...groups.context]) {
    assert.equal(finding.consequential, false, `${finding.id} must not be consequential`);
    assert.equal(finding.action, "review-only", `${finding.id} must be review-only`);
    assert.equal(finding.proposedClassification, undefined, `${finding.id} must not propose a classification`);
  }
});

test("curated-style grid evidence with unmapped sources is review-only context, never actionable", () => {
  const input: AgentProjectInput = {
    projectName: "Stargate Abilene",
    location: "Taylor County, TX",
    capacityMW: 1200,
    evidenceIds: ["grid_interconnection"],
    communityUnresolvedCount: 0,
    validatedSourceCount: 7,
    evidence: [{
      id: "grid_interconnection", label: "Grid Interconnection Timeline", value: "Expansion cancelled",
      classification: "Verified Evidence" as const, citation: "Retained claim/source records",
      sourceRelevance: "exact-project" as const,
      sources: [{ sourceId: "claim-source-1", title: "Retained claim source", excerpt: "Statement", classification: "source-summary" as const }],
    }],
  };
  const pkg = buildAgentReviewPackage(input);
  const grid = pkg.proposedFindings.find((finding) => finding.id === "agent-finding-grid");
  assert.equal(grid?.group, "context");
  assert.equal(grid?.consequential, false);
  assert.equal(grid?.action, "review-only");
  assert.equal(grid?.proposedClassification, undefined);
  assert.equal(grid?.affectedEvidenceId, "grid_interconnection");
});

test("actionable findings are prioritized by materiality, then confidence", () => {
  const base = {
    classification: "Verified Evidence" as const,
    currentClassification: "Missing Evidence" as const,
    citation: "Filing",
    sourceRelevance: "exact-project" as const,
    eligibleForModel: true,
    sourceValidation: { claimMappings: [{ sourceId: "s", claimText: "c", exactQuotation: "q", supportStatus: "supported" }] },
    sources: [{ sourceId: "s", title: "Filing", excerpt: "q", classification: "validated-source" as const, exactProject: true }],
  };
  const pkg = buildAgentReviewPackage({
    projectName: "Priority project", location: "Texas", capacityMW: 100,
    evidenceIds: ["low_materiality", "high_materiality", "mid_materiality"],
    communityUnresolvedCount: 0,
    evidence: [
      { ...base, id: "low_materiality", label: "Low", value: "a", materialityScore: 0.1, sourceSupportConfidence: 95 },
      { ...base, id: "high_materiality", label: "High", value: "b", materialityScore: 2.4, sourceSupportConfidence: 40 },
      { ...base, id: "mid_materiality", label: "Mid", value: "c", materialityScore: 0.1, sourceSupportConfidence: 60 },
    ],
  });
  const groups = groupAgentFindings(pkg.proposedFindings);
  assert.deepEqual(groups.actionable.map((finding) => finding.id), [
    "agent-finding-high_materiality",
    "agent-finding-low_materiality",
    "agent-finding-mid_materiality",
  ]);
});

test("telemetry pins new-source counts to zero regardless of caller input", () => {
  const telemetry = getAgentReviewTelemetry({ ...telemetryInput(), retrievedSourceCount: 9 });
  assert.equal(telemetry.newSourceCount, 0);
});

test("restored runs are normalized fail-closed: zero new sources, legacy consequential proposals withdrawn", () => {
  const input = telemetryInput();
  const prepared = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), input);
  // Simulate a pre-upgrade persisted run: nonzero retrieval count and a pending
  // consequential proposal on a record that is not eligible under the current contract.
  const legacyRun = {
    ...prepared,
    retrievedSourceCount: 9,
    proposedFindings: prepared.proposedFindings.map((finding) => finding.id === "agent-finding-evidence_b"
      ? { ...finding, group: undefined, consequential: true, action: "reclassify-evidence" as const, proposedClassification: "Verified Evidence" as const }
      : finding),
  };
  const normalized = normalizeRestoredAgentRun(legacyRun, input);
  assert.equal(normalized.retrievedSourceCount, 0);
  const legacy = normalized.proposedFindings.find((finding) => finding.id === "agent-finding-evidence_b");
  assert.equal(legacy?.consequential, false);
  assert.equal(legacy?.action, "review-only");
  assert.equal(legacy?.proposedClassification, undefined);
  assert.equal(legacy?.originalProposal, undefined);
  assert.equal(legacy?.group, "context");
  // Genuinely actionable proposals survive normalization.
  assert.equal(normalized.proposedFindings.find((finding) => finding.id === "agent-finding-evidence_a")?.consequential, true);
  // Applied history is preserved untouched.
  assert.equal(normalized.appliedChanges, prepared.appliedChanges);
});

test("eligible evidence that matches the accepted state is context, not a gap, and proposes nothing", () => {
  const input = telemetryInput();
  const acceptedInput = {
    ...input,
    evidence: input.evidence.map((item) => item.id === "evidence_a" ? { ...item, currentClassification: "Verified Evidence" as const } : item),
  };
  const pkg = buildAgentReviewPackage(acceptedInput);
  const finding = pkg.proposedFindings.find((item) => item.id === "agent-finding-evidence_a");
  assert.equal(finding?.group, "context");
  assert.equal(finding?.consequential, false);
  assert.equal(finding?.action, "review-only");
  assert.equal(finding?.proposedClassification, undefined);
  assert.equal(finding?.proposedValue, undefined);
  assert.equal(finding?.originalProposal, undefined);
  assert.match(finding?.summary ?? "", /matches the accepted state/);
});

test("readiness language says review prepared or needs evidence, never investment-ready", () => {
  const actionable = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), telemetryInput());
  assert.equal(actionable.readiness, "ready-for-human-review");
  assert.match(actionable.readinessReason, /^Review prepared/);
  assert.match(actionable.readinessReason, /actionable change/);
  const withGaps = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), { ...telemetryInput(), materialGapCount: 2 });
  assert.equal(withGaps.readiness, "conditionally-ready");
  assert.match(withGaps.readinessReason, /Review prepared with 2 open evidence gaps/);
  const sourceFree = hydrateReviewPackage(startDiligenceAgent(createInitialDiligenceAgent()), {
    projectName: "Unverified", location: "Unknown", capacityMW: 100,
    evidenceIds: [], communityUnresolvedCount: 0, materialGapCount: 16,
    evidence: [],
  });
  assert.equal(sourceFree.readiness, "not-ready");
  assert.match(sourceFree.readinessReason, /^Needs evidence/);
});

test("reversal is append-only and preserves the original applied history", () => {
  const input = {
    projectName: "Reversible project", location: "Texas", capacityMW: 100,
    evidenceIds: ["grid_interconnection"], communityUnresolvedCount: 0,
    validatedSourceCount: 1,
    evidence: [{
      id: "grid_interconnection", label: "Grid", value: "Confirmed",
      classification: "Verified Evidence" as const, currentClassification: "Management Assertion" as const, citation: "Filing",
      sourceRelevance: "exact-project" as const, eligibleForModel: true,
      sourceValidation: { claimMappings: [{ sourceId: "grid", claimText: "Confirmed", exactQuotation: "Confirmed", supportStatus: "supported" }] },
      sources: [{ sourceId: "grid", title: "Filing", excerpt: "Confirmed", classification: "validated-source" as const, exactProject: true }],
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