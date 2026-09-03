import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Info, Network, Target } from "lucide-react";
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
import { Navigation } from "@/components/Navigation";
import { DiligenceLiveRegions, formatIRR, Header, screens, ShellAside } from "@/components/Shell";
import { CaseBrief } from "@/pages/CaseBrief";
import { EvidenceRoom } from "@/pages/EvidenceRoom";
import { FinancialMateriality } from "@/pages/FinancialMateriality";
import { DecisionReview } from "@/pages/DecisionReview";
import { AdvisorLens } from "@/pages/AdvisorLens";
import { ValueChain } from "@/pages/ValueChain";
import { DirectoryPage, Home } from "@/pages/Home";
import { HowItWorks } from "@/pages/HowItWorks";
import { Footer } from "@/components/Footer";

export type Screen = "brief" | "evidence" | "materiality" | "decision" | "advisor";
export type AppRoute = Screen | "home" | "directory" | "value-chain" | "how-it-works";

function routeFromHash(hash: string): AppRoute | null {
  const route = hash.replace(/^#/, "");
  if (!route) return "home";
  return (["home", "directory", "value-chain", "how-it-works", ...screens.map((screen) => screen.id)] as readonly string[])
    .includes(route) ? route as AppRoute : null;
}

function AppShell() {
  const [route, setRoute] = useState<AppRoute>(() => typeof window === "undefined" ? "home" : routeFromHash(window.location.hash) ?? "home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [evidenceFocusId, setEvidenceFocusId] = useState<string | null>(null);
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
      const next = routeFromHash(window.location.hash);
      if (!next) {
        window.history.replaceState(null, "", "#home");
        setRoute("home");
      } else {
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
    const activeScreen = screens.find((item) => item.id === route);
    document.title = route === "home"
      ? "SafeLoc · Home"
      : route === "directory"
        ? "SafeLoc · Facility Directory"
        : route === "value-chain"
          ? "SafeLoc · The AI Chain"
          : route === "how-it-works"
            ? "SafeLoc · How It Works"
            : activeScreen
              ? `SafeLoc · ${activeScreen.label}`
              : "SafeLoc Diligence Workbench";
    window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth" });
  }, [route]);

  useEffect(() => {
    if (route !== "evidence" || !evidenceFocusId) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`evidence-item-${evidenceFocusId}`);
      target?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth", block: "center" });
      target?.focus({ preventScroll: true });
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
    go("brief");
  };

  const resolveEvidence = (id: string) => {
    setEvidenceFocusId(id);
    go("evidence");
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
        onWorkbench={() => go("brief")}
        route={route}
        sessionRestored={diligence.sessionRestored}
        mobileOpen={mobileOpen}
        menuButtonRef={menuButtonRef}
      />
      {route !== "home" && route !== "directory" && route !== "value-chain" && route !== "how-it-works" && (
        <Navigation current={route} onNavigate={go} />
      )}
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
            {screens.map((item, index) => (
              <button key={item.id} data-testid={`mobile-navigate-${item.id}`} type="button" aria-current={route === item.id ? "step" : undefined} aria-label={`Step ${index + 1}: ${item.label}`} onClick={() => go(item.id)} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === item.id ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
                <item.icon aria-hidden="true" className="h-4 w-4" /> {item.label}
              </button>
            ))}
            <div className="my-1 border-t border-[#d9e0e4]" />
            <button data-testid="mobile-navigate-value-chain" type="button" aria-current={route === "value-chain" ? "page" : undefined} onClick={() => go("value-chain")} className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "value-chain" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Network aria-hidden="true" className="h-4 w-4" /> The AI Chain
            </button>
            <button data-testid="mobile-navigate-how-it-works" type="button" aria-current={route === "how-it-works" ? "page" : undefined} onClick={() => go("how-it-works")} className={`flex min-h-11 w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold ${route === "how-it-works" ? "bg-[#122232] text-[#d4e86b]" : "text-[#52616b]"}`}>
              <Info aria-hidden="true" className="h-4 w-4" /> How It Works
            </button>
            {route === "value-chain" && <button data-testid="mobile-return-to-workbench" type="button" onClick={() => go("brief")} className="flex w-full items-center gap-3 rounded px-3 py-3 text-left text-[11px] font-semibold text-[#ba2f45]"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Return to Workbench</button>}
          </nav>
        </>
      )}
      {diligence.metrics.lastChange && (
        <div data-testid="toast-reclassification" role="status" aria-live="polite" className="fixed bottom-5 right-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-[#cbd8d4] bg-[#122232] p-4 text-white shadow-xl md:bottom-7 md:right-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#b9d43a]">Evidence reclassified</div>
              <div className="mt-2 text-[11px] leading-5 text-[#dce4e7]">Conservative stress case updated from <span className="font-mono text-white">{formatIRR(diligence.metrics.lastChange.from)}</span> to <span className="font-mono text-white">{formatIRR(diligence.metrics.lastChange.to)}</span>.</div>
              <div className={`mt-1 font-mono text-[12px] font-bold ${diligence.metrics.lastChange.delta < 0 ? "text-[#f5ddd5]" : "text-[#d4e86b]"}`}>{diligence.metrics.lastChange.delta > 0 ? "+" : ""}{diligence.metrics.lastChange.delta.toFixed(1)} pts IRR</div>
            </div>
            <button data-testid="button-dismiss-reclassification" aria-label="Dismiss reclassification notification" onClick={diligence.clearLastChange} className="rounded p-1 text-[#a4b4bd] hover:bg-white/10 hover:text-white"><span aria-hidden="true">×</span></button>
          </div>
        </div>
      )}
      {route === "how-it-works" ? (
        <HowItWorks onReturn={() => go("brief")} onOpenScreen={go} />
      ) : (
        <>
          {route === "home" ? <Home onNavigate={go} /> : (
            <div className="mx-auto flex max-w-[1480px]">
              {route !== "value-chain" && route !== "directory" && <ShellAside screen={route} metrics={diligence.metrics} onNavigate={go} onReset={() => setResetOpen(true)} />}
              <main className="min-w-0 flex-1 px-4 py-7 md:px-8 md:py-10 xl:px-12">
                <div className={`mx-auto ${route === "value-chain" || route === "directory" ? "max-w-[1320px]" : "max-w-[1160px]"}`}>
                  {route === "value-chain" && <ValueChain onWorkbench={() => go("brief")} />}
                  {route === "directory" && <DirectoryPage onCurated={() => { diligence.resetToDefault(); go("brief"); }} onResearchSuccess={(research) => { diligence.loadCustomProject(research); go("brief"); }} />}
                  {route === "brief" && <CaseBrief onNavigate={go} />}
                  {route === "evidence" && <EvidenceRoom onNavigate={go} />}
                  {route === "materiality" && <FinancialMateriality onNavigate={go} />}
                  {route === "decision" && <DecisionReview onNavigate={go} onResolve={resolveEvidence} />}
                  {route === "advisor" && <AdvisorLens onNavigate={go} onResolveEvidence={resolveEvidence} />}
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