import { useMemo } from "react";
import RahootLeaderboard from "../components/RahootLeaderboard";
import RahootPodium from "../components/RahootPodium";
import { AVATAR_IDS } from "../utils/avatar";
import styles from "./DebugLeaderboardView.module.css";

const mockNames = [
  "Nova",
  "Atlas",
  "Pixel",
  "Mara",
  "Echo",
  "Lynx",
  "Kai",
  "Zuri",
];

function buildEntries(pointsSeed: number[]) {
  return mockNames.map((name, index) => ({
    id: `debug-${index}`,
    name,
    points: pointsSeed[index] ?? 0,
    avatarId: AVATAR_IDS[index % AVATAR_IDS.length],
  }));
}

export default function DebugLeaderboardView() {
  const previousEntries = useMemo(() => buildEntries([420, 380, 360, 340, 310, 290, 270, 240]), []);
  const entries = useMemo(() => buildEntries([520, 470, 430, 390, 360, 330, 300, 260]), []);

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h1 className={styles.title}>Debug: Leaderboard</h1>
        <p className={styles.subtitle}>Avatars should appear next to each name.</p>
        <RahootLeaderboard entries={entries} previousEntries={previousEntries} />
      </section>
      <section className={styles.section}>
        <h1 className={styles.title}>Debug: Final Result</h1>
        <p className={styles.subtitle}>Top 3 avatars should appear on the podium.</p>
        <RahootPodium title="Final" top={entries.slice(0, 3)} instantReveal />
      </section>
    </div>
  );
}
