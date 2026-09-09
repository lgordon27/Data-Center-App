import {
  Fragment,
  useMemo,
  useEffect,
  useRef,
  useState
} from "react";
import {
  PageIntro,
  BottomNav,
  ClassificationBadge,
  ImpactRoleBadge,
  classifications,
  classMeta,
  evidenceCategories
} from "@/components/Shell";

import {
  ChevronDown,
  ExternalLink,
  FileText,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  X
} from "lucide-react";
import { SourceStatusBadge } from "@/components/DataSources";
import {
  EVIDENCE_TIP_DISMISSED_STORAGE_KEY,
  type Classification,
  type EvidenceItem,
  useDiligence
} from "@/context/DiligenceContext";
import { formatSourceTimestamp } from "@/data/sources";
import {
  AI_EVIDENCE_CUTOFF_LABEL,
  AI_EVIDENCE_REPORTING_WINDOW,
  AI_EVIDENCE_TEMPORAL_CONFIG,
  AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL,
} from "@/data/aiEvidenceTemporal.mjs";
import type { EiaElectricityData, EiaFuel } from "@/services/eiaService";
import {
  analyzeEvidence,
  type AIEvidenceResult,
  type AIEvidenceSuccess,
} from "@/services/aiEvidenceService";
import {
  DECISION_HISTORY_EVENT,
  getDecisionHistory,
  logSessionAction,
  recordAIDecision,
  type DecisionHistoryEntry,
} from "@/services/sessionLog";
import type {
  Screen
} from "@/components/Shell";
import { ClaimCitation } from "@/components/ClaimCitation";
import { ResearchSearchAudit } from "@/components/ResearchSearchAudit";
import { formatClaimDate, getClaimSources, type ClaimSourceRecord } from "@/data/claimSources";
import {
  checkResearchStatus,
  researchProject,
  type CustomEvidenceRecord,
  type ResearchProgress,
} from "@/services/researchProjectService";
import {
  COMMUNITY_AGREEMENTS,
  COMMUNITY_PROVIDER_ATTRIBUTION,
  COMMUNITY_SNAPSHOT,
  COMMUNITY_SNAPSHOT_VERSION,
  COMMUNITY_TERM_DEFINITIONS,
  type CommunityConclusion,
  type CommunityTermId,
} from "@/data/communityAgreements";
import { selectCommunityComparisons } from "@/model/communityAgreements";
import { analyzeCommunityTerms, type CommunityAIProposal } from "@/services/communityAgreementService";
import { DrawerField, DrawerSection, useWorkbenchDrawer } from "@/components/ContextDrawer";
import { getMaterialEvidenceGaps } from "@/model/advisorLens";

type AssessmentNotice = "accepted" | "overridden";

type EvidenceFilter = "all" | "material-gaps" | "needs-review" | "verified" | "financial-drivers" | "decision-gates";

const evidenceFilters: { id: EvidenceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "material-gaps", label: "Material gaps" },
  { id: "needs-review", label: "Needs review" },
  { id: "verified", label: "Verified" },
  { id: "financial-drivers", label: "Financial drivers" },
  { id: "decision-gates", label: "Decision gates" },
];

function CommunityAgreementsReview() {
  const {
    project,
    communityReview,
    communityUnresolvedCount,
    reviewCommunityTerm,
  } = useDiligence();
  const [open, setOpen] = useState(false);
  const [expandedTerm, setExpandedTerm] = useState<CommunityTermId | null>(null);
  const [proposal, setProposal] = useState<CommunityAIProposal | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [humanConclusion, setHumanConclusion] = useState<Record<string, CommunityConclusion>>({});
  const [humanClassification, setHumanClassification] = useState<Record<string, "Verified Evidence" | "Management Assertion" | "Model Inference" | "Missing Evidence" | "Not applicable">>({});
  const { openDrawer } = useWorkbenchDrawer();
  const relationship = communityReview.relationship;
  const agreement = relationship.agreementId
    ? COMMUNITY_AGREEMENTS.find((candidate) => candidate.id === relationship.agreementId)
    : undefined;

  useEffect(() => {
    if (proposal) setOpen(true);
  }, [proposal]);

  const setHuman = (id: CommunityTermId, conclusion: CommunityConclusion, classification: "Verified Evidence" | "Management Assertion" | "Model Inference" | "Missing Evidence" | "Not applicable") => {
    reviewCommunityTerm(id, conclusion, classification, "overridden");
    setStatus(`${COMMUNITY_TERM_DEFINITIONS.find((term) => term.id === id)?.label ?? "Term"} saved as a human conclusion.`);
  };

  const acceptProposal = (id: CommunityTermId) => {
    const candidate = proposal?.terms.find((term) => term.id === id);
    if (!candidate) return;
    reviewCommunityTerm(id, candidate.proposedConclusion, candidate.proposedClassification, "accepted");
    setStatus("AI proposal accepted for this term. Human approval is recorded separately from source text.");
  };

  const leaveUnresolved = (id: CommunityTermId) => {
    reviewCommunityTerm(id, "Unknown", "Missing Evidence", "unresolved");
    setStatus("Term left unresolved; no evidence, gap, or financial state was upgraded.");
  };

  const openLibrary = (event: React.MouseEvent<HTMLButtonElement>) => {
    openDrawer({
      key: "community-library",
      kicker: "Benchmark library",
      title: `${COMMUNITY_AGREEMENTS.length} community source records`,
      render: () => (
        <div className="space-y-3">
          <p className="rounded border border-[#cbb7ec] bg-[#f8f4fd] px-3 py-2 text-[10px] leading-4 text-[#5e5870]">Only records with a verified source status are external benchmarks. Unverified comparison candidates remain visible for audit context, but cannot upgrade project evidence.</p>
          {COMMUNITY_AGREEMENTS.map((record) => (
            <article key={record.id} data-testid={`community-library-record-${record.id}`} className="rounded-lg border border-[#d9e0e4] bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#122232]">{record.title}</span>
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#7049b7]">{record.sourceRecordUrl ? "National benchmark" : "Unverified comparison candidate"}</span>
              </div>
               <p className="mt-1 text-[9px] leading-4 text-[#52616b]">{record.sourceSummary}</p>
               <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#7d898f]">Retrieved {record.retrievedAt} · verified {record.lastVerifiedAt}</p>
            </article>
          ))}
        </div>
      ),
    }, { trigger: event.currentTarget });
  };

  const openTermRecord = (definition: (typeof COMMUNITY_TERM_DEFINITIONS)[number], event: React.MouseEvent<HTMLButtonElement>) => {
    const decision = communityReview.terms[definition.id];
    const sourceTerm = agreement?.terms[definition.id];
    const termProposal = proposal?.terms.find((candidate) => candidate.id === definition.id);
    openDrawer({
      key: `community-term:${definition.id}`,
      kicker: "Community term record",
      title: definition.label,
      render: () => (
        <div className="space-y-4">
          <DrawerSection label="Source excerpt">
            <p><strong>Verbatim quotation:</strong> {sourceTerm?.sourceExactQuote ?? "No exact quotation captured."}</p>
            <p><strong>Source summary:</strong> {sourceTerm?.sourceSummary ?? "No source summary was captured."}</p>
          </DrawerSection>
          <DrawerSection label="Citation and page reference">
            <p className="font-mono text-[10px] leading-4 text-[#60707d]">{agreement?.sourceTitle ?? "Source title unavailable"} · {sourceTerm?.sourceSectionOrPage ?? "Location unavailable"}</p>
            <p className="text-[10px] font-semibold text-[#8a5200]">External benchmark — not a term of this project. Status: {sourceTerm?.benchmarkStatus ?? "UNKNOWN"}.</p>
          </DrawerSection>
          <DrawerSection label="Human conclusion">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Conclusion" value={decision.conclusion} />
              <DrawerField label="Evidence class" value={decision.classification} />
            </div>
          </DrawerSection>
          <DrawerSection label="AI proposal">
            {termProposal ? (
              <p>{termProposal.proposedConclusion} · {termProposal.reasoning} <span className="block mt-1 text-[#706681]">Source support: {termProposal.sourceSupport}. Suggestion only — nothing applies without a human action.</span></p>
            ) : (
              <p>No AI proposal has been generated for this term in the current session.</p>
            )}
          </DrawerSection>
          <DrawerSection label="Financial treatment">
            <p><strong>{definition.treatment}.</strong> No automatic IRR penalty or model mutation is applied. Only a human-approved, quantified, source-supported driver could be considered for an existing model assumption.</p>
          </DrawerSection>
          <DrawerSection label="Audit history">
            <p className="text-[#7c8b93]">Human review state is recorded separately from imported source facts for snapshot {COMMUNITY_SNAPSHOT_VERSION}; benchmark records are retrieved {COMMUNITY_SNAPSHOT.retrievedAt} and verified {COMMUNITY_SNAPSHOT.reviewedAt}.</p>
          </DrawerSection>
        </div>
      ),
    }, { trigger: event.currentTarget, returnFocusSelector: `[data-testid='community-term-row-${definition.id}'] button` });
  };

  return (
    <details
      id="evidence-item-community-agreements"
      data-testid="community-agreements-group"
      open={open}
      tabIndex={-1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) setOpen(true);
      }}
      className="group mt-5 scroll-mt-28 rounded-xl border border-[#cbd8d4] bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#b9d43a]"
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
        className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden md:px-5"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#60707d]">Community Agreements</span>
            <span data-testid="community-snapshot-version" className="rounded-full bg-[#eef2f1] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#52616b]">Snapshot {COMMUNITY_SNAPSHOT.version.split(".").at(-1)}</span>
          </span>
          <span className="mt-1 block text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">Community terms, kept separate from project evidence</span>
          <span className="mt-1 block text-[10px] leading-4 text-[#52616b]">
            {relationship.relationship} relationship · {communityUnresolvedCount} unresolved term{communityUnresolvedCount === 1 ? "" : "s"} · {COMMUNITY_AGREEMENTS.length} benchmark records
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#e5eae8] px-4 py-4 md:px-5">
        <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-4">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">Project relationship</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span data-testid="community-relationship" className="rounded-full bg-[#e5efff] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#255bb7]">{relationship.relationship}</span>
              <span data-testid="community-match-confidence" className="font-mono text-[10px] text-[#52616b]">{relationship.confidence}% match confidence · human review {relationship.humanReviewStatus}</span>
            </div>
            {agreement ? (
              <>
                <p data-testid="community-agreement-title" className="mt-3 text-[12px] font-semibold text-[#243844]">{agreement.title}</p>
                <p className="mt-1 text-[10px] leading-4 text-[#52616b]">Matching fields: {relationship.matchingFields.join(" · ")}</p>
                <p data-testid="community-relationship-evidence" className="mt-2 text-[10px] leading-4 text-[#52616b]">{relationship.supportingEvidence.join(" ")}</p>
                <p data-testid="community-relationship-reasoning" className="mt-2 text-[10px] leading-4 text-[#52616b]"><strong>Relationship reasoning:</strong> {relationship.relationshipReasoning}</p>
                {agreement.sourceRecordUrl && <a href={agreement.sourceRecordUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-[#255bb7] underline">Open cited source record <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>}
                {agreement.primaryDocumentUrl && <a href={agreement.primaryDocumentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 ml-3 inline-flex items-center gap-1 text-[9px] font-semibold text-[#255bb7] underline">Open original document <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>}
                {!agreement.primaryDocumentUrl && <p data-testid="community-primary-document-unavailable" className="mt-2 text-[9px] text-[#7d898f]">Original primary document URL not verified in the reviewed snapshot.</p>}
                <div data-testid="community-canonical-relationships" className="mt-3 border-t border-[#d9e0e4] pt-3">
                  <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Canonical project relationships</div>
                  <ul className="mt-2 space-y-2">
                    {relationship.canonicalRelationships.map((mapping) => (
                      <li key={mapping.id} className="rounded border border-[#d9e0e4] bg-white px-2 py-2 text-[9px] leading-4 text-[#52616b]">
                        <strong className="text-[#243844]">{mapping.toLabel}</strong> · <span className="font-mono uppercase text-[#255bb7]">{mapping.relationshipType.replaceAll("-", " ")}</span> · {mapping.relationshipConfidence}% · {mapping.verificationStatus === "source-supported" ? "source-supported" : "UNVERIFIED"}
                        <span className="mt-1 block">{mapping.relationshipReasoning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p data-testid="community-not-found" className="mt-3 rounded border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[10px] leading-4 text-[#6f460e]">{relationship.notFoundText}</p>
            )}
            <p className="mt-3 border-t border-[#d9e0e4] pt-3 text-[9px] leading-4 text-[#7d898f]">Relationship mapping is an interpretive aid; it does not upgrade a term’s evidence classification.</p>
          </div>
          <div className="rounded-lg border border-[#cbb7ec] bg-[#f8f4fd] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#7049b7]">Governed analysis</div>
              <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#706681]">No new web search</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#5e5870]">Analyze with AI can propose classifications from this supplied snapshot only. It cannot change evidence, gaps, recommendations, or returns until a human chooses an action.</p>
            <button data-testid="button-analyze-community-ai" type="button" disabled={analysisBusy} onClick={async () => { setAnalysisBusy(true); setStatus(""); const result = await analyzeCommunityTerms(project); setProposal(result); setAnalysisBusy(false); }} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#7049b7] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-white disabled:cursor-wait disabled:opacity-60"><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />{analysisBusy ? "Analyzing…" : "Analyze with AI"}</button>
            {proposal && <span data-testid="community-ai-proposal-status" className="ml-2 text-[9px] font-semibold text-[#7049b7]">Proposal ready · human action required</span>}
          </div>
        </div>
        {status && <div data-testid="community-live-status" role="status" aria-live="polite" className="mt-3 rounded border border-[#9bd8c5] bg-[#eff8f4] px-3 py-2 text-[10px] font-semibold text-[#08644f]">{status}</div>}
        <div className="mt-4 overflow-x-auto rounded-lg border border-[#d9e0e4]">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <caption className="sr-only">Community Agreements term review, ten terms.</caption>
            <thead className="bg-[#f1f5f3] text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b]">
              <tr><th scope="col" className="px-3 py-3">Term</th><th scope="col" className="px-3 py-3">Treatment</th><th scope="col" className="px-3 py-3">National benchmark</th><th scope="col" className="px-3 py-3">Human conclusion</th><th scope="col" className="px-3 py-3">Review</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e5eae8]">
              {COMMUNITY_TERM_DEFINITIONS.map((definition) => {
                const decision = communityReview.terms[definition.id];
                const sourceTerm = agreement?.terms[definition.id];
                const termProposal = proposal?.terms.find((candidate) => candidate.id === definition.id);
                const selectedConclusion = humanConclusion[definition.id] ?? decision.conclusion;
                const selectedClassification = humanClassification[definition.id] ?? decision.classification;
                const comparisons = selectCommunityComparisons(definition.id);
                const isExpanded = expandedTerm === definition.id;
                return (
                  <Fragment key={definition.id}>
                    <tr id={`evidence-item-community-${definition.id}`} data-testid={`community-term-row-${definition.id}`} className={isExpanded ? "bg-[#fbfcfa]" : undefined}>
                      <th scope="row" className="px-3 py-3 align-top text-[11px] font-semibold text-[#243844]">
                        <button type="button" onClick={() => setExpandedTerm(isExpanded ? null : definition.id)} aria-expanded={isExpanded} aria-controls={`community-detail-${definition.id}`} className="text-left underline decoration-transparent underline-offset-2 hover:decoration-[#255bb7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9d43a]">{definition.label}</button>
                        <span className="mt-1 block text-[9px] font-normal leading-4 text-[#60707d]">{definition.description}</span>
                      </th>
                      <td className="px-3 py-3 align-top"><span data-testid={`community-treatment-${definition.id}`} className="rounded-full bg-[#eef2f1] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#52616b]">{definition.treatment}</span></td>
                       <td className="px-3 py-3 align-top"><span data-testid={`community-benchmark-${definition.id}`} className="font-mono text-[10px] font-bold text-[#7049b7]">{sourceTerm?.benchmarkStatus ?? "UNKNOWN"}</span></td>
                      <td className="px-3 py-3 align-top"><span data-testid={`community-conclusion-${definition.id}`} className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] ${decision.conclusion === "Unknown" ? "bg-[#fde8eb] text-[#ba2f45]" : "bg-[#e0f4ed] text-[#08644f]"}`}>{decision.conclusion}</span></td>
                      <td className="px-3 py-3 align-top"><button type="button" onClick={() => setExpandedTerm(isExpanded ? null : definition.id)} className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#255bb7]">{isExpanded ? "Collapse" : "Review"} <ChevronDown aria-hidden="true" className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} /></button></td>
                    </tr>
                    {isExpanded && (
                      <tr id={`community-detail-${definition.id}`} data-testid={`community-term-detail-${definition.id}`} className="bg-[#fbfcfa]">
                        <td colSpan={5} className="px-3 pb-4 pt-1">
                          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                              <div className="rounded-lg border border-[#d9e0e4] bg-white p-3">
                               <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#60707d]">Source facts · external benchmark</div>
                               <p data-testid={`community-exact-language-${definition.id}`} className="mt-2 text-[10px] leading-4 text-[#344550]"><strong>Verbatim quotation:</strong> {sourceTerm?.sourceExactQuote ?? "No exact quotation captured."}</p>
                               <p data-testid={`community-source-summary-${definition.id}`} className="mt-2 text-[10px] leading-4 text-[#52616b]"><strong>Source summary (not a quotation):</strong> {sourceTerm?.sourceSummary ?? "No source summary was captured."}</p>
                               <div className="mt-3 border-t border-[#e5eae8] pt-2 font-mono text-[9px] leading-4 text-[#60707d]"><strong>Source:</strong> {agreement?.sourceTitle ?? "Unavailable"} · {agreement?.sourceLocation ?? "Location unavailable"} · {sourceTerm?.sourceSectionOrPage ?? "Section unavailable"}</div>
                               {agreement && <p className="mt-2 text-[9px] leading-4 text-[#7d898f]"><strong>Snapshot limitations:</strong> {agreement.limitations.join(" ")} <span className="ml-1">Retrieved {agreement.retrievedAt} · verified {agreement.lastVerifiedAt}.</span></p>}
                              {agreement && <p className="mt-2 text-[9px] leading-4 text-[#7d898f]"><strong>Limitations / licensing:</strong> {agreement.limitations.join(" ")} {agreement.licensing}</p>}
                              {agreement?.sourceRecordUrl && <a href={agreement.sourceRecordUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-[#255bb7] underline">Open cited source <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>}
                              {agreement?.primaryDocumentUrl && <a href={agreement.primaryDocumentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 ml-3 inline-flex items-center gap-1 text-[9px] font-semibold text-[#255bb7] underline">Open original document <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>}
                            </div>
                            <div className="rounded-lg border border-[#cbd8d4] bg-white p-3">
                              <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Human review</div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <label className="text-[9px] font-semibold text-[#52616b]">Conclusion<select data-testid={`select-community-conclusion-${definition.id}`} value={selectedConclusion} onChange={(event) => setHumanConclusion((current) => ({ ...current, [definition.id]: event.target.value as CommunityConclusion }))} className="mt-1 block w-full rounded border border-[#cbd8d4] bg-white px-2 py-2 text-[10px] text-[#243844]"><option>Present</option><option>Partial</option><option>Absent</option><option>Unknown</option><option>Not applicable</option></select></label>
                                <label className="text-[9px] font-semibold text-[#52616b]">Evidence class<select data-testid={`select-community-classification-${definition.id}`} value={selectedClassification} onChange={(event) => setHumanClassification((current) => ({ ...current, [definition.id]: event.target.value as typeof selectedClassification }))} className="mt-1 block w-full rounded border border-[#cbd8d4] bg-white px-2 py-2 text-[10px] text-[#243844]"><option>Verified Evidence</option><option>Management Assertion</option><option>Model Inference</option><option>Missing Evidence</option><option>Not applicable</option></select></label>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" data-testid={`button-save-community-${definition.id}`} onClick={() => setHuman(definition.id, selectedConclusion, selectedClassification)} className="rounded bg-[#122232] px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#d4e86b]">Save human conclusion</button>
                                <button type="button" data-testid={`button-leave-community-${definition.id}`} onClick={() => leaveUnresolved(definition.id)} className="rounded border border-[#efabb8] bg-[#fff3f4] px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#ba2f45]">Leave unresolved</button>
                              </div>
                              {termProposal && <div data-testid={`community-ai-proposal-${definition.id}`} className="mt-3 rounded border border-[#cbb7ec] bg-[#f8f4fd] p-3"><div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#7049b7]">AI proposal · suggestion, not a determination</div><p className="mt-1 text-[10px] leading-4 text-[#5e5870]">{termProposal.proposedConclusion} · {termProposal.reasoning}</p><p className="mt-1 text-[9px] text-[#706681]">Source support: {termProposal.sourceSupport}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" data-testid={`button-accept-community-ai-${definition.id}`} onClick={() => acceptProposal(definition.id)} className="rounded bg-[#7049b7] px-2.5 py-2 font-mono text-[8px] font-bold uppercase text-white">Accept AI Assessment</button><button type="button" data-testid={`button-override-community-ai-${definition.id}`} onClick={() => setHuman(definition.id, selectedConclusion, selectedClassification)} className="rounded border border-[#cbb7ec] bg-white px-2.5 py-2 font-mono text-[8px] font-bold uppercase text-[#7049b7]">Override</button></div></div>}
                              <div className="mt-3 border-t border-[#e5eae8] pt-2 text-[9px] leading-4 text-[#7d898f]">Financial treatment: <strong>{definition.treatment}</strong>. No automatic IRR penalty or model mutation is applied. Only a human-approved, quantified, source-supported driver could be considered for an existing model assumption.</div>
                              <button data-testid={`button-community-drawer-${definition.id}`} type="button" onClick={(event) => openTermRecord(definition, event)} className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md border border-[#cbd8d4] bg-white px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#255bb7] hover:border-[#255bb7]"><FileText aria-hidden="true" className="h-3 w-3" /> Open term record in drawer</button>
                            </div>
                          </div>
                          <details data-testid={`community-comparisons-${definition.id}`} className="mt-3 rounded border border-[#d9e0e4] bg-white">
                            <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#60707d] [&::-webkit-details-marker]:hidden">Up to three national comparisons · complete library disclosure</summary>
                            <div className="border-t border-[#e5eae8] px-3 py-3"><p className="text-[9px] leading-4 text-[#52616b]">{comparisons.length ? "Verified external benchmarks are comparable-only records. They do not upgrade " + project.name + " evidence." : "No comparable record has a verified external status for this term. Unverified candidates are excluded from benchmark comparison."}</p><ul className="mt-2 grid gap-2 sm:grid-cols-3">{comparisons.map((comparison) => <li key={comparison.id} className="rounded bg-[#f1f5f3] p-2 text-[9px] leading-4 text-[#52616b]"><strong className="text-[#243844]">{comparison.title}</strong><br /><span className="font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#255bb7]">{comparison.relationship}</span> · {comparison.terms[definition.id].benchmarkStatus} · {comparison.terms[definition.id].sourceSectionOrPage ?? "Location unavailable"}<span className="mt-1 block font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#8a5200]">Verified national benchmark · not a term of this project</span></li>)}</ul><p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#7d898f]">Full library: {COMMUNITY_AGREEMENTS.length} normalized records in snapshot {COMMUNITY_SNAPSHOT_VERSION} — browse it from the control below without loading every record here.</p></div>
                          </details>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 border-t border-[#e5eae8] pt-3 text-[9px] leading-4 text-[#60707d] md:grid-cols-2">
          <p><strong>Attribution:</strong> {COMMUNITY_PROVIDER_ATTRIBUTION}</p>
          <p><strong>Provenance:</strong> retrieved {COMMUNITY_SNAPSHOT.retrievedAt} · reviewed {COMMUNITY_SNAPSHOT.reviewedAt} · {COMMUNITY_SNAPSHOT.records.length} records · local snapshot, not a live feed.</p>
        </div>
        <div className="mt-3">
          <button data-testid="button-community-library" type="button" onClick={openLibrary} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#cbb7ec] bg-[#f8f4fd] px-3 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#7049b7] hover:border-[#7049b7]"><FileText aria-hidden="true" className="h-3.5 w-3.5" /> Browse full benchmark library · {COMMUNITY_AGREEMENTS.length} national records</button>
        </div>
      </div>
    </details>
  );
}

function AssessmentSourceContext({ item }: { item: EvidenceItem }) {
  const claimSources = item.claimIds
    .flatMap((claimId) => getClaimSources(claimId))
    .filter((source, index, sources) => sources.findIndex((candidate) => candidate.id === source.id) === index);
  const directSources = item.sources ?? [];
  const hasSources = Boolean(item.sourceUrl || directSources.length || claimSources.length);

  return (
    <div data-testid={`ai-analysis-sources-${item.id}`} className="mt-3 border-t border-[#d8e4de] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Sources supplied to this analysis</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#7d898f]">Classifier only · no new web search</span>
      </div>
      <p className="mt-1 text-[9px] leading-4 text-[#52616b]">
        The model assessed the evidence and citation already attached to this input. Review the linked public record before accepting its suggestion.
      </p>
      {item.sourceUrl && (
        <a
          data-testid={`ai-analysis-source-direct-${item.id}`}
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-start gap-1 text-[9px] font-semibold text-[#255bb7] underline underline-offset-2"
        >
          {item.sourceTitle ?? item.sourcePublisher ?? "Open cited public source"}
          <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
        </a>
      )}
      {directSources.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {directSources.map((source) => (
            <li key={source.url}>
              <a
                data-testid={`ai-analysis-source-${item.id}-${encodeURIComponent(source.url)}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1 text-[9px] font-semibold text-[#255bb7] underline underline-offset-2"
              >
                {source.title} <span className="font-normal text-[#60707d]">· {source.publisher}</span>
                <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {claimSources.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {claimSources.map((source) => <AssessmentClaimSource key={source.id} source={source} itemId={item.id} />)}
        </ul>
      )}
      {!hasSources && (
        <p data-testid={`ai-analysis-no-sources-${item.id}`} className="mt-2 rounded border border-[#f1cb8b] bg-[#fff8e9] px-2 py-1.5 text-[9px] leading-4 text-[#8a5200]">
          No public-source link is attached to this input; the classifier cannot establish one.
        </p>
      )}
    </div>
  );
}

function AssessmentClaimSource({ source, itemId }: { source: ClaimSourceRecord; itemId: string }) {
  return (
    <li>
      <a
        data-testid={`ai-analysis-source-${itemId}-${source.id}`}
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-start gap-1 text-[9px] font-semibold text-[#255bb7] underline underline-offset-2"
      >
        {source.publisher}: {source.title}
        <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
      </a>
    </li>
  );
}

function EvidenceAssessment({
  item,
  assessment,
  notice,
  onAccept,
  onOverride,
}: {
  item: EvidenceItem;
  assessment?: AIEvidenceResult;
  notice?: AssessmentNotice;
  onAccept: (item: EvidenceItem, assessment: AIEvidenceSuccess) => void;
  onOverride: (item: EvidenceItem) => void;
}) {
  if (notice) {
    return (
      <div
        data-testid={`status-ai-decision-${item.id}`}
        role="status"
        className="border-t border-[#d8e4de] bg-[#f4faf6] px-4 py-2.5 text-[10px] font-semibold text-[#0b7a63] md:px-5"
      >
        {notice === "accepted" ? "Classification updated." : "AI suggestion overridden; classification unchanged."}
      </div>
    );
  }
  if (!assessment || assessment.status === "success") {
    if (!assessment) return null;
    return (
      <div
        data-testid={`ai-assessment-${item.id}`}
        role="region"
        aria-label={`AI Assessment for ${item.label}`}
        className="border-t border-[#cbd8d4] bg-[#f4f8f5] px-4 py-3.5 md:px-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#607500]" />
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#607500]">AI Assessment</span>
              <span className="text-[9px] uppercase tracking-[0.1em] text-[#7d898f]">Suggestion, not a determination</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ClassificationBadge value={assessment.classification} compact />
              <p data-testid={`text-ai-reasoning-${item.id}`} className="text-[10px] leading-4 text-[#344550]">{assessment.reasoning}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              data-testid={`button-accept-ai-${item.id}`}
              type="button"
              onClick={() => onAccept(item, assessment)}
              className="rounded-md border border-[#9bd8c5] bg-[#e0f4ed] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#08644f] hover:bg-[#d2eee3]"
            >
              Accept
            </button>
            <button
              data-testid={`button-override-ai-${item.id}`}
              type="button"
              onClick={() => onOverride(item)}
              className="rounded-md border border-[#cbd8d4] bg-white px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b] hover:border-[#7d898f] hover:text-[#243844]"
            >
              Override
            </button>
          </div>
        </div>
         <div className="mt-3 border-t border-[#d8e4de] pt-3">
           <p data-testid={`ai-trust-context-${item.id}`} className="text-[10px] leading-4 text-[#52616b]">Only 3% of Americans have high confidence in AI for financial guidance. This suggestion is a starting point, not a conclusion. Your classification is the one the model uses.</p>
           <p data-testid={`ai-trust-source-${item.id}`} className="mt-1 font-mono text-[9px] tracking-[0.08em] text-[#60707d]">Gallup/Edward Jones, August 2026</p>
         </div>
          <AssessmentSourceContext item={item} />
      </div>
    );
  }

  return (
    <div
      data-testid={`ai-assessment-${item.id}`}
      role="status"
      className={`border-t px-4 py-3 text-[10px] leading-4 md:px-5 ${assessment.status === "unparseable" ? "border-[#f1cb8b] bg-[#fff8e9] text-[#6f460e]" : "border-[#d9e0e4] bg-[#f7faf8] text-[#60707d]"}`}
    >
      <div className="flex items-start gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <div className="font-semibold">{assessment.message}</div>
          {assessment.status === "unparseable" && (
            <pre data-testid={`text-ai-raw-response-${item.id}`} className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-[#ecd39d] bg-white/70 p-2 font-mono text-[9px] text-[#52616b]">{assessment.rawText}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function EvidenceRow({
  item,
  onChange,
  onAnalyze,
  onAccept,
  onOverride,
  assessment,
  notice,
  analysisBusy,
  analysisDisabled,
  sourceProposal,
  onAcceptSourceProposal,
  onRejectSourceProposal,
}: {
  item: EvidenceItem;
  onChange: (id: string, value: Classification) => void;
  onAnalyze: (item: EvidenceItem) => void;
  onAccept: (item: EvidenceItem, assessment: AIEvidenceSuccess) => void;
  onOverride: (item: EvidenceItem) => void;
  assessment?: AIEvidenceResult;
  notice?: AssessmentNotice;
  analysisBusy: boolean;
  analysisDisabled: boolean;
  sourceProposal?: CustomEvidenceRecord;
  onAcceptSourceProposal: (proposal: CustomEvidenceRecord) => void;
  onRejectSourceProposal: (id: string) => void;
}) {
  const meta = classMeta[item.classification];
  const { sourceStates, project, applyEvidenceCorrection } = useDiligence();
  const source = item.sourceId ? sourceStates[item.sourceId] : null;
  const providerSource = item.providerSourceId ? sourceStates[item.providerSourceId] : null;
  const [open, setOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionUrl, setCorrectionUrl] = useState("");
  const [correctionClaim, setCorrectionClaim] = useState("");
  const [correctionValue, setCorrectionValue] = useState(String(item.value));
  const [correctionAssessment, setCorrectionAssessment] = useState<AIEvidenceSuccess | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const { openDrawer } = useWorkbenchDrawer();
  useEffect(() => {
    if (assessment || notice || sourceProposal) setOpen(true);
  }, [assessment, notice, sourceProposal]);
  const openSourceTrace = (event: React.MouseEvent<HTMLButtonElement>) => {
    openDrawer({
      key: `evidence-source:${item.id}`,
      kicker: "View Source",
      title: item.label,
      render: () => (
        <div className="space-y-4">
          <DrawerSection label="Current record">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Current value" value={`${item.value} ${item.unit}`} />
              <DrawerField label="Evidence classification" value={<ClassificationBadge value={item.classification} compact />} />
            </div>
            <p>{item.description}</p>
          </DrawerSection>
          <DrawerSection label="Source excerpt and citation">
            <p>{item.citation}</p>
            {project.kind === "curated" && item.claimIds.length > 0 && (
              <div className="space-y-1">{item.claimIds.map((claimId) => <ClaimCitation key={claimId} claimId={claimId} />)}</div>
            )}
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#255bb7] underline underline-offset-2">
                Open cited public source <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            )}
            <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d898f]">Role: {item.sourceRole}{source ? ` · ${source.fullName}` : ""}</p>
          </DrawerSection>
          <DrawerSection label="Financial treatment">
            <div className="grid gap-2 sm:grid-cols-2">
              <DrawerField label="Decision relevance" value={<ImpactRoleBadge role={item.impactRole} compact />} />
              <DrawerField label="Feeds" value={item.impactRole === "Financial Driver" ? "Stress-case return model" : item.impactRole === "Decision Gate" ? "Decision posture" : "Contextual assessment"} />
            </div>
            <p>Only human-approved classifications feed the model. AI proposals and agent findings never change this input by themselves.</p>
          </DrawerSection>
          <DrawerSection label="Audit history">
            {item.review ? (
              <p>{reviewLabel(item.review.kind)} · <time dateTime={item.review.reviewedAt}>{formatReviewTime(item.review.reviewedAt)}</time></p>
            ) : (
              <p>No human review action has been recorded for this input in the current session.</p>
            )}
          </DrawerSection>
        </div>
      ),
    }, { trigger: event.currentTarget, returnFocusSelector: `[data-testid='row-evidence-${item.id}'] summary` });
  };
  const validatedSourceCount = item.sourceRole.startsWith("Reviewer-submitted") ? 0 : new Set([
    ...(item.sourceUrl && !item.sources?.some((candidate) => candidate.url === item.sourceUrl && candidate.sourceClass === "reviewer-submitted") ? [item.sourceUrl] : []),
    ...(item.sources ?? []).filter((candidate) => candidate.sourceClass !== "reviewer-submitted").map((candidate) => candidate.url),
  ]).size;
  const modelReportedConfidence = item.modelReportedConfidence;
  const proposeCorrection = async () => {
    setCorrectionError("");
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(correctionUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) throw new Error();
    } catch {
      setCorrectionError("Enter a public HTTP or HTTPS source URL.");
      return;
    }
    if (!correctionClaim.trim() || !correctionValue.trim()) {
      setCorrectionError("Add the claim this source supports and the proposed value.");
      return;
    }
    setCorrectionBusy(true);
    const result = await analyzeEvidence({
      label: item.label,
      value: correctionValue.trim(),
      citation: `${correctionClaim.trim()} ${parsedUrl.href}`,
    }, project);
    setCorrectionBusy(false);
    if (result.status === "success") {
      setCorrectionAssessment(result);
    } else {
      setCorrectionError(result.message);
    }
  };
  const acceptCorrection = () => {
    if (!correctionAssessment) return;
    const accepted = applyEvidenceCorrection(item.id, {
      value: correctionValue,
      claim: correctionClaim,
      sourceUrl: correctionUrl,
      classification: correctionAssessment.classification,
    });
    if (!accepted) {
      setCorrectionError("The correction could not be applied.");
      return;
    }
    logSessionAction("Reviewer source attached, AI-proposed, human-accepted", item.id);
    recordAIDecision(item.id, correctionAssessment.classification, correctionAssessment.reasoning, "accepted", correctionAssessment.classification);
    setCorrectionAssessment(null);
    setCorrectionOpen(false);
  };
  return (
    <div className={project.kind === "custom" ? "grid border-b border-[#e4e9e8] last:border-0" : ""}>
      <details
        id={`evidence-item-${item.id}`}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setOpen(true);
        }}
        tabIndex={-1}
        data-testid={`row-evidence-${item.id}`}
        className={project.kind === "custom" ? "group col-span-full focus-within:bg-[#fbfcfa]" : "group border-b border-[#e4e9e8] last:border-0 focus-within:bg-[#fbfcfa]"}
      >
      {project.kind === "custom" ? (
        <summary
          data-testid={`summary-evidence-${item.id}`}
          className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors hover:bg-[#fbfcfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b9d43a] md:grid-cols-[1.25fr_0.9fr_1.65fr_auto] md:items-center md:px-5 [&::-webkit-details-marker]:hidden"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-[#243844]">{item.label}</span>
              <span data-testid={`badge-ai-researched-${item.id}`} className="mt-1 inline-flex rounded-full bg-[#e9e0f7] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#7049b7]">AI-researched</span>
            </span>
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-bold text-[#122232]">{item.value}</span>
              <span className="text-[10px] text-[#52616b]">{item.unit}</span>
            </span>
            <span className="mt-1 block"><ClassificationBadge value={item.classification} compact /></span>
          </span>
          <span className="flex min-w-0 flex-wrap gap-1.5">
            <span
              data-testid={`model-confidence-${item.id}`}
              aria-label={`AI confidence for ${item.label}: ${typeof modelReportedConfidence === "number" ? `${modelReportedConfidence}%` : "not reported"}; self-reported, not a verified probability`}
              className="rounded-full bg-[#f0ebf8] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#7049b7]"
            >
              AI confidence: {typeof modelReportedConfidence === "number" ? `${modelReportedConfidence}%` : "not reported"} · self-reported, not verified probability
            </span>
            <span
              data-testid={`support-confidence-${item.id}`}
              aria-label={`Validated source support for ${item.label}: ${typeof item.sourceSupportConfidence === "number" ? `${item.sourceSupportConfidence}%` : "not measured"}`}
              className="rounded-full bg-[#e7f2ee] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#386a5c]"
            >
              Validated source support: {typeof item.sourceSupportConfidence === "number" ? `${item.sourceSupportConfidence}%` : "not measured"}
            </span>
            <span data-testid={`evidence-source-status-${item.id}`} className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] ${validatedSourceCount ? "bg-[#e0f4ed] text-[#08644f]" : "bg-[#fff0d5] text-[#8a5200]"}`}>
              <span data-testid={`custom-source-status-${item.id}`}>{validatedSourceCount ? `${validatedSourceCount} validated source${validatedSourceCount === 1 ? "" : "s"}` : "No validated source"}</span>
            </span>
              {project.kind === "custom" && (
                <span data-testid={`research-state-${item.id}`} className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] ${item.acceptedForModel ? "bg-[#e0f4ed] text-[#08644f]" : item.eligibleForModel ? "bg-[#e5efff] text-[#255bb7]" : "bg-[#fde8eb] text-[#ba2f45]"}`}>
                  {item.acceptedForModel ? "Accepted model input" : item.eligibleForModel ? "Proposal · acceptance required" : "Unverified lead · quarantined"}
                </span>
              )}
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180" />
        </summary>
      ) : (
        <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors hover:bg-[#fbfcfa] md:grid-cols-[1.55fr_0.8fr_1.55fr] md:items-center md:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} /><span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-[#243844]">{item.label}</span></span></span>
          <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-bold text-[#122232]">{item.value}</span> <span className="text-[10px] text-[#52616b]">{item.unit}</span><ClassificationBadge value={item.classification} compact />{source ? <SourceStatusBadge source={source} compact testId={`evidence-source-status-${item.id}`} /> : <span data-testid={`evidence-origin-${item.id}`} className="rounded-full bg-[#e7ecef] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.09em] text-[#52616b]">Embedded</span>}</span></span>
          <span className="flex flex-wrap items-center justify-between gap-2"><span className="flex min-w-0 flex-1 flex-wrap items-start gap-2"><ImpactRoleBadge role={item.impactRole} compact testId={`badge-impact-role-${item.id}`} /><span className="flex min-w-[150px] flex-1 flex-col items-stretch"><span className="relative min-w-0 flex-1 md:max-w-[220px]"><select data-testid={`select-classification-${item.id}`} aria-label={`Provenance classification for ${item.label}`} value={item.classification} onChange={(event) => onChange(item.id, event.target.value as Classification)} onClick={(event) => event.stopPropagation()} className="w-full appearance-none rounded-md border bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-[#243844] outline-none focus:ring-2 focus:ring-[#b9d43a]/50" style={{ borderColor: meta.border }}>{classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#52616b]" /></span>{item.review && <p data-testid={`review-marker-${item.id}`} aria-label={`${reviewLabel(item.review.kind)} · ${formatReviewTime(item.review.reviewedAt)}`} className="mt-1 text-[9px] leading-4 text-[#7d898f]">{reviewLabel(item.review.kind)} · <time dateTime={item.review.reviewedAt}>{formatReviewTime(item.review.reviewedAt)}</time></p>}</span><button data-testid={`button-analyze-ai-${item.id}`} type="button" aria-label={`Analyze ${item.label} with AI`} aria-busy={analysisBusy} disabled={analysisDisabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); onAnalyze(item); }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#cbd8d4] bg-white px-2 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#52616b] hover:border-[#7d898f] hover:text-[#243844] disabled:cursor-wait disabled:opacity-60"><Sparkles aria-hidden="true" className="h-3 w-3 text-[#607500]" />{analysisBusy ? "Analyzing…" : "Analyze with AI"}</button></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180 md:hidden" /></span>
        </summary>
      )}
      <div className={project.kind === "custom" ? "col-span-full" : "contents"}>
       {analysisBusy && <div data-testid={`status-ai-analysis-${item.id}`} role="status" aria-live="polite" className="border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-2 text-[10px] text-[#60707d] md:px-5"><LoaderCircle aria-hidden="true" className="mr-1.5 inline h-3 w-3 animate-spin" />Analyzing source quality…</div>}
      <div className="grid gap-3 bg-[#fbfcfa] px-4 pb-4 pt-1 md:grid-cols-[1.55fr_0.8fr_1.55fr] md:px-5">
        <p className="text-[10px] leading-4 text-[#52616b] md:col-span-2">{item.description}</p>
         <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[#52616b]">
           <FileText aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
           <span>
             {item.citation}
              <span className="mt-1 block text-[9px] uppercase tracking-[0.08em] text-[#7d898f]">Role: {item.sourceRole}{source ? ` · ${source.fullName}` : project.kind === "custom" ? " · Custom project research" : " · Embedded case record"}{providerSource ? ` · Provider-ready: ${providerSource.shortName}` : ""}</span>
              <button data-testid={`button-view-source-${item.id}`} type="button" onClick={openSourceTrace} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[#cbd8d4] bg-white px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#255bb7] hover:border-[#255bb7]"><FileText aria-hidden="true" className="h-3 w-3" /> View Source</button>
              {project.kind === "curated" && item.claimIds.map((claimId) => (
                <ClaimCitation key={claimId} claimId={claimId} />
              ))}
              {project.kind === "custom" && (
               item.sourceUrl ? (
                  <span className="mt-2 block normal-case tracking-normal">
                   <a
                     data-testid={`link-custom-source-${item.id}`}
                     href={item.sourceUrl}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 font-semibold text-[#255bb7] underline decoration-[#8dc8e8] underline-offset-2 hover:text-[#122232]"
                   >
                      Open {item.sourceTitle ?? "cited public source"}
                     <ExternalLink aria-hidden="true" className="h-3 w-3" />
                   </a>
                    <dl data-testid={`custom-source-metadata-${item.id}`} className="mt-2 grid gap-1 font-mono text-[8px] text-[#60707d] sm:grid-cols-2">
                      <div><dt className="inline font-bold">Publisher: </dt><dd className="inline">{item.sourcePublisher ?? "not provided"}</dd></div>
                      <div><dt className="inline font-bold">Published: </dt><dd className="inline">{formatClaimDate(item.sourcePublishedAt ?? null)}</dd></div>
                      <div><dt className="inline font-bold">Last accessed: </dt><dd className="inline">{formatClaimDate(item.sourceAccessedAt ?? null)}</dd></div>
                      <div><dt className="inline font-bold">Access: </dt><dd className="inline">{item.sourceAccessStatus ?? "not provided"}</dd></div>
                    </dl>
                    <span data-testid={`custom-source-context-${item.id}`} className="mt-2 block font-mono text-[8px] uppercase tracking-[0.08em] text-[#7d898f]">Context only · not facility-level proof</span>
                 </span>
               ) : (
                 <span data-testid={`custom-source-missing-${item.id}`} className="mt-2 block font-mono text-[8px] uppercase tracking-[0.08em] text-[#a65a00]">No validated direct source link returned · citation is research context only</span>
               )
             )}
              {project.kind === "custom" && (
                <span className="mt-3 block border-t border-[#e1e8e5] pt-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span data-testid={`coverage-status-${item.id}`} className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${item.coverageStatus === "conflicting" ? "bg-[#fde8eb] text-[#ba2f45]" : item.coverageStatus === "supported" ? "bg-[#e0f4ed] text-[#08644f]" : "bg-[#fff0d5] text-[#8a5200]"}`}>
                      {item.coverageStatus === "searched-no-support" ? "Searched · no support" : item.coverageStatus ?? "Coverage unknown"}
                    </span>
                    {item.failedSearchDomains?.length ? <span data-testid={`coverage-failures-${item.id}`} className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#a65a00]">{item.failedSearchDomains.length} search domain{item.failedSearchDomains.length === 1 ? "" : "s"} unavailable</span> : null}
                  </span>
                   {item.conflictSummary && <span data-testid={`source-conflict-${item.id}`} className="mt-2 block rounded border border-[#efbac3] bg-[#fff4f6] p-2 text-[9px] text-[#8f2437]"><strong>Conflict:</strong> {item.conflictSummary}</span>}
                   <span data-testid={`classification-reason-${item.id}`} className="mt-2 block text-[9px] leading-4 text-[#52616b]"><strong>Classification basis:</strong> {item.classificationReason ?? "No classification reason provided."}</span>
                   <span data-testid={`source-relevance-${item.id}`} className="mt-1 block text-[9px] leading-4 text-[#52616b]"><strong>Source relevance:</strong> {item.sourceRelevanceNote ?? "No source relevance note provided."}</span>
                   <details data-testid={`search-transparency-${item.id}`} className="mt-2 rounded border border-[#d9e0e4] bg-white">
                     <summary className="cursor-pointer list-none px-2 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#60707d] [&::-webkit-details-marker]:hidden">Search transparency · {item.searchTermsSource === "tool-observed" ? "tool-observed queries" : item.searchTermsSource === "ai-reported" ? "AI-reported search terms" : "search telemetry unavailable"}</summary>
                     <span className="block border-t border-[#e5eae8] px-2 py-2 text-[9px] leading-4 text-[#52616b]">
                       {item.searchTerms?.length
                         ? <><strong>{item.searchTermsSource === "tool-observed" ? "Tool-observed queries" : "AI-reported search terms"}:</strong> {item.searchTerms.join(" · ")}</>
                         : "Search terms unavailable; none are shown because search telemetry was not returned."}
                     </span>
                   </details>
                   {sourceProposal?.sourceUrl && (
                     <span data-testid={`source-research-proposal-${item.id}`} className="mt-3 block rounded-lg border border-[#8dc8e8] bg-[#eef8fc] p-3">
                       <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#255bb7]">New source found · review required</span>
                       <span className="mt-2 block text-[10px] font-semibold text-[#243844]">{sourceProposal.value} · {sourceProposal.unit}</span>
                       <span className="mt-1 block text-[9px] leading-4 text-[#52616b]">{sourceProposal.description}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          <span data-testid={`proposal-model-confidence-${item.id}`} className="rounded-full bg-[#f0ebf8] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#7049b7]">
                            AI confidence: {typeof sourceProposal.modelReportedConfidence === "number" ? `${sourceProposal.modelReportedConfidence}%` : "not reported"} · self-reported, not verified probability
                          </span>
                          <span data-testid={`proposal-support-confidence-${item.id}`} className="rounded-full bg-[#e7f2ee] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.06em] text-[#386a5c]">
                            Validated source support: {typeof sourceProposal.sourceSupportConfidence === "number" ? `${sourceProposal.sourceSupportConfidence}%` : "not measured"}
                          </span>
                        </span>
                       <a href={sourceProposal.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[9px] font-semibold text-[#255bb7] underline underline-offset-2">
                         Open {sourceProposal.sourceTitle ?? "retrieved source"}<ExternalLink aria-hidden="true" className="h-3 w-3" />
                       </a>
                       <span className="mt-3 flex flex-wrap gap-2">
                         <button data-testid={`button-accept-source-proposal-${item.id}`} type="button" onClick={() => onAcceptSourceProposal(sourceProposal)} className="rounded bg-[#08644f] px-3 py-2 font-mono text-[8px] font-bold uppercase text-white">Accept source and finding</button>
                         <button data-testid={`button-reject-source-proposal-${item.id}`} type="button" onClick={() => onRejectSourceProposal(item.id)} className="rounded border border-[#9aaec0] bg-white px-3 py-2 font-mono text-[8px] font-bold uppercase text-[#52616b]">Reject</button>
                       </span>
                     </span>
                   )}
                   {(item.sources?.length ?? 0) > 0 && (
                    <span data-testid={`custom-sources-${item.id}`} className="mt-2 block">
                      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#60707d]">{item.sources?.length} claim-specific sources</span>
                      {item.sources?.map((evidenceSource) => (
                         <a key={evidenceSource.url} data-testid={`custom-source-${item.id}-${encodeURIComponent(evidenceSource.url)}`} href={evidenceSource.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-start justify-between gap-2 rounded border border-[#d9e0e4] bg-white p-2 text-[9px] text-[#255bb7] hover:border-[#8dc8e8]">
                           <span><strong>{evidenceSource.title}</strong><span className="mt-0.5 block text-[#60707d]">{evidenceSource.publisher} · {evidenceSource.publishedAt ? formatClaimDate(evidenceSource.publishedAt) : "not provided"} · {evidenceSource.sourceClass.replaceAll("-", " ")} · {evidenceSource.relationship}</span><span className="mt-1 block leading-4 text-[#52616b]">{evidenceSource.relevanceNote ?? item.sourceRelevanceNote ?? "Claim-specific source mapping returned by research."}</span></span>
                          <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                        </a>
                      ))}
                    </span>
                  )}
                  <button data-testid={`button-correct-source-${item.id}`} type="button" onClick={() => setCorrectionOpen((value) => !value)} className="mt-3 rounded-md border border-[#9aaec0] bg-white px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#344550] hover:border-[#255bb7]">
                    {correctionOpen ? "Cancel source correction" : "Add or replace a missed source"}
                  </button>
                  {correctionOpen && (
                    <span data-testid={`source-correction-form-${item.id}`} className="mt-3 block rounded-lg border border-[#cbd8d4] bg-[#f7faf8] p-3">
                      <span className="block text-[10px] font-semibold text-[#243844]">Stage a reviewer source</span>
                      <span className="mt-1 block text-[9px] text-[#60707d]">AI checks the claim context only. Open and verify the source yourself; nothing changes until you accept.</span>
                      <label className="mt-3 block text-[9px] font-semibold text-[#344550]">Public source URL<input data-testid={`input-correction-url-${item.id}`} type="url" value={correctionUrl} onChange={(event) => { setCorrectionUrl(event.target.value); setCorrectionAssessment(null); }} className="mt-1 block w-full rounded border border-[#cbd8d4] bg-white px-2.5 py-2 text-[10px]" placeholder="https://agency.gov/decision" /></label>
                      <label className="mt-2 block text-[9px] font-semibold text-[#344550]">Claim supported<textarea data-testid={`input-correction-claim-${item.id}`} value={correctionClaim} onChange={(event) => { setCorrectionClaim(event.target.value); setCorrectionAssessment(null); }} className="mt-1 block min-h-16 w-full rounded border border-[#cbd8d4] bg-white px-2.5 py-2 text-[10px]" placeholder="Quote or summarize the exact project-specific finding." /></label>
                      <label className="mt-2 block text-[9px] font-semibold text-[#344550]">Proposed model value<input data-testid={`input-correction-value-${item.id}`} value={correctionValue} onChange={(event) => { setCorrectionValue(event.target.value); setCorrectionAssessment(null); }} className="mt-1 block w-full rounded border border-[#cbd8d4] bg-white px-2.5 py-2 text-[10px]" /></label>
                      {correctionError && <span role="alert" className="mt-2 block text-[9px] text-[#ba2f45]">{correctionError}</span>}
                      {correctionAssessment ? (
                        <span data-testid={`correction-proposal-${item.id}`} className="mt-3 block rounded border border-[#b9d43a] bg-[#f8fbe8] p-3">
                          <span className="flex flex-wrap items-center gap-2"><ClassificationBadge value={correctionAssessment.classification} compact /><span className="text-[9px] text-[#52616b]">{correctionAssessment.reasoning}</span></span>
                          <span className="mt-3 flex gap-2">
                            <button data-testid={`button-accept-correction-${item.id}`} type="button" onClick={acceptCorrection} className="rounded bg-[#08644f] px-3 py-2 font-mono text-[8px] font-bold uppercase text-white">Accept source and proposal</button>
                            <button type="button" onClick={() => setCorrectionAssessment(null)} className="rounded border border-[#cbd8d4] bg-white px-3 py-2 font-mono text-[8px] font-bold uppercase text-[#52616b]">Revise</button>
                          </span>
                        </span>
                      ) : (
                        <button data-testid={`button-propose-correction-${item.id}`} type="button" disabled={correctionBusy} onClick={() => void proposeCorrection()} className="mt-3 inline-flex items-center gap-1 rounded bg-[#122232] px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#d4e86b] disabled:opacity-60">
                          {correctionBusy && <LoaderCircle aria-hidden="true" className="h-3 w-3 animate-spin" />}{correctionBusy ? "Checking…" : "Request AI proposal"}
                        </button>
                      )}
                    </span>
                  )}
                </span>
              )}
           </span>
         </div>
      </div>
        <EvidenceAssessment item={item} assessment={assessment} notice={notice} onAccept={onAccept} onOverride={onOverride} />
      </div>
      </details>
      {project.kind === "custom" && (
        <div className="col-span-full row-start-2 flex flex-wrap items-start gap-2 border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-3 md:px-5">
          <ImpactRoleBadge role={item.impactRole} compact testId={`badge-impact-role-${item.id}`} />
          <span className="relative min-w-[190px] flex-1 md:max-w-[260px]">
            <select data-testid={`select-classification-${item.id}`} aria-label={`Provenance classification for ${item.label}`} value={item.classification} onChange={(event) => onChange(item.id, event.target.value as Classification)} className="w-full appearance-none rounded-md border bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-[#243844] outline-none focus:ring-2 focus:ring-[#b9d43a]/50" style={{ borderColor: meta.border }}>{classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}</select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#52616b]" />
            {item.review && <span data-testid={`review-marker-${item.id}`} aria-label={`${reviewLabel(item.review.kind)} · ${formatReviewTime(item.review.reviewedAt)}`} className="mt-1 block text-[9px] leading-4 text-[#7d898f]">{reviewLabel(item.review.kind)} · <time dateTime={item.review.reviewedAt}>{formatReviewTime(item.review.reviewedAt)}</time></span>}
          </span>
          <button data-testid={`button-analyze-ai-${item.id}`} type="button" aria-label={`Analyze ${item.label} with AI`} aria-busy={analysisBusy} disabled={analysisDisabled} onClick={() => { setOpen(true); onAnalyze(item); }} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#cbd8d4] bg-white px-2 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#52616b] hover:border-[#7d898f] hover:text-[#243844] disabled:cursor-wait disabled:opacity-60"><Sparkles aria-hidden="true" className="h-3 w-3 text-[#607500]" />{analysisBusy ? "Analyzing…" : "Analyze with AI"}</button>
        </div>
      )}
    </div>
  );
}

const fuelLabels: Record<EiaFuel, string> = {
  naturalGas: "Natural gas",
  wind: "Wind",
  solar: "Solar",
  nuclear: "Nuclear",
  coal: "Coal",
  other: "Other",
};

function monthLabel(period?: string) {
  if (!period) return "month unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${period}-01T00:00:00.000Z`));
}

function isStorageFlagSet(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function sparklinePoints(data: EiaElectricityData["priceHistory"]) {
  if (data.length === 0) return "";
  const values = data.map((point) => point.pricePerMwh);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return data.map((point, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * 220;
    const y = 54 - ((point.pricePerMwh - min) / range) * 46;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function EiaElectricityEvidence({
  data,
  loading,
  source,
  classification,
  onSuggestVerified,
  projectName,
}: {
  data: EiaElectricityData;
  loading: boolean;
  source: ReturnType<typeof useDiligence>["sourceStates"]["eia"];
  classification: Classification;
  onSuggestVerified: () => void;
  projectName: string;
}) {
  const mix = data.latestGenerationMix;
  const historyText = data.priceHistory.map((point) => `${monthLabel(point.period)}: $${point.pricePerMwh.toFixed(1)} per MWh`).join("; ");
  const trendCopy = data.trend === "unavailable"
    ? "Unavailable — 25 monthly calculation points are required to compare consecutive year-over-year windows."
    : `${data.trend[0].toUpperCase()}${data.trend.slice(1)} versus the preceding 12-month window.`;
  return (
    <article data-testid="eia-electricity-evidence" className="border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-5 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Federal electricity context</div>
          <h3 className="mt-1 text-[14px] font-semibold text-[#122232]">Texas industrial price, trend, and generation mix</h3>
          <p data-testid="eia-attribution" className="mt-1 font-mono text-[9px] text-[#52616b]">Electricity data: U.S. Energy Information Administration Open Data</p>
        </div>
        <SourceStatusBadge source={source} testId="eia-evidence-source-status" />
      </div>
      {loading ? (
        <p data-testid="eia-loading" className="mt-4 text-[10px] text-[#52616b]">Checking the server-backed EIA source…</p>
      ) : data.dataOrigin === "provider" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <section data-testid="eia-price-history" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Industrial retail rate</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span data-testid="eia-latest-rate" className="font-mono text-2xl font-bold text-[#122232]">${data.latestPrice.toFixed(1)}</span>
              <span className="text-[10px] text-[#52616b]">/ MWh</span>
            </div>
            <p className="mt-1 text-[10px] text-[#52616b]">Source: U.S. EIA, {monthLabel(data.latestPricePeriod)}</p>
            <figure className="mt-3">
              <svg role="img" aria-label={`Texas industrial electricity price history for ${data.priceHistory.length} months`} viewBox="0 0 220 60" className="h-16 w-full overflow-visible">
                <title>Texas industrial electricity-price history</title>
                <polyline points={sparklinePoints(data.priceHistory)} fill="none" stroke="#255bb7" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <figcaption className="text-[9px] text-[#7d898f]">{data.priceHistory.length}-month monthly trend · oldest to latest</figcaption>
              <span className="sr-only">{historyText}</span>
            </figure>
            {data.status === "live" ? (
              <button
                data-testid="button-suggest-verified-eia"
                type="button"
                onClick={onSuggestVerified}
                disabled={classification === "Verified Evidence"}
                className="mt-3 rounded-md border border-[#0b7a63] bg-[#e0f4ed] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#08644f] disabled:cursor-default disabled:opacity-60"
              >
                {classification === "Verified Evidence" ? "Verified Evidence retained" : "Suggest Verified Evidence"}
              </button>
            ) : <p className="mt-3 text-[9px] text-[#7d898f]">Cached federal observation — no live verification suggestion.</p>}
          </section>
          <section data-testid="eia-price-trend" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Year-over-year movement</div>
            <div className="mt-2 font-mono text-xl font-bold text-[#122232]">{data.yoyChangePercent === null ? "Unavailable" : `${data.yoyChangePercent >= 0 ? "+" : ""}${data.yoyChangePercent.toFixed(1)}%`}</div>
            <dl className="mt-3 space-y-2 text-[10px]">
              <div><dt className="font-bold text-[#52616b]">Latest 12-month change</dt><dd className="mt-0.5 text-[#243844]">{data.yoyChangePercent === null ? "Insufficient history" : `${data.yoyChangePercent.toFixed(1)}%`}</dd></div>
              <div><dt className="font-bold text-[#52616b]">Preceding 12-month change</dt><dd className="mt-0.5 text-[#243844]">{data.precedingYoyChangePercent === null ? "Insufficient history" : `${data.precedingYoyChangePercent.toFixed(1)}%`}</dd></div>
              <div><dt className="font-bold text-[#52616b]">Trend</dt><dd data-testid="eia-acceleration-trend" className="mt-0.5 text-[#243844]">{trendCopy}</dd></div>
            </dl>
          </section>
          <section data-testid="eia-generation-mix" className="rounded-lg border border-[#d9e0e4] bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Texas generation mix · {monthLabel(mix?.period)}</div>
            {mix ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                {(Object.keys(fuelLabels) as EiaFuel[]).map((fuel) => (
                  <div key={fuel} className="rounded bg-[#f1f5f3] px-2 py-1.5">
                    <dt className="text-[#60707d]">{fuelLabels[fuel]}</dt>
                    <dd data-testid={`eia-mix-${fuel}`} className="mt-0.5 font-mono font-bold text-[#122232]">{mix.shares[fuel].toFixed(1)}%</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="mt-3 text-[10px] text-[#52616b]">Generation mix unavailable.</p>}
            <p className="mt-3 text-[9px] leading-4 text-[#6f460e]">Statewide generation mix is market context only. It does not prove {projectName}’s delivered renewable procurement or contract supply.</p>
            {data.consumptionHistory.at(-1) && <p className="mt-2 text-[9px] text-[#7d898f]">Latest total consumption: {Math.round(data.consumptionHistory.at(-1)!.consumptionMwh).toLocaleString()} MWh.</p>}
          </section>
        </div>
      ) : (
        <div data-testid="eia-fallback-state" className="mt-4 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4 text-[10px] leading-5 text-[#6f460e]">
          EIA observations are unavailable. The workbench remains usable with the embedded $42/MWh underwriting assumption; it is not presented as current federal data.
          {data.error && <span className="mt-1 block text-[9px] text-[#7f6337]">{data.error}</span>}
        </div>
      )}
    </article>
  );
}

export function EvidenceRoom({ onNavigate, showModelConfidence = true }: { onNavigate: (screen: Screen) => void; showModelConfidence?: boolean }) {
  const { evidence, researchEvidence, updateClassification, applyEvidenceCorrection, metrics, ercotQueue, eiaData, eiaLoading, sourceStates, project } = useDiligence();
  const customProject = project.kind === "custom";
  const items = useMemo(() => Object.values(project.kind === "custom" ? (researchEvidence ?? evidence) : evidence), [evidence, project.kind, researchEvidence]);
  const counts = useMemo(() => classifications.map((classification) => ({ classification, count: items.filter((item) => item.classification === classification).length })), [items]);
  const match = ercotQueue.matchingProject;
  const canSuggestVerified = ercotQueue.providerStatus === "live" && Boolean(match?.explicitDelayOrCancellation);
  const [showClassificationTip, setShowClassificationTip] = useState(() => !isStorageFlagSet(EVIDENCE_TIP_DISMISSED_STORAGE_KEY));
  const [assessments, setAssessments] = useState<Record<string, AIEvidenceResult | undefined>>({});
  const [notices, setNotices] = useState<Record<string, AssessmentNotice | undefined>>({});
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [sourceResearchProgress, setSourceResearchProgress] = useState<ResearchProgress | null>(null);
  const [sourceResearchError, setSourceResearchError] = useState<string | null>(null);
  const [sourceProposals, setSourceProposals] = useState<Record<string, CustomEvidenceRecord>>({});
  const [sourceCacheNotice, setSourceCacheNotice] = useState<string | null>(null);
  const [searchCoverage, setSearchCoverage] = useState(project.researchCoverage);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>(getDecisionHistory);
  const isSourceResearchBusy = sourceResearchProgress !== null;
  const isAnalysisBusy = activeAnalysisId !== null || batchProgress !== null || isSourceResearchBusy;
  const [activeFilter, setActiveFilter] = useState<EvidenceFilter>("all");
  const materialGapIds = useMemo(() => new Set(getMaterialEvidenceGaps(evidence).map((gap) => gap.id)), [evidence]);
  const matchesEvidenceFilter = (item: EvidenceItem) => {
    switch (activeFilter) {
      case "material-gaps": return materialGapIds.has(item.id);
      case "needs-review": return item.classification !== "Verified Evidence";
      case "verified": return item.classification === "Verified Evidence";
      case "financial-drivers": return item.impactRole === "Financial Driver";
      case "decision-gates": return item.impactRole === "Decision Gate";
      default: return true;
    }
  };
  const filteredItems = useMemo(
    () => (activeFilter === "all" ? [] : items.filter(matchesEvidenceFilter).sort((a, b) => Number(materialGapIds.has(b.id)) - Number(materialGapIds.has(a.id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFilter, items, materialGapIds],
  );
  useEffect(() => {
    // A resolve/focus navigation must reach its record even when the active
    // filter excludes it: reset to the full list before App's focus timer fires.
    const revealAll = () => setActiveFilter("all");
    window.addEventListener("safeloc:evidence-focus-request", revealAll);
    return () => window.removeEventListener("safeloc:evidence-focus-request", revealAll);
  }, []);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // One evidence row expands at a time for interactive users: when a summary
    // is clicked (mouse or keyboard, which also fires click) and the row is
    // about to open, close the other rows. Programmatic opens — the focus
    // flow setting details.open, batch AI analysis auto-opening assessed rows,
    // or tests opening many rows at once — deliberately do not collapse.
    const node = rootRef.current;
    if (!node) return undefined;
    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const summary = target.closest("summary");
      if (!summary) return;
      const details = summary.parentElement;
      if (!(details instanceof HTMLDetailsElement)) return;
      if (!details.dataset.testid?.startsWith("row-evidence-")) return;
      if (details.open) return; // about to close, not open
      node.querySelectorAll("details[data-testid^='row-evidence-'][open]").forEach((other) => {
        if (other !== details) (other as HTMLDetailsElement).open = false;
      });
    };
    node.addEventListener("click", handler, true);
    return () => node.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    const syncDecisionHistory = () => setDecisionHistory(getDecisionHistory());
    window.addEventListener(DECISION_HISTORY_EVENT, syncDecisionHistory);
    return () => window.removeEventListener(DECISION_HISTORY_EVENT, syncDecisionHistory);
  }, []);

  useEffect(() => {
    if (!customProject || project.researchCache?.refreshStatus !== "running" || !project.researchCache.key) return undefined;
    let active = true;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const status = await checkResearchStatus(project.researchCache!.key);
        if (!active) return;
        if (status.researchCache.refreshStatus === "completed" && status.result) {
          setSearchCoverage(status.result.researchCoverage);
          const proposals = Object.fromEntries(
            status.result.evidence.filter((item) => Boolean(item.sourceUrl)).map((item) => [item.id, item]),
          );
          setSourceProposals(proposals);
          setSourceCacheNotice(`Background update completed with ${Object.keys(proposals).length} source-backed finding${Object.keys(proposals).length === 1 ? "" : "s"} ready for review.`);
          return;
        }
        if (status.researchCache.refreshStatus === "failed") {
          setSourceCacheNotice(`Cached research remains available; the provider update failed (${status.researchCache.errorType ?? "upstream"}).`);
          return;
        }
        if (attempts < 45) window.setTimeout(() => void poll(), 2_000);
      } catch {
        if (active) setSourceCacheNotice("Cached research remains available; update status could not be checked.");
      }
    };
    void poll();
    return () => { active = false; };
  }, [customProject, project.researchCache]);

  const dismissClassificationTip = () => {
    setShowClassificationTip(false);
    try {
      window.localStorage.setItem(EVIDENCE_TIP_DISMISSED_STORAGE_KEY, "true");
    } catch {
      // Storage is optional; the dismissal still applies for this visit.
    }
  };

  const analyzeOne = async (item: EvidenceItem) => {
    if (isAnalysisBusy) return;
    setAssessments((current) => ({ ...current, [item.id]: undefined }));
    setNotices((current) => ({ ...current, [item.id]: undefined }));
    setActiveAnalysisId(item.id);
    try {
      const result = await analyzeEvidence(item, project);
      setAssessments((current) => ({ ...current, [item.id]: result }));
    } catch {
      setAssessments((current) => ({
        ...current,
        [item.id]: { status: "error", message: "AI analysis unavailable. Classify manually." },
      }));
    } finally {
      setActiveAnalysisId(null);
    }
  };

  const analyzeAll = async () => {
    if (isAnalysisBusy) return;
    setNotices({});
    setBatchProgress({ current: 1, total: items.length });
    for (const [index, item] of items.entries()) {
      setAssessments((current) => ({ ...current, [item.id]: undefined }));
      setActiveAnalysisId(item.id);
      setBatchProgress({ current: index + 1, total: items.length });
      try {
        const result = await analyzeEvidence(item, project);
        setAssessments((current) => ({ ...current, [item.id]: result }));
      } catch {
        setAssessments((current) => ({
          ...current,
          [item.id]: { status: "error", message: "AI analysis unavailable. Classify manually." },
        }));
      }
    }
    setActiveAnalysisId(null);
    setBatchProgress(null);
  };

  const researchMissingSources = async (forceRefresh = false) => {
    if (!customProject || isAnalysisBusy) return;
    const focusIds = items
      .filter((item) => item.classification === "Missing Evidence" || !item.sourceUrl)
      .map((item) => item.id);
    if (!focusIds.length) {
      setSourceResearchError("Every evidence item already has a validated source.");
      return;
    }
    setSourceResearchError(null);
    setSourceCacheNotice(null);
    setSourceProposals({});
    setSourceResearchProgress("researching");
    try {
      const result = await researchProject(project.name, project.location, {
        focusIds,
        currentEvidence: items.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          classification: item.classification,
          citation: item.citation,
        })),
        forceRefresh,
        onProgress: setSourceResearchProgress,
      });
      setSearchCoverage(result.researchCoverage);
      const proposals = Object.fromEntries(
        result.evidence
          .filter((item) => focusIds.includes(item.id) && Boolean(item.sourceUrl))
          .map((item) => [item.id, item]),
      );
      setSourceProposals(proposals);
      if (result.researchCache) {
        const label = result.researchCache.state === "updated" ? "Research updated now" : `${result.researchCache.state} cached research`;
        setSourceCacheNotice(`${label}${result.researchCache.providerAvailable === false ? `; provider unavailable (${result.researchCache.errorType ?? "upstream"})` : ""}.`);
      }
      if (!Object.keys(proposals).length) {
        setSourceResearchError("The focused searches completed, but no new project-specific source passed validation.");
      }
    } catch (error) {
      setSourceResearchError(error instanceof Error ? error.message : "Source research is unavailable. Try again.");
    } finally {
      setSourceResearchProgress(null);
    }
  };

  const acceptSourceProposal = (proposal: CustomEvidenceRecord) => {
    if (!proposal.sourceUrl) return;
    const accepted = applyEvidenceCorrection(proposal.id, {
      value: String(proposal.value),
      claim: `${proposal.description} ${proposal.citation}`.trim(),
      sourceUrl: proposal.sourceUrl,
      classification: proposal.classification,
      researchProposal: proposal,
    });
    if (!accepted) {
      setSourceResearchError(`The proposed source for ${proposal.label} could not be applied.`);
      return;
    }
    logSessionAction("Focused source research, human-accepted", proposal.id);
    recordAIDecision(proposal.id, proposal.classification, proposal.description, "accepted", proposal.classification);
    setSourceProposals((current) => {
      const next = { ...current };
      delete next[proposal.id];
      return next;
    });
  };

  const acceptAssessment = (item: EvidenceItem, assessment: AIEvidenceSuccess) => {
    updateClassification(item.id, assessment.classification, "ai", "ai-accepted");
    logSessionAction("AI-proposed, human-accepted", item.id);
    recordAIDecision(item.id, assessment.classification, assessment.reasoning, "accepted", assessment.classification);
    setAssessments((current) => ({ ...current, [item.id]: undefined }));
    setNotices((current) => ({ ...current, [item.id]: "accepted" }));
    window.setTimeout(() => {
      setNotices((current) => current[item.id] === "accepted" ? { ...current, [item.id]: undefined } : current);
    }, 4000);
  };

  const overrideAssessment = (item: EvidenceItem) => {
    logSessionAction("AI-proposed, human-overridden", item.id);
    const assessment = assessments[item.id];
    if (assessment?.status === "success") {
      updateClassification(item.id, item.classification, "ai", "ai-overridden");
      recordAIDecision(item.id, assessment.classification, assessment.reasoning, "overridden", item.classification);
    }
    setAssessments((current) => ({ ...current, [item.id]: undefined }));
    setNotices((current) => ({ ...current, [item.id]: "overridden" }));
    window.setTimeout(() => {
      setNotices((current) => current[item.id] === "overridden" ? { ...current, [item.id]: undefined } : current);
    }, 4000);
  };

  const rejectSourceProposal = (id: string) => setSourceProposals((current) => {
    const next = { ...current };
    delete next[id];
    return next;
  });

  const renderEvidenceRow = (item: EvidenceItem) => (
    <EvidenceRow
      key={item.id}
      item={item}
      onChange={updateClassification}
      onAnalyze={analyzeOne}
      onAccept={acceptAssessment}
      onOverride={overrideAssessment}
      assessment={assessments[item.id]}
      notice={notices[item.id]}
      analysisBusy={activeAnalysisId === item.id}
      analysisDisabled={isAnalysisBusy}
      sourceProposal={sourceProposals[item.id]}
      onAcceptSourceProposal={acceptSourceProposal}
      onRejectSourceProposal={rejectSourceProposal}
    />
  );

  return (
    <div ref={rootRef}>
      <PageIntro
        eyebrow="02 / source the conviction"
        title="Evidence is not a footnote. It is an active model input."
        description={`${items.length} diligence inputs keep provenance and impact role separate. Every evidence item affects the financial stress case, decision posture, or contextual assessment.`}
        right={
          <div className="flex flex-wrap items-end justify-end gap-2">
            <div data-testid="text-evidence-count" className="rounded-lg border border-[#cbd8d4] bg-[#f9faf8] px-4 py-3 text-right">
              <div className="font-mono text-xl font-bold text-[#122232]">{items.length}<span className="text-[#52616b]"> / {items.length}</span></div>
              <div className="text-[9px] uppercase tracking-[0.14em] text-[#52616b]">Inputs registered</div>
            </div>
            <div className="flex flex-col items-stretch gap-1">
              <button
                data-testid="button-analyze-all-ai"
                type="button"
                disabled={isAnalysisBusy}
                aria-busy={isAnalysisBusy}
                onClick={() => void (customProject ? researchMissingSources(false) : analyzeAll())}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#9aaec0] bg-[#122232] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] hover:border-[#d4e86b] disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                {customProject
                  ? sourceResearchProgress === "retrying" ? "Retrying source research…" : sourceResearchProgress ? "Researching missing sources…" : "Research Missing Sources"
                  : batchProgress ? `Analyzing ${batchProgress.current} of ${batchProgress.total}…` : "Analyze All with AI"}
              </button>
              {customProject && (
                <button
                  data-testid="button-force-refresh-research"
                  type="button"
                  disabled={isAnalysisBusy}
                  onClick={() => void researchMissingSources(true)}
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-[#cbd8d4] bg-white px-3 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#52616b] hover:border-[#255bb7] hover:text-[#255bb7] disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw aria-hidden="true" className="h-3 w-3" /> Force provider refresh
                </button>
              )}
              {customProject && !sourceResearchProgress
                ? <span data-testid="custom-ai-reassessment-note" role="note" className="text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[#7d898f]">Searches unresolved inputs · human acceptance required</span>
                : batchProgress && <span data-testid="status-ai-batch" role="status" aria-live="polite" className="text-right font-mono text-[8px] uppercase tracking-[0.08em] text-[#60707d]">One item at a time · suggestions only</span>}
            </div>
          </div>
        }
      />
      {customProject && <ResearchSearchAudit coverage={searchCoverage} audit={project.researchAudit} evidence={items} />}
      {customProject && (
        <aside data-testid="custom-research-containment-status" role="status" className="mb-5 rounded-lg border-2 border-[#ba2f45] bg-[#fff3f4] px-4 py-3 text-[10px] leading-5 text-[#7f2635]">
          <strong>Custom research is not yet accepted into the model.</strong> Eligible proposals: {project.eligibleEvidenceCount ?? 0} / {items.length}. Unverified leads: {project.retrievedLeadCount ?? 0}. Numeric values with incompatible or unknown units remain visible for review but are quarantined from cash flow until a validated proposal is explicitly accepted.
        </aside>
      )}
      {customProject && sourceResearchError && (
        <aside data-testid="source-research-status" role="status" className="mb-5 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] px-4 py-3 text-[10px] text-[#6f460e]">
          {sourceResearchError}
        </aside>
      )}
      {customProject && sourceCacheNotice && (
        <aside data-testid="source-research-cache-status" role="status" className="mb-5 rounded-lg border border-[#9bd8c5] bg-[#eff8f4] px-4 py-3 text-[10px] text-[#08644f]">
          {sourceCacheNotice}
        </aside>
      )}
      {customProject && Object.keys(sourceProposals).length > 0 && (
        <aside data-testid="source-research-summary" role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#8dc8e8] bg-[#eef8fc] px-4 py-3 text-[10px] text-[#255bb7]">
          <span>Found {Object.keys(sourceProposals).length} new source-backed proposal{Object.keys(sourceProposals).length === 1 ? "" : "s"}. Open each highlighted input to review it.</span>
          <button
            data-testid="button-accept-all-source-proposals"
            type="button"
            onClick={() => Object.values(sourceProposals).forEach(acceptSourceProposal)}
            className="rounded bg-[#08644f] px-3 py-2 font-mono text-[8px] font-bold uppercase text-white"
          >
            Accept all supported findings
          </button>
        </aside>
      )}
      <aside data-testid="ai-evidence-time-contract" role="note" className="mb-5 rounded-lg border border-[#cbd8d4] bg-[#f4f8f5] px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#607500]">AI evidence time contract</div>
            <h2 className="mt-1 text-[12px] font-semibold text-[#243844]">Review the diligence cutoff before running analysis</h2>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#52616b]">
            <span data-testid="ai-evidence-cutoff" className="rounded-full bg-white px-2.5 py-1">Cutoff: <time dateTime={AI_EVIDENCE_TEMPORAL_CONFIG.cutoffDate}>{AI_EVIDENCE_CUTOFF_LABEL}</time></span>
            <span data-testid="ai-evidence-reporting-window" className="rounded-full bg-white px-2.5 py-1">Valid reporting: {AI_EVIDENCE_REPORTING_WINDOW}</span>
          </div>
        </div>
        <p className="mt-2 max-w-4xl text-[10px] leading-4 text-[#52616b]">
          The AI prompt and this evidence section use the same reviewed temporal record. Dated {AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL} reporting remains valid and potentially current as of the cutoff; update the shared temporal configuration when the diligence cutoff changes.
        </p>
      </aside>
      {showClassificationTip && (
        <aside data-testid="evidence-classification-tip" role="note" className="classification-tip mb-5 flex items-start gap-3 rounded-lg border border-[#b9d43a]/70 bg-[#f8fbe8] px-4 py-3 text-[#344550]">
          <Lightbulb aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#607500]" />
          <p className="min-w-0 flex-1 text-[11px] leading-5">
            <strong className="font-semibold text-[#122232]">Try it:</strong> Click any dropdown and change a classification. Watch what happens.
          </p>
          <button
            data-testid="button-dismiss-evidence-classification-tip"
            type="button"
            aria-label="Dismiss classification tip"
            title="Dismiss classification tip"
            onClick={dismissClassificationTip}
            className="shrink-0 rounded p-1 text-[#607500] transition-colors hover:bg-[#d4e86b]/40 hover:text-[#344550]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </aside>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {counts.map(({ classification, count }) => {
          const meta = classMeta[classification];
          return <div key={classification} data-testid={`count-classification-${meta.short.toLowerCase()}`} className="rounded-lg border p-3" style={{ borderColor: meta.border, backgroundColor: meta.bg }}><div className="flex items-center justify-between gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} /><span className="font-mono text-xl font-bold" style={{ color: meta.color }}>{count}</span></div><div className="mt-2 text-[9px] font-bold uppercase leading-3 tracking-[0.1em]" style={{ color: meta.color }}>{classification}</div></div>;
        })}
      </div>
      <DecisionHistory items={decisionHistory} evidence={evidence} />
      <div className="mb-4" role="group" aria-label="Evidence filters">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {evidenceFilters.map((filter) => {
            const active = activeFilter === filter.id;
            return (
              <button key={filter.id} data-testid={`filter-evidence-${filter.id}`} type="button" aria-pressed={active} onClick={() => setActiveFilter(filter.id)} className={`min-h-9 shrink-0 rounded-full border px-3 font-mono text-[9px] font-bold uppercase tracking-[0.08em] ${active ? "border-[#122232] bg-[#122232] text-[#d4e86b]" : "border-[#cbd8d4] bg-white text-[#52616b] hover:border-[#8da0aa]"}`}>
                {filter.label}
              </button>
            );
          })}
        </div>
        {activeFilter !== "all" && <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d898f]">{filteredItems.length} matching inputs · material gaps listed first</p>}
      </div>
      {activeFilter === "all" ? (
      <div className="space-y-3">
        {evidenceCategories.map((category) => {
          const categoryItems = category.itemIds.map((id) => evidence[id]).filter(Boolean);
          const verified = categoryItems.filter((item) => item.classification === "Verified Evidence").length;
          const missing = categoryItems.filter((item) => item.classification === "Missing Evidence").length;
          return (
            <section key={category.id} id={`evidence-category-${category.id}`} data-testid={`evidence-category-${category.id}`} className="overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e0e4] bg-[#f1f5f3] px-4 py-3 md:px-5">
                 <div><h2 className="text-[13px] font-semibold text-[#122232]">{category.label}</h2><p className="mt-0.5 text-[10px] text-[#7d898f]">{categoryItems.length} inputs · provenance summary</p></div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em]"><span className="rounded-full bg-[#e0f4ed] px-2 py-1 text-[#0b7a63]">{verified} verified</span><span className={`rounded-full px-2 py-1 ${missing ? "bg-[#fde8eb] text-[#ba2f45]" : "bg-white text-[#7d898f]"}`}>{missing} missing</span></div>
              </header>
              <div className="hidden grid-cols-[1.55fr_0.8fr_1.55fr] gap-3 border-b border-[#e5eae8] px-5 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d898f] md:grid"><span>Finding</span><span>Current value</span><span>Classification · relevance · source</span></div>
              {categoryItems.map(renderEvidenceRow)}
              {category.id === "power-grid" && (
                <>
                  {!customProject && <EiaElectricityEvidence
                    data={eiaData}
                    loading={eiaLoading}
                    source={sourceStates.eia}
                    classification={evidence.electricity_cost.classification}
                    onSuggestVerified={() => updateClassification("electricity_cost", "Verified Evidence")}
                    projectName={project.name}
                  />}
                {!customProject && <article data-testid="ercot-grid-evidence" className="border-t border-[#d9e0e4] bg-[#f7faf8] px-4 py-4 md:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">ERCOT Interconnection Queue citation</div>
                      <h3 className="mt-1 text-[12px] font-semibold text-[#122232]">Grid Interconnection Timeline · public queue check</h3>
                    </div>
                    <SourceStatusBadge source={sourceStates["ercot-queue"]} testId="ercot-evidence-source-status" />
                  </div>
                  {match ? (
                    <dl data-testid="ercot-matching-record" className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Project</dt><dd className="mt-1 text-[#243844]">{match.name} · {match.inr}</dd></div>
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Capacity / status</dt><dd className="mt-1 text-[#243844]">{match.capacityMw.toFixed(1)} MW · {match.currentStatus}</dd></div>
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">COD / IA</dt><dd className="mt-1 text-[#243844]">{match.projectedCod ? formatSourceTimestamp(match.projectedCod) : "Projected COD not published"} · {match.iaStatus ?? "IA status not published"}</dd></div>
                      <div><dt className="font-bold uppercase tracking-[0.1em] text-[#7d898f]">Slips / position</dt><dd className="mt-1 text-[#243844]">{match.codSlipCount} slips · {match.totalDaysSlipped} days{match.queuePosition !== null ? ` · Queue position ${match.queuePosition}` : " · Queue position not published"}</dd></div>
                    </dl>
                  ) : (
                    <p data-testid="ercot-no-named-match" className="mt-3 text-[10px] leading-4 text-[#52616b]">
                       No named Stargate, Oracle, or Crusoe customer-specific record was published in the generation queue. The existing cancellation and delay evidence remains public-reporting context; this feed does not independently confirm it.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e8e5] pt-3">
                     <p className="text-[9px] text-[#60707d]">Provider response {formatSourceTimestamp(ercotQueue.fetchedAt ?? undefined)} · dataset freshness {formatSourceTimestamp(ercotQueue.sourceUpdatedAt ?? undefined)} · aggregate as of {formatSourceTimestamp(ercotQueue.stats.asOfDate ?? undefined)} · feed freshness does not change evidence classification.</p>
                    {canSuggestVerified ? (
                      <button
                        data-testid="button-suggest-verified-grid"
                        type="button"
                        onClick={() => updateClassification("grid_interconnection", "Verified Evidence")}
                        className="rounded-md border border-[#0b7a63] bg-[#e0f4ed] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#08644f]"
                      >
                        Suggest VERIFIED
                      </button>
                    ) : (
                      <span data-testid="text-no-ercot-suggestion" className="text-[9px] text-[#7d898f]">
                        No suggestion: a live named record with an explicit delay or cancellation is required.
                      </span>
                    )}
                  </div>
                </article>}
                </>
              )}
            </section>
          );
        })}
      </div>
      ) : (
        <section data-testid="evidence-filtered-list" className="overflow-hidden rounded-xl border border-[#d9e0e4] bg-white" aria-label="Filtered evidence inputs">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e0e4] bg-[#f1f5f3] px-4 py-3 md:px-5">
            <div>
              <h2 className="text-[13px] font-semibold text-[#122232]">{evidenceFilters.find((filter) => filter.id === activeFilter)?.label}</h2>
              <p className="mt-0.5 text-[10px] text-[#7d898f]">{filteredItems.length} inputs · material gaps first · one row expands at a time</p>
            </div>
          </header>
          <div className="hidden grid-cols-[1.55fr_0.8fr_1.55fr] gap-3 border-b border-[#e5eae8] px-5 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d898f] md:grid"><span>Finding</span><span>Current value</span><span>Classification · relevance · source</span></div>
          {filteredItems.length === 0 ? (
            <p className="px-4 py-4 text-[10px] leading-4 text-[#60707d] md:px-5">No inputs match this filter.</p>
          ) : filteredItems.map(renderEvidenceRow)}
        </section>
      )}
      <CommunityAgreementsReview />
      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a65a00]" /><div><div className="text-[11px] font-bold text-[#6f460e]">Classification changes are live</div><div className="mt-1 text-[10px] leading-4 text-[#7f6337]">Materiality, confidence, and the recommendation status update as soon as a dropdown changes.</div></div></div>
        {showModelConfidence && <div className="flex shrink-0 items-center gap-2 rounded border border-[#ecd39d] bg-white/50 px-2.5 py-2"><RefreshCw className="h-3.5 w-3.5 text-[#a65a00]" /><span data-testid="text-live-confidence" className="font-mono text-[10px] font-bold text-[#6f460e]">{metrics.confidenceScore}% confidence</span></div>}
      </div>
      <BottomNav screen="evidence" onNavigate={onNavigate} />
    </div>
  );
}

function DecisionHistory({ items, evidence }: { items: DecisionHistoryEntry[]; evidence: Record<string, EvidenceItem> }) {
  const orderedItems = [...items].reverse();
  return (
    <section data-testid="ai-decision-history" aria-labelledby="ai-decision-history-title" className="mb-5 overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
      <header className="border-b border-[#d9e0e4] bg-[#122232] px-4 py-4 text-white md:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#b9d43a]">Reviewable decision trail</div>
            <h2 id="ai-decision-history-title" className="mt-1 text-[16px] font-semibold">AI decisions behind the classification</h2>
          </div>
          <span data-testid="ai-decision-history-count" className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#aebdc5]">{items.length} {items.length === 1 ? "entry" : "entries"}</span>
        </div>
        <p className="mt-2 max-w-3xl text-[10px] leading-4 text-[#c4d0d6]">Model suggestions and human decisions are recorded separately. This history explains how the current classification was reached; it does not change the live model.</p>
      </header>
      {orderedItems.length === 0 ? (
        <p data-testid="ai-decision-history-empty" className="px-4 py-4 text-[10px] leading-4 text-[#60707d] md:px-5">No AI decisions or manual classification changes have been recorded in this session.</p>
      ) : (
        <ol className="divide-y divide-[#e5eae8]">
          {orderedItems.map((entry, index) => {
            const item = evidence[entry.itemId];
            if (!item) return null;
            return (
              <li key={`${entry.recordedAt}-${entry.itemId}-${index}`} data-testid={`decision-history-entry-${index}`} className="px-4 py-4 md:px-5">
                {entry.kind === "ai" ? (
                  <AIDecisionHistoryEntry entry={entry} item={item} />
                ) : (
                  <ManualDecisionHistoryEntry entry={entry} item={item} />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function AIDecisionHistoryEntry({ entry, item }: { entry: Extract<DecisionHistoryEntry, { kind: "ai" }>; item: EvidenceItem }) {
  const accepted = entry.decision === "accepted";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#607500]" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">Model suggestion</span>
            <span className={`rounded-full px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${accepted ? "bg-[#e0f4ed] text-[#0b7a63]" : "bg-[#fff0d6] text-[#a65a00]"}`}>{accepted ? "Accepted by human" : "Overridden by human"}</span>
          </div>
          <h3 className="mt-2 text-[12px] font-semibold text-[#243844]">{item.label}</h3>
        </div>
        <time dateTime={entry.recordedAt} className="font-mono text-[9px] text-[#7d898f]">{formatDecisionTime(entry.recordedAt)}</time>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">AI proposed</div>
          <div className="mt-2"><ClassificationBadge value={entry.proposedClassification} compact /></div>
          <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{entry.reasoning}</p>
        </div>
        <div className="rounded-lg border border-[#d9e0e4] bg-[#fbfcfa] p-3">
          <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">Human decision / resulting classification</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-[#52616b]">{accepted ? "Accepted" : "Override retained"}</span>
            <ClassificationBadge value={entry.resultingClassification} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualDecisionHistoryEntry({ entry, item }: { entry: Extract<DecisionHistoryEntry, { kind: "manual" }>; item: EvidenceItem }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#255bb7]" aria-hidden="true" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#255bb7]">Human decision · manual classification change</span>
        </div>
        <h3 className="mt-2 text-[12px] font-semibold text-[#243844]">{item.label}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#52616b]">
          <ClassificationBadge value={entry.previousClassification} compact />
          <span aria-hidden="true">→</span>
          <ClassificationBadge value={entry.resultingClassification} compact />
        </div>
      </div>
      <time dateTime={entry.recordedAt} className="font-mono text-[9px] text-[#7d898f]">{formatDecisionTime(entry.recordedAt)}</time>
    </div>
  );
}

function formatDecisionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function reviewLabel(kind: NonNullable<EvidenceItem["review"]>["kind"]) {
  if (kind === "ai-accepted") return "AI-suggested, accepted by analyst";
  if (kind === "ai-overridden") return "AI-suggested, overridden by analyst";
  return "Reviewed by analyst";
}


function formatReviewTime(value: string) {
  return formatDecisionTime(value);
}
