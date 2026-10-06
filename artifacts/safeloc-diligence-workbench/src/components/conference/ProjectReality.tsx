import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useDiligence, type EvidenceItem } from "@/context/DiligenceContext";
import { ClaimCitation } from "@/components/ClaimCitation";
import { ClassificationBadge } from "@/components/Shell";
import { EvidenceRoom } from "@/pages/EvidenceRoom";
import { CAPACITY_MW_MAX } from "@/model/assumptionBinding";
import { ResearchResultSummary } from "./ResearchResultSummary";
import { ResearchFindingsSection } from "@/components/ResearchFindingsDisplay";
import { evidenceDisplayLabel, hasCapacityDurationMismatch, getResearchResultPresentation, getCommunityResultPresentation } from "@/model/researchResultPresentation";

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
  const {
    evidence,
    project,
    activeProjectContext,
    capacityClaimCandidate,
    acceptCapacityClaim,
    rejectCapacityClaim,
    illustrativeCapacityMW,
    setIllustrativeCapacityMW,
    capacityDecisionTrail,
  } = useDiligence();
  const [capacityInputError, setCapacityInputError] = useState<string | null>(null);
  const community = getCommunityResultPresentation(evidence, project);
  const updateIllustrativeCapacity = (rawValue: string) => {
    if (!rawValue.trim()) {
      setCapacityInputError(null);
      setIllustrativeCapacityMW(null);
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0 || value > CAPACITY_MW_MAX || !setIllustrativeCapacityMW(value)) {
      setCapacityInputError(`Enter a capacity greater than 0 and no more than ${CAPACITY_MW_MAX.toLocaleString("en-US")} MW.`);
      return;
    }
    setCapacityInputError(null);
  };
  return (
    <section
      data-testid="conference-view-reality"
      data-project-id={activeProjectContext?.projectId ?? ""}
      data-research-run-id={activeProjectContext?.researchRunId ?? ""}
      className="space-y-5"
    >
       <div><h2 className="text-xl font-semibold tracking-tight">What was found, and what remains unresolved?</h2></div>
       <button type="button" onClick={() => { onEvidenceOpenChange(true); requestAnimationFrame(() => document.getElementById("conference-evidence-detail")?.scrollIntoView({ block: "start" })); }} className="min-h-10 rounded-md bg-[#122232] px-4 text-xs font-semibold text-white">{getResearchResultPresentation(project, evidence).nextAction}</button>
       <ResearchFindingsSection findings={project.findings} topicCoverage={project.topicCoverage} evidenceLabels={evidence} />
       <ResearchResultSummary />
       {project.kind === "custom" && <details className="rounded-xl border border-[#aac6f4] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Explore illustrative scenario · explicit opt-in</summary><section data-testid="reality-capacity-review" className="mt-4">
        <h3 className="font-semibold text-[#122232]">Capacity review · illustrative modeling only</h3>
        {capacityClaimCandidate ? <>
          <p className="mt-2 text-xs leading-5 text-[#52616b]">A qualifying candidate is available for a user to accept into their scenario. A candidate alone does not create a model input.</p>
          <div data-testid="reality-capacity-candidate" className="mt-3 rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-3 text-xs leading-5">
            <p><strong>Capacity:</strong> {capacityClaimCandidate.claim.value} {capacityClaimCandidate.claim.unit} {capacityClaimCandidate.claim.powerMeasure}</p>
            <p><strong>Scope:</strong> {capacityClaimCandidate.claim.scope.kind === "campus"
              ? `Campus${capacityClaimCandidate.claim.scope.campusId ? ` · ${capacityClaimCandidate.claim.scope.campusId}` : ""}`
              : capacityClaimCandidate.claim.scope.kind === "phase"
                ? `Phase ${capacityClaimCandidate.claim.scope.phaseId} · ${capacityClaimCandidate.claim.scope.buildingCount} buildings`
                : `Building ${capacityClaimCandidate.claim.scope.buildingId}`}</p>
            <p><strong>Date:</strong> {capacityClaimCandidate.claim.sourceDate}</p>
            <p><strong>Source:</strong> <a href={capacityClaimCandidate.claim.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-[#255bb7] underline">{capacityClaimCandidate.claim.sourceTitle}</a></p>
          </div>
           <p className="mt-3 text-xs text-[#60707d]">This qualifying scoped capacity can enable the existing synthetic model. Accepting capacity does not accept any financial finding.</p>
           <div className="mt-3 flex flex-wrap gap-2">
            <button data-testid="reality-capacity-accept" type="button" onClick={acceptCapacityClaim} className="min-h-10 rounded-md bg-[#0b7a63] px-3 text-xs font-semibold text-white">Accept candidate</button>
            <button data-testid="reality-capacity-reject" type="button" onClick={rejectCapacityClaim} className="min-h-10 rounded-md border border-[#ba2f45] px-3 text-xs font-semibold text-[#ba2f45]">Reject candidate</button>
           </div>
        </> : <p className="mt-2 text-xs leading-5 text-[#60707d]">No qualifying whole-campus capacity candidate is available. You can still enter an explicitly illustrative scenario input below.</p>}
        <div className="mt-4 border-t border-[#e5eae8] pt-4">
          <label htmlFor="reality-illustrative-capacity" className="block text-xs font-semibold text-[#122232]">Illustrative capacity (MW)</label>
          <p className="mt-1 text-[11px] leading-5 text-[#60707d]">This analyst-entered scenario value is not sourced project capacity. Clear it to leave capacity unset.</p>
          <input
            id="reality-illustrative-capacity"
            data-testid="input-reality-illustrative-capacity"
            aria-label="Illustrative capacity (MW)"
            type="number"
            min="0.1"
            max={CAPACITY_MW_MAX}
            step="0.1"
            value={illustrativeCapacityMW ?? ""}
            onChange={(event) => updateIllustrativeCapacity(event.currentTarget.value)}
            className="mt-2 min-h-10 w-full max-w-xs rounded-md border border-[#cbd8d4] px-3 text-sm"
          />
          {capacityInputError && <p role="alert" className="mt-2 text-xs text-[#ba2f45]">{capacityInputError}</p>}
          <p data-testid="reality-capacity-review-status" role="status" className="mt-2 text-[10px] text-[#60707d]">
            {capacityDecisionTrail.length
              ? `Latest capacity review: ${capacityDecisionTrail[capacityDecisionTrail.length - 1].action}.`
              : "No capacity candidate decision recorded."}
          </p>
        </div>
       </section></details>}
      {project.replay?.mode === "offline-saved-response" && <div data-testid="offline-replay-label" className="rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-4 py-3 text-xs text-[#6f460e]"><strong>Offline replay of saved research</strong> · No live provider request was made. The original run remains partial, and retained passages are untrusted research material until scoped below.</div>}
       {!evidenceOpen && <>
      {project.canonicalDossier && project.canonicalProvenance?.length ? <details data-testid="canonical-provenance" className="rounded-xl border border-[#cbd8d4] bg-white px-5">
        <summary className="cursor-pointer py-4 text-sm font-semibold">
          Canonical source lineage
          <span className="ml-3 text-xs font-normal text-[#60707d]">
            {project.canonicalProvenance.length} retained provenance records · evidence and conflicts shown separately
          </span>
        </summary>
        <div className="space-y-3 border-t border-[#e5eae8] pb-5 pt-4">
          {project.canonicalProvenance.map((record, index) => <article key={`${record.provenanceType}-${record.url}-${record.variableId ?? index}`} className="rounded-md bg-[#f6f8f6] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">{record.title}</h4>
                <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#60707d]">
                  {record.provenanceType === "ownership-conflict" ? "Ownership conflict record" : `Evidence claim${record.variableId ? ` · ${record.variableId}` : ""}`}
                  {record.attributedTo ? ` · attributed to ${record.attributedTo}` : ""}
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${record.provenanceType === "ownership-conflict" ? "bg-[#fff0db] text-[#805000]" : "bg-[#e6f1ec] text-[#365b4c]"}`}>
                {record.provenanceType === "ownership-conflict" ? "Conflict retained" : "Claim source"}
              </span>
            </div>
            {record.claim && <p className="mt-2 text-xs leading-5 text-[#52616b]">{record.claim}</p>}
            <a href={record.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs text-[#255bb7] underline">
              <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />{record.url}
            </a>
            <p className="mt-1 text-[11px] text-[#60707d]">
              {record.publisher}{record.publishedAt ? ` · published ${record.publishedAt}` : ""}{record.accessedAt ? ` · accessed ${record.accessedAt}` : ""}
            </p>
            <blockquote className="mt-2 border-l-2 border-[#b7c9c0] pl-3 text-xs italic leading-5 text-[#52616b]">{record.exactPassage}</blockquote>
          </article>)}
        </div>
      </details> : null}
      <div className="rounded-xl border border-[#cbd8d4] bg-white px-5">
        {categories.map((category) => <details key={category.name} data-testid={`reality-category-${category.name.toLowerCase()}`} className="border-b border-[#e5eae8]">
          <summary className="cursor-pointer py-4 text-sm font-semibold">{category.name}<span className="ml-3 text-xs font-normal text-[#60707d]">Evidence &amp; citations</span></summary>
          <div className="space-y-3 pb-4">{category.ids.flatMap((id) => evidence[id] ? [evidence[id]] : []).map((item) => <article key={item.id} className="rounded-md bg-[#f6f8f6] p-3">
             <div className="flex flex-wrap justify-between gap-2"><h4 className="text-sm font-semibold">{evidenceDisplayLabel(item)}</h4><ClassificationBadge value={hasCapacityDurationMismatch(item) ? "Missing Evidence" : item.classification} compact /></div>
             <p className="mt-2 text-sm">{item.value}</p><p className="mt-2 text-xs leading-5 text-[#52616b]">{hasCapacityDurationMismatch(item) ? "Capacity assertion only; incorrectly typed underlying record is not an interconnection-duration finding or model input." : item.description}</p>
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