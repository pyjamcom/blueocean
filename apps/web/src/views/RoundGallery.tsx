import { useEffect, useMemo } from "react";
import { AnswerOption } from "../components/AnswerGrid";
import ProgressDots from "../components/ProgressDots";
import { shuffleArray } from "../utils/shuffle";
import { prefetchImage } from "../utils/prefetch";
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
  const baseAnswers = useSampleAnswers();
  const answers = useMemo(() => shuffleArray(baseAnswers), [baseAnswers]);
  const noop = () => {};
  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    prefetchImage(sampleSrc);
  }, []);

  const viewSequence = useMemo(
    () =>
      shuffleArray([
        {
          key: "visual",
          element: (
            <VisualProvocationView
              promptSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        {
          key: "telepath",
          element: (
            <TelepathSyncView
              promptSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        {
          key: "reflex",
          element: (
            <DrunkReflexView
              triggerSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              timerStart={now}
              durationMs={5000}
              revealState="idle"
            />
          ),
        },
        {
          key: "absurd-sum",
          element: (
            <AbsurdSumView
              leftSrc={sampleSrc}
              rightSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        {
          key: "mimic",
          element: (
            <FaceMimicView
              cameraSrc={sampleSrc}
              overlaySrcs={[sampleSrc, sampleSrc]}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        {
          key: "icon-battle",
          element: (
            <IconBattleView
              leftSrc={sampleSrc}
              rightSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        {
          key: "sound",
          element: (
            <SoundPantomimeView
              audioSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              timerStart={now}
              durationMs={5000}
              revealState="idle"
            />
          ),
        },
        {
          key: "toast",
          element: (
            <AbsurdToastView
              moodSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        {
          key: "silhouette",
          element: (
            <SilhouetteGuessView
              silhouetteSrc={sampleSrc}
              answers={answers}
              onSelect={noop}
              revealState="idle"
            />
          ),
        },
        { key: "trophy", element: <TrophyRewardView trophySrc={sampleSrc} /> },
      ]),
    [answers, now],
  );

  return (
    <div className={styles.view}>
      <ProgressDots total={10} activeIndex={3} />
      {viewSequence.map((view) => (
        <div key={view.key} className={styles.card}>{view.element}</div>
      ))}
    </div>
  );
}
