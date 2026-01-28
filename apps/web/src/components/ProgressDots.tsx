import styles from "./ProgressDots.module.css";

export interface ProgressDotsProps {
  total: number;
  activeIndex: number;
}

export default function ProgressDots({ total, activeIndex }: ProgressDotsProps) {
  const safeTotal = Math.max(1, total);
  const displayTotal = Math.min(12, Math.max(8, safeTotal));
  const maxIndex = Math.max(1, safeTotal - 1);
  const displayIndex = Math.min(
    displayTotal - 1,
    Math.max(0, Math.floor((activeIndex / maxIndex) * (displayTotal - 1))),
  );
  return (
    <div className={styles.wrap}>
      {Array.from({ length: displayTotal }).map((_, index) => (
        <span
          key={`dot-${index}`}
          className={`${styles.dot} ${index === displayIndex ? styles.dotActive : ""}`}
          aria-label={`dot-${index}`}
        />
      ))}
    </div>
  );
}
