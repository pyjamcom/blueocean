import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface VisualProvocationViewProps {
  promptSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function VisualProvocationView({
  promptSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: VisualProvocationViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={promptSrc} fit="contain" ariaLabel="prompt" />
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
