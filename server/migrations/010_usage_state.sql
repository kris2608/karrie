-- Daily budgets and per-subject hit windows. Subject keys are hashes, not IP addresses.
CREATE TABLE IF NOT EXISTS usage_state (
  scope text PRIMARY KEY,
  day text NOT NULL,
  requests integer NOT NULL,
  cost_usd double precision NOT NULL,
  hits text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
