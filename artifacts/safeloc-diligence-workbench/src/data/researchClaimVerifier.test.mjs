import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  corroborateRelatedFacilityAcrossPassages,
  matchProject,
  parseLocations,
  traceProjectMatch,
  verifyQuote,
} from "./researchClaimVerifier.mjs";
import { assessResearchProjectIdentity } from "./researchIdentity.mjs";

test("verifies an exact quote and allows only requested typographic normalization", () => {
  assert.equal(verifyQuote(
    "The filing states, “The first phase is now operating — with 24,000 GPUs.”",
    '"The first phase is now operating - with 24,000 GPUs."',
  ), true);
  assert.equal(verifyQuote(
    "A report says ‘the site is ready for service with all required permits’.",
    "'the site is ready for service with all required permits'",
  ), true);
  assert.equal(verifyQuote("The site is operating at 100 MW.", "The site is operating at 101 MW."), false);
  assert.equal(verifyQuote("The site is operating at 100 MW.", ""), false);
  assert.equal(verifyQuote(
    "Infrastructure modernization accelerated through regional development initiatives.",
    "Infrastructure modernization accelerated through regional development initiatives",
  ), false, "seven words are below the minimum even when the character count is long enough");
  assert.equal(verifyQuote(
    "Site has 480 MW now across Phase One.",
    "Site has 480 MW now across Phase One",
  ), false, "eight words are still below the 40-character minimum");
  assert.equal(verifyQuote("The filing lists 480 MW of capacity across all phases.", "480 MW"), false);
});

test("parses city/state, county/state, multiword states, and Washington exceptions", () => {
  assert.deepEqual(parseLocations(
    "Sites include Atlanta, Georgia; Morgantown, WV; Abilene TX; Irving, Dallas County, Texas; and Washington County, West Virginia.",
  ), [
    { city: "Atlanta", state: "Georgia" },
    { city: "Morgantown", state: "West Virginia" },
    { city: "Abilene", state: "Texas" },
    { city: "Irving", county: "Dallas County", state: "Texas" },
    { county: "Washington County", state: "West Virginia" },
  ]);

  const washington = parseLocations("The project is in Washington County. The office is in Washington, D.C.");
  assert.deepEqual(washington, [
    { county: "Washington County" },
    { city: "Washington", state: "District of Columbia" },
  ]);

  assert.deepEqual(parseLocations("The site is near Raleigh, North Carolina and not Washington."), [
    { city: "Raleigh", state: "North Carolina" },
    { state: "Washington" },
  ]);
});

const scenarioProjects = {
  texas: {
    name: "Project Atlas",
    aliases: ["Atlas Compute Campus"],
    operator: "Atlas Compute",
    city: "Irving",
    county: "Dallas County",
    state: "Texas",
  },
};

test("keeps an unrelated Iowa crypto facility from creating a false project match", () => {
  const result = matchProject(
    "A cryptocurrency mining facility in Iowa is seeking a new power contract. The project has no connection to Project Atlas.",
    scenarioProjects.texas,
  );
  assert.equal(result.verdict, "unrelated");
  assert.match(result.reason, /does not identify it|conflicts/i);
});

test("ignores an Atlanta comparison when the requested project is located in Texas", () => {
  const result = matchProject(
    "Project Atlas is located in Irving, Dallas County, Texas, and Atlas Compute operates the facility, compared with a similar data center in Atlanta, Georgia.",
    scenarioProjects.texas,
  );
  assert.equal(result.verdict, "exact-project");
  assert.match(result.reason, /city|county|state/i);
});

test("does not confuse Washington County with the state of Washington", () => {
  const result = matchProject(
    "The Aster Washington County campus is in West Virginia.",
    {
      name: "Aster Washington County Campus",
      county: "Washington County",
      state: "West Virginia",
    },
  );
  assert.equal(result.verdict, "exact-project");
  assert.match(result.reason, /county|state/i);
});

test("matches reordered project words and the West Virginia abbreviation", () => {
  const result = matchProject(
    "The Compute Campus Atlas is located near Morgantown, Monongalia County, WV.",
    {
      name: "Atlas Compute Campus",
      city: "Morgantown",
      county: "Monongalia County",
      state: "West Virginia",
    },
  );
  assert.equal(result.verdict, "exact-project");
});

test("matches the Stargate Abilene description when the project name spans the subject phrase", () => {
  const result = matchProject(
    "The first phase of Stargate’s flagship data center campus in Abilene, Texas, is now up and running on Oracle Cloud Infrastructure (OCI). At completion, the planned eight building campus will be able to support hundreds of thousands of GPUs.",
    {
      name: "Stargate Abilene",
      aliases: ["Stargate flagship data center campus"],
      city: "Abilene",
      state: "Texas",
    },
  );
  assert.equal(result.verdict, "exact-project");
});

test("matches DataBank Red Oak full and directory names from passage text", () => {
  const project = {
    name: "DataBank Red Oak Data Center",
    aliases: ["Red Oak Campus"],
    operator: "DataBank",
    location: "Red Oak, Texas",
    knownData: {
      operator: "DataBank",
      aliases: ["Red Oak Campus"],
      city: "Red Oak",
      state: "Texas",
    },
  };
  assert.equal(
    matchProject(
      "DataBank's Red Oak campus is located in Red Oak, Texas, and the operator expects phased development.",
      project,
    ).verdict,
    "exact-project",
  );
  assert.equal(
    matchProject(
      "Directory listing: Red Oak Campus in Red Oak, TX; developer: DataBank.",
      project,
    ).verdict,
    "exact-project",
  );
});

test("keeps Red Oak operator attribution sentence-local and follows the subject possessive", () => {
  const project = {
    name: "Red Oak Campus",
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };

  for (const passage of [
    "DataBank closed a $2 billion construction loan to fund its 300-acre Red Oak campus in Red Oak, Ellis County, Texas.",
    "DataBank secured financing for the company's 300-acre Red Oak campus in Red Oak, Ellis County, Texas.",
    "DataBank funded construction of their 300-acre Red Oak campus in Red Oak, Ellis County, Texas.",
  ]) {
    assert.equal(matchProject(passage, project).verdict, "exact-project", passage);
  }

  assert.equal(
    matchProject(
      "Compass Datacenters acquired land for its Red Oak campus in Red Oak, Ellis County, Texas.",
      project,
    ).verdict,
    "unrelated",
    "a different sentence subject is a conflicting operator even when the verb is not an operator verb",
  );
  assert.equal(
    matchProject(
      "According to a report from DataBank, Compass Datacenters acquired land for its Red Oak campus in Red Oak, Ellis County, Texas.",
      project,
    ).verdict,
    "unrelated",
    "a report source does not replace the different company subject",
  );
  assert.equal(
    matchProject(
      "Red Oak Campus is located in Red Oak, Ellis County, Texas. DataBank operates the facility.",
      project,
    ).verdict,
    "ambiguous",
    "a later sentence cannot attribute the preceding generic project mention to DataBank",
  );
  assert.equal(
    matchProject(
      "DataBank provided financing for the Red Oak campus in Red Oak, Ellis County, Texas.",
      project,
    ).verdict,
    "ambiguous",
    "financing a project does not establish that DataBank operates it",
  );
});

test("resolves the exact saved Red Oak announcement excerpt through shared identity policy", () => {
  const capture = readFileSync(
    new URL("../../../../diagnostics/red-oak-retrieval-canary-2026-10-01.json", import.meta.url),
  );
  // Pin the authentic historical capture; reconstructed or synthetic text is not a substitute.
  assert.equal(
    createHash("sha256").update(capture).digest("hex"),
    "16e89ae672a6082fac0319ed4a88bde57f02641d885cf492d4641fb923b1e91e",
  );
  const report = JSON.parse(capture.toString("utf8"));
  const candidate = report.sourceStates.normalizedCandidates.find((source) => source.usablePassage);
  assert.ok(candidate, "the saved canary must retain its usable announcement passage");
  assert.equal(candidate.passageExcerpt.length, 1500, "test only the saved excerpt, not unavailable captured remainder");

  const result = matchProject(candidate.passageExcerpt, report.project);
  assert.equal(result.verdict, "exact-project", result.reason);
  assert.equal(
    assessResearchProjectIdentity(candidate.passageExcerpt, {
      ...candidate,
      title: "prnewswire.com",
      exactProject: false,
    }, report.project),
    "exact-project",
    "the server/client identity entry point uses the same retained-passage rule",
  );

  const incomplete = candidate.passageExcerpt.replace(
    "DataBank , a leading provider of enterprise-class edge colocation, interconnection, and managed services, today announced the development of",
    "DataBank , a leading provider of enterprise-class edge colocation, interconnection, and managed services, today announced a press event before the development of",
  );
  assert.notEqual(matchProject(incomplete, report.project).verdict, "exact-project");
});

test("development-announcement attribution requires connected project wording and fails closed on conflicts", () => {
  const project = {
    name: "Red Oak Campus",
    aliases: ["DataBank Red Oak Campus", "DataBank Red Oak Data Center"],
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };
  const connectedAnnouncement = [
    "DataBank, a leading provider of enterprise-class edge colocation, interconnection, and managed services, today announced the development of a 480MW data center campus on 292 acres in Red Oak, TX.",
    'The South Dallas land will become home to the new "Red Oak Campus".',
  ].join(" ");
  assert.equal(matchProject(connectedAnnouncement, project).verdict, "exact-project");

  assert.equal(
    matchProject(
      connectedAnnouncement.replaceAll("DataBank", "Compass Datacenters"),
      project,
    ).verdict,
    "unrelated",
    "an announcement by a different operator is a conflict",
  );
  assert.equal(
    matchProject(
      connectedAnnouncement
        .replaceAll("Red Oak, TX", "Houston, TX")
        .replace('"Red Oak Campus".', '"Red Oak Campus" in Houston, TX.'),
      project,
    ).verdict,
    "unrelated",
    "a connected but conflicting project location remains unrelated",
  );
  assert.equal(
    matchProject(
      "DataBank announced development of a data center campus in Red Oak, TX. A separate South Creek Campus, not Red Oak Campus, is the project described.",
      project,
    ).verdict,
    "unrelated",
    "an explicit different-project statement cannot be overridden by operator-plus-location overlap",
  );
  assert.notEqual(
    matchProject(
      "PRNewswire mentions DataBank in its company description. Red Oak Campus is in Red Oak, TX.",
      project,
    ).verdict,
    "exact-project",
    "publisher/company mentions without a connected project-development statement do not establish identity",
  );
  assert.notEqual(
    matchProject(
      "DataBank's DFW1 headquarters is in Dallas, Texas. Red Oak Campus is in Red Oak, Texas.",
      project,
    ).verdict,
    "exact-project",
    "a separate facility identifier and location do not establish the requested campus",
  );
  const metadataOnlyPassage = "Red Oak Campus is located in Red Oak, Texas.";
  assert.equal(matchProject(metadataOnlyPassage, project).verdict, "ambiguous");
  assert.equal(
    assessResearchProjectIdentity(metadataOnlyPassage, {
      title: "Red Oak Campus",
      exactProject: true,
      identityRole: "operator",
    }, project),
    "ambiguous",
    "provider-supplied identity assertions and generic titles cannot establish identity",
  );
});

test("development-announcement attribution stays within the announced data-center-camp object", () => {
  const project = {
    name: "Red Oak Campus",
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };
  const providerMetadata = {
    title: "prnewswire.com",
    exactProject: true,
    identityRole: "operator",
  };
  for (const passage of [
    "DataBank announced the development of a warehouse with a press conference at Red Oak data center campus in Red Oak, Texas.",
    "DataBank announced the development of a data center campus hosting a conference at Red Oak Campus in Red Oak, Texas.",
    "DataBank announced the development of a logistics warehouse at a data center campus in Red Oak, Texas.",
    "DataBank announced the development of a data center campus in Red Oak, Texas, named South Creek Campus.",
    "DataBank announced the development of a data center campus in Red Oak, Texas; the development is called South Creek Campus.",
  ]) {
    assert.notEqual(matchProject(passage, project).verdict, "exact-project", passage);
    assert.notEqual(assessResearchProjectIdentity(passage, providerMetadata, project), "exact-project", passage);
  }
  const unrelatedDevelopment = [
    "DataBank, a leading provider, today announced the development of a warehouse venue in Red Oak, TX,",
    'next to the separate "Red Oak Campus" in Red Oak, TX.',
  ].join(" ");
  assert.equal(
    matchProject(unrelatedDevelopment, project).verdict,
    "ambiguous",
    "a location/name-token overlap must not convert a warehouse venue into the requested campus",
  );
  assert.equal(
    assessResearchProjectIdentity(unrelatedDevelopment, providerMetadata, project),
    "ambiguous",
    "provider assertions cannot turn an unrelated announced object into project evidence",
  );

  const differentNamedDevelopment = [
    "DataBank, a leading provider, today announced the development of a 480MW South Creek data center campus",
    "on 292 acres of land in Red Oak, TX.",
  ].join(" ");
  assert.equal(
    matchProject(differentNamedDevelopment, project).verdict,
    "ambiguous",
    "the requested city and a campus type cannot override another named development",
  );
  assert.equal(
    assessResearchProjectIdentity(differentNamedDevelopment, providerMetadata, project),
    "ambiguous",
  );

  const crossClauseName = [
    "DataBank, a leading provider, today announced the development of a 480MW data center campus in Houston, TX,",
    "while the Red Oak Campus is nearby in Red Oak, TX.",
  ].join(" ");
  assert.notEqual(
    matchProject(crossClauseName, project).verdict,
    "exact-project",
    "a campus name in a comparison clause cannot be attributed to a different announced object",
  );
  assert.notEqual(
    assessResearchProjectIdentity(crossClauseName, providerMetadata, project),
    "exact-project",
  );
});

test("campus identity does not collapse its buildings or other metro facilities into the campus", () => {
  const project = {
    name: "Red Oak Campus",
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };
  const passage = [
    "DataBank's Red Oak Campus is in Red Oak, Texas and is planned for up to eight separate two-story data center buildings.",
    "Its DFW1 headquarters is in Dallas, Texas, alongside six other metro facilities.",
  ].join(" ");
  assert.equal(matchProject(passage, project).verdict, "exact-project");
  assert.equal(
    assessResearchProjectIdentity(passage, {
      title: "Red Oak Campus",
      exactProject: true,
      identityRole: "operator",
    }, project),
    "exact-project",
    "candidate metadata and retained-passage matching share the server/client policy",
  );
});

test("DFW9, DFW10, and DFW11 resolve only as named facilities related to Red Oak Campus", () => {
  const project = {
    name: "Red Oak Campus",
    aliases: ["DataBank Red Oak Campus", "DataBank Red Oak Data Center"],
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };
  const cases = [
    [
      "DFW9",
      "DataBank's DFW9 building is part of the Red Oak Campus in Red Oak, Ellis County, Texas.",
    ],
    [
      "DFW10",
      "DataBank DFW10 is a building of the Red Oak Campus located in Red Oak, Ellis County, Texas.",
    ],
    [
      "DFW11",
      "The Red Oak Campus includes DFW11, operated by DataBank, in Red Oak, Ellis County, Texas.",
    ],
  ];
  for (const [identifier, passage] of cases) {
    const result = matchProject(passage, project);
    assert.equal(result.verdict, "related-facility", passage);
    assert.equal(result.facilityIdentifier, identifier);
    assert.equal(result.facilityScope, "building-or-facility");
    assert.equal(
      assessResearchProjectIdentity(passage, {
        exactProject: true,
        entityMatch: "exact",
        title: "Red Oak Campus",
      }, project),
      "related-facility",
      "provider identity metadata cannot upgrade the named building to the campus",
    );
  }

  assert.equal(
    matchProject(
      "The Red Oak Campus is located in Red Oak, Ellis County, Texas and is operated by DataBank.",
      project,
    ).verdict,
    "exact-project",
    "the explicit campus name with matching location and operator remains exact campus identity",
  );
});

test("DFW14, incidental facility mentions, and identity conflicts do not establish campus identity", () => {
  const project = {
    name: "Red Oak Campus",
    aliases: ["DataBank Red Oak Campus", "DataBank Red Oak Data Center"],
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };
  const dfw14Filing = [
    "Texas Department of Licensing and Regulation Project Details.",
    "Project Name: DataBank Red Oak - DFW14 Base Building; Facility Name: DB DFW14.",
    "Location Address: 3600 Batchler Road, Red Oak, Texas; Location County: Ellis.",
    "Owner Name: DB Data Center Red Oak, LLC.",
  ].join(" ");
  assert.notEqual(matchProject(dfw14Filing, project).verdict, "exact-project");
  assert.notEqual(matchProject(dfw14Filing, project).verdict, "related-facility");
  assert.equal(
    assessResearchProjectIdentity(dfw14Filing, {
      exactProject: true,
      entityMatch: "exact",
      title: "Red Oak Campus",
    }, project),
    "ambiguous",
    "a separate DFW14 owner and matching municipality do not establish or contradict a campus link",
  );

  for (const passage of [
    "DataBank operates DFW14 in Red Oak, Ellis County, Texas. The separate Red Oak Campus is in Dallas, Texas.",
    "DataBank operates DFW15 in Red Oak, Ellis County, Texas. The separate Red Oak Campus is in Dallas, Texas.",
    "DataBank's DFW9 filing mentions Red Oak Campus, but does not identify DFW9 as a building or part of that campus.",
    "DataBank's DFW9 building is part of the Red Oak Campus in Houston, Texas.",
    "The DFW10 building, owned by Compass, is part of DataBank's Red Oak Campus in Red Oak, Ellis County, Texas.",
    "DataBank's DFW9 building is part of the Red Oak Campus in Red Oak, Texas, but is explicitly not part of that campus.",
  ]) {
    assert.notEqual(matchProject(passage, project).verdict, "exact-project", passage);
    assert.notEqual(matchProject(passage, project).verdict, "related-facility", passage);
    const identityResult = assessResearchProjectIdentity(passage, {
      exactProject: true,
      entityMatch: "exact",
      title: "Red Oak Campus",
    }, project);
    assert.notEqual(identityResult, "exact-project", passage);
    assert.notEqual(identityResult, "related-facility", passage);
  }

  assert.notEqual(
    matchProject(
      "DataBank operates a DFW9 records filing in Red Oak, Texas.",
      { ...project, aliases: ["DataBank DFW9 Red Oak Campus"] },
    ).verdict,
    "exact-project",
    "a submitted alias and matching operator/location remain hints without a passage-level campus link",
  );
  assert.ok(["ambiguous", "unrelated"].includes(matchProject(
    "DataBank operates DFW9 facility in Texas.",
    project,
  ).verdict), "DFW9 plus DataBank without a campus relationship remains unresolved");
  assert.notEqual(
    assessResearchProjectIdentity(
      "DataBank operates a DFW9 records filing in Red Oak, Texas.",
      { exactProject: true, entityMatch: "exact", title: "DataBank DFW9 Red Oak Campus" },
      { ...project, aliases: ["DataBank DFW9 Red Oak Campus"] },
    ),
    "exact-project",
  );
  assert.equal(
    assessResearchProjectIdentity("DataBank operates DFW14 in Red Oak, Ellis County, Texas.", {
      exactProject: true,
      entityMatch: "exact",
      title: "Red Oak Campus",
    }, project),
    "ambiguous",
    "metadata alone cannot turn an incidental DataBank/DFW mention into project identity",
  );
});

test("Corgan navigation chrome beside the retained Vantage AZ1 name is not an operator conflict", () => {
  const project = {
    name: "Vantage Phoenix Campus (Goodyear, AZ)",
    operator: "Vantage Data Centers",
    location: "Goodyear, Maricopa County, Arizona",
    knownData: {
      operator: "Vantage Data Centers",
      city: "Goodyear",
      county: "Maricopa",
      state: "AZ",
    },
  };
  // This is the exact retained-page fragment around the captured navigation defect.
  const retainedPassage = "Vantage AZ1 Data Center Campus | Corgan Previous Slide Next Slide Close Projects Vantage AZ1 Data Center Campus Project Stats Location Goodyear, Arizona Size 144,046 SF Data Hall 56,293 SF Critical Load 16 MW";
  assert.match(retainedPassage, /slide next slide close projects/i);
  const trace = traceProjectMatch(retainedPassage, project);
  assert.equal(trace.resolver.verdict, "ambiguous");
  assert.match(trace.resolver.reason, /does not establish attribution to the requested operator/i);
  assert.deepEqual(
    trace.actors.filter((actor) => actor.actor === "Corgan").map((actor) => ({
      role: actor.role,
      admittedAsOperator: actor.admittedAsOperator,
      attributionRule: actor.attributionRule,
    })),
    [{
      role: "navigation-or-page-chrome",
      admittedAsOperator: false,
      attributionRule: "rejected-navigation-page-chrome-not-operator-attribution",
    }],
  );
});

test("project identity ignores navigation, publisher, grid-operator, and directory noise", () => {
  const awsProject = {
    name: "AWS Butts County Data Center Campus",
    operator: "Amazon Web Services",
    location: "Jackson, Butts County, Georgia",
  };
  const buttsNavigation = [
    "Explore Butts County’s many advantages here on our website.",
    "Home Butts County is the perfect solution for your business.",
  ].join(" ");
  const buttsTrace = traceProjectMatch(buttsNavigation, awsProject);
  assert.equal(buttsTrace.resolver.verdict, "ambiguous");
  assert.equal(buttsTrace.actors.some((actor) => actor.admittedAsOperator === true), false);
  assert.deepEqual(buttsTrace.secondaryReasons, []);

  const northwiseProject = {
    name: "IREN Sweetwater Campus",
    operator: "IREN (Iris Energy)",
    location: "Sweetwater, Nolan County, Texas",
  };
  const northwiseByline = [
    "IREN Sweetwater Site: Inside the 2GW AI Infrastructure Campus.",
    "By Northwise Research Team. GW is a measure of power capacity.",
  ].join(" ");
  const northwiseTrace = traceProjectMatch(northwiseByline, northwiseProject);
  assert.equal(northwiseTrace.actors.some((actor) =>
    /northwise|\bgw\b/i.test(actor.actor) && actor.admittedAsOperator === true), false);
  assert.notEqual(northwiseTrace.resolver.verdict, "unrelated");

  const ercotPassage = [
    "The IREN Sweetwater Campus is located in Sweetwater, Nolan County, Texas.",
    "ERCOT manages the large-load interconnection process for Texas.",
  ].join(" ");
  const ercotTrace = traceProjectMatch(ercotPassage, northwiseProject);
  assert.equal(ercotTrace.resolver.verdict, "exact-project");
  assert.equal(ercotTrace.actors.some((actor) =>
    /ercot/i.test(actor.actor) && actor.admittedAsOperator === true), false);

  const vantageProject = {
    name: "Vantage Phoenix Campus (Goodyear, AZ)",
    operator: "Vantage Data Centers",
    location: "Goodyear, Maricopa County, Arizona",
  };
  const az2Index = [
    "Vantage Data Centers (AZ2) Status Proposed City Goodyear County Maricopa State Arizona.",
    "Interconnection requests by transmission owner: Alberta Electric System Operator, Texas.",
  ].join(" ");
  const az2Trace = traceProjectMatch(az2Index, vantageProject);
  assert.notEqual(az2Trace.resolver.verdict, "exact-project");
  assert.equal(az2Trace.actors.some((actor) =>
    /alberta electric/i.test(actor.actor) && actor.admittedAsOperator === true), false);
  assert.equal(az2Trace.secondaryReasons.some((reason) => /Texas/.test(reason)), false);

  const contextualProject = {
    name: "Project Atlas",
    operator: "Atlas Compute",
    location: "Irving, Dallas County, Texas",
  };
  const validProjectEvidence = [
    "Market overview by Independent Research; Texas and Arizona are covered.",
    "Project Atlas is located in Irving, Dallas County, Texas, and Atlas Compute operates the facility.",
    "A separate project is planned in Portland, Maine.",
  ].join(" ");
  const validTrace = traceProjectMatch(validProjectEvidence, contextualProject);
  assert.equal(validTrace.resolver.verdict, "exact-project");
  assert.equal(validTrace.actors.some((actor) =>
    actor.actor === "atlas compute" && actor.admittedAsOperator === true), true);
  assert.equal(validTrace.secondaryReasons.some((reason) => /Maine|Portland/.test(reason)), false);
});

test("keeps Vantage AZ1 separate from AZ2 and Sweetwater 1 separate from Sweetwater 2", () => {
  const vantageAz1 = {
    name: "Vantage AZ1 Data Center Campus",
    facility: "AZ1",
    operator: "Vantage Data Centers",
    location: "Goodyear, Arizona",
  };
  const vantageAz1Text = "Vantage Data Centers owns and operates the Vantage AZ1 Data Center Campus in Goodyear, Arizona.";
  const vantageAz2Text = "Vantage Data Centers owns and operates the Vantage AZ2 Data Center Campus in Goodyear, Arizona.";
  assert.equal(traceProjectMatch(vantageAz1Text, vantageAz1).resolver.verdict, "exact-project");
  const az2AgainstAz1 = traceProjectMatch(vantageAz2Text, vantageAz1);
  assert.equal(az2AgainstAz1.resolver.verdict, "unrelated");
  assert.doesNotMatch(az2AgainstAz1.resolver.reason, /exact-project/i);

  const sweetwater1 = {
    name: "Sweetwater 1 Data Center",
    facility: "Sweetwater 1",
    operator: "IREN",
    location: "Sweetwater, Texas",
  };
  const sweetwater1Text = "IREN owns and operates Sweetwater 1 Data Center in Sweetwater, Texas.";
  const sweetwater2Text = "IREN owns and operates Sweetwater 2 Data Center in Sweetwater, Texas.";
  assert.equal(traceProjectMatch(sweetwater1Text, sweetwater1).resolver.verdict, "exact-project");
  const sweetwater2Against1 = traceProjectMatch(sweetwater2Text, sweetwater1);
  assert.equal(sweetwater2Against1.resolver.verdict, "unrelated");
  assert.doesNotMatch(sweetwater2Against1.resolver.reason, /exact-project/i);
});

test("corroborates submitted DFW facility identity only across retained text with matching project, operator, and location", () => {
  const project = {
    name: "Red Oak Campus",
    aliases: ["DataBank Red Oak Campus", "DataBank Red Oak Data Center"],
    location: "Red Oak, Ellis County, Texas",
    knownData: {
      operator: "DataBank",
      facilityIdentifiers: ["DFW9", "DFW10", "DFW11"],
      city: "Red Oak",
      county: "Ellis County",
      state: "Texas",
    },
  };
  const facilityPassage = "DataBank's DFW9 facility is located in Red Oak, Ellis County, Texas.";
  const projectPassage = "The Red Oak Campus was listed in a municipal development presentation.";
  assert.deepEqual(
    corroborateRelatedFacilityAcrossPassages([facilityPassage], project).identifiers,
    [],
    "DataBank, DFW9, and the requested city alone do not establish a Red Oak Campus relationship",
  );
  const corroborated = corroborateRelatedFacilityAcrossPassages(
    [facilityPassage, projectPassage],
    project,
  );
  assert.deepEqual(corroborated.identifiers, ["DFW9"]);
  assert.deepEqual(corroborated.conflictedIdentifiers, []);
  assert.equal(matchProject(facilityPassage, project).verdict, "ambiguous");
  assert.notEqual(matchProject(projectPassage, project).verdict, "exact-project");

  const operatorConflict = corroborateRelatedFacilityAcrossPassages([
    "Compass operates the DFW9 facility in Red Oak, Ellis County, Texas.",
    projectPassage,
  ], project);
  assert.deepEqual(operatorConflict.identifiers, []);
  assert.deepEqual(operatorConflict.conflictedIdentifiers, ["DFW9"]);

  const locationConflict = corroborateRelatedFacilityAcrossPassages([
    "DataBank's DFW9 facility is located in Houston, Harris County, Texas.",
    projectPassage,
  ], project);
  assert.deepEqual(locationConflict.identifiers, []);
  assert.deepEqual(locationConflict.conflictedIdentifiers, ["DFW9"]);

  const facilityOnly = corroborateRelatedFacilityAcrossPassages([
    "DataBank's DFW9 facility is operating at 300 MW.",
  ], project);
  assert.deepEqual(facilityOnly.identifiers, []);

  const unrelatedFacility = corroborateRelatedFacilityAcrossPassages([
    "DataBank operates DFW14 in Red Oak, Ellis County, Texas.",
    projectPassage,
  ], project);
  assert.deepEqual(unrelatedFacility.identifiers, []);
  assert.deepEqual(unrelatedFacility.conflictedIdentifiers, []);

  const unrelatedDfw15 = corroborateRelatedFacilityAcrossPassages([
    "DataBank operates DFW15 in Red Oak, Ellis County, Texas.",
    projectPassage,
  ], project);
  assert.deepEqual(unrelatedDfw15.identifiers, []);
});

test("recognizes an operator directly before a facility name and in the full requested name", () => {
  const location = {
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
  };
  const shortNameProject = {
    name: "Red Oak Campus",
    operator: "DataBank",
    ...location,
  };

  assert.equal(
    matchProject(
      "DataBank Red Oak Campus is located in Red Oak, Ellis County, Texas.",
      shortNameProject,
    ).verdict,
    "exact-project",
  );
  assert.equal(
    matchProject(
      "DATABANK Red Oak data center campus is located in Red Oak, Ellis County, Texas.",
      shortNameProject,
    ).verdict,
    "exact-project",
  );
  assert.equal(
    matchProject(
      "Red Oak Campus is located in Red Oak, Ellis County, Texas.",
      shortNameProject,
    ).verdict,
    "ambiguous",
    "generic requested names remain ambiguous without operator attribution",
  );

  assert.equal(
    matchProject(
      "DATABANK Red Oak Campus is located in Red Oak, Ellis County, Texas.",
      {
        name: "DataBank Red Oak Data Center Campus",
        operator: "DataBank",
        ...location,
      },
    ).verdict,
    "exact-project",
    "the matched full requested name can establish its embedded operator",
  );
  assert.equal(
    matchProject(
      "Other Operator Red Oak Campus is located in Red Oak, Ellis County, Texas.",
      shortNameProject,
    ).verdict,
    "unrelated",
    "a conflicting operator immediately before the facility name remains a conflict",
  );
  assert.equal(
    matchProject(
      "DataBank Red Oak Campus is located in Red Oak, Ellis County, Texas; the developer is Other Developer.",
      shortNameProject,
    ).verdict,
    "unrelated",
    "explicit conflicting developer attribution outranks the name-based operator match",
  );
});

test("a distinctive requested name can match its location without operator attribution", () => {
  const project = {
    name: "Project Kilby",
    operator: "DataBank",
    city: "Abilene",
    county: "Taylor County",
    state: "Texas",
  };

  assert.equal(
    matchProject(
      "Project Kilby campus is located in Abilene, Taylor County, Texas.",
      project,
    ).verdict,
    "exact-project",
  );
  assert.equal(
    matchProject(
      "DataBank Project Kilby is located in Abilene, Taylor County, Texas.",
      project,
    ).verdict,
    "exact-project",
  );
  assert.equal(
    matchProject(
      "Project Kilby campus is located in El Paso, Texas.",
      project,
    ).verdict,
    "unrelated",
  );
  assert.equal(
    matchProject(
      "Other Operator develops Project Kilby in Abilene, Taylor County, Texas.",
      project,
    ).verdict,
    "unrelated",
  );
});

test("requires expected-operator attribution unless the requested project name is distinctive", () => {
  const project = {
    name: "Aster Northstar Campus",
    operator: "Northstar Infrastructure",
    location: "Cedar County, Iowa",
    knownData: { operator: "Northstar Infrastructure", county: "Cedar County", state: "Iowa" },
  };
  for (const passage of [
    "Different Operator develops Aster Northstar Campus in Cedar County, Iowa.",
    "Different Operator will develop Aster Northstar Campus in Cedar County, Iowa.",
    "Different Operator intends to construct Aster Northstar Campus in Cedar County, Iowa.",
    "Northstar Energy develops Aster Northstar Campus in Cedar County, Iowa.",
    "Different Operator operates Aster Northstar Campus in Cedar County, Iowa.",
    "Aster Northstar Campus in Cedar County, Iowa is owned by Different Operator.",
    "Different Operator is constructing Aster Northstar Campus in Cedar County, Iowa.",
  ]) {
    const result = matchProject(passage, project);
    assert.equal(result.verdict, "unrelated", passage);
    assert.match(result.reason, /operator|developer/i);
  }

  assert.equal(
    matchProject(
      "Aster Northstar Campus is located in Cedar County, Iowa. Different Operator operates the facility.",
      project,
    ).verdict,
    "exact-project",
    "a different operator in a later sentence does not contradict the distinctive project mention",
  );

  for (const passage of [
    "Northstar Infrastructure develops Aster Northstar Campus in Cedar County, Iowa.",
    "Northstar Infrastructure will develop Aster Northstar Campus in Cedar County, Iowa.",
    "Aster Northstar Campus in Cedar County, Iowa is operated by Northstar Infrastructure.",
    "Aster Northstar Campus is located in Cedar County, Iowa. Northstar Infrastructure operates the facility.",
  ]) {
    const result = matchProject(passage, {
      ...project,
      operator: "Northstar Infrastructure",
    });
    assert.equal(result.verdict, "exact-project", passage);
  }

  assert.equal(
    matchProject(
      "Aster Northstar Campus is located in Cedar County, Iowa.",
      project,
    ).verdict,
    "exact-project",
    "a distinctive requested name and matching location can establish identity without operator attribution",
  );
});

test("rejects a Compass identity conflict and a Red Oak passage in Iowa", () => {
  const compassProject = {
    name: "Red Oak Campus",
    operator: "Compass",
    location: "Red Oak, Texas",
    knownData: { operator: "Compass", city: "Red Oak", state: "Texas" },
  };
  assert.equal(
    matchProject(
      "DataBank's Red Oak campus is located in Red Oak, Texas, and DataBank is the developer.",
      compassProject,
    ).verdict,
    "unrelated",
  );
  assert.equal(
    matchProject(
      "The Red Oak campus is located in Red Oak, Iowa, and DataBank operates the facility.",
      {
        name: "Red Oak Campus",
        operator: "DataBank",
        location: "Red Oak, Texas",
        knownData: { operator: "DataBank", city: "Red Oak", state: "Texas" },
      },
    ).verdict,
    "unrelated",
  );
});

test("a one-word alias without operator or requested location remains ambiguous", () => {
  assert.equal(
    matchProject(
      "Project Cedar is preparing its next development phase.",
      { name: "Project Cedar", aliases: ["Cedar"] },
    ).verdict,
    "ambiguous",
  );
});

test("returns unrelated when a named project has a conflicting attached location", () => {
  const result = matchProject(
    "Project Atlas is located in Houston, Harris County, Texas.",
    scenarioProjects.texas,
  );
  assert.equal(result.verdict, "unrelated");
  assert.match(result.reason, /Houston|Harris County/i);
});

test("treats a project planned for a conflicting location as unrelated", () => {
  const result = matchProject(
    "Aster Northstar Campus is planned for Dayton, Ohio and is unrelated to the Iowa development.",
    {
      name: "Aster Northstar Campus",
      location: "Cedar County, Iowa",
      knownData: { operator: "Northstar Infrastructure", state: "Iowa" },
    },
  );
  assert.equal(result.verdict, "unrelated");
});

test("returns ambiguous when the project name appears without requested location evidence", () => {
  const result = matchProject(
    "Project Atlas is preparing its next development phase.",
    scenarioProjects.texas,
  );
  assert.equal(result.verdict, "ambiguous");
  assert.match(result.reason, /does not establish/i);
});

test("accepts punctuation and possessive differences in project names", () => {
  const result = matchProject(
    "Atlas-Compute Campus’s facility is located in Irving, Texas.",
    {
      name: "Atlas Compute Campus",
      city: "Irving",
      state: "Texas",
    },
  );
  assert.equal(result.verdict, "exact-project");
});

test("does not treat a quote missing from the document as verified", () => {
  assert.equal(
    verifyQuote(
      "The release describes the first phase in Abilene as operational.",
      "The first phase can support hundreds of thousands of GPUs.",
    ),
    false,
  );
});