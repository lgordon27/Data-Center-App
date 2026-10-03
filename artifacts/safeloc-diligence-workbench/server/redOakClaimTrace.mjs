import { createHash } from "node:crypto";
import { canonicalizeSourceUrl } from "../src/data/sourceValidationPolicy.mjs";

const TRACE_VERSION = 1;
const MAX_CLAIMS = 48;
const MAX_RESPONSES = 16;
const MAX_REJECTION_CODES = 16;
const TRACE_STAGES = [
  "providerOutput",
  "structuredParsing",
  "categoryRestriction",
  "sourceRestriction",
  "normalization",
  "merge",
  "identityEvaluation",
  "scopeEvaluation",
  "sourceQuotationMapping",
  "sourceAuthority",
  "periodStatus",
  "eligibility",
  "containment",
  "clientParsing",
  "proposalSelection",
];

function boundedText(value, maxLength = 160) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim()
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|AIza)[-_A-Za-z0-9]{12,}\b/g, "[redacted-key]")
    .replace(/\b(api[_ -]?key|authorization|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-address]")
    .slice(0, maxLength);
}

function safeId(value, maxLength = 120) {
  const text = boundedText(value, maxLength);
  return text && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(text) ? text : null;
}

function safeCategory(value) {
  const text = safeId(value, 80);
  return text && /^[a-z0-9-]{1,80}$/.test(text) ? text : "unknown";
}

function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === "vertexaisearch.cloud.google.com") {
      url.pathname = `/grounding-api-redirect/redacted-${createHash("sha256").update(url.pathname).digest("hex").slice(0, 16)}`;
    } else if (/\/(?:redirect|redirection|out|click|link|url)\/[^/]{16,}$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/[^/]+$/, (segment) =>
        `redacted-${createHash("sha256").update(segment).digest("hex").slice(0, 16)}`);
    }
    url.search = "";
    url.hash = "";
    // Provider URLs can contain signed or otherwise sensitive query values.
    // The host and path are sufficient to correlate a source in a diagnostic.
    return `${url.origin}${url.pathname}`.slice(0, 1_200);
  } catch {
    return null;
  }
}

function safeScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  return boundedText(value, 120);
}

function safeCodes(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => typeof value === "string" ? value.trim().toLowerCase() : "")
    .filter((value) => /^[a-z0-9][a-z0-9_-]{0,119}$/.test(value)))]
    .slice(0, MAX_REJECTION_CODES);
}

function evidenceItems(evidence) {
  if (Array.isArray(evidence)) return evidence.slice(0, MAX_CLAIMS);
  if (!evidence || typeof evidence !== "object") return [];
  return Object.entries(evidence).slice(0, MAX_CLAIMS).map(([id, item]) => ({
    ...(item && typeof item === "object" ? item : {}),
    id: item?.id ?? id,
  }));
}

function evidenceItemCount(evidence) {
  return Array.isArray(evidence) ? evidence.length
    : evidence && typeof evidence === "object" ? Object.keys(evidence).length : 0;
}

function providerResponseId(value) {
  return safeId(value, 120);
}

function claimKey(categoryId, responseId, claimId) {
  return `${safeCategory(categoryId)}|${providerResponseId(responseId) ?? "unknown"}|${safeId(claimId) ?? "unknown"}`;
}

function recordFromRawClaim(claim, categoryId, responseId, fallbackId) {
  const claimId = safeId(claim?.id) ?? safeId(fallbackId) ?? `claim-${fallbackId}`;
  const quote = typeof claim?.claimPassage === "string" ? claim.claimPassage : "";
  const boundedQuote = quote.trim().slice(0, 4_000);
  const sourceUrls = [
    claim?.sourceUrl,
    ...(Array.isArray(claim?.sourceUrls) ? claim.sourceUrls : []),
  ];
  const canonicalSourceUrl = sourceUrls.map(safeUrl).find(Boolean) ?? null;
  return {
    claimId,
    categoryId: safeCategory(categoryId),
    providerResponseId: providerResponseId(responseId),
    structuredReceiptState: "received",
    normalizedValue: safeScalar(claim?.normalizedValue ?? claim?.numericValue ?? claim?.value),
    normalizedUnit: boundedText(claim?.normalizedUnit ?? claim?.unit, 80),
    supportingQuoteSha256: boundedQuote
      ? createHash("sha256").update(boundedQuote).digest("hex")
      : null,
    supportingQuoteHashTruncated: quote.trim().length > 4_000,
    providerCitationUrls: [...new Set(sourceUrls.map(safeUrl).filter(Boolean))].slice(0, 8),
    providerCitationCount: sourceUrls.filter((url) => typeof url === "string").length,
    providerCitationsTruncated: sourceUrls.filter((url) => typeof url === "string").length > 8,
    candidateKind: "unclassified-until-validation",
    substantive: null,
    placeholder: false,
    duplicateOf: null,
    canonicalSourceUrl,
    projectIdentity: { state: "not-evaluated", exactProject: null },
    facilityPhaseScope: {
      state: "not-evaluated",
      facilityScope: null,
      phaseScope: null,
    },
    timeScope: { state: "not-evaluated", claimTimePeriod: null },
    semanticUnitValidation: { state: "not-evaluated", normalizedValue: null, normalizedUnit: null, reasonCode: null },
    sourceValidation: { state: "not-evaluated", rejectionCodes: [] },
    containment: { state: "not-evaluated", eligibleForModel: null, reasonCodes: [] },
    stages: Object.fromEntries(TRACE_STAGES.map((stage) => [stage, {
      state: "not-evaluated",
      reasonCode: null,
    }])),
    firstFailedGate: null,
    firstCausalFailure: null,
    causalClassification: "unclassified-until-validation",
    downstreamNotEvaluated: [],
    sourceMappingReceipts: [],
    identityEvaluations: [],
    identityEvaluationsObserved: 0,
    identityEvaluationsTruncated: false,
    mappingEvaluations: [],
    mappingEvaluationsObserved: 0,
    mappingEvaluationsTruncated: false,
    proposalCreated: null,
  };
}

export function createRedOakClaimTrace({ maxClaims = MAX_CLAIMS } = {}) {
  const boundedClaimLimit = Number.isInteger(maxClaims) ? Math.max(1, Math.min(MAX_CLAIMS, maxClaims)) : MAX_CLAIMS;
  const claims = new Map();
  const responses = new Map();
  const analysisPassages = [];
  let observedResponses = 0;
  let omittedResponses = 0;
  let observedClaimRecords = 0;
  let omittedClaimRecords = 0;
  let observedAnalysisBatches = 0;

  const getRecord = ({ categoryId, providerResponseId: responseId, claimId }) => {
    if (claimId !== undefined && claimId !== null) {
      return claims.get(claimKey(categoryId, responseId, claimId)) ?? null;
    }
    const candidates = [...claims.values()].filter((claim) => claim.categoryId === safeCategory(categoryId));
    return candidates.at(-1) ?? null;
  };
  const categoryForEvidence = (item) => {
    const sources = Array.isArray(item?.sources) ? item.sources : [];
    const source = sources.find((candidate) => candidate?.categoryId || candidate?.searchDomain);
    return safeCategory(item?.categoryId ?? source?.categoryId ?? source?.searchDomain);
  };
  const recordForClientEvidence = (item) => {
    const category = categoryForEvidence(item);
    const candidates = [...claims.values()].filter((claim) => claim.claimId === safeId(item?.id));
    return candidates.find((claim) => claim.categoryId === category) ?? candidates.at(-1) ?? null;
  };

  const setStage = (record, stage, passed, reasonCode = null, countAsFirstFailure = true) => {
    if (!record || !TRACE_STAGES.includes(stage)) return;
    const state = passed === true ? "passed" : passed === false ? "failed"
      : ["passed", "failed", "unknown", "not-evaluated"].includes(passed) ? passed : "not-evaluated";
    const reason = safeId(reasonCode, 120);
    record.stages[stage] = { state, reasonCode: state === "failed" ? reason : null };
    if (countAsFirstFailure && !record.firstFailedGate && state === "failed") {
      record.firstFailedGate = { gate: stage, reasonCode: reason ?? "unspecified" };
    }
  };
  const setResponseParseState = ({ categoryId, providerResponseId: responseId, passed, reasonCode } = {}) => {
    const responseKey = `${safeCategory(categoryId)}|${providerResponseId(responseId) ?? "unknown"}`;
    const response = responses.get(responseKey);
    if (response) {
      response.parseState = passed === true ? "validated" : passed === false ? "rejected" : "not-evaluated";
      response.parseErrorCode = passed === false ? safeId(reasonCode) ?? "malformed-response" : null;
    }
    for (const claim of claims.values()) {
      if (claim.categoryId !== safeCategory(categoryId)
        || claim.providerResponseId !== providerResponseId(responseId)
        || claim.structuredReceiptState !== "received") continue;
      setStage(claim, "structuredParsing", passed, reasonCode);
      if (passed === true && !claim.firstFailedGate && claim.stages.categoryRestriction.state === "failed") {
        claim.firstFailedGate = {
          gate: "categoryRestriction",
          reasonCode: claim.stages.categoryRestriction.reasonCode ?? "outside-category-schema",
        };
      }
    }
  };

  return {
    recordUnavailableStructuredResponse({
      categoryId,
      providerResponseId: responseId,
      expectedEvidenceIds = [],
      state = "unavailable",
      reasonCode = "structured-response-unavailable",
    } = {}) {
      const category = safeCategory(categoryId);
      const response = providerResponseId(responseId);
      const responseKey = `${category}|${response ?? "unknown"}`;
      if (!responses.has(responseKey)) observedResponses += 1;
      if (responses.size >= MAX_RESPONSES && !responses.has(responseKey)) {
        omittedResponses += 1;
        return;
      }
      const existing = responses.get(responseKey);
      if (existing && ["claims-received", "malformed", "no-claims"].includes(existing.state)) return;
      responses.set(responseKey, {
        categoryId: category,
        providerResponseId: response,
        state: state === "not-issued" ? "not-issued" : "unavailable",
        reasonCode: safeId(reasonCode) ?? "structured-response-unavailable",
        claimCount: null,
        claimCountState: "unavailable",
        substantiveClaimCount: null,
        placeholderCount: null,
        expectedEvidenceIds: (Array.isArray(expectedEvidenceIds) ? expectedEvidenceIds : [])
          .map((id) => safeId(id, 120))
          .filter(Boolean)
          .slice(0, MAX_CLAIMS),
        omittedClaimIds: [],
        parseState: "not-evaluated",
        parseErrorCode: null,
      });
    },

    recordProviderOriginalStructuredOutput({
      categoryId,
      providerResponseId: responseId,
      expectedEvidenceIds = [],
      research,
    } = {}) {
      this.recordStructuredReceipt({
        categoryId,
        providerResponseId: responseId,
        expectedEvidenceIds,
        research,
      });
      const responseKey = `${safeCategory(categoryId)}|${providerResponseId(responseId) ?? "unknown"}`;
      const response = responses.get(responseKey);
      if (response) response.providerOriginalCaptured = true;
    },

    recordAnalysisPacket({
      categoryId,
      providerResponseId: responseId,
      attemptType = "primary",
      packet,
    } = {}) {
      if (safeCategory(categoryId) !== "grid") return;
      const attempt = safeId(attemptType, 40) ?? "primary";
      if (packet === undefined) {
        const pendingBatch = [...analysisPassages].reverse().find((item) =>
          item.categoryId === "grid" && item.attemptType === attempt && !item.providerResponseId);
        if (pendingBatch && responseId) pendingBatch.providerResponseId = providerResponseId(responseId);
        return;
      }
      observedAnalysisBatches += 1;
      if (analysisPassages.length >= 8) return;
      const batch = {
        categoryId: "grid",
        providerResponseId: providerResponseId(responseId),
        attemptType: attempt,
        state: "issued-to-provider",
        packetSha256: null,
        passageCount: 0,
        passages: [],
      };
      analysisPassages.push(batch);
      const packetEntries = Array.isArray(packet) ? packet.slice(0, MAX_CLAIMS) : [];
      batch.packetSha256 = createHash("sha256").update(JSON.stringify(packetEntries)).digest("hex");
      batch.passageCount = packetEntries.length;
      const normalizedPassages = packetEntries.flatMap((source, packetIndex) => {
        const text = typeof source?.passage === "string" ? source.passage : "";
        const sourceUrl = safeUrl(source?.canonicalUrl ?? source?.sourceUrl);
        if (!text.trim() || !sourceUrl) return [];
        const passageHash = createHash("sha256").update(text).digest("hex");
        return [{
          packetIndex,
          passageId: `passage-${passageHash.slice(0, 24)}`,
          canonicalSourceUrl: sourceUrl,
          sourceUrl: safeUrl(source?.sourceUrl ?? source?.canonicalUrl),
          title: boundedText(source?.title, 200),
          excerpt: boundedText(text, 500),
          excerptTruncated: text.length > 500,
          quoteSha256: passageHash,
        }];
      });
      batch.passages = normalizedPassages.slice(0, MAX_CLAIMS);
    },

    recordAnalysisPassages({
      categoryId,
      providerResponseId: responseId,
      attemptType = "primary",
      passages = [],
    } = {}) {
      if (safeCategory(categoryId) !== "grid") return;
      if (!Array.isArray(passages) || passages.length === 0) {
        this.recordAnalysisPacket({
          categoryId,
          providerResponseId: responseId,
          attemptType,
        });
        return;
      }
      const normalizedPacket = (Array.isArray(passages) ? passages : []).flatMap((source) => {
        const passage = typeof source?.claimPassage === "string"
          ? source.claimPassage
          : typeof source?.accessOutcome?.passage === "string" ? source.accessOutcome.passage : "";
        const canonicalUrl = source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url
          ?? source?.accessOutcome?.canonicalUrl;
        return passage && canonicalUrl ? [{ canonicalUrl, sourceUrl: canonicalUrl, passage, title: source?.title }] : [];
      });
      this.recordAnalysisPacket({
        categoryId,
        providerResponseId: responseId,
        attemptType,
        packet: normalizedPacket,
      });
    },

    recordStructuredReceipt({
      categoryId,
      providerResponseId: responseId,
      research,
      expectedEvidenceIds = [],
      outcome = null,
    } = {}) {
      const category = safeCategory(categoryId);
      const response = providerResponseId(responseId);
      const responseKey = `${category}|${response ?? "unknown"}`;
      if (!responses.has(responseKey)) observedResponses += 1;
      if (responses.size >= MAX_RESPONSES && !responses.has(responseKey)) {
        omittedResponses += 1;
        return;
      }
      const rawEvidence = research?.evidence;
      const expectedIds = Array.isArray(expectedEvidenceIds) ? expectedEvidenceIds : [];
      const existing = responses.get(responseKey);
      if (existing?.providerOriginalCaptured) {
        return {
          state: existing.state,
          claimCount: existing.claimCount,
          claimCountState: existing.claimCountState ?? "observed",
          alreadyCapturedProviderOriginal: true,
        };
      }
      const rawClaimCount = evidenceItemCount(rawEvidence);
      observedClaimRecords += rawClaimCount;
      const items = evidenceItems(rawEvidence).slice(0, boundedClaimLimit);
      if (rawClaimCount > items.length) omittedClaimRecords += rawClaimCount - items.length;
      const validResearch = Boolean(research && typeof research === "object" && !Array.isArray(research));
      const identityOnlyResponse = category === "project-identity" && Boolean(research?.identityAssessment);
      const malformed = !validResearch
        || !research?.projectSummary
        || (!identityOnlyResponse && !Array.isArray(rawEvidence) && (!rawEvidence || typeof rawEvidence !== "object"));
      responses.set(responseKey, {
        categoryId: category,
        providerResponseId: response,
        state: outcome === "rejected" ? "malformed"
          : malformed ? "malformed"
            : items.length ? "claims-received" : "no-claims",
        claimCount: malformed ? null : rawClaimCount,
        claimCountState: malformed ? "unavailable" : "observed",
        capturedClaimCount: items.length,
        claimsTruncated: !malformed && rawClaimCount > items.length,
        expectedEvidenceIds: expectedIds
          .map((id) => safeId(id, 120))
          .filter(Boolean)
          .slice(0, MAX_CLAIMS),
        validationErrorType: outcome === "rejected" || malformed ? "malformed-response" : null,
      });
      for (const [index, claim] of items.entries()) {
        const id = safeId(claim?.id) ?? `claim-${index + 1}`;
        const key = claimKey(category, response, id);
        if (!claims.has(key) && claims.size >= boundedClaimLimit) {
          omittedClaimRecords += 1;
          continue;
        }
        const record = claims.get(key) ?? recordFromRawClaim(claim, category, response, id);
        if (!claims.has(key)) claims.set(key, record);
        setStage(record, "providerOutput", true, null, false);
        record.stages.structuredParsing = { state: "not-evaluated", reasonCode: null };
        const allowedIds = new Set(expectedIds.map((value) => safeId(value)).filter(Boolean));
        if (expectedIds.length && !allowedIds.has(id)) {
          setStage(record, "categoryRestriction", false, "outside-category-schema", false);
        } else {
          setStage(record, "categoryRestriction", true, null, false);
        }
      }
      const receivedIds = new Set(items.map((item, index) =>
        safeId(item?.id) ?? `claim-${index + 1}`));
      const omittedClaimIds = [];
      for (const expectedId of expectedIds.slice(0, boundedClaimLimit)) {
        const id = safeId(expectedId);
        if (!id || receivedIds.has(id)) continue;
        omittedClaimIds.push(id);
        const key = claimKey(category, response, id);
        if (claims.has(key) || claims.size >= boundedClaimLimit) continue;
        const record = recordFromRawClaim({ id }, category, response, id);
        record.structuredReceiptState = "omitted";
        record.candidateKind = "no-claim-result";
        record.substantive = false;
        record.placeholder = false;
        claims.set(key, record);
        setStage(record, "structuredParsing", false, "claim-omitted-from-response");
      }
      const responseRecord = responses.get(responseKey);
      if (responseRecord) responseRecord.omittedClaimIds = omittedClaimIds.slice(0, MAX_CLAIMS);
      return { state: malformed ? "malformed" : items.length ? "claims-received" : "no-claims", claimCount: items.length };
    },

    recordStructuredParsing({ categoryId, providerResponseId: responseId, claimId, passed, reasonCode } = {}) {
      const record = getRecord({ categoryId, providerResponseId: responseId, claimId });
      setStage(record, "structuredParsing", passed, reasonCode);
      if (record && passed === true && !record.firstFailedGate && record.stages.categoryRestriction.state === "failed") {
        record.firstFailedGate = {
          gate: "categoryRestriction",
          reasonCode: record.stages.categoryRestriction.reasonCode ?? "outside-category-schema",
        };
      }
    },

    recordStructuredParseResult: setResponseParseState,

    recordStage({ categoryId, providerResponseId: responseId, claimId, stage, passed, reasonCode } = {}) {
      const record = getRecord({ categoryId, providerResponseId: responseId, claimId });
      setStage(record, stage, passed, reasonCode);
    },

    recordIdentityEvaluation({
      categoryId,
      providerResponseId: responseId,
      claimId,
      source = {},
      requestedProject = {},
      evaluationPass = "production-source-identity",
      decision = {},
    } = {}) {
      const record = getRecord({ categoryId, providerResponseId: responseId, claimId });
      if (!record) return;
      record.identityEvaluationsObserved += 1;
      if (record.identityEvaluations.length >= 32) {
        record.identityEvaluationsTruncated = true;
        return;
      }
      const resolver = decision?.resolver ?? decision?.trace?.resolver ?? null;
      const trace = decision?.trace ?? null;
      const passage = source?.accessOutcome?.state === "accessible"
        ? source.accessOutcome.passage
        : source?.claimPassage ?? source?.excerpt ?? "";
      const sourceUrl = safeUrl(source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url);
      const requestedIdentity = trace?.requestedIdentity ?? {};
      const matchedVariants = (Array.isArray(trace?.matchedVariants) ? trace.matchedVariants : [])
        .slice(0, 24)
        .map((entry) => ({
          label: boundedText(entry?.label, 160),
          kind: safeId(entry?.kind, 80),
          start: Number.isInteger(entry?.start) ? entry.start : null,
          end: Number.isInteger(entry?.end) ? entry.end : null,
          matchedTokenCount: Number.isInteger(entry?.matchedTokenCount) ? entry.matchedTokenCount : null,
          requiredTokenCount: Number.isInteger(entry?.requiredTokenCount) ? entry.requiredTokenCount : null,
        }));
      const locations = (Array.isArray(trace?.locations) ? trace.locations : []).slice(0, 32).map((entry) => ({
        location: Object.fromEntries(Object.entries(entry?.location ?? {})
          .slice(0, 8).map(([key, value]) => [safeId(key, 60) ?? "field", boundedText(value, 120)])),
        start: Number.isInteger(entry?.start) ? entry.start : null,
        end: Number.isInteger(entry?.end) ? entry.end : null,
        attachedToProjectContext: entry?.attachedToProjectContext === true,
        matches: (Array.isArray(entry?.matches) ? entry.matches : []).slice(0, 8).map((value) => boundedText(value, 120)),
        conflicts: (Array.isArray(entry?.conflicts) ? entry.conflicts : []).slice(0, 8).map((value) => boundedText(value, 120)),
      }));
      const actors = (Array.isArray(trace?.actors) ? trace.actors : []).slice(0, 32).map((actor) => ({
        actor: boundedText(actor?.actor, 120),
        role: safeId(actor?.role, 100) ?? "unclassified",
        supportingSpan: boundedText(actor?.supportingSpan, 240),
        spanStart: Number.isInteger(actor?.spanStart) ? actor.spanStart : null,
        spanEnd: Number.isInteger(actor?.spanEnd) ? actor.spanEnd : null,
        attributionRule: boundedText(actor?.attributionRule, 160),
        admittedAsOperator: typeof actor?.admittedAsOperator === "boolean" ? actor.admittedAsOperator : null,
      }));
      const verdict = safeId(resolver?.verdict, 80);
      record.identityEvaluations.push({
        evaluationPass: safeId(evaluationPass, 80) ?? "production-source-identity",
        state: decision?.state === "passed" || verdict === "exact-project" ? "passed"
          : decision?.state === "not-evaluated" ? "not-evaluated"
            : verdict === "unrelated" ? "rejected"
              : verdict === "ambiguous" || verdict === "related-facility" ? "unknown"
                : "not-evaluated",
        sourceUrl,
        sourceOccurrenceId: boundedText(source?.occurrenceId ?? source?.sourceId, 240),
        sourceFamily: boundedText(source?.sourceClass ?? source?.sourceFamily ?? source?.sourceChannel, 100),
        passageSha256: typeof passage === "string" && passage
          ? createHash("sha256").update(passage).digest("hex") : null,
        resolver: resolver ? {
          verdict,
          primaryReason: boundedText(resolver.reason, 320),
        } : null,
        requestedIdentity: {
          name: boundedText(requestedIdentity.name, 160),
          aliases: (Array.isArray(requestedIdentity.aliases) ? requestedIdentity.aliases : []).slice(0, 16)
            .map((value) => boundedText(value, 160)),
          operator: boundedText(requestedIdentity.operator, 160),
          operatorVariants: (Array.isArray(requestedIdentity.operatorVariants) ? requestedIdentity.operatorVariants : [])
            .slice(0, 16).map((value) => boundedText(value, 160)),
          city: boundedText(requestedIdentity.city, 100),
          county: boundedText(requestedIdentity.county, 100),
          state: boundedText(requestedIdentity.state, 80),
          campus: boundedText(requestedIdentity.campus, 160),
          campusVariants: (Array.isArray(requestedIdentity.campusVariants) ? requestedIdentity.campusVariants : [])
            .slice(0, 16).map((value) => boundedText(value, 160)),
          facility: boundedText(requestedIdentity.facility, 160),
          facilityVariants: (Array.isArray(requestedIdentity.facilityVariants) ? requestedIdentity.facilityVariants : [])
            .slice(0, 16).map((value) => boundedText(value, 160)),
          phase: boundedText(requestedIdentity.phase, 120),
          phaseVariants: (Array.isArray(requestedIdentity.phaseVariants) ? requestedIdentity.phaseVariants : [])
            .slice(0, 16).map((value) => boundedText(value, 120)),
          building: boundedText(requestedIdentity.building, 120),
          buildingVariants: (Array.isArray(requestedIdentity.buildingVariants) ? requestedIdentity.buildingVariants : [])
            .slice(0, 16).map((value) => boundedText(value, 120)),
          facilityIdentifiers: (Array.isArray(requestedIdentity.facilityIdentifiers) ? requestedIdentity.facilityIdentifiers : [])
            .slice(0, 32).map((value) => boundedText(value, 80)),
        },
        projectRequest: {
          name: boundedText(requestedProject?.name ?? requestedProject?.projectName, 160),
          operator: boundedText(requestedProject?.operator ?? requestedProject?.knownData?.operator, 160),
          location: boundedText(requestedProject?.location, 180),
          campus: boundedText(requestedProject?.campus ?? requestedProject?.knownData?.campus, 140),
          facility: boundedText(requestedProject?.facility ?? requestedProject?.knownData?.facility, 140),
          phase: boundedText(requestedProject?.phase ?? requestedProject?.knownData?.phase, 120),
          building: boundedText(requestedProject?.building ?? requestedProject?.knownData?.building, 120),
        },
        matchedVariants,
        matchedName: matchedVariants.find((entry) => entry.kind === "name")?.label ?? null,
        matchedOperator: matchedVariants.find((entry) => entry.kind === "operator")?.label ?? null,
        matchedCampus: matchedVariants.find((entry) => entry.kind === "campus")?.label ?? null,
        matchedFacility: matchedVariants.find((entry) => entry.kind === "facility")?.label ?? null,
        matchedPhase: matchedVariants.find((entry) => entry.kind === "phase")?.label ?? null,
        locationMatches: locations.filter((entry) => entry.matches.length),
        locationConflicts: locations.filter((entry) => entry.conflicts.length),
        facilityIdentifierMatches: (Array.isArray(trace?.facilityIdentifiers) ? trace.facilityIdentifiers : [])
          .slice(0, 32).map((entry) => ({
            value: boundedText(entry?.value, 80),
            start: Number.isInteger(entry?.start) ? entry.start : null,
            end: Number.isInteger(entry?.end) ? entry.end : null,
          })),
        actors,
        primaryReason: boundedText(decision?.reasonCode ?? resolver?.reason, 320),
        secondaryReasons: (Array.isArray(trace?.secondaryReasons) ? trace.secondaryReasons : [])
          .slice(0, 16).map((value) => boundedText(value, 240)),
      });
    },

    recordMappingEvaluation({
      categoryId,
      providerResponseId: responseId,
      claimId,
      requestedProject = {},
      source = {},
      sourceIndex = null,
      mapping = {},
      exactProject = false,
      sourceTypeAllowed = false,
      claimSupportedExplicitly = false,
      claimSupportEvaluation = null,
      scopeEvaluation = null,
      claimValue = null,
      claimUnit = null,
      claimStatus = null,
    } = {}) {
      const record = getRecord({ categoryId, providerResponseId: responseId, claimId });
      if (!record) return;
      record.mappingEvaluationsObserved += 1;
      if (record.mappingEvaluations.length >= 32) {
        record.mappingEvaluationsTruncated = true;
        return;
      }
      const candidateUrl = mapping?.sourceId ?? mapping?.sourceUrl
        ?? source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url;
      const canonicalizedUrl = canonicalizeSourceUrl(candidateUrl);
      const passage = source?.accessOutcome?.state === "accessible"
        ? source.accessOutcome.passage
        : source?.excerpt ?? "";
      const quote = mapping?.exactQuotation ?? source?.claimPassage ?? "";
      const quotePresent = typeof quote === "string" && Boolean(quote.trim());
      const normalizedQuote = typeof quote === "string" ? quote.trim().replace(/\s+/g, " ").toLowerCase() : "";
      const normalizedPassage = typeof passage === "string" ? passage.trim().replace(/\s+/g, " ").toLowerCase() : "";
      const quoteContained = Boolean(normalizedQuote && normalizedPassage.includes(normalizedQuote));
      const supportState = safeId(mapping?.supportStatus, 80) ?? "not-evaluated";
      const scopeCodes = safeCodes(scopeEvaluation?.rejectionCodes ?? []);
      const failureKind = !candidateUrl ? "missing-url"
        : !canonicalizedUrl ? "unresolved-url"
          : !quotePresent ? "absent-quotation"
            : !quoteContained ? "uncontained-quotation"
              : supportState === "context-only" ? "non-project-specific-source"
                : supportState === "unsupported-source-type" ? "disallowed-source-type"
                  : supportState === "claim-not-mapped"
                    ? claimSupportEvaluation?.reasonCode === "claim-value-not-found-in-quotation"
                      ? "claim-value-not-found-in-quotation"
                      : claimSupportEvaluation?.reasonCode === "claim-value-does-not-match-support"
                        ? "unsupported-quantity-value"
                        : "claim-not-mapped-unit-or-status-not-evaluated"
                    : scopeCodes.length
                      ? scopeEvaluation?.state === "rejected" ? "scope-rejected" : "scope-unknown"
                      : supportState === "supported" ? "none" : supportState;
      record.mappingEvaluations.push({
        sourceIndex: Number.isInteger(sourceIndex) ? sourceIndex : null,
        sourceUrl: safeUrl(candidateUrl),
        canonicalizationState: canonicalizedUrl
          ? canonicalizedUrl === candidateUrl ? "already-canonical" : "canonicalized"
          : candidateUrl ? "unresolved-url" : "missing-url",
        canonicalUrl: safeUrl(canonicalizedUrl),
        sourceOccurrenceId: boundedText(source?.occurrenceId ?? source?.sourceId, 240),
        sourceFamily: boundedText(source?.sourceClass ?? source?.sourceFamily ?? source?.sourceChannel, 100),
        passageId: boundedText(mapping?.passageId, 240),
        passageSha256: typeof passage === "string" && passage
          ? createHash("sha256").update(passage).digest("hex") : null,
        quotation: boundedText(quote, 4_000),
        quotationSha256: quotePresent ? createHash("sha256").update(quote).digest("hex") : null,
        quotationLength: quotePresent ? quote.length : 0,
        quotationTruncated: quotePresent && quote.length > 4_000,
        quotationContainment: quoteContained ? "contained-in-retained-passage"
          : quotePresent ? "not-contained" : "absent",
        identity: {
          state: exactProject ? "passed"
            : mapping?.entityScope === "related" ? "rejected" : "unknown",
          entityScope: safeId(mapping?.entityScope, 80),
        },
        authorityAndType: {
          sourceType: boundedText(mapping?.sourceType ?? source?.sourceClass, 100),
          sourceTypeState: sourceTypeAllowed ? "passed"
            : supportState === "unsupported-source-type" ? "rejected" : "not-established",
          authorityState: boundedText(source?.authorityState ?? source?.sourceValidation?.state, 80) ?? "not-evaluated",
        },
        projectSpecificity: {
          state: exactProject ? "project-specific"
            : mapping?.entityScope === "related" ? "non-project-specific" : "unknown",
          resolverState: exactProject ? "exact-project" : "not-established",
        },
        scopeEvaluation: {
          state: ["passed", "rejected", "unknown", "not-evaluated"].includes(scopeEvaluation?.state)
            ? scopeEvaluation.state : "not-evaluated",
          evaluator: safeId(scopeEvaluation?.evaluator, 120),
          labelAndTimeCompletenessState: ["passed", "rejected", "unknown", "not-evaluated"]
            .includes(scopeEvaluation?.labelAndTimeCompletenessState)
            ? scopeEvaluation.labelAndTimeCompletenessState : "not-evaluated",
          evaluatedChecks: (Array.isArray(scopeEvaluation?.evaluatedChecks) ? scopeEvaluation.evaluatedChecks : [])
            .slice(0, 8).map((value) => safeId(value, 100)),
          requestedScope: {
            campus: boundedText(requestedProject?.campus ?? requestedProject?.knownData?.campus, 140),
            facility: boundedText(requestedProject?.facility ?? requestedProject?.knownData?.facility, 140),
            phase: boundedText(requestedProject?.phase ?? requestedProject?.knownData?.phase, 120),
            building: boundedText(requestedProject?.building ?? requestedProject?.knownData?.building, 120),
          },
          claimedScope: {
            campus: boundedText(source?.campusScope ?? source?.campus, 140),
            facility: boundedText(source?.facilityScope ?? source?.facility, 140),
            phase: boundedText(source?.phaseScope ?? source?.phase, 120),
            building: boundedText(source?.buildingScope ?? source?.building, 120),
            timePeriod: boundedText(source?.timePeriod ?? source?.claimTimePeriod, 120),
          },
          parentChildRelationship: boundedText(
            source?.parentChildRelationship ?? source?.entityScope ?? mapping?.entityScope,
            120,
          ),
          matchedSignals: (Array.isArray(scopeEvaluation?.matchedSignals) ? scopeEvaluation.matchedSignals : [])
            .slice(0, 16).map((value) => boundedText(value, 160)),
          conflictingSignals: (Array.isArray(scopeEvaluation?.conflictingSignals) ? scopeEvaluation.conflictingSignals : [])
            .slice(0, 16).map((value) => boundedText(value, 160)),
          ambiguityReasons: (scopeEvaluation?.ambiguityReasons?.length
            ? scopeEvaluation.ambiguityReasons : scopeCodes.length
              ? scopeCodes : ["requested-scope-comparison-not-evaluated"])
            .slice(0, 16).map((value) => boundedText(String(value), 240)).filter(Boolean),
          reason: boundedText(scopeEvaluation?.reasonCode
            ?? (scopeEvaluation?.state === "not-evaluated"
              ? "Requested campus/facility/phase comparison was not evaluated."
              : scopeCodes.join("; ")), 320),
          requestedScopeComparison: "not-evaluated-by-this-evaluator",
        },
        clauseBoundSupport: {
          claimSupportExplicit: claimSupportedExplicitly,
          quotationContained: claimSupportEvaluation?.quotationContained ?? quoteContained,
          textValueSupported: claimSupportEvaluation?.textValueSupported ?? null,
          claimValueSupported: claimSupportEvaluation?.claimValueSupported ?? null,
          quantity: typeof claimValue === "number" ? claimValue : boundedText(claimValue, 100),
          unit: boundedText(claimUnit, 80),
          status: boundedText(claimStatus, 100),
          unitSupport: claimSupportEvaluation?.unitSupport ?? "not-evaluated",
          statusSupport: claimSupportEvaluation?.statusSupport ?? "not-evaluated",
          mappingSupportState: supportState,
        },
        supportStatus: supportState,
        rejectionReasons: safeCodes(mapping?.rejectionCodes),
        failureKind,
      });
    },

    recordValidatedEvidence({ categoryId, providerResponseId: responseId, evidence = [], project = {} } = {}) {
      const items = evidenceItems(evidence);
      const seenSubstantive = new Map();
      for (const item of items) {
        const record = getRecord({ categoryId, providerResponseId: responseId, claimId: item?.id });
        if (!record) continue;

        const sources = Array.isArray(item?.sources) ? item.sources : [];
        const identityReceipts = record.identityEvaluations;
        const exactProject = identityReceipts.some((receipt) => receipt.state === "passed");
        const explicitIdentityConflict = identityReceipts.some((receipt) =>
          receipt.state === "rejected" && receipt.resolver?.verdict === "unrelated");
        const firstMapping = Array.isArray(item?.claimMappings)
          ? item.claimMappings.find((mapping) => mapping?.supportStatus === "supported") ?? item.claimMappings[0]
          : null;
        const sourceUrl = item?.sourceUrl
          ?? sources.find((source) => source?.canonicalUrl || source?.resolvedUrl || source?.url)?.canonicalUrl
          ?? sources.find((source) => source?.canonicalUrl || source?.resolvedUrl || source?.url)?.resolvedUrl
          ?? sources.find((source) => source?.canonicalUrl || source?.resolvedUrl || source?.url)?.url
          ?? firstMapping?.sourceId;
        if (sourceUrl) record.canonicalSourceUrl = safeUrl(sourceUrl);
        record.projectIdentity = {
          state: exactProject ? "passed"
            : explicitIdentityConflict ? "rejected"
              : identityReceipts.some((receipt) => receipt.state === "unknown") || sources.length
                ? "unknown" : "not-evaluated",
          exactProject,
          requestedName: boundedText(project?.name ?? project?.projectName, 160),
          requestedOperator: boundedText(project?.operator ?? project?.knownData?.operator, 160),
          decisions: identityReceipts.slice(0, 32),
          evaluationsObserved: identityReceipts.length,
          evaluationsTruncated: identityReceipts.length >= 32,
        };
        const scopeCodes = safeCodes(item?.sourceValidation?.rejectionCodes
          ?? item?.claimMappings?.flatMap((mapping) => mapping?.rejectionCodes ?? []));
        const scopeMappings = Array.isArray(item?.claimMappings) ? item.claimMappings : [];
        const mappingEvaluations = record.mappingEvaluations;
        const scopeEvaluationRows = mappingEvaluations.length
          ? mappingEvaluations.map((evaluation) => evaluation.scopeEvaluation)
          : scopeMappings.map((mapping) => {
            const rejectionCodes = safeCodes(mapping?.rejectionCodes)
              .filter((code) => /scope|phase|facility|campus|building|time|period/.test(code));
            return {
              state: "not-evaluated",
              evaluator: "shared-source-validation-mapping-output",
              evaluatedChecks: ["facility-scope-enum", "phase-scope-enum", "time-period-presence"],
              labelAndTimeCompletenessState: rejectionCodes.length ? "unknown" : "passed",
              requestedScope: {},
              claimedScope: {
                facility: boundedText(mapping?.facilityScope, 140),
                phase: boundedText(mapping?.phaseScope, 120),
                timePeriod: boundedText(mapping?.timePeriod, 120),
              },
              parentChildRelationship: boundedText(mapping?.parentChildRelationship ?? mapping?.entityScope, 120),
              matchedSignals: [],
              conflictingSignals: [],
              ambiguityReasons: rejectionCodes.length ? rejectionCodes : ["requested-scope-comparison-not-evaluated"],
              reasonCode: "requested-scope-comparison-not-evaluated",
              requestedScopeComparison: "not-evaluated-by-this-evaluator",
            };
          });
        const scopeFailureCodes = safeCodes(scopeEvaluationRows.flatMap((evaluation) =>
          evaluation?.state === "rejected" ? evaluation.conflictingSignals ?? [] : []));
        const anyScopePassed = scopeEvaluationRows.some((evaluation) => evaluation?.state === "passed");
        const anyScopeRejected = scopeEvaluationRows.some((evaluation) => evaluation?.state === "rejected");
        const anyScopeUnknown = scopeEvaluationRows.some((evaluation) => evaluation?.state === "unknown");
        const scopeState = anyScopePassed && anyScopeRejected ? "unknown"
          : anyScopePassed ? "passed" : anyScopeRejected ? "rejected"
            : anyScopeUnknown ? "unknown" : "not-evaluated";
        const firstScope = scopeEvaluationRows.find((evaluation) => evaluation?.state === "passed")
          ?? scopeEvaluationRows[0] ?? {};
        const claimedScope = firstScope.claimedScope ?? {};
        const facilityScope = boundedText(item?.facilityScope ?? claimedScope.facility ?? firstMapping?.facilityScope, 80);
        const phaseScope = boundedText(item?.phaseScope ?? claimedScope.phase ?? firstMapping?.phaseScope, 80);
        record.facilityPhaseScope = {
          state: scopeState,
          evaluationBasis: scopeEvaluationRows.length
            ? "production-source-validation-enum-and-time-scope-evaluator"
            : "no-scope-evaluator-result-recorded",
          requestedScopeComparison: "not-evaluated",
          facilityScope,
          phaseScope,
          requestedCampus: boundedText(project?.campus ?? project?.knownData?.campus, 120),
          requestedFacility: boundedText(project?.facility ?? project?.knownData?.facility, 120),
          requestedPhase: boundedText(project?.phase ?? project?.knownData?.phase, 100),
          requestedBuilding: boundedText(project?.building ?? project?.knownData?.building, 120),
          claimedCampus: boundedText(item?.campusScope ?? claimedScope.campus, 120),
          claimedFacility: boundedText(item?.facilityScope ?? claimedScope.facility, 120),
          claimedPhase: boundedText(item?.phaseScope ?? claimedScope.phase, 100),
          claimedBuilding: boundedText(item?.buildingScope ?? claimedScope.building, 120),
          parentChildRelationship: boundedText(
            item?.parentChildRelationship ?? firstScope.parentChildRelationship ?? firstMapping?.entityScope,
            120,
          ),
          matchedSignals: [],
          conflictingSignals: scopeFailureCodes,
          ambiguityReasons: safeCodes(scopeEvaluationRows.flatMap((evaluation) => evaluation?.ambiguityReasons ?? [])),
          evaluations: scopeEvaluationRows.slice(0, 32),
          reason: boundedText(scopeFailureCodes.join("; ")
            || (scopeEvaluationRows.length
              ? "Facility/phase labels were observed, but requested campus/facility/phase comparison was not evaluated."
              : "scope-evaluator-result-unavailable"), 320),
        };
        const claimTimePeriod = boundedText(item?.claimTimePeriod ?? firstMapping?.timePeriod, 120);
        const timeRejected = scopeCodes.some((code) => code.includes("time") || code.includes("period"));
        record.timeScope = {
          state: timeRejected ? "rejected"
            : scopeEvaluationRows.some((evaluation) => evaluation?.state === "passed") ? "passed"
              : claimTimePeriod ? "unknown" : "not-evaluated",
          claimTimePeriod,
          requestedPeriodComparison: "not-evaluated",
        };
        const semanticPassed = item?.semanticValidationStatus === "valid"
          || item?.normalization?.validationStatus === "valid";
        record.semanticUnitValidation = {
          state: semanticPassed ? "passed"
            : item?.semanticValidationStatus === "quarantined" || item?.normalization?.validationStatus === "quarantined"
              ? "rejected" : "unresolved",
          normalizedValue: safeScalar(item?.normalizedValue ?? item?.numericValue),
          normalizedUnit: boundedText(item?.normalizedUnit ?? item?.unit, 80),
          reasonCode: semanticPassed ? null : safeId(item?.quarantineReasons?.[0]) ?? "semantic-validation-not-passed",
        };
        record.sourceValidation = {
          state: boundedText(item?.sourceValidation?.state, 80) ?? "not-evaluated",
          rejectionCodes: scopeCodes,
        };
        const receivedValue = item?.normalizedValue ?? item?.numericValue ?? item?.value;
        const receivedStatus = boundedText(item?.status, 120);
        const placeholder = item?.isPlaceholder === true
          || item?.unavailable === true
          || item?.classification === "Missing Evidence"
          || item?.classification === "Not Disclosed"
          || typeof receivedValue === "string" && /^(?:missing evidence|not disclosed|unavailable|unknown|n\/a)$/i.test(receivedValue.trim());
        const substantive = !placeholder && (
          receivedValue !== undefined && receivedValue !== null && receivedValue !== ""
          || Boolean(record.supportingQuoteSha256)
          || Boolean(record.canonicalSourceUrl)
          || Boolean(receivedStatus)
        );
        record.candidateKind = placeholder ? "unavailable-value-placeholder"
          : !substantive ? "non-substantive-schema-entry" : "substantive-candidate";
        record.substantive = substantive;
        record.placeholder = placeholder;
        const identity = `${record.normalizedValue ?? ""}|${record.normalizedUnit ?? ""}|${record.supportingQuoteSha256 ?? ""}|${record.canonicalSourceUrl ?? ""}|${boundedText(item?.status, 120) ?? ""}`;
        if (substantive && seenSubstantive.has(identity)) {
          record.candidateKind = "duplicate-substantive-candidate";
          record.duplicateOf = seenSubstantive.get(identity);
        } else if (substantive) {
          seenSubstantive.set(identity, record.claimId);
        }
        const claimMappings = Array.isArray(item?.claimMappings) ? item.claimMappings.slice(0, 12) : [];
        const mappingInputs = claimMappings.length ? claimMappings : [null];
        record.sourceMappingReceipts = mappingInputs.map((mapping) => {
          const citations = [
            ...(Array.isArray(record.providerCitationUrls) ? record.providerCitationUrls : []),
            item?.sourceUrl,
            ...(Array.isArray(item?.sourceUrls) ? item.sourceUrls : []),
          ].filter(Boolean);
          const candidateUrl = mapping?.sourceId ?? mapping?.sourceUrl
            ?? citations.find((citation) => sources.some((source) =>
              canonicalizeSourceUrl(source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url)
                === canonicalizeSourceUrl(citation)));
          const canonicalSourceUrl = safeUrl(candidateUrl);
          const canonicalized = canonicalizeSourceUrl(candidateUrl);
          const matchedSource = sources.find((source) => canonicalizeSourceUrl(source?.canonicalUrl ?? source?.url) === canonicalized);
          const actualEvaluation = record.mappingEvaluations.find((evaluation) =>
            evaluation.canonicalUrl === safeUrl(canonicalized)
            && (!mapping?.passageId || evaluation.passageId === mapping.passageId))
            ?? record.mappingEvaluations.find((evaluation) => evaluation.canonicalUrl === safeUrl(canonicalized))
            ?? null;
          const quote = mapping?.exactQuotation ?? item?.claimPassage ?? "";
          const retainedPassage = matchedSource?.accessOutcome?.state === "accessible"
            ? matchedSource.accessOutcome.passage
            : matchedSource?.excerpt ?? "";
          const normalizedQuote = typeof quote === "string" ? quote.trim().replace(/\s+/g, " ").toLowerCase() : "";
          const normalizedRetainedPassage = typeof retainedPassage === "string"
            ? retainedPassage.trim().replace(/\s+/g, " ").toLowerCase()
            : "";
          const quoteContained = Boolean(normalizedQuote
            && normalizedRetainedPassage.includes(normalizedQuote));
          const quoteFoundInOtherOccurrence = Boolean(quote && matchedSource && sources.some((source) =>
            source !== matchedSource
            && canonicalizeSourceUrl(source?.canonicalUrl ?? source?.resolvedUrl ?? source?.url) === canonicalized
            && typeof source?.accessOutcome?.passage === "string"
             && source.accessOutcome.passage.trim().replace(/\s+/g, " ").toLowerCase().includes(normalizedQuote)));
          const matchingIdentityReceipt = identityReceipts.find((receipt) => receipt.sourceUrl === canonicalSourceUrl);
          const resolverState = matchingIdentityReceipt?.resolver?.verdict
            ?? matchingIdentityReceipt?.state ?? "not-evaluated";
          const failureKind = !candidateUrl ? "missing-url"
            : !canonicalized ? "unresolved-url"
              : !matchedSource ? "url-not-resolved-to-retained-source"
                : !quote ? "absent-quotation"
                  : quoteFoundInOtherOccurrence ? "wrong-retained-passage"
                    : !quoteContained ? "uncontained-quotation"
                      : actualEvaluation?.failureKind && actualEvaluation.failureKind !== "none"
                        ? actualEvaluation.failureKind
                    : mapping?.supportStatus === "context-only" ? "non-project-specific-source"
                      : mapping?.supportStatus === "missing-passage" ? "absent-or-uncontained-quotation"
                      : mapping?.supportStatus === "unsupported-source-type" ? "disallowed-source-type"
                        : mapping?.supportStatus === "claim-not-mapped" ? "claim-not-mapped-unit-or-status-not-evaluated"
                          : mapping?.supportStatus === "scope-unknown" ? "scope-unknown-or-rejected"
                            : mapping?.supportStatus === "supported" ? "none" : "unavailable";
          return {
            providerCitationUrls: [...new Set(citations.map(safeUrl).filter(Boolean))].slice(0, 8),
            sourceUrl: canonicalSourceUrl,
            canonicalizationState: canonicalized
              ? canonicalized === candidateUrl ? "already-canonical" : "canonicalized"
              : candidateUrl ? "unresolved-url" : "missing-url",
            resolvedOccurrenceId: boundedText(matchedSource?.occurrenceId ?? matchedSource?.sourceId, 240),
            sourceFamily: boundedText(matchedSource?.sourceClass ?? matchedSource?.sourceFamily ?? matchedSource?.sourceChannel, 100),
            passageId: boundedText(mapping?.passageId, 240),
            passageSha256: matchedSource?.accessOutcome?.passage
              ? createHash("sha256").update(matchedSource.accessOutcome.passage).digest("hex")
              : null,
            quotation: boundedText(quote, 4_000),
            quotationSha256: quote ? createHash("sha256").update(quote).digest("hex") : null,
            quotationContainment: quoteContained ? "contained-in-retained-passage"
              : quote ? quoteFoundInOtherOccurrence ? "contained-in-different-retained-occurrence"
                : matchedSource ? "uncontained-in-retained-passage" : "retained-source-not-resolved"
                : "absent",
            authorityAndType: {
              sourceType: boundedText(mapping?.sourceType, 100),
              sourceTypeState: actualEvaluation?.authorityAndType?.sourceTypeState
                ?? (mapping?.supportStatus === "unsupported-source-type" ? "rejected"
                  : mapping?.supportStatus === "supported" ? "passed" : "not-established"),
              authorityState: actualEvaluation?.authorityAndType?.authorityState
                ?? boundedText(matchedSource?.sourceValidation?.state, 80) ?? "not-evaluated",
            },
            projectSpecificity: {
              state: actualEvaluation?.identity?.state
                ?? (mapping?.entityScope === "project" ? "project-specific"
                  : mapping?.entityScope === "related" ? "non-project-specific" : "unknown"),
              resolverState,
            },
            scopeEvaluation: actualEvaluation?.scopeEvaluation ?? {
              state: "not-evaluated",
              evaluator: "no-scope-evaluator-result-recorded",
              requestedScope: {},
              claimedScope: {
                campus: boundedText(item?.campusScope, 140),
                facility: boundedText(item?.facilityScope ?? mapping?.facilityScope, 140),
                phase: boundedText(item?.phaseScope ?? mapping?.phaseScope, 120),
                building: boundedText(item?.buildingScope, 120),
              },
              parentChildRelationship: boundedText(mapping?.entityScope, 120),
              matchedSignals: [],
              conflictingSignals: [],
              ambiguityReasons: ["scope-evaluator-result-unavailable"],
              reason: "No scope-evaluator result was recorded for this mapping.",
              requestedScopeComparison: "not-evaluated",
            },
            clauseBoundSupport: {
              claimSupportExplicit: actualEvaluation?.clauseBoundSupport?.claimSupportExplicit
                ?? mapping?.claimSupportExplicit === true,
              quotationContained: actualEvaluation?.clauseBoundSupport?.quotationContained ?? quoteContained,
              textValueSupported: actualEvaluation?.clauseBoundSupport?.textValueSupported ?? null,
              claimValueSupported: actualEvaluation?.clauseBoundSupport?.claimValueSupported ?? null,
              quantity: typeof (item?.normalizedValue ?? item?.numericValue ?? item?.value) === "number"
                ? item.normalizedValue ?? item.numericValue ?? item.value
                : boundedText(item?.normalizedValue ?? item?.numericValue ?? item?.value, 100),
              unit: boundedText(item?.normalizedUnit ?? item?.unit, 80),
              status: boundedText(item?.status, 100),
              unitSupport: actualEvaluation?.clauseBoundSupport?.unitSupport ?? "not-evaluated",
              statusSupport: actualEvaluation?.clauseBoundSupport?.statusSupport ?? "not-evaluated",
              supportState: mapping?.supportStatus ?? "not-evaluated",
            },
            supportStatus: boundedText(mapping?.supportStatus, 80),
            rejectionReasons: safeCodes(mapping?.rejectionCodes),
            failureKind,
          };
        });
        const eligibilityChecks = item?.sourceValidation?.eligibilityTrace?.checks;
        const failingCheck = Array.isArray(eligibilityChecks)
          ? eligibilityChecks.find((check) => check?.passed === false)
          : null;
        const eligible = item?.eligibleForModel === true;
        setStage(record, "normalization", true, null, false);
        const identityStage = record.projectIdentity.state === "passed" ? "passed"
          : record.projectIdentity.state === "rejected" ? "failed"
            : record.projectIdentity.state === "unknown" ? "unknown" : "not-evaluated";
        setStage(record, "identityEvaluation", identityStage,
          identityStage === "failed" ? explicitIdentityConflict ? "explicit-identity-conflict" : "identity-not-established" : null,
          false);
        const scopeStage = record.facilityPhaseScope.state === "passed" ? "passed"
          : record.facilityPhaseScope.state === "rejected" ? "failed"
            : record.facilityPhaseScope.state === "unknown" ? "unknown" : "not-evaluated";
        setStage(record, "scopeEvaluation", scopeStage,
          scopeStage === "failed" ? scopeFailureCodes[0] ?? "scope-rejected" : null,
          false);
        const resolvedAndQuoted = record.sourceMappingReceipts.some((mapping) =>
          mapping.canonicalizationState !== "missing-url"
          && mapping.canonicalizationState !== "unresolved-url"
          && mapping.resolvedOccurrenceId
          && mapping.quotationContainment === "contained-in-retained-passage");
        const mappingFailure = record.sourceMappingReceipts.find((mapping) => mapping.failureKind !== "none");
        setStage(record, "sourceQuotationMapping", resolvedAndQuoted ? "passed"
          : record.sourceMappingReceipts.length ? "failed" : "not-evaluated",
        resolvedAndQuoted ? null : mappingFailure?.failureKind ?? "mapping-not-evaluated", false);
        const authorityStates = record.sourceMappingReceipts.map((mapping) => mapping.authorityAndType);
        const authorityRejected = authorityStates.some((entry) => entry.sourceTypeState === "rejected");
        const authorityPassed = authorityStates.some((entry) =>
          entry.sourceTypeState === "passed" && entry.authorityState && entry.authorityState !== "not-evaluated");
        setStage(record, "sourceAuthority", authorityPassed ? "passed"
          : authorityRejected ? "failed"
            : authorityStates.length ? "unknown" : "not-evaluated",
        authorityRejected ? "disallowed-source-type" : null, false);
        const periodFailure = scopeCodes.find((code) => /time|period|status/.test(code));
        const periodChecks = Array.isArray(eligibilityChecks)
          ? eligibilityChecks.filter((check) => /time|period|status/i.test(String(check?.id ?? "")))
          : [];
        const periodEvaluated = periodChecks.length > 0;
        setStage(record, "periodStatus", periodFailure ? "failed"
          : periodEvaluated
            ? periodChecks.every((check) => check.passed === true) ? "passed" : "unknown"
            : "not-evaluated",
        periodFailure, false);
        setStage(record, "eligibility", eligible ? "passed"
          : failingCheck || item?.eligibleForModel === false ? "failed" : "not-evaluated",
        eligible ? null : safeId(failingCheck?.id) ?? "not-eligible", false);
        record.containment = {
          state: eligible ? "eligible" : failingCheck ? "rejected" : "ineligible",
          eligibleForModel: eligible,
          reasonCodes: safeCodes([
            ...(Array.isArray(item?.sourceValidation?.rejectionCodes) ? item.sourceValidation.rejectionCodes : []),
            ...(Array.isArray(item?.quarantineReasons) ? item.quarantineReasons : []),
          ]),
        };
        setStage(record, "structuredParsing", true);
        if (record.stages.categoryRestriction.state === "not-evaluated") setStage(record, "categoryRestriction", true);
        if (record.stages.sourceRestriction.state === "not-evaluated") {
          const retainedSourceResolved = record.sourceMappingReceipts.some((mapping) => mapping.resolvedOccurrenceId);
          setStage(record, "sourceRestriction", retainedSourceResolved, retainedSourceResolved
            ? null : "no-retained-source-mapping", false);
        }
        if (!record.firstFailedGate && failingCheck) {
          record.firstFailedGate = {
            gate: safeId(failingCheck.id) ?? "eligibility-policy",
            reasonCode: safeId(failingCheck.id) ?? "eligibility-policy-rejected",
          };
        }
        setStage(record, "containment", eligible, eligible ? null : safeId(failingCheck?.id) ?? "not-eligible");
        if (!record.firstCausalFailure) {
          const failedStages = [
            "categoryRestriction",
            "sourceRestriction",
            "identityEvaluation",
            "scopeEvaluation",
            "sourceQuotationMapping",
            "sourceAuthority",
            "periodStatus",
            "eligibility",
            "containment",
          ];
          const earliestFailedStage = failedStages.find((stage) => record.stages[stage]?.state === "failed");
          record.firstCausalFailure = record.firstFailedGate
            ? { gate: record.firstFailedGate.gate, reasonCode: record.firstFailedGate.reasonCode }
            : earliestFailedStage
              ? {
                gate: earliestFailedStage,
                reasonCode: record.stages[earliestFailedStage].reasonCode
                  ?? (earliestFailedStage === "identityEvaluation"
                    ? explicitIdentityConflict ? "explicit-identity-conflict" : "identity-not-established"
                    : earliestFailedStage === "scopeEvaluation"
                      ? scopeFailureCodes[0] ?? "scope-rejected"
                      : "not-eligible"),
              }
              : null;
        }
        record.downstreamNotEvaluated = Object.entries(record.stages)
          .filter(([, state]) => state.state === "not-evaluated")
          .map(([stage]) => stage);
        record.causalClassification = record.firstCausalFailure
          ? /timeout|unavailable|cancel|not-issued/.test(record.firstCausalFailure.reasonCode)
            ? "technical-or-unavailable"
            : /identity|scope|phase|facility|source|quote|passage|type|support/.test(record.firstCausalFailure.reasonCode)
              ? "evidence-or-scope-rejection"
              : "engine-defect-or-policy-rejection"
          : eligible ? "eligible" : "unclassified";
      }
      const response = responses.get(`${safeCategory(categoryId)}|${providerResponseId(responseId) ?? "unknown"}`);
      if (response) {
        const records = [...claims.values()].filter((claim) =>
          claim.categoryId === safeCategory(categoryId) && claim.providerResponseId === providerResponseId(responseId));
        response.substantiveClaimCount = records.filter((claim) => claim.substantive === true).length;
        response.placeholderCount = records.filter((claim) => claim.placeholder === true).length;
        response.duplicateClaimCount = records.filter((claim) => claim.candidateKind === "duplicate-substantive-candidate").length;
      }
    },

    recordClientParsing(evidence = []) {
      for (const item of evidenceItems(evidence)) {
        const record = recordForClientEvidence(item);
        if (!record) continue;
        setStage(record, "clientParsing", true);
      }
    },

    recordClientParseResult({ evidence = [], passed, reasonCode } = {}) {
      for (const item of evidenceItems(evidence)) {
        const record = recordForClientEvidence(item);
        if (!record) continue;
        setStage(record, "clientParsing", passed, reasonCode);
      }
    },

    recordProposalSelection(proposals = [], returnedClaims = []) {
      const selectedEntries = evidenceItems(proposals)
        .map((item) => ({ id: safeId(item?.id), categoryId: categoryForEvidence(item) }))
        .filter((item) => item.id);
      const inputEntries = evidenceItems(returnedClaims)
        .map((item) => ({ id: safeId(item?.id), categoryId: categoryForEvidence(item) }))
        .filter((item) => item.id);
      for (const record of claims.values()) {
        const returned = inputEntries.some((item) =>
          item.id === record.claimId && (item.categoryId === "unknown" || item.categoryId === record.categoryId));
        if (!returned) continue;
        const selected = selectedEntries.some((item) =>
          item.id === record.claimId && (item.categoryId === "unknown" || item.categoryId === record.categoryId));
        record.proposalCreated = selected;
        setStage(record, "proposalSelection", selected, selected ? null : "not-selected-as-proposal");
      }
    },

    toJSON() {
      return {
        version: TRACE_VERSION,
        sanitized: true,
        responsesObserved: observedResponses,
        responsesTruncated: omittedResponses > 0,
        omittedResponses,
        responses: [...responses.values()].slice(0, MAX_RESPONSES),
        claimRecordsObserved: observedClaimRecords,
        claimRecordsTruncated: omittedClaimRecords > 0,
        omittedClaimRecords,
        analysisBatchesObserved: observedAnalysisBatches,
        analysisBatchesTruncated: observedAnalysisBatches > analysisPassages.length,
        claims: [...claims.values()].slice(0, boundedClaimLimit).map((claim) => structuredClone(claim)),
        analysisPassages: analysisPassages.slice(0, 8).map((batch) => structuredClone(batch)),
      };
    },
  };
}