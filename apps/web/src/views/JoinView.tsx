import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { randomAvatarId } from "../utils/avatar";
import { trackEvent } from "../utils/analytics";
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
  const { roomCode, joinRoom } = useRoom();
  const variant = resolveVariant(age);
  const avatarId = useMemo(() => randomAvatarId(), []);

  const joinTarget = roomCode ?? codeParam;
  const joinUrl = useMemo(() => (joinTarget ? `https://d0.do/${joinTarget}` : ""), [joinTarget]);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [qrVisible, setQrVisible] = useState(false);
  const showQr = !codeParam;
  useEffect(() => {
    joinRoom(codeParam ?? undefined, avatarId);
  }, [avatarId, codeParam, joinRoom]);

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
    navigate("/lobby?preview=1");
  };

  const handlePlayClick = () => {
    navigate("/lobby?preview=1");
  };

  return (
    <div className={`${styles.join} ${styles[variant]}`}>
      <div className={styles.pulse} />
      <div className={styles.qrFrame}>
        {qrVisible && qrSrc && showQr ? (
          <img src={qrSrc} alt="" className={styles.qrImage} />
        ) : (
          <img src="/favicon.ico" alt="" className={styles.qrIcon} />
        )}
      </div>
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
          <span className={styles.iconLabel}>Avatar</span>
        </div>
        <div className={styles.iconItem}>
          <button
            type="button"
            className={`${styles.iconBubble} ${styles.iconPlay}`}
            aria-label="play"
            onClick={handlePlayClick}
          />
          <span className={styles.iconLabel}>Play</span>
        </div>
      </div>

    </div>
  );
}
