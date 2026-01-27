export interface JoinPayload {
  roomCode: string;
  playerId: string;
  avatarId: string;
}

export interface StartPayload {
  roomCode: string;
  seed: number;
}

export interface QuestionPayload {
  roomCode: string;
  questionId: string;
  timerMs: number;
}

export interface AnswerPayload {
  roomCode: string;
  playerId: string;
  answerIndex: number;
  latencyMs: number;
}

export interface LeaderboardEntry {
  playerId: string;
  avatarId: string;
  score: number;
  rank: number;
}

export interface PodiumEntry {
  playerId: string;
  avatarId: string;
  score?: number;
  correctCount?: number;
  rank: number;
}

export interface ScoreSelfEntry {
  score: number;
  rank: number;
  correctCount: number;
}

export interface ScorePayload {
  leaderboardTop5: LeaderboardEntry[];
  podiumTopN: PodiumEntry[];
  self: ScoreSelfEntry;
  mode: "speed" | "accuracy";
}

export interface NextPayload {
  roomCode: string;
  nextQuestionId: string;
}
