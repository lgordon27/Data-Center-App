import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calculateCashFlowModel,
  containEvidenceForModel,
  Classification,
  EvidenceRecord,
  DEFAULT_CAPACITY_MW,
  type IRRReason,
  type IRRStatus,
  type CashFlowModel,
  type ModelAssumptions,
  type QualitativeEvidenceValue,
} from '@/model/cashFlowEngine';
import {
  CAPACITY_MW_MAX,
  bindCapacityAssumption,
  qualifyCapacityClaimCandidate,
  type CapacityBindingResult,
  type CapacityClaim,
  type CapacityClaimCandidate,
  type CapacityScope,
} from "@/model/assumptionBinding";
import {
  buildFinancialScenarioMatrix,
  type FinancialScenarioMatrix,
} from "@/model/financialScenarioContract";
import {
  applySessionFinancialDecisions,
  buildSessionFinancialPreview,
  decideSessionFinancialPreview,
  emptySessionFinancialHistory,
  restoreSessionFinancialHistory,
} from "@/model/sessionFinancialTransmission";
import {
  sourceStateMap,
  type SourceId,
  type SourceState,
} from "@/data/sources";
import {
  FALLBACK_ERCOT_RESULT,
  fetchErcotQueue,
  type ErcotQueueResult,
} from "@/services/ercotService";
import {
  ACTIVE_FEMA_NRI_PROFILE,
  FEMA_NRI_ATTRIBUTION,
  formatFemaHazardSummary,
} from "@/data/femaNRI";
import {
  createEiaFallback,
  fetchEiaElectricity,
  type EiaElectricityData,
} from "@/services/eiaService";
import {
  clearDecisionHistory,
  clearSessionActions,
  logSessionAction,
  recordManualClassificationChange,
  recordAIDecision,
  getDecisionHistory,
  restoreDecisionHistory,
  type DecisionHistoryEntry,
} from "@/services/sessionLog";
import {
  CUSTOM_EVIDENCE_IDS,
  type ResearchCoverageStatus,
  type ResearchEvidenceSource,
  type ResearchSourceValidation,
  type CustomResearchResponse,
  type CustomEvidenceRecord,
  type CapacityProvenance,
  containCustomResearchEvidence,
  selectResearchProposals,
} from "@/services/researchProjectService";
import type { ClaimId, PublicAccessStatus } from "@/data/claimSources";
import { researchContentRejectionReason } from "@/data/researchContentQuality.mjs";
import {
  assertEvidenceImpactRoleCoverage,
  getEvidenceImpactRole,
  type ImpactRole,
} from "@/data/evidenceImpactRoles";
import {
  COMPANY_CONNECTION_TYPES,
  COMPANY_PROFILES,
  type ProjectSelectionContext,
  type CompanyKey,
} from "@/data/companyExposure";
import {
  COMMUNITY_TERM_DEFINITIONS,
  type CommunityConclusion,
  type CommunityHumanStatus,
  type CommunityTermId,
} from "@/data/communityAgreements";
import {
  countUnresolvedCommunityTerms,
  createCommunityReview,
  type CommunityProjectInput,
  type CommunityReviewState,
  type CommunityTermDecision,
} from "@/model/communityAgreements";
import {
  createSanitizedReturnDiscrepancyRecord,
  getReturnCaptureStorageSnapshot,
  type ReturnCaptureReleaseIdentity,
  type SanitizedReturnDiscrepancyRecord,
} from "@/diagnostics/returnDiscrepancyCapture";
import type { CanonicalDossierSummary, CanonicalProvenance } from "@/services/canonicalDossierService";
import { dossierToResearchResponse } from "@/services/canonicalDossierService";
export type { Classification } from '@/model/cashFlowEngine';

declare global {
  interface Window {
    __safelocCaptureReturnDiscrepancyState?: () => Promise<SanitizedReturnDiscrepancyRecord>;
  }
}

export type EvidenceItem = {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  classification: Classification;
  impactRole: ImpactRole;
  review?: EvidenceReview;
  modelClassification?: Classification;
  origin?: "dossier" | "synthetic-default";
  baselineClassification?: Classification;
  sessionOverride?: boolean;
  citation: string;
  description: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourcePublisher?: string;
  sourcePublishedAt?: string | null;
  sourceAccessedAt?: string | null;
  sourceAccessStatus?: PublicAccessStatus;
  sourceId: SourceId | null;
  providerSourceId: SourceId | null;
  sourceRole: string;
  claimIds: ClaimId[];
  numericValue?: number;
  qualitativeValue?: QualitativeEvidenceValue;
  sourceSupportConfidence?: number;
  modelReportedConfidence?: number;
  classificationReason?: string;
  sourceRelevanceNote?: string;
  sourceRelevance?: "exact-project" | "related-context" | "unresolved";
  searchTerms?: string[];
  searchTermsSource?: "tool-observed" | "ai-reported" | "unavailable";
  sources?: ResearchEvidenceSource[];
  coverageStatus?: ResearchCoverageStatus;
  searchCoverage?: string[];
  failedSearchDomains?: string[];
  conflictSummary?: string;
  rawValue?: string | number;
  rawUnit?: string;
  rawText?: string;
  normalizedValue?: number | string;
  normalizedUnit?: string;
  normalization?: CustomEvidenceRecord["normalization"];
  semanticValidationStatus?: CustomEvidenceRecord["semanticValidationStatus"];
  noOpAcknowledged?: boolean;
  researchState?: CustomEvidenceRecord["researchState"];
  eligibleForModel?: boolean;
  acceptedForModel?: boolean;
  quarantineReasons?: string[];
  claimMappings?: CustomEvidenceRecord["claimMappings"];
  sourceValidation?: ResearchSourceValidation;
};

export type EvidenceCorrection = {
  value: string;
  claim: string;
  sourceUrl: string;
  classification: Classification;
  /** Only set by acceptance of a server-parsed research proposal, never by the reviewer form. */
  researchProposal?: CustomEvidenceRecord;
  reviewKind?: EvidenceReviewKind;
};

export type EvidenceReviewKind = "manual" | "ai-accepted" | "ai-overridden" | "research-overridden";
export type ResearchProposalDisposition = "pending" | "accepted" | "overridden" | "rejected" | "unresolved";
export type ResearchProposalOverride = {
  originalValue: string | number;
  originalClassification: Classification;
  originalSourceUrl: string | null;
  originalReasoning: string;
  replacementValue: string | number;
  replacementClassification: Classification;
  rationale: string;
  reviewedAt: string;
};
export type FinancialMetrics = Omit<ReturnType<typeof calculateCashFlowModel>, 'lastChange'> & {
  lastChange: { from: number; to: number; delta: number } | null;
};

function unmodeledMetrics(lastChange: FinancialMetrics["lastChange"]): FinancialMetrics {
  const model = {
    projectIRR: null,
    projectIRRStatus: "not-meaningful",
    projectIRRReason: "invalid-input",
    moic: 0,
    cashOnCash: 0,
    initialInvestedEquity: 0,
    cashOnCashDenominator: 0,
    annualPreTaxEquityCashFlow: 0,
    dscrMeaningfulYears: [],
    returnSensitivity: [],
    payback: null,
    npv: 0,
    confidenceScore: 0,
    revenueDelayMonths: 0,
    incrementalCapex: 0,
    opexChange: 0,
    recommendationBlocked: true,
    recommendationStatus: "BLOCKED",
    missingMaterialCount: 0,
    unresolvedDecisionGateCount: 0,
    unresolvedFinancialDriverCount: 0,
    materialUnverifiedCount: 0,
    totalDistributions: 0,
    equityInvested: 0,
    terminalValue: 0,
    schedule: [],
    assumptions: {
      capacityMW: null,
      leaseRatePerKwMonth: null,
      utilizationRamp: [],
    } as unknown as ModelAssumptions,
    lineItems: {},
    attribution: {},
    waterfall: [],
    waterfallClosureDelta: null,
    waterfallReconciles: false,
    mechanicalDisclaimer: true,
    baseIRR: null,
  } as unknown as CashFlowModel;
  return { ...model, lastChange } as FinancialMetrics;
}

export type FinancialInputState = {
  phase: "updating" | "settled";
  basis: "live" | "cached" | "fallback" | "custom";
  providerStatus: EiaElectricityData["status"] | "not-applicable";
  providerDataOrigin: EiaElectricityData["dataOrigin"] | "not-applicable";
  electricityRate: number | null;
  electricityPeriod: string | null;
  sourceUpdatedAt: string | null;
  syntheticElectricityRate: number | null;
  syntheticBaselineIRR: number | null;
  syntheticBaselineIRRStatus: IRRStatus;
  syntheticBaselineIRRReason: IRRReason | null;
  syntheticCurrentIRR: number | null;
  syntheticCurrentIRRStatus: IRRStatus;
  syntheticCurrentIRRReason: IRRReason | null;
  providerBaselineIRR: number | null;
  providerBaselineIRRStatus: IRRStatus | null;
  providerBaselineIRRReason: IRRReason | null;
  providerOverlayIRR: number | null;
  providerOverlayIRRStatus: IRRStatus | null;
  providerOverlayIRRReason: IRRReason | null;
  providerOverlayDeltaIRR: number | null;
  calculatedAt: string | null;
};

export function buildFinancialInputState({
  projectKind,
  eiaLoading,
  matrix,
  eiaData,
}: {
  projectKind: "curated" | "custom";
  eiaLoading: boolean;
  matrix: FinancialScenarioMatrix;
  eiaData: EiaElectricityData;
}): FinancialInputState {
  const syntheticBaseline = matrix.scenarios["synthetic-verified"];
  const syntheticCurrent = matrix.scenarios["synthetic-current"];
  const providerBaseline = matrix.scenarios["eia-verified"];
  const providerCurrent = matrix.scenarios["eia-current"];
  if (projectKind === "custom") {
    return {
      phase: "settled",
      basis: "custom",
      providerStatus: "not-applicable",
      providerDataOrigin: "not-applicable",
      electricityRate: null,
      electricityPeriod: null,
      sourceUpdatedAt: null,
      syntheticElectricityRate: syntheticCurrent?.inputs.appliedElectricityRate ?? null,
      syntheticBaselineIRR: syntheticBaseline?.returns.projectIRR ?? null,
      syntheticBaselineIRRStatus: syntheticBaseline?.returns.projectIRRStatus ?? "not-meaningful",
      syntheticBaselineIRRReason: syntheticBaseline?.returns.projectIRRReason ?? "invalid-input",
      syntheticCurrentIRR: syntheticCurrent?.returns.projectIRR ?? null,
      syntheticCurrentIRRStatus: syntheticCurrent?.returns.projectIRRStatus ?? "not-meaningful",
      syntheticCurrentIRRReason: syntheticCurrent?.returns.projectIRRReason ?? "invalid-input",
      providerBaselineIRR: null,
      providerBaselineIRRStatus: null,
      providerBaselineIRRReason: null,
      providerOverlayIRR: null,
      providerOverlayIRRStatus: null,
      providerOverlayIRRReason: null,
      providerOverlayDeltaIRR: null,
      calculatedAt: new Date().toISOString(),
    };
  }

  return {
    phase: eiaLoading ? "updating" : "settled",
    basis: eiaData.dataOrigin === "provider"
      ? eiaData.status === "cached" ? "cached" : "live"
      : "fallback",
    providerStatus: eiaData.status,
    providerDataOrigin: eiaData.dataOrigin,
    electricityRate: eiaData.latestPrice,
    electricityPeriod: eiaData.latestPricePeriod ?? null,
    sourceUpdatedAt: eiaData.sourceUpdatedAt ?? null,
    syntheticElectricityRate: syntheticCurrent?.inputs.appliedElectricityRate ?? null,
    syntheticBaselineIRR: syntheticBaseline?.returns.projectIRR ?? null,
    syntheticBaselineIRRStatus: syntheticBaseline?.returns.projectIRRStatus ?? "not-meaningful",
    syntheticBaselineIRRReason: syntheticBaseline?.returns.projectIRRReason ?? "invalid-input",
    syntheticCurrentIRR: syntheticCurrent?.returns.projectIRR ?? null,
    syntheticCurrentIRRStatus: syntheticCurrent?.returns.projectIRRStatus ?? "not-meaningful",
    syntheticCurrentIRRReason: syntheticCurrent?.returns.projectIRRReason ?? "invalid-input",
    providerBaselineIRR: providerBaseline?.returns.projectIRR ?? null,
    providerBaselineIRRStatus: providerBaseline?.returns.projectIRRStatus ?? null,
    providerBaselineIRRReason: providerBaseline?.returns.projectIRRReason ?? null,
    providerOverlayIRR: providerCurrent?.returns.projectIRR ?? null,
    providerOverlayIRRStatus: providerCurrent?.returns.projectIRRStatus ?? null,
    providerOverlayIRRReason: providerCurrent?.returns.projectIRRReason ?? null,
    providerOverlayDeltaIRR: providerCurrent?.returns.projectIRR === null || providerCurrent?.returns.projectIRR === undefined || syntheticCurrent?.returns.projectIRR === null || syntheticCurrent?.returns.projectIRR === undefined
      ? null
      : providerCurrent.returns.projectIRR - syntheticCurrent.returns.projectIRR,
    calculatedAt: eiaLoading ? null : new Date().toISOString(),
  };
}

export type ScenarioMetrics = {
  projectIRR: number | null;
  projectIRRStatus?: IRRStatus;
  projectIRRReason?: IRRReason | null;
  moic: number;
  npv: number;
  cashOnCash: number;
  payback: number | null;
  confidence: number;
};
export type FinancialModelingState =
  | {
      status: "modeled";
      label: "Audited Stargate synthetic project model" | "Capacity-based synthetic project model";
      reason: string;
      requiredInputs: [];
    }
  | {
      status: "not-modeled";
      label: "Not modeled";
      reason: string;
      requiredInputs: string[];
    };

export type ProjectContext = Omit<CustomResearchResponse["projectSummary"], "capacityProvenance"> & {
  capacityProvenance?: CapacityProvenance;
  researchMode?: CustomResearchResponse["researchMode"];
  researchStatus?: CustomResearchResponse["researchStatus"];
  researchError?: CustomResearchResponse["researchError"];
  researchCache?: CustomResearchResponse["researchCache"];
  researchCoverage?: CustomResearchResponse["researchCoverage"];
  researchAudit?: CustomResearchResponse["researchAudit"];
  canonicalProvenance?: CanonicalProvenance[];
  researchOutcome?: CustomResearchResponse["researchOutcome"];
  researchProposals?: Record<string, CustomEvidenceRecord>;
  retainedFindings?: CustomResearchResponse["retainedFindings"];
  retainedFindingAudit?: CustomResearchResponse["retainedFindingAudit"];
  replay?: CustomResearchResponse["replay"];
  researchProposalDispositions?: Record<string, ResearchProposalDisposition>;
  researchProposalOverrides?: Record<string, ResearchProposalOverride>;
  eligibleEvidenceCount?: number;
  retrievedLeadCount?: number;
  quarantineReasons?: string[];
  kind: "curated" | "custom";
  canonicalDossier?: CanonicalDossierSummary;
};

export const APPROVED_DOSSIER_SCENARIOS = {
  "stargate-abilene": {
    capacityMW: DEFAULT_CAPACITY_MW,
    scope: { kind: "campus", campusId: "stargate-abilene" },
  },
} as const;

function capacityProjectKey(project: Pick<ProjectContext, "name" | "location">): string {
  return `${project.name.trim().toLocaleLowerCase()}|${project.location.trim().toLocaleLowerCase()}`;
}

function sessionFinancialProjectKey(project: ProjectContext): string {
  return [
    project.kind,
    project.name.trim().toLocaleLowerCase(),
    project.location.trim().toLocaleLowerCase(),
    project.canonicalDossier?.slug?.trim().toLocaleLowerCase() ?? "",
  ].join("|");
}

const EMPTY_SESSION_FINANCIAL_SCOPE = { facility: "", phase: "" };
const SESSION_FINANCIAL_TARGET_IDS = [
  "electricity_cost",
  "water_consumption",
  "grid_interconnection",
] as const;

function approvedScenarioBinding(
  slug: keyof typeof APPROVED_DOSSIER_SCENARIOS | "default-stargate",
): CapacityBindingResult {
  const approved = slug === "default-stargate"
    ? APPROVED_DOSSIER_SCENARIOS["stargate-abilene"]
    : APPROVED_DOSSIER_SCENARIOS[slug];
  const base = bindCapacityAssumption({ scenarioScope: approved.scope });
  return {
    ...base,
    modelInput: { capacityMW: approved.capacityMW },
    binding: {
      kind: "approved-scenario",
      reason: `The ${slug === "default-stargate" ? "default Stargate" : slug} case is on the approved dossier scenario list.`,
    },
  };
}

type PersistedCanonicalReview = {
  slug: string;
  project?: {
    kind: "curated";
    name: string;
    location: string;
    description: string;
    capacityMW: number | null;
    canonicalDossier: CanonicalDossierSummary;
  };
  baselineEvidence: Record<string, EvidenceItem>;
  overrides: Record<string, Classification>;
  reviewMetadata: Record<string, EvidenceReview>;
};

export type CapacityReviewTrailEntry = {
  action: "accepted" | "rejected" | "illustrative-set" | "illustrative-cleared";
  findingId: string | null;
  recordedAt: string;
};

export type CapacityReviewState = {
  projectKey: string;
  decision: "accepted" | "rejected" | null;
  acceptedFindingId: string | null;
  acceptedClaim: CapacityClaim | null;
  illustrativeCapacityMW: number | null;
  trail: CapacityReviewTrailEntry[];
};

export function reviewCapacityClaim(
  current: CapacityReviewState | null,
  projectKey: string,
  candidate: CapacityClaimCandidate,
  action: "accepted" | "rejected",
  recordedAt: string,
): CapacityReviewState {
  const previous = current?.projectKey === projectKey ? current : null;
  return {
    projectKey,
    decision: action,
    acceptedFindingId: action === "accepted" ? candidate.findingId : null,
    acceptedClaim: action === "accepted"
      ? { ...candidate.claim, humanAccepted: true }
      : null,
    illustrativeCapacityMW: previous?.illustrativeCapacityMW ?? null,
    trail: [
      ...(previous?.trail ?? []),
      { action, findingId: candidate.findingId, recordedAt },
    ],
  };
}

export function reviewIllustrativeCapacity(
  current: CapacityReviewState | null,
  projectKey: string,
  valueOrNull: number | null,
  recordedAt: string,
): CapacityReviewState {
  const previous = current?.projectKey === projectKey ? current : null;
  return {
    projectKey,
    decision: previous?.decision ?? null,
    acceptedFindingId: previous?.acceptedFindingId ?? null,
    acceptedClaim: previous?.acceptedClaim ?? null,
    illustrativeCapacityMW: valueOrNull,
    trail: [
      ...(previous?.trail ?? []),
      {
        action: valueOrNull === null ? "illustrative-cleared" : "illustrative-set",
        findingId: null,
        recordedAt,
      },
    ],
  };
}

type DiligenceState = {
  evidence: Record<string, EvidenceItem>;
  researchEvidence?: Record<string, EvidenceItem>;
  hasChangedClassification: boolean;
  updateClassification: (
    id: string,
    classification: Classification,
    source?: "manual" | "ai",
    reviewKind?: EvidenceReviewKind,
  ) => boolean;
  applyEvidenceCorrection: (id: string, correction: EvidenceCorrection) => boolean;
  applyResearchProposalOverride: (
    id: string,
    proposal: CustomEvidenceRecord,
    replacement: { value: string; classification: Classification; rationale: string },
  ) => boolean;
  financialSessionScope: Parameters<typeof emptySessionFinancialHistory>[1];
  setFinancialSessionScope: (scope: Parameters<typeof emptySessionFinancialHistory>[1]) => void;
  financialSessionHistory: ReturnType<typeof emptySessionFinancialHistory>;
  financialSessionIgnoredReasons: Record<string, string>;
  previewSessionFinancialFinding: (id: string) => ReturnType<typeof buildSessionFinancialPreview>;
  reviewSessionFinancialFinding: (
    preview: ReturnType<typeof buildSessionFinancialPreview>,
    action: "accept" | "reject" | "evidence-only",
  ) => boolean;
  persistResearchReview: (
    proposals: Record<string, CustomEvidenceRecord>,
    dispositions: Record<string, ResearchProposalDisposition>,
    overrides: Record<string, ResearchProposalOverride>,
  ) => void;
  clearLastChange: () => void;
  metrics: FinancialMetrics;
  financialInputState: FinancialInputState;
  financialScenarios: FinancialScenarioMatrix;
  financialModeling: FinancialModelingState;
  resetToDefault: (originatingCompany?: string | null) => void;
  setOriginatingCompany: (originatingCompany: CompanyKey | null) => void;
  setProjectSelection: (selection: ProjectSelectionContext | null) => void;
  loadCustomProject: (research: CustomResearchResponse, originatingCompany?: string | null, projectSelection?: ProjectSelectionContext | null) => void;
  loadCanonicalDossier: (
    dossier: CanonicalDossierSummary,
    selection?: Partial<Pick<ProjectSelectionContext, "company" | "relationshipType">>,
  ) => void;
  project: ProjectContext;
  originatingCompany: string | null;
  selectedProjectContext: ProjectSelectionContext | null;
  sessionRestored: boolean;
  sessionMigrated: boolean;
  scenarios: SavedScenario[];
  saveScenario: (name: string) => SaveScenarioResult;
  renameScenario: (id: string, name: string) => RenameScenarioResult;
  removeScenario: (id: string) => RemoveScenarioResult;
  sourceStates: Record<SourceId, SourceState>;
  ercotQueue: ErcotQueueResult;
  eiaData: EiaElectricityData;
  eiaLoading: boolean;
  downloadReturnDiscrepancyRecord: () => Promise<boolean>;
  communityReview: CommunityReviewState;
  communityUnresolvedCount: number;
  reviewCommunityTerm: (
    id: CommunityTermId,
    conclusion: CommunityConclusion,
    classification: CommunityTermDecision["classification"],
    humanStatus?: CommunityHumanStatus,
    reviewerNote?: string,
  ) => boolean;
  capacityClaimCandidate: CapacityClaimCandidate | null;
  acceptCapacityClaim: () => boolean;
  rejectCapacityClaim: () => boolean;
  illustrativeCapacityMW: number | null;
  setIllustrativeCapacityMW: (valueOrNull: number | null) => boolean;
  capacityBinding: CapacityBindingResult;
  capacityExplanation: CapacityBindingResult["explanation"];
  capacityDecisionTrail: CapacityReviewTrailEntry[];
};

type SessionFinancialCandidate = Parameters<typeof buildSessionFinancialPreview>[0]["candidate"];
type SessionFinancialPreview = ReturnType<typeof buildSessionFinancialPreview>;

export const CURRENT_SESSION_STORAGE_KEY = 'safeloc:diligence:current-session:v1';
export const COMMUNITY_REVIEW_STORAGE_KEY = 'safeloc:diligence:community-review:v1';
export const EVIDENCE_TIP_DISMISSED_STORAGE_KEY = 'safeloc:diligence:evidence-room-tip-dismissed:v1';
export const FINANCIAL_REVIEW_SESSION_STORAGE_KEY = "safeloc:financial-review:session:v1";
export const CURRENT_PROVENANCE_VERSION = 2;
const LEGACY_AGENT_RUN_STORAGE_KEY = 'safeloc:diligence:agent-run:v1';
const INITIAL_EVIDENCE_SOURCE: Record<string, Omit<EvidenceItem, "impactRole">> = {
  electricity_cost: { id: 'electricity_cost', label: 'Electricity Cost / MWh', value: 42, numericValue: 42, unit: '$/MWh', classification: 'User Assumption', citation: 'Synthetic analyst-selected electricity-cost input (2026); public market context does not establish a Stargate contract tariff', description: 'Representative West Texas blended power rate selected for underwriting; it is a synthetic input anchored to public EIA and Oncor data, not a disclosed Stargate contract tariff.', sourceId: null, providerSourceId: 'eia', sourceRole: 'Synthetic electricity-cost assumption', claimIds: ['synthetic-transaction'] },
  water_consumption: { id: 'water_consumption', label: 'Annual Cooling Water', value: 'Not disclosed', numericValue: 23, unit: 'Facility total', classification: 'Missing Evidence', citation: 'City of Abilene water utility records (2025–2026) and Stargate/Crusoe project disclosures (2025–2026) searched; no facility-level annual total found', description: 'The dated municipal records and project disclosures searched do not establish Stargate Abilene facility-level water consumption.', sourceId: null, providerSourceId: null, sourceRole: 'Searched public records and project disclosures', claimIds: ['unresolved-water'] },
  grid_interconnection: { id: 'grid_interconnection', label: 'Grid Interconnection Timeline', value: "Expansion cancelled; grid delays exceeded 12 months. ERCOT Batch Zero studies delayed from September 2026 to January 2027 minimum. 17 facilities (6.6 GW) completed studies but stuck in Abbott's verification audit.", numericValue: 14, unit: 'Verified event', classification: 'Verified Evidence', citation: 'ERCOT testimony before PUC (August 20, 2026) and ERCOT testimony before House State Affairs Committee (August 2026), alongside Epoch AI (2026), SiliconReport (2026), Data Center Dynamics (2026), and WinBuzzer (2026) reporting on Stargate Abilene expansion cancellation and grid delays', description: "Independent 2026 reporting states that the planned expansion beyond the 1.2 GW core was cancelled after grid-interconnection delays exceeded one year. ERCOT Batch Zero covers 200 GW across 300 applicants. Original study timeline was September 2026 start, April 2027 completion. Revised timeline: January 2027 start at earliest, completion date unclear. ERCOT staff testified the delay may cause some applicants to drop out due to financing constraints. These aggregate grid-process facts are market context, not proof of a named Stargate connection.", sourceId: null, providerSourceId: 'ercot-queue', sourceRole: 'Independent 2026 public reporting and ERCOT testimony', claimIds: ['stargate-cancellation', 'ercot-market-pressure'] },
  water_escalation: { id: 'water_escalation', label: '5-Yr Water Cost Escalation', value: 7, numericValue: 7, unit: '%', classification: 'Model Inference', citation: 'Analyst inference from reviewed municipal context (2022–2026); no project rate is cited', description: 'Representative five-year escalation inferred from local municipal water-rate history, not a disclosed Stargate contract rate or observed facility cost.', sourceId: null, providerSourceId: null, sourceRole: 'Analyst inference from dated public records', claimIds: ['analyst-inference'] },
  community_risk: { id: 'community_risk', label: 'Community Infrastructure Strain', value: 'Documented', unit: 'Local impact', classification: 'Verified Evidence', citation: `Local reporting (2025) with separate ${FEMA_NRI_ATTRIBUTION}, FIPS ${ACTIVE_FEMA_NRI_PROFILE.fips}`, description: `Independent local reporting documents pressure on housing, childcare, and roads as construction employment peaks near 6,400 while permanent jobs are expected in the low hundreds. Separate FEMA county context for ${ACTIVE_FEMA_NRI_PROFILE.county} (FIPS ${ACTIVE_FEMA_NRI_PROFILE.fips}): Social Vulnerability ${ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityScore.toFixed(2)}, ${ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityRating}; it is not treated as project-specific proof.`, sourceId: null, providerSourceId: null, sourceRole: 'Independent local reporting with separate FEMA county context', claimIds: ['fema-taylor-county'] },
  renewable_percentage: { id: 'renewable_percentage', label: 'Renewable Procurement', value: 'Local wind referenced; percentage unverified', numericValue: 25, unit: 'Power mix', classification: 'Management Assertion', citation: 'OpenAI and Crusoe Stargate program and Abilene company disclosures (2025); delivered renewable share remains unverified', description: 'Company statements reference local wind in the campus power story, but the renewable share delivered to Stargate is not independently verified or publicly quantified.', sourceId: null, providerSourceId: null, sourceRole: 'Dated company disclosures with unverified facility share', claimIds: ['stargate-campus'] },
  cooling_capex: { id: 'cooling_capex', label: 'Cooling Infrastructure CAPEX', value: 450, numericValue: 450, unit: '$M', classification: 'User Assumption', citation: 'Synthetic analyst estimate scaled to the 1.2 GW model (2026); no public project CAPEX citation', description: 'Representative liquid-cooling and heat-rejection CAPEX selected by the analyst. The 2026 storm report is context for resilience risk, not evidence of Stargate CAPEX or a disclosed project cost.', sourceId: null, providerSourceId: null, sourceRole: 'Synthetic underwriting input', claimIds: ['synthetic-transaction'] },
  electricity_escalation: { id: 'electricity_escalation', label: '5-Yr Electricity Price Increase', value: 6, numericValue: 6, unit: '%', classification: 'Model Inference', citation: 'Analyst trend inference from public Texas power-market context (2025–2026); no project tariff is cited', description: 'Representative West Texas power-cost escalation inferred from public ERCOT and market conditions; it is not an observed Stargate tariff or project fact.', sourceId: null, providerSourceId: 'eia', sourceRole: 'Analyst inference from public market context', claimIds: ['analyst-inference'] },
  carbon_compliance: { id: 'carbon_compliance', label: 'Carbon Compliance Cost', value: 20, numericValue: 20, unit: '$M/yr', classification: 'Model Inference', citation: 'Analyst emissions-cost inference (2026); no reported Stargate charge is cited', description: 'Synthetic annual allowance inferred from public grid-intensity and on-site natural-gas context for the modeled campus scale; it is not a reported Stargate charge.', sourceId: null, providerSourceId: null, sourceRole: 'Analyst inference from public energy data', claimIds: ['analyst-inference'] },
  permitting_timeline: { id: 'permitting_timeline', label: 'Core Build Timeline', value: 'Eight-building core targeted for completion in 2026–2027', numericValue: 10, unit: 'Management schedule', classification: 'Management Assertion', citation: 'OpenAI Stargate disclosure (2025) and independent campus reporting (2026)', description: 'Company announcements targeted the eight-building core for 2026, while a later local update described construction continuing into 2027; the schedule remains a management-reported target.', sourceId: null, providerSourceId: null, sourceRole: 'Dated company announcements and local project reporting', claimIds: ['stargate-campus'] },
  customer_concentration: { id: 'customer_concentration', label: 'Customer Terms & Concentration', value: 100, numericValue: 100, unit: '% concentrated', classification: 'Management Assertion', citation: 'OpenAI Stargate disclosure (2025) and independent Abilene program reporting (2026)', description: 'Company filings and disclosures report an Oracle lease and a concentrated Stargate customer relationship, but the modeled 100% concentration and reported 15-year, 450,000-plus-GPU terms are not independently verified facility economics.', sourceId: null, providerSourceId: null, sourceRole: 'Dated company filings and disclosures', claimIds: ['stargate-oracle-gpus'] },
  water_rights: { id: 'water_rights', label: 'Local Water Rights & Allocation', value: 'Not disclosed', unit: 'Taylor County facility', classification: 'Missing Evidence', citation: 'Taylor County public records (2025–2026), City of Abilene water utility records (2025–2026), and Stargate/Crusoe disclosures (2025–2026) searched; no facility-level rights, allocation, or curtailment terms found', description: 'The dated county records, municipal records, and project disclosures searched do not establish Stargate water rights, allocation seniority, or drought curtailment protection.', sourceId: null, providerSourceId: null, sourceRole: 'Searched public records and project disclosures', claimIds: ['unresolved-water'] },
  site_hazard_exposure: {
    id: 'site_hazard_exposure',
    label: 'Site Hazard Exposure Profile',
    value: formatFemaHazardSummary(ACTIVE_FEMA_NRI_PROFILE),
    qualitativeValue: 'high',
    unit: 'FEMA county ratings',
    classification: 'Verified Evidence',
    modelClassification: 'Model Inference',
     citation: `${FEMA_NRI_ATTRIBUTION}, FIPS ${ACTIVE_FEMA_NRI_PROFILE.fips}`,
    description: `Exact FEMA hazard ratings for ${ACTIVE_FEMA_NRI_PROFILE.county} (FIPS ${ACTIVE_FEMA_NRI_PROFILE.fips}). FEMA's Inland Flooding field (IFLD_RISKR) is labeled Riverine Flooding in this product. The separate facility-level qualitative model input remains a Model Inference and is not a FEMA measurement.`,
    sourceId: 'fema-nri',
    providerSourceId: null,
    sourceRole: 'Embedded FEMA county hazard profile',
    claimIds: ['fema-taylor-county'],
  },
  backup_power_capacity: {
    id: 'backup_power_capacity',
    label: 'Backup Power Capacity',
    value: 'On-site natural gas confirmed; capacity not disclosed',
    numericValue: 0,
    unit: 'Resilience',
    classification: 'Management Assertion',
     citation: 'Crusoe public statement (2025); Lancium public statement (2025); Abilene Reporter-News winter reliability reporting (2026)',
     description: 'Company statements confirm on-site natural-gas generation, but capacity and duration are not disclosed; independent 2026 reporting indicates winter reliability was not assured.',
    sourceId: null,
     providerSourceId: null,
     sourceRole: 'Dated company disclosures with independent context',
      claimIds: ['stargate-campus'],
  },
  water_source_resilience: {
    id: 'water_source_resilience',
    label: 'Water Source Resilience',
    value: 'Taylor County municipal — single source, no disclosed backup',
    qualitativeValue: 'single-source',
    unit: 'Supply',
     classification: 'Model Inference',
     citation: 'City of Abilene water utility records (2025–2026); Taylor County public records (2025–2026); analyst inference from project reporting (2026)',
     description: 'The available public records indicate municipal supply, but no diversified or backup water source has been established for the facility; this is an analyst inference, not an observed Stargate disclosure.',
    sourceId: null,
    providerSourceId: null,
     sourceRole: 'Analyst inference from dated public records',
      claimIds: ['analyst-inference'],
  },
  downtime_cost: {
    id: 'downtime_cost',
    label: 'Estimated Downtime Cost',
    value: '$2,850,000/day',
    numericValue: 2_850_000,
    unit: 'Operating Loss',
    classification: 'User Assumption',
     citation: 'Epoch AI reporting on Stargate Abilene capacity (2026); Oracle Corporation Form 10-K for fiscal year 2025; synthetic analyst estimate (2026)',
     description: 'Representative operating loss selected by the analyst for each day of degraded or interrupted service at the modeled 1.2 GW scale; it is not a reported project loss.',
    sourceId: null,
    providerSourceId: null,
    sourceRole: 'Synthetic underwriting input',
    claimIds: ['synthetic-transaction'],
  },
};

assertEvidenceImpactRoleCoverage(Object.keys(INITIAL_EVIDENCE_SOURCE));

export const INITIAL_EVIDENCE: Record<string, EvidenceItem> = Object.fromEntries(
  Object.entries(INITIAL_EVIDENCE_SOURCE).map(([id, item]) => [
    id,
    { ...item, impactRole: getEvidenceImpactRole(id), origin: "synthetic-default" as const },
  ]),
);

const DiligenceContext = createContext<DiligenceState | undefined>(undefined);

const VALID_CLASSIFICATIONS: Classification[] = [
  'Verified Evidence',
  'Management Assertion',
  'Model Inference',
  'User Assumption',
  'Missing Evidence',
];

// These are the audited defaults from the previous provenance definition. They
// let a legacy session distinguish stale defaults from analyst-selected values.
const LEGACY_PROVENANCE_DEFAULTS: Partial<Record<string, Classification>> = {
  electricity_cost: 'Verified Evidence',
  electricity_escalation: 'Verified Evidence',
  customer_concentration: 'Verified Evidence',
};

export function DiligenceProvider({ children }: { children: React.ReactNode }) {
  const initialSession = useMemo(() => {
    retireLegacyAgentRunStorage();
    return loadCurrentSession();
  }, []);
  const initialProject: ProjectContext = initialSession.project ?? {
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
    description: "A public-source diligence case paired with clearly labeled synthetic acquisition economics.",
    capacityMW: DEFAULT_CAPACITY_MW,
  };
  const initialProjectWithCustomReview: ProjectContext = initialSession.customResearch
    ? {
      ...initialProject,
      researchProposals: initialSession.customResearch.researchProposals,
      researchProposalDispositions: initialSession.customResearch.researchProposalDispositions,
      researchProposalOverrides: initialSession.customResearch.researchProposalOverrides,
    }
    : initialProject;
  const [state, setState] = useState({
    evidence: initialSession.evidence,
    modelEvidence: initialSession.modelEvidence,
    canonicalBaseline: initialSession.canonicalBaseline,
    hasChangedClassification: initialSession.hasChangedClassification,
    lastChange: null as FinancialMetrics['lastChange'],
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sessionRestored, setSessionRestored] = useState(initialSession.restored);
  const [sessionMigrated] = useState(initialSession.migrated);
  const [capacityReview, setCapacityReview] = useState<CapacityReviewState | null>(initialSession.capacityReview);
  const capacityReviewRef = useRef<CapacityReviewState | null>(capacityReview);
  capacityReviewRef.current = capacityReview;
  const [project, setProject] = useState<ProjectContext>(initialProjectWithCustomReview);
  const [financialSessionHistory, setFinancialSessionHistoryState] = useState(
    () => readSessionFinancialHistory(sessionFinancialProjectKey(initialProject))
      ?? emptySessionFinancialHistory(
        sessionFinancialProjectKey(initialProject),
        EMPTY_SESSION_FINANCIAL_SCOPE,
      ),
  );
  const financialSessionHistoryRef = useRef(financialSessionHistory);
  financialSessionHistoryRef.current = financialSessionHistory;
  const financialProjectKey = sessionFinancialProjectKey(project);
  const activeFinancialSessionHistory = financialSessionHistory.projectKey === financialProjectKey
    ? financialSessionHistory
    : emptySessionFinancialHistory(financialProjectKey, EMPTY_SESSION_FINANCIAL_SCOPE);
  const sessionFinancialPreviewCandidatesRef = useRef(
    new WeakMap<object, SessionFinancialCandidate>(),
  );
  const resetFinancialSessionForProject = useCallback((nextProject: ProjectContext) => {
    const nextHistory = emptySessionFinancialHistory(
      sessionFinancialProjectKey(nextProject),
      EMPTY_SESSION_FINANCIAL_SCOPE,
    );
    writeSessionFinancialHistory(nextHistory, true);
    financialSessionHistoryRef.current = nextHistory;
    setFinancialSessionHistoryState(nextHistory);
    sessionFinancialPreviewCandidatesRef.current = new WeakMap();
  }, []);
  const [communityReview, setCommunityReview] = useState<CommunityReviewState>(() => loadCommunityReview(initialSession.project ?? {
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
  }));
  const [originatingCompany, setOriginatingCompanyState] = useState<CompanyKey | null>(initialSession.originatingCompany);
  const [selectedProjectContext, setSelectedProjectContext] = useState<ProjectSelectionContext | null>(initialSession.selectedProjectContext ?? null);
  const selectedProjectContextRef = useRef<ProjectSelectionContext | null>(selectedProjectContext);
  selectedProjectContextRef.current = selectedProjectContext;
  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadScenarios);
  const [ercotQueue, setErcotQueue] = useState<ErcotQueueResult>(FALLBACK_ERCOT_RESULT);
  const [eiaData, setEiaData] = useState<EiaElectricityData>(() => createEiaFallback());
  const [eiaLoading, setEiaLoading] = useState(true);
  const sourceStates = useMemo(() => sourceStateMap({
    "ercot-queue": ercotQueue.sourceMetadata,
    eia: eiaData.sourceMetadata,
  }), [eiaData.sourceMetadata, ercotQueue.sourceMetadata]);
  const effectiveModelEvidence = useMemo(
    () => state.modelEvidence,
    [state.modelEvidence],
  );
  const providerState = project.kind === "custom"
    ? "not-applicable" as const
    : eiaLoading
      ? "refreshing" as const
      : eiaData.dataOrigin === "provider"
        ? eiaData.status === "cached" ? "cached" as const : "live" as const
        : eiaData.error
          ? "unavailable" as const
          : "embedded" as const;
  const scenarioScope = useMemo<CapacityScope>(() => ({
    kind: "campus",
    campusId: project.canonicalDossier?.slug ?? project.name,
  }), [project.canonicalDossier?.slug, project.name]);
  const capacityClaimCandidate = useMemo(() => (
    project.kind === "custom"
      ? qualifyCapacityClaimCandidate(project.retainedFindings ?? [], scenarioScope)
      : null
  ), [project.kind, project.retainedFindings, scenarioScope]);
  const matchingCapacityReview = capacityReview?.projectKey === capacityProjectKey(project)
    ? capacityReview
    : null;
  const acceptedCapacityClaim = matchingCapacityReview?.decision === "accepted" &&
    matchingCapacityReview.acceptedClaim?.humanAccepted &&
    capacityClaimCandidate?.findingId === matchingCapacityReview.acceptedFindingId
      ? matchingCapacityReview.acceptedClaim
      : null;
  const illustrativeCapacityMW = project.kind === "custom"
    ? matchingCapacityReview?.illustrativeCapacityMW ?? null
    : null;
  const capacityBinding = useMemo<CapacityBindingResult>(() => {
    if (project.kind === "curated" && !project.canonicalDossier) {
      return approvedScenarioBinding("default-stargate");
    }
    if (project.canonicalDossier) {
      const approvedSlug = project.canonicalDossier.slug as keyof typeof APPROVED_DOSSIER_SCENARIOS;
      if (Object.prototype.hasOwnProperty.call(APPROVED_DOSSIER_SCENARIOS, approvedSlug)) {
        return approvedScenarioBinding(approvedSlug);
      }
    }
    return bindCapacityAssumption({
      claim: acceptedCapacityClaim ?? capacityClaimCandidate?.claim ?? null,
      scenarioScope,
      illustrativeCapacityMW: illustrativeCapacityMW ?? undefined,
    });
  }, [
    acceptedCapacityClaim,
    capacityClaimCandidate,
    illustrativeCapacityMW,
    project.canonicalDossier,
    project.kind,
    scenarioScope,
  ]);
  const financialModeling = useMemo<FinancialModelingState>(() => {
    if (capacityBinding.modelInput.capacityMW !== null) {
      const isApprovedDossier = project.kind === "curated";
      return {
        status: "modeled",
        label: isApprovedDossier
          ? "Audited Stargate synthetic project model"
          : "Capacity-based synthetic project model",
        reason: isApprovedDossier
          ? "The dossier is on the approved scenario list; the audited Stargate synthetic transaction contract is available for this case."
          : capacityBinding.binding.reason,
        requiredInputs: [],
      };
    }
    const reason = project.canonicalDossier
      ? "This dossier is not on the approved financial scenario list; its disclosed capacity does not substitute for an approved model input."
      : project.kind === "custom"
        ? "Custom research remains not modeled until a qualified capacity claim is accepted or illustrative capacity is entered."
        : capacityBinding.binding.reason;
    return {
      status: "not-modeled",
      label: "Not modeled",
      reason,
      requiredInputs: [
        "Approved transaction price and capital structure",
        "Binding customer revenue and term assumptions",
        "Project-specific operating and power-cost terms",
        "Construction schedule, capital costs, and financing assumptions",
      ],
    };
  }, [capacityBinding, project.canonicalDossier, project.kind]);
  const providerModelEvidence = useMemo(
    () => project.kind === "curated" && eiaData.dataOrigin === "provider"
      ? applyEiaEvidence(state.modelEvidence, eiaData)
      : null,
    [eiaData, project.kind, state.modelEvidence],
  );
  const sessionFinancialCandidates = useMemo<Record<string, SessionFinancialCandidate>>(() => {
    if (project.kind !== "custom") return {};
    const byId: Record<string, SessionFinancialCandidate> = {
      ...(project.researchProposals ?? {}),
    };
    for (const id of SESSION_FINANCIAL_TARGET_IDS) {
      if (!byId[id] && state.evidence[id]?.sourceUrl) {
        byId[id] = state.evidence[id] as SessionFinancialCandidate;
      }
    }
    return byId;
  }, [project.kind, project.researchProposals, state.evidence]);
  const sessionFinancialTransmission = useMemo(
    () => applySessionFinancialDecisions({
      projectKey: financialProjectKey,
      projectName: project.name,
      scope: activeFinancialSessionHistory.scope,
      candidates: sessionFinancialCandidates,
      baseEvidence: state.modelEvidence as EvidenceRecord,
      capacityMW: capacityBinding.modelInput.capacityMW,
      history: activeFinancialSessionHistory,
    }),
    [
      activeFinancialSessionHistory,
      capacityBinding.modelInput.capacityMW,
      financialProjectKey,
      project.kind,
      project.name,
      sessionFinancialCandidates,
      state.modelEvidence,
    ],
  );
  const effectiveEvidence = useMemo(
    () => project.kind === "custom"
      ? Object.fromEntries(
        Object.entries(sessionFinancialTransmission.evidence).map(([id, item]) => {
          const uiRecord = state.evidence[id];
          const scenarioRecord = item as EvidenceItem;
          return [id, {
            ...uiRecord,
            ...scenarioRecord,
            id,
            impactRole: getEvidenceImpactRole(id),
            sourceRole: typeof scenarioRecord.sourceRole === "string"
              ? scenarioRecord.sourceRole
              : uiRecord?.sourceRole ?? "Unspecified in retained UI record",
          }];
        }),
      ) as Record<string, EvidenceItem>
      : state.evidence,
    [project.kind, sessionFinancialTransmission.evidence, state.evidence],
  );
  const providerSessionEvidence = useMemo<EvidenceRecord | null>(() => {
    if (!providerModelEvidence) return null;
    return {
      ...providerModelEvidence,
      ...(sessionFinancialTransmission.evidence.water_consumption
        ? { water_consumption: sessionFinancialTransmission.evidence.water_consumption }
        : {}),
      ...(sessionFinancialTransmission.evidence.grid_interconnection
        ? { grid_interconnection: sessionFinancialTransmission.evidence.grid_interconnection }
        : {}),
    } as EvidenceRecord;
  }, [providerModelEvidence, sessionFinancialTransmission.evidence]);
  const baseFinancialScenarios = useMemo(
    () => buildFinancialScenarioMatrix({
      syntheticEvidence: state.modelEvidence as EvidenceRecord,
      providerEvidence: providerModelEvidence as EvidenceRecord | null,
      eiaData,
      providerState,
      capacityMW: capacityBinding.modelInput.capacityMW,
    }),
    [capacityBinding.modelInput.capacityMW, eiaData, providerModelEvidence, providerState, state.modelEvidence],
  );
  const sessionOverlayScenarios = useMemo(
    () => buildFinancialScenarioMatrix({
      syntheticEvidence: sessionFinancialTransmission.evidence as EvidenceRecord,
      providerEvidence: providerSessionEvidence,
      eiaData,
      providerState,
      capacityMW: capacityBinding.modelInput.capacityMW,
    }),
    [
      capacityBinding.modelInput.capacityMW,
      eiaData,
      providerSessionEvidence,
      providerState,
      sessionFinancialTransmission.evidence,
    ],
  );
  const financialScenarios = useMemo<FinancialScenarioMatrix>(() => ({
    ...baseFinancialScenarios,
    scenarios: {
      ...baseFinancialScenarios.scenarios,
      "synthetic-current": sessionOverlayScenarios.scenarios["synthetic-current"],
      "eia-current": sessionOverlayScenarios.scenarios["eia-current"],
    },
  }), [baseFinancialScenarios, sessionOverlayScenarios]);

  const financialInputState = useMemo<FinancialInputState>(() => {
    return buildFinancialInputState({
      projectKind: project.kind,
      eiaLoading,
      matrix: financialScenarios,
      eiaData,
    });
  }, [eiaData, eiaLoading, financialScenarios, project.kind]);

  useEffect(() => {
    let active = true;
    void fetchErcotQueue().then((result) => {
      if (active) setErcotQueue(result);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchEiaElectricity().then((result) => {
      if (!active) return;
      setEiaData(result);
      setEiaLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (financialSessionHistoryRef.current.projectKey === financialProjectKey) return;
    const nextHistory = emptySessionFinancialHistory(
      financialProjectKey,
      EMPTY_SESSION_FINANCIAL_SCOPE,
    );
    writeSessionFinancialHistory(nextHistory);
    financialSessionHistoryRef.current = nextHistory;
    setFinancialSessionHistoryState(nextHistory);
    sessionFinancialPreviewCandidatesRef.current = new WeakMap();
  }, [financialProjectKey]);

  useEffect(() => {
    if (!sessionRestored) return undefined;
    const timer = window.setTimeout(() => setSessionRestored(false), 4000);
    return () => window.clearTimeout(timer);
  }, [sessionRestored]);

  const updateClassification = useCallback((
    id: string,
    classification: Classification,
    source: "manual" | "ai" = "manual",
    reviewKind: EvidenceReviewKind = source === "ai" ? "ai-accepted" : "manual",
  ) => {
    const currentState = stateRef.current;
    const previous = currentState.evidence[id]?.classification;
    if (!previous || !isClassification(classification)) return false;
    const classificationChanged = previous !== classification;
    if (!classificationChanged && reviewKind === "manual") return false;
    const modelCapacity = capacityBinding.modelInput.capacityMW;
    const settledForFinancialCalculation = project.kind === "curated" && modelCapacity !== null;

    const previousIrr = classificationChanged && settledForFinancialCalculation
      ? calculateCashFlowModel(currentState.modelEvidence as EvidenceRecord, modelCapacity).projectIRR
      : null;
    const nextEvidence = {
      ...currentState.evidence,
      [id]: {
        ...currentState.evidence[id],
        ...(classificationChanged ? { classification } : {}),
        ...(project.canonicalDossier ? {
          baselineClassification: currentState.canonicalBaseline?.[id]?.classification ?? currentState.evidence[id].baselineClassification,
          sessionOverride: classificationChanged
            ? classification !== (currentState.canonicalBaseline?.[id]?.classification ?? currentState.evidence[id].baselineClassification)
            : currentState.evidence[id].sessionOverride,
        } : {}),
        review: {
          kind: reviewKind,
          reviewedAt: new Date().toISOString(),
          ...(classificationChanged ? {} : { noOp: true }),
        },
      },
    };
    const nextModelEvidence = project.kind === "custom"
      ? currentState.modelEvidence
      : classificationChanged
        ? {
            ...currentState.modelEvidence,
            ...(currentState.modelEvidence[id]
              ? {
                  [id]: {
                    ...currentState.modelEvidence[id],
                    classification,
                    ...(project.canonicalDossier ? {
                      baselineClassification: currentState.canonicalBaseline?.[id]?.classification,
                      sessionOverride: classification !== currentState.canonicalBaseline?.[id]?.classification,
                    } : {}),
                  },
                }
              : {}),
          }
        : currentState.modelEvidence;
    const nextIrr = classificationChanged && settledForFinancialCalculation
      ? calculateCashFlowModel(nextModelEvidence as EvidenceRecord, modelCapacity!).projectIRR
      : null;
    const nextState = {
      evidence: nextEvidence,
      modelEvidence: nextModelEvidence,
      canonicalBaseline: currentState.canonicalBaseline,
      hasChangedClassification: project.canonicalDossier
        ? Object.entries(nextEvidence).some(([evidenceId, item]) =>
            item.classification !== currentState.canonicalBaseline?.[evidenceId]?.classification,
          )
        : classificationChanged ? true : currentState.hasChangedClassification,
      lastChange: classificationChanged && settledForFinancialCalculation
        ? {
          from: previousIrr ?? 0,
          to: nextIrr ?? 0,
          delta: (nextIrr ?? 0) - (previousIrr ?? 0),
        }
        : currentState.lastChange,
    };
    stateRef.current = nextState;
    setState(nextState);
    if (source === "manual" && classificationChanged) {
      recordManualClassificationChange(id, previous, classification);
    } else if (source === "ai" && classificationChanged) {
      recordAIDecision(
        id,
        classification,
        project.canonicalDossier
          ? "Accepted AI-proposed classification as a session override; the dossier baseline remains unchanged."
          : "Accepted AI-proposed classification for this session.",
        "accepted",
        classification,
      );
    }
    if (project.kind === "curated" || project.kind === "custom") {
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
        nextEvidence,
        nextState.hasChangedClassification,
        nextState.modelEvidence,
        originatingCompany,
        selectedProjectContextRef.current,
        project.kind === "custom" ? customResearchSnapshot(project, nextState) : undefined,
        project.canonicalDossier ? createCanonicalReviewSnapshot(project, nextState) : undefined,
        capacityReviewRef.current,
      ));
    }
    return true;
  }, [capacityBinding.modelInput.capacityMW, originatingCompany, project]);

  const clearLastChange = useCallback(() => {
    const nextState = { ...stateRef.current, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const setFinancialSessionScope = useCallback((
    scope: Parameters<typeof emptySessionFinancialHistory>[1],
  ) => {
    const nextScope = {
      facility: typeof scope?.facility === "string" ? scope.facility.trim() : "",
      phase: typeof scope?.phase === "string" ? scope.phase.trim() : "",
    };
    const currentHistory = financialSessionHistoryRef.current.projectKey === financialProjectKey
      ? financialSessionHistoryRef.current
      : emptySessionFinancialHistory(financialProjectKey, EMPTY_SESSION_FINANCIAL_SCOPE);
    if (
      currentHistory.scope.facility === nextScope.facility &&
      currentHistory.scope.phase === nextScope.phase
    ) return;
    const nextHistory = emptySessionFinancialHistory(financialProjectKey, nextScope);
    writeSessionFinancialHistory(nextHistory, true);
    financialSessionHistoryRef.current = nextHistory;
    setFinancialSessionHistoryState(nextHistory);
    sessionFinancialPreviewCandidatesRef.current = new WeakMap();
  }, [financialProjectKey]);

  const previewSessionFinancialFinding = useCallback((id: string) => {
    if (project.kind !== "custom") {
      throw new Error("Session financial previews are available only for current custom-research findings.");
    }
    const candidate = sessionFinancialCandidates[id];
    if (!candidate) {
      throw new Error(`No current research finding is available for ${id}.`);
    }
    const currentHistory = financialSessionHistoryRef.current.projectKey === financialProjectKey
      ? financialSessionHistoryRef.current
      : emptySessionFinancialHistory(financialProjectKey, EMPTY_SESSION_FINANCIAL_SCOPE);
    const preview = buildSessionFinancialPreview({
      projectKey: financialProjectKey,
      projectName: project.name,
      scope: currentHistory.scope,
      currentCandidates: sessionFinancialCandidates,
      candidate,
      baseEvidence: stateRef.current.modelEvidence as EvidenceRecord,
      capacityMW: capacityBinding.modelInput.capacityMW,
      history: currentHistory,
    });
    sessionFinancialPreviewCandidatesRef.current.set(preview, candidate);
    return preview;
  }, [
    capacityBinding.modelInput.capacityMW,
    financialProjectKey,
    project.kind,
    project.name,
    sessionFinancialCandidates,
  ]);

  const reviewSessionFinancialFinding = useCallback((
    preview: SessionFinancialPreview,
    action: "accept" | "reject" | "evidence-only",
  ) => {
    const candidate = sessionFinancialPreviewCandidatesRef.current.get(preview);
    if (!candidate) return false;
    const currentCandidate = sessionFinancialCandidates[candidate.id];
    if (!currentCandidate) return false;
    const currentHistory = financialSessionHistoryRef.current.projectKey === financialProjectKey
      ? financialSessionHistoryRef.current
      : emptySessionFinancialHistory(financialProjectKey, EMPTY_SESSION_FINANCIAL_SCOPE);
    try {
      const nextHistory = decideSessionFinancialPreview({
        preview,
        action,
        candidate: currentCandidate,
        currentContext: {
          projectKey: financialProjectKey,
          projectName: project.name,
          scope: currentHistory.scope,
          currentCandidates: sessionFinancialCandidates,
          baseEvidence: stateRef.current.modelEvidence as EvidenceRecord,
          capacityMW: capacityBinding.modelInput.capacityMW,
        },
        history: currentHistory,
      });
      writeSessionFinancialHistory(nextHistory, true);
      financialSessionHistoryRef.current = nextHistory;
      setFinancialSessionHistoryState(nextHistory);
      return true;
    } catch {
      return false;
    }
  }, [
    capacityBinding.modelInput.capacityMW,
    financialProjectKey,
    project.name,
    sessionFinancialCandidates,
  ]);

  const setOriginatingCompany = useCallback((company: CompanyKey | null) => {
    const nextSelection = selectedProjectContextRef.current?.company === company
      ? selectedProjectContextRef.current
      : null;
    setOriginatingCompanyState(company);
    setSelectedProjectContext(nextSelection);
    selectedProjectContextRef.current = nextSelection;
    if (project.kind === "curated") {
      const currentState = stateRef.current;
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
        currentState.evidence,
        currentState.hasChangedClassification,
        currentState.modelEvidence,
        company,
        nextSelection,
        undefined,
        createCanonicalReviewSnapshot(project, currentState),
        capacityReviewRef.current,
      ));
    }
  }, [project.kind]);

  const setProjectSelection = useCallback((selection: ProjectSelectionContext | null) => {
    const nextCompany = selection?.company ?? originatingCompany;
    setOriginatingCompanyState(nextCompany);
    setSelectedProjectContext(selection);
    selectedProjectContextRef.current = selection;
    const currentState = stateRef.current;
    writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
      currentState.evidence,
      currentState.hasChangedClassification,
      currentState.modelEvidence,
      nextCompany,
      selection,
      customResearchSnapshot(project, currentState),
      createCanonicalReviewSnapshot(project, currentState),
      capacityReviewRef.current,
    ));
  }, [originatingCompany, project]);

  const applyEvidenceCorrection = useCallback((id: string, correction: EvidenceCorrection) => {
    if (project.kind !== "custom") return false;
    const currentState = stateRef.current;
    const current = currentState.evidence[id];
    if (!current || !isClassification(correction.classification)) return false;
    const proposal = correction.researchProposal;
    if (proposal && (proposal.id !== id || proposal.sourceUrl !== correction.sourceUrl)) return false;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(correction.sourceUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return false;
    } catch {
      return false;
    }
    const accessedAt = new Date().toISOString().slice(0, 10);
    const submittedSource: ResearchEvidenceSource = {
      url: parsedUrl.href,
      title: "Reviewer-submitted public source",
      publisher: parsedUrl.hostname.replace(/^www\./, ""),
      publishedAt: null,
      accessedAt,
      accessStatus: "not provided",
      excerpt: correction.claim.trim(),
      sourceClass: "reviewer-submitted",
      searchDomain: "reviewer-correction",
      relationship: "primary",
    };
    const nextEvidence = {
      ...currentState.evidence,
      [id]: {
        ...current,
        value: correction.value.trim(),
        classification: correction.classification,
        citation: `${correction.claim.trim()} ${parsedUrl.href}`,
        description: correction.claim.trim(),
        sourceUrl: parsedUrl.href,
        sourceTitle: submittedSource.title,
        sourcePublisher: submittedSource.publisher,
        sourcePublishedAt: null,
        sourceAccessedAt: accessedAt,
        sourceAccessStatus: "not provided" as const,
        sourceRole: "Reviewer-submitted source · AI-proposed, human-accepted",
        sources: [submittedSource, ...(current.sources ?? []).map((source) => ({ ...source, relationship: "corroborating" as const }))].slice(0, 4),
        coverageStatus: "partial" as const,
        sourceSupportConfidence: 0,
        // A changed claim has not received a research confidence assessment.
        modelReportedConfidence: undefined,
        classificationReason: "Reviewer attached a public source and accepted this AI proposal; independent corroboration remains required.",
        sourceRelevanceNote: correction.claim.trim(),
        searchTerms: [],
        searchTermsSource: "unavailable" as const,
         ...(proposal && proposal.eligibleForModel ? {
          ...proposal,
          numericValue: proposal.numericValue,
          qualitativeValue: proposal.qualitativeValue,
          modelReportedConfidence: proposal.modelReportedConfidence,
          sourceSupportConfidence: proposal.sourceSupportConfidence,
          sources: proposal.sources,
          conflictSummary: proposal.conflictSummary,
          sourceTitle: proposal.sourceTitle,
          sourcePublisher: proposal.sourcePublisher,
          sourcePublishedAt: proposal.sourcePublishedAt,
          sourceAccessedAt: proposal.sourceAccessedAt,
          sourceAccessStatus: proposal.sourceAccessStatus,
          sourceRole: `AI-researched · human-accepted · ${proposal.sourceRole}`,
           acceptedForModel: true,
           researchState: "accepted" as const,
           eligibleForModel: true,
        } : {}),
         ...(!proposal || !proposal.eligibleForModel ? {
           acceptedForModel: false,
           researchState: "quarantined" as const,
           eligibleForModel: false,
           quarantineReasons: ["Reviewer-submitted corrections require validated research evidence before model activation."],
         } : {}),
        reviewerSubmittedSource: submittedSource,
        sourceValidation: proposal?.eligibleForModel
          ? proposal.sourceValidation
          : {
              policyVersion: 1,
              state: "rejected",
              rejectionCodes: ["reviewer-submitted"],
              claimMappings: [],
            },
         review: { kind: correction.reviewKind ?? "ai-accepted", reviewedAt: new Date().toISOString() },
      },
    };
    // Proposal acceptance changes the reviewer-facing evidence only. Financial
    // activation is gated separately by the session financial review workflow.
    const nextModelEvidence = currentState.modelEvidence;
    const nextState = {
      evidence: nextEvidence,
      modelEvidence: nextModelEvidence,
      canonicalBaseline: currentState.canonicalBaseline,
      hasChangedClassification: true,
      lastChange: null,
    };
    stateRef.current = nextState;
    setState(nextState);
    return true;
  }, [project]);

  const applyResearchProposalOverride = useCallback((
    id: string,
    proposal: CustomEvidenceRecord,
    replacement: { value: string; classification: Classification; rationale: string },
  ) => {
    if (project.kind !== "custom" || proposal.id !== id || !proposal.sourceUrl || !isClassification(replacement.classification) || !replacement.rationale.trim()) return false;
    const numericReplacement = typeof proposal.value === "number" || proposal.numericValue !== undefined
      ? Number(replacement.value)
      : replacement.value.trim();
    if (typeof numericReplacement === "number" && !Number.isFinite(numericReplacement)) return false;
    const candidate = containCustomResearchEvidence({
      ...proposal,
      value: numericReplacement,
      rawValue: numericReplacement,
      rawText: replacement.value.trim(),
      numericValue: typeof numericReplacement === "number" ? numericReplacement : undefined,
      classification: replacement.classification,
      classificationReason: replacement.rationale.trim(),
      sourceRelevanceNote: replacement.rationale.trim(),
      description: `${proposal.description} Reviewer override: ${replacement.rationale.trim()}`,
      acceptedForModel: true,
    });
    if (!candidate.eligibleForModel || candidate.sourceUrl !== proposal.sourceUrl) return false;
    return applyEvidenceCorrection(id, {
      value: String(candidate.value),
      claim: candidate.description,
      sourceUrl: candidate.sourceUrl,
      classification: replacement.classification,
      researchProposal: candidate,
      reviewKind: "research-overridden",
    });
  }, [applyEvidenceCorrection, project]);

  const persistResearchReview = useCallback((
    proposals: Record<string, CustomEvidenceRecord>,
    dispositions: Record<string, ResearchProposalDisposition>,
    overrides: Record<string, ResearchProposalOverride>,
  ) => {
    if (project.kind !== "custom") return;
    const currentState = stateRef.current;
    const nextProject: ProjectContext = {
      ...project,
      researchProposals: proposals,
      researchProposalDispositions: dispositions,
      researchProposalOverrides: overrides,
    };
    setProject(nextProject);
    writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
      currentState.evidence,
      currentState.hasChangedClassification,
      currentState.modelEvidence,
      originatingCompany,
      selectedProjectContextRef.current,
      {
        project: nextProject,
        evidence: currentState.evidence,
        modelEvidence: currentState.modelEvidence,
        researchProposals: proposals,
        researchProposalDispositions: dispositions,
        researchProposalOverrides: overrides,
      },
      undefined,
      capacityReviewRef.current,
    ));
  }, [originatingCompany, project]);

  const reviewCommunityTerm = useCallback((
    id: CommunityTermId,
    conclusion: CommunityConclusion,
    classification: CommunityTermDecision["classification"],
    humanStatus: CommunityHumanStatus = "accepted",
    reviewerNote?: string,
  ) => {
    const current = communityReview.terms[id];
    const definition = COMMUNITY_TERM_DEFINITIONS.find((candidate) => candidate.id === id);
    if (!current || !definition) return false;
    const reviewedAt = new Date().toISOString();
    const next: CommunityReviewState = {
      ...communityReview,
      terms: {
        ...communityReview.terms,
        [id]: { ...current, conclusion, classification, humanStatus, reviewedAt, reviewerNote },
      },
      lastAction: { termId: id, status: humanStatus, recordedAt: reviewedAt },
    };
    setCommunityReview(next);
    writeCommunityReview(next, project);
    logSessionAction(`Community term ${humanStatus}`, id);
    return true;
  }, [communityReview, project]);

  const resetToDefault = useCallback((company: string | null = "Oracle") => {
    const currentState = stateRef.current;
    if (project.canonicalDossier && currentState.canonicalBaseline) {
      resetFinancialSessionForProject(project);
      const baselineEvidence = cloneEvidence(currentState.canonicalBaseline);
      const nextState = {
        evidence: withDossierReviewState(baselineEvidence),
        modelEvidence: buildDossierModelEvidence(baselineEvidence),
        canonicalBaseline: baselineEvidence,
        hasChangedClassification: false,
        lastChange: null as FinancialMetrics["lastChange"],
      };
      stateRef.current = nextState;
      setState(nextState);
      const nextCompany = selectedProjectContextRef.current?.company ??
        originatingCompany ??
        parseOriginatingCompany(company);
      setOriginatingCompanyState(nextCompany);
      const dossierCommunityProject: CommunityProjectInput = {
        kind: "curated",
        name: project.name,
        location: project.location,
      };
      const nextCommunityReview = createCommunityReview(dossierCommunityProject);
      setCommunityReview(nextCommunityReview);
      writeCommunityReview(nextCommunityReview, dossierCommunityProject);
      clearDecisionHistory();
      clearSessionActions();
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
        nextState.evidence,
        false,
        nextState.modelEvidence,
        nextCompany,
        selectedProjectContextRef.current,
        undefined,
        createCanonicalReviewSnapshot(project, nextState),
        capacityReviewRef.current,
      ));
      return;
    }
    const nextCompany = parseOriginatingCompany(company);
    const nextProject: ProjectContext = {
      kind: "curated",
      name: "Stargate Abilene",
      location: "Taylor County, TX",
      description: "A public-source diligence case paired with clearly labeled synthetic acquisition economics.",
      capacityMW: DEFAULT_CAPACITY_MW,
    };
    resetFinancialSessionForProject(nextProject);
    const nextState = { evidence: cloneEvidence(INITIAL_EVIDENCE), modelEvidence: cloneEvidence(INITIAL_EVIDENCE), canonicalBaseline: null, hasChangedClassification: false, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
    capacityReviewRef.current = null;
    setCapacityReview(null);
    setProject(nextProject);
    setOriginatingCompanyState(nextCompany);
    const nextCommunityReview = createCommunityReview({
      kind: "curated",
      name: "Stargate Abilene",
      location: "Taylor County, TX",
    });
    setCommunityReview(nextCommunityReview);
    clearStorage(COMMUNITY_REVIEW_STORAGE_KEY);
    clearDecisionHistory();
    clearSessionActions();
    const nextSelection = nextCompany === "Oracle" || nextCompany === "NVIDIA"
      ? {
        company: nextCompany,
        projectId: "stargate-abilene",
        projectName: "Stargate Abilene",
        operator: "Oracle / OpenAI",
        location: "Taylor County, TX",
        capacityMW: DEFAULT_CAPACITY_MW,
        status: "Operating / expansion reported",
        relationshipType: "Developer/Operator" as const,
        evidenceState: "Source-backed" as const,
        kind: "curated" as const,
        sourceUrl: null,
        providerId: "stargate-abilene",
      }
      : null;
    setSelectedProjectContext(nextSelection);
    selectedProjectContextRef.current = nextSelection;
    writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
      nextState.evidence,
      nextState.hasChangedClassification,
      nextState.modelEvidence,
      nextCompany,
      nextSelection,
    ));
  }, [originatingCompany, project, resetFinancialSessionForProject]);

  const loadCustomProject = useCallback((research: CustomResearchResponse, company: string | null = null, projectSelection?: ProjectSelectionContext | null) => {
    const researchById = new Map(research.evidence.map((item) => [item.id, item]));
    const customEvidence = Object.fromEntries(
      CUSTOM_EVIDENCE_IDS.map((id) => {
        const item = researchById.get(id) ?? {
          ...INITIAL_EVIDENCE[id],
          value: "Not established",
          classification: "Missing Evidence" as const,
          citation: "No validated category result established this facility-level value.",
          description: "This item remains unresolved because the relevant research category did not return validated data.",
          sourceUrl: undefined,
          sourceRole: "Research gap · no validated category result",
          searchCoverage: [],
          failedSearchDomains: [],
          sources: [],
          sourceSupportConfidence: 0,
          eligibleForModel: false,
          acceptedForModel: false,
          researchState: "retrieved-lead" as const,
        };
        return [id, {
          ...item,
          id,
          impactRole: getEvidenceImpactRole(id),
          sourceId: null,
          providerSourceId: null,
          sourceRole: `AI-researched · ${item?.sourceRole ?? "High-level public research"}`,
          claimIds: [],
        }];
      }),
    ) as Record<string, EvidenceItem>;
    const uncontainedModelEvidence = Object.fromEntries(
      Object.entries(customEvidence).map(([id, item]) => [
        id,
        {
          ...item,
          classification: "Missing Evidence" as const,
          acceptedForModel: false,
          eligibleForModel: false,
          researchState: "retrieved-lead" as const,
        },
      ]),
    ) as Record<string, EvidenceItem>;
    const containedModelEvidence = containCustomModelEvidence(uncontainedModelEvidence);
    const nextState = { evidence: customEvidence, modelEvidence: containedModelEvidence, canonicalBaseline: null, hasChangedClassification: false, lastChange: null as FinancialMetrics["lastChange"] };
    const researchProposals = selectResearchProposals(research.proposedInputs ?? []);
    const researchProposalDispositions = Object.fromEntries(
      Object.keys(researchProposals).map((id) => [id, "pending" as const]),
    ) as Record<string, ResearchProposalDisposition>;
    const nextProject: ProjectContext = {
      kind: "custom",
      name: research.projectSummary.name,
      location: research.projectSummary.location,
      description: research.projectSummary.description,
      capacityMW: research.projectSummary.capacityMW,
      capacityProvenance: research.projectSummary.capacityProvenance,
       researchMode: research.researchMode ?? "research-incomplete",
       researchStatus: research.researchStatus,
       researchError: research.researchError,
      researchCache: research.researchCache,
      researchCoverage: research.researchCoverage,
      researchAudit: research.researchAudit,
      researchOutcome: research.researchOutcome,
       eligibleEvidenceCount: research.eligibleEvidence?.length ?? 0,
       retrievedLeadCount: research.retrievedLeads?.length ?? research.evidence.filter((item) => item.researchState !== "proposed" && item.researchState !== "accepted").length,
      quarantineReasons: research.quarantineReasons ?? [],
      researchProposals,
      researchProposalDispositions,
      researchProposalOverrides: {},
      retainedFindings: research.retainedFindings ?? [],
      retainedFindingAudit: research.retainedFindingAudit,
      replay: research.replay,
    };
    const nextCapacityReview: CapacityReviewState = {
      projectKey: capacityProjectKey(nextProject),
      decision: null,
      acceptedFindingId: null,
      acceptedClaim: null,
      illustrativeCapacityMW: null,
      trail: [],
    };
    resetFinancialSessionForProject(nextProject);
    stateRef.current = nextState;
    setState(nextState);
    capacityReviewRef.current = nextCapacityReview;
    setCapacityReview(nextCapacityReview);
    setProject(nextProject);
    const customCommunityProject: CommunityProjectInput = {
      kind: "custom",
      name: research.projectSummary.name,
      location: research.projectSummary.location,
    };
    const nextCommunityReview = loadCommunityReview(customCommunityProject);
    setCommunityReview(nextCommunityReview);
    writeCommunityReview(nextCommunityReview, customCommunityProject);
    const parsedCompany = parseOriginatingCompany(company);
    const retainedSelection = projectSelection === undefined &&
      selectedProjectContextRef.current?.company === parsedCompany
      ? selectedProjectContextRef.current
      : projectSelection ?? null;
    setOriginatingCompanyState(parsedCompany);
    setSelectedProjectContext(retainedSelection);
    selectedProjectContextRef.current = retainedSelection;
    clearDecisionHistory();
    writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
      nextState.evidence,
      nextState.hasChangedClassification,
      nextState.modelEvidence,
      parsedCompany,
      retainedSelection,
      {
        project: nextProject,
        evidence: nextState.evidence,
        modelEvidence: nextState.modelEvidence,
        researchProposals,
        researchProposalDispositions,
        researchProposalOverrides: {},
      },
      undefined,
      nextCapacityReview,
    ));
  }, [resetFinancialSessionForProject]);

  const loadCanonicalDossier = useCallback((
    dossier: CanonicalDossierSummary,
    selectedContext?: Partial<Pick<ProjectSelectionContext, "company" | "relationshipType">>,
  ) => {
    const currentState = stateRef.current;
    const currentDossierSnapshot = project.canonicalDossier?.slug === dossier.slug
      ? createCanonicalReviewSnapshot(project, currentState)
      : undefined;
    const savedSnapshot = currentDossierSnapshot ??
      (initialSession.canonicalReview?.slug === dossier.slug ? initialSession.canonicalReview : undefined);
    const currentSelection = selectedProjectContextRef.current;
    const selectedCompany = selectedContext?.company ?? originatingCompany ?? currentSelection?.company;
    const company = parseOriginatingCompany(selectedCompany) ??
      parseOriginatingCompany(dossier.canonicalData.originatingCompany);
    const relationshipType = selectedContext?.relationshipType ??
      (currentSelection?.company === company ? currentSelection.relationshipType : undefined) ??
      dossier.canonicalData.relationshipType as ProjectSelectionContext["relationshipType"];
    const research = dossierToResearchResponse(dossier);
    const selection: ProjectSelectionContext | null = company ? {
      company,
      projectId: dossier.slug,
      projectName: dossier.name,
      operator: dossier.canonicalData.identity.operator,
      location: dossier.canonicalData.identity.location,
      capacityMW: dossier.canonicalData.identity.capacityMW ?? null,
      status: "Canonical dossier",
      relationshipType,
      evidenceState: "Source-backed",
      kind: "curated",
      sourceUrl: dossier.canonicalData.evidence[0]?.source.url ?? null,
      providerId: dossier.slug,
    } : null;
    const canonicalEvidence = Object.fromEntries(research.evidence.map((item) => [
      item.id,
      {
        ...item,
        impactRole: getEvidenceImpactRole(item.id),
        sourceId: null,
        providerSourceId: null,
        claimIds: [],
        origin: "dossier" as const,
        baselineClassification: item.classification,
        sessionOverride: false,
      },
    ])) as Record<string, EvidenceItem>;
    const baselineEvidence = savedSnapshot
      ? cloneEvidence(savedSnapshot.baselineEvidence)
      : canonicalEvidence;
    const overrides = savedSnapshot?.overrides ?? {};
    const evidence = withDossierReviewState(
      baselineEvidence,
      overrides,
      savedSnapshot?.reviewMetadata ?? {},
    );
    const nextState = {
      evidence,
      modelEvidence: buildDossierModelEvidence(baselineEvidence, overrides),
      canonicalBaseline: baselineEvidence,
      hasChangedClassification: Object.keys(overrides).length > 0,
      lastChange: null as FinancialMetrics["lastChange"],
    };
    const nextProject: ProjectContext = {
      kind: "curated",
      name: dossier.name,
      location: dossier.canonicalData.identity.location,
      description: dossier.canonicalData.identity.scope,
      capacityMW: dossier.canonicalData.identity.capacityMW ?? null,
      capacityProvenance: dossier.canonicalData.identity.capacityMW
        ? "directory-reported"
        : "unknown",
      canonicalDossier: dossier,
      canonicalProvenance: research.canonicalProvenance,
    };
    resetFinancialSessionForProject(nextProject);
    stateRef.current = nextState;
    setState(nextState);
    capacityReviewRef.current = null;
    setCapacityReview(null);
    setProject(nextProject);
    setOriginatingCompanyState(company);
    setSelectedProjectContext(selection);
    selectedProjectContextRef.current = selection;
    const nextCommunityReview = createCommunityReview({
      kind: "curated",
      name: dossier.name,
      location: dossier.canonicalData.identity.location,
    });
    setCommunityReview(nextCommunityReview);
    writeCommunityReview(nextCommunityReview, nextProject);
    if (savedSnapshot) {
      restoreDecisionHistory(initialSession.decisionHistory ?? []);
    } else {
      clearDecisionHistory();
      clearSessionActions();
    }
    writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
      nextState.evidence,
      nextState.hasChangedClassification,
      nextState.modelEvidence,
      company,
      selection,
      undefined,
      createCanonicalReviewSnapshot(nextProject, nextState),
    ));
  }, [
    initialSession.canonicalReview,
    initialSession.decisionHistory,
    originatingCompany,
    project,
    resetFinancialSessionForProject,
  ]);

  const saveScenario = (name: string): SaveScenarioResult => {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, reason: 'empty-name' };
    if (project.kind === "custom") return { ok: false, reason: 'custom-project' };
    if (!financialScenarios.scenarios["synthetic-current"]) return { ok: false, reason: 'not-modeled' };
    if (scenarios.length >= 5) return { ok: false, reason: 'capacity' };
    if (scenarios.some((scenario) => scenario.name.toLowerCase() === trimmedName.toLowerCase())) {
      return { ok: false, reason: 'duplicate-name' };
    }

    const scenario: SavedScenario = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      savedAt: new Date().toISOString(),
      classifications: Object.fromEntries(
        Object.entries(state.evidence).map(([id, item]) => [id, item.classification]),
      ),
      metrics: {
        projectIRR: metrics.projectIRR,
        projectIRRStatus: metrics.projectIRRStatus,
        projectIRRReason: metrics.projectIRRReason,
        moic: metrics.moic,
        npv: metrics.npv,
        cashOnCash: metrics.cashOnCash,
        payback: metrics.payback,
        confidence: metrics.confidenceScore,
      },
      basis: {
        status: "known",
        scenarioId: "synthetic-current",
        evidenceBasis: "current",
        electricityBasis: "synthetic",
        modelContractVersion: financialScenarios.modelContractVersion,
        modelFingerprint: financialScenarios.scenarios["synthetic-current"]!.modelFingerprint,
        rawElectricityRate: financialScenarios.scenarios["synthetic-current"]!.inputs.rawElectricityRate,
        appliedElectricityRate: financialScenarios.scenarios["synthetic-current"]!.inputs.appliedElectricityRate,
        rawElectricityEscalationPercent: financialScenarios.scenarios["synthetic-current"]!.inputs.rawElectricityEscalationPercent,
        appliedElectricityEscalationPercent: financialScenarios.scenarios["synthetic-current"]!.inputs.appliedElectricityEscalationPercent,
      },
    };
    const nextScenarios = [...scenarios, scenario];
    setScenarios(nextScenarios);
    writeStorage(SCENARIOS_STORAGE_KEY, { version: SCENARIOS_STORAGE_VERSION, scenarios: nextScenarios });
    return { ok: true, scenario };
  };

  const renameScenario = (id: string, name: string): RenameScenarioResult => {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, reason: 'empty-name' };
    const scenario = scenarios.find((candidate) => candidate.id === id);
    if (!scenario) return { ok: false, reason: 'not-found' };
    if (scenarios.some((candidate) => candidate.id !== id && candidate.name.toLowerCase() === trimmedName.toLowerCase())) {
      return { ok: false, reason: 'duplicate-name' };
    }

    const renamedScenario = { ...scenario, name: trimmedName };
    const nextScenarios = scenarios.map((candidate) => candidate.id === id ? renamedScenario : candidate);
    setScenarios(nextScenarios);
    writeStorage(SCENARIOS_STORAGE_KEY, { version: SCENARIOS_STORAGE_VERSION, scenarios: nextScenarios });
    return { ok: true, scenario: renamedScenario };
  };

  const removeScenario = (id: string): RemoveScenarioResult => {
    const scenario = scenarios.find((candidate) => candidate.id === id);
    if (!scenario) return { ok: false, reason: 'not-found' };

    const nextScenarios = scenarios.filter((candidate) => candidate.id !== id);
    setScenarios(nextScenarios);
    writeStorage(SCENARIOS_STORAGE_KEY, { version: SCENARIOS_STORAGE_VERSION, scenarios: nextScenarios });
    return { ok: true, scenario };
  };

  const metrics = useMemo(
    () => {
      const current = financialScenarios.scenarios["synthetic-current"];
      const baseline = financialScenarios.scenarios["synthetic-verified"];
      if (!current) return unmodeledMetrics(state.lastChange);
      return {
        ...current.model,
        baseIRR: baseline?.returns.projectIRR ?? null,
        baseModel: baseline?.model ?? current.model,
        lastChange: state.lastChange,
      } as FinancialMetrics;
    },
    [financialScenarios, state.lastChange],
  );

  const downloadReturnDiscrepancyRecord = useCallback(async () => {
    if (!import.meta.env.DEV || typeof window === "undefined") return false;
    const capture = window.__safelocCaptureReturnDiscrepancyState;
    if (!capture) return false;

    const record = await capture();
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "safeloc-return-discrepancy.json";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return undefined;

    const capture = async () => {
      let releaseIdentity: ReturnCaptureReleaseIdentity | null = null;
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/version`, {
          headers: { accept: "application/json" },
        });
        if (response.ok) {
          const candidate: unknown = await response.json();
          if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
            const value = candidate as Record<string, unknown>;
            releaseIdentity = {
              applicationVersion: typeof value.applicationVersion === "string" ? value.applicationVersion : null,
              releaseId: typeof value.releaseId === "string" ? value.releaseId : null,
              commitSha: typeof value.commitSha === "string" ? value.commitSha : null,
              sourceCommitSha: typeof value.sourceCommitSha === "string" ? value.sourceCommitSha : null,
              deploymentId: typeof value.deploymentId === "string" ? value.deploymentId : null,
              buildTimestamp: typeof value.buildTimestamp === "string" ? value.buildTimestamp : null,
              assets: Array.isArray(value.assets)
                ? value.assets.filter((asset): asset is { file: string; hash: string } => (
                    Boolean(asset) &&
                    typeof asset === "object" &&
                    typeof (asset as { file?: unknown }).file === "string" &&
                    typeof (asset as { hash?: unknown }).hash === "string"
                  ))
                : [],
            };
          }
        }
      } catch {
        // Capture remains useful when the optional release endpoint is unavailable.
      }

      return createSanitizedReturnDiscrepancyRecord({
        project: {
          kind: project.kind,
          name: project.name,
          location: project.location,
          capacityMW: capacityBinding.modelInput.capacityMW as number,
          description: project.description,
        },
        originatingCompany,
        selectedProjectContext,
        scenarioClassifications: Object.fromEntries(
          Object.entries(effectiveEvidence).map(([id, item]) => [id, item.classification]),
        ),
        savedScenarioCount: scenarios.length,
        evidence: effectiveEvidence,
        modelEvidence: effectiveModelEvidence,
        metrics,
        financialScenarios,
        financialInputState: {
          basis: financialInputState.basis,
          providerStatus: financialInputState.providerStatus,
          electricityRate: financialInputState.electricityRate,
          electricityPeriod: financialInputState.electricityPeriod,
          sourceUpdatedAt: financialInputState.sourceUpdatedAt,
        },
        sourceStates,
        eiaData,
        ercotQueue,
        storage: getReturnCaptureStorageSnapshot(),
        releaseIdentity,
      });
    };

    window.__safelocCaptureReturnDiscrepancyState = capture;
    return () => {
      if (window.__safelocCaptureReturnDiscrepancyState === capture) {
        delete window.__safelocCaptureReturnDiscrepancyState;
      }
    };
  }, [
    eiaData,
    effectiveEvidence,
    effectiveModelEvidence,
    ercotQueue,
    financialInputState,
    financialScenarios,
    capacityBinding,
    metrics,
    originatingCompany,
    project,
    scenarios.length,
    selectedProjectContext,
    sourceStates,
  ]);

  const communityUnresolvedCount = countUnresolvedCommunityTerms(communityReview.terms);
  const persistCapacityReview = useCallback((nextReview: CapacityReviewState) => {
    capacityReviewRef.current = nextReview;
    setCapacityReview(nextReview);
    const currentState = stateRef.current;
    writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
      currentState.evidence,
      currentState.hasChangedClassification,
      currentState.modelEvidence,
      originatingCompany,
      selectedProjectContextRef.current,
      customResearchSnapshot(project, currentState),
      createCanonicalReviewSnapshot(project, currentState),
      nextReview,
    ));
  }, [originatingCompany, project]);
  const acceptCapacityClaim = useCallback(() => {
    if (project.kind !== "custom" || !capacityClaimCandidate) return false;
    const current = capacityReviewRef.current;
    const reviewedAt = new Date().toISOString();
    const nextReview = reviewCapacityClaim(
      current,
      capacityProjectKey(project),
      capacityClaimCandidate,
      "accepted",
      reviewedAt,
    );
    logSessionAction("Capacity claim accepted", capacityClaimCandidate.findingId);
    persistCapacityReview(nextReview);
    return true;
  }, [capacityClaimCandidate, persistCapacityReview, project]);
  const rejectCapacityClaim = useCallback(() => {
    if (project.kind !== "custom" || !capacityClaimCandidate) return false;
    const current = capacityReviewRef.current;
    const reviewedAt = new Date().toISOString();
    const nextReview = reviewCapacityClaim(
      current,
      capacityProjectKey(project),
      capacityClaimCandidate,
      "rejected",
      reviewedAt,
    );
    logSessionAction("Capacity claim rejected", capacityClaimCandidate.findingId);
    persistCapacityReview(nextReview);
    return true;
  }, [capacityClaimCandidate, persistCapacityReview, project]);
  const setIllustrativeCapacityMW = useCallback((valueOrNull: number | null) => {
    if (
      project.kind !== "custom" ||
      (valueOrNull !== null && (!Number.isFinite(valueOrNull) || valueOrNull <= 0 || valueOrNull > CAPACITY_MW_MAX))
    ) return false;
    const current = capacityReviewRef.current;
    const reviewedAt = new Date().toISOString();
    const nextReview = reviewIllustrativeCapacity(
      current,
      capacityProjectKey(project),
      valueOrNull,
      reviewedAt,
    );
    logSessionAction(valueOrNull === null ? "Illustrative capacity cleared" : "Illustrative capacity set", project.name);
    persistCapacityReview(nextReview);
    return true;
  }, [persistCapacityReview, project]);

  return (
    <DiligenceContext.Provider value={{ evidence: effectiveEvidence, researchEvidence: project.kind === "custom" ? state.evidence : effectiveEvidence, hasChangedClassification: state.hasChangedClassification, updateClassification, applyEvidenceCorrection, applyResearchProposalOverride, financialSessionScope: activeFinancialSessionHistory.scope, setFinancialSessionScope, financialSessionHistory: activeFinancialSessionHistory, financialSessionIgnoredReasons: sessionFinancialTransmission.ignoredReasons, previewSessionFinancialFinding, reviewSessionFinancialFinding, persistResearchReview, clearLastChange, metrics, financialInputState, financialScenarios, financialModeling, resetToDefault, setOriginatingCompany, setProjectSelection, loadCustomProject, loadCanonicalDossier, project, originatingCompany, selectedProjectContext, sessionRestored, sessionMigrated, scenarios, saveScenario, renameScenario, removeScenario, sourceStates, ercotQueue, eiaData, eiaLoading, downloadReturnDiscrepancyRecord, communityReview, communityUnresolvedCount, reviewCommunityTerm, capacityClaimCandidate, acceptCapacityClaim, rejectCapacityClaim, illustrativeCapacityMW, setIllustrativeCapacityMW, capacityBinding, capacityExplanation: capacityBinding.explanation, capacityDecisionTrail: matchingCapacityReview?.trail ?? [] }}>
      {children}
    </DiligenceContext.Provider>
  );
}

export function useDiligence() {
  const context = useContext(DiligenceContext);
  if (context === undefined) {
    throw new Error('useDiligence must be used within a DiligenceProvider');
  }
  return context;
}

export type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  classifications: Record<string, Classification>;
  metrics: ScenarioMetrics;
  basis:
    | {
        status: "known";
        scenarioId: "synthetic-current";
        evidenceBasis: "current";
        electricityBasis: "synthetic";
        modelContractVersion: number;
        modelFingerprint: string;
        rawElectricityRate: number;
        appliedElectricityRate: number;
        rawElectricityEscalationPercent: number;
        appliedElectricityEscalationPercent: number;
      }
    | {
        status: "legacy-unknown";
        scenarioId: null;
        evidenceBasis: "unknown";
        electricityBasis: "unknown";
        modelContractVersion: null;
        modelFingerprint: null;
      };
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export type SaveScenarioResult =
  | { ok: true; scenario: SavedScenario }
  | { ok: false; reason: 'empty-name' | 'duplicate-name' | 'capacity' | 'custom-project' | 'not-modeled' };

export type RenameScenarioResult =
  | { ok: true; scenario: SavedScenario }
  | { ok: false; reason: 'empty-name' | 'duplicate-name' | 'not-found' };
function cloneEvidence(source: Record<string, EvidenceItem>) {
  return Object.fromEntries(
    Object.entries(source).map(([id, item]) => [id, { ...item }]),
  ) as Record<string, EvidenceItem>;
}

export function buildDossierModelEvidence(
  dossierEvidence: Record<string, EvidenceItem>,
  overrides: Record<string, Classification> = {},
): Record<string, EvidenceItem> {
  const modelEvidence = cloneEvidence(INITIAL_EVIDENCE);
  for (const [id, dossierItem] of Object.entries(dossierEvidence)) {
    const existing = modelEvidence[id];
    if (!existing) continue;
    modelEvidence[id] = {
      ...existing,
      classification: overrides[id] ?? dossierItem.classification,
      baselineClassification: dossierItem.classification,
      sessionOverride: (overrides[id] ?? dossierItem.classification) !== dossierItem.classification,
      citation: dossierItem.citation,
      description: dossierItem.description,
      sourceUrl: dossierItem.sourceUrl,
      sourceTitle: dossierItem.sourceTitle,
      sourcePublisher: dossierItem.sourcePublisher,
      sourcePublishedAt: dossierItem.sourcePublishedAt,
      sourceAccessedAt: dossierItem.sourceAccessedAt,
      sourceAccessStatus: dossierItem.sourceAccessStatus,
      sourceRole: dossierItem.sourceRole,
      sources: dossierItem.sources,
      coverageStatus: dossierItem.coverageStatus,
      conflictSummary: dossierItem.conflictSummary,
      classificationReason: dossierItem.classificationReason,
      sourceRelevanceNote: dossierItem.sourceRelevanceNote,
      sourceRelevance: dossierItem.sourceRelevance,
      origin: "dossier",
    };
  }
  for (const [id, item] of Object.entries(modelEvidence)) {
    if (item.origin !== "dossier") modelEvidence[id] = { ...item, origin: "synthetic-default" };
  }
  return modelEvidence;
}

export function containCustomModelEvidence(
  evidence: Record<string, EvidenceItem>,
): Record<string, EvidenceItem> {
  const disabledEvidence = Object.fromEntries(
    Object.entries(evidence).map(([id, item]) => [
      id,
      {
        ...item,
        acceptedForModel: false,
        eligibleForModel: false,
        researchState: "retrieved-lead" as const,
      },
    ]),
  ) as Record<string, EvidenceItem>;
  return containEvidenceForModel(disabledEvidence as EvidenceRecord).evidence as Record<string, EvidenceItem>;
}

function withDossierReviewState(
  baseline: Record<string, EvidenceItem>,
  overrides: Record<string, Classification> = {},
  reviewMetadata: Record<string, EvidenceReview> = {},
): Record<string, EvidenceItem> {
  const evidence = cloneEvidence(baseline);
  for (const [id, item] of Object.entries(evidence)) {
    const baselineClassification = baseline[id].classification;
    const classification = overrides[id] ?? baselineClassification;
    evidence[id] = {
      ...item,
      classification,
      baselineClassification,
      sessionOverride: classification !== baselineClassification,
      ...(reviewMetadata[id] ? { review: reviewMetadata[id] } : { review: undefined }),
    };
  }
  return evidence;
}

function createCanonicalReviewSnapshot(
  project: ProjectContext,
  state: {
    evidence: Record<string, EvidenceItem>;
    canonicalBaseline: Record<string, EvidenceItem> | null;
  },
): PersistedCanonicalReview | undefined {
  const baselineEvidence = state.canonicalBaseline;
  const dossier = project.canonicalDossier;
  if (!dossier || !baselineEvidence) return undefined;
  const overrides = Object.fromEntries(
    Object.entries(state.evidence)
      .filter(([id, item]) => item.classification !== baselineEvidence[id]?.classification)
      .map(([id, item]) => [id, item.classification]),
  );
  return {
    slug: dossier.slug,
    project: {
      kind: "curated",
      name: project.name,
      location: project.location,
      description: project.description,
      capacityMW: project.capacityMW ?? null,
      canonicalDossier: dossier,
    },
    baselineEvidence: cloneEvidence(baselineEvidence),
    overrides,
    reviewMetadata: getReviewMetadata(state.evidence),
  };
}

function customResearchSnapshot(
  project: ProjectContext,
  state: { evidence: Record<string, EvidenceItem>; modelEvidence: Record<string, EvidenceItem> },
): PersistedCustomResearch | undefined {
  if (project.kind !== "custom") return undefined;
  return {
    project,
    evidence: state.evidence,
    modelEvidence: state.modelEvidence,
    researchProposals: project.researchProposals ?? {},
    researchProposalDispositions: project.researchProposalDispositions ?? {},
    researchProposalOverrides: project.researchProposalOverrides ?? {},
  };
}

function loadScenarios(): SavedScenario[] {
  const raw = readStorage(SCENARIOS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const collection =
      Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && 'scenarios' in parsed
          ? (parsed as { scenarios?: unknown }).scenarios
          : null;
    if (!Array.isArray(collection)) return [];
    const valid: SavedScenario[] = [];
    for (const candidate of collection) {
      if (isScenario(candidate) && !valid.some((scenario) => scenario.id === candidate.id || scenario.name.toLowerCase() === candidate.name.trim().toLowerCase())) {
        valid.push({
          ...candidate,
          name: candidate.name.trim(),
          classifications: { ...candidate.classifications },
          metrics: { ...candidate.metrics },
          basis: candidate.basis ?? {
            status: "legacy-unknown",
            scenarioId: null,
            evidenceBasis: "unknown",
            electricityBasis: "unknown",
            modelContractVersion: null,
            modelFingerprint: null,
          },
        });
      }
      if (valid.length === 5) break;
    }
    return valid;
  } catch {
    return [];
  }
}

function clearStorage(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

function retireLegacyAgentRunStorage() {
  clearStorage(LEGACY_AGENT_RUN_STORAGE_KEY);
}

function writeCommunityReview(review: CommunityReviewState, project: CommunityProjectInput) {
  writeStorage(COMMUNITY_REVIEW_STORAGE_KEY, {
    version: 2,
    projectName: project.name,
    projectLocation: project.location,
    review,
  });
}

function loadCommunityReview(project: CommunityProjectInput): CommunityReviewState {
  const fallback = createCommunityReview(project);
  const raw = readStorage(COMMUNITY_REVIEW_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const stored = parsed as {
      version?: unknown;
      projectName?: unknown;
      projectLocation?: unknown;
      review?: unknown;
    };
    if (
      ![1, 2].includes(stored.version as number) ||
      stored.projectName !== project.name ||
      stored.projectLocation !== project.location ||
      !stored.review ||
      typeof stored.review !== "object" ||
      Array.isArray(stored.review)
    ) return fallback;
    const review = stored.review as Partial<CommunityReviewState>;
    if (![1, 2].includes(review.version as number) || !review.relationship || !review.terms || typeof review.terms !== "object") return fallback;
    const terms = { ...fallback.terms };
    for (const definition of COMMUNITY_TERM_DEFINITIONS) {
      const candidate = (review.terms as Record<string, unknown>)[definition.id];
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const item = candidate as Partial<CommunityTermDecision>;
      if (
        item.id === definition.id &&
        ["Present", "Partial", "Absent", "Unknown", "Not applicable"].includes(item.conclusion ?? "") &&
        ["Verified Evidence", "Management Assertion", "Model Inference", "Missing Evidence", "Not applicable"].includes(item.classification ?? "") &&
        ["unreviewed", "accepted", "overridden", "unresolved"].includes(item.humanStatus ?? "")
      ) {
        terms[definition.id] = {
          ...fallback.terms[definition.id],
          ...item,
          treatment: definition.treatment,
        } as CommunityTermDecision;
      }
    }
    return {
      version: 2,
      relationship: fallback.relationship,
      terms,
      lastAction: review.lastAction,
    };
  } catch {
    return fallback;
  }
}

function isClassification(value: unknown): value is Classification {
  return typeof value === 'string' && VALID_CLASSIFICATIONS.includes(value as Classification);
}

function isEvidenceReviewKind(value: unknown): value is EvidenceReviewKind {
  return value === "manual" || value === "ai-accepted" || value === "ai-overridden";
}
function isScenario(value: unknown): value is SavedScenario {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as Partial<SavedScenario>;
  const classifications = scenario.classifications;
  if (
    typeof scenario.id !== 'string' ||
    typeof scenario.name !== 'string' ||
    !scenario.name.trim() ||
    typeof scenario.savedAt !== 'string' ||
    !classifications ||
    typeof classifications !== 'object' ||
    Array.isArray(classifications) ||
    !isScenarioMetrics(scenario.metrics)
  ) {
    return false;
  }
  const expectedIds = Object.keys(INITIAL_EVIDENCE);
  return (
    Object.keys(classifications).length === expectedIds.length &&
    expectedIds.every((id) => isClassification(classifications[id]))
  );
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional. A private browsing quota or disabled storage must not break diligence.
  }
}

function readSessionFinancialHistory(projectKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FINANCIAL_REVIEW_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return restoreSessionFinancialHistory(JSON.parse(raw) as unknown, projectKey);
  } catch {
    return null;
  }
}

function writeSessionFinancialHistory(history: ReturnType<typeof emptySessionFinancialHistory>, required = false) {
  if (typeof window === "undefined") {
    if (required) throw new Error("Session storage is unavailable; no financial decision was applied.");
    return;
  }
  try {
    window.sessionStorage.setItem(FINANCIAL_REVIEW_SESSION_STORAGE_KEY, JSON.stringify(history));
  } catch {
    if (required) throw new Error("Could not save this tab's financial decision; nothing was applied.");
  }
}

export const SCENARIOS_STORAGE_KEY = 'safeloc:diligence:scenarios:v1';

const SESSION_STORAGE_VERSION = 2;
const SCENARIOS_STORAGE_VERSION = 2;

type SessionPayload = {
  version: number;
  canonicalProvenanceVersion: number;
  hasChangedClassification: boolean;
  classifications: Record<string, Classification>;
  overrides: Record<string, Classification>;
  reviewMetadata: Record<string, EvidenceReview>;
  modelEvidence?: Record<string, EvidenceItem>;
  decisionHistory?: DecisionHistoryEntry[];
  originatingCompany?: CompanyKey | null;
  selectedProjectContext?: ProjectSelectionContext | null;
  customResearch?: PersistedCustomResearch;
  canonicalReview?: PersistedCanonicalReview;
  capacityReview?: CapacityReviewState | null;
};

type PersistedCustomResearch = {
  project: ProjectContext;
  evidence: Record<string, EvidenceItem>;
  modelEvidence: Record<string, EvidenceItem>;
  researchProposals: Record<string, CustomEvidenceRecord>;
  researchProposalDispositions: Record<string, ResearchProposalDisposition>;
  researchProposalOverrides: Record<string, ResearchProposalOverride>;
};

function createSessionPayload(
  evidence: Record<string, EvidenceItem>,
  hasChangedClassification: boolean,
  modelEvidence: Record<string, EvidenceItem> = evidence,
  originatingCompany: CompanyKey | null = null,
  selectedProjectContext: ProjectSelectionContext | null = null,
  customResearch?: PersistedCustomResearch,
  canonicalReview?: PersistedCanonicalReview,
  capacityReview?: CapacityReviewState | null,
): SessionPayload {
  return {
    version: SESSION_STORAGE_VERSION,
    canonicalProvenanceVersion: CURRENT_PROVENANCE_VERSION,
    hasChangedClassification,
    classifications: Object.fromEntries(
      Object.entries(evidence).map(([id, item]) => [id, item.classification]),
    ),
    overrides: getClassificationOverrides(evidence),
    reviewMetadata: getReviewMetadata(evidence),
    modelEvidence,
    decisionHistory: getDecisionHistory(),
    originatingCompany,
    selectedProjectContext,
    ...(customResearch ? { customResearch } : {}),
    ...(canonicalReview ? { canonicalReview } : {}),
    ...(capacityReview ? { capacityReview } : {}),
  };
}

function parseOriginatingCompany(value: unknown): CompanyKey | null {
  return typeof value === "string" && COMPANY_PROFILES.some((profile) => profile.key === value)
    ? value as CompanyKey
    : null;
}

function parseProjectSelectionContext(value: unknown): ProjectSelectionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ProjectSelectionContext>;
  const company = parseOriginatingCompany(candidate.company);
  const evidenceState = candidate.evidenceState;
  const kind = candidate.kind;
  const relationshipType = candidate.relationshipType;
  if (
    !company ||
    typeof candidate.projectId !== "string" ||
    typeof candidate.projectName !== "string" ||
    typeof candidate.operator !== "string" ||
    typeof candidate.location !== "string" ||
    typeof candidate.status !== "string" ||
    (candidate.capacityMW !== null && typeof candidate.capacityMW !== "number") ||
    !["Source-backed", "Discovery match", "Research required"].includes(evidenceState as string) ||
    !["curated", "directory"].includes(kind as string) ||
    !COMPANY_CONNECTION_TYPES.includes(relationshipType as typeof COMPANY_CONNECTION_TYPES[number]) ||
    (candidate.sourceUrl !== null && typeof candidate.sourceUrl !== "string") ||
    (candidate.providerId !== null && typeof candidate.providerId !== "string")
  ) return null;
  return {
    company,
    projectId: candidate.projectId,
    projectName: candidate.projectName,
    operator: candidate.operator,
    location: candidate.location,
    capacityMW: candidate.capacityMW ?? null,
    status: candidate.status,
    relationshipType: relationshipType as typeof COMPANY_CONNECTION_TYPES[number],
    evidenceState: evidenceState as ProjectSelectionContext["evidenceState"],
    kind: kind as ProjectSelectionContext["kind"],
    sourceUrl: candidate.sourceUrl ?? null,
    providerId: candidate.providerId ?? null,
  };
}

function parseDecisionHistory(value: unknown): DecisionHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set(Object.keys(INITIAL_EVIDENCE));
  return value.filter((entry): entry is DecisionHistoryEntry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const candidate = entry as Partial<DecisionHistoryEntry>;
    if (!candidate.itemId || !ids.has(candidate.itemId) || typeof candidate.recordedAt !== "string") return false;
    if (!Number.isFinite(new Date(candidate.recordedAt).getTime())) return false;
    if (candidate.kind === "ai") {
      return isClassification(candidate.proposedClassification) &&
        isClassification(candidate.resultingClassification) &&
        (candidate.decision === "accepted" || candidate.decision === "overridden") &&
        typeof candidate.reasoning === "string";
    }
    return candidate.kind === "manual" &&
      isClassification(candidate.previousClassification) &&
      isClassification(candidate.resultingClassification);
  });
}

function parsePersistedModelEvidence(value: unknown, evidence: Record<string, EvidenceItem>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return evidence;
  const records = value as Record<string, unknown>;
  const ids = Object.keys(INITIAL_EVIDENCE);
  if (ids.some((id) => !records[id] || typeof records[id] !== "object" || Array.isArray(records[id]))) return evidence;
  const merged = Object.fromEntries(ids.map((id) => [
    id,
    { ...evidence[id], ...(records[id] as Partial<EvidenceItem>), classification: evidence[id].classification },
  ])) as Record<string, EvidenceItem>;
  return containEvidenceForModel(merged as EvidenceRecord).evidence as Record<string, EvidenceItem>;
}

function getReviewMetadata(
  evidence: Record<string, EvidenceItem>,
): Record<string, EvidenceReview> {
  return Object.fromEntries(
    Object.entries(evidence)
      .filter(([, item]) => item.review && isEvidenceReview(item.review))
      .map(([id, item]) => [id, item.review as EvidenceReview]),
  );
}
function getClassificationOverrides(
  evidence: Record<string, EvidenceItem>,
): Record<string, Classification> {
  return Object.fromEntries(
    Object.entries(evidence)
      .filter(([id, item]) => item.classification !== INITIAL_EVIDENCE[id]?.classification)
      .map(([id, item]) => [id, item.classification]),
  );
}

function parseClassificationOverrides(value: unknown): Record<string, Classification> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const overrides = value as Record<string, unknown>;
  const expectedIds = Object.keys(INITIAL_EVIDENCE);
  if (Object.keys(overrides).some((id) => !expectedIds.includes(id))) return null;
  if (Object.values(overrides).some((classification) => !isClassification(classification))) return null;
  return overrides as Record<string, Classification>;
}

function parseCanonicalReview(value: unknown): PersistedCanonicalReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.slug !== "string" || !candidate.slug.trim()) return null;
  if (!candidate.baselineEvidence || typeof candidate.baselineEvidence !== "object" || Array.isArray(candidate.baselineEvidence)) return null;
  const rawBaseline = candidate.baselineEvidence as Record<string, unknown>;
  const baselineEntries = Object.entries(rawBaseline);
  if (
    baselineEntries.length === 0 ||
    baselineEntries.some(([id, item]) => (
      !Object.prototype.hasOwnProperty.call(INITIAL_EVIDENCE, id) ||
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !isClassification((item as Partial<EvidenceItem>).classification) ||
      (typeof (item as Partial<EvidenceItem>).value !== "string" && typeof (item as Partial<EvidenceItem>).value !== "number") ||
      typeof (item as Partial<EvidenceItem>).unit !== "string"
    ))
  ) return null;
  const baselineEvidence = Object.fromEntries(
    baselineEntries.map(([id, item]) => [id, {
      ...(item as EvidenceItem),
      origin: "dossier" as const,
      baselineClassification: (item as EvidenceItem).classification,
      sessionOverride: false,
    }]),
  ) as Record<string, EvidenceItem>;
  const rawOverrides = parseClassificationOverrides(candidate.overrides ?? {});
  if (!rawOverrides || Object.keys(rawOverrides).some((id) => !baselineEvidence[id])) return null;
  const reviewMetadata = parseReviewMetadata(candidate.reviewMetadata ?? {});
  let project: PersistedCanonicalReview["project"];
  if (candidate.project && typeof candidate.project === "object" && !Array.isArray(candidate.project)) {
    const projectRecord = candidate.project as Record<string, unknown>;
    const rawDossier = projectRecord.canonicalDossier;
    if (
      projectRecord.kind !== "curated" ||
      typeof projectRecord.name !== "string" ||
      typeof projectRecord.location !== "string" ||
      typeof projectRecord.description !== "string" ||
      (projectRecord.capacityMW !== null &&
        (typeof projectRecord.capacityMW !== "number" || !Number.isFinite(projectRecord.capacityMW))) ||
      !rawDossier ||
      typeof rawDossier !== "object" ||
      Array.isArray(rawDossier)
    ) return null;
    const dossier = rawDossier as Record<string, unknown>;
    if (
      dossier.slug !== candidate.slug ||
      typeof dossier.name !== "string" ||
      typeof dossier.version !== "string" ||
      typeof dossier.coverageState !== "string" ||
      (dossier.asOfDate !== null && typeof dossier.asOfDate !== "string") ||
      !dossier.canonicalData ||
      typeof dossier.canonicalData !== "object" ||
      Array.isArray(dossier.canonicalData)
    ) return null;
    project = {
      kind: "curated",
      name: projectRecord.name,
      location: projectRecord.location,
      description: projectRecord.description,
      capacityMW: projectRecord.capacityMW as number | null,
      canonicalDossier: dossier as unknown as CanonicalDossierSummary,
    };
  }
  return {
    slug: candidate.slug,
    project,
    baselineEvidence,
    overrides: rawOverrides,
    reviewMetadata: Object.fromEntries(
      Object.entries(reviewMetadata).filter(([id]) => Boolean(baselineEvidence[id])),
    ),
  };
}

function parseCapacityScope(value: unknown): CapacityScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "campus") {
    return typeof candidate.campusId === "string" && candidate.campusId.length
      ? { kind: "campus", campusId: candidate.campusId }
      : { kind: "campus" };
  }
  if (candidate.kind === "phase" && typeof candidate.phaseId === "string" && Number.isInteger(candidate.buildingCount) && Number(candidate.buildingCount) > 0) {
    return { kind: "phase", phaseId: candidate.phaseId, buildingCount: Number(candidate.buildingCount) };
  }
  if (candidate.kind === "building" && typeof candidate.buildingId === "string" && candidate.buildingId.length) {
    return { kind: "building", buildingId: candidate.buildingId };
  }
  return null;
}

function parseCapacityClaim(value: unknown): CapacityClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const scope = parseCapacityScope(candidate.scope);
  if (
    !isFiniteNumber(candidate.value) ||
    !["kW", "MW", "GW"].includes(String(candidate.unit)) ||
    !["it-capacity", "utility-interconnection"].includes(String(candidate.powerMeasure)) ||
    !scope ||
    !["current", "superseded", "withdrawn"].includes(String(candidate.status)) ||
    typeof candidate.sourceTitle !== "string" ||
    typeof candidate.sourceUrl !== "string" ||
    typeof candidate.sourceDate !== "string" ||
    typeof candidate.humanAccepted !== "boolean"
  ) return null;
  return {
    value: candidate.value,
    unit: candidate.unit as CapacityClaim["unit"],
    powerMeasure: candidate.powerMeasure as CapacityClaim["powerMeasure"],
    scope,
    status: candidate.status as CapacityClaim["status"],
    sourceTitle: candidate.sourceTitle,
    sourceUrl: candidate.sourceUrl,
    sourceDate: candidate.sourceDate,
    humanAccepted: candidate.humanAccepted,
  };
}

function parseCapacityReview(value: unknown): CapacityReviewState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.projectKey !== "string" ||
    !candidate.projectKey ||
    (candidate.decision !== null && candidate.decision !== "accepted" && candidate.decision !== "rejected") ||
      (candidate.illustrativeCapacityMW !== null &&
      (!isFiniteNumber(candidate.illustrativeCapacityMW) || candidate.illustrativeCapacityMW <= 0 || candidate.illustrativeCapacityMW > CAPACITY_MW_MAX)) ||
    (candidate.acceptedFindingId !== null && typeof candidate.acceptedFindingId !== "string") ||
    !Array.isArray(candidate.trail)
  ) return null;
  const acceptedClaim = candidate.acceptedClaim === null ? null : parseCapacityClaim(candidate.acceptedClaim);
  if (candidate.acceptedClaim !== null && (!acceptedClaim || !acceptedClaim.humanAccepted)) return null;
  const trail = candidate.trail.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (
      !["accepted", "rejected", "illustrative-set", "illustrative-cleared"].includes(String(entry.action)) ||
      (entry.findingId !== null && typeof entry.findingId !== "string") ||
      typeof entry.recordedAt !== "string" ||
      !Number.isFinite(new Date(entry.recordedAt).getTime())
    ) return [];
    return [{
      action: entry.action as CapacityReviewTrailEntry["action"],
      findingId: entry.findingId as string | null,
      recordedAt: entry.recordedAt,
    }];
  });
  return {
    projectKey: candidate.projectKey,
    decision: candidate.decision as CapacityReviewState["decision"],
    acceptedFindingId: candidate.acceptedFindingId as string | null,
    acceptedClaim,
    illustrativeCapacityMW: candidate.illustrativeCapacityMW as number | null,
    trail,
  };
}

function applyClassificationOverrides(
  overrides: Record<string, Classification>,
): Record<string, EvidenceItem> {
  const evidence = cloneEvidence(INITIAL_EVIDENCE);
  for (const [id, classification] of Object.entries(overrides)) {
    evidence[id] = { ...evidence[id], classification };
  }
  return evidence;
}

function parsePersistedCustomResearch(value: unknown): PersistedCustomResearch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const project = candidate.project;
  if (!project || typeof project !== "object" || Array.isArray(project)) return null;
  const projectRecord = project as Record<string, unknown>;
  if (
    projectRecord.kind !== "custom" ||
    typeof projectRecord.name !== "string" ||
    typeof projectRecord.location !== "string" ||
    typeof projectRecord.description !== "string" ||
    (typeof projectRecord.capacityMW !== "number" && projectRecord.capacityMW !== null) ||
    (typeof projectRecord.capacityMW === "number" && !Number.isFinite(projectRecord.capacityMW))
  ) return null;
  const parseEvidenceMap = (input: unknown, exact: boolean) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const records = input as Record<string, unknown>;
    const ids = Object.keys(records);
    if ((exact && ids.length !== CUSTOM_EVIDENCE_IDS.length) || ids.some((id) => !CUSTOM_EVIDENCE_IDS.includes(id as typeof CUSTOM_EVIDENCE_IDS[number]))) return null;
    if (exact && CUSTOM_EVIDENCE_IDS.some((id) => !records[id] || typeof records[id] !== "object" || Array.isArray(records[id]))) return null;
    return Object.fromEntries(Object.entries(records).filter(([, item]) => item && typeof item === "object" && !Array.isArray(item))) as Record<string, any>;
  };
  const evidence = parseEvidenceMap(candidate.evidence, true);
  const modelEvidence = parseEvidenceMap(candidate.modelEvidence, true);
  const researchProposals = parseEvidenceMap(candidate.researchProposals, false);
  if (!evidence || !modelEvidence || !researchProposals) return null;
  const dispositionValues: ResearchProposalDisposition[] = ["pending", "accepted", "overridden", "rejected", "unresolved"];
  const dispositions = candidate.researchProposalDispositions && typeof candidate.researchProposalDispositions === "object" && !Array.isArray(candidate.researchProposalDispositions)
    ? Object.fromEntries(Object.entries(candidate.researchProposalDispositions).filter(([id, disposition]) => CUSTOM_EVIDENCE_IDS.includes(id as typeof CUSTOM_EVIDENCE_IDS[number]) && dispositionValues.includes(disposition as ResearchProposalDisposition)))
    : {};
  const overrides = candidate.researchProposalOverrides && typeof candidate.researchProposalOverrides === "object" && !Array.isArray(candidate.researchProposalOverrides)
    ? Object.fromEntries(Object.entries(candidate.researchProposalOverrides).filter(([id, override]) => {
      if (!CUSTOM_EVIDENCE_IDS.includes(id as typeof CUSTOM_EVIDENCE_IDS[number]) || !override || typeof override !== "object" || Array.isArray(override)) return false;
      const record = override as Record<string, unknown>;
      return isClassification(record.originalClassification)
        && isClassification(record.replacementClassification)
        && typeof record.rationale === "string"
        && typeof record.reviewedAt === "string";
    }))
    : {};
  const capacityIsDirectoryReported = projectRecord.capacityProvenance === "directory-reported";
  const persistedCapacity = capacityIsDirectoryReported
    && typeof projectRecord.capacityMW === "number"
    && Number.isFinite(projectRecord.capacityMW)
    ? projectRecord.capacityMW
    : null;
  const qualityExclusionCounts = new Map<string, number>();
  const retainedFindings = Array.isArray(projectRecord.retainedFindings)
    ? projectRecord.retainedFindings.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const finding = candidate as Record<string, unknown>;
      const qualityReason = researchContentRejectionReason(finding.passage);
      if (qualityReason) {
        qualityExclusionCounts.set(qualityReason, (qualityExclusionCounts.get(qualityReason) ?? 0) + 1);
        return [];
      }
      if (
        !["source-supported", "attributed-report", "ambiguous-unresolved"].includes(String(finding.assessment))
        || !["exact-project", "ambiguous"].includes(String(finding.applicability))
        || !["eligible", "ineligible", "unresolved"].includes(String(finding.financialProposalEligibility))
        || typeof finding.passage !== "string"
        || !finding.passage.trim()
        || typeof finding.sourceTitle !== "string"
        || typeof finding.sourceUrl !== "string"
      ) return [];
      try {
        const url = new URL(finding.sourceUrl);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return [];
      } catch {
        return [];
      }
      return [{
        ...finding,
        passage: finding.passage,
      }];
    })
    : [];
  const existingRetainedAudit = projectRecord.retainedFindingAudit
    && typeof projectRecord.retainedFindingAudit === "object"
    && !Array.isArray(projectRecord.retainedFindingAudit)
    ? projectRecord.retainedFindingAudit as Record<string, unknown>
    : {};
  const mergedQualityExclusionCounts = new Map<string, number>();
  if (Array.isArray(existingRetainedAudit.qualityExclusionReasons)) {
    for (const entry of existingRetainedAudit.qualityExclusionReasons) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const reasonRecord = entry as Record<string, unknown>;
      if (
        typeof reasonRecord.reason === "string"
        && typeof reasonRecord.count === "number"
        && Number.isFinite(reasonRecord.count)
        && reasonRecord.count > 0
      ) {
        mergedQualityExclusionCounts.set(reasonRecord.reason, (mergedQualityExclusionCounts.get(reasonRecord.reason) ?? 0) + reasonRecord.count);
      }
    }
  }
  for (const [reason, count] of qualityExclusionCounts) {
    mergedQualityExclusionCounts.set(reason, (mergedQualityExclusionCounts.get(reason) ?? 0) + count);
  }
  const addedQualityExcludedCount = [...qualityExclusionCounts.values()].reduce((total, count) => total + count, 0);
  const existingQualityExcludedCount = typeof existingRetainedAudit.qualityExcludedCount === "number"
    && Number.isFinite(existingRetainedAudit.qualityExcludedCount)
    && existingRetainedAudit.qualityExcludedCount > 0
    ? existingRetainedAudit.qualityExcludedCount
    : 0;
  const retainedFindingAudit = {
    ...existingRetainedAudit,
    qualityExcludedCount: existingQualityExcludedCount + addedQualityExcludedCount,
    qualityExclusionReasons: [...mergedQualityExclusionCounts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, count]) => ({ reason, count })),
  };
  const safeProject = {
    ...projectRecord,
    description: "Generated project-summary prose is withheld. Review the accessible, attributed source passages and claim-level evidence separately.",
    capacityMW: persistedCapacity,
    capacityProvenance: persistedCapacity === null ? "unknown" : "directory-reported",
    retainedFindings,
    retainedFindingAudit,
  } as unknown as ProjectContext;
  return {
    project: safeProject,
    evidence: evidence as Record<string, EvidenceItem>,
    modelEvidence: modelEvidence as Record<string, EvidenceItem>,
    researchProposals: researchProposals as Record<string, CustomEvidenceRecord>,
    researchProposalDispositions: dispositions as Record<string, ResearchProposalDisposition>,
    researchProposalOverrides: overrides as Record<string, ResearchProposalOverride>,
  };
}

type LoadedSession = {
  evidence: Record<string, EvidenceItem>;
  modelEvidence: Record<string, EvidenceItem>;
  canonicalBaseline: Record<string, EvidenceItem> | null;
  hasChangedClassification: boolean;
  originatingCompany: CompanyKey | null;
  selectedProjectContext: ProjectSelectionContext | null;
  customResearch: PersistedCustomResearch | null;
  canonicalReview: PersistedCanonicalReview | null;
  capacityReview: CapacityReviewState | null;
  decisionHistory: DecisionHistoryEntry[];
  project: ProjectContext | null;
  restored: boolean;
  migrated: boolean;
};

function emptyLoadedSession(overrides: Partial<LoadedSession> = {}): LoadedSession {
  const evidence = cloneEvidence(INITIAL_EVIDENCE);
  return {
    evidence,
    modelEvidence: cloneEvidence(evidence),
    canonicalBaseline: null,
    hasChangedClassification: false,
    originatingCompany: null,
    selectedProjectContext: null,
    customResearch: null,
    canonicalReview: null,
    capacityReview: null,
    decisionHistory: [],
    project: null,
    restored: false,
    migrated: false,
    ...overrides,
  };
}

export function loadCurrentSession(): LoadedSession {
  const raw = readStorage(CURRENT_SESSION_STORAGE_KEY);
  if (!raw) {
    restoreDecisionHistory([]);
    return emptyLoadedSession();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const parsedRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
    const canonicalReview = parseCanonicalReview(parsedRecord?.canonicalReview);
    const capacityReview = parseCapacityReview(parsedRecord?.capacityReview);
    const decisionHistory = parseDecisionHistory(parsedRecord?.decisionHistory);
    const persistedCustomResearch = parsedRecord ? parsePersistedCustomResearch(parsedRecord.customResearch) : null;
    if (persistedCustomResearch) {
      const projectCapacityReview = capacityReview?.projectKey === capacityProjectKey(persistedCustomResearch.project)
        ? capacityReview
        : null;
      const safeModelEvidence = containCustomModelEvidence(persistedCustomResearch.modelEvidence);
      restoreDecisionHistory(decisionHistory);
      return {
        evidence: persistedCustomResearch.evidence,
        modelEvidence: safeModelEvidence,
        canonicalBaseline: null,
        hasChangedClassification: true,
        originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
        selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
        customResearch: persistedCustomResearch,
        canonicalReview: null,
        capacityReview: projectCapacityReview,
        decisionHistory,
        project: persistedCustomResearch.project,
        restored: true,
        migrated: false,
      };
    }
    if (canonicalReview?.project) {
      const evidence = withDossierReviewState(
        canonicalReview.baselineEvidence,
        canonicalReview.overrides,
        canonicalReview.reviewMetadata,
      );
      restoreDecisionHistory(decisionHistory);
      return {
        evidence,
        modelEvidence: buildDossierModelEvidence(canonicalReview.baselineEvidence, canonicalReview.overrides),
        canonicalBaseline: cloneEvidence(canonicalReview.baselineEvidence),
        hasChangedClassification: Object.keys(canonicalReview.overrides).length > 0,
        originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
        selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
        customResearch: null,
        canonicalReview,
        capacityReview: null,
        decisionHistory,
        project: canonicalReview.project,
        restored: true,
        migrated: false,
      };
    }
    const classifications =
      parsed && typeof parsed === 'object' && 'classifications' in parsed
        ? (parsed as { classifications?: unknown }).classifications
        : parsed;
    if (!classifications || typeof classifications !== 'object' || Array.isArray(classifications)) {
      restoreDecisionHistory(decisionHistory);
      return emptyLoadedSession({
        canonicalReview,
        capacityReview: null,
        decisionHistory,
        originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
        selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
        restored: Boolean(canonicalReview),
      });
    }

    const entries = Object.entries(classifications);
    const expectedIds = Object.keys(INITIAL_EVIDENCE);
    if (
      entries.length !== expectedIds.length ||
      expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(classifications, id)) ||
      entries.some(([, value]) => !isClassification(value))
    ) {
      restoreDecisionHistory(decisionHistory);
      return emptyLoadedSession({
        canonicalReview,
        capacityReview: null,
        decisionHistory,
        originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
        selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
        restored: Boolean(canonicalReview),
      });
    }

    const storedOverrides = parsedRecord ? parseClassificationOverrides(parsedRecord.overrides) : null;
    const storedReviewMetadata = parsedRecord ? parseReviewMetadata(parsedRecord.reviewMetadata) : {};
    const storedDecisionHistory = decisionHistory;
    restoreDecisionHistory(storedDecisionHistory);
    const isCurrentProvenance = parsedRecord?.canonicalProvenanceVersion === CURRENT_PROVENANCE_VERSION;
    let evidence: Record<string, EvidenceItem>;
    let migrated = false;

    if (isCurrentProvenance && storedOverrides) {
      evidence = applyClassificationOverrides(storedOverrides);
    } else if (isCurrentProvenance) {
      evidence = cloneEvidence(INITIAL_EVIDENCE);
      for (const [id, classification] of entries) {
        evidence[id] = { ...evidence[id], classification };
      }
    } else if (storedOverrides) {
      // A session written by an intermediate version already records the
      // analyst's intent explicitly; carry those overrides onto new defaults.
      evidence = applyClassificationOverrides(storedOverrides);
      migrated = true;
    } else {
      const legacyClassifications = classifications as Record<string, unknown>;
      const overrides: Record<string, Classification> = {};
      evidence = cloneEvidence(INITIAL_EVIDENCE);
      for (const [id, classification] of entries) {
        const legacyDefault = LEGACY_PROVENANCE_DEFAULTS[id] ?? INITIAL_EVIDENCE[id].classification;
        if (classification !== legacyDefault) overrides[id] = classification;
      }
      evidence = applyClassificationOverrides(overrides);
      migrated = true;
    }
    evidence = applyReviewMetadata(evidence, storedReviewMetadata);
    const modelEvidence = parsePersistedModelEvidence(parsedRecord?.modelEvidence, evidence);
    const hasChangedClassification = Boolean(
      parsedRecord?.hasChangedClassification === true ||
      Object.keys(getClassificationOverrides(evidence)).length > 0,
    );
    if (migrated) {
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
        evidence,
        hasChangedClassification,
        modelEvidence,
        parseOriginatingCompany(parsedRecord?.originatingCompany),
        parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
        undefined,
        canonicalReview ?? undefined,
        capacityReview,
      ));
    }
    return {
      evidence,
      modelEvidence,
      canonicalBaseline: null,
      hasChangedClassification,
      originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
      selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
      customResearch: null,
      canonicalReview,
      capacityReview: null,
      decisionHistory,
      project: null,
      restored: true,
      migrated,
    };
  } catch {
    restoreDecisionHistory([]);
    return emptyLoadedSession();
  }
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function applyEiaEvidence(
  evidence: Record<string, EvidenceItem>,
  eiaData: EiaElectricityData,
): Record<string, EvidenceItem> {
  if (eiaData.dataOrigin !== "provider" || !eiaData.latestPricePeriod) return evidence;
  const date = new Date(`${eiaData.latestPricePeriod}-01T00:00:00.000Z`);
  const monthYear = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const citation = `Source: U.S. EIA, ${monthYear}`;
  const next = cloneEvidence(evidence);
  next.electricity_cost = {
    ...next.electricity_cost,
    value: Number(eiaData.latestPrice.toFixed(1)),
    numericValue: eiaData.latestPrice,
    citation,
    description: "Texas industrial retail electricity price observed by the U.S. Energy Information Administration. This statewide rate is used as the current model input; it is not a Stargate contract tariff.",
    sourceId: "eia",
    providerSourceId: null,
    sourceRole: "Federal Texas industrial retail-price observation",
  };
  if (eiaData.yoyChangePercent !== null) {
    next.electricity_escalation = {
      ...next.electricity_escalation,
      value: Number(eiaData.yoyChangePercent.toFixed(1)),
      numericValue: eiaData.yoyChangePercent,
      citation,
      description: "Latest year-over-year change in the EIA Texas industrial retail electricity-price series, compared with the preceding annual window when enough history is available.",
      sourceId: "eia",
      providerSourceId: null,
      sourceRole: "Calculated from federal monthly industrial retail-price observations",
    };
  }
  return next;
}

function isScenarioMetrics(value: unknown): value is ScenarioMetrics {
  if (!value || typeof value !== 'object') return false;
  const metrics = value as Partial<ScenarioMetrics>;
  return (
    (metrics.projectIRR === null || isFiniteNumber(metrics.projectIRR)) &&
    isFiniteNumber(metrics.moic) &&
    isFiniteNumber(metrics.npv) &&
    isFiniteNumber(metrics.cashOnCash) &&
    (metrics.payback === null || isFiniteNumber(metrics.payback)) &&
    isFiniteNumber(metrics.confidence)
  );
}

export type RemoveScenarioResult =
  | { ok: true; scenario: SavedScenario }
  | { ok: false; reason: 'not-found' };

function parseReviewMetadata(value: unknown): Record<string, EvidenceReview> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = value as Record<string, unknown>;
  const expectedIds = new Set(Object.keys(INITIAL_EVIDENCE));
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([id, review]) => expectedIds.has(id) && isEvidenceReview(review))
      .map(([id, review]) => [id, review as EvidenceReview]),
  );
}

function isEvidenceReview(value: unknown): value is EvidenceReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const review = value as Partial<EvidenceReview>;
  if (!isEvidenceReviewKind(review.kind) || typeof review.reviewedAt !== 'string') return false;
  return Number.isFinite(new Date(review.reviewedAt).getTime());
}

export type EvidenceReview = {
  kind: EvidenceReviewKind;
  reviewedAt: string;
  noOp?: boolean;
};

function applyReviewMetadata(
  evidence: Record<string, EvidenceItem>,
  reviewMetadata: Record<string, EvidenceReview>,
): Record<string, EvidenceItem> {
  for (const [id, review] of Object.entries(reviewMetadata)) {
    if (evidence[id]) evidence[id] = { ...evidence[id], review };
  }
  return evidence;
}
