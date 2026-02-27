import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import {
  AVATAR_IDS,
  avatarColor,
  avatarIconIndex,
  getStoredAvatarId,
  getAvatarImageUrl,
  randomAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import { trackEvent } from "../utils/analytics";
import { assetIds, getAssetUrl } from "../utils/assets";
import { getOrCreateClientId, randomId } from "../utils/ids";
import { FALLBACK_WEEKLY_LEADERBOARD, type LeaderboardEntry, toWeeklyPercentLabel } from "../utils/leaderboard";
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
import frames from "../engagement/frames.module.css";
import { useEngagement } from "../context/EngagementContext";
import { diffDays, formatDayKey } from "../engagement/time";
import engageStyles from "../components/engagement/EngagementPanel.module.css";
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
  },
  {
    id: "crew-code",
    icon: "👥",
    width: 89,
  },
  {
    id: "crew-streak",
    icon: "🤝",
    width: 58,
  },
  {
    id: "shield",
    icon: "🛡️",
    width: 59,
  },
  {
    id: "notifications",
    icon: "🔔",
    width: 69,
  },
  {
    id: "streak",
    icon: "🔥",
    width: 58,
  },
] as const;

const COSMETIC_LABEL_BY_ID = new Map(COSMETIC_DEFINITIONS.map((item) => [item.id, item.label]));
type JoinTopRow = {
  id: string;
  rank: number;
  name: string;
  score: string;
  tier: "gold" | "silver" | "bronze";
  tall: boolean;
  avatarId?: string | null;
};
type JoinLeaderboardEntry = LeaderboardEntry;
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
type AuthProvider = "google" | "facebook" | "apple" | "twitter" | "twitch" | "firebase" | null;
type FirebaseAuthProvider = Exclude<AuthProvider, "twitch" | "firebase" | null>;

function normalizeJoinLeaderboardEntry(raw: any): JoinLeaderboardEntry | null {
  if (!raw) return null;
  const displayName = raw.displayName ?? raw.display_name ?? raw.name;
  const funScore = raw.funScore ?? raw.fun_score ?? raw.score;
  if (!displayName || typeof funScore !== "number") return null;
  return {
    displayName: String(displayName),
    avatarId: raw.avatarId ?? raw.avatar_id ?? null,
    funScore,
    deltaPoints: raw.deltaPoints ?? raw.delta_points ?? null,
    progressPercent: raw.progressPercent ?? raw.progress_percent ?? null,
  };
}

function buildFallbackTopRows(): JoinTopRow[] {
  return FALLBACK_WEEKLY_LEADERBOARD.slice(0, 3).map((entry, index) => ({
    id: `fallback-top-${index + 1}`,
    rank: index + 1,
    name: entry.displayName,
    score: toWeeklyPercentLabel(entry),
    avatarId: entry.avatarId ?? null,
    tier: index === 0 ? "gold" : index === 1 ? "silver" : "bronze",
    tall: index === 0,
  }));
}

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
  const { state: engagement, actions, flags } = useEngagement();
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
  const [showCosmetics, setShowCosmetics] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [crewLoading, setCrewLoading] = useState(false);
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const [joinTopRows, setJoinTopRows] = useState<JoinTopRow[]>(() => buildFallbackTopRows());
  const selfId = getOrCreateClientId();
  const isOwner = engagement.group?.role === "owner";
  const isManagerRoute = location.pathname === "/manager";
  useEffect(() => {
    if (!codeParam) return;
    joinRoom(codeParam, initialAvatarId, playerName);
  }, [codeParam, initialAvatarId, joinRoom, playerName]);

  useEffect(() => {
    actions.refresh();
  }, [actions.refresh]);

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
    let active = true;
    const url = new URL(`${apiBase}/leaderboard`);
    url.searchParams.set("period", "weekly");
    url.searchParams.set("scope", engagement.group ? "group" : "global");
    if (engagement.group) {
      url.searchParams.set("crewCode", engagement.group.code);
    }
    url.searchParams.set("playerId", getOrCreateClientId());
    url.searchParams.set("limit", "200");

    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        const normalized: JoinLeaderboardEntry[] = Array.isArray(json?.top)
          ? json.top
              .map((raw: any) => normalizeJoinLeaderboardEntry(raw))
              .filter((entry: JoinLeaderboardEntry | null): entry is JoinLeaderboardEntry => Boolean(entry))
          : [];
        if (!normalized.length) {
          setJoinTopRows(buildFallbackTopRows());
          return;
        }

        const mapped: JoinTopRow[] = normalized.slice(0, 3).map((entry, index) => ({
          id: `live-top-${index + 1}`,
          rank: index + 1,
          name: entry.displayName,
          score: toWeeklyPercentLabel(entry),
          avatarId: entry.avatarId,
          tier: index === 0 ? "gold" : index === 1 ? "silver" : "bronze",
          tall: index === 0,
        }));
        setJoinTopRows(mapped);
      })
      .catch(() => {
        if (!active) return;
        setJoinTopRows(buildFallbackTopRows());
      });

    return () => {
      active = false;
    };
  }, [apiBase, engagement.group]);

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

  const closeSheets = () => {
    setShowCosmetics(false);
    setShowBadges(false);
    setShowGroup(false);
  };

  const openInfo = (payload: InfoPayload, shouldCloseSheets = true) => {
    if (shouldCloseSheets) {
      closeSheets();
    }
    setInfo(payload);
  };

  const closeInfo = () => setInfo(null);

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
  const notificationsEnabled = engagement.notifications.enabled;
  const equippedFrame = engagement.cosmetics.equipped.frame ?? null;
  const equippedLabel = equippedFrame ? COSMETIC_LABEL_BY_ID.get(equippedFrame) : "None";
  const cosmeticNewId = engagement.cosmetics.lastUnlocked ?? null;
  const sourceJoinQuests = engagement.quests.daily.length
    ? engagement.quests.daily.slice(0, 2)
    : QUEST_DEFINITIONS.slice(0, 2).map((quest) => ({ ...quest, progress: 0 }));
  const completedQuests = sourceJoinQuests.filter((quest) => (quest.progress ?? 0) >= quest.target).length;
  const joinQuestsTotal = `${completedQuests}/${sourceJoinQuests.length}`;
  const seasonDaysLeft = Math.max(0, diffDays(todayKey, engagement.season.endDay) + 1);
  const joinStatusChips = JOIN_STATUS_CHIP_LAYOUT.map((chip) => {
    if (chip.id === "season") {
      return { ...chip, value: `${seasonDaysLeft}d`, info: CHIP_INFO.season };
    }
    if (chip.id === "crew-code") {
      return {
        ...chip,
        value: engagement.group?.code ?? roomCode ?? codeParam ?? "----",
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
      details: [`Progress: ${progress}/${target}`, rewardLabel ? `Reward: ${rewardLabel}` : "Reward: Unlock"],
    };
  });
  const questActions = [
    { id: "badges", label: "Badges", info: CHIP_INFO.badges },
    { id: "crew", label: "Crew", info: CHIP_INFO.crew },
    { id: "style", label: "Style", info: CHIP_INFO.style },
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
                onClick={() => {
                  if (chip.id === "notifications" && flags.notifications) {
                    actions.setNotificationsEnabled(!notificationsEnabled);
                  }
                  openInfo(chip.info);
                }}
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
                onClick={() => openInfo({ title: item.title, lines: item.details })}
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
                onClick={() => {
                  if (action.id === "badges") {
                    closeSheets();
                    setShowBadges(true);
                    return;
                  }
                  if (action.id === "crew") {
                    closeSheets();
                    setShowGroup(true);
                    return;
                  }
                  if (action.id === "style") {
                    closeSheets();
                    setShowCosmetics(true);
                  }
                }}
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
            {joinTopRows.map((row) => {
              const tierClass =
                row.tier === "gold"
                  ? styles.top3RowGold
                  : row.tier === "silver"
                    ? styles.top3RowSilver
                    : styles.top3RowBronze;
              const rowAvatarSrc =
                getAvatarImageUrl(row.avatarId ?? row.name) ?? selectedAvatarSrc;
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
                        <img src={rowAvatarSrc} alt="" />
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

        {showCosmetics ? (
          <div
            className={engageStyles.overlay}
            onClick={() => {
              setShowCosmetics(false);
              actions.markCosmeticSeen();
            }}
          >
            <div className={engageStyles.sheet} onClick={(event) => event.stopPropagation()}>
              <div
                className={engageStyles.sheetTitle}
                onClick={() => openInfo(CHIP_INFO.style)}
                role="button"
                tabIndex={0}
              >
                Your Style
              </div>
              <div className={engageStyles.sheetSub}>Equipped: {equippedLabel ?? "None"}</div>
              <div className={engageStyles.grid}>
                {COSMETIC_DEFINITIONS.filter((item) => item.type === "frame").map((item) => {
                  const unlocked = engagement.cosmetics.unlocked.includes(item.id);
                  const active = equippedFrame === item.id;
                  const rareClass = item.rarity === "rare" ? engageStyles.gridRare : "";
                  const isNew = unlocked && cosmeticNewId === item.id;
                  const tagLabel = active ? "Equipped" : isNew ? "New" : unlocked ? "Use" : "Locked";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${engageStyles.gridItem} ${frames[item.id] ?? ""} ${rareClass} ${
                        active ? engageStyles.gridActive : ""
                      } ${!unlocked ? engageStyles.gridLocked : ""}`}
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
                        className={`${engageStyles.gridTag} ${active ? engageStyles.gridTagActive : ""} ${
                          isNew ? engageStyles.gridTagNew : ""
                        } ${!unlocked ? engageStyles.gridTagLocked : ""}`}
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
                  const rareClass = badge.rarity === "rare" ? engageStyles.gridRare : "";
                  return (
                    <button
                      key={badge.id}
                      type="button"
                      className={`${engageStyles.gridItem} ${rareClass} ${
                        unlocked ? "" : engageStyles.gridLocked
                      }`}
                      onClick={() => {
                        const badgeInfo = BADGE_INFO[badge.id];
                        if (badgeInfo) {
                          openInfo(badgeInfo);
                        } else {
                          openInfo({ title: badge.label, lines: [] });
                        }
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
          <div className={engageStyles.overlay} onClick={closeInfo}>
            <div className={engageStyles.infoCard} onClick={(event) => event.stopPropagation()}>
              <div className={engageStyles.infoTitle}>{info.title}</div>
              <div className={engageStyles.infoList}>
                {info.lines.map((line) => (
                  <div key={line} className={engageStyles.infoItem}>
                    {line}
                  </div>
                ))}
              </div>
              {info.ctaLabel && info.onCta ? (
                <button type="button" className={engageStyles.infoCta} onClick={info.onCta}>
                  {info.ctaLabel}
                </button>
              ) : null}
              <div className={engageStyles.infoHint}>Tap anywhere to close</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
