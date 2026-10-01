import {
  calculateCashFlowModel,
  MAX_CAPACITY_MW,
  type EvidenceRecord,
} from "./cashFlowEngine.js";
import { hasAffirmativeScopedFinancialPoint } from "./affirmativeFinancialPoint.js";
import type { CustomEvidenceRecord } from "@/services/researchProjectService";
import {
  EVIDENCE_SEMANTIC_POLICY_VERSION,
  evaluateEvidenceSourceEligibility,
  getEvidenceSemanticDefinition,
  normalizeEvidenceRecord,
} from "@/data/evidenceSemanticPolicy.mjs";
import {
  SOURCE_VALIDATION_POLICY_VERSION,
  buildClaimPassageMappings,
  evaluateResearchEvidenceEligibility,
  safeSourceUrl,
} from "@/data/sourceValidationPolicy.mjs";
import { hasUsableResearchPassage } from "@/data/researchContentQuality.mjs";

export const SESSION_FINANCIAL_POLICY_VERSION = 3;
export const SESSION_FINANCIAL_MODEL_VERSION = "cash-flow-engine-session-v1";
export const SESSION_FINANCIAL_MAX_EVIDENCE_AGE_DAYS = 365;

export type SessionFinancialTarget =
  | "electricity_cost"
  | "water_consumption"
  | "grid_interconnection";

export type SessionFinancialScope = {
  facility: string;
  phase: string;
};

export type SessionFinancialMetrics = {
  irr: number | null;
  moic: number | null;
  npv: number | null;
  payback: number | null;
};

export type SessionFinancialModelEffect = {
  before: SessionFinancialMetrics;
  after: SessionFinancialMetrics;
  beforeReturnFingerprint: string;
  afterReturnFingerprint: string;
  beforeModelFingerprint: string;
  afterModelFingerprint: string;
  hasModelChange: boolean;
  hasReturnChange: boolean;
  noOpReason: string | null;
};

export type SessionFinancialPreview = {
  id: string;
  target: SessionFinancialTarget;
  eligible: boolean;
  blockedReasons: string[];
  scope: SessionFinancialScope;
  projectKey: string;
  projectName: string;
  sourcePassage: string;
  sourceUrl: string;
  sourceDate: string | null;
  sourceClassification: string;
  sourceTimePeriod: string;
  sourceTimeScope: "current" | "forward-forecast" | "unknown";
  rawValue: string | number;
  rawUnit: string;
  normalizedValue: number | null;
  normalizedUnit: string;
  policyVersion: number;
  modelVersion: string;
  before: SessionFinancialMetrics;
  after: SessionFinancialMetrics;
  beforeReturnFingerprint: string;
  afterReturnFingerprint: string;
  beforeModelFingerprint: string;
  afterModelFingerprint: string;
  hasModelChange: boolean;
  hasReturnChange: boolean;
  noOpReason: string | null;
  nonAcceptanceEffect: SessionFinancialModelEffect;
  bindingDigest: string;
  historyBindingDigest: string;
  baselineEvidenceSnapshot: EvidenceRecord;
  candidateSnapshot: CustomEvidenceRecord;
};

export type SessionFinancialDecision = {
  id: string;
  action: "accept" | "reject" | "evidence-only";
  target: SessionFinancialTarget;
  decidedAt: string;
  preview: SessionFinancialPreview;
  modelEffect: SessionFinancialModelEffect;
  projectKey: string;
};

export type SessionFinancialHistory = {
  version: 1;
  projectKey: string;
  scope: SessionFinancialScope;
  decisions: SessionFinancialDecision[];
};

export type SessionFinancialCurrentContext = {
  projectKey: string;
  projectName: string;
  scope: SessionFinancialScope;
  baseEvidence: EvidenceRecord;
  capacityMW: number | null;
  /** All currently available target records; required to revalidate the complete session overlay. */
  currentCandidates?: Record<string, CustomEvidenceRecord>;
};

export type BuildSessionFinancialPreviewInput = SessionFinancialCurrentContext & {
  candidate: CustomEvidenceRecord;
  history: SessionFinancialHistory;
  now?: string;
};

export type DecideSessionFinancialPreviewInput = {
  preview: SessionFinancialPreview;
  action: SessionFinancialDecision["action"];
  candidate: CustomEvidenceRecord;
  currentContext: SessionFinancialCurrentContext;
  history: SessionFinancialHistory;
  now?: string;
};

const TARGETS = new Set<SessionFinancialTarget>([
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
]);

function isTarget(value: unknown): value is SessionFinancialTarget {
  return typeof value === "string" && TARGETS.has(value as SessionFinancialTarget);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : canonical(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return JSON.stringify(String(value));
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

/** A local change-detection fingerprint, not a cryptographic or provenance proof. */
function fingerprint(value: unknown): string {
  const text = canonical(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizedText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
    : "";
}

function validScopeLabel(value: unknown, generic: "facility" | "phase"): value is string {
  const normalized = normalizedText(value);
  return Boolean(normalized) && !new Set([
    "unknown",
    "unspecified",
    "not specified",
    "n/a",
    "na",
    "none",
    generic,
    `unknown ${generic}`,
    `all ${generic}s`,
  ]).has(normalized);
}

function scopeIsValid(scope: unknown): scope is SessionFinancialScope {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return false;
  const value = scope as Record<string, unknown>;
  return validScopeLabel(value.facility, "facility") && validScopeLabel(value.phase, "phase");
}

function sameScope(left: SessionFinancialScope, right: SessionFinancialScope): boolean {
  return normalizedText(left.facility) === normalizedText(right.facility)
    && normalizedText(left.phase) === normalizedText(right.phase);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function sourcePublication(source: Record<string, unknown>, candidate: CustomEvidenceRecord) {
  const access = source.accessOutcome && typeof source.accessOutcome === "object"
    ? source.accessOutcome as Record<string, unknown>
    : {};
  const date = source.publishedAt ?? access.publicationDate ?? candidate.sourcePublishedAt ?? null;
  const basis = source.publishedAtBasis ?? access.publicationDateBasis ?? candidate.sourcePublishedAtBasis;
  const status = source.publicationDateStatus ?? access.publicationDateStatus;
  const allowedBases = new Set([
    "semantic-metadata",
    "json-ld-date-published",
    "visible-publication-line",
  ]);
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) ||
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date ||
    !allowedBases.has(String(basis)) ||
    (status !== undefined && status !== "resolved")
  ) return null;
  return date;
}

function sourceScopeStatusMatches(source: Record<string, unknown>, scope: SessionFinancialScope): boolean {
  const facilityStatus = normalizedText(source.facilityScope);
  const phaseStatus = normalizedText(source.phaseScope);
  const facilityMetadataMatches = facilityStatus === normalizedText(scope.facility)
    || ["exact-facility", "facility", "exact-project", "project"].includes(facilityStatus);
  const phaseMetadataMatches = phaseStatus === normalizedText(scope.phase)
    || phaseStatus === "exact-phase";
  return facilityMetadataMatches && phaseMetadataMatches;
}

function validateSourceTimePeriod(
  source: Record<string, unknown>,
  now: string,
): { valid: boolean; period: string; scope: "current" | "forward-forecast" | "unknown"; reason: string | null } {
  const period = typeof source.timePeriod === "string" ? source.timePeriod.trim() : "";
  const years = [...period.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  if (!period || years.length !== 1) {
    return {
      valid: false,
      period,
      scope: "unknown",
      reason: "The claim time period must identify one explicit current or forecast year.",
    };
  }
  const year = years[0];
  const currentYear = new Date(now).getUTCFullYear();
  const forecastDisclosure = /\b(?:forecast|projected|planned|proposed|expected|scheduled|will\s+be)\b/i.test(period);
  if (year < currentYear) {
    return {
      valid: false,
      period,
      scope: "unknown",
      reason: "The claim time period is historical and cannot establish a current financial input.",
    };
  }
  if (year > currentYear && !forecastDisclosure) {
    return {
      valid: false,
      period,
      scope: "unknown",
      reason: "A forward time period must be explicitly identified as a forecast, not current actual data.",
    };
  }
  return {
    valid: true,
    period,
    scope: year > currentYear || forecastDisclosure ? "forward-forecast" : "current",
    reason: null,
  };
}

function targetSourceValidation({
  target,
  source,
  projectName,
  scope,
  now,
  rawValue,
  semanticValue,
  candidate,
}: {
  target: SessionFinancialTarget;
  source: Record<string, unknown>;
  projectName: string;
  scope: SessionFinancialScope;
  now: string;
  rawValue: string | number;
  semanticValue: number;
  candidate: CustomEvidenceRecord;
}): {
  valid: boolean;
  passage: string;
  url: string;
  sourceDate: string | null;
  sourceClassification: string;
  sourceTimePeriod: string;
  sourceTimeScope: "current" | "forward-forecast" | "unknown";
  reasons: string[];
} {
  const reasons: string[] = [];
  const access = source.accessOutcome && typeof source.accessOutcome === "object"
    ? source.accessOutcome as Record<string, unknown>
    : {};
  const retainedPassage = access.state === "accessible" && typeof access.passage === "string"
    ? access.passage
    : "";
  const quotation = typeof source.claimPassage === "string" ? source.claimPassage.trim() : "";
  const excerpt = typeof source.excerpt === "string" ? source.excerpt : "";
  const url = safeSourceUrl(
    typeof source.url === "string"
      ? source.url
      : typeof source.resolvedUrl === "string"
        ? source.resolvedUrl
        : candidate.sourceUrl,
  ) ?? "";

  if (!["retained", "redirected"].includes(String(source.sourceState))) {
    reasons.push("Source is not retained in the current evidence packet.");
  }
  if (access.state !== "accessible" || !retainedPassage.trim()) {
    reasons.push("A retained, successfully accessed source passage is required.");
  }
  if (
    quotation.length < 40 ||
    (quotation.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) < 8 ||
    !hasUsableResearchPassage(quotation) ||
    !excerpt.toLocaleLowerCase("en-US").includes(quotation.toLocaleLowerCase("en-US")) ||
    !retainedPassage.toLocaleLowerCase("en-US").includes(quotation.toLocaleLowerCase("en-US"))
  ) {
    reasons.push("An actual retained quotation matching the source excerpt is required.");
  }
  if (!url) reasons.push("A valid public source URL is required.");
  if (!sourceScopeStatusMatches(source, scope)) {
    reasons.push("Source facility or phase metadata does not match the explicit session scope.");
  }
  const sourceDate = sourcePublication(source, candidate);
  if (!sourceDate) reasons.push("A resolved publication date with an explicit publication-date basis is required.");
  const timePeriod = validateSourceTimePeriod(source, now);
  if (!timePeriod.valid && timePeriod.reason) reasons.push(timePeriod.reason);
  if (
    timePeriod.scope === "forward-forecast" &&
    !/\b(?:forecast|projected|planned|proposed|expected|scheduled|will\s+be)\b/i.test(quotation)
  ) {
    reasons.push("A forward time period must be disclosed in the retained quotation as a forecast, not current actual data.");
  }

  const definition = getEvidenceSemanticDefinition(target);
  if (!definition?.eligibleSourceTypes.includes(String(source.sourceClass))) {
    reasons.push("Source type is not eligible for this financial evidence target.");
  }
  if (source.exactProject !== true) {
    reasons.push("The source is not marked as an exact-project source.");
  }
  if (candidate.sourceRelevance !== "exact-project") {
    reasons.push("Related-context or unresolved evidence cannot enter the session model.");
  }
  if (candidate.coverageStatus === "conflicting" || candidate.conflictSummary?.trim()) {
    reasons.push("Conflicting source coverage blocks session model acceptance.");
  }

  const mappings = buildClaimPassageMappings({
    id: target,
    sources: [source],
    project: { name: projectName },
    claim: {
      text: candidate.description,
      description: candidate.description,
      value: rawValue,
      numericValue: rawValue,
      sourceRelevance: candidate.sourceRelevance,
    },
    coverageStatus: candidate.coverageStatus,
    conflictSummary: candidate.conflictSummary,
  });
  const mapping = mappings[0];
  if (!mapping || mapping.supportStatus !== "supported") {
    reasons.push("Current source validation did not produce an exact-project claim-to-passage mapping.");
  }

  const researchEligibility = evaluateResearchEvidenceEligibility({
    id: target,
    sources: [source],
    sourceUrl: url,
    sourceRelevance: candidate.sourceRelevance,
    classification: candidate.classification,
    sourceSupportConfidence: candidate.sourceSupportConfidence,
    coverageStatus: candidate.coverageStatus,
    conflictSummary: candidate.conflictSummary,
    claimMappings: mappings,
    semanticValidationStatus: "valid",
  });
  if (!researchEligibility.eligible) reasons.push(...researchEligibility.reasons);

  const personalScopeAndMeasureBoundQuantity = hasAffirmativeScopedFinancialPoint({
    passage: quotation,
    target,
    projectName,
    facility: scope.facility,
    phase: scope.phase,
    normalizedValue: semanticValue,
    claimTimePeriod: timePeriod.period,
  });
  if (!personalScopeAndMeasureBoundQuantity) {
    reasons.push("The retained quotation does not bind the exact quantity, unit, measure, facility, phase, and project in one assertion.");
  }

  return {
    valid: reasons.length === 0,
    passage: quotation,
    url,
    sourceDate,
    sourceClassification: typeof source.sourceClass === "string" ? source.sourceClass : "unknown",
    sourceTimePeriod: timePeriod.period,
    sourceTimeScope: timePeriod.scope,
    reasons: [...new Set(reasons)],
  };
}

function hasValidCapacity(capacityMW: number | null): capacityMW is number {
  return typeof capacityMW === "number" &&
    Number.isFinite(capacityMW) &&
    capacityMW > 0 &&
    capacityMW <= MAX_CAPACITY_MW;
}

function evaluateSessionFinancialModel(evidence: EvidenceRecord, capacityMW: number | null) {
  if (!hasValidCapacity(capacityMW)) {
    const metrics: SessionFinancialMetrics = { irr: null, moic: null, npv: null, payback: null };
    return {
      metrics,
      returnFingerprint: fingerprint(metrics),
      modelFingerprint: fingerprint({ unavailable: true, capacityMW }),
    };
  }
  const model = calculateCashFlowModel(evidence, capacityMW ?? undefined);
  const metrics: SessionFinancialMetrics = {
    irr: model.projectIRR,
    moic: model.moic,
    npv: model.npv,
    payback: model.payback,
  };
  return {
    metrics,
    returnFingerprint: fingerprint(metrics),
    modelFingerprint: fingerprint({
      assumptions: model.assumptions,
      schedule: model.schedule,
      returnSensitivity: model.returnSensitivity,
      waterfall: model.waterfall,
      waterfallClosureDelta: model.waterfallClosureDelta,
      waterfallReconciles: model.waterfallReconciles,
    }),
  };
}

function buildSessionFinancialModelEffect(
  beforeEvidence: EvidenceRecord,
  afterEvidence: EvidenceRecord,
  capacityMW: number | null,
): SessionFinancialModelEffect {
  const beforeState = evaluateSessionFinancialModel(beforeEvidence, capacityMW);
  const afterState = evaluateSessionFinancialModel(afterEvidence, capacityMW);
  const hasModelChange = beforeState.modelFingerprint !== afterState.modelFingerprint;
  const hasReturnChange = beforeState.returnFingerprint !== afterState.returnFingerprint;
  const modelAvailable = hasValidCapacity(capacityMW);
  return {
    before: beforeState.metrics,
    after: afterState.metrics,
    beforeReturnFingerprint: beforeState.returnFingerprint,
    afterReturnFingerprint: afterState.returnFingerprint,
    beforeModelFingerprint: beforeState.modelFingerprint,
    afterModelFingerprint: afterState.modelFingerprint,
    hasModelChange,
    hasReturnChange,
    noOpReason: !modelAvailable
      ? "Financial model unavailable because project capacity is missing or invalid."
      : hasModelChange
        ? hasReturnChange
          ? null
          : "Financial model inputs or projected cash flows changed, but the disclosed return metrics did not change."
        : "The modeled financial assumptions, projected cash flows, and return metrics did not change for this decision.",
  };
}

function acceptedModelEffectFromPreview(preview: SessionFinancialPreview): SessionFinancialModelEffect {
  return {
    before: clone(preview.before),
    after: clone(preview.after),
    beforeReturnFingerprint: preview.beforeReturnFingerprint,
    afterReturnFingerprint: preview.afterReturnFingerprint,
    beforeModelFingerprint: preview.beforeModelFingerprint,
    afterModelFingerprint: preview.afterModelFingerprint,
    hasModelChange: preview.hasModelChange,
    hasReturnChange: preview.hasReturnChange,
    noOpReason: preview.noOpReason,
  };
}

function normalizeCandidate(candidate: CustomEvidenceRecord, target: SessionFinancialTarget) {
  const rawValue = candidate.rawValue ?? candidate.value;
  const rawUnit = candidate.rawUnit ?? candidate.unit;
  const semantic = normalizeEvidenceRecord({
    id: target,
    value: rawValue,
    numericValue: rawValue,
    unit: rawUnit,
    description: candidate.description,
    citation: candidate.citation,
    sourceContext: candidate.rawText ?? candidate.description,
    explicitZero: rawValue === 0 && Boolean(candidate.sourceUrl),
  });
  return { rawValue, rawUnit, semantic };
}

function bindingDigest(
  context: SessionFinancialCurrentContext,
  candidate: CustomEvidenceRecord,
  target: SessionFinancialTarget,
  baselineEvidenceSnapshot: EvidenceRecord,
  history: SessionFinancialHistory,
): string {
  return fingerprint({
    policyVersion: SESSION_FINANCIAL_POLICY_VERSION,
    modelVersion: SESSION_FINANCIAL_MODEL_VERSION,
    semanticPolicyVersion: EVIDENCE_SEMANTIC_POLICY_VERSION,
    sourceValidationPolicyVersion: SOURCE_VALIDATION_POLICY_VERSION,
    projectKey: context.projectKey,
    projectName: context.projectName,
    scope: context.scope,
    capacityMW: context.capacityMW,
    target,
    candidate,
    baseEvidence: context.baseEvidence,
    baselineEvidenceSnapshot,
    historyBindingDigest: fingerprint(history.decisions),
  });
}

function isSessionFinancialMetrics(value: unknown): value is SessionFinancialMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metrics = value as Record<string, unknown>;
  return (metrics.irr === null || (typeof metrics.irr === "number" && Number.isFinite(metrics.irr))) &&
    (metrics.moic === null || (typeof metrics.moic === "number" && Number.isFinite(metrics.moic))) &&
    (metrics.npv === null || (typeof metrics.npv === "number" && Number.isFinite(metrics.npv))) &&
    (metrics.payback === null || (typeof metrics.payback === "number" && Number.isFinite(metrics.payback)));
}

function isSessionFinancialModelEffect(value: unknown): value is SessionFinancialModelEffect {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effect = value as Record<string, unknown>;
  const validFingerprint = (fingerprintValue: unknown) =>
    typeof fingerprintValue === "string" && /^[0-9a-f]{16}$/.test(fingerprintValue);
  if (!(isSessionFinancialMetrics(effect.before) &&
    isSessionFinancialMetrics(effect.after) &&
    validFingerprint(effect.beforeReturnFingerprint) &&
    validFingerprint(effect.afterReturnFingerprint) &&
    validFingerprint(effect.beforeModelFingerprint) &&
    validFingerprint(effect.afterModelFingerprint) &&
    typeof effect.hasModelChange === "boolean" &&
    typeof effect.hasReturnChange === "boolean" &&
    (effect.noOpReason === null || typeof effect.noOpReason === "string"))) return false;
  return effect.beforeReturnFingerprint === fingerprint(effect.before) &&
    effect.afterReturnFingerprint === fingerprint(effect.after) &&
    effect.hasModelChange === (effect.beforeModelFingerprint !== effect.afterModelFingerprint) &&
    effect.hasReturnChange === (effect.beforeReturnFingerprint !== effect.afterReturnFingerprint) &&
    (effect.hasModelChange && effect.hasReturnChange
      ? effect.noOpReason === null
      : typeof effect.noOpReason === "string" && Boolean(effect.noOpReason.trim()));
}

function isHistory(value: unknown, projectKey?: string, scope?: SessionFinancialScope): value is SessionFinancialHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const history = value as Record<string, unknown>;
  const historyScope = history.scope;
  if (
    history.version !== 1 ||
    typeof history.projectKey !== "string" ||
    !history.projectKey.trim() ||
    (projectKey !== undefined && history.projectKey !== projectKey) ||
    !scopeIsValid(historyScope) ||
    (scope !== undefined && !sameScope(historyScope, scope)) ||
    !Array.isArray(history.decisions)
  ) return false;
  return history.decisions.every((decision) => {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) return false;
    const item = decision as Record<string, unknown>;
    const preview = item.preview as Record<string, unknown> | null;
    const previewScope = preview && typeof preview === "object" ? preview.scope : null;
    const candidateSnapshot = preview && typeof preview === "object" ? preview.candidateSnapshot : null;
    return Boolean(
      typeof item.id === "string" && item.id.trim() &&
      ["accept", "reject", "evidence-only"].includes(String(item.action)) &&
      isTarget(item.target) &&
      validTimestamp(item.decidedAt) &&
      item.projectKey === history.projectKey &&
      preview && typeof preview === "object" &&
      preview.target === item.target &&
      preview.projectKey === history.projectKey &&
      preview.policyVersion === SESSION_FINANCIAL_POLICY_VERSION &&
      preview.modelVersion === SESSION_FINANCIAL_MODEL_VERSION &&
       scopeIsValid(previewScope) &&
       sameScope(previewScope, historyScope) &&
      typeof preview.bindingDigest === "string" &&
      /^[0-9a-f]{16}$/.test(preview.bindingDigest) &&
       typeof preview.eligible === "boolean" &&
       (item.action !== "accept" || preview.eligible) &&
      Array.isArray(preview.blockedReasons) &&
       candidateSnapshot && typeof candidateSnapshot === "object" &&
       !Array.isArray(candidateSnapshot) &&
       (candidateSnapshot as Record<string, unknown>).id === item.target &&
       typeof preview.sourceClassification === "string" &&
       typeof preview.sourceTimePeriod === "string" &&
       ["current", "forward-forecast", "unknown"].includes(String(preview.sourceTimeScope)) &&
       isSessionFinancialModelEffect(preview.nonAcceptanceEffect) &&
      preview.baselineEvidenceSnapshot && typeof preview.baselineEvidenceSnapshot === "object" &&
      typeof preview.historyBindingDigest === "string" &&
      /^[0-9a-f]{16}$/.test(preview.historyBindingDigest) &&
       isSessionFinancialMetrics(preview.before) &&
       isSessionFinancialMetrics(preview.after) &&
       /^[0-9a-f]{16}$/.test(String(preview.beforeReturnFingerprint)) &&
       /^[0-9a-f]{16}$/.test(String(preview.afterReturnFingerprint)) &&
       /^[0-9a-f]{16}$/.test(String(preview.beforeModelFingerprint)) &&
       /^[0-9a-f]{16}$/.test(String(preview.afterModelFingerprint)) &&
       typeof preview.hasModelChange === "boolean" &&
       preview.hasModelChange === (preview.beforeModelFingerprint !== preview.afterModelFingerprint) &&
       typeof preview.hasReturnChange === "boolean" &&
       preview.hasReturnChange === (preview.beforeReturnFingerprint !== preview.afterReturnFingerprint) &&
       preview.beforeReturnFingerprint === fingerprint(preview.before) &&
       preview.afterReturnFingerprint === fingerprint(preview.after) &&
       (preview.noOpReason === null || typeof preview.noOpReason === "string") &&
       isSessionFinancialModelEffect(item.modelEffect) &&
       canonical(item.modelEffect) === canonical(item.action === "accept"
         ? acceptedModelEffectFromPreview(preview as unknown as SessionFinancialPreview)
         : preview.nonAcceptanceEffect)
    );
  });
}

export function emptySessionFinancialHistory(
  projectKey: string,
  scope: SessionFinancialScope,
): SessionFinancialHistory {
  if (typeof projectKey !== "string" || !projectKey.trim()) {
    throw new Error("A non-empty project key is required for session financial history.");
  }
  return {
    version: 1,
    projectKey,
    scope: clone(scope),
    decisions: [],
  };
}

function buildSessionFinancialPreviewCore(
  input: BuildSessionFinancialPreviewInput,
  baselineEvidenceSnapshot: EvidenceRecord = input.baseEvidence,
): SessionFinancialPreview {
  const {
    projectKey,
    projectName,
    scope,
    candidate,
    baseEvidence,
    capacityMW,
    history,
    now = new Date().toISOString(),
  } = input;
  const blockedReasons: string[] = [];
  if (!projectKey.trim() || !projectName.trim()) {
    blockedReasons.push("A project key and explicit project name are required.");
  }
  if (!scopeIsValid(scope)) {
    blockedReasons.push("Explicit, non-unknown facility and phase labels are required.");
  }
  if (!isHistory(history, projectKey, scope)) {
    blockedReasons.push("Session history belongs to a different project/scope or uses an unsupported policy.");
  }
  if (!validTimestamp(now)) blockedReasons.push("Preview time must be a valid timestamp.");

  const target = candidate?.id;
  if (!isTarget(target)) {
    blockedReasons.push("Only electricity_cost, water_consumption, and grid_interconnection are in this session slice.");
  }

  const safeTarget = isTarget(target) ? target : "electricity_cost";
  const { rawValue, rawUnit, semantic } = normalizeCandidate(candidate, safeTarget);
  const normalizedValue = semantic.validationStatus === "valid" &&
    typeof semantic.normalizedValue === "number" &&
    Number.isFinite(semantic.normalizedValue)
    ? semantic.normalizedValue
    : null;
  const normalizedUnit = semantic.normalizedUnit ?? "";

  if (!isTarget(target)) {
    // Keep a deterministic display shape for blocked unknown targets without letting
    // them reach the financial model.
  } else if (candidate.id !== safeTarget) {
    blockedReasons.push("Candidate target does not match the current financial slice.");
  }
  if (semantic.policyVersion !== EVIDENCE_SEMANTIC_POLICY_VERSION) {
    blockedReasons.push("The semantic normalization policy is not current.");
  }
  if (semantic.validationStatus !== "valid" || normalizedValue === null) {
    blockedReasons.push(...semantic.quarantineReasons);
  }
  if (
    candidate.semanticValidationStatus === "quarantined" ||
    candidate.normalization?.validationStatus === "quarantined" ||
    candidate.researchState === "quarantined" ||
    (candidate.quarantineReasons?.length ?? 0) > 0
  ) {
    blockedReasons.push("A quarantined or unresolved candidate cannot be accepted.");
  }
  if (
    candidate.normalization?.policyVersion !== undefined &&
    candidate.normalization.policyVersion !== EVIDENCE_SEMANTIC_POLICY_VERSION
  ) {
    blockedReasons.push("Candidate normalization metadata was produced under an old semantic policy.");
  }
  if (
    candidate.sourceValidation?.policyVersion !== undefined &&
    candidate.sourceValidation.policyVersion !== SOURCE_VALIDATION_POLICY_VERSION
  ) {
    blockedReasons.push("Candidate source-validation metadata was produced under an old policy.");
  }
  if (
    candidate.classification !== "Verified Evidence" &&
    candidate.classification !== "Management Assertion"
  ) {
    blockedReasons.push("Only source-backed classifications can be considered for session financial acceptance.");
  }
  const sourceEligibility = evaluateEvidenceSourceEligibility({
    id: safeTarget,
    sources: candidate.sources,
    sourceUrl: candidate.sourceUrl,
    classification: candidate.classification,
    sourceSupportConfidence: candidate.sourceSupportConfidence,
    coverageStatus: candidate.coverageStatus,
  });
  if (!sourceEligibility.eligible) blockedReasons.push(...sourceEligibility.reasons);
  if (candidate.sourceRelevance === "related-context" || candidate.sourceRelevance === "unresolved") {
    blockedReasons.push("Related-context or unresolved evidence is not eligible for the session model.");
  }
  if (candidate.coverageStatus === "conflicting" || candidate.conflictSummary?.trim()) {
    blockedReasons.push("Conflicting source coverage blocks session model acceptance.");
  }
  if (candidate.semanticValidationStatus === "unresolved" || candidate.normalization?.validationStatus === "unresolved") {
    blockedReasons.push("Unresolved candidate normalization cannot be accepted.");
  }

  let selectedSource: ReturnType<typeof targetSourceValidation> | null = null;
  let sourcePassage = "";
  let sourceUrl = "";
  let sourceDate: string | null = null;
  let sourceClassification = "unknown";
  let sourceTimePeriod = "";
  let sourceTimeScope: SessionFinancialPreview["sourceTimeScope"] = "unknown";
  if (normalizedValue !== null && isTarget(target) && scopeIsValid(scope)) {
    for (const source of (candidate.sources ?? []) as unknown as Array<Record<string, unknown>>) {
      const result = targetSourceValidation({
        target,
        source,
        projectName,
        scope,
        now,
        rawValue,
        semanticValue: normalizedValue,
        candidate,
      });
      if (!selectedSource || result.valid) selectedSource = result;
      if (result.valid) break;
    }
  }
  if (selectedSource) {
    sourcePassage = selectedSource.passage;
    sourceUrl = selectedSource.url;
    sourceDate = selectedSource.sourceDate;
    sourceClassification = selectedSource.sourceClassification;
    sourceTimePeriod = selectedSource.sourceTimePeriod;
    sourceTimeScope = selectedSource.sourceTimeScope;
    if (!selectedSource.valid) blockedReasons.push(...selectedSource.reasons);
  } else {
    blockedReasons.push("No retained source is available for current target-specific validation.");
  }

  if (selectedSource?.valid && sourceDate && validTimestamp(now)) {
    const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const published = Date.parse(`${sourceDate}T00:00:00.000Z`);
    if (published > today) blockedReasons.push("Future-dated source publication cannot support a session decision.");
    else if (today - published > SESSION_FINANCIAL_MAX_EVIDENCE_AGE_DAYS * 24 * 60 * 60 * 1_000) {
      blockedReasons.push("Source publication is older than the current 365-day financial evidence window.");
    }
  }

  if (!hasValidCapacity(capacityMW)) {
    blockedReasons.push("A valid explicit project capacity is required; financial preview metrics are unavailable.");
  }
  const reasons = [...new Set(blockedReasons)];
  const eligible = reasons.length === 0 && normalizedValue !== null && isTarget(target);
  const snapshot = clone(candidate);
  const beforeEvidence = clone(baselineEvidenceSnapshot);
  let acceptedEvidence = beforeEvidence;
  if (eligible && normalizedValue !== null && isTarget(target)) {
    acceptedEvidence = applyCurrentSessionPoint(clone(baselineEvidenceSnapshot), {
      target,
      normalizedValue,
      normalizedUnit,
      rawValue,
      rawUnit: typeof rawUnit === "string" ? rawUnit : "",
      sourcePassage,
      sourceUrl,
      sourceClassification,
      candidateSnapshot: snapshot,
    });
  }
  const acceptanceEffect = buildSessionFinancialModelEffect(beforeEvidence, acceptedEvidence, capacityMW);
  const nonAcceptanceEvidence = resetTargetToCanonicalBaseline(
    clone(beforeEvidence),
    baseEvidence,
    safeTarget,
  );
  const nonAcceptanceEffect = buildSessionFinancialModelEffect(beforeEvidence, nonAcceptanceEvidence, capacityMW);
  const noOpReason = !eligible
    ? `No model change: ${reasons[0] ?? "the candidate is not eligible"}`
    : acceptanceEffect.noOpReason;
  const context: SessionFinancialCurrentContext = {
    projectKey,
    projectName,
    scope: clone(scope),
    baseEvidence,
    capacityMW,
    currentCandidates: input.currentCandidates,
  };
  const historyBindingDigest = fingerprint(history.decisions);
  const immutableBaseline = clone(baselineEvidenceSnapshot);
  const digest = bindingDigest(context, snapshot, safeTarget, immutableBaseline, history);
  return {
    id: `session-financial-preview:${safeTarget}:${digest}`,
    target: safeTarget,
    eligible,
    blockedReasons: reasons,
    scope: clone(scope),
    projectKey,
    projectName,
    sourcePassage,
    sourceUrl,
    sourceDate,
    sourceClassification,
    sourceTimePeriod,
    sourceTimeScope,
    rawValue,
    rawUnit: typeof rawUnit === "string" ? rawUnit : "",
    normalizedValue,
    normalizedUnit,
    policyVersion: SESSION_FINANCIAL_POLICY_VERSION,
    modelVersion: SESSION_FINANCIAL_MODEL_VERSION,
    before: acceptanceEffect.before,
    after: acceptanceEffect.after,
    beforeReturnFingerprint: acceptanceEffect.beforeReturnFingerprint,
    afterReturnFingerprint: acceptanceEffect.afterReturnFingerprint,
    beforeModelFingerprint: acceptanceEffect.beforeModelFingerprint,
    afterModelFingerprint: acceptanceEffect.afterModelFingerprint,
    hasModelChange: acceptanceEffect.hasModelChange,
    hasReturnChange: acceptanceEffect.hasReturnChange,
    noOpReason,
    nonAcceptanceEffect,
    bindingDigest: digest,
    historyBindingDigest,
    baselineEvidenceSnapshot: immutableBaseline,
    candidateSnapshot: snapshot,
  };
}

function resetTargetToCanonicalBaseline(
  evidence: EvidenceRecord,
  baseEvidence: EvidenceRecord,
  target: SessionFinancialTarget,
) {
  const next = { ...evidence };
  if (baseEvidence[target]) next[target] = clone(baseEvidence[target]);
  else delete next[target];
  return next;
}

function applyCurrentSessionPoint(
  evidence: EvidenceRecord,
  preview: Pick<
    SessionFinancialPreview,
    | "target"
    | "normalizedValue"
    | "normalizedUnit"
    | "rawValue"
    | "rawUnit"
    | "sourcePassage"
    | "sourceUrl"
    | "sourceClassification"
    | "candidateSnapshot"
  >,
): EvidenceRecord {
  const before = evidence[preview.target];
  if (!before || preview.normalizedValue === null) return evidence;
  const sourceCandidate = preview.candidateSnapshot;
  return {
    ...evidence,
    [preview.target]: {
      ...before,
      value: preview.normalizedValue,
      numericValue: preview.normalizedValue,
      rawValue: preview.rawValue,
      rawUnit: preview.rawUnit,
      normalizedValue: preview.normalizedValue,
      normalizedUnit: preview.normalizedUnit,
      unit: preview.normalizedUnit,
      normalization: {
        policyVersion: EVIDENCE_SEMANTIC_POLICY_VERSION,
        conversion: preview.rawUnit === preview.normalizedUnit ? "none" : `${preview.rawUnit} → ${preview.normalizedUnit}`,
        validationStatus: "valid",
      },
      semanticValidationStatus: "valid",
      eligibleForModel: true,
      acceptedForModel: true,
      researchState: "accepted",
      quarantineReasons: undefined,
      capacityBasis: preview.target === "water_consumption" ? "facility-absolute" : before.capacityBasis,
      modelTreatment: "source-neutral",
      modelClassification: before.modelClassification ?? before.classification,
      modelConfidenceTreatment: before.modelConfidenceTreatment ?? before.classification,
      classification: sourceCandidate.classification,
      origin: "session-only",
      sourceClassification: preview.sourceClassification,
      sourceSupportConfidence: sourceCandidate.sourceSupportConfidence,
      sources: clone(sourceCandidate.sources ?? []),
      coverageStatus: sourceCandidate.coverageStatus,
      sourceUrl: preview.sourceUrl,
      sourceRole: `Session-only accepted financial observation; source class: ${preview.sourceClassification}`,
      citation: preview.sourcePassage,
      description: preview.sourcePassage,
      rawText: preview.sourcePassage,
      sourceId: preview.sourceUrl,
    },
  };
}

function replaySessionOverlay(
  context: SessionFinancialCurrentContext,
  history: SessionFinancialHistory,
  now: string,
  currentCandidates: Record<string, CustomEvidenceRecord> = {},
): {
  evidence: EvidenceRecord;
  ignoredReasons: Record<string, string>;
  blockingReasons: Record<string, string>;
} {
  let evidence = clone(context.baseEvidence);
  const ignoredReasons: Record<string, string> = {};
  const blockingReasons: Record<string, string> = {};
  const failedLatestTargets = new Set<SessionFinancialTarget>();
  const latestIndexByTarget = new Map<SessionFinancialTarget, number>();
  history.decisions.forEach((decision, index) => latestIndexByTarget.set(decision.target, index));
  for (const [index, decision] of history.decisions.entries()) {
    if (decision.action !== "accept") {
      evidence = resetTargetToCanonicalBaseline(evidence, context.baseEvidence, decision.target);
      ignoredReasons[decision.target] = decision.action === "reject"
        ? "The latest session decision rejected this point; earlier accepted mappings are inactive."
        : "The latest session decision retained evidence only; earlier accepted mappings are inactive.";
      continue;
    }
    const isLatestForTarget = latestIndexByTarget.get(decision.target) === index;
    const currentCandidate = currentCandidates[decision.target];
    if (!currentCandidate) {
      if (isLatestForTarget) {
        const reason = "No current candidate is available to revalidate the latest accepted session snapshot.";
        ignoredReasons[decision.target] = reason;
        blockingReasons[decision.target] = reason;
        failedLatestTargets.add(decision.target);
      }
      continue;
    }
    if (
      canonical(currentCandidate) !== canonical(decision.preview.candidateSnapshot) ||
      currentCandidate.id !== decision.target
    ) {
      if (isLatestForTarget) {
        const reason = "Current candidate differs from the latest immutable accepted session snapshot.";
        ignoredReasons[decision.target] = reason;
        blockingReasons[decision.target] = reason;
        failedLatestTargets.add(decision.target);
      }
      continue;
    }
    const prefix: SessionFinancialHistory = {
      version: 1,
      projectKey: history.projectKey,
      scope: clone(history.scope),
      decisions: history.decisions.slice(0, index),
    };
    const regenerated = buildSessionFinancialPreviewCore({
      ...context,
      candidate: currentCandidate,
      history: prefix,
      now,
    }, evidence);
    if (regenerated.bindingDigest !== decision.preview.bindingDigest) {
      const reason = "Accepted session snapshot no longer matches the complete baseline, prior history, or candidate binding.";
      ignoredReasons[decision.target] = reason;
      if (isLatestForTarget) {
        blockingReasons[decision.target] = reason;
        failedLatestTargets.add(decision.target);
      }
      continue;
    }
    if (canonical(regenerated) !== canonical(decision.preview)) {
      const reason = "Accepted preview disclosure was edited after the decision snapshot was recorded.";
      ignoredReasons[decision.target] = reason;
      if (isLatestForTarget) {
        blockingReasons[decision.target] = reason;
        failedLatestTargets.add(decision.target);
      }
      continue;
    }
    if (!regenerated.eligible || regenerated.normalizedValue === null) {
      const reason = regenerated.blockedReasons[0] ?? "Accepted session point is no longer eligible under current policy.";
      ignoredReasons[decision.target] = reason;
      if (isLatestForTarget) {
        blockingReasons[decision.target] = reason;
        failedLatestTargets.add(decision.target);
      }
      continue;
    }
    const afterEvidence = applyCurrentSessionPoint(evidence, regenerated);
    if (
      isLatestForTarget &&
      canonical(buildSessionFinancialModelEffect(evidence, afterEvidence, context.capacityMW)) !==
        canonical(decision.modelEffect)
    ) {
      const reason = "Accepted decision model-effect disclosure no longer matches the current session overlay.";
      ignoredReasons[decision.target] = reason;
      blockingReasons[decision.target] = reason;
      failedLatestTargets.add(decision.target);
      continue;
    }
    evidence = afterEvidence;
    delete ignoredReasons[decision.target];
  }
  for (const target of failedLatestTargets) {
    evidence = resetTargetToCanonicalBaseline(evidence, context.baseEvidence, target);
  }
  return { evidence, ignoredReasons, blockingReasons };
}

export function buildSessionFinancialPreview(input: BuildSessionFinancialPreviewInput): SessionFinancialPreview {
  const { projectKey, projectName, scope, baseEvidence, capacityMW, history, candidate, now = new Date().toISOString() } = input;
  const context: SessionFinancialCurrentContext = {
    projectKey,
    projectName,
    scope,
    baseEvidence,
    capacityMW,
    currentCandidates: input.currentCandidates,
  };
  const currentCandidates = {
    ...(input.currentCandidates ?? {}),
    [candidate.id]: candidate,
  };
  const overlay = isHistory(history, projectKey, scope) && validTimestamp(now)
    ? replaySessionOverlay(context, history, now, currentCandidates)
    : { evidence: clone(baseEvidence), ignoredReasons: {}, blockingReasons: {} };
  const preview = buildSessionFinancialPreviewCore(input, overlay.evidence);
  const historyBlockers = Object.entries(overlay.blockingReasons)
    .filter(([target]) => target !== candidate.id)
    .map(([, reason]) => reason);
  if (!historyBlockers.length) return preview;
  const blockedReasons = [...new Set([...preview.blockedReasons, ...historyBlockers])];
  return {
    ...preview,
    eligible: false,
    blockedReasons,
    noOpReason: `No model change: ${blockedReasons[0]}`,
  };
}

function currentPreviewMatches(
  preview: SessionFinancialPreview,
  candidate: CustomEvidenceRecord,
  context: SessionFinancialCurrentContext,
  history: SessionFinancialHistory,
  now: string,
): SessionFinancialPreview {
  if (!isTarget(preview.target)) throw new Error("Preview target is outside the session financial allowlist.");
  if (!isHistory(history, context.projectKey, context.scope)) {
    throw new Error("Session history does not match the current project and explicit scope.");
  }
  if (
    preview.projectKey !== context.projectKey ||
    !sameScope(preview.scope, context.scope) ||
    preview.policyVersion !== SESSION_FINANCIAL_POLICY_VERSION ||
    preview.modelVersion !== SESSION_FINANCIAL_MODEL_VERSION ||
    canonical(preview.candidateSnapshot) !== canonical(candidate)
  ) {
    throw new Error("Preview no longer matches the current project, scope, policy, or immutable candidate snapshot.");
  }
  const current = buildSessionFinancialPreview({
    ...context,
    candidate,
    history,
    now,
  });
  if (preview.bindingDigest !== current.bindingDigest) {
    throw new Error("Preview baseline or candidate binding changed; build a fresh preview.");
  }
  if (canonical(preview) !== canonical(current)) {
    throw new Error("Preview disclosure was edited after it was built; build a fresh preview.");
  }
  return current;
}

export function decideSessionFinancialPreview({
  preview,
  action,
  candidate,
  currentContext,
  history,
  now = new Date().toISOString(),
}: DecideSessionFinancialPreviewInput): SessionFinancialHistory {
  if (!["accept", "reject", "evidence-only"].includes(action)) {
    throw new Error("Unsupported session financial decision action.");
  }
  if (!validTimestamp(now)) throw new Error("Decision time must be a valid timestamp.");
  const current = currentPreviewMatches(preview, candidate, currentContext, history, now);
  if (action === "accept" && !current.eligible) {
    throw new Error(`Session financial candidate is blocked: ${current.blockedReasons.join(" ")}`);
  }
  const decisionId = `session-financial-decision:${history.decisions.length + 1}:${current.target}:${action}:${current.bindingDigest}`;
  const modelEffect: SessionFinancialModelEffect = action === "accept"
    ? acceptedModelEffectFromPreview(current)
    : clone(current.nonAcceptanceEffect);
  const decision: SessionFinancialDecision = {
    id: decisionId,
    action,
    target: current.target,
    decidedAt: now,
    preview: clone(current),
    modelEffect,
    projectKey: currentContext.projectKey,
  };
  return {
    version: 1,
    projectKey: history.projectKey,
    scope: clone(history.scope),
    decisions: [...history.decisions.map((item) => clone(item)), decision],
  };
}

export function applySessionFinancialDecisions({
  projectKey,
  projectName,
  scope,
  candidates,
  baseEvidence,
  capacityMW,
  history,
  now = new Date().toISOString(),
}: SessionFinancialCurrentContext & {
  candidates: Record<string, CustomEvidenceRecord>;
  history: SessionFinancialHistory;
  now?: string;
}): { evidence: EvidenceRecord; ignoredReasons: Record<string, string> } {
  const evidence = clone(baseEvidence);
  const ignoredReasons: Record<string, string> = {};
  if (!isHistory(history, projectKey, scope)) {
    const malformedDecisions = Array.isArray((history as { decisions?: unknown } | undefined)?.decisions)
      ? (history as SessionFinancialHistory).decisions
      : [];
    for (const decision of malformedDecisions) {
      if (decision && isTarget(decision.target)) {
        ignoredReasons[decision.target] = "Session history is malformed or belongs to another project/scope/policy.";
      }
    }
    return { evidence, ignoredReasons };
  }
  if (!validTimestamp(now)) {
    for (const decision of history.decisions) ignoredReasons[decision.target] = "Replay time is invalid.";
    return { evidence, ignoredReasons };
  }

  const context: SessionFinancialCurrentContext = {
    projectKey,
    projectName,
    scope,
    baseEvidence,
    capacityMW,
    currentCandidates: candidates,
  };
  const replay = replaySessionOverlay(context, history, now, candidates);
  return { evidence: replay.evidence, ignoredReasons: replay.ignoredReasons };
}

export function restoreSessionFinancialHistory(
  value: unknown,
  projectKey: string,
): SessionFinancialHistory | null {
  if (!isHistory(value, projectKey)) return null;
  return clone(value);
}