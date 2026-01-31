import { useEffect, useState } from "react";
import { playLoop, playOneShot, stopLoop, SFX } from "../utils/sounds";
import { avatarColor, getAvatarImageUrl } from "../utils/avatar";
import styles from "./RahootPodium.module.css";

export interface RahootPodiumEntry {
  id: string;
  name: string;
  points: number;
  avatarId?: string;
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
    stopLoop(SFX.PODIUM_ROLL);
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

  useEffect(() => {
    if (step === 1) {
      playOneShot(SFX.PODIUM_THREE, 0.4);
    }
    if (step === 2) {
      playOneShot(SFX.PODIUM_SECOND, 0.45);
    }
    if (step === 3) {
      playLoop(SFX.PODIUM_ROLL, { volume: 0.3, interrupt: true });
    }
    if (step === 4) {
      stopLoop(SFX.PODIUM_ROLL);
      playOneShot(SFX.PODIUM_FIRST, 0.5);
    }
  }, [step]);

  const first = top[0];
  const second = top[1];
  const third = top[2];

  const renderAvatar = (entry: RahootPodiumEntry) => {
    const src = entry.avatarId ? getAvatarImageUrl(entry.avatarId) : null;
    return (
      <span className={styles.avatar} style={{ background: avatarColor(entry.avatarId ?? entry.id) }}>
        {src ? <img src={src} alt="" /> : <span>{entry.name.charAt(0).toUpperCase()}</span>}
      </span>
    );
  };

  return (
    <section className={styles.wrap}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.podium}>
        {second && (
          <div className={`${styles.place} ${styles.second} ${step >= 2 ? styles.show : ""}`}>
            {renderAvatar(second)}
            <div className={styles.name}>{second.name}</div>
            <div className={styles.block}>
              <div className={styles.medal}>2</div>
              <div className={styles.points}>{second.points}</div>
            </div>
          </div>
        )}
        {first && (
          <div className={`${styles.place} ${styles.first} ${step >= 3 ? styles.show : ""}`}>
            {renderAvatar(first)}
            <div className={styles.name}>{first.name}</div>
            <div className={styles.block}>
              <div className={`${styles.medal} ${styles.medalGold}`}>1</div>
              <div className={styles.points}>{first.points}</div>
            </div>
          </div>
        )}
        {third && (
          <div className={`${styles.place} ${styles.third} ${step >= 1 ? styles.show : ""}`}>
            {renderAvatar(third)}
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
