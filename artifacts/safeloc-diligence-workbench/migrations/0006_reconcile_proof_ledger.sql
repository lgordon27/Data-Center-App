-- Reconcile databases that contain the pre-ledger schema but are missing the
-- proof tables from 0005. This is additive and safe to apply more than once.
CREATE TABLE IF NOT EXISTS proof_user_decisions (
  decision_id uuid PRIMARY KEY,
  project_id text NOT NULL,
  project_reference text NOT NULL,
  project_name text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('campus', 'phase', 'facility', 'unknown')),
  scope_key text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('anonymous-session', 'authenticated')),
  session_ref text,
  actor_ref text,
  decision text NOT NULL CHECK (decision IN ('accept', 'reject', 'override', 'defer', 'note')),
  target_ref text NOT NULL,
  rationale text NOT NULL,
  decided_at timestamptz NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  policy_version integer NOT NULL CHECK (policy_version > 0),
  model_version text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (actor_kind = 'anonymous-session' AND session_ref IS NOT NULL AND actor_ref IS NULL)
    OR (actor_kind = 'authenticated' AND actor_ref IS NOT NULL AND session_ref IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS proof_ledger_events (
  event_id uuid PRIMARY KEY,
  project_id text NOT NULL,
  project_reference text NOT NULL,
  project_name text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('campus', 'phase', 'facility', 'unknown')),
  scope_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'search-assessment',
    'evidence-observation',
    'project-state-change',
    'supersession',
    'transmission-proposal',
    'accepted-model-input'
  )),
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  research_run_id uuid,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  policy_version integer NOT NULL CHECK (policy_version > 0),
  model_version text,
  decision_ref uuid REFERENCES proof_user_decisions (decision_id),
  payload jsonb NOT NULL,
  CHECK (
    (decision_ref IS NULL AND event_type <> 'accepted-model-input')
    OR (decision_ref IS NOT NULL AND event_type = 'accepted-model-input')
  )
);

CREATE INDEX IF NOT EXISTS proof_ledger_project_recorded_idx
  ON proof_ledger_events (project_id, recorded_at, event_id);
CREATE INDEX IF NOT EXISTS proof_ledger_project_scope_idx
  ON proof_ledger_events (project_id, scope_kind, scope_key, recorded_at);
CREATE INDEX IF NOT EXISTS proof_ledger_research_run_idx
  ON proof_ledger_events (research_run_id) WHERE research_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proof_ledger_decision_ref_idx
  ON proof_ledger_events (decision_ref) WHERE decision_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS proof_user_decisions_session_idx
  ON proof_user_decisions (session_ref, recorded_at) WHERE actor_kind = 'anonymous-session';

CREATE OR REPLACE FUNCTION safeloc_reject_proof_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SafeLoc proof history is append-only; % is not allowed', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION safeloc_validate_proof_event_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  referenced_id text;
  referenced_count integer;
BEGIN
  IF NEW.decision_ref IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM proof_user_decisions decision
    WHERE decision.decision_id = NEW.decision_ref
      AND decision.actor_kind = 'authenticated'
      AND decision.project_id = NEW.project_id
      AND decision.scope_kind = NEW.scope_kind
      AND decision.scope_key = NEW.scope_key
  ) THEN
    RAISE EXCEPTION 'Canonical proof history requires a matching authenticated decision.';
  END IF;

  IF NEW.event_type = 'supersession' THEN
    FOREACH referenced_id IN ARRAY ARRAY[
      NEW.payload ->> 'supersededEvidenceId',
      NEW.payload ->> 'supersedingEvidenceId'
    ] LOOP
      SELECT count(*) INTO referenced_count
      FROM proof_ledger_events event
      WHERE event.event_type = 'evidence-observation'
        AND event.payload #>> '{evidence,evidenceId}' = referenced_id
        AND event.project_id = NEW.project_id
        AND event.scope_kind = NEW.scope_kind
        AND event.scope_key = NEW.scope_key;
      IF referenced_count = 0 THEN
        RAISE EXCEPTION 'Supersession evidence must exist in the same project scope.';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.proof_ledger_events'::regclass
      AND tgname = 'proof_ledger_events_append_only'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER proof_ledger_events_append_only
      BEFORE UPDATE OR DELETE ON public.proof_ledger_events
      FOR EACH ROW EXECUTE FUNCTION safeloc_reject_proof_history_mutation()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.proof_ledger_events'::regclass
      AND tgname = 'proof_ledger_events_no_truncate'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER proof_ledger_events_no_truncate
      BEFORE TRUNCATE ON public.proof_ledger_events
      FOR EACH STATEMENT EXECUTE FUNCTION safeloc_reject_proof_history_mutation()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.proof_user_decisions'::regclass
      AND tgname = 'proof_user_decisions_append_only'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER proof_user_decisions_append_only
      BEFORE UPDATE OR DELETE ON public.proof_user_decisions
      FOR EACH ROW EXECUTE FUNCTION safeloc_reject_proof_history_mutation()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.proof_user_decisions'::regclass
      AND tgname = 'proof_user_decisions_no_truncate'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER proof_user_decisions_no_truncate
      BEFORE TRUNCATE ON public.proof_user_decisions
      FOR EACH STATEMENT EXECUTE FUNCTION safeloc_reject_proof_history_mutation()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.proof_ledger_events'::regclass
      AND tgname = 'proof_ledger_events_validate_references'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER proof_ledger_events_validate_references
      BEFORE INSERT ON public.proof_ledger_events
      FOR EACH ROW EXECUTE FUNCTION safeloc_validate_proof_event_references()';
  END IF;
END;
$$;
