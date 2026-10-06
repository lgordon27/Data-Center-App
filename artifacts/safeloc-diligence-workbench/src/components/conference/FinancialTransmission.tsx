import { useMemo, useRef, useState } from "react";
import { useDiligence } from "@/context/DiligenceContext";
import { isConferenceResearchIncomplete } from "@/model/conferenceEvidence";
import type { EvidenceRecord } from "@/model/cashFlowEngine";
import {
  ADJUSTABLE_FINANCIAL_INPUTS, EMPTY_FINANCIAL_ASSUMPTIONS, buildEstimatedFinancialRange, editFinancialAssumption, validFinancialAssumption,
  type AdjustableFinancialInput, type FinancialAssumptionSession,
} from "@/model/financialTransmission";
import { authenticEiaObservation, type FinancialRegistryEntry } from "@/model/financialInputProvenance";
import { FinancialAssumptionControls } from "@/components/conference/FinancialAssumptionControls";
import { FinancialDriverChart } from "@/components/conference/FinancialDriverChart";
import { FinancialEvidenceReviewControls } from "@/components/conference/FinancialEvidenceReviewControls";

const storageKey = (k: string) => `safeloc:financial-assumptions:v1:${k}`;
function restore(key: string): FinancialAssumptionSession {
  try {
    const raw = JSON.parse(sessionStorage.getItem(storageKey(key)) ?? "null");
    if (!raw || typeof raw.overrides !== "object" || !Array.isArray(raw.audit)) return EMPTY_FINANCIAL_ASSUMPTIONS;
    let s = EMPTY_FINANCIAL_ASSUMPTIONS;
    for (const a of raw.audit) {
      if (!ADJUSTABLE_FINANCIAL_INPUTS.includes(a?.input) || (a.value !== null && (typeof a.value !== "number" || !validFinancialAssumption(a.input, a.value)))) return EMPTY_FINANCIAL_ASSUMPTIONS;
      s = editFinancialAssumption(s, a.input, a.value, a.timestamp);
    }
    return s;
  } catch { return EMPTY_FINANCIAL_ASSUMPTIONS; }
}
const REASONS: Record<string, string> = {
  "invalid-input": "an input is missing or unusable", "no-sign-change": "cash flows never turn positive, so no return can be defined",
  "multiple-roots": "cash flows imply more than one possible return, so a unique estimate cannot be reported",
};
const plain = (r: string | null) => r ? REASONS[r] ?? r.replace(/-/g, " ") : "unavailable";
const unresolvedLink = (e: FinancialRegistryEntry) => {
  try { const u = new URL(e.sourceUrl!); return (u.pathname === "/" || u.pathname === "") || /unresolved/i.test(e.applicability); } catch { return true; }
};

function Inner({ projectKey }: { projectKey: string }) {
  // Context's effective evidence is already session-projected; the model boundary independently
  // quarantines custom research that has not been accepted. No alternate acceptance path.
  const { project, evidence, eiaData } = useDiligence();
  const [session, setSession] = useState<FinancialAssumptionSession>(() => restore(projectKey));
  const sessionRef = useRef(session);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const isStargate = project.kind === "curated" && /stargate/i.test(project.name);
  const state = isStargate ? "TX" : project.location.match(/,\s*([A-Z]{2})\b/)?.[1] ?? null;
  const range = useMemo(() => buildEstimatedFinancialRange({ evidence: evidence as unknown as EvidenceRecord, context: { isStargate, state, eia: eiaData }, session }),
    [evidence, isStargate, state, eiaData, session]);
  const edit = (input: AdjustableFinancialInput, value: number | null) => {
    const next = editFinancialAssumption(sessionRef.current, input, value, new Date().toISOString());
    sessionRef.current = next;
    setSession(next);
    try { sessionStorage.setItem(storageKey(projectKey), JSON.stringify(next)); setStorageWarning(null); }
    catch { setStorageWarning("Browser session storage is unavailable. These edits will be lost when you leave or reload this view."); }
  };
  const pub = Object.values(range.active).filter(e => e.visibility === "public");
  const meth = Object.values(range.defaults).filter(e => e.visibility === "methodology");
  const c = range.counts;
  const unsourcedIds = new Set(range.unsourced.map(e => e.id));
  const sched = (range.cases.central.model?.schedule ?? []) as Array<{ tenantElectricityCost?: number | null; tenantWaterCost?: number | null }>;
  const peak = (k: "tenantElectricityCost" | "tenantWaterCost") => sched.some(y => y[k] != null) ? Math.max(0, ...sched.map(y => y[k] ?? 0)) : null;
  const money = (v: number | null) => v === null ? "unavailable" : `$${v.toFixed(1)}M`;
  const unavailable = (["cautious", "central", "favorable"] as const).filter(k => range.cases[k].status !== "meaningful");
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
      <section data-testid="financial-range" className="rounded-xl border border-[#cbd8d4] bg-[#eef5f2] p-5">
        <h3 data-testid="financial-range-label" className="text-lg font-semibold text-[#122232]">{range.label}</h3>
        <p data-testid="financial-range-counts" className="mt-2 text-xs text-[#52616b]">{c.disclosed} disclosed, {c.benchmark} benchmark, {unsourcedIds.size} provisional or unsourced inputs</p>
        <p data-testid="financial-range-extra-counts" className="mt-1 text-[11px] text-[#60707d]">Also counted: {c.derived} derived and {c["user-assumption"]} user-assumption inputs.</p>
        {range.status !== "estimated" && <p data-testid="financial-range-unavailable" className="mt-3 text-xs leading-5 text-[#805000]">
          {range.status === "insufficient-data" ? "More than three required inputs are missing or provisional, so no range is shown." : range.status === "unordered-return" ? "The cautious, central and favorable cases do not order sensibly with these inputs, so no range is shown." : "A return could not be defined for every case."}
          {unavailable.map(k => <span key={k} className="block">Case {k}: {plain(range.cases[k].reason)}.</span>)}</p>}
        <p className="mt-3 text-[11px] leading-5 text-[#60707d]">Estimated equity returns combine reported inputs, operating benchmarks and assumptions. A stress adjustment was applied. These are not disclosed investment returns, issuer valuation or advice.</p>
      </section>

      <section data-testid="financial-missing" className="rounded-xl border border-[#e3d4b6] bg-[#fffbf2] p-5">
        <h3 className="text-sm font-semibold text-[#805000]">Couldn't directly source</h3>
        {range.missing.length === 0 ? <p className="mt-2 text-xs text-[#52616b]">No required input is missing or provisional.</p> :
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#52616b]">{range.missing.map(e => <li key={e.id}>{e.label}: {e.type === "blank" ? "no sourced value" : "provisional, research needed"}</li>)}</ul>}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#52616b]">{range.unsourced.filter(e => !range.missing.some(m => m.id === e.id)).map(e =>
          <li key={e.id}>{e.label}: {e.value === null ? "no sourced value" : "citation date or source details unresolved"}</li>)}</ul>
        {meth.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[#52616b]" data-testid="financial-methodology-needed">
          {["Water conversion allowance","Water rights and source multipliers","Carbon fallback","Backup power and cooling capex tables"].map(l => <li key={l}>{l}: research needed</li>)}</ul>}
      </section>
      </div>

      <section data-testid="financial-tenant-context" className="rounded-xl border border-[#d9e0e4] bg-white p-5">
        <h3 className="text-sm font-semibold">Tenant electricity and water pass-through</h3>
        <p className="mt-2 text-xs leading-5 text-[#52616b]">Assumption: hyperscale leases pass these through to the tenant. Actual Oracle terms are not public. These are tenant context costs, not landlord costs, and carry no landlord return effect.</p>
        <p className="mt-2 font-mono text-[11px] text-[#60707d]">Peak-year tenant context: electricity {money(peak("tenantElectricityCost"))} · water {money(peak("tenantWaterCost"))}</p>
      </section>

      <FinancialDriverChart drivers={range.drivers} />

      <section aria-labelledby="fa-h" className="space-y-3">
        <h3 id="fa-h" className="text-sm font-semibold">Your assumptions</h3>
        <p className="text-xs text-[#52616b]">Edits are yours, apply live to this range, last for this browser session only and never change sourced defaults.</p>
        {storageWarning && <p role="alert" className="text-xs text-[#805000]">{storageWarning}</p>}
        <FinancialAssumptionControls range={range} session={session} onEdit={edit} />
        <div data-testid="financial-audit" className="rounded-lg border border-[#d9e0e4] bg-[#f9faf8] p-3">
          <p className="text-xs font-semibold">Session history</p>
          {session.audit.length === 0 ? <p className="mt-1 text-[11px] text-[#60707d]">No edits yet.</p> :
            <ol className="mt-1 space-y-1 font-mono text-[10px] text-[#52616b]">{session.audit.map((a, i) => <li key={i}>{a.timestamp} · {a.action} · {range.defaults[a.input]?.label}{a.value !== null ? ` · ${a.value}` : ""}</li>)}</ol>}
        </div>
      </section>

      <section data-testid="financial-public-inputs" className="space-y-2">
        <h3 className="text-sm font-semibold">Public inputs</h3>
        {pub.map(e => <details key={e.id} data-testid={`input-detail-${e.id}`} className="rounded-lg border border-[#d9e0e4] bg-white p-3">
          <summary className="cursor-pointer text-xs font-semibold">{e.label}: {e.value === null ? "not sourced" : `${e.value} ${e.unit}`}
            <span className="ml-2 font-mono text-[9px] uppercase text-[#607500]">{e.type}{e.sourceTier ? ` · ${e.sourceTier}` : ""}{e.specificity ? ` · ${e.specificity}` : ""}</span></summary>
          <div className="mt-2 space-y-1 text-[11px] leading-5 text-[#52616b]">
            <p>Range {e.low ?? "n/a"} to {e.high ?? "n/a"}. {e.applicability}</p>
            <p>{e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{e.sourceName}</a> : "No source retained"}
              {e.sourceUrl && unresolvedLink(e) ? " · general source link; article permalink unresolved" : ""}</p>
            <p>As-of: {e.asOfDate ?? "date not provided"}</p>
          </div></details>)}
      </section>
    </div>
  );
}

export function FinancialTransmission({ onNavigate: _n, onResolveEvidence: _r }: { onNavigate: (screen: string) => void; onResolveEvidence: (id: string) => void }) {
  const { project, evidence, financialModeling, eiaData } = useDiligence();
  const incomplete = isConferenceResearchIncomplete(project, evidence);
  const projectKey = [project.kind, project.name, project.location].join("|").toLowerCase();
  const state = project.kind === "curated" && /stargate/i.test(project.name) ? "TX" : project.location.match(/,\s*([A-Z]{2})\b/)?.[1] ?? null;
  const observation = authenticEiaObservation(eiaData, state);
  const rate = (r: number | undefined) => r !== undefined && Number.isFinite(r) ? `$${r.toFixed(1)}/MWh` : "Not available";
  return (
    <section data-testid="conference-view-transmission" className="space-y-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#607500]">03 / Trace a possible financial pathway</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">How could a physical constraint reach a holding?</h2></div>
      {incomplete && <div data-testid="transmission-research-incomplete" className="rounded-lg border border-[#e3d4b6] bg-[#fffbf2] p-5">
        <h3 className="font-semibold text-[#805000]">Evidence assessment remains incomplete</h3><p className="mt-2 text-sm leading-6 text-[#52616b]">Unresolved assessment does not prevent review of an available candidate. Candidate review requires matching scope and an available model; nothing applies without explicit acceptance. Synthetic returns are not project economics.</p>
      </div>}
      {financialModeling.status === "not-modeled" && (
        <section data-testid="canonical-financial-not-modeled" className="rounded-xl border border-[#e3d4b6] bg-[#fffbf2] p-5">
          <h3 className="font-semibold text-[#805000]">Not modeled</h3>
          <p data-testid="canonical-financial-not-modeled-reason" className="mt-2 text-sm leading-6 text-[#52616b]">{financialModeling.reason}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-[#60707d]">Required inputs</p>
          <ul data-testid="canonical-financial-required-inputs" className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#52616b]">
            {financialModeling.requiredInputs.map((i) => <li key={i}>{i}</li>)}
          </ul>
          <p className="mt-4 text-xs leading-5 text-[#60707d]">The reviewed dossier remains available in Project Reality. No project, issuer, fund, or portfolio return is inferred.</p>
        </section>
      )}
      <p data-testid="transmission-return-boundary" className="text-xs leading-5 text-[#60707d]">Reported project inputs remain distinct from benchmarks and model assumptions. This view estimates landlord equity returns, not issuer or portfolio returns. EIA is statewide tenant-cost context—not a disclosed {project.name} tariff.</p>
      <section data-testid="transmission-electricity-basis" className="rounded-xl border border-[#d9e0e4] bg-white p-4">
        <div data-testid="transmission-eia-electricity-basis" className="rounded-lg border border-[#8dc8e8]/50 bg-[#f2f9fc] p-4">
          <h3 className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#164c67]">EIA statewide industrial benchmark · tenant context</h3>
          {observation ? <p className="mt-2 text-xl font-semibold text-[#122232]">{rate(observation.value)}<span className="block text-[11px] font-normal text-[#52616b]">observed period {observation.date}; retrieved {observation.fetchedAt.slice(0, 10)}; statewide context, not a contract rate.</span></p>
            : <p className="mt-2 text-[11px] leading-5 text-[#52616b]">No EIA provider observation is available in this session.</p>}
        </div>
      </section>
      {financialModeling.status === "not-modeled"
        ? <p data-testid="financial-session-model-unavailable" className="text-xs leading-5 text-[#805000]">Model unavailable: no financial range or controls. Findings remain available for source review in Project Reality.</p>
        : <Inner key={projectKey} projectKey={projectKey} />}
      <FinancialEvidenceReviewControls key={`review:${projectKey}`} />
    </section>
  );
}
