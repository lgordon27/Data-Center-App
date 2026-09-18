import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
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

export function CompanyProjectSelection({ company, projects, researchingProjectId = null, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("All");
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const availableStates = useMemo(() => {
    const states = new Set(projects.map((project) => project.facility?.state).filter((value): value is string => Boolean(value)));
    return ["All", "TX", "AZ", ...[...states].filter((value) => value !== "TX" && value !== "AZ").sort()];
  }, [projects]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (state !== "All" && project.facility?.state !== state) return false;
      if (!needle) return true;
      return [project.name, project.operator, project.location, project.status, project.connectionType]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [projects, query, state]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => setPage(0), [query, state, projects]);
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  return (
    <div data-testid="company-project-list" className="mt-4 min-w-0 space-y-3">
      {projects.length > 0 && (
        <div className="rounded-lg border border-[#cbd8d4] bg-white p-3">
          <label className="relative block min-w-0">
            <span className="sr-only">Search projects</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71808a]" />
            <input
              data-testid="company-project-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project, operator, location, or status"
              className="min-h-11 w-full min-w-0 rounded-md border border-[#cbd8d4] bg-[#f9faf8] py-2 pl-10 pr-3 text-[12px] text-[#122232] outline-none focus:border-[#255bb7] focus:ring-2 focus:ring-[#255bb7]/20"
            />
          </label>
          <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Filter projects by state">
            {availableStates.map((option) => (
              <button
                key={option}
                data-testid={`company-project-state-${option.toLowerCase()}`}
                type="button"
                aria-pressed={state === option}
                onClick={() => setState(option)}
                className={`min-h-10 shrink-0 rounded-md border px-3 font-mono text-[9px] font-bold uppercase ${state === option ? "border-[#122232] bg-[#122232] text-white" : "border-[#cbd8d4] bg-white text-[#52616b] hover:border-[#255bb7]"}`}
              >
                {option}
              </button>
            ))}
          </div>
          <p data-testid="company-project-count" role="status" className="mt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[#71808a]">
            Showing {visible.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} matching · {projects.length} total
          </p>
        </div>
      )}
      {projects.length === 0 && (
        <div data-testid="company-project-empty" className="rounded-lg border border-dashed border-[#cbd8d4] bg-white p-6 text-[12px] text-[#52616b]">
          No project record is available for this company in the current snapshot. That is an evidence boundary, not a claim of no exposure.
        </div>
      )}
      {projects.length > 0 && filtered.length === 0 && (
        <div data-testid="company-project-no-matches" className="rounded-lg border border-dashed border-[#cbd8d4] bg-white p-5 text-[12px] text-[#52616b]">
          No projects match this search and state filter.
        </div>
      )}
      {visible.map((project) => {
        const evidenceState = projectRelationshipState(company, project);
        const supportedWorkbench = project.kind === "curated";
        const researching = researchingProjectId === project.id;
        return (
          <article key={project.id} data-testid={`company-project-${project.id}`} className="min-w-0 rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words text-[15px] font-semibold tracking-[-0.02em] text-[#122232]">{project.name}</h3>
                  <span data-testid={`company-project-tier-${project.id}`} className={`rounded-full border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${project.relationshipBasis === "source-backed" ? "border-[#9bd8c5] bg-[#e0f4ed] text-[#0b624f]" : project.relationshipBasis === "operator-derived" ? "border-[#8dc8e8] bg-[#e5f5fb] text-[#164c67]" : "border-[#e6cf70] bg-[#fff6c7] text-[#8a6400]"}`}>
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
                {researching ? "Opening…" : supportedWorkbench ? "Open reviewed dossier" : "Research this project · Beta"}
                <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
            <div className="mt-3 grid min-w-0 gap-2 border-t border-[#e5eae8] pt-3 sm:grid-cols-3">
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Location</div><div className="mt-1 break-words text-[11px] font-semibold text-[#344550]">{project.location}</div></div>
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Status</div><div className="mt-1 break-words text-[11px] font-semibold text-[#344550]">{project.status}</div></div>
              <div><div className="font-mono text-[8px] font-bold uppercase tracking-[0.11em] text-[#71808a]">Capacity</div><div className="mt-1 font-mono text-[11px] font-bold text-[#122232]">{capacityLabel(project.capacityMW)}</div></div>
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
              <span data-testid={`company-project-evidence-${project.id}`} className="rounded-full border border-[#cbd8d4] bg-[#f1f5f3] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#314207]">{evidenceState}</span>
              <span data-testid={`company-project-connection-${project.id}`} className="min-w-0 break-words text-[10px] font-semibold text-[#52616b]">{project.connectionType}</span>
            </div>
            <details className="mt-3 min-w-0 border-t border-[#e5eae8] pt-2 text-[11px] text-[#52616b]">
              <summary className="min-h-10 cursor-pointer py-2 font-semibold text-[#255bb7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Evidence details and citation</summary>
              <p className="break-words leading-5">{project.description}</p>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#71808a]">
                {project.facility?.sourceUrl ? (
                  <a href={project.facility.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-all underline underline-offset-2">
                    <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />Provider record
                  </a>
                ) : project.claimIds?.length ? <span>Reviewed source record</span> : <span>Source review required</span>}
                <span>· {project.facility?.lastUpdated ? `as of ${project.facility.lastUpdated}` : "as-of date not established"}</span>
                <span>· Not ownership proof or a modeled input</span>
              </div>
            </details>
          </article>
        );
      })}
      {filtered.length > pageSize && (
        <nav aria-label="Project results pages" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#cbd8d4] bg-white p-3">
          <button data-testid="company-project-previous" type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="min-h-10 rounded-md border border-[#cbd8d4] px-3 text-[11px] font-semibold disabled:opacity-40">Previous</button>
          <span className="font-mono text-[9px] uppercase text-[#71808a]">Page {page + 1} of {pageCount}</span>
          <button data-testid="company-project-next" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="min-h-10 rounded-md border border-[#cbd8d4] px-3 text-[11px] font-semibold disabled:opacity-40">Next</button>
        </nav>
      )}
    </div>
  );
}