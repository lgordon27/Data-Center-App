import {
  useMemo
} from "react";
import {
  ClassificationBadge,
  EvidenceCompletenessIndicator,
  Disclosure,
  SectionKicker,
  PageIntro,
  BottomNav
} from "@/components/Shell";

import {
  ArrowRight,
  BarChart3,
  CircleAlert,
  ClipboardCheck,
  CloudLightning,
  Landmark,
  Leaf,
  Network,
  ShieldCheck,
} from "lucide-react";
import {
  useDiligence
} from "@/context/DiligenceContext";


import {
  getAdvisorEvidenceSummary,
  getAdvisorQuestionPresentation,
  getGovernanceIRRGap,
  getEvidenceCompletenessTier,
  getMaterialEvidenceGaps,
  prioritizeAdvisorQuestions
} from "@/model/advisorLens";

import type {
  Screen
} from "@/components/Shell";
import { ClaimCitation } from "@/components/ClaimCitation";
export function AdvisorLens({
  onNavigate,
  onResolveEvidence,
}: {
  onNavigate: (screen: Screen) => void;
  onResolveEvidence?: (evidenceId: string) => void;
}) {
  const { evidence, metrics, project, originatingCompany, communityReview, communityUnresolvedCount } = useDiligence();
  const projectName = project.name;
  const customProject = project.kind === "custom";
  const originatingLabel = originatingCompany ?? "No company selected";
  const evidenceSummary = getAdvisorEvidenceSummary(evidence);
  const evidenceCount = evidenceSummary.totalInputCount;
  const riskTier = getEvidenceCompletenessTier(evidenceSummary);
  const materialGaps = useMemo(() => getMaterialEvidenceGaps(evidence), [evidence]);
  const currentIRR = metrics.projectIRR ?? null;
  const baseIRR = metrics.baseIRR ?? null;
  const governanceGap = getGovernanceIRRGap(baseIRR, currentIRR);
  const prioritizedQuestions = useMemo(
    () => prioritizeAdvisorQuestions(evidence).map((question) => customProject
      ? {
          ...question,
          question: question.question.replaceAll("Stargate Abilene", projectName),
          activeDetail: question.activeDetail.replaceAll("Stargate Abilene", projectName),
        }
      : question),
    [evidence, customProject, projectName],
  );
  const exposureChain = [
    { label: "Client’s Values-Aligned Portfolio", detail: "The allocation expresses the client’s values", tone: "neutral" },
    { label: "Sustainable Investment Fund", detail: "The fund screens for values-aligned exposure", tone: "blue" },
    { label: "NVIDIA", detail: "20%+ of the iShares fund", tone: "coral" },
    { label: "GPU Orders", detail: "Forward demand for accelerated computing", tone: "lime" },
    { label: "Hyperscaler CAPEX", detail: "$650B in planned spending", tone: "violet" },
    { label: projectName, detail: customProject ? "Selected project under diligence" : "Physical infrastructure under diligence", tone: "navy" },
  ] as const;
  const exposureTone: Record<(typeof exposureChain)[number]["tone"], { background: string; border: string; color: string }> = {
    neutral: { background: "#f1f5f3", border: "#cbd8d4", color: "#344550" },
    blue: { background: "#e5efff", border: "#aac6f4", color: "#255bb7" },
    coral: { background: "#fde8eb", border: "#efabb8", color: "#ba2f45" },
    lime: { background: "#eef5cd", border: "#c9db70", color: "#506600" },
    violet: { background: "#eee7fa", border: "#cbb7ec", color: "#7049b7" },
    navy: { background: "#122232", border: "#122232", color: "#d4e86b" },
  };
  const infrastructureExposure = [
    { id: "nvidia", company: "NVIDIA", detail: "Downstream of all infrastructure. GPU revenue depends on total build rate. Tier 2 delays slow procurement." },
    { id: "microsoft", company: "Microsoft", detail: "Partially hedged. Project Kilby (Tier 1, proceeding) plus grid-dependent projects (Tier 2, at risk)." },
    { id: "meta", company: "Meta", detail: "More grid-dependent. Major Texas projects require ERCOT interconnection. More exposed to Tier 2 delays." },
    { id: "google", company: "Google", detail: "Significant Texas investment dependent on grid connection. Subject to Abbott's audit." },
  ] as const;
  const conversations = [
    {
      number: "01",
      topic: "Fund alignment",
      question: "Is my fund still aligned with my values?",
      framework: "The question is not about the rating. It is about whether the fund manager is applying evidence standards to the infrastructure assumptions driving the fund’s largest holding. The screening selected NVIDIA. The question is whether anyone verified what happens downstream.",
      action: "Ask your fund manager what site-level evidence standards they apply to AI infrastructure holdings.",
      accent: "blue",
    },
    {
      number: "02",
      topic: "AI risk in the portfolio",
        question: "Should I be worried about AI risk?",
        framework: "The risk is not AI itself. The risk is that the infrastructure build is outrunning the evidence base. Public reporting describes $130B in projects blocked—not because technology failed, but because water, power, and community assumptions were not verified.",
        action: "Review concentration in AI infrastructure-dependent holdings and the evidence quality behind them.",
      accent: "coral",
    },
    {
      number: "03",
      topic: "The client’s next step",
      question: "What should I do?",
        framework: "Not sell. Engage. The sustainability community helped build this. Walking away forfeits the standing to steer it. The advisor’s role is to interpret evidence quality, ask questions no screening tool asks, and decide whether unverified assumptions are acceptable for the client’s values, risk tolerance, and time horizon.",
        action: "Use the governance gap from this tool in your next client review as a conversation starter.",
      accent: "lime",
    },
  ] as const;
  return (
    <div>
      <PageIntro
        eyebrow="05 / advisor handoff"
        title="Turn evidence quality into a client conversation."
        description={`A practical handoff for advisors reviewing how ${projectName}’s physical infrastructure assumptions may connect to public-market exposure. Use the live evidence posture, not a generic sustainability label, to frame the next question.`}
        right={<div className="flex items-center gap-2 rounded-md border border-[#cbb7ec] bg-[#eee7fa] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7049b7]"><Leaf className="h-3.5 w-3.5" /> Advisor handoff</div>}
      />
      <section data-testid="text-advisor-summary" className="mb-5 rounded-xl border border-[#cbd8d4] bg-[#f9faf8] p-5 md:p-6" aria-labelledby="advisor-live-posture-heading">
        <SectionKicker>Live evidence posture</SectionKicker>
         <h2 id="advisor-live-posture-heading" className="sr-only">Live evidence posture</h2>
        <p className="max-w-4xl text-[18px] font-semibold leading-7 tracking-[-0.025em] text-[#122232] md:text-[21px]">
          {riskTier}: {evidenceSummary.materialVerifiedCount} of {evidenceSummary.materialTotal} material inputs verified. {evidenceSummary.verifiedCount} of {evidenceSummary.totalInputCount} total inputs verified.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#e1e8e5] pt-4">
          <EvidenceCompletenessIndicator tier={riskTier} testId="badge-advisor-summary-risk" />
          <span className="text-[10px] text-[#6b7882]">Material sufficiency includes Verified Evidence and Management Assertion; Model Inference, User Assumption, and Missing Evidence remain material gaps.</span>
        </div>
         <div
           data-testid="advisor-material-gaps"
           className="mt-5 border-t border-[#e1e8e5] pt-4"
           aria-labelledby="advisor-material-gaps-heading"
         >
           <div className="flex flex-wrap items-baseline justify-between gap-2">
             <div>
               <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#ba2f45]">Material inputs driving {riskTier}</div>
               <h3 id="advisor-material-gaps-heading" className="mt-1 text-[14px] font-semibold text-[#122232]">What still needs evidence</h3>
             </div>
             <span data-testid="advisor-material-gaps-count" className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b7882]">
               {materialGaps.length} {materialGaps.length === 1 ? "gap" : "gaps"}
             </span>
           </div>
           {materialGaps.length > 0 ? (
             <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Insufficient material evidence">
               {materialGaps.map((gap) => {
                 const item = evidence[gap.id];
                 return (
                   <li
                     key={gap.id}
                     data-testid={`advisor-material-gap-${gap.id}`}
                     className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-[#efabb8] bg-[#fff8f8] p-3"
                   >
                     <div className="min-w-0">
                       <div className="text-[11px] font-semibold leading-4 text-[#243844]">{item.label}</div>
                       <div className="mt-2">
                         <ClassificationBadge value={gap.classification} compact />
                       </div>
                     </div>
                     <button
                       data-testid={`button-open-material-gap-${gap.id}`}
                       type="button"
                       onClick={() => onResolveEvidence ? onResolveEvidence(gap.id) : onNavigate("evidence")}
                       className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#d8a0aa] bg-white px-2.5 py-2 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#8f2437] hover:border-[#ba2f45] hover:text-[#ba2f45]"
                     >
                       Open record
                       <ArrowRight aria-hidden="true" className="h-3 w-3" />
                     </button>
                   </li>
                 );
               })}
             </ul>
           ) : (
             <p data-testid="advisor-material-gaps-empty" className="mt-3 rounded-lg border border-[#9bd8c5] bg-[#f1fbf6] p-3 text-[10px] leading-4 text-[#08644f]">
               All material inputs currently meet the active sufficiency threshold. Optional model classifications remain separate from this posture.
             </p>
           )}
         </div>
      </section>
      <section data-testid="section-client-exposure" className="rounded-xl bg-[#122232] p-5 text-white md:p-7" aria-labelledby="client-exposure-heading">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <SectionKicker tone="lime" className="!text-[#d4e86b]">Section 1 / client exposure</SectionKicker>
            <h2 id="client-exposure-heading" className="max-w-2xl text-[26px] font-semibold leading-tight tracking-[-0.035em] md:text-[31px]">Your Clients’ Values Are Invested Here</h2>
             <p className="mt-3 max-w-4xl text-[11px] leading-5 text-[#afbdc4]">{customProject ? `This custom-project review focuses on ${projectName}. Any connection to ${originatingCompany ?? "NVIDIA"}, GPU demand, or hyperscaler CAPEX is regional market context, not proof of this facility or a portfolio holding.` : originatingCompany ? `Starting from ${originatingCompany}, this review follows the selected project into the evidence record. The company connection is public market context—not proof that ${originatingCompany} owns or controls ${projectName}.` : "A values-aligned fund can connect a client’s capital to NVIDIA, GPU demand, hyperscaler CAPEX, and the Stargate Abilene buildout. The exposure chain turns that connection into diligence questions; it is not proof that every link or statistic is independently verified."}</p>
          </div>
           <div className="flex shrink-0 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-[#c4d0d6]"><Network className="h-3.5 w-3.5 text-[#d4e86b]" /> Exposure chain</div>
        </div>
         <div data-testid="advisor-originating-company" className="mt-5 inline-flex items-center gap-2 rounded-md border border-[#d4e86b]/35 bg-[#d4e86b]/10 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b]">Originating company: {originatingLabel}</div>
        {!customProject && <div className="flex flex-wrap gap-2"><ClaimCitation claimId="fund-usxf" dark /><ClaimCitation claimId="stargate-initiative" dark /></div>}
        {!customProject && <div className="flex flex-wrap gap-2"><ClaimCitation claimId="fund-usxf" dark /><ClaimCitation claimId="stargate-initiative" dark /></div>}
        <div className="mt-7 flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-1.5" aria-label="Client exposure chain">
          {exposureChain.map((node, index) => {
            const tone = exposureTone[node.tone];
            return (
              <div key={node.label} className="flex min-w-0 flex-1 items-center gap-2 md:block">
                <div data-testid={`exposure-node-${index + 1}`} className="min-h-[78px] flex-1 rounded-lg border p-3" style={{ backgroundColor: tone.background, borderColor: tone.border, color: tone.color }}>
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] opacity-70">0{index + 1}</div>
                  <div className="mt-1 text-[12px] font-bold leading-4">{node.label}</div>
                  <div className="mt-1 text-[9px] leading-3.5 opacity-80">{node.detail}</div>
                </div>
                {index < exposureChain.length - 1 && <ArrowRight aria-hidden="true" className="mx-auto h-4 w-4 shrink-0 rotate-90 text-[#7f919b] md:my-8 md:rotate-0" />}
              </div>
            );
          })}
        </div>
        <div data-testid="advisor-tier-exposure" className="mt-6 border-t border-white/15 pt-5">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#d4e86b]">Public context / portfolio exposure</div>
              <h3 className="mt-1 text-[19px] font-semibold tracking-[-0.025em] text-white">Your Clients Are on Both Sides</h3>
            </div>
          </div>
          <p data-testid="advisor-exposure-qualifier" className="mt-2 max-w-md text-[10px] leading-4 text-[#9dafb8]">Exposure is not uniform. These are public market-context examples, not facility-level {customProject ? `${projectName} evidence` : "Stargate evidence"} and not modeled financial inputs.</p>
          <div data-testid="advisor-exposure-comparisons" className="mt-4 grid gap-2 sm:grid-cols-2">
            {infrastructureExposure.map((entry) => (
              <div key={entry.id} data-testid={`advisor-tier-${entry.id}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#d4e86b]">{entry.company}</div>
                <p className="mt-1 text-[10px] leading-4 text-[#c4d0d6]">{entry.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div data-testid="advisor-risk-stat-paused" className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-[24px] font-bold tracking-[-0.05em] text-[#f5ddd5]">$130B</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4d0d6]">Projects paused</div>
            <p className="mt-2 text-[10px] leading-4 text-[#9dafb8]">Reported aggregate context: $130B in AI projects paused in Q1 2026.</p>
            <ClaimCitation claimId="stargate-cancellation" dark />
            <ClaimCitation claimId="stargate-cancellation" dark />
          </div>
          <div data-testid="advisor-risk-stat-revenue" className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-[24px] font-bold tracking-[-0.05em] text-[#d4e86b]">$8B</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4d0d6]">Estimated revenue loss</div>
            <p className="mt-2 text-[10px] leading-4 text-[#9dafb8]">Estimated BloombergNEF context for data-center revenue losses by Q1 2027.</p>
            <ClaimCitation claimId="stargate-cancellation" dark />
            <ClaimCitation claimId="stargate-cancellation" dark />
          </div>
          <div data-testid="advisor-risk-stat-earnings" className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="font-mono text-[24px] font-bold tracking-[-0.05em] text-[#cbb7ec]">22.8% → 6.4%</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4d0d6]">S&amp;P 500 earnings context</div>
            <p className="mt-2 text-[10px] leading-4 text-[#9dafb8]">Reported market comparison: NVIDIA is the single largest contributor to S&amp;P 500 earnings growth; without NVIDIA’s AI leadership, the other 493 S&amp;P companies trail. This is market context, not a facility fact or modeled return.</p>
            <ClaimCitation claimId="fund-usxf" dark />
            <ClaimCitation claimId="fund-usxf" dark />
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-[#b9d43a]/35 bg-[#d4e86b] p-4 text-[#1c2a16] md:p-5">
          <div className="flex items-start gap-3">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#607500]" />
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">The epistemic gap</div>
              <p data-testid="text-epistemic-gap" className="mt-2 text-[12px] font-semibold leading-5">The sustainability rating tells your client what NVIDIA reported: MSCI’s AAA sustainability rating is based on corporate disclosures. This tool tests whether the physical infrastructure that rating depends on has been independently verified. Those are two different questions.</p>
              <ClaimCitation claimId="fund-kld400" />
              <ClaimCitation claimId="fund-kld400" />
            </div>
          </div>
        </div>
      </section>
      <section data-testid="section-client-fund-indicators" className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]" aria-labelledby="fund-indicators-heading">
        <div className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <SectionKicker>Live fund indicators</SectionKicker>
              <h2 id="fund-indicators-heading" className="text-[20px] font-semibold tracking-[-0.03em] text-[#122232]">Carry the current posture into stewardship.</h2>
            </div>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-[#60707d] sm:block">Updates with evidence</span>
          </div>
          <p className="mt-3 max-w-2xl text-[11px] leading-5 text-[#63717a]">These indicators show the live unverified-exposure tier for funds and benchmarks that may carry AI infrastructure dependence. They are not a claim about fund quality by themselves.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div data-testid="card-fund-ishares" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#e9e0f7] text-[#482873]"><Landmark aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="text-[11px] font-bold text-[#122232]">iShares ESG Advanced MSCI USA ETF</div><EvidenceCompletenessIndicator tier={riskTier} testId="badge-fund-ishares-risk" /></div><div className="mt-1 text-[10px] text-[#6b7882]">Public equity exposure · sustainability-screened broad market</div></div></div></div>
            <div data-testid="card-fund-msci" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#d4e86b] text-[#314207]"><BarChart3 aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div className="text-[11px] font-bold text-[#122232]">MSCI KLD 400 Social Index</div><EvidenceCompletenessIndicator tier={riskTier} testId="badge-fund-msci-risk" /></div><div className="mt-1 text-[10px] text-[#6b7882]">Socially screened benchmark · stewardship reference</div></div></div></div>
            <ClaimCitation claimId="fund-usxf" />
            <ClaimCitation claimId="fund-kld400" />
            <ClaimCitation claimId="fund-usxf" />
            <ClaimCitation claimId="fund-kld400" />
          </div>
        </div>
        <div className="rounded-xl border border-[#d9e0e4] bg-[#f1f5f3] p-5 md:p-6">
          <SectionKicker>What the chain means</SectionKicker>
          <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.03em] text-[#122232]">Ask where the evidence changes quality.</h2>
          <p className="mt-3 text-[11px] leading-5 text-[#52616b]">The relevant sustainability question is not whether a fund owns this exact campus. It is whether portfolio holdings carry unpriced drought, extreme-heat, downtime, and adaptation exposure while those risks remain invisible in the diligence chain.</p>
          <div className="mt-5 flex items-start gap-3 border-t border-[#d9e0e4] pt-4"><CloudLightning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#255bb7]" /><p className="text-[10px] font-medium leading-4 text-[#344550]">A rating based on corporate disclosures and a site-level infrastructure review can both be valid—and still answer different questions.</p></div>
        </div>
      </section>
      <section data-testid="section-client-conversations" className="mt-5" aria-labelledby="client-conversations-heading">
        <div className="mb-5 flex flex-col justify-between gap-3 border-b border-[#d9e0e4] pb-5 md:flex-row md:items-end">
          <div>
            <SectionKicker>Section 2 / client conversations</SectionKicker>
            <h2 id="client-conversations-heading" className="text-[26px] font-semibold tracking-[-0.035em] text-[#122232] md:text-[31px]">How to Talk to Your Client</h2>
          </div>
          <p className="max-w-md text-[11px] leading-5 text-[#63717a]">Three pre-framed conversations turn the diligence record into a useful review without reducing uncertainty to a buy-or-sell signal.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {conversations.map((conversation) => {
            const accent = conversation.accent === "blue" ? { border: "#aac6f4", label: "#255bb7", background: "#f7faff" } : conversation.accent === "coral" ? { border: "#efabb8", label: "#ba2f45", background: "#fff9f9" } : { border: "#c9db70", label: "#607500", background: "#fbfdf1" };
            return (
              <article key={conversation.number} data-testid={`client-conversation-${conversation.number}`} className="flex flex-col rounded-xl border bg-white p-5" style={{ borderColor: accent.border }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] font-bold tracking-[0.14em]" style={{ color: accent.label }}>CONVERSATION {conversation.number}</span>
                  <span className="rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em]" style={{ backgroundColor: accent.background, color: accent.label }}>{conversation.topic}</span>
                </div>
                <div className="mt-5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Client asks</div>
                <h3 className="mt-2 text-[18px] font-semibold leading-6 tracking-[-0.025em] text-[#122232]">“{conversation.question}”</h3>
                <div className="mt-5 border-t border-[#e5eae8] pt-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#60707d]">Advisor response framework</div>
                  <p className="mt-2 text-[11px] leading-5 text-[#52616b]">{conversation.framework}</p>
                </div>
                <div className="mt-auto pt-5">
                  <div className="rounded-lg bg-[#122232] p-4 text-white">
                    <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#d4e86b]"><ArrowRight aria-hidden="true" className="h-3 w-3" /> Specific action</div>
                    <p className="mt-2 text-[11px] font-semibold leading-5 text-[#f6f7f2]">{conversation.action}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section data-testid="section-practice-value" className="mt-5 rounded-xl bg-[#d4e86b] p-5 text-[#1c2a16] md:p-7" aria-labelledby="practice-value-heading">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <SectionKicker tone="lime" className="!text-[#607500]">Section 3 / advisor value</SectionKicker>
            <h2 id="practice-value-heading" className="max-w-2xl text-[26px] font-semibold leading-tight tracking-[-0.035em] md:text-[31px]">Why This Is Your Role</h2>
          </div>
          <div className="rounded-md border border-[#607500]/25 bg-white/35 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#607500]">Trust is human judgment</div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["79%", "trust advisors", "Gallup / Edward Jones"],
            ["3%", "trust AI", "Gallup / Edward Jones"],
            ["4x", "more likely to use a professional advisor", "Financially fulfilled adults"],
            ["0", "AI confidence has zero statistical association with financial fulfillment", "Gallup / Edward Jones"],
          ].map(([value, label, source]) => (
            <div key={label} data-testid={`practice-stat-${value}`} className="rounded-lg border border-[#607500]/20 bg-white/45 p-4">
              <div className="font-mono text-[26px] font-bold tracking-[-0.06em]">{value}</div>
              <div className="mt-1 text-[11px] font-bold leading-4">{label}</div>
              <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] opacity-65">{source}</div>
            </div>
          ))}
        </div>
       <div data-testid="text-governed-ai-connection" className="mt-5 rounded-lg border border-[#607500]/25 bg-white/45 p-4 md:p-5">
         <p className="text-[12px] font-semibold leading-5">You just experienced governed AI in this tool. An AI proposed evidence classifications. You decided which to accept. That interaction is the future of financial advising: AI accelerates the analysis, the advisor makes the judgment call. The Gallup data confirms what you already felt: 79% of Americans trust advisors. 3% trust AI. The advisor who can work with AI and govern its output has the most defensible position in the industry.</p>
         <ClaimCitation claimId="advisor-trust-statistics" />
         <ClaimCitation claimId="advisor-trust-statistics" />
       </div>
        <div className="mt-5 grid gap-3 border-t border-[#607500]/25 pt-5 md:grid-cols-2">
          <div className="rounded-lg border border-[#607500]/25 bg-white/35 p-4"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">Traditional screening</div><p className="mt-2 text-[13px] font-semibold leading-5">Reads corporate disclosures, assigns a rating, and treats the reported record as the decision surface.</p></div>
          <div className="rounded-lg border-2 border-[#607500]/45 bg-white/55 p-4"><div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#607500]">Evidence-governed advising</div><p className="mt-2 text-[13px] font-semibold leading-5">Tests infrastructure assumptions, separates verified evidence from inference, and decides whether remaining exposure fits this client’s values, risk tolerance, and time horizon.</p></div>
        </div>
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-[#d9e0e4] bg-white p-5 md:p-6">
          <SectionKicker>Fund-manager questions</SectionKicker>
          <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Take these into the next meeting.</h2>
          <div className="mt-4 divide-y divide-[#e5eae8]">
            {prioritizedQuestions.map((question, index) => {
              const classification = question.classification;
              const { isActiveGap, isWaterGap, isEnergizationGap, isClimateGap, showDetail } = getAdvisorQuestionPresentation(question.id, classification);
              return (
                <div
                  key={question.id}
                  data-testid={`advisor-question-${question.id}`}
                  className={`rounded-lg px-3 py-4 transition-colors ${isWaterGap ? "my-2 border-2 border-[#efabb8] bg-[#fff3f4]" : isEnergizationGap || isClimateGap ? "my-2 border border-[#f1cb8b] bg-[#fff8e9]" : isActiveGap ? "bg-[#fffaf0]" : ""}`}
                >
                  <div className="flex gap-4">
                  <span className={`font-mono text-[10px] font-bold ${isActiveGap ? "text-[#ba2f45]" : "text-[#b9d43a]"} [text-shadow:0_0_0_#122232]`}>{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className={`text-[12px] font-medium leading-5 ${isActiveGap ? "font-semibold text-[#243844]" : "text-[#344550]"}`}>{question.question}</p>
                      {classification && <ClassificationBadge value={classification} compact />}
                    </div>
                    {showDetail && <p data-testid={`advisor-question-detail-${question.id}`} className={`mt-3 border-t pt-3 text-[10px] font-medium leading-4 ${question.id === "water-rights" ? "border-[#efabb8] text-[#96525d]" : "border-[#ecd39d] text-[#806d51]"}`}>{question.activeDetail}</p>}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-[#d9e0e4] bg-[#fff8e9] p-5 md:p-6">
          <SectionKicker tone="warning">Professional judgment</SectionKicker>
          <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.025em] text-[#122232]">Governance is the differentiator.</h2>
          <p className="mt-3 text-[11px] leading-5 text-[#6f5f49]">An advisor should be able to defend not only the conclusion, but the evidence standard applied to reach it. Document what is verified, what is inferred, and what remains a deliberate risk appetite choice.</p>
          <div className="mt-5 border-t border-[#ecd39d] pt-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#a65a00]" /><p className="text-[11px] font-semibold leading-5 text-[#6f460e]">Silent AI reclassification is not diligence.</p></div><p className="mt-2 pl-7 text-[10px] leading-4 text-[#806d51]">Any automated change to evidence provenance must be reviewable, attributable, and explicitly approved. Model assistance cannot silently convert uncertainty into fact.</p></div>
        </section>
      </div>
      <Disclosure title={`Community Questions · ${communityUnresolvedCount} unresolved`} testId="disclosure-community-questions">
        <div data-testid="community-questions" className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-[11px] leading-5 text-[#52616b]">Use these questions to test the project’s stewardship commitments with the client and project team. They are project-level diligence prompts, not a fund-level risk rating.</p>
            <ul className="mt-3 space-y-2 text-[10px] leading-4 text-[#344550]">
              <li>Which community terms are executed, binding, and supported by a remedy?</li>
              <li>Who funds grid, water, road, and end-of-life obligations if the project changes scope?</li>
              <li>What reporting, inspection, and resident complaint channels remain available?</li>
            </ul>
          </div>
          <div className="rounded-lg border border-[#d9e0e4] bg-[#f7faf8] p-3">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#52616b]">Stewardship context</div>
            <div data-testid="advisor-community-relationship" className="mt-2 font-mono text-[12px] font-bold text-[#255bb7]">{communityReview.relationship.relationship} · {communityReview.relationship.confidence}% confidence</div>
            <p className="mt-2 text-[10px] leading-4 text-[#52616b]">{communityReview.relationship.relationship === "Not found" ? "Public documentation was not located in the reviewed snapshot; this is an unresolved gap, not a claim that an agreement does not exist." : "The benchmark relationship remains separate from attributable Stargate evidence until a reviewer confirms project-specific documentation."}</p>
          </div>
        </div>
      </Disclosure>
      <section data-testid="section-governance-gap" className="mt-5 rounded-xl border border-[#cbb7ec] bg-[#f8f4fd] p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <SectionKicker>Governance gap</SectionKicker>
            <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.025em] text-[#122232]">What evidence classification prevents the model from hiding.</h2>
            <p className="mt-3 text-[11px] leading-5 text-[#5e5870]">Without evidence classification, an AI screening tool would treat all {evidenceCount} inputs as equivalent. Here is what that hides:</p>
          </div>
          <div className="shrink-0 rounded-lg border-2 border-[#cbb7ec] bg-white px-5 py-4 md:max-w-[360px]">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#7049b7]">Governance gap</div>
            <div data-testid="text-governance-irr-gap" className="mt-1 font-mono text-[28px] font-bold leading-tight tracking-[-0.05em] text-[#482873]">
              {governanceGap === null ? "N/M" : `${governanceGap.toFixed(1)} pts`}
            </div>
            <div data-testid="advisor-governance-gap-description" className="mt-1 text-[10px] leading-4 text-[#5e5870]">The difference between the underwriting baseline and the conservative stress case.</div>
            {governanceGap === null && <div className="mt-2 text-[10px] leading-4 text-[#706681]">The return gap is unavailable because one or both IRR calculations are non-numeric.</div>}
          </div>
        </div>
      </section>
      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-[#cbd8d4] bg-[#eef2f1] p-5 md:flex-row md:items-center md:justify-between md:p-6"><div><SectionKicker>Close the loop</SectionKicker><h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#122232]">Return to the decision with the full context.</h2><p className="mt-1 text-[11px] text-[#65737d]">The evidence record and derived return remain live as you move through the workbench.</p></div><button data-testid="button-return-decision" onClick={() => onNavigate("decision")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#122232] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#d4e86b] hover:-translate-y-0.5"><ClipboardCheck className="h-3.5 w-3.5" /> Return to decision review</button></div>
      <BottomNav screen="advisor" onNavigate={onNavigate} />
    </div>
  );
}

