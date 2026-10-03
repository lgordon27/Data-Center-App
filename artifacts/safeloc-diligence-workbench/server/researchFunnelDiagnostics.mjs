import { createHash } from "node:crypto";
import { createRedOakClaimTrace } from "./redOakClaimTrace.mjs";
import { canonicalizeSourceUrl } from "../src/data/sourceValidationPolicy.mjs";

const MAX_PASSAGE_SELECTIONS = 640;
const MAX_PROVIDER_EVENTS = 32;
const MAX_TRANSFORMATIONS = 512;
const MAX_TRANSFORMATION_DIFFS = 96;
const CLAIM_FIELDS = [
  "id", "label", "claimType", "type", "evidenceType", "value", "numericValue", "normalizedValue",
  "unit", "normalizedUnit", "status", "classification", "sourceClass", "sourceRole", "description",
  "citation", "citations", "citationText", "claimPassage", "sourceUrl", "sourceUrls", "sourceIds",
  "coverageStatus", "conflictSummary",
  "projectName", "matchedProject", "matchedProjectName", "matchedOperator", "operatorName",
  "matchedIdentity", "identityAssessment",
  "facilityScope", "phaseScope", "campusScope", "buildingScope", "claimTimePeriod",
  "facilityName", "phaseName", "buildingName", "timeScope", "projectSpecificity",
  "sourceRelevance", "sourceRelevanceNote", "relevance", "relevanceScore", "relevanceExplanation",
  "modelReportedConfidence", "sourceSupportConfidence", "confidence", "confidenceLevel",
  "confidenceReason", "supportConfidence", "statusEvidence", "classificationReason", "qualitativeValue",
];

// Observational only: never changes admission, scheduling, passages or claims.
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === "vertexaisearch.cloud.google.com") {
      url.pathname = `/grounding-api-redirect/redacted-${createHash("sha256").update(url.pathname).digest("hex").slice(0, 16)}`;
    } else if (/\/(?:redirect|redirection|out|click|link|url)\/[^/]{16,}$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/[^/]+$/, (segment) =>
        `redacted-${createHash("sha256").update(segment).digest("hex").slice(0, 16)}`);
    }
    url.search = "";
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

function safeIdentityAssessment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    exactProjectIdentityEstablished: typeof value.exactProjectIdentityEstablished === "boolean"
      ? value.exactProjectIdentityEstablished : null,
    matchedName: safeText(value.matchedName, 180),
    matchedLocation: safeText(value.matchedLocation, 180),
    matchedOperator: safeText(value.matchedOperator, 180),
    reason: safeText(value.reason, 320),
  };
}

function safeProviderProjectSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const description = typeof value.description === "string" ? value.description : "";
  return {
    name: safeText(value.name, 200),
    location: safeText(value.location, 220),
    descriptionSha256: description ? createHash("sha256").update(description).digest("hex") : null,
    descriptionLength: description.length,
    descriptionAvailable: Boolean(description),
    capacityMW: Number.isFinite(value.capacityMW) ? value.capacityMW : null,
    capacityProvenance: safeText(value.capacityProvenance, 60),
  };
}

function safeProviderResearchContext(research) {
  return {
    projectSummaryAvailable: Boolean(research?.projectSummary && typeof research.projectSummary === "object"),
    projectSummary: safeProviderProjectSummary(research?.projectSummary),
    identityAssessmentAvailable: Boolean(research?.identityAssessment && typeof research.identityAssessment === "object"),
    identityAssessment: safeIdentityAssessment(research?.identityAssessment),
  };
}

function safeDiagnosticValue(value, depth = 0) {
  if (depth > 5) return "[depth-limited]";
  if (typeof value === "string") return safeText(value, 600);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 48).map((item) => safeDiagnosticValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 64)
      .map(([key, item]) => [safeText(key, 80), safeDiagnosticValue(item, depth + 1)]));
  }
  return null;
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
    passageLengthUnit: "UTF-16 code units",
  };
}

function textFingerprint(value) {
  const text = typeof value === "string" ? value : "";
  return {
    sha256: text ? createHash("sha256").update(text).digest("hex") : null,
    length: text.length,
    lengthUnit: "UTF-16 code units",
  };
}

function safeProjectSnapshot(project = {}) {
  const known = project.knownData ?? {};
  const variants = (key) => [...new Set([
    ...(Array.isArray(project[key]) ? project[key] : []),
    ...(Array.isArray(known[key]) ? known[key] : []),
  ].filter((value) => typeof value === "string"))].slice(0, 16).map((value) => safeText(value, 160));
  return {
    projectId: safeText(project.projectId ?? project.id ?? project.name ?? project.projectName, 200),
    name: safeText(project.name ?? project.projectName, 240),
    aliases: [...new Set([
      ...(Array.isArray(project.aliases) ? project.aliases : []),
      ...(Array.isArray(known.aliases) ? known.aliases : []),
    ].filter((value) => typeof value === "string"))].slice(0, 16).map((value) => safeText(value, 160)),
    operator: safeText(project.operator ?? known.operator, 200),
    location: safeText(project.location, 240),
    city: safeText(project.city ?? known.city, 100),
    county: safeText(project.county ?? known.county, 100),
    state: safeText(project.state ?? known.state, 80),
    campus: safeText(project.campus ?? project.campusName ?? known.campus, 160),
    facility: safeText(project.facility ?? project.facilityName ?? known.facility, 160),
    phase: safeText(project.phase ?? project.phaseName ?? known.phase, 120),
    building: safeText(project.building ?? project.buildingName ?? known.building, 120),
    facilityVariants: variants("facilityVariants"),
    campusVariants: variants("campusVariants"),
    phaseVariants: variants("phaseVariants"),
    buildingVariants: variants("buildingVariants"),
    facilityIdentifiers: [...new Set([
      project.facilityIdentifiers, project.facilityIds, project.buildingIdentifiers, project.buildingIds,
      project.campusIdentifiers, known.facilityIdentifiers, known.facilityIds,
      known.buildingIdentifiers, known.buildingIds, known.campusIdentifiers,
    ].flatMap((value) => Array.isArray(value) ? value : typeof value === "string" ? [value] : []))]
      .slice(0, 32).map((value) => safeText(value, 80)),
  };
}

function safeClaim(claim = {}) {
  const result = {};
  const truncatedFields = [];
  for (const key of CLAIM_FIELDS) {
    if (!Object.hasOwn(claim, key)) continue;
    const value = claim[key];
    if (Array.isArray(value)) {
      if (value.length > 12) truncatedFields.push(key);
      result[key] = value.slice(0, 12).map((item) => typeof item === "string"
        ? key === "sourceUrls" ? safeUrl(item)
          : safeText(item, key.toLowerCase().includes("passage") || key.toLowerCase().includes("citation") ? 4_000 : 1_200)
        : null).filter((item) => item !== null);
    } else if (value && typeof value === "object") {
      result[key] = key === "identityAssessment"
        ? safeIdentityAssessment(value)
        : safeDiagnosticValue(value);
    } else if (typeof value === "string") {
      const limit = key === "claimPassage" || key.toLowerCase().includes("citation") ? 4_000 : 1_200;
      if (value.length > limit) truncatedFields.push(key);
      result[key] = key === "sourceUrl" ? safeUrl(value) : safeText(value, limit);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value;
    }
  }
  result.snapshotTruncatedFields = truncatedFields;
  return result;
}

function evidenceItemCount(research) {
  const evidence = research?.evidence;
  return Array.isArray(evidence) ? evidence.length
    : evidence && typeof evidence === "object" ? Object.keys(evidence).length : 0;
}

function safeClaimList(research) {
  const evidence = Array.isArray(research?.evidence)
    ? research.evidence
    : research?.evidence && typeof research.evidence === "object"
      ? Object.entries(research.evidence).map(([id, item]) => ({ ...(item ?? {}), id: item?.id ?? id }))
      : [];
  return evidence.slice(0, 48).map(safeClaim);
}

function providerResearchSnapshot(research) {
  const observedEvidenceCount = evidenceItemCount(research);
  const evidence = safeClaimList(research);
  return {
    ...safeProviderResearchContext(research),
    evidence,
    observedEvidenceCount,
    evidenceTruncated: observedEvidenceCount > evidence.length,
  };
}

function researchContextDiff(before, after) {
  const oldContext = safeProviderResearchContext(before);
  const newContext = safeProviderResearchContext(after);
  const diffs = [];
  for (const field of ["projectSummary", "identityAssessment"]) {
    const oldValue = oldContext[field];
    const newValue = newContext[field];
    if (!oldValue || !newValue) {
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diffs.push({ claimId: "__research__", field, oldValue, newValue });
      }
      continue;
    }
    for (const key of new Set([...Object.keys(oldValue), ...Object.keys(newValue)])) {
      if (JSON.stringify(oldValue[key] ?? null) !== JSON.stringify(newValue[key] ?? null)) {
        diffs.push({
          claimId: "__research__",
          field: `${field}.${key}`,
          oldValue: oldValue[key] ?? null,
          newValue: newValue[key] ?? null,
        });
      }
    }
  }
  return diffs;
}

function claimDiff(before, after) {
  const oldById = new Map(safeClaimList(before).map((claim, index) => [claim.id ?? `claim-${index + 1}`, claim]));
  const newById = new Map(safeClaimList(after).map((claim, index) => [claim.id ?? `claim-${index + 1}`, claim]));
  const diffs = [];
  for (const id of new Set([...oldById.keys(), ...newById.keys()])) {
    const oldClaim = oldById.get(id);
    const newClaim = newById.get(id);
    if (!oldClaim || !newClaim) {
      diffs.push({ claimId: id, field: "$claim", oldValue: oldClaim ?? null, newValue: newClaim ?? null });
      continue;
    }
    for (const field of new Set([...Object.keys(oldClaim), ...Object.keys(newClaim)])) {
      const oldValue = oldClaim[field] ?? null;
      const newValue = newClaim[field] ?? null;
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diffs.push({ claimId: id, field, oldValue, newValue });
      }
      if (diffs.length >= 256) return diffs;
    }
  }
  return diffs;
}

export function createResearchFunnelDiagnostics({ runId = null, project = {} } = {}) {
  const candidates = [];
  const authorizations = [];
  const receipts = [];
  const packets = [];
  const engineFailures = [];
  const passageSelections = [];
  const providerEvents = [];
  const providerOriginals = [];
  const transformations = [];
  const mappingReceipts = [];
  const trace = createRedOakClaimTrace();
  let observedCandidates = 0;
  let observedReceipts = 0;
  let observedPassageSelections = 0;
  let observedMappingReceipts = 0;
  let observedProviderEvents = 0;
  let observedProviderOriginals = 0;
  let observedTransformations = 0;
  let observedAnalysisPackets = 0;
  let observedEngineFailures = 0;
  let observedAuthorizations = 0;
  let observedSubstantiveMappingReceipts = 0;
  let observedPlaceholderMappingReceipts = 0;
  let observedNonSubstantiveMappingReceipts = 0;
  let nextProviderAttempt = 0;
  const projectSnapshot = safeProjectSnapshot(project);
  const originalPacket = trace.recordAnalysisPacket.bind(trace);
  trace.recordAnalysisPacket = (details = {}) => {
    originalPacket(details);
    if (details.packet === undefined) {
      const batch = [...packets].reverse().find((item) => item.categoryId === details.categoryId
        && item.attemptType === (details.attemptType ?? "primary") && !item.providerResponseId);
      if (batch) batch.providerResponseId = details.providerResponseId ?? null;
      return;
    }
    observedAnalysisPackets += 1;
    if (packets.length >= 16) return;
    packets.push({
      categoryId: details.categoryId,
      attemptType: details.attemptType ?? "primary",
      providerResponseId: details.providerResponseId ?? null,
      runId,
      projectId: projectSnapshot.projectId,
      state: "issued-to-provider",
      passages: (Array.isArray(details.packet) ? details.packet : []).slice(0, 80).map((source, packetIndex) => ({
        packetIndex,
        ...sourceSnapshot({ ...source, url: source.sourceUrl ?? source.canonicalUrl }),
        ...passageSnapshot(source.passage),
      })),
    });
  };
  const recordPassageSelection = (details = {}) => {
    const records = Array.isArray(details.records) ? details.records : [];
    observedPassageSelections += records.length;
    for (const record of records) {
      if (passageSelections.length >= MAX_PASSAGE_SELECTIONS) break;
      const source = record.source ?? {};
      const passage = source?.accessOutcome?.passage ?? source?.passage ?? "";
      const postFilter = record.postFilterPassage ?? passage;
      const deduplicated = record.deduplicatedPassage ?? postFilter;
      const windowed = record.windowedPassage ?? "";
      const supplied = record.suppliedPassage ?? "";
      const identity = record.identityTrace
        ?? record.identityAdmission?.trace
        ?? null;
      passageSelections.push({
        runId: safeText(details.runId ?? runId, 160),
        projectId: safeText(details.projectId ?? projectSnapshot.projectId, 200),
        categoryId: safeText(details.categoryId, 80),
        attemptType: safeText(details.attemptType ?? "primary", 40),
        attemptId: safeText(details.attemptId, 200),
        sourceId: safeText(source.sourceId ?? source.occurrenceId ?? record.sourceId, 240),
        occurrenceId: safeText(record.occurrenceId ?? source.occurrenceId ?? record.sourceId, 240),
        sourceUrl: safeUrl(source.originalUrl ?? source.url ?? source.canonicalUrl),
        canonicalUrl: safeUrl(source.canonicalUrl ?? source.resolvedUrl ?? source.url),
        sourceFamily: safeText(source.sourceFamily ?? source.sourceClass ?? source.sourceChannel ?? "unavailable", 100),
        context: {
          categoryIds: Array.isArray(source.categoryIds) ? source.categoryIds.slice(0, 12) : [],
          searchDomain: safeText(source.searchDomain, 80),
          routeState: safeText(record.routeState ?? "not-evaluated", 40),
          routeReason: safeText(record.routeReason, 240),
          facility: safeText(source.facilityScope ?? source.facility, 120),
          phase: safeText(source.phaseScope ?? source.phase, 100),
          campus: safeText(source.campusScope ?? source.campus, 120),
          building: safeText(source.buildingScope ?? source.building, 120),
        },
        identityAdmission: safeDiagnosticValue(record.identityAdmission
          ?? { state: "not-evaluated", verdict: null, reason: null }),
        identityTrace: safeDiagnosticValue(identity),
        inclusion: {
          included: record.included === true,
          decision: safeText(record.decision ?? (record.included ? "included" : "excluded"), 80),
          reasonCode: safeText(record.reasonCode ?? null, 120),
          explanation: safeText(record.explanation ?? null, 300),
          duplicateRepresentative: safeText(record.duplicateRepresentative ?? null, 240),
          partial: record.partial === true,
          issueStateAtSelection: "prepared-before-provider-gate",
          issueOutcomeLinkedByAttemptId: Boolean(details.attemptId),
        },
        original: textFingerprint(passage),
        postFilter: textFingerprint(postFilter),
        deduplicated: textFingerprint(deduplicated),
        windowed: textFingerprint(windowed),
        finalSupplied: textFingerprint(supplied),
        stageStates: {
          passageRetained: record.passageRetained ?? "unknown",
          categoryRouting: record.routeState ?? "not-evaluated",
          identityAdmission: record.identityAdmission?.state ?? "not-evaluated",
          deduplication: record.deduplicationState ?? "not-evaluated",
          categoryWindow: record.windowState ?? "not-evaluated",
          tokenFit: record.tokenFitState ?? "not-evaluated",
        },
      });
    }
  };
  const recordProviderEvent = (details = {}) => {
    observedProviderEvents += 1;
    if (providerEvents.length >= MAX_PROVIDER_EVENTS) return null;
    const packet = Array.isArray(details.packet) ? details.packet : [];
    const attemptId = safeText(details.attemptId
      ?? `${details.categoryId ?? "project"}:${details.attemptType ?? "primary"}:${++nextProviderAttempt}`, 200);
    const event = {
      state: safeText(details.state ?? "prepared", 40),
      runId: safeText(details.runId ?? runId, 160),
      projectId: safeText(details.projectId ?? projectSnapshot.projectId, 200),
      categoryId: safeText(details.categoryId, 80),
      attemptType: safeText(details.attemptType ?? "primary", 40),
      attemptId,
      promptVersion: safeText(details.promptVersion, 80),
      schemaVersion: safeText(details.schemaVersion, 80),
      preparedAt: safeText(details.preparedAt, 80),
      queuedAt: safeText(details.queuedAt, 80),
      providerCallStartedAt: safeText(details.providerCallStartedAt, 80),
      issueOutcome: safeText(details.issueOutcome, 40),
      bodyBytes: Number.isInteger(details.bodyBytes) ? details.bodyBytes : null,
      requestBodySha256: /^[a-f0-9]{64}$/i.test(details.requestBodySha256 ?? "")
        ? details.requestBodySha256.toLowerCase() : null,
      estimatedInputTokens: Number.isInteger(details.estimatedInputTokens) ? details.estimatedInputTokens : null,
      sourceIds: packet.slice(0, 80).map((source, index) => ({
        sourceId: safeText(source.sourceId ?? source.occurrenceId ?? source.canonicalUrl ?? `packet-${index + 1}`, 240),
        url: safeUrl(source.sourceUrl ?? source.canonicalUrl ?? source.url),
        passageSha256: textFingerprint(source.passage).sha256,
        passageLength: typeof source.passage === "string" ? source.passage.length : 0,
        categoryIds: Array.isArray(source.categoryIds) ? source.categoryIds.slice(0, 12) : [],
        facilityScope: safeText(source.facilityScope, 120),
        phaseScope: safeText(source.phaseScope, 100),
        campusScope: safeText(source.campusScope, 120),
        buildingScope: safeText(source.buildingScope, 120),
      })),
      suppliedIdentity: safeProjectSnapshot(details.project ?? project),
      outcome: safeText(details.outcome, 120),
      reason: safeText(details.reason, 300),
    };
    providerEvents.push(event);
    return event;
  };
  const recordProviderOriginal = (details = {}) => {
    observedProviderOriginals += 1;
    if (providerOriginals.length >= MAX_PROVIDER_EVENTS) return;
    trace.recordProviderOriginalStructuredOutput({
      categoryId: details.categoryId,
      providerResponseId: details.providerResponseId,
      expectedEvidenceIds: details.expectedEvidenceIds ?? [],
      research: details.research,
    });
    const snapshot = providerResearchSnapshot(details.research);
    providerOriginals.push({
      state: "provider-original-parsed",
      runId: safeText(details.runId ?? runId, 160),
      projectId: safeText(details.projectId ?? projectSnapshot.projectId, 200),
      categoryId: safeText(details.categoryId, 80),
      attemptType: safeText(details.attemptType ?? "primary", 40),
      providerResponseId: safeText(details.providerResponseId, 120),
      parsedAt: safeText(details.parsedAt, 80),
      immutable: true,
      expectedEvidenceIds: Array.isArray(details.expectedEvidenceIds)
        ? details.expectedEvidenceIds.slice(0, 16).map((value) => safeText(value, 80))
        : [],
      evidence: snapshot.evidence,
      observedEvidenceCount: snapshot.observedEvidenceCount,
      evidenceTruncated: snapshot.evidenceTruncated,
      projectSummaryAvailable: snapshot.projectSummaryAvailable,
      projectSummary: snapshot.projectSummary,
      narrativeAvailable: snapshot.projectSummary?.descriptionAvailable === true,
      identityAssessmentAvailable: snapshot.identityAssessmentAvailable,
      identityAssessment: snapshot.identityAssessment,
    });
  };
  const recordTransformation = (details = {}) => {
    observedTransformations += 1;
    if (transformations.length >= MAX_TRANSFORMATIONS) return;
    const allDiffs = [
      ...claimDiff(details.before, details.after),
      ...researchContextDiff(details.before, details.after),
    ];
    const diffs = allDiffs.slice(0, MAX_TRANSFORMATION_DIFFS).map((diff) => ({
      ...diff,
      stage: safeText(details.stage, 80),
      reason: safeText(details.reason, 300),
    }));
    transformations.push({
      runId: safeText(details.runId ?? runId, 160),
      projectId: safeText(details.projectId ?? projectSnapshot.projectId, 200),
      categoryId: safeText(details.categoryId, 80),
      attemptType: safeText(details.attemptType ?? "primary", 40),
      providerResponseId: safeText(details.providerResponseId, 120),
      stage: safeText(details.stage, 80),
      reason: safeText(details.reason, 300),
      before: safeClaimList(details.before),
      after: safeClaimList(details.after),
      beforeContext: safeProviderResearchContext(details.before),
      afterContext: safeProviderResearchContext(details.after),
      diffs,
      observedDiffCount: allDiffs.length,
      diffsTruncated: allDiffs.length > diffs.length,
      unavailableDownstream: Array.isArray(details.unavailableDownstream)
        ? details.unavailableDownstream.slice(0, 16).map((item) => safeText(item, 100))
        : [],
    });
  };
  const recordMappingReceipts = (details = {}) => {
    const items = Array.isArray(details.evidence) ? details.evidence : [];
    observedMappingReceipts += items.length;
    for (const item of items) {
      if (mappingReceipts.length >= 256) break;
      const mappings = Array.isArray(item?.claimMappings) ? item.claimMappings.slice(0, 12) : [];
      const sources = Array.isArray(item?.sources) ? item.sources : [];
      const claimValue = item?.normalizedValue ?? item?.numericValue ?? item?.value;
      const placeholder = item?.isPlaceholder === true
        || item?.unavailable === true
        || ["missing evidence", "not disclosed"].includes(
          String(item?.classification ?? "").trim().toLowerCase(),
        )
        || typeof claimValue === "string"
          && /^(?:missing evidence|not disclosed|unavailable|unknown|n\/a)$/i.test(claimValue.trim());
      const substantive = !placeholder && (
        claimValue !== undefined && claimValue !== null && claimValue !== ""
        || Boolean(item?.claimPassage)
        || Boolean(item?.sourceUrl)
        || Boolean(Array.isArray(item?.sourceUrls) && item.sourceUrls.length)
        || Boolean(item?.status)
      );
      if (placeholder) observedPlaceholderMappingReceipts += 1;
      else if (substantive) observedSubstantiveMappingReceipts += 1;
      else observedNonSubstantiveMappingReceipts += 1;
      mappingReceipts.push({
        runId: safeText(details.runId ?? runId, 160),
        projectId: safeText(details.projectId ?? projectSnapshot.projectId, 200),
        categoryId: safeText(details.categoryId, 80),
        attemptType: safeText(details.attemptType ?? "primary", 40),
        claimId: safeText(item?.id, 120),
        kind: safeText(item?.claimType ?? item?.evidenceType ?? item?.type ?? "unclassified", 120),
        providerCitationUrls: [...new Set([
          ...(Array.isArray(item?.citations) ? item.citations : []),
          ...(Array.isArray(item?.sourceUrls) ? item.sourceUrls : []),
          item?.sourceUrl,
        ].map(safeUrl).filter(Boolean))].slice(0, 8),
        candidateKind: placeholder ? "unavailable-value-placeholder"
          : substantive ? "substantive-candidate" : "non-substantive-schema-entry",
        substantive,
        mappings: mappings.map((mapping) => {
          const candidateUrl = mapping?.sourceId ?? mapping?.sourceUrl;
          const canonicalizedUrl = canonicalizeSourceUrl(candidateUrl);
          const matchedSource = sources.find((source) =>
            canonicalizeSourceUrl(source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url) === canonicalizedUrl);
          const passage = matchedSource?.accessOutcome?.state === "accessible"
            ? matchedSource.accessOutcome.passage
            : matchedSource?.excerpt ?? "";
          const quote = mapping?.exactQuotation ?? mapping?.quote ?? item?.claimPassage ?? "";
          const quotePresent = typeof quote === "string" && Boolean(quote.trim());
          const quoteContained = quotePresent && typeof passage === "string" && passage.includes(quote);
          const quoteFoundInOtherOccurrence = Boolean(quotePresent && matchedSource && sources.some((source) =>
            source !== matchedSource
            && canonicalizeSourceUrl(source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url) === canonicalizedUrl
            && typeof source?.accessOutcome?.passage === "string"
            && source.accessOutcome.passage.includes(quote)));
          const rejectionReasons = Array.isArray(mapping?.rejectionCodes)
            ? mapping.rejectionCodes.slice(0, 16).map((value) => safeText(value, 120))
            : [];
          const supportStatus = mapping?.supportStatus ?? "not-recorded";
          const failureKind = !candidateUrl ? "missing-url"
            : !canonicalizedUrl ? "unresolved-url"
              : !matchedSource ? "url-not-resolved-to-retained-source"
                : !quotePresent ? "absent-quotation"
                  : quoteFoundInOtherOccurrence ? "wrong-retained-passage"
                    : !quoteContained ? "uncontained-quotation"
                      : supportStatus === "context-only" || mapping?.entityScope === "related"
                        ? "non-project-specific-source"
                        : supportStatus === "unsupported-source-type" ? "disallowed-source-type"
                          : supportStatus === "claim-not-mapped"
                            ? rejectionReasons.some((code) => /quantity|unit|status|value|period/i.test(code))
                              ? "unsupported-quantity-unit-status"
                              : "claim-not-mapped-unit-or-status-not-evaluated"
                            : supportStatus === "supported" ? "none" : safeText(supportStatus, 80);
          return {
            sourceUrl: safeUrl(candidateUrl),
            canonicalUrl: safeUrl(canonicalizedUrl),
            canonicalizationState: safeText(mapping?.canonicalizationState
              ?? (!candidateUrl ? "missing-url" : !canonicalizedUrl ? "unresolved-url"
                : canonicalizedUrl === candidateUrl ? "already-canonical" : "canonicalized"), 60),
            resolvedSource: matchedSource ? "retained-source" : canonicalizedUrl ? "not-retained" : "unresolved",
            sourceOccurrenceId: safeText(mapping?.occurrenceId ?? mapping?.sourceOccurrenceId
              ?? matchedSource?.occurrenceId ?? matchedSource?.sourceId, 240),
            passageId: safeText(mapping?.passageId, 240),
            passageSha256: safeText(mapping?.passageSha256
              ?? textFingerprint(passage).sha256, 80),
            quoteSha256: textFingerprint(quote).sha256,
            quoteContainment: safeText(mapping?.quoteContainment ?? mapping?.quotationSupport
              ?? (!quotePresent ? "absent" : quoteContained
                ? "contained-in-retained-passage" : quoteFoundInOtherOccurrence
                  ? "contained-in-other-occurrence" : "not-contained"), 80),
            authorityState: safeText(mapping?.authorityState
              ?? matchedSource?.sourceValidation?.state ?? "not-recorded", 80),
            typeState: safeText(mapping?.sourceTypeState
              ?? (supportStatus === "unsupported-source-type" ? "rejected"
                : supportStatus === "supported" ? "passed" : "not-established"), 80),
            projectSpecificity: safeText(mapping?.projectSpecificityState
              ?? (mapping?.entityScope === "project" ? "project-specific"
                : mapping?.entityScope === "related" ? "non-project-specific" : "unknown"), 80),
            supportStatus: safeText(supportStatus, 80),
            failureKind,
            rejectionReasons,
          };
        }),
        eligibility: item?.eligibleForModel === true ? "passed"
          : item?.eligibleForModel === false ? "rejected" : "not-evaluated",
        sourceValidationState: safeText(item?.sourceValidation?.state ?? "not-evaluated", 80),
      });
    }
  };
  Object.assign(trace, {
    recordPassageSelection,
    recordProviderEvent,
    recordProviderOriginal,
    recordTransformation,
    recordMappingReceipts,
  });
  return {
    claimTrace: trace,
    collector: {
      recordEngineFailure({ categoryId, stage, error } = {}) {
        observedEngineFailures += 1;
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
        observedAuthorizations += 1;
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
      recordPassageSelection,
      recordProviderEvent,
      recordProviderOriginal,
      recordTransformation,
      recordMappingReceipts,
    },
    toJSON() {
      return structuredClone({
        version: 2,
        captureMode: "request-local-observed-bounded",
        runId,
        project: projectSnapshot,
        observedCandidates,
        candidatesTruncated: observedCandidates > candidates.length,
        candidates,
        authorizations,
        observedAuthorizations,
        authorizationsTruncated: observedAuthorizations > authorizations.length,
        observedReceipts,
        receiptsTruncated: observedReceipts > receipts.length,
        receipts,
        analysisPackets: packets,
        analysisPacketsObserved: observedAnalysisPackets,
        analysisPacketsTruncated: observedAnalysisPackets > packets.length,
        passageSelections,
        passageSelectionsObserved: observedPassageSelections,
        passageSelectionsTruncated: observedPassageSelections > passageSelections.length,
        providerEvents,
        providerEventsObserved: observedProviderEvents,
        providerEventsTruncated: observedProviderEvents > providerEvents.length,
        providerOriginals,
        providerOriginalsObserved: observedProviderOriginals,
        providerOriginalsTruncated: observedProviderOriginals > providerOriginals.length,
        transformations,
        transformationsObserved: observedTransformations,
        transformationsTruncated: observedTransformations > transformations.length,
        mappingReceipts,
        mappingReceiptsObserved: observedMappingReceipts,
        mappingReceiptsTruncated: observedMappingReceipts > mappingReceipts.length,
        mappingReceiptKinds: {
          substantiveCandidates: observedSubstantiveMappingReceipts,
          unavailableValuePlaceholders: observedPlaceholderMappingReceipts,
          nonSubstantiveSchemaEntries: observedNonSubstantiveMappingReceipts,
        },
        engineFailures,
        engineFailuresObserved: observedEngineFailures,
        engineFailuresTruncated: observedEngineFailures > engineFailures.length,
        claimTrace: trace.toJSON(),
        limitations: [
          "Extraction reports retained text; pre-extraction raw passage counts are unavailable.",
          "Unissued category analyses have no analysis packet, not a negative finding.",
          "Source metadata absent from the production packet remains unavailable.",
          "Diagnostic passages are sanitized and bounded; hashes identify original text.",
          "Provider request and response bodies are never persisted; only allowlisted fields and passage hashes are retained.",
          "Provider-original evidence records are immutable snapshots taken after successful JSON parsing and before SafeLoc transformations.",
          "Source/scope states not produced by the shared evaluator remain not-evaluated or unavailable; labels alone do not count as a passed gate.",
        ],
      });
    },
  };
}