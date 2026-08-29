import React, { createContext, useContext, useState, useMemo, useCallback, useRef } from 'react';
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

type DiligenceState = {
  evidence: Record<string, EvidenceItem>;
  updateClassification: (id: string, classification: Classification) => void;
  clearLastChange: () => void;
  metrics: FinancialMetrics;
};

const INITIAL_EVIDENCE: Record<string, EvidenceItem> = {
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

export function DiligenceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({
    evidence: INITIAL_EVIDENCE,
    lastChange: null as FinancialMetrics['lastChange'],
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateClassification = useCallback((id: string, classification: Classification) => {
    const currentState = stateRef.current;
    const previous = currentState.evidence[id]?.classification;
    if (!previous || previous === classification) return;

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
  }, []);

  const clearLastChange = useCallback(() => {
    const nextState = { ...stateRef.current, lastChange: null };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const metrics = useMemo(
    () => ({ ...calculateCashFlowModel(state.evidence as EvidenceRecord), lastChange: state.lastChange }),
    [state],
  );

  return (
    <DiligenceContext.Provider value={{ evidence: state.evidence, updateClassification, clearLastChange, metrics }}>
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
