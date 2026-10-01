import assert from "node:assert/strict";
import test from "node:test";
import { rankAcquisitionCandidates } from "./researchAcquisitionRanking.mjs";

const redOakProject = {
  name: "Red Oak Campus",
  location: "Red Oak, Ellis County, Texas",
  knownData: {
    aliases: ["Red Oak Campus", "DataBank Red Oak Campus", "DataBank Red Oak Data Center"],
    operator: "DataBank",
    companyDomains: ["databank.com"],
    facilityIdentifiers: ["DFW9", "DFW10", "DFW11"],
  },
};

test("ranks exact official Red Oak records and operator pages ahead of generic roots, indexes, and policies", () => {
  const candidates = [
    { url: "https://databank.com/", title: "DataBank", sourceChannel: "google-grounded-search" },
    { url: "https://databank.com/sitemap.xml", title: "DataBank sitemap", sourceChannel: "google-grounded-search" },
    { url: "https://elliscounty.gov/data-center-policy", title: "Ellis County Data Center Policy" },
    {
      url: "https://databank.com/projects/red-oak-campus-dfw11",
      title: "DataBank Red Oak Campus DFW11 project record",
      sourceChannel: "google-grounded-search",
    },
    {
      url: "https://tdlr.texas.gov/TABS/Search/Project/DFW11",
      title: "TDLR filing for DataBank Red Oak Campus DFW11",
      sourceChannel: "google-grounded-search",
    },
    {
      url: "https://news.example/red-oak-campus-interconnection",
      title: "Red Oak Campus interconnection reporting",
      sourceChannel: "google-grounded-search",
    },
  ];
  const ranked = rankAcquisitionCandidates(candidates, redOakProject);

  assert.deepEqual(ranked.map((candidate) => candidate.url), [
    "https://tdlr.texas.gov/TABS/Search/Project/DFW11",
    "https://databank.com/projects/red-oak-campus-dfw11",
    "https://news.example/red-oak-campus-interconnection",
    "https://elliscounty.gov/data-center-policy",
    "https://databank.com/",
    "https://databank.com/sitemap.xml",
  ]);
  assert.ok(ranked[0].acquisitionReasons.includes("named-facility-identifier"));
  assert.ok(ranked[0].acquisitionReasons.includes("exact-project-official-project-record"));
  assert.ok(ranked[1].acquisitionReasons.includes("exact-project-operator-project-page"));
  assert.ok(ranked[2].acquisitionReasons.includes("exact-project-reporting"));
  assert.equal(ranked[4].acquisitionPriority, 10, "a root homepage stays low priority even if the domain names the operator");
  assert.equal(ranked[5].acquisitionPriority, 10, "a sitemap stays low priority even if the domain names the operator");
  assert.ok(ranked.find((candidate) => candidate.url.includes("elliscounty.gov"))
    .acquisitionReasons.includes("unrelated-policy-or-authority-page"));
  assert.equal(ranked[0].discoveryCandidateRank, 5);
  assert.equal(ranked[0].acquisitionRank, 1);
});

test("prefers exact-project text reporting over an equivalent video without granting identity or eligibility", () => {
  const candidates = [
    {
      url: "https://youtube.com/watch?v=fixture",
      title: "Red Oak Campus grid interconnection video",
      sourceType: "video",
    },
    {
      url: "https://reporting.example/red-oak-campus-grid",
      title: "Red Oak Campus grid interconnection report",
      sourceType: "article",
    },
  ];
  const ranked = rankAcquisitionCandidates(candidates, redOakProject);

  assert.equal(ranked[0].url, candidates[1].url);
  assert.ok(ranked[0].acquisitionPriority > ranked[1].acquisitionPriority);
  assert.ok(ranked[1].acquisitionReasons.includes("video-source-deprioritized"));
  for (const candidate of ranked) {
    assert.equal(Object.hasOwn(candidate, "exactProject"), false);
    assert.equal(Object.hasOwn(candidate, "eligibleForModel"), false);
  }
});

test("uses stable original discovery order for tied candidates and never infers identity from location alone", () => {
  const candidates = [
    { url: "https://news.example/red-oak-texas-data-center", title: "Red Oak Texas data center market" },
    { url: "https://county.example/ellis-county-policy", title: "Ellis County policy" },
  ];
  const ranked = rankAcquisitionCandidates(candidates, redOakProject);

  assert.deepEqual(ranked.map((candidate) => candidate.discoveryCandidateRank), [1, 2]);
  assert.ok(ranked.every((candidate) =>
    candidate.acquisitionReasons.includes("no-exact-project-identity-signal")));
  assert.equal(ranked[0].acquisitionPriority, 100);
});

test("operator campus chatter without a submitted project or facility identifier stays generic", () => {
  const ranked = rankAcquisitionCandidates([{
    url: "https://databank.com/news/new-campus",
    title: "DataBank opens another campus for a data center project in Ohio",
  }], redOakProject);

  assert.equal(ranked[0].acquisitionPriority, 140);
  assert.ok(!ranked[0].acquisitionReasons.includes("operator-and-project-or-campus"));
  assert.ok(ranked[0].acquisitionReasons.includes("no-exact-project-identity-signal"));
});

test("prioritizes only bridge candidates whose trusted metadata combines a submitted DFW ID with project signals", () => {
  const candidates = [
    {
      url: "https://records.example/dfw9",
      title: "DFW9 facility filing",
      discoveryQueryAttributionStatus: "provider-attributed",
      discoveryOriginatingQuery: "DataBank Red Oak Campus DFW9 relationship",
    },
    {
      url: "https://records.example/dfw10",
      title: "DFW10 facility filing",
      discoveryContext: "DataBank Red Oak Campus DFW10 relationship",
    },
    {
      url: "https://records.example/dfw11",
      title: "DFW11 facility filing",
      discoveryQueryAttributionStatus: "unavailable",
      discoveryOriginatingQuery: "DataBank Red Oak Campus DFW11 relationship",
    },
  ];
  const ranked = rankAcquisitionCandidates(candidates, redOakProject);
  const attributedBridge = ranked.find((candidate) => candidate.url.endsWith("/dfw9"));
  const unverifiedContext = ranked.find((candidate) => candidate.url.endsWith("/dfw10"));
  const unavailableAttribution = ranked.find((candidate) => candidate.url.endsWith("/dfw11"));

  assert.ok(attributedBridge.acquisitionPriority > unverifiedContext.acquisitionPriority);
  assert.ok(attributedBridge.acquisitionReasons.includes("facility-project-bridge-discovery-metadata"));
  assert.ok(!unverifiedContext.acquisitionReasons.includes("facility-project-bridge-discovery-metadata"),
    "snippets and generic discovery context do not create the new bridge priority");
  assert.ok(!unavailableAttribution.acquisitionReasons.includes("facility-project-bridge-discovery-metadata"),
    "a planned-looking query string is ignored unless the provider attribution is explicit");
});