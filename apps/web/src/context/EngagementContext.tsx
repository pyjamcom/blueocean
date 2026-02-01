import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BADGE_DEFINITIONS,
  COSMETIC_UNLOCKS,
  FEATURE_FLAGS,
  FAST_ANSWER_MS,
  GRACE_DAYS_PER_SEASON,
  TEAM_COMPLETION_RATE,
} from "../engagement/config";
import {
  AnswerResultInput,
  EngagementState,
  EngagementGroup,
  RoundCompleteInput,
} from "../engagement/types";
import { buildDailyQuestSet, buildDefaultState, loadEngagementState, saveEngagementState } from "../engagement/storage";
import { diffDays, formatDayKey, getSeasonInfo, getWeekKey } from "../engagement/time";
import { trackEvent } from "../utils/analytics";
import { getOrCreateClientId } from "../utils/ids";
import { getStoredAvatarId, randomAvatarId } from "../utils/avatar";
import { getStoredPlayerName } from "../utils/playerName";

interface EngagementActions {
  recordRoundComplete: (input: RoundCompleteInput) => void;
  recordAnswerResult: (input: AnswerResultInput) => void;
  recordScoreDelta: (points: number) => void;
  equipCosmetic: (frameId: string | null) => void;
  setGroup: (group: EngagementGroup | null) => void;
  createGroup: () => Promise<EngagementGroup | null>;
  joinGroup: (code: string) => Promise<EngagementGroup | null>;
  leaveGroup: () => Promise<void>;
  refresh: () => void;
}

interface EngagementContextValue {
  state: EngagementState;
  flags: typeof FEATURE_FLAGS;
  actions: EngagementActions;
}

const EngagementContext = createContext<EngagementContextValue | null>(null);

function applyRollover(prev: EngagementState, now: Date) {
  let next = { ...prev };
  const today = formatDayKey(now);
  const season = getSeasonInfo(now);
  if (prev.season.id !== season.id) {
    next = {
      ...next,
      season,
      streak: {
        ...next.streak,
        graceLeft: GRACE_DAYS_PER_SEASON,
        graceUsedOn: null,
      },
    };
    trackEvent("season_rollover", { seasonId: season.id });
  }
  const weekId = getWeekKey(now);
  if (prev.week.id !== weekId) {
    next = {
      ...next,
      week: {
        id: weekId,
        points: 0,
        lastWeekPoints: prev.week.points,
      },
    };
  }
  if (prev.streak.lastDay && prev.streak.lastDay !== today) {
    const gap = diffDays(prev.streak.lastDay, today);
    if (gap > 1) {
      if (prev.streak.graceLeft > 0 && gap === 2) {
        next.streak = {
          ...next.streak,
          graceLeft: prev.streak.graceLeft - 1,
          graceUsedOn: today,
        };
        trackEvent("grace_used", { gap });
      } else {
        next.streak = {
          ...next.streak,
          current: 0,
          lastDay: null,
        };
      }
    }
  }
  if (prev.quests.lastAssignedDay !== today) {
    const questSet = buildDailyQuestSet(next, today);
    next.quests = {
      daily: questSet.daily,
      lastAssignedDay: today,
      lastQuestIds: questSet.lastQuestIds,
    };
    trackEvent("quest_assigned", { day: today });
  }
  if (prev.stats.lastRoundDay && prev.stats.lastRoundDay !== today) {
    next.stats = {
      ...next.stats,
      fastCorrects: 0,
      roundsPlayed: 0,
      lastRoundDay: null,
    };
  }
  return next;
}

function unlockBadge(state: EngagementState, badgeId: string) {
  if (state.badges.unlocked.includes(badgeId)) return state;
  const badge = BADGE_DEFINITIONS.find((item) => item.id === badgeId);
  if (!badge) return state;
  trackEvent("badge_unlocked", { badgeId });
  let next = {
    ...state,
    badges: {
      ...state.badges,
      unlocked: [...state.badges.unlocked, badgeId],
      lastEarned: badgeId,
    },
  };
  const cosmetics = COSMETIC_UNLOCKS[badgeId] ?? [];
  if (cosmetics.length) {
    const unlocked = new Set(next.cosmetics.unlocked);
    cosmetics.forEach((id) => unlocked.add(id));
    next = {
      ...next,
      cosmetics: {
        ...next.cosmetics,
        unlocked: Array.from(unlocked),
      },
    };
  }
  return next;
}

function completeQuest(state: EngagementState, questId: string, today: string) {
  const updated = state.quests.daily.map((quest) => {
    if (quest.id !== questId) return quest;
    if (quest.completedAt) return quest;
    return { ...quest, completedAt: today };
  });
  const completedQuest = updated.find((quest) => quest.id === questId);
  if (completedQuest?.completedAt) {
    trackEvent("quest_completed", { questId });
  }
  let next = { ...state, quests: { ...state.quests, daily: updated } };
  const rewardId = completedQuest?.rewardId;
  if (rewardId) {
    const unlocked = new Set(next.cosmetics.unlocked);
    unlocked.add(rewardId);
    next = {
      ...next,
      cosmetics: {
        ...next.cosmetics,
        unlocked: Array.from(unlocked),
      },
    };
    trackEvent("cosmetic_unlocked", { rewardId });
  }
  return next;
}

function updateQuestProgress(state: EngagementState, type: string, amount: number, today: string) {
  let updated = state.quests.daily.map((quest) => {
    if (quest.completedAt) return quest;
    if (quest.type !== type) return quest;
    const nextProgress = Math.min(quest.target, quest.progress + amount);
    return { ...quest, progress: nextProgress };
  });
  let next = { ...state, quests: { ...state.quests, daily: updated } };
  updated.forEach((quest) => {
    if (quest.progress >= quest.target && !quest.completedAt) {
      next = completeQuest(next, quest.id, today);
    }
  });
  return next;
}

export function EngagementProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EngagementState>(() => loadEngagementState());
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const lastSyncRef = useRef<{ points: number; correct: number; streak: number; at: number } | null>(null);

  const getIdentity = useCallback(() => {
    const playerId = getOrCreateClientId();
    const name = getStoredPlayerName() ?? "Player";
    const avatarId = getStoredAvatarId() ?? randomAvatarId();
    return { playerId, name, avatarId };
  }, []);

  useEffect(() => {
    saveEngagementState(state);
  }, [state]);

  const refresh = useCallback(() => {
    setState((prev) => applyRollover(prev, new Date()));
  }, []);

  const recordRoundComplete = useCallback((input: RoundCompleteInput) => {
    setState((prev) => {
      const now = new Date();
      const today = formatDayKey(now);
      let next = applyRollover(prev, now);
      const completionRate = input.totalPlayers > 0 ? input.answeredCount / input.totalPlayers : 0;
      const teamEligible = completionRate >= TEAM_COMPLETION_RATE;
      if (next.group && teamEligible && next.teamStreak.lastDay !== today) {
        next.teamStreak = {
          ...next.teamStreak,
          current: next.teamStreak.current + 1,
          lastDay: today,
          completionRate,
        };
        trackEvent("team_streak_updated", { count: next.teamStreak.current, completionRate });
      }
      if (next.streak.lastDay !== today) {
        const current = next.streak.current + 1;
        next.streak = {
          ...next.streak,
          current,
          lastDay: today,
          best: Math.max(current, next.streak.best),
        };
        trackEvent("streak_updated", { count: current });
      }
      next.stats = {
        ...next.stats,
        roundsPlayed: next.stats.roundsPlayed + 1,
        lastRoundDay: today,
      };
      next = updateQuestProgress(next, "round", 1, today);
      return { ...next, updatedAt: Date.now() };
    });
  }, []);

  const recordAnswerResult = useCallback((input: AnswerResultInput) => {
    setState((prev) => {
      const now = new Date();
      const today = formatDayKey(now);
      let next = applyRollover(prev, now);
      if (input.correct) {
        next.stats = {
          ...next.stats,
          totalCorrect: next.stats.totalCorrect + 1,
          fastCorrects:
            input.latencyMs <= FAST_ANSWER_MS ? next.stats.fastCorrects + 1 : next.stats.fastCorrects,
        };
        next = updateQuestProgress(next, "correct", 1, today);
        if (input.latencyMs <= FAST_ANSWER_MS) {
          next = updateQuestProgress(next, "fast", 1, today);
        }
      }
      if (typeof input.streak === "number" && input.streak >= 2) {
        next = updateQuestProgress(next, "streak", 1, today);
      }
      if (next.stats.totalCorrect >= 10) {
        next = unlockBadge(next, "badge_sharp");
      }
      if (next.stats.fastCorrects >= 3) {
        next = unlockBadge(next, "badge_speedy");
      }
      if (typeof input.streak === "number" && input.streak >= 5) {
        next = unlockBadge(next, "badge_hot_streak");
      }
      return { ...next, updatedAt: Date.now() };
    });
  }, []);

  const recordScoreDelta = useCallback((points: number) => {
    if (!points) return;
    setState((prev) => {
      const now = new Date();
      let next = applyRollover(prev, now);
      next.week = {
        ...next.week,
        points: next.week.points + points,
      };
      trackEvent("progress_points", { points, weekId: next.week.id });
      return { ...next, updatedAt: Date.now() };
    });
  }, []);

  const equipCosmetic = useCallback((frameId: string | null) => {
    setState((prev) => ({
      ...prev,
      cosmetics: {
        ...prev.cosmetics,
        equipped: { ...prev.cosmetics.equipped, frame: frameId },
      },
    }));
    trackEvent("cosmetic_equipped", { frameId });
  }, []);

  const setGroup = useCallback((group: EngagementGroup | null) => {
    setState((prev) => ({ ...prev, group }));
    trackEvent(group ? "group_joined" : "group_left", { groupCode: group?.code });
  }, []);

  const createGroup = useCallback(async () => {
    try {
      const { playerId, name, avatarId } = getIdentity();
      const res = await fetch(`${apiBase}/crew/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, name, avatarId }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.crew?.code) return null;
      const group: EngagementGroup = {
        code: data.crew.code,
        name: data.crew.name ?? `Crew ${data.crew.code}`,
        role: "owner",
      };
      setGroup(group);
      return group;
    } catch {
      return null;
    }
  }, [apiBase, getIdentity, setGroup]);

  const joinGroup = useCallback(
    async (code: string) => {
      try {
        const { playerId, name, avatarId } = getIdentity();
        const res = await fetch(`${apiBase}/crew/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, playerId, name, avatarId }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.crew?.code) return null;
        const group: EngagementGroup = {
          code: data.crew.code,
          name: data.crew.name ?? `Crew ${data.crew.code}`,
          role: data.role === "owner" ? "owner" : "member",
        };
        setGroup(group);
        return group;
      } catch {
        return null;
      }
    },
    [apiBase, getIdentity, setGroup],
  );

  const leaveGroup = useCallback(async () => {
    if (!state.group) return;
    try {
      const { playerId } = getIdentity();
      await fetch(`${apiBase}/crew/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: state.group.code, playerId }),
      });
    } catch {
      // ignore
    }
    setGroup(null);
  }, [apiBase, getIdentity, setGroup, state.group]);

  useEffect(() => {
    if (!state.group) return;
    const now = Date.now();
    const lastSync = lastSyncRef.current;
    if (
      lastSync &&
      now - lastSync.at < 1500 &&
      lastSync.points === state.week.points &&
      lastSync.correct === state.stats.totalCorrect &&
      lastSync.streak === state.streak.current
    ) {
      return;
    }
    lastSyncRef.current = {
      points: state.week.points,
      correct: state.stats.totalCorrect,
      streak: state.streak.current,
      at: now,
    };
    const { playerId, name, avatarId } = getIdentity();
    fetch(`${apiBase}/crew/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: state.group.code,
        playerId,
        name,
        avatarId,
        weeklyPoints: state.week.points,
        correctCount: state.stats.totalCorrect,
        streak: state.streak.current,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [
    apiBase,
    getIdentity,
    state.group,
    state.stats.totalCorrect,
    state.streak.current,
    state.week.points,
  ]);

  const value = useMemo(
    () => ({
      state,
      flags: FEATURE_FLAGS,
      actions: {
        recordRoundComplete,
        recordAnswerResult,
        recordScoreDelta,
        equipCosmetic,
        setGroup,
        createGroup,
        joinGroup,
        leaveGroup,
        refresh,
      },
    }),
    [recordAnswerResult, recordRoundComplete, recordScoreDelta, equipCosmetic, refresh, setGroup, state],
  );

  return <EngagementContext.Provider value={value}>{children}</EngagementContext.Provider>;
}

export function useEngagement() {
  const ctx = useContext(EngagementContext);
  if (!ctx) {
    throw new Error("useEngagement must be used within EngagementProvider");
  }
  return ctx;
}
