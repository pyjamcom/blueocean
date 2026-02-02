# Analytics Events

## Events
- create_room
- qr_render
- qr_scan
- join_room
- round_start
- answer_select
- answer_rejected
- round_end
- leaderboard_view
- fun_score
- sharecard_generate
- replay_click
- streak_updated
- grace_used
- outage_detected
- outage_grace_used
- team_streak_day_completed
- team_completion_rate
- team_streak_broken
- season_rollover
- progress_points
- quest_assigned
- quest_completed
- badge_unlocked
- cosmetic_unlocked
- cosmetic_equipped
- group_joined
- group_left
- reminder_opt_in
- reminder_opt_out
- reminder_prompted

## Engagement payloads (selected)
- answer_rejected: { reason, playerId?, roomCode? }
- leaderboard_view: { period }
- fun_score: { period, score }
- streak_updated: { count }
- grace_used: { gap }
- outage_detected: { day }
- outage_grace_used: { gap }
- team_streak_day_completed: { count, completionRate }
- team_completion_rate: { completionRate }
- team_streak_broken: { previous }
- season_rollover: { seasonId }
- progress_points: { points, weekId }
- quest_assigned: { day }
- quest_completed: { questId }
- badge_unlocked: { badgeId }
- cosmetic_unlocked: { rewardId }
- cosmetic_equipped: { frameId }
- group_joined: { groupCode }
- group_left: { groupCode }
- reminder_opt_in/reminder_opt_out: { enabled }
- reminder_prompted: { day }

## KPI mappings
- Time‑to‑Start = round_start - create_room
- QR‑Join Rate = join_room / qr_render
- Session Completion = % sessions with final round
- Replay Intent = replay_click / sessions
- D1/D7 Retention = users with round_start on day+1/day+7
- Streak Completion Rate = team_streak_day_completed / streak_eligible_days
