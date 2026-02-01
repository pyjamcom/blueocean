# Analytics Events

## Events
- create_room
- qr_render
- qr_scan
- join_room
- round_start
- answer_select
- round_end
- leaderboard_view
- sharecard_generate
- replay_click
- team_streak_day_completed
- team_completion_rate
- team_streak_broken

## Engagement payloads (selected)
- team_streak_day_completed: { count, completionRate }
- team_completion_rate: { completionRate }
- team_streak_broken: { previous }

## KPI mappings
- Time‑to‑Start = round_start - create_room
- QR‑Join Rate = join_room / qr_render
- Session Completion = % sessions with final round
- Replay Intent = replay_click / sessions
