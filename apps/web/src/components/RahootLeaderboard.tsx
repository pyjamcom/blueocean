import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./RahootLeaderboard.module.css";
import { avatarColor, getAvatarImageUrl } from "../utils/avatar";

export interface RahootLeaderboardEntry {
  id: string;
  name: string;
  points: number;
  avatarId?: string;
  title?: string;
  frameClass?: string;
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
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const prevPositions = useRef(new Map<string, DOMRect>());

  useEffect(() => {
    const timer = window.setTimeout(() => setShowAnimated(true), 1600);
    return () => window.clearTimeout(timer);
  }, [entries]);

  const prevMap = useMemo(() => {
    const map = new Map<string, RahootLeaderboardEntry>();
    (previousEntries ?? entries).forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [entries, previousEntries]);

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    entries.forEach((entry) => {
      const node = rowRefs.current.get(entry.id);
      if (node) {
        nextPositions.set(entry.id, node.getBoundingClientRect());
      }
    });

    nextPositions.forEach((nextRect, id) => {
      const prevRect = prevPositions.current.get(id);
      if (!prevRect) {
        return;
      }
      const deltaY = prevRect.top - nextRect.top;
      if (!deltaY) {
        return;
      }
      const node = rowRefs.current.get(id);
      if (!node) {
        return;
      }
      node.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });

    prevPositions.current = nextPositions;
  }, [entries]);

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>Leaderboard</h2>
      <div className={styles.list}>
        {entries.map((entry) => {
          const prev = prevMap.get(entry.id);
          const avatarSrc = entry.avatarId ? getAvatarImageUrl(entry.avatarId) : null;
          return (
            <div
              key={entry.id}
              className={styles.row}
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(entry.id, node);
                } else {
                  rowRefs.current.delete(entry.id);
                }
              }}
            >
              <div className={styles.nameRow}>
                <span
                  className={`${styles.avatar} ${entry.frameClass ?? ""}`}
                  style={{ background: avatarColor(entry.avatarId ?? entry.id) }}
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" />
                  ) : (
                    <span>{entry.name.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className={styles.name}>{entry.name}</span>
                {entry.title ? <span className={styles.titleBadge}>{entry.title}</span> : null}
              </div>
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
