import { useSyncExternalStore } from "react";
import { getResearchProgress, subscribeResearchProgress, type ResearchProgress } from "@/services/researchProjectService";

/** Displays server-observed stages, not a timer-based estimate. */
export function ResearchRunProgress({ progress }: { progress: ResearchProgress }) {
  const label = typeof progress === "string"
    ? progress === "retrying" ? "Retrying within the research deadline" : "Finding sources"
    : {
        "finding-sources": "Finding sources",
        "reading-sources": `Reading ${progress.sourceCount} sources`,
        "extracting-findings": "Extracting findings",
        "verifying-quotes": "Verifying quotes",
      }[progress.stage];
  return <span role="status" aria-live="polite" data-testid="research-run-progress">{label}</span>;
}

export function ActiveResearchRunProgress({ name, location }: { name: string; location: string }) {
  const progress = useSyncExternalStore(subscribeResearchProgress,
    () => getResearchProgress(name, location), () => null);
  return progress ? <ResearchRunProgress progress={progress} /> : null;
}
