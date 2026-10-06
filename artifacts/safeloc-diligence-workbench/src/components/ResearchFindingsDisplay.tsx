import type { MouseEvent } from "react";
import { ExternalLink } from "lucide-react";
import {
  RESEARCH_FINDING_TOPICS,
  type ResearchFinding,
  type ResearchFindingKind,
  type ResearchTopicCoverageMap,
} from "@/types/researchFindings";
import {
  groupResearchFindings,
  rankAdvisorResearchFindings,
  researchFindingTopicLabel,
} from "@/model/researchFindingsPresentation";

const kindPresentation: Record<ResearchFindingKind, { label: string; style: string }> = {
  reported: { label: "Reported", style: "border-[#aac6f4] bg-[#eef5ff] text-[#255bb7]" },
  plan: { label: "Plan", style: "border-[#b8c9e9] bg-[#f1f5fc] text-[#394f78]" },
  estimate: { label: "Estimate", style: "border-[#f1cb8b] bg-[#fff8e9] text-[#805000]" },
  disputed: { label: "Disputed", style: "border-[#edbec4] bg-[#fff3f4] text-[#8a3442]" },
};

const coveragePresentation = {
  "analyzed-findings": {
    label: "Found",
    style: "border-[#9bd8c5] bg-[#eff8f4] text-[#08644f]",
    accessible: "Findings reported",
  },
  "analyzed-nothing-found": {
    label: "Nothing found",
    style: "border-[#cbd8d4] bg-[#f5f7f6] text-[#52616b]",
    accessible: "Nothing found after analysis",
  },
  "not-analyzed": {
    label: "Not analyzed · incomplete",
    style: "border-[#f1cb8b] bg-[#fff8e9] text-[#805000]",
    accessible: "Not analyzed; coverage is incomplete",
  },
} as const;

type FindingsDisplayProps = {
  findings?: ResearchFinding[];
  topicCoverage?: ResearchTopicCoverageMap;
  evidenceLabels?: Record<string, { label: string } | undefined>;
};

function CoverageStrip({ coverage }: { coverage?: ResearchTopicCoverageMap }) {
  const topics = RESEARCH_FINDING_TOPICS.flatMap((topic) => coverage?.[topic]
    ? [{ topic, ...coverage[topic]! }]
    : []);
  const incomplete = topics.filter((entry) => entry.state === "not-analyzed");
  return (
    <div data-testid="research-topic-coverage" className="rounded-lg border border-[#d9e0e4] bg-[#f8fafb] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#52616b]">Topic coverage</p>
      {topics.length ? (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Research topic coverage">
          {topics.map((entry) => {
            const status = coveragePresentation[entry.state];
            return <li key={entry.topic}>
              <span
                data-testid={`coverage-${entry.topic}`}
                aria-label={`${researchFindingTopicLabel(entry.topic)}: ${status.accessible}`}
                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${status.style}`}
              >
                {researchFindingTopicLabel(entry.topic)} · {status.label}
              </span>
            </li>;
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[#60707d]">Topic coverage was not recorded for this run.</p>
      )}
      {incomplete.length > 0 && <details className="mt-2 text-xs text-[#52616b]">
        <summary className="w-fit cursor-pointer py-1 font-semibold">Why some topics were not analyzed</summary>
        <ul className="mt-2 space-y-1">
          {incomplete.map((entry) => <li key={entry.topic}>
            <strong>{researchFindingTopicLabel(entry.topic)}:</strong> {entry.reason ?? "No reason was recorded."}
          </li>)}
        </ul>
      </details>}
    </div>
  );
}

function FindingCard({
  finding,
  evidenceLabels,
  testPrefix = "research-finding",
}: {
  finding: ResearchFinding;
  evidenceLabels?: FindingsDisplayProps["evidenceLabels"];
  testPrefix?: string;
}) {
  const kind = kindPresentation[finding.kind];
  const hasScope = finding.scope.entityRoles.length > 0
    || Boolean(finding.scope.facility || finding.scope.phase || finding.scope.timeframe);
  const mappingLabel = finding.proposedModelMapping
    ? evidenceLabels?.[finding.proposedModelMapping.evidenceId]?.label ?? finding.proposedModelMapping.evidenceId
    : null;
  return (
    <article
      data-testid={`${testPrefix}-${finding.findingId}`}
      className="min-w-0 rounded-lg border border-[#cbd8d4] bg-white p-3 text-xs leading-5"
    >
      <div className="flex flex-wrap gap-2">
        <span
          aria-label={`Finding type: ${kind.label}`}
          className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${kind.style}`}
        >
          {kind.label}
        </span>
        <span
          aria-label={finding.projectMatch === "matches-requested-project" ? "Matches requested project" : "Facility scope unconfirmed"}
          className={`rounded-full border px-2 py-1 text-[9px] font-bold ${finding.projectMatch === "matches-requested-project"
            ? "border-[#9bd8c5] bg-[#eff8f4] text-[#08644f]"
            : "border-[#f1cb8b] bg-[#fff8e9] text-[#805000]"}`}
        >
          {finding.projectMatch === "matches-requested-project" ? "Matches requested project" : "Facility scope unconfirmed"}
        </span>
      </div>
      <p className="mt-2 font-semibold text-[#122232]">{finding.statement}</p>
      <a
        href={finding.source.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`link-finding-source-${finding.findingId}`}
        className="mt-2 inline-flex max-w-full items-center gap-1 break-words text-[#255bb7] underline"
      >
        <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span>{finding.source.title}</span>
      </a>
      <p className="mt-1 text-[#60707d]">
        {finding.source.publisher ?? "Publisher not recorded"} · Published {finding.source.publishedAt ?? "date unavailable"}
        {finding.source.retrievedAt && <> · Retrieved {finding.source.retrievedAt}</>}
      </p>
      {hasScope && <div className="mt-2 space-y-1 text-[#52616b]" data-testid={`finding-scope-${finding.findingId}`}>
        {finding.scope.entityRoles.length > 0 && <p>
          <strong>Entities:</strong>{" "}
          {finding.scope.entityRoles.map(({ name, role }) => `${name} · ${role}`).join("; ")}
        </p>}
        {finding.scope.facility && <p><strong>Facility:</strong> {finding.scope.facility}</p>}
        {finding.scope.phase && <p><strong>Phase:</strong> {finding.scope.phase}</p>}
        {finding.scope.timeframe && <p><strong>Timeframe:</strong> {finding.scope.timeframe}</p>}
      </div>}
      <details className="mt-2 rounded-lg border border-[#d9e0e4] p-2">
        <summary className="cursor-pointer py-1 font-semibold text-[#255bb7]">Exact source passage</summary>
        <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-[#aac6f4] pl-3 text-[#344550]">
          <span className="sr-only">Exact verified quotation: </span>{finding.exactQuotation}
        </blockquote>
      </details>
      <p className="mt-2 border-t border-[#e8ecef] pt-2 text-[11px] font-semibold text-[#52616b]">
        {mappingLabel
          ? <>Proposed model input — not accepted · {mappingLabel}</>
          : "Not used in the financial model."}
      </p>
    </article>
  );
}

export function ResearchFindingsSection({
  findings,
  topicCoverage,
  evidenceLabels,
}: FindingsDisplayProps) {
  if (findings === undefined) return null;
  const groups = groupResearchFindings(findings);
  return (
    <section id="research-findings" data-testid="research-findings" className="space-y-4 rounded-xl border border-[#aac6f4] bg-white p-4 sm:p-5">
      <div>
        <h3 className="text-lg font-semibold text-[#122232]">Findings</h3>
        <p className="mt-1 text-xs leading-5 text-[#52616b]">
          Verified statements from public sources. These are research findings, not accepted financial evidence.
        </p>
      </div>
      <CoverageStrip coverage={topicCoverage} />
      {groups.length === 0 ? (
        <p data-testid="research-findings-empty" className="rounded-lg bg-[#f8fafb] p-3 text-sm text-[#52616b]">
          No verified findings in this run.
        </p>
      ) : groups.map((group) => <section key={group.topic} data-testid={`findings-topic-${group.topic}`} className="space-y-2">
        <h4 className="text-sm font-semibold text-[#122232]">{researchFindingTopicLabel(group.topic)}</h4>
        {group.findings.map((finding) => <FindingCard key={finding.findingId} finding={finding} evidenceLabels={evidenceLabels} />)}
      </section>)}
      <p className="border-t border-[#e8ecef] pt-3 text-[11px] leading-5 text-[#60707d]">
        Findings are display-only research. A proposed mapping is not accepted, and no finding changes financial inputs or model results.
      </p>
    </section>
  );
}

export function AdvisorFindingsSummary({
  findings,
  evidenceLabels,
}: Pick<FindingsDisplayProps, "findings" | "evidenceLabels">) {
  if (findings === undefined) return null;
  const featured = rankAdvisorResearchFindings(findings).slice(0, 5);
  const openFindings = (event: MouseEvent<HTMLAnchorElement>) => {
    const realityTab = document.getElementById("conference-tab-reality");
    if (!(realityTab instanceof HTMLButtonElement)) return;
    event.preventDefault();
    realityTab.click();
    requestAnimationFrame(() => document.getElementById("research-findings")?.scrollIntoView({ block: "start" }));
  };
  return (
    <section data-testid="advisor-public-findings" className="rounded-xl border border-[#aac6f4] bg-white p-4">
      <h3 className="font-semibold text-[#122232]">What public sources say</h3>
      {featured.length ? <ul className="mt-3 space-y-3">
        {featured.map((finding) => {
          const kind = kindPresentation[finding.kind];
          return <li key={finding.findingId} data-testid={`advisor-finding-${finding.findingId}`} className="border-t border-[#e8ecef] pt-3 text-xs leading-5">
            <p className="font-medium text-[#122232]">{finding.statement}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span aria-label={`Finding type: ${kind.label}`} className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${kind.style}`}>{kind.label}</span>
              <span aria-label={finding.projectMatch === "matches-requested-project" ? "Matches requested project" : "Facility scope unconfirmed"} className="rounded-full border border-[#d9e0e4] bg-[#f5f7f6] px-2 py-1 text-[9px] font-semibold text-[#52616b]">
                {finding.projectMatch === "matches-requested-project" ? "Matches requested project" : "Facility scope unconfirmed"}
              </span>
            </div>
            <a href={finding.source.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-words text-[#255bb7] underline">
              <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
              {finding.source.title}
            </a>
            {finding.proposedModelMapping && <p className="mt-1 text-[10px] text-[#60707d]">
              Proposed mapping, not accepted: {evidenceLabels?.[finding.proposedModelMapping.evidenceId]?.label ?? finding.proposedModelMapping.evidenceId}
            </p>}
          </li>;
        })}
      </ul> : <p className="mt-2 text-xs text-[#60707d]">No verified findings in this run.</p>}
      <a
        href="#research-findings"
        onClick={openFindings}
        className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-[#255bb7] underline"
      >
        View complete Findings section
      </a>
    </section>
  );
}
