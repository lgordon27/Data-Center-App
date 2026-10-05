import { useDiligence, type EvidenceItem } from "@/context/DiligenceContext";
import { RetainedResearchFindings } from "@/components/RetainedResearchFindings";
import { ReportedResearchFindings } from "@/components/ReportedResearchFindings";
import { ClaimCitation } from "@/components/ClaimCitation";
import { evidenceDisplayLabel, getResearchResultPresentation, shortSourceText, unresolvedEvidenceReason } from "@/model/researchResultPresentation";

function SourceRecord({ item }: { item: EvidenceItem }) {
  const sources = item.sources ?? [];
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-[#255bb7]">Source and original passage</summary>
    <p className="mt-2 text-[#60707d]">{item.classification} · {item.sourceRole} · {item.sourceRelevance ?? "Scope not recorded"}{item.modelClassification && item.modelClassification !== "Verified Evidence" ? " · Model treatment remains an inference" : ""}</p>
    {item.claimIds?.map((id) => <ClaimCitation key={id} claimId={id} />)}
    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-[#255bb7] underline">{item.sourceTitle ?? "Recorded source"}</a>}
    {sources.map((source, index) => <div key={`${source.url}-${index}`} className="mt-3">
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-all text-[#255bb7] underline">{source.title}</a>
      <p className="text-[#60707d]">Published {source.publishedAt ?? "date unavailable"} · {source.relationship ?? "Relationship not recorded"} · {source.exactProject === true ? "Exact project" : "Project scope not established"}</p>
      <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-[#cbd8d4] pl-3">{source.accessOutcome?.passage ?? source.claimPassage ?? source.excerpt ?? "Original passage not recorded."}</blockquote>
    </div>)}
    {!sources.length && <p className="mt-2 text-[#60707d]">Original passage not recorded here. Recorded citation: {item.citation || "unavailable"}.</p>}
    {item.conflictSummary && <p className="mt-2 text-[#805000]">Recorded conflict note (validation and attribution retained separately): {item.conflictSummary}</p>}
  </details>;
}

/** Both result surfaces consume this same interpretation, not parallel summary state. */
export function ResearchResultSummary({ audience = "reality" }: { audience?: "reality" | "advisor" }) {
  const { project, evidence } = useDiligence();
  const result = getResearchResultPresentation(project, evidence);
  const unresolved = [
    ...result.open.map((item) => ({ id: item.id, label: evidenceDisplayLabel(item), reason: unresolvedEvidenceReason(item, project), item })),
    ...result.categories.map((category) => ({ ...category, item: undefined })),
  ];
  const renderUnresolved = (entries: typeof unresolved) => <ul className="mt-3 space-y-3">{entries.map((entry) => <li key={entry.id} data-evidence-id={entry.id} className="text-sm leading-5">
    <strong>{entry.label}</strong><p className="mt-1 text-xs text-[#52616b]">{entry.reason}</p>{entry.item && <SourceRecord item={entry.item} />}
  </li>)}</ul>;
  return <div className="space-y-4 [overflow-wrap:anywhere]">
    <div className="grid gap-4 md:grid-cols-2">
      <section data-testid={`${audience}-evidence-established`} className="rounded-xl border border-[#cbd8d4] bg-white p-4">
        <h3 className="font-semibold text-[#365b4c]">Established structured evidence</h3>
        <ul className="mt-3 space-y-3">{result.facts.map((item) => <li key={item.id} data-evidence-id={item.id} className="text-sm leading-5">
          <strong>{item.label}:</strong> {shortSourceText(String(item.value))}
          <p className="mt-1 text-xs text-[#60707d]">{item.sourceTitle ?? item.sources?.[0]?.title ?? item.sourceRole} · Published {item.sourcePublishedAt ?? item.sources?.[0]?.publishedAt ?? "date unavailable"} · {item.sourceRelevance ?? "Scope not recorded"}</p>
          <SourceRecord item={item} />
        </li>)}</ul>
        {!result.facts.length && <p className="mt-3 text-sm text-[#60707d]">Not established in this run. Retained passages below are not promoted to structured facts.</p>}
        {result.established.length > 3 && <details className="mt-3 text-xs"><summary className="cursor-pointer">All established records ({result.established.length})</summary>{result.established.slice(3).map((item) => <div key={item.id} className="mt-3"><strong>{item.label}:</strong> {shortSourceText(String(item.value))}<SourceRecord item={item} /></div>)}</details>}
      </section>
      <section data-testid={`${audience}-evidence-open`} className="rounded-xl border border-[#e3d4b6] bg-[#fffbf2] p-4">
        <h3 className="font-semibold text-[#805000]">Unresolved items</h3>
        <p className="mt-1 text-xs text-[#60707d]">Recorded order, not a materiality ranking.</p>
        {renderUnresolved(unresolved.slice(0, 3))}
        {!unresolved.length && <p className="mt-3 text-xs text-[#60707d]">No unresolved items recorded. This is not a completeness guarantee.</p>}
        {unresolved.length > 3 && <details className="mt-3 text-xs"><summary className="cursor-pointer py-2">Show remaining {unresolved.length - 3} unresolved items</summary>{renderUnresolved(unresolved.slice(3))}</details>}
      </section>
    </div>
    <ReportedResearchFindings findings={project.reportedFindings} testId={`${audience}-reported-findings`} />
    <section data-testid={`${audience}-evidence-reported`} className="rounded-xl border border-[#d9e0e4] bg-white p-4">
      <h3 className="font-semibold text-[#805000]">Retained reporting and context</h3>
      <p className="mt-1 text-xs text-[#60707d]">Attribution and applicability remain separate from structured validation. No financial effect is implied.</p>
      {result.structuredReports.map((item) => <div key={item.id} className="mt-3 text-sm"><strong>{item.label}:</strong> {shortSourceText(String(item.value))}
        <p className="mt-1 text-xs text-[#60707d]">{item.classification} · {item.sourceTitle ?? item.sources?.[0]?.title ?? item.sourceRole} · Published {item.sourcePublishedAt ?? item.sources?.[0]?.publishedAt ?? "date unavailable"} · {item.sourceRelevance ?? "Scope not recorded"}</p>
        <SourceRecord item={item} /></div>)}
      {!result.reported.length && <p className="mt-3 text-xs text-[#60707d]">No retained reporting or context in this record; this does not establish public-record absence.</p>}
      <RetainedResearchFindings testId={audience === "advisor" ? "advisor-retained-research" : "retained-research-findings"} findings={result.retained} audit={project.retainedFindingAudit} evidence={evidence} />
    </section>
    <details className="rounded-lg border border-[#d9e0e4] bg-white px-4 text-xs">
      <summary className="cursor-pointer py-3">Financial inputs and assessment boundary</summary>
      <p className="pb-2 text-[#60707d]">Financial readiness: {result.readiness}. Proposal eligibility does not mean human acceptance.</p>
      <ul className="space-y-2 pb-3">{result.acceptedFinancialInputs.map((item) => <li key={item.id}><strong>{item.label}:</strong> {item.value} · explicitly accepted input; validation: {item.semanticValidationStatus ?? "not recorded"}<SourceRecord item={item} /></li>)}</ul>
      {!result.acceptedFinancialInputs.length && <p className="pb-3 text-[#60707d]">No explicitly accepted research financial inputs recorded. Synthetic baseline assumptions are separate.</p>}
    </details>
  </div>;
}