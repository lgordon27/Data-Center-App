import type { EiaElectricityData } from "@/services/eiaService";
import {
  type GovernedFinancialOverrides,
  calculateCashFlowModel,
  type CashFlowModel,
  type Classification,
  type EvidenceRecord,
} from "@/model/cashFlowEngine";
import {
  applyAcceptedProofInputsToFinancialEvidence,
  FINANCIAL_TRANSMISSION_POLICY_VERSION,
  type AppliedFinancialProofInput,
  type VerifiedFinancialDecisionContext,
} from "@/model/financialTransmission";
import type {
  ProofLedgerProjection,
  ProjectIdentity,
} from "@/model/safelocProofContract";

export const FINANCIAL_MODEL_CONTRACT_VERSION = 4;

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
  name: string;
  role: "benchmark" | "primary" | "sensitivity";
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
  transmission: {
    mappingPolicyVersion: number;
    acceptedInputs: AppliedFinancialProofInput[];
    ignoredInputReasons: Record<string, string>;
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
  transmission: {
    mappingPolicyVersion: number;
    appliedInputIds: string[];
    acceptedInputs: AppliedFinancialProofInput[];
    ignoredInputReasons: Record<string, string>;
  };
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
  acceptedInputs,
  ignoredInputReasons,
}: {
  scenarioId: FinancialScenarioId;
  evidenceBasis: FinancialEvidenceBasis;
  electricityBasis: FinancialElectricityBasis;
  evidence: EvidenceRecord;
  model: CashFlowModel;
  providerState: FinancialProviderState;
  eiaData: EiaElectricityData;
  acceptedInputs: AppliedFinancialProofInput[];
  ignoredInputReasons: Record<string, string>;
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
    name: scenarioId === "synthetic-verified"
      ? "Synthetic verified benchmark"
      : scenarioId === "synthetic-current"
        ? "Synthetic current-evidence case"
        : scenarioId === "eia-verified"
          ? "EIA verified sensitivity"
          : "EIA current-evidence sensitivity",
    role: scenarioId === "synthetic-verified"
      ? "benchmark" as const
      : scenarioId === "synthetic-current"
        ? "primary" as const
        : "sensitivity" as const,
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
    transmission: {
      mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
      acceptedInputs,
      ignoredInputReasons,
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
  acceptedProofProjection,
  proofProject,
  modelStartDate,
  verifiedFinancialDecisions,
}: {
  syntheticEvidence: EvidenceRecord;
  providerEvidence: EvidenceRecord | null;
  eiaData: EiaElectricityData;
  providerState: FinancialProviderState;
  capacityMW: number | null;
  acceptedProofProjection?: ProofLedgerProjection;
  proofProject?: ProjectIdentity;
  modelStartDate?: GovernedFinancialOverrides["modelStartDate"];
  verifiedFinancialDecisions?: readonly VerifiedFinancialDecisionContext[];
}): FinancialScenarioMatrix {
  if (Boolean(acceptedProofProjection) !== Boolean(proofProject)) {
    throw new Error("Accepted proof transmission requires both a ledger projection and project identity.");
  }
  const proofTransmission = acceptedProofProjection && proofProject
    ? applyAcceptedProofInputsToFinancialEvidence({
        evidence: syntheticEvidence,
        project: proofProject,
        projection: acceptedProofProjection,
         modelStartDate,
         verifiedDecisions: verifiedFinancialDecisions,
      })
    : null;
  const effectiveCapacityMW = proofTransmission?.acceptedCapacityMW ?? capacityMW;
  if (effectiveCapacityMW === null || !Number.isFinite(effectiveCapacityMW) || effectiveCapacityMW <= 0) {
    return {
      modelContractVersion: FINANCIAL_MODEL_CONTRACT_VERSION,
      primaryScenarioId: "synthetic-current",
      providerState,
      transmission: {
        mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
        appliedInputIds: proofTransmission?.appliedInputIds ?? [],
        acceptedInputs: proofTransmission?.appliedInputs ?? [],
        ignoredInputReasons: proofTransmission?.ignoredInputReasons ?? {},
      },
      scenarios: {
        "synthetic-verified": null,
        "synthetic-current": null,
        "eia-verified": null,
        "eia-current": null,
      },
    };
  }

  const effectiveSyntheticEvidence = proofTransmission?.evidence ?? syntheticEvidence;
  const acceptedSyntheticInputs = proofTransmission?.appliedInputs ?? [];
  const synthetic = calculateCashFlowModel(
    effectiveSyntheticEvidence,
    effectiveCapacityMW,
    proofTransmission?.modelOverrides,
  );
  const syntheticVerifiedModel = synthetic.baseModel ?? synthetic;
  const syntheticVerified = snapshot({
    scenarioId: "synthetic-verified",
    evidenceBasis: "verified",
    electricityBasis: "synthetic",
    evidence: effectiveSyntheticEvidence,
    model: syntheticVerifiedModel,
    providerState,
    eiaData,
    acceptedInputs: acceptedSyntheticInputs,
    ignoredInputReasons: proofTransmission?.ignoredInputReasons ?? {},
  });
  const syntheticCurrent = snapshot({
    scenarioId: "synthetic-current",
    evidenceBasis: "current",
    electricityBasis: "synthetic",
    evidence: effectiveSyntheticEvidence,
    model: synthetic,
    providerState,
    eiaData,
    acceptedInputs: acceptedSyntheticInputs,
    ignoredInputReasons: proofTransmission?.ignoredInputReasons ?? {},
  });

  let eiaVerified: FinancialScenarioSnapshot | null = null;
  let eiaCurrent: FinancialScenarioSnapshot | null = null;
  if (providerEvidence && (providerState === "live" || providerState === "cached")) {
    let effectiveProviderEvidence = providerEvidence;
    let acceptedProviderInputs: AppliedFinancialProofInput[] = [];
    let providerModelOverrides: GovernedFinancialOverrides = {};
    let providerIgnoredInputReasons: Record<string, string> = {};
    if (acceptedProofProjection && proofProject) {
      const proofOverlay = applyAcceptedProofInputsToFinancialEvidence({
        evidence: providerEvidence,
        project: proofProject,
        projection: acceptedProofProjection,
         modelStartDate,
         verifiedDecisions: verifiedFinancialDecisions,
      });
      providerModelOverrides = proofOverlay.modelOverrides;
      providerIgnoredInputReasons = proofOverlay.ignoredInputReasons;
      acceptedProviderInputs = proofOverlay.appliedInputs.filter(
        (input) => input.inputId !== "electricity_cost" && input.inputId !== "electricity_escalation",
      );
      effectiveProviderEvidence = {
        ...proofOverlay.evidence,
        // EIA remains a statewide electricity-price sensitivity, not a
        // substitute for the accepted project tariff in the primary case.
        electricity_cost: providerEvidence.electricity_cost,
        electricity_escalation: providerEvidence.electricity_escalation,
      };
    }
    const provider = calculateCashFlowModel(
      effectiveProviderEvidence,
      effectiveCapacityMW,
      providerModelOverrides,
    );
    eiaVerified = snapshot({
      scenarioId: "eia-verified",
      evidenceBasis: "verified",
      electricityBasis: "eia",
      evidence: effectiveProviderEvidence,
      model: provider.baseModel ?? provider,
      providerState,
      eiaData,
      acceptedInputs: acceptedProviderInputs,
      ignoredInputReasons: providerIgnoredInputReasons,
    });
    eiaCurrent = snapshot({
      scenarioId: "eia-current",
      evidenceBasis: "current",
      electricityBasis: "eia",
      evidence: effectiveProviderEvidence,
      model: provider,
      providerState,
      eiaData,
      acceptedInputs: acceptedProviderInputs,
      ignoredInputReasons: providerIgnoredInputReasons,
    });
  }

  return {
    modelContractVersion: FINANCIAL_MODEL_CONTRACT_VERSION,
    primaryScenarioId: "synthetic-current",
    providerState,
    transmission: {
      mappingPolicyVersion: FINANCIAL_TRANSMISSION_POLICY_VERSION,
      appliedInputIds: proofTransmission?.appliedInputIds ?? [],
      acceptedInputs: proofTransmission?.appliedInputs ?? [],
      ignoredInputReasons: proofTransmission?.ignoredInputReasons ?? {},
    },
    scenarios: {
      "synthetic-verified": syntheticVerified,
      "synthetic-current": syntheticCurrent,
      "eia-verified": eiaVerified,
      "eia-current": eiaCurrent,
    },
  };
}