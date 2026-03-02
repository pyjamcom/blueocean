import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { useEngagement } from "../context/EngagementContext";
import { useRoom } from "../context/RoomContext";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS, QUEST_DEFINITIONS } from "../engagement/config";
import { diffDays, formatDayKey } from "../engagement/time";
import {
  AVATAR_IDS,
  avatarIconIndex,
  getAvatarImageUrl,
  getStoredAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import { assetIds, getAssetUrl } from "../utils/assets";
import styles from "./LobbyView.module.css";

const PROFILE_AVATAR_FALLBACK = "/figma/lobby/767-1567.png";
const STATUS_CHIP_LAYOUT = [
  { id: "season", icon: "⏳", width: 69 },
  { id: "crew-code", icon: "👥", width: 89 },
  { id: "crew-streak", icon: "🤝", width: 58 },
  { id: "shield", icon: "🛡️", width: 59 },
  { id: "notifications", icon: "🔔", width: 69 },
  { id: "streak", icon: "🔥", width: 58 },
] as const;

const COSMETIC_LABEL_BY_ID = new Map(COSMETIC_DEFINITIONS.map((item) => [item.id, item.label]));

type InfoPayload = Readonly<{
  title: string;
  lines: ReadonlyArray<string>;
}>;

type RewardPayload = Readonly<{
  title: string;
  rewardLabel: string;
  progress: string;
}>;

const CHIP_INFO = {
  season: {
    title: "Season Sprint",
    lines: ["Global sprint window", "Resets automatically", "Cosmetics stay unlocked"],
  },
  crew: {
    title: "Crew",
    lines: ["Your squad room", "Code for invite", "Shared crew progress"],
  },
  crewStreak: {
    title: "Crew Streak",
    lines: ["Consecutive crew days", "Needs active players", "Drops if crew sleeps"],
  },
  shield: {
    title: "Shield / Grace",
    lines: ["Forgives one missed day", "Refills by week", "Protects streak reset"],
  },
  reminder: {
    title: "Reminder settings",
    lines: ["Daily reminder flag", "Tap to toggle On/Off", "Quiet hours respected"],
  },
  streak: {
    title: "Hot Streak",
    lines: ["Current personal streak", "Increases after active day", "Breaks on missed day"],
  },
  badges: {
    title: "Badges",
    lines: ["Unlocked mastery marks", "Earned in rounds", "Affects status and style"],
  },
  style: {
    title: "Style",
    lines: ["Unlocked cosmetics", "Equipable visual frame", "Linked to quests and badges"],
  },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function LobbyView() {
  const navigate = useNavigate();
  const { roomCode, players, playerId, setReady, setAvatar, resetRoom } = useRoom();
  const { state: engagement, actions, flags } = useEngagement();
  const lobbyAssets = assetIds.length ? assetIds : [];
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sound_enabled") !== "0";
  });
  const [avatarIndex, setAvatarIndex] = useState(() => {
    const stored = getStoredAvatarId();
    if (stored) {
      const idx = AVATAR_IDS.indexOf(stored);
      if (idx >= 0) return idx;
    }
    return Math.floor(Math.random() * AVATAR_IDS.length);
  });
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const [rewardModal, setRewardModal] = useState<RewardPayload | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrSrc, setQrSrc] = useState("");
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    actions.refresh();
  }, [actions.refresh]);

  const handleAvatarCycle = (direction: number) => {
    setAvatarIndex((prev) => (prev + direction + AVATAR_IDS.length) % AVATAR_IDS.length);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    touchStart.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchStart.current === null) {
      handleAvatarCycle(1);
      return;
    }
    const delta = event.clientX - touchStart.current;
    if (Math.abs(delta) > 24) {
      handleAvatarCycle(delta > 0 ? -1 : 1);
    } else {
      handleAvatarCycle(1);
    }
    touchStart.current = null;
  };

  const selfAvatar = AVATAR_IDS[avatarIndex] ?? AVATAR_IDS[0] ?? "avatar_raccoon_dj";
  const scoreSorted = [...players].sort((a, b) => b.score - a.score);
  const selfPlayer = players.find((player) => player.id === playerId);
  const selfRank = selfPlayer ? scoreSorted.findIndex((player) => player.id === selfPlayer.id) + 1 : 0;
  const selfReady = selfPlayer?.ready ?? false;
  const selfAssetId = lobbyAssets.length
    ? lobbyAssets[avatarIconIndex(selfAvatar) % lobbyAssets.length] ?? lobbyAssets[0]
    : undefined;
  const selfAssetSrc =
    getAvatarImageUrl(selfAvatar) ?? getAssetUrl(selfAssetId) ?? PROFILE_AVATAR_FALLBACK;
  const badgeLabel = (selfPlayer?.name ?? "WEEEP").slice(0, 12);
  const profileTag = `#${(playerId ?? "124").replace(/[^0-9]/g, "").slice(-3) || "124"}`;
  const rankValue = String(selfRank || Math.max(1, players.length || 3));

  const quickBadgeLabel =
    BADGE_DEFINITIONS.find((item) => item.id === engagement.badges.lastEarned)?.label ?? "Quick Hatch";

  useEffect(() => {
    setStoredAvatarId(selfAvatar);
    if (roomCode) {
      setAvatar(selfAvatar);
    }
  }, [roomCode, selfAvatar, setAvatar]);

  const displayPlayers = useMemo(() => {
    if (players.length) {
      return players.slice(0, 12);
    }
    return [
      { id: "fallback-1", avatarId: selfAvatar, name: "Ярик", ready: false, score: 0, correctCount: 0, streak: 0 },
      { id: "fallback-2", avatarId: selfAvatar, name: "Павел Невский", ready: false, score: 0, correctCount: 0, streak: 0 },
      { id: "fallback-3", avatarId: selfAvatar, name: "Иван Иванович", ready: false, score: 0, correctCount: 0, streak: 0 },
      { id: "fallback-4", avatarId: selfAvatar, name: "Иван Иванович", ready: false, score: 0, correctCount: 0, streak: 0 },
      { id: "fallback-5", avatarId: selfAvatar, name: "Иван Иванович", ready: false, score: 0, correctCount: 0, streak: 0 },
      { id: "fallback-6", avatarId: selfAvatar, name: "Имя клевое", ready: false, score: 0, correctCount: 0, streak: 0 },
    ];
  }, [players, selfAvatar]);

  const todayKey = formatDayKey(new Date());
  const seasonDaysLeft = Math.max(0, diffDays(todayKey, engagement.season.endDay) + 1);
  const notificationsEnabled = engagement.notifications.enabled;
  const sourceQuests = engagement.quests.daily.length
    ? engagement.quests.daily.slice(0, 3)
    : QUEST_DEFINITIONS.slice(0, 3).map((quest) => ({ ...quest, progress: 0 }));
  const completedQuests = (engagement.quests.daily.length ? engagement.quests.daily : sourceQuests).filter(
    (quest) => (quest.progress ?? 0) >= quest.target,
  ).length;
  const questTotalCount = (engagement.quests.daily.length || 5);
  const questTotal = `${clamp(completedQuests, 0, questTotalCount)}/${questTotalCount}`;

  const statusChips = STATUS_CHIP_LAYOUT.map((chip) => {
    if (chip.id === "season") {
      return { ...chip, value: `${seasonDaysLeft}d`, info: CHIP_INFO.season };
    }
    if (chip.id === "crew-code") {
      return {
        ...chip,
        value: engagement.group?.code ?? roomCode ?? "----",
        info: CHIP_INFO.crew,
      };
    }
    if (chip.id === "crew-streak") {
      return { ...chip, value: String(engagement.teamStreak.current), info: CHIP_INFO.crewStreak };
    }
    if (chip.id === "shield") {
      return { ...chip, value: String(engagement.streak.graceLeft), info: CHIP_INFO.shield };
    }
    if (chip.id === "notifications") {
      return { ...chip, value: notificationsEnabled ? "On" : "Off", info: CHIP_INFO.reminder };
    }
    return { ...chip, value: String(engagement.streak.current), info: CHIP_INFO.streak };
  });

  const questRows = sourceQuests.map((quest) => {
    const target = Math.max(1, quest.target ?? 1);
    const progress = clamp(quest.progress ?? 0, 0, target);
    const rewardLabel = quest.rewardId ? COSMETIC_LABEL_BY_ID.get(quest.rewardId) : null;
    const claimed = progress >= target;
    return {
      id: quest.id,
      title: quest.label,
      reward: `+${rewardLabel ?? "Buddy"}`,
      claim: claimed ? "Claimed" : "Claim",
      progressLabel: `${progress}/${target}`,
      activeSegments: clamp(Math.round((progress / target) * 5), 0, 5),
    };
  });

  const actionChips = [
    { id: "badges", label: "Badges", info: CHIP_INFO.badges },
    { id: "crew", label: "Crew", info: CHIP_INFO.crew },
    { id: "style", label: "Style", info: CHIP_INFO.style },
  ] as const;

  const joinUrl = roomCode ? `https://d0.do/${roomCode}` : "";

  useEffect(() => {
    if (!qrVisible || !joinUrl || qrSrc) return;
    let active = true;
    QRCode.toDataURL(joinUrl, {
      width: 300,
      margin: 1,
      color: { dark: "#101010", light: "#ffffff" },
    }).then((value) => {
      if (active) setQrSrc(value);
    });
    return () => {
      active = false;
    };
  }, [joinUrl, qrSrc, qrVisible]);

  useEffect(() => {
    if (!qrVisible) {
      setQrSrc("");
    }
  }, [qrVisible]);

  const closeOverlay = () => {
    setInfo(null);
    setRewardModal(null);
    setQrVisible(false);
  };

  const openInfo = (payload: InfoPayload) => {
    setRewardModal(null);
    setQrVisible(false);
    setInfo(payload);
  };

  return (
    <div className={styles.page}>
      <main className={styles.lobby}>
        <img className={styles.baseBackgroundImage} src="/figma/lobby/325-2796.png" alt="" aria-hidden="true" />

        <section className={`${styles.card} ${styles.startCard}`}>
          <h1 className={styles.startTitle}>Waiting for other players</h1>
          <div className={styles.metaRow}>
            <span className={`${styles.metaPill} ${styles.metaPillDark}`}>
              <img src="/figma/lobby/325-2801.svg" alt="" aria-hidden="true" className={styles.metaIcon} />
              {rankValue}
            </span>
            <span className={`${styles.metaPill} ${styles.metaPillBadge}`}>{badgeLabel}</span>
            <span className={`${styles.metaPill} ${styles.metaPillDark}`}>{profileTag}</span>
          </div>
        </section>

        <section className={`${styles.card} ${styles.avatarCard}`}>
          <div
            className={styles.avatarWrap}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onClick={() => handleAvatarCycle(1)}
            aria-label={selfAvatar}
          >
            <div className={styles.avatarFrame}>
              <img src={selfAssetSrc} alt="" className={styles.avatarImage} />
            </div>
            <span className={styles.quickBadge}>
              <span className={styles.quickBadgeIcon}>⚡️</span>
              <span className={styles.quickBadgeLabel}>{quickBadgeLabel}</span>
            </span>
          </div>
          <button type="button" className={styles.avatarButton} onClick={() => handleAvatarCycle(1)}>
            Choose avatar
          </button>
        </section>

        <section className={`${styles.card} ${styles.playerListCard}`}>
          <header className={styles.listHeader}>
            <h2 className={styles.listTitle}>Player list</h2>
            <span className={styles.listCount}>{displayPlayers.length}</span>
          </header>
          <div className={styles.playerGrid}>
            {displayPlayers.map((player) => {
              const playerAssetId = lobbyAssets.length
                ? lobbyAssets[avatarIconIndex(player.avatarId) % lobbyAssets.length]
                : undefined;
              const playerSrc = getAvatarImageUrl(player.avatarId) ?? getAssetUrl(playerAssetId) ?? PROFILE_AVATAR_FALLBACK;
              return (
                <article key={player.id} className={styles.playerCard}>
                  <div className={styles.playerAvatarWrap}>
                    <img src={playerSrc} alt="" className={styles.playerAvatar} />
                  </div>
                  <span className={styles.playerName}>{player.name ?? "Player"}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`${styles.card} ${styles.questCard}`}>
          <header className={styles.questHeader}>
            <h2 className={styles.questTitle}>Quests for the game</h2>
            <span className={styles.questTotal}>{questTotal}</span>
          </header>

          <div className={styles.statusGrid}>
            {statusChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={styles.statusChip}
                style={{ width: `${chip.width}px` }}
                onClick={() => {
                  if (chip.id === "notifications" && flags.notifications) {
                    actions.setNotificationsEnabled(!notificationsEnabled);
                  }
                  openInfo(chip.info);
                }}
              >
                <span className={styles.statusIcon}>{chip.icon}</span>
                <span className={styles.statusValue}>{chip.value}</span>
              </button>
            ))}
          </div>

          <div className={styles.questRows}>
            {questRows.map((quest) => (
              <button
                key={quest.id}
                type="button"
                className={styles.questRow}
                onClick={() => {
                  setInfo(null);
                  setQrVisible(false);
                  setRewardModal({
                    title: quest.title,
                    rewardLabel: quest.reward,
                    progress: quest.progressLabel,
                  });
                }}
              >
                <span className={styles.questRowContent}>
                  <span className={styles.questName}>{quest.title}</span>
                  <span className={styles.questActions}>
                    <span className={styles.questReward}>{quest.reward}</span>
                    <span className={styles.questClaim}>{quest.claim}</span>
                  </span>
                </span>
                <span className={styles.questProgressBar}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span
                      key={`${quest.id}-${index}`}
                      className={index < quest.activeSegments ? styles.progressOn : styles.progressOff}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.actionRow}>
            {actionChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={styles.actionChip}
                onClick={() => openInfo(chip.info)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.downBar}>
        <div className={styles.buttonsRow}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonNeutral}`}
            onClick={() => setQrVisible(true)}
            disabled={!roomCode}
            aria-label="Show room QR"
          >
            <img src="/figma/lobby/325-2880.svg" alt="" className={styles.icon} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${soundOn ? styles.iconButtonNeutral : styles.iconButtonDanger}`}
            onClick={() => {
              setSoundOn((prev) => {
                const next = !prev;
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("sound_enabled", next ? "1" : "0");
                }
                return next;
              });
            }}
            aria-label={soundOn ? "Disable sound" : "Enable sound"}
          >
            <img
              src={soundOn ? "/figma/join/lets-icons-sound-max-fill.svg" : "/figma/lobby/325-2883.svg"}
              alt=""
              className={styles.icon}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className={styles.joinButton}
            onClick={() => setReady(!selfReady)}
            aria-label="Join game"
          >
            <img src="/figma/lobby/325-2888.svg" alt="" className={styles.joinIcon} aria-hidden="true" />
            <span>Join game</span>
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonDanger}`}
            onClick={() => {
              resetRoom();
              navigate("/join", { replace: true });
            }}
            aria-label="Logout"
          >
            <img src="/figma/lobby/325-2897.svg" alt="" className={styles.icon} aria-hidden="true" />
          </button>
        </div>
      </footer>

      {qrVisible ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={closeOverlay}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>Room QR</h3>
            <p className={styles.modalText}>{joinUrl || "Room link is not ready"}</p>
            <div className={styles.qrFrame}>{qrSrc ? <img src={qrSrc} alt="Room QR" className={styles.qrImage} /> : "…"}</div>
            <button type="button" className={styles.modalClose} onClick={closeOverlay}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {info ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={closeOverlay}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>{info.title}</h3>
            <div className={styles.modalList}>
              {info.lines.map((line) => (
                <p key={line} className={styles.modalText}>{line}</p>
              ))}
            </div>
            <button type="button" className={styles.modalClose} onClick={closeOverlay}>
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {rewardModal ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={closeOverlay}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>{rewardModal.title}</h3>
            <p className={styles.modalText}>Reward: {rewardModal.rewardLabel}</p>
            <p className={styles.modalText}>Progress: {rewardModal.progress}</p>
            <button type="button" className={styles.modalClose} onClick={closeOverlay}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
