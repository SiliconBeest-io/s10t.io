-- Normalize stored domains to lowercase in moderation tables.
--
-- Domains are DNS names and therefore case-insensitive, but these tables
-- stored admin input verbatim under SQLite's default BINARY collation while
-- every enforcement path compares a LOWERCASED domain with exact equality:
--   * domain_blocks       → isDomainBlocked (packages/shared/domain-blocks)
--   * email_domain_blocks → isEmailDomainBlocked (services/instance.ts)
--   * domain_allows       → no consumer yet, but same convention applies
-- A block row saved as 'Spam.Example.Com' therefore never matched and was
-- silently ineffective. createDomainBlock / createDomainAllow /
-- createEmailDomainBlock now lowercase on insert. This migration repairs
-- existing rows and enforces the invariant at the database layer.
-- (No semicolons inside comments — the test migration loader splits on them.)
--
-- Dedupe BEFORE lowercasing: domain columns are UNIQUE under BINARY
-- collation, so 'gmail.com' and 'GMAIL.com' may coexist and a bare UPDATE
-- would hit the UNIQUE constraint. Keep the earliest row (MIN(id): ULIDs
-- sort by creation time) per case-insensitive domain.

DELETE FROM domain_blocks
WHERE id NOT IN (SELECT MIN(id) FROM domain_blocks GROUP BY lower(domain));
UPDATE domain_blocks SET domain = lower(domain) WHERE domain != lower(domain);

DELETE FROM domain_allows
WHERE id NOT IN (SELECT MIN(id) FROM domain_allows GROUP BY lower(domain));
UPDATE domain_allows SET domain = lower(domain) WHERE domain != lower(domain);

DELETE FROM email_domain_blocks
WHERE id NOT IN (SELECT MIN(id) FROM email_domain_blocks GROUP BY lower(domain));
UPDATE email_domain_blocks SET domain = lower(domain) WHERE domain != lower(domain);

-- Enforce case-insensitive uniqueness going forward (mirrors the
-- idx_accounts_local_username_nocase pattern from migration 0030).
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_blocks_domain_nocase
  ON domain_blocks (domain COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_allows_domain_nocase
  ON domain_allows (domain COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_domain_blocks_domain_nocase
  ON email_domain_blocks (domain COLLATE NOCASE);
