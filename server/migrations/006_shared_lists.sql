-- Temporary shopping-list snapshots for short /l/{id} share links (48h TTL).

CREATE TABLE IF NOT EXISTS shared_lists (
  id text PRIMARY KEY,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS shared_lists_expires_at_idx ON shared_lists (expires_at);
CREATE INDEX IF NOT EXISTS shared_lists_content_hash_idx ON shared_lists (content_hash);
