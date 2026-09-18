import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Building2, Globe2, Zap, type LucideIcon } from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { WorkbenchDrawerProvider } from "@/components/ContextDrawer";
import { MarketExposure } from "@/components/conference/MarketExposure";
import { ProjectReality } from "@/components/conference/ProjectReality";
import { FinancialTransmission } from "@/components/conference/FinancialTransmission";
import { AdvisorBrief } from "@/components/conference/AdvisorBrief";
import { isConferenceResearchIncomplete } from "@/model/conferenceEvidence";
import { ResearchTelemetryStatus } from "@/components/ResearchHandoffSummary";
import { getResearchStatusPresentation } from "@/services/researchProjectService";
import {
  getCanonicalDossier,
  listCanonicalDossiers,
  type CanonicalDossierSummary,
} from "@/services/canonicalDossierService";

const VIEWS = ["market", "reality", "transmission", "advisor"] as const;
type View = typeof VIEWS[number];
const META: Record<View, { title: string; icon: LucideIcon; anchor: string }> = {
  market: { title: "Market Exposure", icon: Building2, anchor: "analysis-overview" },
  reality: { title: "Project Reality", icon: Globe2, anchor: "analysis-evidence" },
  transmission: { title: "Financial Transmission", icon: Zap, anchor: "analysis-financial" },
  advisor: { title: "Advisor Brief", icon: BookOpen, anchor: "analysis-advisor" },
};
const legacyViews: Record<string, View> = {
  "analysis-agent": "market", "analysis-overview": "market", "analysis-evidence": "reality",
  "analysis-financial": "transmission", "analysis-decision": "advisor", "analysis-advisor": "advisor",
};
type Props = { onResolveEvidence: (id: string) => void; onReset: () => void; focusSectionId?: string };

export function AnalysisWorkbench(props: Props) {
  return <WorkbenchDrawerProvider><ConferenceWorkbench {...props} /></WorkbenchDrawerProvider>;
}

function ConferenceWorkbench({ onResolveEvidence, onReset, focusSectionId }: Props) {
  const diligence = useDiligence();
  const { project, evidence, originatingCompany, metrics, financialScenarios, financialModeling } = diligence;
  const incomplete = isConferenceResearchIncomplete(project, evidence);
  const researchPresentation = getResearchStatusPresentation({
    outcome: project.researchOutcome,
    researchMode: project.researchMode,
    researchStatus: project.researchStatus,
    eligibleProposalCount: Object.keys(project.researchProposals ?? {}).length,
    fallbackIncomplete: incomplete,
  });
  const [view, setView] = useState<View>("market");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [dossiers, setDossiers] = useState<CanonicalDossierSummary[]>([]);
  const [dossierLoadState, setDossierLoadState] = useState<"idle" | "loading" | "error">("idle");
  const contentRef = useRef<HTMLDivElement>(null);
  const index = VIEWS.indexOf(view);
  const navigateView = (next: View) => {
    setView(next);
    window.requestAnimationFrame(() => {
      contentRef.current?.focus({ preventScroll: true });
      document.getElementById("conference-tabs")?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };

  useEffect(() => {
    if (focusSectionId && legacyViews[focusSectionId]) {
      setView(legacyViews[focusSectionId]);
      if (focusSectionId === "analysis-evidence") setEvidenceOpen(true);
    }
  }, [focusSectionId]);

  useEffect(() => {
    let active = true;
    void listCanonicalDossiers()
      .then((records) => {
        if (active) setDossiers(records);
      })
      .catch(() => {
        if (active) setDossierLoadState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const selectDossier = async (slug: string) => {
    if (!slug) return;
    setDossierLoadState("loading");
    try {
      diligence.loadCanonicalDossier(await getCanonicalDossier(slug));
      setDossierLoadState("idle");
      setView("market");
    } catch {
      setDossierLoadState("error");
    }
  };

  const handleNavigate = (screen: string) => {
    if (screen === "evidence") {
      setView("reality");
      setEvidenceOpen(true);
    } else if (screen === "advisor") navigateView("advisor");
    else if (screen === "brief") navigateView("market");
    else if (screen === "materiality") navigateView("transmission");
  };

  return (
    <div data-testid="analysis-workbench" className="min-w-0 pb-4">
      <div data-testid="conference-summary" className="sticky top-[72px] z-10 mb-5 rounded-lg border border-[#d9e0e4] bg-[#f9faf8]/95 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#60707d]">{originatingCompany ?? "No company selected"} · Infrastructure review</div>
            <h1 className="break-words text-lg font-semibold text-[#122232]">{project.name}</h1>
            <p className="break-words text-[11px] text-[#52616b]">{project.location}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {financialModeling.status === "modeled" && (
              <span data-testid="conference-primary-case" className="rounded-md border border-[#aac6f4] bg-[#eef5ff] px-3 py-2 text-[11px] text-[#255bb7]">
                <strong>Synthetic current-evidence primary:</strong>{" "}
                {metrics.projectIRR === null ? "N/M" : `${metrics.projectIRR.toFixed(1)}% IRR`} · {metrics.recommendationStatus}
                <span className="sr-only"> · Scenario {financialScenarios.primaryScenarioId}. Optional EIA sensitivities do not set this recommendation.</span>
              </span>
            )}
            <span data-testid="conference-research-status" className={`rounded-md px-3 py-2 text-[11px] font-semibold ${incomplete ? "bg-[#fff0d6] text-[#805000]" : "bg-[#e5eeea] text-[#365b4c]"}`}>
              {project.canonicalDossier
                ? "Canonical evidence review"
                : project.kind === "custom"
                  ? researchPresentation.label
                  : incomplete ? "Research Incomplete" : "Curated public-source demonstration"}
            </span>
          </div>
        </div>
        {project.kind === "custom" && (
          <div className="mt-3">
            <ResearchTelemetryStatus
              compact
              audit={project.researchAudit}
              coverage={project.researchCoverage}
              researchCache={project.researchCache}
            />
          </div>
        )}
        {dossiers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#d9e0e4] pt-3">
            <label htmlFor="canonical-dossier-select" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#60707d]">
              Canonical dossier
            </label>
            <select
              id="canonical-dossier-select"
              data-testid="canonical-dossier-select"
              value={project.canonicalDossier?.slug ?? ""}
              disabled={dossierLoadState === "loading"}
              onChange={(event) => void selectDossier(event.target.value)}
              className="min-h-9 rounded-md border border-[#cbd8d4] bg-white px-3 text-xs text-[#122232]"
            >
              <option value="">Select a PostgreSQL-backed dossier</option>
              {dossiers.map((dossier) => <option key={dossier.slug} value={dossier.slug}>{dossier.name}</option>)}
            </select>
            {project.canonicalDossier && (
              <span data-testid="canonical-dossier-version" className="text-[10px] text-[#60707d]">
                v{project.canonicalDossier.version} · evidence as of {project.canonicalDossier.asOfDate ?? "unavailable"}
              </span>
            )}
            {dossierLoadState === "error" && <span role="alert" className="text-[10px] text-[#ba2f45]">Canonical dossier store unavailable.</span>}
          </div>
        )}
      </div>

      <div id="conference-tabs" role="tablist" aria-label="Analysis views" className="mb-5 grid scroll-mt-44 grid-cols-2 gap-1 rounded-lg bg-[#e6ebe8] p-1 md:grid-cols-4">
        {VIEWS.map((item, i) => {
          const Icon = META[item].icon;
          return <button key={item} id={`conference-tab-${item}`} type="button" role="tab" data-testid={`tab-${item}`}
            aria-selected={view === item} aria-controls="conference-panel" tabIndex={view === item ? 0 : -1}
            onClick={() => navigateView(item)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? VIEWS[(i + 1) % 4] : event.key === "ArrowLeft" ? VIEWS[(i + 3) % 4] : event.key === "Home" ? "market" : event.key === "End" ? "advisor" : null;
              if (next) { event.preventDefault(); setView(next); document.getElementById(`conference-tab-${next}`)?.focus(); }
            }}
            className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-md px-2 py-3 text-[11px] font-semibold transition-colors sm:text-xs ${view === item ? "bg-[#122232] text-[#d4e86b] shadow-sm" : "text-[#52616b] hover:bg-white/70"}`}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /><span>{META[item].title}</span>
          </button>;
        })}
      </div>

      <div id="conference-panel" ref={contentRef} role="tabpanel" aria-labelledby={`conference-tab-${view}`} tabIndex={-1} className="min-w-0 outline-none">
        <div id={META[view].anchor} className="scroll-mt-44">
          {view === "market" && <MarketExposure />}
          {view === "reality" && <ProjectReality evidenceOpen={evidenceOpen} onEvidenceOpenChange={setEvidenceOpen} onNavigate={handleNavigate} />}
          {view === "transmission" && <FinancialTransmission onNavigate={handleNavigate} onResolveEvidence={onResolveEvidence} />}
          {view === "advisor" && <AdvisorBrief />}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#d9e0e4] pt-5">
        <button type="button" data-testid="conference-back" disabled={index === 0} onClick={() => navigateView(VIEWS[index - 1])}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#cbd8d4] px-3 text-xs font-semibold text-[#52616b] disabled:opacity-40">
          <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />Back
        </button>
        <span className="text-[11px] text-[#60707d]">{index + 1} / 4</span>
        <button type="button" data-testid="conference-next" disabled={index === 3} onClick={() => navigateView(VIEWS[index + 1])}
          className="inline-flex min-h-11 max-w-[65%] items-center justify-center gap-2 rounded-md bg-[#122232] px-4 py-2 text-xs font-semibold text-[#d4e86b] disabled:bg-transparent disabled:text-[#60707d]">
          {index === 3 ? "Brief complete" : META[VIEWS[index + 1]].title}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </button>
      </div>
      <details className="mt-5 text-xs text-[#52616b]">
        <summary className="w-fit cursor-pointer py-2">Methodology &amp; workspace controls</summary>
        <p className="mt-2 max-w-3xl leading-5">Public facts, missing documentation and synthetic assumptions remain separate. A documented company link does not establish portfolio materiality: contract terms, issuer exposure and holding weights require separate analysis.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <a href="#how-it-works" className="underline">Detailed methodology</a>
          <button type="button" onClick={() => { navigateView("reality"); setEvidenceOpen(true); }} className="underline">Review evidence and citations</button>
          <button type="button" onClick={onReset} className="underline">Reset to Default</button>
        </div>
      </details>
    </div>
  );
}