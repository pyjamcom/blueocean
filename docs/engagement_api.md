# Engagement API Summary

This is a quick, human-readable list of endpoints that back streaks, crews, leaderboards,
and lightweight analytics. For full schema details and error codes, see:
`docs/openapi/escapers-engagement.yaml`.

## Core endpoints
- GET `/health` — health check.
- GET `/feature-flags` — returns feature flags (team streaks, quests, cosmetics, etc.).
- GET `/leaderboard` — progress leaderboards (weekly/season; global/group).

## Crews (team streaks)
- POST `/crew/create` — create crew with owner.
- POST `/crew/join` — join crew by code.
- POST `/crew/leave` — leave crew (deletes if last member).
- POST `/crew/update` — update member stats (weekly points, streak, etc.).
- POST `/crew/kick` — owner kicks member.
- POST `/crew/ban` — owner bans member.
- GET `/crew/{code}` — crew detail.

## Analytics + compliance
- POST `/analytics` — client analytics event.
- POST `/client-error` — client error log.
- POST `/compliance/age` — age gate acceptance.

## Internal
- GET `/metrics` — process + room counters (for monitoring).
