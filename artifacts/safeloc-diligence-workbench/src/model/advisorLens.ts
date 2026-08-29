import type { Classification } from "./cashFlowEngine";

export type AdvisorQuestion = {
  id: string;
  question: string;
  evidenceId: string;
  activeDetail: string;
};

export type ClassifiedEvidence = {
  classification: Classification;
};

export type PrioritizedAdvisorQuestion = AdvisorQuestion & {
  index: number;
  classification?: Classification;
};

export type RiskTier = "HIGH" | "MODERATE" | "LOW";

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
    question: "How does the manager price a 9–12 month energization slip into the underwriting hurdle?",
    evidenceId: "grid_interconnection",
    activeDetail: "Grid interconnection is not verified: ask for the utility queue position, milestone evidence, and downside case for a delayed energization date.",
  },
  {
    id: "renewable-procurement",
    question: "Is 100% renewable procurement a physical PPA, a bundled certificate, or an aspiration?",
    evidenceId: "renewable_percentage",
    activeDetail: "Clarify the provenance of the renewable claim and distinguish physical delivery from certificate-based coverage.",
  },
  {
    id: "customer-concentration",
    question: "Where does customer concentration become a public-market governance signal?",
    evidenceId: "customer_concentration",
    activeDetail: "Revenue concentration is an evidence gap: request the lease schedule and renewal terms before assessing the governance signal.",
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

export function getRiskTier(verifiedCount: number): RiskTier {
  if (verifiedCount < 4) return "HIGH";
  if (verifiedCount <= 8) return "MODERATE";
  return "LOW";
}

export function prioritizeAdvisorQuestions(
  evidence: Record<string, ClassifiedEvidence>,
): PrioritizedAdvisorQuestion[] {
  return ADVISOR_QUESTIONS
    .map((question, index) => ({
      ...question,
      index,
      classification: evidence[question.evidenceId]?.classification,
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
  return Number((baseIRR - currentIRR).toFixed(1));
}