import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface TelepathSyncViewProps {
  promptSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function TelepathSyncView({
  promptSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: TelepathSyncViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={promptSrc} fit="contain" ariaLabel="sync" />
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
