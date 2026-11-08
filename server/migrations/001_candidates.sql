-- Catalog candidates: products parents added, for a manual review. No IP addresses, devices or lists.
-- The server also runs this at start (CREATE TABLE IF NOT EXISTS), so running it by hand is optional.
CREATE TABLE IF NOT EXISTS candidates (
  candidate_id text PRIMARY KEY,
  dedupe_key text UNIQUE NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
