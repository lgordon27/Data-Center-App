import type { useDiligence } from "../context/DiligenceContext";
import { getConferenceEvidenceSummary, getConferenceRelationship } from "./conferenceEvidence";

export function generateAdvisorBrief(diligence: ReturnType<typeof useDiligence>) {
  const summary = getConferenceEvidenceSummary(diligence.evidence);
  const relationship = getConferenceRelationship(diligence.project, diligence.originatingCompany);
  return {
    gapSummary: {
      unresolvedDecisionGates: diligence.metrics.unresolvedDecisionGateCount,
      unresolvedFinancialDrivers: diligence.metrics.unresolvedFinancialDriverCount,
    },
    whatWeKnow: summary.facts.map((item) => `${item.label}: ${String(item.value)}`),
    whatWeDoNotKnow: summary.unresolved.map((item) => `${item.label}: project-specific supporting terms remain unresolved.`),
    whyItMatters: [
      "Power, water or permitting constraints could change project timing and cost.",
      relationship.established ? `${relationship.company!.displayName}'s contractual dependence determines whether those changes reach its financial results.` : "No company–project relationship is established; issuer effects cannot be attributed.",
      "Portfolio relevance requires actual holding weights and issuer exposure—not a project risk score.",
    ],
    questions: [
      "Which binding power, water and community documents support this facility’s operating timetable?",
      relationship.established ? `What is ${relationship.company!.displayName}'s contractual exposure if this project is delayed or costs increase?` : "What documentation establishes a relationship between a portfolio company and this project?",
      "What are the fund’s position weight, issuer dependence and alternatives if the project underperforms?",
    ],
    action: {
      label: "Request a documented exposure review",
      description: "Send these three questions to the fund manager or company. Ask for source documents and quantified dependence before drawing an investment conclusion.",
    },
  };
}