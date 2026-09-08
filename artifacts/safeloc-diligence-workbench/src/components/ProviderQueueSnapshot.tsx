import type { ErcotQueueResult } from "@/services/ercotService";
import { formatSourceTimestamp } from "@/data/sources";

function statusLabel(status: ErcotQueueResult["status"]) {
  if (status === "live") return "Live provider data";
  if (status === "cached") return "Retained provider data";
  return "Embedded snapshot";
}

export function ProviderQueueSnapshot({ queue, dark = false }: { queue: ErcotQueueResult; dark?: boolean }) {
  const text = dark ? "text-[#c4d0d6]" : "text-[#52616b]";
  const muted = dark ? "text-[#9dafb8]" : "text-[#60707d]";
  return (
    <aside
      data-testid="shared-provider-queue-snapshot"
      className={`rounded-lg border p-4 ${dark ? "border-white/15 bg-white/5" : "border-[#cbd8d4] bg-[#f1f5f3]"}`}
    >
      <div className={`font-mono text-[9px] font-bold uppercase tracking-[0.14em] ${dark ? "text-[#d4e86b]" : "text-[#255bb7]"}`}>
        Shared ERCOT queue snapshot · {statusLabel(queue.status)}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className={`font-mono text-[9px] uppercase tracking-[0.1em] ${muted}`}>Total large-load queue</div>
          <div className={`mt-1 font-mono text-xl font-bold ${dark ? "text-white" : "text-[#122232]"}`}>{queue.stats.totalGw.toFixed(1)} GW</div>
        </div>
        <div>
          <div className={`font-mono text-[9px] uppercase tracking-[0.1em] ${muted}`}>Data-center share</div>
          <div className={`mt-1 font-mono text-xl font-bold ${dark ? "text-[#d4e86b]" : "text-[#122232]"}`}>{queue.stats.dataCenterShare.toFixed(1)}%</div>
        </div>
      </div>
      <p className={`mt-3 text-[10px] leading-4 ${text}`}>
        Source: ERCOTQueue.com · aggregate values as of {formatSourceTimestamp(queue.stats.asOfDate ?? undefined)}; source refreshed {formatSourceTimestamp(queue.stats.sourceRefreshDate ?? undefined)}; provider response {formatSourceTimestamp(queue.fetchedAt ?? undefined)}; dataset freshness {formatSourceTimestamp(queue.sourceUpdatedAt ?? undefined)}. These are aggregate queue measures, not a named project confirmation or a SafeLoc financial input.
      </p>
    </aside>
  );
}