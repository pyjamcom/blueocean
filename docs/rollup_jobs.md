# Engagement Rollups

## Purpose
Daily rollups keep weekly/seasonal progress stable without extra UI steps.

## Schedule
- Every 30 minutes: season/week rollover sweep (server in-memory + Redis).
- Nightly (recommended): analytics DB aggregation for retention and leaderboard views.
- Daily (03:30 UTC): engagement metrics rollup (D1/D7, churn, sessions/user) + daily alert check.
- Weekly (Mon 04:00 UTC): weekly engagement summary + alert check.

## Calculations
- Weekly rollover: move weeklyPoints -> lastWeekPoints, reset weeklyPoints.
- Season rollover: move seasonPoints -> lastSeasonPoints, reset seasonPoints.
- Season id: anchor `2026-02-01`, length `14` days (rolling).
- Team streak completion rate: recomputed from lastRoundDay on crew update.

## Guardrails
- Idempotent: rollup checks period IDs before reset.
- Safe: does not touch cosmetics or badges.

## Logs
- period:sweep:error on failures.
- season_rollover analytics event on client rollover.
- metrics:rollup:manual:start/metrics:rollup:manual:done for scheduled metrics tasks.
