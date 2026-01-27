import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface AbsurdToastViewProps {
  moodSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function AbsurdToastView({
  moodSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: AbsurdToastViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={moodSrc} fit="contain" ariaLabel="mood" />
      </div>
      <AnswerGrid
        answers={answers}
        onSelect={onSelect}
        selectedIndex={selectedIndex}
        revealState={revealState}
        correctIndex={correctIndex}
      />
    </div>
  );
}
