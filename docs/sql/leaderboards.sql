-- Leaderboard aggregation views for weekly and season charts.
-- These views implement FunScore with simple caps to avoid farming.

CREATE OR REPLACE VIEW leaderboard_weekly_funscore AS
WITH params AS (
  SELECT date_trunc('week', now())::date AS week_start
),
game AS (
  SELECT user_id, SUM(points) AS game_points
  FROM round_scores
  WHERE occurred_at >= (SELECT week_start FROM params)
    AND occurred_at <  (SELECT week_start FROM params) + INTERVAL '7 days'
  GROUP BY user_id
),
streak AS (
  SELECT user_id, COUNT(*) AS streak_days
  FROM daily_activity
  WHERE activity_date >= (SELECT week_start FROM params)
    AND activity_date <  (SELECT week_start FROM params) + INTERVAL '7 days'
    AND key_action_done = true
  GROUP BY user_id
),
badges AS (
  SELECT user_id, COUNT(*) AS mastery_badges
  FROM user_badges
  WHERE earned_at >= (SELECT week_start FROM params)
    AND earned_at <  (SELECT week_start FROM params) + INTERVAL '7 days'
    AND badge_id IN ('accuracy_3', 'accuracy_5', 'streak_5', 'speed_5')
  GROUP BY user_id
),
quests AS (
  SELECT user_id, COUNT(*) AS quests_done
  FROM user_quests
  WHERE completed_at >= (SELECT week_start FROM params)
    AND completed_at <  (SELECT week_start FROM params) + INTERVAL '7 days'
  GROUP BY user_id
),
scores AS (
  SELECT u.id AS user_id,
         LEAST(COALESCE(g.game_points, 0), 2000) AS game_points_capped,
         LEAST(COALESCE(s.streak_days, 0), 7) * 80 AS streak_points,
         LEAST(COALESCE(b.mastery_badges, 0), 3) * 150 AS badge_points,
         LEAST(COALESCE(q.quests_done, 0), 7) * 20 AS quest_points
  FROM users u
  LEFT JOIN game g ON g.user_id = u.id
  LEFT JOIN streak s ON s.user_id = u.id
  LEFT JOIN badges b ON b.user_id = u.id
  LEFT JOIN quests q ON q.user_id = u.id
),
fun AS (
  SELECT user_id,
         game_points_capped,
         streak_points,
         badge_points,
         quest_points,
         game_points_capped + streak_points + badge_points + quest_points AS fun_score,
         (SELECT week_start FROM params) AS week_start
  FROM scores
)
SELECT gm.group_id,
       f.user_id,
       f.week_start,
       f.fun_score,
       f.game_points_capped,
       f.streak_points,
       f.badge_points,
       f.quest_points
FROM fun f
LEFT JOIN group_members gm ON gm.user_id = f.user_id;

CREATE OR REPLACE VIEW leaderboard_weekly_progress AS
WITH current_week AS (
  SELECT *
  FROM leaderboard_weekly_funscore
),
prev_week AS (
  SELECT *
  FROM leaderboard_weekly_funscore
  WHERE week_start = date_trunc('week', now())::date - INTERVAL '7 days'
),
delta AS (
  SELECT c.group_id,
         c.user_id,
         c.week_start,
         c.fun_score,
         c.fun_score - COALESCE(p.fun_score, 0) AS delta_points
  FROM current_week c
  LEFT JOIN prev_week p
    ON p.user_id = c.user_id
   AND p.group_id = c.group_id
),
ranked AS (
  SELECT group_id,
         user_id,
         week_start,
         fun_score,
         delta_points,
         percent_rank() OVER (PARTITION BY group_id ORDER BY delta_points DESC) AS pr
  FROM delta
)
SELECT group_id,
       user_id,
       week_start,
       fun_score,
       delta_points,
       CASE
         WHEN pr <= 0.10 THEN 'Top10'
         WHEN pr <= 0.25 THEN 'Top25'
         WHEN pr <= 0.50 THEN 'Top50'
         ELSE 'Top100'
       END AS percentile_band
FROM ranked;

CREATE OR REPLACE VIEW leaderboard_season_funscore AS
WITH season AS (
  SELECT id, start_date, end_date
  FROM seasons
  WHERE now()::date >= start_date
    AND now()::date < end_date
  ORDER BY start_date DESC
  LIMIT 1
),
game AS (
  SELECT user_id, SUM(points) AS game_points
  FROM round_scores
  WHERE occurred_at >= (SELECT start_date FROM season)
    AND occurred_at <  (SELECT end_date FROM season)
  GROUP BY user_id
),
streak AS (
  SELECT user_id, COUNT(*) AS streak_days
  FROM daily_activity
  WHERE activity_date >= (SELECT start_date FROM season)
    AND activity_date <  (SELECT end_date FROM season)
    AND key_action_done = true
  GROUP BY user_id
),
badges AS (
  SELECT user_id, COUNT(*) AS mastery_badges
  FROM user_badges
  WHERE earned_at >= (SELECT start_date FROM season)
    AND earned_at <  (SELECT end_date FROM season)
    AND badge_id IN ('accuracy_3', 'accuracy_5', 'streak_5', 'speed_5')
  GROUP BY user_id
),
quests AS (
  SELECT user_id, COUNT(*) AS quests_done
  FROM user_quests
  WHERE completed_at >= (SELECT start_date FROM season)
    AND completed_at <  (SELECT end_date FROM season)
  GROUP BY user_id
),
scores AS (
  SELECT u.id AS user_id,
         LEAST(COALESCE(g.game_points, 0), 2000) AS game_points_capped,
         LEAST(COALESCE(s.streak_days, 0), 14) * 80 AS streak_points,
         LEAST(COALESCE(b.mastery_badges, 0), 6) * 150 AS badge_points,
         LEAST(COALESCE(q.quests_done, 0), 14) * 20 AS quest_points
  FROM users u
  LEFT JOIN game g ON g.user_id = u.id
  LEFT JOIN streak s ON s.user_id = u.id
  LEFT JOIN badges b ON b.user_id = u.id
  LEFT JOIN quests q ON q.user_id = u.id
),
fun AS (
  SELECT user_id,
         game_points_capped + streak_points + badge_points + quest_points AS fun_score,
         (SELECT id FROM season) AS season_id
  FROM scores
)
SELECT gm.group_id,
       f.user_id,
       f.season_id,
       f.fun_score
FROM fun f
LEFT JOIN group_members gm ON gm.user_id = f.user_id;
