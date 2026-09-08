import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCommunityTerms } from "@/services/communityAgreementService";

test("community AI analysis is a bounded proposal over supplied snapshot evidence", async () => {
  const result = await analyzeCommunityTerms({
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
  });
  assert.equal(result.status, "success");
  assert.equal(result.relationship.relationship, "Related");
  assert.equal(result.terms.length, 10);
  assert.ok(result.terms.every((term) => term.reasoning.includes("human review")));
});

test("unmatched projects receive missing-evidence proposals instead of inferred facts", async () => {
  const result = await analyzeCommunityTerms({
    kind: "custom",
    name: "Project Cedar",
    location: "Hays County, Texas",
  });
  assert.ok(result.terms.every((term) => term.proposedConclusion === "Unknown"));
  assert.ok(result.terms.every((term) => term.proposedClassification === "Missing Evidence"));
  assert.ok(result.terms.every((term) => term.sourceSupport.includes("No project-specific")));
});