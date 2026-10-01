import type { Pool } from "pg";
import {
  deriveProofLedgerProjection,
  evidenceIdsReferencedBy,
  validateProofLedgerEvent,
  validateProofUserDecision,
  type ProofLedgerEvent,
  type ProofLedgerProjection,
  type ProofUserDecision,
  type StoredProofLedgerEvent,
} from "../src/model/safelocProofContract.js";

type QueryClient = Pick<Pool, "query">;

type DecisionReferenceRow = {
  actor_kind: string;
  project_id: string;
  scope_kind: string;
  scope_key: string;
};

type EvidenceScopeRow = {
  evidence_id: string;
  project_id: string;
  scope_kind: string;
  scope_key: string;
  dimension: string;
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  throw new Error("Proof ledger returned an invalid timestamp.");
}

export function createProofLedgerRepository(client: QueryClient) {
  return {
    async recordDecision(decision: ProofUserDecision): Promise<void> {
      validateProofUserDecision(decision);
      const result = await client.query(
        `INSERT INTO proof_user_decisions
          (decision_id, project_id, project_reference, project_name, scope_kind, scope_key,
           actor_kind, session_ref, actor_ref, decision, target_ref, rationale, decided_at,
           schema_version, policy_version, model_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
           $13::timestamptz, $14, $15, $16)`,
        [
          decision.decisionId,
          decision.project.projectId,
          decision.project.projectReference,
          decision.project.name,
          decision.project.scope.kind,
          decision.project.scope.key,
          decision.actor.kind,
          decision.actor.kind === "anonymous-session" ? decision.actor.sessionRef : null,
          decision.actor.kind === "authenticated" ? decision.actor.actorRef : null,
          decision.decision,
          decision.targetRef,
          decision.rationale,
          decision.decidedAt,
          decision.versions.schemaVersion,
          decision.versions.policyVersion,
          decision.versions.modelVersion,
        ],
      );
      if (result.rowCount !== 1) throw new Error("Proof decision ID already exists.");
    },

    async appendEvent(event: ProofLedgerEvent): Promise<StoredProofLedgerEvent> {
      validateProofLedgerEvent(event);

      if (event.decisionRef) {
        const decision = await client.query<DecisionReferenceRow>(
          `SELECT actor_kind, project_id, scope_kind, scope_key
           FROM proof_user_decisions WHERE decision_id = $1`,
          [event.decisionRef],
        );
        const row = decision.rows[0];
        if (!row) throw new Error("Proof decision reference was not found.");
        if (row.actor_kind !== "authenticated") {
          throw new Error("Anonymous session decisions cannot be referenced by canonical history.");
        }
        if (
          row.project_id !== event.project.projectId ||
          row.scope_kind !== event.project.scope.kind ||
          row.scope_key !== event.project.scope.key
        ) {
          throw new Error("Proof decision reference has a different project scope.");
        }
      }

      const evidenceIds = evidenceIdsReferencedBy(event);
      if (evidenceIds.length > 0) {
        const evidenceResult = await client.query<EvidenceScopeRow>(
          `SELECT payload #>> '{evidence,evidenceId}' AS evidence_id,
                  payload #>> '{evidence,dimension}' AS dimension,
                  project_id, scope_kind, scope_key
           FROM proof_ledger_events
           WHERE event_type = 'evidence-observation'
             AND payload #>> '{evidence,evidenceId}' = ANY($1::text[])`,
          [evidenceIds],
        );
        const byId = new Map(evidenceResult.rows.map((row) => [row.evidence_id, row]));
        for (const evidenceId of evidenceIds) {
          const row = byId.get(evidenceId);
          if (!row) throw new Error(`Referenced evidence ${evidenceId} was not found.`);
          if (
            row.project_id !== event.project.projectId ||
            row.scope_kind !== event.project.scope.kind ||
            row.scope_key !== event.project.scope.key
          ) {
            throw new Error("Referenced evidence belongs to a different project scope.");
          }
          if (event.eventType === "accepted-model-input" && row.dimension !== event.payload.input.dimension) {
            throw new Error("Accepted model input dimension does not match its source evidence.");
          }
        }
      }

      const result = await client.query<{ event_id: string; recorded_at: Date | string }>(
        `INSERT INTO proof_ledger_events
          (event_id, project_id, project_reference, project_name, scope_kind, scope_key,
           event_type, effective_at, research_run_id, schema_version, policy_version,
           model_version, decision_ref, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::uuid, $10, $11, $12,
           $13::uuid, $14::jsonb)
         RETURNING event_id, recorded_at`,
        [
          event.eventId,
          event.project.projectId,
          event.project.projectReference,
          event.project.name,
          event.project.scope.kind,
          event.project.scope.key,
          event.eventType,
          event.effectiveAt,
          event.researchRunId,
          event.versions.schemaVersion,
          event.versions.policyVersion,
          event.versions.modelVersion,
          event.decisionRef,
          JSON.stringify(event.payload),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Proof ledger event was not persisted.");
      if (result.rowCount !== 1) throw new Error("Proof ledger event ID already exists.");
      return { ...event, recordedAt: iso(row.recorded_at) } as StoredProofLedgerEvent;
    },

    async listEvents(projectId: string, asOfRecordedAt = new Date().toISOString()): Promise<StoredProofLedgerEvent[]> {
      const result = await client.query(
        `SELECT event_id, project_reference, project_name, scope_kind, scope_key, event_type,
                effective_at, recorded_at, research_run_id, schema_version, policy_version,
                model_version, decision_ref, payload
         FROM proof_ledger_events
         WHERE project_id = $1 AND recorded_at <= $2::timestamptz
         ORDER BY recorded_at ASC, event_id ASC`,
        [projectId, asOfRecordedAt],
      );
      return result.rows.map((row) => {
        const project = {
          projectId,
          projectReference: row.project_reference,
          name: row.project_name,
          scope: { kind: row.scope_kind, key: row.scope_key },
        };
        return {
          eventId: row.event_id,
          eventType: row.event_type,
          project,
          effectiveAt: iso(row.effective_at),
          recordedAt: iso(row.recorded_at),
          researchRunId: row.research_run_id,
          versions: {
            schemaVersion: row.schema_version,
            policyVersion: row.policy_version,
            modelVersion: row.model_version,
          },
          decisionRef: row.decision_ref,
          payload: row.payload,
        } as StoredProofLedgerEvent;
      });
    },

    async projectAt(projectId: string, asOfRecordedAt = new Date().toISOString()): Promise<ProofLedgerProjection> {
      const events = await this.listEvents(projectId, asOfRecordedAt);
      return deriveProofLedgerProjection(events, asOfRecordedAt);
    },
  };
}

let repository: ReturnType<typeof createProofLedgerRepository> | null = null;

export async function getProofLedgerRepository() {
  if (!repository) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for SafeLoc proof ledger persistence.");
    }
    const { pool } = await import("./db.js");
    repository = createProofLedgerRepository(pool);
  }
  return repository;
}