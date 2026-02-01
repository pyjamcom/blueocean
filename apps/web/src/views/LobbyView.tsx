import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocation } from "react-router-dom";
import EngagementPanel from "../components/engagement/EngagementPanel";
import { useEngagement } from "../context/EngagementContext";
import SoundToggle from "../components/SoundToggle";
import { useRoom } from "../context/RoomContext";
import {
  AVATAR_IDS,
  avatarIconIndex,
  getAvatarImageUrl,
  getStoredAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import { assetIds, getAssetUrl } from "../utils/assets";
import { getStoredPlayerName, setStoredPlayerName } from "../utils/playerName";
import frames from "../engagement/frames.module.css";
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
  const { roomCode, players, playerId, setReady, setAvatar, setName } = useRoom();
  const { state: engagement } = useEngagement();

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
  const touchStart = useRef<number | null>(null);
  const [qrSrc, setQrSrc] = useState<string>("");
  const [showQr, setShowQr] = useState(false);
  const [nameDraft, setNameDraft] = useState(() => getStoredPlayerName() || "Player");
  const [editingName, setEditingName] = useState(false);

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
    ? lobbyAssets[avatarIconIndex(selfAvatar) % lobbyAssets.length]
    : undefined;
  const selfAssetSrc = getAvatarImageUrl(selfAvatar) ?? getAssetUrl(selfAssetId);
  const startLabel = selfReady ? "Waiting to start" : "Ready to play";
  const frameClass = engagement.cosmetics.equipped.frame
    ? frames[engagement.cosmetics.equipped.frame] ?? ""
    : "";

  useEffect(() => {
    setStoredAvatarId(selfAvatar);
    if (roomCode) {
      setAvatar(selfAvatar);
    }
  }, [roomCode, selfAvatar, setAvatar]);

  useEffect(() => {
    if (editingName) return;
    const resolved = selfPlayer?.name ?? getStoredPlayerName() ?? "Player";
    setNameDraft(resolved);
  }, [editingName, selfPlayer?.name]);

  const commitName = (nextName?: string) => {
    const safeName = (nextName ?? nameDraft).trim().slice(0, 18);
    if (!safeName) {
      const fallback = selfPlayer?.name ?? getStoredPlayerName() ?? "Player";
      setNameDraft(fallback);
      return;
    }
    setNameDraft(safeName);
    setStoredPlayerName(safeName);
    setName(safeName);
  };

  return (
    <div className={`${styles.wrap} ${styles[variant]}`}>
      <div className={styles.topBar}>
        <button className={styles.qrToggle} onClick={() => setShowQr((prev) => !prev)} aria-label="qr">
          <span className={styles.qrToggleIcon} />
        </button>
        <SoundToggle
          enabled={soundOn}
          onToggle={() =>
            setSoundOn((prev) => {
              const next = !prev;
              if (typeof window !== "undefined") {
                window.localStorage.setItem("sound_enabled", next ? "1" : "0");
              }
              return next;
            })
          }
        />
      </div>

      <EngagementPanel mode="lobby" />
      <div className={styles.players}>
        {players.map((player) => {
          const playerAssetId = lobbyAssets.length
            ? lobbyAssets[avatarIconIndex(player.avatarId) % lobbyAssets.length]
            : undefined;
          const playerAssetSrc = getAvatarImageUrl(player.avatarId) ?? getAssetUrl(playerAssetId);
          return (
            <div
              key={player.id}
              className={`${styles.player} ${styles.playerPulse}`}
            >
              <div className={styles.playerAvatar} aria-label={player.avatarId}>
                {playerAssetSrc ? (
                  <img src={playerAssetSrc} alt="" className={styles.avatarImage} />
                ) : null}
              </div>
              <span className={styles.playerName}>{player.name ?? "Player"}</span>
              {player.ready && <span className={styles.readyRing} />}
            </div>
          );
        })}
      </div>

      <div
        className={styles.selfAvatar}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onClick={() => handleAvatarCycle(1)}
        aria-label={selfAvatar}
      >
        <div className={`${styles.selfAvatarCore} ${frameClass}`}>
          {selfAssetSrc ? <img src={selfAssetSrc} alt="" className={styles.avatarImage} /> : null}
        </div>
        <span className={styles.selfPulse} />
      </div>

      <div className={styles.nameRow}>
        <input
          type="text"
          value={nameDraft}
          onFocus={() => setEditingName(true)}
          onBlur={() => {
            setEditingName(false);
            commitName();
          }}
          onChange={(event) => setNameDraft(event.target.value.slice(0, 18))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              const fallback = selfPlayer?.name ?? getStoredPlayerName() ?? "Player";
              setEditingName(false);
              setNameDraft(fallback);
              event.currentTarget.blur();
            }
          }}
          className={styles.selfNameInput}
          placeholder="Your name"
          aria-label="player name"
        />
      </div>

      <div className={styles.hintRow}>
        <button
          type="button"
          className={styles.hintButton}
          onClick={() => handleAvatarCycle(1)}
          aria-label="change avatar"
        >
          <span className={styles.hintButtonIcon} />
          <span className={styles.hintLabel}>Change avatar</span>
        </button>
      </div>

      <div className={styles.startRow}>
        <button
          className={styles.startButton}
          onClick={() => {
            setReady(!selfReady);
          }}
          disabled={false}
          aria-label="start"
        >
          <span className={selfReady ? styles.startIconPaused : styles.startIcon} />
        </button>
        <span className={styles.startLabel}>{startLabel}</span>
      </div>


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
