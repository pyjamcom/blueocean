import { useEffect, useMemo, useState } from "react";
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
import styles from "./JoinView.module.css";

type PulseVariant = "fast" | "mid" | "slow";

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
  const { roomCode, joinRoom, setAvatar } = useRoom();
  const variant = resolveVariant(age);
  const initialAvatarId = useMemo(() => getStoredAvatarId() ?? randomAvatarId(), []);
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarIndex, setAvatarIndex] = useState(() => {
    const idx = AVATAR_IDS.indexOf(initialAvatarId);
    return idx >= 0 ? idx : 0;
  });

  const joinTarget = roomCode ?? codeParam;
  const joinUrl = useMemo(() => (joinTarget ? `https://d0.do/${joinTarget}` : ""), [joinTarget]);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [qrVisible, setQrVisible] = useState(false);
  const showQr = !codeParam;
  const [playerName, setPlayerName] = useState(() => {
    if (typeof document === "undefined") return "";
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("player_name="));
    if (!match) return "";
    return decodeURIComponent(match.split("=")[1] ?? "");
  });
  useEffect(() => {
    if (roomCode && !codeParam) return;
    joinRoom(codeParam ?? undefined, initialAvatarId);
  }, [codeParam, initialAvatarId, joinRoom, roomCode]);

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

  const handleScanClick = () => {
    if (!showQr) return;
    setQrVisible(true);
  };

  const handleAvatarClick = () => {
    const idx = AVATAR_IDS.indexOf(avatarId);
    setAvatarIndex(idx >= 0 ? idx : 0);
    setAvatarOpen(true);
  };

  const handlePlayClick = () => {
    navigate("/lobby?preview=1");
  };

  const handleAvatarStep = (direction: number) => {
    setAvatarIndex((prev) => {
      const next = (prev + direction + AVATAR_IDS.length) % AVATAR_IDS.length;
      return next;
    });
  };

  const handleAvatarSelect = () => {
    const selected = AVATAR_IDS[avatarIndex];
    setAvatarId(selected);
    setAvatar(selected);
    setStoredAvatarId(selected);
    setAvatarOpen(false);
  };

  const currentAvatar = AVATAR_IDS[avatarIndex];
  const avatarAssetId = assetIds.length
    ? assetIds[avatarIconIndex(currentAvatar) % assetIds.length]
    : undefined;
  const avatarAssetSrc = getAvatarImageUrl(currentAvatar) ?? getAssetUrl(avatarAssetId);

  return (
    <div className={`${styles.join} ${styles[variant]}`}>
      <div className={styles.pulse} />
      {qrVisible && qrSrc && showQr ? (
        <div className={styles.qrOverlay} onClick={() => setQrVisible(false)}>
          <div className={styles.qrFrame} onClick={(event) => event.stopPropagation()}>
            <img src={qrSrc} alt="" className={styles.qrImage} />
          </div>
        </div>
      ) : (
        <div className={styles.qrSpot}>
          <img src="/favicon.ico" alt="" className={styles.qrIcon} />
        </div>
      )}
      {showQr ? (
        <div className={styles.nameRow}>
          <input
            type="text"
            value={playerName}
            onChange={(event) => {
              const value = event.target.value.slice(0, 18);
              setPlayerName(value);
              if (typeof document !== "undefined") {
                document.cookie = `player_name=${encodeURIComponent(value)}; path=/; max-age=31536000`;
              }
            }}
            placeholder="Your name"
            className={styles.nameInput}
            aria-label="player name"
          />
        </div>
      ) : null}
      <div className={styles.iconRow}>
        <div className={styles.iconItem}>
          <button
            type="button"
            className={`${styles.iconBubble} ${styles.iconScan}`}
            aria-label="create game"
            onClick={handleScanClick}
          />
          <span className={styles.iconLabel}>Create game</span>
        </div>
        <div className={styles.iconItem}>
          <button
            type="button"
            className={`${styles.iconBubble} ${styles.iconAvatar}`}
            aria-label="avatar"
            onClick={handleAvatarClick}
          />
          <span className={styles.iconLabel}>Choose an avatar</span>
        </div>
        <div className={styles.iconItem}>
          <button
            type="button"
            className={`${styles.iconBubble} ${styles.iconPlay}`}
            aria-label="play"
            onClick={handlePlayClick}
          />
          <span className={styles.iconLabel}>Join the game</span>
        </div>
      </div>

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
