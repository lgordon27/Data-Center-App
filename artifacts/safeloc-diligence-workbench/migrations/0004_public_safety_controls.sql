CREATE TABLE IF NOT EXISTS public_request_events (
  id bigserial PRIMARY KEY,
  client_key text NOT NULL,
  requested_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS public_request_events_client_time_idx
  ON public_request_events (client_key, requested_at);

CREATE TABLE IF NOT EXISTS public_provider_spend (
  spend_day date PRIMARY KEY,
  spent_micro_usd bigint NOT NULL DEFAULT 0 CHECK (spent_micro_usd >= 0),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0)
);

CREATE TABLE IF NOT EXISTS research_result_cache (
  project_key text NOT NULL,
  location_key text NOT NULL,
  result jsonb NOT NULL,
  research_date date NOT NULL,
  application_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_key, location_key)
);