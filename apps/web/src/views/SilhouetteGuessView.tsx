import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface SilhouetteGuessViewProps {
  silhouetteSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function SilhouetteGuessView({
  silhouetteSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: SilhouetteGuessViewProps) {
  return (
    <div className={styles.view}>
      <div className={`${styles.promptBlock} ${styles.silhouette}`}>
        <PromptImage src={silhouetteSrc} fit="contain" ariaLabel="silhouette" />
      </div>
      <div className={styles.answerBlock}>
        <AnswerGrid
          answers={answers}
          onSelect={onSelect}
          selectedIndex={selectedIndex}
          revealState={revealState}
          correctIndex={correctIndex}
        />
      </div>
    </div>
  );
}
