import styles from "./AgeGate.module.css";

export type AgeGateStatus = "prompt" | "blocked";

export interface AgeGateProps {
  status: AgeGateStatus;
  onAccept: () => void;
  onReject: () => void;
  onBackToPrompt: () => void;
  onExit: () => void;
}

export default function AgeGate({
  status,
  onAccept,
  onReject,
  onBackToPrompt,
  onExit,
}: AgeGateProps) {
  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.card}>
        {status === "prompt" ? (
          <>
            <h2 className={styles.title}>Are you 11 yet?</h2>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={onAccept} aria-label="age-accept">
                Yes, i am 11
              </button>
              <button type="button" className={styles.primaryWide} onClick={onReject} aria-label="age-reject">
                No, i am not 11
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.titleWide}>Are you sure you want to exit?</h2>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={onBackToPrompt}
                aria-label="cancel-exit"
              >
                Cancel
              </button>
              <button type="button" className={styles.primary} onClick={onExit} aria-label="exit">
                Stay
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
