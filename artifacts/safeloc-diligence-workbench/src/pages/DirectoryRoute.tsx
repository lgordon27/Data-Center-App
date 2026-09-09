import { useEffect, useState } from "react";
import { ArrowRight, Building2, ExternalLink, Loader2, MapPin, Search, TriangleAlert } from "lucide-react";
import {
  directoryFreshness,
  fetchDirectory,
  fetchDirectoryStats,
  type DirectoryFacility,
  type DirectoryResponse,
  type DirectoryStatsResponse,
} from "@/services/directoryService";
import { createDefaultAssumptionResearch, type CustomResearchResponse } from "@/services/researchProjectService";

declare global {
  interface Window {
    __safelocForceDirectoryRenderError?: boolean;
  }
}

const PAGE_SIZE = 24;
const STATES = ["All", "TX", "AZ", "VA", "GA", "OH", "Other"] as const;
const COMPANIES = ["NVIDIA", "Microsoft", "Meta", "Google", "Amazon", "Oracle"] as const;
const ETF_CONTEXT: Record<string, string[]> = {
  NVIDIA: ["QQQ", "SMH"], Microsoft: ["QQQ", "XLK"], Meta: ["QQQ", "XLC"],
  Google: ["QQQ", "XLK"], Amazon: ["QQQ", "XLY"], Oracle: ["QQQ", "XLK"],
};

function statusLabel(status: DirectoryFacility["status"]) {
  return { operating: "Operating", construction: "Construction", planned: "Planned", delayed: "Delayed", cancelled: "Cancelled", unknown: "Unknown" }[status];
}

const LOCATION_PLACEHOLDERS = new Set(["undisclosed", "unknown", "n/a", "na", "not available", "not disclosed"]);

function meaningfulLocationPart(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized && !LOCATION_PLACEHOLDERS.has(normalized.toLowerCase()) ? normalized : "";
}

function locationLabel(facility: DirectoryFacility) {
  const city = meaningfulLocationPart(facility.city);
  const county = meaningfulLocationPart(facility.county);
  const state = meaningfulLocationPart(facility.state);
  return [city, county ? `${county} County` : "", state].filter(Boolean).join(" · ");
}

const STATE_NAMES: Record<string, string> = {
  TX: "Texas", AZ: "Arizona", VA: "Virginia", GA: "Georgia", OH: "Ohio", WI: "Wisconsin",
};

function researchLocationLabel(facility: DirectoryFacility) {
  const city = meaningfulLocationPart(facility.city);
  const county = meaningfulLocationPart(facility.county);
  const state = meaningfulLocationPart(facility.state);
  return [city, county ? `${county} County` : "", state ? STATE_NAMES[state] ?? state : ""]
    .filter(Boolean)
    .join(", ");
}

function sourceLabel(response: DirectoryResponse | DirectoryStatsResponse | null) {
  if (!response) return "Source unavailable";
  if (response.sourceMetadata.status === "live") return "Live provider data";
  if (response.sourceMetadata.status === "cached") return "Retained provider data";
  return "Embedded snapshot";
}

function isStargate(facility: DirectoryFacility) {
  return facility.directoryDisposition === "canonical" && facility.canonicalProjectId === "stargate-abilene";
}

function DirectoryRecord({
  facility, onCurated, onResearch,
}: {
  facility: DirectoryFacility;
  onCurated: () => void;
  onResearch: () => void;
}) {
  return (
    <article data-testid={`compute-atlas-record-${facility.id}`} className="rounded-lg border border-white/15 bg-[#102b3b] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.35fr)_minmax(190px,1fr)_120px_120px_minmax(145px,auto)] lg:items-center">
        <div className="flex min-w-0 items-start gap-2">
          <Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#d4e86b]" />
           <div className="min-w-0"><h3 className="truncate text-[14px] font-semibold text-white">{facility.name}</h3><p className="mt-1 truncate text-[10px] text-[#9dafb8]">{facility.operator}</p>{facility.directoryDisposition === "unverified-related" && <span data-testid={`compute-atlas-relationship-${facility.id}`} className="mt-1 inline-block font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-[#f1cb8b]">Relationship unverified</span>}</div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-[11px] text-[#c4d0d6]"><MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5ddd5]" /><span className="truncate">{locationLabel(facility)}</span></div>
        <div><div className="font-mono text-[8px] uppercase text-[#718894]">Capacity</div><div className="mt-1 font-mono text-[12px] font-bold text-[#d4e86b]">{facility.capacityMW === null ? "Undisclosed" : `${facility.capacityMW.toLocaleString()} MW`}</div></div>
        <div><div className="font-mono text-[8px] uppercase text-[#718894]">Status</div><span className="mt-1 inline-flex rounded-full border border-[#8dc8e8]/40 px-2 py-1 font-mono text-[9px] font-bold uppercase text-[#b9e1f2]">{statusLabel(facility.status)}</span></div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {facility.sourceUrl && <a data-testid={`compute-atlas-source-${facility.id}`} href={facility.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded border border-white/20 px-2 text-[9px] font-bold uppercase text-[#b9e1f2]">Source <ExternalLink aria-hidden="true" className="h-3 w-3" /></a>}
           <button data-testid={`compute-atlas-open-${facility.id}`} type="button" onClick={isStargate(facility) ? onCurated : onResearch} className="inline-flex min-h-9 items-center gap-1 rounded border border-[#d4e86b]/60 px-2.5 font-mono text-[9px] font-bold uppercase text-[#d4e86b]">
             {isStargate(facility) ? "Curated Deep Dive" : "Research · Beta"}
          </button>
        </div>
      </div>
       {facility.relationshipReason && <p data-testid={`compute-atlas-relationship-reason-${facility.id}`} className="mt-3 rounded border border-white/10 bg-black/10 px-3 py-2 text-[9px] leading-4 text-[#b9c5c9]">{facility.relationshipReason}</p>}
    </article>
  );
}

export default function DirectoryRoute({
  onCurated, onResearchSuccess,
}: {
  onCurated: () => void;
  onResearchSuccess: (research: CustomResearchResponse) => void;
}) {
  if (window.__safelocForceDirectoryRenderError) throw new Error("Forced directory render failure.");
  const [directory, setDirectory] = useState<DirectoryResponse | null>(null);
  const [stats, setStats] = useState<DirectoryStatsResponse | null>(null);
  const [facilities, setFacilities] = useState<DirectoryFacility[]>([]);
  const [totalMatching, setTotalMatching] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<(typeof STATES)[number]>("TX");
  const [companyFilter, setCompanyFilter] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchDirectory({
      limit: PAGE_SIZE, offset: 0, search: debouncedQuery.trim() || undefined,
      state: stateFilter === "All" ? undefined : stateFilter === "Other" ? "OTHER" : stateFilter,
      company: companyFilter ?? undefined,
    }).then((response) => {
      if (!active) return;
      setDirectory(response);
      setFacilities(response.facilities.slice(0, PAGE_SIZE));
      setTotalMatching(response.totalFacilities ?? response.facilities.length);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "The directory is unavailable.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyFilter, debouncedQuery, stateFilter]);

  useEffect(() => {
    let active = true;
    void fetchDirectoryStats().then((response) => { if (active) setStats(response); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const research = (facility: DirectoryFacility) => {
    window.dispatchEvent(new CustomEvent("safeloc-open-custom-project", {
      detail: {
        name: facility.name,
        location: researchLocationLabel(facility),
        knownData: {
          capacity: facility.capacityMW,
          operator: facility.operator,
          status: statusLabel(facility.status),
          sourceUrl: facility.sourceUrl,
          providerId: facility.id,
        },
      },
    }));
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const response = await fetchDirectory({
        limit: PAGE_SIZE, offset: facilities.length, search: debouncedQuery.trim() || undefined,
        state: stateFilter === "All" ? undefined : stateFilter === "Other" ? "OTHER" : stateFilter,
        company: companyFilter ?? undefined,
      });
      setDirectory(response);
      setFacilities((current) => [...current, ...response.facilities.slice(0, PAGE_SIZE)]);
      setTotalMatching(response.totalFacilities ?? totalMatching);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The directory is unavailable.");
    } finally { setLoadingMore(false); }
  };

  const total = stats?.stats.totalFacilities ?? directory?.totalFacilities ?? totalMatching;
  const freshness = directoryFreshness(directory?.sourceMetadata);
  const contextFunds = companyFilter ? [...new Set(facilities.flatMap((facility) => facility.connectedFunds).concat(ETF_CONTEXT[companyFilter] ?? []))] : [];
  return (
    <section data-testid="compute-atlas-page" aria-labelledby="compute-atlas-heading" className="border-t border-white/10 bg-[#0a1b2a] px-5 py-10 sm:px-8 md:py-14 xl:px-10">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end">
          <div><div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4e86b]">Compute Atlas / public directory</div><h1 id="compute-atlas-heading" className="mt-3 text-[34px] font-semibold leading-none tracking-[-0.055em] text-white md:text-[48px]">Find the facilities behind the buildout.</h1><p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#c4d0d6]">Browse public facility metadata, then open a curated workbench or ask AI to research a different project. Directory records are provider context—not facility-level proof or modeled economics.</p></div>
          <div data-testid="compute-atlas-live-count" className="rounded-lg border border-[#8dc8e8]/30 bg-[#102b3b] px-4 py-3"><div className="font-mono text-[9px] uppercase text-[#718894]">{sourceLabel(directory)}</div><div className="mt-1 font-mono text-[24px] font-bold text-[#d4e86b]">{total.toLocaleString()}</div><div data-testid="compute-atlas-freshness" className="font-mono text-[9px] text-[#b9e1f2]">{freshness.label}</div></div>
        </div>
        {loading && <div data-testid="compute-atlas-loading" role="status" className="mt-6 space-y-2"><div className="h-16 animate-pulse rounded-lg bg-[#102b3b]" /><p className="font-mono text-[10px] text-[#9dafb8]">Loading public facility directory…</p></div>}
        {error && <div data-testid="compute-atlas-error" role="alert" className="mt-6 rounded-lg border border-[#f1cb8b]/60 bg-[#3d2d24] px-4 py-3 text-[11px] text-[#ffe0a9]">The provider could not be reached. {error}</div>}
        {!loading && <>
          <div data-testid="compute-atlas-controls" className="mt-6 space-y-4">
            <label className="relative block max-w-xl"><span className="sr-only">Search facilities</span><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#718894]" /><input data-testid="compute-atlas-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facility, operator, city, or county" className="min-h-11 w-full rounded-md border border-white/20 bg-[#102b3b] py-3 pl-10 pr-3 text-[12px] text-white" /></label>
            <div role="tablist" aria-label="Filter directory by state" className="flex gap-2 overflow-x-auto">{STATES.map((state) => <button key={state} data-testid={`compute-atlas-state-${state.toLowerCase()}`} type="button" role="tab" aria-selected={stateFilter === state} onClick={() => setStateFilter(state)} className="min-h-10 shrink-0 rounded-full border border-white/20 px-3 font-mono text-[9px] font-bold uppercase text-[#b9e1f2]">{state}</button>)}</div>
            <div className="flex gap-2 overflow-x-auto">{COMPANIES.map((company) => <button key={company} data-testid={`compute-atlas-company-${company.toLowerCase()}`} type="button" aria-pressed={companyFilter === company} onClick={() => setCompanyFilter(companyFilter === company ? null : company)} className="min-h-10 shrink-0 rounded border border-white/20 px-3 font-mono text-[9px] font-bold uppercase text-[#b9e1f2]">{company}</button>)}</div>
            <button data-testid="compute-atlas-analyze-custom" type="button" onClick={() => window.dispatchEvent(new Event("safeloc-open-custom-project"))} className="min-h-10 rounded border border-white/20 px-3 font-mono text-[9px] font-bold uppercase text-[#b9e1f2]">Custom research · Beta</button>
          </div>
          <div data-testid="compute-atlas-result-count" className="mt-5 font-mono text-[10px] uppercase text-[#9dafb8]">Showing {facilities.length} of {totalMatching} matching · {total} total</div>
          {freshness.caution && <div data-testid="compute-atlas-retained-warning" role="alert" className="mt-4 flex gap-2 rounded border border-[#f1cb8b] p-3 text-[11px] text-[#ffe0a9]"><TriangleAlert aria-hidden="true" className="h-4 w-4" />Retained directory data is nearing its refresh window.</div>}
          {companyFilter && <p className="mt-2 text-[10px] text-[#8299a5]">ETF context: {contextFunds.join(", ") || "No mapped fund context"}. This is market exposure context, not facility evidence.</p>}
           <div data-testid="compute-atlas-results" className="mt-4 space-y-2">{facilities.length === 0 ? <div data-testid="compute-atlas-empty" className="rounded border border-white/15 p-8 text-center text-[#b9c5c9]">No facilities match these filters.</div> : facilities.map((facility) => <DirectoryRecord key={facility.id} facility={facility} onCurated={onCurated} onResearch={() => research(facility)} />)}</div>
          {facilities.length < totalMatching && <button data-testid="compute-atlas-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-4 min-h-11 w-full rounded border border-white/20 text-[#b9e1f2]">{loadingMore ? "Loading more facilities…" : `Show next ${Math.min(PAGE_SIZE, totalMatching - facilities.length)} facilities`}</button>}
          <div data-testid="compute-atlas-attribution" className="mt-6 border-t border-white/10 pt-4 text-[10px] text-[#8299a5]">Directory metadata by <a href="https://compute-atlas.com" target="_blank" rel="noreferrer" className="underline">Compute Atlas</a>, CC BY 4.0. {sourceLabel(directory)} is shown explicitly.</div>
        </>}
      </div>
    </section>
  );
}