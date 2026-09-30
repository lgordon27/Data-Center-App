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
import { extractResearchDocument } from "./researchDocumentExtraction.mjs";
import {
  deriveRetainedResearchFindings,
  parseResponse,
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