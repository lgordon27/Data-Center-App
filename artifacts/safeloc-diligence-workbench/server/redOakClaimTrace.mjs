import { createHash } from "node:crypto";

const TRACE_VERSION = 1;
const MAX_CLAIMS = 48;
const MAX_RESPONSES = 16;
const MAX_REJECTION_CODES = 16;
const TRACE_STAGES = [
  "structuredParsing",
  "categoryRestriction",
  "sourceRestriction",
  "merge",
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
    proposalCreated: null,
  };
}

export function createRedOakClaimTrace({ maxClaims = MAX_CLAIMS } = {}) {
  const boundedClaimLimit = Number.isInteger(maxClaims) ? Math.max(1, Math.min(MAX_CLAIMS, maxClaims)) : MAX_CLAIMS;
  const claims = new Map();
  const responses = new Map();
  const analysisPassages = [];

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
    const state = passed === true ? "passed" : passed === false ? "failed" : "not-evaluated";
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
      if (responses.size >= MAX_RESPONSES && !responses.has(responseKey)) return;
      const existing = responses.get(responseKey);
      if (existing && ["claims-received", "malformed", "no-claims"].includes(existing.state)) return;
      responses.set(responseKey, {
        categoryId: category,
        providerResponseId: response,
        state: state === "not-issued" ? "not-issued" : "unavailable",
        reasonCode: safeId(reasonCode) ?? "structured-response-unavailable",
        claimCount: 0,
        expectedEvidenceIds: (Array.isArray(expectedEvidenceIds) ? expectedEvidenceIds : [])
          .map((id) => safeId(id, 120))
          .filter(Boolean)
          .slice(0, MAX_CLAIMS),
        omittedClaimIds: [],
        parseState: "not-evaluated",
        parseErrorCode: null,
      });
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
      if (responses.size >= MAX_RESPONSES && !responses.has(responseKey)) return;
      const rawEvidence = research?.evidence;
      const expectedIds = Array.isArray(expectedEvidenceIds) ? expectedEvidenceIds : [];
      const items = evidenceItems(rawEvidence).slice(0, boundedClaimLimit);
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
        claimCount: items.length,
        expectedEvidenceIds: expectedIds
          .map((id) => safeId(id, 120))
          .filter(Boolean)
          .slice(0, MAX_CLAIMS),
        validationErrorType: outcome === "rejected" || malformed ? "malformed-response" : null,
      });
      for (const [index, claim] of items.entries()) {
        const id = safeId(claim?.id) ?? `claim-${index + 1}`;
        const key = claimKey(category, response, id);
        if (!claims.has(key) && claims.size >= boundedClaimLimit) continue;
        const record = claims.get(key) ?? recordFromRawClaim(claim, category, response, id);
        if (!claims.has(key)) claims.set(key, record);
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

    recordValidatedEvidence({ categoryId, providerResponseId: responseId, evidence = [] } = {}) {
      const items = evidenceItems(evidence);
      for (const item of items) {
        const record = getRecord({ categoryId, providerResponseId: responseId, claimId: item?.id });
        if (!record) continue;

        const sources = Array.isArray(item?.sources) ? item.sources : [];
        const exactProject = item?.sourceRelevance === "exact-project"
          || sources.some((source) => source?.exactProject === true);
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
          state: exactProject ? "exact-project" : sources.length ? "related-or-unresolved" : "not-established",
          exactProject,
        };
        const scopeCodes = safeCodes(item?.sourceValidation?.rejectionCodes
          ?? item?.claimMappings?.flatMap((mapping) => mapping?.rejectionCodes ?? []));
        const facilityScope = boundedText(item?.facilityScope ?? firstMapping?.facilityScope, 80);
        const phaseScope = boundedText(item?.phaseScope ?? firstMapping?.phaseScope, 80);
        record.facilityPhaseScope = {
          state: scopeCodes.some((code) => code.includes("facility") || code.includes("phase"))
            ? "rejected"
            : facilityScope || phaseScope ? "observed" : "unknown",
          facilityScope,
          phaseScope,
        };
        const claimTimePeriod = boundedText(item?.claimTimePeriod ?? firstMapping?.timePeriod, 120);
        record.timeScope = {
          state: scopeCodes.some((code) => code.includes("time") || code.includes("period"))
            ? "rejected"
            : claimTimePeriod ? "observed" : "unknown",
          claimTimePeriod,
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
        const eligibilityChecks = item?.sourceValidation?.eligibilityTrace?.checks;
        const failingCheck = Array.isArray(eligibilityChecks)
          ? eligibilityChecks.find((check) => check?.passed === false)
          : null;
        const eligible = item?.eligibleForModel === true;
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
        setStage(record, "sourceRestriction", sources.length > 0 || Boolean(sourceUrl), sources.length || sourceUrl ? null : "no-retained-source-mapping");
        if (!record.firstFailedGate && failingCheck) {
          record.firstFailedGate = {
            gate: safeId(failingCheck.id) ?? "eligibility-policy",
            reasonCode: safeId(failingCheck.id) ?? "eligibility-policy-rejected",
          };
        }
        setStage(record, "containment", eligible, eligible ? null : safeId(failingCheck?.id) ?? "not-eligible");
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
        responses: [...responses.values()].slice(0, MAX_RESPONSES),
        claims: [...claims.values()].slice(0, boundedClaimLimit).map((claim) => structuredClone(claim)),
        analysisPassages: analysisPassages.slice(0, 8).map((batch) => structuredClone(batch)),
      };
    },
  };
}