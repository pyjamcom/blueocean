import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useLocation, useParams } from "react-router-dom";
import { useJoinRoom } from "../hooks/useJoinRoom";
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
  const { code: codeFromPath } = useParams<{ code?: string }>();
  const params = new URLSearchParams(location.search);
  const age = params.get("age") ? Number(params.get("age")) : undefined;
  const rawCode = (params.get("code") ?? codeFromPath)?.toUpperCase();
  const codeParam = rawCode && /^[A-Z0-9]{4}$/.test(rawCode) ? rawCode : undefined;
  const { roomCode } = useJoinRoom({ roomCode: codeParam ?? undefined });
  const variant = resolveVariant(age);

  const joinUrl = useMemo(() => `https://d0.do/${roomCode}`, [roomCode]);
  const [qrSrc, setQrSrc] = useState<string>("");

  useEffect(() => {
    if (!codeParam) {
      trackEvent("create_room", { roomCode });
    } else {
      trackEvent("qr_scan", { roomCode: codeParam });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
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
  }, [joinUrl]);

  useEffect(() => {
    if (qrSrc) {
      trackEvent("qr_render", { roomCode });
    }
  }, [qrSrc, roomCode]);

  return (
    <div className={`${styles.join} ${styles[variant]}`}>
      <div className={styles.pulse} />
      <div className={styles.qrFrame}>
        {qrSrc ? <img src={qrSrc} alt="" className={styles.qrImage} /> : <div className={styles.qrPlaceholder} />}
      </div>
      <div className={styles.iconRow}>
        <div className={styles.iconBubble} />
        <div className={styles.iconBubble} />
        <div className={styles.iconBubble} />
      </div>
    </div>
  );
}
