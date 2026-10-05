import React from "react";
import type { ReportedResearchFinding } from "../services/researchProjectService";

export function ReportedResearchFindings({ findings, testId = "reported-research-findings" }: {
  findings?: ReportedResearchFinding[];
  testId?: string;
}) {
  if (!findings?.length) return null;
  return <section data-testid={testId} className="rounded-xl border border-[#d9e0e4] bg-white p-4 [overflow-wrap:anywhere]">
    <h3 className="font-semibold text-[#122232]">Reported findings</h3>
    <p className="mt-1 text-xs text-[#60707d]">Quoted reporting. Facility identity and financial eligibility are separate checks.</p>
    <ul className="mt-3 space-y-4">{findings.map((finding) => <li key={finding.id} className="border-t border-[#e8ecef] pt-3 text-sm leading-5">
      <p className="font-medium text-[#122232]">{finding.statement}</p>
      <span className={`mt-2 inline-block rounded px-2 py-1 text-[11px] font-semibold ${finding.identityScope === "exact-project" ? "bg-[#eef4ed] text-[#365b4c]" : "bg-[#fff8e9] text-[#805000]"}`}>
        {finding.identityScope === "exact-project" ? "Matches requested project" : "Facility scope unconfirmed"}
      </span>
      <p className="mt-2 text-xs text-[#52616b]">Facility as stated: {finding.facilityScope ?? "Not stated"} · Phase as stated: {finding.phaseScope ?? "Not stated"}</p>
      <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs text-[#255bb7] underline">{finding.sourceTitle}</a>
      <p className="mt-1 text-xs text-[#60707d]">{finding.publisher ?? "Publisher not recorded"} · Published {finding.publicationDate ?? "date unavailable"} · Retrieved {finding.retrievedAt ?? "date unavailable"}</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer py-1 text-[#255bb7]">Exact source passage</summary>
        <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-[#cbd8d4] pl-3 text-[#344550]">{finding.exactQuotation}</blockquote>
      </details>
      <p className="mt-2 text-xs font-semibold text-[#52616b]">Not used in the financial model.</p>
    </li>)}</ul>
  </section>;
}