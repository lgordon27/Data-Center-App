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
  const usefulCompletion = source.retainedPassages.length > 0 || (result?.eligibleEvidenceCount ?? 0) > 0;
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
    generatedAt,
    project: {
      name: project.name,
      location: project.location,
    },
    run: {
      status: terminalStatus,
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
  runLiveResearchAcceptance({ project })
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