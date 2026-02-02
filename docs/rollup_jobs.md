# Engagement Rollups

## Purpose
Daily rollups keep weekly/seasonal progress stable without extra UI steps.

## Schedule
- Every 30 minutes: season/week rollover sweep (server in-memory + Redis).
- Nightly (recommended): analytics DB aggregation for retention and leaderboard views.

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
