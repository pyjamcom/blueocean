import { useMemo, useRef } from "react";
import AnswerDistribution from "../components/AnswerDistribution";
import Leaderboard from "../components/Leaderboard";
import NextRoundButton from "../components/NextRoundButton";
import ShareCard, { ShareCardHandle } from "../components/ShareCard";
import styles from "./ResultView.module.css";

export default function ResultView() {
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
        podiumTop3={samplePodium}
        winner={{ avatarId: "avatar_party_octopus" }}
        stampId="stamp-fiesta"
        medalSetId="medal-spark"
        qrUrl="https://d0.do/ABCD"
      />
      <AnswerDistribution counts={[6, 2, 4, 1]} />
      <Leaderboard items={sampleLeaderboard} self={{ rank: 2 }} mode="speed" />
      <div className={styles.actions}>
        <button className={styles.actionButton} onClick={handleShare} aria-label="share">
          <span className={styles.iconShare} />
        </button>
        <button className={styles.actionButton} onClick={handleSave} aria-label="save">
          <span className={styles.iconSave} />
        </button>
        <NextRoundButton onClick={() => {}} />
      </div>
    </div>
  );
}
