import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SoundToggle from "../components/SoundToggle";
import TimerRing from "../components/TimerRing";
import { AVATAR_IDS, avatarColor, randomAvatarId } from "../utils/avatar";
import { assetIds, getAssetUrl } from "../utils/assets";
import styles from "./LobbyView.module.css";

type PulseVariant = "fast" | "mid" | "slow";

function resolveVariant(age?: number): PulseVariant {
  if (!age) return "mid";
  if (age <= 30) return "fast";
  if (age <= 40) return "mid";
  return "slow";
}

interface LobbyPlayer {
  id: string;
  avatarId: string;
  assetId?: string;
  ready: boolean;
  pulse: boolean;
}

export default function LobbyView() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const age = params.get("age") ? Number(params.get("age")) : undefined;
  const variant = resolveVariant(age);

  const lobbyAssets = assetIds.length ? assetIds : [];
  const assetCursor = useRef(3);
  const pickAssetId = () => {
    if (lobbyAssets.length === 0) return undefined;
    const id = lobbyAssets[assetCursor.current % lobbyAssets.length];
    assetCursor.current += 1;
    return id;
  };

  const [players, setPlayers] = useState<LobbyPlayer[]>(() =>
    Array.from({ length: 3 }).map((_, index) => ({
      id: `p-${index}`,
      avatarId: randomAvatarId(),
      assetId: lobbyAssets.length ? lobbyAssets[index % lobbyAssets.length] : undefined,
      ready: true,
      pulse: false,
    })),
  );
  const [soundOn, setSoundOn] = useState(true);
  const [avatarIndex, setAvatarIndex] = useState(() =>
    Math.floor(Math.random() * AVATAR_IDS.length),
  );
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    if (players.length >= 10) return;
    const timer = window.setInterval(() => {
      setPlayers((prev) => {
        if (prev.length >= 10) return prev;
        const id = `p-${Date.now()}`;
        const next = [
          ...prev,
          {
            id,
            avatarId: randomAvatarId(),
            assetId: pickAssetId(),
            ready: true,
            pulse: true,
          },
        ];
        window.setTimeout(() => {
          setPlayers((current) =>
            current.map((player) =>
              player.id === id ? { ...player, pulse: false } : player,
            ),
          );
        }, 900);
        return next;
      });
    }, 1600);
    return () => window.clearInterval(timer);
  }, [players.length]);

  const countdownStart = useMemo(() => Date.now(), []);

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
  const selfAssetId = lobbyAssets.length
    ? lobbyAssets[avatarIndex % lobbyAssets.length]
    : undefined;
  const selfAssetSrc = getAssetUrl(selfAssetId);

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
            className={`${styles.player} ${player.pulse ? styles.playerPulse : ""}`}
          >
            <div
              className={styles.playerAvatar}
              style={{
                background: avatarColor(player.avatarId),
                backgroundImage: `url(${getAssetUrl(player.assetId)})`,
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "70%",
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

      <div className={styles.countdown}>
        <TimerRing durationMs={6000} startAt={countdownStart} size={100} state="running" />
      </div>

      <div className={styles.soundToggle}>
        <SoundToggle enabled={soundOn} onToggle={() => setSoundOn((prev) => !prev)} />
      </div>
    </div>
  );
}
