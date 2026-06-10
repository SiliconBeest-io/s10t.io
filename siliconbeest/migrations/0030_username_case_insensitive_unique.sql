-- Enforce case-insensitive uniqueness of LOCAL usernames.
--
-- The original `UNIQUE(username, domain)` constraint on `accounts` uses SQLite's
-- default BINARY collation, which is case-sensitive. That allowed two distinct
-- local actors whose handles differ only by case (e.g. "Alice" and "alice") to
-- coexist — a handle-squatting / impersonation vector. The only guard was the
-- application-level `COLLATE NOCASE` check performed at registration, which is a
-- non-atomic check-then-insert and therefore racy (two concurrent signups for
-- "Alice" and "alice" can both pass the check and both insert).
--
-- This partial unique index enforces the invariant atomically at the database
-- layer for local accounts only (domain IS NULL). Remote accounts are left
-- untouched because the remote server is authoritative for their casing and we
-- do not want to collapse legitimately distinct remote handles.
--
-- NOTE: If the database already contains case-variant local duplicates, this
-- statement will fail with a UNIQUE constraint error. That is intentional — the
-- conflict must be resolved manually before the invariant can be enforced. Find
-- offenders with this query (note: no trailing semicolon by design):
--   SELECT lower(username) AS u, COUNT(*) c FROM accounts
--   WHERE domain IS NULL GROUP BY u HAVING c > 1
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_local_username_nocase
  ON accounts (username COLLATE NOCASE)
  WHERE domain IS NULL;
