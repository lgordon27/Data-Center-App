import {
  assertCanonicalProjectIdentity,
  assertSameProjectScope,
  validateProofLedgerEvent,
  validateProofUserDecision,
  type AcceptedModelInput,
  type EvidenceObservation,
  type EvidenceValueStatus,
  type ProofLedgerEvent,
  type ProofUserDecision,
  type ProjectIdentity,
  type ProjectScope,
  type SafeLocProofDimension,
  type SearchAssessment,
  type StoredProofLedgerEvent,
  type TransmissionProposal,
} from "../src/model/safelocProofContract.js";
import {
  expectedAffectedVariable,
  financialTransmissionFormulaDescription,
  FINANCIAL_TRANSMISSION_POLICY_VERSION,
  type FinancialTransmissionTarget,
} from "../src/model/financialTransmission.js";

export type OfflineClaim = {
  claimId: string;
  target: string;
  kind: string;
  text: string;
  value?: string | number | null;
  unit?: string | null;
  valueStatus?: EvidenceValueStatus;
  scope: ProjectScope;
  asOfDate: string | null;
  dimension?: SafeLocProofDimension;
  sourceEvidenceIds: string[];
  retainedPassageIds: string[];
  attributed?: boolean;
  illustrative?: boolean;
  derived?: boolean;
  derivationPolicy?: { id: string; version: number } | null;
  searchResolution?: SearchAssessment["resolution"];
  assertionRef?: string;
};

/**
 * Offline envelope for saved outputs. `proofEvents` retain the frozen
 * SafeLoc contract; claims are explicit reviewer-facing claim annotations,
 * not a replacement proof schema or a text-generation/parser contract.
 */
export type OfflineSavedRun = {
  adapter: "safeloc-offline-saved-run-v1";
  schemaVersion: 1;
  origin: "saved-live-run" | "retained-repository-fixture" | "test-only-illustrative";
  runId: string | null;
  researchAsOfDate: string | null;
  project: ProjectIdentity;
  proofEvents: ProofLedgerEvent[];
  userDecisions: ProofUserDecision[];
  claims: OfflineClaim[];
};

export type GroundTruthAssertionKind =
  | "identity-match"
  | "identity-exclusion"
  | "operator"
  | "developer"
  | "capacity"
  | "date"
  | "capex"
  | "phase"
  | "required-source"
  | "forbidden-claim"
  | "unresolved-dimension"
  | "scope-trap"
  | "estimate-vs-actual";

export type GroundTruthAssertion = {
  id: string;
  kind: GroundTruthAssertionKind;
  target: string;
  expectedValue?: string | number | null;
  expectedState?: string;
  unit?: string;
  expectedStatus?: EvidenceValueStatus;
  scope: ProjectScope;
  asOfDate: string | null;
  tolerance?: number;
  provenance: {
    sourceId: string | null;
    passageId: string | null;
    fixturePath: string;
    attribution: string;
  };
  severity: "BLOCKER" | "MAJOR" | "MINOR";
};

export type OfflineValidationCase = {
  caseId: string;
  displayName: string;
  origin: "retained-repository-material" | "illustrative-test-only";
  project: {
    projectReference: string;
    name: string;
    scope: ProjectScope;
  };
  researchAsOfDate: string | null;
  sources: Array<{
    sourceId: string;
    title: string;
    publisher: string;
    url: string;
    publishedAt: string | null;
    accessedAt: string | null;
    fixturePath: string;
    passages: Array<{ passageId: string; text: string }>;
  }>;
  assertions: GroundTruthAssertion[];
  intentionallyUnknown: string[];
  illustrativeRegressionInputs: {
    sourceFixture: string;
    status: string;
    values: Record<string, unknown>;
  };
};

export type OfflineFinding = {
  ruleId: string;
  status: "PASS" | "FAIL" | "NOT_ASSERTED" | "REVIEW";
  severity: "BLOCKER" | "MAJOR" | "MINOR";
  subject: string;
  detail: string;
};

export type OfflineValidationReport = {
  reportVersion: 1;
  projectName: string;
  projectId: string;
  runId: string | null;
  researchAsOfDate: string | null;
  findings: OfflineFinding[];
  criticalAssertionOutcomes: OfflineFinding[];
  notAssertedFacts: string[];
  unexpectedClaims: string[];
  unsupportedNumbers: string[];
  incompleteSearchDimensions: string[];
  financialProposals: Array<{
    proposalId: string;
    affectedVariable: string;
    status: TransmissionProposal["status"];
    supportLevel: TransmissionProposal["supportLevel"];
    disposition: string;
  }>;
};

const SEVERITY_ORDER = { BLOCKER: 0, MAJOR: 1, MINOR: 2 } as const;
const PASSAGE_CLASSIFICATIONS = new Set(["Verified Evidence", "Management Assertion"]);
const INCOMPLETE_SEARCH_STATES = new Set(["partial", "not-run", "blocked", "failed"]);
const DIMENSIONS = new Set([
  "project-identity",
  "power-grid-interconnection",
  "electricity-tariff",
  "water-cooling",
  "land-site-civil",
  "permitting-entitlement",
  "community-local-government",
  "environmental-air-generation",
  "climate-operational-hazard",
  "construction-phasing",
  "financing-capital",
  "tenant-counterparty",
  "incentives-taxes",
]);
const VALUE_STATUSES = new Set(["actual", "estimate", "forecast", "unknown"]);
const SEARCH_RESOLUTIONS = new Set(["not-assessed", "supported", "searched-not-found", "conflicting"]);
const TARGETS: readonly FinancialTransmissionTarget[] = [
  "electricity_cost",
  "electricity_escalation",
  "water_consumption",
  "water_escalation",
  "grid_interconnection",
  "cooling_capex",
  "permitting_timeline",
  "capacity_mw",
  "cod_date",
  "tenant_commencement_date",
  "documented_direct_project_capex",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function requireNullableText(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireText(value, label);
}

function isScope(value: unknown): value is ProjectScope {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.key !== "string") return false;
  return value.kind === "unknown"
    ? value.key === "unknown"
    : ["campus", "phase", "facility"].includes(value.kind) && value.key.trim().length > 0;
}

function isProjectIdentity(value: unknown): value is ProjectIdentity {
  return isRecord(value) &&
    typeof value.projectId === "string" &&
    typeof value.projectReference === "string" &&
    typeof value.name === "string" &&
    isScope(value.scope);
}

function validateClaimShape(raw: unknown, index: number): OfflineClaim {
  const claim = requireRecord(raw, `claims[${index}]`);
  const claimId = requireText(claim.claimId, `claims[${index}].claimId`);
  const target = requireText(claim.target, `claims[${index}].target`);
  const kind = requireText(claim.kind, `claims[${index}].kind`);
  const text = requireText(claim.text, `claims[${index}].text`);
  if (
    !isScope(claim.scope) ||
    (claim.scope.kind !== "unknown" &&
      claim.scope.key !== claim.scope.key.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"))
  ) throw new Error(`claims[${index}].scope must use a canonical project scope.`);
  if (claim.asOfDate !== null && (typeof claim.asOfDate !== "string" || !validIsoDate(claim.asOfDate))) {
    throw new Error(`claims[${index}].asOfDate must be a valid ISO date or null.`);
  }
  if (
    Object.hasOwn(claim, "value") &&
    claim.value !== null &&
    typeof claim.value !== "string" &&
    (typeof claim.value !== "number" || !Number.isFinite(claim.value))
  ) {
    throw new Error(`claims[${index}].value must be a finite number, string, or null.`);
  }
  if (Object.hasOwn(claim, "unit") && claim.unit !== null && typeof claim.unit !== "string") {
    throw new Error(`claims[${index}].unit must be a string or null.`);
  }
  if (
    Object.hasOwn(claim, "dimension") &&
    (typeof claim.dimension !== "string" || !DIMENSIONS.has(claim.dimension))
  ) {
    throw new Error(`claims[${index}].dimension is not in the frozen proof contract.`);
  }
  if (!Array.isArray(claim.sourceEvidenceIds) || !claim.sourceEvidenceIds.every((id) => typeof id === "string")) {
    throw new Error(`claims[${index}].sourceEvidenceIds must be an array of strings.`);
  }
  if (!Array.isArray(claim.retainedPassageIds) || !claim.retainedPassageIds.every((id) => typeof id === "string")) {
    throw new Error(`claims[${index}].retainedPassageIds must be an array of strings.`);
  }
  if (claim.valueStatus !== undefined && !VALUE_STATUSES.has(String(claim.valueStatus))) {
    throw new Error(`claims[${index}].valueStatus is not in the frozen proof contract.`);
  }
  if (claim.searchResolution !== undefined && !SEARCH_RESOLUTIONS.has(String(claim.searchResolution))) {
    throw new Error(`claims[${index}].searchResolution is not in the frozen proof contract.`);
  }
  return {
    claimId,
    target,
    kind,
    text,
    ...(Object.hasOwn(claim, "value") ? { value: claim.value as string | number | null } : {}),
    ...(Object.hasOwn(claim, "unit") ? { unit: claim.unit as string | null } : {}),
    ...(claim.valueStatus ? { valueStatus: claim.valueStatus as EvidenceValueStatus } : {}),
    scope: claim.scope,
    asOfDate: claim.asOfDate as string | null,
    ...(typeof claim.dimension === "string" && DIMENSIONS.has(claim.dimension)
      ? { dimension: claim.dimension as SafeLocProofDimension }
      : {}),
    sourceEvidenceIds: claim.sourceEvidenceIds as string[],
    retainedPassageIds: claim.retainedPassageIds as string[],
    ...(typeof claim.attributed === "boolean" ? { attributed: claim.attributed } : {}),
    ...(typeof claim.illustrative === "boolean" ? { illustrative: claim.illustrative } : {}),
    ...(typeof claim.derived === "boolean" ? { derived: claim.derived } : {}),
    ...(claim.derivationPolicy === null
      ? { derivationPolicy: null }
      : isRecord(claim.derivationPolicy)
        ? { derivationPolicy: { id: String(claim.derivationPolicy.id ?? ""), version: Number(claim.derivationPolicy.version) } }
        : {}),
    ...(SEARCH_RESOLUTIONS.has(String(claim.searchResolution))
      ? { searchResolution: claim.searchResolution as SearchAssessment["resolution"] }
      : {}),
    ...(typeof claim.assertionRef === "string" ? { assertionRef: claim.assertionRef } : {}),
  };
}

/**
 * Explicit adapter for files exported from the frozen proof contract plus
 * structured claim annotations. It never calls a provider or guesses missing
 * contract values.
 */
export function adaptSavedOfflineRun(raw: unknown): OfflineSavedRun {
  const value = requireRecord(raw, "Saved offline run");
  if (value.adapter !== "safeloc-offline-saved-run-v1" || value.schemaVersion !== 1) {
    throw new Error("Saved run must declare adapter 'safeloc-offline-saved-run-v1' and schemaVersion 1.");
  }
  if (!["saved-live-run", "retained-repository-fixture", "test-only-illustrative"].includes(String(value.origin))) {
    throw new Error("Saved run origin must explicitly identify live, retained-fixture, or test-only content.");
  }
  const project = value.project;
  if (!isProjectIdentity(project)) throw new Error("Saved run project must be a scope-qualified SafeLoc project identity.");
  assertCanonicalProjectIdentity(project);
  const proofEvents = value.proofEvents;
  const userDecisions = value.userDecisions;
  const claims = value.claims;
  if (!Array.isArray(proofEvents)) throw new Error("Saved run proofEvents must be an array of frozen proof-contract events.");
  if (!Array.isArray(userDecisions)) throw new Error("Saved run userDecisions must be an array (use [] when none are retained).");
  if (!Array.isArray(claims)) throw new Error("Saved run claims must be an array of structured claim annotations.");
  const runId = value.runId === null ? null : requireText(value.runId, "Saved run runId");
  const researchAsOfDate = requireNullableText(value.researchAsOfDate, "Saved run researchAsOfDate");
  if (researchAsOfDate !== null && !validIsoDate(researchAsOfDate)) {
    throw new Error("Saved run researchAsOfDate must be a valid ISO date or null.");
  }
  return {
    adapter: "safeloc-offline-saved-run-v1",
    schemaVersion: 1,
    origin: value.origin as OfflineSavedRun["origin"],
    runId,
    researchAsOfDate,
    project,
    proofEvents: proofEvents as ProofLedgerEvent[],
    userDecisions: userDecisions as ProofUserDecision[],
    claims: claims.map(validateClaimShape),
  };
}

/**
 * Adapter for a saved dossier export using the same explicit frozen-contract
 * event/claim fields. Legacy dossier payloads are intentionally not guessed
 * into proof records.
 */
export function adaptSavedOfflineDossier(raw: unknown): OfflineSavedRun {
  const dossier = requireRecord(raw, "Saved offline dossier");
  if (dossier.adapter !== "safeloc-offline-saved-dossier-v1" || dossier.schemaVersion !== 1) {
    throw new Error("Saved dossier must declare adapter 'safeloc-offline-saved-dossier-v1' and schemaVersion 1.");
  }
  return adaptSavedOfflineRun({ ...dossier, adapter: "safeloc-offline-saved-run-v1" });
}

export function adaptSavedOfflineInput(raw: unknown): OfflineSavedRun {
  if (isRecord(raw) && raw.adapter === "safeloc-offline-saved-dossier-v1") {
    return adaptSavedOfflineDossier(raw);
  }
  return adaptSavedOfflineRun(raw);
}

function sameScope(left: ProjectScope, right: ProjectScope): boolean {
  return left.kind === right.kind && left.key.toLocaleLowerCase("en-US") === right.key.toLocaleLowerCase("en-US");
}

function sameProject(left: ProjectIdentity, right: ProjectIdentity): boolean {
  return left.projectId === right.projectId &&
    left.scope.kind === right.scope.kind &&
    left.scope.key === right.scope.key;
}

function valueMatches(actual: unknown, expected: unknown, tolerance = 0): boolean {
  if (typeof actual === "number" && typeof expected === "number") {
    return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
  }
  return actual === expected;
}

function normalizedUnit(unit: string | null | undefined): string {
  return (unit ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function validInstant(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function eventProject(event: unknown): ProjectIdentity | null {
  if (!isRecord(event) || !isProjectIdentity(event.project)) return null;
  return event.project;
}

function eventPayload<T>(event: unknown, eventType: string, key: string): T | null {
  if (!isRecord(event) || event.eventType !== eventType || !isRecord(event.payload)) return null;
  return (event.payload[key] ?? null) as T | null;
}

function matchingClaims(claims: OfflineClaim[], assertion: GroundTruthAssertion): OfflineClaim[] {
  return claims.filter((claim) =>
    claim.assertionRef === assertion.id ||
    claim.target === assertion.target,
  );
}

function claimUsesAssertionProvenance(
  run: OfflineSavedRun,
  claim: OfflineClaim,
  assertion: GroundTruthAssertion,
): boolean {
  if (!assertion.provenance.sourceId && !assertion.provenance.passageId) return true;
  return claim.sourceEvidenceIds.some((evidenceId) =>
    run.proofEvents.some((event) => {
      const evidence = eventPayload<EvidenceObservation>(event, "evidence-observation", "evidence");
      return evidence?.evidenceId === evidenceId &&
        (!assertion.provenance.sourceId || evidence.sourceIds.includes(assertion.provenance.sourceId)) &&
        (!assertion.provenance.passageId || evidence.retainedPassageId === assertion.provenance.passageId);
    }),
  );
}

function addFinding(
  findings: OfflineFinding[],
  ruleId: string,
  status: OfflineFinding["status"],
  severity: OfflineFinding["severity"],
  subject: string,
  detail: string,
) {
  findings.push({ ruleId, status, severity, subject, detail });
}

function validateAssertions(
  run: OfflineSavedRun,
  testCase: OfflineValidationCase,
  findings: OfflineFinding[],
): Set<string> {
  const recognizedClaims = new Set<string>();
  for (const assertion of testCase.assertions) {
    const claims = matchingClaims(run.claims, assertion);
    claims.forEach((claim) => recognizedClaims.add(claim.claimId));

    if (assertion.kind === "identity-match") {
      if (assertion.expectedValue === null || assertion.expectedValue === undefined) {
        addFinding(findings, "ASSERTION_IDENTITY", "NOT_ASSERTED", assertion.severity, assertion.id, "Identity ground truth is unknown / not asserted.");
      } else {
        const canonicalProjectMatches = run.project.projectReference === testCase.project.projectReference &&
          sameScope(run.project.scope, testCase.project.scope);
        const displayNameMatches = run.project.name.toLocaleLowerCase("en-US") ===
          testCase.project.name.toLocaleLowerCase("en-US");
        const nameMatches = displayNameMatches ||
          run.project.name.toLocaleLowerCase("en-US").includes(String(assertion.expectedValue).toLocaleLowerCase("en-US"));
        if (canonicalProjectMatches && nameMatches) {
          addFinding(findings, "ASSERTION_IDENTITY", "PASS", assertion.severity, assertion.id, "Canonical project reference, identity, and scope match the retained assertion.");
        } else {
          addFinding(findings, "ASSERTION_IDENTITY", "FAIL", "BLOCKER", assertion.id, "Saved run identity or scope does not match the expected project.");
        }
      }
      continue;
    }
    if (assertion.kind === "identity-exclusion") {
      const excluded = String(assertion.expectedValue ?? "").trim().toLocaleLowerCase("en-US");
      const found = excluded !== "" && (
        run.project.name.toLocaleLowerCase("en-US").includes(excluded) ||
        run.project.projectReference.toLocaleLowerCase("en-US").includes(excluded) ||
        run.claims.some((claim) => claim.text.toLocaleLowerCase("en-US").includes(excluded))
      );
      addFinding(
        findings,
        "ASSERTION_IDENTITY_EXCLUSION",
        found ? "FAIL" : "PASS",
        "BLOCKER",
        assertion.id,
        found ? `An excluded or unrelated project (${assertion.expectedValue}) appears in the saved run.` : "No excluded project substitution was found.",
      );
      continue;
    }
    if (assertion.kind === "forbidden-claim") {
      const forbidden = String(assertion.expectedValue ?? "").toLocaleLowerCase("en-US");
      const found = claims.find((claim) => claim.text.toLocaleLowerCase("en-US").includes(forbidden));
      addFinding(
        findings,
        "ASSERTION_FORBIDDEN_CLAIM",
        found ? "FAIL" : "PASS",
        assertion.severity,
        assertion.id,
        found ? `Forbidden claim was asserted: “${found.text}”.` : "Forbidden claim was not asserted.",
      );
      continue;
    }
    if (assertion.kind === "unresolved-dimension" || assertion.expectedState === "unknown / not asserted") {
      if (claims.length === 0) {
        addFinding(findings, "ASSERTION_UNRESOLVED", "NOT_ASSERTED", assertion.severity, assertion.id, `Ground truth remains ${assertion.expectedState ?? "unknown / not asserted"}.`);
      } else {
        addFinding(
          findings,
          "ASSERTION_UNRESOLVED",
          "REVIEW",
          assertion.severity,
          assertion.id,
          "The run makes a claim in a dimension whose ground truth is unknown; this is unexpected and needs human review, not proof that the claim is false.",
        );
      }
      continue;
    }
    if (assertion.kind === "scope-trap") {
      if (claims.length === 0) {
        addFinding(findings, "ASSERTION_SCOPE_TRAP", "PASS", assertion.severity, assertion.id, "The scope-incompatible claim was not asserted.");
      } else {
        const badScope = claims[0];
        addFinding(
          findings,
          "ASSERTION_SCOPE_TRAP",
          "FAIL",
          assertion.severity,
          assertion.id,
          `Claim ${badScope!.claimId} asserts a dimension whose ground truth is not established for ${assertion.scope.kind} scope ${assertion.scope.key} (claim scope: ${badScope!.scope.kind}:${badScope!.scope.key}).`,
        );
      }
      continue;
    }
    if (assertion.kind === "required-source") {
      const expectedSource = assertion.provenance.sourceId;
      if (claims.length === 0) {
        addFinding(findings, "ASSERTION_REQUIRED_SOURCE", "NOT_ASSERTED", assertion.severity, assertion.id, "No claim used this source; source retention is checked only when the claim is present.");
      } else {
        const linked = claims.some((claim) => claim.sourceEvidenceIds.some((id) =>
          run.proofEvents.some((event) => {
            const evidence = eventPayload<EvidenceObservation>(event, "evidence-observation", "evidence");
            return evidence?.evidenceId === id && evidence.sourceIds.includes(expectedSource ?? "");
          }),
        ));
        addFinding(findings, "ASSERTION_REQUIRED_SOURCE", linked ? "PASS" : "FAIL", assertion.severity, assertion.id, linked ? "Expected retained source is linked to the claim." : "Claim is present but the expected retained source is not linked.");
      }
      continue;
    }

    if (claims.length === 0) {
      addFinding(findings, `ASSERTION_${assertion.kind.toLocaleUpperCase("en-US").replaceAll("-", "_")}`, "NOT_ASSERTED", assertion.severity, assertion.id, "Known retained assertion was not made by this run; omission is not treated as a false claim.");
      continue;
    }
    for (const claim of claims) {
      const mismatches: string[] = [];
      if (!claimUsesAssertionProvenance(run, claim, assertion)) {
        mismatches.push("claim does not cite the assertion's retained source and passage");
      }
      if (
        assertion.expectedValue !== undefined &&
        !valueMatches(claim.value, assertion.expectedValue, assertion.tolerance ?? 0)
      ) {
        mismatches.push(`value ${JSON.stringify(claim.value)} does not match ${JSON.stringify(assertion.expectedValue)} within tolerance ${assertion.tolerance ?? 0}`);
      }
      if (assertion.unit !== undefined && normalizedUnit(claim.unit) !== normalizedUnit(assertion.unit)) {
        mismatches.push(`unit ${JSON.stringify(claim.unit)} does not match ${JSON.stringify(assertion.unit)}`);
      }
      if (assertion.expectedStatus !== undefined && claim.valueStatus !== assertion.expectedStatus) {
        mismatches.push(`value status ${JSON.stringify(claim.valueStatus)} does not match ${assertion.expectedStatus}`);
      }
      if (!sameScope(claim.scope, assertion.scope)) {
        mismatches.push(`scope ${claim.scope.kind}:${claim.scope.key} does not match ${assertion.scope.kind}:${assertion.scope.key}`);
      }
      if (assertion.asOfDate !== null && claim.asOfDate !== assertion.asOfDate) {
        mismatches.push(`claim as-of date ${JSON.stringify(claim.asOfDate)} does not match ${assertion.asOfDate}`);
      }
      if (assertion.kind === "estimate-vs-actual" && claim.valueStatus === "actual") {
        mismatches.push("reported estimate is presented as actual");
      }
      const ruleId = `ASSERTION_${assertion.kind.toLocaleUpperCase("en-US").replaceAll("-", "_")}`;
      addFinding(
        findings,
        ruleId,
        mismatches.length ? "FAIL" : "PASS",
        assertion.severity,
        `${assertion.id}/${claim.claimId}`,
        mismatches.length ? mismatches.join("; ") : "Claim value, unit, value status, scope, and dated assertion match.",
      );
    }
  }
  return recognizedClaims;
}

function validateContractEvents(
  run: OfflineSavedRun,
  findings: OfflineFinding[],
  validEvents: ProofLedgerEvent[],
) {
  const searches: SearchAssessment[] = [];
  const evidence: EvidenceObservation[] = [];
  const states: Array<{ stateKey: string; status: string; supportingEvidenceIds: string[] }> = [];
  const proposals: TransmissionProposal[] = [];
  const acceptedInputs: Array<{ event: ProofLedgerEvent; input: AcceptedModelInput }> = [];
  const validDecisions = new Map<string, ProofUserDecision>();

  for (let index = 0; index < run.proofEvents.length; index += 1) {
    const candidate: unknown = run.proofEvents[index];
    if (!isRecord(candidate) || typeof candidate.eventType !== "string") {
      addFinding(findings, "PROOF_EVENT_MALFORMED", "FAIL", "BLOCKER", `proofEvents[${index}]`, "Proof event is not a recognized frozen contract record.");
      continue;
    }
    const project = eventProject(candidate);
    if (!project) {
      addFinding(findings, "PROOF_EVENT_MALFORMED", "FAIL", "BLOCKER", `proofEvents[${index}]`, "Proof event has no valid scope-qualified project.");
      continue;
    }
    try {
      assertSameProjectScope(run.project, project, `proofEvents[${index}]`);
    } catch (error) {
      addFinding(findings, "PROOF_EVENT_SCOPE_MISMATCH", "FAIL", "BLOCKER", `proofEvents[${index}]`, error instanceof Error ? error.message : "Event scope mismatch.");
      continue;
    }
    if (!validInstant(candidate.effectiveAt)) {
      addFinding(findings, "PROOF_EVENT_DATE_INVALID", "FAIL", "MAJOR", `proofEvents[${index}]`, "Proof event effectiveAt must be a valid timestamp.");
      continue;
    }

    if (candidate.eventType === "search-assessment") {
      const search = eventPayload<SearchAssessment>(candidate, "search-assessment", "search");
      if (search) {
        searches.push(search);
        if (INCOMPLETE_SEARCH_STATES.has(search.state) && search.resolution === "searched-not-found") {
          addFinding(findings, "SEARCH_INCOMPLETE_AS_NOT_FOUND", "FAIL", "MAJOR", search.dimension, `Search ${search.searchId} is ${search.state} but resolves to searched-not-found.`);
        }
      }
    }
    try {
      validateProofLedgerEvent(candidate as unknown as ProofLedgerEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Frozen proof event is invalid.";
      if (!(candidate.eventType === "search-assessment" && /Searched-not-found requires a complete search/.test(message))) {
        addFinding(findings, "PROOF_EVENT_CONTRACT_INVALID", "FAIL", "BLOCKER", `proofEvents[${index}]`, message);
      }
      continue;
    }
    validEvents.push(candidate as unknown as ProofLedgerEvent);
    if (candidate.eventType === "search-assessment") {
      const search = eventPayload<SearchAssessment>(candidate, "search-assessment", "search");
      if (search?.state === "complete" && search.resolution === "conflicting") {
        addFinding(findings, "SEARCH_CONFLICTING_EVIDENCE", "REVIEW", "MAJOR", search.dimension, "Complete search retained conflicting evidence; do not collapse it to a single supported value.");
      } else if (search && INCOMPLETE_SEARCH_STATES.has(search.state)) {
        addFinding(findings, "SEARCH_INCOMPLETE", "REVIEW", "MAJOR", search.dimension, `Search is ${search.state}; no searched-not-found conclusion is established.`);
      } else if (search) {
        addFinding(findings, "SEARCH_COMPLETE", "PASS", "MINOR", search.dimension, `Search completed with resolution ${search.resolution}.`);
      }
    } else if (candidate.eventType === "evidence-observation") {
      const record = eventPayload<EvidenceObservation>(candidate, "evidence-observation", "evidence");
      if (record) evidence.push(record);
    } else if (candidate.eventType === "transmission-proposal") {
      const proposal = eventPayload<TransmissionProposal>(candidate, "transmission-proposal", "proposal");
      if (proposal) proposals.push(proposal);
    } else if (candidate.eventType === "project-state-change") {
      const state = eventPayload<{ stateKey: string; state: { status: string }; supportingEvidenceIds: string[] }>(
        candidate,
        "project-state-change",
        "state",
      );
      if (state && Array.isArray(state.supportingEvidenceIds)) {
        states.push({
          stateKey: state.stateKey,
          status: state.state.status,
          supportingEvidenceIds: state.supportingEvidenceIds,
        });
      }
    } else if (candidate.eventType === "accepted-model-input") {
      const input = eventPayload<AcceptedModelInput>(candidate, "accepted-model-input", "input");
      if (input) acceptedInputs.push({ event: candidate as unknown as ProofLedgerEvent, input });
    }
  }

  for (let index = 0; index < run.userDecisions.length; index += 1) {
    const decision = run.userDecisions[index];
    try {
      validateProofUserDecision(decision);
      assertSameProjectScope(run.project, decision.project, `userDecisions[${index}]`);
      validDecisions.set(decision.decisionId, decision);
    } catch (error) {
      addFinding(
        findings,
        "USER_DECISION_INVALID",
        "FAIL",
        "BLOCKER",
        `userDecisions[${index}]`,
        error instanceof Error ? error.message : "User decision is invalid or outside the saved project scope.",
      );
    }
  }

  const evidenceIdSet = new Set(evidence.map((record) => record.evidenceId));
  for (const record of evidence) {
    if (record.conflictsWithEvidenceIds.length > 0) {
      addFinding(
        findings,
        "EVIDENCE_CONFLICT_RETAINED",
        "REVIEW",
        "MAJOR",
        record.evidenceId,
        `Evidence records conflicts with ${record.conflictsWithEvidenceIds.join(", ")}; keep both sides visible.`,
      );
      if (record.conflictsWithEvidenceIds.some((id) => !evidenceIdSet.has(id))) {
        addFinding(
          findings,
          "EVIDENCE_CONFLICT_REFERENCE_UNVERIFIABLE",
          "REVIEW",
          "MAJOR",
          record.evidenceId,
          "At least one conflict reference is absent from the saved evidence events.",
        );
      }
    }
  }

  return { searches, evidence, states, proposals, acceptedInputs, validDecisions, validEvents };
}

function isFinancialTarget(value: string): value is FinancialTransmissionTarget {
  return TARGETS.includes(value as FinancialTransmissionTarget);
}

function sameInputValue(left: AcceptedModelInput, right: TransmissionProposal["proposedValue"]): boolean {
  return left.value === right.value && normalizedUnit(left.unit) === normalizedUnit(right.unit);
}

function validateFinancialSafety(
  run: OfflineSavedRun,
  events: ReturnType<typeof validateContractEvents>,
  findings: OfflineFinding[],
) {
  const financialProposals = events.proposals.map((proposal) => {
    const matchingInput = events.acceptedInputs.find(({ input }) =>
      proposal.sourceEvidenceIds.includes(input.sourceEvidenceId) &&
      isFinancialTarget(input.inputId) &&
      expectedAffectedVariable(input.inputId) === proposal.affectedVariable &&
      sameInputValue(input, proposal.proposedValue),
    );
    const disposition = proposal.status === "rejected"
      ? "rejected; no model activation"
      : proposal.status === "proposed"
        ? "proposed; not model-active"
        : proposal.status === "accepted" && matchingInput
          ? "accepted input event present; validating support below"
          : proposal.status === "accepted"
            ? "accepted proposal has no matching accepted-model-input event"
            : `${proposal.status}; no active model input established`;
    if (
      !["rejected", "withdrawn", "superseded"].includes(proposal.status) &&
      proposal.sourceEvidenceIds.some((sourceId) => !events.evidence.some((evidence) => evidence.evidenceId === sourceId))
    ) {
      addFinding(
        findings,
        "FINANCIAL_PROPOSAL_SUPPORT_UNVERIFIABLE",
        "REVIEW",
        "MAJOR",
        proposal.proposalId,
        "Proposal references supporting evidence that is absent from the saved run; support is unverifiable.",
      );
    }
    if (proposal.status === "accepted" && !matchingInput) {
      addFinding(findings, "FINANCIAL_ACCEPTED_WITHOUT_INPUT", "REVIEW", "MAJOR", proposal.proposalId, disposition);
    }
    return {
      proposalId: proposal.proposalId,
      affectedVariable: proposal.affectedVariable,
      status: proposal.status,
      supportLevel: proposal.supportLevel,
      disposition,
    };
  });

  for (const { event, input } of events.acceptedInputs) {
    const proposal = events.proposals.find((candidate) =>
      candidate.status === "accepted" &&
      candidate.sourceEvidenceIds.includes(input.sourceEvidenceId) &&
      sameInputValue(input, candidate.proposedValue) &&
      candidate.mappingPolicyVersion === FINANCIAL_TRANSMISSION_POLICY_VERSION,
    );
    const evidence = events.evidence.find((record) => record.evidenceId === input.sourceEvidenceId);
    const latestSearch = events.searches
      .filter((search) => search.dimension === input.dimension)
      .slice()
      .sort((left, right) =>
        right.observedAt.localeCompare(left.observedAt) || right.searchId.localeCompare(left.searchId),
      )[0];
    const supersededEvidenceIds = new Set<string>();
    for (const record of events.evidence) {
      for (const supersededId of record.supersedesEvidenceIds) supersededEvidenceIds.add(supersededId);
    }
    for (const candidate of events.validEvents) {
      const supersededId = eventPayload<string>(candidate, "supersession", "supersededEvidenceId");
      if (supersededId) supersededEvidenceIds.add(supersededId);
    }
    const decisionRef = isRecord(event) && typeof event.decisionRef === "string" ? event.decisionRef : null;
    const decision = decisionRef ? events.validDecisions.get(decisionRef) : undefined;
    const reasons: string[] = [];

    if (!proposal) reasons.push("no matching accepted proposal at the current transmission-policy version");
    if (!evidence) reasons.push("supporting evidence is missing");
    if (evidence && (
      !evidence.eligibility.eligible ||
      evidence.valueStatus !== "actual" ||
      evidence.sourceQualityClassification !== "Verified Evidence" ||
      evidence.value === null ||
      !evidence.retainedPassageId.trim() ||
      !evidence.retainedPassage.trim() ||
      !evidence.sourceIds.some((sourceId) => sourceId.trim())
    )) reasons.push("supporting evidence is ineligible, non-actual, non-verified, or lacks a retained source passage");
    if (evidence && evidence.dimension !== input.dimension) reasons.push("accepted input dimension does not match its evidence");
    if (evidence && !sameProject(run.project, evidence.project)) reasons.push("supporting evidence is outside the saved project scope");
    if (evidence && (
      evidence.conflictsWithEvidenceIds.length > 0 ||
      events.evidence.some((candidate) => candidate.conflictsWithEvidenceIds.includes(evidence.evidenceId))
    )) reasons.push("supporting evidence is conflicted");
    if (evidence && supersededEvidenceIds.has(evidence.evidenceId)) reasons.push("supporting evidence has been superseded");
    if (evidence && (
      evidence.value !== input.value ||
      normalizedUnit(evidence.unit) !== normalizedUnit(input.unit)
    )) reasons.push("accepted input value or unit differs from its supporting evidence");
    if (!latestSearch || latestSearch.state !== "complete" || latestSearch.resolution !== "supported") {
      reasons.push("the latest saved search for this evidence dimension is not complete and supported");
    }
    if (!decision || decision.decision !== "accept" || decision.actor.kind !== "authenticated") {
      reasons.push("matching authenticated human acceptance decision is unavailable");
    } else if (proposal && decision.targetRef !== proposal.proposalId) {
      reasons.push("human acceptance decision does not identify the accepted proposal");
    }
    if (!proposal) {
      // The active input cannot be traced to an implemented transmission
      // destination and policy; the contract deliberately has no model effect.
    } else if (!isFinancialTarget(input.inputId)) {
      reasons.push(`input destination ${input.inputId} is not in the current transmission interface`);
    } else {
      try {
        if (
          proposal.affectedVariable !== expectedAffectedVariable(input.inputId) ||
          proposal.formula !== financialTransmissionFormulaDescription(input.inputId)
        ) reasons.push("proposal destination or descriptive formula does not match the current policy interface");
      } catch {
        reasons.push("proposal destination is not recognized by the current policy interface");
      }
      if (proposal.quantificationClass !== "quantified" || !["supported", "strong"].includes(proposal.supportLevel)) {
        reasons.push("model-active proposal is not quantified with supported evidence");
      }
      if (proposal.mappingPolicyVersion !== FINANCIAL_TRANSMISSION_POLICY_VERSION) {
        reasons.push("proposal mapping-policy version is not current");
      }
    }
    if (!decisionRef) reasons.push("accepted-model-input event has no user decision reference");
    addFinding(
      findings,
      "FINANCIAL_MODEL_ACTIVE_SUPPORT",
      reasons.length ? "FAIL" : "PASS",
      "BLOCKER",
      input.inputId,
      reasons.length ? reasons.join("; ") : "Active input is supported by eligible evidence and current-policy proposal with authenticated human acceptance.",
    );
  }
  return financialProposals;
}

export function validateOfflineSavedRun(
  run: OfflineSavedRun,
  testCase?: OfflineValidationCase,
): OfflineValidationReport {
  const findings: OfflineFinding[] = [];
  try {
    assertCanonicalProjectIdentity(run.project);
  } catch (error) {
    addFinding(findings, "RUN_PROJECT_IDENTITY_INVALID", "FAIL", "BLOCKER", run.project?.name ?? "unknown project", error instanceof Error ? error.message : "Project identity is invalid.");
  }
  if (testCase) {
    const expectedProject = testCase.project;
    const matches = run.project.projectReference === expectedProject.projectReference &&
      sameScope(run.project.scope, expectedProject.scope) &&
      run.project.name.toLocaleLowerCase("en-US") === expectedProject.name.toLocaleLowerCase("en-US");
    if (!matches && !testCase.assertions.some((assertion) => assertion.kind === "identity-match" && assertion.expectedState === "unknown / not asserted")) {
      addFinding(findings, "PROJECT_IDENTITY_MISMATCH", "FAIL", "BLOCKER", testCase.caseId, "Run project identity differs from the selected validation matrix case.");
    }
    if (testCase.origin === "illustrative-test-only" && run.origin !== "test-only-illustrative") {
      addFinding(findings, "ILLUSTRATIVE_FIXTURE_AS_FACT", "FAIL", "BLOCKER", testCase.caseId, "Illustrative project fixture is not clearly labeled test-only.");
    }
    if (testCase.origin === "retained-repository-material" && run.origin === "test-only-illustrative") {
      addFinding(findings, "RETAINED_CASE_MISLABELED", "FAIL", "MAJOR", testCase.caseId, "Retained-source case was mislabeled as illustrative test data.");
    }
  }

  const recognizedClaims = testCase ? validateAssertions(run, testCase, findings) : new Set<string>();
  const contract = validateContractEvents(run, findings, []);
  const evidenceById = new Map(contract.evidence.map((evidence) => [evidence.evidenceId, evidence]));
  const incompleteSearchDimensions = contract.searches
    .filter((search) => INCOMPLETE_SEARCH_STATES.has(search.state))
    .map((search) => search.dimension);

  for (const claim of run.claims) {
    const hasNumber = typeof claim.value === "number" || /\b\d[\d,.]*(?:\.\d+)?\s*(?:mw|gw|mwh|kw|usd|million|billion|acres|sqft|square feet|gallons?)\b/i.test(claim.text);
    const negativeSearchLanguage = /\b(?:searched(?:\s+and|\s+but)?\s+not found|no evidence (?:was )?found|search(?:ed)?\s+(?:returned|found)\s+no results)\b/i.test(claim.text);
    if (claim.searchResolution === "searched-not-found" || negativeSearchLanguage) {
      const searches = contract.searches.filter((search) => claim.dimension === search.dimension);
      if (searches.some((search) => INCOMPLETE_SEARCH_STATES.has(search.state))) {
        addFinding(findings, "SEARCH_INCOMPLETE_AS_NOT_FOUND", "FAIL", "MAJOR", claim.claimId, "Claim says searched-not-found although its category search is incomplete.");
      }
    }
    if (run.origin === "test-only-illustrative" && claim.illustrative !== true) {
      addFinding(findings, "ILLUSTRATIVE_CLAIM_AS_FACT", "FAIL", "BLOCKER", claim.claimId, "Test-only claim is not explicitly labeled illustrative.");
    }
    if (claim.derived) {
      const hasCurrentPolicy = claim.derivationPolicy?.id === `financial-transmission-v${FINANCIAL_TRANSMISSION_POLICY_VERSION}` &&
        claim.derivationPolicy.version === FINANCIAL_TRANSMISSION_POLICY_VERSION;
      addFinding(
        findings,
        "UNSUPPORTED_DERIVED_MAGNITUDE",
        "FAIL",
        "BLOCKER",
        claim.claimId,
        hasCurrentPolicy
          ? "Current transmission policy describes proposed input normalization only; the frozen contract does not contain a reproducible derived output, so this magnitude cannot be validated."
          : "Derived value has no recognized current policy and input-evidence provenance.",
      );
    }

    const referencedEvidence = claim.sourceEvidenceIds.map((id) => evidenceById.get(id));
    const missingEvidence = claim.sourceEvidenceIds.some((id) => !evidenceById.has(id));
    const passageMismatch = referencedEvidence.some((evidence) =>
      !evidence ||
      !claim.retainedPassageIds.includes(evidence.retainedPassageId) ||
      !evidence.retainedPassage.trim() ||
      evidence.sourceIds.length === 0,
    );
    const unsupportedEvidence = referencedEvidence.some((evidence) =>
      evidence && (
        !PASSAGE_CLASSIFICATIONS.has(evidence.sourceQualityClassification) ||
        (evidence.sourceQualityClassification === "Management Assertion" && claim.attributed !== true)
      ),
    );
    const unsupportedNumber = hasNumber && (
      claim.sourceEvidenceIds.length === 0 ||
      missingEvidence ||
      passageMismatch ||
      unsupportedEvidence ||
      claim.derived
    );
    if (missingEvidence || passageMismatch || unsupportedEvidence) {
      addFinding(
        findings,
        "CLAIM_SOURCE_OR_PASSAGE_UNSUPPORTED",
        "FAIL",
        "BLOCKER",
        claim.claimId,
        missingEvidence
          ? "Claim references a missing retained evidence observation."
          : passageMismatch
            ? "Claim does not reference the retained passage and source IDs carried by its evidence."
            : "Claim promotes ineligible or non-source-backed evidence; management assertions must remain attributed.",
      );
    } else if (claim.sourceEvidenceIds.length === 0) {
      addFinding(findings, "CLAIM_SOURCE_OR_PASSAGE_UNSUPPORTED", "FAIL", "BLOCKER", claim.claimId, "Factual claim has no retained evidence reference.");
    } else if (unsupportedEvidence) {
      // The branch is kept explicit so changes to the diagnosis above cannot
      // accidentally convert an uncheckable claim into a pass.
      addFinding(findings, "CLAIM_SOURCE_OR_PASSAGE_UNSUPPORTED", "FAIL", "BLOCKER", claim.claimId, "Evidence support cannot be verified.");
    } else if (!recognizedClaims.has(claim.claimId) && testCase) {
      addFinding(findings, "UNEXPECTED_CLAIM", "REVIEW", "MAJOR", claim.claimId, "No matrix assertion covers this claim; a reviewer must decide whether it is supportable.");
    } else if (!hasNumber) {
      addFinding(findings, "CLAIM_SOURCE_OR_PASSAGE_SUPPORTED", "PASS", "MINOR", claim.claimId, "Claim links to a retained source and passage.");
    }
    if (unsupportedNumber) {
      addFinding(findings, "UNSUPPORTED_NUMERIC_CLAIM", "FAIL", "BLOCKER", claim.claimId, "Numeric magnitude is not supported by the linked retained passage or a current approved derivation.");
    }
  }

  const financialProposals = validateFinancialSafety(run, contract, findings);
  const evidenceIds = new Set(contract.evidence.map((record) => record.evidenceId));
  for (const state of contract.states) {
    if (state.status === "known" && (
      state.supportingEvidenceIds.length === 0 ||
      state.supportingEvidenceIds.some((id) => !evidenceIds.has(id))
    )) {
      addFinding(
        findings,
        "PROJECT_STATE_SUPPORT_UNVERIFIABLE",
        "FAIL",
        "BLOCKER",
        state.stateKey,
        "Known project state has no verifiable supporting evidence in the saved run.",
      );
    }
  }
  const sorted = findings.sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    left.ruleId.localeCompare(right.ruleId) ||
    left.subject.localeCompare(right.subject) ||
    left.detail.localeCompare(right.detail),
  );
  const notAssertedFacts = sorted
    .filter((finding) => finding.status === "NOT_ASSERTED")
    .map((finding) => `${finding.subject}: ${finding.detail}`);
  const unexpectedClaims = sorted
    .filter((finding) => finding.ruleId === "UNEXPECTED_CLAIM" || (finding.ruleId === "ASSERTION_UNRESOLVED" && finding.status === "REVIEW"))
    .map((finding) => `${finding.subject}: ${finding.detail}`);
  const unsupportedNumbers = sorted
    .filter((finding) => finding.ruleId === "UNSUPPORTED_NUMERIC_CLAIM")
    .map((finding) => finding.subject);
  return {
    reportVersion: 1,
    projectName: run.project.name,
    projectId: run.project.projectId,
    runId: run.runId,
    researchAsOfDate: run.researchAsOfDate,
    findings: sorted,
    criticalAssertionOutcomes: sorted.filter((finding) =>
      finding.ruleId.startsWith("ASSERTION_") && finding.severity !== "MINOR",
    ),
    notAssertedFacts,
    unexpectedClaims,
    unsupportedNumbers,
    incompleteSearchDimensions: [...new Set(incompleteSearchDimensions)].sort(),
    financialProposals,
  };
}

/**
 * Build an honest, provider-free baseline run from retained fixture passages.
 * The generated observations are report assertions only; management
 * assertions are explicitly attributed and never eligible for model inputs.
 */
export function createMatrixBaselineRun(testCase: OfflineValidationCase): OfflineSavedRun {
  const project = {
    ...testCase.project,
    projectId: `safeloc-project:v1:${encodeURIComponent(JSON.stringify([
      testCase.project.projectReference.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"),
      testCase.project.scope.kind,
      testCase.project.scope.kind === "unknown"
        ? "unknown"
        : testCase.project.scope.key.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"),
    ]))}`,
  } as ProjectIdentity;
  const proofEvents: ProofLedgerEvent[] = [];
  const claims: OfflineClaim[] = [];
  let counter = 0;
  for (const assertion of testCase.assertions) {
    if (
      ["unresolved-dimension", "scope-trap", "forbidden-claim", "identity-exclusion", "required-source"].includes(assertion.kind) ||
      assertion.expectedValue === undefined ||
      assertion.expectedValue === null ||
      assertion.expectedState !== undefined
    ) continue;
    const source = testCase.sources.find((candidate) => candidate.sourceId === assertion.provenance.sourceId);
    const passage = source?.passages.find((candidate) => candidate.passageId === assertion.provenance.passageId);
    if (!source || !passage) continue;
    counter += 1;
    const dimension: SafeLocProofDimension = assertion.kind === "capacity" || assertion.kind === "capex" || assertion.kind === "date" || assertion.kind === "phase"
      ? "construction-phasing"
      : "project-identity";
    const evidenceId = `fixture-evidence-${counter}`;
    const value = assertion.expectedValue;
    const evidence: EvidenceObservation = {
      evidenceId,
      project,
      dimension,
      claim: passage.text,
      value,
      unit: assertion.unit ?? null,
      valueStatus: assertion.expectedStatus ?? "actual",
      developmentQualifier: assertion.expectedStatus === "forecast" ? "Planned or forward-looking source statement." : null,
      publicationDate: source.publishedAt,
      asOfDate: assertion.asOfDate,
      retainedPassageId: passage.passageId,
      retainedPassage: passage.text,
      sourceIds: [source.sourceId],
      sourceQualityClassification: "Management Assertion",
      eligibility: { eligible: false, reason: "Retained and attributed fixture passage; not approved for financial-model transmission." },
      conflictsWithEvidenceIds: [],
      supersedesEvidenceIds: [],
      researchRunId: null,
      observedAt: source.accessedAt ? `${source.accessedAt}T00:00:00.000Z` : "2026-09-30T00:00:00.000Z",
    };
    proofEvents.push({
      eventId: `fixture-event-${counter}`,
      eventType: "evidence-observation",
      project,
      effectiveAt: evidence.observedAt,
      researchRunId: null,
      versions: { schemaVersion: 1, policyVersion: 1, modelVersion: "offline-fixture" },
      decisionRef: null,
      payload: { evidence },
    });
    claims.push({
      claimId: `fixture-claim-${counter}`,
      target: assertion.target,
      kind: assertion.kind,
      text: assertion.provenance.attribution,
      value,
      unit: assertion.unit ?? null,
      valueStatus: assertion.expectedStatus ?? "actual",
      scope: assertion.scope,
      asOfDate: assertion.asOfDate,
      sourceEvidenceIds: [evidenceId],
      retainedPassageIds: [passage.passageId],
      attributed: true,
      assertionRef: assertion.id,
    });
  }
  return {
    adapter: "safeloc-offline-saved-run-v1",
    schemaVersion: 1,
    origin: testCase.origin === "illustrative-test-only" ? "test-only-illustrative" : "retained-repository-fixture",
    runId: `offline-fixture:${testCase.caseId}`,
    researchAsOfDate: testCase.researchAsOfDate,
    project,
    proofEvents,
    userDecisions: [],
    claims,
  };
}

export function formatOfflineChecklist(report: OfflineValidationReport): string {
  const lines = [
    `# Offline review: ${report.projectName}`,
    `Project ID: ${report.projectId}`,
    `Run: ${report.runId ?? "not supplied"} | Research as of: ${report.researchAsOfDate ?? "unknown / not asserted"}`,
    "",
    "## Findings (blockers first)",
  ];
  if (report.findings.length === 0) lines.push("- No checkable claims or rule findings were supplied.");
  for (const finding of report.findings) {
    lines.push(`- [${finding.status}] ${finding.severity} ${finding.ruleId} — ${finding.subject}: ${finding.detail}`);
  }
  lines.push("", "## Not asserted");
  if (report.notAssertedFacts.length === 0) lines.push("- None recorded.");
  for (const item of report.notAssertedFacts) lines.push(`- ${item}`);
  lines.push("", "## Unexpected claims");
  if (report.unexpectedClaims.length === 0) lines.push("- None.");
  for (const item of report.unexpectedClaims) lines.push(`- ${item}`);
  lines.push("", "## Unsupported numbers");
  if (report.unsupportedNumbers.length === 0) lines.push("- None.");
  for (const item of report.unsupportedNumbers) lines.push(`- ${item}`);
  lines.push("", "## Incomplete search dimensions");
  if (report.incompleteSearchDimensions.length === 0) lines.push("- None reported.");
  for (const item of report.incompleteSearchDimensions) lines.push(`- ${item}`);
  lines.push("", "## Financial proposals");
  if (report.financialProposals.length === 0) lines.push("- None.");
  for (const proposal of report.financialProposals) {
    lines.push(`- ${proposal.proposalId}: ${proposal.status} / ${proposal.supportLevel} — ${proposal.disposition}`);
  }
  return lines.join("\n");
}
