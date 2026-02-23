import styles from "./GameActionBarSection.module.css";

type GameActionBarSectionProps = {
  onCreateGame: () => void;
  onJoinGame: () => void;
  onHelp: () => void;
  onLogout: () => void;
  createDisabled?: boolean;
};

function CreateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

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
          <span className={styles.iconWrap}>
            <CreateIcon />
          </span>
          <span>Create game</span>
        </button>

        <button
          type="button"
          className={`${styles.primaryButton} ${styles.joinButton}`}
          aria-label="Join game"
          onClick={onJoinGame}
        >
          <span className={styles.iconWrap}>
            <PlayIcon />
          </span>
          <span>Join game</span>
        </button>

        <button
          type="button"
          className={`${styles.iconButton} ${styles.helpButton}`}
          aria-label="Help"
          onClick={onHelp}
        />

        <button
          type="button"
          className={`${styles.iconButton} ${styles.logoutButton}`}
          aria-label="Logout"
          onClick={onLogout}
        />
      </div>
    </nav>
  );
}
