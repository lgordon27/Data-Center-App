import { createHash } from "node:crypto";
import { createRedOakClaimTrace } from "./redOakClaimTrace.mjs";

// Observational only: never changes admission, scheduling, passages or claims.
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === "vertexaisearch.cloud.google.com") {
      url.pathname = `/grounding-api-redirect/redacted-${createHash("sha256").update(url.pathname).digest("hex").slice(0, 16)}`;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|secret|signature|^sig$|auth|credential|password|api.?key|session|jwt)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.href;
  } catch { return null; }
}

function safeText(value, limit = 20_000) {
  return typeof value === "string" ? value
    .replace(/https?:\/\/\S+/gi, (url) => safeUrl(url) ?? "[redacted-url]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|AIza)[-_A-Za-z0-9]{12,}\b/g, "[redacted-key]")
    .replace(/\b(api[_ -]?key|authorization|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-address]")
    .slice(0, limit) : null;
}

function sourceSnapshot(source = {}) {
  return {
    url: safeUrl(source.url),
    canonicalUrl: safeUrl(source.canonicalUrl),
    resolvedUrl: safeUrl(source.resolvedUrl),
    discoveryRank: source.discoveryCandidateRank ?? null,
    acquisitionRank: source.acquisitionRank ?? null,
    acquisitionPriority: source.acquisitionPriority ?? null,
    acquisitionReasons: (source.acquisitionReasons ?? []).map((reason) => safeText(reason, 240)),
    sourceFamily: source.sourceFamily ?? "unavailable",
    title: safeText(source.title, 300),
    categoryIds: source.categoryIds ?? [],
    originatingQuery: safeText(source.discoveryOriginatingQuery, 500),
    queryAttributionStatus: source.discoveryQueryAttributionStatus ?? "unavailable",
    specificity: source.projectSpecificityState ?? "unavailable",
    publishedAt: source.publishedAt ?? source.date ?? null,
    publicationDateBasis: source.publicationDateBasis ?? null,
    facilityScope: source.facilityScope ?? null,
    phaseScope: source.phaseScope ?? null,
    retainedPassageOutcome: source.retainedPassageOutcome ?? null,
  };
}

function passageSnapshot(passage) {
  const text = typeof passage === "string" ? passage : "";
  return {
    passageSha256: text ? createHash("sha256").update(text).digest("hex") : null,
    passageLength: text.length,
    passage: safeText(text),
    passageTruncated: text.length > 20_000,
  };
}

export function createResearchFunnelDiagnostics() {
  const candidates = [];
  const authorizations = [];
  const receipts = [];
  const packets = [];
  const engineFailures = [];
  const trace = createRedOakClaimTrace();
  let observedCandidates = 0;
  let observedReceipts = 0;
  const originalPacket = trace.recordAnalysisPacket.bind(trace);
  trace.recordAnalysisPacket = (details = {}) => {
    originalPacket(details);
    if (details.packet === undefined) {
      const batch = [...packets].reverse().find((item) => item.categoryId === details.categoryId
        && item.attemptType === (details.attemptType ?? "primary") && !item.providerResponseId);
      if (batch) batch.providerResponseId = details.providerResponseId ?? null;
      return;
    }
    if (packets.length >= 16) return;
    packets.push({
      categoryId: details.categoryId,
      attemptType: details.attemptType ?? "primary",
      providerResponseId: details.providerResponseId ?? null,
      state: "issued-to-provider",
      passages: (Array.isArray(details.packet) ? details.packet : []).slice(0, 80).map((source, packetIndex) => ({
        packetIndex,
        ...sourceSnapshot({ ...source, url: source.sourceUrl ?? source.canonicalUrl }),
        ...passageSnapshot(source.passage),
      })),
    });
  };
  return {
    claimTrace: trace,
    collector: {
      recordEngineFailure({ categoryId, stage, error } = {}) {
        if (engineFailures.length >= 8) return;
        engineFailures.push({
          categoryId: categoryId ?? null,
          stage: stage ?? "category-orchestration",
          errorName: safeText(error?.name, 100),
          errorMessage: safeText(error?.message, 500),
        });
      },
      recordDiscoveryCandidates(values = []) {
        observedCandidates += values.length;
        candidates.push(...values.slice(0, Math.max(0, 80 - candidates.length)).map(sourceSnapshot));
      },
      recordPhysicalOpenAuthorization(details = {}) {
        if (authorizations.length < 24) authorizations.push({
          categoryId: details.categoryId ?? null,
          physicalOpenIndex: details.physicalOpenIndex,
          source: sourceSnapshot(details.source),
          selectionReason: "physical-open-authorized",
        });
      },
      recordPhysicalReceipt(details = {}) {
        observedReceipts += 1;
        if (receipts.length >= 160) return;
        const outcome = details.accessOutcome ?? {};
        receipts.push({
          phase: details.phase,
          categoryId: details.categoryId ?? null,
          source: sourceSnapshot(details.candidate),
          attempted: details.attempted === true,
          reused: details.reused === true || outcome.reused === true,
          state: outcome.state ?? "unavailable",
          reason: safeText(outcome.reason, 300),
          physicalOpenIndex: outcome.physicalOpenIndex ?? null,
          physicalOpenIndexes: outcome.physicalOpenIndexes ?? [],
          contentHash: outcome.contentHash ?? null,
          extractionMethod: outcome.extractionMethod ?? null,
          extractionOutcome: outcome.extractionOutcome ?? null,
          ...passageSnapshot(outcome.passage),
        });
      },
    },
    toJSON() {
      return structuredClone({
        version: 1,
        captureMode: "request-local-observed-bounded",
        observedCandidates,
        candidatesTruncated: observedCandidates > candidates.length,
        candidates,
        authorizations,
        observedReceipts,
        receiptsTruncated: observedReceipts > receipts.length,
        receipts,
        analysisPackets: packets,
        engineFailures,
        claimTrace: trace.toJSON(),
        limitations: [
          "Extraction reports retained text; pre-extraction raw passage counts are unavailable.",
          "Unissued category analyses have no analysis packet, not a negative finding.",
          "Source metadata absent from the production packet remains unavailable.",
          "Diagnostic passages are sanitized and bounded; hashes identify original text.",
        ],
      });
    },
  };
}