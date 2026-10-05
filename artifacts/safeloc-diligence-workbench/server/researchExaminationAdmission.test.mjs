import assert from "node:assert/strict";
import test from "node:test";
import { assessResearchPassageExaminationEligibility, assessResearchProjectIdentity } from "../src/data/researchIdentity.mjs";
import { parseLocations } from "../src/data/researchClaimVerifier.mjs";
import { buildResearchCategoryPlan, replayResearchCategoryPassageInput } from "./researchProjectProxy.mjs";
import { project, permitPassage, permitSource } from "./fixtures/syntheticExaminationPermit.mjs";

const categories = buildResearchCategoryPlan(project).categories;
const replay = (id, source = permitSource) =>
  replayResearchCategoryPassageInput(project, categories.find((category) => category.categoryId === id), [source]);

test("synthetic label/value permit reaches examination, not project identity proof", () => {
  const admission = assessResearchPassageExaminationEligibility(permitPassage, project);
  assert.equal(admission.eligible, true);
  assert.equal(admission.reason, "scope-unconfirmed");
  assert.ok(admission.basis.includes("requested-operator"));
  assert.ok(admission.basis.includes("requested-city"));
  assert.notEqual(assessResearchProjectIdentity(permitPassage, {}, project), "exact-project");
  for (const id of ["project-identity", "construction-capital"]) {
    const result = replay(id);
    assert.equal(result.decisions[0].included, true);
    assert.equal(result.decisions[0].routeState, "matched-by-examination-eligibility");
    assert.equal(result.decisions[0].routeReason, "category-context-included-for-examination-scope-unconfirmed");
    assert.equal(result.decisions[0].identityScope, "scope-unconfirmed");
  }
  const water = replay("water");
  assert.equal(water.decisions[0].included, false);
  assert.equal(water.decisions[0].routeReason, "passage-lacks-category-subject-matter");
});

test("law-firm and other-city pages are excluded from every category without invented routes", () => {
  for (const passage of [
    "Our law firm in Red Oak, Ellis County, Texas handles building applications and estate planning for local residents.",
    "DataBank operates a data center facility in Plano, Texas. The building construction schedule is described in this application.",
  ]) {
    const source = { ...permitSource, accessOutcome: { ...permitSource.accessOutcome, passage } };
    for (const category of categories) {
      const result = replay(category.categoryId, source);
      assert.equal(result.decisions[0].included, false, `${category.categoryId}: ${passage}`);
      assert.notEqual(result.decisions[0].routeReason, "source-has-no-route-to-requested-category");
    }
  }
});

test("examination supports distinctive names and aliases, but not generic city-named projects or explicit conflicts", () => {
  assert.equal(assessResearchPassageExaminationEligibility("Red Oak campus project building in Red Oak, Texas.", project).eligible, false);
  assert.equal(assessResearchPassageExaminationEligibility("Zephyr development in Red Oak, Texas.", { ...project, name: "Zephyr Campus" }).eligible, true);
  assert.equal(assessResearchPassageExaminationEligibility("Bluebird facility in Red Oak, Texas.", { ...project, aliases: ["Bluebird"] }).eligible, true);
  assert.equal(assessResearchPassageExaminationEligibility(
    "Zephyr Campus is located in Plano, Texas, not in Red Oak, Ellis County, Texas.",
    { ...project, name: "Zephyr Campus" },
  ).eligible, false);
  assert.equal(assessResearchPassageExaminationEligibility(
    "Zephyr Campus is located in Red Oak, Ellis County, Texas and is operated by Different Operator.",
    { ...project, name: "Zephyr Campus" },
  ).eligible, false);
});

test("label/value line boundaries never invent a Red Oak County location", () => {
  const locations = parseLocations("City: Red Oak\nCounty: Ellis\nState: Texas");
  assert.equal(locations.some((location) => location.county === "Red Oak County"), false);
  assert.ok(parseLocations("Red Oak, Ellis County, Texas").some((location) => location.county === "Ellis County"));
});

test("explicit category labels are not broadened by examination and keep unchecked scope", () => {
  const labeled = { ...permitSource, categoryIds: ["construction-capital"] };
  assert.equal(replay("water", labeled).decisions[0].included, false);
  const construction = replay("construction-capital", labeled);
  assert.equal(construction.decisions[0].identityScope, "route-labeled-identity-unchecked");
});