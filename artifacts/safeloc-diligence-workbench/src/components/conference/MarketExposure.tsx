import { useEffect, useState } from "react";
import { ArrowRight, Building2, ExternalLink } from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import {
  COMPANY_PROFILES,
  companyProjects,
  startingRelationshipProject,
  startingRelationshipState,
  toProjectSelectionContext,
} from "@/data/companyExposure";
import { CompanyProjectSelection } from "@/components/CompanyProjectSelection";
import { getConferenceRelationship } from "@/model/conferenceEvidence";
import {
  fetchAllCompanyDirectoryFacilities,
  type DirectoryFacility,
} from "@/services/directoryService";

function canonicalSlug(id: string, name: string) {
  if (id === "project-kilby" || id === "microsoft-el-mirage") return id;
  return name.trim().toLowerCase() === "stargate abilene" ? "stargate-abilene" : null;
}

export function MarketExposure() {
  const { project, activeProjectContext, originatingCompany, selectedProjectContext, setOriginatingCompany, setProjectSelection } = useDiligence();
  const canonicalDossier = project.canonicalDossier ?? null;
  const [facilities, setFacilities] = useState<DirectoryFacility[]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const relationship = getConferenceRelationship(project, originatingCompany);
  const options = COMPANY_PROFILES;
  const selectedState = relationship.established
    ? "Source-backed"
    : relationship.company
      ? startingRelationshipState(relationship.company.key)
      : null;
  const relatedProject = relationship.company ? startingRelationshipProject(relationship.company.key) : null;
  useEffect(() => {
    if (!relationship.company || canonicalDossier) {
      setFacilities([]);
      setDirectoryStatus("idle");
      return;
    }
    let active = true;
    setFacilities([]);
    setDirectoryStatus("loading");
    void fetchAllCompanyDirectoryFacilities(relationship.company.key, (nextFacilities) => {
      if (active) setFacilities(nextFacilities);
    }).then((nextFacilities) => {
      if (!active) return;
      setFacilities(nextFacilities);
      setDirectoryStatus("ready");
    }).catch(() => {
      if (active) setDirectoryStatus("unavailable");
    });
    return () => { active = false; };
  }, [relationship.company?.key, canonicalDossier?.slug]);
  return (
    <section
      data-testid="conference-view-market"
      data-project-id={activeProjectContext?.projectId ?? ""}
      data-research-run-id={activeProjectContext?.researchRunId ?? ""}
      className="space-y-5"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">01 / Company and project relationship</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">What connects the company to this project?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616b]">Review the documented connection and its limits. A public relationship is not a measurement of portfolio exposure.</p>
      </div>
      <div className="rounded-xl border border-[#cbd8d4] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Building2 aria-hidden="true" className="h-9 w-9 shrink-0 rounded-md bg-[#edf1e1] p-2 text-[#607500]" />
            <div><p className="text-xs text-[#52616b]">Selected public company</p><h3 data-testid="market-company" className="text-xl font-semibold">{relationship.company?.displayName ?? originatingCompany ?? "No company selected"}</h3>
              {relationship.company && <p className="text-xs text-[#60707d]">{relationship.company.ticker}</p>}</div>
          </div>
          {project.kind === "curated" && !project.canonicalDossier && options.length > 0 && <label className="text-xs text-[#52616b]">Select a starting holding
            <select aria-label="Select public holding" data-testid="market-company-select" value={relationship.company?.key ?? ""} onChange={(event) => { if (event.target.value) setOriginatingCompany(event.target.value as typeof COMPANY_PROFILES[number]["key"]); }}
              className="mt-1 block min-h-11 w-full rounded-md border border-[#cbd8d4] bg-[#f9faf8] px-3 text-sm text-[#122232]">
              <option value="" disabled>Choose a company</option>
              {options.map((company) => <option key={company.key} value={company.key}>{company.displayName} ({company.ticker}) · {relationship.established && relationship.company?.key === company.key ? "Source-backed" : startingRelationshipState(company.key)}</option>)}
            </select>
            <span className="mt-1 block max-w-xs text-[10px]">Changes the holding context without substituting a project. Select a project below to open the supported case or start research.</span>
          </label>}
        </div>
        {canonicalDossier && relationship.company && selectedProjectContext?.company === relationship.company.key && selectedProjectContext.projectName === project.name && (
          <p data-testid="market-selected-project-identity" className="mt-3 break-words border-t border-[#e5eae8] pt-3 text-xs font-semibold text-[#52616b]">
            Selected company context: {selectedProjectContext.projectName} · {selectedProjectContext.location} · {selectedProjectContext.relationshipType}
          </p>
        )}
        {project.kind === "curated" && !project.canonicalDossier && <div data-testid="market-holding-states" className="mt-5 grid gap-2 border-t border-[#e5eae8] pt-5 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((company) => {
            const state = relationship.established && relationship.company?.key === company.key
              ? "Source-backed"
              : startingRelationshipState(company.key);
            return (
              <button key={company.key} data-testid={`market-holding-state-${company.key.toLowerCase()}`} type="button" onClick={() => setOriginatingCompany(company.key)} className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-3 text-left hover:border-[#255bb7]">
                <span className="block text-xs font-semibold text-[#122232]">{company.displayName}</span>
                <span className="mt-1 block text-[10px] text-[#60707d]">{state}</span>
              </button>
            );
          })}
        </div>}
        {relationship.company && !canonicalDossier && (
          <div data-testid="market-project-selection" className="mt-5 border-t border-[#e5eae8] pt-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">Project selection</p>
              <h3 className="mt-1 text-lg font-semibold">Choose the project context before drawing an exposure conclusion.</h3>
               <p className="mt-1 max-w-2xl text-xs leading-5 text-[#52616b]">Search and filter the same provider-associated records shown on Home. Each action preserves the exact facility and holding; discovery matches remain distinct from sourced relationships.</p>
               {directoryStatus === "loading" && <p role="status" className="mt-2 text-xs text-[#60707d]">Loading all provider pages…</p>}
               {directoryStatus === "unavailable" && <p role="status" className="mt-2 text-xs text-[#805000]">Provider records are unavailable; reviewed records remain visible.</p>}
               {selectedProjectContext?.company === relationship.company.key && (
                 <p data-testid="market-selected-project-identity" className="mt-2 break-words text-xs font-semibold text-[#314207]">
                    Selected facility: {selectedProjectContext.projectName} · {selectedProjectContext.location} · selected relationship type {selectedProjectContext.relationshipType} · provider ID {selectedProjectContext.providerId ?? "not supplied"}
                 </p>
               )}
            </div>
            <CompanyProjectSelection
              company={relationship.company.key}
              projects={companyProjects(relationship.company.key, facilities)}
              onSelect={(selectedProject) => {
                const selection = toProjectSelectionContext(relationship.company!.key, selectedProject);
                const dossierSlug = selectedProject.kind === "curated"
                  ? canonicalSlug(selectedProject.id, selectedProject.name)
                  : null;
                if (dossierSlug) {
                  setProjectSelection(selection);
                  window.location.hash = `analysis/${dossierSlug}`;
                  return;
                }
                setProjectSelection(selection);
                window.dispatchEvent(new CustomEvent("safeloc-open-custom-project", {
                  detail: {
                    name: selectedProject.name,
                    location: selectedProject.location,
                    company: relationship.company!.key,
                    selection,
                    knownData: {
                      capacity: selectedProject.capacityMW,
                      operator: selectedProject.operator,
                      status: selectedProject.status,
                      ...(selection.sourceUrl ? { sourceUrl: selection.sourceUrl } : {}),
                      providerId: selection.providerId,
                    },
                  },
                }));
              }}
            />
          </div>
        )}
        <dl className="mt-5 grid gap-4 border-t border-[#e5eae8] pt-5 sm:grid-cols-3">
          <div><dt className="text-xs text-[#60707d]">Infrastructure project</dt><dd className="mt-1 font-semibold">{project.name}</dd></div>
          <div><dt className="text-xs text-[#60707d]">Relationship type</dt><dd data-testid="market-relationship-type" className="mt-1 font-semibold">{relationship.type}</dd></div>
          <div><dt className="text-xs text-[#60707d]">Relationship confidence</dt><dd data-testid="market-relationship-confidence" className="mt-1 font-semibold">{relationship.confidence}</dd></div>
        </dl>
        {relationship.established ? <>
          <div data-testid="market-exposure-chain" className="mt-5 grid items-center gap-3 rounded-lg bg-[#122232] p-4 text-white sm:grid-cols-[1fr_auto_1fr]">
            <span className="font-semibold">{relationship.company?.displayName}</span><ArrowRight aria-hidden="true" className="h-5 w-5 rotate-90 text-[#d4e86b] sm:rotate-0" /><span className="font-semibold">{project.name}</span>
          </div>
          {canonicalDossier ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <article data-testid="market-relationship-evidence" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#607500]">What the evidence establishes</h4>
                <p className="mt-2 text-sm leading-6 text-[#344550]">{relationship.description}</p>
                <p className="mt-2 text-xs font-semibold text-[#52616b]">Relationship type: {relationship.type} · Evidence confidence: {relationship.confidence}</p>
              </article>
              <article data-testid="market-relationship-limits" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#60707d]">What it does not establish</h4>
                <p className="mt-2 text-sm leading-6 text-[#52616b]">This relationship record alone does not establish project ownership, facility tenancy, quantified project revenue, or portfolio materiality.</p>
              </article>
              <article data-testid="market-relationship-relevance" className="rounded-lg border border-[#d9e0e4] bg-white p-4 md:col-span-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#60707d]">Why it may matter</h4>
                <p className="mt-2 text-sm leading-6 text-[#52616b]">The dossier records issuer materiality as “{canonicalDossier.canonicalData.materiality.issuer}” and portfolio materiality as “{canonicalDossier.canonicalData.materiality.portfolio}.” These are diligence boundaries, not an investment conclusion.</p>
              </article>
            </div>
          ) : (
            <p data-testid="market-relationship-evidence" className="mt-4 text-sm leading-6 text-[#344550]">{relationship.description}</p>
          )}
          {canonicalDossier && <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#60707d]">Reviewed dossier sources</p>}
          <div className="mt-3 space-y-2">
            {relationship.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="flex w-fit max-w-full items-start gap-2 break-words text-xs leading-5 text-[#255bb7] underline">
              <ExternalLink aria-hidden="true" className="mt-1 h-3 w-3 shrink-0" /><span>{source.title}</span>
            </a>)}
          </div>
        </> : <div data-testid="market-no-relationship" className="mt-5 rounded-lg bg-[#f1f5f3] p-4">
          <h3 className="font-semibold">No established company–project relationship</h3>
          <p className="mt-2 text-sm leading-6 text-[#52616b]">{relationship.reason} No exposure chain is shown.</p>
          {relationship.company && !canonicalDossier && <p data-testid="market-relationship-state" className="mt-2 text-xs font-semibold text-[#805000]">{selectedState}: {relatedProject ? `${relatedProject.name} is related discovery context, not a sourced relationship for ${project.name}.` : `No reviewed relationship to ${project.name} is established; project-level research is required.`}</p>}
          {relationship.company && !canonicalDossier && <a href="#home" className="mt-3 inline-block text-xs text-[#255bb7] underline">Explore a related project or start research on Home</a>}
        </div>}
      </div>
      <p className="text-xs leading-5 text-[#60707d]">No fund is assumed. Portfolio relevance requires your actual holdings, weights and the issuer’s contractual dependence on this facility.</p>
    </section>
  );
}