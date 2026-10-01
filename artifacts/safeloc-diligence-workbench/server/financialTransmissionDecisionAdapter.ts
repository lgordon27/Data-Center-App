import type { Pool, PoolClient } from "pg";
import {
  createProofLedgerRepository,
} from "./proofLedgerRepository.js";
import type {
  FinancialTransmissionDecisionTransactionContext,
  FinancialTransmissionDecisionTransaction,
  VerifiedFinancialDecisionContext,
} from "../src/model/financialTransmission.js";
import { expectedAffectedVariable } from "../src/model/financialTransmission.js";
import type {
  ProjectIdentity,
  StoredProofLedgerEvent,
} from "../src/model/safelocProofContract.js";

type VerifiedDecisionRow = {
  decision_id: string;
  project_id: string;
  project_reference: string;
  project_name: string;
  scope_kind: string;
  scope_key: string;
  actor_kind: string;
  decision: string;
  target_ref: string;
};

function isExactProject(row: VerifiedDecisionRow, project: ProjectIdentity) {
  return row.project_id === project.projectId &&
    row.project_reference === project.projectReference &&
    row.project_name === project.name &&
    row.scope_kind === project.scope.kind &&
    row.scope_key === project.scope.key;
}

async function lookupDecision(
  client: PoolClient,
  project: ProjectIdentity,
  decisionId: string,
): Promise<VerifiedFinancialDecisionContext | null> {
  const result = await client.query<VerifiedDecisionRow>(
    `SELECT decision_id, project_id, project_reference, project_name,
            scope_kind, scope_key, actor_kind, decision, target_ref
     FROM proof_user_decisions
     WHERE decision_id = $1`,
    [decisionId],
  );
  const row = result.rows[0];
  if (
    !row ||
    !isExactProject(row, project) ||
    row.actor_kind !== "authenticated" ||
    row.decision !== "accept"
  ) return null;
  return {
    decisionId: row.decision_id,
    project,
    actorKind: "authenticated",
    action: "accept",
    targetRef: row.target_ref,
  };
}

export function createFinancialTransmissionDecisionTransaction(
  pool: Pick<Pool, "connect">,
): FinancialTransmissionDecisionTransaction {
  return {
    async withLockedProject<T>(
      project: ProjectIdentity,
      operation: (context: FinancialTransmissionDecisionTransactionContext) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();
      let transactionOpen = false;
      try {
        await client.query("BEGIN");
        transactionOpen = true;
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`financial-transmission:${project.projectId}:${project.scope.kind}:${project.scope.key}`],
        );
        const repository = createProofLedgerRepository(client);
        const projection = await repository.projectAt(project.projectId);
        if (
          projection.events.some((event) =>
            event.project.projectReference !== project.projectReference ||
            event.project.name !== project.name ||
            event.project.scope.kind !== project.scope.kind ||
            event.project.scope.key !== project.scope.key,
          )
        ) {
          throw new Error("Locked proof ledger contains a conflicting project identity or scope.");
        }
        const result = await operation({
          projection,
          repository,
          verifyDecision: (decisionId) => lookupDecision(client, project, decisionId),
        });
        await client.query("COMMIT");
        transactionOpen = false;
        return result;
      } catch (error) {
        if (transactionOpen) await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export async function readVerifiedFinancialTransmissionDecisions(
  pool: Pick<Pool, "query">,
  project: ProjectIdentity,
  events: readonly StoredProofLedgerEvent[],
): Promise<VerifiedFinancialDecisionContext[]> {
  const references = [...new Set(events
    .filter((event) =>
      event.eventType === "accepted-model-input" &&
      event.project.projectId === project.projectId &&
      event.project.scope.kind === project.scope.kind &&
      event.project.scope.key === project.scope.key &&
      event.decisionRef,
    )
    .map((event) => event.decisionRef!)
  )];
  if (!references.length) return [];
  const result = await pool.query<VerifiedDecisionRow>(
    `SELECT decision_id, project_id, project_reference, project_name,
            scope_kind, scope_key, actor_kind, decision, target_ref
     FROM proof_user_decisions
     WHERE decision_id = ANY($1::uuid[])`,
    [references],
  );
  return result.rows
    .filter((row) =>
      isExactProject(row, project) &&
      row.actor_kind === "authenticated" &&
      row.decision === "accept" &&
      events.some((event) =>
        event.eventType === "accepted-model-input" &&
        event.decisionRef === row.decision_id &&
        row.target_ref.length > 0 &&
        events.some((proposalEvent) =>
          proposalEvent.eventType === "transmission-proposal" &&
          proposalEvent.payload.proposal.proposalId === row.target_ref &&
          proposalEvent.payload.proposal.status === "accepted" &&
          proposalEvent.payload.proposal.affectedVariable === expectedAffectedVariable(event.payload.input.inputId as Parameters<typeof expectedAffectedVariable>[0]) &&
          proposalEvent.payload.proposal.sourceEvidenceIds.includes(event.payload.input.sourceEvidenceId) &&
          proposalEvent.project.projectId === project.projectId &&
          proposalEvent.project.scope.kind === project.scope.kind &&
          proposalEvent.project.scope.key === project.scope.key,
        ),
      ),
    )
    .map((row) => ({
      decisionId: row.decision_id,
      project,
      actorKind: "authenticated" as const,
      action: "accept" as const,
      targetRef: row.target_ref,
    }));
}