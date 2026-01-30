import { useEffect, useState } from "react";
import styles from "./RahootPodium.module.css";

export interface RahootPodiumEntry {
  id: string;
  name: string;
  points: number;
}

export default function RahootPodium({
  title = "Final",
  top,
}: {
  title?: string;
  top: RahootPodiumEntry[];
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const timer = window.setInterval(() => {
      setStep((prev) => {
        if (prev >= 4) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 1600);
    return () => window.clearInterval(timer);
  }, [top]);

  const first = top[0];
  const second = top[1];
  const third = top[2];

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.podium}>
        {second && (
          <div className={`${styles.place} ${styles.second} ${step >= 2 ? styles.show : ""}`}>
            <div className={styles.name}>{second.name}</div>
            <div className={styles.block}>
              <div className={styles.medal}>2</div>
              <div className={styles.points}>{second.points}</div>
            </div>
          </div>
        )}
        {first && (
          <div className={`${styles.place} ${styles.first} ${step >= 3 ? styles.show : ""}`}>
            <div className={styles.name}>{first.name}</div>
            <div className={styles.block}>
              <div className={`${styles.medal} ${styles.medalGold}`}>1</div>
              <div className={styles.points}>{first.points}</div>
            </div>
          </div>
        )}
        {third && (
          <div className={`${styles.place} ${styles.third} ${step >= 1 ? styles.show : ""}`}>
            <div className={styles.name}>{third.name}</div>
            <div className={styles.block}>
              <div className={`${styles.medal} ${styles.medalBronze}`}>3</div>
              <div className={styles.points}>{third.points}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
