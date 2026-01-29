import styles from "./Leaderboard.module.css";

export interface LeaderboardItem {
  playerId: string;
  avatarId: string;
  name?: string;
  rank: number;
  score?: number;
  correctCount?: number;
}

export interface LeaderboardProps {
  items: LeaderboardItem[];
  self?: { playerId: string; avatarId: string; name?: string; rank: number; score?: number; correctCount?: number } | null;
  mode: "speed" | "accuracy";
}

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function medalColor(rank: number) {
  if (rank === 1) return "#ffd166";
  if (rank === 2) return "#e9ecef";
  if (rank === 3) return "#f4a261";
  return "rgba(255,255,255,0.2)";
}

export default function Leaderboard({ items, self, mode }: LeaderboardProps) {
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const topItems = sorted.slice(0, 5);
  const selfOutsideTop = self && self.rank > 5 ? self : null;

  return (
    <div className={`leaderboard ${styles.board} ${styles[mode]}`}>
      {topItems.map((item) => {
        const isSelf = self?.rank === item.rank;
        const hue = hashHue(item.avatarId);
        return (
          <div
            key={item.playerId}
            className={`leaderboard__item ${styles.item} ${isSelf ? `leaderboard__selfHighlight ${styles.self}` : ""}`}
          >
            <div
              className={`leaderboard__rankBadge ${styles.rankBadge}`}
              style={{ backgroundColor: medalColor(item.rank) }}
              aria-label={`rank-${item.rank}`}
            />
            <div className={styles.avatarBlock}>
              <div
                className={`leaderboard__avatar ${styles.avatar}`}
                style={{ background: `hsl(${hue} 70% 60%)` }}
                aria-label={item.avatarId}
              />
              <span className={styles.name}>{item.name ?? "Player"}</span>
            </div>
            <span className={styles.spark} />
          </div>
        );
      })}
      {selfOutsideTop && (
        <div
          className={`leaderboard__item ${styles.item} ${styles.selfRow} leaderboard__selfHighlight ${styles.self}`}
          aria-label="self-rank"
        >
          <div
            className={`leaderboard__rankBadge ${styles.rankBadge}`}
            style={{ backgroundColor: medalColor(selfOutsideTop.rank) }}
            aria-label={`rank-${selfOutsideTop.rank}`}
          />
          <div className={styles.avatarBlock}>
            <div
              className={`leaderboard__avatar ${styles.avatar}`}
              style={{ background: `hsl(${hashHue(selfOutsideTop.avatarId)} 70% 60%)` }}
              aria-label={selfOutsideTop.avatarId}
            />
            <span className={styles.name}>{selfOutsideTop.name ?? "Player"}</span>
          </div>
          <span className={styles.spark} />
        </div>
      )}
    </div>
  );
}
