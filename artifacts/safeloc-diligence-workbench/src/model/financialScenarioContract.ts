import type { EiaElectricityData } from "@/services/eiaService";
import {
  calculateCashFlowModel,
  type CashFlowModel,
  type Classification,
  type EvidenceRecord,
} from "@/model/cashFlowEngine";

export const FINANCIAL_MODEL_CONTRACT_VERSION = 1;

export type FinancialScenarioId =
  | "synthetic-verified"
  | "synthetic-current"
  | "eia-verified"
  | "eia-current";

export type FinancialEvidenceBasis = "verified" | "current";
export type FinancialElectricityBasis = "synthetic" | "eia";
export type FinancialProviderState =
  | "live"
  | "cached"
  | "embedded"
  | "unavailable"
  | "refreshing"
  | "not-applicable";

export type FinancialScenarioSnapshot = {
  scenarioId: FinancialScenarioId;
  modelContractVersion: number;
  evidenceBasis: FinancialEvidenceBasis;
  electricityBasis: FinancialElectricityBasis;
  provider: {
    state: FinancialProviderState;
    dataOrigin: EiaElectricityData["dataOrigin"] | "not-applicable";
    period: string | null;
    fetchedAt: string | null;
    sourceUpdatedAt: string | null;
    description: string;
  };
  inputs: {
    rawElectricityRate: number;
    appliedElectricityRate: number;
    rawElectricityEscalationPercent: number;
    appliedElectricityEscalationPercent: number;
    classifications: Record<string, Classification>;
  };
  assumptions: CashFlowModel["assumptions"];
  returns: {
    projectIRR: number | null;
    projectIRRStatus: CashFlowModel["projectIRRStatus"];
    projectIRRReason: CashFlowModel["projectIRRReason"];
    moic: number;
    cashOnCash: number;
    payback: number | null;
    npv: number;
    confidenceScore: number;
    totalDistributions: number;
    equityInvested: number;
    returnSensitivity: CashFlowModel["returnSensitivity"];
  };
  schedule: CashFlowModel["schedule"];
  recommendation: {
    status: CashFlowModel["recommendationStatus"];
    blocked: boolean;
    missingMaterialCount: number;
    unresolvedDecisionGateCount: number;
    unresolvedFinancialDriverCount: number;
    materialUnverifiedCount: number;
  };
  model: CashFlowModel;
  modelFingerprint: string;
};

export type FinancialScenarioMatrix = {
  modelContractVersion: number;
  primaryScenarioId: "synthetic-current";
  providerState: FinancialProviderState;
  scenarios: Record<FinancialScenarioId, FinancialScenarioSnapshot | null>;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function fingerprint(value: unknown) {
  const text = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function standaloneModel(model: CashFlowModel): CashFlowModel {
  const { baseIRR: _baseIRR, baseModel: _baseModel, ...standalone } = model;
  return standalone;
}

function classificationsFor(
  evidence: EvidenceRecord,
  evidenceBasis: FinancialEvidenceBasis,
) {
  return Object.fromEntries(
    Object.entries(evidence).map(([id, item]) => [
      id,
      evidenceBasis === "verified" ? "Verified Evidence" : item.classification,
    ]),
  ) as Record<string, Classification>;
}

function snapshot({
  scenarioId,
  evidenceBasis,
  electricityBasis,
  evidence,
  model,
  providerState,
  eiaData,
}: {
  scenarioId: FinancialScenarioId;
  evidenceBasis: FinancialEvidenceBasis;
  electricityBasis: FinancialElectricityBasis;
  evidence: EvidenceRecord;
  model: CashFlowModel;
  providerState: FinancialProviderState;
  eiaData: EiaElectricityData;
}): FinancialScenarioSnapshot {
  const standalone = standaloneModel(model);
  const rawElectricityRate = Number(evidence.electricity_cost.numericValue ?? 42);
  const rawElectricityEscalationPercent = Number(evidence.electricity_escalation.numericValue ?? 6);
  const provider = electricityBasis === "eia"
    ? {
        state: providerState,
        dataOrigin: eiaData.dataOrigin,
        period: eiaData.latestPricePeriod ?? null,
        fetchedAt: eiaData.fetchedAt ?? null,
        sourceUpdatedAt: eiaData.sourceUpdatedAt ?? null,
        description: "U.S. EIA Texas statewide industrial retail electricity-price sensitivity; not a Stargate tariff or contracted project price.",
      }
    : {
        state: "not-applicable" as const,
        dataOrigin: "not-applicable" as const,
        period: null,
        fetchedAt: null,
        sourceUpdatedAt: null,
        description: "Synthetic analyst-selected underwriting electricity basis; not a disclosed Stargate tariff.",
      };
  const result = {
    scenarioId,
    modelContractVersion: FINANCIAL_MODEL_CONTRACT_VERSION,
    evidenceBasis,
    electricityBasis,
    provider,
    inputs: {
      rawElectricityRate,
      appliedElectricityRate: standalone.assumptions.electricityRate,
      rawElectricityEscalationPercent,
      appliedElectricityEscalationPercent: standalone.assumptions.electricityEscalationRate * 100,
      classifications: classificationsFor(evidence, evidenceBasis),
    },
    assumptions: standalone.assumptions,
    returns: {
      projectIRR: standalone.projectIRR,
      projectIRRStatus: standalone.projectIRRStatus,
      projectIRRReason: standalone.projectIRRReason,
      moic: standalone.moic,
      cashOnCash: standalone.cashOnCash,
      payback: standalone.payback,
      npv: standalone.npv,
      confidenceScore: standalone.confidenceScore,
      totalDistributions: standalone.totalDistributions,
      equityInvested: standalone.equityInvested,
      returnSensitivity: standalone.returnSensitivity,
    },
    schedule: standalone.schedule,
    recommendation: {
      status: standalone.recommendationStatus,
      blocked: standalone.recommendationBlocked,
      missingMaterialCount: standalone.missingMaterialCount,
      unresolvedDecisionGateCount: standalone.unresolvedDecisionGateCount,
      unresolvedFinancialDriverCount: standalone.unresolvedFinancialDriverCount,
      materialUnverifiedCount: standalone.materialUnverifiedCount,
    },
    model: standalone,
  };
  return { ...result, modelFingerprint: fingerprint(result) };
}

export function buildFinancialScenarioMatrix({
  syntheticEvidence,
  providerEvidence,
  eiaData,
  providerState,
  capacityMW,
}: {
  syntheticEvidence: EvidenceRecord;
  providerEvidence: EvidenceRecord | null;
  eiaData: EiaElectricityData;
  providerState: FinancialProviderState;
  capacityMW: number;
}): FinancialScenarioMatrix {
  const synthetic = calculateCashFlowModel(syntheticEvidence, capacityMW);
  const syntheticVerifiedModel = synthetic.baseModel ?? synthetic;
  const syntheticVerified = snapshot({
    scenarioId: "synthetic-verified",
    evidenceBasis: "verified",
    electricityBasis: "synthetic",
    evidence: syntheticEvidence,
    model: syntheticVerifiedModel,
    providerState,
    eiaData,
  });
  const syntheticCurrent = snapshot({
    scenarioId: "synthetic-current",
    evidenceBasis: "current",
    electricityBasis: "synthetic",
    evidence: syntheticEvidence,
    model: synthetic,
    providerState,
    eiaData,
  });

  let eiaVerified: FinancialScenarioSnapshot | null = null;
  let eiaCurrent: FinancialScenarioSnapshot | null = null;
  if (providerEvidence && (providerState === "live" || providerState === "cached")) {
    const provider = calculateCashFlowModel(providerEvidence, capacityMW);
    eiaVerified = snapshot({
      scenarioId: "eia-verified",
      evidenceBasis: "verified",
      electricityBasis: "eia",
      evidence: providerEvidence,
      model: provider.baseModel ?? provider,
      providerState,
      eiaData,
    });
    eiaCurrent = snapshot({
      scenarioId: "eia-current",
      evidenceBasis: "current",
      electricityBasis: "eia",
      evidence: providerEvidence,
      model: provider,
      providerState,
      eiaData,
    });
  }

  return {
    modelContractVersion: FINANCIAL_MODEL_CONTRACT_VERSION,
    primaryScenarioId: "synthetic-current",
    providerState,
    scenarios: {
      "synthetic-verified": syntheticVerified,
      "synthetic-current": syntheticCurrent,
      "eia-verified": eiaVerified,
      "eia-current": eiaCurrent,
    },
  };
}