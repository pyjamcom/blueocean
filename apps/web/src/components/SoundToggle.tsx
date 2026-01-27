import styles from "./SoundToggle.module.css";

export interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export default function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  return (
    <button
      className={`${styles.button} ${enabled ? styles.enabled : styles.muted}`}
      onClick={onToggle}
      aria-label="sound"
    >
      <span className={styles.icon} />
    </button>
  );
}
