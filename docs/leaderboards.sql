-- Escapers engagement analytics (reference SQL)
-- Assumes table analytics_events(event_name, user_id, session_id, event_at, meta JSONB)

-- Weekly progress leaderboard (delta vs last week)
WITH weekly AS (
  SELECT
    user_id,
    date_trunc('week', event_at) AS week_start,
    SUM(CASE WHEN event_name = 'progress_points' THEN (meta->>'points')::int ELSE 0 END) AS week_points
  FROM analytics_events
  WHERE event_at >= now() - interval '30 days'
  GROUP BY 1, 2
),
weekly_with_prev AS (
  SELECT
    w1.user_id,
    w1.week_start,
    w1.week_points,
    COALESCE(w0.week_points, 0) AS last_week_points,
    GREATEST(w1.week_points - COALESCE(w0.week_points, 0), 0) AS delta_points,
    CASE
      WHEN COALESCE(w0.week_points, 0) <= 0 THEN CASE WHEN w1.week_points > 0 THEN 100 ELSE 0 END
      ELSE LEAST(200, ROUND(((w1.week_points - w0.week_points)::numeric / NULLIF(w0.week_points, 0)) * 100))
    END AS progress_percent
  FROM weekly w1
  LEFT JOIN weekly w0
    ON w0.user_id = w1.user_id
   AND w0.week_start = w1.week_start - interval '7 days'
)
SELECT * FROM weekly_with_prev;

-- D1 retention
WITH first_seen AS (
  SELECT user_id, MIN(date_trunc('day', event_at)) AS first_day
  FROM analytics_events
  WHERE event_name IN ('round_start', 'join_room')
  GROUP BY 1
),
retained AS (
  SELECT f.user_id
  FROM first_seen f
  JOIN analytics_events e
    ON e.user_id = f.user_id
   AND date_trunc('day', e.event_at) = f.first_day + interval '1 day'
)
SELECT COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM first_seen), 0) AS d1_retention
FROM retained;

-- D7 retention
WITH first_seen AS (
  SELECT user_id, MIN(date_trunc('day', event_at)) AS first_day
  FROM analytics_events
  WHERE event_name IN ('round_start', 'join_room')
  GROUP BY 1
),
retained AS (
  SELECT f.user_id
  FROM first_seen f
  JOIN analytics_events e
    ON e.user_id = f.user_id
   AND date_trunc('day', e.event_at) = f.first_day + interval '7 day'
)
SELECT COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM first_seen), 0) AS d7_retention
FROM retained;

-- Sessions per user (7d)
SELECT user_id, COUNT(DISTINCT session_id) AS sessions_7d
FROM analytics_events
WHERE event_at >= now() - interval '7 days'
GROUP BY 1;

-- Churn proxy: users without events in last 7 days
WITH active AS (
  SELECT DISTINCT user_id
  FROM analytics_events
  WHERE event_at >= now() - interval '7 days'
),
all_users AS (
  SELECT DISTINCT user_id FROM analytics_events
)
SELECT COUNT(*)::float / NULLIF((SELECT COUNT(*) FROM all_users), 0) AS churn_proxy
FROM all_users
LEFT JOIN active USING (user_id)
WHERE active.user_id IS NULL;
