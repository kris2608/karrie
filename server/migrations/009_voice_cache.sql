-- Shared TTS clips for generic, non-personalized phrases (no shopping lists or names).
CREATE TABLE IF NOT EXISTS voice_cache (
  cache_key text PRIMARY KEY,
  audio bytea NOT NULL,
  content_type text NOT NULL,
  model text NOT NULL,
  voice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS voice_cache_expires_at_idx ON voice_cache (expires_at);
