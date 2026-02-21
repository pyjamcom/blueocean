import { useLocation, useNavigate } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import styles from "./HelpButton.module.css";

const HIDDEN_ON_ROUTES = new Set([
  "/join",
  "/lobby",
  "/wait",
  "/game",
  "/leaderboard",
  "/result",
  "/manager",
  "/debug/leaderboard",
  "/debug/podium",
  "/support",
  "/support/",
  "/status",
  "/status/",
]);

export default function HelpButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const { resetRoom } = useRoom();

  if (
    HIDDEN_ON_ROUTES.has(location.pathname) ||
    location.pathname.startsWith("/legal")
  ) {
    return null;
  }

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
