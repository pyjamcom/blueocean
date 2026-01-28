import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocation } from "react-router-dom";
import SoundToggle from "../components/SoundToggle";
import TimerRing from "../components/TimerRing";
import { useRoom } from "../context/RoomContext";
import { AVATAR_IDS, avatarColor } from "../utils/avatar";
import { assetIds, getAssetUrl } from "../utils/assets";
import styles from "./LobbyView.module.css";

type PulseVariant = "fast" | "mid" | "slow";

function resolveVariant(age?: number): PulseVariant {
  if (!age) return "mid";
  if (age <= 30) return "fast";
  if (age <= 40) return "mid";
  return "slow";
}

export default function LobbyView() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const age = params.get("age") ? Number(params.get("age")) : undefined;
  const variant = resolveVariant(age);
  const { roomCode, isHost, phase, startGame, players, playerId, setReady } = useRoom();

  const lobbyAssets = assetIds.length ? assetIds : [];
  const [soundOn, setSoundOn] = useState(true);
  const [avatarIndex, setAvatarIndex] = useState(() =>
    Math.floor(Math.random() * AVATAR_IDS.length),
  );
  const touchStart = useRef<number | null>(null);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [showQr, setShowQr] = useState(false);

  const countdownStart = useMemo(() => Date.now(), []);

  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    QRCode.toDataURL(`https://d0.do/${roomCode}`, {
      width: 240,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((url) => {
      if (active) {
        setQrSrc(url);
      }
    });
    return () => {
      active = false;
    };
  }, [roomCode]);

  const handleAvatarCycle = (direction: number) => {
    setAvatarIndex((prev) => {
      const next = (prev + direction + AVATAR_IDS.length) % AVATAR_IDS.length;
      return next;
    });
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

  const selfAvatar = AVATAR_IDS[avatarIndex];
  const selfPlayer = players.find((player) => player.id === playerId);
  const selfReady = selfPlayer?.ready ?? false;
  const selfAssetId = lobbyAssets.length
    ? lobbyAssets[avatarIndex % lobbyAssets.length]
    : undefined;
  const selfAssetSrc = getAssetUrl(selfAssetId);
  const canStart = isHost && phase === "lobby";
  const startLabel = isHost ? "Start" : "Ready";
  const startDisabled = isHost ? !canStart : false;

  return (
    <div className={`${styles.wrap} ${styles[variant]}`}>
      <div className={styles.countRow}>
        {Array.from({ length: 10 }).map((_, index) => (
          <span
            key={`slot-${index}`}
            className={`${styles.countDot} ${index < players.length ? styles.countDotActive : ""}`}
          />
        ))}
      </div>

      <div className={styles.players}>
        {players.map((player) => (
          <div
            key={player.id}
            className={styles.player}
          >
            <div
              className={styles.playerAvatar}
              style={{
                background: avatarColor(player.avatarId),
              }}
              aria-label={player.avatarId}
            />
            {player.ready && <span className={styles.readyRing} />}
          </div>
        ))}
      </div>

      <div
        className={styles.selfAvatar}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        aria-label={selfAvatar}
      >
        <div
          className={styles.selfAvatarCore}
          style={{
            background: avatarColor(selfAvatar),
            backgroundImage: `url(${selfAssetSrc})`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "70%",
          }}
        />
        <span className={styles.selfPulse} />
      </div>
      <div className={styles.selfLabel}>Tap</div>

      <div className={styles.hintRow}>
        <span className={`${styles.hintChip} ${styles.hintSwipe}`} />
        <span className={`${styles.hintChip} ${styles.hintTap}`} />
      </div>

      <div className={styles.countdown}>
        <TimerRing durationMs={6000} startAt={countdownStart} size={100} state="running" />
      </div>

      <div className={styles.startRow}>
        <button
          className={`${styles.startButton} ${startDisabled ? styles.startButtonDisabled : ""}`}
          onClick={() => {
            if (isHost) {
              if (canStart) startGame();
            } else {
              setReady(!selfReady);
            }
          }}
          disabled={startDisabled}
          aria-label="start"
        >
          <span className={styles.startIcon} />
        </button>
        <div className={styles.startLabel}>{startLabel}</div>
      </div>

      <div className={styles.soundToggle}>
        <SoundToggle enabled={soundOn} onToggle={() => setSoundOn((prev) => !prev)} />
      </div>

      <button className={styles.qrToggle} onClick={() => setShowQr((prev) => !prev)} aria-label="qr">
        <span className={styles.qrToggleIcon} />
      </button>

      {showQr && (
        <div className={styles.qrOverlay} onClick={() => setShowQr(false)}>
          <div className={styles.qrSheet}>
            {qrSrc ? <img src={qrSrc} alt="" className={styles.qrImage} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
