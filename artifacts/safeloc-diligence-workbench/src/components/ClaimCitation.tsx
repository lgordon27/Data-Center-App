import { ExternalLink, FileSearch } from "lucide-react";
import {
  formatClaimDate,
  getClaimRecord,
  getClaimSources,
  type ClaimId,
  type ClaimSourceRecord,
} from "@/data/claimSources";

export function ClaimCitation({
  claimId,
  dark = false,
  className = "",
}: {
  claimId: ClaimId;
  dark?: boolean;
  className?: string;
}) {
  const claim = getClaimRecord(claimId);
  const sources = getClaimSources(claimId);
  const boundaryOnly = sources.length === 0;

  return (
    <details
      data-testid={`claim-citation-${claimId}`}
      className={`group/citation mt-2 max-w-full text-left ${className}`}
    >
      <summary
        aria-label={`Source details for ${claim.label}`}
        className={`inline-flex min-h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] [&::-webkit-details-marker]:hidden ${
          dark
            ? "border-white/20 bg-white/5 text-[#d4e86b] hover:border-[#d4e86b]"
            : boundaryOnly
              ? "border-[#f1cb8b] bg-[#fff8e9] text-[#8a6400]"
              : "border-[#aac6f4] bg-[#eef5ff] text-[#255bb7] hover:border-[#255bb7]"
        }`}
      >
        <FileSearch aria-hidden="true" className="h-3 w-3" />
        {boundaryOnly ? claim.provenance : `${sources.length} source${sources.length === 1 ? "" : "s"}`}
      </summary>
      <div
        data-testid={`claim-citation-details-${claimId}`}
        className={`mt-2 rounded-lg border p-3 normal-case tracking-normal ${
          dark ? "border-white/15 bg-[#081722] text-[#dce4e7]" : "border-[#d9e0e4] bg-white text-[#344550]"
        }`}
      >
        <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] opacity-70">
          {claim.provenance}
        </div>
        <p className="mt-1 text-[10px] leading-4">{claim.statement}</p>
        {boundaryOnly ? (
          <p data-testid={`claim-citation-boundary-${claimId}`} className="mt-2 text-[9px] font-semibold leading-4">
            No public-source link is attached by design.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {sources.map((source) => <SourceMetadata key={source.id} source={source} dark={dark} />)}
          </ol>
        )}
      </div>
    </details>
  );
}

function SourceMetadata({ source, dark }: { source: ClaimSourceRecord; dark: boolean }) {
  return (
    <li data-testid={`claim-source-${source.id}`} className={`rounded-md border p-2 ${dark ? "border-white/10 bg-white/5" : "border-[#e5eae8] bg-[#f9faf8]"}`}>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${source.title} from ${source.publisher} in a new tab`}
        className={`inline-flex items-start gap-1 text-[10px] font-semibold leading-4 underline underline-offset-2 ${dark ? "text-[#b9e1f2]" : "text-[#255bb7]"}`}
      >
        <span>{source.publisher}: {source.title}</span>
        <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
      </a>
      <dl className="mt-2 grid gap-1 font-mono text-[8px] leading-3 sm:grid-cols-2">
        <div><dt className="inline font-bold">Published: </dt><dd className="inline">{formatClaimDate(source.publishedAt)}</dd></div>
        <div><dt className="inline font-bold">Last accessed: </dt><dd className="inline">{formatClaimDate(source.accessedAt)}</dd></div>
        <div><dt className="inline font-bold">Access: </dt><dd className="inline">{source.accessStatus}</dd></div>
        <div data-testid={`claim-source-verified-${source.id}`}><dt className="inline font-bold">Last verified: </dt><dd className="inline">{formatClaimDate(source.lastVerifiedAt)}</dd></div>
      </dl>
      <p className="mt-2 text-[9px] leading-4 opacity-80">{source.qualifier}</p>
    </li>
  );
}