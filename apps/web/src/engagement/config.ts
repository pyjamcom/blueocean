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
  notifications: true,
};

export const SEASON_ANCHOR_DAY = "2026-02-01";
export const SEASON_LENGTH_DAYS = 14;
export const WEEK_START_DAY = 1;
export const TEAM_COMPLETION_RATE = 0.6;
export const GRACE_DAYS_PER_WEEK = 1;
export const FAST_ANSWER_MS = 4000;
export const QUIET_HOURS_DEFAULT = { start: 21, end: 8 };

export const REWARD_THRESHOLDS = {
  streakDays: [3, 7, 30],
  questTargets: [1, 2, 3],
  badgeProgressCaps: { maxFast: 5, maxStreak: 8 },
} as const;

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  { id: "play_round", label: "1 round boom", target: 1, rewardId: "frame_bubble", type: "round" },
  { id: "answer_correct", label: "2 hits", target: 2, rewardId: "frame_gummy", type: "correct" },
  { id: "answer_fast", label: "Speed tap", target: 1, rewardId: "frame_neon", type: "fast" },
  { id: "streak_two", label: "Mini streak", target: 2, rewardId: "frame_comet", type: "streak" },
  { id: "answer_triple", label: "3 right-ish", target: 3, rewardId: "frame_spark", type: "correct" },
  { id: "fast_two", label: "Turbo tap x2", target: 2, rewardId: "frame_mint", type: "fast" },
];

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: "badge_sharp", label: "Clean run", emoji: "🧼", rarity: "common" },
  { id: "badge_speedy", label: "Quick hands", emoji: "⚡", rarity: "common" },
  { id: "badge_marksman", label: "Sure shot", emoji: "🎯", rarity: "common" },
  { id: "badge_hot_streak", label: "Hot streak", emoji: "🔥", rarity: "rare" },
  { id: "badge_lightning", label: "Turbo tap", emoji: "💨", rarity: "rare" },
  { id: "badge_combo", label: "Combo wizard", emoji: "🌀", rarity: "rare" },
  { id: "badge_blaze", label: "Blaze mode", emoji: "🌋", rarity: "rare" },
  { id: "badge_sniper", label: "Laser eyes", emoji: "🧿", rarity: "rare" },
];

export const COSMETIC_DEFINITIONS: CosmeticDefinition[] = [
  { id: "frame_bubble", label: "Bubble", type: "frame", rarity: "common" },
  { id: "frame_gummy", label: "Gummy", type: "frame", rarity: "common" },
  { id: "frame_spark", label: "Spark", type: "frame", rarity: "common" },
  { id: "frame_mint", label: "Mint", type: "frame", rarity: "common" },
  { id: "frame_comet", label: "Comet", type: "frame", rarity: "rare" },
  { id: "frame_neon", label: "Neon", type: "frame", rarity: "rare" },
  { id: "frame_blaze", label: "Blaze", type: "frame", rarity: "rare" },
  { id: "frame_frost", label: "Frost", type: "frame", rarity: "rare" },
  { id: "frame_vortex", label: "Vortex", type: "frame", rarity: "rare" },
];

export const COSMETIC_UNLOCKS: Record<string, string[]> = {
  badge_sharp: ["frame_gummy"],
  badge_speedy: ["frame_neon"],
  badge_marksman: ["frame_spark"],
  badge_hot_streak: ["frame_comet"],
  badge_lightning: ["frame_frost"],
  badge_combo: ["frame_mint"],
  badge_blaze: ["frame_blaze"],
  badge_sniper: ["frame_vortex"],
  quest_play_round: ["frame_bubble"],
};
