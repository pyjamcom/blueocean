import styles from "./RahootResult.module.css";

export default function RahootResult({
  correct,
  message,
  points,
  rank,
  aheadOfMe,
}: {
  correct: boolean;
  message: string;
  points: number;
  rank: number | null;
  aheadOfMe?: string | null;
}) {
  return (
    <section className={styles.wrap} aria-live="polite">
      <div className={`${styles.icon} ${correct ? styles.iconOk : styles.iconNo}`}>
        {correct ? "OK" : "X"}
      </div>
      <h2 className={styles.message}>{message}</h2>
      {rank ? (
        <p className={styles.rank}>
          You are top {rank}
          {aheadOfMe ? `, behind ${aheadOfMe}` : ""}
        </p>
      ) : null}
      {correct ? <div className={styles.points}>+{points}</div> : null}
    </section>
  );
}
