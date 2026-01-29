import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface SoundPantomimeViewProps {
  audioSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function SoundPantomimeView({
  audioSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: SoundPantomimeViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={audioSrc} fit="contain" ariaLabel="audio" />
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
