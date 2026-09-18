import {
  evaluateEvidenceSourceEligibility,
  getEvidenceSemanticDefinition,
} from "./evidenceSemanticPolicy.mjs";

export const SOURCE_VALIDATION_POLICY_VERSION = 1;

export const SOURCE_STATES = Object.freeze([
  "discovered",
  "retained",
  "redirected",
  "accessible",
  "parsed",
  "evidence-mapped",
  "claim-supported",
  "project-specific",
  "financially-eligible",
  "rejected",
  "unknown",
]);

export const SOURCE_REJECTION_CODES = Object.freeze([
  "unsafe-url",
  "invalid-url",
  "duplicate-canonical-source",
  "retention-cap",
  "source-not-in-packet",
  "not-project-specific",
  "missing-passage",
  "inaccessible-without-capture",
  "unsupported-source-type",
  "claim-not-mapped",
  "wrong-entity-scope",
  "wrong-phase-or-facility",
  "missing-time-scope",
  "semantic-mismatch",
  "blocking-contradiction",
  "reviewer-submitted",
]);

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
  "source",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function safeSourceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function canonicalizeSourceUrl(value) {
  const originalUrl = safeSourceUrl(value);
  if (!originalUrl) return null;
  const url = new URL(originalUrl);
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_QUERY_KEYS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  url.hash = "";
  url.search = "";
  for (const [key, valuePart] of kept) url.searchParams.append(key, valuePart);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

export function sourceUrlAliases(source = {}) {
  const values = typeof source === "string"
    ? [source]
    : [
        source?.url,
        source?.originalUrl,
        source?.resolvedUrl,
        source?.finalUrl,
        source?.canonicalUrl,
        source?.accessOutcome?.resolvedUrl,
        source?.accessOutcome?.canonicalUrl,
        ...(Array.isArray(source?.redirectChain) ? source.redirectChain : []),
        ...(Array.isArray(source?.accessOutcome?.redirectChain) ? source.accessOutcome.redirectChain : []),
        ...(Array.isArray(source?.referringUrls) ? source.referringUrls : []),
        ...(Array.isArray(source?.accessOutcome?.referringUrls) ? source.accessOutcome.referringUrls : []),
      ];
  return [...new Set(values.map(canonicalizeSourceUrl).filter(Boolean))];
}

function publisherForUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function stateTransition(state, next, reason) {
  return {
    from: state,
    to: next,
    reason,
  };
}

function isPrimarySource(source) {
  return ["primary-government", "primary-utility", "primary-company"].includes(source?.sourceClass);
}

function sourceIdentityTokens(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["the", "and", "for", "project", "data", "center"].includes(token));
}

export function isSourceProjectSpecific(source, project = {}, assertedRelevance) {
  if (source?.exactProject === true || source?.entityMatch === "exact") return true;
  if (source?.exactProject === false || source?.entityMatch === "related" || assertedRelevance === "related-context") return false;
  // A passage can mention a project while explicitly describing a regional,
  // adjacent, or unrelated record. Identity inference is therefore limited
  // to document metadata; a provider may still assert an exact entity match
  // explicitly when it has established one.
  const sourceIdentityTokenList = sourceIdentityTokens(`${source?.title ?? ""} ${source?.url ?? ""} ${source?.resolvedUrl ?? ""}`);
  const sourceTokens = new Set([
    ...sourceIdentityTokenList,
    ...sourceIdentityTokenList
      .filter((token) => token.endsWith("dc") && token.length > 4)
      .map((token) => token.slice(0, -2)),
  ]);
  const identityLabels = [
    project?.name,
    ...(Array.isArray(project?.knownData?.aliases) ? project.knownData.aliases : []),
  ];
  return identityLabels.some((label) => {
    const labelTokens = sourceIdentityTokens(label);
    return labelTokens.length > 0 && labelTokens.every((token) => sourceTokens.has(token));
  });
}

function capturedPassage(source, index) {
  const excerpt = normalizeText(source?.excerpt);
  const exactQuotation = normalizeText(source?.claimPassage);
  if (!excerpt || !exactQuotation || /^no excerpt returned\.?$/i.test(excerpt)) return null;
  if (!excerpt.toLowerCase().includes(exactQuotation.toLowerCase())) return null;
  return {
    id: `${source?.occurrenceId ?? source?.canonicalUrl ?? "source"}:passage:${index}`,
    sourceId: source?.canonicalUrl ?? source?.url ?? null,
    exactQuotation,
    passageStatus: source?.passageStatus ?? "captured",
    sectionOrPage: source?.sectionOrPage ?? null,
    quotedAt: source?.quotedAt ?? null,
  };
}

function claimValueMatches(claim, support) {
  const expectedValue = typeof claim?.value === "string"
    ? claim.value
    : claim?.numericValue ?? claim?.value;
  const supportedValues = Array.isArray(support?.values) ? support.values : [support?.value];
  if (typeof expectedValue === "number" && Number.isFinite(expectedValue)) {
    return supportedValues.some((value) => {
      const provided = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
      return Number.isFinite(provided) && provided === expectedValue;
    });
  }
  const expectedText = normalizeText(expectedValue);
  return Boolean(expectedText && supportedValues.some((value) => {
    const providedText = normalizeText(value ?? support?.claimText);
    return providedText && (
      providedText.toLowerCase().includes(expectedText.toLowerCase())
      || expectedText.toLowerCase().includes(providedText.toLowerCase())
    );
  }));
}

function passageSupportsClaim(source, claim, support) {
  const excerpt = normalizeText(source?.excerpt).toLowerCase();
  const quotedPassage = normalizeText(source?.claimPassage).toLowerCase();
  if (!quotedPassage || !excerpt.includes(quotedPassage)) return false;
  const values = Array.isArray(support?.values) ? support.values : [support?.value ?? support?.claimText];
  return values.some((value) => {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || normalized === "not disclosed") return false;
    return quotedPassage.includes(normalized) || normalized.split(/[^a-z0-9.]+/).filter((token) => token.length > 2)
      .every((token) => quotedPassage.includes(token));
  }) && claimValueMatches(claim, support);
}

function explicitlySupportsClaim(source, id, claim) {
  if (source?.claimSupport === true || source?.supportsClaim === true) return false;
  if (Array.isArray(source?.claimSupport)) {
    return source.claimSupport.some((support) =>
      isRecord(support)
      && (support.evidenceId === id || support.variable === id)
      && passageSupportsClaim(source, claim, support));
  }
  if (isRecord(source?.claimSupport)) {
    return (source.claimSupport.evidenceId === id || source.claimSupport.variable === id)
      && passageSupportsClaim(source, claim, source.claimSupport);
  }
  // The provider does not emit a second claim-support schema. When its captured
  // passage contains the returned value, that is the auditable deterministic
  // claim-to-passage mapping.
  return passageSupportsClaim(source, claim, { value: claim?.value ?? claim?.numericValue });
}

function scopeRejectionCodes(source) {
  const codes = [];
  const facilityScope = normalizeText(source?.facilityScope).toLowerCase();
  const phaseScope = normalizeText(source?.phaseScope).toLowerCase();
  if (!["exact-project", "exact-facility", "project", "facility"].includes(facilityScope)) {
    codes.push("wrong-entity-scope");
  }
  if (!["exact-phase", "all-phases", "not-applicable"].includes(phaseScope)) {
    codes.push("wrong-phase-or-facility");
  }
  if (!source?.timePeriod) codes.push("missing-time-scope");
  return codes;
}

export function buildClaimPassageMappings({
  id,
  sources = [],
  project = {},
  claim = {},
  coverageStatus,
  conflictSummary,
}) {
  const mappings = [];
  for (const [index, source] of (Array.isArray(sources) ? sources : []).entries()) {
    const exactProject = isSourceProjectSpecific(source, project, claim.sourceRelevance);
    const passage = capturedPassage(source, index);
    const sourceTypeAllowed = Boolean(getEvidenceSemanticDefinition(id)?.eligibleSourceTypes?.includes(source.sourceClass));
    const claimSupportedExplicitly = explicitlySupportsClaim(source, id, claim);
    const scopeCodes = scopeRejectionCodes(source);
    const contradiction = coverageStatus === "conflicting" || Boolean(conflictSummary);
    const supportStatus = contradiction
      ? "blocked"
      : !exactProject
        ? "context-only"
        : !passage
          ? "missing-passage"
          : !sourceTypeAllowed
            ? "unsupported-source-type"
            : !claimSupportedExplicitly
              ? "claim-not-mapped"
              : scopeCodes.length
                ? "scope-unknown"
            : "supported";
    mappings.push({
      id: `${source.canonicalUrl ?? source.url ?? "source"}:${id}`,
      sourceId: source.canonicalUrl ?? source.url ?? null,
      passageId: passage?.id ?? null,
      variable: id,
      claimText: normalizeText(claim.text ?? claim.description ?? ""),
      entityScope: exactProject ? "project" : "related",
      facilityScope: source.facilityScope ?? "unknown",
      phaseScope: source.phaseScope ?? "unknown",
      timePeriod: source.timePeriod ?? null,
      sourceType: source.sourceClass ?? "unknown",
      contradictionStatus: contradiction ? "blocking" : "none",
      supportStatus,
      exactQuotation: passage?.exactQuotation ?? null,
      claimSupportExplicit: claimSupportedExplicitly,
      rejectionCodes: [
        ...(exactProject ? [] : ["not-project-specific"]),
        ...(!passage ? ["missing-passage"] : []),
        ...(!sourceTypeAllowed ? ["unsupported-source-type"] : []),
        ...(!claimSupportedExplicitly ? ["claim-not-mapped"] : []),
        ...scopeCodes,
        ...(contradiction ? ["blocking-contradiction"] : []),
      ],
    });
  }
  return mappings;
}

export function evaluateResearchEvidenceEligibility(input = {}) {
  const base = evaluateEvidenceSourceEligibility(input);
  const mappings = Array.isArray(input.claimMappings) ? input.claimMappings : [];
  const supportedMapping = mappings.find((mapping) => mapping?.supportStatus === "supported");
  const reasons = [...base.reasons];
  const rejectionCodes = [];
  if (!supportedMapping) {
    reasons.push("No immutable claim-to-passage mapping supports this evidence claim.");
    rejectionCodes.push(...new Set(mappings.flatMap((mapping) => mapping?.rejectionCodes ?? [])));
    if (!rejectionCodes.length) rejectionCodes.push("claim-not-mapped");
  } else {
    const mappingSourceId = supportedMapping.sourceId;
    const mappingSource = (Array.isArray(input.sources) ? input.sources : []).find((source) => (
      sourceUrlAliases(source).includes(mappingSourceId)
    ));
    if (!mappingSource) {
      reasons.push("The supported claim mapping does not resolve to a retained source.");
      rejectionCodes.push("source-not-in-packet");
    } else if (mappingSource.accessOutcome && mappingSource.accessOutcome.state !== "accessible") {
      reasons.push("The source named by the supported claim mapping was not successfully accessed.");
      rejectionCodes.push("inaccessible-without-capture");
    }
  }
  if (input.coverageStatus === "conflicting" || input.conflictSummary) rejectionCodes.push("blocking-contradiction");
  if (input.semanticValidationStatus === "quarantined") rejectionCodes.push("semantic-mismatch");
  if (input.sources?.some((source) => source?.sourceClass === "reviewer-submitted")) rejectionCodes.push("reviewer-submitted");
  const accessedSources = Array.isArray(input.sources) ? input.sources.filter((source) => source?.accessOutcome) : [];
  if (accessedSources.length && !accessedSources.some((source) => source.accessOutcome?.state === "accessible")) {
    reasons.push("No bounded document access receipt supports this evidence claim.");
    rejectionCodes.push("document-not-accessible");
  }
  if (input.sourceRelevance === "related-context" || input.sourceRelevance === "unresolved") rejectionCodes.push("not-project-specific");
  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    rejectionCodes: [...new Set(rejectionCodes)],
    state: reasons.length === 0 ? "financially-eligible" : "rejected",
    supportingMapping: supportedMapping ?? null,
  };
}

export function createSourceLedger(candidates = [], { maxRetained = 10 } = {}) {
  const ledger = [];
  const canonicalByUrl = new Map();
  const occurrences = [];
  for (const [index, candidate] of candidates.entries()) {
    const originalUrl = safeSourceUrl(candidate?.url);
    const resolvedUrl = safeSourceUrl(candidate?.resolvedUrl ?? candidate?.finalUrl ?? candidate?.url);
    const declaredCanonicalUrl = safeSourceUrl(candidate?.canonicalUrl);
    const canonicalUrl = canonicalizeSourceUrl(declaredCanonicalUrl ?? resolvedUrl);
    const occurrenceId = `source-occurrence-${index + 1}`;
    const base = {
      occurrenceId,
      candidateIndex: index,
      origin: candidate?.origin ?? "provider",
      sourceChannel: candidate?.sourceChannel ?? candidate?.origin ?? "provider",
      originalUrl: originalUrl ?? String(candidate?.url ?? ""),
      resolvedUrl,
      canonicalUrl,
      canonicalIdentityExplicit: Boolean(declaredCanonicalUrl || candidate?.resolvedUrl || candidate?.finalUrl),
      title: normalizeText(candidate?.title) || "Retrieved public source",
      excerpt: normalizeText(candidate?.excerpt),
      sourceClass: candidate?.sourceClass ?? "secondary-reporting",
      searchDomain: candidate?.searchDomain ?? "project-identity",
      accessStatus: candidate?.accessStatus ?? "not provided",
      contentType: candidate?.contentType ?? null,
      discoveryOnly: candidate?.discoveryOnly === true,
      extractionMethod: candidate?.extractionMethod ?? candidate?.accessOutcome?.extractionMethod ?? null,
      extractionOutcome: candidate?.extractionOutcome ?? candidate?.accessOutcome?.extractionOutcome ?? null,
      contentHash: candidate?.contentHash ?? candidate?.accessOutcome?.contentHash ?? null,
      date: candidate?.date ?? candidate?.publishedAt ?? candidate?.published_date ?? null,
      categoryIds: Array.isArray(candidate?.categoryIds)
        ? [...new Set(candidate.categoryIds.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].slice(0, 12)
        : [],
      referringQueries: Array.isArray(candidate?.referringQueries)
        ? [...new Set(candidate.referringQueries.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].slice(0, 12)
        : [],
      documentAccessReused: candidate?.documentAccessReused === true || candidate?.accessOutcome?.reused === true,
      documentReferringUrls: Array.isArray(candidate?.documentReferringUrls)
        ? [...new Set(candidate.documentReferringUrls.filter(Boolean))].slice(0, 12)
        : [],
      redirectChain: Array.isArray(candidate?.redirectChain) ? candidate.redirectChain.filter(Boolean) : [],
      claimCited: candidate?.claimCited === true,
      claimSupport: candidate?.claimSupport ?? null,
      claimPassage: normalizeText(candidate?.claimPassage),
      accessOutcome: candidate?.accessOutcome ?? null,
      facilityScope: candidate?.facilityScope ?? "unknown",
      phaseScope: candidate?.phaseScope ?? "unknown",
      timePeriod: candidate?.timePeriod ?? null,
      ...(candidate?.exactProject === true || candidate?.exactProject === false
        ? { exactProject: candidate.exactProject }
        : {}),
      sourceState: "discovered",
      accessibilityState: candidate?.accessOutcome?.state ?? "unknown",
      redirectState: Array.isArray(candidate?.redirectChain) && candidate.redirectChain.length ? "redirected" : "unknown",
      parsingState: candidate?.parsingState
        ?? (candidate?.accessOutcome
          ? (candidate.accessOutcome.state === "accessible" && candidate.accessOutcome.passage ? "parsed" : "failed")
          : (normalizeText(candidate?.excerpt ?? candidate?.snippet) ? "parsed" : "unknown")),
      evidenceMappingState: "unknown",
      claimSupportState: "unknown",
      projectSpecificityState: candidate?.exactProject === true ? "project-specific" : "unknown",
      financialEligibilityState: "unknown",
      transitions: [stateTransition("unknown", "discovered", "Provider returned a source candidate.")],
    };
    if (!originalUrl) {
      ledger.push({ ...base, sourceState: "rejected", rejectionCode: "invalid-url", transitions: [...base.transitions, stateTransition("discovered", "rejected", "URL is missing or invalid.")] });
      continue;
    }
    if (canonicalByUrl.has(canonicalUrl)) {
      const duplicateOf = canonicalByUrl.get(canonicalUrl);
      const existingIndex = occurrences.findIndex((entry) => entry.occurrenceId === duplicateOf);
      const existing = occurrences[existingIndex];
      const replacementWins = Boolean(existing) && (
        Number(base.claimCited) > Number(existing.claimCited) ||
        Number(isPrimarySource(base)) > Number(isPrimarySource(existing)) ||
        Number(Boolean(base.claimSupport && base.claimPassage)) >
          Number(Boolean(existing.claimSupport && existing.claimPassage))
      );
      if (replacementWins) {
        ledger.push({
          ...existing,
          duplicateOf: base.occurrenceId,
          sourceState: "rejected",
          rejectionCode: "duplicate-canonical-source",
          transitions: [...existing.transitions, stateTransition("retained", "rejected", "A later occurrence carried stronger claim or source priority.")],
        });
        occurrences[existingIndex] = {
          ...base,
          sourceState: "retained",
          transitions: [...base.transitions, stateTransition("discovered", "retained", "Canonical representative selected from duplicate lineage.")],
        };
        canonicalByUrl.set(canonicalUrl, base.occurrenceId);
      } else {
        ledger.push({
          ...base,
          duplicateOf,
          sourceState: "rejected",
          rejectionCode: "duplicate-canonical-source",
          transitions: [...base.transitions, stateTransition("discovered", "rejected", "Canonical URL already occurred in the packet.")],
        });
      }
      continue;
    }
    canonicalByUrl.set(canonicalUrl, occurrenceId);
    occurrences.push({ ...base, sourceState: "retained", transitions: [...base.transitions, stateTransition("discovered", "retained", "Unique canonical source selected before retention cap.")] });
  }
  const prioritized = [...occurrences].sort((left, right) =>
    Number(right.claimCited) - Number(left.claimCited) ||
    Number(isPrimarySource(right)) - Number(isPrimarySource(left)) ||
    left.candidateIndex - right.candidateIndex);
  const retainedIds = new Set(prioritized.slice(0, maxRetained).map((item) => item.occurrenceId));
  for (const occurrence of occurrences) {
    if (retainedIds.has(occurrence.occurrenceId)) {
      ledger.push(occurrence);
    } else {
      ledger.push({
        ...occurrence,
        sourceState: "rejected",
        rejectionCode: "retention-cap",
        capDiscarded: true,
        transitions: [...occurrence.transitions, stateTransition("retained", "rejected", `Retention cap of ${maxRetained} unique sources was reached.`)],
      });
    }
  }
  ledger.sort((left, right) => left.candidateIndex - right.candidateIndex);
  const retained = ledger.filter((entry) => entry.sourceState === "retained");
  const canonicalSources = retained.map((entry) => ({
    ...entry,
    sourceId: entry.canonicalUrl,
    url: entry.resolvedUrl,
    originalUrl: entry.originalUrl,
    resolvedUrl: entry.resolvedUrl,
    canonicalUrl: entry.canonicalUrl,
    publisher: publisherForUrl(entry.resolvedUrl),
    sourceState: entry.redirectChain.length ? "redirected" : "retained",
    transitions: entry.redirectChain.length
      ? [...entry.transitions, stateTransition("retained", "redirected", "Provider supplied redirect metadata.")]
      : entry.transitions,
  }));
  return {
    ledger,
    occurrences,
    retained: canonicalSources,
    canonicalSources,
    rawOccurrenceCount: ledger.length,
    rejectedCount: ledger.filter((entry) => entry.sourceState === "rejected").length,
    capDiscardCount: ledger.filter((entry) => entry.rejectionCode === "retention-cap").length,
  };
}
