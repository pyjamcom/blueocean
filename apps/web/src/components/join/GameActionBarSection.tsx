import styles from "./GameActionBarSection.module.css";

type GameActionBarSectionProps = {
  onCreateGame: () => void;
  onJoinGame: () => void;
  onHelp: () => void;
  onLogout: () => void;
  createDisabled?: boolean;
};

export default function GameActionBarSection({
  onCreateGame,
  onJoinGame,
  onHelp,
  onLogout,
  createDisabled = false,
}: GameActionBarSectionProps) {
  return (
    <nav className={styles.container} role="navigation" aria-label="Game actions">
      <div className={styles.row}>
        <button
          type="button"
          className={`${styles.primaryButton} ${styles.createButton}`}
          aria-label="Create game"
          onClick={onCreateGame}
          disabled={createDisabled}
        >
          <img src="/figma/join/106-4243.png" alt="" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`${styles.primaryButton} ${styles.joinButton}`}
          aria-label="Join game"
          onClick={onJoinGame}
        >
          <img src="/figma/join/106-4248.png" alt="" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`${styles.iconButton} ${styles.helpButton}`}
          aria-label="Help"
          onClick={onHelp}
        >
          <img src="/figma/join/106-4254.png" alt="" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`${styles.iconButton} ${styles.logoutButton}`}
          aria-label="Logout"
          onClick={onLogout}
        >
          <img src="/figma/join/106-4257.png" alt="" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
