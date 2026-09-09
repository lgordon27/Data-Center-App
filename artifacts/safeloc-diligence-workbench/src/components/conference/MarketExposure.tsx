import { ArrowRight, Building2, ExternalLink } from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { COMPANY_PROFILES } from "@/data/companyExposure";
import { getConferenceRelationship } from "@/model/conferenceEvidence";

export function MarketExposure() {
  const { project, originatingCompany, resetToDefault } = useDiligence();
  const relationship = getConferenceRelationship(project, originatingCompany);
  const options = COMPANY_PROFILES.filter((company) => getConferenceRelationship(project, company.key).established);
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
          {project.kind === "curated" && options.length > 0 && <label className="text-xs text-[#52616b]">Select a holding in this demonstration
            <select aria-label="Select public holding" data-testid="market-company-select" value={relationship.company?.key ?? ""} onChange={(event) => { if (event.target.value) resetToDefault(event.target.value); }}
              className="mt-1 block min-h-11 w-full rounded-md border border-[#cbd8d4] bg-[#f9faf8] px-3 text-sm text-[#122232]">
              <option value="" disabled>Choose a company</option>
              {options.map((company) => <option key={company.key} value={company.key}>{company.displayName} ({company.ticker})</option>)}
            </select>
            <span className="mt-1 block max-w-xs text-[10px]">Loads the curated starting case; named scenarios are retained.</span>
          </label>}
        </div>
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
          <a href="#home" className="mt-3 inline-block text-xs text-[#255bb7] underline">Explore companies or open the curated demonstration</a>
        </div>}
      </div>
      <p className="text-xs leading-5 text-[#60707d]">No fund is assumed. Portfolio relevance requires your actual holdings, weights and the issuer’s contractual dependence on this facility.</p>
    </section>
  );
}