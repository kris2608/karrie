-- Cached healthier-alternative assessments keyed by evidence hash (no shopping lists).
CREATE TABLE IF NOT EXISTS healthier_assessments (
  evidence_hash text PRIMARY KEY,
  model text NOT NULL,
  rules_version text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS healthier_assessments_expires_at_idx ON healthier_assessments (expires_at);
