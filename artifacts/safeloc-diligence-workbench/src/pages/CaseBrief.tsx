
import {
  SectionKicker,
  Disclosure,
  PageIntro,
  BottomNav
} from "@/components/Shell";

import {
  ArrowRight,
  MapPin,
  Target,
  Zap
} from "lucide-react";







import type {
  Screen
} from "@/components/Shell";
import { useDiligence } from "@/context/DiligenceContext";
import { formatSourceTimestamp } from "@/data/sources";
import {
  ACTIVE_FEMA_NRI_PROFILE,
  FEMA_NRI_ATTRIBUTION,
  getTopFemaHazards,
} from "@/data/femaNRI";
import { ClaimCitation } from "@/components/ClaimCitation";
import { summarizeResearchAudit, summarizeSourceCoverage } from "@/services/researchProjectService";
import { ResearchSearchAudit } from "@/components/ResearchSearchAudit";

function ScopeLimitationsDisclosure() {
  return (
    <Disclosure title="Scope and Limitations" testId="disclosure-scope-limitations">
      <div data-testid="scope-limitations-content" className="text-[11px] leading-5 text-[#52616b]">
        <p>SafeLoc models 16 power, water, grid, climate, community, and financial variables. The following factors are relevant context for interpreting the analysis, but they are not additional modeled evidence inputs:</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            "Electrical-equipment lead times",
            "Local electricity-rate impacts",
            "Noise and operational impacts",
            "Jurisdictional moratoriums",
            "Semiconductor and memory supply constraints",
            "Speculative or phantom grid-load requests",
          ].map((factor) => <li key={factor} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#255bb7]" />{factor}</li>)}
        </ul>
        <p className="mt-3 border-t border-[#e5eae8] pt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#60707d]">Context only — these factors do not change the five-screen workbench flow, evidence classifications, or the 16-variable financial model.</p>
      </div>
    </Disclosure>
  );
}

function CommunityReadiness({ onFocusCommunity }: { onFocusCommunity?: () => void }) {
  const { communityReview, communityUnresolvedCount } = useDiligence();
  const relationship = communityReview.relationship;
  return (
    <section data-testid="community-readiness-signal" className="mt-5 rounded-lg border border-[#cbd8d4] bg-[#f1f5f3] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Community readiness</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span data-testid="community-readiness-relationship" className="rounded-full bg-[#e5efff] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[#255bb7]">{relationship.relationship}</span>
            <span data-testid="community-readiness-gaps" className="text-[10px] text-[#344550]">{communityUnresolvedCount} unresolved term{communityUnresolvedCount === 1 ? "" : "s"} · {relationship.confidence}% relationship confidence</span>
          </div>
        </div>
        <button data-testid="button-review-community-terms" type="button" onClick={onFocusCommunity} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-[#122232] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b]">Review Community Terms <ArrowRight aria-hidden="true" className="ml-2 h-3.5 w-3.5" /></button>
      </div>
      <p className="mt-2 text-[9px] leading-4 text-[#60707d]">Community readiness is project-level stewardship context, not a fund-level risk rating.</p>
    </section>
  );
}

function CustomCaseBrief({ project, onNavigate, onFocusCommunity }: { project: ReturnType<typeof useDiligence>["project"]; onNavigate: (screen: Screen) => void; onFocusCommunity?: () => void }) {
  const { evidence, researchEvidence } = useDiligence();
  const evidenceItems = Object.values(evidence);
  const researchItems = project.kind === "custom" ? Object.values(researchEvidence ?? evidence) : evidenceItems;
  const sourceCoverage = summarizeSourceCoverage(researchItems);
  const researchAudit = summarizeResearchAudit(researchItems);
  const isDefaultAssumptions = project.researchMode === "default-assumptions";
  const isResearchIncomplete = project.researchMode === "research-incomplete";
  const eligibleEvidenceCount = project.eligibleEvidenceCount ?? 0;
  const retrievedLeadCount = project.retrievedLeadCount ?? 0;
  const capacityLabel = project.capacityProvenance === "directory-reported"
    ? "Directory-reported model capacity"
    : project.capacityProvenance === "ai-reported"
      ? "AI-reported model capacity"
      : "Standardized model capacity";
  const capacityNote = project.capacityProvenance === "directory-reported"
    ? "Compute Atlas directory capacity used to scale the synthetic model; it is not SafeLoc evidence."
    : project.capacityProvenance === "ai-reported"
      ? "AI-reported capacity used to scale the synthetic model."
      : "No usable project capacity returned; standardized 1,200 MW default used.";
  const cacheLabel = project.researchCache
    ? project.researchCache.state === "updated" ? "Updated just now"
      : `${project.researchCache.state[0].toUpperCase()}${project.researchCache.state.slice(1)} cached research`
    : null;
  return (
    <div>
      <PageIntro
        eyebrow="01 / frame the opportunity"
        title={project.name}
        description={isDefaultAssumptions ? "Review the default project setup, capacity basis, and unresolved evidence scope before using the model." : isResearchIncomplete ? "Research Incomplete: review source coverage before treating any generated lead as evidence." : "Review the researched project summary, capacity basis, and evidence scope before relying on the return."}
        right={<div data-testid="custom-project-status" className="flex items-center gap-2 self-start rounded-full border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6f460e] md:self-auto"><span className="h-2 w-2 rounded-full bg-[#a65a00]" /> {isDefaultAssumptions ? "Default assumptions · research unavailable" : isResearchIncomplete ? "Research Incomplete" : "AI-researched · high-level"}</div>}
      />
      <section data-testid="custom-project-summary" className="rounded-xl border border-[#cbd8d4] bg-white p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e5eae8] pb-5">
          <div><SectionKicker>Custom project summary</SectionKicker><h2 className="text-[29px] font-semibold tracking-[-0.04em] text-[#122232]">{project.name}</h2><p className="mt-2 flex items-center gap-2 text-[12px] text-[#52616b]"><MapPin className="h-3.5 w-3.5 text-[#ba2f45]" />{project.location}</p></div>
          <div className="rounded-lg bg-[#122232] px-4 py-3 text-right text-white"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#a4b4bd]">{capacityLabel}</div><div data-testid="custom-project-capacity" className="mt-1 font-mono text-xl font-bold text-[#d4e86b]">{project.capacityMW.toLocaleString()} MW</div><div data-testid="custom-project-capacity-note" className="mt-1 max-w-[180px] text-[9px] leading-4 text-[#c4d0d6]">{capacityNote}</div></div>
        </div>
        {isResearchIncomplete ? (
          <div data-testid="custom-unverified-leads" className="mt-5 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#8a5200]">Unverified leads</div>
            <p data-testid="custom-project-description" className="mt-2 max-w-4xl text-[13px] leading-6 text-[#6f460e]">{project.description}</p>
          </div>
        ) : (
          <p data-testid="custom-project-description" className="mt-5 max-w-4xl text-[13px] leading-6 text-[#344550]">{project.description}</p>
        )}
        <aside data-testid="custom-research-acceptance-boundary" className="mt-4 rounded-lg border-2 border-[#ba2f45] bg-[#fff3f4] px-4 py-3 text-[10px] leading-5 text-[#7f2635]">
          <strong>Research is not yet accepted into the model.</strong> Loading, reviewing, refreshing, or caching a finding cannot change returns, decision posture, or material-gap counts. {eligibleEvidenceCount} eligible proposal{eligibleEvidenceCount === 1 ? "" : "s"} await explicit reviewer acceptance; {retrievedLeadCount} lead{retrievedLeadCount === 1 ? "" : "s"} remain quarantined.
        </aside>
        {cacheLabel && (
          <div data-testid="custom-research-cache-status" className={`mt-4 rounded-lg border px-4 py-3 text-[10px] leading-5 ${project.researchCache?.providerAvailable === false ? "border-[#f1cb8b] bg-[#fff8e9] text-[#6f460e]" : "border-[#9bd8c5] bg-[#eff8f4] text-[#08644f]"}`}>
            <strong>{cacheLabel}</strong>
            {project.researchCache?.storedAt && <> · saved <time dateTime={project.researchCache.storedAt}>{new Date(project.researchCache.storedAt).toLocaleString()}</time></>}
            {project.researchCache?.refreshStatus === "running" && <> · checking for an update in the background</>}
            {project.researchCache?.providerAvailable === false && <> · provider unavailable ({project.researchCache.errorType ?? "upstream"}); retained research remains visible</>}
          </div>
        )}
        {!isDefaultAssumptions && (
          <div data-testid="source-coverage-summary" className="mt-5 rounded-lg border border-[#d9e0e4] bg-[#f5f7f6] p-4">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Source Coverage</div>
             <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div><strong data-testid="source-coverage-supported" className="font-mono text-lg text-[#08644f]">{sourceCoverage.supported} of 16</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">with any retrieved source</p></div>
              <div><strong data-testid="source-coverage-eligible" className="font-mono text-lg text-[#255bb7]">{eligibleEvidenceCount} of 16</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">eligible proposals · not yet accepted</p></div>
              <div><strong data-testid="source-coverage-ai-knowledge" className="font-mono text-lg text-[#a65a00]">{sourceCoverage.aiKnowledge} of 16</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">classified from AI knowledge — verify independently</p></div>
              <div><strong data-testid="source-coverage-missing" className="font-mono text-lg text-[#ba2f45]">{sourceCoverage.missing} of 16</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">with no information found</p></div>
               <div><strong data-testid="audit-unique-source-count" className="font-mono text-lg text-[#255bb7]">{researchAudit.uniqueValidatedSourceCount}</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">unique validated sources</p></div>
               <div><strong data-testid="audit-average-confidence" className="font-mono text-lg text-[#607500]">{researchAudit.averageSourceSupportConfidence}%</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">average source-support confidence</p></div>
               <div><strong data-testid="audit-strong-support-count" className="font-mono text-lg text-[#08644f]">{researchAudit.strongSupportItemCount}</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">items with strong support (90%+)</p></div>
               <div><strong data-testid="audit-no-source-count" className="font-mono text-lg text-[#ba2f45]">{researchAudit.noSourceItemCount}</strong><p className="mt-1 text-[10px] leading-4 text-[#52616b]">items with no validated source</p></div>
            </div>
          </div>
        )}
        {!isDefaultAssumptions && <ResearchSearchAudit coverage={project.researchCoverage} audit={project.researchAudit} />}
         <div className="mt-5 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4 text-[10px] leading-5 text-[#6f460e]">{isDefaultAssumptions ? "AI research did not complete. All 16 evidence variables are Missing Evidence, so no project-specific finding changes the synthetic return until a reviewer supplies and accepts evidence." : isResearchIncomplete ? "RESEARCH INCOMPLETE: zero eligible project-specific sources passed containment. Generated content is shown only under Unverified leads and cannot be promoted into the model." : `Research proposals are quarantined until explicit human acceptance. Findings are not facility-level proof unless the cited project source supports them; the modeled set remains exactly ${Object.keys(evidence).length} synthetic variables.`}</div>
      </section>
      <div className="mt-5"><ScopeLimitationsDisclosure /></div>
      <CommunityReadiness onFocusCommunity={onFocusCommunity} />
      <div className="mt-5 rounded-xl bg-[#d4e86b] p-5 text-[#1c2a16]">
        <div className="flex items-center justify-between"><SectionKicker tone="lime">Next step</SectionKicker><Target className="h-5 w-5 opacity-60" /></div>
        <div className="mt-1 text-[19px] font-semibold leading-tight tracking-[-0.025em]">Review the researched evidence before relying on the return.</div>
        <button data-testid="button-open-evidence-from-custom-brief" onClick={() => onNavigate("evidence")} className="mt-5 inline-flex items-center gap-2 border-b border-[#1c2a16] pb-1 text-[10px] font-bold uppercase tracking-[0.15em]">Open evidence room <ArrowRight className="h-3.5 w-3.5" /></button>
      </div>
      <BottomNav screen="brief" onNavigate={onNavigate} />
    </div>
  );
}

export function CaseBrief({ onNavigate, onFocusCommunity }: { onNavigate: (screen: Screen) => void; onFocusCommunity?: () => void }) {
  const { ercotQueue, project } = useDiligence();
  if (project.kind === "custom") return <CustomCaseBrief project={project} onNavigate={onNavigate} onFocusCommunity={onFocusCommunity} />;
  const topHazards = getTopFemaHazards(ACTIVE_FEMA_NRI_PROFILE);
  const queueStatus = ercotQueue.status === "live" ? "Live" : ercotQueue.status === "cached" ? "Cached" : "Embedded";
  const queueStatusClasses = ercotQueue.status === "live"
    ? "bg-[#e0f4ed] text-[#08644f]"
    : "bg-[#fff0d6] text-[#7c4c00]";
  return (
    <div>
      <PageIntro
        eyebrow="01 / frame the opportunity"
        title="The return is only as durable as the evidence behind it."
        description="A public-source diligence case for Stargate Abilene, paired with clearly labeled synthetic acquisition economics. The operating facts are real-world evidence; the returns are a representative underwriting lens, not reported transaction terms."
        right={<div className="flex items-center gap-2 self-start rounded-full border border-[#cbd8d4] bg-[#f9faf8] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#60707d] md:self-auto"><span className="h-2 w-2 rounded-full bg-[#ba2f45]" /> Location · Taylor County, TX</div>}
      />
      <div className="mb-5"><ScopeLimitationsDisclosure /></div>
      <section data-testid="brief-overview-summary" className="mb-5 rounded-xl border border-[#cbd8d4] bg-white p-5 md:p-6" aria-labelledby="brief-overview-summary-title">
        <div className="flex flex-col gap-4 border-b border-[#e5eae8] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <SectionKicker>Decision snapshot</SectionKicker>
            <h2 id="brief-overview-summary-title" className="text-[22px] font-semibold tracking-[-0.03em] text-[#122232]">Stargate Abilene · Taylor County, Texas</h2>
            <p className="mt-1 text-[11px] text-[#52616b]">Operator context: OpenAI · Oracle · Crusoe Energy · current operating footprint with a 1.2 GW target.</p>
          </div>
          <span className="rounded-full border border-[#f1cb8b] bg-[#fff8e9] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#6f460e]">IC pre-read · evidence under review</span>
        </div>
        <p className="mt-4 max-w-3xl text-[14px] font-semibold leading-6 text-[#344550]">Contracted AI demand meets physical infrastructure limits; the investment question is whether grid, water, cooling, and community evidence is strong enough to support the modeled return.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Water disclosure", "Missing", "Use and rights remain undisclosed"],
            ["Grid expansion", "Cancelled", "Reported interconnection delay"],
            ["Cooling resilience", "Tested", "Winter storm damage reported"],
            ["Construction peak", "~6,400", "Local capacity pressure"],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-3">
              <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">{label}</div>
              <div className="mt-1 font-mono text-[16px] font-bold text-[#122232]">{value}</div>
              <div className="mt-1 text-[10px] leading-4 text-[#52616b]">{detail}</div>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="relative min-h-[360px] overflow-hidden rounded-xl bg-[#122232] p-6 text-white md:p-8">
          <div className="absolute right-0 top-0 h-full w-1/2 opacity-40 [background-image:linear-gradient(#345063_1px,transparent_1px),linear-gradient(90deg,#345063_1px,transparent_1px)] [background-size:30px_30px] [mask-image:linear-gradient(90deg,transparent,black)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#b9d43a]">Case brief / STARGATE-ABI-26</div>
                <h2 className="mt-5 max-w-lg text-[30px] font-semibold leading-[1.06] tracking-[-0.04em] md:text-[39px]">Stargate<br /><span className="text-[#b9d43a]">Abilene</span></h2>
                <p className="mt-4 max-w-xl text-[11px] leading-5 text-[#c4d0d6]">OpenAI · Oracle · Crusoe Energy<br />Part of the $500 billion Stargate initiative backed by OpenAI, SoftBank, Oracle, and MGX.</p>
                <ClaimCitation claimId="stargate-initiative" dark />
              </div>
              <div className="hidden rounded-md border border-white/15 px-3 py-2 text-right sm:block">
                <div className="text-[9px] uppercase tracking-[0.14em] text-[#a0b0b8]">Stage</div>
                <div className="mt-1 font-mono text-[12px] text-[#f5ddd5]">IC PRE-READ</div>
              </div>
            </div>
            <div className="grid max-w-xl grid-cols-2 gap-x-8 gap-y-5 border-t border-white/15 pt-5 sm:grid-cols-4">
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Current / target</div><div className="mt-1 font-mono text-base">0.3 / 1.2 GW</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Site</div><div className="mt-1 font-mono text-base">~1,000 acres</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Built form</div><div className="mt-1 font-mono text-base">8 buildings</div></div>
              <div><div className="text-[9px] uppercase tracking-[0.15em] text-[#a0b0b8]">Floor area</div><div className="mt-1 font-mono text-base">~4M sq ft</div></div>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#f9faf8] p-6">
          <SectionKicker>Investment thesis</SectionKicker>
          <h3 className="text-[21px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">Contracted AI demand meets physical infrastructure limits.</h3>
          <p className="mt-4 text-[12px] leading-5 text-[#63717a]">Public reporting ties the campus to more than 450,000 NVIDIA GB200 GPUs under a reported 15-year Oracle lease. The core tension is no longer hypothetical: an expansion was cancelled after grid delays, while winter storms exposed cooling-system fragility.</p>
          <div className="flex flex-wrap gap-2"><ClaimCitation claimId="stargate-oracle-gpus" /><ClaimCitation claimId="stargate-cancellation" /><ClaimCitation claimId="stargate-cooling-damage" /></div>
          <div className="mt-6 space-y-3 border-t border-[#d9e0e4] pt-5">
            {[
              ["Catalyst", "Oracle-backed contracted GPU capacity supports a long-duration demand case."],
              ["Tension", "The original 2.1 GW expansion was cancelled after grid delays exceeded one year."],
              ["Adjacent", "Microsoft partnered with Crusoe on a separately reported 900 MW site after OpenAI capped its expansion."],
              ["Underwrite", "Water use and water rights remain undisclosed despite the campus scale."],
            ].map(([key, value]) => (
              <div key={key} className="grid grid-cols-[76px_1fr] gap-3 text-[11px]"><span className="font-mono uppercase tracking-[0.1em] text-[#52616b]">{key}</span><span className="font-medium leading-4 text-[#344550]">{value}</span></div>
            ))}
          </div>
          <ClaimCitation claimId="stargate-cancellation" />
          <ClaimCitation claimId="unresolved-water" />
        </section>
      </div>
      <aside data-testid="brief-tier-2-callout" className="mt-5 border-l-2 border-[#255bb7] bg-[#eef2f1] px-4 py-4 md:px-5">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#255bb7]">Market context / Tier 2</div>
        <p data-testid="brief-tier-2-comparison" className="mt-2 max-w-5xl text-[12px] leading-5 text-[#344550]">
          Stargate is a Tier 2 infrastructure project: grid-dependent, subject to ERCOT delays, affected by the August 2026 moratorium. Not all AI infrastructure faces these constraints. Chevron/Microsoft&apos;s Project Kilby bypassed the grid with behind-the-meter generation and is proceeding. This tool analyzes the evidence gap that separates projects that advance from projects that stall.
        </p>
        <p data-testid="brief-tier-2-qualifier" className="mt-2 max-w-5xl font-mono text-[9px] uppercase leading-4 tracking-[0.08em] text-[#60707d]">
          Project Kilby is public market context only — not facility-level Stargate evidence and not a synthetic transaction input.
        </p>
        <div className="flex flex-wrap gap-2"><ClaimCitation claimId="abbott-data-center-audit" /><ClaimCitation claimId="stargate-cancellation" /></div>
      </aside>
      <Disclosure title="Regional context · ERCOT and FEMA detail" testId="disclosure-regional-context">
      <section data-testid="ercot-queue-statistics" className="mt-5 rounded-xl border border-[#cbd8d4] bg-white p-5 md:p-6" aria-labelledby="ercot-queue-title">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5eae8] pb-4">
          <div>
            <SectionKicker>ERCOT large-load queue</SectionKicker>
            <h2 id="ercot-queue-title" className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">Public aggregate demand pressure</h2>
          </div>
          <span data-testid="ercot-queue-status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${queueStatusClasses}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ercotQueue.status === "live" ? "bg-[#0b7a63]" : "bg-[#a65a00]"}`} />
            {queueStatus}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-lg bg-[#122232] p-4 text-white">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#a9b8c0]">Total queue depth</div>
            <div data-testid="ercot-total-queue-gw" className="mt-2 break-words font-mono text-[25px] font-bold tracking-[-0.05em]">{ercotQueue.stats.totalGw.toFixed(1)} GW</div>
            <div className="mt-1 text-[10px] text-[#c4d0d6]">Large-load requests submitted</div>
          </div>
          <div className="min-w-0 rounded-lg bg-[#d4e86b] p-4 text-[#1c2a16]">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-65">Data-center share</div>
            <div data-testid="ercot-data-center-share" className="mt-2 break-words font-mono text-[25px] font-bold tracking-[-0.05em]">{ercotQueue.stats.dataCenterShare.toFixed(1)}%</div>
            <div className="mt-1 text-[10px] opacity-70">{(ercotQueue.stats.dataCenterMw / 1000).toFixed(1)} GW identified by sector</div>
          </div>
          <div className="min-w-0 rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Active data-center requests</div>
            <div data-testid="ercot-data-center-count" className="mt-2 break-words font-mono text-[20px] font-bold tracking-[-0.04em] text-[#122232]">{ercotQueue.stats.dataCenterRequestCount ?? "Not published"}</div>
            <div className="mt-1 text-[10px] leading-4 text-[#52616b]">The public aggregate does not expose a complete named customer/request count.</div>
          </div>
        </div>
        <div data-testid="ercot-batch-zero-context" className="mt-4 grid gap-2 border-t border-[#e5eae8] pt-4 sm:grid-cols-2">
          {[
            ["Batch Zero", "200 GW across 300 applicants"],
            ["Original timeline", "September 2026 start → April 2027 completion"],
            ["Revised", "January 2027 start minimum, completion unclear"],
            ["In audit limbo", "17 facilities totaling 6.6 GW completed studies but awaiting Abbott's verification clearance"],
          ].map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1 rounded-md bg-[#f4f7f5] px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
              <div className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d]">{label}</div>
              <div className="min-w-0 text-[11px] leading-4 text-[#344550]">{value}</div>
            </div>
          ))}
        </div>
        <p data-testid="ercot-source-attribution" className="mt-4 font-mono text-[9px] leading-4 text-[#52616b]">
           Source: ERCOTQueue.com, aggregate values as of {formatSourceTimestamp(ercotQueue.stats.asOfDate ?? undefined)}; source refreshed {formatSourceTimestamp(ercotQueue.stats.sourceRefreshDate ?? undefined)}; provider response {formatSourceTimestamp(ercotQueue.fetchedAt ?? undefined)}; dataset freshness {formatSourceTimestamp(ercotQueue.sourceUpdatedAt ?? undefined)}. ERCOT Batch Zero notice and August 2026 ERCOT testimony provide additional context. Aggregate queue activity and Batch Zero timing are market context, not a named Stargate or Oracle confirmation.
        </p>
        <ClaimCitation claimId="ercot-market-pressure" />
      </section>
      <section data-testid="card-fema-climate-risk" className="mt-5 rounded-xl border border-[#cbd8d4] bg-white p-5 md:p-6" aria-labelledby="fema-climate-risk-title">
        <div className="flex flex-col justify-between gap-3 border-b border-[#e5eae8] pb-4 sm:flex-row sm:items-start">
          <div>
            <SectionKicker>Public climate evidence</SectionKicker>
            <h2 id="fema-climate-risk-title" className="text-[20px] font-semibold tracking-[-0.025em] text-[#122232]">FEMA Climate Risk Profile</h2>
            <p data-testid="text-fema-county-fips" className="mt-1 font-mono text-[10px] uppercase tracking-[0.11em] text-[#52616b]">{ACTIVE_FEMA_NRI_PROFILE.county}, Texas · FIPS {ACTIVE_FEMA_NRI_PROFILE.fips}</p>
          </div>
          <span data-testid="badge-fema-attribution" className="self-start rounded-full border border-[#aac6f4] bg-[#e5efff] px-3 py-1.5 font-mono text-[9px] font-bold text-[#255bb7]">{FEMA_NRI_ATTRIBUTION}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-[#122232] p-4 text-white">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#a4b4bd]">Overall FEMA rating</div>
            <div data-testid="text-fema-overall-rating" className="mt-2 text-[18px] font-semibold text-[#d4e86b]">{ACTIVE_FEMA_NRI_PROFILE.overallRiskRating}</div>
            <div className="mt-1 font-mono text-[11px] text-[#dce4e7]">Score {ACTIVE_FEMA_NRI_PROFILE.overallRiskScore.toFixed(1)}</div>
          </div>
          <div data-testid="list-fema-top-hazards" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Top rated hazards</div>
            <ol className="mt-2 space-y-1.5">
              {topHazards.map((hazard) => <li key={hazard.key} className="flex items-center justify-between gap-3 text-[11px]"><span className="font-semibold text-[#344550]">{hazard.label}</span><span className="font-mono text-[9px] text-[#52616b]">{hazard.rating}</span></li>)}
            </ol>
          </div>
          <div className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Social Vulnerability</div>
            <div data-testid="text-fema-social-vulnerability" className="mt-2 font-mono text-[18px] font-bold text-[#122232]">{ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityScore.toFixed(2)}</div>
            <div className="mt-1 text-[11px] font-semibold text-[#52616b]">{ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityRating}</div>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-[#60707d]">FEMA county measurements are public evidence. They do not replace SafeLoc’s separate synthetic transaction economics or CRVA/model assumptions.</p>
        <ClaimCitation claimId="fema-taylor-county" />
      </section>
      </Disclosure>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Disclosure title="Public-site context · Taylor County buildout" testId="disclosure-public-site-context">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded bg-[#f5ddd5] p-2 text-[#ba2f45]"><MapPin className="h-4 w-4" /></div>
            <div><p className="text-[11px] leading-5 text-[#6b7882]">The campus sits outside Abilene. Public reporting describes two buildings and roughly 0.3 GW operational since September 2025, with the eight-building core targeting approximately 1.2 GW.</p><ClaimCitation claimId="stargate-campus" /><div data-testid="text-climate-methodology" className="mt-3 border-t border-[#e5eae8] pt-2 font-mono text-[9px] leading-4 text-[#52616b]">Climate risk methodology: ISO 14091 CRVA framework</div></div>
          </div>
        </Disclosure>
        <Disclosure title="Transmission corridor · power mix" testId="disclosure-transmission-corridor">
          <div className="flex items-center gap-2.5 text-[#122232]">
            <Zap className="h-4 w-4 text-[#a65a00]" /><span className="font-mono text-sm font-bold">On-site gas + ERCOT grid</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#6b7882]">The power mix combines on-site natural-gas generation with ERCOT supply, including locally referenced wind. The delivered renewable percentage is not publicly verified.</p>
          <ClaimCitation claimId="stargate-campus" />
        </Disclosure>
        <div className="rounded-xl bg-[#d4e86b] p-5 text-[#1c2a16]">
          <div className="flex items-center justify-between"><SectionKicker tone="lime">The governing question</SectionKicker><Target className="h-5 w-5 opacity-60" /></div>
          <div className="mt-1 text-[19px] font-semibold leading-tight tracking-[-0.025em]">What does a cancelled expansion reveal about the value of verified grid evidence?</div>
          <button data-testid="button-open-evidence-from-brief" onClick={() => onNavigate("evidence")} className="mt-5 inline-flex items-center gap-2 border-b border-[#1c2a16] pb-1 text-[10px] font-bold uppercase tracking-[0.15em]">Open evidence room <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <section className="mt-5 rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-4" aria-labelledby="brief-risk-strip-title">
        <div className="flex items-center justify-between gap-3">
          <SectionKicker className="mb-0">Risk strip</SectionKicker>
          <span id="brief-risk-strip-title" className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7d898f]">Public operating signals</span>
        </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Water disclosure", "Missing", "Facility water use and water rights not publicly disclosed as of Aug 2026", "#ba2f45"],
          ["Grid expansion", "Cancelled", "Reported interconnection delays exceeded 12 months", "#a65a00"],
          ["Cooling resilience", "Tested", "Winter 2026 storms damaged liquid-cooling equipment", "#255bb7"],
          ["Construction peak", "~6,400", "Housing, childcare, and road strain documented locally", "#7049b7"],
        ].map(([label, value, detail, color]) => (
          <div key={label} className="rounded-lg border border-[#d9e0e4] bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">{label}</span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            </div>
            <div className="mt-2 flex items-baseline gap-2"><span className="font-mono text-base font-bold text-[#122232]">{value}</span><span className="text-[10px] font-medium text-[#52616b]">{detail}</span></div>
          </div>
        ))}
      </div>
      </section>
      <CommunityReadiness onFocusCommunity={onFocusCommunity} />
      <ClaimCitation claimId="stargate-cancellation" />
      <ClaimCitation claimId="stargate-cooling-damage" />
      <Disclosure title="Synthetic transaction assumptions" testId="disclosure-synthetic-transaction">
      <div className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
        <div className="flex items-end justify-between border-b border-[#e5eae8] pb-4">
          <div>
            <SectionKicker tone="warning">Synthetic transaction assumptions</SectionKicker>
            <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#122232]">The financial frame is explicit by design.</h2>
          </div>
          <span className="rounded bg-[#fff0d6] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#a65a00]">SYNTHETIC</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Acquisition price", "$4.8B", "Representative entry enterprise value"],
            ["Debt structure", "60% LTV", "7.5% interest · 10-year term"],
            ["Lease economics", "$185/kW-mo", "Representative modeled revenue rate"],
            ["Cooling CAPEX", "$450M", "Synthetic 1.2 GW analyst estimate"],
          ].map(([label, value, detail]) => (
            <div key={label} className="border-l-2 border-[#d4e86b] pl-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#52616b]">{label}</div>
              <div className="mt-1 font-mono text-[15px] font-bold text-[#122232]">{value}</div>
              <div className="mt-1 text-[10px] text-[#52616b]">{detail}</div>
            </div>
          ))}
        </div>
        <ClaimCitation claimId="synthetic-transaction" />
      </div>
      </Disclosure>
      <BottomNav screen="brief" onNavigate={onNavigate} />
    </div>
  );
}

