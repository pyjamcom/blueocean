import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import NextRoundButton from "../components/NextRoundButton";
import RahootLeaderboard from "../components/RahootLeaderboard";
import RahootPodium from "../components/RahootPodium";
import EngagementPanel from "../components/engagement/EngagementPanel";
import { useRoom } from "../context/RoomContext";
import { trackEvent } from "../utils/analytics";
import { getStoredAvatarId, randomAvatarId } from "../utils/avatar";
import { randomId } from "../utils/ids";
import { getStoredPlayerName } from "../utils/playerName";
import styles from "./ResultView.module.css";

export default function ResultView() {
  const { players, roomCode, createNextRoom, phase } = useRoom();
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
      })),
    [leaderboard, titleMap],
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
