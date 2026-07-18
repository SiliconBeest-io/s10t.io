-- Persistent, account-scoped post drafts.
-- The JSON payload keeps compose options extensible while the revision column
-- prevents delayed autosave requests from overwriting newer content.
CREATE TABLE post_drafts (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload    TEXT NOT NULL CHECK (length(payload) <= 262144),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX idx_post_drafts_user_updated
  ON post_drafts(user_id, updated_at DESC);
