import {
  useMemo
} from "react";
import {
  PageIntro,
  BottomNav
} from "@/components/Shell";

import {
  ChevronDown,
  FileText,
  RefreshCw,
  TriangleAlert
} from "lucide-react";
import { SourceStatusBadge } from "@/components/DataSources";
import {
  Classification,
  EvidenceItem,
  useDiligence
} from "@/context/DiligenceContext";





import {
  classifications,
  classMeta,
  evidenceCategories
} from "@/components/Shell";
import type {
  Screen
} from "@/components/Shell";
function EvidenceRow({ item, onChange }: { item: EvidenceItem; onChange: (id: string, value: Classification) => void }) {
  const meta = classMeta[item.classification];
  const { sourceStates } = useDiligence();
  const source = item.sourceId ? sourceStates[item.sourceId] : null;
  const providerSource = item.providerSourceId ? sourceStates[item.providerSourceId] : null;
  return (
    <details id={`evidence-item-${item.id}`} tabIndex={-1} data-testid={`row-evidence-${item.id}`} className="group border-b border-[#e4e9e8] last:border-0 focus-within:bg-[#fbfcfa]">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 transition-colors hover:bg-[#fbfcfa] md:grid-cols-[1.55fr_0.8fr_1.55fr] md:items-center md:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} /><span className="truncate text-[12px] font-semibold text-[#243844]">{item.label}</span></span>
         <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-bold text-[#122232]">{item.value}</span> <span className="text-[10px] text-[#52616b]">{item.unit}</span>{source ? <SourceStatusBadge source={source} compact testId={`evidence-source-status-${item.id}`} /> : <span data-testid={`evidence-origin-${item.id}`} className="rounded-full bg-[#e7ecef] px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.09em] text-[#52616b]">Embedded</span>}</span></span>
        <span className="flex items-center justify-between gap-3"><span className="relative w-full md:max-w-[220px]"><select data-testid={`select-classification-${item.id}`} aria-label={`Classification for ${item.label}`} value={item.classification} onChange={(event) => onChange(item.id, event.target.value as Classification)} onClick={(event) => event.stopPropagation()} className="w-full appearance-none rounded-md border bg-white py-2 pl-3 pr-8 text-[10px] font-semibold text-[#243844] outline-none focus:ring-2 focus:ring-[#b9d43a]/50" style={{ borderColor: meta.border }}>{classifications.map((classification) => <option key={classification} value={classification}>{classification}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#52616b]" /></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#52616b] transition-transform group-open:rotate-180 md:hidden" /></span>
      </summary>
      <div className="grid gap-3 bg-[#fbfcfa] px-4 pb-4 pt-1 md:grid-cols-[1.55fr_0.8fr_1.55fr] md:px-5">
        <p className="text-[10px] leading-4 text-[#52616b] md:col-span-2">{item.description}</p>
         <div className="flex items-start gap-1.5 text-[10px] leading-4 text-[#52616b]"><FileText aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" /><span>{item.citation}<span className="mt-1 block text-[9px] uppercase tracking-[0.08em] text-[#7d898f]">Role: {item.sourceRole}{source ? ` · ${source.fullName}` : " · Embedded case record"}{providerSource ? ` · Provider-ready: ${providerSource.shortName}` : ""}</span></span></div>
      </div>
    </details>
  );
}

export function EvidenceRoom({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const { evidence, updateClassification, metrics } = useDiligence();
  const items = useMemo(() => Object.values(evidence), [evidence]);
  const counts = useMemo(() => classifications.map((classification) => ({ classification, count: items.filter((item) => item.classification === classification).length })), [items]);
  return (
    <div>
      <PageIntro
        eyebrow="02 / source the conviction"
        title="Evidence is not a footnote. It is an active model input."
        description={`${items.length} diligence inputs are classified by provenance. Change a classification to test what the return looks like when an assertion becomes an assumption, or when missing evidence is finally verified.`}
        right={<div data-testid="text-evidence-count" className="rounded-lg border border-[#cbd8d4] bg-[#f9faf8] px-4 py-3 text-right"><div className="font-mono text-xl font-bold text-[#122232]">{items.length}<span className="text-[#52616b]"> / {items.length}</span></div><div className="text-[9px] uppercase tracking-[0.14em] text-[#52616b]">Inputs registered</div></div>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {counts.map(({ classification, count }) => {
          const meta = classMeta[classification];
          return <div key={classification} data-testid={`count-classification-${meta.short.toLowerCase()}`} className="rounded-lg border p-3" style={{ borderColor: meta.border, backgroundColor: meta.bg }}><div className="flex items-center justify-between gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} /><span className="font-mono text-xl font-bold" style={{ color: meta.color }}>{count}</span></div><div className="mt-2 text-[9px] font-bold uppercase leading-3 tracking-[0.1em]" style={{ color: meta.color }}>{classification}</div></div>;
        })}
      </div>
      <div className="space-y-3">
        {evidenceCategories.map((category) => {
          const categoryItems = category.itemIds.map((id) => evidence[id]).filter(Boolean);
          const verified = categoryItems.filter((item) => item.classification === "Verified Evidence").length;
          const missing = categoryItems.filter((item) => item.classification === "Missing Evidence").length;
          return (
            <section key={category.id} id={`evidence-category-${category.id}`} data-testid={`evidence-category-${category.id}`} className="overflow-hidden rounded-xl border border-[#d9e0e4] bg-white">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e0e4] bg-[#f1f5f3] px-4 py-3 md:px-5">
                 <div><h2 className="text-[13px] font-semibold text-[#122232]">{category.label}</h2><p className="mt-0.5 text-[10px] text-[#7d898f]">{categoryItems.length} inputs · provenance summary</p></div>
                <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em]"><span className="rounded-full bg-[#e0f4ed] px-2 py-1 text-[#0b7a63]">{verified} verified</span><span className={`rounded-full px-2 py-1 ${missing ? "bg-[#fde8eb] text-[#ba2f45]" : "bg-white text-[#7d898f]"}`}>{missing} missing</span></div>
              </header>
              <div className="hidden grid-cols-[1.55fr_0.8fr_1.55fr] gap-3 border-b border-[#e5eae8] px-5 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#7d898f] md:grid"><span>Variable</span><span>Value</span><span>Classification</span></div>
              {categoryItems.map((item) => <EvidenceRow key={item.id} item={item} onChange={updateClassification} />)}
            </section>
          );
        })}
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-[#f1cb8b] bg-[#fff8e9] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#a65a00]" /><div><div className="text-[11px] font-bold text-[#6f460e]">Classification changes are live</div><div className="mt-1 text-[10px] leading-4 text-[#7f6337]">Materiality, confidence, and the recommendation status update as soon as a dropdown changes.</div></div></div>
        <div className="flex shrink-0 items-center gap-2 rounded border border-[#ecd39d] bg-white/50 px-2.5 py-2"><RefreshCw className="h-3.5 w-3.5 text-[#a65a00]" /><span data-testid="text-live-confidence" className="font-mono text-[10px] font-bold text-[#6f460e]">{metrics.confidenceScore}% confidence</span></div>
      </div>
      <BottomNav screen="evidence" onNavigate={onNavigate} />
    </div>
  );
}

