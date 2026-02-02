import { useEffect, useMemo, useRef, useState } from "react";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS } from "../../engagement/config";
import { useEngagement } from "../../context/EngagementContext";
import frames from "../../engagement/frames.module.css";
import styles from "./EngagementPanel.module.css";
import { formatDayKey } from "../../engagement/time";
import { avatarColor, getAvatarImageUrl } from "../../utils/avatar";
import { getOrCreateClientId } from "../../utils/ids";

type PanelMode = "lobby" | "result";
type InfoPayload = {
  title: string;
  lines: string[];
  ctaLabel?: string;
  onCta?: () => void;
};
type CrewMember = {
  id: string;
  name: string;
  avatarId?: string | null;
  title?: string | null;
  role?: string | null;
};

const badgeMap = new Map(BADGE_DEFINITIONS.map((badge) => [badge.id, badge]));
const CHIP_INFO = {
  season: {
    title: "Season Sprint",
    lines: [
      "What: a 14-day chaos sprint for everyone.",
      "How: auto-starts; timer shows days left. Cosmetics stay.",
      "Standout: fresh start = instant flex vs old whales.",
      "Funny: new season, new excuses.",
    ],
  },
  shield: {
    title: "Streak Shield",
    lines: [
      "What: 1 free miss without losing your streak.",
      "How: auto-recharges weekly; spends on a 1-day gap.",
      "Standout: you keep streaks while others cry.",
      "Funny: we forgive you before you lie.",
    ],
  },
  reminder: {
    title: "Party Ping",
    lines: [
      "What: tiny 'one round?' reminder.",
      "How: you toggle it. We never spam.",
      "Standout: keeps streaks alive with zero effort.",
      "Funny: your phone whispers 'play, coward.'",
    ],
  },
  streak: {
    title: "Hot Streak",
    lines: [
      "What: days in a row you played.",
      "How: 1 round today = +1 day.",
      "Standout: higher number = louder flex.",
      "Funny: streaks are like tacos; drop one, sadness.",
    ],
  },
  crew: {
    title: "Your Crew",
    lines: [
      "What: private squad + shared streak.",
      "How: create crew -> code; friends join by code.",
      "Standout: titles pop (Captain/Score Boss/Sharp Eye).",
      "Funny: instant gang, zero paperwork.",
    ],
  },
  crewStreak: {
    title: "Crew Streak",
    lines: [
      "What: team streak day for the whole crew.",
      "How: 60% of crew plays today -> +1 for everyone.",
      "Standout: you can carry the squad.",
      "Funny: even the lazy guy gets credit.",
    ],
  },
  badges: {
    title: "Badges",
    lines: [
      "What: skill trophies (not just logins).",
      "How: earn via accuracy, speed, streaks.",
      "Standout: shows your real flex.",
      "Funny: serious awards for unserious memes.",
    ],
  },
  style: {
    title: "Your Style",
    lines: [
      "What: free cosmetics, zero paywalls.",
      "How: unlock via quests + badges.",
      "Standout: your panel looks louder.",
      "Funny: drip earned by chaos.",
    ],
  },
} as const;

const BADGE_INFO: Record<string, { title: string; lines: string[] }> = {
  badge_sharp: {
    title: "Clean Run",
    lines: [
      "What: no-mistake mini run.",
      "How: 3 correct in a row.",
      "Standout: shows you're not just lucky.",
      "Funny: your brain took a shower.",
    ],
  },
  badge_speedy: {
    title: "Quick Hands",
    lines: [
      "What: fast-correct badge.",
      "How: 3 fast corrects.",
      "Standout: you tap before the question finishes.",
      "Funny: finger ninja energy.",
    ],
  },
  badge_marksman: {
    title: "Sure Shot",
    lines: [
      "What: accuracy badge.",
      "How: >=80% over 10 answers.",
      "Standout: the crew trusts your guesses.",
      "Funny: too serious for a meme game.",
    ],
  },
  badge_hot_streak: {
    title: "Hot Streak",
    lines: [
      "What: long correct streak badge.",
      "How: 5 correct in a row.",
      "Standout: you're on fire.",
      "Funny: toaster-level brain heat.",
    ],
  },
  badge_lightning: {
    title: "Turbo Tap",
    lines: [
      "What: ultra-fast streak badge.",
      "How: 5 fast corrects.",
      "Standout: speedrun reputation.",
      "Funny: fingers on caffeine.",
    ],
  },
  badge_combo: {
    title: "Combo Wizard",
    lines: [
      "What: speed + streak combo badge.",
      "How: 3 fast + 3 streak in one flow.",
      "Standout: rare combo flex.",
      "Funny: you found the cheat code.",
    ],
  },
  badge_blaze: {
    title: "Blaze Mode",
    lines: [
      "What: insane streak badge.",
      "How: 8 correct in a row.",
      "Standout: elite status.",
      "Funny: volcano in a hoodie.",
    ],
  },
  badge_sniper: {
    title: "Laser Eyes",
    lines: [
      "What: elite accuracy badge.",
      "How: >=90% over 20 answers.",
      "Standout: sniper vibes.",
      "Funny: no-scope in a quiz.",
    ],
  },
};

const FRAME_INFO: Record<string, { title: string; lines: string[] }> = {
  frame_bubble: {
    title: "Bubble",
    lines: [
      "What: starter bubble frame.",
      "How: complete '1 round boom'.",
      "Standout: proof you actually played.",
      "Funny: baby-step flex.",
    ],
  },
  frame_gummy: {
    title: "Gummy",
    lines: [
      "What: sweet gummy frame.",
      "How: quest '2 hits' OR Clean Run badge.",
      "Standout: you're sticky-accurate.",
      "Funny: sugar-rush brain.",
    ],
  },
  frame_spark: {
    title: "Spark",
    lines: [
      "What: sparkly frame.",
      "How: quest '3 right-ish' OR Sure Shot badge.",
      "Standout: you light up the list.",
      "Funny: fireworks, no safety.",
    ],
  },
  frame_mint: {
    title: "Mint",
    lines: [
      "What: minty fresh frame.",
      "How: quest 'Turbo tap x2' OR Combo Wizard badge.",
      "Standout: clean speed flex.",
      "Funny: minty brain breath.",
    ],
  },
  frame_comet: {
    title: "Comet",
    lines: [
      "What: comet-trail frame.",
      "How: quest 'Mini streak' OR Hot Streak badge.",
      "Standout: you keep flying.",
      "Funny: your answers have a tail.",
    ],
  },
  frame_neon: {
    title: "Neon",
    lines: [
      "What: neon speed frame.",
      "How: quest 'Speed tap' OR Quick Hands badge.",
      "Standout: you glow like a maniac.",
      "Funny: nightclub fingers.",
    ],
  },
  frame_blaze: {
    title: "Blaze",
    lines: [
      "What: fire frame.",
      "How: Blaze Mode badge.",
      "Standout: top-tier flex.",
      "Funny: too hot for quizzes.",
    ],
  },
  frame_frost: {
    title: "Frost",
    lines: [
      "What: ice frame.",
      "How: Turbo Tap badge.",
      "Standout: cold speed legend.",
      "Funny: frozen fingers, still fast.",
    ],
  },
  frame_vortex: {
    title: "Vortex",
    lines: [
      "What: portal frame.",
      "How: Laser Eyes badge.",
      "Standout: accuracy warlock.",
      "Funny: you bent reality for points.",
    ],
  },
};

export default function EngagementPanel({ mode }: { mode: PanelMode }) {
  const { state, actions, flags } = useEngagement();
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [toastBadge, setToastBadge] = useState<string | null>(null);
  const [toastQuest, setToastQuest] = useState<string | null>(null);
  const [toastReminder, setToastReminder] = useState(false);
  const [dismissedQuestIds, setDismissedQuestIds] = useState<string[]>([]);
  const seenQuestRef = useRef<Set<string>>(new Set());
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [crewLoading, setCrewLoading] = useState(false);
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const selfId = getOrCreateClientId();
  const isOwner = state.group?.role === "owner";
  const prevTeamStreak = useRef(state.teamStreak.current);
  const [teamPulse, setTeamPulse] = useState(false);

  useEffect(() => {
    if (state.teamStreak.current > prevTeamStreak.current) {
      setTeamPulse(true);
      prevTeamStreak.current = state.teamStreak.current;
      const timer = window.setTimeout(() => setTeamPulse(false), 900);
      return () => window.clearTimeout(timer);
    }
    prevTeamStreak.current = state.teamStreak.current;
  }, [state.teamStreak.current]);

  useEffect(() => {
    actions.refresh();
  }, [actions.refresh]);

  useEffect(() => {
    if (!state.badges.lastEarned) return;
    setToastBadge(state.badges.lastEarned);
    const timer = window.setTimeout(() => setToastBadge(null), 2200);
    return () => window.clearTimeout(timer);
  }, [state.badges.lastEarned]);

  useEffect(() => {
    seenQuestRef.current.clear();
    setDismissedQuestIds([]);
  }, [state.quests.lastAssignedDay]);

  useEffect(() => {
    const timers: number[] = [];
    state.quests.daily.forEach((quest) => {
      if (quest.completedAt && !seenQuestRef.current.has(quest.id)) {
        seenQuestRef.current.add(quest.id);
        setToastQuest(quest.id);
        timers.push(window.setTimeout(() => setToastQuest(null), 1800));
        timers.push(
          window.setTimeout(() => {
            setDismissedQuestIds((prev) =>
              prev.includes(quest.id) ? prev : [...prev, quest.id],
            );
          }, 900),
        );
      }
    });
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [state.quests.daily]);

  useEffect(() => {
    if (!showGroup || !state.group) return;
    let active = true;
    setCrewLoading(true);
    fetch(`${apiBase}/crew/${state.group.code}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        const members = Array.isArray(data?.crew?.members) ? data.crew.members : [];
        setCrewMembers(members);
      })
      .catch(() => {
        if (!active) return;
        setCrewMembers([]);
      })
      .finally(() => {
        if (active) setCrewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiBase, showGroup, state.group?.code]);

  const daysLeft = useMemo(() => {
    const end = new Date(state.season.endDay);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diff);
  }, [state.season.endDay]);

  const quests = state.quests.daily.filter((quest) => !dismissedQuestIds.includes(quest.id)).slice(0, 2);
  const equippedFrame = state.cosmetics.equipped.frame ?? null;
  const isSeasonStart = formatDayKey(new Date()) === state.season.startDay;
  const showQuest = mode === "lobby";
  const todayKey = formatDayKey(new Date());
  const teamStatus = !state.teamStreak.lastDay
    ? "idle"
    : state.teamStreak.lastDay === todayKey
      ? "active"
      : "paused";
  const teamProgress = Math.min(1, Math.max(0, state.teamStreak.completionRate ?? 0));
  const notificationsEnabled = state.notifications.enabled;
  const cosmeticMap = useMemo(
    () => new Map(COSMETIC_DEFINITIONS.map((item) => [item.id, item.label])),
    [],
  );
  const equippedLabel = equippedFrame ? cosmeticMap.get(equippedFrame) : "None";
  const questLabelMap = useMemo(
    () => new Map(state.quests.daily.map((quest) => [quest.id, quest.label])),
    [state.quests.daily],
  );
  const cosmeticNewId = state.cosmetics.lastUnlocked ?? null;
  const closeCosmetics = () => {
    setShowCosmetics(false);
    actions.markCosmeticSeen();
  };
  const openInfo = (payload: InfoPayload, closeSheets = true) => {
    if (closeSheets) {
      setShowCosmetics(false);
      setShowBadges(false);
      setShowGroup(false);
    }
    setInfo(payload);
  };
  const closeInfo = () => setInfo(null);

  const unlockedBadges = state.badges.unlocked
    .map((id) => badgeMap.get(id))
    .filter(Boolean)
    .slice(-4) as { id: string; label: string; emoji: string }[];

  const showActions = mode === "lobby";
  const showStreakHint = showActions && !state.hints.streakHintShown;
  const showQuestHint =
    showQuest && flags.miniQuests && quests.length > 0 && !state.hints.questHintShown;
  const quietStart = state.notifications.quietStart;
  const quietEnd = state.notifications.quietEnd;
  const hour = new Date().getHours();
  const isQuietHours =
    quietStart < quietEnd
      ? hour >= quietStart && hour < quietEnd
      : hour >= quietStart || hour < quietEnd;
  const shouldPrompt =
    notificationsEnabled &&
    showActions &&
    !isQuietHours &&
    state.stats.lastRoundDay !== todayKey &&
    state.notifications.lastPromptDay !== todayKey;

  useEffect(() => {
    if (!showStreakHint) return;
    const timer = window.setTimeout(() => actions.markHintShown("streak"), 2200);
    return () => window.clearTimeout(timer);
  }, [actions, showStreakHint]);

  useEffect(() => {
    if (!showQuestHint) return;
    const timer = window.setTimeout(() => actions.markHintShown("quest"), 2400);
    return () => window.clearTimeout(timer);
  }, [actions, showQuestHint]);

  useEffect(() => {
    if (!shouldPrompt) return;
    setToastReminder(true);
    actions.markReminderPrompted(todayKey);
    const timer = window.setTimeout(() => setToastReminder(false), 2000);
    return () => window.clearTimeout(timer);
  }, [actions, shouldPrompt, todayKey]);

  const runCrewAction = async (action: "kick" | "ban", targetId: string) => {
    if (!state.group) return;
    try {
      const res = await fetch(`${apiBase}/crew/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: state.group.code,
          requesterId: selfId,
          targetId,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.crew?.members)) {
        setCrewMembers(data.crew.members);
      } else {
        setCrewMembers((prev) => prev.filter((member) => member.id !== targetId));
      }
    } catch {
      // ignore
    }
  };

  return (
    <section className={styles.panel}>
      <div className={styles.chipRow}>
        {flags.seasons && (
          <button
            type="button"
            className={`${styles.chip} ${styles.chipButton}`}
            onClick={() => openInfo(CHIP_INFO.season)}
          >
            <span className={styles.chipIcon}>⏳</span>
            {daysLeft}d
          </button>
        )}
        {flags.groups && state.group ? (
          <button
            type="button"
            className={`${styles.chip} ${styles.chipButton}`}
            onClick={() => openInfo(CHIP_INFO.crew)}
          >
            <span className={styles.chipIcon}>👥</span>
            {state.group.code}
          </button>
        ) : null}
        {flags.teamStreaks && state.group && (
          <button
            type="button"
            className={`${styles.chip} ${styles.teamChip} ${teamPulse ? styles.teamPulse : ""} ${
              teamStatus === "active"
                ? styles.teamActive
                : teamStatus === "paused"
                  ? styles.teamPaused
                  : styles.teamIdle
            } ${styles.chipButton}`}
            onClick={() => openInfo(CHIP_INFO.crewStreak)}
          >
            <span className={styles.teamBar} style={{ width: `${teamProgress * 100}%` }} />
            <span className={styles.chipIcon}>🤝</span>
            {state.teamStreak.current}
          </button>
        )}
        {flags.graceDay && (
          <button
            type="button"
            className={`${styles.chip} ${styles.chipButton}`}
            onClick={() => openInfo(CHIP_INFO.shield)}
          >
            <span className={styles.chipIcon}>🛡️</span>
            {state.streak.graceLeft}
          </button>
        )}
        {flags.notifications && (
          <button
            type="button"
            className={`${styles.chip} ${styles.chipButton} ${
              notificationsEnabled ? styles.chipActive : ""
            }`}
            onClick={() => {
              actions.setNotificationsEnabled(!notificationsEnabled);
              openInfo(CHIP_INFO.reminder);
            }}
          >
            <span className={styles.chipIcon}>🔔</span>
            {notificationsEnabled ? "On" : "Off"}
          </button>
        )}
        <button
          type="button"
          className={`${styles.chip} ${styles.chipButton}`}
          onClick={() => openInfo(CHIP_INFO.streak)}
        >
          <span className={styles.chipIcon}>🔥</span>
          {state.streak.current}
        </button>
      </div>

      {showStreakHint ? <div className={styles.hint}>🔥 streak</div> : null}
      {showQuestHint ? <div className={styles.hint}>🗺️ quest</div> : null}

      {flags.miniQuests && showQuest && quests.length ? (
        <div className={styles.questStack}>
          {quests.map((quest) => {
            const questProgress = Math.min(1, quest.progress / quest.target);
            const rewardLabel = quest.rewardId ? cosmeticMap.get(quest.rewardId) : null;
            const questDone = Boolean(quest.completedAt);
            return (
              <div key={quest.id} className={`${styles.questCard} ${questDone ? styles.questDoneCard : ""}`}>
                <div className={styles.questTop}>
                  <span className={styles.questLabel}>{quest.label}</span>
                  {rewardLabel ? <span className={styles.questReward}>+{rewardLabel}</span> : null}
                  {questDone ? <span className={styles.questDone}>✓</span> : null}
                </div>
                <div className={styles.questBar}>
                  <span className={styles.questBarFill} style={{ width: `${questProgress * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {showActions ? (
        <div className={styles.actionRow}>
          {flags.groups && (
            <button type="button" className={styles.actionButton} onClick={() => setShowGroup(true)}>
              Crew
            </button>
          )}
          {flags.masteryBadges && (
            <button type="button" className={styles.actionButton} onClick={() => setShowBadges(true)}>
              Badges
            </button>
          )}
          {flags.cosmetics && (
            <button type="button" className={styles.actionButton} onClick={() => setShowCosmetics(true)}>
              Style
            </button>
          )}
        </div>
      ) : null}

      {unlockedBadges.length ? (
        <div className={styles.badgeRow}>
          {unlockedBadges.map((badge) => (
            <span key={badge.id} className={styles.badgeBubble} title={badge.label}>
              {badge.emoji}
            </span>
          ))}
        </div>
      ) : null}

      {toastBadge ? (
        <div className={styles.toast}>
          <span className={styles.toastEmoji}>{badgeMap.get(toastBadge)?.emoji ?? "✨"}</span>
          <span className={styles.toastLabel}>{badgeMap.get(toastBadge)?.label ?? "Badge pop!"}</span>
        </div>
      ) : null}
      {toastQuest ? (
        <div className={`${styles.toast} ${styles.questToast}`}>
          <span className={styles.toastEmoji}>🏁</span>
          <span className={styles.toastLabel}>{questLabelMap.get(toastQuest) ?? "Quest done!"}</span>
        </div>
      ) : null}
      {toastReminder ? (
        <div className={`${styles.toast} ${styles.reminderToast}`}>
          <span className={styles.toastEmoji}>🕺</span>
          <span className={styles.toastLabel}>One quick round?</span>
        </div>
      ) : null}

      {isSeasonStart ? (
        <div className={styles.seasonToast}>
          <span>✨ Fresh season</span>
        </div>
      ) : null}

      {showCosmetics ? (
        <div className={styles.overlay} onClick={closeCosmetics}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <div
              className={styles.sheetTitle}
              onClick={() => openInfo(CHIP_INFO.style)}
              role="button"
              tabIndex={0}
            >
              Your Style
            </div>
            <div className={styles.sheetSub}>Equipped: {equippedLabel ?? "None"}</div>
            <div className={styles.grid}>
              {COSMETIC_DEFINITIONS.filter((item) => item.type === "frame").map((item) => {
                const unlocked = state.cosmetics.unlocked.includes(item.id);
                const active = equippedFrame === item.id;
                const rareClass = item.rarity === "rare" ? styles.gridRare : "";
                const isNew = unlocked && cosmeticNewId === item.id;
                const tagLabel = active ? "Equipped" : isNew ? "New" : unlocked ? "Use" : "Locked";
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.gridItem} ${frames[item.id] ?? ""} ${rareClass} ${
                      active ? styles.gridActive : ""
                    } ${!unlocked ? styles.gridLocked : ""}`}
                    onClick={() => {
                      const base = FRAME_INFO[item.id] ?? { title: item.label, lines: [] };
                      const ctaLabel = unlocked ? (active ? "Unequip" : "Equip") : undefined;
                      const onCta = unlocked
                        ? () => {
                            actions.equipCosmetic(active ? null : item.id);
                            closeInfo();
                          }
                        : undefined;
                      openInfo({ title: base.title, lines: base.lines, ctaLabel, onCta });
                    }}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`${styles.gridTag} ${active ? styles.gridTagActive : ""} ${
                        isNew ? styles.gridTagNew : ""
                      } ${!unlocked ? styles.gridTagLocked : ""}`}
                    >
                      {tagLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showBadges ? (
        <div className={styles.overlay} onClick={() => setShowBadges(false)}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <div
              className={styles.sheetTitle}
              onClick={() => openInfo(CHIP_INFO.badges)}
              role="button"
              tabIndex={0}
            >
              Your Badges
            </div>
            <div className={styles.grid}>
              {BADGE_DEFINITIONS.map((badge) => {
                const unlocked = state.badges.unlocked.includes(badge.id);
                const rareClass = badge.rarity === "rare" ? styles.gridRare : "";
                return (
                  <button
                    key={badge.id}
                    type="button"
                    className={`${styles.gridItem} ${rareClass} ${unlocked ? "" : styles.gridLocked}`}
                    onClick={() => {
                      const info = BADGE_INFO[badge.id];
                      if (info) {
                        openInfo(info);
                      } else {
                        openInfo({ title: badge.label, lines: [] });
                      }
                    }}
                  >
                    <span className={styles.badgeEmoji}>{badge.emoji}</span>
                    <span className={styles.badgeLabel}>{badge.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showGroup ? (
        <div className={styles.overlay} onClick={() => setShowGroup(false)}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <div
              className={styles.sheetTitle}
              onClick={() => openInfo(CHIP_INFO.crew)}
              role="button"
              tabIndex={0}
            >
              Your Crew
            </div>
            {state.group ? (
              <div className={styles.groupBlock}>
                <div className={styles.groupCode}>{state.group.code}</div>
                <div className={styles.groupList}>
                  {crewLoading ? (
                    <div className={styles.groupHint}>Loading crew...</div>
                  ) : crewMembers.length ? (
                    crewMembers.map((member) => {
                      const avatarSrc = member.avatarId ? getAvatarImageUrl(member.avatarId) : null;
                      const canModerate = Boolean(isOwner) && member.id !== selfId && member.role !== "owner";
                      return (
                        <div key={member.id} className={styles.groupRow}>
                          <span
                            className={styles.groupAvatar}
                            style={{ background: avatarColor(member.avatarId ?? member.name) }}
                          >
                            {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{member.name.charAt(0)}</span>}
                          </span>
                          <span className={styles.groupName}>{member.name}</span>
                          <span className={styles.groupMeta}>
                            {member.title ? <span className={styles.groupTitle}>{member.title}</span> : null}
                            {canModerate ? (
                              <span className={styles.groupActions}>
                                <button
                                  type="button"
                                  className={styles.groupKick}
                                  onClick={() => runCrewAction("kick", member.id)}
                                >
                                  Boot
                                </button>
                                <button
                                  type="button"
                                  className={styles.groupBan}
                                  onClick={() => runCrewAction("ban", member.id)}
                                >
                                  Ban
                                </button>
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.groupHint}>No crew yet</div>
                  )}
                </div>
                <div className={styles.groupHint}>Boot/Ban - owner only</div>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={async () => {
                    await actions.leaveGroup();
                    setShowGroup(false);
                  }}
                >
                  Leave
                </button>
              </div>
            ) : (
              <div className={styles.groupBlock}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={async () => {
                    await actions.createGroup();
                    setShowGroup(false);
                  }}
                >
                  Create
                </button>
                <input
                  className={styles.groupInput}
                  value={groupInput}
                  onChange={(event) => setGroupInput(event.target.value.toUpperCase().slice(0, 6))}
                  placeholder="CODE"
                />
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={async () => {
                    const trimmed = groupInput.trim();
                    if (!trimmed) return;
                    await actions.joinGroup(trimmed);
                    setShowGroup(false);
                  }}
                >
                  Join
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {info ? (
        <div className={styles.overlay} onClick={closeInfo}>
          <div className={styles.infoCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.infoTitle}>{info.title}</div>
            <div className={styles.infoList}>
              {info.lines.map((line) => (
                <div key={line} className={styles.infoItem}>
                  {line}
                </div>
              ))}
            </div>
            {info.ctaLabel && info.onCta ? (
              <button
                type="button"
                className={styles.infoCta}
                onClick={info.onCta}
              >
                {info.ctaLabel}
              </button>
            ) : null}
            <div className={styles.infoHint}>Tap anywhere to close</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
