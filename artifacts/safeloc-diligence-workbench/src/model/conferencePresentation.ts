import type { useDiligence } from "../context/DiligenceContext";
import {
  getConferenceEvidenceSummary,
  getConferenceRelationship,
  isConferenceResearchIncomplete,
} from "./conferenceEvidence";

export const FINANCIAL_ADVISOR_COVERAGE_LABELS = {
  reviewed: "Client conversation brief · evidence reviewed",
  gaps: "Client conversation brief · material gaps remain",
  incomplete: "Research incomplete · not conversation-ready",
} as const;

function evidenceAsOf(diligence: ReturnType<typeof useDiligence>) {
  const dates = Object.values(diligence.evidence).flatMap((item) => [
    item.sourcePublishedAt,
    item.sourceAccessedAt,
    ...(item.sources ?? []).flatMap((source) => [source.publishedAt, source.accessedAt]),
  ]).filter((date): date is string => typeof date === "string" && !Number.isNaN(Date.parse(date)));
  if (!dates.length) return null;
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}



function coverageLabel(
  diligence: ReturnType<typeof useDiligence>,
  summary: ReturnType<typeof getConferenceEvidenceSummary>,
) {
  if (diligence.project.canonicalDossier) {
    return diligence.project.canonicalDossier.coverageState === "evidence-reviewed"
      ? FINANCIAL_ADVISOR_COVERAGE_LABELS.reviewed
      : FINANCIAL_ADVISOR_COVERAGE_LABELS.gaps;
  }
  if (isConferenceResearchIncomplete(diligence.project, diligence.evidence)) {
    return FINANCIAL_ADVISOR_COVERAGE_LABELS.incomplete;
  }
  return diligence.metrics.unresolvedDecisionGateCount > 0 ||
    diligence.metrics.unresolvedFinancialDriverCount > 0 ||
    summary.unresolved.length > 0
    ? FINANCIAL_ADVISOR_COVERAGE_LABELS.gaps
    : FINANCIAL_ADVISOR_COVERAGE_LABELS.reviewed;
}

export function generateAdvisorBrief(diligence: ReturnType<typeof useDiligence>) {
  const summary = getConferenceEvidenceSummary(diligence.evidence);
  const relationship = getConferenceRelationship(diligence.project, diligence.originatingCompany);
  return {
    audience: "financial-advisor" as const,
    coverageLabel: coverageLabel(diligence, summary),
    evidenceAsOf: evidenceAsOf(diligence),
    canonicalEvidence: summary.facts.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      sourceTitle: item.sourceTitle ?? item.sources?.[0]?.title ?? null,
      sourceUrl: item.sourceUrl ?? item.sources?.[0]?.url ?? null,
    })),
    primaryCase: {
      label: "Synthetic current-evidence primary case",
      projectIRR: diligence.metrics.projectIRR,
      recommendationStatus: diligence.metrics.recommendationStatus,
      basis: "synthetic-current" as const,
      boundary: "Project-level synthetic diligence output; optional EIA sensitivities are not issuer returns or portfolio returns.",
    },
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

export function generateAssetManagerBrief(diligence: ReturnType<typeof useDiligence>) {
  const summary = getConferenceEvidenceSummary(diligence.evidence);
  const relationship = getConferenceRelationship(diligence.project, diligence.originatingCompany);
  const projectMateriality = diligence.metrics.projectIRR === null
    ? "Not quantified"
    : "Quantified project sensitivity";
  return {
    audience: "asset-manager" as const,
    title: diligence.project.name,
    evidenceAsOf: evidenceAsOf(diligence),
    relationship: {
      type: relationship.type,
      confidence: relationship.confidence,
      scope: relationship.description,
      limitation: relationship.established
        ? "The relationship does not establish issuer or portfolio materiality."
        : relationship.reason,
    },
    evidenceFindings: summary.facts.map((item) => ({
      category: item.label,
      finding: String(item.value),
      sourceTitle: item.sourceTitle ?? item.sources?.[0]?.title ?? null,
      sourceUrl: item.sourceUrl ?? item.sources?.[0]?.url ?? null,
    })),
    projectMateriality: {
      state: projectMateriality,
      scenarioRole: "Synthetic current-evidence project scenario",
      boundary: "Project IRR is not an issuer return, fund return, or portfolio return.",
    },
    issuerMateriality: relationship.established
      ? "Exposure established; financial materiality unquantified"
      : "Relationship unverified",
    portfolioMateriality: "Not assessed",
    engagementQuestions: [
      "Which exact facility, phase, power, water, and community documents support the operating timetable?",
      relationship.established
        ? `What contractual exposure does ${relationship.company!.displayName} have if the project is delayed or costs increase?`
        : "What dated document establishes the issuer-project relationship?",
      "What dated holding data and issuer disclosure would support a portfolio-materiality assessment?",
    ],
    disclosureRequests: [
      "Exact facility and phase identity, with publication and access dates.",
      "Binding power, water, permitting, and community terms with source passages.",
      "Quantified issuer exposure and dated holding weights; do not infer either from project IRR.",
    ],
    monitoringTriggers: ["Facility phase", "Power / water", "Community", "Issuer disclosure", "Holding-data changes"],
    provenance: summary.facts.map((item) => ({
      id: item.id,
      title: item.sourceTitle ?? item.sources?.[0]?.title ?? "Source title unavailable",
      url: item.sourceUrl ?? item.sources?.[0]?.url ?? null,
    })),
  };
}