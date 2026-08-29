import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calculateCashFlowModel,
  Classification,
  EvidenceRecord,
} from '@/model/cashFlowEngine';

export type { Classification } from '@/model/cashFlowEngine';

export type EvidenceItem = {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  classification: Classification;
  citation: string;
  description: string;
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
  updateClassification: (id: string, classification: Classification) => void;
  clearLastChange: () => void;
  metrics: FinancialMetrics;
  resetToDefault: () => void;
  sessionRestored: boolean;
  scenarios: SavedScenario[];
  saveScenario: (name: string) => SaveScenarioResult;
};

export const CURRENT_SESSION_STORAGE_KEY = 'safeloc:diligence:current-session:v1';
export const INITIAL_EVIDENCE: Record<string, EvidenceItem> = {
  electricity_cost: { id: 'electricity_cost', label: 'Electricity Cost / MWh', value: 45, unit: '$/MWh', classification: 'Verified Evidence', citation: 'APS 2025 Utility Rate Filing', description: 'Blended rate across off-peak and peak.' },
  water_consumption: { id: 'water_consumption', label: 'Annual Cooling Water', value: 2.3, unit: 'M gal / yr', classification: 'Verified Evidence', citation: "Ceres 'Drained by Data' 2025", description: 'Evaporative cooling requirement.' },
  grid_interconnection: { id: 'grid_interconnection', label: 'Grid Interconnection Timeline', value: 14, unit: 'Months', classification: 'Management Assertion', citation: 'Developer Interconnection Claim', description: 'Time from application to energization.' },
  water_escalation: { id: 'water_escalation', label: '5-Yr Water Cost Escalation', value: 8, unit: '%', classification: 'Model Inference', citation: 'Derived from municipal rate history', description: 'CAGR of municipal water rates.' },
  community_risk: { id: 'community_risk', label: 'Community Opposition Risk', value: 'High', unit: 'Risk Level', classification: 'Model Inference', citation: 'Census ACS / NAACP Environmental Data', description: 'Risk of delay due to local pushback.' },
  renewable_percentage: { id: 'renewable_percentage', label: 'Renewable Procurement', value: 100, unit: '%', classification: 'Management Assertion', citation: 'Company Sustainability Report 2025', description: 'Claimed PPA coverage for energy usage.' },
  cooling_capex: { id: 'cooling_capex', label: 'Cooling Infrastructure CAPEX', value: 45, unit: '$M', classification: 'User Assumption', citation: 'Analyst-entered underwriting input', description: 'Chillers, piping, and closed-loop systems.' },
  electricity_escalation: { id: 'electricity_escalation', label: '5-Yr Electricity Price Increase', value: 5, unit: '%', classification: 'Verified Evidence', citation: 'Bloomberg Utility Pricing Dataset 2025', description: 'Projected tariff rate hike.' },
  carbon_compliance: { id: 'carbon_compliance', label: 'Carbon Compliance Cost', value: 2, unit: '$M/yr', classification: 'Model Inference', citation: 'Calculated from grid intensity and policy trajectory', description: 'Estimated carbon offset requirements.' },
  permitting_timeline: { id: 'permitting_timeline', label: 'Permitting Timeline', value: 12, unit: 'Months', classification: 'Management Assertion', citation: 'Sponsor Base Case Model', description: 'Time to secure all local approvals.' },
  customer_concentration: { id: 'customer_concentration', label: 'Customer Terms & Concentration', value: 85, unit: '%', classification: 'Missing Evidence', citation: 'Lease schedule not provided', description: 'Revenue tied to single hyperscaler.' },
  water_rights: { id: 'water_rights', label: 'Local Water Rights & Allocation', value: 'Junior Tier', unit: 'Allocation', classification: 'Missing Evidence', citation: 'Pending legal rights review', description: 'Seniority of site water rights in drought.' }
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
    lastChange: null as FinancialMetrics['lastChange'],
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [sessionRestored, setSessionRestored] = useState(initialSession.restored);
  const [scenarios, setScenarios] = useState<SavedScenario[]>(loadScenarios);

  useEffect(() => {
    if (!sessionRestored) return undefined;
    const timer = window.setTimeout(() => setSessionRestored(false), 4000);
    return () => window.clearTimeout(timer);
  }, [sessionRestored]);

  const updateClassification = useCallback((id: string, classification: Classification) => {
    const currentState = stateRef.current;
    const previous = currentState.evidence[id]?.classification;
    if (!previous || previous === classification || !isClassification(classification)) return;

    const previousIrr = calculateCashFlowModel(currentState.evidence as EvidenceRecord).projectIRR;
    const nextEvidence = {
      ...currentState.evidence,
      [id]: { ...currentState.evidence[id], classification },
    };
    const nextIrr = calculateCashFlowModel(nextEvidence as EvidenceRecord).projectIRR;
    const nextState = {
      evidence: nextEvidence,
      lastChange: {
        from: previousIrr ?? 0,
        to: nextIrr ?? 0,
        delta: Number(((nextIrr ?? 0) - (previousIrr ?? 0)).toFixed(1)),
      },
    };
    stateRef.current = nextState;
    setState(nextState);
    writeStorage(CURRENT_SESSION_STORAGE_KEY, {
      version: STORAGE_VERSION,
      classifications: Object.fromEntries(
        Object.entries(nextEvidence).map(([itemId, item]) => [itemId, item.classification]),
      ),
    });
  }, []);

  const clearLastChange = useCallback(() => {
    const nextState = { ...stateRef.current, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const resetToDefault = useCallback(() => {
    const nextState = { evidence: cloneEvidence(INITIAL_EVIDENCE), lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
    clearStorage(CURRENT_SESSION_STORAGE_KEY);
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

  const metrics = useMemo(
    () => ({ ...calculateCashFlowModel(state.evidence as EvidenceRecord), lastChange: state.lastChange }),
    [state],
  );

  return (
    <DiligenceContext.Provider value={{ evidence: state.evidence, updateClassification, clearLastChange, metrics, resetToDefault, sessionRestored, scenarios, saveScenario }}>
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
  if (!raw) return { evidence: cloneEvidence(INITIAL_EVIDENCE), restored: false };

  try {
    const parsed: unknown = JSON.parse(raw);
    const classifications =
      parsed && typeof parsed === 'object' && 'classifications' in parsed
        ? (parsed as { classifications?: unknown }).classifications
        : parsed;
    if (!classifications || typeof classifications !== 'object' || Array.isArray(classifications)) {
      return { evidence: cloneEvidence(INITIAL_EVIDENCE), restored: false };
    }

    const entries = Object.entries(classifications);
    const expectedIds = Object.keys(INITIAL_EVIDENCE);
    if (
      entries.length !== expectedIds.length ||
      expectedIds.some((id) => !Object.prototype.hasOwnProperty.call(classifications, id)) ||
      entries.some(([, value]) => !isClassification(value))
    ) {
      return { evidence: cloneEvidence(INITIAL_EVIDENCE), restored: false };
    }

    const evidence = cloneEvidence(INITIAL_EVIDENCE);
    for (const [id, classification] of entries) {
      evidence[id] = { ...evidence[id], classification };
    }
    return { evidence, restored: true };
  } catch {
    return { evidence: cloneEvidence(INITIAL_EVIDENCE), restored: false };
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
