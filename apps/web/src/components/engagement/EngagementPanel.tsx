import { useEffect, useMemo, useRef, useState } from "react";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS, FEATURE_FLAGS } from "../../engagement/config";
import { useEngagement } from "../../context/EngagementContext";
import frames from "../../engagement/frames.module.css";
import styles from "./EngagementPanel.module.css";
import { formatDayKey } from "../../engagement/time";
import { avatarColor, getAvatarImageUrl } from "../../utils/avatar";
import { getOrCreateClientId } from "../../utils/ids";

type PanelMode = "lobby" | "result";
type CrewMember = {
  id: string;
  name: string;
  avatarId?: string | null;
  title?: string | null;
  role?: string | null;
};

const badgeMap = new Map(BADGE_DEFINITIONS.map((badge) => [badge.id, badge]));

export default function EngagementPanel({ mode }: { mode: PanelMode }) {
  const { state, actions } = useEngagement();
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [toastBadge, setToastBadge] = useState<string | null>(null);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [crewLoading, setCrewLoading] = useState(false);
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

  const quests = state.quests.daily.slice(0, 2);
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
  const cosmeticMap = useMemo(
    () => new Map(COSMETIC_DEFINITIONS.map((item) => [item.id, item.label])),
    [],
  );

  const unlockedBadges = state.badges.unlocked
    .map((id) => badgeMap.get(id))
    .filter(Boolean)
    .slice(-4) as { id: string; label: string; emoji: string }[];

  const showActions = mode === "lobby";

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
        {FEATURE_FLAGS.seasons && (
          <span className={styles.chip}>
            <span className={styles.chipIcon}>⏳</span>
            {daysLeft}d
          </span>
        )}
        {FEATURE_FLAGS.groups && state.group ? (
          <span className={styles.chip}>
            <span className={styles.chipIcon}>👥</span>
            {state.group.code}
          </span>
        ) : null}
        {FEATURE_FLAGS.teamStreaks && state.group && (
          <span
            className={`${styles.chip} ${styles.teamChip} ${teamPulse ? styles.teamPulse : ""} ${
              teamStatus === "active"
                ? styles.teamActive
                : teamStatus === "paused"
                  ? styles.teamPaused
                  : styles.teamIdle
            }`}
          >
            <span className={styles.teamBar} style={{ width: `${teamProgress * 100}%` }} />
            <span className={styles.chipIcon}>🤝</span>
            {state.teamStreak.current}
          </span>
        )}
        {FEATURE_FLAGS.graceDay && (
          <span className={styles.chip}>
            <span className={styles.chipIcon}>🛡️</span>
            {state.streak.graceLeft}
          </span>
        )}
        <span className={styles.chip}>
          <span className={styles.chipIcon}>🔥</span>
          {state.streak.current}
        </span>
      </div>

      {FEATURE_FLAGS.miniQuests && showQuest && quests.length ? (
        <div className={styles.questStack}>
          {quests.map((quest) => {
            const questProgress = Math.min(1, quest.progress / quest.target);
            const rewardLabel = quest.rewardId ? cosmeticMap.get(quest.rewardId) : null;
            return (
              <div key={quest.id} className={styles.questCard}>
                <div className={styles.questTop}>
                  <span className={styles.questLabel}>{quest.label}</span>
                  {rewardLabel ? <span className={styles.questReward}>+{rewardLabel}</span> : null}
                  {quest.completedAt ? <span className={styles.questDone}>✓</span> : null}
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
          {FEATURE_FLAGS.groups && (
            <button type="button" className={styles.actionButton} onClick={() => setShowGroup(true)}>
              Crew
            </button>
          )}
          {FEATURE_FLAGS.masteryBadges && (
            <button type="button" className={styles.actionButton} onClick={() => setShowBadges(true)}>
              Brags
            </button>
          )}
          {FEATURE_FLAGS.cosmetics && (
            <button type="button" className={styles.actionButton} onClick={() => setShowCosmetics(true)}>
              Drip
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
          <span className={styles.toastLabel}>Badge pop!</span>
        </div>
      ) : null}

      {isSeasonStart ? (
        <div className={styles.seasonToast}>
          <span>✨ New season</span>
        </div>
      ) : null}

      {showCosmetics ? (
        <div className={styles.overlay} onClick={() => setShowCosmetics(false)}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sheetTitle}>Your style</div>
            <div className={styles.grid}>
              {COSMETIC_DEFINITIONS.filter((item) => item.type === "frame").map((item) => {
                const unlocked = state.cosmetics.unlocked.includes(item.id);
                const active = equippedFrame === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.gridItem} ${frames[item.id] ?? ""} ${
                      active ? styles.gridActive : ""
                    } ${!unlocked ? styles.gridLocked : ""}`}
                    onClick={() => unlocked && actions.equipCosmetic(active ? null : item.id)}
                  >
                    <span>{item.label}</span>
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
            <div className={styles.sheetTitle}>Your badges</div>
            <div className={styles.grid}>
              {BADGE_DEFINITIONS.map((badge) => {
                const unlocked = state.badges.unlocked.includes(badge.id);
                return (
                  <div key={badge.id} className={`${styles.gridItem} ${unlocked ? "" : styles.gridLocked}`}>
                    <span className={styles.badgeEmoji}>{badge.emoji}</span>
                    <span className={styles.badgeLabel}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showGroup ? (
        <div className={styles.overlay} onClick={() => setShowGroup(false)}>
          <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sheetTitle}>Your crew</div>
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
                <div className={styles.groupHint}>Boot/Ban — owner only</div>
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
    </section>
  );
}
