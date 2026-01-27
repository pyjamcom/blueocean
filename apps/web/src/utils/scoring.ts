export type ScoringMode = "speed" | "accuracy";

export interface ScoreInput {
  isCorrect: boolean;
  responseTimeMs: number;
  questionTimeMs: number;
  pointsMultiplier: 0 | 1 | 2;
  mode: ScoringMode;
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
  const pointsPossible = MAX_POINTS * input.pointsMultiplier;
  if (input.responseTimeMs <= 500) {
    return { points: pointsPossible, correctIncrement: 1, streakDelta: 1 };
  }
  const ratio = 1 - (input.responseTimeMs / input.questionTimeMs) / 2;
  const clamped = Math.max(0, Math.min(1, ratio));
  const points = Math.round(pointsPossible * clamped);
  return { points, correctIncrement: 1, streakDelta: 1 };
}

export function calculateAccuracyScore(input: ScoreInput): ScoreResult {
  if (!input.isCorrect) {
    return { points: 0, correctIncrement: 0, streakDelta: -1 };
  }
  return { points: 1 * input.pointsMultiplier, correctIncrement: 1, streakDelta: 1 };
}

export function calculateScore(input: ScoreInput): ScoreResult {
  if (input.mode === "accuracy") {
    return calculateAccuracyScore(input);
  }
  return calculateSpeedScore(input);
}
