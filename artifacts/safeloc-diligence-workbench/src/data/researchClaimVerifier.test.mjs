import assert from "node:assert/strict";
import test from "node:test";

import { matchProject, parseLocations, verifyQuote } from "./researchClaimVerifier.mjs";

test("verifies an exact quote and allows only requested typographic normalization", () => {
  assert.equal(verifyQuote(
    "The filing states, “The first phase is now operating — with 24,000 GPUs.”",
    '"The first phase is now operating - with 24,000 GPUs."',
  ), true);
  assert.equal(verifyQuote(
    "A report says ‘the site is ready’.",
    "'the site is ready'",
  ), true);
  assert.equal(verifyQuote("The site is operating at 100 MW.", "The site is operating at 101 MW."), false);
  assert.equal(verifyQuote("The site is operating at 100 MW.", ""), false);
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
    "Project Atlas is located in Irving, Dallas County, Texas, compared with a similar data center in Atlanta, Georgia.",
    scenarioProjects.texas,
  );
  assert.equal(result.verdict, "exact-project");
  assert.match(result.reason, /city|county|state/i);
});

test("does not confuse Washington County with the state of Washington", () => {
  const result = matchProject(
    "The Washington County campus is in West Virginia.",
    {
      name: "Washington County Campus",
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

test("returns unrelated when a named project has a conflicting attached location", () => {
  const result = matchProject(
    "Project Atlas is located in Houston, Harris County, Texas.",
    scenarioProjects.texas,
  );
  assert.equal(result.verdict, "unrelated");
  assert.match(result.reason, /Houston|Harris County/i);
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