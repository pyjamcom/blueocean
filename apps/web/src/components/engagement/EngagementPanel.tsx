import { useEffect, useMemo, useState } from "react";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS, FEATURE_FLAGS } from "../../engagement/config";
import { useEngagement } from "../../context/EngagementContext";
import frames from "../../engagement/frames.module.css";
import styles from "./EngagementPanel.module.css";
import { formatDayKey } from "../../engagement/time";

type PanelMode = "lobby" | "result";

const badgeMap = new Map(BADGE_DEFINITIONS.map((badge) => [badge.id, badge]));

export default function EngagementPanel({ mode }: { mode: PanelMode }) {
  const { state, actions } = useEngagement();
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [toastBadge, setToastBadge] = useState<string | null>(null);

  useEffect(() => {
    actions.refresh();
  }, [actions.refresh]);

  useEffect(() => {
    if (!state.badges.lastEarned) return;
    setToastBadge(state.badges.lastEarned);
    const timer = window.setTimeout(() => setToastBadge(null), 2200);
    return () => window.clearTimeout(timer);
  }, [state.badges.lastEarned]);

  const daysLeft = useMemo(() => {
    const end = new Date(state.season.endDay);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, diff);
  }, [state.season.endDay]);

  const quest = state.quests.daily[0];
  const questProgress = quest ? Math.min(1, quest.progress / quest.target) : 0;
  const equippedFrame = state.cosmetics.equipped.frame ?? null;
  const isSeasonStart = formatDayKey(new Date()) === state.season.startDay;
  const showQuest = mode === "lobby";

  const unlockedBadges = state.badges.unlocked
    .map((id) => badgeMap.get(id))
    .filter(Boolean)
    .slice(-4) as { id: string; label: string; emoji: string }[];

  const showActions = mode === "lobby";

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
          <span className={styles.chip}>
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

      {FEATURE_FLAGS.miniQuests && quest && showQuest && (
        <div className={styles.questCard}>
          <div className={styles.questTop}>
            <span className={styles.questLabel}>{quest.label}</span>
            {quest.completedAt ? <span className={styles.questDone}>✓</span> : null}
          </div>
          <div className={styles.questBar}>
            <span className={styles.questBarFill} style={{ width: `${questProgress * 100}%` }} />
          </div>
        </div>
      )}

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
