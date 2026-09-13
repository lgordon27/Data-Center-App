import assert from "node:assert/strict";
import test from "node:test";

import type { EvidenceItem, ProjectContext } from "../context/DiligenceContext";
import {
  getCommunityDocumentation,
  getConferenceEvidenceSummary,
  getConferenceRelationship,
  isConferenceResearchIncomplete,
} from "./conferenceEvidence";

const curated: ProjectContext = {
  kind: "curated",
  name: "Stargate Abilene",
  location: "Taylor County, TX",
  description: "",
  capacityMW: 1200,
};

function item(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: "community_risk",
    label: "Community",
    value: "Not established",
    unit: "",
    classification: "Verified Evidence",
    impactRole: "Context Indicator",
    citation: "",
    description: "",
    sourceId: null,
    providerSourceId: null,
    sourceRole: "Project research",
    claimIds: [],
    ...overrides,
  };
}

function acceptedCommunity(passage: string, extra: Partial<EvidenceItem> = {}) {
  const url = "https://city.example.gov/project/agreement";
  const recordId = extra.id ?? "community_risk";
  return item({
    id: recordId,
    semanticValidationStatus: "valid",
    researchState: "accepted",
    acceptedForModel: true,
    sourceValidation: {
      policyVersion: 1,
      state: "claim-supported",
      rejectionCodes: [],
      claimMappings: [{
        id: "map-1",
        sourceId: url,
        passageId: "p-1",
        variable: recordId,
        claimText: passage,
        entityScope: "project",
        facilityScope: "facility",
        phaseScope: "current",
        timePeriod: null,
        sourceType: "primary-government",
        contradictionStatus: "none",
        supportStatus: "supported",
        exactQuotation: passage,
        rejectionCodes: [],
      }],
    },
    sources: [{
      url,
      title: "City record",
      publisher: "City",
      publishedAt: null,
      accessedAt: null,
      accessStatus: "open",
      excerpt: passage,
      claimPassage: passage,
      sourceClass: "primary-government",
      searchDomain: "community",
      relationship: "primary",
      exactProject: true,
    }],
    ...extra,
  });
}

test("company relationship requires a recognized origin and exact reviewed project", () => {
  assert.equal(getConferenceRelationship(curated, null).company, null);
  assert.equal(getConferenceRelationship(curated, "Unknown Co").established, false);
  assert.equal(getConferenceRelationship({ ...curated, name: "Stargate Other" }, "Oracle").established, false);

  const wrongLocation = { ...curated, kind: "custom" as const, location: "Racine County, WI" };
  assert.equal(getConferenceRelationship(wrongLocation, "Oracle").established, false);

  const result = getConferenceRelationship(curated, "Oracle");
  assert.equal(result.established, true);
  assert.equal(result.type, "Sourced Indirect Role");
  assert.ok(result.sources.length > 0);
  assert.ok(result.sources.every((source) => source.url.startsWith("http")));
  assert.ok(result.sources.every((source) => !/ishares|msci/i.test(source.url)));
});

test("community parser distinguishes every explicit documentation status", () => {
  const cases = [
    ["The parties signed a community benefits agreement.", "Executed agreement"],
    ["A proposed agreement remains not signed.", "Proposed agreement"],
    ["The operator adopted a voluntary community plan.", "Voluntary plan"],
    ["The county ordinance imposes noise limits.", "Ordinance or permit condition"],
    ["The company publicly committed to fund road repairs.", "Public commitment"],
    ["Residents opposed the project in documented opposition.", "Documented opposition"],
  ];
  for (const [passage, expected] of cases) {
    const result = getCommunityDocumentation(
      { community_risk: acceptedCommunity(passage) },
      { ...curated, kind: "custom", researchMode: "ai-researched" },
    );
    assert.ok(result.statuses.some((status) => status.label === expected), `${expected}: ${passage}`);
    assert.deepEqual(result.statuses[0].sourceUrls, ["https://city.example.gov/project/agreement"]);
  }
});

test("community execution is not inferred from negation, benchmarks, source-free, or unverified text", () => {
  const project = { ...curated, kind: "custom" as const, researchMode: "ai-researched" as const };
  for (const evidenceItem of [
    acceptedCommunity("No executed agreement was found."),
    item({ description: "The benchmark agreement was executed." }),
    acceptedCommunity("The agreement was signed.", { sources: [] }),
    acceptedCommunity("The agreement was signed.", { classification: "Management Assertion" }),
  ]) {
    const result = getCommunityDocumentation({ community_risk: evidenceItem }, project);
    assert.deepEqual(result.statuses.map((status) => status.label), ["No project-specific documentation found"]);
  }
  const mixed = getCommunityDocumentation(
    { community_risk: acceptedCommunity("A proposed agreement was reviewed but not signed.") },
    project,
  );
  assert.deepEqual(mixed.statuses.map((status) => status.label), ["Proposed agreement"]);
});

test("all common negative execution phrases remain undocumented", () => {
  const project = { ...curated, kind: "custom" as const, researchMode: "ai-researched" as const };
  const negatives = [
    "Agreement execution had not occurred.",
    "The agreement has not been executed.",
    "There is no signed agreement.",
    "The agreement was not signed.",
    "The agreement has never been executed.",
  ];
  for (const passage of negatives) {
    const result = getCommunityDocumentation(
      { community_risk: acceptedCommunity(passage) },
      project,
    );
    assert.deepEqual(
      result.statuses.map((status) => status.label),
      ["No project-specific documentation found"],
      passage,
    );
  }
});

test("community labels come from matched quotations, not synthesized item narration", () => {
  const evidenceItem = acceptedCommunity("A proposed agreement remains under review.");
  evidenceItem.description = "Hallway discussion claimed an executed agreement.";
  evidenceItem.value = "Executed agreement";
  evidenceItem.sources![0].claimPassage = "An unrelated narration says the agreement was signed.";

  const result = getCommunityDocumentation(
    { community_risk: evidenceItem },
    { ...curated, kind: "custom", researchMode: "ai-researched" },
  );
  assert.deepEqual(result.statuses.map((status) => status.label), ["Proposed agreement"]);
  assert.equal(result.statuses[0].detail, "A proposed agreement remains under review.");
});

test("curated community status requires a supported source passage and ignores contradictory narration", () => {
  const supported = acceptedCommunity("A proposed agreement remains under review.", {
    semanticValidationStatus: undefined,
    researchState: undefined,
    acceptedForModel: undefined,
  });
  supported.description = "The parties executed a community benefits agreement.";
  supported.value = "Executed agreement";
  const fromPassage = getCommunityDocumentation({ community_risk: supported }, curated);
  assert.deepEqual(fromPassage.statuses.map((status) => status.label), ["Proposed agreement"]);

  const urlOnly = item({
    description: "The parties executed a community benefits agreement.",
    value: "Executed agreement",
    sourceUrl: "https://city.example.gov/project/agreement",
  });
  const withoutPassage = getCommunityDocumentation({ community_risk: urlOnly }, curated);
  assert.deepEqual(
    withoutPassage.statuses.map((status) => status.label),
    ["No project-specific documentation found"],
  );
});

test("community parser does not turn explicit negative statements into positive statuses", () => {
  const negatives = [
    "There is no proposed agreement.",
    "This is not a voluntary plan.",
    "The county adopted no ordinance and imposed no permit condition.",
    "The company made no public commitment.",
    "The record reports no community opposition.",
  ];
  for (const passage of negatives) {
    const result = getCommunityDocumentation(
      { community_risk: acceptedCommunity(passage) },
      { ...curated, kind: "custom", researchMode: "ai-researched" },
    );
    assert.deepEqual(
      result.statuses.map((status) => status.label),
      ["No project-specific documentation found"],
      passage,
    );
  }
});

test("custom benchmark passages cannot establish a community status", () => {
  const result = getCommunityDocumentation(
    { community_risk: acceptedCommunity("A comparable benchmark has a signed development agreement.") },
    { ...curated, kind: "custom", researchMode: "ai-researched" },
  );
  assert.deepEqual(result.statuses.map((status) => status.label), ["No project-specific documentation found"]);
});

test("conference facts are verified, source-backed, non-synthetic, and preserve input records", () => {
  const verified = item({
    id: "verified",
    claimIds: ["stargate-campus"],
    description: "Reported project fact",
  });
  const synthetic = item({
    id: "synthetic",
    claimIds: ["synthetic-transaction"],
    description: "Synthetic model input",
  });
  const unsourced = item({ id: "unsourced" });
  const unverified = item({
    id: "unverified",
    classification: "Management Assertion",
    claimIds: ["stargate-campus"],
  });
  const evidence = { verified, synthetic, unsourced, unverified };
  const before = JSON.stringify(evidence);
  const result = getConferenceEvidenceSummary(evidence);
  assert.deepEqual(result.facts, [verified]);
  assert.equal(result.facts[0], verified);
  assert.equal(JSON.stringify(evidence), before);
  assert.ok(result.unresolved.includes(synthetic));
  assert.ok(result.unresolved.includes(unsourced));
});

test("custom facts and research completeness require accepted validated material evidence", () => {
  const project = { ...curated, kind: "custom" as const, researchMode: "ai-researched" as const };
  const classificationOnly = item({
    id: "water_rights",
    sourceUrl: "https://example.com/water",
    semanticValidationStatus: "unresolved",
    researchState: "quarantined",
  });
  assert.deepEqual(getConferenceEvidenceSummary({ water_rights: classificationOnly }).facts, []);
  assert.equal(isConferenceResearchIncomplete(project, { water_rights: classificationOnly }), true);

  const validated = acceptedCommunity("The source documents water rights.", { id: "water_rights" });
  assert.equal(isConferenceResearchIncomplete(project, { water_rights: validated }), true);
  assert.deepEqual(getConferenceEvidenceSummary({ water_rights: validated }).facts, [validated]);
  const decisionGates = ["water_rights", "customer_concentration", "backup_power_capacity", "water_source_resilience"];
  const gateOnly = Object.fromEntries(
    decisionGates.map((id) => [
      id,
      acceptedCommunity(`A supported fact for ${id}.`, { id, impactRole: "Decision Gate" }),
    ]),
  );
  assert.equal(isConferenceResearchIncomplete(project, gateOnly), true);

  const financialDrivers = [
    "electricity_cost",
    "water_consumption",
    "grid_interconnection",
    "water_escalation",
    "cooling_capex",
    "electricity_escalation",
    "carbon_compliance",
    "permitting_timeline",
    "site_hazard_exposure",
    "downtime_cost",
  ];
  const allDecisionRelevant = {
    ...gateOnly,
    ...Object.fromEntries(financialDrivers.map((id) => [
      id,
      acceptedCommunity(`A supported fact for ${id}.`, { id, impactRole: "Financial Driver" }),
    ])),
  };
  assert.equal(isConferenceResearchIncomplete(project, allDecisionRelevant), false);
  assert.equal(isConferenceResearchIncomplete({ ...project, researchMode: "research-incomplete" }, allDecisionRelevant), true);
  assert.equal(isConferenceResearchIncomplete({ ...project, researchMode: "default-assumptions" }, allDecisionRelevant), true);
});