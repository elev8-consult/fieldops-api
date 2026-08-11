-- Mobile app user → assigned outlets (stores they may report on).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS user_outlets (
  user_id    uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  outlet_id  uuid NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_user_outlets_user   ON user_outlets (user_id);
CREATE INDEX IF NOT EXISTS idx_user_outlets_outlet ON user_outlets (outlet_id);
