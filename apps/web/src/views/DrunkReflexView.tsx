import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface DrunkReflexViewProps {
  triggerSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function DrunkReflexView({
  triggerSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: DrunkReflexViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={triggerSrc} fit="contain" ariaLabel="trigger" />
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
