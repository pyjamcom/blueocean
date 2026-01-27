import styles from "./NextRoundButton.module.css";

export interface NextRoundButtonProps {
  onClick: () => void;
}

export default function NextRoundButton({ onClick }: NextRoundButtonProps) {
  return (
    <button className={styles.button} onClick={onClick} aria-label="next">
      <span className={styles.icon} />
    </button>
  );
}
