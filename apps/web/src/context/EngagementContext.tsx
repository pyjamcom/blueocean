import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BADGE_DEFINITIONS,
  COSMETIC_UNLOCKS,
  FEATURE_FLAGS,
  FAST_ANSWER_MS,
  GRACE_DAYS_PER_WEEK,
  QUIET_HOURS_DEFAULT,
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
  markCosmeticSeen: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  markReminderPrompted: (day: string) => void;
  markHintShown: (hint: "streak" | "quest") => void;
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
      seasonProgress: {
        points: 0,
        lastSeasonPoints: prev.seasonProgress?.points ?? 0,
      },
      streak: {
        ...next.streak,
        graceLeft: GRACE_DAYS_PER_WEEK,
        graceUsedOn: null,
        outageGraceDay: null,
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
      streak: {
        ...next.streak,
        graceLeft: GRACE_DAYS_PER_WEEK,
        graceUsedOn: null,
        outageGraceDay: null,
      },
    };
  }
  if (prev.streak.lastDay && prev.streak.lastDay !== today) {
    const gap = diffDays(prev.streak.lastDay, today);
    if (gap > 1) {
      if (prev.streak.outageGraceDay === today) {
        next.streak = {
          ...next.streak,
          outageGraceDay: null,
        };
        trackEvent("outage_grace_used", { gap });
      } else if (prev.streak.graceLeft > 0 && gap === 2) {
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
  if (prev.teamStreak.lastDay && prev.teamStreak.lastDay !== today) {
    const gap = diffDays(prev.teamStreak.lastDay, today);
    if (gap > 1) {
      next.teamStreak = {
        ...next.teamStreak,
        current: 0,
        lastDay: null,
        completionRate: 0,
      };
    }
  }
  if (prev.quests.lastAssignedDay !== today) {
    const questSet = buildDailyQuestSet(next, today, now);
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
        lastUnlocked: cosmetics[cosmetics.length - 1] ?? next.cosmetics.lastUnlocked ?? null,
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
        lastUnlocked: rewardId ?? next.cosmetics.lastUnlocked ?? null,
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
  const [flags, setFlags] = useState(() => FEATURE_FLAGS);
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const lastSyncRef = useRef<{
    points: number;
    lastWeekPoints: number;
    seasonPoints: number;
    correct: number;
    streak: number;
    lastRoundDay: string | null;
    at: number;
  } | null>(null);

  const getIdentity = useCallback(() => {
    const playerId = getOrCreateClientId();
    const name = getStoredPlayerName() ?? "Player";
    const avatarId = getStoredAvatarId() ?? randomAvatarId();
    return { playerId, name, avatarId };
  }, []);

  useEffect(() => {
    saveEngagementState(state);
  }, [state]);

  useEffect(() => {
    let active = true;
    const overrideRaw =
      typeof window !== "undefined" ? window.localStorage.getItem("escapers_flags_override") : null;
    const override =
      overrideRaw && overrideRaw.trim()
        ? (JSON.parse(overrideRaw) as Partial<typeof FEATURE_FLAGS>)
        : null;
    const mergeFlags = (incoming?: Partial<typeof FEATURE_FLAGS>) => {
      if (!incoming) return FEATURE_FLAGS;
      const next = { ...FEATURE_FLAGS };
      (Object.keys(next) as Array<keyof typeof FEATURE_FLAGS>).forEach((key) => {
        if (typeof incoming[key] === "boolean") {
          next[key] = incoming[key] as boolean;
        }
      });
      return next;
    };
    const applyFlags = (incoming?: Partial<typeof FEATURE_FLAGS>) => {
      const merged = mergeFlags({ ...incoming, ...(override ?? {}) });
      if (active) setFlags(merged);
    };
    fetch(`${apiBase}/feature-flags`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        applyFlags(data?.flags ?? null);
      })
      .catch(() => applyFlags(null));
    return () => {
      active = false;
    };
  }, [apiBase]);

  const refresh = useCallback(() => {
    setState((prev) => applyRollover(prev, new Date()));
  }, []);

  useEffect(() => {
    let active = true;
    let failStreak = 0;
    const checkHealth = () => {
      fetch(`${apiBase}/health`)
        .then((res) => {
          if (!active) return;
          if (res.ok) {
            failStreak = 0;
            return;
          }
          failStreak += 1;
          if (failStreak >= 2) {
            setState((prev) => {
              const today = formatDayKey(new Date());
              if (prev.streak.outageGraceDay === today) return prev;
              trackEvent("outage_detected", { day: today });
              return {
                ...prev,
                streak: { ...prev.streak, outageGraceDay: today },
              };
            });
          }
        })
        .catch(() => {
          if (!active) return;
          failStreak += 1;
          if (failStreak >= 2) {
            setState((prev) => {
              const today = formatDayKey(new Date());
              if (prev.streak.outageGraceDay === today) return prev;
              trackEvent("outage_detected", { day: today });
              return {
                ...prev,
                streak: { ...prev.streak, outageGraceDay: today },
              };
            });
          }
        });
    };
    const timer = window.setInterval(checkHealth, 120000);
    checkHealth();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiBase]);

  const recordRoundComplete = useCallback((_input: RoundCompleteInput) => {
    setState((prev) => {
      const now = new Date();
      const today = formatDayKey(now);
      let next = applyRollover(prev, now);
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
        lastActiveHour: now.getHours(),
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
      const nextStats = {
        ...next.stats,
        totalAnswers: next.stats.totalAnswers + 1,
        lastActiveHour: now.getHours(),
      };
      if (input.correct) {
        nextStats.totalCorrect += 1;
        if (input.latencyMs <= FAST_ANSWER_MS) {
          nextStats.fastCorrects += 1;
        }
        next = updateQuestProgress(next, "correct", 1, today);
        if (input.latencyMs <= FAST_ANSWER_MS) {
          next = updateQuestProgress(next, "fast", 1, today);
        }
      }
      next.stats = nextStats;
      if (typeof input.streak === "number" && input.streak >= 2) {
        next = updateQuestProgress(next, "streak", 1, today);
      }
      if (next.stats.fastCorrects >= 3) {
        next = unlockBadge(next, "badge_speedy");
      }
      if (next.stats.fastCorrects >= 5) {
        next = unlockBadge(next, "badge_lightning");
      }
      if (typeof input.streak === "number") {
        if (input.streak >= 3) {
          next = unlockBadge(next, "badge_sharp");
        }
        if (input.streak >= 5) {
          next = unlockBadge(next, "badge_hot_streak");
        }
        if (input.streak >= 8) {
          next = unlockBadge(next, "badge_blaze");
        }
        if (input.streak >= 3 && next.stats.fastCorrects >= 3) {
          next = unlockBadge(next, "badge_combo");
        }
      }
      const accuracy =
        next.stats.totalAnswers > 0 ? next.stats.totalCorrect / next.stats.totalAnswers : 0;
      if (next.stats.totalAnswers >= 10 && accuracy >= 0.8) {
        next = unlockBadge(next, "badge_marksman");
      }
      if (next.stats.totalAnswers >= 20 && accuracy >= 0.9) {
        next = unlockBadge(next, "badge_sniper");
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
      next.seasonProgress = {
        ...next.seasonProgress,
        points: next.seasonProgress.points + points,
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

  const markCosmeticSeen = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cosmetics: {
        ...prev.cosmetics,
        lastUnlocked: null,
      },
    }));
  }, []);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        enabled,
        quietStart: prev.notifications.quietStart ?? QUIET_HOURS_DEFAULT.start,
        quietEnd: prev.notifications.quietEnd ?? QUIET_HOURS_DEFAULT.end,
      },
    }));
    trackEvent(enabled ? "reminder_opt_in" : "reminder_opt_out", { enabled });
  }, []);

  const markReminderPrompted = useCallback((day: string) => {
    setState((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        lastPromptDay: day,
      },
    }));
    trackEvent("reminder_prompted", { day });
  }, []);

  const markHintShown = useCallback((hint: "streak" | "quest") => {
    setState((prev) => ({
      ...prev,
      hints: {
        ...prev.hints,
        streakHintShown:
          hint === "streak" ? true : prev.hints.streakHintShown,
        questHintShown: hint === "quest" ? true : prev.hints.questHintShown,
      },
    }));
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
      if (data?.crew?.teamStreak) {
        setState((prev) => ({ ...prev, teamStreak: data.crew.teamStreak }));
      }
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
        if (data?.crew?.teamStreak) {
          setState((prev) => ({ ...prev, teamStreak: data.crew.teamStreak }));
        }
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
      lastSync.lastWeekPoints === state.week.lastWeekPoints &&
      lastSync.seasonPoints === state.seasonProgress.points &&
      lastSync.correct === state.stats.totalCorrect &&
      lastSync.streak === state.streak.current &&
      lastSync.lastRoundDay === state.stats.lastRoundDay
    ) {
      return;
    }
    lastSyncRef.current = {
      points: state.week.points,
      lastWeekPoints: state.week.lastWeekPoints,
      seasonPoints: state.seasonProgress.points,
      correct: state.stats.totalCorrect,
      streak: state.streak.current,
      lastRoundDay: state.stats.lastRoundDay,
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
        lastWeekPoints: state.week.lastWeekPoints,
        seasonPoints: state.seasonProgress.points,
        correctCount: state.stats.totalCorrect,
        streak: state.streak.current,
        lastRoundDay: state.stats.lastRoundDay,
      }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const nextTeam = data?.crew?.teamStreak;
        if (!nextTeam) return;
        setState((prev) => {
          const prevTeam = prev.teamStreak;
          const same =
            prevTeam.current === nextTeam.current &&
            prevTeam.lastDay === nextTeam.lastDay &&
            prevTeam.completionRate === nextTeam.completionRate;
          if (!same) {
            if (nextTeam.current > prevTeam.current) {
              trackEvent("team_streak_day_completed", {
                count: nextTeam.current,
                completionRate: nextTeam.completionRate,
              });
            } else if (nextTeam.current < prevTeam.current) {
              trackEvent("team_streak_broken", { previous: prevTeam.current });
            }
            if (nextTeam.completionRate !== prevTeam.completionRate) {
              trackEvent("team_completion_rate", { completionRate: nextTeam.completionRate });
            }
          }
          return same ? prev : { ...prev, teamStreak: nextTeam };
        });
      })
      .catch(() => undefined);
  }, [
    apiBase,
    getIdentity,
    state.group,
    state.stats.totalCorrect,
    state.stats.lastRoundDay,
    state.streak.current,
    state.week.lastWeekPoints,
    state.week.points,
    state.seasonProgress.points,
  ]);

  const value = useMemo(
    () => ({
      state,
      flags,
      actions: {
        recordRoundComplete,
        recordAnswerResult,
        recordScoreDelta,
        equipCosmetic,
        markCosmeticSeen,
        setNotificationsEnabled,
        markReminderPrompted,
        markHintShown,
        setGroup,
        createGroup,
        joinGroup,
        leaveGroup,
        refresh,
      },
    }),
    [
      flags,
      recordAnswerResult,
      recordRoundComplete,
      recordScoreDelta,
      equipCosmetic,
      markCosmeticSeen,
      setNotificationsEnabled,
      markReminderPrompted,
      markHintShown,
      refresh,
      setGroup,
      createGroup,
      joinGroup,
      leaveGroup,
      state,
    ],
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
