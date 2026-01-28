import { useEffect, useMemo, useState } from "react";
import { AnswerOption } from "../components/AnswerGrid";
import ProgressDots from "../components/ProgressDots";
import { useRoom } from "../context/RoomContext";
import { prefetchImage } from "../utils/prefetch";
import { questionBank, QuestionRecord } from "../data/questions";
import { resolveAssetRef } from "../utils/assets";
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

const fallbackSrc = "/icons/icon-192.svg";

function buildAnswers(question: QuestionRecord): [AnswerOption, AnswerOption, AnswerOption, AnswerOption] {
  const answers = question.answers.map((answer) => ({
    id: answer.id,
    src: resolveAssetRef(answer.image_url ?? answer.asset_id ?? "", fallbackSrc),
  }));
  while (answers.length < 4) {
    answers.push({ id: `f-${answers.length}`, src: fallbackSrc });
  }
  return answers.slice(0, 4) as [AnswerOption, AnswerOption, AnswerOption, AnswerOption];
}

function renderQuestionView(
  question: QuestionRecord,
  answers: [AnswerOption, AnswerOption, AnswerOption, AnswerOption],
  now: number,
  onSelect: (index: number) => void,
  selectedIndex: number | null,
  revealState: "idle" | "reveal",
) {
  const baseProps = {
    answers,
    onSelect,
    selectedIndex,
    revealState,
    correctIndex: question.correct_index,
  };
  const promptSrc = resolveAssetRef(question.prompt_image, fallbackSrc);

  switch (question.category) {
    case "telepath_sync":
      return <TelepathSyncView promptSrc={promptSrc} {...baseProps} />;
    case "drunk_reflex":
      return (
        <DrunkReflexView
          triggerSrc={resolveAssetRef(question.trigger_asset_id ?? question.prompt_image, fallbackSrc)}
          timerStart={now}
          durationMs={question.duration_ms}
          {...baseProps}
        />
      );
    case "absurd_sum": {
      const [leftId, rightId] = question.prompt_pair_ids ?? [question.prompt_image, question.prompt_image];
      return (
        <AbsurdSumView
          leftSrc={resolveAssetRef(leftId, fallbackSrc)}
          rightSrc={resolveAssetRef(rightId, fallbackSrc)}
          {...baseProps}
        />
      );
    }
    case "face_mimic": {
      const overlaySrcs = (question.face_overlay_ids ?? [question.prompt_image]).map((id) =>
        resolveAssetRef(id, fallbackSrc),
      );
      return (
        <FaceMimicView
          cameraSrc={promptSrc}
          overlaySrcs={overlaySrcs}
          {...baseProps}
        />
      );
    }
    case "icon_battle": {
      const [leftId, rightId] = question.battle_pair_ids ?? [question.prompt_image, question.prompt_image];
      return (
        <IconBattleView
          leftSrc={resolveAssetRef(leftId, fallbackSrc)}
          rightSrc={resolveAssetRef(rightId, fallbackSrc)}
          {...baseProps}
        />
      );
    }
    case "sound_pantomime":
      return (
        <SoundPantomimeView
          audioSrc={resolveAssetRef(question.audio_asset_id ?? question.prompt_image, fallbackSrc)}
          timerStart={now}
          durationMs={question.duration_ms}
          {...baseProps}
        />
      );
    case "absurd_toast":
      return <AbsurdToastView moodSrc={promptSrc} {...baseProps} />;
    case "silhouette_guess":
      return (
        <SilhouetteGuessView
          silhouetteSrc={resolveAssetRef(question.silhouette_base_id ?? question.prompt_image, fallbackSrc)}
          {...baseProps}
        />
      );
    case "trophy_rewards":
      return (
        <TrophyRewardView
          trophySrc={resolveAssetRef(question.trophy_stamp_id ?? question.prompt_image, fallbackSrc)}
        />
      );
    case "visual_provocation":
    default:
      return <VisualProvocationView promptSrc={promptSrc} {...baseProps} />;
  }
}

export default function RoundGallery() {
  const { phase, questionIndex, roundStartAt, sendAnswer } = useRoom();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeQuestion = questionBank[questionIndex];
  const revealState = phase === "reveal" ? "reveal" : "idle";
  const now = useMemo(() => roundStartAt ?? Date.now(), [roundStartAt]);
  const instruction = phase === "round" ? "Tap" : "Wait";

  useEffect(() => {
    setSelectedIndex(null);
  }, [questionIndex, phase]);

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    sendAnswer(index);
  };

  const answers = useMemo(
    () => (activeQuestion ? buildAnswers(activeQuestion) : buildAnswers({
      id: "fallback",
      category: "visual_provocation",
      prompt_image: fallbackSrc,
      answers: [],
      correct_index: 0,
      duration_ms: 6000,
    })),
    [activeQuestion],
  );

  useEffect(() => {
    if (!activeQuestion) {
      prefetchImage(fallbackSrc);
      return;
    }
    const assetsToPrefetch = [
      resolveAssetRef(activeQuestion.prompt_image, fallbackSrc),
      ...answers.map((answer) => answer.src),
    ];
    assetsToPrefetch.forEach((src) => prefetchImage(src));
  }, [activeQuestion, answers]);

  return (
    <div className={styles.view}>
      <ProgressDots total={Math.max(questionBank.length, 1)} activeIndex={questionIndex} />
      <div className={styles.card}>
        {activeQuestion
          ? renderQuestionView(activeQuestion, answers, now, handleSelect, selectedIndex, revealState)
          : null}
      </div>
      <div className={styles.hintRow}>
        <span className={`${styles.hintChip} ${styles.hintTap}`} />
        <span className={`${styles.hintChip} ${styles.hintTimer}`} />
      </div>
      <div className={styles.instruction}>{instruction}</div>
    </div>
  );
}
