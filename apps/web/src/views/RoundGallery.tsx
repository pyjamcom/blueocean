import { useMemo } from "react";
import { AnswerOption } from "../components/AnswerGrid";
import {
  AbsurdSumView,
  AbsurdToastView,
  DrunkReflexView,
  FaceMimicView,
  IconBattleView,
  SilhouetteGuessView,
  SoundPantomimeView,
  TelepathSyncView,
  TrophyRewardView,
  VisualProvocationView,
} from "./index";
import styles from "./roundViews.module.css";

const sampleSrc = "/icons/icon-192.svg";

function useSampleAnswers(): [AnswerOption, AnswerOption, AnswerOption, AnswerOption] {
  return useMemo(
    () => [
      { id: "a1", src: sampleSrc },
      { id: "a2", src: sampleSrc },
      { id: "a3", src: sampleSrc },
      { id: "a4", src: sampleSrc },
    ],
    [],
  );
}

export default function RoundGallery() {
  const answers = useSampleAnswers();
  const noop = () => {};
  const now = Date.now();

  return (
    <div className={styles.view}>
      <VisualProvocationView
        promptSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <TelepathSyncView
        promptSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <DrunkReflexView
        triggerSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        timerStart={now}
        durationMs={5000}
        revealState="idle"
      />
      <AbsurdSumView
        leftSrc={sampleSrc}
        rightSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <FaceMimicView
        cameraSrc={sampleSrc}
        overlaySrcs={[sampleSrc, sampleSrc]}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <IconBattleView
        leftSrc={sampleSrc}
        rightSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <SoundPantomimeView
        audioSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        timerStart={now}
        durationMs={5000}
        revealState="idle"
      />
      <AbsurdToastView
        moodSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <SilhouetteGuessView
        silhouetteSrc={sampleSrc}
        answers={answers}
        onSelect={noop}
        revealState="idle"
      />
      <TrophyRewardView trophySrc={sampleSrc} />
    </div>
  );
}
