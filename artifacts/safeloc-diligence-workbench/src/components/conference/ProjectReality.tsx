import { ChevronDown, ExternalLink } from "lucide-react";
import { useDiligence, type EvidenceItem } from "@/context/DiligenceContext";
import { ClaimCitation } from "@/components/ClaimCitation";
import { ClassificationBadge } from "@/components/Shell";
import { EvidenceRoom } from "@/pages/EvidenceRoom";
import { getCommunityDocumentation, getConferenceEvidenceSummary } from "@/model/conferenceEvidence";

const categories = [
  { name: "Power", ids: ["grid_interconnection", "electricity_cost", "electricity_escalation", "backup_power_capacity", "renewable_percentage"] },
  { name: "Water", ids: ["water_consumption", "water_rights", "water_source_resilience", "water_escalation"] },
  { name: "Construction", ids: ["permitting_timeline", "cooling_capex", "customer_concentration"] },
  { name: "Climate", ids: ["site_hazard_exposure", "downtime_cost", "carbon_compliance"] },
];
export function EvidenceCitations({ item }: { item: EvidenceItem }) {
  const urls = [...new Set([item.sourceUrl, ...(item.sources ?? []).map((source) => source.url)].filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)))];
  return <div className="mt-2 space-y-1">
    {item.claimIds?.map((id) => <ClaimCitation key={id} claimId={id} />)}
    {urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 pr-3 text-xs text-[#255bb7] underline"><ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />Source {index + 1}</a>)}
  </div>;
}

export function ProjectReality({ evidenceOpen, onEvidenceOpenChange, onNavigate }: {
  evidenceOpen: boolean; onEvidenceOpenChange: (open: boolean) => void; onNavigate: (screen: string) => void;
}) {
  const { evidence, project } = useDiligence();
  const { facts, unresolved } = getConferenceEvidenceSummary(evidence, project);
  const community = getCommunityDocumentation(evidence, project);
  return (
    <section data-testid="conference-view-reality" className="space-y-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">02 / Check the physical reality</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">What is established—and what is still open?</h2><p className="mt-2 text-xs text-[#60707d]">{project.name} · Public facts and unresolved terms</p></div>
      {!evidenceOpen && <><div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[#cbd8d4] bg-white p-5">
          <h3 className="font-semibold text-[#365b4c]">{project.canonicalDossier ? "Top accepted findings" : "Top verified facts"}</h3>
          <ul className="mt-3 space-y-3">{facts.map((item) => <li key={item.id} className="text-sm leading-5"><strong>{item.label}:</strong> {item.value}<p className="mt-1 text-[11px] text-[#60707d]">{item.sourceRole}{item.modelClassification && item.modelClassification !== "Verified Evidence" ? " · Model treatment remains an inference." : ""}</p><EvidenceCitations item={item} /></li>)}</ul>
          {!facts.length && <p className="mt-3 text-sm text-[#60707d]">No source-backed verified facts established in this record.</p>}
        </section>
        <section className="rounded-xl border border-[#e3d4b6] bg-[#fffbf2] p-5">
          <h3 className="font-semibold text-[#805000]">Top three unresolved items</h3>
          <ul className="mt-3 space-y-3">{unresolved.map((item) => <li key={item.id} className="text-sm leading-5"><strong>{item.label}</strong><p className="mt-1 text-xs text-[#52616b]">{item.classification} · source terms require review.</p></li>)}</ul>
          {!unresolved.length && <p className="mt-3 text-sm text-[#60707d]">No unresolved items in the available record. This is not a completeness guarantee.</p>}
        </section>
      </div>
      <div className="rounded-xl border border-[#cbd8d4] bg-white px-5">
        {categories.map((category) => <details key={category.name} data-testid={`reality-category-${category.name.toLowerCase()}`} className="border-b border-[#e5eae8]">
          <summary className="cursor-pointer py-4 text-sm font-semibold">{category.name}<span className="ml-3 text-xs font-normal text-[#60707d]">Evidence &amp; citations</span></summary>
          <div className="space-y-3 pb-4">{category.ids.flatMap((id) => evidence[id] ? [evidence[id]] : []).map((item) => <article key={item.id} className="rounded-md bg-[#f6f8f6] p-3">
            <div className="flex flex-wrap justify-between gap-2"><h4 className="text-sm font-semibold">{item.label}</h4><ClassificationBadge value={item.classification} compact /></div>
            <p className="mt-2 text-sm">{item.value}</p><p className="mt-2 text-xs leading-5 text-[#52616b]">{item.description}</p>
            <p className="mt-2 text-xs italic text-[#60707d]">{item.citation}</p><EvidenceCitations item={item} />
          </article>)}</div>
        </details>)}
        <details data-testid="reality-category-community">
          <summary className="cursor-pointer py-4 text-sm font-semibold">Community<span className="ml-3 text-xs font-normal text-[#60707d]">Documentation, not a rating</span></summary>
          <div data-testid="community-documentation" className="space-y-3 pb-5">
            {community.statuses.map((status) => <article key={status.label} className="rounded-md bg-[#f6f8f6] p-3"><h4 className="text-sm font-semibold">{status.label}</h4><p className="mt-2 text-xs leading-5 text-[#52616b]">{status.detail}</p>
              {status.sourceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block pr-3 text-xs text-[#255bb7] underline">Supporting source {index + 1}</a>)}
            </article>)}
            <p className="text-xs leading-5 text-[#60707d]">An executed agreement, proposed agreement, voluntary plan, ordinance or permit condition, public commitment and documented opposition are distinct evidence types—not interchangeable assurances.</p>
            <p data-testid="community-benchmark-boundary" className="text-xs font-semibold text-[#805000]">Benchmark examples are comparison context, never project-specific evidence. Review comparisons in the Detailed Evidence Record.</p>
            {evidence.community_risk && <div className="rounded-md border border-[#e5eae8] p-3"><h4 className="text-sm font-semibold">{evidence.community_risk.label}</h4><p className="mt-2 text-xs leading-5">{evidence.community_risk.description}</p><EvidenceCitations item={evidence.community_risk} /></div>}
          </div>
        </details>
      </div>
      </>}
      <div className="rounded-lg border border-[#cbd8d4] bg-white">
        <button type="button" data-testid="button-detailed-evidence" aria-expanded={evidenceOpen} aria-controls="conference-evidence-detail" onClick={() => onEvidenceOpenChange(!evidenceOpen)} className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm font-semibold">
          Detailed Evidence Record<ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />
        </button>
        {evidenceOpen && <div id="conference-evidence-detail" className="min-w-0 border-t border-[#e5eae8] p-3 sm:p-5"><EvidenceRoom onNavigate={onNavigate} showModelConfidence={false} /></div>}
      </div>
    </section>
  );
}