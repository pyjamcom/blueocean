import { BadgeDefinition, CosmeticDefinition, QuestDefinition } from "./types";

export const FEATURE_FLAGS = {
  teamStreaks: true,
  seasons: true,
  progressLeaderboard: true,
  graceDay: true,
  masteryBadges: true,
  miniQuests: true,
  cosmetics: true,
  groups: true,
} as const;

export const SEASON_ANCHOR_DAY = "2026-02-01";
export const SEASON_LENGTH_DAYS = 14;
export const WEEK_START_DAY = 1;
export const TEAM_COMPLETION_RATE = 0.6;
export const GRACE_DAYS_PER_SEASON = 1;
export const FAST_ANSWER_MS = 4000;

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  { id: "play_round", label: "1 round boom", target: 1, rewardId: "frame_bubble", type: "round" },
  { id: "answer_correct", label: "2 hits", target: 2, rewardId: "frame_gummy", type: "correct" },
  { id: "answer_fast", label: "Speed tap", target: 1, rewardId: "frame_neon", type: "fast" },
  { id: "streak_two", label: "Mini streak", target: 2, rewardId: "frame_comet", type: "streak" },
];

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "badge_hot_streak", label: "Hot streak", emoji: "🔥" },
  { id: "badge_speedy", label: "Quick hands", emoji: "⚡" },
  { id: "badge_sharp", label: "Clean run", emoji: "🧼" },
];

export const COSMETIC_DEFINITIONS: CosmeticDefinition[] = [
  { id: "frame_bubble", label: "Bubble", type: "frame", rarity: "common" },
  { id: "frame_gummy", label: "Gummy", type: "frame", rarity: "common" },
  { id: "frame_comet", label: "Comet", type: "frame", rarity: "rare" },
  { id: "frame_neon", label: "Neon", type: "frame", rarity: "rare" },
];

export const COSMETIC_UNLOCKS: Record<string, string[]> = {
  badge_hot_streak: ["frame_comet"],
  badge_speedy: ["frame_neon"],
  badge_sharp: ["frame_gummy"],
  quest_play_round: ["frame_bubble"],
};
