ALTER TABLE research_run_audits
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

UPDATE research_run_audits
SET started_at = COALESCE(started_at, finished_at, now())
WHERE started_at IS NULL;

ALTER TABLE research_run_audits
  ALTER COLUMN started_at SET DEFAULT now(),
  ALTER COLUMN started_at SET NOT NULL,
  ALTER COLUMN finished_at DROP NOT NULL,
  ALTER COLUMN finished_at DROP DEFAULT;