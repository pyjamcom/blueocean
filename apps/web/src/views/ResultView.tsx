import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NextRoundButton from "../components/NextRoundButton";
import RahootLeaderboard from "../components/RahootLeaderboard";
import RahootPodium from "../components/RahootPodium";
import EngagementPanel from "../components/engagement/EngagementPanel";
import { useRoom } from "../context/RoomContext";
import { useEngagement } from "../context/EngagementContext";
import { trackEvent } from "../utils/analytics";
import { getStoredAvatarId, randomAvatarId } from "../utils/avatar";
import { randomId } from "../utils/ids";
import { getStoredPlayerName } from "../utils/playerName";
import { LEADERBOARD_SHARE_TITLE } from "../utils/seo";
import frames from "../engagement/frames.module.css";
import styles from "./ResultView.module.css";

export default function ResultView() {
  const { players, roomCode, createNextRoom, phase, playerId } = useRoom();
  const { state: engagement } = useEngagement();
  const navigate = useNavigate();
  const isFinal = phase === "end";
  const isLeaderboard = phase === "leaderboard" || phase === "end";
  const [shareHint, setShareHint] = useState<string | null>(null);
  const shareTimeoutRef = useRef<number | null>(null);
  const equippedFrame = engagement.cosmetics.equipped.frame
    ? frames[engagement.cosmetics.equipped.frame] ?? ""
    : "";

  const leaderboard = useMemo(() => {
    if (!players.length) return [];
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return sorted.map((player, idx) => ({
      playerId: player.id,
      avatarId: player.avatarId,
      name: player.name,
      rank: idx + 1,
      score: player.score,
      correctCount: player.correctCount,
    }));
  }, [players]);

  const titleMap = useMemo(() => {
    if (!players.length) return new Map<string, string>();
    const topScore = [...players].sort((a, b) => b.score - a.score)[0];
    const topCorrect = [...players].sort((a, b) => b.correctCount - a.correctCount)[0];
    const map = new Map<string, string>();
    if (topScore) {
      map.set(topScore.id, "Score Boss");
    }
    if (topCorrect && !map.has(topCorrect.id) && topCorrect.correctCount > 0) {
      map.set(topCorrect.id, "Sharp Eye");
    }
    return map;
  }, [players]);

  const rahootEntries = useMemo(
    () =>
      leaderboard.map((entry) => ({
        id: entry.playerId,
        name: entry.name ?? "Player",
        points: entry.score,
        avatarId: entry.avatarId,
        title: titleMap.get(entry.playerId),
        frameClass: entry.playerId === playerId ? equippedFrame : undefined,
      })),
    [equippedFrame, leaderboard, playerId, titleMap],
  );
  const previousEntriesRef = useRef<typeof rahootEntries | null>(null);
  const previousEntries = previousEntriesRef.current ?? undefined;

  const nextRoomCode = useMemo(() => {
    if (!roomCode) return randomId(4);
    let code = randomId(4);
    while (code === roomCode) {
      code = randomId(4);
    }
    return code;
  }, [roomCode]);
  useEffect(() => {
    trackEvent("leaderboard_view");
  }, []);

  useEffect(() => {
    previousEntriesRef.current = rahootEntries;
  }, [rahootEntries]);

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
    shareTimeoutRef.current = window.setTimeout(() => {
      setShareHint(null);
    }, 2800);
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
    } catch (error) {
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
        // fall back to copy if user cancels or share fails
      }
    }
    await copyShareLink("Share");
    trackEvent("podium_share", { channel: "copy" });
  };

  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(
    shareUrl,
  )}&title=${encodeURIComponent(shareTextReddit)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareTextX,
  )}&url=${encodeURIComponent(shareUrl)}`;

  const handleNext = () => {
    const avatarId = getStoredAvatarId() ?? randomAvatarId();
    const playerName = getStoredPlayerName();
    createNextRoom(nextRoomCode, avatarId, playerName);
    trackEvent("replay_click");
    navigate("/join");
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.phaseHeader}>
        <span className={styles.phasePill}>{isFinal ? "Final" : "Leaderboard"}</span>
        {!isFinal && <span className={styles.phaseHint}>Next round incoming</span>}
      </div>
      <EngagementPanel mode="result" />
      {isLeaderboard ? (
        phase === "leaderboard" ? (
          <RahootLeaderboard entries={rahootEntries} previousEntries={previousEntries} />
        ) : (
          <RahootPodium title="Final" top={rahootEntries.slice(0, 3)} />
        )
      ) : null}
      {isFinal && (
        <section className={styles.shareStrip}>
          <button type="button" className={styles.sharePrimary} onClick={handleNativeShare}>
            <span className={styles.shareIcon}>📲</span>
            Share
          </button>
          <div className={styles.shareRow}>
            <button
              type="button"
              className={`${styles.shareButton} ${styles.shareFacebook}`}
              onClick={() => openShare(facebookUrl, "facebook")}
            >
              <span className={styles.shareIcon}>f</span>
              Facebook
            </button>
            <button
              type="button"
              className={`${styles.shareButton} ${styles.shareInstagram}`}
              onClick={() => copyShareLink("Instagram", `${shareTextInstagram} ${shareUrl}`)}
            >
              <span className={styles.shareIcon}>IG</span>
              Instagram
            </button>
            <button
              type="button"
              className={`${styles.shareButton} ${styles.shareTwitch}`}
              onClick={() => copyShareLink("Twitch", `${shareTextTwitch} ${shareUrl}`)}
            >
              <span className={styles.shareIcon}>TW</span>
              Twitch
            </button>
            <button
              type="button"
              className={`${styles.shareButton} ${styles.shareReddit}`}
              onClick={() => openShare(redditUrl, "reddit")}
            >
              <span className={styles.shareIcon}>👽</span>
              Reddit
            </button>
            <button
              type="button"
              className={`${styles.shareButton} ${styles.shareX}`}
              onClick={() => openShare(xUrl, "x")}
            >
              <span className={styles.shareIcon}>X</span>
              X
            </button>
          </div>
          {shareHint ? <div className={styles.shareHint}>{shareHint}</div> : null}
        </section>
      )}
      {isFinal && (
        <div className={styles.actions}>
          <div className={styles.actionItem}>
            <NextRoundButton onClick={handleNext} />
            <span className={styles.actionLabel}>Next</span>
          </div>
        </div>
      )}
    </div>
  );
}
