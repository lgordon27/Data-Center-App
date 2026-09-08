import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_AGREEMENTS,
  COMMUNITY_NOT_FOUND_TEXT,
  COMMUNITY_SNAPSHOT,
  COMMUNITY_TERM_DEFINITIONS,
  COMMUNITY_TERM_IDS,
} from "@/data/communityAgreements";
import {
  countUnresolvedCommunityTerms,
  createCommunityReview,
  matchCommunityProject,
  normalizeCommunityJurisdiction,
  normalizeCommunityName,
  selectCommunityComparisons,
} from "@/model/communityAgreements";

test("keeps the complete attributed benchmark snapshot locally", () => {
  assert.equal(COMMUNITY_SNAPSHOT.records.length, 15);
  assert.equal(COMMUNITY_AGREEMENTS.length, 15);
  assert.equal(COMMUNITY_TERM_DEFINITIONS.length, 10);
  for (const agreement of COMMUNITY_AGREEMENTS) {
    assert.match(agreement.sourceUrl, /^https?:\/\//);
    assert.match(agreement.originalDocumentUrl, /^https?:\/\//);
    assert.ok(agreement.excerpt.length > 20);
    assert.ok(agreement.pageOrSection.length > 0);
    assert.ok(agreement.licensing.length > 0);
    for (const id of COMMUNITY_TERM_IDS) {
      assert.ok(agreement.terms[id]);
      assert.ok(["MET", "SHORT", "Unknown"].includes(agreement.terms[id].externalBenchmark));
    }
  }
});

test("normalizes company and Texas jurisdiction labels", () => {
  assert.equal(normalizeCommunityName("City of Abilene / Oracle, Inc."), "abilene oracle");
  assert.equal(normalizeCommunityJurisdiction("Taylor County, TX"), "taylor county texas");
});

test("keeps Stargate Abilene related to, not direct with, the Abilene record", () => {
  const match = matchCommunityProject({
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
  });
  assert.equal(match.relationship, "Related");
  assert.equal(match.humanReviewStatus, "needs-review");
  assert.ok(match.supportingEvidence.some((evidence) => evidence.includes("pending attributable")));
});

test("supports Direct only when the supplied identity matches the agreement record", () => {
  const match = matchCommunityProject({
    kind: "custom",
    name: "City of Abilene / Oracle / OpenAI",
    location: "Abilene, Texas",
  });
  assert.equal(match.relationship, "Direct");
  assert.equal(match.confidence, 99);
});

test("uses the exact unresolved wording for unmatched Texas projects", () => {
  const match = matchCommunityProject({
    kind: "custom",
    name: "Project Cedar",
    location: "Hays County, Texas",
  });
  assert.equal(match.relationship, "Not found");
  assert.equal(match.notFoundText, COMMUNITY_NOT_FOUND_TEXT);
  assert.ok(!match.supportingEvidence.some((evidence) => evidence.includes("does not exist")));
});

test("keeps comparisons bounded and national records comparable-only", () => {
  const comparisons = selectCommunityComparisons("community-fund");
  assert.ok(comparisons.length <= 3);
  assert.ok(comparisons.every((agreement) => agreement.relationship === "Comparable"));
});

test("initial community terms remain unresolved and do not imply financial changes", () => {
  const review = createCommunityReview({
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
  });
  assert.equal(Object.keys(review.terms).length, 10);
  assert.equal(countUnresolvedCommunityTerms(review.terms), 10);
  assert.ok(Object.values(review.terms).every((term) => term.treatment));
});