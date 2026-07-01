-- FEP-044f: consent-respecting quote posts
-- Tracks approval state on quote posts and stores dereferenceable approval stamps.

ALTER TABLE statuses ADD COLUMN quote_authorization_uri TEXT;
ALTER TABLE statuses ADD COLUMN quote_approval_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE statuses ADD COLUMN quote_request_uri TEXT;

CREATE TABLE quote_authorizations (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL UNIQUE,
  attributed_to_account_id TEXT NOT NULL,
  interacting_object_uri TEXT NOT NULL,
  interaction_target_uri TEXT NOT NULL,
  quote_status_id TEXT,
  quoted_status_id TEXT,
  request_uri TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (attributed_to_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (quote_status_id) REFERENCES statuses(id) ON DELETE SET NULL,
  FOREIGN KEY (quoted_status_id) REFERENCES statuses(id) ON DELETE SET NULL
);

CREATE INDEX idx_quote_authorizations_interacting ON quote_authorizations(interacting_object_uri);
CREATE INDEX idx_quote_authorizations_target ON quote_authorizations(interaction_target_uri);
CREATE INDEX idx_quote_authorizations_quote_status ON quote_authorizations(quote_status_id);
CREATE INDEX idx_statuses_quote_authorization ON statuses(quote_authorization_uri);
