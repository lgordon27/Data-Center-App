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

function sourceDiagnostics(result) {
  const sources = Array.isArray(result?.sourceLedger) ? result.sourceLedger : [];
  const retainedPassages = sources.flatMap((source) => {
    const passage = source.accessOutcome?.passage ?? source.claimPassage ?? null;
    if (source.accessOutcome?.state !== "accessible" || typeof passage !== "string" || !passage.trim()) return [];
    return [{
      url: source.canonicalUrl ?? source.resolvedUrl ?? source.url ?? null,
      title: source.title ?? null,
      searchDomain: source.searchDomain ?? null,
      passage: passage.trim(),
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
    sources: sources.map((source) => ({
      url: source.canonicalUrl ?? source.resolvedUrl ?? source.url ?? null,
      title: source.title ?? null,
      searchDomain: source.searchDomain ?? null,
      sourceState: source.sourceState ?? null,
      accessState: source.accessOutcome?.state ?? null,
      accessReason: source.accessOutcome?.reason ?? null,
      claimSupportState: source.claimSupportState ?? null,
      projectSpecificityState: source.projectSpecificityState ?? null,
      financialEligibilityState: source.financialEligibilityState ?? null,
      transportDiagnostic: source.accessOutcome?.transportDiagnostic ?? null,
    })),
    retainedPassages,
  };
}

function collectLimitations(audit) {
  return [
    ...(Array.isArray(audit?.providerLimitations) ? audit.providerLimitations : []),
    ...(Array.isArray(audit?.categories)
      ? audit.categories.flatMap((category) => category.accessLimitations ?? [])
      : []),
  ].filter((value, index, values) => typeof value === "string" && value.trim() && values.indexOf(value) === index);
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
      label: category.label,
      state: category.state,
      followUpSkipReason: category.followUpSkipReason ?? null,
      accessLimitations: category.accessLimitations ?? [],
      unresolvedGaps: category.unresolvedGaps ?? [],
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
        searchDomain: source.searchDomain ?? null,
        sourceState: source.sourceState ?? null,
        exactProject: source.exactProject === true,
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
  const categories = Array.isArray(audit?.categories)
    ? audit.categories
    : buildResearchCategoryPlan(project).categories.map((category) => ({
      ...category,
      state: "Provider failure",
      executedQueries: [],
      followUpExecutedQuery: null,
      unresolvedGaps: category.evidenceIds.length ? category.evidenceIds : [category.categoryId],
      accessLimitations: [],
      providerFailure: result?.errorType ?? "Provider audit was unavailable.",
      stageCounts: null,
    }));
  const source = sourceDiagnostics(audit ? result : null);
  const categoryGaps = Array.isArray(audit?.categoryGaps)
    ? audit.categoryGaps
    : categories.filter((category) => category.state !== "Complete").map((category) => category.categoryId);
  const elapsedMs = audit?.elapsedMs ?? liveRun.durationMs ?? null;
  const budget = audit?.budget ?? RESEARCH_RUN_BUDGET;
  const categoryCandidateCounts = Object.fromEntries(
    categories.map((category) => [
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
  const visibleFindingTrace = buildVisibleFindingTrace(result);
  const terminalStatus = retainedCacheResponse || liveRun.statusCode < 200 || liveRun.statusCode >= 300
    ? "failed"
    : ["cancelled", "timed-out", "failed"].includes(result?.researchStatus)
      ? result.researchStatus
      : usefulCompletion
        ? "useful-completion"
        : "research-incomplete";

  return {
    diagnosticOnly: true,
    evidenceStatus: "not-evidence",
    liveAcceptance: visibleFindingTrace.length
      ? {
        status: "source-to-visible-finding",
        trace: visibleFindingTrace,
      }
      : {
        status: "LIVE ACCEPTANCE BLOCKED",
        reason: "No accessible exact-project passage mapped to an eligible visible finding; retained passages and unresolved categories remain diagnostic only.",
        trace: [],
      },
    generatedAt,
    project: {
      name: project.name,
      location: project.location,
    },
    run: {
      status: terminalStatus,
      telemetryStatus: retainedCacheResponse ? "historical-retained" : "current-live",
      runId: audit?.runCorrelationId ?? null,
      researchStatus: result?.researchStatus ?? null,
      httpStatus: liveRun.statusCode,
      provider: audit?.provider ?? "openai",
      model: audit?.model ?? RESEARCH_PROJECT_MODEL,
      providerResponseIds: audit?.providerResponseIds ?? [],
      startedAt: audit?.startedAt ?? null,
      finishedAt: audit?.finishedAt ?? null,
      elapsedMs,
      wallClockElapsedMs: liveRun.durationMs ?? null,
      failureType: result?.errorType ?? result?.researchCache?.errorType ?? (retainedCacheResponse ? "retained-cache" : null),
      failureMessage: result?.error
        ?? (retainedCacheResponse ? "Live refresh failed; the response contains retained cached research." : null),
      providerDiagnostic: result?.providerDiagnostic ?? result?.researchCache?.providerDiagnostic ?? null,
      elapsedWithinDeadline: typeof elapsedMs === "number" && elapsedMs <= budget.deadlineMs,
      providerRequestCount: audit?.providerRequestCount ?? null,
      providerAttempts: audit?.providerAttempts ?? [],
      toolCallCount: audit?.toolCallCount ?? null,
      followUpCount: categories.filter((category) => category.followUpExecutedQuery).length,
      budget,
      limitsObserved: {
        providerRequestsWithinLimit: audit ? audit.providerRequestCount <= budget.maxProviderRequests : null,
        followUpsWithinLimit: audit
          ? categories.filter((category) => category.followUpExecutedQuery).length <= budget.maxFollowUps
          : null,
        toolCallsWithinLimit: audit ? audit.toolCallCount <= budget.maxToolCalls : null,
        candidatesWithinTotalLimit: audit ? totalCandidateCount <= budget.maxTotalCandidates : null,
        candidatesByCategory: categoryCandidateCounts,
        candidateCategoryLimit: budget.maxCandidatesPerCategory,
      },
    },
    executedQueries: categories.map((category) => ({
      categoryId: category.categoryId,
      label: category.label,
      requestedPrimaryQuery: category.requestedPrimaryQuery,
      executedQueries: category.executedQueries ?? [],
      followUpExecutedQuery: category.followUpExecutedQuery ?? null,
      state: category.state,
    })),
    sourceStates: source,
    categoryGaps,
    categories: categories.map((category) => ({
      categoryId: category.categoryId,
      label: category.label,
      state: category.state,
      unresolvedGaps: category.unresolvedGaps ?? [],
      accessLimitations: category.accessLimitations ?? [],
      providerFailure: category.providerFailure ?? null,
      providerAttempts: category.providerAttempts ?? [],
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
        providerResponseIds: retainedHistoricalAudit.providerResponseIds ?? [],
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
    cache: runCache,
    fetchImpl,
    documentFetchImpl,
    categoryIds,
  });
  liveRun.durationMs = Math.max(0, now() - startedAt);
  let failureRun = null;
  if (
    liveRun.statusCode >= 200
    && liveRun.statusCode < 300
    && liveRun.payload?.researchAudit
    && !isFailedRetainedCacheResponse(liveRun.payload)
  ) {
    failureRun = await runRequest(normalizedProject, {
      apiKey,
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
      if (report.run.status !== "useful-completion") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Live research acceptance run failed.");
      process.exitCode = 1;
    });
}