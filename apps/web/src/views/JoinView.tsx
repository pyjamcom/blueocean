import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import {
  AVATAR_IDS,
  avatarIconIndex,
  getStoredAvatarId,
  getAvatarImageUrl,
  randomAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import { trackEvent } from "../utils/analytics";
import { assetIds, getAssetUrl } from "../utils/assets";
import { randomId } from "../utils/ids";
import { getStoredPlayerName, setStoredPlayerName } from "../utils/playerName";
import {
  isFirebaseEnabled,
  onFirebaseUser,
  handleAppleRedirectResult,
  signInWithFacebook,
  signInWithApple,
  signInWithGoogle,
  signInWithTwitter,
} from "../utils/firebase";
import { BADGE_DEFINITIONS, COSMETIC_DEFINITIONS, QUEST_DEFINITIONS } from "../engagement/config";
import { useEngagement } from "../context/EngagementContext";
import { diffDays, formatDayKey } from "../engagement/time";
import styles from "./JoinView.module.css";

const DEFAULT_PUBLIC_ROOM = "PLAY";
const HOST_WAIT_KEY = "escapers_host_wait";
const MIN_PLAYERS = 3;
const PROFILE_AVATAR_FALLBACK = "/figma/join/avatar-main-104.png";
const LEGACY_DEFAULT_NAME_RE = /^кл[её]воеимя\d*$/i;
const LAST_AUTH_PROVIDER_KEY = "escapers_last_auth_provider";
const JOIN_HERO_TITLE = "Party Games & Meme Quiz - Join Escapers";
const JOIN_HERO_SUBTITLE = "Funny party quiz with friends: icebreaker games and online group game rooms.";
const JOIN_QUESTS_TITLE = "Quests for the game";
const JOIN_STATUS_CHIP_LAYOUT = [
  {
    id: "season",
    icon: "⏳",
    width: 69,
    title: "Season",
    body: "Time left in the current season sprint",
  },
  {
    id: "crew-code",
    icon: "👥",
    width: 89,
    title: "Crew code",
    body: "Your current crew invite code",
  },
  {
    id: "crew-streak",
    icon: "🤝",
    width: 58,
    title: "Crew streak",
    body: "Current shared crew streak",
  },
  {
    id: "shield",
    icon: "🛡️",
    width: 59,
    title: "Shield",
    body: "Grace shield count for your streak",
  },
  {
    id: "notifications",
    icon: "🔔",
    width: 69,
    title: "Notifications",
    body: "Reminder notifications toggle state",
  },
  {
    id: "streak",
    icon: "🔥",
    width: 58,
    title: "Streak",
    body: "Current personal streak",
  },
] as const;

const COSMETIC_LABEL_BY_ID = new Map(COSMETIC_DEFINITIONS.map((item) => [item.id, item.label]));
const JOIN_TOP3_ROWS = [
  { id: "top-1", rank: 1, name: "Ярик", score: "2445", tier: "gold", tall: true },
  { id: "top-2", rank: 2, name: "Ярик", score: "2445", tier: "silver", tall: false },
  { id: "top-3", rank: 3, name: "Ярик", score: "2445", tier: "bronze", tall: false },
] as const;
type AuthProvider = "google" | "facebook" | "apple" | "twitter" | "twitch" | "firebase" | null;
type FirebaseAuthProvider = Exclude<AuthProvider, "twitch" | "firebase" | null>;

const PROVIDER_TO_FIREBASE_ID: Record<FirebaseAuthProvider, string> = {
  google: "google.com",
  facebook: "facebook.com",
  apple: "apple.com",
  twitter: "twitter.com",
};

function resolveFirebaseProvider(providerId: string | undefined): Exclude<AuthProvider, "twitch" | null> {
  if (providerId === "google.com") return "google";
  if (providerId === "facebook.com") return "facebook";
  if (providerId === "apple.com") return "apple";
  if (providerId === "twitter.com") return "twitter";
  return "firebase";
}

function resolveProviderFromFirebaseSession(
  providerIds: string[],
  fallbackProvider: AuthProvider,
): Exclude<AuthProvider, "twitch" | null> {
  if (
    fallbackProvider &&
    fallbackProvider !== "twitch" &&
    fallbackProvider !== "firebase" &&
    providerIds.includes(PROVIDER_TO_FIREBASE_ID[fallbackProvider])
  ) {
    return fallbackProvider;
  }

  const firstKnownProviderId = providerIds.find((providerId) =>
    Object.values(PROVIDER_TO_FIREBASE_ID).includes(providerId),
  );
  const mappedProvider = resolveFirebaseProvider(firstKnownProviderId);
  if (mappedProvider !== "firebase") {
    return mappedProvider;
  }

  if (fallbackProvider && fallbackProvider !== "twitch") {
    return fallbackProvider;
  }

  return "firebase";
}

function setLastAuthProvider(provider: Exclude<AuthProvider, null>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_AUTH_PROVIDER_KEY, provider);
}

function getLastAuthProvider(): AuthProvider {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(LAST_AUTH_PROVIDER_KEY);
  if (
    value === "google" ||
    value === "facebook" ||
    value === "apple" ||
    value === "twitter" ||
    value === "twitch" ||
    value === "firebase"
  ) {
    return value;
  }
  return null;
}

export default function JoinView() {
  const { state: engagement } = useEngagement();
  const location = useLocation();
  const navigate = useNavigate();
  const { code: codeFromPath } = useParams<{ code?: string }>();
  const params = new URLSearchParams(location.search);
  const downbarAction = params.get("downbar");
  const rawCode = (params.get("code") ?? codeFromPath)?.toUpperCase();
  const codeParam = rawCode && /^[A-Z0-9]{4}$/.test(rawCode) ? rawCode : undefined;
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const apiOrigin = useMemo(() => {
    try {
      return new URL(apiBase).origin;
    } catch (error) {
      return typeof window === "undefined" ? "http://localhost:3001" : window.location.origin;
    }
  }, [apiBase]);
  const { roomCode, joinRoom, setAvatar, setName, isHost, players, resetRoom } = useRoom();
  const firebaseEnabled = isFirebaseEnabled();
  const storedAvatarId = useMemo(() => getStoredAvatarId(), []);
  const initialAvatarId = useMemo(() => storedAvatarId ?? randomAvatarId(), [storedAvatarId]);
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const downbarActionHandledRef = useRef(false);
  const joinRetryRef = useRef(0);
  const [avatarIndex, setAvatarIndex] = useState(() => {
    const idx = AVATAR_IDS.indexOf(initialAvatarId);
    return idx >= 0 ? idx : 0;
  });

  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(null);
  const joinTarget = roomCode ?? codeParam ?? pendingRoomCode;
  const joinUrl = useMemo(() => (joinTarget ? `https://d0.do/${joinTarget}` : ""), [joinTarget]);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [qrVisible, setQrVisible] = useState(false);
  const showQr = !codeParam;
  const [playerName, setPlayerName] = useState(() => {
    const storedName = getStoredPlayerName().trim();
    if (!storedName) return "";
    return LEGACY_DEFAULT_NAME_RE.test(storedName) ? "" : storedName;
  });
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<AuthProvider>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [questModal, setQuestModal] = useState<{ title: string; body: string } | null>(null);
  const isManagerRoute = location.pathname === "/manager";
  useEffect(() => {
    if (!codeParam) return;
    joinRoom(codeParam, initialAvatarId, playerName);
  }, [codeParam, initialAvatarId, joinRoom, playerName]);

  useEffect(() => {
    if (storedAvatarId) return;
    setStoredAvatarId(initialAvatarId);
  }, [initialAvatarId, storedAvatarId]);

  useEffect(() => {
    if (!joinPending || !roomCode) return;
    setJoinPending(false);
    if (!isManagerRoute) {
      navigate("/lobby");
    }
  }, [isManagerRoute, joinPending, navigate, roomCode]);

  useEffect(() => {
    if (!joinPending || roomCode) {
      joinRetryRef.current = 0;
    }
  }, [joinPending, roomCode]);

  useEffect(() => {
    if (!joinPending || roomCode) return;
    if (joinRetryRef.current >= 1) return;
    const timer = window.setTimeout(() => {
      if (roomCode || !joinPending) return;
      joinRetryRef.current += 1;
      const target = codeParam ?? DEFAULT_PUBLIC_ROOM;
      joinRoom(target, avatarId, playerName);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [avatarId, codeParam, joinPending, joinRoom, playerName, roomCode]);

  useEffect(() => {
    if (!roomCode || !isHost) return;
    const waitingForRoom = window.localStorage.getItem(HOST_WAIT_KEY);
    if (waitingForRoom && waitingForRoom === roomCode && players.length >= MIN_PLAYERS) {
      window.localStorage.removeItem(HOST_WAIT_KEY);
      navigate("/lobby");
    }
  }, [isHost, navigate, players.length, roomCode]);

  useEffect(() => {
    if (roomCode) {
      setPendingRoomCode(null);
    }
  }, [roomCode]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return onFirebaseUser((user) => {
      if (!user) {
        if (!authProvider || authProvider !== "twitch") {
          setAuthUser(null);
          setAuthEmail(null);
          setAuthProvider(null);
        }
        return;
      }
      const displayName =
        user.displayName ?? (user.email ? user.email.split("@")[0] : "");
      const providerIds = user.providerData
        .map((provider) => provider.providerId)
        .filter((providerId): providerId is string => Boolean(providerId));
      const fallbackProvider = getLastAuthProvider();
      const resolvedProvider = resolveProviderFromFirebaseSession(providerIds, fallbackProvider);
      const resolvedName =
        displayName ||
        (user.email ? user.email.split("@")[0] ?? "" : "") ||
        user.uid.slice(0, 8);

      setAuthProvider(resolvedProvider);
      setAuthUser(resolvedName);
      setAuthEmail(user.email ?? null);
      setLastAuthProvider(resolvedProvider);

      if (!playerName && resolvedName) {
        setPlayerName(resolvedName);
        setStoredPlayerName(resolvedName);
        if (roomCode) {
          setName(resolvedName);
        }
      }
    });
  }, [authProvider, firebaseEnabled, playerName, roomCode, setName]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    handleAppleRedirectResult().catch(() => {
      setAuthError("Apple sign-in failed");
    });
  }, [firebaseEnabled]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== apiOrigin) return;
      const data = event.data as { type?: string; payload?: Record<string, unknown> };
      if (!data || data.type !== "twitch_auth") return;
      const payload = data.payload ?? {};
      if (payload.ok !== true) {
        setAuthError("Twitch sign-in failed");
        return;
      }
      const displayName = typeof payload.displayName === "string" ? payload.displayName : "";
      const email = typeof payload.email === "string" ? payload.email : null;
      const resolvedName = displayName || (email ? email.split("@")[0] : "");
      setAuthProvider("twitch");
      setAuthEmail(email);
      setAuthUser(resolvedName || null);
      setLastAuthProvider("twitch");
      if (resolvedName && !playerName) {
        setPlayerName(resolvedName);
        setStoredPlayerName(resolvedName);
        if (roomCode) {
          setName(resolvedName);
        }
      }
      trackEvent("auth_twitch_success");
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [apiOrigin, playerName, roomCode, setName]);

  useEffect(() => {
    setQrSrc("");
  }, [joinTarget]);

  useEffect(() => {
    if (!roomCode) return;
    if (!codeParam) {
      trackEvent("create_room", { roomCode });
    } else {
      trackEvent("qr_scan", { roomCode: codeParam });
    }
  }, [codeParam, roomCode]);

  useEffect(() => {
    if (!joinUrl || !showQr || !qrVisible || qrSrc) return;
    let active = true;
    QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 1,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    }).then((url) => {
      if (active) {
        setQrSrc(url);
      }
    });
    return () => {
      active = false;
    };
  }, [joinUrl, showQr, qrVisible, qrSrc]);

  useEffect(() => {
    if (qrSrc && roomCode && showQr && qrVisible) {
      trackEvent("qr_render", { roomCode });
    }
  }, [qrSrc, roomCode, showQr, qrVisible]);

  const clearHostWait = () => {
    if (typeof window === "undefined") return;
    const waitingForRoom = window.localStorage.getItem(HOST_WAIT_KEY);
    if (!waitingForRoom) return;
    const expectedRoom = roomCode ?? pendingRoomCode;
    if (!expectedRoom || waitingForRoom === expectedRoom) {
      window.localStorage.removeItem(HOST_WAIT_KEY);
    }
  };

  const handleScanClick = () => {
    if (!showQr) return;
    if (!roomCode) {
      const nextCode = pendingRoomCode ?? randomId(4);
      setPendingRoomCode(nextCode);
      joinRoom(nextCode, avatarId, playerName);
      window.localStorage.setItem(HOST_WAIT_KEY, nextCode);
    }
    setQrVisible(true);
  };

  const handleQrShare = async () => {
    if (!joinUrl) return;
    const sharePayload = {
      title: "Join my Escapers game",
      text: "Scan the QR or open this link to join my room.",
      url: joinUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(sharePayload);
        trackEvent("qr_share", { channel: "native" });
        return;
      } catch {
        // Ignore user cancellations and fall back to copy only when share fails.
      }
    }

    try {
      await navigator.clipboard.writeText(joinUrl);
      trackEvent("qr_share", { channel: "copy" });
    } catch {
      trackEvent("qr_share", { channel: "copy_failed" });
      window.prompt("Copy link", joinUrl);
    }
  };

  const handleAvatarClick = () => {
    const idx = AVATAR_IDS.indexOf(avatarId);
    setAvatarIndex(idx >= 0 ? idx : 0);
    setAvatarOpen(true);
  };

  const handlePlayClick = () => {
    joinRetryRef.current = 0;
    clearHostWait();
    if (!roomCode) {
      const target = codeParam ?? DEFAULT_PUBLIC_ROOM;
      joinRoom(target, avatarId, playerName);
    }
    setJoinPending(true);
  };

  useEffect(() => {
    if (downbarActionHandledRef.current) return;
    if (downbarAction !== "create" && downbarAction !== "join") return;
    downbarActionHandledRef.current = true;
    if (downbarAction === "create") {
      handleScanClick();
    } else {
      handlePlayClick();
    }
    const next = new URLSearchParams(location.search);
    next.delete("downbar");
    navigate(
      {
        pathname: location.pathname,
        search: next.toString() ? `?${next.toString()}` : "",
      },
      { replace: true },
    );
  }, [downbarAction, handlePlayClick, handleScanClick, location.pathname, location.search, navigate]);

  const handleLeaderboardClick = () => {
    clearHostWait();
    navigate("/leaderboard");
  };

  const handleNameInput = (value: string) => {
    const next = value.slice(0, 18);
    setPlayerName(next);
    setStoredPlayerName(next);
    if (roomCode) {
      setName(next);
    }
  };

  const handleAvatarStep = (direction: number) => {
    setAvatarIndex((prev) => {
      const next = (prev + direction + AVATAR_IDS.length) % AVATAR_IDS.length;
      return next;
    });
  };

  const handleAvatarSelect = () => {
    const selected = AVATAR_IDS[avatarIndex] ?? AVATAR_IDS[0] ?? "avatar_raccoon_dj";
    setAvatarId(selected);
    setAvatar(selected);
    setStoredAvatarId(selected);
    setAvatarOpen(false);
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    try {
      setLastAuthProvider("google");
      await signInWithGoogle();
    } catch (error) {
      setAuthError("Google sign-in failed");
    }
  };

  const handleFacebookAuth = async () => {
    setAuthError(null);
    try {
      setLastAuthProvider("facebook");
      await signInWithFacebook();
    } catch (error) {
      setAuthError("Facebook sign-in failed");
    }
  };

  const handleAppleAuth = async () => {
    setAuthError(null);
    try {
      setLastAuthProvider("apple");
      await signInWithApple();
    } catch (error) {
      setAuthError("Apple sign-in failed");
    }
  };

  const handleTwitterAuth = async () => {
    setAuthError(null);
    try {
      setLastAuthProvider("twitter");
      await signInWithTwitter();
    } catch (error) {
      setAuthError("X sign-in failed");
    }
  };

  const handleTwitchAuth = () => {
    setAuthError(null);
    setLastAuthProvider("twitch");
    const loginUrl = new URL(`${apiBase}/auth/twitch/login`);
    if (typeof window !== "undefined") {
      loginUrl.searchParams.set("origin", window.location.origin);
    }
    trackEvent("auth_twitch_start");
    const popup = window.open(
      loginUrl.toString(),
      "twitch-auth",
      "width=480,height=720,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no",
    );
    if (!popup) {
      window.location.href = loginUrl.toString();
    }
  };

  const currentAvatar = AVATAR_IDS[avatarIndex] ?? AVATAR_IDS[0] ?? "avatar_raccoon_dj";
  const selectedAvatarAssetId = assetIds.length
    ? assetIds[avatarIconIndex(avatarId) % assetIds.length] ?? assetIds[0]
    : undefined;
  const selectedAvatarSrc =
    getAvatarImageUrl(avatarId) ?? getAssetUrl(selectedAvatarAssetId) ?? PROFILE_AVATAR_FALLBACK;
  const previewAvatarAssetId = assetIds.length
    ? assetIds[avatarIconIndex(currentAvatar) % assetIds.length] ?? assetIds[0]
    : undefined;
  const previewAvatarSrc =
    getAvatarImageUrl(currentAvatar) ?? getAssetUrl(previewAvatarAssetId) ?? PROFILE_AVATAR_FALLBACK;
  const isAuthorized = Boolean(authUser);

  const isSocialAuthorized =
    (authProvider === "google" ||
      authProvider === "apple" ||
      authProvider === "twitter" ||
      authProvider === "facebook" ||
      authProvider === "twitch") &&
    Boolean(authUser || authEmail);
  const twitterHandle = (authUser ?? "").trim();
  const socialHandleSource = twitterHandle || (authEmail ? authEmail.split("@")[0] ?? "" : "");
  const normalizedSocialHandle = socialHandleSource
    ? socialHandleSource.startsWith("@")
      ? socialHandleSource
      : `@${socialHandleSource.replace(/\s+/g, "")}`
    : "";
  const authorizedAuthLabel =
    authProvider === "twitter" || authProvider === "facebook"
      ? normalizedSocialHandle || (authEmail ?? authUser ?? "")
      : authEmail ?? authUser ?? "";
  const authorizedAuthIcon =
    authProvider === "apple"
      ? "/figma/join/frame-3.svg"
      : authProvider === "google"
        ? "/figma/join/ant-design-google-circle-filled.svg"
        : authProvider === "facebook"
          ? "/figma/join/ic-baseline-facebook.svg"
        : authProvider === "twitch"
          ? "/figma/join/frame-4.svg"
        : null;
  const todayKey = formatDayKey(new Date());
  const sourceJoinQuests = engagement.quests.daily.length
    ? engagement.quests.daily.slice(0, 2)
    : QUEST_DEFINITIONS.slice(0, 2).map((quest) => ({ ...quest, progress: 0 }));
  const completedQuests = sourceJoinQuests.filter((quest) => (quest.progress ?? 0) >= quest.target).length;
  const joinQuestsTotal = `${completedQuests}/${sourceJoinQuests.length}`;
  const seasonDaysLeft = Math.max(0, diffDays(todayKey, engagement.season.endDay) + 1);
  const joinStatusChips = JOIN_STATUS_CHIP_LAYOUT.map((chip) => {
    const value =
      chip.id === "season"
        ? `${seasonDaysLeft}d`
        : chip.id === "crew-code"
          ? engagement.group?.code ?? roomCode ?? codeParam ?? "----"
          : chip.id === "crew-streak"
            ? String(engagement.teamStreak.current)
            : chip.id === "shield"
              ? String(engagement.streak.graceLeft)
              : chip.id === "notifications"
                ? engagement.notifications.enabled
                  ? "On"
                  : "Off"
                : String(engagement.streak.current);
    return {
      ...chip,
      value,
      body: `${chip.body}: ${value}`,
    };
  });
  const joinQuestRows = sourceJoinQuests.map((quest) => {
    const target = Math.max(1, quest.target ?? 1);
    const progress = Math.max(0, Math.min(target, quest.progress ?? 0));
    const rewardLabel = quest.rewardId ? COSMETIC_LABEL_BY_ID.get(quest.rewardId) : null;
    return {
      id: quest.id,
      title: quest.label,
      reward: `+${rewardLabel ?? "Reward"}`,
      cta: "Claim",
      activeSegments: Math.max(0, Math.min(5, Math.round((progress / target) * 5))),
      details: `${quest.label}: ${progress}/${target}`,
    };
  });
  const questActions = [
    {
      id: "badges",
      label: "Badges",
      info: {
        title: "Badges",
        body: `Unlocked badges: ${engagement.badges.unlocked.length}/${BADGE_DEFINITIONS.length}`,
      },
    },
    {
      id: "crew",
      label: "Crew",
      info: {
        title: "Crew",
        body: `Code: ${engagement.group?.code ?? "none"}, streak: ${engagement.teamStreak.current}`,
      },
    },
    {
      id: "style",
      label: "Style",
      info: {
        title: "Style",
        body: `Unlocked styles: ${engagement.cosmetics.unlocked.length}, equipped: ${engagement.cosmetics.equipped.frame ?? "none"}`,
      },
    },
  ] as const;

  return (
    <div className={styles.page}>
      <div className={styles.pageDesktopBackground} aria-hidden="true" />
      <div className={styles.pageDesktopGradient} aria-hidden="true" />
      <div className={styles.join}>
        <img
          className={`${styles.baseBackgroundImage} ${styles.baseBackgroundImageMobile}`}
          src="/figma/join/image-931.png"
          alt=""
          aria-hidden="true"
        />
        <section className={styles.heroBlock}>
          <h1 className={styles.heroTitle}>{JOIN_HERO_TITLE}</h1>
          <p className={styles.heroSubtitle}>{JOIN_HERO_SUBTITLE}</p>
        </section>
        <section className={styles.questsBlock}>
          <header className={styles.questsHeader}>
            <h2 className={styles.questsTitle}>{JOIN_QUESTS_TITLE}</h2>
            <p className={styles.questsTotal}>{joinQuestsTotal}</p>
          </header>
          <div className={styles.questStatusGrid}>
            {joinStatusChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={styles.questStatusChip}
                style={{ width: `${chip.width}px` }}
                onClick={() => setQuestModal({ title: chip.title, body: chip.body })}
              >
                <span className={styles.questStatusIcon}>{chip.icon}</span>
                <span className={styles.questStatusValue}>{chip.value}</span>
              </button>
            ))}
          </div>
          <div className={styles.questProgressRow}>
            {joinQuestRows.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.questProgressCard} ${index === 0 ? styles.questProgressCardFirst : styles.questProgressCardMuted}`}
                onClick={() => setQuestModal({ title: item.title, body: item.details })}
              >
                <span className={styles.questProgressContent}>
                  <span className={styles.questProgressTitleWrap}>
                    <span className={styles.questProgressTitle}>{item.title}</span>
                  </span>
                  <span className={styles.questProgressActions}>
                    <span className={styles.questProgressRewardBadge}>{item.reward}</span>
                    <span className={styles.questProgressBadge}>
                      <span className={styles.questProgressBadgeText}>{item.cta}</span>
                    </span>
                  </span>
                </span>
                <span className={styles.questProgressBar}>
                  {Array.from({ length: 5 }).map((_, segmentIndex) => (
                    <span
                      key={`${item.id}-seg-${segmentIndex}`}
                      className={
                        segmentIndex < item.activeSegments ? styles.questProgressBarOn : styles.questProgressBarOff
                      }
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className={styles.questActionRow}>
            {questActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={styles.questActionButton}
                onClick={() => setQuestModal(action.info)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>
        <section className={styles.avatarBlock} aria-hidden="true" />
        <div
          className={`${styles.profileAvatarVisual} ${isAuthorized ? styles.profileAvatarVisualLoggedIn : ""}`}
          aria-hidden="true"
        >
          <img src={selectedAvatarSrc} alt="" />
        </div>
        <button
          type="button"
          className={styles.profileAvatarHotspot}
          onClick={handleAvatarClick}
          aria-label="Choose avatar"
        />
        <button
          type="button"
          className={styles.profileButtonHotspot}
          onClick={handleAvatarClick}
          aria-label="Choose avatar button"
        >
          Choose avatar
        </button>
        <input
          className={styles.nameInputField}
          aria-label="Player name"
          value={playerName}
          onChange={(event) => handleNameInput(event.target.value)}
          maxLength={18}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="Put your name"
        />
        <section className={styles.loginBlock} aria-label="Login options">
          <p className={styles.loginTitle}>{isSocialAuthorized ? "Logged in with:" : "Log in with:"}</p>
          {isSocialAuthorized ? (
            <div className={styles.loginAuthorizedRow}>
              {authProvider === "twitter" ? (
                <span className={styles.loginAuthorizedX} aria-hidden="true">
                  <img src="/figma/join/ellipse-2188.svg" alt="" className={styles.loginAuthorizedXBg} />
                  <img src="/figma/join/mingcute-apple-fill.svg" alt="" className={styles.loginAuthorizedXGlyph} />
                </span>
              ) : authorizedAuthIcon ? (
                <img
                  src={authorizedAuthIcon}
                  alt=""
                  className={styles.loginAuthorizedIcon}
                  aria-hidden="true"
                />
              ) : null}
              <span className={styles.loginAuthorizedText}>{authorizedAuthLabel}</span>
            </div>
          ) : (
            <div className={styles.loginIconsWrap}>
              <div className={styles.loginVisualLayer} aria-hidden="true">
                <img
                  src="/figma/join/ant-design-google-circle-filled.svg"
                  alt=""
                  className={`${styles.loginIcon} ${styles.loginIconGoogle}`}
                />
                <img
                  src="/figma/join/frame-3.svg"
                  alt=""
                  className={`${styles.loginIcon} ${styles.loginIconApple}`}
                />
                <img
                  src="/figma/join/ic-baseline-facebook.svg"
                  alt=""
                  className={`${styles.loginIcon} ${styles.loginIconFacebook}`}
                />
                <span className={`${styles.loginIcon} ${styles.loginIconX}`} aria-hidden="true">
                  <img src="/figma/join/ellipse-2188.svg" alt="" className={styles.loginIconXBg} />
                  <img src="/figma/join/mingcute-apple-fill.svg" alt="" className={styles.loginIconXGlyph} />
                </span>
                <img
                  src="/figma/join/frame-4.svg"
                  alt=""
                  className={`${styles.loginIcon} ${styles.loginIconTwitch}`}
                />
              </div>
              <div className={styles.loginHitLayer}>
                <button
                  type="button"
                  className={`${styles.loginHit} ${styles.hitGoogle}`}
                  onClick={handleGoogleAuth}
                  disabled={!firebaseEnabled}
                  aria-label="Login with Google"
                />
                <button
                  type="button"
                  className={`${styles.loginHit} ${styles.hitApple}`}
                  onClick={handleAppleAuth}
                  disabled={!firebaseEnabled}
                  aria-label="Login with Apple"
                />
                <button
                  type="button"
                  className={`${styles.loginHit} ${styles.hitFacebook}`}
                  onClick={handleFacebookAuth}
                  disabled={!firebaseEnabled}
                  aria-label="Login with Facebook"
                />
                <button
                  type="button"
                  className={`${styles.loginHit} ${styles.hitTwitter}`}
                  onClick={handleTwitterAuth}
                  disabled={!firebaseEnabled}
                  aria-label="Login with X"
                />
                <button
                  type="button"
                  className={`${styles.loginHit} ${styles.hitTwitch}`}
                  onClick={handleTwitchAuth}
                  aria-label="Login with Twitch"
                />
              </div>
            </div>
          )}
        </section>
        <section className={styles.top3Block} aria-label="Top 3 leaderboard">
          <header className={styles.top3Header}>
            <h3 className={styles.top3Title}>Top 3 Leaderboard</h3>
            <button
              type="button"
              className={styles.moreButton}
              onClick={handleLeaderboardClick}
              aria-label="Open leaderboard"
            >
              More
            </button>
          </header>
          <div className={styles.top3Rows}>
            {JOIN_TOP3_ROWS.map((row) => {
              const tierClass =
                row.tier === "gold"
                  ? styles.top3RowGold
                  : row.tier === "silver"
                    ? styles.top3RowSilver
                    : styles.top3RowBronze;
              return (
                <article
                  key={row.id}
                  className={`${styles.top3Row} ${tierClass} ${row.tall ? styles.top3RowTall : ""}`}
                >
                  <div className={styles.top3RowLeft}>
                    <div className={styles.rankChip}>
                      <span className={styles.rankIcon} aria-hidden="true" />
                      <span className={styles.rankNumber}>{row.rank}</span>
                    </div>
                    <div className={styles.playerIdentity}>
                      <span className={styles.playerAvatar} aria-hidden="true">
                        <img src={selectedAvatarSrc} alt="" />
                      </span>
                      <span className={styles.playerName}>{row.name}</span>
                    </div>
                  </div>
                  <span className={styles.scoreBadge}>{row.score}</span>
                </article>
              );
            })}
          </div>
        </section>
        <nav className={styles.documentsRow} aria-label="Legal links">
          <a href="/legal/privacy" className={styles.documentLink}>
            Privacy
          </a>
          <span className={styles.documentDivider} aria-hidden="true" />
          <a href="/legal/terms" className={styles.documentLink}>
            Terms
          </a>
          <span className={styles.documentDivider} aria-hidden="true" />
          <a href="/legal/data-deletion" className={styles.documentLink}>
            Data
          </a>
        </nav>
        <div className={styles.downBar}>
          <button
            type="button"
            className={`${styles.downButton} ${styles.downButtonCreate}`}
            onClick={handleScanClick}
            disabled={!showQr}
            aria-label="Create game"
          >
            <span className={`${styles.downIcon} ${styles.downIconCreate}`} aria-hidden="true" />
            <span>Create game</span>
          </button>
          <button
            type="button"
            className={`${styles.downButton} ${styles.downButtonJoin}`}
            onClick={handlePlayClick}
            aria-label="Join game"
          >
            <span className={`${styles.downIcon} ${styles.downIconJoin}`} aria-hidden="true" />
            <span>Join game</span>
          </button>
          <button
            type="button"
            className={`${styles.downButton} ${styles.downButtonHelp}`}
            onClick={() => navigate("/support")}
            aria-label="Help"
          >
            <span className={`${styles.downIcon} ${styles.downIconHelp}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.downButton} ${styles.downButtonLogout}`}
            onClick={() => {
              clearHostWait();
              resetRoom();
              navigate("/join", { replace: true });
            }}
            aria-label="Logout"
          >
            <span className={`${styles.downIcon} ${styles.downIconLogout}`} aria-hidden="true" />
          </button>
        </div>
        {qrVisible && qrSrc && showQr ? (
          <div className={styles.qrOverlay}>
            <div
              className={styles.qrBackdrop}
              onClick={() => {
                setQrVisible(false);
                clearHostWait();
              }}
              aria-hidden="true"
            />
            <div className={styles.qrFrameWrap}>
              <div className={styles.qrSheet} onClick={(event) => event.stopPropagation()}>
                <div className={styles.qrFrame}>
                  <img src={qrSrc} alt="" className={styles.qrImage} />
                </div>
                <button type="button" className={styles.qrShareButton} onClick={handleQrShare}>
                  Share
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {avatarOpen && (
          <div className={styles.avatarOverlay} onClick={() => setAvatarOpen(false)}>
            <div className={styles.avatarSheet} onClick={(event) => event.stopPropagation()}>
              <div className={styles.avatarPreview}>
                <img src={previewAvatarSrc} alt="" aria-hidden="true" />
              </div>
              <div className={styles.avatarControls}>
                <button
                  type="button"
                  className={`${styles.avatarNav} ${styles.avatarPrev}`}
                  onClick={() => handleAvatarStep(-1)}
                  aria-label="previous avatar"
                />
                <button type="button" className={styles.avatarSelect} onClick={handleAvatarSelect}>
                  Use
                </button>
                <button
                  type="button"
                  className={`${styles.avatarNav} ${styles.avatarNext}`}
                  onClick={() => handleAvatarStep(1)}
                  aria-label="next avatar"
                />
              </div>
            </div>
          </div>
        )}
        {questModal && (
          <div className={styles.questInfoOverlay} onClick={() => setQuestModal(null)}>
            <div className={styles.questInfoSheet} onClick={(event) => event.stopPropagation()}>
              <h3 className={styles.questInfoTitle}>{questModal.title}</h3>
              <p className={styles.questInfoBody}>{questModal.body}</p>
              <button type="button" className={styles.questInfoClose} onClick={() => setQuestModal(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
