import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import {
  SAFELOC_PROOF_DIMENSIONS,
  createProjectIdentity,
  deriveProofLedgerProjection,
  validateProofLedgerEvent,
  validateSearchAssessment,
  type EvidenceObservation,
  type ProofLedgerEvent,
  type ProofUserDecision,
  type StoredProofLedgerEvent,
} from "../src/model/safelocProofContract.js";
import { createProofLedgerRepository } from "./proofLedgerRepository.js";

const project = createProjectIdentity({
  projectReference: "red-oak",
  name: "Red Oak Data Center",
  scope: { kind: "facility", key: "building-1", label: "Building 1" },
});
const campus = createProjectIdentity({
  projectReference: "red-oak",
  name: "Red Oak Data Center",
  scope: { kind: "campus", key: "main-campus" },
});
const versions = { schemaVersion: 1, policyVersion: 7, modelVersion: "underwriting-3" };

function evidence(
  evidenceId: string,
  valueStatus: EvidenceObservation["valueStatus"] = "actual",
  identity = project,
): EvidenceObservation {
  return {
    evidenceId,
    project: identity,
    dimension: "electricity-tariff",
    claim: "Facility's stated delivered electricity tariff",
    value: 72,
    unit: "USD/MWh",
    valueStatus,
    developmentQualifier: "Initial operating year",
    publicationDate: "2026-01-15",
    asOfDate: "2025-12-31",
    retainedPassageId: "passage-utility-filing-1",
    retainedPassage: "The named facility's delivered rate is $72/MWh.",
    sourceIds: ["source-utility-filing-1"],
    sourceQualityClassification: "Verified Evidence",
    eligibility: { eligible: true, reason: "Exact facility rate appears in the retained utility filing." },
    conflictsWithEvidenceIds: [],
    supersedesEvidenceIds: [],
    researchRunId: "6f9619ff-8b86-4d11-b42d-00c04fc964ff",
    observedAt: "2026-02-01T10:00:00.000Z",
  };
}

function event<Event extends ProofLedgerEvent>(value: Event): Event {
  return value;
}

function evidenceEvent(evidenceRecord: EvidenceObservation, eventId: string, recordedAt: string): StoredProofLedgerEvent {
  return {
    eventId,
    eventType: "evidence-observation",
    project: evidenceRecord.project,
    effectiveAt: evidenceRecord.observedAt,
    recordedAt,
    researchRunId: evidenceRecord.researchRunId,
    versions,
    decisionRef: null,
    payload: { evidence: evidenceRecord },
  };
}

test("project identity is stable and always separates campus from facility scope", () => {
  const repeated = createProjectIdentity({
    projectReference: " RED-OAK ",
    name: "Red Oak Data Center",
    scope: { kind: "facility", key: " BUILDING-1 " },
  });
  assert.equal(repeated.projectId, project.projectId);
  assert.notEqual(project.projectId, campus.projectId);
  assert.equal(project.scope.kind, "facility");
  assert.equal(campus.scope.kind, "campus");
  assert.equal(SAFELOC_PROOF_DIMENSIONS.length, 13);
  assert.deepEqual(new Set(SAFELOC_PROOF_DIMENSIONS).size, SAFELOC_PROOF_DIMENSIONS.length);
});

test("project state unknown is not inferred as early and can regress", () => {
  const unknown: StoredProofLedgerEvent = {
    eventId: "00000000-0000-4000-8000-000000000001",
    eventType: "project-state-change",
    project,
    effectiveAt: "2026-01-01T00:00:00.000Z",
    recordedAt: "2026-01-01T00:00:01.000Z",
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: {
      state: {
        project,
        stateKey: "development-stage",
        state: { status: "unknown", value: null },
        supportingEvidenceIds: [],
        stateVersion: "state-v1",
        asOfDate: null,
      },
    },
  };
  const early = {
    ...unknown,
    eventId: "00000000-0000-4000-8000-000000000002",
    recordedAt: "2026-02-01T00:00:01.000Z",
    effectiveAt: "2026-02-01T00:00:00.000Z",
    payload: {
      state: {
        ...unknown.payload.state,
        state: { status: "known" as const, value: "early" },
        stateVersion: "state-v2",
        asOfDate: "2026-02-01",
      },
    },
  };
  const regression = {
    ...early,
    eventId: "00000000-0000-4000-8000-000000000003",
    recordedAt: "2026-03-01T00:00:01.000Z",
    effectiveAt: "2026-03-01T00:00:00.000Z",
    payload: {
      state: {
        ...early.payload.state,
        state: { status: "known" as const, value: "planning" },
        stateVersion: "state-v3",
      },
    },
  };
  validateProofLedgerEvent(unknown);
  assert.equal(deriveProofLedgerProjection([unknown], "2026-01-02T00:00:00.000Z").statesByKey["development-stage"].state.status, "unknown");
  assert.equal(deriveProofLedgerProjection([unknown, early], "2026-02-02T00:00:00.000Z").statesByKey["development-stage"].state.status, "known");
  assert.equal(deriveProofLedgerProjection([unknown, early, regression], "2026-03-02T00:00:00.000Z").statesByKey["development-stage"].state.value, "planning");
  assert.doesNotThrow(() => validateProofLedgerEvent({
    ...unknown,
    eventId: "00000000-0000-4000-8000-000000000004",
    payload: {
      state: {
        ...unknown.payload.state,
        state: { status: "not-applicable", value: null, reason: "No construction phase applies." },
      },
    },
  }));
});

test("incomplete searches cannot become searched-not-found", () => {
  for (const state of ["partial", "not-run", "blocked", "failed"] as const) {
    assert.throws(() => validateSearchAssessment({
      searchId: `search-${state}`,
      project,
      dimension: "power-grid-interconnection",
      state,
      resolution: "searched-not-found",
      reason: "Fixture",
      queryIds: [],
      researchRunId: null,
      observedAt: "2026-02-01T00:00:00.000Z",
    }), /requires a complete search/);
  }
  assert.doesNotThrow(() => validateSearchAssessment({
    searchId: "complete-no-result",
    project,
    dimension: "power-grid-interconnection",
    state: "complete",
    resolution: "searched-not-found",
    reason: "All planned official sources were checked.",
    queryIds: ["query-1"],
    researchRunId: null,
    observedAt: "2026-02-01T00:00:00.000Z",
  }));
});

test("evidence distinguishes estimates from actuals and preserves source quality and dates", () => {
  const estimate = evidence("evidence-estimate", "estimate");
  const actual = evidence("evidence-actual", "actual");
  assert.notEqual(estimate.valueStatus, actual.valueStatus);
  assert.equal(estimate.sourceQualityClassification, "Verified Evidence");
  assert.equal(estimate.publicationDate, "2026-01-15");
  assert.equal(estimate.asOfDate, "2025-12-31");
  assert.equal(estimate.retainedPassageId, "passage-utility-filing-1");
  assert.equal(estimate.retainedPassage, "The named facility's delivered rate is $72/MWh.");
  assert.deepEqual(estimate.sourceIds, ["source-utility-filing-1"]);
});

test("contract rejects a record whose campus scope is attached to a facility ledger event", () => {
  const mismatched = event({
    eventId: "00000000-0000-4000-8000-000000000010",
    eventType: "evidence-observation",
    project: campus,
    effectiveAt: "2026-02-01T00:00:00.000Z",
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: { evidence: evidence("evidence-campus", "actual", project) },
  });
  assert.throws(() => validateProofLedgerEvent(mismatched), /identity or scope does not match/);
});

test("evidence observation cannot be detached from its research-run audit", () => {
  const record = evidence("evidence-wrong-run");
  assert.throws(() => validateProofLedgerEvent({
    eventId: "00000000-0000-4000-8000-000000000013",
    eventType: "evidence-observation",
    project,
    effectiveAt: record.observedAt,
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: { evidence: record },
  }), /research-run reference does not match/);
});

test("transmission proposals reject probability fields and mismatched project scope", () => {
  const proposal = {
    proposalId: "proposal-1",
    project,
    sourceEvidenceIds: [],
    affectedVariable: "grid-interconnection-months",
    currentValue: { value: 14, unit: "months" },
    proposedValue: { value: 20, unit: "months" },
    mechanism: "The cited queue milestone moves the expected energization date.",
    quantificationClass: "quantified" as const,
    formula: "20 - 14",
    supportLevel: "supported" as const,
    status: "proposed" as const,
    mappingPolicyVersion: 1,
  };
  const baseEvent = {
    eventId: "00000000-0000-4000-8000-000000000011",
    eventType: "transmission-proposal" as const,
    project,
    effectiveAt: "2026-02-01T00:00:00.000Z",
    researchRunId: null,
    versions,
    decisionRef: null,
  };
  assert.throws(() => validateProofLedgerEvent({
    ...baseEvent,
    payload: { proposal: { ...proposal, probability: 0.7 } },
  } as never), /cannot define probability/);
  assert.throws(() => validateProofLedgerEvent({
    ...baseEvent,
    payload: { proposal: { ...proposal, project: campus } },
  } as never), /identity or scope does not match/);
});

test("repository rejects source evidence from another project scope", async () => {
  const queries: string[] = [];
  const repository = createProofLedgerRepository({
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("FROM proof_ledger_events")) {
        return {
          rows: [{
            evidence_id: "evidence-campus",
            project_id: campus.projectId,
            scope_kind: "campus",
            scope_key: "main-campus",
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  } as never);
  await assert.rejects(repository.appendEvent({
    eventId: "00000000-0000-4000-8000-000000000012",
    eventType: "transmission-proposal",
    project,
    effectiveAt: "2026-02-01T00:00:00.000Z",
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: {
      proposal: {
        proposalId: "proposal-cross-scope",
        project,
        sourceEvidenceIds: ["evidence-campus"],
        affectedVariable: "grid-interconnection-months",
        currentValue: { value: 14, unit: "months" },
        proposedValue: { value: 20, unit: "months" },
        mechanism: "The campus queue milestone moves the facility energization date.",
        quantificationClass: "quantified",
        formula: null,
        supportLevel: "supported",
        status: "proposed",
        mappingPolicyVersion: 1,
      },
    },
  }), /different project scope/);
  assert.equal(queries.some((sql) => sql.includes("INSERT INTO proof_ledger_events")), false);
});

test("supersession is projected as a link and retains both observations", () => {
  const original = evidence("evidence-original");
  const replacement = evidence("evidence-replacement");
  const first = evidenceEvent(original, "00000000-0000-4000-8000-000000000020", "2026-01-02T00:00:00.000Z");
  const second = evidenceEvent(replacement, "00000000-0000-4000-8000-000000000021", "2026-02-02T00:00:00.000Z");
  const link: StoredProofLedgerEvent = {
    eventId: "00000000-0000-4000-8000-000000000022",
    eventType: "supersession",
    project,
    effectiveAt: "2026-02-02T00:00:00.000Z",
    recordedAt: "2026-02-02T00:00:01.000Z",
    researchRunId: null,
    versions,
    decisionRef: null,
    payload: {
      supersededEvidenceId: original.evidenceId,
      supersedingEvidenceId: replacement.evidenceId,
      reason: "A newer primary filing replaced the prior tariff.",
    },
  };
  const projection = deriveProofLedgerProjection([second, link, first], "2026-03-01T00:00:00.000Z");
  assert.equal(projection.evidence.length, 2);
  assert.deepEqual(projection.supersededEvidenceIds, ["evidence-original"]);
});

test("ledger projection is deterministic and answers what was recorded by a historical time", () => {
  const first = evidenceEvent(evidence("evidence-first"), "00000000-0000-4000-8000-000000000031", "2026-01-02T00:00:00.000Z");
  const later = evidenceEvent(evidence("evidence-later"), "00000000-0000-4000-8000-000000000032", "2026-02-02T00:00:00.000Z");
  const asOf = "2026-01-20T00:00:00.000Z";
  const left = deriveProofLedgerProjection([later, first], asOf);
  const right = deriveProofLedgerProjection([first, later], asOf);
  assert.deepEqual(left, right);
  assert.deepEqual(left.evidence.map((item) => item.evidenceId), ["evidence-first"]);
});

test("user decision persistence is separate and anonymous decisions cannot enter canonical history", async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const repository = createProofLedgerRepository({
    async query(sql: string, values?: unknown[]) {
      queries.push({ sql, values });
      if (sql.includes("FROM proof_user_decisions")) {
        return {
          rows: [{
            actor_kind: "anonymous-session",
            project_id: project.projectId,
            scope_kind: "facility",
            scope_key: "building-1",
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  } as never);
  const decision: ProofUserDecision = {
    decisionId: "00000000-0000-4000-8000-000000000040",
    project,
    actor: { kind: "anonymous-session", sessionRef: "fixture-session-ref" },
    decision: "accept",
    targetRef: "evidence-actual",
    rationale: "Reviewed within this session only.",
    decidedAt: "2026-02-01T00:00:00.000Z",
    versions,
  };
  await repository.recordDecision(decision);
  assert.match(queries[0].sql, /INSERT INTO proof_user_decisions/);
  assert.doesNotMatch(queries[0].sql, /proof_ledger_events/);
  assert.equal(queries[0].values?.[7], "fixture-session-ref");

  const accepted: ProofLedgerEvent = {
    eventId: "00000000-0000-4000-8000-000000000041",
    eventType: "accepted-model-input",
    project,
    effectiveAt: "2026-02-01T00:00:00.000Z",
    researchRunId: null,
    versions,
    decisionRef: decision.decisionId,
    payload: {
      input: {
        inputId: "input-1",
        sourceEvidenceId: "evidence-actual",
        dimension: "electricity-tariff",
        value: 72,
        unit: "USD/MWh",
        acceptanceReason: "Accepted for the reviewed scenario.",
      },
    },
  };
  await assert.rejects(repository.appendEvent(accepted), /Anonymous session decisions cannot be referenced/);
  assert.equal(queries.filter((call) => call.sql.includes("INSERT INTO proof_ledger_events")).length, 0);
});

test("repository persists policy, schema, model, source, and research-run metadata", async () => {
  let insertValues: unknown[] | undefined;
  const repository = createProofLedgerRepository({
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("INSERT INTO proof_ledger_events")) {
        insertValues = values;
        return {
          rows: [{
            event_id: values?.[0],
            recorded_at: "2026-02-02T00:00:00.000Z",
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    },
  } as never);
  const record = evidence("evidence-persisted");
  const persisted = await repository.appendEvent({
    eventId: "00000000-0000-4000-8000-000000000050",
    eventType: "evidence-observation",
    project,
    effectiveAt: record.observedAt,
    researchRunId: record.researchRunId,
    versions,
    decisionRef: null,
    payload: { evidence: record },
  });
  assert.equal(persisted.recordedAt, "2026-02-02T00:00:00.000Z");
  assert.equal(insertValues?.[8], record.researchRunId);
  assert.equal(insertValues?.[9], 1);
  assert.equal(insertValues?.[10], 7);
  assert.equal(insertValues?.[11], "underwriting-3");
  assert.equal(JSON.parse(insertValues?.[13] as string).evidence.sourceQualityClassification, "Verified Evidence");
});

test("migration is additive and protects canonical history from mutation", async () => {
  const migration = await readFile(new URL("../migrations/0005_safeloc_proof_ledger.sql", import.meta.url), "utf8");
  const repairMigration = await readFile(new URL("../migrations/0006_reconcile_proof_ledger.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS proof_ledger_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS proof_user_decisions/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON proof_ledger_events/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON proof_user_decisions/);
  assert.match(migration, /BEFORE TRUNCATE ON proof_ledger_events/);
  assert.match(migration, /BEFORE TRUNCATE ON proof_user_decisions/);
  assert.doesNotMatch(migration, /ALTER TABLE (?:dossiers|research_run_audits)/);
  assert.match(repairMigration, /CREATE TABLE IF NOT EXISTS proof_ledger_events/);
  assert.match(repairMigration, /CREATE TABLE IF NOT EXISTS proof_user_decisions/);
  assert.match(repairMigration, /CREATE INDEX IF NOT EXISTS proof_ledger_project_recorded_idx/);
  assert.match(repairMigration, /proof_ledger_events_validate_references/);
  assert.doesNotMatch(repairMigration, /DROP TRIGGER|DROP TABLE|ALTER TABLE/i);
});

if (process.env.DATABASE_URL && process.env.TEST_SAFELOC_DATABASE === "1") {
  test("development PostgreSQL persists decisions and proof events in one transaction", async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const repository = createProofLedgerRepository(client as never);
      const decision: ProofUserDecision = {
        decisionId: randomUUID(),
        project,
        actor: { kind: "authenticated", actorRef: randomUUID() },
        decision: "accept",
        targetRef: "evidence-database-integration",
        rationale: "Development-only transaction fixture.",
        decidedAt: new Date().toISOString(),
        versions,
      };
      await repository.recordDecision(decision);

      const observed = evidence(`evidence-${randomUUID()}`);
      const observationEventId = randomUUID();
      await repository.appendEvent({
        eventId: observationEventId,
        eventType: "evidence-observation",
        project,
        effectiveAt: observed.observedAt,
        researchRunId: observed.researchRunId,
        versions,
        decisionRef: null,
        payload: { evidence: observed },
      });
      const acceptedEventId = randomUUID();
      await repository.appendEvent({
        eventId: acceptedEventId,
        eventType: "accepted-model-input",
        project,
        effectiveAt: new Date().toISOString(),
        researchRunId: null,
        versions,
        decisionRef: decision.decisionId,
        payload: {
          input: {
            inputId: `input-${randomUUID()}`,
            sourceEvidenceId: observed.evidenceId,
            dimension: observed.dimension,
            value: observed.value,
            unit: observed.unit,
            acceptanceReason: "Development-only persistence fixture.",
          },
        },
      });

      const restoredEvents = await repository.listEvents(project.projectId);
      assert.deepEqual(
        restoredEvents.map((storedEvent) => storedEvent.eventId).sort(),
        [observationEventId, acceptedEventId].sort(),
      );
    } finally {
      if (transactionStarted) await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  });
}