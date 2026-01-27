import styles from "./HelpButton.module.css";

export default function HelpButton() {
  return (
    <a className={styles.button} href="/support/" target="_blank" rel="noreferrer" aria-label="help">
      <span className={styles.icon} />
    </a>
  );
}
