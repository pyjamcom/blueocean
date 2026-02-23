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
import styles from "./JoinView.module.css";

const DEFAULT_PUBLIC_ROOM = "PLAY";
const HOST_WAIT_KEY = "escapers_host_wait";
const MIN_PLAYERS = 3;
const PROFILE_AVATAR_FALLBACK = "/figma/join/avatar-main-104.png";
const LEGACY_DEFAULT_NAME_RE = /^кл[её]воеимя\d*$/i;
const JOIN_HERO_TITLE = "Party Games & Meme Quiz - Join Escapers";
const JOIN_HERO_SUBTITLE = "Funny party quiz with friends: icebreaker games and online group game rooms.";
const JOIN_QUESTS_TITLE = "Quests for the game";
const JOIN_QUESTS_TOTAL = "5/5";
const JOIN_QUESTS = [
  { progress: "5/5", description: "Inviting a 5 friends", cta: "Claim" },
  { progress: "2/5", description: "For inviting a 5 friends", cta: "Claim" },
] as const;

export default function JoinView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { code: codeFromPath } = useParams<{ code?: string }>();
  const params = new URLSearchParams(location.search);
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
  const [authProvider, setAuthProvider] = useState<"firebase" | "twitch" | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
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

  return (
    <div className={styles.page}>
      <div className={styles.join}>
        <img className={styles.baseBackgroundImage} src="/figma/join/image-931.png" alt="" aria-hidden="true" />
        <img
          className={styles.frameImage}
          src="/figma/join/frame-106-4141-hero-quests-clean.png"
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
            <p className={styles.questsTotal}>{JOIN_QUESTS_TOTAL}</p>
          </header>
          <div className={styles.questsRow}>
            {JOIN_QUESTS.map((quest) => (
              <article key={`${quest.progress}-${quest.description}`} className={styles.questCard}>
                <p className={styles.questProgress}>{quest.progress}</p>
                <p className={styles.questDescription}>{quest.description}</p>
                <div className={styles.questClaim}>{quest.cta}</div>
              </article>
            ))}
          </div>
        </section>
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
        <button
          type="button"
          className={styles.moreHotspot}
          onClick={handleLeaderboardClick}
          aria-label="Open leaderboard"
        />
        <a className={styles.privacyHotspot} href="/legal/privacy" aria-label="Privacy" />
        <a className={styles.termsHotspot} href="/legal/terms" aria-label="Terms" />
        <a className={styles.dataHotspot} href="/legal/data-deletion" aria-label="Data deletion" />
        <button
          type="button"
          className={styles.createHotspot}
          onClick={handleScanClick}
          disabled={!showQr}
          aria-label="Create game"
        />
        <button
          type="button"
          className={styles.joinHotspot}
          onClick={handlePlayClick}
          aria-label="Join game"
        />
        <button
          type="button"
          className={styles.helpHotspot}
          onClick={() => navigate("/leaderboard")}
          aria-label="Help"
        />
        <button
          type="button"
          className={styles.logoutHotspot}
          onClick={() => {
            clearHostWait();
            resetRoom();
            navigate("/join", { replace: true });
          }}
          aria-label="Logout"
        />
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
            className={`${styles.loginHit} ${styles.hitFacebook}`}
            onClick={handleFacebookAuth}
            disabled={!firebaseEnabled}
            aria-label="Login with Facebook"
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
        {isAuthorized ? (
          <p className={styles.authState}>
            Signed in as <span>{authUser}</span>
          </p>
        ) : null}
        {authError ? <p className={styles.authError}>{authError}</p> : null}

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
      </div>
    </div>
  );
}
