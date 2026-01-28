import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface IconBattleViewProps {
  leftSrc: string;
  rightSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function IconBattleView({
  leftSrc,
  rightSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: IconBattleViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.doublePrompt}>
        <div className={styles.promptCell}>
          <PromptImage src={leftSrc} fit="contain" ariaLabel="left" />
        </div>
        <div className={styles.promptCell}>
          <PromptImage src={rightSrc} fit="contain" ariaLabel="right" />
        </div>
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
