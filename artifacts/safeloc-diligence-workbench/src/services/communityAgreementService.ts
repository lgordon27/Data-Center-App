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
        const proposedConclusion: CommunityConclusion = "Unknown";
        return {
          id: definition.id,
          proposedConclusion,
          proposedClassification: "Missing Evidence" as CommunityTermDecision["classification"],
          proposedTreatment: definition.treatment,
          reasoning: `The external benchmark status is ${sourceTerm.benchmarkStatus}, but benchmark context does not establish a Stargate Abilene project fact; human review is required.`,
          sourceSupport: `${agreement.sourceTitle} · ${sourceTerm.benchmarkTerm} · benchmark ${sourceTerm.benchmarkStatus}`,
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