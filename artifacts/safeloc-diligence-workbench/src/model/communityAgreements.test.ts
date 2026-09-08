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
    assert.ok(agreement.sourceTitle.length > 0);
    assert.ok(agreement.sourceSummary.length > 20);
    assert.ok(agreement.licensing.length > 0);
    for (const id of COMMUNITY_TERM_IDS) {
      assert.ok(agreement.terms[id]);
      assert.ok(["MET", "SHORT", "UNKNOWN", "Not applicable"].includes(agreement.terms[id].benchmarkStatus));
      assert.equal(agreement.terms[id].sourceExactQuote, null);
      if (agreement.id === "us-tx-abilene-2025") {
        assert.match(agreement.terms[id].sourceSummary, /records/i);
      } else {
        assert.equal(agreement.terms[id].benchmarkStatus, "UNKNOWN");
        assert.equal(agreement.terms[id].sourceRecordUrl, null);
        assert.match(agreement.terms[id].sourceSummary, /No verified source record/i);
      }
    }
  }
});

test("reproduces the ten Abilene benchmark statuses exactly and keeps links honest", () => {
  const abilene = COMMUNITY_AGREEMENTS[0];
  assert.equal(abilene.id, "us-tx-abilene-2025");
  assert.equal(abilene.sourceRecordUrl, "https://futurepickleballcourt.com/#us-tx-abilene-2025");
  assert.equal(abilene.primaryDocumentUrl, null);
  assert.ok(Object.values(abilene.terms).every((term) => term.relationshipType === "unverified" && term.relationshipConfidence === 0));
  assert.deepEqual(Object.fromEntries(COMMUNITY_TERM_IDS.map((id) => [id, abilene.terms[id].benchmarkStatus])), {
    "community-fund": "SHORT",
    clawbacks: "SHORT",
    "decommissioning-security": "SHORT",
    "grid-cost-allocation": "SHORT",
    "water-commitments": "SHORT",
    "noise-protections": "UNKNOWN",
    "binding-jobs": "MET",
    "local-contracting-road-repair": "UNKNOWN",
    "transparency-auditability": "SHORT",
    "tax-incentives": "UNKNOWN",
  });
  assert.equal(COMMUNITY_AGREEMENTS.some((agreement) => agreement.sourceRecordUrl?.includes("/agreements/")), false);
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
  assert.match(match.relationshipReasoning, /scope remains unverified/i);
  assert.ok(match.canonicalRelationships.some((relationship) => relationship.toLabel === "Lancium Clean Campus" && relationship.relationshipType === "co-mentioned-in-source" && relationship.verificationStatus === "source-supported"));
  assert.ok(match.canonicalRelationships.some((relationship) => relationship.toLabel === "Oracle / OpenAI participation" && relationship.relationshipType === "co-mentioned-in-source"));
  assert.ok(match.canonicalRelationships.every((relationship) => relationship.relationshipType !== "contractual-relationship" || relationship.toLabel.includes("cancelled")));
  assert.ok(match.canonicalRelationships.some((relationship) => relationship.toLabel.includes("Adjacent") && relationship.verificationStatus === "unverified"));
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

test("does not promote keyword-overlapping custom projects to Direct", () => {
  const match = matchCommunityProject({
    kind: "custom",
    name: "City of Abilene / Oracle / OpenAI Phase 2",
    location: "Abilene, Texas",
  });
  assert.notEqual(match.relationship, "Direct");
  assert.equal(match.agreementId, null);
  assert.equal(match.humanReviewStatus, "needs-review");
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
  assert.equal(comparisons.length, 0);
  assert.ok(COMMUNITY_AGREEMENTS.slice(1).every((agreement) => Object.values(agreement.terms).every((term) => term.benchmarkStatus === "UNKNOWN")));
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
  assert.ok(Object.values(review.terms).every((term) => term.sourceValidation?.eligibilityState === "context-only"));
  assert.ok(Object.values(review.terms).every((term) => term.sourceValidation?.passageState === "absent"));
});

test("analyst review state cannot mutate imported benchmark facts", () => {
  const before = JSON.stringify(COMMUNITY_AGREEMENTS[0].terms);
  const review = createCommunityReview({
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
  });
  review.terms["community-fund"].conclusion = "Present";
  review.terms["community-fund"].classification = "Model Inference";
  assert.equal(JSON.stringify(COMMUNITY_AGREEMENTS[0].terms), before);
  assert.equal(COMMUNITY_AGREEMENTS[0].terms["community-fund"].benchmarkStatus, "SHORT");
});