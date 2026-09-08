import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calculateCashFlowModel,
  containEvidenceForModel,
  Classification,
  EvidenceRecord,
  DEFAULT_CAPACITY_MW,
  type QualitativeEvidenceValue,
} from '@/model/cashFlowEngine';
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
  recordAIDecision,
  recordManualClassificationChange,
  getDecisionHistory,
  restoreDecisionHistory,
  type DecisionHistoryEntry,
} from "@/services/sessionLog";
import {
  CUSTOM_EVIDENCE_IDS,
  type ResearchCoverageStatus,
  type ResearchEvidenceSource,
  type CustomResearchResponse,
  type CustomEvidenceRecord,
  type CapacityProvenance,
} from "@/services/researchProjectService";
import type { ClaimId, PublicAccessStatus } from "@/data/claimSources";
import {
  assertEvidenceImpactRoleCoverage,
  getEvidenceImpactRole,
  type ImpactRole,
} from "@/data/evidenceImpactRoles";
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
  advanceDiligenceStage,
  applyAgentFindingDecision,
  beginDiligenceStage,
  createInitialDiligenceAgent,
  hydrateReviewPackage,
  getAgentEvidenceSnapshotKey,
  getAgentProjectKey,
  countValidatedAgentSources,
  reverseAgentChange as reverseAgentChangeState,
  retryDiligenceStage as retryDiligenceStageTransition,
  startDiligenceAgent,
  type AgentProjectInput,
  type DiligenceAgentState,
  type DiligenceStageId,
  type ReviewDecision,
} from "@/model/diligenceAgent";

export type { Classification } from '@/model/cashFlowEngine';

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
};

export type EvidenceCorrection = {
  value: string;
  claim: string;
  sourceUrl: string;
  classification: Classification;
  /** Only set by acceptance of a server-parsed research proposal, never by the reviewer form. */
  researchProposal?: CustomEvidenceRecord;
};

export type EvidenceReviewKind = "manual" | "ai-accepted" | "ai-overridden";
export type FinancialMetrics = Omit<ReturnType<typeof calculateCashFlowModel>, 'lastChange'> & {
  lastChange: { from: number; to: number; delta: number } | null;
};

export type ScenarioMetrics = {
  projectIRR: number | null;
  moic: number;
  npv: number;
  cashOnCash: number;
  payback: number | null;
  confidence: number;
};
export type ProjectContext = Omit<CustomResearchResponse["projectSummary"], "capacityProvenance"> & {
  capacityProvenance?: CapacityProvenance;
  researchMode?: CustomResearchResponse["researchMode"];
  researchCache?: CustomResearchResponse["researchCache"];
  researchCoverage?: CustomResearchResponse["researchCoverage"];
  eligibleEvidenceCount?: number;
  retrievedLeadCount?: number;
  quarantineReasons?: string[];
  kind: "curated" | "custom";
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
  clearLastChange: () => void;
  metrics: FinancialMetrics;
  resetToDefault: (originatingCompany?: string | null) => void;
  loadCustomProject: (research: CustomResearchResponse, originatingCompany?: string | null) => void;
  project: ProjectContext;
  originatingCompany: string | null;
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
  communityReview: CommunityReviewState;
  communityUnresolvedCount: number;
  reviewCommunityTerm: (
    id: CommunityTermId,
    conclusion: CommunityConclusion,
    classification: CommunityTermDecision["classification"],
    humanStatus?: CommunityHumanStatus,
    reviewerNote?: string,
  ) => boolean;
  agentRun: DiligenceAgentState;
  runDiligenceAgent: () => Promise<void>;
  retryDiligenceStage: (id: DiligenceStageId) => Promise<void>;
  reviewAgentFinding: (id: string, decision: ReviewDecision, reviewerNoteOrClassification?: string, overrideNote?: string) => boolean;
  reverseAgentChange: (auditId: string) => boolean;
};

export const CURRENT_SESSION_STORAGE_KEY = 'safeloc:diligence:current-session:v1';
export const COMMUNITY_REVIEW_STORAGE_KEY = 'safeloc:diligence:community-review:v1';
export const EVIDENCE_TIP_DISMISSED_STORAGE_KEY = 'safeloc:diligence:evidence-room-tip-dismissed:v1';
export const DILIGENCE_AGENT_STORAGE_KEY = 'safeloc:diligence:agent-run:v1';
export const CURRENT_PROVENANCE_VERSION = 2;
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
  const initialSession = useMemo(() => loadCurrentSession(), []);
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
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
    description: "A public-source diligence case paired with clearly labeled synthetic acquisition economics.",
    capacityMW: DEFAULT_CAPACITY_MW,
  });
  const [communityReview, setCommunityReview] = useState<CommunityReviewState>(() => loadCommunityReview({
    kind: "curated",
    name: "Stargate Abilene",
    location: "Taylor County, TX",
  }));
  const [originatingCompany, setOriginatingCompany] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadScenarios);
  const curatedProjectKey = getAgentProjectKey({ projectName: "Stargate Abilene", location: "Taylor County, TX", capacityMW: DEFAULT_CAPACITY_MW });
  const [agentRun, setAgentRun] = useState<DiligenceAgentState>(() => loadAgentRun(curatedProjectKey));
  const agentRunRef = useRef(agentRun);
  agentRunRef.current = agentRun;
  const agentActiveRef = useRef(false);
  const [ercotQueue, setErcotQueue] = useState<ErcotQueueResult>(FALLBACK_ERCOT_RESULT);
  const [eiaData, setEiaData] = useState<EiaElectricityData>(() => createEiaFallback());
  const [eiaLoading, setEiaLoading] = useState(true);
  const sourceStates = useMemo(() => sourceStateMap({
    "ercot-queue": ercotQueue.sourceMetadata,
    eia: eiaData.sourceMetadata,
  }), [eiaData.sourceMetadata, ercotQueue.sourceMetadata]);
  const effectiveEvidence = useMemo(
    () => project.kind === "custom" ? state.modelEvidence : applyEiaEvidence(state.evidence, eiaData),
    [state.evidence, state.modelEvidence, eiaData, project.kind],
  );
  const effectiveModelEvidence = useMemo(
    () => project.kind === "custom" ? state.modelEvidence : applyEiaEvidence(state.modelEvidence, eiaData),
    [state.modelEvidence, eiaData, project.kind],
  );

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

    const previousIrr = classificationChanged
      ? calculateCashFlowModel(
        (project.kind === "custom" ? currentState.modelEvidence : applyEiaEvidence(currentState.modelEvidence, eiaData)) as EvidenceRecord,
        project.capacityMW,
      ).projectIRR
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
    const nextIrr = classificationChanged
      ? calculateCashFlowModel(
        (project.kind === "custom" ? currentState.modelEvidence : applyEiaEvidence(nextEvidence, eiaData)) as EvidenceRecord,
        project.capacityMW,
      ).projectIRR
      : null;
    const nextState = {
      evidence: nextEvidence,
      modelEvidence: project.kind === "custom" ? currentState.modelEvidence : nextEvidence,
      hasChangedClassification: classificationChanged ? true : currentState.hasChangedClassification,
      lastChange: classificationChanged
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
      ));
    }
    return true;
  }, [eiaData, project]);

  const clearLastChange = useCallback(() => {
    const nextState = { ...stateRef.current, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

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
        review: { kind: "ai-accepted" as const, reviewedAt: new Date().toISOString() },
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

  const setPersistedAgentRun = useCallback((next: DiligenceAgentState) => {
    agentRunRef.current = next;
    setAgentRun(next);
    writeStorage(DILIGENCE_AGENT_STORAGE_KEY, next);
  }, []);

  const agentInput = useCallback((): AgentProjectInput => {
    const agentEvidence = project.kind === "custom" ? stateRef.current.modelEvidence : stateRef.current.evidence;
    return ({
    projectName: project.name,
    location: project.location,
    capacityMW: project.capacityMW,
    evidenceIds: Object.keys(agentEvidence),
    communityUnresolvedCount: countUnresolvedCommunityTerms(communityReview.terms),
    evidence: Object.values(agentEvidence).map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      classification: item.classification,
      citation: item.citation,
      sourceUrl: item.sourceUrl,
      sources: (item.sources ?? []).map((source) => ({
        sourceId: source.url,
        title: source.title,
        url: source.url,
        excerpt: source.excerpt,
        classification: source.accessStatus === "not provided" ? "source-summary" as const : "validated-source" as const,
      })),
      sourceSupportConfidence: item.sourceSupportConfidence,
      sourceRelevance: item.sourceRelevance,
    })),
    retrievedSourceCount: project.researchCoverage?.retrievedSourceCount ?? Object.values(agentEvidence).reduce((count, item) => count + (item.sources?.length ?? 0), 0),
    validatedSourceCount: project.kind === "custom"
      ? countValidatedAgentSources({ evidence: Object.values(agentEvidence).map((item) => ({
        id: item.id,
        label: item.label,
        value: item.value,
        classification: item.classification,
        citation: item.citation,
        sourceUrl: item.sourceUrl,
        sources: (item.sources ?? []).map((source) => ({
          sourceId: source.url,
          title: source.title,
          url: source.url,
          excerpt: source.excerpt,
          classification: source.accessStatus === "not provided" ? "source-summary" as const : "validated-source" as const,
        })),
      })) })
      : Object.values(agentEvidence).filter((item) => item.classification === "Verified Evidence").length,
    materialGapCount: Object.values(agentEvidence).filter((item) => ["Missing Evidence", "Model Inference", "User Assumption"].includes(item.classification)).length,
  });
  }, [communityReview.terms, project]);

  const runDiligenceAgent = useCallback(async () => {
    if (agentActiveRef.current) return;
    agentActiveRef.current = true;
    let next = startDiligenceAgent(agentRunRef.current);
    setPersistedAgentRun(next);
    try {
      for (const definition of next.stages) {
        if (definition.status === "completed") continue;
        next = beginDiligenceStage(next, definition.id);
        setPersistedAgentRun(next);
        await new Promise((resolve) => window.setTimeout(resolve, 110));
        next = advanceDiligenceStage(next, definition.id, {
          summary: `${definition.label} completed with bounded, reviewer-visible output.`,
        });
        setPersistedAgentRun(next);
      }
      next = hydrateReviewPackage(next, agentInput());
      setPersistedAgentRun(next);
      logSessionAction("Diligence agent prepared review package", project.name);
    } finally {
      agentActiveRef.current = false;
    }
  }, [agentInput, project.name, setPersistedAgentRun]);

  const retryDiligenceStage = useCallback(async (id: DiligenceStageId) => {
    if (agentActiveRef.current) return;
    const retried = retryDiligenceStageTransition(agentRunRef.current, id);
    if (retried === agentRunRef.current) return;
    agentActiveRef.current = true;
    let next = retried;
    setPersistedAgentRun(next);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 110));
      next = advanceDiligenceStage(next, id, { summary: "Retry completed with bounded, reviewer-visible output." });
      setPersistedAgentRun(next);
      for (const stage of next.stages) {
        if (stage.status !== "pending") continue;
        next = beginDiligenceStage(next, stage.id);
        setPersistedAgentRun(next);
        await new Promise((resolve) => window.setTimeout(resolve, 110));
        next = advanceDiligenceStage(next, stage.id, { summary: `${stage.label} completed after the retained retry.` });
        setPersistedAgentRun(next);
      }
      next = hydrateReviewPackage(next, agentInput());
      setPersistedAgentRun(next);
    } finally {
      agentActiveRef.current = false;
    }
  }, [agentInput, setPersistedAgentRun]);

  const reviewAgentFinding = useCallback((id: string, decision: ReviewDecision, reviewerNoteOrClassification?: string, overrideNote?: string) => {
    const current = agentRunRef.current;
    const finding = current.proposedFindings.find((item) => item.id === id);
    if (!finding) return false;
    if (finding.decision !== "pending") return false;
    const finalClassification = reviewerNoteOrClassification && isClassification(reviewerNoteOrClassification)
      ? reviewerNoteOrClassification
      : undefined;
    const reviewerNote = finalClassification ? overrideNote : reviewerNoteOrClassification;
    if (decision === "overridden" && !finalClassification) return false;
    if ((decision === "accepted" || decision === "overridden") && current.readiness === "not-ready") {
      logSessionAction("Agent proposal blocked because readiness is not established", finding.title);
      return false;
    }
    const activeInput = agentInput();
    if (
      current.projectKey !== getAgentProjectKey(activeInput) ||
      current.evidenceSnapshotKey !== getAgentEvidenceSnapshotKey(activeInput)
    ) {
      logSessionAction("Agent proposal blocked because the evidence snapshot changed", finding.title);
      return false;
    }
    if ((decision === "accepted" || decision === "overridden") && finding.affectedEvidenceId && finding.currentClassification) {
      const liveItem = stateRef.current.evidence[finding.affectedEvidenceId];
      if (!liveItem || liveItem.classification !== finding.currentClassification) {
        logSessionAction("Agent proposal blocked by changed evidence", finding.title);
        return false;
      }
    }
    const next = applyAgentFindingDecision(current, id, decision, reviewerNote, finalClassification);
    if (next === current) return false;
    let authorizedRun = next;
    if ((decision === "accepted" || decision === "overridden") && finding.consequential && finding.affectedEvidenceId && finding.proposedClassification) {
      const targetClassification = decision === "accepted" ? finding.proposedClassification : finalClassification;
      if (!targetClassification || !updateClassification(finding.affectedEvidenceId, targetClassification, "ai", decision === "accepted" ? "ai-accepted" : "ai-overridden")) return false;
      const afterEvidenceSnapshotKey = getAgentEvidenceSnapshotKey(agentInput());
      const auditId = next.auditEvents.at(-1)?.id;
      if (auditId) {
        authorizedRun = {
          ...next,
          auditEvents: next.auditEvents.map((event) => event.id === auditId ? { ...event, afterEvidenceSnapshotKey } : event),
          appliedChanges: next.appliedChanges.map((change) => change.id === auditId ? { ...change, afterEvidenceSnapshotKey } : change),
        };
      }
      recordAIDecision(
        finding.affectedEvidenceId,
        finding.proposedClassification,
        finding.reasoning,
        decision,
        targetClassification,
      );
      if (project.kind === "curated") {
        const persistedState = stateRef.current;
        writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
          persistedState.evidence,
          persistedState.hasChangedClassification,
          persistedState.modelEvidence,
        ));
      }
    }
    setPersistedAgentRun(authorizedRun);
    logSessionAction(`Agent proposal ${decision}`, finding.title);
    return true;
  }, [agentInput, setPersistedAgentRun, updateClassification]);

  const reverseAgentChange = useCallback((auditId: string) => {
    const current = agentRunRef.current;
    const applied = current.appliedChanges.find((change) => change.id === auditId && !change.reversedAt);
    if (!applied?.affectedEvidenceId || !applied.beforeClassification) return false;
    if (applied.projectKey !== getAgentProjectKey({ projectName: project.name, location: project.location, capacityMW: project.capacityMW })) {
      logSessionAction("Agent reversal blocked because the project changed", applied.proposalId);
      return false;
    }
    const currentState = stateRef.current;
    const currentItem = currentState.evidence[applied.affectedEvidenceId];
    if (!currentItem) return false;
    if (currentItem.classification !== applied.finalClassification) {
      logSessionAction("Agent reversal blocked by intervening evidence change", applied.proposalId);
      return false;
    }
    if (!applied.afterEvidenceSnapshotKey || getAgentEvidenceSnapshotKey(agentInput()) !== applied.afterEvidenceSnapshotKey) {
      logSessionAction("Agent reversal blocked by intervening value or source change", applied.proposalId);
      return false;
    }
    const previousIrr = calculateCashFlowModel((project.kind === "custom" ? currentState.modelEvidence : applyEiaEvidence(currentState.evidence, eiaData)) as EvidenceRecord, project.capacityMW).projectIRR;
    const nextEvidence = {
      ...currentState.evidence,
      [applied.affectedEvidenceId]: {
        ...currentItem,
        classification: applied.beforeClassification,
        review: { kind: "manual" as const, reviewedAt: new Date().toISOString() },
      },
    };
    const nextIrr = calculateCashFlowModel((project.kind === "custom" ? currentState.modelEvidence : applyEiaEvidence(nextEvidence, eiaData)) as EvidenceRecord, project.capacityMW).projectIRR;
    const nextState = {
      evidence: nextEvidence,
      modelEvidence: project.kind === "custom" ? currentState.modelEvidence : nextEvidence,
      hasChangedClassification: true,
      lastChange: { from: previousIrr ?? 0, to: nextIrr ?? 0, delta: (nextIrr ?? 0) - (previousIrr ?? 0) },
    };
    stateRef.current = nextState;
    setState(nextState);
    if (project.kind === "curated") {
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(
        nextEvidence,
        true,
        nextState.modelEvidence,
      ));
    }
    setPersistedAgentRun(reverseAgentChangeState(current, auditId));
    logSessionAction("Reversed agent proposal", applied.proposalId);
    return true;
  }, [agentInput, eiaData, project, setPersistedAgentRun]);

  const resetToDefault = useCallback((company: string | null = null) => {
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
    setOriginatingCompany(company);
    const nextCommunityReview = createCommunityReview({
      kind: "curated",
      name: "Stargate Abilene",
      location: "Taylor County, TX",
    });
    setCommunityReview(nextCommunityReview);
    clearStorage(COMMUNITY_REVIEW_STORAGE_KEY);
    clearStorage(CURRENT_SESSION_STORAGE_KEY);
    const nextAgentRun = createInitialDiligenceAgent();
    setAgentRun(nextAgentRun);
    agentRunRef.current = nextAgentRun;
    clearStorage(DILIGENCE_AGENT_STORAGE_KEY);
    clearDecisionHistory();
    clearSessionActions();
  }, []);

  const loadCustomProject = useCallback((research: CustomResearchResponse, company: string | null = null) => {
    const researchById = new Map(research.evidence.map((item) => [item.id, item]));
    const customEvidence = Object.fromEntries(
      CUSTOM_EVIDENCE_IDS.map((id) => {
        const item = researchById.get(id);
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
    setProject({
      kind: "custom",
      name: research.projectSummary.name,
      location: research.projectSummary.location,
      description: research.projectSummary.description,
      capacityMW: research.projectSummary.capacityMW,
      capacityProvenance: research.projectSummary.capacityProvenance,
       researchMode: research.researchMode ?? "research-incomplete",
      researchCache: research.researchCache,
      researchCoverage: research.researchCoverage,
       eligibleEvidenceCount: research.eligibleEvidence?.length ?? 0,
       retrievedLeadCount: research.retrievedLeads?.length ?? research.evidence.filter((item) => item.researchState !== "proposed" && item.researchState !== "accepted").length,
       quarantineReasons: research.quarantineReasons ?? [],
    });
    const customCommunityProject: CommunityProjectInput = {
      kind: "custom",
      name: research.projectSummary.name,
      location: research.projectSummary.location,
    };
    const nextCommunityReview = loadCommunityReview(customCommunityProject);
    setCommunityReview(nextCommunityReview);
    writeCommunityReview(nextCommunityReview, customCommunityProject);
    setOriginatingCompany(company);
    clearStorage(CURRENT_SESSION_STORAGE_KEY);
    const nextAgentRun = createInitialDiligenceAgent();
    setAgentRun(nextAgentRun);
    agentRunRef.current = nextAgentRun;
    clearStorage(DILIGENCE_AGENT_STORAGE_KEY);
    clearDecisionHistory();
  }, []);

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
        moic: metrics.moic,
        npv: metrics.npv,
        cashOnCash: metrics.cashOnCash,
        payback: metrics.payback,
        confidence: metrics.confidenceScore,
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
    () => ({ ...calculateCashFlowModel(effectiveModelEvidence as EvidenceRecord, project.capacityMW), lastChange: state.lastChange }),
    [effectiveModelEvidence, project.capacityMW, state.lastChange],
  );

  const communityUnresolvedCount = countUnresolvedCommunityTerms(communityReview.terms);

  return (
    <DiligenceContext.Provider value={{ evidence: effectiveEvidence, researchEvidence: project.kind === "custom" ? state.evidence : effectiveEvidence, hasChangedClassification: state.hasChangedClassification, updateClassification, applyEvidenceCorrection, clearLastChange, metrics, resetToDefault, loadCustomProject, project, originatingCompany, sessionRestored, sessionMigrated, scenarios, saveScenario, renameScenario, removeScenario, sourceStates, ercotQueue, eiaData, eiaLoading, communityReview, communityUnresolvedCount, reviewCommunityTerm, agentRun, runDiligenceAgent, retryDiligenceStage, reviewAgentFinding, reverseAgentChange }}>
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
        });
      }
      if (valid.length === 5) break;
    }
    return valid;
  } catch {
    return [];
  }
}

function loadAgentRun(expectedProjectKey?: string): DiligenceAgentState {
  const fallback = createInitialDiligenceAgent();
  const raw = readStorage(DILIGENCE_AGENT_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const candidate = parsed as Partial<DiligenceAgentState>;
    if (candidate.version !== 2 || !Array.isArray(candidate.stages)) return fallback;
    if (typeof candidate.projectKey !== "string" || candidate.projectKey !== expectedProjectKey) return fallback;
    const stageIds = new Set(fallback.stages.map((stage) => stage.id));
    if (candidate.stages.length !== fallback.stages.length) return fallback;
    const stages = candidate.stages.map((stage) => {
      if (!stage || typeof stage !== "object" || !stageIds.has(stage.id as DiligenceStageId)) throw new Error("invalid stage");
      const definition = fallback.stages.find((item) => item.id === stage.id);
      if (!definition || !["pending", "running", "completed", "failed", "retryable"].includes(stage.status ?? "")) throw new Error("invalid stage status");
      return { ...definition, ...stage };
    });
    if (!["idle", "running", "partial-failure", "review-ready", "failed"].includes(candidate.status ?? "")) return fallback;
    return {
      ...fallback,
      ...candidate,
      stages,
      proposedFindings: Array.isArray(candidate.proposedFindings) ? candidate.proposedFindings : [],
      relationships: Array.isArray(candidate.relationships) ? candidate.relationships : [],
      lenses: Array.isArray(candidate.lenses) ? candidate.lenses : [],
      riskAllocation: Array.isArray(candidate.riskAllocation) ? candidate.riskAllocation : [],
      capitalAtRisk: Array.isArray(candidate.capitalAtRisk) ? candidate.capitalAtRisk : [],
      conditionsPrecedent: Array.isArray(candidate.conditionsPrecedent) ? candidate.conditionsPrecedent : [],
      dealProtection: Array.isArray(candidate.dealProtection) ? candidate.dealProtection : [],
      valueAtRisk: Array.isArray(candidate.valueAtRisk) ? candidate.valueAtRisk : [],
      readiness: candidate.readiness ?? fallback.readiness,
      readinessReason: candidate.readinessReason ?? fallback.readinessReason,
      retrievedSourceCount: typeof candidate.retrievedSourceCount === "number" ? candidate.retrievedSourceCount : 0,
      validatedSourceCount: typeof candidate.validatedSourceCount === "number" ? candidate.validatedSourceCount : 0,
      auditEvents: Array.isArray(candidate.auditEvents) ? candidate.auditEvents : [],
      appliedChanges: Array.isArray(candidate.appliedChanges) ? candidate.appliedChanges : [],
      projectKey: candidate.projectKey,
      evidenceSnapshotKey: typeof candidate.evidenceSnapshotKey === "string" ? candidate.evidenceSnapshotKey : null,
    } as DiligenceAgentState;
  } catch {
    return fallback;
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
const SCENARIOS_STORAGE_VERSION = 1;

type SessionPayload = {
  version: number;
  canonicalProvenanceVersion: number;
  hasChangedClassification: boolean;
  classifications: Record<string, Classification>;
  overrides: Record<string, Classification>;
  reviewMetadata: Record<string, EvidenceReview>;
  modelEvidence?: Record<string, EvidenceItem>;
  decisionHistory?: DecisionHistoryEntry[];
};

function createSessionPayload(
  evidence: Record<string, EvidenceItem>,
  hasChangedClassification: boolean,
  modelEvidence: Record<string, EvidenceItem> = evidence,
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

function loadCurrentSession() {
  const raw = readStorage(CURRENT_SESSION_STORAGE_KEY);
  if (!raw) {
    restoreDecisionHistory([]);
    const evidence = cloneEvidence(INITIAL_EVIDENCE);
    return { evidence, modelEvidence: evidence, hasChangedClassification: false, restored: false, migrated: false };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const classifications =
      parsed && typeof parsed === 'object' && 'classifications' in parsed
        ? (parsed as { classifications?: unknown }).classifications
        : parsed;
    if (!classifications || typeof classifications !== 'object' || Array.isArray(classifications)) {
      const evidence = cloneEvidence(INITIAL_EVIDENCE);
      return { evidence, modelEvidence: evidence, hasChangedClassification: false, restored: false, migrated: false };
    }

    const entries = Object.entries(classifications);
    const expectedIds = Object.keys(INITIAL_EVIDENCE);
    if (
      entries.length !== expectedIds.length ||
      expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(classifications, id)) ||
      entries.some(([, value]) => !isClassification(value))
    ) {
      const evidence = cloneEvidence(INITIAL_EVIDENCE);
      return { evidence, modelEvidence: evidence, hasChangedClassification: false, restored: false, migrated: false };
    }

    const parsedRecord = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
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
      writeStorage(CURRENT_SESSION_STORAGE_KEY, createSessionPayload(evidence, hasChangedClassification, modelEvidence));
    }
    return { evidence, modelEvidence, hasChangedClassification, restored: true, migrated };
  } catch {
    restoreDecisionHistory([]);
    const evidence = cloneEvidence(INITIAL_EVIDENCE);
    return { evidence, modelEvidence: evidence, hasChangedClassification: false, restored: false, migrated: false };
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
