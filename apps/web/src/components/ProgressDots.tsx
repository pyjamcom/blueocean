import styles from "./ProgressDots.module.css";

export interface ProgressDotsProps {
  total: number;
  activeIndex: number;
}

export default function ProgressDots({ total, activeIndex }: ProgressDotsProps) {
  return (
    <div className={styles.wrap}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={`dot-${index}`}
          className={`${styles.dot} ${index === activeIndex ? styles.dotActive : ""}`}
          aria-label={`dot-${index}`}
        />
      ))}
    </div>
  );
}
