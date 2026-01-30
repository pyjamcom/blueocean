import { KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./JoinFlow.module.css";

const MAX_CODE_LEN = 6;

function sanitizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_CODE_LEN);
}

export default function JoinPinView() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const handleSubmit = () => {
    const normalized = sanitizeCode(code);
    if (normalized.length < 4) {
      return;
    }
    navigate(`/join/name?code=${normalized}`);
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
          value={code}
          onChange={(event) => setCode(sanitizeCode(event.target.value))}
          onKeyDown={handleKeyDown}
          placeholder="PIN Code here"
          className={styles.input}
          aria-label="pin-code"
        />
        <button type="button" className={styles.button} onClick={handleSubmit}>
          Submit
        </button>
      </div>
    </div>
  );
}
