import type { ProjectContext } from "@/context/DiligenceContext";
import {
  COMMUNITY_AGREEMENTS,
  COMMUNITY_TERM_DEFINITIONS,
  type CommunityConclusion,
  type CommunityTermId,
} from "@/data/communityAgreements";
import { matchCommunityProject, type CommunityTermDecision } from "@/model/communityAgreements";

export type CommunityAIProposal = {
  status: "success" | "error";
  message?: string;
  proposedAt: string;
  relationship: ReturnType<typeof matchCommunityProject>;
  terms: Array<{
    id: CommunityTermId;
    proposedConclusion: CommunityConclusion;
    proposedClassification: CommunityTermDecision["classification"];
    proposedTreatment: CommunityTermDecision["treatment"];
    reasoning: string;
    sourceSupport: string;
  }>;
};

/**
 * This contract is deliberately local and bounded: it analyzes only the
 * versioned snapshot supplied to the reviewer. It does not imply live web
 * research, and it never mutates the DiligenceContext.
 */
export async function analyzeCommunityTerms(
  project: Pick<ProjectContext, "name" | "location" | "kind">,
): Promise<CommunityAIProposal> {
  const relationship = matchCommunityProject(project);
  const agreement = relationship.agreementId
    ? COMMUNITY_AGREEMENTS.find((candidate) => candidate.id === relationship.agreementId)
    : undefined;
  const terms = agreement
    ? COMMUNITY_TERM_DEFINITIONS.map((definition) => {
        const sourceTerm = agreement.terms[definition.id];
        const proposedConclusion: CommunityConclusion = sourceTerm.present === true
          ? sourceTerm.bindingStatus === "Binding" ? "Present" : "Partial"
          : sourceTerm.present === false ? "Absent" : "Unknown";
        return {
          id: definition.id,
          proposedConclusion,
          proposedClassification: (sourceTerm.present === null ? "Missing Evidence" : "Model Inference") as CommunityTermDecision["classification"],
          proposedTreatment: definition.treatment,
          reasoning: `Snapshot text ${sourceTerm.present === null ? "does not establish" : "suggests"} a ${definition.label.toLowerCase()} provision; human review is required.`,
          sourceSupport: `${sourceTerm.sourceCitation} · ${sourceTerm.pageOrSection}`,
        };
      })
    : COMMUNITY_TERM_DEFINITIONS.map((definition) => ({
        id: definition.id,
        proposedConclusion: "Unknown" as const,
        proposedClassification: "Missing Evidence" as CommunityTermDecision["classification"],
        proposedTreatment: definition.treatment,
        reasoning: "No project-specific agreement was located in the reviewed snapshot; leave unresolved rather than infer from comparables.",
        sourceSupport: "No project-specific source in the reviewed snapshot",
      }));
  return {
    status: "success",
    proposedAt: new Date().toISOString(),
    relationship,
    terms,
  };
}