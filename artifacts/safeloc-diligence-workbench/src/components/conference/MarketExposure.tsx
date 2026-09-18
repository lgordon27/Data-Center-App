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
import { getCanonicalDossier } from "@/services/canonicalDossierService";

function canonicalSlug(id: string, name: string) {
  if (id === "project-kilby" || id === "microsoft-el-mirage") return id;
  return name.trim().toLowerCase() === "stargate abilene" ? "stargate-abilene" : null;
}

export function MarketExposure() {
  const { project, originatingCompany, selectedProjectContext, resetToDefault, setOriginatingCompany, setProjectSelection, loadCanonicalDossier } = useDiligence();
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
    if (!relationship.company) {
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
  }, [relationship.company?.key]);
  return (
    <section data-testid="conference-view-market" className="space-y-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">01 / Start with the holding</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">What connects the company to this project?</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52616b]">A public relationship is a starting point for diligence—not a measurement of your portfolio’s exposure.</p>
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
        {relationship.company && (
          <div data-testid="market-project-selection" className="mt-5 border-t border-[#e5eae8] pt-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">Project selection</p>
              <h3 className="mt-1 text-lg font-semibold">Choose the project context before drawing an exposure conclusion.</h3>
               <p className="mt-1 max-w-2xl text-xs leading-5 text-[#52616b]">Search and filter the same provider-associated records shown on Home. Each action preserves the exact facility and holding; discovery matches remain distinct from sourced relationships.</p>
               {directoryStatus === "loading" && <p role="status" className="mt-2 text-xs text-[#60707d]">Loading all provider pages…</p>}
               {directoryStatus === "unavailable" && <p role="status" className="mt-2 text-xs text-[#805000]">Provider records are unavailable; reviewed records remain visible.</p>}
               {selectedProjectContext?.company === relationship.company.key && (
                 <p data-testid="market-selected-project-identity" className="mt-2 break-words text-xs font-semibold text-[#314207]">
                   Selected facility: {selectedProjectContext.projectName} · {selectedProjectContext.location} · provider ID {selectedProjectContext.providerId ?? "not supplied"}
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
                  void getCanonicalDossier(dossierSlug).then((dossier) => {
                    loadCanonicalDossier(dossier);
                    window.location.hash = `analysis/${dossierSlug}`;
                  });
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
          <p data-testid="market-relationship-evidence" className="mt-4 text-sm leading-6 text-[#344550]">{relationship.description}</p>
          <div className="mt-3 space-y-2">
            {relationship.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="flex w-fit max-w-full items-start gap-2 break-words text-xs leading-5 text-[#255bb7] underline">
              <ExternalLink aria-hidden="true" className="mt-1 h-3 w-3 shrink-0" /><span>{source.title}</span>
            </a>)}
          </div>
        </> : <div data-testid="market-no-relationship" className="mt-5 rounded-lg bg-[#f1f5f3] p-4">
          <h3 className="font-semibold">No established company–project relationship</h3>
           <p className="mt-2 text-sm leading-6 text-[#52616b]">{relationship.reason} No exposure chain is shown.</p>
            {relationship.company && <p data-testid="market-relationship-state" className="mt-2 text-xs font-semibold text-[#805000]">{selectedState}: {relatedProject ? `${relatedProject.name} is related discovery context, not a sourced relationship for ${project.name}.` : `No reviewed relationship to ${project.name} is established; project-level research is required.`}</p>}
           <a href="#home" className="mt-3 inline-block text-xs text-[#255bb7] underline">Explore a related project or start research on Home</a>
        </div>}
      </div>
      <p className="text-xs leading-5 text-[#60707d]">No fund is assumed. Portfolio relevance requires your actual holdings, weights and the issuer’s contractual dependence on this facility.</p>
    </section>
  );
}