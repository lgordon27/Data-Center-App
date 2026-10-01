export type ReviewedShowcaseEntry = {
  slug: string;
  name: string;
  location: string;
  asOfDate: string | null;
  coverageState: string;
  modelState: "Reviewed model" | "Not modeled";
};

export type ReviewedShowcaseState = "loading" | "ready" | "unavailable";

/** Supplied by the reviewed-catalog integration, never by the canonical seed list. */
export type ReviewedShowcaseCatalog = {
  entries: readonly ReviewedShowcaseEntry[];
  state: ReviewedShowcaseState;
  onOpen: (slug: string) => void;
};

export function ReviewedShowcaseEntries({
  entries = [],
  state,
  onOpen,
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
    return <p data-testid="home-showcase-empty" role="status" className="text-[10px] text-[#9dafb8]">No reviewed examples are available. No research or refresh will run automatically.</p>;
  }
  return (
    <div data-testid="home-reviewed-showcase" className="mt-5 grid gap-2">
      {availableEntries.map((entry) => (
        <button
          key={entry.slug}
          data-testid={`home-dossier-${entry.slug}`}
          type="button"
          aria-label={`${entry.name}, ${entry.location ?? "location unavailable"}, evidence as of ${entry.asOfDate ?? "date unavailable"}, ${entry.modelState ?? "Not modeled"}, ${entry.coverageState ?? "coverage unknown"}`}
          onClick={() => onOpen(entry.slug)}
          className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0d2435] px-3 py-2.5 text-left hover:border-[#d4e86b]"
        >
          <span className="min-w-0"><span className="block break-words text-[11px] font-semibold text-white">{entry.name}</span><span className="mt-0.5 block break-words text-[9px] text-[#9dafb8]">{entry.location ?? "Location unavailable"} · as of {entry.asOfDate ?? "date unavailable"}</span></span>
          <span className="shrink-0 text-right font-mono text-[8px] font-bold uppercase text-[#d4e86b]">
            <span className="block">{entry.modelState ?? "Not modeled"}</span>
            <span data-testid={`home-dossier-coverage-${entry.slug}`} className="mt-0.5 block text-[#9dafb8]">{entry.coverageState?.replaceAll("-", " ") ?? "coverage unknown"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}