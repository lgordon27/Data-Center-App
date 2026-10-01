import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import {
  createProjectIdentity,
  type ProofUserDecision,
  type StoredProofLedgerEvent,
} from "../src/model/safelocProofContract.js";
import {
  createFinancialTransmissionDecisionTransaction,
  readVerifiedFinancialTransmissionDecisions,
} from "./financialTransmissionDecisionAdapter.js";

const project = createProjectIdentity({
  projectReference: "decision-adapter-project",
  name: "Decision adapter project",
  scope: { kind: "facility", key: "decision-adapter-facility" },
});

function fakePool(decision = "accept") {
  const queries: string[] = [];
  let released = false;
  const client = {
    async query(text: string) {
      queries.push(text);
      if (text.includes("FROM proof_ledger_events")) return { rows: [], rowCount: 0 };
      if (text.includes("FROM proof_user_decisions")) {
        return {
          rows: [{
            decision_id: "decision-adapter-1",
            project_id: project.projectId,
            project_reference: project.projectReference,
            project_name: project.name,
            scope_kind: project.scope.kind,
            scope_key: project.scope.key,
            actor_kind: "authenticated",
            decision,
            target_ref: "proposal-adapter-1",
          }],
          rowCount: 1,
        };
      }
      if (text.includes("INSERT INTO proof_user_decisions")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {
      released = true;
    },
  };
  const pool = { async connect() { return client; } } as unknown as Pick<Pool, "connect">;
  return { pool, queries, wasReleased: () => released, client: client as unknown as PoolClient };
}

const decision: ProofUserDecision = {
  decisionId: "decision-adapter-1",
  project,
  actor: { kind: "authenticated", actorRef: "reviewer-1" },
  decision: "accept",
  targetRef: "proposal-adapter-1",
  rationale: "Test atomicity.",
  decidedAt: "2026-09-10T12:00:00.000Z",
  versions: { schemaVersion: 1, policyVersion: 1, modelVersion: "test-model-v1" },
};

test("financial decision adapter locks and rereads the project, and rolls back partial durable writes", async () => {
  const fake = fakePool();
  const transaction = createFinancialTransmissionDecisionTransaction(fake.pool);
  await assert.rejects(transaction.withLockedProject(project, async ({ repository }) => {
    await repository.recordDecision(decision);
    throw new Error("simulated event write failure");
  }), /simulated event write failure/);

  assert.ok(fake.queries[0]?.includes("BEGIN"));
  const lock = fake.queries.findIndex((query) => query.includes("pg_advisory_xact_lock"));
  const reread = fake.queries.findIndex((query) => query.includes("FROM proof_ledger_events"));
  const insert = fake.queries.findIndex((query) => query.includes("INSERT INTO proof_user_decisions"));
  const rollback = fake.queries.findIndex((query) => query.includes("ROLLBACK"));
  assert.ok(lock > 0 && reread > lock && insert > reread && rollback > insert);
  assert.equal(fake.queries.some((query) => query.includes("COMMIT")), false);
  assert.equal(fake.wasReleased(), true);
});

test("decision lookup verifies authenticated accept action, exact target, project, and scope", async () => {
  const acceptedPool = fakePool("accept");
  const accepted = await createFinancialTransmissionDecisionTransaction(acceptedPool.pool)
    .withLockedProject(project, async ({ verifyDecision }) => verifyDecision("decision-adapter-1"));
  assert.deepEqual(accepted, {
    decisionId: "decision-adapter-1",
    project,
    actorKind: "authenticated",
    action: "accept",
    targetRef: "proposal-adapter-1",
  });

  const rejectedPool = fakePool("reject");
  const rejected = await createFinancialTransmissionDecisionTransaction(rejectedPool.pool)
    .withLockedProject(project, async ({ verifyDecision }) => verifyDecision("decision-adapter-1"));
  assert.equal(rejected, null);
});

test("replay decision lookup binds accepted model input to its accepted proposal decision", async () => {
  const proposalEvent = {
    eventId: "proposal-event",
    eventType: "transmission-proposal",
    project,
    effectiveAt: "2026-09-10T12:00:00.000Z",
    recordedAt: "2026-09-10T12:00:00.000Z",
    researchRunId: null,
    versions: { schemaVersion: 1, policyVersion: 1, modelVersion: "test-model-v1" },
    decisionRef: null,
    payload: {
      proposal: {
        proposalId: "proposal-adapter-1",
        project,
        sourceEvidenceIds: ["source-evidence-1"],
        affectedVariable: "electricity_cost",
        currentValue: { value: 42, unit: "USD/MWh" },
        proposedValue: { value: 30, unit: "USD/MWh" },
        mechanism: "Retained tariff passage.",
        quantificationClass: "quantified",
        formula: "normalize-electricity_cost-with-versioned-unit-whitelist-v2",
        supportLevel: "supported",
        status: "accepted",
        mappingPolicyVersion: 2,
      },
    },
  } as StoredProofLedgerEvent;
  const inputEvent = {
    eventId: "input-event",
    eventType: "accepted-model-input",
    project,
    effectiveAt: "2026-09-10T12:00:00.000Z",
    recordedAt: "2026-09-10T12:00:01.000Z",
    researchRunId: null,
    versions: { schemaVersion: 1, policyVersion: 1, modelVersion: "test-model-v1" },
    decisionRef: "decision-adapter-1",
    payload: {
      input: {
        inputId: "electricity_cost",
        sourceEvidenceId: "source-evidence-1",
        dimension: "electricity-tariff",
        value: 30,
        unit: "USD/MWh",
        acceptanceReason: "Approved.",
      },
    },
  } as StoredProofLedgerEvent;
  const queryPool = {
    async query() {
      return {
        rows: [{
          decision_id: "decision-adapter-1",
          project_id: project.projectId,
          project_reference: project.projectReference,
          project_name: project.name,
          scope_kind: project.scope.kind,
          scope_key: project.scope.key,
          actor_kind: "authenticated",
          decision: "accept",
          target_ref: "proposal-adapter-1",
        }],
      };
    },
  };
  const verified = await readVerifiedFinancialTransmissionDecisions(
    queryPool,
    project,
    [proposalEvent, inputEvent],
  );
  assert.deepEqual(verified, [{
    decisionId: "decision-adapter-1",
    project,
    actorKind: "authenticated",
    action: "accept",
    targetRef: "proposal-adapter-1",
  }]);
  assert.deepEqual(
    await readVerifiedFinancialTransmissionDecisions(queryPool, project, [inputEvent]),
    [],
  );
});