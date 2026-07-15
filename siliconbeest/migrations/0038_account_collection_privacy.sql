-- Social-graph privacy for local preferences and cached remote Actor policy.
-- Local accounts retain the existing public default. Every pre-existing remote
-- Actor starts closed because advertised URLs do not prove that either
-- collection exposes a public first page. A signed full fetch may reopen it.
ALTER TABLE accounts ADD COLUMN hide_collections INTEGER NOT NULL DEFAULT 0;

UPDATE accounts
SET hide_collections = 1
WHERE domain IS NOT NULL;
