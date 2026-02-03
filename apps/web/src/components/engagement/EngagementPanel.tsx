import { useEffect, useMemo, useRef, useState } from "react";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS } from "../../engagement/config";
import { useEngagement } from "../../context/EngagementContext";
import frames from "../../engagement/frames.module.css";
import styles from "./EngagementPanel.module.css";
import { formatDayKey } from "../../engagement/time";
import { avatarColor, getAvatarImageUrl } from "../../utils/avatar";
import { getOrCreateClientId } from "../../utils/ids";

type PanelMode = "lobby" | "result";
type InfoPayload = Readonly<{
  title: string;
  lines: ReadonlyArray<string>;
  ctaLabel?: string;
  onCta?: () => void;
}>;
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
      "14-day chaos sprint for everyone.",
      "Auto-starts; timer shows days left. Cosmetics stay.",
      "Fresh start = instant comeback flex.",
      "New season, new excuses, same chaos.",
    ],
  },
  shield: {
    title: "Streak Shield",
    lines: [
      "One free miss so your streak does not die.",
      "Refills weekly; auto-uses on a 1-day gap.",
      "You keep flexing while others reset.",
      "We forgive you before you lie.",
    ],
  },
  reminder: {
    title: "Party Ping",
    lines: [
      "Tiny nudge: 'one round?'",
      "You toggle it. We do not spam.",
      "Keeps the fire alive with zero effort.",
      "Your phone heckles you lovingly.",
    ],
  },
  streak: {
    title: "Hot Streak",
    lines: [
      "Days in a row you played.",
      "Play 1 round today = +1 day.",
      "Big number = louder flex.",
      "Drop it and the tacos cry.",
    ],
  },
  crew: {
    title: "Your Crew",
    lines: [
      "Private squad + shared streak.",
      "Create a code; friends jump in.",
      "Titles pop: Captain / Score Boss / Sharp Eye.",
      "Instant gang, zero paperwork.",
    ],
  },
  crewStreak: {
    title: "Crew Streak",
    lines: [
      "Team streak day for the whole crew.",
      "60% play today -> +1 for everyone.",
      "You can carry the squad.",
      "Even the lazy guy gets credit.",
    ],
  },
  badges: {
    title: "Badges",
    lines: [
      "Skill trophies, not login stickers.",
      "Earn via accuracy, speed, streaks.",
      "Shows you are not just lucky.",
      "Serious awards for unserious memes.",
    ],
  },
  style: {
    title: "Your Style",
    lines: [
      "Free cosmetics, zero paywalls.",
      "Unlock via quests + badges.",
      "Louder panel, bigger flex.",
      "Drip earned by chaos.",
    ],
  },
} as const;

const BADGE_INFO: Record<string, { title: string; lines: string[] }> = {
  badge_sharp: {
    title: "Clean Run",
    lines: [
      "3 correct in a row. No mistakes.",
      "Looks clean, feels smug.",
      "Crew sees you are not guessing.",
      "Brain took a shower.",
    ],
  },
  badge_speedy: {
    title: "Quick Hands",
    lines: [
      "3 fast corrects.",
      "Tap speed: goblin tier.",
      "People think you are cheating.",
      "Finger ninja energy.",
    ],
  },
  badge_marksman: {
    title: "Sure Shot",
    lines: [
      ">=80% over 10 answers.",
      "You actually read the question.",
      "Crew trusts your guesses.",
      "Too accurate for a meme game.",
    ],
  },
  badge_hot_streak: {
    title: "Hot Streak",
    lines: [
      "5 correct in a row.",
      "Your brain is on a grill.",
      "Top streak flex.",
      "Warning: may smoke.",
    ],
  },
  badge_lightning: {
    title: "Turbo Tap",
    lines: [
      "5 fast corrects.",
      "Speedrun reputation.",
      "You answer before blinking.",
      "Fingers on caffeine.",
    ],
  },
  badge_combo: {
    title: "Combo Wizard",
    lines: [
      "3 fast + 3 streak in one flow.",
      "Rare combo flex.",
      "Feels illegal, is legal.",
      "You found the cheat code.",
    ],
  },
  badge_blaze: {
    title: "Blaze Mode",
    lines: [
      "8 correct in a row.",
      "Elite streak beast.",
      "People stop scrolling.",
      "Volcano in a hoodie.",
    ],
  },
  badge_sniper: {
    title: "Laser Eyes",
    lines: [
      ">=90% over 20 answers.",
      "Sniper-level accuracy.",
      "You bend reality for points.",
      "No-scope in a quiz.",
    ],
  },
};

const FRAME_INFO: Record<string, { title: string; lines: string[] }> = {
  frame_bubble: {
    title: "Bubble",
    lines: [
      "Starter bubble frame.",
      "Finish '1 round boom'.",
      "Proof you touched the game.",
      "Baby-step flex.",
    ],
  },
  frame_gummy: {
    title: "Gummy",
    lines: [
      "Sweet gummy frame.",
      "Quest '2 hits' or Clean Run badge.",
      "Sticky-accurate vibe.",
      "Sugar-rush brain.",
    ],
  },
  frame_spark: {
    title: "Spark",
    lines: [
      "Sparkly frame.",
      "Quest '3 right-ish' or Sure Shot badge.",
      "You light up the list.",
      "Fireworks, no safety.",
    ],
  },
  frame_mint: {
    title: "Mint",
    lines: [
      "Minty fresh frame.",
      "Quest 'Turbo tap x2' or Combo Wizard.",
      "Clean speed flex.",
      "Minty brain breath.",
    ],
  },
  frame_comet: {
    title: "Comet",
    lines: [
      "Comet-trail frame.",
      "Quest 'Mini streak' or Hot Streak badge.",
      "You keep flying.",
      "Answers have a tail.",
    ],
  },
  frame_neon: {
    title: "Neon",
    lines: [
      "Neon speed frame.",
      "Quest 'Speed tap' or Quick Hands.",
      "Glow like a maniac.",
      "Nightclub fingers.",
    ],
  },
  frame_blaze: {
    title: "Blaze",
    lines: [
      "Fire frame.",
      "Blaze Mode badge.",
      "Top-tier flex.",
      "Too hot for quizzes.",
    ],
  },
  frame_frost: {
    title: "Frost",
    lines: [
      "Ice frame.",
      "Turbo Tap badge.",
      "Cold speed legend.",
      "Frozen fingers, still fast.",
    ],
  },
  frame_vortex: {
    title: "Vortex",
    lines: [
      "Portal frame.",
      "Laser Eyes badge.",
      "Accuracy warlock.",
      "You bent reality for points.",
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
