import {
  GRACE_DAYS_PER_SEASON,
  QUEST_DEFINITIONS,
} from "./config";
import { EngagementState, QuestDefinition, QuestProgress } from "./types";
import { formatDayKey, getSeasonInfo, getWeekKey } from "./time";

const STORAGE_KEY = "escapers_engagement_v1";

function buildDailyQuests(seedDay: string, lastQuestIds: string[] = []): QuestProgress[] {
  const pool = QUEST_DEFINITIONS.filter((quest) => !lastQuestIds.includes(quest.id));
  const list = (pool.length >= 2 ? pool : QUEST_DEFINITIONS).slice(0, 2);
  return list.map((quest) => ({
    ...quest,
    progress: 0,
    completedAt: null,
  }));
}

export function buildDefaultState(now = new Date()): EngagementState {
  const today = formatDayKey(now);
  const season = getSeasonInfo(now);
  return {
    version: 1,
    updatedAt: Date.now(),
    season,
    week: {
      id: getWeekKey(now),
      points: 0,
      lastWeekPoints: 0,
    },
    streak: {
      current: 0,
      best: 0,
      lastDay: null,
      graceLeft: GRACE_DAYS_PER_SEASON,
      graceUsedOn: null,
    },
    teamStreak: {
      current: 0,
      lastDay: null,
      completionRate: 0,
    },
    badges: {
      unlocked: [],
      lastEarned: null,
    },
    quests: {
      daily: buildDailyQuests(today),
      lastAssignedDay: today,
      lastQuestIds: [],
    },
    cosmetics: {
      unlocked: [],
      equipped: {
        frame: null,
        effect: null,
      },
    },
    stats: {
      fastCorrects: 0,
      totalCorrect: 0,
      roundsPlayed: 0,
      lastRoundDay: null,
    },
    group: null,
  };
}

export function loadEngagementState(): EngagementState {
  if (typeof window === "undefined") {
    return buildDefaultState();
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return buildDefaultState();
  }
  try {
    const parsed = JSON.parse(raw) as EngagementState;
    if (!parsed || typeof parsed !== "object") {
      return buildDefaultState();
    }
    return { ...buildDefaultState(), ...parsed };
  } catch {
    return buildDefaultState();
  }
}

export function saveEngagementState(state: EngagementState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetEngagementState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function buildDailyQuestSet(state: EngagementState, today: string) {
  const lastQuestIds = state.quests.lastQuestIds ?? [];
  const active = state.streak.current >= 3;
  const preferred = active
    ? ["answer_fast", "streak_two", "answer_correct"]
    : ["play_round", "answer_correct", "streak_two"];
  const ordered = [...preferred, ...QUEST_DEFINITIONS.map((quest) => quest.id)];
  const pick = ordered
    .map((id) => QUEST_DEFINITIONS.find((quest) => quest.id === id))
    .filter(Boolean) as QuestDefinition[];
  const filtered = pick.filter((quest) => !lastQuestIds.includes(quest.id));
  const selection = (filtered.length >= 2 ? filtered : pick).slice(0, 2);
  const daily = selection.map((quest) => ({
    ...quest,
    progress: 0,
    completedAt: null,
  }));
  return { daily, lastQuestIds: daily.map((quest) => quest.id) };
}
