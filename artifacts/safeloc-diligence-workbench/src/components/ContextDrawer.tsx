import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/*
 * Reusable right-side context drawer. One instance is hosted by the unified
 * analysis workbench; any section can open it with a typed content request
 * (source excerpts, page references, calculations, AI reasoning, benchmark
 * comparisons, approval details, audit history). It overlays the workspace at
 * narrower widths and becomes a bottom sheet on mobile. The drawer is
 * focus-trapped, Escape closes it, and focus returns to the trigger (or a
 * named fallback element). Opening it never touches the page scroll position.
 */
export type DrawerRequest = {
  key: string;
  kicker: string;
  title: string;
  testId?: string;
  render: () => ReactNode;
};

type OpenOptions = {
  trigger?: HTMLElement | null;
  returnFocusSelector?: string;
};

type DrawerContextValue = {
  openDrawer: (request: DrawerRequest, options?: OpenOptions) => void;
  closeDrawer: () => void;
  isOpen: boolean;
  activeKey: string | null;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useWorkbenchDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error("useWorkbenchDrawer must be used inside WorkbenchDrawerProvider");
  }
  return ctx;
}

const FOCUSABLE_SELECTOR =
  "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";

export function WorkbenchDrawerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ request: DrawerRequest; options?: OpenOptions } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const closeDrawer = useCallback(() => {
    setActive((current) => {
      if (current) {
        const { trigger, returnFocusSelector } = current.options ?? {};
        const fallback = returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
        const target = trigger && document.contains(trigger) ? trigger : fallback;
        // preventScroll: closing the drawer must never move the reviewer's place.
        requestAnimationFrame(() => target?.focus({ preventScroll: true }));
      }
      return null;
    });
  }, []);

  const openDrawer = useCallback((request: DrawerRequest, options?: OpenOptions) => {
    setActive({ request, options });
  }, []);

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Background isolation: the drawer portals to <body>, so marking the app
    // root inert removes the whole background from the tab order and from
    // assistive technology while the modal is open.
    const appRoot = document.getElementById("root");
    appRoot?.setAttribute("inert", "");

    const initialTarget = panel.querySelector<HTMLElement>("[data-drawer-close]") ?? panel;
    requestAnimationFrame(() => initialTarget.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      // Visible tabbables only: collapsed <details> content (e.g. citation
      // links) must not become wrap targets.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (current === first || !panel.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      appRoot?.removeAttribute("inert");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [active, closeDrawer]);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer, isOpen: active !== null, activeKey: active?.request.key ?? null }}>
      {children}
      {active && createPortal(
        <div className="fixed inset-0 z-[70]" data-testid={active.request.testId ?? "context-drawer-root"}>
          <button
            type="button"
            aria-label="Close context drawer"
            className="absolute inset-0 h-full w-full cursor-default bg-[#122232]/55 backdrop-blur-[1px]"
            onClick={closeDrawer}
            tabIndex={-1}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="context-drawer-title"
            data-testid="context-drawer"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-xl border border-[#cfd8dc] bg-[#f6f7f6] shadow-2xl outline-none sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-[min(430px,94vw)] sm:rounded-none sm:border-b-0 sm:border-r-0 sm:border-t-0"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#e0e4e0] bg-[#f6f7f6] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#52616b]">{active.request.kicker}</p>
                <h2 id="context-drawer-title" className="mt-1 text-base font-semibold leading-snug text-[#1c2b33]">
                  {active.request.title}
                </h2>
              </div>
              <button
                type="button"
                data-drawer-close
                data-testid="button-close-context-drawer"
                aria-label="Close context drawer"
                onClick={closeDrawer}
                className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#cfd8dc] bg-white text-[#52616b] hover:border-[#0e3e2f] hover:text-[#0e3e2f]"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" data-testid="context-drawer-body">
              {active.request.render()}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </DrawerContext.Provider>
  );
}

export function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#e0e4e0] pt-3 first:border-t-0 first:pt-0">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#52616b]">{label}</p>
      <div className="mt-1.5 space-y-2 text-xs leading-relaxed text-[#33454e]">{children}</div>
    </section>
  );
}

export function DrawerField({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="rounded-sm border border-[#e0e4e0] bg-white px-2.5 py-1.5" data-testid={testId}>
      <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#7c8b93]">{label}</p>
      <div className="mt-0.5 text-xs font-semibold text-[#1c2b33]">{value}</div>
    </div>
  );
}
