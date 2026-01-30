import { useEffect, useMemo, useState } from "react";
import { AnswerOption } from "../components/AnswerGrid";
import ProgressDots from "../components/ProgressDots";
import TimerRing from "../components/TimerRing";
import { useRoom } from "../context/RoomContext";
import { prefetchImage } from "../utils/prefetch";
import { questionBank, QuestionRecord } from "../data/questions";
import { resolveAssetRef } from "../utils/assets";
import { playTap } from "../utils/sfx";
import { mapStageToQuestionIndex, shuffleQuestionAnswers } from "../utils/questionShuffle";
import RahootResult from "../components/RahootResult";
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
const MAX_QUESTIONS = Math.min(15, questionBank.length);
const PREPARE_DURATION_MS = 3000;

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
  const { phase, questionIndex, roundStartAt, sendAnswer, roomCode, currentQuestion, players, playerId, lastSelfPoints } = useRoom();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const resolvedIndex = mapStageToQuestionIndex(roomCode, questionIndex, questionBank.length);
  const baseQuestion = questionBank[resolvedIndex];
  const activeQuestion = useMemo(() => {
    if (currentQuestion) {
      if (typeof currentQuestion.questionIndex !== "number" || currentQuestion.questionIndex === questionIndex) {
        return currentQuestion;
      }
    }
    return baseQuestion ? shuffleQuestionAnswers(baseQuestion, roomCode, questionIndex) : undefined;
  }, [baseQuestion, currentQuestion, questionIndex, roomCode]);
  const revealState = phase === "reveal" ? "reveal" : "idle";
  const timerStartAt = useMemo(() => roundStartAt ?? Date.now(), [roundStartAt, questionIndex, phase]);
  const durationMs = activeQuestion?.duration_ms ?? 10000;
  const [secondsLeft, setSecondsLeft] = useState<number>(Math.ceil(durationMs / 1000));
  const [prepareSecondsLeft, setPrepareSecondsLeft] = useState<number>(0);
  const prepareTotalSeconds = Math.ceil(PREPARE_DURATION_MS / 1000);
  const showPrepare = phase === "prepared";
  const prepareDisplay = Math.max(1, prepareSecondsLeft);
  const prepareRotation = 45 * (prepareTotalSeconds - prepareDisplay);

  useEffect(() => {
    setSelectedIndex(null);
  }, [questionIndex]);

  useEffect(() => {
    if (phase !== "round") {
      setSecondsLeft(0);
      return;
    }
    const startAt = timerStartAt;
    const tick = () => {
      const remaining = Math.max(0, durationMs - (Date.now() - startAt));
      setSecondsLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [durationMs, phase, timerStartAt]);

  useEffect(() => {
    if (phase !== "prepared") {
      setPrepareSecondsLeft(0);
      return;
    }
    const startAt = roundStartAt ?? Date.now() + PREPARE_DURATION_MS;
    const tick = () => {
      const remaining = Math.max(0, startAt - Date.now());
      setPrepareSecondsLeft(Math.ceil(remaining / 1000));
    };
    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [phase, roundStartAt]);

  const handleSelect = (index: number) => {
    if (phase !== "round") {
      return;
    }
    setSelectedIndex(index);
    playTap();
    sendAnswer(index);
  };

  const answers = useMemo(
    () => (activeQuestion
      ? buildAnswers(activeQuestion)
      : buildAnswers({
          id: "fallback",
          category: "visual_provocation",
          prompt_image: fallbackSrc,
          answers: [],
          correct_index: 0,
          duration_ms: 10000,
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

  const correctIndex = activeQuestion?.correct_index ?? 0;
  const hasAnswer = selectedIndex !== null;
  const isCorrect = hasAnswer && selectedIndex === correctIndex;
  const revealMessage = !hasAnswer ? "No answer" : isCorrect ? "Correct!" : "Wrong!";
  const revealIcon = !hasAnswer ? "?" : isCorrect ? "OK" : "X";
  const revealClass = isCorrect
    ? styles.revealCorrect
    : hasAnswer
      ? styles.revealWrong
      : styles.revealNeutral;
  const questionLabel = `${Math.min(questionIndex + 1, MAX_QUESTIONS)}/${MAX_QUESTIONS}`;
  const leaderboard = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const selfEntry = leaderboard.find((entry) => entry.id === playerId) ?? null;
  const selfRank = selfEntry ? leaderboard.findIndex((entry) => entry.id === playerId) + 1 : null;
  const aheadOfMe = selfRank && selfRank > 1 ? leaderboard[selfRank - 2]?.name ?? null : null;

  return (
    <div className={`${styles.shell} ${styles.gameTheme}`}>
      {showPrepare && (
        <div className={styles.prepOverlay} aria-live="polite">
          <div className={styles.prepContent}>
            <div className={styles.prepTitle}>Get ready</div>
            <div className={styles.prepCountdown}>
              <div
                className={styles.prepShape}
                style={{ transform: `rotate(${prepareRotation}deg)` }}
              />
              <div className={styles.prepNumber}>{prepareDisplay}</div>
            </div>
            <div className={styles.prepHint}>
              Round {Math.min(questionIndex + 1, MAX_QUESTIONS)}
            </div>
          </div>
        </div>
      )}
      <div className={styles.headerRow}>
        <div className={styles.questionBadge} aria-label="question-count">
          {questionLabel}
        </div>
        <ProgressDots total={Math.max(MAX_QUESTIONS, 1)} activeIndex={questionIndex} />
        {phase === "prepared" && (
          <div className={styles.timerStack}>
            <TimerRing
              durationMs={PREPARE_DURATION_MS}
              startAt={(roundStartAt ?? Date.now() + PREPARE_DURATION_MS) - PREPARE_DURATION_MS}
              size={64}
              strokeWidth={6}
            />
            <div className={styles.prepBadge}>{prepareSecondsLeft}</div>
          </div>
        )}
        {phase === "round" && (
          <div className={styles.timerStack}>
            <TimerRing durationMs={durationMs} startAt={timerStartAt} size={64} strokeWidth={6} />
            <div className={styles.timerBadge}>{secondsLeft}</div>
          </div>
        )}
      </div>
      <div className={styles.card}>
        {phase === "reveal" && (
          <RahootResult
            correct={hasAnswer ? isCorrect : false}
            message={revealMessage}
            points={hasAnswer && isCorrect ? lastSelfPoints : 0}
            rank={selfRank}
            aheadOfMe={aheadOfMe}
          />
        )}
        {phase === "reveal" && (
          <div className={`${styles.revealBanner} ${revealClass}`}>
            <span className={styles.revealIcon}>{revealIcon}</span>
            <span className={styles.revealText}>{revealMessage}</span>
          </div>
        )}
        {activeQuestion
          ? renderQuestionView(activeQuestion, answers, handleSelect, selectedIndex, revealState)
          : null}
      </div>
    </div>
  );
}
