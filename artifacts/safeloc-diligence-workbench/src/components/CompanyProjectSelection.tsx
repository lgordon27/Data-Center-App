import { ArrowRight, ExternalLink } from "lucide-react";
import {
  projectRelationshipState,
  type CompanyKey,
  type CompanyProject,
} from "@/data/companyExposure";

type Props = {
  company: CompanyKey;
  projects: CompanyProject[];
  researchingProjectId?: string | null;
  onSelect: (project: CompanyProject) => void;
};

function capacityLabel(capacityMW: number | null) {
  return capacityMW === null ? "Undisclosed" : `${capacityMW.toLocaleString("en-US", { maximumFractionDigits: 1 })} MW`;
}

function isStargate(project: CompanyProject) {
  return project.kind === "curated" && project.name.trim().toLowerCase() === "stargate abilene";
}

export function CompanyProjectSelection({ company, projects, researchingProjectId = null, onSelect }: Props) {
  return (
    <div data-testid="company-project-list" className="mt-4 space-y-3">
      {projects.length === 0 && (
        <div data-testid="company-project-empty" className="rounded-lg border border-dashed border-[#cbd8d4] bg-white p-6 text-[12px] text-[#52616b]">
          No project record is available for this company in the current snapshot. That is an evidence boundary, not a claim of no exposure.
        </div>
      )}
      {projects.map((project) => {
        const evidenceState = projectRelationshipState(company, project);
        const supportedWorkbench = evidenceState === "Source-backed" && isStargate(project);
        const researching = researchingProjectId === project.id;
        return (
          <article key={project.id} data-testid={`company-project-${project.id}`} className="min-w-0 rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words text-[15px] font-semibold tracking-[-0.02em] text-[#122232]">{project.name}</h3>
                  <span data-testid={`company-project-tier-${project.id}`} className="rounded-full border border-[#e6cf70] bg-[#fff6c7] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#8a6400]">
                    {project.tierLabel}
                  </span>
                </div>
                <p className="mt-1 break-words text-[10px] text-[#63717a]">{project.operator}</p>
              </div>
              <button
                data-testid={`company-project-open-${project.id}`}
                type="button"
                onClick={() => onSelect(project)}
                disabled={researching}
                aria-busy={researching}
                className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-md px-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] disabled:cursor-wait disabled:opacity-60 ${supportedWorkbench ? "bg-[#122232] text-[#d4e86b] hover:bg-[#203a4c]" : "border border-[#255bb7] text-[#255bb7] hover:bg-[#e5efff]"}`}
              >
                {researching ? "Preparing research…" : supportedWorkbench ? "Open supported workbench" : "Research this project"}
                <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-4 grid min-w-0 gap-3 border-y border-[#e5eae8] py-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Location</div><div className="mt-1 break-words text-[11px] font-semibold text-[#344550]">{project.location}</div></div>
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Capacity</div><div className="mt-1 font-mono text-[11px] font-bold text-[#122232]">{capacityLabel(project.capacityMW)}</div></div>
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Status</div><div className="mt-1 break-words text-[11px] font-semibold text-[#344550]">{project.status}</div></div>
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Relationship</div><div data-testid={`company-project-connection-${project.id}`} className="mt-1 break-words text-[11px] font-semibold text-[#344550]">{project.connectionType}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span data-testid={`company-project-evidence-${project.id}`} className="rounded-full border border-[#cbd8d4] bg-[#f1f5f3] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#314207]">{evidenceState}</span>
              <p className="min-w-0 flex-1 text-[11px] leading-5 text-[#52616b]">{project.description}</p>
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#71808a]">
              {project.facility?.sourceUrl ? (
                <a href={project.facility.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-all underline underline-offset-2">
                  <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />Provider record
                </a>
              ) : project.claimIds?.length ? (
                <span>Reviewed source record</span>
              ) : (
                <span>Source review required</span>
              )}
              <span aria-hidden="true">·</span>
              <span>{project.facility?.lastUpdated ? `as of ${project.facility.lastUpdated}` : "as-of date not established"}</span>
              <span aria-hidden="true">·</span>
              <span>Not ownership proof or a modeled input</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}