import { useEffect, useMemo, useState } from "react";
import styles from "./RahootLeaderboard.module.css";

export interface RahootLeaderboardEntry {
  id: string;
  name: string;
  points: number;
}

interface AnimatedPointsProps {
  from: number;
  to: number;
}

function AnimatedPoints({ from, to }: AnimatedPointsProps) {
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (to - from) * progress);
      setDisplay(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, [from, to]);

  return <span className={styles.points}>{display}</span>;
}

export default function RahootLeaderboard({
  entries,
  previousEntries,
}: {
  entries: RahootLeaderboardEntry[];
  previousEntries?: RahootLeaderboardEntry[];
}) {
  const [showAnimated, setShowAnimated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowAnimated(true), 1600);
    return () => window.clearTimeout(timer);
  }, [entries]);

  const prevMap = useMemo(() => {
    const map = new Map<string, RahootLeaderboardEntry>();
    (previousEntries ?? entries).forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [entries, previousEntries]);

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>Leaderboard</h2>
      <div className={styles.list}>
        {entries.map((entry) => {
          const prev = prevMap.get(entry.id);
          return (
            <div key={entry.id} className={styles.row}>
              <span className={styles.name}>{entry.name}</span>
              {showAnimated ? (
                <AnimatedPoints from={prev?.points ?? 0} to={entry.points} />
              ) : (
                <span className={styles.points}>{entry.points}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
