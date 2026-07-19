-- Persist the public activity signals used to personalize AI recommendations.
-- Retention is enforced by the Worker so writes can be deferred with waitUntil().
CREATE TABLE recommendation_activities (
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  activity_kind TEXT NOT NULL CHECK (activity_kind IN ('posted', 'reposted', 'liked')),
  status_id     TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  occurred_at   TEXT NOT NULL,
  PRIMARY KEY (account_id, activity_kind, status_id)
);

CREATE INDEX idx_recommendation_activities_account_occurred
  ON recommendation_activities(
    account_id,
    occurred_at DESC,
    status_id DESC,
    activity_kind
  );

CREATE INDEX idx_recommendation_activities_status
  ON recommendation_activities(status_id);

-- Seed each existing local user with their latest 30 eligible public events.
-- Reposts are stored against the original status, matching runtime writes.
WITH public_activity AS (
  SELECT
    s.account_id,
    'posted' AS activity_kind,
    s.id AS status_id,
    s.created_at AS occurred_at
  FROM statuses s
  JOIN users u ON u.account_id = s.account_id
  WHERE s.visibility = 'public'
    AND s.deleted_at IS NULL
    AND s.reblog_of_id IS NULL

  UNION ALL

  SELECT
    reblog.account_id,
    'reposted' AS activity_kind,
    original.id AS status_id,
    reblog.created_at AS occurred_at
  FROM statuses reblog
  JOIN users u ON u.account_id = reblog.account_id
  JOIN statuses original ON original.id = reblog.reblog_of_id
  WHERE reblog.deleted_at IS NULL
    AND original.visibility = 'public'
    AND original.deleted_at IS NULL
    AND original.reblog_of_id IS NULL

  UNION ALL

  SELECT
    favourite.account_id,
    'liked' AS activity_kind,
    original.id AS status_id,
    favourite.created_at AS occurred_at
  FROM favourites favourite
  JOIN users u ON u.account_id = favourite.account_id
  JOIN statuses original ON original.id = favourite.status_id
  WHERE original.visibility = 'public'
    AND original.deleted_at IS NULL
    AND original.reblog_of_id IS NULL
), ranked_activity AS (
  SELECT
    account_id,
    activity_kind,
    status_id,
    occurred_at,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY occurred_at DESC, status_id DESC, activity_kind
    ) AS activity_rank
  FROM public_activity
)
INSERT INTO recommendation_activities (
  account_id,
  activity_kind,
  status_id,
  occurred_at
)
SELECT account_id, activity_kind, status_id, occurred_at
FROM ranked_activity
WHERE activity_rank <= 30;
