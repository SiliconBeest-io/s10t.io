-- Administrator-managed, clearly labelled timeline advertisements.
-- Image creatives reuse the existing authenticated media upload pipeline.
CREATE TABLE advertisements (
  id                        TEXT PRIMARY KEY,
  format                    TEXT NOT NULL
                              CHECK (format IN ('text', 'image', 'text_image', 'status')),
  text                      TEXT,
  image_media_attachment_id TEXT REFERENCES media_attachments(id) ON DELETE SET NULL,
  image_alt_text            TEXT NOT NULL DEFAULT '',
  status_id                 TEXT REFERENCES statuses(id) ON DELETE SET NULL,
  link_url                  TEXT,
  enabled                   INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  starts_at                 TEXT,
  ends_at                   TEXT,
  created_by_account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  CHECK (
    (format = 'text' AND text IS NOT NULL AND length(trim(text)) > 0)
    OR (format = 'image' AND image_media_attachment_id IS NOT NULL)
    OR (format = 'text_image' AND text IS NOT NULL AND length(trim(text)) > 0
        AND image_media_attachment_id IS NOT NULL)
    OR (format = 'status' AND status_id IS NOT NULL)
  ),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

CREATE INDEX idx_advertisements_active_window
  ON advertisements(enabled, starts_at, ends_at, created_at DESC);

CREATE INDEX idx_advertisements_status
  ON advertisements(status_id)
  WHERE status_id IS NOT NULL;
