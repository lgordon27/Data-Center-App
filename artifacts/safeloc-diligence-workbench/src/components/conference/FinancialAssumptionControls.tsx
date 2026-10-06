import { useState } from "react";
import { ADJUSTABLE_FINANCIAL_INPUTS, validFinancialAssumption, type AdjustableFinancialInput, type FinancialAssumptionSession, type buildEstimatedFinancialRange } from "@/model/financialTransmission";

type Range = ReturnType<typeof buildEstimatedFinancialRange>;
const fmt = (v: number | null) => v === null ? "not available" : String(v);

export function FinancialAssumptionControls({ range, session, onEdit }: {
  range: Range; session: FinancialAssumptionSession; onEdit: (input: AdjustableFinancialInput, value: number | null) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = (id: AdjustableFinancialInput, text: string) => {
    setDrafts(d => ({ ...d, [id]: text }));
    const n = text.trim() === "" ? NaN : Number(text);
    if (!Number.isFinite(n) || !validFinancialAssumption(id, n)) { setErrors(e => ({ ...e, [id]: "Not a valid value for this input; nothing was applied." })); return; }
    setErrors(e => { const { [id]: _x, ...rest } = e; return rest; });
    onEdit(id, n);
  };
  const reset = (id: AdjustableFinancialInput) => {
    setDrafts(d => { const { [id]: _x, ...rest } = d; return rest; });
    setErrors(e => { const { [id]: _x, ...rest } = e; return rest; });
    if (session.overrides[id] !== undefined) onEdit(id, null);
  };
  return (
    <div data-testid="financial-assumption-controls" className="grid gap-3 sm:grid-cols-2">
      {ADJUSTABLE_FINANCIAL_INPUTS.map(id => {
        const def = range.defaults[id];
        if (!def) return null;
        const ov = session.overrides[id];
        const value = drafts[id] ?? (ov !== undefined ? String(ov) : def.value === null ? "" : String(def.value));
        const outside = ov !== undefined && def.low !== null && def.high !== null && (ov < def.low || ov > def.high);
        return <div key={id} data-testid={`control-${id}`} className="rounded-lg border border-[#d9e0e4] bg-white p-3">
          <label htmlFor={`input-${id}`} className="text-xs font-semibold text-[#122232]">{def.label} <span className="font-normal text-[#60707d]">({def.unit})</span></label>
          <div className="mt-2 flex gap-2">
            <input id={`input-${id}`} data-testid={`input-${id}`} type="number" inputMode="decimal" step="any" value={value} aria-invalid={Boolean(errors[id])}
              onChange={e => change(id, e.target.value)} className="min-h-10 w-full rounded-md border border-[#cbd8d4] px-2 font-mono text-sm" />
            <button type="button" data-testid={`reset-${id}`} onClick={() => reset(id)} disabled={ov === undefined && drafts[id] === undefined} className="min-h-10 rounded-md border border-[#cbd8d4] px-3 text-xs disabled:opacity-40">Reset</button>
          </div>
           {ov !== undefined && <p data-testid={`assumption-badge-${id}`} className="mt-2 text-[10px] font-semibold text-[#607500]">Your assumption · session only</p>}
           <p className="mt-2 text-[10px] leading-4 text-[#52616b]">Sourced default {fmt(def.value)} · range {fmt(def.low)} to {fmt(def.high)} · {def.sourceUrl ? <a href={def.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{def.sourceName}</a> : "no source retained"} · {def.asOfDate ?? "date not provided"}</p>
          {errors[id] && <p role="alert" className="mt-1 text-[11px] text-[#9a3412]">{errors[id]}</p>}
          {outside && !errors[id] && <p data-testid={`warn-${id}`} className="mt-1 text-[11px] text-[#805000]">Outside the sourced range; allowed, and treated as your assumption for this session only.</p>}
        </div>;
      })}
    </div>
  );
}
