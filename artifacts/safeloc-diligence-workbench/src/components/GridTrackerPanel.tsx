import React, { useState } from 'react';
import { Network, Search, AlertTriangle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';

export type GridQueryKind = "queue-snapshot" | "change-log" | "classification" | "daily-summary";
export type GridFreshness = "live" | "cached" | "stale" | "disconnected";
export type GridConnectionStatus = "connected" | "disconnected";

export type GridRecord = { label: string; value: string; detail?: string; };

export type GridTrackerResponse = {
  ok: boolean;
  query: string;
  kind: GridQueryKind;
  answer: { summary: string; records: GridRecord[]; } | null;
  freshness: GridFreshness;
  cache: { hit: boolean; stale: boolean; ageMs: number | null; ttlMs: number; };
  source: { name: string; attribution: string; retrievedAt: string; dataTimestamp: string | null; };
  evidenceMapping: { evidenceId: string; label: string; proposedClassification: string; directlySupports: boolean; rationale: string; };
  connection: { status: GridConnectionStatus; endpointConfigured: boolean; protocolVersion: string | null; negotiatedAt: string | null; };
  diagnostics: { historyId: string | null; };
  error?: { code: string; message: string; };
};

export type GridTrackerStatus = {
  status: GridConnectionStatus;
  endpointConfigured: boolean;
  protocolVersion: string | null;
  negotiatedAt: string | null;
  lastQuery: { id: string; at: string; freshness: GridFreshness; kind: GridQueryKind; } | null;
};

export type GridTrackerDiagnostic = {
  id: string;
  at: string;
  query: string;
  kind: GridQueryKind;
  ok: boolean;
  freshness: GridFreshness;
  request: unknown;
  response: unknown;
  error?: string;
};

const EXAMPLE_QUERIES = [
  "What's the current queue status for Oracle's Abilene interconnection request?",
  "How many times has the Stargate project's commercial operation date slipped?",
  "Show me all ERCOT data center projects that withdrew from the queue in 2026"
];

export function GridTrackerPanel({ onConfirmClassification, onClose }: { onConfirmClassification: (evidenceId: string, classification: string) => void; onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<GridTrackerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const fetchQuery = async (q: string) => {
    if (!q.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/gridtracker/query?q=${encodeURIComponent(q)}`);
      const data = await res.json() as GridTrackerResponse;
      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute query.");
      setResult(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section data-testid="gridtracker-panel" aria-busy={isSubmitting} className="rounded-xl border border-[#d9e0e4] bg-white overflow-hidden">
      <header className="bg-[#f1f5f3] px-4 py-3 md:px-5 border-b border-[#d9e0e4] flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#122232]">
          <Network className="h-4 w-4 text-[#255bb7]" />
          <h2 className="text-[13px] font-semibold">GridTracker Intelligence</h2>
        </div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d]">MCP Direct Query</div>
            {onClose && <button type="button" onClick={onClose} aria-label="Close live grid data query" className="rounded p-1 text-[#52616b] hover:bg-white hover:text-[#122232]">×</button>}
          </div>
      </header>

      <div className="p-4 md:p-5">
        <form 
          onSubmit={(e) => { e.preventDefault(); fetchQuery(query); }}
          className="relative flex items-center mb-4"
        >
          <Search className="absolute left-3 h-4 w-4 text-[#60707d]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask the grid queue..."
            data-testid="gridtracker-query-input"
            className="w-full rounded-md border border-[#cbd8d4] bg-[#f9faf8] py-2 pl-9 pr-24 text-[13px] text-[#122232] focus:border-[#b9d43a] focus:outline-none focus:ring-1 focus:ring-[#b9d43a] disabled:opacity-50"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            data-testid="gridtracker-query-submit"
            disabled={isSubmitting || !query.trim()}
            className="absolute right-1.5 rounded bg-[#122232] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] transition-colors hover:bg-[#1a2f45] disabled:opacity-50"
          >
            {isSubmitting ? "Querying..." : "Query"}
          </button>
        </form>

        <div className="mb-6 flex flex-wrap gap-2" data-testid="gridtracker-examples">
          {EXAMPLE_QUERIES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setQuery(ex); fetchQuery(ex); }}
              disabled={isSubmitting}
              data-testid={`gridtracker-example-${i}`}
              className="rounded-full border border-[#e5eae8] bg-white px-3 py-1.5 text-[10px] text-[#52616b] transition-colors hover:border-[#cbd8d4] hover:bg-[#f9faf8] disabled:opacity-50 text-left"
            >
              {ex}
            </button>
          ))}
        </div>

        {isSubmitting && (
          <div data-testid="gridtracker-loading" role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-[#d4e86b] bg-[#f8fbe8] px-4 py-3 text-[11px] text-[#415000]">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Contacting the discovered GridTracker MCP operation…
          </div>
        )}

        {error && (
          <div data-testid="gridtracker-error" role="alert" className="rounded-lg border-2 border-[#ba2f45] bg-[#fff3f4] px-4 py-3 text-[#7f2635] flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[11px] font-medium">{error}</p>
          </div>
        )}

        {!result && !error && !isSubmitting && (
          <div data-testid="gridtracker-empty" className="rounded-lg border border-dashed border-[#cbd8d4] bg-[#fbfcfa] px-4 py-5 text-center text-[11px] text-[#60707d]">
            Choose a question or enter a query to inspect the current ERCOT queue through the governed MCP connection.
          </div>
        )}

        {result && (
          <div data-testid="gridtracker-result" className="rounded-lg border border-[#e5eae8] bg-white animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="px-4 py-3 border-b border-[#e5eae8] bg-[#fbfcfa] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1">Submitted Question</div>
                <div className="text-[12px] font-medium text-[#122232]">"{result.query}"</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60707d] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                   Source timestamp: {result.source.dataTimestamp || result.source.retrievedAt || "Timestamp unavailable"}
                </span>
                <span className={`px-2 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase tracking-[0.1em] ${
                  result.freshness === "live" ? "bg-[#e0f4ed] text-[#0b7a63]" :
                  result.freshness === "cached" ? "bg-[#fff0d6] text-[#a65a00]" :
                  "bg-[#fde8eb] text-[#ba2f45]"
                }`}>
                  {result.freshness}
                </span>
              </div>
            </div>

            {result.ok && result.answer ? (
              <div className="p-4">
                <div className="mb-4 text-[11px] leading-relaxed text-[#344550]">
                  {result.answer.summary}
                </div>
                
                {result.answer.records.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-5">
                    {result.answer.records.map((rec, i) => (
                      <div key={i} className="rounded border border-[#e5eae8] p-2.5 bg-[#fbfcfa]">
                        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1 truncate" title={rec.label}>{rec.label}</div>
                        <div className="font-mono text-[11px] font-semibold text-[#122232] break-words">{rec.value}</div>
                        {rec.detail && <div className="mt-1.5 text-[9px] text-[#52616b]">{rec.detail}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#60707d] italic mb-5 p-4 text-center border border-dashed border-[#e5eae8] rounded-md">
                    No explicit records returned for this query.
                  </div>
                )}

                 <div data-testid="gridtracker-evidence-mapping" className="rounded-lg border border-[#9bd8c5] bg-[#e0f4ed]/30 p-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#08644f] mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Proposed Evidence Mapping
                    </div>
                    <div className="text-[11px] text-[#122232] font-medium">Target: {result.evidenceMapping.label}</div>
                    <div className="mt-1 text-[10px] text-[#08644f] max-w-xl">{result.evidenceMapping.rationale}</div>
                  </div>
                   {result.evidenceMapping.directlySupports && <button
                    type="button"
                    data-testid="gridtracker-verify-btn"
                     disabled={confirmed}
                     onClick={() => { onConfirmClassification(result.evidenceMapping.evidenceId, result.evidenceMapping.proposedClassification); setConfirmed(true); }}
                    className="shrink-0 rounded bg-[#0b7a63] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-white hover:bg-[#08644f] transition-colors"
                  >
                     {confirmed ? "Verified Evidence confirmed" : `Confirm ${result.evidenceMapping.proposedClassification}`}
                   </button>}
                </div>
              </div>
            ) : (
              <div className="p-4 flex items-start gap-3 text-[#7f2635]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#ba2f45]" />
                <div>
                  <p className="text-[11px] font-bold text-[#ba2f45]">Provider Error</p>
                  <p className="mt-1 text-[10px]">{result.error?.message || "An unknown error occurred during query execution."}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
