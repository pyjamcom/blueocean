import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEngagement } from "../context/EngagementContext";
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
import styles from "./JoinView.module.css";

type PulseVariant = "fast" | "mid" | "slow";
const DEFAULT_PUBLIC_ROOM = "PLAY";
const HOST_WAIT_KEY = "escapers_host_wait";
const MIN_PLAYERS = 3;

function resolveVariant(age?: number): PulseVariant {
  if (!age) {
    return "mid";
  }
  if (age <= 30) {
    return "fast";
  }
  if (age <= 40) {
    return "mid";
  }
  return "slow";
}

export default function JoinView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { code: codeFromPath } = useParams<{ code?: string }>();
  const params = new URLSearchParams(location.search);
  const age = params.get("age") ? Number(params.get("age")) : undefined;
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
  const { roomCode, joinRoom, setAvatar, setName, isHost, players, playerId, resetRoom } = useRoom();
  const { state: engagement } = useEngagement();
  const variant = resolveVariant(age);
  const firebaseEnabled = isFirebaseEnabled();
  const initialAvatarId = useMemo(() => getStoredAvatarId() ?? randomAvatarId(), []);
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
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
  const [playerName, setPlayerName] = useState(() => getStoredPlayerName());
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<"firebase" | "twitch" | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const isManagerRoute = location.pathname === "/manager";
  useEffect(() => {
    if (!codeParam) return;
    joinRoom(codeParam, initialAvatarId, playerName);
  }, [codeParam, initialAvatarId, joinRoom, playerName]);

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
        if (!authProvider || authProvider === "firebase") {
          setAuthUser(null);
          setAuthProvider(null);
        }
        return;
      }
      const displayName =
        user.displayName ?? (user.email ? user.email.split("@")[0] : "");
      if (displayName) {
        setAuthProvider("firebase");
        setAuthUser(displayName);
        if (!playerName) {
          setPlayerName(displayName);
          setStoredPlayerName(displayName);
          if (roomCode) {
            setName(displayName);
          }
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
      setAuthUser(resolvedName || null);
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

  const handleLeaderboardClick = () => {
    clearHostWait();
    navigate("/leaderboard");
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
      await signInWithGoogle();
    } catch (error) {
      setAuthError("Google sign-in failed");
    }
  };

  const handleFacebookAuth = async () => {
    setAuthError(null);
    try {
      await signInWithFacebook();
    } catch (error) {
      setAuthError("Facebook sign-in failed");
    }
  };

  const handleAppleAuth = async () => {
    setAuthError(null);
    try {
      await signInWithApple();
    } catch (error) {
      setAuthError("Apple sign-in failed");
    }
  };

  const handleTwitterAuth = async () => {
    setAuthError(null);
    try {
      await signInWithTwitter();
    } catch (error) {
      setAuthError("X sign-in failed");
    }
  };

  const handleTwitchAuth = () => {
    setAuthError(null);
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
  const avatarAssetId = assetIds.length
    ? assetIds[avatarIconIndex(currentAvatar) % assetIds.length] ?? assetIds[0]
    : undefined;
  const avatarAssetSrc = getAvatarImageUrl(currentAvatar) ?? getAssetUrl(avatarAssetId);
  const previewQuests = engagement.quests.daily.slice(0, 3);
  const completedQuests = engagement.quests.daily.filter((quest) => Boolean(quest.completedAt)).length;
  const questTotal = engagement.quests.daily.length;
  const topPreview =
    players.length > 0
      ? [...players]
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((player, index) => ({
            rank: index + 1,
            name: player.name ?? "Player",
            score: player.score,
          }))
      : [
          { rank: 1, name: "Ярик", score: 2445 },
          { rank: 2, name: "Павел Невский", score: 2445 },
          { rank: 3, name: "Иван Иванович", score: 2445 },
        ];
  const isAuthorized = Boolean(authUser);
  const selfPlayer = players.find((player) => player.id === playerId);
  const scoreSorted = [...players].sort((a, b) => b.score - a.score);
  const selfRank = selfPlayer ? scoreSorted.findIndex((player) => player.id === selfPlayer.id) + 1 : 3;
  const badgeLabel = (authUser || playerName || "WEEEP").slice(0, 12);
  const profileTag = `#${(playerId ?? "124").replace(/[^0-9]/g, "").slice(-3) || "124"}`;

  return (
    <div
      className={`${styles.join} ${styles[variant]} ${isAuthorized ? styles.authorized : styles.guest}`}
    >
      <div className={styles.pulse} />
      <div className={styles.topBar}>
        <span className={styles.statusTime}>9:41</span>
        <span className={styles.notch} aria-hidden="true" />
        <span className={styles.topBarRight} aria-hidden="true">
          <span className={styles.signalIcon} />
          <span className={styles.wifiIcon} />
          <span className={styles.batteryIcon} />
        </span>
      </div>
      <header className={styles.srOnly}>
        <h1>Party Games &amp; Meme Quiz - Join Escapers</h1>
        <h2>Funny party quiz with friends: icebreaker games and online group game rooms.</h2>
      </header>
      {isAuthorized ? (
        <section className={`${styles.sectionCard} ${styles.startCard}`}>
          <h2 className={styles.startCardTitle}>Start game</h2>
          <div className={styles.startCardMeta}>
            <span className={styles.startRank}>
              <span className={styles.rankIcon} aria-hidden="true" />
              {selfRank || 3}
            </span>
            <span className={styles.startName}>{badgeLabel}</span>
            <span className={styles.startTag}>{profileTag}</span>
          </div>
        </section>
      ) : null}

      <section className={`${styles.sectionCard} ${styles.questCard}`}>
        <header className={styles.previewHead}>
          <h3 className={styles.previewTitle}>Quests for the game</h3>
          <span className={styles.previewBadge}>
            {completedQuests}/{questTotal || 5}
          </span>
        </header>
        <ul className={styles.questList}>
          {previewQuests.length
            ? previewQuests.map((quest) => {
                const done = quest.progress >= quest.target;
                return (
                  <li key={quest.id} className={styles.questItem}>
                    <div className={styles.questHead}>
                      <span className={styles.questProgress}>
                        {quest.progress}/{quest.target}
                      </span>
                      <span className={styles.questLabel}>{quest.label}</span>
                    </div>
                    <span className={styles.questAction}>{done ? "Claim" : "In progress"}</span>
                  </li>
                );
              })
            : (
              <li className={styles.questItem}>
                <div className={styles.questHead}>
                  <span className={styles.questProgress}>0/5</span>
                  <span className={styles.questLabel}>Inviting 5 friends</span>
                </div>
                <span className={styles.questAction}>Claim</span>
              </li>
            )}
        </ul>
      </section>

      <section className={`${styles.sectionCard} ${styles.profileCard}`}>
        <div className={styles.profileAvatarWrap}>
          <div className={styles.profileAvatar}>
            {avatarAssetSrc ? <img src={avatarAssetSrc} alt="" aria-hidden="true" /> : null}
          </div>
        </div>
        <button type="button" className={styles.profileAvatarButton} onClick={handleAvatarClick}>
          Choose avatar
        </button>
        <input
          type="text"
          value={playerName}
          onChange={(event) => {
            const value = event.target.value.slice(0, 18);
            setPlayerName(value);
            setStoredPlayerName(value);
            if (roomCode) {
              setName(value);
            }
          }}
          placeholder="КлёвоеИмя3286"
          className={styles.nameInput}
          aria-label="player name"
        />
      </section>

      {showQr && !isAuthorized ? (
        <section className={`${styles.sectionCard} ${styles.loginCard}`}>
          <div className={styles.loginTitle}>Log in with:</div>
          <div className={styles.loginIcons}>
            <button
              type="button"
              className={`${styles.authRound} ${styles.authGoogle}`}
              onClick={handleGoogleAuth}
              disabled={!firebaseEnabled}
              aria-label="Login with Google"
              title="Login with Google"
            >
              <span className={`${styles.authIcon} ${styles.iconGoogle}`} aria-hidden="true">
                G
              </span>
            </button>
            <button
              type="button"
              className={`${styles.authRound} ${styles.authFacebook}`}
              onClick={handleFacebookAuth}
              disabled={!firebaseEnabled}
              aria-label="Login with Facebook"
              title="Login with Facebook"
            >
              <span className={`${styles.authIcon} ${styles.iconFacebook}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M9.197 21.5v-7.707H6.5V10.5h2.697V8.074c0-2.672 1.59-4.174 4.03-4.174 1.154 0 2.36.206 2.36.206v2.604H14.26c-1.203 0-1.577.764-1.577 1.548V10.5h2.684l-.43 3.293h-2.254V21.5H9.197Z" />
                </svg>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.authRound} ${styles.authApple}`}
              onClick={handleAppleAuth}
              disabled={!firebaseEnabled}
              aria-label="Login with Apple"
              title="Login with Apple"
            >
              <span className={`${styles.authIcon} ${styles.iconApple}`} aria-hidden="true">
                
              </span>
            </button>
            <button
              type="button"
              className={`${styles.authRound} ${styles.authTwitter}`}
              onClick={handleTwitterAuth}
              disabled={!firebaseEnabled}
              aria-label="Login with X"
              title="Login with X"
            >
              <span className={`${styles.authIcon} ${styles.iconX}`} aria-hidden="true">
                X
              </span>
            </button>
            <button
              type="button"
              className={`${styles.authRound} ${styles.authTwitch}`}
              onClick={handleTwitchAuth}
              aria-label="Login with Twitch"
              title="Login with Twitch"
            >
              <span className={`${styles.authIcon} ${styles.iconTwitch}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                </svg>
              </span>
            </button>
          </div>
        </section>
      ) : null}

      <section className={`${styles.sectionCard} ${styles.leaderboardCard}`}>
        <header className={styles.previewHead}>
          <h3 className={styles.previewTitle}>Top 3 Leaderboard</h3>
          <button type="button" className={styles.moreButton} onClick={handleLeaderboardClick}>
            More
          </button>
        </header>
        <ul className={styles.topList}>
          {topPreview.map((entry) => (
            <li
              key={`${entry.rank}-${entry.name}`}
              className={`${styles.topItem} ${entry.rank === 1 ? styles.topItemRank1 : entry.rank === 2 ? styles.topItemRank2 : styles.topItemRank3}`}
            >
              <span className={styles.topRank}>{entry.rank}</span>
              <span className={styles.topName}>{entry.name}</span>
              <span className={styles.topScore}>{entry.score}</span>
            </li>
          ))}
        </ul>
      </section>

      {authError ? <div className={styles.authError}>{authError}</div> : null}
      <div className={styles.legalFooter}>
        <a href="/legal/privacy">Privacy</a>
        <span className={styles.legalSeparator} aria-hidden="true" />
        <a href="/legal/terms">Terms</a>
        <span className={styles.legalSeparator} aria-hidden="true" />
        <a href="/legal/data-deletion">Data</a>
      </div>

      <footer className={styles.downBar}>
        <div className={styles.bottomBar}>
          <button
            type="button"
            className={`${styles.primaryAction} ${styles.primaryCreate}`}
            aria-label="create game"
            onClick={handleScanClick}
            disabled={!showQr}
          >
            <span className={styles.actionIconCreate} aria-hidden="true" />
            <span>Create game</span>
          </button>
          <button
            type="button"
            className={`${styles.primaryAction} ${styles.primaryJoin}`}
            aria-label="join game"
            onClick={handlePlayClick}
          >
            <span className={styles.actionIconJoin} aria-hidden="true" />
            <span>Join game</span>
          </button>
          <button
            type="button"
            className={`${styles.iconAction} ${styles.iconHelp}`}
            aria-label="help"
            onClick={() => navigate("/leaderboard")}
          />
          <button
            type="button"
            className={`${styles.iconAction} ${styles.iconLogout}`}
            aria-label="logout"
            onClick={() => {
              clearHostWait();
              resetRoom();
              navigate("/join", { replace: true });
            }}
          />
        </div>
        <div className={styles.tabBar}>
          <div className={styles.urlRow}>
            <span className={styles.lockIcon} aria-hidden="true" />
            <span className={styles.url}>escapers.app</span>
          </div>
          <span className={styles.homeIndicator} aria-hidden="true" />
        </div>
      </footer>

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
            <div className={styles.qrFrame} onClick={(event) => event.stopPropagation()}>
              <img src={qrSrc} alt="" className={styles.qrImage} />
            </div>
          </div>
        </div>
      ) : null}

      {avatarOpen && (
        <div className={styles.avatarOverlay} onClick={() => setAvatarOpen(false)}>
          <div className={styles.avatarSheet} onClick={(event) => event.stopPropagation()}>
            <div className={styles.avatarPreview}>
              <img src={avatarAssetSrc} alt="" aria-hidden="true" />
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

    </div>
  );
}
