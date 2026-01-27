import styles from "./AgeGate.module.css";

export type AgeGateStatus = "prompt" | "blocked";

export interface AgeGateProps {
  status: AgeGateStatus;
  onAccept: () => void;
  onReject: () => void;
  onExit: () => void;
}

export default function AgeGate({ status, onAccept, onReject, onExit }: AgeGateProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {status === "prompt" ? (
          <div className={styles.actions}>
            <button className={styles.accept} onClick={onAccept} aria-label="age-accept">
              <span className={styles.badge} />
              <span className={styles.check} />
            </button>
            <button className={styles.reject} onClick={onReject} aria-label="age-reject">
              <span className={styles.stop} />
            </button>
          </div>
        ) : (
          <div className={styles.blocked}>
            <div className={styles.stopLarge} />
            <button className={styles.exit} onClick={onExit} aria-label="exit" />
          </div>
        )}
      </div>
    </div>
  );
}
