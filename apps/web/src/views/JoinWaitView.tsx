import styles from "./JoinWaitView.module.css";

export default function JoinWaitView() {
  return (
    <div className={styles.wrap}>
      <div className={styles.orbit}>
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={`orb-${index}`} className={styles.orb} />
        ))}
      </div>
      <div className={styles.caption}>Wait</div>
    </div>
  );
}
