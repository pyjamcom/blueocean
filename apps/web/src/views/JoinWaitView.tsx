import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import {
  AVATAR_IDS,
  avatarColor,
  getAvatarImageUrl,
  getStoredAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import styles from "./JoinWaitView.module.css";

export default function JoinWaitView() {
  const navigate = useNavigate();
  const { roomCode, players, playerId, setAvatar, setReady, resetRoom } = useRoom();
  const touchStart = useRef<number | null>(null);
  const [avatarIndex, setAvatarIndex] = useState(() => {
    const stored = getStoredAvatarId();
    if (stored) {
      const idx = AVATAR_IDS.indexOf(stored);
      if (idx >= 0) return idx;
    }
    return Math.floor(Math.random() * AVATAR_IDS.length);
  });
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sound_enabled") !== "0";
  });

  const selfAvatar = AVATAR_IDS[avatarIndex] ?? AVATAR_IDS[0] ?? "avatar_raccoon_dj";
  const selfPlayer = players.find((player) => player.id === playerId);
  const scoreSorted = [...players].sort((a, b) => b.score - a.score);
  const selfRank = selfPlayer ? scoreSorted.findIndex((player) => player.id === selfPlayer.id) + 1 : 3;
  const badgeLabel = (selfPlayer?.name ?? "WEEEP").slice(0, 12);
  const profileTag = `#${(playerId ?? "124").replace(/[^0-9]/g, "").slice(-3) || "124"}`;
  const selfAvatarSrc = getAvatarImageUrl(selfAvatar);

  useEffect(() => {
    setStoredAvatarId(selfAvatar);
    if (roomCode) {
      setAvatar(selfAvatar);
    }
  }, [roomCode, selfAvatar, setAvatar]);

  const handleAvatarCycle = (direction: number) => {
    setAvatarIndex((prev) => (prev + direction + AVATAR_IDS.length) % AVATAR_IDS.length);
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

  const shownPlayers = players.slice(0, 6);

  return (
    <div className={styles.wrap}>
      <section className={styles.phone} aria-label="Waiting room">
        <div className={styles.topBar}>
          <span className={styles.statusTime}>9:41</span>
          <span className={styles.notch} aria-hidden="true" />
          <span className={styles.topBarRight} aria-hidden="true">
            <span className={styles.signalIcon} />
            <span className={styles.wifiIcon} />
            <span className={styles.batteryIcon} />
          </span>
        </div>

        <header className={styles.statusCard}>
          <h1 className={styles.statusTitle}>Waiting for the other players...</h1>
          <div className={styles.metaRow}>
            <span className={styles.rankBadge}>🏆 {selfRank || 3}</span>
            <span className={styles.nameBadge}>{badgeLabel}</span>
            <span className={styles.tagBadge}>{profileTag}</span>
          </div>
        </header>

        <main className={styles.mobile}>
          <section className={styles.avatarCard}>
            <div
              className={styles.avatarBox}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onClick={() => handleAvatarCycle(1)}
              aria-label={selfAvatar}
            >
              {selfAvatarSrc ? <img src={selfAvatarSrc} alt="" className={styles.avatarImage} /> : null}
            </div>
            <button type="button" className={styles.chooseAvatar} onClick={() => handleAvatarCycle(1)}>
              Choose avatar
            </button>
          </section>

          <section className={styles.playersCard}>
            <header className={styles.playersHead}>
              <span className={styles.playersTitle}>Player list</span>
              <span className={styles.playersCount}>{players.length}</span>
            </header>
            <div className={styles.playersGrid}>
              {shownPlayers.map((player) => {
                const avatarSrc = getAvatarImageUrl(player.avatarId);
                return (
                  <article key={player.id} className={styles.playerCell}>
                    <span
                      className={styles.playerAvatar}
                      style={{ background: avatarColor(player.avatarId ?? player.id) }}
                    >
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="" className={styles.avatarImage} />
                      ) : (
                        <span>{(player.name ?? "P").charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <span className={styles.playerName}>{player.name ?? "Player"}</span>
                  </article>
                );
              })}
            </div>
          </section>
        </main>

        <footer className={styles.downBar}>
          <div className={styles.buttonsBar}>
            <button
              type="button"
              className={styles.joinButton}
              onClick={() => {
                setReady(true);
                navigate("/lobby");
              }}
            >
              Join game
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${soundOn ? styles.iconSoundOn : styles.iconSoundOff}`}
              aria-label="Toggle sound"
              onClick={() =>
                setSoundOn((prev) => {
                  const next = !prev;
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("sound_enabled", next ? "1" : "0");
                  }
                  return next;
                })
              }
            />
            <button
              type="button"
              className={`${styles.iconButton} ${styles.iconHelp}`}
              aria-label="Open leaderboard"
              onClick={() => navigate("/leaderboard")}
            />
            <button
              type="button"
              className={`${styles.iconButton} ${styles.iconLogout}`}
              aria-label="Leave room"
              onClick={() => {
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
      </section>
    </div>
  );
}
