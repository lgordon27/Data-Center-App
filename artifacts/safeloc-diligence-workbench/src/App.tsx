import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Info, Loader2, Network, RotateCcw, Target } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DiligenceProvider, useDiligence } from "@/context/DiligenceContext";
import { DiligenceLiveRegions, formatIRR, formatPercentagePoints, Header } from "@/components/Shell";
import { AnalysisWorkbench } from "@/pages/AnalysisWorkbench";
import { ValueChain } from "@/pages/ValueChain";
import { Home } from "@/pages/Home";
import { HowItWorks } from "@/pages/HowItWorks";
import { Footer } from "@/components/Footer";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";

const DirectoryRoute = lazy(() => import("@/pages/DirectoryRoute"));

export type Screen = "brief" | "evidence" | "materiality" | "decision" | "advisor";
export type AppRoute = "analysis" | "home" | "directory" | "value-chain" | "how-it-works";

const legacySectionRoutes: Record<string, string> = {
  brief: "analysis-overview",
  evidence: "analysis-evidence",
  materiality: "analysis-financial",
  decision: "analysis-decision",
  advisor: "analysis-advisor",
  "analysis-overview": "analysis-overview",
  "analysis-evidence": "analysis-evidence",
  "analysis-financial": "analysis-financial",
  "analysis-decision": "analysis-decision",
  "analysis-advisor": "analysis-advisor",
};

function routeFromHash(hash: string): AppRoute | null {
  const route = hash.replace(/^#/, "");
  if (!route) return "home";
  if (route === "analysis" || legacySectionRoutes[route]) return "analysis";
  return (["home", "directory", "value-chain", "how-it-works"] as readonly string[]).includes(route) ? route as AppRoute : null;
}

function DirectoryLoading() {
  return (
    <section data-testid="directory-route-loading" role="status" aria-live="polite" className="flex min-h-[52vh] items-center justify-center rounded-xl border border-[#cbd8d4] bg-white px-6 text-center">
      <div>
        <Loader2 aria-hidden="true" className="mx-auto h-6 w-6 animate-spin text-[#255bb7]" />
        <h1 className="mt-4 text-xl font-semibold text-[#122232]">Loading facility directory</h1>
        <p className="mt-2 text-[12px] text-[#63717a]">The optional Compute Atlas workspace is loading separately.</p>
      </div>
    </section>
  );
}

function DirectoryFailure({ resetError }: ErrorFallbackProps) {
  return (
    <section data-testid="directory-route-error" role="alert" className="flex min-h-[52vh] items-center justify-center rounded-xl border border-[#efabb8] bg-white px-6 text-center">
      <div className="max-w-lg">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#ba2f45]">Directory isolated</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#122232]">The facility directory could not load.</h1>
        <p className="mt-3 text-[12px] leading-5 text-[#63717a]">The diligence workbench is still available. Retry the directory, or return Home without waiting for Compute Atlas.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button data-testid="button-retry-directory-route" type="button" onClick={() => { resetError(); window.location.reload(); }} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#122232] px-4 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b]">
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Retry directory
          </button>
          <a data-testid="link-directory-error-home" href="#home" className="inline-flex min-h-11 items-center rounded-md border border-[#cbd8d4] px-4 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#52616b]">Return Home</a>
        </div>
      </div>
    </section>
  );
}

function AppShell() {
  const [route, setRoute] = useState<AppRoute>(() => typeof window === "undefined" ? "home" : routeFromHash(window.location.hash) ?? "home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [evidenceFocusId, setEvidenceFocusId] = useState<string | null>(null);
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const diligence = useDiligence();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const menuWasOpen = useRef(false);

  useEffect(() => {
    if (!diligence.metrics.lastChange) return undefined;
    const timer = window.setTimeout(diligence.clearLastChange, 8000);
    return () => window.clearTimeout(timer);
  }, [diligence.metrics.lastChange, diligence.clearLastChange]);

  useEffect(() => {
    let isInitialSync = true;
    const syncFromHash = () => {
      const rawHash = window.location.hash.replace(/^#/, "");
      const next = routeFromHash(window.location.hash);
      if (!next) {
        window.history.replaceState(null, "", "#home");
        setRoute("home");
      } else {
        if (legacySectionRoutes[rawHash]) {
          window.history.replaceState(null, "", "#analysis");
          setPendingSection(legacySectionRoutes[rawHash]);
        }
        setRoute(next);
      }
      if (!isInitialSync) setMobileOpen(false);
    };
    syncFromHash();
    isInitialSync = false;
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    document.title = route === "home"
      ? "SafeLoc · Home"
      : route === "directory"
        ? "SafeLoc · Facility Directory"
        : route === "value-chain"
          ? "SafeLoc · The AI Chain"
          : route === "how-it-works"
            ? "SafeLoc · How It Works"
            : route === "analysis"
              ? "SafeLoc · Analysis"
              : "SafeLoc Diligence Workbench";
    if (route === "analysis" && pendingSection) {
      const timer = window.setTimeout(() => {
        const target = document.getElementById(pendingSection);
        target?.scrollIntoView({ behavior: "auto", block: "start" });
        target?.focus({ preventScroll: true });
        setPendingSection(null);
      }, 50);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
    return undefined;
  }, [route, pendingSection]);

  useEffect(() => {
    if (route !== "analysis" || !evidenceFocusId) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(
        evidenceFocusId.startsWith("community-")
          ? "evidence-item-community-agreements"
          : `evidence-item-${evidenceFocusId}`,
      );
      target?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth", block: "center" });
      const focusTarget = target?.matches("details") ? target.querySelector("summary") ?? target : target;
      if (target?.matches("details")) (target as HTMLDetailsElement).open = true;
      focusTarget?.focus({ preventScroll: true });
      setEvidenceFocusId(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [route, evidenceFocusId]);

  const go = (next: AppRoute) => {
    if (next !== route) diligence.clearLastChange();
    setMobileOpen(false);
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    } else {
      setRoute(next);
    }
  };

  const confirmReset = () => {
    diligence.resetToDefault();
    setResetOpen(false);
    go("analysis");
  };

  const resolveEvidence = (id: string) => {
    // Tell mounted evidence views to reveal every record before the focus
    // timer runs, so an active filter can never hide the resolve target.
    window.dispatchEvent(new CustomEvent("safeloc:evidence-focus-request", { detail: id }));
    setEvidenceFocusId(id);
    go("analysis");
  };

  useEffect(() => {
    if (!mobileOpen) {
      if (menuWasOpen.current) {
        menuWasOpen.current = false;
        menuButtonRef.current?.focus();
      }
      return undefined;
    }

    menuWasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const menu = menuRef.current;
    const getFocusableElements = () => menu
      ? Array.from(menu.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      : [];
    const focusTimer = window.setTimeout(() => getFocusableElements()[0]?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (menu && !menu.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu?.contains(target) && !menuButtonRef.current?.contains(target)) {
        event.preventDefault();
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-[100dvh] bg-[#f4f6f4] text-[#122232]">
      <Header
        onMenu={() => setMobileOpen((value) => !value)}
        onReset={() => setResetOpen(true)}
        onHome={() => go("home")}
        onHowItWorks={() => go("how-it-works")}
        onValueChain={() => go("value-chain")}
        onWorkbench={() => go("analysis")}
        route={route}
        sessionRestored={diligence.sessionRestored}
        mobileOpen={mobileOpen}
        menuButtonRef={menuButtonRef}
      />
      {mobileOpen && (
        <>
          <div data-testid="mobile-menu-backdrop" aria-hidden="true" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-[#122232]/60 md:hidden" />
          <nav ref={menuRef} id="mobile-navigation" data-testid="mobile-navigation" aria-label="Mobile navigation" className="fixed inset-x-4 top-[76px] z-30 max-h-[calc(100dvh-92px)] overflow-y-auto rounded-lg border border-[#cbd8d4] bg-[#f9faf8] p-2 shadow-lg md:hidden">
            <button data-testid="mobile-navigate-home" type="button" aria-current={route === "home" ? "page" : undefined} onClick={() => go("home")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "home" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Target aria-hidden="true" className="h-4 w-4" /> Home
            </button>
            <button data-testid="mobile-navigate-directory" type="button" aria-current={route === "directory" ? "page" : undefined} onClick={() => go("directory")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "directory" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Target aria-hidden="true" className="h-4 w-4" /> Browse Facilities
            </button>
            <div className="my-1 border-t border-[#d9e0e4]" />
            <button data-testid="mobile-navigate-analysis" type="button" aria-current={route === "analysis" ? "page" : undefined} onClick={() => go("analysis")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "analysis" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Target aria-hidden="true" className="h-4 w-4" /> Analysis Workbench
            </button>
            <div className="my-1 border-t border-[#d9e0e4]" />
            <button data-testid="mobile-navigate-value-chain" type="button" aria-current={route === "value-chain" ? "page" : undefined} onClick={() => go("value-chain")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "value-chain" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Network aria-hidden="true" className="h-4 w-4" /> The AI Chain
            </button>
            <button data-testid="mobile-navigate-how-it-works" type="button" aria-current={route === "how-it-works" ? "page" : undefined} onClick={() => go("how-it-works")} className={`flex min-h-11 w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "how-it-works" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Info aria-hidden="true" className="h-4 w-4" /> How It Works
            </button>
            {route === "value-chain" && <button data-testid="mobile-return-to-workbench" type="button" onClick={() => go("analysis")} className="flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold text-[#ba2f45]">Return to Analysis</button>}
          </nav>
        </>
      )}
      {diligence.metrics.lastChange && (
        <div data-testid="toast-reclassification" role="status" aria-live="polite" className="fixed bottom-5 right-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-[#cbd8d4] bg-[#122232] p-4 text-white shadow-xl md:bottom-7 md:right-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#b9d43a]">Evidence reclassified</div>
              <div className="mt-2 text-[11px] leading-5 text-[#dce4e7]">Conservative stress case updated from <span className="font-mono text-white">{formatIRR(diligence.metrics.lastChange.from)}</span> to <span className="font-mono text-white">{formatIRR(diligence.metrics.lastChange.to)}</span>.</div>
              <div className={`mt-1 font-mono text-[12px] font-bold ${diligence.metrics.lastChange.delta < 0 ? "text-[#f5ddd5]" : "text-[#d4e86b]"}`}>{formatPercentagePoints(diligence.metrics.lastChange.delta, { signed: true })} IRR</div>
            </div>
            <button data-testid="button-dismiss-reclassification" aria-label="Dismiss reclassification notification" onClick={diligence.clearLastChange} className="rounded p-1 text-[#a4b4bd] hover:bg-white/10 hover:text-white"><span aria-hidden="true">×</span></button>
          </div>
        </div>
      )}
      {route === "how-it-works" ? (
        <HowItWorks onReturn={() => go("analysis")} onOpenScreen={(screen) => {
          const section = legacySectionRoutes[screen];
          setPendingSection(section);
          go("analysis");
        }} />
      ) : (
        <>
          {route === "home" ? <Home onNavigate={go} /> : (
            <div className="mx-auto flex max-w-[1480px]">
              <main className="min-w-0 flex-1 overflow-x-clip px-4 py-7 md:px-8 md:py-10 xl:px-12">
                <div className={`mx-auto ${route === "value-chain" || route === "directory" ? "max-w-[1320px]" : "max-w-[1160px]"}`}>
                  {route === "value-chain" && <ValueChain onWorkbench={() => go("analysis")} />}
                   {route === "directory" && (
                     <ErrorBoundary resetKey={route} FallbackComponent={DirectoryFailure}>
                       <Suspense fallback={<DirectoryLoading />}>
                       <DirectoryRoute onCurated={() => { diligence.resetToDefault(); go("analysis"); }} onResearchSuccess={(research) => { diligence.loadCustomProject(research); go("analysis"); }} />
                       </Suspense>
                     </ErrorBoundary>
                   )}
                  {route === "analysis" && <AnalysisWorkbench onResolveEvidence={resolveEvidence} onReset={() => setResetOpen(true)} />}
                </div>
              </main>
            </div>
          )}
          {route !== "home" && <><DiligenceLiveRegions metrics={diligence.metrics} /><Footer /></>}
        </>
      )}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="border-[#cbd8d4] bg-[#f9faf8]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#122232]">Reset to Default?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#65737d]">This restores all 16 evidence classifications to the canonical starting state and clears the current session. Named scenarios are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#cbd8d4] text-[#52616b]">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-reset-default" onClick={confirmReset} className="border-[#ba2f45] bg-[#ba2f45] text-white hover:bg-[#9c2439]">Reset to Default</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function App() {
  return <DiligenceProvider><AppShell /></DiligenceProvider>;
}