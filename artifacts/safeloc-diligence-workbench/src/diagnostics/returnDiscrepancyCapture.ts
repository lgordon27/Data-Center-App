import type { EiaElectricityData } from "@/services/eiaService";
import type { ErcotQueueResult } from "@/services/ercotService";
import type { ProviderSourceMetadata, SourceId, SourceState } from "@/data/sources";
import type {
  CashFlowModel,
  Classification,
  QualitativeEvidenceValue,
} from "@/model/cashFlowEngine";

export const RETURN_DISCREPANCY_CAPTURE_SCHEMA_VERSION = 1;

export type ReturnCaptureReleaseIdentity = {
  applicationVersion: string | null;
  releaseId: string | null;
  commitSha: string | null;
  deploymentId: string | null;
  buildTimestamp: string | null;
};

export type ReturnCaptureEvidenceItem = {
  id: string;
  classification: Classification;
  modelClassification?: Classification;
  numericValue?: number;
  qualitativeValue?: QualitativeEvidenceValue;
  unit?: string;
  acceptedForModel?: boolean;
  eligibleForModel?: boolean;
  researchState?: string;
  semanticValidationStatus?: string;
  sourceSupportConfidence?: number;
  coverageStatus?: string;
  sourceUrl?: string;
  sources?: Array<{ exactProject?: boolean; sourceClass?: string }>;
};

export type ReturnCaptureProject = {
  kind: "curated" | "custom";
  name: string;
  location: string;
  capacityMW: number;
  description?: string;
};

export type ReturnCaptureSelection = {
  company: string | null;
  projectId: string;
  projectName: string;
  operator: string;
  location: string;
  capacityMW: number | null;
  status: string;
  relationshipType: string;
  evidenceState: string;
  kind: "curated" | "directory";
  sourceUrl: string | null;
  providerId: string | null;
} | null;

export type ReturnCaptureFinancialInputState = {
  basis: string;
  providerStatus: string;
  electricityRate: number | null;
  electricityPeriod: string | null;
  sourceUpdatedAt: string | null;
};

export type ReturnCaptureInput = {
  project: ReturnCaptureProject;
  originatingCompany: string | null;
  selectedProjectContext: ReturnCaptureSelection;
  scenarioClassifications: Record<string, Classification>;
  savedScenarioCount: number;
  evidence: Record<string, ReturnCaptureEvidenceItem>;
  modelEvidence: Record<string, ReturnCaptureEvidenceItem>;
  metrics: CashFlowModel & { lastChange?: unknown };
  financialInputState: ReturnCaptureFinancialInputState;
  sourceStates: Record<SourceId, SourceState>;
  eiaData: EiaElectricityData;
  ercotQueue: ErcotQueueResult;
  storage: {
    currentSession: string | null;
    scenarios: string | null;
    communityReview: string | null;
    eiaCache: string | null;
  };
  releaseIdentity?: ReturnCaptureReleaseIdentity | null;
};

export type SanitizedReturnDiscrepancyRecord = {
  captureSchemaVersion: number;
  project: ReturnCaptureProject;
  holding: {
    originatingCompany: string | null;
    selectedProjectContext: ReturnCaptureSelection;
  };
  scenario: {
    id: "current-browser-state";
    kind: ReturnCaptureProject["kind"];
    classifications: Record<string, Classification>;
    savedScenarioCount: number;
  };
  storage: {
    schema: {
      currentSession: number;
      canonicalProvenance: number;
      scenarios: number;
      communityReview: number;
      eiaCache: number;
    };
    localStorage: {
      trackedKeys: Record<string, boolean>;
      currentSession: SanitizedStorageEntry;
      scenarios: SanitizedStorageEntry;
      communityReview: SanitizedStorageEntry;
      eiaCache: SanitizedStorageEntry;
    };
    sessionStorage: { trackedKeys: string[] };
  };
  providerProvenance: {
    sources: Record<SourceId, SanitizedSourceState>;
    eia: SanitizedEiaState;
    ercotQueue: SanitizedErcotState;
  };
  classifications: Record<string, Classification>;
  modelInputs: {
    evidence: Record<string, SanitizedModelInput>;
    assumptions: CashFlowModel["assumptions"];
    financialInputState: ReturnCaptureFinancialInputState;
    fingerprint: string;
  };
  cashFlows: CashFlowModel["schedule"];
  returns: {
    projectIRR: number | null;
    baseIRR: number | null | undefined;
    moic: number;
    cashOnCash: number;
    npv: number;
    payback: number | null;
    confidenceScore: number;
    recommendationStatus: CashFlowModel["recommendationStatus"];
    recommendationBlocked: boolean;
    missingMaterialCount: number;
    unresolvedDecisionGateCount: number;
    unresolvedFinancialDriverCount: number;
    materialUnverifiedCount: number;
    totalDistributions: number;
    equityInvested: number;
    returnSensitivity: CashFlowModel["returnSensitivity"];
  };
  debtAndTerminalTreatment: {
    debtAmount: number;
    debtLtv: number;
    interestRate: number;
    amortizationYears: number;
    annualPrincipalPayment: number;
    terminalFormula: string;
    terminalValue: number;
    terminalDebtRepayment: number;
    schedule: Array<{
      year: number;
      beginningDebt: number;
      interest: number;
      principal: number;
      endingDebt: number;
      terminalValue: number;
      terminalDebtRepayment: number;
    }>;
  };
  release: {
    identity: ReturnCaptureReleaseIdentity | null;
    fingerprint: string;
  };
};

type SanitizedStorageEntry = {
  present: boolean;
  byteLength: number;
  schemaVersion: number | null;
  canonicalProvenanceVersion: number | null;
  classificationIds: string[];
  classificationFingerprint: string | null;
  modelInputFingerprint: string | null;
  reviewCount: number | null;
  decisionHistoryCount: number | null;
};

type SanitizedSourceState = {
  status: SourceState["status"];
  dataOrigin: SourceState["dataOrigin"];
  timestamp?: string;
  version?: string;
};

type SanitizedModelInput = {
  id: string;
  classification: Classification;
  modelClassification?: Classification;
  numericValue?: number;
  qualitativeValue?: QualitativeEvidenceValue;
  unit?: string;
  acceptedForModel?: boolean;
  eligibleForModel?: boolean;
  researchState?: string;
  semanticValidationStatus?: string;
  sourceSupportConfidence?: number;
  coverageStatus?: string;
  sourceUrlPresent: boolean;
  sourceCount: number;
  exactProjectSourceCount: number;
};

type SanitizedEiaState = {
  status: EiaElectricityData["status"];
  dataOrigin: EiaElectricityData["dataOrigin"];
  fetchedAt: string | null;
  sourceUpdatedAt: string | null;
  latestPrice: number;
  latestPricePeriod: string | null;
  yoyChangePercent: number | null;
  trend: EiaElectricityData["trend"];
  priceHistoryCount: number;
  generationHistoryCount: number;
  consumptionHistoryCount: number;
  sourceMetadata: SanitizedProviderMetadata;
};

type SanitizedErcotState = {
  status: ErcotQueueResult["status"];
  providerStatus: ErcotQueueResult["providerStatus"];
  fetchedAt: string | null;
  sourceUpdatedAt: string | null;
  stats: ErcotQueueResult["stats"];
  matchingProject: ErcotQueueResult["matchingProject"];
  diagnostics: {
    endpoint: string;
    responseStatus: number | null;
    cache: ErcotQueueResult["diagnostics"]["cache"];
    sourceFreshness: string | null;
    responseCount: number;
    failedResponseCount: number;
  };
  sourceMetadata: SanitizedProviderMetadata;
};

type SanitizedProviderMetadata = {
  status: ProviderSourceMetadata["status"];
  dataOrigin?: ProviderSourceMetadata["dataOrigin"];
  timestamp?: string;
  version?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableFiniteNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function validTimestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function sanitizeProviderMetadata(metadata: ProviderSourceMetadata): SanitizedProviderMetadata {
  return {
    status: metadata.status,
    ...(metadata.dataOrigin ? { dataOrigin: metadata.dataOrigin } : {}),
    ...(validTimestamp(metadata.timestamp) ? { timestamp: metadata.timestamp } : {}),
    ...(typeof metadata.version === "string" ? { version: metadata.version } : {}),
  };
}

function sanitizeEvidenceItem(item: ReturnCaptureEvidenceItem): SanitizedModelInput {
  return {
    id: item.id,
    classification: item.classification,
    ...(item.modelClassification ? { modelClassification: item.modelClassification } : {}),
    ...(isFiniteNumber(item.numericValue) ? { numericValue: item.numericValue } : {}),
    ...(item.qualitativeValue ? { qualitativeValue: item.qualitativeValue } : {}),
    ...(typeof item.unit === "string" ? { unit: item.unit } : {}),
    ...(typeof item.acceptedForModel === "boolean" ? { acceptedForModel: item.acceptedForModel } : {}),
    ...(typeof item.eligibleForModel === "boolean" ? { eligibleForModel: item.eligibleForModel } : {}),
    ...(typeof item.researchState === "string" ? { researchState: item.researchState } : {}),
    ...(typeof item.semanticValidationStatus === "string" ? { semanticValidationStatus: item.semanticValidationStatus } : {}),
    ...(isFiniteNumber(item.sourceSupportConfidence) ? { sourceSupportConfidence: item.sourceSupportConfidence } : {}),
    ...(typeof item.coverageStatus === "string" ? { coverageStatus: item.coverageStatus } : {}),
    sourceUrlPresent: typeof item.sourceUrl === "string" && item.sourceUrl.length > 0,
    sourceCount: item.sources?.length ?? 0,
    exactProjectSourceCount: item.sources?.filter((source) => source.exactProject === true).length ?? 0,
  };
}

function sanitizeEvidenceMap(evidence: Record<string, ReturnCaptureEvidenceItem>) {
  return Object.fromEntries(
    Object.entries(evidence)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, item]) => [id, sanitizeEvidenceItem(item)]),
  );
}

function classificationMap(evidence: Record<string, ReturnCaptureEvidenceItem>) {
  return sortedClassificationMap(
    Object.fromEntries(
      Object.entries(evidence).map(([id, item]) => [id, item.classification]),
    ),
  );
}

function sortedClassificationMap(classifications: Record<string, Classification>) {
  return Object.fromEntries(
    Object.entries(classifications)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, classification]) => [id, classification]),
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}

function fingerprint(value: unknown): string {
  // A small synchronous hash keeps capture usable from page.evaluate without
  // depending on Web Crypto availability in every test browser.
  let hash = 2166136261;
  for (const character of stableStringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function parseStoredRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function storageEntry(raw: string | null): SanitizedStorageEntry {
  const parsed = parseStoredRecord(raw);
  const classifications = parsed?.classifications;
  const classificationRecord = classifications && typeof classifications === "object" && !Array.isArray(classifications)
    ? classifications as Record<string, unknown>
    : null;
  const modelEvidence = parsed?.modelEvidence;
  const modelEvidenceRecord = modelEvidence && typeof modelEvidence === "object" && !Array.isArray(modelEvidence)
    ? modelEvidence as Record<string, ReturnCaptureEvidenceItem>
    : null;
  const reviewMetadata = parsed?.reviewMetadata;
  const decisionHistory = parsed?.decisionHistory;
  return {
    present: raw !== null,
    byteLength: raw?.length ?? 0,
    schemaVersion: isFiniteNumber(parsed?.version) ? parsed.version : null,
    canonicalProvenanceVersion: isFiniteNumber(parsed?.canonicalProvenanceVersion)
      ? parsed.canonicalProvenanceVersion
      : null,
    classificationIds: classificationRecord ? Object.keys(classificationRecord).sort() : [],
    classificationFingerprint: classificationRecord ? fingerprint(classificationRecord) : null,
    modelInputFingerprint: modelEvidenceRecord ? fingerprint(sanitizeEvidenceMap(modelEvidenceRecord)) : null,
    reviewCount: reviewMetadata && typeof reviewMetadata === "object" && !Array.isArray(reviewMetadata)
      ? Object.keys(reviewMetadata).length
      : null,
    decisionHistoryCount: Array.isArray(decisionHistory) ? decisionHistory.length : null,
  };
}

function cachedEiaEntry(raw: string | null): SanitizedStorageEntry {
  const entry = storageEntry(raw);
  const parsed = parseStoredRecord(raw);
  const data = parsed?.dataOrigin === "provider" ? parsed : null;
  return {
    ...entry,
    schemaVersion: data ? 1 : entry.schemaVersion,
  };
}

export function createSanitizedReturnDiscrepancyRecord(
  input: ReturnCaptureInput,
): SanitizedReturnDiscrepancyRecord {
  const modelInputs = sanitizeEvidenceMap(input.modelEvidence);
  const classifications = classificationMap(input.evidence);
  const releaseIdentity = input.releaseIdentity ?? null;
  const modelInputPayload = {
    evidence: modelInputs,
    assumptions: input.metrics.assumptions,
    financialInputState: input.financialInputState,
  };
  const releasePayload = releaseIdentity
    ? {
      applicationVersion: releaseIdentity.applicationVersion,
      releaseId: releaseIdentity.releaseId,
      commitSha: releaseIdentity.commitSha,
      deploymentId: releaseIdentity.deploymentId,
      buildTimestamp: releaseIdentity.buildTimestamp,
    }
    : null;
  const sourceStates = Object.fromEntries(
    Object.entries(input.sourceStates)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, source]) => [id, sanitizeProviderMetadata(source)]),
  ) as Record<SourceId, SanitizedSourceState>;
  const localStorage = {
    trackedKeys: {
      "safeloc:diligence:current-session:v1": input.storage.currentSession !== null,
      "safeloc:diligence:scenarios:v1": input.storage.scenarios !== null,
      "safeloc:diligence:community-review:v1": input.storage.communityReview !== null,
      "safeloc:eia:electricity:v1": input.storage.eiaCache !== null,
    },
    currentSession: storageEntry(input.storage.currentSession),
    scenarios: storageEntry(input.storage.scenarios),
    communityReview: storageEntry(input.storage.communityReview),
    eiaCache: cachedEiaEntry(input.storage.eiaCache),
  };

  return {
    captureSchemaVersion: RETURN_DISCREPANCY_CAPTURE_SCHEMA_VERSION,
    project: input.project,
    holding: {
      originatingCompany: input.originatingCompany,
      selectedProjectContext: input.selectedProjectContext,
    },
    scenario: {
      id: "current-browser-state",
      kind: input.project.kind,
      classifications: sortedClassificationMap(input.scenarioClassifications),
      savedScenarioCount: input.savedScenarioCount,
    },
    storage: {
      schema: {
        currentSession: 2,
        canonicalProvenance: 2,
        scenarios: 1,
        communityReview: 2,
        eiaCache: 1,
      },
      localStorage,
      sessionStorage: { trackedKeys: [] },
    },
    providerProvenance: {
      sources: sourceStates,
      eia: {
        status: input.eiaData.status,
        dataOrigin: input.eiaData.dataOrigin,
        fetchedAt: validTimestamp(input.eiaData.fetchedAt),
        sourceUpdatedAt: validTimestamp(input.eiaData.sourceUpdatedAt),
        latestPrice: input.eiaData.latestPrice,
        latestPricePeriod: input.eiaData.latestPricePeriod ?? null,
        yoyChangePercent: nullableFiniteNumber(input.eiaData.yoyChangePercent),
        trend: input.eiaData.trend,
        priceHistoryCount: input.eiaData.priceHistory.length,
        generationHistoryCount: input.eiaData.generationHistory.length,
        consumptionHistoryCount: input.eiaData.consumptionHistory.length,
        sourceMetadata: sanitizeProviderMetadata(input.eiaData.sourceMetadata),
      },
      ercotQueue: {
        status: input.ercotQueue.status,
        providerStatus: input.ercotQueue.providerStatus,
        fetchedAt: validTimestamp(input.ercotQueue.fetchedAt),
        sourceUpdatedAt: validTimestamp(input.ercotQueue.sourceUpdatedAt),
        stats: input.ercotQueue.stats,
        matchingProject: input.ercotQueue.matchingProject,
        diagnostics: {
          endpoint: input.ercotQueue.diagnostics.endpoint,
          responseStatus: input.ercotQueue.diagnostics.responseStatus,
          cache: input.ercotQueue.diagnostics.cache,
          sourceFreshness: validTimestamp(input.ercotQueue.diagnostics.sourceFreshness),
          responseCount: input.ercotQueue.diagnostics.responses.length,
          failedResponseCount: input.ercotQueue.diagnostics.failedResponses?.length ?? 0,
        },
        sourceMetadata: sanitizeProviderMetadata(input.ercotQueue.sourceMetadata),
      },
    },
    classifications,
    modelInputs: {
      evidence: modelInputs,
      assumptions: input.metrics.assumptions,
      financialInputState: input.financialInputState,
      fingerprint: fingerprint(modelInputPayload),
    },
    cashFlows: input.metrics.schedule,
    returns: {
      projectIRR: input.metrics.projectIRR,
      baseIRR: input.metrics.baseIRR,
      moic: input.metrics.moic,
      cashOnCash: input.metrics.cashOnCash,
      npv: input.metrics.npv,
      payback: input.metrics.payback,
      confidenceScore: input.metrics.confidenceScore,
      recommendationStatus: input.metrics.recommendationStatus,
      recommendationBlocked: input.metrics.recommendationBlocked,
      missingMaterialCount: input.metrics.missingMaterialCount,
      unresolvedDecisionGateCount: input.metrics.unresolvedDecisionGateCount,
      unresolvedFinancialDriverCount: input.metrics.unresolvedFinancialDriverCount,
      materialUnverifiedCount: input.metrics.materialUnverifiedCount,
      totalDistributions: input.metrics.totalDistributions,
      equityInvested: input.metrics.equityInvested,
      returnSensitivity: input.metrics.returnSensitivity,
    },
    debtAndTerminalTreatment: {
      debtAmount: input.metrics.assumptions.debtAmount,
      debtLtv: input.metrics.assumptions.debtLtv,
      interestRate: input.metrics.assumptions.interestRate,
      amortizationYears: input.metrics.assumptions.amortizationYears,
      annualPrincipalPayment: input.metrics.assumptions.annualPrincipalPayment,
      terminalFormula: input.metrics.assumptions.terminalFormula,
      terminalValue: input.metrics.assumptions.terminalValue,
      terminalDebtRepayment: input.metrics.assumptions.terminalDebtRepayment,
      schedule: input.metrics.schedule.map((year) => ({
        year: year.year,
        beginningDebt: year.beginningDebt,
        interest: year.interest,
        principal: year.principal,
        endingDebt: year.endingDebt,
        terminalValue: year.terminalValue,
        terminalDebtRepayment: year.terminalDebtRepayment,
      })),
    },
    release: {
      identity: releaseIdentity,
      fingerprint: fingerprint(releasePayload),
    },
  };
}

export function getReturnCaptureStorageSnapshot(): ReturnCaptureInput["storage"] {
  if (typeof window === "undefined") {
    return { currentSession: null, scenarios: null, communityReview: null, eiaCache: null };
  }
  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  return {
    currentSession: read("safeloc:diligence:current-session:v1"),
    scenarios: read("safeloc:diligence:scenarios:v1"),
    communityReview: read("safeloc:diligence:community-review:v1"),
    eiaCache: read("safeloc:eia:electricity:v1"),
  };
}