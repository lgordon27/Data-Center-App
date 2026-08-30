import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calculateCashFlowModel,
  Classification,
  EvidenceRecord,
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
  recordManualClassificationChange,
} from "@/services/sessionLog";

export type { Classification } from '@/model/cashFlowEngine';

export type EvidenceItem = {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  classification: Classification;
  modelClassification?: Classification;
  citation: string;
  description: string;
  sourceId: SourceId | null;
  providerSourceId: SourceId | null;
  sourceRole: string;
  numericValue?: number;
  qualitativeValue?: QualitativeEvidenceValue;
};

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
type DiligenceState = {
  evidence: Record<string, EvidenceItem>;
  hasChangedClassification: boolean;
  updateClassification: (id: string, classification: Classification, source?: "manual" | "ai") => void;
  clearLastChange: () => void;
  metrics: FinancialMetrics;
  resetToDefault: () => void;
  sessionRestored: boolean;
  scenarios: SavedScenario[];
  saveScenario: (name: string) => SaveScenarioResult;
  renameScenario: (id: string, name: string) => RenameScenarioResult;
  removeScenario: (id: string) => RemoveScenarioResult;
  sourceStates: Record<SourceId, SourceState>;
  ercotQueue: ErcotQueueResult;
  eiaData: EiaElectricityData;
  eiaLoading: boolean;
};

export const CURRENT_SESSION_STORAGE_KEY = 'safeloc:diligence:current-session:v1';
export const EVIDENCE_TIP_DISMISSED_STORAGE_KEY = 'safeloc:diligence:evidence-room-tip-dismissed:v1';
export const INITIAL_EVIDENCE: Record<string, EvidenceItem> = {
  electricity_cost: { id: 'electricity_cost', label: 'Electricity Cost / MWh', value: 42, numericValue: 42, unit: '$/MWh', classification: 'User Assumption', citation: 'U.S. Energy Information Administration Electric Power Monthly (2025); Oncor Electric Delivery Company tariff filings (2026)', description: 'Representative West Texas blended power rate selected for underwriting; it is a synthetic input anchored to public EIA and Oncor data, not a disclosed Stargate contract tariff.', sourceId: null, providerSourceId: 'eia', sourceRole: 'Synthetic electricity-cost assumption' },
  water_consumption: { id: 'water_consumption', label: 'Annual Cooling Water', value: 'Not disclosed', numericValue: 23, unit: 'Facility total', classification: 'Missing Evidence', citation: 'City of Abilene water utility records (2025–2026) and Stargate/Crusoe project disclosures (2025–2026) searched; no facility-level annual total found', description: 'The dated municipal records and project disclosures searched do not establish Stargate Abilene facility-level water consumption.', sourceId: null, providerSourceId: null, sourceRole: 'Searched public records and project disclosures' },
  grid_interconnection: { id: 'grid_interconnection', label: 'Grid Interconnection Timeline', value: 'Expansion cancelled; delays exceeded 12 months', numericValue: 14, unit: 'Verified event', classification: 'Verified Evidence', citation: 'Epoch AI (2026); WinBuzzer (2026); SiliconReport (2026) reporting on the Stargate Abilene expansion cancellation and grid delays', description: 'Independent 2026 reporting states that the planned expansion beyond the 1.2 GW core was cancelled after grid-interconnection delays exceeded one year.', sourceId: null, providerSourceId: 'ercot-queue', sourceRole: 'Independent 2026 public reporting' },
  water_escalation: { id: 'water_escalation', label: '5-Yr Water Cost Escalation', value: 7, numericValue: 7, unit: '%', classification: 'Model Inference', citation: 'City of Abilene water-rate schedules (2022–2026); Taylor County public records (2025–2026); analyst trend inference', description: 'Representative five-year escalation inferred from local municipal water-rate history, not a disclosed Stargate contract rate or observed facility cost.', sourceId: null, providerSourceId: null, sourceRole: 'Analyst inference from dated public records' },
  community_risk: { id: 'community_risk', label: 'Community Infrastructure Strain', value: 'Documented', unit: 'Local impact', classification: 'Verified Evidence', citation: `Texas Standard (2025); Abilene Reporter-News (2025); ${FEMA_NRI_ATTRIBUTION}, FIPS ${ACTIVE_FEMA_NRI_PROFILE.fips}`, description: `Independent local reporting documents pressure on housing, childcare, and roads as construction employment peaks near 6,400 while permanent jobs are expected in the low hundreds. Separate FEMA county context for ${ACTIVE_FEMA_NRI_PROFILE.county} (FIPS ${ACTIVE_FEMA_NRI_PROFILE.fips}): Social Vulnerability ${ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityScore.toFixed(2)}, ${ACTIVE_FEMA_NRI_PROFILE.socialVulnerabilityRating}; it is not treated as project-specific proof.`, sourceId: null, providerSourceId: null, sourceRole: 'Independent local reporting with separate FEMA county context' },
  renewable_percentage: { id: 'renewable_percentage', label: 'Renewable Procurement', value: 'Local wind referenced; percentage unverified', numericValue: 25, unit: 'Power mix', classification: 'Management Assertion', citation: 'Lancium Abilene project announcement (2025); Crusoe Stargate Abilene public statement (2025); ERCOT generation context (2025)', description: 'Company statements reference local wind in the campus power story, but the renewable share delivered to Stargate is not independently verified or publicly quantified.', sourceId: null, providerSourceId: null, sourceRole: 'Dated company disclosures with unverified facility share' },
  cooling_capex: { id: 'cooling_capex', label: 'Cooling Infrastructure CAPEX', value: 450, numericValue: 450, unit: '$M', classification: 'User Assumption', citation: 'SiliconReport (2026) reporting on winter-storm cooling damage; synthetic analyst estimate scaled to the 1.2 GW model (2026)', description: 'Representative liquid-cooling and heat-rejection CAPEX selected by the analyst. The 2026 storm report is context for resilience risk, not evidence of Stargate CAPEX or a disclosed project cost.', sourceId: null, providerSourceId: null, sourceRole: 'Synthetic underwriting input' },
  electricity_escalation: { id: 'electricity_escalation', label: '5-Yr Electricity Price Increase', value: 6, numericValue: 6, unit: '%', classification: 'Model Inference', citation: 'ERCOT 2025 State of the Market Report; BloombergNEF Texas power-market reporting (2026); analyst trend inference', description: 'Representative West Texas power-cost escalation inferred from public ERCOT and market conditions; it is not an observed Stargate tariff or project fact.', sourceId: null, providerSourceId: 'eia', sourceRole: 'Analyst inference from public market context' },
  carbon_compliance: { id: 'carbon_compliance', label: 'Carbon Compliance Cost', value: 20, numericValue: 20, unit: '$M/yr', classification: 'Model Inference', citation: 'ERCOT 2025 State of the Market Report; U.S. EPA eGRID (2025); analyst emissions-cost inference (2026)', description: 'Synthetic annual allowance inferred from public grid-intensity and on-site natural-gas context for the modeled campus scale; it is not a reported Stargate charge.', sourceId: null, providerSourceId: null, sourceRole: 'Analyst inference from public energy data' },
  permitting_timeline: { id: 'permitting_timeline', label: 'Core Build Timeline', value: 'Eight-building core targeted for completion in 2026–2027', numericValue: 10, unit: 'Management schedule', classification: 'Management Assertion', citation: 'OpenAI Stargate announcement (2025); Oracle Stargate announcement (2025); Abilene Reporter-News project update (2026)', description: 'Company announcements targeted the eight-building core for 2026, while a later local update described construction continuing into 2027; the schedule remains a management-reported target.', sourceId: null, providerSourceId: null, sourceRole: 'Dated company announcements and local project reporting' },
  customer_concentration: { id: 'customer_concentration', label: 'Customer Terms & Concentration', value: 100, numericValue: 100, unit: '% concentrated', classification: 'Management Assertion', citation: 'Oracle Corporation Form 10-K for fiscal year 2025; OpenAI/Oracle Stargate announcement (2025); Crusoe Stargate project disclosure (2025)', description: 'Company filings and disclosures report an Oracle lease and a concentrated Stargate customer relationship, but the modeled 100% concentration and reported 15-year, 450,000-plus-GPU terms are not independently verified facility economics.', sourceId: null, providerSourceId: null, sourceRole: 'Dated company filings and disclosures' },
  water_rights: { id: 'water_rights', label: 'Local Water Rights & Allocation', value: 'Not disclosed', unit: 'Taylor County facility', classification: 'Missing Evidence', citation: 'Taylor County public records (2025–2026), City of Abilene water utility records (2025–2026), and Stargate/Crusoe disclosures (2025–2026) searched; no facility-level rights, allocation, or curtailment terms found', description: 'The dated county records, municipal records, and project disclosures searched do not establish Stargate water rights, allocation seniority, or drought curtailment protection.', sourceId: null, providerSourceId: null, sourceRole: 'Searched public records and project disclosures' },
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
  },
};

const DiligenceContext = createContext<DiligenceState | undefined>(undefined);

const VALID_CLASSIFICATIONS: Classification[] = [
  'Verified Evidence',
  'Management Assertion',
  'Model Inference',
  'User Assumption',
  'Missing Evidence',
];
export function DiligenceProvider({ children }: { children: React.ReactNode }) {
  const initialSession = useMemo(() => loadCurrentSession(), []);
  const [state, setState] = useState({
    evidence: initialSession.evidence,
    hasChangedClassification: initialSession.hasChangedClassification,
    lastChange: null as FinancialMetrics['lastChange'],
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sessionRestored, setSessionRestored] = useState(initialSession.restored);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadScenarios);
  const [ercotQueue, setErcotQueue] = useState<ErcotQueueResult>(FALLBACK_ERCOT_RESULT);
  const [eiaData, setEiaData] = useState<EiaElectricityData>(() => createEiaFallback());
  const [eiaLoading, setEiaLoading] = useState(true);
  const sourceStates = useMemo(() => sourceStateMap({
    "ercot-queue": ercotQueue.sourceMetadata,
    eia: eiaData.sourceMetadata,
  }), [eiaData.sourceMetadata, ercotQueue.sourceMetadata]);
  const effectiveEvidence = useMemo(
    () => applyEiaEvidence(state.evidence, eiaData),
    [state.evidence, eiaData],
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

  const updateClassification = useCallback((id: string, classification: Classification, source: "manual" | "ai" = "manual") => {
    const currentState = stateRef.current;
    const previous = currentState.evidence[id]?.classification;
    if (!previous || previous === classification || !isClassification(classification)) return;

    const previousIrr = calculateCashFlowModel(applyEiaEvidence(currentState.evidence, eiaData) as EvidenceRecord).projectIRR;
    const nextEvidence = {
      ...currentState.evidence,
      [id]: { ...currentState.evidence[id], classification },
    };
    const nextIrr = calculateCashFlowModel(applyEiaEvidence(nextEvidence, eiaData) as EvidenceRecord).projectIRR;
    const nextState = {
      evidence: nextEvidence,
      hasChangedClassification: true,
      lastChange: {
        from: previousIrr ?? 0,
        to: nextIrr ?? 0,
        delta: (nextIrr ?? 0) - (previousIrr ?? 0),
      },
    };
    stateRef.current = nextState;
    setState(nextState);
    if (source === "manual") {
      recordManualClassificationChange(id, previous, classification);
    }
    writeStorage(CURRENT_SESSION_STORAGE_KEY, {
      version: STORAGE_VERSION,
      hasChangedClassification: true,
      classifications: Object.fromEntries(
        Object.entries(nextEvidence).map(([itemId, item]) => [itemId, item.classification]),
      ),
    });
  }, [eiaData]);

  const clearLastChange = useCallback(() => {
    const nextState = { ...stateRef.current, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const resetToDefault = useCallback(() => {
    const nextState = { evidence: cloneEvidence(INITIAL_EVIDENCE), hasChangedClassification: false, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
    clearStorage(CURRENT_SESSION_STORAGE_KEY);
    clearDecisionHistory();
  }, []);

  const saveScenario = (name: string): SaveScenarioResult => {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, reason: 'empty-name' };
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
    writeStorage(SCENARIOS_STORAGE_KEY, { version: STORAGE_VERSION, scenarios: nextScenarios });
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
    writeStorage(SCENARIOS_STORAGE_KEY, { version: STORAGE_VERSION, scenarios: nextScenarios });
    return { ok: true, scenario: renamedScenario };
  };

  const removeScenario = (id: string): RemoveScenarioResult => {
    const scenario = scenarios.find((candidate) => candidate.id === id);
    if (!scenario) return { ok: false, reason: 'not-found' };

    const nextScenarios = scenarios.filter((candidate) => candidate.id !== id);
    setScenarios(nextScenarios);
    writeStorage(SCENARIOS_STORAGE_KEY, { version: STORAGE_VERSION, scenarios: nextScenarios });
    return { ok: true, scenario };
  };

  const metrics = useMemo(
    () => ({ ...calculateCashFlowModel(effectiveEvidence as EvidenceRecord), lastChange: state.lastChange }),
    [effectiveEvidence, state.lastChange],
  );

  return (
    <DiligenceContext.Provider value={{ evidence: effectiveEvidence, hasChangedClassification: state.hasChangedClassification, updateClassification, clearLastChange, metrics, resetToDefault, sessionRestored, scenarios, saveScenario, renameScenario, removeScenario, sourceStates, ercotQueue, eiaData, eiaLoading }}>
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
  | { ok: false; reason: 'empty-name' | 'duplicate-name' | 'capacity' };

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

function clearStorage(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

function isClassification(value: unknown): value is Classification {
  return typeof value === 'string' && VALID_CLASSIFICATIONS.includes(value as Classification);
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

function loadCurrentSession() {
  const raw = readStorage(CURRENT_SESSION_STORAGE_KEY);
  if (!raw) return { evidence: cloneEvidence(INITIAL_EVIDENCE), hasChangedClassification: false, restored: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    const classifications =
      parsed && typeof parsed === 'object' && 'classifications' in parsed
        ? (parsed as { classifications?: unknown }).classifications
        : parsed;
    if (!classifications || typeof classifications !== 'object' || Array.isArray(classifications)) {
      return { evidence: cloneEvidence(INITIAL_EVIDENCE), hasChangedClassification: false, restored: false };
    }

    const entries = Object.entries(classifications);
    const expectedIds = Object.keys(INITIAL_EVIDENCE);
    if (
      entries.length !== expectedIds.length ||
      expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(classifications, id)) ||
      entries.some(([, value]) => !isClassification(value))
    ) {
      return { evidence: cloneEvidence(INITIAL_EVIDENCE), hasChangedClassification: false, restored: false };
    }

    const evidence = cloneEvidence(INITIAL_EVIDENCE);
    for (const [id, classification] of entries) {
      evidence[id] = { ...evidence[id], classification };
    }
    const hasChangedClassification = Boolean(
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed as { hasChangedClassification?: unknown }).hasChangedClassification === true,
    );
    return { evidence, hasChangedClassification, restored: true };
  } catch {
    return { evidence: cloneEvidence(INITIAL_EVIDENCE), hasChangedClassification: false, restored: false };
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

const STORAGE_VERSION = 1;

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
