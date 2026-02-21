import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { trackEvent } from "../utils/analytics";
import { avatarColor, getAvatarImageUrl, getStoredAvatarId, randomAvatarId } from "../utils/avatar";
import { randomId } from "../utils/ids";
import { getStoredPlayerName } from "../utils/playerName";
import { LEADERBOARD_SHARE_TITLE } from "../utils/seo";
import styles from "./ResultView.module.css";

interface ResultEntry {
  playerId: string;
  avatarId?: string;
  name: string;
  rank: number;
  score: number;
}

interface RowTone {
  rowGradient: string;
  rowBorder: string;
}

function rowTone(rank: number): RowTone {
  if (rank === 1) {
    return {
      rowGradient: "linear-gradient(180deg, #bab407 0%, #4e4c05 100%)",
      rowBorder: "#fff70d",
    };
  }
  if (rank === 2) {
    return {
      rowGradient: "linear-gradient(180deg, #737373 0%, #212121 100%)",
      rowBorder: "#ffffff",
    };
  }
  if (rank === 3) {
    return {
      rowGradient: "linear-gradient(180deg, #ac7207 0%, #462e02 100%)",
      rowBorder: "#f4a106",
    };
  }
  return {
    rowGradient: "linear-gradient(180deg, #7807ac 0%, #330246 100%)",
    rowBorder: "#b515ff",
  };
}

export default function ResultView() {
  const { players, roomCode, createNextRoom, phase } = useRoom();
  const navigate = useNavigate();
  const isFinal = phase === "end";
  const [shareHint, setShareHint] = useState<string | null>(null);
  const shareTimeoutRef = useRef<number | null>(null);

  const leaderboard = useMemo<ResultEntry[]>(() => {
    if (!players.length) return [];
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return sorted.map((player, idx) => ({
      playerId: player.id,
      avatarId: player.avatarId,
      name: player.name || "Player",
      rank: idx + 1,
      score: player.score,
    }));
  }, [players]);

  const podium = useMemo(
    () => ({
      first: leaderboard[0] ?? null,
      second: leaderboard[1] ?? null,
      third: leaderboard[2] ?? null,
    }),
    [leaderboard],
  );

  const rows = useMemo(() => leaderboard.slice(0, isFinal ? 6 : 13), [isFinal, leaderboard]);

  const nextRoomCode = useMemo(() => {
    if (!roomCode) return randomId(4);
    let code = randomId(4);
    while (code === roomCode) {
      code = randomId(4);
    }
    return code;
  }, [roomCode]);

  useEffect(() => {
    trackEvent("leaderboard_view", { source: "result" });
  }, []);

  const shareUrl = "https://escapers.app/leaderboard";
  const shareTitle = LEADERBOARD_SHARE_TITLE;
  const shareText = "I just hit the podium in Escapers 🏆 Meme quiz chaos awaits.";
  const shareTextX = "I just hit the podium in Escapers 🏆 Meme quiz chaos →";
  const shareTextReddit = "I just hit the podium in Escapers 🏆 Meme quiz chaos — come play:";
  const shareTextInstagram = "I just hit the podium in Escapers 🏆 Meme quiz chaos. Join us:";
  const shareTextTwitch = "Podium secured in Escapers 🏆 Meme quiz chaos. Hop in:";

  const setHint = (message: string) => {
    setShareHint(message);
    if (shareTimeoutRef.current) {
      window.clearTimeout(shareTimeoutRef.current);
    }
    shareTimeoutRef.current = window.setTimeout(() => setShareHint(null), 2800);
  };

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  const copyShareLink = async (label: string, content?: string) => {
    try {
      const payload = content ?? shareUrl;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const temp = document.createElement("textarea");
        temp.value = payload;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      setHint(`${label} link copied — paste it anywhere.`);
      trackEvent("podium_share", { channel: `${label.toLowerCase()}_copy` });
    } catch {
      setHint("Copy failed — try again.");
    }
  };

  const openShare = (url: string, channel: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    trackEvent("podium_share", { channel });
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        trackEvent("podium_share", { channel: "native" });
        return;
      } catch {
        // fall back to copy when share sheet is unavailable or closed
      }
    }
    await copyShareLink("Share");
  };

  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(
    shareUrl,
  )}&title=${encodeURIComponent(shareTextReddit)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareTextX,
  )}&url=${encodeURIComponent(shareUrl)}`;

  const handleExit = () => {
    const avatarId = getStoredAvatarId() ?? randomAvatarId();
    const playerName = getStoredPlayerName();
    createNextRoom(nextRoomCode, avatarId, playerName);
    trackEvent("replay_click");
    navigate("/join");
  };

  const renderAvatar = (entry: ResultEntry | null, className?: string) => {
    if (!entry) {
      return <span className={`${styles.avatar} ${className}`} />;
    }
    const src = entry.avatarId ? getAvatarImageUrl(entry.avatarId) : null;
    return (
      <span
        className={`${styles.avatar} ${className ?? ""}`}
        style={{ background: avatarColor(entry.avatarId ?? entry.playerId) }}
      >
        {src ? <img src={src} alt="" /> : <span>{entry.name.charAt(0).toUpperCase()}</span>}
      </span>
    );
  };

  const renderPodiumLane = (
    entry: ResultEntry | null,
    laneClass: string | undefined,
    badgeClass: string | undefined,
    rankLabel: string,
  ) => (
    <div className={`${styles.podiumLane} ${laneClass ?? ""}`}>
      <div className={styles.podiumAvatarBlock}>
        {renderAvatar(entry, styles.avatarLarge)}
        <span className={styles.podiumName}>{entry?.name ?? "—"}</span>
      </div>
      <div className={`${styles.podiumBadge} ${badgeClass ?? ""}`}>
        <span className={styles.medalChip}>{rankLabel}</span>
        <span className={styles.podiumScore}>{entry?.score ?? 0}</span>
      </div>
    </div>
  );

  return (
    <div className={styles.wrap}>
      <section className={styles.phone} aria-label={isFinal ? "End game view" : "Leaderboard view"}>
        <div className={styles.topBar}>
          <span className={styles.statusTime}>9:41</span>
          <span className={styles.notch} aria-hidden="true" />
          <span className={styles.topBarRight} aria-hidden="true">
            <span className={styles.signalIcon} />
            <span className={styles.wifiIcon} />
            <span className={styles.batteryIcon} />
          </span>
        </div>

        <header className={styles.header}>
          <h1 className={styles.headerTitle}>{isFinal ? "End Game" : "Leaderboard"}</h1>
        </header>

        <main className={styles.mobile}>
          {isFinal ? (
            <section className={styles.podiumCard}>
              <div className={styles.podiumColumns}>
                {renderPodiumLane(podium.second, styles.laneSecond, styles.badgeSecond, "2")}
                {renderPodiumLane(podium.first, styles.laneFirst, styles.badgeFirst, "1")}
                {renderPodiumLane(podium.third, styles.laneThird, styles.badgeThird, "3")}
              </div>
            </section>
          ) : null}

          {isFinal ? (
            <section className={styles.shareCard}>
              <h2 className={styles.cardTitle}>Share on:</h2>
              <div className={styles.shareRow}>
                <button type="button" className={styles.shareButton} onClick={() => openShare(redditUrl, "reddit")} aria-label="Share on Reddit">
                  <span className={styles.shareGlyph}>👽</span>
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => copyShareLink("Instagram", `${shareTextInstagram} ${shareUrl}`)}
                  aria-label="Share on Instagram"
                >
                  <span className={styles.shareGlyph}>◎</span>
                </button>
                <button type="button" className={styles.shareButton} onClick={() => openShare(facebookUrl, "facebook")} aria-label="Share on Facebook">
                  <span className={styles.shareGlyph}>f</span>
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => copyShareLink("Twitch", `${shareTextTwitch} ${shareUrl}`)}
                  aria-label="Share on Twitch"
                >
                  <span className={styles.shareGlyph}>T</span>
                </button>
                <button type="button" className={styles.shareButton} onClick={() => openShare(xUrl, "x")} aria-label="Share on X">
                  <span className={styles.shareGlyph}>X</span>
                </button>
              </div>
              <button type="button" className={styles.nativeShare} onClick={handleNativeShare}>
                Share
              </button>
              {shareHint ? <p className={styles.shareHint}>{shareHint}</p> : null}
            </section>
          ) : null}

          <section className={styles.listCard}>
            <div className={styles.listRows}>
              {rows.map((entry) => {
                const tone = rowTone(entry.rank);
                const avatarSrc = entry.avatarId ? getAvatarImageUrl(entry.avatarId) : null;
                return (
                  <article
                    key={entry.playerId}
                    className={styles.row}
                    style={{ background: tone.rowGradient, borderColor: tone.rowBorder }}
                  >
                    <div className={styles.rowLeft}>
                      <span className={styles.rankChip}>🏆 {entry.rank}</span>
                      <div className={styles.rowIdentity}>
                        <span
                          className={styles.avatar}
                          style={{ background: avatarColor(entry.avatarId ?? entry.playerId) }}
                        >
                          {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{entry.name.charAt(0)}</span>}
                        </span>
                        <span className={styles.rowName}>{entry.name}</span>
                      </div>
                    </div>
                    <span className={styles.scoreBadge}>{entry.score}</span>
                  </article>
                );
              })}
            </div>
          </section>

          {isFinal ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleExit}
                aria-label="Leave and return to join"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 3.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0v-1.5H4.75v10.5h2.5v-1.5a.75.75 0 0 1 1.5 0V16a.75.75 0 0 1-.75.75h-4A.75.75 0 0 1 3.25 16V4A.75.75 0 0 1 4 3.25h4Zm4.78 2.22a.75.75 0 0 1 1.06 0l3.97 3.97a.75.75 0 0 1 0 1.06l-3.97 3.97a.75.75 0 1 1-1.06-1.06l2.69-2.69H8.75a.75.75 0 0 1 0-1.5h6.72l-2.69-2.69a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
          ) : null}
        </main>

        <footer className={styles.tabBar}>
          <div className={styles.urlRow}>
            <span className={styles.lockIcon} aria-hidden="true" />
            <span className={styles.url}>escapers.app</span>
          </div>
          <span className={styles.homeIndicator} aria-hidden="true" />
        </footer>
      </section>
    </div>
  );
}
