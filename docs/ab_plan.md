# A/B Plan (Engagement)

## Core metrics
- D1 / D7 retention
- churn rate
- sessions per user
- streak completion rate
- quest completion rate

## Experiments
1) Team streaks on/off
- unit: group
- duration: 14 days
- sample: 500 groups
- primary: D1, team_streak_day_completed
- guardrails: answer_rejected, client_error

2) Progress leaderboard
- unit: user
- duration: 14 days
- sample: 800 users
- primary: D7, leaderboard_view
- guardrail: churn

3) Daily quests
- unit: user
- duration: 10 days
- sample: 600 users
- primary: quest_completed, D1

4) Cosmetics collection
- unit: user
- duration: 14 days
- sample: 600 users
- primary: cosmetic_unlocked, D7

5) Reminder opt-in
- unit: user
- duration: 10 days
- sample: 500 users
- primary: reminder_opt_in, D1

## Sampling
- Min 2 full weekly cycles.
- Stop early only if guardrails breach > 2 days.
