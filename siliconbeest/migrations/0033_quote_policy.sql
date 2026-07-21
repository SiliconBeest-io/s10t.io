-- FEP-044f: per-account and per-status quote policies.
-- Values: public, followers, nobody.

ALTER TABLE users ADD COLUMN default_quote_policy TEXT NOT NULL DEFAULT 'public';
ALTER TABLE statuses ADD COLUMN quote_policy TEXT NOT NULL DEFAULT 'public';

