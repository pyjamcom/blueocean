import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../utils/analytics";
import styles from "./AnswerGrid.module.css";

export type RevealState = "idle" | "reveal";

export interface AnswerOption {
  id: string;
  src: string;
  alt?: string;
}

export interface AnswerGridProps {
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: RevealState;
  locked?: boolean;
  correctIndex?: number | null;
  shuffleHint?: boolean;
}

export default function AnswerGrid({
  answers,
  onSelect,
  selectedIndex,
  revealState = "idle",
  locked = false,
  correctIndex,
  shuffleHint = false,
}: AnswerGridProps) {
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const [autoShuffle, setAutoShuffle] = useState(false);
  const didVibrateReveal = useRef(false);
  const shuffleTimer = useRef<number | null>(null);

  const lockInput = () => locked || selectedIndex !== null && selectedIndex !== undefined;

  const handleSelect = (index: number) => {
    if (lockInput()) {
      return;
    }
    if (navigator.vibrate) {
      navigator.vibrate(20);
    }
    trackEvent("answer_select", { index });
    onSelect(index);
  };

  const revealCorrect = (index: number) => revealState === "reveal" && correctIndex === index;

  useEffect(() => {
    if (revealState === "reveal" && selectedIndex === correctIndex && !didVibrateReveal.current) {
      if (navigator.vibrate) {
        navigator.vibrate([30, 30, 30]);
      }
      didVibrateReveal.current = true;
    }
    if (revealState !== "reveal") {
      didVibrateReveal.current = false;
    }
  }, [revealState, selectedIndex, correctIndex]);

  useEffect(() => {
    if (shuffleTimer.current) {
      window.clearTimeout(shuffleTimer.current);
    }
    setAutoShuffle(true);
    shuffleTimer.current = window.setTimeout(() => setAutoShuffle(false), 700);
    return () => {
      if (shuffleTimer.current) {
        window.clearTimeout(shuffleTimer.current);
      }
    };
  }, [answers]);

  const tiles = useMemo(() => {
    return answers.map((answer, index) => {
      const isSelected = selectedIndex === index;
      const isCorrect = revealCorrect(index);
      const isWrong = revealState === "reveal" && isSelected && correctIndex !== index;
      const isLocked = locked || revealState === "reveal";

      const className = [
        "answer-tile",
        styles.tile,
        isSelected ? "answer-tile--selected" : "",
        isCorrect ? "answer-tile--correct" : "",
        isWrong ? "answer-tile--wrong" : "",
        isLocked ? "answer-tile--locked" : "",
        isSelected ? styles.tileSelected : "",
        isCorrect ? styles.tileCorrect : "",
        isWrong ? styles.tileWrong : "",
        isLocked ? styles.tileLocked : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <button
          key={answer.id}
          className={className}
          onPointerDown={() => setPressedIndex(index)}
          onPointerUp={() => setPressedIndex(null)}
          onClick={() => handleSelect(index)}
          aria-label={answer.alt ?? ""}
          disabled={isLocked}
        >
          <img src={answer.src} alt="" draggable={false} />
          {pressedIndex === index && <span className={styles.pressHalo} />}
        </button>
      );
    });
  }, [answers, correctIndex, handleSelect, locked, pressedIndex, revealState, selectedIndex]);

  const showShuffle = shuffleHint || autoShuffle;

  return (
    <div
      className={`answer-grid ${styles.grid} ${
        showShuffle ? `answer-grid--shuffle ${styles.gridShuffle}` : ""
      }`}
    >
      {tiles}
    </div>
  );
}
