export interface ScoreInput {
  isCorrect: boolean;
  responseTimeMs: number;
  questionTimeMs: number;
}

export interface ScoreResult {
  points: number;
  correctIncrement: number;
  streakDelta: number;
}

const MAX_POINTS = 1000;

export function calculateSpeedScore(input: ScoreInput): ScoreResult {
  if (!input.isCorrect) {
    return { points: 0, correctIncrement: 0, streakDelta: -1 };
  }
  const durationMs = Math.max(1, input.questionTimeMs);
  const rawPoints = MAX_POINTS - (MAX_POINTS / durationMs) * Math.max(0, input.responseTimeMs);
  const points = Math.round(Math.max(0, Math.min(MAX_POINTS, rawPoints)));
  return { points, correctIncrement: 1, streakDelta: 1 };
}

export function calculateScore(input: ScoreInput): ScoreResult {
  return calculateSpeedScore(input);
}
