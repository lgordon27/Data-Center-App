export declare const AI_EVIDENCE_TEMPORAL_CONFIG: {
  readonly cutoffDate: string;
  readonly validReportingYears: readonly number[];
  readonly temporalRecord: readonly string[];
};
export declare const AI_EVIDENCE_CUTOFF_LABEL: string;
export declare const AI_EVIDENCE_REPORTING_WINDOW: string;
export declare const AI_EVIDENCE_VALID_REPORTING_YEARS_LABEL: string;
export declare function buildAIEvidenceTemporalInstruction(): string;
export declare function formatCutoffDate(cutoffDate: string): string;
export declare function formatReportingWindow(validReportingYears: readonly number[]): string;