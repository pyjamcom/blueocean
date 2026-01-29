import { useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import styles from "./HelpButton.module.css";

export default function HelpButton() {
  const navigate = useNavigate();
  const { resetRoom } = useRoom();

  const handleExit = () => {
    resetRoom();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("escapers_host_wait");
    }
    navigate("/join", { replace: true });
  };

  return (
    <div className={styles.wrap}>
      <a className={`${styles.button} ${styles.support}`} href="/support/" target="_blank" rel="noreferrer" aria-label="support">
        <span className={styles.icon} />
      </a>
      <button type="button" className={`${styles.button} ${styles.exit}`} onClick={handleExit} aria-label="exit">
        <span className={styles.exitIcon} />
      </button>
    </div>
  );
}
