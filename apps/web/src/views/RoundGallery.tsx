import { ElementType, useEffect, useMemo, useState } from "react";
import { AnswerOption } from "../components/AnswerGrid";
import { useRoom } from "../context/RoomContext";
import { questionBank, QuestionRecord } from "../data/questions";
import { resolveAssetRef } from "../utils/assets";
import { mapStageToQuestionIndex, shuffleQuestionAnswers } from "../utils/questionShuffle";
import { prefetchImage } from "../utils/prefetch";
import { playTap } from "../utils/sfx";
import Triangle from "../components/rahoot/icons/Triangle";
import Rhombus from "../components/rahoot/icons/Rhombus";
import Circle from "../components/rahoot/icons/Circle";
import Square from "../components/rahoot/icons/Square";
import CricleCheck from "../components/rahoot/icons/CricleCheck";
import CricleXmark from "../components/rahoot/icons/CricleXmark";
import background from "../assets/rahoot/background.webp";
import loader from "../assets/rahoot/loader.svg";
import styles from "./rahootGame.module.css";

const fallbackSrc = "/icons/icon-192.svg";
const MAX_QUESTIONS = Math.min(15, questionBank.length);
const ANSWER_ICONS: ElementType[] = [Triangle, Rhombus, Circle, Square];
const ANSWER_COLORS = [
  styles.answerRed,
  styles.answerBlue,
  styles.answerYellow,
  styles.answerGreen,
];

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

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export default function RoundGallery() {
  const {
    phase,
    questionIndex,
    roundStartAt,
    sendAnswer,
    roomCode,
    currentQuestion,
    players,
    playerId,
    lastSelfPoints,
    answerCounts,
    wsStatus,
  } = useRoom();
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
  const durationMs = activeQuestion?.duration_ms ?? 10000;
  const timerStartAt = useMemo(() => roundStartAt ?? Date.now(), [roundStartAt, questionIndex, phase]);
  const [secondsLeft, setSecondsLeft] = useState<number>(Math.ceil(durationMs / 1000));

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
    const extraPromptIds = [
      ...(activeQuestion.prompt_pair_ids ?? []),
      ...(activeQuestion.battle_pair_ids ?? []),
      ...(activeQuestion.face_overlay_ids ?? []),
      activeQuestion.silhouette_base_id,
      activeQuestion.trophy_stamp_id,
      activeQuestion.trigger_asset_id,
    ].filter(Boolean) as string[];
    const extraPromptAssets = extraPromptIds.map((id) => resolveAssetRef(id, fallbackSrc));
    const assetsToPrefetch = [
      resolveAssetRef(activeQuestion.prompt_image, fallbackSrc),
      ...answers.map((answer) => answer.src),
      ...extraPromptAssets,
    ];
    assetsToPrefetch.forEach((src) => prefetchImage(src));
  }, [activeQuestion, answers]);

  const correctIndex = activeQuestion?.correct_index ?? 0;
  const hasAnswer = selectedIndex !== null;
  const isCorrect = hasAnswer && selectedIndex === correctIndex;
  const revealMessage = !hasAnswer ? "No answer" : isCorrect ? "Correct!" : "Wrong!";
  const questionLabel = `${Math.min(questionIndex + 1, MAX_QUESTIONS)} / ${MAX_QUESTIONS}`;
  const leaderboard = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const selfEntry = leaderboard.find((entry) => entry.id === playerId) ?? null;
  const selfRank = selfEntry ? leaderboard.findIndex((entry) => entry.id === playerId) + 1 : null;
  const aheadOfMe = selfRank && selfRank > 1 ? leaderboard[selfRank - 2]?.name ?? null : null;
  const totalAnswered = answerCounts.reduce((sum, count) => sum + count, 0);

  const questionTitle = activeQuestion?.humor_tag
    ? titleCase(activeQuestion.humor_tag)
    : activeQuestion?.category
      ? titleCase(activeQuestion.category)
      : `Question ${Math.min(questionIndex + 1, MAX_QUESTIONS)}`;

  const promptSrc = activeQuestion ? resolveAssetRef(activeQuestion.prompt_image, fallbackSrc) : fallbackSrc;
  const renderPrompt = () => {
    if (!activeQuestion) {
      return null;
    }

    switch (activeQuestion.category) {
      case "absurd_sum": {
        const [leftId, rightId] = activeQuestion.prompt_pair_ids ?? [
          activeQuestion.prompt_image,
          activeQuestion.prompt_image,
        ];
        return (
          <div className={styles.promptPair}>
            <img
              alt={questionTitle}
              src={resolveAssetRef(leftId, fallbackSrc)}
              className={styles.pairImage}
            />
            <span className={styles.promptSymbol}>+</span>
            <img
              alt={questionTitle}
              src={resolveAssetRef(rightId, fallbackSrc)}
              className={styles.pairImage}
            />
          </div>
        );
      }
      case "icon_battle": {
        const [leftId, rightId] = activeQuestion.battle_pair_ids ?? [
          activeQuestion.prompt_image,
          activeQuestion.prompt_image,
        ];
        return (
          <div className={styles.promptPair}>
            <img
              alt={questionTitle}
              src={resolveAssetRef(leftId, fallbackSrc)}
              className={styles.pairImage}
            />
            <span className={styles.promptSymbol}>VS</span>
            <img
              alt={questionTitle}
              src={resolveAssetRef(rightId, fallbackSrc)}
              className={styles.pairImage}
            />
          </div>
        );
      }
      case "sound_pantomime": {
        const audioSrc = resolveAssetRef(activeQuestion.audio_asset_id ?? activeQuestion.prompt_image, fallbackSrc);
        return (
          <audio className={styles.audioPlayer} controls src={audioSrc}>
            Your browser does not support the audio element.
          </audio>
        );
      }
      case "face_mimic": {
        const overlaySrcs = (activeQuestion.face_overlay_ids ?? []).map((id) =>
          resolveAssetRef(id, fallbackSrc),
        );
        return (
          <div className={styles.overlayStack}>
            <img alt={questionTitle} src={promptSrc} className={styles.questionImage} />
            {overlaySrcs.map((src, index) => (
              <img key={`${src}-${index}`} alt=\"\" src={src} className={styles.overlayImage} />
            ))}
          </div>
        );
      }
      case "drunk_reflex": {
        const triggerSrc = resolveAssetRef(activeQuestion.trigger_asset_id ?? activeQuestion.prompt_image, fallbackSrc);
        return <img alt={questionTitle} src={triggerSrc} className={styles.questionImage} />;
      }
      case "silhouette_guess": {
        const silhouetteSrc = resolveAssetRef(
          activeQuestion.silhouette_base_id ?? activeQuestion.prompt_image,
          fallbackSrc,
        );
        return <img alt={questionTitle} src={silhouetteSrc} className={styles.questionImage} />;
      }
      case "trophy_rewards": {
        const trophySrc = resolveAssetRef(activeQuestion.trophy_stamp_id ?? activeQuestion.prompt_image, fallbackSrc);
        return <img alt={questionTitle} src={trophySrc} className={styles.questionImage} />;
      }
      default:
        return (
          <img
            alt={questionTitle}
            src={promptSrc}
            className={styles.questionImage}
          />
        );
    }
  };

  const handleSelect = (index: number) => {
    if (phase !== "round" || selectedIndex !== null) {
      return;
    }
    setSelectedIndex(index);
    playTap();
    sendAnswer(index);
  };

  const showWait = wsStatus !== "open" || phase === "join" || phase === "lobby";
  const showPrepared = phase === "prepared";
  const showRound = phase === "round";
  const showReveal = phase === "reveal";

  return (
    <section className={styles.root}>
      <div className={styles.background} aria-hidden="true">
        <img className={styles.backgroundImage} src={background} alt="" />
      </div>

      <div className={styles.topBar}>
        <div className={styles.questionBadge}>{questionLabel}</div>
        <div />
      </div>

      {showWait && (
        <section className={styles.centerWrap}>
          <img className={styles.loader} src={loader} alt="loader" />
          <h2 className={styles.waitTitle}>
            {wsStatus !== "open" ? "Connecting..." : "Waiting for the host"}
          </h2>
        </section>
      )}

      {showPrepared && (
        <section className={`${styles.centerWrap} ${styles.animShow}`}>
          <h2 className={`${styles.preparedTitle} ${styles.animShow}`}>
            Question #{Math.min(questionIndex + 1, MAX_QUESTIONS)}
          </h2>
          <div className={`${styles.preparedGrid} ${styles.animQuizz}`}>
            {[...Array(4)].map((_, index) => {
              const Icon = ANSWER_ICONS[index];
              return (
                <div
                  key={index}
                  className={`${styles.quizButton} ${ANSWER_COLORS[index]}`}
                >
                  <Icon className={styles.preparedIcon} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showRound && (
        <div className={styles.answersWrap}>
          <div className={styles.questionBlock}>
            <h2 className={styles.questionTitle}>{questionTitle}</h2>
            {renderPrompt()}
          </div>

          <div>
            <div className={styles.statsRow}>
              <div className={styles.statPill}>
                <span className={styles.statLabel}>Time</span>
                <span>{secondsLeft}</span>
              </div>
              <div className={styles.statPill}>
                <span className={styles.statLabel}>Answers</span>
                <span>
                  {totalAnswered}/{players.length}
                </span>
              </div>
            </div>

            <div className={styles.answersGrid}>
              {answers.map((answer, index) => {
                const Icon = ANSWER_ICONS[index];
                return (
                  <button
                    key={answer.id}
                    className={`${styles.answerButton} ${ANSWER_COLORS[index]}`}
                    onClick={() => handleSelect(index)}
                    disabled={selectedIndex !== null}
                  >
                    <Icon className={styles.answerIcon} />
                    <span className={styles.answerLabel}>
                      <img
                        className={styles.answerMedia}
                        src={answer.src}
                        alt={`Answer ${index + 1}`}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showReveal && (
        <section className={`${styles.centerWrap} ${styles.animShow}`}>
          {isCorrect ? (
            <CricleCheck className={styles.resultIcon} />
          ) : (
            <CricleXmark className={styles.resultIcon} />
          )}
          <h2 className={styles.resultMessage}>{revealMessage}</h2>
          {selfRank ? (
            <p className={styles.resultRank}>
              You are top {selfRank}
              {aheadOfMe ? `, behind ${aheadOfMe}` : ""}
            </p>
          ) : null}
          {isCorrect ? (
            <span className={styles.resultPoints}>+{lastSelfPoints}</span>
          ) : null}
        </section>
      )}

      <div className={styles.bottomBar}>
        <p className={styles.bottomName}>{selfEntry?.name ?? "Player"}</p>
        <div className={styles.bottomPoints}>{selfEntry?.score ?? 0}</div>
      </div>
    </section>
  );
}
