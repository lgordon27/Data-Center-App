import { AdvisorBrief } from "@/components/conference/AdvisorBrief";
import type { Screen } from "@/components/Shell";

/** Compatibility export; the analysis route now presents the concise advisor brief. */
export function AdvisorLens(_props: {
  onNavigate: (screen: Screen) => void;
  onResolveEvidence?: (evidenceId: string) => void;
}) {
  return <AdvisorBrief />;
}