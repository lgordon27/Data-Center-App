import { useDiligence } from "@/context/DiligenceContext";

const SOURCE_LABELS = {
  directory: "Directory selection",
  "market-exposure": "Market Exposure selection",
  "home-custom-form": "Home project form",
  "custom-project-dialog": "Project research dialog",
  "canonical-route": "Canonical dossier route",
  "reviewed-starting-case": "Reviewed starting case",
  restored: "Restored session",
} as const;

const LIFECYCLE_LABELS = {
  idle: "Not researched",
  researching: "Researching",
  partial: "Partial research",
  complete: "Research complete",
  failed: "Research failed",
  superseded: "Superseded",
} as const;

export function ActiveProjectContextSummary() {
  const { activeProjectContext } = useDiligence();
  if (!activeProjectContext) {
    return (
      <section
        data-testid="project-context-binding"
        aria-label="Active project context"
        className="mb-4 rounded-lg border border-[#cbd8d4] bg-white px-4 py-3"
      >
        <strong className="text-sm text-[#122232]">No active project selected</strong>
      </section>
    );
  }

  return (
    <section
      data-testid="project-context-binding"
      aria-label="Active project context"
      data-project-id={activeProjectContext.projectId}
      data-research-run-id={activeProjectContext.researchRunId ?? ""}
      data-active-result-ref={activeProjectContext.activeResultRef ?? ""}
      data-lifecycle={activeProjectContext.lifecycle}
      data-classification={activeProjectContext.classification}
      className="mb-4 rounded-lg border border-[#cbd8d4] bg-white px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <strong data-testid="active-project-name" className="text-sm text-[#122232]">
          {activeProjectContext.name}
        </strong>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b]">
          {LIFECYCLE_LABELS[activeProjectContext.lifecycle]}
        </span>
      </div>
      <div className="mt-1 text-[10px] leading-5 text-[#52616b]">
        {activeProjectContext.operator ? `${activeProjectContext.operator} · ` : ""}
        {activeProjectContext.location}
        {activeProjectContext.scope ? ` · ${activeProjectContext.scope}` : ""}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#60707d]">
        <span>Project ID: {activeProjectContext.projectId}</span>
        <span>Selected via: {SOURCE_LABELS[activeProjectContext.selectionSource]}</span>
        <span>Run: {activeProjectContext.researchRunId ?? "Not reported"}</span>
        <span>Result: {activeProjectContext.activeResultRef ?? "No result retained"}</span>
        <span>Class: {activeProjectContext.classification}</span>
        {activeProjectContext.researchOutcome && (
          <span>Server outcome: {activeProjectContext.researchOutcome.state}</span>
        )}
      </div>
    </section>
  );
}