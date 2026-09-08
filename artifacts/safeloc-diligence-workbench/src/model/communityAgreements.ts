import {
  COMMUNITY_AGREEMENTS,
  COMMUNITY_NOT_FOUND_TEXT,
  COMMUNITY_TERM_DEFINITIONS,
  type CommunityAgreementRecord,
  type CommunityConclusion,
  type CommunityHumanStatus,
  type CommunityRelationship,
  type CommunityTermId,
  type CommunityTreatment,
} from "@/data/communityAgreements";

export type CommunityProjectInput = {
  name: string;
  location: string;
  kind: "curated" | "custom";
};

export type CommunityRelationshipResult = {
  relationship: CommunityRelationship;
  agreementId: string | null;
  confidence: number;
  matchingFields: string[];
  supportingEvidence: string[];
  humanReviewStatus: "needs-review" | "reviewed";
  notFoundText?: string;
};

export type CommunityTermDecision = {
  id: CommunityTermId;
  conclusion: CommunityConclusion;
  classification: "Verified Evidence" | "Management Assertion" | "Model Inference" | "Missing Evidence" | "Not applicable";
  treatment: CommunityTreatment;
  humanStatus: CommunityHumanStatus;
  reviewedAt?: string;
  reviewerNote?: string;
};

export type CommunityReviewState = {
  version: 1;
  relationship: CommunityRelationshipResult;
  terms: Record<CommunityTermId, CommunityTermDecision>;
  lastAction?: {
    termId: CommunityTermId;
    status: CommunityHumanStatus;
    recordedAt: string;
  };
};

export function normalizeCommunityName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(city of|county of|llc|inc|corp|corporation|company)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCommunityJurisdiction(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(texas|tx)\b/g, "texas")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchCommunityProject(project: CommunityProjectInput): CommunityRelationshipResult {
  const location = normalizeCommunityJurisdiction(project.location);
  const name = normalizeCommunityName(project.name);
  const abilene = COMMUNITY_AGREEMENTS[0];
  const isAbilene = location.includes("texas") && name.includes("stargate abilene");
  const isDirectAbileneRecord = location.includes("texas") &&
    name.includes("abilene") &&
    name.includes("oracle") &&
    name.includes("openai");
  if (isAbilene) {
    return {
      relationship: "Related",
      agreementId: abilene.id,
      confidence: 94,
      matchingFields: ["Texas jurisdiction", "Abilene municipality", "Oracle / OpenAI project operators"],
      supportingEvidence: [
        "Stargate Abilene is the curated project under review.",
        "The benchmark record is a City of Abilene / Oracle / OpenAI agreement record.",
        "Relationship is related context pending attributable project-specific agreement evidence.",
      ],
      humanReviewStatus: "needs-review",
    };
  }
  if (isDirectAbileneRecord) {
    return {
      relationship: "Direct",
      agreementId: abilene.id,
      confidence: 99,
      matchingFields: ["Texas jurisdiction", "Abilene municipality", "Oracle / OpenAI project operators", "Exact agreement identity"],
      supportingEvidence: ["The supplied project identity matches the benchmark record identity; a reviewer must still confirm the attributable project document."],
      humanReviewStatus: "needs-review",
    };
  }
  if (location.includes("texas")) {
    return {
      relationship: "Not found",
      agreementId: null,
      confidence: 72,
      matchingFields: ["Texas jurisdiction"],
      supportingEvidence: ["No record matched the supplied project identity and Texas jurisdiction in the reviewed snapshot."],
      humanReviewStatus: "needs-review",
      notFoundText: COMMUNITY_NOT_FOUND_TEXT,
    };
  }
  return {
    relationship: "Not found",
    agreementId: null,
    confidence: 40,
    matchingFields: [],
    supportingEvidence: ["The Texas-first matcher does not claim coverage outside Texas."],
    humanReviewStatus: "needs-review",
    notFoundText: COMMUNITY_NOT_FOUND_TEXT,
  };
}

export function initialCommunityTermDecisions(agreement?: CommunityAgreementRecord): Record<CommunityTermId, CommunityTermDecision> {
  return Object.fromEntries(COMMUNITY_TERM_DEFINITIONS.map((definition) => [
    definition.id,
    {
      id: definition.id,
      conclusion: "Unknown",
      classification: "Missing Evidence",
      treatment: definition.treatment,
      humanStatus: "unresolved",
    },
  ])) as Record<CommunityTermId, CommunityTermDecision>;
}

export function selectCommunityComparisons(termId: CommunityTermId, limit = 3) {
  return COMMUNITY_AGREEMENTS
    .slice(1)
    .filter((agreement) => agreement.terms[termId].externalBenchmark !== "Unknown")
    .sort((a, b) => {
      const aScore = a.terms[termId].externalBenchmark === "MET" ? 2 : 1;
      const bScore = b.terms[termId].externalBenchmark === "MET" ? 2 : 1;
      return bScore - aScore || a.id.localeCompare(b.id);
    })
    .slice(0, limit)
    .map((agreement) => ({ ...agreement, relationship: "Comparable" as const }));
}

export function countUnresolvedCommunityTerms(decisions: Record<CommunityTermId, CommunityTermDecision>) {
  return Object.values(decisions).filter((decision) => decision.humanStatus === "unresolved" || decision.conclusion === "Unknown").length;
}

export function createCommunityReview(project: CommunityProjectInput) {
  const relationship = matchCommunityProject(project);
  const agreement = relationship.agreementId ? COMMUNITY_AGREEMENTS.find((record) => record.id === relationship.agreementId) : undefined;
  return { version: 1 as const, relationship, terms: initialCommunityTermDecisions(agreement) };
}