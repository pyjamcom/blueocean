import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocation, useNavigate } from "react-router-dom";
import engageStyles from "../components/engagement/EngagementPanel.module.css";
import { useEngagement } from "../context/EngagementContext";
import { useRoom } from "../context/RoomContext";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS, QUEST_DEFINITIONS } from "../engagement/config";
import { diffDays, formatDayKey } from "../engagement/time";
import {
  AVATAR_IDS,
  avatarColor,
  avatarIconIndex,
  getAvatarImageUrl,
  getStoredAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import { assetIds, getAssetUrl } from "../utils/assets";
import { getApiBaseUrl } from "../utils/api";
import { getOrCreateClientId } from "../utils/ids";
import styles from "./LobbyView.module.css";

const PROFILE_AVATAR_FALLBACK = "/figma/lobby/767-1567.png";
const DESIGN_PLAYER_LIST = [
  { id: "design-1", avatarId: "avatar_raccoon_dj", name: "Ярик", ready: false, score: 0, correctCount: 0, streak: 0 },
  { id: "design-2", avatarId: "avatar_raccoon_dj", name: "Павел Невский", ready: false, score: 0, correctCount: 0, streak: 0 },
  { id: "design-3", avatarId: "avatar_raccoon_dj", name: "Иван Иванович", ready: false, score: 0, correctCount: 0, streak: 0 },
  { id: "design-4", avatarId: "avatar_raccoon_dj", name: "Иван Иванович", ready: false, score: 0, correctCount: 0, streak: 0 },
  { id: "design-5", avatarId: "avatar_raccoon_dj", name: "Иван Иванович", ready: false, score: 0, correctCount: 0, streak: 0 },
  { id: "design-6", avatarId: "avatar_raccoon_dj", name: "Имя клевое", ready: false, score: 0, correctCount: 0, streak: 0 },
];
const DESIGN_QUEST_ROWS = [
  { id: "design-q-1", title: "2 hits", reward: "+Buddy", claim: "Claim", progressLabel: "3/5", activeSegments: 3 },
  { id: "design-q-2", title: "2 hits", reward: "+Buddy", claim: "Claim", progressLabel: "3/5", activeSegments: 3 },
  { id: "design-q-3", title: "2 hits", reward: "+Buddy", claim: "Claim", progressLabel: "3/5", activeSegments: 3 },
] as const;
const STATUS_CHIP_LAYOUT = [
  { id: "season", width: 69 },
  { id: "crew-code", width: 89 },
  { id: "crew-streak", width: 58 },
  { id: "shield", width: 59 },
  { id: "notifications", width: 69 },
  { id: "streak", width: 58 },
] as const;

const COSMETIC_LABEL_BY_ID = new Map(COSMETIC_DEFINITIONS.map((item) => [item.id, item.label]));

type InfoPayload = Readonly<{
  title: string;
  lines: ReadonlyArray<string>;
  ctaLabel?: string;
  onCta?: () => void;
}>;

type RewardPayload = Readonly<{
  rewardLabel: string;
}>;

type CrewMember = {
  id: string;
  name: string;
  avatarId?: string | null;
  title?: string | null;
  role?: string | null;
};

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
    lines: ["3 correct in a row. No mistakes.", "Looks clean, feels smug.", "Crew sees you are not guessing.", "Brain took a shower."],
  },
  badge_speedy: {
    title: "Quick Hands",
    lines: ["3 fast corrects.", "Tap speed: goblin tier.", "People think you are cheating.", "Finger ninja energy."],
  },
  badge_marksman: {
    title: "Sure Shot",
    lines: [">=80% over 10 answers.", "You actually read the question.", "Crew trusts your guesses.", "Too accurate for a meme game."],
  },
  badge_hot_streak: {
    title: "Hot Streak",
    lines: ["5 correct in a row.", "Your brain is on a grill.", "Top streak flex.", "Warning: may smoke."],
  },
  badge_lightning: {
    title: "Turbo Tap",
    lines: ["5 fast corrects.", "Speedrun reputation.", "You answer before blinking.", "Fingers on caffeine."],
  },
  badge_combo: {
    title: "Combo Wizard",
    lines: ["3 fast + 3 streak in one flow.", "Rare combo flex.", "Feels illegal, is legal.", "You found the cheat code."],
  },
  badge_blaze: {
    title: "Blaze Mode",
    lines: ["8 correct in a row.", "Elite streak beast.", "People stop scrolling.", "Volcano in a hoodie."],
  },
  badge_sniper: {
    title: "Laser Eyes",
    lines: [">=90% over 20 answers.", "Sniper-level accuracy.", "You bend reality for points.", "No-scope in a quiz."],
  },
};

const FRAME_INFO: Record<string, { title: string; lines: string[] }> = {
  frame_bubble: { title: "Bubble", lines: ["Starter bubble frame.", "Finish '1 round boom'.", "Proof you touched the game.", "Baby-step flex."] },
  frame_gummy: { title: "Gummy", lines: ["Sweet gummy frame.", "Quest '2 hits' or Clean Run badge.", "Sticky-accurate vibe.", "Sugar-rush brain."] },
  frame_spark: { title: "Spark", lines: ["Sparkly frame.", "Quest '3 right-ish' or Sure Shot badge.", "You light up the list.", "Fireworks, no safety."] },
  frame_mint: { title: "Mint", lines: ["Minty fresh frame.", "Quest 'Turbo tap x2' or Combo Wizard.", "Clean speed flex.", "Minty brain breath."] },
  frame_comet: { title: "Comet", lines: ["Comet-trail frame.", "Quest 'Mini streak' or Hot Streak badge.", "You keep flying.", "Answers have a tail."] },
  frame_neon: { title: "Neon", lines: ["Neon speed frame.", "Quest 'Speed tap' or Quick Hands.", "Glow like a maniac.", "Nightclub fingers."] },
  frame_blaze: { title: "Blaze", lines: ["Fire frame.", "Blaze Mode badge.", "Top-tier flex.", "Too hot for quizzes."] },
  frame_frost: { title: "Frost", lines: ["Ice frame.", "Turbo Tap badge.", "Cold speed legend.", "Frozen fingers, still fast."] },
  frame_vortex: { title: "Vortex", lines: ["Portal frame.", "Laser Eyes badge.", "Accuracy warlock.", "You bent reality for points."] },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function LobbyView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { roomCode, players, playerId, setReady, setAvatar, resetRoom } = useRoom();
  const { state: engagement, actions, flags } = useEngagement();
  const apiBase = getApiBaseUrl();
  const selfId = getOrCreateClientId();
  const isOwner = engagement.group?.role === "owner";
  const designLock = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("mode") === "design" || params.get("design") === "1";
  }, [location.search]);
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
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [crewLoading, setCrewLoading] = useState(false);
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const [rewardModal, setRewardModal] = useState<RewardPayload | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrSrc, setQrSrc] = useState("");
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    actions.refresh();
  }, [actions.refresh]);

  useEffect(() => {
    if (!showGroup || !engagement.group) return;
    let active = true;
    setCrewLoading(true);
    fetch(`${apiBase}/crew/${engagement.group.code}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        const members = Array.isArray(data?.crew?.members) ? (data.crew.members as CrewMember[]) : [];
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
  }, [apiBase, showGroup, engagement.group?.code]);

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
  const selfAssetSrc = designLock
    ? PROFILE_AVATAR_FALLBACK
    : getAvatarImageUrl(selfAvatar) ?? getAssetUrl(selfAssetId) ?? PROFILE_AVATAR_FALLBACK;
  const badgeLabel = designLock ? "WEEEP" : (selfPlayer?.name ?? "WEEEP").slice(0, 12);
  const profileTag = designLock
    ? "#124"
    : `#${(playerId ?? "124").replace(/[^0-9]/g, "").slice(-3) || "124"}`;
  const rankValue = designLock ? "3" : String(selfRank || Math.max(1, players.length || 3));
  const equippedBadgeId = engagement.badges.equipped ?? engagement.badges.lastEarned ?? null;
  const equippedBadge = equippedBadgeId
    ? BADGE_DEFINITIONS.find((item) => item.id === equippedBadgeId) ?? null
    : null;

  const quickBadgeLabel = designLock
    ? "Quick Hatch"
    : equippedBadge?.label ?? "Quick Hatch";

  useEffect(() => {
    setStoredAvatarId(selfAvatar);
    if (roomCode) {
      setAvatar(selfAvatar);
    }
  }, [roomCode, selfAvatar, setAvatar]);

  const displayPlayers = useMemo(() => {
    if (designLock) {
      return DESIGN_PLAYER_LIST;
    }
    return players.slice(0, 12);
  }, [designLock, players]);

  const todayKey = formatDayKey(new Date());
  const seasonDaysLeft = Math.max(0, diffDays(todayKey, engagement.season.endDay) + 1);
  const notificationsEnabled = engagement.notifications.enabled;
  const sourceQuests = engagement.quests.daily.length
    ? engagement.quests.daily.slice(0, 3)
    : QUEST_DEFINITIONS.slice(0, 3).map((quest) => ({ ...quest, progress: 0 }));
  const completedQuests = (engagement.quests.daily.length ? engagement.quests.daily : sourceQuests).filter(
    (quest) => (quest.progress ?? 0) >= quest.target,
  ).length;
  const questTotalCount = engagement.quests.daily.length || 5;
  const questTotal = designLock ? "5/5" : `${clamp(completedQuests, 0, questTotalCount)}/${questTotalCount}`;

  const dynamicStatusChips = STATUS_CHIP_LAYOUT.map((chip) => {
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
  const statusChips = designLock
    ? [
        { ...STATUS_CHIP_LAYOUT[0], value: "4d", info: CHIP_INFO.season },
        { ...STATUS_CHIP_LAYOUT[1], value: "G7YP", info: CHIP_INFO.crew },
        { ...STATUS_CHIP_LAYOUT[2], value: "5", info: CHIP_INFO.crewStreak },
        { ...STATUS_CHIP_LAYOUT[3], value: "3", info: CHIP_INFO.shield },
        { ...STATUS_CHIP_LAYOUT[4], value: "off", info: CHIP_INFO.reminder },
        { ...STATUS_CHIP_LAYOUT[5], value: "5", info: CHIP_INFO.streak },
      ]
    : dynamicStatusChips;

  const dynamicQuestRows = sourceQuests.map((quest) => {
    const target = Math.max(1, quest.target ?? 1);
    const progress = clamp(quest.progress ?? 0, 0, target);
    const rewardLabel = quest.rewardId ? COSMETIC_LABEL_BY_ID.get(quest.rewardId) : null;
    return {
      id: quest.id,
      title: quest.label,
      reward: `+${rewardLabel ?? "Buddy"}`,
      claim: "Claim",
      progressLabel: `${progress}/${target}`,
      activeSegments: clamp(Math.round((progress / target) * 5), 0, 5),
    };
  });
  const questRows = designLock ? DESIGN_QUEST_ROWS : dynamicQuestRows;

  const actionChips = [
    { id: "badges", label: "Badges", info: CHIP_INFO.badges },
    { id: "crew", label: "Crew", info: CHIP_INFO.crew },
    { id: "style", label: "Style", info: CHIP_INFO.style },
  ] as const;
  const styleFrameItems = COSMETIC_DEFINITIONS.filter((item) => item.type === "frame");
  const styleRows: Array<typeof styleFrameItems> = [];
  for (let i = 0; i < styleFrameItems.length; i += 2) {
    styleRows.push(styleFrameItems.slice(i, i + 2));
  }
  const playerListCount = designLock ? 12 : players.length;

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

  const closeSheets = () => {
    setShowCosmetics(false);
    setShowBadges(false);
    setShowGroup(false);
  };

  const openInfo = (payload: InfoPayload, shouldCloseSheets = true) => {
    if (designLock) return;
    if (shouldCloseSheets) {
      closeSheets();
    }
    setRewardModal(null);
    setQrVisible(false);
    setInfo(payload);
  };

  const closeInfo = () => setInfo(null);
  const closeRewardModal = () => setRewardModal(null);

  const runCrewAction = async (action: "kick" | "ban", targetId: string) => {
    if (!engagement.group) return;
    try {
      const res = await fetch(`${apiBase}/crew/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: engagement.group.code,
          requesterId: selfId,
          targetId,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.crew?.members)) {
        setCrewMembers(data.crew.members as CrewMember[]);
      } else {
        setCrewMembers((prev) => prev.filter((member) => member.id !== targetId));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className={`${styles.page} ${designLock ? styles.designLock : ""}`}>
      <div className={styles.pageDesktopBackground} aria-hidden="true" />
      <div className={styles.pageDesktopGradient} aria-hidden="true" />
      <main className={styles.lobby}>
        <img
          className={`${styles.baseBackgroundImage} ${styles.baseBackgroundImageMobile}`}
          src="/figma/join/image-931.png"
          alt=""
          aria-hidden="true"
        />

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
            onPointerDown={designLock ? undefined : handlePointerDown}
            onPointerUp={designLock ? undefined : handlePointerUp}
            onClick={designLock ? undefined : () => handleAvatarCycle(1)}
            aria-label={selfAvatar}
          >
            <div className={styles.avatarFrame}>
              <img src={selfAssetSrc} alt="" className={styles.avatarImage} />
              {equippedBadge ? (
                <span className={styles.avatarBadgeMark} title={equippedBadge.label} aria-hidden="true">
                  {equippedBadge.emoji}
                </span>
              ) : null}
            </div>
            <span className={styles.quickBadge}>
              <span className={styles.quickBadgeIcon} aria-hidden="true">
                {equippedBadge?.emoji ?? "⚡"}
              </span>
              <span className={styles.quickBadgeLabel}>{quickBadgeLabel}</span>
            </span>
          </div>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={designLock ? undefined : () => handleAvatarCycle(1)}
          >
            Choose avatar
          </button>
        </section>

        <section className={`${styles.card} ${styles.playerListCard}`}>
          <header className={styles.listHeader}>
            <h2 className={styles.listTitle}>Player list</h2>
            <span className={styles.listCount}>{playerListCount}</span>
          </header>
          <div className={styles.playerGrid}>
            {displayPlayers.map((player) => {
              const avatarKey = player.avatarId ?? player.id;
              const playerAssetId = lobbyAssets.length
                ? lobbyAssets[avatarIconIndex(avatarKey) % lobbyAssets.length]
                : undefined;
              const playerSrc = designLock
                ? PROFILE_AVATAR_FALLBACK
                : getAvatarImageUrl(avatarKey) ?? getAssetUrl(playerAssetId) ?? PROFILE_AVATAR_FALLBACK;
              const playerReady = player.ready === true;
              return (
                <article key={player.id} className={styles.playerCard}>
                  <div className={`${styles.playerAvatarWrap} ${playerReady ? styles.playerAvatarWrapReady : ""}`}>
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
                  if (designLock) return;
                  if (chip.id === "notifications" && flags.notifications) {
                    actions.setNotificationsEnabled(!notificationsEnabled);
                  }
                  openInfo(chip.info);
                }}
              >
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
                  if (designLock) return;
                  closeSheets();
                  setInfo(null);
                  setQrVisible(false);
                  setRewardModal({ rewardLabel: quest.reward });
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
                onClick={() => {
                  if (designLock) return;
                  if (chip.id === "badges") {
                    closeSheets();
                    setShowBadges(true);
                    return;
                  }
                  if (chip.id === "crew") {
                    closeSheets();
                    setShowGroup(true);
                    return;
                  }
                  if (chip.id === "style") {
                    closeSheets();
                    setShowCosmetics(true);
                  }
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.quickRoundButton}
            onClick={() => {
              if (designLock) return;
              openInfo(CHIP_INFO.reminder);
            }}
          >
            Play one quick round?
          </button>
        </section>
      </main>

      <footer className={styles.downBar}>
        <div className={styles.buttonsRow}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonNeutral}`}
            onClick={designLock ? undefined : () => setQrVisible(true)}
            disabled={!designLock && !roomCode}
            aria-label="Show room QR"
          >
            <img src="/figma/lobby/325-2880.svg" alt="" className={styles.icon} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${
              designLock ? styles.iconButtonNeutral : soundOn ? styles.iconButtonNeutral : styles.iconButtonDanger
            }`}
            onClick={() => {
              if (designLock) return;
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
              src={designLock ? "/figma/lobby/325-2883.svg" : soundOn ? "/figma/join/lets-icons-sound-max-fill.svg" : "/figma/lobby/325-2883.svg"}
              alt=""
              className={styles.icon}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className={styles.joinButton}
            onClick={designLock ? undefined : () => setReady(!selfReady)}
            aria-label="Join game"
          >
            <img src="/figma/lobby/325-2888.svg" alt="" className={styles.joinIcon} aria-hidden="true" />
            <span>Join game</span>
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonDanger}`}
            onClick={() => {
              if (designLock) return;
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
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={() => setQrVisible(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>Room QR</h3>
            <p className={styles.modalText}>{joinUrl || "Room link is not ready"}</p>
            <div className={styles.qrFrame}>{qrSrc ? <img src={qrSrc} alt="Room QR" className={styles.qrImage} /> : "…"}</div>
            <button type="button" className={styles.modalClose} onClick={() => setQrVisible(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showCosmetics ? (
        <div
          className={styles.questModalOverlay}
          onClick={() => {
            setShowCosmetics(false);
            actions.markCosmeticSeen();
          }}
        >
          <div className={styles.styleModal} onClick={(event) => event.stopPropagation()}>
            {styleRows.map((row, rowIndex) => (
              <div key={`style-row-${rowIndex}`} className={styles.styleModalRow}>
                {row.map((item) => {
                  const unlocked = engagement.cosmetics.unlocked.includes(item.id);
                  const active = engagement.cosmetics.equipped.frame === item.id;
                  const isNew = unlocked && engagement.cosmetics.lastUnlocked === item.id;
                  const tagLabel = active ? "Active" : isNew ? "New" : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.styleModalItem} ${active ? styles.styleModalItemActive : ""} ${
                        !unlocked ? styles.styleModalItemLocked : ""
                      }`}
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
                      {!unlocked ? <span className={styles.styleModalLockIcon} aria-hidden="true" /> : null}
                      <span className={styles.styleModalItemLabel}>{item.label}</span>
                      {tagLabel ? (
                        <span
                          className={`${styles.styleModalItemTag} ${
                            active ? styles.styleModalItemTagActive : styles.styleModalItemTagNew
                          }`}
                        >
                          {tagLabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {row.length === 1 ? <span className={styles.styleModalItemSpacer} aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showBadges ? (
        <div className={engageStyles.overlay} onClick={() => setShowBadges(false)}>
          <div className={engageStyles.sheet} onClick={(event) => event.stopPropagation()}>
            <div
              className={engageStyles.sheetTitle}
              onClick={() => openInfo(CHIP_INFO.badges)}
              role="button"
              tabIndex={0}
            >
              Your Badges
            </div>
            <div className={engageStyles.grid}>
              {BADGE_DEFINITIONS.map((badge) => {
                const unlocked = engagement.badges.unlocked.includes(badge.id);
                const active = equippedBadgeId === badge.id;
                const rareClass = badge.rarity === "rare" ? engageStyles.gridRare : "";
                return (
                  <button
                    key={badge.id}
                    type="button"
                    className={`${engageStyles.gridItem} ${rareClass} ${unlocked ? "" : engageStyles.gridLocked} ${
                      active ? engageStyles.gridActive : ""
                    }`}
                    onClick={() => {
                      const base = BADGE_INFO[badge.id] ?? { title: badge.label, lines: [] };
                      const ctaLabel = unlocked ? (active ? "Unequip" : "Equip") : undefined;
                      const onCta = unlocked
                        ? () => {
                            actions.equipBadge(active ? null : badge.id);
                            closeInfo();
                          }
                        : undefined;
                      openInfo({ title: base.title, lines: base.lines, ctaLabel, onCta });
                    }}
                  >
                    <span className={engageStyles.badgeEmoji}>{badge.emoji}</span>
                    <span className={engageStyles.badgeLabel}>{badge.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {showGroup ? (
        <div className={engageStyles.overlay} onClick={() => setShowGroup(false)}>
          <div className={engageStyles.sheet} onClick={(event) => event.stopPropagation()}>
            <div
              className={engageStyles.sheetTitle}
              onClick={() => openInfo(CHIP_INFO.crew)}
              role="button"
              tabIndex={0}
            >
              Your Crew
            </div>
            {engagement.group ? (
              <div className={engageStyles.groupBlock}>
                <div className={engageStyles.groupCode}>{engagement.group.code}</div>
                <div className={engageStyles.groupList}>
                  {crewLoading ? (
                    <div className={engageStyles.groupHint}>Loading crew...</div>
                  ) : crewMembers.length ? (
                    crewMembers.map((member) => {
                      const avatarSrc = member.avatarId ? getAvatarImageUrl(member.avatarId) : null;
                      const canModerate = Boolean(isOwner) && member.id !== selfId && member.role !== "owner";
                      return (
                        <div key={member.id} className={engageStyles.groupRow}>
                          <span
                            className={engageStyles.groupAvatar}
                            style={{ background: avatarColor(member.avatarId ?? member.name) }}
                          >
                            {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{member.name.charAt(0)}</span>}
                          </span>
                          <span className={engageStyles.groupName}>{member.name}</span>
                          <span className={engageStyles.groupMeta}>
                            {member.title ? <span className={engageStyles.groupTitle}>{member.title}</span> : null}
                            {canModerate ? (
                              <span className={engageStyles.groupActions}>
                                <button
                                  type="button"
                                  className={engageStyles.groupKick}
                                  onClick={() => runCrewAction("kick", member.id)}
                                >
                                  Boot
                                </button>
                                <button
                                  type="button"
                                  className={engageStyles.groupBan}
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
                    <div className={engageStyles.groupHint}>No crew yet</div>
                  )}
                </div>
                <div className={engageStyles.groupHint}>Boot/Ban - owner only</div>
                <button
                  type="button"
                  className={engageStyles.actionButton}
                  onClick={async () => {
                    await actions.leaveGroup();
                    setShowGroup(false);
                  }}
                >
                  Leave
                </button>
              </div>
            ) : (
              <div className={engageStyles.groupBlock}>
                <button
                  type="button"
                  className={engageStyles.actionButton}
                  onClick={async () => {
                    await actions.createGroup();
                    setShowGroup(false);
                  }}
                >
                  Create
                </button>
                <input
                  className={engageStyles.groupInput}
                  value={groupInput}
                  onChange={(event) => setGroupInput(event.target.value.toUpperCase().slice(0, 6))}
                  placeholder="CODE"
                />
                <button
                  type="button"
                  className={engageStyles.actionButton}
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
        <div className={styles.questModalOverlay} onClick={closeInfo}>
          <div className={styles.questInfoModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.questInfoModalContent}>
              <h3 className={styles.questInfoModalTitle}>{info.title}</h3>
              <p className={styles.questInfoModalBody}>{info.lines.join(" ")}</p>
            </div>
            <button
              type="button"
              className={styles.questModalClose}
              onClick={() => {
                if (info.onCta) {
                  info.onCta();
                  return;
                }
                closeInfo();
              }}
            >
              {info.ctaLabel ?? "Close"}
            </button>
          </div>
        </div>
      ) : null}

      {rewardModal ? (
        <div className={styles.questModalOverlay} onClick={closeRewardModal}>
          <div className={styles.questRewardModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.questRewardContent}>
              <h3 className={styles.questRewardTitle}>Congratulations! You got a reward!</h3>
              <span className={styles.questRewardBadge}>{rewardModal.rewardLabel}</span>
            </div>
            <button type="button" className={styles.questModalClose} onClick={closeRewardModal}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
