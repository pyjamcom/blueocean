import { ElementType, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnswerOption } from "../components/AnswerGrid";
import { useEngagement } from "../context/EngagementContext";
import { useRoom } from "../context/RoomContext";
import { questionBank, QuestionRecord } from "../data/questions";
import { resolveAssetRef } from "../utils/assets";
import { mapStageToQuestionIndex, shuffleQuestionAnswers } from "../utils/questionShuffle";
import { prefetchImage } from "../utils/prefetch";
import { playTap } from "../utils/sfx";
import { playLoop, playOneShot, stopLoop, SFX } from "../utils/sounds";
import Triangle from "../components/rahoot/icons/Triangle";
import Rhombus from "../components/rahoot/icons/Rhombus";
import Circle from "../components/rahoot/icons/Circle";
import Square from "../components/rahoot/icons/Square";
import CricleCheck from "../components/rahoot/icons/CricleCheck";
import CricleXmark from "../components/rahoot/icons/CricleXmark";
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
const REVEAL_ANSWERS_DURATION_MS = 2200;
const CATEGORY_TITLE_OVERRIDES: Record<string, string> = {
  visual_provocation: "Choose the most meme",
  absurd_sum: "Find the absurd match",
  icon_battle: "Pick the winner",
  sound_pantomime: "Listen and choose",
  face_mimic: "Match the face",
  drunk_reflex: "Tap fast, think later",
  silhouette_guess: "Guess the silhouette",
  trophy_rewards: "Claim your trophy",
};

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
  const navigate = useNavigate();
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
  const { actions: engagementActions } = useEngagement();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealStep, setRevealStep] = useState<"answers" | "result">("answers");
  const recordedRoundRef = useRef<number | null>(null);
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
  const durationMs = 15000;
  const timerStartAt = useMemo(() => roundStartAt ?? Date.now(), [roundStartAt, questionIndex, phase]);
  const [secondsLeft, setSecondsLeft] = useState<number>(Math.ceil(durationMs / 1000));

  useEffect(() => {
    setSelectedIndex(null);
  }, [questionIndex]);

  useEffect(() => {
    if (phase !== "reveal" && phase !== "leaderboard") {
      return;
    }
    if (recordedRoundRef.current === questionIndex) {
      return;
    }
    recordedRoundRef.current = questionIndex;
    const answeredCount = answerCounts.reduce((sum, count) => sum + count, 0);
    engagementActions.recordRoundComplete({
      answeredCount,
      totalPlayers: players.length,
    });
  }, [answerCounts, engagementActions, phase, players.length, questionIndex]);

  useEffect(() => {
    if (!lastSelfPoints) return;
    engagementActions.recordScoreDelta(lastSelfPoints);
  }, [engagementActions, lastSelfPoints]);

  useEffect(() => {
    if (phase !== "reveal") {
      setRevealStep("answers");
      return;
    }
    setRevealStep("answers");
    const timer = window.setTimeout(() => setRevealStep("result"), REVEAL_ANSWERS_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

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
          duration_ms: 15000,
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
  const revealMessage = !hasAnswer ? "No answer" : isCorrect ? "Correct answer" : "Wrong answer";
  const questionLabel = `${Math.min(questionIndex + 1, MAX_QUESTIONS)} / ${MAX_QUESTIONS}`;
  const timerTotalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const elapsedRatio = Math.min(1, Math.max(0, 1 - secondsLeft / timerTotalSeconds));
  const progressPercent = Math.max(2, elapsedRatio * 100);
  const totalAnswered = answerCounts.reduce((sum, count) => sum + count, 0);
  const lastAnsweredRef = useRef(0);

  useEffect(() => {
    if (phase === "prepared") {
      playOneShot(SFX.BOUMP, 0.35);
    }
  }, [phase, questionIndex]);

  useEffect(() => {
    if (phase === "round") {
      playOneShot(SFX.SHOW, 0.4);
      playLoop(SFX.ANSWERS_MUSIC, { volume: 0.25, interrupt: true });
      return;
    }
    stopLoop(SFX.ANSWERS_MUSIC);
  }, [phase, questionIndex]);

  useEffect(() => {
    if (phase === "reveal") {
      playOneShot(SFX.RESULTS, 0.4);
    }
  }, [phase, questionIndex]);

  useEffect(() => {
    if (phase !== "round") {
      lastAnsweredRef.current = totalAnswered;
      return;
    }
    if (totalAnswered > lastAnsweredRef.current) {
      playOneShot(SFX.ANSWERS_POP, 0.12);
    }
    lastAnsweredRef.current = totalAnswered;
  }, [phase, totalAnswered]);

  const questionTitle = activeQuestion?.category
    ? CATEGORY_TITLE_OVERRIDES[activeQuestion.category] ?? titleCase(activeQuestion.category)
    : activeQuestion?.humor_tag
      ? titleCase(activeQuestion.humor_tag)
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
              <img key={`${src}-${index}`} alt="" src={src} className={styles.overlayImage} />
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
    playOneShot(SFX.ANSWERS_POP, 0.2);
    const correctIndex = activeQuestion?.correct_index ?? 0;
    const isCorrect = index === correctIndex;
    const latencyMs = Math.max(0, Date.now() - timerStartAt);
    const selfPlayer = players.find((player) => player.id === playerId);
    const predictedStreak = isCorrect ? (selfPlayer?.streak ?? 0) + 1 : 0;
    engagementActions.recordAnswerResult({
      correct: isCorrect,
      latencyMs,
      streak: predictedStreak,
    });
    sendAnswer(index);
  };

  const showWait = wsStatus !== "open" || phase === "join" || phase === "lobby";
  const showPrepared = phase === "prepared";
  const showRound = phase === "round";
  const showReveal = phase === "reveal";
  const showRevealAnswers = showReveal && revealStep === "answers";
  const showRevealResult = showReveal && revealStep === "result";

  const renderAnswerRevealGrid = () => (
    <div className={styles.answerRevealGrid}>
      {answers.map((answer, index) => {
        const isCorrectAnswer = index === correctIndex;
        return (
          <div
            key={answer.id}
            className={`${styles.answerRevealTile} ${!isCorrectAnswer ? styles.answerRevealDim : ""}`}
          >
            <img
              className={styles.answerRevealImage}
              src={answer.src}
              alt={`Answer ${index + 1}`}
            />
            {isCorrectAnswer ? (
              <CricleCheck className={styles.answerRevealIcon} />
            ) : (
              <CricleXmark className={styles.answerRevealIcon} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <section className={`${styles.root} ${showRound ? styles.roundPhase : ""}`}>
      <div className={styles.background} aria-hidden="true">
      </div>

      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.timeBadge}>9:41</span>
        </div>
        <div className={styles.topBarRight}>
          <span className={styles.signalIcon} />
          <span className={styles.wifiIcon} />
          <span className={styles.batteryIcon} />
        </div>
      </div>

      {showWait && (
        <section className={styles.centerWrap}>
          <img className={`${styles.loader} ${styles.loaderSpin}`} src={loader} alt="loader" />
          <h2 className={styles.waitTitle}>
            {wsStatus !== "open" ? "Connecting..." : "Waiting for the other players..."}
          </h2>
        </section>
      )}

      {showPrepared && (
        <section className={`${styles.centerWrap} ${styles.animShow}`}>
          <div className={`${styles.preparedHero} ${styles.animQuizz}`}>
            {[...Array(4)].map((_, index) => {
              const Icon = ANSWER_ICONS[index] ?? Triangle;
              return (
                <div
                  key={index}
                  className={`${styles.quizButton} ${styles.preparedTile} ${ANSWER_COLORS[index]}`}
                >
                  <Icon className={styles.preparedIcon} />
                </div>
              );
            })}
          </div>
          <h2 className={`${styles.preparedTitle} ${styles.animShow}`}>
            Let&apos;s play!
          </h2>
        </section>
      )}

      {showRound && (
        <div className={styles.roundStack}>
          <section className={styles.roundTitleCard}>
            <h2 className={styles.roundTitle}>{questionTitle}</h2>
          </section>

          <section className={styles.roundPromptCard}>
            <div className={styles.roundPromptMedia}>{renderPrompt()}</div>
            <div className={styles.roundTimerWrap}>
              <p className={styles.roundTimerText}>{secondsLeft} seconds left</p>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPercent}%` }}
                />
                <span
                  className={styles.progressKnob}
                  style={{ left: `calc(${progressPercent}% - 11px)` }}
                />
              </div>
            </div>
          </section>

          <section className={styles.roundAnswersCard}>
            <div className={styles.answersGrid}>
              {answers.map((answer, index) => {
                const Icon = ANSWER_ICONS[index] ?? Triangle;
                const isSelected = selectedIndex === index;
                return (
                  <button
                    key={answer.id}
                    className={`${styles.answerButton} ${isSelected ? styles.answerSelected : ""}`}
                    onClick={() => handleSelect(index)}
                    disabled={selectedIndex !== null}
                  >
                    <img
                      className={styles.answerMedia}
                      src={answer.src}
                      alt={`Answer ${index + 1}`}
                    />
                    {isSelected ? (
                      <span className={styles.answerPickBadge}>
                        <Icon className={styles.answerPickIcon} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {!showRound && showRevealAnswers && (
        <section className={`${styles.centerWrap} ${styles.animShow}`}>
          <h2 className={styles.questionTitle}>{questionTitle}</h2>
          {renderPrompt()}
          {renderAnswerRevealGrid()}
        </section>
      )}

      {!showRound && showRevealResult && (
        <section className={`${styles.centerWrap} ${styles.animShow}`}>
          {isCorrect ? (
            <CricleCheck className={styles.resultIcon} />
          ) : (
            <CricleXmark className={styles.resultIcon} />
          )}
          <h2 className={`${styles.resultMessage} ${isCorrect ? styles.resultMessageCenter : styles.resultMessageLeft}`}>
            {isCorrect ? `Correct answer\n+${lastSelfPoints}` : revealMessage}
          </h2>
        </section>
      )}

      <div className={styles.chromeButtons}>
        <button
          type="button"
          className={styles.chromeActionButton}
          aria-label="open leaderboard"
          onClick={() => navigate("/leaderboard")}
        />
      </div>
      <div className={styles.chromeTabBar}>
        <div className={styles.chromeUrlWrap}>
          <span className={styles.chromeLock} />
          <span className={styles.chromeUrl}>escapers.app</span>
        </div>
        <div className={styles.chromeHomeIndicator} />
      </div>
      {false && (
        <div className={styles.bottomBar}>
          <p className={styles.bottomName}>Player</p>
          <div className={styles.bottomPoints}>0</div>
        </div>
      )}
    </section>
  );
}
