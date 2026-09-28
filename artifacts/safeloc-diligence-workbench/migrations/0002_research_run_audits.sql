CREATE TABLE IF NOT EXISTS research_run_audits (
  run_id uuid PRIMARY KEY,
  project_name text NOT NULL,
  project_location text NOT NULL,
  research_status text NOT NULL,
  project_summary jsonb NOT NULL,
  audit jsonb NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_run_audits_finished_at_idx ON research_run_audits (finished_at DESC);