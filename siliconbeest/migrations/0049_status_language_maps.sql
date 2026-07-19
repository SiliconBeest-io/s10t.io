-- Preserve ActivityStreams natural-language maps so each viewer can receive
-- the variant matching their locale instead of sharing the first fetched one.
ALTER TABLE statuses ADD COLUMN title_map TEXT;
ALTER TABLE statuses ADD COLUMN content_map TEXT;
ALTER TABLE statuses ADD COLUMN content_warning_map TEXT;
