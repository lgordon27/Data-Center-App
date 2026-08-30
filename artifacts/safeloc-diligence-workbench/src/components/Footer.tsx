import { DataSources } from "@/components/DataSources";
import { useState } from "react";
import { Code2, ChevronDown } from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { formatSourceTimestamp } from "@/data/sources";

const workbenchRoutes = new Set(["brief", "evidence", "materiality", "decision", "advisor"]);

export function Footer() {
  const [consoleOpen, setConsoleOpen] = useState(false);
  const { ercotQueue } = useDiligence();
  const route = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  const showsFemaNri = route === "brief" || route === "evidence";
  return (
    <>
      {workbenchRoutes.has(route) && <DataSources />}
      <footer className="mt-8 border-t border-[#d9e0e4] bg-[#eef2f1] px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-[#52616b] sm:flex-row sm:items-center">
          <span>SafeLoc Diligence Workbench</span>
          <span className="flex flex-col gap-1">
            <span>Proof of Concept | Transaction assumptions are synthetic | Environmental and infrastructure data from public sources</span>
            <span data-testid="footer-eia-attribution" className="font-mono normal-case tracking-normal text-[#344550]">Electricity data: U.S. Energy Information Administration Open Data</span>
            {showsFemaNri && <span data-testid="footer-fema-attribution" className="font-mono normal-case tracking-normal text-[#344550]">Climate risk data: FEMA National Risk Index v1.20</span>}
          </span>
          <span className="flex items-center gap-2 font-mono">
            2024 / 24-017
            <button
              data-testid="ercot-console-toggle"
              type="button"
              aria-label="Toggle ERCOT data developer console"
              aria-expanded={consoleOpen}
              aria-controls="ercot-developer-console"
              onClick={() => setConsoleOpen((open) => !open)}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#cbd8d4] bg-white text-[#344550] hover:border-[#255bb7] hover:text-[#255bb7]"
            >
              <Code2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </span>
        </div>
        {consoleOpen && (
          <section id="ercot-developer-console" data-testid="ercot-developer-console" aria-label="ERCOT data developer console" className="mx-auto mt-4 max-h-[420px] max-w-[1480px] overflow-auto rounded-lg border border-[#334b5a] bg-[#122232] p-4 normal-case tracking-normal text-[#dce4e7]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#b9d43a]">ERCOTQueue proxy diagnostics</div>
                <div className="mt-1 font-mono text-[11px] text-white">{ercotQueue.diagnostics.endpoint}</div>
              </div>
              <span className="rounded bg-white/10 px-2 py-1 font-mono text-[9px] uppercase">{ercotQueue.status} · cache {ercotQueue.diagnostics.cache}</span>
            </div>
            <dl className="mt-4 grid gap-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Request timestamp</dt><dd data-testid="ercot-console-request-time" className="mt-1 break-all font-mono">{ercotQueue.diagnostics.requestTimestamp ?? "Not available"}</dd></div>
              <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Response status</dt><dd data-testid="ercot-console-response-status" className="mt-1 font-mono">{ercotQueue.diagnostics.responseStatus ?? "Fallback"}</dd></div>
              <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Cache</dt><dd data-testid="ercot-console-cache" className="mt-1 font-mono">{ercotQueue.diagnostics.cache}</dd></div>
              <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Source freshness</dt><dd data-testid="ercot-console-freshness" className="mt-1 font-mono">{formatSourceTimestamp(ercotQueue.diagnostics.sourceFreshness ?? undefined)}</dd></div>
            </dl>
            {ercotQueue.diagnostics.error && <p className="mt-3 rounded border border-[#a65a00]/60 bg-[#a65a00]/15 px-3 py-2 text-[10px] text-[#f5ddd5]">{ercotQueue.diagnostics.error}</p>}
            <details className="group mt-3 rounded border border-white/15 bg-black/15">
              <summary data-testid="ercot-console-raw-toggle" className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#c4d0d6] [&::-webkit-details-marker]:hidden">
                Raw JSON request / response preview
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <pre data-testid="ercot-console-raw-json" className="max-h-64 overflow-auto border-t border-white/10 p-3 text-[9px] leading-4 text-[#b9d43a]">{JSON.stringify({
                request: {
                  endpoint: ercotQueue.diagnostics.endpoint,
                  timestamp: ercotQueue.diagnostics.requestTimestamp,
                },
                response: {
                  status: ercotQueue.diagnostics.responseStatus,
                  cache: ercotQueue.diagnostics.cache,
                  sourceFreshness: ercotQueue.diagnostics.sourceFreshness,
                  upstream: ercotQueue.diagnostics.responses,
                  preview: ercotQueue.diagnostics.responsePreview,
                },
              }, null, 2)}</pre>
            </details>
          </section>
        )}
      </footer>
    </>
  );
}
