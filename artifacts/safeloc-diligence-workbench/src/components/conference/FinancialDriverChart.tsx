import { useState } from "react";
import type { FinancialRangeDriver } from "@/model/financialTransmission";

const pts = (v: number | null) => v === null ? "unavailable" : Math.abs(v) > 1e-10 && Math.abs(v) < .5
  ? `${v > 0 ? "+" : "−"}less than 1 pt` : `${Math.round(v) > 0 ? "+" : ""}${Math.round(v)} pts`;

export function FinancialDriverChart({ drivers }: { drivers: readonly FinancialRangeDriver[] }) {
  const [active, setActive] = useState<string | null>(null);
  const top = drivers.slice(0, 6);
  const scale = Math.max(1, ...top.map(d => Math.max(Math.abs(d.lowDelta ?? 0), Math.abs(d.highDelta ?? 0))));
  if (!top.length) return <p data-testid="driver-chart-empty" className="text-xs text-[#60707d]">No sourced ranges are available to rank drivers.</p>;
  const bar = (v: number | null, color: string) => v === null || Math.abs(v) <= 1e-10 ? null : (
    <div className="absolute top-1 h-2.5 rounded-sm" style={{ background: color, width: `${Math.max(1, Math.abs(v) / scale * 50)}%`, [v < 0 ? "right" : "left"]: "50%" }} />);
  return (
    <figure data-testid="financial-driver-chart" className="rounded-xl border border-[#d9e0e4] bg-white p-4">
      <figcaption className="text-sm font-semibold text-[#122232]">Top drivers of the return range</figcaption>
      <p className="mt-1 text-[11px] leading-5 text-[#52616b]">Each input moved alone to its sourced low and high, against the central case. Shown in whole percentage points of return; the central return is not displayed.</p>
      <ol className="mt-3 space-y-2">
        {top.map((d, i) => {
           const none = d.lowDelta !== null && d.highDelta !== null && Math.abs(d.lowDelta) <= 1e-10 && Math.abs(d.highDelta) <= 1e-10;
          const open = active === d.id;
          return <li key={d.id}>
            <button type="button" data-testid={`driver-row-${d.id}`} aria-expanded={open} onClick={() => setActive(open ? null : d.id)} className="block w-full rounded-md p-2 text-left hover:bg-[#f2f5f0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#607500]">
              <span className="flex justify-between gap-2 text-xs font-medium text-[#122232]"><span>{i + 1}. {d.label}</span>
                <span className="font-mono text-[10px] text-[#60707d]">{none ? "no landlord return effect" : `low ${pts(d.lowDelta)} · high ${pts(d.highDelta)}`}</span></span>
              <span className="relative mt-1 block h-5" aria-hidden="true">
                <span className="absolute left-1/2 top-0 h-5 w-px bg-[#cbd8d4]" />
                {bar(d.lowDelta, "#8dc8e8")}
                <div className="absolute" />
                 {d.highDelta !== null && Math.abs(d.highDelta) > 1e-10 && <div className="absolute top-1 h-2.5 rounded-sm" style={{ background: "#607500", width: `${Math.max(1, Math.abs(d.highDelta) / scale * 50)}%`, [d.highDelta < 0 ? "right" : "left"]: "50%", marginTop: 12, height: 6 }} />}
              </span>
            </button>
            {open && <p data-testid={`driver-detail-${d.id}`} className="ml-2 mt-1 text-[11px] leading-5 text-[#52616b]">
              {none ? "No landlord return effect: this input is a tenant cost or does not move landlord cash flows. " : ""}
               Lower input {d.lowInput ?? "unavailable"} {d.unit}: {d.lowReason ? `estimate unavailable (${d.lowReason.replace(/-/g, " ")})` : `moves the estimate by ${pts(d.lowDelta)}`}.
               {" "}Higher input {d.highInput ?? "unavailable"} {d.unit}: {d.highReason ? `estimate unavailable (${d.highReason.replace(/-/g, " ")})` : `moves the estimate by ${pts(d.highDelta)}`}.
               {" "}All other ordinary inputs are held at their current central values.</p>}
          </li>;
        })}
      </ol>
      <p className="mt-2 flex gap-4 font-mono text-[9px] text-[#60707d]"><span><i className="mr-1 inline-block h-2 w-3 bg-[#8dc8e8]" />input at sourced low</span><span><i className="mr-1 inline-block h-2 w-3 bg-[#607500]" />input at sourced high</span></p>
    </figure>
  );
}
