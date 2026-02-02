export type EngagementFlagKey =
  | "teamStreaks"
  | "seasons"
  | "progressLeaderboard"
  | "graceDay"
  | "masteryBadges"
  | "miniQuests"
  | "cosmetics"
  | "groups"
  | "notifications";

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
  rarity?: "common" | "rare";
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

export interface EngagementSeasonProgress {
  points: number;
  lastSeasonPoints: number;
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
  outageGraceDay?: string | null;
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
  lastUnlocked?: string | null;
}

export interface EngagementStats {
  fastCorrects: number;
  totalCorrect: number;
  totalAnswers: number;
  roundsPlayed: number;
  lastRoundDay: string | null;
  lastActiveHour: number | null;
}

export interface EngagementNotifications {
  enabled: boolean;
  quietStart: number;
  quietEnd: number;
  lastPromptDay: string | null;
}

export interface EngagementHints {
  streakHintShown: boolean;
  questHintShown: boolean;
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
  seasonProgress: EngagementSeasonProgress;
  week: EngagementWeek;
  streak: EngagementStreak;
  teamStreak: TeamStreak;
  badges: EngagementBadges;
  quests: EngagementQuests;
  cosmetics: EngagementCosmetics;
  stats: EngagementStats;
  notifications: EngagementNotifications;
  hints: EngagementHints;
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
