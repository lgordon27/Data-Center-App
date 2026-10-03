import assert from "node:assert/strict";
import test from "node:test";
import { createResearchFunnelDiagnostics } from "./researchFunnelDiagnostics.mjs";

test("all categories retain issued passage lineage without modifying the production packet", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  const packet = [{ canonicalUrl: "https://records.example.gov/water", passage: "Cedar Campus has a municipal water agreement.", title: "Water agreement" }];
  const before = structuredClone(packet);
  for (const categoryId of ["project-identity", "grid", "water", "construction-capital", "permitting-community", "tenant-counterparty", "electricity", "climate-operational-hazard"]) {
    diagnostics.claimTrace.recordAnalysisPacket({ categoryId, packet });
    diagnostics.claimTrace.recordAnalysisPacket({ categoryId, providerResponseId: `response-${categoryId}` });
  }
  const capture = diagnostics.toJSON();
  assert.equal(capture.analysisPackets.length, 8);
  assert.ok(capture.analysisPackets.every((batch) => batch.providerResponseId && batch.passages[0].passageSha256));
  assert.deepEqual(packet, before);
  capture.analysisPackets.length = 0;
  assert.equal(diagnostics.toJSON().analysisPackets.length, 8);
});

test("receipts preserve reuse and blocked access while sanitizing sensitive URLs and text", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  diagnostics.collector.recordDiscoveryCandidates([{
    url: "https://records.example.gov/filing?token=private&record=23",
    sourceFamily: "government-project-record", acquisitionRank: 1,
  }]);
  diagnostics.collector.recordPhysicalReceipt({
    candidate: { url: "https://records.example.gov/filing" },
    accessOutcome: { state: "blocked", reason: "Bearer private", physicalOpenIndex: 1 },
    reused: true,
  });
  diagnostics.claimTrace.recordAnalysisPacket({
    categoryId: "water", packet: [{
      canonicalUrl: "https://records.example.gov/filing?token=private",
      passage: "Cedar Campus: token=private and api_key=private. Public record.",
    }],
  });
  const capture = diagnostics.toJSON();
  assert.equal(capture.receipts[0].reused, true);
  assert.equal(capture.receipts[0].state, "blocked");
  assert.equal(capture.candidates[0].sourceFamily, "government-project-record");
  assert.doesNotMatch(JSON.stringify(capture), /private/);
});

test("diagnostics are bounded and unexecuted work is never synthesized", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  diagnostics.collector.recordDiscoveryCandidates(Array.from({ length: 90 }, (_, index) => ({ url: `https://records.example.gov/${index}` })));
  const capture = diagnostics.toJSON();
  assert.equal(capture.observedCandidates, 90);
  assert.equal(capture.candidates.length, 80);
  assert.equal(capture.candidatesTruncated, true);
  assert.deepEqual(capture.analysisPackets, []);
  assert.deepEqual(capture.authorizations, []);
});

test("captures a bounded original category exception without credentials or stack", () => {
  const diagnostics = createResearchFunnelDiagnostics();
  for (let index = 0; index < 12; index += 1) diagnostics.collector.recordEngineFailure({
    categoryId: "project-identity", stage: "category-orchestration",
    error: new TypeError("Failed at https://records.example.gov/a?token=private; Bearer private"),
  });
  const failures = diagnostics.toJSON().engineFailures;
  assert.equal(failures.length, 8);
  assert.equal(failures[0].errorName, "TypeError");
  assert.equal(failures[0].stage, "category-orchestration");
  assert.doesNotMatch(JSON.stringify(failures), /private|stack|authorization/i);
});