import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calculateCashFlowModel,
  containEvidenceForModel,
  Classification,
  EvidenceRecord,
  DEFAULT_CAPACITY_MW,
  type IRRReason,
  type IRRStatus,
  type QualitativeEvidenceValue,
} from '@/model/cashFlowEngine';
import {
  buildFinancialScenarioMatrix,
  type FinancialScenarioMatrix,
} from "@/model/financialScenarioContract";
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
} from "@/services/researchProjectService";
import type { ClaimId, PublicAccessStatus } from "@/data/claimSources";
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
import type { CanonicalDossierSummary } from "@/services/canonicalDossierService";
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
  const syntheticBaseline = matrix.scenarios["synthetic-verified"]!;
  const syntheticCurrent = matrix.scenarios["synthetic-current"]!;
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
      syntheticElectricityRate: syntheticCurrent.inputs.appliedElectricityRate,
      syntheticBaselineIRR: syntheticBaseline.returns.projectIRR,
      syntheticBaselineIRRStatus: syntheticBaseline.returns.projectIRRStatus,
      syntheticBaselineIRRReason: syntheticBaseline.returns.projectIRRReason,
      syntheticCurrentIRR: syntheticCurrent.returns.projectIRR,
      syntheticCurrentIRRStatus: syntheticCurrent.returns.projectIRRStatus,
      syntheticCurrentIRRReason: syntheticCurrent.returns.projectIRRReason,
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
    syntheticElectricityRate: syntheticCurrent.inputs.appliedElectricityRate,
    syntheticBaselineIRR: syntheticBaseline.returns.projectIRR,
    syntheticBaselineIRRStatus: syntheticBaseline.returns.projectIRRStatus,
    syntheticBaselineIRRReason: syntheticBaseline.returns.projectIRRReason,
    syntheticCurrentIRR: syntheticCurrent.returns.projectIRR,
    syntheticCurrentIRRStatus: syntheticCurrent.returns.projectIRRStatus,
    syntheticCurrentIRRReason: syntheticCurrent.returns.projectIRRReason,
    providerBaselineIRR: providerBaseline?.returns.projectIRR ?? null,
    providerBaselineIRRStatus: providerBaseline?.returns.projectIRRStatus ?? null,
    providerBaselineIRRReason: providerBaseline?.returns.projectIRRReason ?? null,
    providerOverlayIRR: providerCurrent?.returns.projectIRR ?? null,
    providerOverlayIRRStatus: providerCurrent?.returns.projectIRRStatus ?? null,
    providerOverlayIRRReason: providerCurrent?.returns.projectIRRReason ?? null,
    providerOverlayDeltaIRR: providerCurrent?.returns.projectIRR === null || providerCurrent?.returns.projectIRR === undefined || syntheticCurrent.returns.projectIRR === null
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
export type ProjectContext = Omit<CustomResearchResponse["projectSummary"], "capacityProvenance"> & {
  capacityProvenance?: CapacityProvenance;
  researchMode?: CustomResearchResponse["researchMode"];
  researchStatus?: CustomResearchResponse["researchStatus"];
  researchError?: CustomResearchResponse["researchError"];
  researchCache?: CustomResearchResponse["researchCache"];
  researchCoverage?: CustomResearchResponse["researchCoverage"];
  researchAudit?: CustomResearchResponse["researchAudit"];
  researchProposals?: Record<string, CustomEvidenceRecord>;
  researchProposalDispositions?: Record<string, ResearchProposalDisposition>;
  researchProposalOverrides?: Record<string, ResearchProposalOverride>;
  eligibleEvidenceCount?: number;
  retrievedLeadCount?: number;
  quarantineReasons?: string[];
  kind: "curated" | "custom";
  canonicalDossier?: {
    slug: string;
    version: string;
    asOfDate: string | null;
    coverageState: string;
    materiality: CanonicalDossierSummary["canonicalData"]["materiality"];
    relationships: CanonicalDossierSummary["canonicalData"]["relationships"];
    questions: string[];
    triggers: string[];
  };
};
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
  persistResearchReview: (
    proposals: Record<string, CustomEvidenceRecord>,
    dispositions: Record<string, ResearchProposalDisposition>,
    overrides: Record<string, ResearchProposalOverride>,
  ) => void;
  clearLastChange: () => void;
  metrics: FinancialMetrics;
  financialInputState: FinancialInputState;
  financialScenarios: FinancialScenarioMatrix;
  resetToDefault: (originatingCompany?: string | null) => void;
  setOriginatingCompany: (originatingCompany: CompanyKey | null) => void;
  setProjectSelection: (selection: ProjectSelectionContext | null) => void;
  loadCustomProject: (research: CustomResearchResponse, originatingCompany?: string | null, projectSelection?: ProjectSelectionContext | null) => void;
  loadCanonicalDossier: (dossier: CanonicalDossierSummary) => void;
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
};

export const CURRENT_SESSION_STORAGE_KEY = 'safeloc:diligence:current-session:v1';
export const COMMUNITY_REVIEW_STORAGE_KEY = 'safeloc:diligence:community-review:v1';
export const EVIDENCE_TIP_DISMISSED_STORAGE_KEY = 'safeloc:diligence:evidence-room-tip-dismissed:v1';
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
    { ...item, impactRole: getEvidenceImpactRole(id) },
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
  const [state, setState] = useState({
    evidence: initialSession.evidence,
    modelEvidence: initialSession.modelEvidence,
    hasChangedClassification: initialSession.hasChangedClassification,
    lastChange: null as FinancialMetrics['lastChange'],
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sessionRestored, setSessionRestored] = useState(initialSession.restored);
  const [sessionMigrated] = useState(initialSession.migrated);
  const [project, setProject] = useState<ProjectContext>({
    ...(initialSession.project ?? {
      kind: "curated" as const,
      name: "Stargate Abilene",
      location: "Taylor County, TX",
      description: "A public-source diligence case paired with clearly labeled synthetic acquisition economics.",
      capacityMW: DEFAULT_CAPACITY_MW,
    }),
  });
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
  const effectiveEvidence = useMemo(
    () => project.kind === "custom" ? state.modelEvidence : state.evidence,
    [state.evidence, state.modelEvidence, project.kind],
  );
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
  const providerModelEvidence = useMemo(
    () => project.kind === "curated" && eiaData.dataOrigin === "provider"
      ? applyEiaEvidence(state.modelEvidence, eiaData)
      : null,
    [eiaData, project.kind, state.modelEvidence],
  );
  const financialScenarios = useMemo(
    () => buildFinancialScenarioMatrix({
      syntheticEvidence: state.modelEvidence as EvidenceRecord,
      providerEvidence: providerModelEvidence as EvidenceRecord | null,
      eiaData,
      providerState,
      capacityMW: project.capacityMW,
    }),
    [eiaData, project.capacityMW, providerModelEvidence, providerState, state.modelEvidence],
  );

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
    const settledForFinancialCalculation = true;

    const previousIrr = classificationChanged && settledForFinancialCalculation
      ? calculateCashFlowModel(currentState.modelEvidence as EvidenceRecord, project.capacityMW).projectIRR
      : null;
    const nextEvidence = {
      ...currentState.evidence,
      [id]: {
        ...currentState.evidence[id],
        ...(classificationChanged ? { classification } : {}),
        review: {
          kind: reviewKind,
          reviewedAt: new Date().toISOString(),
          ...(classificationChanged ? {} : { noOp: true }),
        },
      },
    };
    const nextIrr = classificationChanged && settledForFinancialCalculation
      ? calculateCashFlowModel(
        (project.kind === "custom" ? currentState.modelEvidence : nextEvidence) as EvidenceRecord,
        project.capacityMW,
      ).projectIRR
      : null;
    const nextState = {
      evidence: nextEvidence,
      modelEvidence: project.kind === "custom" ? currentState.modelEvidence : nextEvidence,
      hasChangedClassification: classificationChanged ? true : currentState.hasChangedClassification,
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
    }
    if (project.kind === "curated") {
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
        nextEvidence,
        nextState.hasChangedClassification,
        nextState.modelEvidence,
        originatingCompany,
        selectedProjectContextRef.current,
      ));
    }
    return true;
  }, [originatingCompany, project]);

  const clearLastChange = useCallback(() => {
    const nextState = { ...stateRef.current, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

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
    ));
  }, [originatingCompany]);

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
    const nextModelEvidence = {
      ...currentState.modelEvidence,
      ...(proposal?.eligibleForModel ? { [id]: nextEvidence[id] } : {}),
    };
    const previousIrr = calculateCashFlowModel(currentState.modelEvidence as EvidenceRecord, project.capacityMW).projectIRR;
    const nextIrr = calculateCashFlowModel(nextModelEvidence as EvidenceRecord, project.capacityMW).projectIRR;
    const nextState = {
      evidence: nextEvidence,
      modelEvidence: nextModelEvidence,
      hasChangedClassification: true,
      lastChange: {
        from: previousIrr ?? 0,
        to: nextIrr ?? 0,
        delta: (nextIrr ?? 0) - (previousIrr ?? 0),
      },
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
    const nextCompany = parseOriginatingCompany(company);
    const nextState = { evidence: cloneEvidence(INITIAL_EVIDENCE), modelEvidence: cloneEvidence(INITIAL_EVIDENCE), hasChangedClassification: false, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
    setProject({
      kind: "curated",
      name: "Stargate Abilene",
      location: "Taylor County, TX",
      description: "A public-source diligence case paired with clearly labeled synthetic acquisition economics.",
      capacityMW: DEFAULT_CAPACITY_MW,
    });
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
  }, []);

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
    const containedModelEvidence = Object.fromEntries(
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
    const nextState = { evidence: customEvidence, modelEvidence: containedModelEvidence, hasChangedClassification: false, lastChange: null as FinancialMetrics["lastChange"] };
    stateRef.current = nextState;
    setState(nextState);
    const researchProposals = Object.fromEntries(
      (research.proposedInputs ?? []).map((item) => [item.id, item]),
    ) as Record<string, CustomEvidenceRecord>;
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
       eligibleEvidenceCount: research.eligibleEvidence?.length ?? 0,
       retrievedLeadCount: research.retrievedLeads?.length ?? research.evidence.filter((item) => item.researchState !== "proposed" && item.researchState !== "accepted").length,
      quarantineReasons: research.quarantineReasons ?? [],
      researchProposals,
      researchProposalDispositions,
      researchProposalOverrides: {},
    };
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
    ));
  }, []);

  const loadCanonicalDossier = useCallback((dossier: CanonicalDossierSummary) => {
    const company = parseOriginatingCompany(dossier.canonicalData.originatingCompany);
    const research = dossierToResearchResponse(dossier);
    const selection: ProjectSelectionContext | null = company ? {
      company,
      projectId: dossier.slug,
      projectName: dossier.name,
      operator: dossier.canonicalData.identity.operator,
      location: dossier.canonicalData.identity.location,
      capacityMW: dossier.canonicalData.identity.capacityMW ?? null,
      status: "Canonical dossier",
      relationshipType: dossier.canonicalData.relationshipType as ProjectSelectionContext["relationshipType"],
      evidenceState: "Source-backed",
      kind: "curated",
      sourceUrl: dossier.canonicalData.evidence[0]?.source.url ?? null,
      providerId: dossier.slug,
    } : null;
    loadCustomProject(research, company, selection);
    setProject((current) => ({
      ...current,
      canonicalDossier: {
        slug: dossier.slug,
        version: dossier.version,
        asOfDate: dossier.asOfDate,
        coverageState: dossier.coverageState,
        materiality: dossier.canonicalData.materiality,
        relationships: dossier.canonicalData.relationships,
        questions: dossier.canonicalData.questions,
        triggers: dossier.canonicalData.triggers,
      },
    }));
  }, [loadCustomProject]);

  const saveScenario = (name: string): SaveScenarioResult => {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, reason: 'empty-name' };
    if (project.kind === "custom") return { ok: false, reason: 'custom-project' };
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
    () => ({
      ...financialScenarios.scenarios["synthetic-current"]!.model,
      baseIRR: financialScenarios.scenarios["synthetic-verified"]!.returns.projectIRR,
      baseModel: financialScenarios.scenarios["synthetic-verified"]!.model,
      lastChange: state.lastChange,
    }),
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
          capacityMW: project.capacityMW,
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
    metrics,
    originatingCompany,
    project,
    scenarios.length,
    selectedProjectContext,
    sourceStates,
  ]);

  const communityUnresolvedCount = countUnresolvedCommunityTerms(communityReview.terms);

  return (
    <DiligenceContext.Provider value={{ evidence: effectiveEvidence, researchEvidence: project.kind === "custom" ? state.evidence : effectiveEvidence, hasChangedClassification: state.hasChangedClassification, updateClassification, applyEvidenceCorrection, applyResearchProposalOverride, persistResearchReview, clearLastChange, metrics, financialInputState, financialScenarios, resetToDefault, setOriginatingCompany, setProjectSelection, loadCustomProject, loadCanonicalDossier, project, originatingCompany, selectedProjectContext, sessionRestored, sessionMigrated, scenarios, saveScenario, renameScenario, removeScenario, sourceStates, ercotQueue, eiaData, eiaLoading, downloadReturnDiscrepancyRecord, communityReview, communityUnresolvedCount, reviewCommunityTerm }}>
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
  | { ok: false; reason: 'empty-name' | 'duplicate-name' | 'capacity' | 'custom-project' };

export type RenameScenarioResult =
  | { ok: true; scenario: SavedScenario }
  | { ok: false; reason: 'empty-name' | 'duplicate-name' | 'not-found' };
function cloneEvidence(source: Record<string, EvidenceItem>) {
  return Object.fromEntries(
    Object.entries(source).map(([id, item]) => [id, { ...item }]),
  ) as Record<string, EvidenceItem>;
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
    typeof projectRecord.capacityMW !== "number" ||
    !Number.isFinite(projectRecord.capacityMW)
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
  return {
    project: projectRecord as unknown as ProjectContext,
    evidence: evidence as Record<string, EvidenceItem>,
    modelEvidence: modelEvidence as Record<string, EvidenceItem>,
    researchProposals: researchProposals as Record<string, CustomEvidenceRecord>,
    researchProposalDispositions: dispositions as Record<string, ResearchProposalDisposition>,
    researchProposalOverrides: overrides as Record<string, ResearchProposalOverride>,
  };
}

function loadCurrentSession() {
  const raw = readStorage(CURRENT_SESSION_STORAGE_KEY);
  if (!raw) {
    restoreDecisionHistory([]);
    const evidence = cloneEvidence(INITIAL_EVIDENCE);
    return { evidence, modelEvidence: evidence, hasChangedClassification: false, originatingCompany: null, selectedProjectContext: null, customResearch: null, project: null, restored: false, migrated: false };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const parsedRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
    const persistedCustomResearch = parsedRecord ? parsePersistedCustomResearch(parsedRecord.customResearch) : null;
    if (persistedCustomResearch) {
      restoreDecisionHistory(parseDecisionHistory(parsedRecord?.decisionHistory));
      return {
        evidence: persistedCustomResearch.evidence,
        modelEvidence: persistedCustomResearch.modelEvidence,
        hasChangedClassification: true,
        originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
        selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
        customResearch: persistedCustomResearch,
        project: persistedCustomResearch.project,
        restored: true,
        migrated: false,
      };
    }
    const classifications =
      parsed && typeof parsed === 'object' && 'classifications' in parsed
        ? (parsed as { classifications?: unknown }).classifications
        : parsed;
    if (!classifications || typeof classifications !== 'object' || Array.isArray(classifications)) {
      const evidence = cloneEvidence(INITIAL_EVIDENCE);
      return { evidence, modelEvidence: evidence, hasChangedClassification: false, originatingCompany: null, selectedProjectContext: null, customResearch: null, project: null, restored: false, migrated: false };
    }

    const entries = Object.entries(classifications);
    const expectedIds = Object.keys(INITIAL_EVIDENCE);
    if (
      entries.length !== expectedIds.length ||
      expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(classifications, id)) ||
      entries.some(([, value]) => !isClassification(value))
    ) {
      const evidence = cloneEvidence(INITIAL_EVIDENCE);
      return { evidence, modelEvidence: evidence, hasChangedClassification: false, originatingCompany: null, selectedProjectContext: null, customResearch: null, project: null, restored: false, migrated: false };
    }

    const storedOverrides = parsedRecord ? parseClassificationOverrides(parsedRecord.overrides) : null;
    const storedReviewMetadata = parsedRecord ? parseReviewMetadata(parsedRecord.reviewMetadata) : {};
    const storedDecisionHistory = parsedRecord ? parseDecisionHistory(parsedRecord.decisionHistory) : [];
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
      ));
    }
    return {
      evidence,
      modelEvidence,
      hasChangedClassification,
      originatingCompany: parseOriginatingCompany(parsedRecord?.originatingCompany),
      selectedProjectContext: parseProjectSelectionContext(parsedRecord?.selectedProjectContext),
      customResearch: null,
      project: null,
      restored: true,
      migrated,
    };
  } catch {
    restoreDecisionHistory([]);
    const evidence = cloneEvidence(INITIAL_EVIDENCE);
    return { evidence, modelEvidence: evidence, hasChangedClassification: false, originatingCompany: null, selectedProjectContext: null, customResearch: null, project: null, restored: false, migrated: false };
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
