import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  RESEARCH_PROJECT_MODEL,
  RESEARCH_RUN_BUDGET,
  buildResearchCategoryPlan,
  handleResearchProjectRequest,
  parseResearchProjectBody,
} from "./researchProjectProxy.mjs";
import { createResearchProjectCache } from "./researchProjectCache.mjs";
import { sourceUrlAliases } from "../src/data/sourceValidationPolicy.mjs";

const REPORT_MAX_TEXT = 1_200;
const REPORT_MAX_PASSAGE = 1_500;
const REPORT_MAX_ITEMS = 160;

function boundedText(value, maxLength = REPORT_MAX_TEXT) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, maxLength);
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

function reportScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return boundedText(value, 240);
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
    message: boundedText(value.message, 500),
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
    attempted: access.attempted !== false,
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
      text: passage.trim().slice(0, REPORT_MAX_PASSAGE),
      passage: passage.trim().slice(0, REPORT_MAX_PASSAGE),
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
  const response = responseRecorder();
  await handleResearchProjectRequest(
    {
      method: "POST",
      body: project,
      ip: "live-acceptance-run",
    },
    response,
    options,
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
        exactQuotation: boundedText(mapping?.exactQuotation, REPORT_MAX_PASSAGE),
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
    passage: boundedText(item?.passage, REPORT_MAX_PASSAGE),
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
        text: boundedText(item.retainedExactProjectPassage.text, REPORT_MAX_PASSAGE),
        exactProject: item.retainedExactProjectPassage.exactProject === true,
      }
      : null,
    governedEvidenceMapping: item?.governedEvidenceMapping
      ? {
        sourceId: reportUrl(item.governedEvidenceMapping.sourceId),
        passageId: boundedText(item.governedEvidenceMapping.passageId, 160),
        variable: boundedText(item.governedEvidenceMapping.variable, 120),
        supportStatus: boundedText(item.governedEvidenceMapping.supportStatus, 100),
        exactQuotation: boundedText(item.governedEvidenceMapping.exactQuotation, REPORT_MAX_PASSAGE),
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
        description: boundedText(item.visibleHandoffFinding.description, REPORT_MAX_TEXT),
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
      failureMessage: result?.error
        ?? (retainedCacheResponse ? "Live refresh failed; the response contains retained cached research." : null),
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

function parseKnownData(rawValue) {
  if (!rawValue) return undefined;
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error("RESEARCH_ACCEPTANCE_PROJECT_KNOWN_DATA must be valid JSON.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
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