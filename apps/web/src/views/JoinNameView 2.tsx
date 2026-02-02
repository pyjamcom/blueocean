import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useRoom } from "../context/RoomContext";
import { getStoredAvatarId, randomAvatarId, setStoredAvatarId } from "../utils/avatar";
import { getStoredPlayerName, setStoredPlayerName } from "../utils/playerName";
import styles from "./JoinFlow.module.css";

function useJoinCode() {
  const location = useLocation();
  const { code: codeFromPath } = useParams<{ code?: string }>();
  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("code") ?? codeFromPath ?? "";
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    return code || null;
  }, [codeFromPath, location.search]);
}

export default function JoinNameView() {
  const navigate = useNavigate();
  const joinCode = useJoinCode();
  const { joinRoom } = useRoom();
  const [name, setName] = useState(() => getStoredPlayerName());

  useEffect(() => {
    if (!joinCode) {
      navigate("/join", { replace: true });
    }
  }, [joinCode, navigate]);

  const handleSubmit = () => {
    if (!joinCode) {
      return;
    }
    const safeName = name.trim().slice(0, 18);
    if (!safeName) {
      return;
    }
    const avatarId = getStoredAvatarId() ?? randomAvatarId();
    setStoredAvatarId(avatarId);
    setStoredPlayerName(safeName);
    joinRoom(joinCode, avatarId, safeName);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Username here"
          className={styles.input}
          aria-label="username"
        />
        <button type="button" className={styles.button} onClick={handleSubmit}>
          Submit
        </button>
      </div>
    </div>
  );
}
