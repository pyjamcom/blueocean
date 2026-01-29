import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AnswerDistribution from "../components/AnswerDistribution";
import Leaderboard from "../components/Leaderboard";
import NextRoundButton from "../components/NextRoundButton";
import ShareCard, { ShareCardHandle } from "../components/ShareCard";
import { useRoom } from "../context/RoomContext";
import { trackEvent } from "../utils/analytics";
import { getStoredAvatarId, randomAvatarId } from "../utils/avatar";
import styles from "./ResultView.module.css";

export default function ResultView() {
  const { players, playerId, answerCounts, roomCode, createNextRoom } = useRoom();
  const shareRef = useRef<ShareCardHandle | null>(null);
  const navigate = useNavigate();

  const leaderboard = useMemo(() => {
    if (!players.length) return [];
    const sorted = [...players].sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
    return sorted.map((player, idx) => ({
      playerId: player.id,
      avatarId: player.avatarId,
      rank: idx + 1,
      score: player.score,
      correctCount: player.correctCount,
    }));
  }, [players]);

  const selfEntry = useMemo(() => {
    return leaderboard.find((entry) => entry.playerId === playerId) ?? null;
  }, [leaderboard, playerId]);

  const podium = useMemo(() => {
    return leaderboard.slice(0, 3).map((entry) => ({ avatarId: entry.avatarId, rank: entry.rank }));
  }, [leaderboard]);

  const winner = useMemo(() => {
    return leaderboard.length ? { avatarId: leaderboard[0].avatarId } : null;
  }, [leaderboard]);

  const qrUrl = roomCode ? `https://d0.do/${roomCode}` : "https://d0.do/ABCD";
  const canShareCard = Boolean(winner);

  useEffect(() => {
    trackEvent("sharecard_generate");
    trackEvent("leaderboard_view");
  }, []);

  const handleShare = async () => {
    await shareRef.current?.share();
  };

  const handleSave = async () => {
    const imageUrl = await shareRef.current?.toPng();
    if (!imageUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = "escapers-win.png";
    link.click();
  };

  const handleNext = () => {
    const avatarId = getStoredAvatarId() ?? randomAvatarId();
    createNextRoom(avatarId);
    trackEvent("replay_click");
    navigate("/join");
  };

  return (
    <div className={styles.wrap}>
      {winner ? (
        <ShareCard
          ref={shareRef}
          podiumTop3={podium}
          winner={winner}
          stampId="stamp-fiesta"
          medalSetId="medal-spark"
          qrUrl={qrUrl}
        />
      ) : null}
      <AnswerDistribution counts={answerCounts} />
      <Leaderboard
        items={leaderboard}
        self={
          selfEntry
            ? {
                playerId: selfEntry.playerId,
                avatarId: selfEntry.avatarId,
                rank: selfEntry.rank,
                score: selfEntry.score,
                correctCount: selfEntry.correctCount,
              }
            : null
        }
        mode="speed"
      />
      <div className={styles.actions}>
        <div className={styles.actionItem}>
          <button
            className={styles.actionButton}
            onClick={handleShare}
            aria-label="share"
            disabled={!canShareCard}
          >
            <span className={styles.iconShare} />
          </button>
          <span className={styles.actionLabel}>Share</span>
        </div>
        <div className={styles.actionItem}>
          <button
            className={styles.actionButton}
            onClick={handleSave}
            aria-label="save"
            disabled={!canShareCard}
          >
            <span className={styles.iconSave} />
          </button>
          <span className={styles.actionLabel}>Save</span>
        </div>
        <div className={styles.actionItem}>
          <NextRoundButton onClick={handleNext} />
          <span className={styles.actionLabel}>Next</span>
        </div>
      </div>
    </div>
  );
}
