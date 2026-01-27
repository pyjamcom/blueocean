import { useState } from "react";
import styles from "./SeasonSelectView.module.css";

const seasonIcons = [
  { id: "party", color: "#ff6b6b" },
  { id: "summer", color: "#ffd166" },
  { id: "space", color: "#4dabf7" },
  { id: "mystery", color: "#845ef7" },
];

export default function SeasonSelectView() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        {seasonIcons.map((icon) => (
          <button
            key={icon.id}
            className={`${styles.tile} ${selected === icon.id ? styles.tileSelected : ""}`}
            onClick={() => setSelected(icon.id)}
            aria-label={icon.id}
            style={{ backgroundColor: icon.color }}
          />
        ))}
      </div>
    </div>
  );
}
