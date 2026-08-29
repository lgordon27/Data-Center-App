import React, { createContext, useContext, useState, useMemo } from 'react';

export type Classification = 
  | 'Verified Evidence'
  | 'Management Assertion'
  | 'Model Inference'
  | 'User Assumption'
  | 'Missing Evidence';

export type EvidenceItem = {
  id: string;
  label: string;
  value: string | number;
  unit: string;
  classification: Classification;
  citation: string;
  description: string;
};

export type FinancialMetrics = {
  projectIRR: number;
  moic: number;
  cashOnCash: number;
  payback: number;
  npv: number;
  confidenceScore: number;
  revenueDelayMonths: number;
  incrementalCapex: number;
  opexChange: number;
  ebitdaEffect: number;
  recommendationBlocked: boolean;
  missingMaterialCount: number;
  baseIRR: number;
  lastChange: { from: number; to: number; delta: number } | null;
};

type DiligenceState = {
  evidence: Record<string, EvidenceItem>;
  updateClassification: (id: string, classification: Classification) => void;
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

const BASE_IRR = 18.5;
const BASE_MOIC = 2.4;
const BASE_COC = 9.2;
const BASE_PAYBACK = 6.5;
const BASE_NPV = 145.5; // $M

function calculateMetrics(evidence: Record<string, EvidenceItem>): FinancialMetrics {
  let irrAdjustment = 0;
  let moicAdjustment = 0;
  let delayMonths = 0;
  let capexAdd = 0;
  let opexAdd = 0;
  
  // Weights for confidence score
  const confWeights = {
    'Verified Evidence': 10,
    'Management Assertion': 6,
    'Model Inference': 4,
    'User Assumption': 2,
    'Missing Evidence': 0
  };
  const qualityPenalty = {
    'Verified Evidence': 0,
    'Management Assertion': 0.18,
    'Model Inference': 0.32,
    'User Assumption': 0.55,
    'Missing Evidence': 0.95
  };
  
  let totalConf = 0;
  let missingMaterial = 0;

  Object.values(evidence).forEach(item => {
    totalConf += confWeights[item.classification];
    // Every provenance downgrade has a visible, intentionally simplified return cost.
    // This makes even non-material reclassifications legible in the model.
    irrAdjustment -= qualityPenalty[item.classification];
    moicAdjustment -= qualityPenalty[item.classification] * 0.05;

    if (item.classification === 'Missing Evidence' &&
      ['community_risk', 'water_rights', 'grid_interconnection', 'customer_concentration', 'permitting_timeline'].includes(item.id)) {
      missingMaterial += 1;
    }
  });

  const maxConf = Object.keys(evidence).length * 10;
  const confidenceScore = Math.round((totalConf / maxConf) * 100);

  // Specific rule adjustments based on classification state simulating "what happens when we treat assumptions as verified vs risky"
  if (evidence.grid_interconnection.classification !== 'Verified Evidence') {
    delayMonths += 6;
    irrAdjustment -= 0.8;
    moicAdjustment -= 0.15;
  }
  
  if (evidence.community_risk.classification === 'Missing Evidence' || evidence.community_risk.classification === 'User Assumption') {
    delayMonths += 9;
    irrAdjustment -= 1.2;
  }

  if (evidence.cooling_capex.classification !== 'Verified Evidence') {
    capexAdd += 12; // $12M surprise capex
    irrAdjustment -= 0.4;
  }
  
  if (evidence.water_escalation.classification === 'User Assumption' || evidence.water_escalation.classification === 'Missing Evidence') {
    opexAdd += 1.5; // $1.5M/yr
    irrAdjustment -= 0.3;
  }

  return {
    projectIRR: Number(Math.max(5, BASE_IRR + irrAdjustment).toFixed(1)),
    moic: Number(Math.max(1.0, BASE_MOIC + moicAdjustment).toFixed(2)),
    cashOnCash: Number((BASE_COC + (irrAdjustment * 0.4)).toFixed(1)),
    payback: Number((BASE_PAYBACK + (delayMonths / 12)).toFixed(1)),
    npv: Number((BASE_NPV + (irrAdjustment * 8) - capexAdd).toFixed(1)),
    confidenceScore,
    revenueDelayMonths: delayMonths,
    incrementalCapex: capexAdd,
    opexChange: opexAdd,
    ebitdaEffect: -(opexAdd * 0.8), // synthetic relation
     recommendationBlocked: missingMaterial >= 1,
    missingMaterialCount: missingMaterial,
     baseIRR: BASE_IRR,
     lastChange: null
  };
}

export function DiligenceProvider({ children }: { children: React.ReactNode }) {
  const [evidence, setEvidence] = useState<Record<string, EvidenceItem>>(INITIAL_EVIDENCE);
  const [lastChange, setLastChange] = useState<FinancialMetrics['lastChange']>(null);

  const updateClassification = (id: string, classification: Classification) => {
    setEvidence(prev => {
      const next = { ...prev, [id]: { ...prev[id], classification } };
      const previousIrr = calculateMetrics(prev).projectIRR;
      const nextIrr = calculateMetrics(next).projectIRR;
      setLastChange({ from: previousIrr, to: nextIrr, delta: Number((nextIrr - previousIrr).toFixed(1)) });
      return next;
    });
  };

  const metrics = useMemo(() => ({ ...calculateMetrics(evidence), lastChange }), [evidence, lastChange]);

  return (
    <DiligenceContext.Provider value={{ evidence, updateClassification, metrics }}>
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
