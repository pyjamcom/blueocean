export type EngagementFlagKey =
  | "teamStreaks"
  | "seasons"
  | "progressLeaderboard"
  | "graceDay"
  | "masteryBadges"
  | "miniQuests"
  | "cosmetics"
  | "groups";

export interface QuestDefinition {
  id: string;
  label: string;
  target: number;
  rewardId?: string;
  type: "round" | "correct" | "fast" | "streak";
}

export interface QuestProgress extends QuestDefinition {
  progress: number;
  completedAt?: string | null;
}

export interface BadgeDefinition {
  id: string;
  label: string;
  emoji: string;
}

export interface CosmeticDefinition {
  id: string;
  label: string;
  type: "frame" | "effect";
  rarity: "common" | "rare";
}

export interface EngagementSeason {
  id: string;
  startDay: string;
  endDay: string;
  lengthDays: number;
}

export interface EngagementWeek {
  id: string;
  points: number;
  lastWeekPoints: number;
}

export interface EngagementStreak {
  current: number;
  best: number;
  lastDay: string | null;
  graceLeft: number;
  graceUsedOn?: string | null;
}

export interface TeamStreak {
  current: number;
  lastDay: string | null;
  completionRate: number;
}

export interface EngagementBadges {
  unlocked: string[];
  lastEarned?: string | null;
}

export interface EngagementQuests {
  daily: QuestProgress[];
  lastAssignedDay: string | null;
  lastQuestIds: string[];
}

export interface EngagementCosmetics {
  unlocked: string[];
  equipped: {
    frame?: string | null;
    effect?: string | null;
  };
}

export interface EngagementStats {
  fastCorrects: number;
  totalCorrect: number;
  roundsPlayed: number;
  lastRoundDay: string | null;
}

export interface EngagementGroup {
  code: string;
  name: string;
  role: "owner" | "member";
}

export interface EngagementState {
  version: number;
  updatedAt: number;
  season: EngagementSeason;
  week: EngagementWeek;
  streak: EngagementStreak;
  teamStreak: TeamStreak;
  badges: EngagementBadges;
  quests: EngagementQuests;
  cosmetics: EngagementCosmetics;
  stats: EngagementStats;
  group: EngagementGroup | null;
}

export interface RoundCompleteInput {
  answeredCount: number;
  totalPlayers: number;
}

export interface AnswerResultInput {
  correct: boolean;
  latencyMs: number;
  streak?: number | null;
}
