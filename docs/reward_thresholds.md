# Reward Thresholds

## Streak Days
- 3 days: starter streak badge / light cosmetic.
- 7 days: rare badge / rare frame.
- 30 days: seasonal flex badge.

## Quest Targets
- 1-3 actions per quest (play round, 2-3 correct, 1-2 fast taps).
- Max 2 quests active.

## Grace Day (Streak страховка)
- 1 grace day per week (resets on weekly rollover).
- Consumed only when there is exactly 1 missed day (gap == 2).
- No banking beyond the weekly allowance.
- Separate outage grace does not reduce regular grace day count.

## Mastery Badges (quality focus)
- Accuracy >= 80% over 10 answers.
- Accuracy >= 90% over 20 answers.
- Fast corrects >= 3/5.
- Streaks >= 3/5/8.

All thresholds are short and predictable by design.

## Team Streak (Crew)
- Key action: complete 1 round today (`lastRoundDay` = today).
- completion_rate = members_with_lastRoundDay_today / total_members.
- Streak increments when completion_rate >= 0.6 and `lastDay` != today.
- Day boundary: server day key `YYYY-MM-DD` (UTC); no double counts.

## Quest Assignment (Mini-quests)
- Daily: 2 quests, max 1–3 actions each.
- Segments: `fresh` (roundsPlayed==0), `early` (05–11), `late` (20–05), `active` (streak >= 3).
- Prefer list: fresh/early → round+correct, late → fast+streak, active → streak-first.
- No repeats: avoid `lastQuestIds` from previous day.
- Heuristic only (no ML); always <5 minutes total.
