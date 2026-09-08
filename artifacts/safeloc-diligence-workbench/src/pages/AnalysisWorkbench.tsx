import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpen, ClipboardCheck, FileCheck2, Network, RefreshCw, Save, Scale } from "lucide-react";
import { CaseBrief } from "@/pages/CaseBrief";
import { EvidenceRoom } from "@/pages/EvidenceRoom";
import { FinancialMateriality } from "@/pages/FinancialMateriality";
import { DecisionReview } from "@/pages/DecisionReview";
import { AdvisorLens } from "@/pages/AdvisorLens";
import {
  classifications,
  classMeta,
  formatIRR,
  SectionKicker,
} from "@/components/Shell";
import { useDiligence } from "@/context/DiligenceContext";
import type { Screen } from "@/components/Shell";

const sectionForScreen: Record<Screen, string> = {
  brief: "analysis-overview",
  evidence: "analysis-evidence",
  materiality: "analysis-financial",
  decision: "analysis-decision",
  advisor: "analysis-advisor",
};

const analysisSections: { id: string; screen: Screen; label: string; short: string; icon: typeof BookOpen }[] = [
  { id: "analysis-overview", screen: "brief", label: "Project Overview", short: "Overview", icon: BookOpen },
  { id: "analysis-evidence", screen: "evidence", label: "Evidence", short: "Evidence", icon: FileCheck2 },
  { id: "analysis-financial", screen: "materiality", label: "Financial Impact", short: "Returns", icon: BarChart3 },
  { id: "analysis-decision", screen: "decision", label: "Decision", short: "Decision", icon: ClipboardCheck },
  { id: "analysis-advisor", screen: "advisor", label: "Advisor Lens", short: "Handoff", icon: Network },
];

function scrollToElement(id: string, focus = false) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
    block: "start",
  });
  if (focus) window.setTimeout(() => target.focus({ preventScroll: true }), 120);
}

function RailMetric({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: "default" | "lime" | "coral" }) {
  return (
    <div className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-3">
      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-[#60707d]">{label}</div>
      <div className={`mt-1 font-mono text-[18px] font-bold tracking-[-0.04em] ${tone === "lime" ? "text-[#607500]" : tone === "coral" ? "text-[#ba2f45]" : "text-[#122232]"}`}>{value}</div>
      {detail && <div className="mt-1 text-[9px] leading-4 text-[#52616b]">{detail}</div>}
    </div>
  );
}

function ClassificationCounts({ evidence }: { evidence: ReturnType<typeof useDiligence>["evidence"] }) {
  return (
    <div data-testid="analysis-classification-counts" className="space-y-1.5">
      {classifications.map((classification) => {
        const count = Object.values(evidence).filter((item) => item.classification === classification).length;
        const meta = classMeta[classification];
        return (
          <div key={classification} className="flex items-center gap-2 text-[9px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
            <span className="min-w-0 flex-1 truncate text-[#52616b]">{meta.short}</span>
            <span data-testid={`analysis-count-${meta.short.toLowerCase()}`} className="font-mono font-bold text-[#122232]">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function AnalysisSummaryRail({ activeSection, onSection, onReset, onDecisionAction }: { activeSection: string; onSection: (screen: Screen) => void; onReset: () => void; onDecisionAction: (action: "save" | "compare") => void }) {
  const { project, metrics, evidence } = useDiligence();
  const evidenceGap = metrics.baseIRR !== null && metrics.projectIRR !== null ? metrics.baseIRR - metrics.projectIRR : null;
  return (
    <aside data-testid="analysis-summary-rail" className="sticky top-5 hidden h-[calc(100dvh-40px)] w-[268px] shrink-0 overflow-y-auto border-r border-[#d9e0e4] bg-[#eef2f1] px-5 py-6 lg:block">
      <SectionKicker>Active analysis</SectionKicker>
      <div className="mb-4">
        <div data-testid="rail-project-name" className="font-mono text-[11px] font-bold text-[#122232]">{project.name}</div>
        <div className="mt-1 text-[10px] leading-4 text-[#52616b]">{project.location} · {project.capacityMW.toLocaleString()} MW</div>
        <div className="mt-2 inline-flex rounded-full bg-[#122232] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#d4e86b]">{project.kind === "custom" ? "Custom / session-only" : "Stargate / ABI-26-001"}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <RailMetric label="Evidence confidence" value={`${metrics.confidenceScore}%`} detail="Weighted source quality and recency" tone={metrics.confidenceScore < 25 ? "coral" : "lime"} />
        <RailMetric label="Baseline → stress IRR" value={`${formatIRR(metrics.baseIRR)} → ${formatIRR(metrics.projectIRR)}`} detail={evidenceGap === null ? "Return delta unavailable" : `${evidenceGap.toFixed(1)} pts evidence-quality gap`} tone="coral" />
        <RailMetric label="Recommendation" value={metrics.recommendationStatus} detail={`${metrics.missingMaterialCount} material gaps`} tone={metrics.recommendationStatus === "READY FOR REVIEW" ? "lime" : "coral"} />
      </div>
      <div className="mt-5 border-t border-[#d9e0e4] pt-4">
        <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Evidence mix</div>
        <ClassificationCounts evidence={evidence} />
      </div>
      <nav aria-label="Analysis sections" className="mt-5 border-t border-[#d9e0e4] pt-4">
        <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">Sections</div>
        <div className="space-y-1">
          {analysisSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            return (
              <button key={section.id} data-testid={`rail-link-${section.screen}`} type="button" aria-current={active ? "location" : undefined} onClick={() => onSection(section.screen)} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-[10px] font-semibold ${active ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b] hover:bg-white hover:text-[#122232]"}`}>
                <Icon aria-hidden="true" className="h-3.5 w-3.5" /> {section.label}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="mt-5 grid gap-2 border-t border-[#d9e0e4] pt-4">
        <button data-testid="rail-reset-default" type="button" onClick={onReset} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cbd8d4] bg-[#f9faf8] px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b] hover:border-[#ba2f45] hover:text-[#ba2f45]"><RefreshCw className="h-3.5 w-3.5" /> Reset</button>
        <button data-testid="rail-save-scenario" type="button" onClick={() => onDecisionAction("save")} disabled={project.kind === "custom"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#122232] px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save scenario</button>
        <button data-testid="rail-compare-scenarios" type="button" onClick={() => onDecisionAction("compare")} disabled={project.kind === "custom"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cbd8d4] bg-white px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[#122232] disabled:cursor-not-allowed disabled:opacity-50"><Scale className="h-3.5 w-3.5" /> Compare</button>
      </div>
    </aside>
  );
}

function MobileAnalysisSummary({ expanded, setExpanded, activeSection, onSection }: { expanded: boolean; setExpanded: (value: boolean) => void; activeSection: string; onSection: (screen: Screen) => void }) {
  const { project, metrics } = useDiligence();
  return (
    <div data-testid="mobile-analysis-summary" className="sticky top-0 z-20 -mx-4 mb-5 border-b border-[#cbd8d4] bg-[#f9faf8]/95 px-4 py-2 shadow-sm backdrop-blur-md lg:hidden">
      <button type="button" aria-expanded={expanded} aria-controls="mobile-analysis-metrics" onClick={() => setExpanded(!expanded)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
        <span className="min-w-0"><span className="block truncate text-[11px] font-bold text-[#122232]">{project.name}</span><span className="font-mono text-[9px] text-[#52616b]">{metrics.recommendationStatus} · {metrics.confidenceScore}% confidence</span></span>
        <span className="shrink-0 font-mono text-[12px] font-bold text-[#ba2f45]">{formatIRR(metrics.projectIRR)}</span>
      </button>
      {expanded && (
        <div id="mobile-analysis-metrics" className="grid gap-2 border-t border-[#e5eae8] py-3 sm:grid-cols-3">
          <RailMetric label="Baseline IRR" value={formatIRR(metrics.baseIRR)} />
          <RailMetric label="Stress IRR" value={formatIRR(metrics.projectIRR)} tone="coral" />
          <RailMetric label="Material gaps" value={String(metrics.missingMaterialCount)} detail={`${metrics.confidenceScore}% confidence`} />
        </div>
      )}
      <nav aria-label="Analysis section links" className="flex gap-1 overflow-x-auto pb-1 pt-1">
        {analysisSections.map((section) => <button key={section.id} data-testid={`mobile-analysis-link-${section.screen}`} type="button" aria-current={activeSection === section.id ? "location" : undefined} onClick={() => onSection(section.screen)} className={`min-h-9 shrink-0 rounded-md px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] ${activeSection === section.id ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b] hover:bg-white"}`}>{section.short}</button>)}
      </nav>
    </div>
  );
}

export function AnalysisWorkbench({ onResolveEvidence, onReset }: { onResolveEvidence: (id: string) => void; onReset: () => void }) {
  const [activeSection, setActiveSection] = useState("analysis-overview");
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [decisionAction, setDecisionAction] = useState<"save" | "compare" | null>(null);
  const goToSection = (screen: Screen) => {
    const id = sectionForScreen[screen];
    scrollToElement(id);
    setActiveSection(id);
  };
  const requestDecisionAction = (action: "save" | "compare") => {
    setDecisionAction(action);
    goToSection("decision");
  };
  useEffect(() => {
    const sections = analysisSections.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-16% 0px -68% 0px", threshold: [0.1, 0.35, 0.7] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  const sectionProps = useMemo(() => ({ onNavigate: goToSection }), []);
  return (
    <div data-testid="analysis-workbench" className="min-w-0">
      <MobileAnalysisSummary expanded={mobileExpanded} setExpanded={setMobileExpanded} activeSection={activeSection} onSection={goToSection} />
      <div className="flex min-w-0 gap-0">
        <AnalysisSummaryRail activeSection={activeSection} onSection={goToSection} onReset={onReset} onDecisionAction={requestDecisionAction} />
        <div className="min-w-0 flex-1 space-y-10 lg:pl-8">
          <section id="analysis-overview" data-testid="analysis-section-overview" tabIndex={-1} className="scroll-mt-28 outline-none" aria-labelledby="analysis-overview-heading">
            <h2 id="analysis-overview-heading" className="sr-only">Project Overview</h2>
            <CaseBrief {...sectionProps} />
          </section>
          <section id="analysis-evidence" data-testid="analysis-section-evidence" tabIndex={-1} className="scroll-mt-28 outline-none" aria-labelledby="analysis-evidence-heading">
            <h2 id="analysis-evidence-heading" className="sr-only">Evidence</h2>
            <EvidenceRoom {...sectionProps} />
          </section>
          <section id="analysis-financial" data-testid="analysis-section-financial" tabIndex={-1} className="scroll-mt-28 outline-none" aria-labelledby="analysis-financial-heading">
            <h2 id="analysis-financial-heading" className="sr-only">Financial Impact</h2>
            <FinancialMateriality {...sectionProps} />
          </section>
          <section id="analysis-decision" data-testid="analysis-section-decision" tabIndex={-1} className="scroll-mt-28 outline-none" aria-labelledby="analysis-decision-heading">
            <h2 id="analysis-decision-heading" className="sr-only">Decision</h2>
            <DecisionReview {...sectionProps} onResolve={onResolveEvidence} requestedAction={decisionAction} onRequestedActionHandled={() => setDecisionAction(null)} />
          </section>
          <section id="analysis-advisor" data-testid="analysis-section-advisor" tabIndex={-1} className="scroll-mt-28 outline-none" aria-labelledby="analysis-advisor-heading">
            <h2 id="analysis-advisor-heading" className="sr-only">Advisor Lens</h2>
            <AdvisorLens {...sectionProps} onResolveEvidence={onResolveEvidence} />
          </section>
        </div>
      </div>
    </div>
  );
}
