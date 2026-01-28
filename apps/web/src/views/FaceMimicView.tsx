import AnswerGrid, { AnswerOption } from "../components/AnswerGrid";
import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface FaceMimicViewProps {
  cameraSrc: string;
  overlaySrcs: string[];
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
  onSelect: (index: number) => void;
  selectedIndex?: number | null;
  revealState?: "idle" | "reveal";
  correctIndex?: number | null;
}

export default function FaceMimicView({
  cameraSrc,
  overlaySrcs,
  answers,
  onSelect,
  selectedIndex,
  revealState,
  correctIndex,
}: FaceMimicViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.promptBlock}>
        <PromptImage src={cameraSrc} fit="cover" ariaLabel="camera" />
      </div>
      <div className={styles.overlayRow}>
        {overlaySrcs.map((src, idx) => (
          <div className={styles.overlayTile} key={`${src}-${idx}`}>
            <PromptImage src={src} fit="contain" ariaLabel="overlay" />
          </div>
        ))}
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
