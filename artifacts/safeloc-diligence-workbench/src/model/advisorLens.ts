import {
  MATERIAL_EVIDENCE_IDS,
  type Classification,
} from "./cashFlowEngine";

export type AdvisorQuestion = {
  id: string;
  question: string;
  evidenceId: string;
  activeDetail: string;
};

export type ClassifiedEvidence = {
  classification: Classification;
  modelClassification?: Classification;
};

export type AdvisorEvidenceSummary = {
  materialTotal: number;
  materialVerifiedCount: number;
  materialGapCount: number;
  materialMissingCount: number;
  verifiedCount: number;
  totalInputCount: number;
};

export type PrioritizedAdvisorQuestion = AdvisorQuestion & {
  index: number;
  classification?: Classification;
};

export type EvidenceCompletenessTier = "HIGH" | "MODERATE" | "LOW";

export const CLASSIFICATION_STRENGTH: Record<Classification, number> = {
  "Missing Evidence": 0,
  "User Assumption": 1,
  "Model Inference": 2,
  "Management Assertion": 3,
  "Verified Evidence": 4,
};

export const ADVISOR_QUESTIONS: AdvisorQuestion[] = [
  {
    id: "water-rights",
    question: "What evidence would make the water allocation risk investable rather than merely disclosed?",
    evidenceId: "water_rights",
    activeDetail: "Missing evidence: request allocation seniority, drought curtailment terms, and a legal rights opinion before treating this risk as investable.",
  },
  {
    id: "energization",
    question: "What does the cancelled Abilene expansion imply for grid-delay underwriting across the portfolio?",
    evidenceId: "grid_interconnection",
    activeDetail: "If the verified cancellation is reclassified, request ERCOT and utility queue milestones plus a downside case for delays beyond 12 months.",
  },
  {
    id: "renewable-procurement",
    question: "What share of Stargate Abilene power is physically supplied by local wind rather than ERCOT or on-site gas?",
    evidenceId: "renewable_percentage",
    activeDetail: "Clarify the provenance of the renewable claim and distinguish physical delivery from certificate-based coverage.",
  },
  {
    id: "customer-concentration",
    question: "How should a reported 15-year Oracle lease and concentrated GPU demand affect counterparty underwriting?",
    evidenceId: "customer_concentration",
    activeDetail: "Request the executed lease schedule, capacity ramp, remedies, and renewal terms before treating public reporting as a complete credit file.",
  },
  {
    id: "climate-hazard",
    question: "What site-level climate hazard assessment has been conducted for facilities in water-stressed or extreme-heat regions, and what adaptation investments are planned?",
    evidenceId: "site_hazard_exposure",
    activeDetail: "The site hazard profile is not verified: request a facility-level CRVA, resilience thresholds, and funded adaptation plans for drought and extreme heat.",
  },
];

export function countVerifiedEvidence(evidence: Record<string, ClassifiedEvidence>) {
  return Object.values(evidence).filter((item) => item.classification === "Verified Evidence").length;
}

const MATERIAL_SUFFICIENT_CLASSIFICATIONS: readonly Classification[] = [
  "Verified Evidence",
  "Management Assertion",
];

export function getAdvisorEvidenceSummary(
  evidence: Record<string, ClassifiedEvidence>,
): AdvisorEvidenceSummary {
  const materialEvidence = MATERIAL_EVIDENCE_IDS
    .map((id) => evidence[id])
    .filter((item): item is ClassifiedEvidence => item !== undefined);
  const isMateriallySufficient = (item: ClassifiedEvidence) =>
    MATERIAL_SUFFICIENT_CLASSIFICATIONS.includes(item.classification);

  return {
    materialTotal: materialEvidence.length,
    materialVerifiedCount: materialEvidence.filter(isMateriallySufficient).length,
    materialGapCount: materialEvidence.filter((item) => !isMateriallySufficient(item)).length,
    materialMissingCount: materialEvidence.filter(
      (item) => item.classification === "Missing Evidence",
    ).length,
    verifiedCount: countVerifiedEvidence(evidence),
    totalInputCount: Object.keys(evidence).length,
  };
}

export function getEvidenceCompletenessTier(
  summary: Pick<
    AdvisorEvidenceSummary,
    "materialTotal" | "materialVerifiedCount" | "materialMissingCount"
  >,
): EvidenceCompletenessTier {
  if (summary.materialTotal === 0 || summary.materialVerifiedCount * 2 < summary.materialTotal) {
    return "HIGH";
  }
  if (
    summary.materialVerifiedCount === summary.materialTotal &&
    summary.materialMissingCount === 0
  ) {
    return "LOW";
  }
  return "MODERATE";
}

export function prioritizeAdvisorQuestions(
  evidence: Record<string, ClassifiedEvidence>,
): PrioritizedAdvisorQuestion[] {
  return ADVISOR_QUESTIONS
    .map((question, index) => ({
      ...question,
      index,
      classification:
        evidence[question.evidenceId]?.modelClassification ??
        evidence[question.evidenceId]?.classification,
    }))
    .sort((a, b) => {
      const aStrength = a.classification === undefined ? -1 : CLASSIFICATION_STRENGTH[a.classification];
      const bStrength = b.classification === undefined ? -1 : CLASSIFICATION_STRENGTH[b.classification];
      return aStrength - bStrength || a.index - b.index;
    });
}

export function getAdvisorQuestionPresentation(
  questionId: string,
  classification?: Classification,
) {
  const isWaterGap = questionId === "water-rights" && classification === "Missing Evidence";
  const isEnergizationGap = questionId === "energization" && classification !== "Verified Evidence";
  const isClimateGap = questionId === "climate-hazard" && classification !== "Verified Evidence";

  return {
    isWaterGap,
    isEnergizationGap,
    isClimateGap,
    isActiveGap: isWaterGap || isEnergizationGap || isClimateGap || classification === "Missing Evidence",
    showDetail: isWaterGap || isEnergizationGap || isClimateGap,
  };
}

export function getGovernanceIRRGap(
  baseIRR: number | null | undefined,
  currentIRR: number | null | undefined,
) {
  if (
    baseIRR === null ||
    baseIRR === undefined ||
    currentIRR === null ||
    currentIRR === undefined ||
    !Number.isFinite(baseIRR) ||
    !Number.isFinite(currentIRR)
  ) {
    return null;
  }
  return baseIRR - currentIRR;
}