import { useEffect, useRef } from "react";

export type ReviewedShowcaseEntry = {
  slug: string;
  name: string;
  location: string;
  asOfDate: string | null;
  canonicalProjectId?: string;
  reviewStatus?: "human-reviewed";
  reviewedAt?: string;
  reviewerRef?: string;
  reviewRationale?: string;
  origin?: string;
  version?: number;
  presentationLabel?: string;
  coverageState?: string;
  modelState?: "Reviewed model" | "Not modeled";
};

export type ReviewedShowcaseState = "loading" | "ready" | "unavailable";

export type ReviewedShowcaseSnapshot = {
  slug: string;
  name: string;
  scopeLabel: string;
  asOfDate: string;
  reviewStatus: "human-reviewed";
  reviewerRef: string;
  reviewedAt: string;
  reviewRationale: string;
  origin: string;
  version: number;
  sources: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    url: string;
    publicationDate: string | null;
    accessDate: string | null;
    retainedPassageId: string;
    retainedPassage: string;
  }>;
  payload: Record<string, unknown>;
};

/** Supplied by the reviewed-catalog integration, never by the canonical seed list. */
export type ReviewedShowcaseCatalog = {
  entries: readonly ReviewedShowcaseEntry[];
  state: ReviewedShowcaseState;
  onOpen: (slug: string) => void;
  openingSlug?: string | null;
};

export function ReviewedShowcaseEntries({
  entries = [],
  state,
  onOpen,
  openingSlug = null,
}: ReviewedShowcaseCatalog) {
  if (state === "loading") {
    return <p data-testid="home-showcase-loading" role="status" className="text-[10px] text-[#9dafb8]">Loading reviewed dossier identities…</p>;
  }
  if (state === "unavailable") {
    return <p data-testid="home-showcase-unavailable" role="status" className="text-[10px] text-[#f1cb8b]">Reviewed examples are unavailable. Try again later; no research is started from this screen.</p>;
  }
  const availableEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry && typeof entry.slug === "string" && typeof entry.name === "string")
    : [];
  if (availableEntries.length === 0) {
    return <p data-testid="home-showcase-empty" role="status" className="text-[10px] text-[#9dafb8]">No reviewed examples are available. A canonical or seeded dossier is not public-showcase approval; no research or refresh will run automatically.</p>;
  }
  return (
    <div data-testid="home-reviewed-showcase" className="mt-5 grid gap-2">
      {availableEntries.map((entry) => (
        <button
          key={entry.slug}
          data-testid={`home-dossier-${entry.slug}`}
          type="button"
          aria-label={`${entry.name}, ${entry.location ?? "scope unavailable"}, evidence as of ${entry.asOfDate ?? "date unavailable"}, human-reviewed cached example`}
          onClick={() => onOpen(entry.slug)}
          disabled={openingSlug === entry.slug}
          aria-busy={openingSlug === entry.slug}
          className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0d2435] px-3 py-2.5 text-left hover:border-[#d4e86b]"
        >
          <span className="min-w-0"><span className="block break-words text-[11px] font-semibold text-white">{entry.name}</span><span className="mt-0.5 block break-words text-[9px] text-[#9dafb8]">{entry.location ?? "Scope unavailable"} · as of {entry.asOfDate ?? "date unavailable"}</span></span>
          <span className="shrink-0 text-right font-mono text-[8px] font-bold uppercase text-[#d4e86b]">
            <span className="block">{entry.modelState ?? "Human-reviewed"}</span>
            <span className="mt-0.5 block text-[#9dafb8]">{entry.modelState ? entry.coverageState?.replaceAll("-", " ") ?? "coverage unknown" : entry.presentationLabel ?? "Cached example"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ReviewedShowcaseSnapshotDialog({
  snapshot,
  onClose,
}: {
  snapshot: ReviewedShowcaseSnapshot;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div
      data-testid="home-showcase-snapshot-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-showcase-snapshot-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#071521]/80 px-3 py-6 sm:px-6 md:items-center"
    >
      <section className="w-full max-w-4xl rounded-xl border border-[#8dc8e8]/40 bg-[#0d2435] p-4 text-white shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#d4e86b]">Read-only reviewed cache · {snapshot.origin}</p>
            <h2 id="home-showcase-snapshot-title" className="mt-2 break-words text-xl font-semibold">{snapshot.name}</h2>
            <p className="mt-1 text-[10px] text-[#9dafb8]">{snapshot.scopeLabel} · evidence as of {snapshot.asOfDate} · version {snapshot.version}</p>
          </div>
          <button
            data-testid="button-close-showcase-snapshot"
            type="button"
            ref={closeButtonRef}
            onClick={onClose}
            className="min-h-10 shrink-0 rounded-md border border-white/20 px-3 text-xs font-semibold hover:border-[#d4e86b] focus:outline-none focus:ring-2 focus:ring-[#d4e86b]"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-[#83d6b8]/30 bg-[#123b3b]/40 p-3 text-[10px] leading-5 text-[#dce4e7]">
          <p className="font-semibold text-[#b9f0d9]">Human review recorded</p>
          <p>Reviewer reference: {snapshot.reviewerRef} · reviewed at {snapshot.reviewedAt}</p>
          <p>{snapshot.reviewRationale}</p>
          <p className="mt-1 text-[#9dafb8]">Opening this stored snapshot does not refresh evidence or start research.</p>
        </div>

        <section className="mt-5" aria-labelledby="home-showcase-sources-heading">
          <h3 id="home-showcase-sources-heading" className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#d4e86b]">Retained public sources</h3>
          <ol className="mt-2 space-y-2">
            {snapshot.sources.map((source) => (
              <li key={source.sourceId} data-testid={`home-showcase-source-${source.sourceId}`} className="rounded-lg border border-white/10 bg-[#081722] p-3">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-[11px] font-semibold text-[#b9e1f2] underline underline-offset-2">
                  {source.publisher}: {source.title}
                </a>
                <p className="mt-2 break-words text-[10px] leading-5 text-[#dce4e7]">{source.retainedPassage}</p>
                <p className="mt-2 font-mono text-[8px] text-[#9dafb8]">
                  Passage {source.retainedPassageId} · published {source.publicationDate ?? "date not reported"} · accessed {source.accessDate ?? "date not reported"}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <details className="mt-4 rounded-lg border border-white/10 bg-[#081722]">
          <summary className="cursor-pointer px-3 py-3 text-[10px] font-semibold text-[#b9e1f2]">Inspect the reviewed cached payload</summary>
          <pre data-testid="home-showcase-payload" className="max-h-96 overflow-auto border-t border-white/10 p-3 text-[9px] leading-4 text-[#dce4e7]">{JSON.stringify(snapshot.payload, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}