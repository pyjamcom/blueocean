import { useEffect, useMemo, useRef } from "react";
import AnswerDistribution from "../components/AnswerDistribution";
import Leaderboard from "../components/Leaderboard";
import NextRoundButton from "../components/NextRoundButton";
import ShareCard, { ShareCardHandle } from "../components/ShareCard";
import { useRoom } from "../context/RoomContext";
import { trackEvent } from "../utils/analytics";
import styles from "./ResultView.module.css";

export default function ResultView() {
  const { players, playerId, answerCounts, roomCode } = useRoom();
  const shareRef = useRef<ShareCardHandle | null>(null);
  const samplePodium = useMemo(
    () => [
      { avatarId: "avatar_party_octopus", rank: 1 },
      { avatarId: "avatar_disco_sloth", rank: 2 },
      { avatarId: "avatar_space_cactus", rank: 3 },
    ],
    [],
  );
  const sampleLeaderboard = useMemo(
    () => [
      { playerId: "p1", avatarId: "avatar_party_octopus", rank: 1 },
      { playerId: "p2", avatarId: "avatar_disco_sloth", rank: 2 },
      { playerId: "p3", avatarId: "avatar_space_cactus", rank: 3 },
      { playerId: "p4", avatarId: "avatar_laughing_llama", rank: 4 },
      { playerId: "p5", avatarId: "avatar_penguin_chef", rank: 5 },
    ],
    [],
  );

  const leaderboard = useMemo(() => {
    if (!players.length) return sampleLeaderboard;
    const sorted = [...players].sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
    return sorted.map((player, idx) => ({
      playerId: player.id,
      avatarId: player.avatarId,
      rank: idx + 1,
      score: player.score,
      correctCount: player.correctCount,
    }));
  }, [players, sampleLeaderboard]);

  const selfEntry = useMemo(() => {
    return leaderboard.find((entry) => entry.playerId === playerId) ?? null;
  }, [leaderboard, playerId]);

  const podium = useMemo(() => {
    if (!leaderboard.length) return samplePodium;
    return leaderboard.slice(0, 3).map((entry) => ({ avatarId: entry.avatarId, rank: entry.rank }));
  }, [leaderboard, samplePodium]);

  const winner = useMemo(() => {
    if (!leaderboard.length) return { avatarId: "avatar_party_octopus" };
    return { avatarId: leaderboard[0].avatarId };
  }, [leaderboard]);

  const qrUrl = roomCode ? `https://d0.do/${roomCode}` : "https://d0.do/ABCD";

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

  return (
    <div className={styles.wrap}>
      <ShareCard
        ref={shareRef}
        podiumTop3={podium}
        winner={winner}
        stampId="stamp-fiesta"
        medalSetId="medal-spark"
        qrUrl={qrUrl}
      />
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
          <button className={styles.actionButton} onClick={handleShare} aria-label="share">
            <span className={styles.iconShare} />
          </button>
          <span className={styles.actionLabel}>Share</span>
        </div>
        <div className={styles.actionItem}>
          <button className={styles.actionButton} onClick={handleSave} aria-label="save">
            <span className={styles.iconSave} />
          </button>
          <span className={styles.actionLabel}>Save</span>
        </div>
        <div className={styles.actionItem}>
          <NextRoundButton onClick={() => trackEvent("replay_click")} />
          <span className={styles.actionLabel}>Next</span>
        </div>
      </div>
    </div>
  );
}
