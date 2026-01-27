import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import TimerRing from "../components/TimerRing";
import styles from "./roundViews.module.css";

export interface DrunkReflexViewProps {
  triggerSrc: string;
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
  timerStart: number;
  durationMs: number;
}

export default function DrunkReflexView({
  triggerSrc,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
  timerStart,
  durationMs,
}: DrunkReflexViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={triggerSrc} fit="contain" ariaLabel="trigger" />
      </div>
      <TimerRing durationMs={durationMs} startAt={timerStart} size={84} />
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
