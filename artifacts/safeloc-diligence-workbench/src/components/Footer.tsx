import { DataSources } from "@/components/DataSources";
import { useEffect, useState } from "react";
import { Code2, ChevronDown, Download } from "lucide-react";
import { useDiligence } from "@/context/DiligenceContext";
import { formatSourceTimestamp } from "@/data/sources";

const workbenchRoutes = new Set(["analysis"]);

type EiaDiagnosticResponse = {
  status?: string;
  sourceUpdatedAt?: string | null;
  diagnostics?: {
    endpoint?: string;
    requestTimestamp?: string;
    responseStatus?: number;
    cache?: string;
    sourceFreshness?: string | null;
    responses?: unknown[];
    failedResponses?: unknown[];
    error?: string;
  };
};

type ReleaseIdentity = {
  applicationVersion?: string;
  releaseId?: string;
  commitSha?: string | null;
  sourceCommitSha?: string | null;
  commitShaSource?: string;
  commitShaMatchesSource?: boolean | null;
  buildTimestamp?: string;
};

export function Footer() {
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [eiaResponse, setEiaResponse] = useState<EiaDiagnosticResponse | null>(null);
  const [eiaLoading, setEiaLoading] = useState(false);
  const [releaseIdentity, setReleaseIdentity] = useState<ReleaseIdentity | null>(null);
  const [captureDownloadState, setCaptureDownloadState] = useState<"idle" | "downloading" | "unavailable">("idle");
  const { ercotQueue, downloadReturnDiscrepancyRecord } = useDiligence();
  const route = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  const showsFemaNri = route === "analysis";

  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}api/version`, { headers: { accept: "application/json" } })
      .then((response) => response.ok ? response.json() as Promise<ReleaseIdentity> : null)
      .then((payload) => { if (payload) setReleaseIdentity(payload); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!consoleOpen) return undefined;
    let active = true;
    setEiaLoading(true);
    void fetch("/api/eia/electricity", { headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json() as EiaDiagnosticResponse;
        if (active) setEiaResponse(payload);
      })
      .catch((error) => {
        if (active) {
          setEiaResponse({
            status: "unavailable",
            diagnostics: {
              endpoint: "/api/eia/electricity",
              error: error instanceof Error ? error.message : "EIA request failed",
            },
          });
        }
      })
      .finally(() => {
        if (active) setEiaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [consoleOpen]);

  const shortCommit = releaseIdentity?.commitSha?.slice(0, 7)
    ?? releaseIdentity?.releaseId?.slice(0, 10)
    ?? "local";
  const shortTimestamp = releaseIdentity?.buildTimestamp
    ? `${releaseIdentity.buildTimestamp.slice(0, 16).replace("T", " ")}${releaseIdentity.buildTimestamp.endsWith("Z") ? "Z" : ""}`
    : null;
  const releaseTitle = releaseIdentity
    ? `Version ${releaseIdentity.applicationVersion ?? "unknown"} · commit ${releaseIdentity.commitSha ?? releaseIdentity.releaseId ?? "local"} · built ${releaseIdentity.buildTimestamp ?? "unknown"}`
    : undefined;
  const downloadCapture = async () => {
    setCaptureDownloadState("downloading");
    try {
      const downloaded = await downloadReturnDiscrepancyRecord();
      setCaptureDownloadState(downloaded ? "idle" : "unavailable");
    } catch {
      setCaptureDownloadState("unavailable");
    }
  };

  return (
    <>
      {workbenchRoutes.has(route) && <DataSources />}
      <footer className="mt-8 border-t border-[#d9e0e4] bg-[#eef2f1] px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-col justify-between gap-3 text-[9px] uppercase tracking-[0.12em] text-[#52616b] sm:flex-row sm:items-center">
          <span>SafeLoc Diligence Workbench</span>
          <span className="flex flex-col gap-1">
            <span>Public-source diligence · synthetic transaction assumptions</span>
            <details className="group normal-case tracking-normal">
              <summary className="cursor-pointer list-none font-mono text-[#344550] [&::-webkit-details-marker]:hidden">
                Sources and methodology
              </summary>
              <span data-testid="footer-eia-attribution" className="mt-1 block">Electricity: U.S. Energy Information Administration Open Data</span>
              {showsFemaNri && <span data-testid="footer-fema-attribution" className="mt-1 block">Climate risk: FEMA National Risk Index v1.20</span>}
              {releaseIdentity && <span className="mt-1 block font-mono" title={releaseTitle}>{releaseTitle}</span>}
            </details>
          </span>
          <span className="flex items-center gap-2 font-mono">
            {releaseIdentity && <span data-testid="footer-release-identity" title={releaseTitle}>{shortCommit}{shortTimestamp ? ` · ${shortTimestamp}` : ""}</span>}
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
             <div data-testid="eia-console-diagnostics" className="mt-4 border-t border-white/10 pt-4">
               <div className="flex flex-wrap items-start justify-between gap-3">
                 <div>
                   <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#b9d43a]">EIA proxy diagnostics</div>
                   <div className="mt-1 font-mono text-[11px] text-white">/api/eia/electricity</div>
                 </div>
                 <span className="rounded bg-white/10 px-2 py-1 font-mono text-[9px] uppercase">{eiaLoading ? "loading" : eiaResponse?.status ?? "unavailable"}</span>
               </div>
               <dl className="mt-4 grid gap-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
                 <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Request timestamp</dt><dd className="mt-1 break-all font-mono">{eiaResponse?.diagnostics?.requestTimestamp ?? "Not available"}</dd></div>
                 <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Response status</dt><dd className="mt-1 font-mono">{eiaResponse?.diagnostics?.responseStatus ?? "Not available"}</dd></div>
                 <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Cache</dt><dd className="mt-1 font-mono">{eiaResponse?.diagnostics?.cache ?? "Not available"}</dd></div>
                 <div><dt className="uppercase tracking-[0.1em] text-[#96a4ad]">Source freshness</dt><dd className="mt-1 font-mono">{formatSourceTimestamp(eiaResponse?.diagnostics?.sourceFreshness ?? eiaResponse?.sourceUpdatedAt ?? undefined)}</dd></div>
               </dl>
               {eiaResponse?.diagnostics?.error && <p className="mt-3 rounded border border-[#a65a00]/60 bg-[#a65a00]/15 px-3 py-2 text-[10px] text-[#f5ddd5]">{eiaResponse.diagnostics.error}</p>}
               <pre data-testid="eia-console-raw-json" className="mt-3 max-h-64 overflow-auto rounded border border-white/10 bg-black/15 p-3 text-[9px] leading-4 text-[#b9d43a]">{JSON.stringify({
                 request: {
                   endpoint: eiaResponse?.diagnostics?.endpoint ?? "/api/eia/electricity",
                   timestamp: eiaResponse?.diagnostics?.requestTimestamp ?? null,
                 },
                 response: eiaResponse,
               }, null, 2)}</pre>
             </div>
              {import.meta.env.DEV && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div>
                    <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#b9d43a]">Maintainer capture</div>
                    <p className="mt-1 max-w-2xl text-[10px] leading-4 text-[#b8c5ca]">Download the current sanitized return reconciliation record. Raw provider responses, cookies, authorization headers, and arbitrary storage values are excluded.</p>
                    {captureDownloadState === "unavailable" && <p data-testid="return-capture-download-unavailable" className="mt-1 text-[10px] text-[#f1cb8b]">The development capture is not available yet. Reopen the console and try again.</p>}
                  </div>
                  <button
                    data-testid="button-download-return-discrepancy"
                    type="button"
                    disabled={captureDownloadState === "downloading"}
                    onClick={() => { void downloadCapture(); }}
                    className="inline-flex min-h-9 items-center gap-2 rounded border border-[#b9d43a]/60 bg-[#b9d43a]/10 px-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] hover:border-[#d4e86b] disabled:cursor-wait disabled:opacity-60"
                  >
                    <Download aria-hidden="true" className="h-3.5 w-3.5" />
                    {captureDownloadState === "downloading" ? "Preparing JSON" : "Download sanitized record"}
                  </button>
                </div>
              )}
          </section>
        )}
      </footer>
    </>
  );
}
