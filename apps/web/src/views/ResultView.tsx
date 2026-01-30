import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NextRoundButton from "../components/NextRoundButton";
import ShareCard, { ShareCardHandle } from "../components/ShareCard";
import RahootLeaderboard from "../components/RahootLeaderboard";
import RahootPodium from "../components/RahootPodium";
import { useRoom } from "../context/RoomContext";
import { trackEvent } from "../utils/analytics";
import { getStoredAvatarId, randomAvatarId } from "../utils/avatar";
import { randomId } from "../utils/ids";
import { getStoredPlayerName } from "../utils/playerName";
import styles from "./ResultView.module.css";

export default function ResultView() {
  const { players, roomCode, createNextRoom, phase } = useRoom();
  const shareRef = useRef<ShareCardHandle | null>(null);
  const navigate = useNavigate();
  const isFinal = phase === "end";
  const isLeaderboard = phase === "leaderboard" || phase === "end";

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

  const podium = useMemo(() => {
    return leaderboard.slice(0, 3).map((entry) => ({ avatarId: entry.avatarId, rank: entry.rank }));
  }, [leaderboard]);

  const rahootEntries = useMemo(
    () =>
      leaderboard.map((entry) => ({
        id: entry.playerId,
        name: entry.name ?? "Player",
        points: entry.score,
      })),
    [leaderboard],
  );

  const winner = useMemo(() => {
    return leaderboard.length ? { avatarId: leaderboard[0].avatarId } : null;
  }, [leaderboard]);

  const nextRoomCode = useMemo(() => {
    if (!roomCode) return randomId(4);
    let code = randomId(4);
    while (code === roomCode) {
      code = randomId(4);
    }
    return code;
  }, [roomCode]);
  const qrUrl = `https://d0.do/${nextRoomCode}`;
  const canShareCard = Boolean(winner) && isFinal;

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
      {isFinal && winner ? (
        <ShareCard
          ref={shareRef}
          podiumTop3={podium}
          winner={winner}
          stampId="stamp-fiesta"
          medalSetId="medal-spark"
          qrUrl={qrUrl}
        />
      ) : null}
      {isLeaderboard ? (
        phase === "leaderboard" ? (
          <RahootLeaderboard entries={rahootEntries} />
        ) : (
          <RahootPodium title="Final" top={rahootEntries.slice(0, 3)} />
        )
      ) : null}
      {isFinal && (
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
      )}
    </div>
  );
}
