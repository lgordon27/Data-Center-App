import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RESEARCH_PROJECT_MODEL,
  RESEARCH_RUN_BUDGET,
  buildResearchCategoryPlan,
  createResearchProjectRateLimiter,
  handleResearchProjectRequest,
  parseResearchProjectBody,
} from "./researchProjectProxy.mjs";
import { createResearchProjectCache } from "./researchProjectCache.mjs";
import { createProjectResearchRegistry } from "./projectResearchRegistry.mjs";
import { createRedOakClaimTrace } from "./redOakClaimTrace.mjs";
import { sourceUrlAliases } from "../src/data/sourceValidationPolicy.mjs";

const REPORT_MAX_TEXT = 1_200;
const REPORT_MAX_PASSAGE = 1_500;
const REPORT_MAX_ITEMS = 160;
export const RED_OAK_GRID_CANARY_LIMITS = Object.freeze({
  discoveryRequests: 1,
  structuredProviderCalls: 2,
  totalProviderRequests: 3,
  physicalDocumentOpens: 8,
  categoryIds: Object.freeze(["project-identity", "grid"]),
  researchTimeoutMs: 75_000,
  invocationTimeoutMs: 90_000,
});
const RED_OAK_GRID_CANARY_PROJECT = Object.freeze({
  name: "Red Oak Campus",
  location: "Red Oak, Ellis County, Texas",
  knownData: Object.freeze({
    providerId: "databank-red-oak-campus",
    aliases: Object.freeze(["Red Oak Campus", "DataBank Red Oak Campus", "DataBank Red Oak Data Center"]),
    operator: "DataBank",
    city: "Red Oak",
    county: "Ellis County",
    state: "Texas",
    capacity: 480,
  }),
});
const RED_OAK_GRID_CANARY_DISCOVERY_PROMPT = [
  "Research only exact project identity and electric grid/interconnection evidence for Red Oak Campus in Red Oak, Ellis County, Texas, operated by DataBank.",
  "You must call Google Search before answering; do not answer from memory.",
  "Use one bounded Google Search grounding request and return only discovery metadata.",
  "Limit searches to identifying the exact Red Oak Campus and project-specific grid interconnection, utility service, transmission, substation, or electric-power filings.",
  "Do not search or return tenant/counterparty, financing, construction, water, permitting/community, climate, or other categories.",
  "Do not use generated prose, snippets, or model-selected URLs as provenance. The application accepts only executed google_search_call queries and provider url_citation annotations.",
  "Never invent a URL. Prefer first-party company disclosures, utility/regulator records, public filings, and project-specific reporting.",
].join("\n");
const RED_OAK_CANARY_REQUIRED_GATE_FIELDS = Object.freeze([
  "offlineSuite",
  "standaloneDataMjs",
  "typecheck",
  "productionBuild",
]);
const ACCEPTANCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(ACCEPTANCE_DIR, "../../..");

export function getRedOakCanarySourceIdentity() {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  }).trim();
  const diff = execFileSync("git", ["diff", "--binary", "HEAD", "--"], {
    cwd: REPOSITORY_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  const untrackedPaths = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  }).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256").update("red-oak-source-v1\0").update(revision).update("\0").update(diff);
  for (const relativePath of untrackedPaths) {
    hash.update("\0").update(relativePath).update("\0");
    hash.update(readFileSync(path.join(REPOSITORY_ROOT, relativePath)));
  }
  return { sourceRevision: revision, sourceHash: hash.digest("hex") };
}

export function createRedOakCanaryResources(directory) {
  return {
    cache: createResearchProjectCache({ directory: path.join(directory, "cache") }),
    registry: createProjectResearchRegistry({ directory: path.join(directory, "registry") }),
    storageMode: "isolated-temporary-cache-and-registry",
  };
}

export function buildRedOakGridCanaryRequestOptions({
  apiKey,
  googleApiKey,
  cache,
  registry,
  auditRepository,
  rateLimiter,
  claimTrace,
  canaryDiagnosticCollector,
  signal,
} = {}) {
  return {
    singleShotRun: true,
    apiKey,
    googleApiKey,
    categoryIds: [...RED_OAK_GRID_CANARY_LIMITS.categoryIds],
    googleDiscoveryPrompt: RED_OAK_GRID_CANARY_DISCOVERY_PROMPT,
    allowGoogleFallback: false,
    allowCorrectiveRetries: false,
    allowProviderRetries: false,
    useDefaultSecConnector: false,
    researchBudgetOverrides: {
      maxProviderRequests: RED_OAK_GRID_CANARY_LIMITS.totalProviderRequests,
      maxPhysicalDocumentOpens: RED_OAK_GRID_CANARY_LIMITS.physicalDocumentOpens,
      maxFollowUps: 0,
      maxFollowUpsPerCategory: 0,
      maxCandidatesPerCategory: 8,
      maxTotalCandidates: 16,
    },
    researchTimeoutMs: RED_OAK_GRID_CANARY_LIMITS.researchTimeoutMs,
    cache,
    registry,
    auditRepository,
    rateLimiter,
    claimTrace,
    canaryDiagnosticCollector,
    signal,
  };
}

function boundedText(value, maxLength = REPORT_MAX_TEXT) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
}

function safeReportText(value, maxLength = REPORT_MAX_TEXT) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim()
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|AIza)[-_A-Za-z0-9]{12,}\b/g, "[redacted-key]")
    .replace(/\b(api[_ -]?key|authorization|access[_ -]?token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, maxLength);
}

function boundedList(values, mapper = (value) => value, maxItems = REPORT_MAX_ITEMS) {
  if (!Array.isArray(values)) return [];
  return values.map(mapper).filter((value) => value !== null && value !== undefined).slice(0, maxItems);
}

function reportUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:token|secret|signature|^sig$|auth|credential|password|api[_-]?key|session|jwt)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.href.slice(0, REPORT_MAX_TEXT);
  } catch {
    return null;
  }
}

function reportDomain(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const hostname = value.includes("://") ? new URL(value).hostname : value.trim().split("/")[0];
    return hostname.toLowerCase().replace(/^\.+|\.+$/g, "").slice(0, 160) || null;
  } catch {
    return null;
  }
}

function canaryDiagnosticUrl(value) {
  const reported = reportUrl(value);
  if (!reported) return null;
  try {
    const url = new URL(reported);
    if (url.hostname.toLowerCase() === "vertexaisearch.cloud.google.com"
      && /^\/grounding-api-redirect\//i.test(url.pathname)) {
      url.pathname = "/grounding-api-redirect/[redacted]";
    }
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`.slice(0, REPORT_MAX_TEXT);
  } catch {
    return null;
  }
}

function diagnosticCandidateSnapshot(source, candidateIndex, categoryId = null) {
  if (!source || typeof source !== "object") return null;
  const rank = Number.isInteger(source.discoveryCandidateRank)
    ? source.discoveryCandidateRank
    : Number.isInteger(candidateIndex) ? candidateIndex : null;
  return {
    candidateId: rank === null ? null : `discovery-${rank}`,
    candidateIndex: rank,
    categoryId: boundedText(categoryId ?? source.searchDomain, 120),
    url: canaryDiagnosticUrl(source.url),
    originalUrl: canaryDiagnosticUrl(source.originalUrl),
    canonicalUrl: canaryDiagnosticUrl(source.canonicalUrl),
    resolvedUrl: canaryDiagnosticUrl(source.resolvedUrl),
    title: safeReportText(source.title, 240),
    sourceChannel: boundedText(source.sourceChannel ?? source.origin, 120),
    searchDomain: boundedText(source.searchDomain, 120),
    categoryIds: boundedList(source.categoryIds, (value) => boundedText(value, 120), 12),
    sourceState: boundedText(source.sourceState, 100),
    exactProject: source.exactProject === true,
  };
}

export function createRedOakCanaryDiagnosticCollector({
  maxDiscoveryCandidates = 16,
  maxPhysicalReceipts = 64,
} = {}) {
  const discoveryCandidates = [];
  const physicalOpenAuthorizations = [];
  const physicalReceipts = [];
  let discoveryCandidateCount = 0;
  let physicalReceiptCount = 0;

  return {
    recordDiscoveryCandidates(candidates = []) {
      const values = Array.isArray(candidates) ? candidates : [];
      discoveryCandidateCount = values.length;
      for (const [index, candidate] of values.slice(0, maxDiscoveryCandidates).entries()) {
        discoveryCandidates.push(diagnosticCandidateSnapshot(candidate, index + 1));
      }
    },

    recordPhysicalOpenAuthorization({
      categoryId = null,
      source,
      canonicalUrl,
      physicalOpenIndex = null,
    } = {}) {
      if (!Number.isInteger(physicalOpenIndex) || physicalOpenAuthorizations.length >= maxPhysicalReceipts) return;
      physicalOpenAuthorizations.push({
        physicalOpenIndex,
        categoryId: boundedText(categoryId, 120),
        source: diagnosticCandidateSnapshot(
          source ?? { url: canonicalUrl, canonicalUrl },
          source?.discoveryCandidateRank ?? null,
          categoryId,
        ),
      });
    },

    recordPhysicalReceipt({
      phase,
      candidateIndex = null,
      categoryId = null,
      candidate,
      accessOutcome,
      attempted = false,
      reused = false,
    } = {}) {
      physicalReceiptCount += 1;
      if (physicalReceipts.length >= maxPhysicalReceipts) return;
      const passage = typeof accessOutcome?.passage === "string" ? accessOutcome.passage : "";
      const physicalOpenIndexes = [
        ...(Array.isArray(accessOutcome?.physicalOpenIndexes) ? accessOutcome.physicalOpenIndexes : []),
        accessOutcome?.physicalOpenIndex,
      ].filter((value, index, values) =>
        Number.isInteger(value) && values.indexOf(value) === index);
      physicalReceipts.push({
        receiptId: `receipt-${physicalReceipts.length + 1}`,
        phase: boundedText(phase, 80),
        candidate: diagnosticCandidateSnapshot(candidate, candidateIndex, categoryId),
        attempted: attempted === true,
        reused: reused === true || accessOutcome?.reused === true,
        state: boundedText(accessOutcome?.state, 80),
        reason: boundedText(accessOutcome?.reason, 160),
        physicalOpenIndexes: physicalOpenIndexes.slice(0, 4),
        originalUrl: canaryDiagnosticUrl(accessOutcome?.originalUrl ?? candidate?.originalUrl ?? candidate?.url),
        resolvedUrl: canaryDiagnosticUrl(accessOutcome?.resolvedUrl),
        canonicalUrl: canaryDiagnosticUrl(accessOutcome?.canonicalUrl),
        underlyingDocumentUrl: canaryDiagnosticUrl(accessOutcome?.underlyingDocumentUrl),
        referringUrls: boundedList(accessOutcome?.referringUrls, canaryDiagnosticUrl, 8),
        contentHash: boundedText(accessOutcome?.contentHash, 80),
        passageSha256: passage.trim() ? createHash("sha256").update(passage).digest("hex") : null,
        passageLength: passage ? passage.length : 0,
        extractionMethod: boundedText(accessOutcome?.extractionMethod, 100),
        extractionOutcome: boundedText(accessOutcome?.extractionOutcome, 100),
        transportDiagnostic: reportTransportDiagnostic(accessOutcome?.transportDiagnostic),
      });
    },

    toJSON() {
      return {
        captureStatus: "request-local-sanitized-no-document-payloads",
        discoveryCandidateCount,
        discoveryCandidateSnapshotCount: discoveryCandidates.length,
        discoveryCandidatesTruncated: discoveryCandidateCount > discoveryCandidates.length,
        discoveryCandidates: structuredClone(discoveryCandidates),
        physicalOpenAuthorizationCount: physicalOpenAuthorizations.length,
        physicalOpenAuthorizations: structuredClone(physicalOpenAuthorizations),
        physicalReceiptObservedCount: physicalReceiptCount,
        physicalReceiptCount: physicalReceipts.length,
        physicalReceiptsTruncated: physicalReceiptCount > physicalReceipts.length,
        physicalReceipts: structuredClone(physicalReceipts),
      };
    },
  };
}

function reportScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return safeReportText(value, 240);
}

function reportTransportDiagnostic(value) {
  if (!value || typeof value !== "object") return null;
  const addressValidationTelemetry = value.addressValidationTelemetry
    && typeof value.addressValidationTelemetry === "object"
    ? {
      answerCount: Number.isInteger(value.addressValidationTelemetry.answerCount)
        ? Math.max(0, value.addressValidationTelemetry.answerCount)
        : null,
      addressFamilies: boundedList(value.addressValidationTelemetry.addressFamilies,
        (family) => family === 4 || family === 6 ? family : null, 2),
      addressFamilyCounts: {
        ipv4: Number.isInteger(value.addressValidationTelemetry.addressFamilyCounts?.ipv4)
          ? Math.max(0, value.addressValidationTelemetry.addressFamilyCounts.ipv4)
          : null,
        ipv6: Number.isInteger(value.addressValidationTelemetry.addressFamilyCounts?.ipv6)
          ? Math.max(0, value.addressValidationTelemetry.addressFamilyCounts.ipv6)
          : null,
        other: Number.isInteger(value.addressValidationTelemetry.addressFamilyCounts?.other)
          ? Math.max(0, value.addressValidationTelemetry.addressFamilyCounts.other)
          : null,
      },
      publicAnswerCount: Number.isInteger(value.addressValidationTelemetry.publicAnswerCount)
        ? Math.max(0, value.addressValidationTelemetry.publicAnswerCount)
        : null,
      prohibitedAnswerCount: Number.isInteger(value.addressValidationTelemetry.prohibitedAnswerCount)
        ? Math.max(0, value.addressValidationTelemetry.prohibitedAnswerCount)
        : null,
      rejectingRules: boundedList(value.addressValidationTelemetry.rejectingRules,
        (rule) => typeof rule === "string" && /^[a-z0-9-]{1,80}$/.test(rule) ? rule : null, 8),
    }
    : null;
  return {
    stage: boundedText(value.stage, 80),
    responseReceived: value.responseReceived === true,
    httpStatus: Number.isInteger(value.httpStatus) ? value.httpStatus : null,
    contentType: boundedText(value.contentType, 120),
    redirectChain: boundedList(value.redirectChain, reportUrl, 8),
    addressValidationReason: boundedText(value.addressValidationReason, 120),
    addressValidationCategory: boundedText(value.addressValidationCategory, 100),
    addressValidationRule: boundedText(value.addressValidationRule, 120),
    addressValidationTelemetry,
    elapsedMs: Number.isFinite(value.elapsedMs) ? value.elapsedMs : null,
  };
}

function reportProviderDiagnostic(value) {
  if (!value || typeof value !== "object") return null;
  const rateLimitFields = value.rateLimit && typeof value.rateLimit === "object"
    ? Object.fromEntries(Object.entries({
      retryAfter: value.rateLimit.retryAfter,
      limitRequests: value.rateLimit.limitRequests,
      remainingRequests: value.rateLimit.remainingRequests,
      resetRequests: value.rateLimit.resetRequests,
      limitTokens: value.rateLimit.limitTokens,
      remainingTokens: value.rateLimit.remainingTokens,
      resetTokens: value.rateLimit.resetTokens,
    }).flatMap(([key, indicator]) => {
      const bounded = boundedText(indicator, 80);
      return bounded ? [[key, bounded]] : [];
    }))
    : null;
  const rateLimit = rateLimitFields && Object.keys(rateLimitFields).length ? rateLimitFields : null;
  return {
    upstreamStatus: Number.isInteger(value.upstreamStatus) ? value.upstreamStatus
      : Number.isInteger(value.status) ? value.status : null,
    errorCode: boundedText(value.errorCode, 120),
    errorType: boundedText(value.errorType, 120),
    message: safeReportText(value.message, 500),
    requestId: boundedText(value.requestId, 160),
    rateLimit,
  };
}

function reportDiscoveryTelemetry(result) {
  const coverage = result?.researchCoverage;
  return {
    provider: boundedText(coverage?.discoveryProvider, 120),
    model: boundedText(coverage?.discoveryModel, 120),
    status: boundedText(coverage?.discoveryStatus, 100),
    state: boundedText(coverage?.discoveryState, 120),
    queries: boundedList(coverage?.discoveryQueries, (value) => boundedText(value, REPORT_MAX_TEXT), 24),
    candidateCount: Number.isInteger(coverage?.discoveryCandidateCount)
      ? coverage.discoveryCandidateCount
      : null,
    fallbackProvider: boundedText(coverage?.fallbackProvider, 120),
    fallbackReason: boundedText(coverage?.fallbackReason, 180),
    fallbackRequestCount: Number.isInteger(coverage?.fallbackRequestCount)
      ? coverage.fallbackRequestCount
      : 0,
    providerRequestCount: Number.isInteger(coverage?.providerRequestCount)
      ? coverage.providerRequestCount
      : null,
    rawAnnotationSummaries: boundedList(coverage?.discoveryRawAnnotationSummaries, (annotation) => ({
      type: boundedText(annotation?.type, 80),
      title: boundedText(annotation?.title, 240),
      url: reportUrl(annotation?.url),
      canonicalUrl: reportUrl(annotation?.canonicalUrl),
      accepted: annotation?.accepted === true,
      rejectionReason: boundedText(annotation?.rejectionReason, 120),
    }), 80),
    acceptedCitationUrls: boundedList(coverage?.discoveryAcceptedCitationUrls, reportUrl, 80),
    rejectedCitationUrls: boundedList(coverage?.discoveryRejectedCitationUrls, (entry) => ({
      url: reportUrl(entry?.url),
      reason: boundedText(entry?.reason, 120),
    }), 80),
  };
}

function reportCandidateLineage(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    categoryId: boundedText(entry.categoryId, 120),
    url: reportUrl(entry.url),
    sourceChannel: boundedText(entry.sourceChannel, 120),
    acquisitionPath: entry.acquisitionPath && typeof entry.acquisitionPath === "object"
      ? Object.fromEntries(Object.entries(entry.acquisitionPath).slice(0, 8).map(([key, value]) => [boundedText(key, 80), reportScalar(value)]))
      : null,
    accessOutcome: entry.accessOutcome && typeof entry.accessOutcome === "object"
      ? {
        state: boundedText(entry.accessOutcome.state, 80),
        reason: boundedText(entry.accessOutcome.reason, 240),
        physicalOpenIndex: Number.isInteger(entry.accessOutcome.physicalOpenIndex) ? entry.accessOutcome.physicalOpenIndex : null,
        reused: entry.accessOutcome.reused === true,
      }
      : null,
    identityResult: entry.identityResult && typeof entry.identityResult === "object"
      ? {
        exactProject: entry.identityResult.exactProject === true,
        state: boundedText(entry.identityResult.state, 120),
      }
      : null,
    passageResult: entry.passageResult && typeof entry.passageResult === "object"
      ? {
        state: boundedText(entry.passageResult.state, 80),
        reason: boundedText(entry.passageResult.reason, 240),
        passageSha256: boundedText(entry.passageResult.passageSha256, 80),
      }
      : null,
    eligibilityResult: entry.eligibilityResult && typeof entry.eligibilityResult === "object"
      ? {
        state: boundedText(entry.eligibilityResult.state, 80),
        rejectionReasons: boundedList(entry.eligibilityResult.rejectionReasons, (value) => boundedText(value, 240), 16),
      }
      : null,
    rejectionReason: boundedText(entry.rejectionReason, 500),
  };
}

function reportAccessOutcome(source) {
  const access = source?.accessOutcome;
  if (!access || typeof access !== "object") {
    return { state: "not-attempted", attempted: false, reused: false };
  }
  const state = boundedText(access.state, 80) ?? "unknown";
  return {
    state,
    attempted: state !== "not-attempted" && access.attempted !== false,
    succeeded: state === "accessible",
    blocked: ["blocked", "rejected"].includes(state),
    failed: ["failed", "error", "network-failure"].includes(state)
      || ["network-failure", "http-error", "timeout"].includes(access.reason),
    reused: source?.documentAccessReused === true,
    reason: boundedText(access.reason, 160),
    physicalOpenIndex: Number.isInteger(access.physicalOpenIndex) ? access.physicalOpenIndex : null,
    retrievalTime: boundedText(access.retrievalTime, 80),
    originalUrl: reportUrl(access.originalUrl ?? source?.originalUrl),
    resolvedUrl: reportUrl(access.resolvedUrl ?? source?.resolvedUrl),
    canonicalUrl: reportUrl(access.canonicalUrl ?? source?.canonicalUrl),
    contentHash: boundedText(access.contentHash, 80),
    extractionMethod: boundedText(access.extractionMethod, 100),
    extractionOutcome: boundedText(access.extractionOutcome, 100),
    underlyingDocumentUrl: reportUrl(access.underlyingDocumentUrl),
    referringUrls: boundedList(
      access.referringUrls ?? source?.documentReferringUrls ?? source?.referringUrls,
      reportUrl,
      12,
    ),
    transportDiagnostic: reportTransportDiagnostic(access.transportDiagnostic),
  };
}

function sourceDiagnostics(result) {
  const sources = Array.isArray(result?.sourceLedger) ? result.sourceLedger : [];
  const normalizedCandidates = sources.map((source) => {
    const accessOutcome = reportAccessOutcome(source);
    return {
      url: reportUrl(source.url),
      originalUrl: reportUrl(source.originalUrl),
      resolvedUrl: reportUrl(source.resolvedUrl),
      canonicalUrl: reportUrl(source.canonicalUrl),
      title: boundedText(source.title, 240),
      sourceChannel: boundedText(source.sourceChannel ?? source.origin, 120),
      returnedDomain: reportDomain(source.url ?? source.resolvedUrl ?? source.canonicalUrl),
      searchDomain: boundedText(source.searchDomain, 120),
      categoryIds: boundedList(
        source.categoryIds ?? source.categories ?? (source.searchDomain ? [source.searchDomain] : []),
        (value) => boundedText(value, 120),
        12,
      ),
      identityRole: boundedText(source.identityRole ?? source.sourceRole, 160),
      sourceState: boundedText(source.sourceState, 100),
      exactProject: source.exactProject === true,
      claimSupportState: boundedText(source.claimSupportState, 100),
      projectSpecificityState: boundedText(source.projectSpecificityState, 100),
      financialEligibilityState: boundedText(source.financialEligibilityState, 100),
      sourceType: boundedText(source.sourceType, 120),
      extractionMethod: boundedText(source.extractionMethod ?? source.accessOutcome?.extractionMethod, 100),
      extractionOutcome: boundedText(source.extractionOutcome ?? source.accessOutcome?.extractionOutcome, 100),
      contentHash: boundedText(source.contentHash ?? source.accessOutcome?.contentHash, 80),
      passageSha256: typeof source.accessOutcome?.passage === "string" && source.accessOutcome.passage.trim()
        ? createHash("sha256").update(source.accessOutcome.passage).digest("hex")
        : null,
      referringUrls: boundedList(
        source.documentReferringUrls ?? source.referringUrls,
        reportUrl,
        12,
      ),
      accessState: accessOutcome.state,
      accessReason: accessOutcome.reason ?? null,
      transportDiagnostic: accessOutcome.transportDiagnostic,
      accessOutcome,
    };
  });
  const retainedPassages = sources.flatMap((source) => {
    const passage = source.accessOutcome?.passage ?? source.claimPassage ?? null;
    if (source.accessOutcome?.state !== "accessible" || typeof passage !== "string" || !passage.trim()) return [];
    return [{
      url: reportUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url),
      title: boundedText(source.title, 240),
      searchDomain: boundedText(source.searchDomain, 120),
      text: safeReportText(passage, REPORT_MAX_PASSAGE),
      passage: safeReportText(passage, REPORT_MAX_PASSAGE),
      truncated: passage.trim().length > REPORT_MAX_PASSAGE,
    }];
  });
  return {
    total: sources.length,
    bySourceState: countBy(sources, "sourceState"),
    byAccessOutcome: countBy(
      sources.map((source) => ({ state: source.accessOutcome?.state })),
      "state",
    ),
    byClaimSupportState: countBy(sources, "claimSupportState"),
    byProjectSpecificityState: countBy(sources, "projectSpecificityState"),
    returnedDomains: [...new Set(normalizedCandidates.map((source) => source.returnedDomain).filter(Boolean))].slice(0, REPORT_MAX_ITEMS),
    normalizedCandidates: normalizedCandidates.slice(0, REPORT_MAX_ITEMS),
    sources: normalizedCandidates.slice(0, REPORT_MAX_ITEMS),
    retainedPassages: retainedPassages.slice(0, REPORT_MAX_ITEMS),
  };
}

function responseRecorder() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: "",
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body ?? "";
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

async function runRequest(project, options = {}) {
  const { singleShotRun = false, ...requestOptions } = options;
  const response = responseRecorder();
  await handleResearchProjectRequest(
    {
      method: "POST",
      body: project,
      ip: "live-acceptance-run",
      ...(singleShotRun ? { headers: { "x-safeloc-research-policy": "single-shot" } } : {}),
    },
    response,
    requestOptions,
  );
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    payload: response.json(),
  };
}

function parseCategoryIds(rawValue) {
  if (!rawValue) return undefined;
  const categoryIds = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
  return categoryIds.length ? categoryIds : undefined;
}

function countBy(items, key) {
  return Object.fromEntries(
    [...new Set(items.map((item) => item?.[key]).filter(Boolean))]
      .sort()
      .map((value) => [value, items.filter((item) => item?.[key] === value).length]),
  );
}

function collectLimitations(audit) {
  return [
    ...(Array.isArray(audit?.providerLimitations) ? audit.providerLimitations : []),
    ...(Array.isArray(audit?.categories)
      ? audit.categories.flatMap((category) => category.accessLimitations ?? [])
      : []),
  ].filter((value, index, values) => typeof value === "string" && value.trim() && values.indexOf(value) === index)
    .map((value) => boundedText(value, REPORT_MAX_TEXT))
    .filter(Boolean);
}

function categorySourceIds(category) {
  return new Set([
    category?.categoryId,
    ...(Array.isArray(category?.evidenceIds) ? category.evidenceIds : []),
  ].filter(Boolean));
}

function categoryForEvidence(categories, evidenceId) {
  return categories.find((category) => categorySourceIds(category).has(evidenceId)) ?? null;
}

function reportEvidence(result, categories) {
  return boundedList(result?.evidence, (item) => {
    const mappings = Array.isArray(item?.claimMappings)
      ? item.claimMappings
      : item?.sourceValidation?.claimMappings;
    return {
      evidenceId: boundedText(item?.id, 120),
      label: boundedText(item?.label, 240),
      categoryId: categoryForEvidence(categories, item?.id)?.categoryId ?? null,
      rawValue: reportScalar(item?.rawValue ?? item?.value ?? item?.qualitativeValue),
      normalizedValue: reportScalar(item?.normalizedValue ?? item?.numericValue),
      rawUnit: boundedText(item?.rawUnit ?? item?.unit, 120),
      normalizedUnit: boundedText(item?.normalizedUnit ?? item?.unit, 120),
      classification: boundedText(item?.classification, 100),
      claimTimePeriod: boundedText(item?.claimTimePeriod ?? item?.timePeriod, 160),
      facilityScope: boundedText(item?.facilityScope, 100),
      phaseScope: boundedText(item?.phaseScope, 100),
      researchState: boundedText(item?.researchState, 100),
      sourceRelevance: boundedText(item?.sourceRelevance, 100),
      sourceSupportConfidence: Number.isFinite(item?.sourceSupportConfidence)
        ? item.sourceSupportConfidence
        : null,
      mappings: boundedList(mappings, (mapping) => ({
        sourceId: reportUrl(mapping?.sourceId),
        passageId: boundedText(mapping?.passageId, 160),
        variable: boundedText(mapping?.variable, 120),
        supportStatus: boundedText(mapping?.supportStatus, 100),
        entityScope: boundedText(mapping?.entityScope, 100),
        facilityScope: boundedText(mapping?.facilityScope, 100),
        phaseScope: boundedText(mapping?.phaseScope, 100),
        timePeriod: boundedText(mapping?.timePeriod, 160),
        exactQuotation: safeReportText(mapping?.exactQuotation, REPORT_MAX_PASSAGE),
        rejectionCodes: boundedList(mapping?.rejectionCodes, (value) => boundedText(value, 180), 16),
      }), 24),
      eligibilityDecision: {
        eligibleForModel: item?.eligibleForModel === true,
        acceptedForModel: item?.acceptedForModel === true,
        financialEligibilityState: boundedText(item?.financialEligibilityState, 100),
        quarantineReasons: boundedList(item?.quarantineReasons, (value) => boundedText(value, 240), 16),
        sourceValidationState: boundedText(item?.sourceValidation?.state, 120),
      },
    };
  });
}

function reportProviderAttempts(audit) {
  return boundedList(audit?.providerAttempts ?? audit?.researchCache?.providerAttempts, (attempt) => ({
    provider: boundedText(attempt?.provider, 120),
    model: boundedText(attempt?.model, 120),
    providerResponseId: boundedText(attempt?.providerResponseId, 160),
    providerResponseIdAvailability: boundedText(attempt?.providerResponseIdAvailability, 100),
    usageAvailability: boundedText(attempt?.usageAvailability, 100),
    requestCount: Number.isInteger(attempt?.requestCount) ? attempt.requestCount : null,
    categoryId: boundedText(attempt?.categoryId, 120),
    attemptType: boundedText(attempt?.attemptType, 80),
    queuedAt: boundedText(attempt?.queuedAt, 80),
    issuedAt: boundedText(attempt?.issuedAt, 80),
    finishedAt: boundedText(attempt?.finishedAt, 80),
    queueWaitMs: Number.isFinite(attempt?.queueWaitMs) ? attempt.queueWaitMs : null,
    elapsedMs: Number.isFinite(attempt?.elapsedMs) ? attempt.elapsedMs : null,
    status: Number.isInteger(attempt?.status) ? attempt.status : null,
    requestState: boundedText(attempt?.requestState, 80),
    outcome: boundedText(attempt?.outcome, 80),
    failureClassification: boundedText(attempt?.failureClassification, 100),
    inFlightAnalysisCount: Number.isInteger(attempt?.inFlightAnalysisCount)
      ? Math.max(0, attempt.inFlightAnalysisCount)
      : null,
    inFlightAnalysisCountAtIssue: Number.isInteger(attempt?.inFlightAnalysisCountAtIssue)
      ? Math.max(0, attempt.inFlightAnalysisCountAtIssue)
      : null,
    providerDiagnostic: reportProviderDiagnostic(attempt?.providerDiagnostic),
    requestedOutputTokens: Number.isFinite(attempt?.requestedOutputTokens)
      ? attempt.requestedOutputTokens
      : null,
    requestBodyBytes: Number.isFinite(attempt?.requestBodyBytes) ? attempt.requestBodyBytes : null,
    usage: attempt?.usage && typeof attempt.usage === "object"
      ? {
        inputTokens: Number.isFinite(attempt.usage.inputTokens) ? attempt.usage.inputTokens : null,
        outputTokens: Number.isFinite(attempt.usage.outputTokens) ? attempt.usage.outputTokens : null,
        totalTokens: Number.isFinite(attempt.usage.totalTokens) ? attempt.usage.totalTokens : null,
      }
      : null,
  }));
}

function reportAuthorityState(project, audit) {
  const knownData = project?.knownData ?? {};
  const authorityNames = boundedList(knownData.authorityNames, (value) => boundedText(value, 180), 16);
  const establishedDomains = [...new Set([
    ...boundedList(knownData.authorityDomains, reportDomain, 16),
    ...boundedList(audit?.searchedDomains, reportDomain, 32),
  ].filter(Boolean))].slice(0, 32);
  const missingAuthorityDomains = [...new Set(
    boundedList(audit?.categories, (category) => category, 16)
      .flatMap((category) => boundedList(category?.localAuthorities, (authority) => authority, 16))
      .filter((authority) => authority?.status === "identified-no-domain" || !reportDomain(authority?.domain))
      .map((authority) => boundedText(authority?.name, 180))
      .filter(Boolean),
  )].slice(0, 32);
  return {
    establishedDomains,
    identifiedAuthorities: authorityNames,
    missingAuthorityDomains,
    companyDomains: boundedList(knownData.companyDomains, reportDomain, 16),
  };
}

function reportVisibleFindingTrace(trace) {
  return boundedList(trace, (item) => ({
    evidenceId: boundedText(item?.evidenceId, 120),
    finding: reportScalar(item?.finding),
    sourceUrl: reportUrl(item?.sourceUrl),
    sourceTitle: boundedText(item?.sourceTitle, 240),
    searchDomain: boundedText(item?.searchDomain, 120),
    passage: safeReportText(item?.passage, REPORT_MAX_PASSAGE),
    eligibility: boundedText(item?.eligibility, 100),
    observedQueries: boundedList(item?.observedQueries, (query) => boundedText(query, REPORT_MAX_TEXT), 16),
    candidate: item?.candidate
      ? {
        url: reportUrl(item.candidate.url),
        originalUrl: reportUrl(item.candidate.originalUrl),
        resolvedUrl: reportUrl(item.candidate.resolvedUrl),
        canonicalUrl: reportUrl(item.candidate.canonicalUrl),
        title: boundedText(item.candidate.title, 240),
        sourceChannel: boundedText(item.candidate.sourceChannel ?? item.candidate.origin, 120),
        searchDomain: boundedText(item.candidate.searchDomain, 120),
        sourceState: boundedText(item.candidate.sourceState, 100),
        exactProject: item.candidate.exactProject === true,
        extractionMethod: boundedText(item.candidate.extractionMethod ?? item.candidate.accessOutcome?.extractionMethod, 100),
        extractionOutcome: boundedText(item.candidate.extractionOutcome ?? item.candidate.accessOutcome?.extractionOutcome, 100),
      }
      : null,
    physicalAccessReceipt: reportAccessOutcome({
      ...item?.candidate,
      accessOutcome: item?.physicalAccessReceipt,
      documentAccessReused: item?.physicalAccessReceipt?.reused === true,
    }),
    retainedExactProjectPassage: item?.retainedExactProjectPassage
      ? {
        sourceUrl: reportUrl(item.retainedExactProjectPassage.sourceUrl),
        text: safeReportText(item.retainedExactProjectPassage.text, REPORT_MAX_PASSAGE),
        exactProject: item.retainedExactProjectPassage.exactProject === true,
      }
      : null,
    governedEvidenceMapping: item?.governedEvidenceMapping
      ? {
        sourceId: reportUrl(item.governedEvidenceMapping.sourceId),
        passageId: boundedText(item.governedEvidenceMapping.passageId, 160),
        variable: boundedText(item.governedEvidenceMapping.variable, 120),
        supportStatus: boundedText(item.governedEvidenceMapping.supportStatus, 100),
        exactQuotation: safeReportText(item.governedEvidenceMapping.exactQuotation, REPORT_MAX_PASSAGE),
        rejectionCodes: boundedList(
          item.governedEvidenceMapping.rejectionCodes,
          (value) => boundedText(value, 180),
          16,
        ),
      }
      : null,
    eligibilityDecision: item?.eligibilityDecision
      ? {
        eligibleForModel: item.eligibilityDecision.eligibleForModel === true,
        acceptedForModel: item.eligibilityDecision.acceptedForModel === true,
        researchState: boundedText(item.eligibilityDecision.researchState, 100),
        financialEligibilityState: boundedText(item.eligibilityDecision.financialEligibilityState, 100),
        rejectionReasons: boundedList(
          item.eligibilityDecision.rejectionReasons,
          (value) => boundedText(value, 240),
          16,
        ),
        sourceValidationState: boundedText(item.eligibilityDecision.sourceValidation?.state, 120),
      }
      : null,
    visibleHandoffFinding: item?.visibleHandoffFinding
      ? {
        evidenceId: boundedText(item.visibleHandoffFinding.evidenceId, 120),
        label: boundedText(item.visibleHandoffFinding.label, 240),
        finding: reportScalar(item.visibleHandoffFinding.finding),
        unit: boundedText(item.visibleHandoffFinding.unit, 120),
        classification: boundedText(item.visibleHandoffFinding.classification, 100),
        description: safeReportText(item.visibleHandoffFinding.description, REPORT_MAX_TEXT),
        citation: boundedText(item.visibleHandoffFinding.citation, REPORT_MAX_TEXT),
      }
      : null,
  }));
}

function reportProject(project, audit) {
  const knownData = project?.knownData ?? {};
  return {
    name: boundedText(project?.name, 240),
    location: boundedText(project?.location, 240),
    directoryProvider: "Compute Atlas",
    directoryProviderId: boundedText(knownData.providerId, 180),
    aliases: boundedList(knownData.aliases, (value) => boundedText(value, 180), 16),
    operator: boundedText(knownData.operator, 180),
    status: boundedText(knownData.status, 100),
    city: boundedText(knownData.city, 120),
    county: boundedText(knownData.county, 120),
    state: boundedText(knownData.state, 100),
    sourceUrl: reportUrl(knownData.sourceUrl),
    authorities: reportAuthorityState(project, audit),
  };
}

function isFailedRetainedCacheResponse(payload) {
  return payload?.researchCache?.refreshStatus === "failed"
    && payload?.researchCache?.state === "stale";
}

function buildRetainedBudgetDiagnostics(result) {
  const audit = result?.researchAudit;
  const coverage = result?.researchCoverage;
  if (!audit && !coverage) return null;
  const categories = Array.isArray(audit?.categories) ? audit.categories : [];
  return {
    telemetryStatus: "historical-retained",
    physicalOpenBudget: audit?.physicalOpenBudget ?? coverage?.physicalOpenBudget ?? null,
    physicalOpensUsed: audit?.physicalOpensUsed ?? coverage?.physicalOpensUsed ?? null,
    physicalOpensRemaining: audit?.physicalOpensRemaining ?? coverage?.physicalOpensRemaining ?? null,
    physicalOpenBudgetExceeded: audit?.physicalOpenBudgetExceeded
      ?? coverage?.physicalOpenBudgetExceeded
      ?? false,
    categories: categories.map((category) => ({
      categoryId: category.categoryId,
      label: boundedText(category.label, 240),
      state: boundedText(category.state, 100),
      followUpSkipReason: boundedText(category.followUpSkipReason, 160),
      accessLimitations: boundedList(category.accessLimitations, (value) => boundedText(value, REPORT_MAX_TEXT), 16),
      unresolvedGaps: boundedList(category.unresolvedGaps, (value) => boundedText(value, 120), 32),
      stageCounts: category.stageCounts ?? null,
    })),
  };
}

function buildVisibleFindingTrace(result) {
  const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
  const categoryByEvidenceId = new Map(
    (Array.isArray(result?.researchAudit?.categories) ? result.researchAudit.categories : [])
      .flatMap((category) => (category.evidenceIds ?? []).map((evidenceId) => [evidenceId, category])),
  );
  return evidence.flatMap((item) => {
    if (item?.eligibleForModel !== true) return [];
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const mappings = Array.isArray(item.claimMappings)
      ? item.claimMappings
      : item.sourceValidation?.claimMappings ?? [];
    const supportedMappings = mappings.filter((mapping) =>
      mapping?.supportStatus === "supported" && typeof mapping.sourceId === "string");
    const source = sources.find((candidate) =>
      candidate?.accessOutcome?.state === "accessible"
      && candidate.exactProject === true
      && supportedMappings.some((mapping) => sourceUrlAliases(candidate).includes(mapping.sourceId)),
    );
    if (!source) return [];
    const mapping = supportedMappings.find((candidate) =>
      sourceUrlAliases(source).includes(candidate.sourceId));
    const passage = source.accessOutcome?.passage ?? source.excerpt ?? source.claimPassage;
    if (!mapping || typeof passage !== "string" || !passage.trim()) return [];
    const category = categoryByEvidenceId.get(item.id);
    const visibleFinding = {
      evidenceId: item.id ?? null,
      label: item.label ?? null,
      finding: item.value ?? item.qualitativeValue ?? null,
      unit: item.unit ?? null,
      classification: item.classification ?? null,
      description: item.description ?? null,
      citation: item.citation ?? null,
    };
    return [{
      evidenceId: item.id ?? null,
      finding: item.value ?? item.qualitativeValue ?? null,
      sourceUrl: source.canonicalUrl ?? source.resolvedUrl ?? source.url,
      sourceTitle: source.title ?? null,
      searchDomain: source.searchDomain ?? null,
      passage: passage.trim(),
      eligibility: source.financialEligibilityState ?? "eligible",
      observedQueries: [
        ...(Array.isArray(item.searchTerms) ? item.searchTerms : []),
        ...(category?.executedQueries ?? []),
      ].filter((query, index, queries) => typeof query === "string" && query.trim() && queries.indexOf(query) === index),
      candidate: {
        url: source.url ?? source.canonicalUrl ?? null,
        originalUrl: source.originalUrl ?? null,
        resolvedUrl: source.resolvedUrl ?? null,
        canonicalUrl: source.canonicalUrl ?? null,
        title: source.title ?? null,
        sourceChannel: source.sourceChannel ?? source.origin ?? null,
        searchDomain: source.searchDomain ?? null,
        sourceState: source.sourceState ?? null,
        exactProject: source.exactProject === true,
        extractionMethod: source.accessOutcome?.extractionMethod ?? null,
        extractionOutcome: source.accessOutcome?.extractionOutcome ?? null,
      },
      physicalAccessReceipt: {
        state: source.accessOutcome.state,
        reason: source.accessOutcome.reason ?? null,
        physicalOpenIndex: source.accessOutcome.physicalOpenIndex ?? null,
        reused: source.documentAccessReused === true,
        retrievalTime: source.accessOutcome.retrievalTime ?? null,
        resolvedUrl: source.accessOutcome.resolvedUrl ?? null,
        redirectChain: source.accessOutcome.redirectChain ?? [],
        transportDiagnostic: source.accessOutcome.transportDiagnostic ?? null,
      },
      retainedExactProjectPassage: {
        sourceUrl: source.canonicalUrl ?? source.resolvedUrl ?? source.url,
        text: passage.trim(),
        exactProject: source.exactProject === true,
      },
      governedEvidenceMapping: mapping,
      eligibilityDecision: {
        eligibleForModel: item.eligibleForModel === true,
        acceptedForModel: item.acceptedForModel === true,
        researchState: item.researchState ?? null,
        financialEligibilityState: source.financialEligibilityState ?? null,
        rejectionReasons: item.quarantineReasons ?? [],
        sourceValidation: item.sourceValidation ?? null,
      },
      visibleHandoffFinding: visibleFinding,
    }];
  });
}

export function buildAcceptanceReport({ project, liveRun, failureRun, generatedAt = new Date().toISOString() }) {
  const result = liveRun.payload;
  const retainedCacheResponse = isFailedRetainedCacheResponse(result);
  const audit = retainedCacheResponse ? null : result?.researchAudit ?? null;
  const retainedHistoricalAudit = retainedCacheResponse ? result?.researchAudit ?? null : null;
  const categoryPlans = buildResearchCategoryPlan(project).categories;
  const categoryPlanById = new Map(categoryPlans.map((category) => [category.categoryId, category]));
  // Category-scoped acceptance runs may return a sparse audit. Merge by the
  // stable category ID, never by the position in the eight-category plan.
  const categories = Array.isArray(audit?.categories)
    ? audit.categories.map((category) => ({
      ...(categoryPlanById.get(category.categoryId) ?? {}),
      ...category,
    }))
    : categoryPlans.map((category) => ({
      ...category,
      state: "Provider failure",
      executedQueries: [],
      followUpExecutedQuery: null,
      unresolvedGaps: category.evidenceIds.length ? category.evidenceIds : [category.categoryId],
      accessLimitations: [],
      providerFailure: result?.errorType ?? "Provider audit was unavailable.",
      stageCounts: null,
    }));
  const reportCategories = categories.length ? categories : categoryPlans;
  const source = sourceDiagnostics(audit ? result : null);
  const categoryGaps = Array.isArray(audit?.categoryGaps)
    ? audit.categoryGaps
    : categories.filter((category) => category.state !== "Complete").map((category) => category.categoryId);
  const elapsedMs = audit?.elapsedMs ?? liveRun.durationMs ?? null;
  const budget = audit?.budget ?? RESEARCH_RUN_BUDGET;
  const categoryCandidateCounts = Object.fromEntries(
    reportCategories.map((category) => [
      category.categoryId,
      category.stageCounts?.retainedCandidates ?? 0,
    ]),
  );
  const totalCandidateCount = Object.values(categoryCandidateCounts).reduce((sum, count) => sum + count, 0);
  const failurePayload = failureRun?.payload ?? null;
  const failureCache = failurePayload?.researchCache ?? null;
  const retainedBudgetDiagnostics = retainedCacheResponse
    ? buildRetainedBudgetDiagnostics(result)
    : null;
  const failureRetainedBudgetDiagnostics = isFailedRetainedCacheResponse(failurePayload)
    ? buildRetainedBudgetDiagnostics(failurePayload)
    : null;
  const usefulCompletion = source.retainedPassages.length > 0 || (result?.eligibleEvidenceCount ?? 0) > 0;
  const visibleFindingTrace = reportVisibleFindingTrace(buildVisibleFindingTrace(result));
  const evidence = reportEvidence(result, reportCategories);
  const unresolvedIdentifiers = [...new Set([
    ...categoryGaps,
    ...reportCategories.flatMap((category) => category.unresolvedGaps ?? []),
    ...evidence.filter((item) => item.eligibilityDecision.eligibleForModel !== true)
      .map((item) => item.evidenceId)
      .filter(Boolean),
  ])].slice(0, REPORT_MAX_ITEMS);
  const observedSearches = reportCategories.flatMap((category) =>
    boundedList(category.executedQueries, (query) => boundedText(query, REPORT_MAX_TEXT), 16)
      .map((query) => ({
        categoryId: boundedText(category.categoryId, 120),
        query,
      })),
  ).slice(0, REPORT_MAX_ITEMS);
  const cacheState = result?.researchCache
    ? {
      state: boundedText(result.researchCache.state, 80),
      refreshStatus: boundedText(result.researchCache.refreshStatus, 80),
      providerAvailable: result.researchCache.providerAvailable ?? null,
      storedAt: boundedText(result.researchCache.storedAt, 80),
      keyPresent: typeof result.researchCache.key === "string" && result.researchCache.key.length > 0,
      telemetryStatus: retainedCacheResponse ? "historical-retained" : "current-live",
    }
    : { state: null, refreshStatus: null, providerAvailable: null, storedAt: null, keyPresent: false, telemetryStatus: "current-live" };
  const eligibleEvidenceCount = evidence.filter((item) => item.eligibilityDecision.eligibleForModel).length;
  const proposedCount = Array.isArray(result?.proposedInputs)
    ? result.proposedInputs.length
    : eligibleEvidenceCount;
  const acceptedCount = Array.isArray(result?.acceptedModelInputs) ? result.acceptedModelInputs.length : 0;
  const legacyTechnicalBlocker = retainedCacheResponse
    || liveRun.statusCode < 200
    || liveRun.statusCode >= 300
    || ["partial", "timed-out", "failed", "cancelled"].includes(result?.researchStatus)
    || reportCategories.some((category) =>
      ["Provider failure", "Timed out", "Not searched"].includes(category.state)
      || (category.accessLimitations ?? []).length > 0
      || ["physical-open-budget", "tool-call-budget", "provider-request-budget", "deadline", "provider-failure"].includes(category.followUpSkipReason))
    || source.normalizedCandidates.some((candidate) =>
      candidate.accessOutcome?.state && candidate.accessOutcome.state !== "accessible");
  const canonicalOutcome = result?.researchOutcome?.state
    ?? audit?.terminalState
    ?? (legacyTechnicalBlocker
      ? "incomplete-technical-limitation"
      : visibleFindingTrace.length
        ? "complete-with-eligible-evidence"
        : "complete-no-eligible-evidence");
  const terminalStatus = retainedCacheResponse || liveRun.statusCode < 200 || liveRun.statusCode >= 300
    ? "incomplete-technical-limitation"
    : canonicalOutcome ?? "incomplete-technical-limitation";
  const liveAcceptance = canonicalOutcome === "complete-with-eligible-evidence" && visibleFindingTrace.length
    ? {
      status: "Research complete — eligible evidence found",
      trace: visibleFindingTrace,
    }
    : canonicalOutcome === "complete-no-eligible-evidence"
      ? {
        status: "Research complete — no eligible evidence found",
        reason: "All required discovery completed without a technical blocker; no source reached governed eligibility.",
        trace: [],
      }
      : {
        status: "Research incomplete — technical limitation",
        reason: "A provider, access, timeout, or governed budget limitation prevented conclusive evaluation.",
        trace: visibleFindingTrace,
      };

  return {
    diagnosticOnly: true,
    evidenceStatus: "not-evidence",
    liveAcceptance,
    generatedAt,
    project: reportProject(project, audit),
    run: {
      status: terminalStatus,
      telemetryStatus: retainedCacheResponse ? "historical-retained" : "current-live",
      runId: audit?.runCorrelationId ?? null,
      researchStatus: result?.researchStatus ?? null,
      researchOutcome: canonicalOutcome,
      httpStatus: liveRun.statusCode,
      provider: audit?.provider ?? "openai",
      model: audit?.model ?? RESEARCH_PROJECT_MODEL,
      discovery: reportDiscoveryTelemetry(result),
       providerResponseIds: boundedList(audit?.providerResponseIds, (value) => boundedText(value, 180), 32),
      startedAt: audit?.startedAt ?? null,
      finishedAt: audit?.finishedAt ?? null,
      elapsedMs,
      wallClockElapsedMs: liveRun.durationMs ?? null,
      phaseTiming: audit?.phaseTiming ?? null,
      failureType: result?.errorType ?? result?.researchCache?.errorType ?? (retainedCacheResponse ? "retained-cache" : null),
      failureMessage: safeReportText(result?.error
        ?? (retainedCacheResponse ? "Live refresh failed; the response contains retained cached research." : null),
      ),
       providerDiagnostic: reportProviderDiagnostic(
         result?.providerDiagnostic ?? result?.researchCache?.providerDiagnostic,
       ),
      elapsedWithinDeadline: typeof elapsedMs === "number" && elapsedMs <= budget.deadlineMs,
      providerRequestCount: audit?.providerRequestCount ?? null,
       providerAttempts: reportProviderAttempts(audit ?? result),
       inFlightAnalysisCount: Number.isInteger(
         result?.inFlightAnalysisCount
           ?? result?.researchCache?.inFlightAnalysisCount
           ?? audit?.inFlightAnalysisCount,
       )
         ? Math.max(0,
           result?.inFlightAnalysisCount
             ?? result?.researchCache?.inFlightAnalysisCount
             ?? audit?.inFlightAnalysisCount)
         : null,
      toolCallCount: audit?.toolCallCount ?? null,
       followUpCount: reportCategories.filter((category) => category.followUpExecutedQuery).length,
      budget,
      limitsObserved: {
        providerRequestsWithinLimit: audit ? audit.providerRequestCount <= budget.maxProviderRequests : null,
        followUpsWithinLimit: audit
          ? reportCategories.filter((category) => category.followUpExecutedQuery).length <= budget.maxFollowUps
          : null,
        toolCallsWithinLimit: audit ? audit.toolCallCount <= budget.maxToolCalls : null,
        candidatesWithinTotalLimit: audit ? totalCandidateCount <= budget.maxTotalCandidates : null,
        candidatesByCategory: categoryCandidateCounts,
        candidateCategoryLimit: budget.maxCandidatesPerCategory,
      },
    },
    requests: reportProviderAttempts(audit ?? result),
    discovery: reportDiscoveryTelemetry(result),
    observedSearches,
    returnedDomains: source.returnedDomains,
    executedQueries: reportCategories.map((category) => ({
      categoryId: category.categoryId,
      label: category.label,
      requestedPrimaryQuery: category.requestedPrimaryQuery,
      executedQueries: category.executedQueries ?? [],
      followUpExecutedQuery: category.followUpExecutedQuery ?? null,
      state: category.state,
    })),
    sourceStates: source,
    candidateLineage: boundedList(audit?.candidateLineage, reportCandidateLineage, 112).filter(Boolean),
    evidenceAudit: evidence,
    unresolvedIdentifiers,
    budgetState: {
      telemetryStatus: retainedCacheResponse ? "historical-retained" : "current-live",
      physicalOpenBudget: audit?.physicalOpenBudget ?? result?.researchCoverage?.physicalOpenBudget ?? budget.maxPhysicalDocumentOpens,
      physicalOpensUsed: audit?.physicalOpensUsed ?? result?.researchCoverage?.physicalOpensUsed ?? null,
      physicalOpensRemaining: audit?.physicalOpensRemaining ?? result?.researchCoverage?.physicalOpensRemaining ?? null,
      physicalOpenBudgetExceeded: audit?.physicalOpenBudgetExceeded
        ?? result?.researchCoverage?.physicalOpenBudgetExceeded
        ?? null,
      documentsNotAttempted: reportCategories.map((category) => ({
        categoryId: category.categoryId,
        count: category.stageCounts?.notAttempted ?? 0,
        reason: boundedText(category.followUpSkipReason, 160),
      })).filter((item) => item.count > 0 || item.reason),
    },
    cacheState,
    workbenchState: {
      status: terminalStatus,
      reviewAction: "Review findings",
      eligibleSourceCount: source.retainedPassages.length,
      eligibleEvidenceCount,
      proposalCount: proposedCount,
      acceptedModelInputCount: acceptedCount,
      materialGaps: unresolvedIdentifiers,
      modelChangePendingHumanAcceptance: acceptedCount === 0 || proposedCount > acceptedCount,
    },
    sessionState: {
      runId: audit?.runCorrelationId ?? null,
      researchStatus: result?.researchStatus ?? null,
      cacheState: cacheState.state,
      telemetryStatus: cacheState.telemetryStatus,
      reloadRestoration: "run-scoped identity and cache metadata are retained; no model mutation is implied",
    },
    categoryGaps,
    categories: reportCategories.map((category) => ({
      categoryId: boundedText(category.categoryId, 120),
      label: boundedText(category.label, 240),
      state: boundedText(category.state, 100),
      unresolvedGaps: boundedList(category.unresolvedGaps, (value) => boundedText(value, 120), 32),
      accessLimitations: boundedList(category.accessLimitations, (value) => boundedText(value, REPORT_MAX_TEXT), 16),
      providerFailure: boundedText(category.providerFailure, REPORT_MAX_TEXT),
      providerAttempts: reportProviderAttempts({ providerAttempts: category.providerAttempts }),
      stageCounts: category.stageCounts ?? null,
    })),
    providerLimitations: [
      ...collectLimitations(audit),
      ...(result?.error ? [`${result.errorType ?? "provider-failure"}: ${result.error}`] : []),
         ...(retainedCacheResponse
        ? ["The provider refresh failed; audit fields in the response are retained historical data, not current-run telemetry."]
        : []),
    ].filter((value, index, values) => values.indexOf(value) === index),
    retainedHistoricalRun: retainedHistoricalAudit
      ? {
        ...retainedBudgetDiagnostics,
        provider: retainedHistoricalAudit.provider ?? "openai",
        model: retainedHistoricalAudit.model ?? RESEARCH_PROJECT_MODEL,
         providerResponseIds: boundedList(
           retainedHistoricalAudit.providerResponseIds,
           (value) => boundedText(value, 180),
           32,
         ),
        startedAt: retainedHistoricalAudit.startedAt ?? null,
        finishedAt: retainedHistoricalAudit.finishedAt ?? null,
        elapsedMs: retainedHistoricalAudit.elapsedMs ?? null,
        categoryGaps: retainedHistoricalAudit.categoryGaps ?? [],
        note: "Historical cached audit retained after the current provider refresh failed.",
      }
      : null,
    failureRetention: failureRun
      ? {
        httpStatus: failureRun.statusCode,
        cacheState: failureCache?.state ?? null,
        refreshStatus: failureCache?.refreshStatus ?? null,
        providerAvailable: failureCache?.providerAvailable ?? null,
        errorType: failureCache?.errorType ?? null,
        retainedResult: Array.isArray(failurePayload?.evidence),
        retainedResultMode: failurePayload?.researchMode ?? null,
        retainedCategoryGaps: failurePayload?.researchAudit?.categoryGaps ?? categoryGaps,
        retainedBudgetDiagnostics: failureRetainedBudgetDiagnostics,
        labeledStaleOrPartial: failureCache?.state === "stale"
          || failurePayload?.researchMode === "research-incomplete"
          || (failurePayload?.researchAudit?.categoryGaps ?? categoryGaps).length > 0,
      }
      : {
        status: "not-run",
        reason: "The live request did not produce a cache entry to rehearse against.",
      },
  };
}

export async function runLiveResearchAcceptance({
  project,
  apiKey = process.env.OPENAI_API_KEY,
  googleApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY,
  googleModel,
  allowGoogleFallback = false,
  runFailureRehearsal = false,
  categoryIds = parseCategoryIds(process.env.RESEARCH_ACCEPTANCE_CATEGORY_IDS),
  outputPath = process.env.RESEARCH_ACCEPTANCE_OUTPUT
    ?? path.resolve("diagnostics/research-live-acceptance.json"),
  cache,
  fetchImpl = fetch,
  documentFetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const normalizedProject = parseResearchProjectBody({ ...project, forceRefresh: true });
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the live research acceptance run.");
  const runCache = cache ?? createResearchProjectCache({
    directory: await mkdtemp(path.join(os.tmpdir(), "safeloc-live-acceptance-")),
  });
  const startedAt = now();
  const liveRun = await runRequest(normalizedProject, {
    apiKey,
    googleApiKey,
    ...(googleModel ? { googleModel } : {}),
    allowGoogleFallback,
    cache: runCache,
    fetchImpl,
    documentFetchImpl,
    categoryIds,
  });
  liveRun.durationMs = Math.max(0, now() - startedAt);
  let failureRun = null;
  if (
    runFailureRehearsal
    &&
    liveRun.statusCode >= 200
    && liveRun.statusCode < 300
    && liveRun.payload?.researchAudit
    && !isFailedRetainedCacheResponse(liveRun.payload)
  ) {
    failureRun = await runRequest(normalizedProject, {
      apiKey,
      googleApiKey,
      ...(googleModel ? { googleModel } : {}),
      allowGoogleFallback,
      cache: runCache,
      fetchImpl: async () => {
        throw new Error("Acceptance failure rehearsal.");
      },
      documentFetchImpl,
      categoryIds,
    });
  }
  const report = buildAcceptanceReport({
    project: normalizedProject,
    liveRun,
    failureRun,
    generatedAt: new Date(startedAt).toISOString(),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, outputPath };
}

function summarizePreconditions(metadata, gateFilePath, currentSourceIdentity) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Canary preconditions must be a JSON object.");
  }
  const gates = {};
  const failedGates = [];
  for (const field of RED_OAK_CANARY_REQUIRED_GATE_FIELDS) {
    const gate = metadata[field];
    const status = gate?.status;
    gates[field] = {
      status: boundedText(status, 40) ?? "missing",
      logPath: boundedText(gate?.logPath, 500),
    };
    if (status !== "passed") failedGates.push(field);
  }
  if (failedGates.length) {
    throw new Error(`Canary is blocked: required gates did not pass: ${failedGates.join(", ")}.`);
  }
  if (metadata.redOakContentQualityFixesIncluded !== true) {
    throw new Error("Canary is blocked: Red Oak content-quality fixes are not confirmed in gate metadata.");
  }
  if (metadata.googleGroundingFixtureSynchronized !== true) {
    throw new Error("Canary is blocked: the Google-grounding fixture correction is not confirmed in gate metadata.");
  }
  if (metadata.sourceRevision !== currentSourceIdentity.sourceRevision) {
    throw new Error("Canary is blocked: gate metadata does not match the current source revision.");
  }
  if (metadata.sourceHash !== currentSourceIdentity.sourceHash) {
    throw new Error("Canary is blocked: gate metadata does not match the current working-tree source hash.");
  }
  return {
    gateFilePath,
    gates,
    redOakContentQualityFixesIncluded: true,
    googleGroundingFixtureSynchronized: true,
    sourceRevision: currentSourceIdentity.sourceRevision,
    sourceHash: currentSourceIdentity.sourceHash,
  };
}

function createInMemoryCanaryAuditRepository() {
  const pendingWrites = [];
  let latest = null;
  const track = (write) => {
    pendingWrites.push(write);
    return write;
  };
  return {
    pendingWrites,
    get latest() {
      return latest;
    },
    startRun(record) {
      latest = { ...record, lifecycleState: "running" };
      return Promise.resolve();
    },
    finishRun(record) {
      latest = { ...latest, ...record };
      return track(Promise.resolve());
    },
    markFinalizationFailed(record) {
      latest = { ...latest, ...record, lifecycleState: "finalization-failed" };
      return track(Promise.resolve());
    },
  };
}

function canaryProviderCounts(payload) {
  const audit = payload?.researchAudit;
  const attempts = Array.isArray(audit?.providerAttempts) ? audit.providerAttempts : [];
  const discoveryRequests = attempts.filter((attempt) =>
    attempt?.provider === "google-gemini-grounding" || attempt?.provider === "google",
  ).length;
  const structuredProviderCalls = attempts.filter((attempt) =>
    attempt?.provider === "openai" && ["project-identity", "grid"].includes(attempt?.categoryId),
  ).length;
  return {
    discoveryRequests,
    structuredProviderCalls,
    totalProviderRequests: Number.isInteger(audit?.providerRequestCount)
      ? audit.providerRequestCount
      : attempts.filter((attempt) => attempt?.requestState === "issued").length,
  };
}

export function canaryContentQualityObservations(report) {
  const candidates = report?.sourceStates?.normalizedCandidates ?? [];
  const outcomes = candidates.map((candidate) =>
    `${candidate.accessReason ?? ""} ${candidate.extractionOutcome ?? ""}`.toLowerCase(),
  );
  return {
    applicationErrorFilter: {
      enabledAtExtractionBoundary: true,
      observedLive: outcomes.some((value) => value.includes("application-error-page")),
      observedCandidateCount: outcomes.filter((value) => value.includes("application-error-page")).length,
    },
    corruptedTextFilter: {
      enabledAtExtractionBoundary: true,
      observedLive: outcomes.some((value) => value.includes("control-heavy-content")),
      observedCandidateCount: outcomes.filter((value) => value.includes("control-heavy-content")).length,
    },
  };
}

export function canaryCandidateCount(report) {
  const candidates = report?.sourceStates?.normalizedCandidates;
  return Array.isArray(candidates) ? candidates.length : 0;
}

function canonicalReportUrlKey(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function markGridSuppliedCandidates(report, claimTrace) {
  const packets = (Array.isArray(claimTrace?.analysisPassages) ? claimTrace.analysisPassages : [])
    .filter((packet) => packet?.categoryId === "grid" && packet.state === "issued-to-provider");
  const exactPassages = new Set(packets.flatMap((packet) => (Array.isArray(packet.passages) ? packet.passages : [])
    .map((passage) => {
      const urlKey = canonicalReportUrlKey(passage.canonicalSourceUrl);
      return urlKey && passage.quoteSha256 ? `${urlKey}|${passage.quoteSha256}` : null;
    })
    .filter(Boolean)));
  for (const candidate of report?.sourceStates?.normalizedCandidates ?? []) {
    const urlKey = canonicalReportUrlKey(candidate.canonicalUrl ?? candidate.resolvedUrl ?? candidate.url);
    const exactKey = urlKey && candidate.passageSha256 ? `${urlKey}|${candidate.passageSha256}` : null;
    candidate.suppliedToGrid = Boolean(exactKey && exactPassages.has(exactKey));
  }
  if (report?.sourceStates) {
    report.sourceStates.sources = report.sourceStates.normalizedCandidates;
  }
  for (const candidate of report?.candidateLineage ?? []) {
    const urlKey = canonicalReportUrlKey(candidate.canonicalUrl ?? candidate.resolvedUrl ?? candidate.url);
    const exactKey = urlKey && candidate.passageResult?.passageSha256
      ? `${urlKey}|${candidate.passageResult.passageSha256}`
      : null;
    candidate.suppliedToGrid = Boolean(exactKey && exactPassages.has(exactKey));
  }
  return packets;
}

export function canaryPhysicalReceiptCompleteness(report, requestLocalDiagnostics = null) {
  const used = Number.isInteger(report?.canary?.scope?.physicalDocumentOpens)
    ? Math.max(0, report.canary.scope.physicalDocumentOpens)
    : Number.isInteger(report?.budgetState?.physicalOpensUsed)
      ? Math.max(0, report.budgetState.physicalOpensUsed)
    : Number.isInteger(report?.physicalOpenBudget?.physicalOpensUsed)
      ? Math.max(0, report.physicalOpenBudget.physicalOpensUsed)
      : null;
  if (used === null) {
    return {
      state: "unknown",
      physicalOpenBudgetUsed: null,
      expectedPhysicalOpenIndexes: [],
      capturedPhysicalOpenIndexes: [],
      legacyVisibleIndexes: [],
      visiblePhysicalOpenIndexes: [],
      missingPhysicalOpenIndexes: [],
      missingDetailsUnavailable: true,
      reconstructionAttempted: false,
      refetchAttempted: false,
      explanation: "The captured report does not establish how many physical opens were consumed; receipt completeness is unknown.",
    };
  }
  const expectedPhysicalOpenIndexes = Array.from({ length: used }, (_, index) => index + 1);
  const diagnosticReceipts = Array.isArray(requestLocalDiagnostics?.physicalReceipts)
    ? requestLocalDiagnostics.physicalReceipts
    : [];
  const capturedPhysicalOpenIndexes = [...new Set(diagnosticReceipts.flatMap((receipt) =>
    Array.isArray(receipt?.physicalOpenIndexes) ? receipt.physicalOpenIndexes : [],
  ).filter(Number.isInteger))].sort((left, right) => left - right);
  const authorizedPhysicalOpenIndexes = [...new Set(
    (Array.isArray(requestLocalDiagnostics?.physicalOpenAuthorizations)
      ? requestLocalDiagnostics.physicalOpenAuthorizations
      : [])
      .map((entry) => entry?.physicalOpenIndex)
      .filter(Number.isInteger),
  )].sort((left, right) => left - right);
  const legacyVisibleIndexes = [
    ...(Array.isArray(report?.sourceStates?.normalizedCandidates)
      ? report.sourceStates.normalizedCandidates.map((candidate) => candidate?.accessOutcome?.physicalOpenIndex)
      : []),
    ...(Array.isArray(report?.candidateLineage)
      ? report.candidateLineage.map((candidate) => candidate?.accessOutcome?.physicalOpenIndex)
      : []),
  ].filter(Number.isInteger);
  const visiblePhysicalOpenIndexes = [...new Set([
    ...capturedPhysicalOpenIndexes,
    ...authorizedPhysicalOpenIndexes,
    ...legacyVisibleIndexes,
  ])].sort((left, right) => left - right);
  const missingPhysicalOpenIndexes = expectedPhysicalOpenIndexes
    .filter((index) => !capturedPhysicalOpenIndexes.includes(index));
  return {
    state: missingPhysicalOpenIndexes.length ? "incomplete-details" : "complete",
    physicalOpenBudgetUsed: used,
    expectedPhysicalOpenIndexes,
    capturedPhysicalOpenIndexes,
    authorizedPhysicalOpenIndexes,
    authorizedButReceiptMissingIndexes: authorizedPhysicalOpenIndexes
      .filter((index) => !capturedPhysicalOpenIndexes.includes(index)),
    legacyVisibleIndexes: [...new Set(legacyVisibleIndexes)].sort((left, right) => left - right),
    visiblePhysicalOpenIndexes,
    missingPhysicalOpenIndexes,
    missingDetailsUnavailable: missingPhysicalOpenIndexes.length > 0,
    reconstructionAttempted: false,
    refetchAttempted: false,
    explanation: missingPhysicalOpenIndexes.length
      ? requestLocalDiagnostics
        ? "One or more physical-open receipts were not captured by the request-local collector; their details are unavailable and were not reconstructed or refetched."
        : "The original report has no request-local physical-receipt snapshots; missing receipt details are unavailable and were not reconstructed or refetched."
      : "Every consumed physical-open index has a request-local receipt snapshot.",
  };
}

function canaryRemainingBlockers(report, counts, gridAnalysisPackets) {
  const candidates = report?.sourceStates?.normalizedCandidates ?? [];
  const structuredCalls = Number.isInteger(counts?.structuredProviderCalls)
    ? counts.structuredProviderCalls
    : 0;
  const gridPassageCount = (Array.isArray(gridAnalysisPackets) ? gridAnalysisPackets : [])
    .reduce((total, packet) => total + (Array.isArray(packet?.passages) ? packet.passages.length : 0), 0);
  const accessibleNotSupplied = candidates.filter((candidate) =>
    candidate?.accessState === "accessible" && candidate.suppliedToGrid !== true,
  );
  const accessibleOfficialNotSupplied = accessibleNotSupplied
    .map((candidate) => reportDomain(candidate.returnedDomain ?? candidate.canonicalUrl ?? candidate.url))
    .filter((domain) => domain && (
      domain.endsWith(".gov")
      || domain.endsWith(".texas.gov")
      || domain === "puc.texas.gov"
    ));
  const physicalOpensUsed = Number.isInteger(report?.budgetState?.physicalOpensUsed)
    ? report.budgetState.physicalOpensUsed
    : Number.isInteger(report?.canary?.scope?.physicalDocumentOpens)
      ? report.canary.scope.physicalDocumentOpens
      : null;
  const physicalOpenLimit = Number.isInteger(report?.budgetState?.physicalOpenBudget)
    ? report.budgetState.physicalOpenBudget
    : RED_OAK_GRID_CANARY_LIMITS.physicalDocumentOpens;
  return {
    unresolvedCategories: structuredCalls === 0 || gridPassageCount === 0
      ? ["project-identity", "grid"]
      : [],
    noUsableGroundedPassageAvailableForAnalysis: structuredCalls === 0 && gridPassageCount === 0,
    structuredProviderCalls: structuredCalls,
    gridAnalysisPacketCount: Array.isArray(gridAnalysisPackets) ? gridAnalysisPackets.length : 0,
    gridAnalysisPassageCount: gridPassageCount,
    physicalOpenBudgetExhausted: Number.isInteger(physicalOpensUsed)
      ? physicalOpensUsed >= physicalOpenLimit
      : false,
    physicalOpensUsed,
    physicalOpenLimit,
    accessibleRetrievedSourcesNotSuppliedToGrid: {
      candidateCount: accessibleNotSupplied.length,
      officialDomains: [...new Set(accessibleOfficialNotSupplied)].slice(0, 16),
      note: "An accessible source is not evidence it was supplied to Grid analysis or supported a Grid claim.",
    },
    deadlineCauseAsserted: false,
  };
}

function persistCanaryReport(outputPath, report) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function raceWithTimeout(promise, timeoutMs, timeoutValue = null) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(timeoutValue), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The canary has its own command and a mandatory --live opt-in. Gate metadata,
 * API configuration, and source identity are checked before the first request.
 */
export async function runRedOakGridCanary({
  optIn = false,
  preconditionsPath = null,
  preconditions = null,
  apiKey = process.env.OPENAI_API_KEY,
  googleApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GEMINI_API_KEY,
  outputPath = process.env.SAFELOC_RED_OAK_CANARY_OUTPUT
    ?? path.join(os.tmpdir(), "red-oak-grid-canary-report.json"),
} = {}) {
  if (optIn !== true) {
    throw new Error("Red Oak live canary requires the dedicated command and explicit --live opt-in; no requests were issued.");
  }
  if (!preconditions && !preconditionsPath) {
    throw new Error("Canary is blocked: provide --gates with passed offline, standalone-data, typecheck, and build results.");
  }
  const metadata = preconditions ?? JSON.parse(await readFile(preconditionsPath, "utf8"));
  const gateFilePath = preconditionsPath ? path.resolve(preconditionsPath) : null;
  const currentSourceIdentity = getRedOakCanarySourceIdentity();
  const verifiedPreconditions = summarizePreconditions(metadata, gateFilePath, currentSourceIdentity);
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the opted-in Red Oak canary.");
  if (!googleApiKey) throw new Error("GEMINI_API_KEY or GOOGLE_GEMINI_API_KEY is required for the opted-in Red Oak canary.");

  const invocationStartedAt = Date.now();
  const hardDeadlineAt = invocationStartedAt + RED_OAK_GRID_CANARY_LIMITS.invocationTimeoutMs;
  const resolvedOutputPath = path.resolve(outputPath);
  const outputPathRelativeToRepository = path.relative(REPOSITORY_ROOT, resolvedOutputPath);
  if (outputPathRelativeToRepository === ""
    || (!outputPathRelativeToRepository.startsWith(`..${path.sep}`)
      && outputPathRelativeToRepository !== ".."
      && !path.isAbsolute(outputPathRelativeToRepository))) {
    throw new Error("Canary report output must be outside the repository.");
  }
  const singleRunMarkerPath = path.join(
    os.tmpdir(),
    `safeloc-red-oak-grid-canary-${currentSourceIdentity.sourceRevision}.lock`,
  );
  try {
    await writeFile(singleRunMarkerPath, JSON.stringify({
      sourceRevision: currentSourceIdentity.sourceRevision,
      sourceHash: currentSourceIdentity.sourceHash,
      startedAt: new Date(invocationStartedAt).toISOString(),
    }), { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("Red Oak canary already invoked for this source revision; repeat runs are disabled.");
    }
    throw error;
  }
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "safeloc-red-oak-grid-canary-"));
  const isolated = createRedOakCanaryResources(tempDirectory);
  const pendingRegistryWrites = [];
  const registry = {
    ...isolated.registry,
    retain(...args) {
      const write = isolated.registry.retain(...args);
      pendingRegistryWrites.push(write);
      return write;
    },
  };
  const auditRepository = createInMemoryCanaryAuditRepository();
  const claimTrace = createRedOakClaimTrace();
  const canaryDiagnosticCollector = createRedOakCanaryDiagnosticCollector();
  const abortController = new AbortController();
  let researchTimeoutReached = false;
  let invocationCancellationStarted = false;
  let cleanupStatus = "not-started";
  let researchTimer;
  let invocationTimer;
  let requestPromise = null;
  const project = parseResearchProjectBody({
    ...RED_OAK_GRID_CANARY_PROJECT,
    forceRefresh: true,
  });
  let liveRun = null;
  let report = null;
  try {
    const invocationDeadline = new Promise((resolve) => {
      invocationTimer = setTimeout(() => {
        invocationCancellationStarted = true;
        abortController.abort();
        resolve({ timeout: "invocation" });
      }, Math.max(0, hardDeadlineAt - Date.now() - 10_000));
    });
    researchTimer = setTimeout(() => {
      researchTimeoutReached = true;
      abortController.abort();
    }, Math.max(0, invocationStartedAt + RED_OAK_GRID_CANARY_LIMITS.researchTimeoutMs - Date.now()));
    requestPromise = runRequest(project, {
      ...buildRedOakGridCanaryRequestOptions({
        apiKey,
        googleApiKey,
        cache: isolated.cache,
        registry,
        auditRepository,
        rateLimiter: createResearchProjectRateLimiter(),
        claimTrace,
          canaryDiagnosticCollector,
        signal: abortController.signal,
      }),
    }).then(
      (result) => ({ result }),
      () => ({ error: true }),
    );
    let settled = await Promise.race([requestPromise, invocationDeadline]);
    if (settled?.result) {
      clearTimeout(researchTimer);
      researchTimer = null;
      liveRun = settled.result;
      liveRun.durationMs = Math.max(0, Date.now() - invocationStartedAt);
    } else {
      const timedOutAt = Date.now();
      liveRun = {
        statusCode: 504,
        durationMs: Math.max(0, timedOutAt - invocationStartedAt),
        payload: {
          researchStatus: settled?.error ? "failed" : "timed-out",
          researchError: {
            type: settled?.error ? "request-adapter-failure" : "invocation-cancellation-cutoff",
            message: settled?.error
              ? "Canary request adapter did not return a response."
              : "Canary request was cancelled at the bounded finalization cutoff.",
          },
          researchAudit: auditRepository.latest?.audit ?? null,
          researchCoverage: null,
          sourceLedger: [],
          evidence: [],
        },
      };
    }
    report = buildAcceptanceReport({
      project,
      liveRun,
      failureRun: null,
      generatedAt: new Date(invocationStartedAt).toISOString(),
    });
    let clientParsing = {
      state: "not-evaluated",
      evidenceCount: null,
      proposalCount: null,
      selectedProposalCount: null,
      errorType: null,
    };
    if (invocationCancellationStarted || !settled?.result || Date.now() >= hardDeadlineAt - 15_000) {
      clientParsing = {
        ...clientParsing,
        errorType: invocationCancellationStarted
          ? "invocation-cancellation-cutoff"
          : "client-parse-skipped-to-preserve-hard-deadline",
      };
    } else {
      try {
        const importBudgetMs = Math.min(5_000, Math.max(0, hardDeadlineAt - Date.now() - 10_000));
        const clientService = await raceWithTimeout(
          import("../src/services/researchProjectService.ts"),
          importBudgetMs,
        );
        if (!clientService) throw new Error("Client parser import exceeded the canary finalization budget.");
        const clientResult = clientService.parseResponse(liveRun.payload, {
          name: project.name,
          location: project.location,
          knownData: project.knownData,
        }, claimTrace);
        const selectedProposals = clientService.selectResearchProposals(clientResult.proposedInputs, claimTrace);
        clientParsing = {
          state: "parsed",
          evidenceCount: Array.isArray(clientResult.evidence) ? clientResult.evidence.length : 0,
          proposalCount: Array.isArray(clientResult.proposedInputs) ? clientResult.proposedInputs.length : 0,
          selectedProposalCount: Object.keys(selectedProposals).length,
          errorType: null,
        };
      } catch (error) {
        claimTrace.recordClientParseResult({
          evidence: Array.isArray(liveRun.payload?.evidence) ? liveRun.payload.evidence : [],
          passed: false,
          reasonCode: "client-parser-failed",
        });
        clientParsing = {
          state: "failed",
          evidenceCount: Array.isArray(liveRun.payload?.evidence) ? liveRun.payload.evidence.length : 0,
          proposalCount: null,
          selectedProposalCount: null,
          errorType: error instanceof Error ? error.name.slice(0, 80) : "unknown",
        };
      }
    }
    const counts = canaryProviderCounts(liveRun.payload);
    const claimTraceReport = claimTrace.toJSON();
    const gridAnalysisPackets = markGridSuppliedCandidates(report, claimTraceReport);
    const requestLocalDiagnostics = canaryDiagnosticCollector.toJSON();
    report.canary = {
      mode: "red-oak-grid",
      explicitLiveOptIn: true,
      repeatRunGuard: "one-invocation-per-source-revision",
      preconditions: verifiedPreconditions,
      sourceRevision: currentSourceIdentity.sourceRevision,
      sourceHash: currentSourceIdentity.sourceHash,
      isolation: {
        storageMode: isolated.storageMode,
        researchCacheReuse: "disabled-by-fresh-cache-and-force-refresh",
        registryStorage: "isolated-temporary-directory",
        auditStorage: "in-memory",
        productionResearchStateRead: false,
        productionResearchStateWritten: false,
      },
      scope: {
        categories: [...RED_OAK_GRID_CANARY_LIMITS.categoryIds],
        discoveryRequestedCategories: ["project-identity", "grid"],
        groundedDiscoveryRequests: counts.discoveryRequests,
        structuredProviderCalls: counts.structuredProviderCalls,
        totalProviderRequests: counts.totalProviderRequests,
        physicalDocumentOpens: Number.isInteger(liveRun.payload?.researchAudit?.physicalOpensUsed)
          ? liveRun.payload.researchAudit.physicalOpensUsed
          : null,
        limits: {
          groundedDiscoveryRequests: RED_OAK_GRID_CANARY_LIMITS.discoveryRequests,
          structuredProviderCalls: RED_OAK_GRID_CANARY_LIMITS.structuredProviderCalls,
          totalProviderRequests: RED_OAK_GRID_CANARY_LIMITS.totalProviderRequests,
          physicalDocumentOpens: RED_OAK_GRID_CANARY_LIMITS.physicalDocumentOpens,
          followUps: 0,
          openAIFallback: false,
          correctiveRetries: false,
          providerRetries: false,
          secConnectorDefault: false,
          failureRehearsal: false,
          researchTimeoutMs: RED_OAK_GRID_CANARY_LIMITS.researchTimeoutMs,
          invocationTimeoutMs: RED_OAK_GRID_CANARY_LIMITS.invocationTimeoutMs,
        },
      },
      timeout: {
        researchDeadlineReached: researchTimeoutReached,
        invocationCancellationStarted,
        hardDeadlineAt: new Date(hardDeadlineAt).toISOString(),
      },
      contentQualityObservations: canaryContentQualityObservations(report),
      gridAnalysisPackets,
      requestLocalDiagnostics,
      physicalReceiptCompleteness: canaryPhysicalReceiptCompleteness(report, requestLocalDiagnostics),
      remainingBlockers: canaryRemainingBlockers(report, counts, gridAnalysisPackets),
      candidateCount: canaryCandidateCount(report),
      clientParsing,
      claimTrace: claimTraceReport,
      documentTransport: "production-default-pinned-public-transport",
      capacitySemantics: {
        campusItLoad480Mw: "context-only; not grid-interconnection or backup-power evidence",
        dfw9Dfw10Dfw11Capacity180Mw: "phase/building-group capacity only unless a source explicitly supports a grid or backup-power claim",
      },
      totalRuntimeMs: null,
      finalization: {
        cleanupStatus: "report-persisted-before-cleanup",
        reportPersistedBeforeCleanup: true,
      },
    };
    report.canary.totalRuntimeMs = Math.max(0, Date.now() - invocationStartedAt);
    persistCanaryReport(resolvedOutputPath, report);
  } finally {
    clearTimeout(researchTimer);
    clearTimeout(invocationTimer);
    const cleanupPromise = Promise.allSettled([
      ...pendingRegistryWrites,
      ...auditRepository.pendingWrites,
    ]).then(() => rm(tempDirectory, { recursive: true, force: true }));
    const cleanupBudgetMs = Math.max(0, hardDeadlineAt - Date.now() - 2_000);
    cleanupStatus = await raceWithTimeout(
      cleanupPromise.then(() => "completed", () => "failed"),
      cleanupBudgetMs,
      "deadline-budget-exhausted",
    );
    if (cleanupStatus === "deadline-budget-exhausted") cleanupPromise.catch(() => {});
  }
  if (!report) {
    throw new Error("Red Oak canary ended before a diagnostic report could be assembled.");
  }
  report.canary.totalRuntimeMs = Math.max(0, Date.now() - invocationStartedAt);
  report.canary.finalization.cleanupStatus = cleanupStatus;
  persistCanaryReport(resolvedOutputPath, report);
  return { report, outputPath: resolvedOutputPath };
}

function parseKnownData(rawValue) {
  if (!rawValue) return undefined;
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error("RESEARCH_ACCEPTANCE_PROJECT_KNOWN_DATA must be valid JSON.");
  }
}

export function parseRedOakCanaryCliArguments(args) {
  const parsed = { optIn: false, preconditionsPath: null, outputPath: undefined };
  const forwardedArgs = args[0] === "--" ? args.slice(1) : args;
  for (let index = 0; index < forwardedArgs.length; index += 1) {
    const argument = forwardedArgs[index];
    if (argument === "--live") {
      parsed.optIn = true;
    } else if (argument === "--gates" || argument === "--output") {
      const value = forwardedArgs[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a file path.`);
      if (argument === "--gates") parsed.preconditionsPath = value;
      else parsed.outputPath = value;
      index += 1;
    } else {
      throw new Error(`Unsupported Red Oak canary argument: ${argument}.`);
    }
  }
  return parsed;
}

function armRedOakCanaryHardWatchdog(outputPath) {
  const watchdogOutputPath = path.resolve(outputPath);
  const timer = setTimeout(() => {
    let report;
    try {
      report = JSON.parse(readFileSync(watchdogOutputPath, "utf8"));
    } catch {
      report = {
        diagnosticOnly: true,
        evidenceStatus: "not-evidence",
        generatedAt: new Date().toISOString(),
        run: {
          status: "incomplete-technical-limitation",
          researchStatus: "timed-out",
          failureType: "hard-invocation-watchdog",
          failureMessage: "The canary hard deadline expired; only partial diagnostics are available.",
        },
        sourceStates: { total: 0, normalizedCandidates: [], sources: [], retainedPassages: [] },
        evidenceAudit: [],
        candidateLineage: [],
      };
    }
    report.canary ??= { mode: "red-oak-grid", explicitLiveOptIn: true };
    report.canary.timeout ??= {};
    report.canary.timeout.hardWatchdogTriggered = true;
    report.canary.timeout.hardDeadlineMs = RED_OAK_GRID_CANARY_LIMITS.invocationTimeoutMs;
    report.canary.finalization = {
      ...(report.canary.finalization ?? {}),
      cleanupStatus: "hard-watchdog-exit",
      reportPersistedBeforeCleanup: true,
    };
    report.canary.totalRuntimeMs = RED_OAK_GRID_CANARY_LIMITS.invocationTimeoutMs - 500;
    report.run ??= { status: "incomplete-technical-limitation" };
    report.run.status = "incomplete-technical-limitation";
    persistCanaryReport(watchdogOutputPath, report);
    console.error("Red Oak canary hard deadline reached; partial report saved.");
    process.exit(124);
  }, RED_OAK_GRID_CANARY_LIMITS.invocationTimeoutMs - 500);
  return () => clearTimeout(timer);
}

const invokedDirectly = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly && process.argv[2] === "--red-oak-grid-canary") {
  let options;
  try {
    options = parseRedOakCanaryCliArguments(process.argv.slice(3));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid Red Oak canary arguments.");
    process.exitCode = 1;
  }
  if (options) {
    const watchdogOutputPath = options.outputPath
      ?? process.env.SAFELOC_RED_OAK_CANARY_OUTPUT
      ?? path.join(os.tmpdir(), "red-oak-grid-canary-report.json");
    const disarmWatchdog = options.optIn
      ? armRedOakCanaryHardWatchdog(watchdogOutputPath)
      : () => {};
    runRedOakGridCanary(options)
      .then(({ report, outputPath }) => {
        console.log(JSON.stringify({
          outputPath,
          status: report.run.status,
          elapsedMs: report.run.elapsedMs,
          limits: report.canary.scope,
          timeout: report.canary.timeout,
          eligibleEvidenceCount: report.eligibleEvidenceCount,
        }, null, 2));
        if (report.run.status === "incomplete-technical-limitation") process.exitCode = 1;
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : "Red Oak live canary failed.");
        process.exitCode = 1;
      })
      .finally(disarmWatchdog);
  }
} else if (invokedDirectly) {
  const project = {
    name: process.env.RESEARCH_ACCEPTANCE_PROJECT_NAME,
    location: process.env.RESEARCH_ACCEPTANCE_PROJECT_LOCATION,
    ...(parseKnownData(process.env.RESEARCH_ACCEPTANCE_PROJECT_KNOWN_DATA)
      ? { knownData: parseKnownData(process.env.RESEARCH_ACCEPTANCE_PROJECT_KNOWN_DATA) }
      : {}),
  };
  runLiveResearchAcceptance({
    project,
    categoryIds: parseCategoryIds(process.env.RESEARCH_ACCEPTANCE_CATEGORY_IDS),
  })
    .then(({ report, outputPath }) => {
      console.log(JSON.stringify({
        outputPath,
        status: report.run.status,
        elapsedMs: report.run.elapsedMs,
        provider: report.run.provider,
        model: report.run.model,
        categoryGaps: report.categoryGaps,
        failureRetention: report.failureRetention,
      }, null, 2));
      if (report.run.status === "incomplete-technical-limitation") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Live research acceptance run failed.");
      process.exitCode = 1;
    });
}