import {
  RESEARCH_FINDING_TOPICS,
  type ResearchFinding,
  type ResearchFindingTopic,
} from "@/types/researchFindings";

const topicLabels: Record<ResearchFindingTopic, string> = {
  identity: "Identity",
  capacity: "Capacity",
  power: "Power",
  grid: "Grid",
  water: "Water",
  permitting: "Permitting",
  community: "Community",
  construction: "Construction",
  financing: "Financing",
  tenant: "Tenant",
  hazard: "Hazard",
  other: "Other",
};

export function researchFindingTopicLabel(topic: ResearchFindingTopic): string {
  return topicLabels[topic];
}

export function groupResearchFindings(findings: ResearchFinding[]) {
  return RESEARCH_FINDING_TOPICS.flatMap((topic) => {
    const topicFindings = findings.filter((finding) => finding.topic === topic);
    return topicFindings.length ? [{ topic, findings: topicFindings }] : [];
  });
}

export function rankAdvisorResearchFindings(findings: ResearchFinding[]): ResearchFinding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((left, right) => {
      const matchPriority = Number(right.finding.projectMatch === "matches-requested-project")
        - Number(left.finding.projectMatch === "matches-requested-project");
      if (matchPriority) return matchPriority;
      const reportedPriority = Number(right.finding.kind === "reported") - Number(left.finding.kind === "reported");
      return reportedPriority || left.index - right.index;
    })
    .map(({ finding }) => finding);
}
