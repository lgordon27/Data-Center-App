import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Activity, Server, Database, RefreshCw, Terminal, ChevronRight, ChevronDown } from 'lucide-react';
import type { GridTrackerStatus, GridTrackerDiagnostic } from './GridTrackerPanel';

export type GridTrackerDiagnosticsResponse = {
  status: GridTrackerStatus;
  history: GridTrackerDiagnostic[];
};

function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre className="p-3 bg-[#0d1c2b] text-[#b9c3c9] text-[10px] font-mono rounded overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function HistoryItem({ item }: { item: GridTrackerDiagnostic }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-[#e5eae8] rounded-md bg-white mb-2 overflow-hidden">
      <button data-testid={`mcp-history-${item.id}`} type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#fbfcfa] hover:bg-[#f1f5f3] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-[#52616b] shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[#52616b] shrink-0" />}
          <span className={`h-2 w-2 rounded-full shrink-0 ${item.ok ? "bg-[#0b7a63]" : "bg-[#ba2f45]"}`} />
           <span className="font-mono text-[10px] font-bold text-[#122232] truncate max-w-[300px] text-left">{item.query}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-[#60707d]">{new Date(item.at).toLocaleTimeString()}</span>
          <span className="font-mono text-[9px] text-[#52616b] px-1.5 py-0.5 bg-[#e7ecef] rounded">{item.kind}</span>
        </div>
      </button>
      {expanded && (
        <div className="p-3 border-t border-[#e5eae8] space-y-3">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1">Request</div>
            <JsonViewer data={item.request} />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1">Response</div>
            <JsonViewer data={item.response} />
          </div>
        </div>
      )}
    </div>
  );
}

export function DeveloperConsole({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab] = useState<"mcp">("mcp");
  const [diagnostics, setDiagnostics] = useState<GridTrackerDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [querying, setQuerying] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, diagRes] = await Promise.all([
        fetch("/api/gridtracker/status").catch(() => null),
        fetch("/api/gridtracker/diagnostics").catch(() => null)
      ]);
      
      let statusData = null;
      let diagData = null;
      
      if (statusRes && statusRes.ok) statusData = await statusRes.json();
      if (diagRes && diagRes.ok) diagData = await diagRes.json();

      setDiagnostics({
        status: statusData || diagData?.status || null,
        history: diagData?.history || []
      });
    } catch (err) {
      console.error("Failed to fetch diagnostics", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
    }
  }, [isOpen, fetchDiagnostics]);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = consoleRef.current
        ? Array.from(consoleRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [isOpen, onClose]);

  const handleTestQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    setQuerying(true);
    try {
      await fetch(`/api/gridtracker/query?q=${encodeURIComponent(queryInput)}`);
      await fetchDiagnostics();
      setQueryInput("");
    } catch (err) {
      console.error(err);
    } finally {
      setQuerying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={consoleRef} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="dev-console-title">
      <div className="absolute inset-0 bg-[#122232]/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-[#f9faf8] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <header className="flex items-center justify-between px-5 py-3 border-b border-[#d9e0e4] bg-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-[#122232] text-[#d4e86b]">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 id="dev-console-title" className="text-[14px] font-bold text-[#122232]">Developer Console</h2>
              <p className="text-[10px] text-[#60707d] font-mono tracking-[0.05em]">SYS_ADMIN / DIAGNOSTICS</p>
            </div>
          </div>
          <button ref={closeButtonRef} onClick={onClose} className="min-h-11 min-w-11 rounded hover:bg-[#eef2f1] text-[#52616b] transition-colors" aria-label="Close console">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden min-h-[400px]">
           <aside className="w-32 shrink-0 bg-[#eef2f1] border-r border-[#d9e0e4] flex flex-col sm:w-48">
            <div className="p-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-2 px-2">Subsystems</div>
              <button 
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-semibold transition-colors ${activeTab === "mcp" ? "bg-white text-[#122232] shadow-sm" : "text-[#52616b] hover:bg-[#d9e0e4]"}`}
              >
                <Server className="w-3.5 h-3.5" /> MCP Server
              </button>
            </div>
          </aside>

           <main className="min-w-0 flex-1 overflow-y-auto bg-[#f9faf8] p-3 sm:p-5">
            {activeTab === "mcp" && (
              <div className="space-y-6">
                
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold text-[#122232] flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#255bb7]" /> Connection Status
                  </h3>
                   <button type="button" aria-label="Refresh MCP diagnostics" onClick={fetchDiagnostics} disabled={loading} className="min-h-11 min-w-11 rounded border border-[#cbd8d4] text-[#52616b] hover:bg-white hover:text-[#122232] transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
                
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="bg-white p-3 rounded-lg border border-[#d9e0e4]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1">Status</div>
             <div data-testid="mcp-connection-status" className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${diagnostics?.status?.status === 'connected' ? 'bg-[#0b7a63]' : 'bg-[#ba2f45]'}`} />
                       <span className="font-mono text-[12px] font-semibold text-[#122232] capitalize">{diagnostics?.status?.status || "Disconnected"}</span>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#d9e0e4]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1">Protocol</div>
                    <div className="font-mono text-[12px] font-semibold text-[#122232]">{diagnostics?.status?.protocolVersion || "N/A"}</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-[#d9e0e4]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60707d] mb-1">Endpoint</div>
                    <div className="font-mono text-[12px] font-semibold text-[#122232]">{diagnostics?.status?.endpointConfigured ? "Configured" : "Missing"}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[13px] font-bold text-[#122232] flex items-center gap-2 mb-3">
                    <Terminal className="w-4 h-4 text-[#8a6400]" /> Test Request
                  </h3>
                  <form onSubmit={handleTestQuery} className="flex gap-2">
                     <input data-testid="mcp-console-query-input"
                      type="text" 
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="Enter raw MCP query text..."
                      className="flex-1 rounded-md border border-[#cbd8d4] bg-white py-2 pl-3 pr-3 font-mono text-[11px] text-[#122232] focus:border-[#b9d43a] focus:outline-none focus:ring-1 focus:ring-[#b9d43a]"
                      disabled={querying}
                    />
                     <button data-testid="mcp-console-query-submit"
                      type="submit" 
                      disabled={querying || !queryInput.trim()}
                      className="rounded bg-[#122232] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#d4e86b] hover:bg-[#1a2f45] transition-colors disabled:opacity-50 shrink-0"
                    >
                      {querying ? "Sending..." : "Execute"}
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="text-[13px] font-bold text-[#122232] flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-[#0b7a63]" /> Diagnostics History
                  </h3>
                  {diagnostics?.history && diagnostics.history.length > 0 ? (
                    <div className="space-y-1">
                      {diagnostics.history.map((item) => (
                        <HistoryItem key={item.id} item={item} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[#60707d] text-[11px] border border-dashed border-[#cbd8d4] rounded-lg">
                      No query history available.
                    </div>
                  )}
                </div>

              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
