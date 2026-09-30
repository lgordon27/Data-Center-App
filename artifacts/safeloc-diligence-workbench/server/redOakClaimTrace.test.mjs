import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildClaimPassageMappings, evaluateResearchEvidenceEligibility } from "../src/data/sourceValidationPolicy.mjs";
import {
  EVIDENCE_SEMANTIC_IDS,
  normalizeEvidenceRecord,
} from "../src/data/evidenceSemanticPolicy.mjs";
import { extractClaimScopeFromPassage } from "../src/data/claimScopeExtractor.mjs";
import { matchProject } from "../src/data/researchClaimVerifier.mjs";
import { createRedOakClaimTrace } from "./redOakClaimTrace.mjs";
import { mergeCategoryResearchResults } from "./researchProjectProxy.mjs";
import { extractResearchDocument } from "./researchDocumentExtraction.mjs";
import {
  deriveRetainedResearchFindings,
  parseResponse,
  selectResearchProposals,
} from "../src/services/researchProjectService.ts";

const retainedPassage = readFileSync(
  new URL("./fixtures/red-oak-retained.txt", import.meta.url),
  "utf8",
).trimEnd() + " ";
const project = {
  name: "Red Oak Campus",
  location: "Red Oak, Ellis County, Texas",
  knownData: {
    aliases: ["Red Oak Campus"],
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
    capacity: 480,
  },
};
const sourceUrl = "https://www.theaiconsultingnetwork.com/blog/databank-2b-red-oak-dallas-data-center-oracle-cre-investors-2026";
const retainedSource = {
  url: sourceUrl,
  canonicalUrl: sourceUrl,
  title: "DataBank $2B Red Oak Data Center: 2026 CRE Analysis",
  sourceClass: "secondary-reporting",
  excerpt: retainedPassage,
  claimPassage: retainedPassage,
  facilityScope: "unknown",
  phaseScope: "unknown",
  timePeriod: null,
  accessOutcome: {
    state: "accessible",
    reason: "retrieved",
    passage: retainedPassage,
  },
};

test("traces a bounded structured claim through validation and proposal selection without retaining provider text", () => {
  const trace = createRedOakClaimTrace();
  const providerResponseId = "resp-grid-1";
  const claimPassage = "The 292-acre site will eventually host eight buildings delivering 480 MW of total IT load.";
  trace.recordStructuredReceipt({
    categoryId: "grid",
    providerResponseId,
    expectedEvidenceIds: ["grid_interconnection"],
    research: {
      projectSummary: { name: "Red Oak Campus" },
      evidence: {
        grid_interconnection: {
          value: 480,
          unit: "MW",
          claimPassage,
          sourceUrl: "https://records.example/red-oak?token=private-provider-token",
        },
      },
    },
  });
  trace.recordStructuredParseResult({ categoryId: "grid", providerResponseId, passed: true });
  trace.recordStage({
    categoryId: "grid",
    providerResponseId,
    claimId: "grid_interconnection",
    stage: "sourceRestriction",
    passed: true,
  });
  trace.recordStage({
    categoryId: "grid",
    providerResponseId,
    claimId: "grid_interconnection",
    stage: "merge",
    passed: true,
  });
  const evidence = [{
    id: "grid_interconnection",
    value: 480,
    unit: "MW",
    normalizedValue: 480,
    normalizedUnit: "MW",
    claimPassage,
    sourceUrl: "https://records.example/red-oak?token=private-provider-token",
    sourceRelevance: "exact-project",
    facilityScope: "project",
    phaseScope: "all-phases",
    claimTimePeriod: null,
    semanticValidationStatus: "valid",
    eligibleForModel: false,
    quarantineReasons: ["Missing claim time scope."],
    sources: [{
      canonicalUrl: "https://records.example/red-oak?token=private-provider-token",
      exactProject: true,
    }],
    claimMappings: [{
      supportStatus: "supported",
      rejectionCodes: ["missing-time-scope"],
      facilityScope: "project",
      phaseScope: "all-phases",
      timePeriod: null,
    }],
    sourceValidation: {
      state: "rejected",
      rejectionCodes: ["missing-time-scope"],
      eligibilityTrace: {
        checks: [{ id: "exact-project-source", passed: false }],
      },
    },
  }];
  trace.recordValidatedEvidence({ categoryId: "grid", providerResponseId, evidence });
  const syntheticResponse = JSON.parse(readFileSync(
    new URL("../tests/fixtures/research-project-synthetic.json", import.meta.url),
    "utf8",
  ));
  const clientResult = parseResponse(syntheticResponse, project, trace);
  const selected = selectResearchProposals(clientResult.proposedInputs ?? [], trace, clientResult.evidence);
  assert.equal(Object.hasOwn(selected, "grid_interconnection"), false);

  const diagnostic = trace.toJSON();
  assert.equal(diagnostic.responses[0].state, "claims-received");
  assert.equal(diagnostic.responses[0].parseState, "validated");
  assert.equal(diagnostic.claims.length, 1);
  const claim = diagnostic.claims[0];
  assert.equal(claim.claimId, "grid_interconnection");
  assert.equal(claim.providerResponseId, providerResponseId);
  assert.equal(claim.normalizedValue, 480);
  assert.equal(claim.normalizedUnit, "MW");
  assert.match(claim.supportingQuoteSha256, /^[a-f0-9]{64}$/);
  assert.equal("supportingQuote" in claim, false);
  assert.equal(claim.canonicalSourceUrl, "https://records.example/red-oak");
  assert.equal(claim.projectIdentity.state, "exact-project");
  assert.equal(claim.facilityPhaseScope.facilityScope, "project");
  assert.equal(claim.facilityPhaseScope.phaseScope, "all-phases");
  assert.equal(claim.timeScope.state, "rejected");
  assert.equal(claim.semanticUnitValidation.state, "passed");
  assert.equal(claim.sourceValidation.state, "rejected");
  assert.equal(claim.containment.eligibleForModel, false);
  assert.equal(claim.stages.clientParsing.state, "passed");
  assert.equal(claim.stages.proposalSelection.state, "failed");
  assert.equal(claim.firstFailedGate.gate, "exact-project-source");
  assert.equal(claim.proposalCreated, false);
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /private-provider-token|292-acre site|provider text/);
});

test("records omitted claims, no-claim responses, and malformed responses separately", () => {
  const trace = createRedOakClaimTrace();
  trace.recordStructuredReceipt({
    categoryId: "grid",
    providerResponseId: "resp-empty",
    expectedEvidenceIds: ["grid_interconnection", "electricity_cost"],
    research: { projectSummary: { name: "Red Oak Campus" }, evidence: {} },
  });
  trace.recordStructuredParseResult({
    categoryId: "grid",
    providerResponseId: "resp-empty",
    passed: false,
    reasonCode: "malformed-response",
  });
  trace.recordStructuredReceipt({
    categoryId: "water",
    providerResponseId: "resp-malformed",
    expectedEvidenceIds: ["water_rights"],
    research: null,
  });
  trace.recordClientParseResult({
    evidence: [{ id: "water_rights", sources: { unexpected: true } }],
    passed: false,
    reasonCode: "invalid-evidence-item",
  });

  const diagnostic = trace.toJSON();
  assert.deepEqual(diagnostic.responses.map(({ state }) => state), ["no-claims", "malformed"]);
  assert.deepEqual(diagnostic.responses[0].omittedClaimIds, ["grid_interconnection", "electricity_cost"]);
  assert.equal(diagnostic.claims[0].structuredReceiptState, "omitted");
  assert.equal(diagnostic.claims[0].stages.structuredParsing.state, "failed");
  assert.equal(diagnostic.claims[0].firstFailedGate.reasonCode, "claim-omitted-from-response");
  assert.equal(diagnostic.claims[2].structuredReceiptState, "omitted");
  assert.equal(diagnostic.claims[2].stages.clientParsing.state, "failed");
});

test("records category and source restrictions at the production category merge boundary", () => {
  const trace = createRedOakClaimTrace();
  const providerResponseId = "resp-merge-1";
  const sourceUrl = "https://records.example/red-oak/interconnection";
  const projectSummary = {
    name: "Red Oak Campus",
    location: "Texas",
    description: "Red Oak Campus, Texas.",
    capacityMW: 480,
  };
  const returnedClaims = [
    { id: "grid_interconnection", value: 180, unit: "MW", sourceUrl },
    { id: "electricity_cost", value: 70, unit: "USD/MWh", sourceUrl: "https://external.example/unretained" },
    { id: "backup_power_capacity", value: 480, unit: "MW", sourceUrl },
  ];
  trace.recordStructuredReceipt({
    categoryId: "grid",
    providerResponseId,
    expectedEvidenceIds: ["grid_interconnection", "electricity_cost"],
    research: { projectSummary, evidence: returnedClaims },
  });
  trace.recordStructuredParseResult({ categoryId: "grid", providerResponseId, passed: true });

  const source = {
    url: sourceUrl,
    resolvedUrl: sourceUrl,
    canonicalUrl: sourceUrl,
    sourceId: sourceUrl,
    exactProject: true,
    sourceClass: "primary-company",
    accessStatus: "open",
  };
  const result = {
    categoryId: "grid",
    research: {
      projectSummary,
      evidence: [{
        ...returnedClaims[0],
        classification: "Management Assertion",
        description: "The Phase One interconnection is 180 MW.",
        sourceUrl,
        sources: [source],
        eligibleForModel: false,
      }],
    },
    rawResearch: { evidence: returnedClaims },
    sources: [source],
    coverage: { providerResponseId },
  };
  const merged = mergeCategoryResearchResults({
    name: projectSummary.name,
    location: projectSummary.location,
    knownData: {},
  }, [result], trace);
  const diagnostic = trace.toJSON();
  const validClaim = diagnostic.claims.find((claim) => claim.claimId === "grid_interconnection");
  const sourceRestrictedClaim = diagnostic.claims.find((claim) => claim.claimId === "electricity_cost");
  const outOfCategoryClaim = diagnostic.claims.find((claim) => claim.claimId === "backup_power_capacity");

  assert.ok(merged.evidence.some((item) => item.id === "grid_interconnection"));
  assert.equal(validClaim.stages.categoryRestriction.state, "passed");
  assert.equal(validClaim.stages.sourceRestriction.state, "passed");
  assert.equal(validClaim.stages.merge.state, "passed");
  assert.equal(sourceRestrictedClaim.stages.categoryRestriction.state, "passed");
  assert.equal(sourceRestrictedClaim.stages.sourceRestriction.state, "failed");
  assert.equal(sourceRestrictedClaim.firstFailedGate.gate, "sourceRestriction");
  assert.equal(outOfCategoryClaim.stages.categoryRestriction.state, "failed");
  assert.equal(outOfCategoryClaim.firstFailedGate.gate, "categoryRestriction");
});

test("replays the unchanged retained article through identity, scoped claims, findings, and proposal boundaries", async () => {
  assert.equal(retainedPassage.length, 4_000);
  const extraction = await extractResearchDocument({
    bytes: `<main><article><p>${retainedPassage}</p></article></main>`,
    contentType: "text/html",
    sourceUrl,
  });
  assert.equal(extraction.outcome, "extracted");
  assert.equal(extraction.passage, retainedPassage.trim());
  assert.ok(retainedPassage.includes(
    "The 292-acre site will eventually host eight buildings delivering 480 MW of total IT load.",
  ));
  assert.ok(retainedPassage.includes(
    "The first three buildings (DFW9 through DFW11) carry 180 MW and 600,000 square feet",
  ));

  assert.equal(matchProject(retainedPassage, project).verdict, "exact-project");
  assert.deepEqual(extractClaimScopeFromPassage({
    claimPassage: retainedPassage,
    claimValue: 480,
    unit: "MW",
  }), {
    facilityScope: "unknown",
    phaseScope: "unknown",
    claimTimePeriod: null,
    phaseIdentity: null,
  }, "repeated 480 MW mentions in the full article remain ambiguous");
  assert.deepEqual(extractClaimScopeFromPassage({
    claimPassage: retainedPassage,
    claimValue: 180,
    unit: "MW",
  }), {
    facilityScope: "unknown",
    phaseScope: "unknown",
    claimTimePeriod: null,
    phaseIdentity: null,
  }, "repeated 180 MW mentions in the full article remain ambiguous");

  const wholeCampusQuote = "The 292-acre site will eventually host eight buildings delivering 480 MW of total IT load.";
  const threeBuildingQuote = "On April 21, 2026, DataBank closed a $2 billion construction loan, the largest in company history, to fund the first three buildings (DFW9, DFW10, and DFW11), which together total 600,000 square feet and 180 megawatts of power.";
  const campusScope = extractClaimScopeFromPassage({
    claimPassage: wholeCampusQuote,
    claimValue: 480,
    unit: "MW",
  });
  const phaseScope = extractClaimScopeFromPassage({
    claimPassage: threeBuildingQuote,
    claimValue: 180,
    unit: "MW",
  });
  assert.equal(campusScope.phaseScope, "all-phases");
  assert.equal(campusScope.claimTimePeriod, null);
  assert.equal(phaseScope.phaseScope, "exact-phase");
  assert.match(phaseScope.phaseIdentity, /DFW9\/DFW10\/DFW11/);
  assert.equal(phaseScope.claimTimePeriod, "2026-04-21");

  const findings = deriveRetainedResearchFindings([retainedSource], project);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].assessment, "attributed-report");
  assert.equal(findings[0].applicability, "exact-project");
  assert.equal(findings[0].powerClaimState, "resolved");
  assert.equal(findings[0].powerClaim.quantity, "480 MW");
  assert.equal(findings[0].powerClaim.measure, "IT load/capacity");
  assert.notEqual(findings[0].financialProposalEligibility, "eligible");
  assert.equal(findings[0].evidenceEligibility, "research-only");
  assert.equal(findings[0].demonstratedFinancialEffect, false);

  const syntheticResponse = JSON.parse(readFileSync(
    new URL("../tests/fixtures/research-project-synthetic.json", import.meta.url),
    "utf8",
  ));
  const clientResult = parseResponse({
    ...syntheticResponse,
    sourceLedger: [retainedSource],
  }, project);
  assert.equal(clientResult.projectSummary.capacityMW, 480);
  assert.equal(clientResult.projectSummary.capacityProvenance, "directory-reported");
  assert.equal(clientResult.proposedInputs.length, 0);
  assert.equal(clientResult.acceptedModelInputs.length, 0);
  assert.equal(clientResult.retainedFindings[0].powerClaimState, "resolved");
});

test("a retained IT-load value cannot map to grid timeline or backup duration", () => {
  assert.equal(EVIDENCE_SEMANTIC_IDS.includes("project_capacity"), false);
  const quote = "The 292-acre site will eventually host eight buildings delivering 480 MW of total IT load.";
  assert.ok(retainedPassage.includes(quote));
  const source = {
    ...retainedSource,
    claimPassage: quote,
    facilityScope: "project",
    phaseScope: "all-phases",
    timePeriod: null,
  };

  for (const id of ["grid_interconnection", "backup_power_capacity"]) {
    const claimMappings = buildClaimPassageMappings({
      id,
      sources: [source],
      project,
      claim: { value: 480, numericValue: 480, description: "480 MW of IT load" },
    });
    assert.notEqual(claimMappings[0].supportStatus, "supported");
    assert.ok(claimMappings[0].rejectionCodes.includes("missing-time-scope"));

    const eligibility = evaluateResearchEvidenceEligibility({
      id,
      sources: [source],
      classification: "Management Assertion",
      sourceSupportConfidence: 62,
      sourceRelevance: "exact-project",
      coverageStatus: "supported",
      claimMappings,
    });
    assert.equal(eligibility.eligible, false);
    assert.ok(eligibility.rejectionCodes.includes("missing-time-scope"));
  }

  assert.equal(normalizeEvidenceRecord({
    id: "grid_interconnection",
    value: 480,
    numericValue: 480,
    unit: "MW",
    description: "480 MW of IT load",
  }).modelEligible, false);
  assert.equal(normalizeEvidenceRecord({
    id: "backup_power_capacity",
    value: 480,
    numericValue: 480,
    unit: "MW",
    description: "480 MW of IT load",
  }).modelEligible, false);
  for (const id of ["grid_interconnection", "backup_power_capacity"]) {
    assert.equal(normalizeEvidenceRecord({
      id,
      value: 180,
      numericValue: 180,
      unit: "MW",
      description: "180 MW for DFW9, DFW10, and DFW11",
    }).modelEligible, false, "bounded building-group power is neither grid timeline nor backup duration");
  }
});

test("Grid passage diagnostics retain only bounded quotes, hashes, and sanitized canonical URLs", () => {
  const trace = createRedOakClaimTrace();
  const excerpt = "A retained source passage about a specific Red Oak grid connection.";
  trace.recordAnalysisPassages({
    categoryId: "grid",
    attemptType: "primary",
    passages: [{
      url: "https://records.example/grid?signature=private-value",
      canonicalUrl: "https://records.example/grid?signature=private-value",
      claimPassage: excerpt,
    }],
  });
  trace.recordAnalysisPassages({
    categoryId: "grid",
    providerResponseId: "resp_grid",
    attemptType: "primary",
  });
  const batch = trace.toJSON().analysisPassages[0];
  assert.equal(batch.providerResponseId, "resp_grid");
  assert.equal(batch.passages[0].canonicalSourceUrl, "https://records.example/grid");
  assert.equal(batch.passages[0].excerpt, excerpt);
  assert.equal(batch.passages[0].quoteSha256.length, 64);
  assert.equal(JSON.stringify(batch).includes("private-value"), false);
});