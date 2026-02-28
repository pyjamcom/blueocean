import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnswerOption } from "../components/AnswerGrid";
import { useEngagement } from "../context/EngagementContext";
import { useRoom } from "../context/RoomContext";
import { questionBank, QuestionRecord } from "../data/questions";
import { resolveAssetRef } from "../utils/assets";
import { mapStageToQuestionIndex, shuffleQuestionAnswers } from "../utils/questionShuffle";
import { prefetchImage } from "../utils/prefetch";
import { playTap } from "../utils/sfx";
import { playLoop, playOneShot, stopLoop, SFX } from "../utils/sounds";
import styles from "./rahootGame.module.css";

const fallbackSrc = "/icons/icon-192.svg";
const MAX_QUESTIONS = Math.min(15, questionBank.length);
const REVEAL_ANSWERS_DURATION_MS = 2200;
type DesignState =
  | "wait"
  | "prepared"
  | "round"
  | "round-wrong"
  | "round-correct"
  | "result-wrong"
  | "result-correct";

type GameVisualState =
  | "wait"
  | "connecting"
  | "reconnecting"
  | "connection-lost"
  | "prepared"
  | "round"
  | "round-wrong"
  | "round-correct"
  | "result-wrong"
  | "result-correct";

interface TimerProgress {
  seconds: number;
  percent: number;
}

function resolveVisualState(params: {
  designState: DesignState | null;
  phase: string;
  wsStatus: string;
  revealStep: "answers" | "result";
  hasAnswer: boolean;
  isCorrect: boolean;
  wasConnectedOnce: boolean;
}): GameVisualState {
  const {
    designState,
    phase,
    wsStatus,
    revealStep,
    hasAnswer,
    isCorrect,
    wasConnectedOnce,
  } = params;

  if (designState) {
    return designState;
  }

  if (wsStatus !== "open") {
    if (wsStatus === "connecting") {
      return wasConnectedOnce ? "reconnecting" : "connecting";
    }
    if (wsStatus === "closed" || wsStatus === "error") {
      return wasConnectedOnce ? "connection-lost" : "connecting";
    }
    return "connecting";
  }

  if (phase === "join" || phase === "lobby") {
    return "wait";
  }
  if (phase === "prepared") {
    return "prepared";
  }
  if (phase === "round") {
    return "round";
  }
  if (phase === "reveal") {
    if (revealStep === "answers") {
      return isCorrect ? "round-correct" : "round-wrong";
    }
    if (!hasAnswer) {
      return "result-wrong";
    }
    return isCorrect ? "result-correct" : "result-wrong";
  }
  if (phase === "leaderboard" || phase === "end") {
    return isCorrect ? "result-correct" : "result-wrong";
  }
  return "wait";
}

function resolveWaitText(state: GameVisualState) {
  if (state === "connecting") return "Connecting...";
  if (state === "reconnecting") return "Reconnecting...";
  if (state === "connection-lost") return "Connection lost. Retrying...";
  return "Waiting for the other players...";
}

function shouldShowRetry(state: GameVisualState) {
  return state === "connecting" || state === "reconnecting" || state === "connection-lost";
}

function resolveTimerProgress(params: {
  designLock: boolean;
  secondsLeft: number;
  totalSeconds: number;
}): TimerProgress {
  const { designLock, secondsLeft, totalSeconds } = params;
  if (designLock) {
    return { seconds: 12, percent: (168 / 318) * 100 };
  }
  const safeTotal = Math.max(1, totalSeconds);
  const clampedRemaining = Math.min(safeTotal, Math.max(0, secondsLeft));
  const clampedSeconds = Math.ceil(clampedRemaining);
  const elapsedRatio = Math.min(1, Math.max(0, 1 - clampedRemaining / safeTotal));
  const percent = Math.max(2, Math.min(100, elapsedRatio * 100));
  return { seconds: clampedSeconds, percent };
}

function resolveResultText(params: {
  hasAnswer: boolean;
  isCorrect: boolean;
  points: number;
  designState: DesignState | null;
}): string {
  const { hasAnswer, isCorrect, points, designState } = params;
  if (!hasAnswer) {
    return "No answer";
  }
  if (!isCorrect) {
    return "Wrong answer";
  }
  const displayPoints = designState === "result-correct" ? 70 : Math.max(0, points);
  return displayPoints > 0 ? `Correct answer\n+${displayPoints}` : "Correct answer";
}

const DESIGN_LOCK_PROMPT = "/figma/game/round-prompt-163-5288.png";
const DESIGN_LOCK_ANSWERS: [AnswerOption, AnswerOption, AnswerOption, AnswerOption] = [
  { id: "figma-a1", src: "/figma/game/round-answer-1-163-5298.png" },
  { id: "figma-a2", src: "/figma/game/round-answer-2-163-5303.png" },
  { id: "figma-a3", src: "/figma/game/round-answer-3-163-5306.png" },
  { id: "figma-a4", src: "/figma/game/round-answer-4-163-5308.png" },
];
const DESIGN_REVEAL_ANSWER_OVERRIDES: Record<
  "round-wrong" | "round-correct",
  Partial<Record<number, string>>
> = {
  "round-wrong": {
    0: "/figma/game/round-answer-1-reveal-wrong-163-5329.png",
    3: "/figma/game/round-answer-4-reveal-wrong-163-5339.png",
  },
  "round-correct": {
    0: "/figma/game/round-answer-1-reveal-correct-163-5360.png",
  },
};

const DESIGN_BADGE_ASSETS: Record<
  "default" | "correct",
  { dot: string; glow: string }
> = {
  default: {
    dot: "/figma/game/badge-163-5299.png",
    glow: "/figma/game/badge-163-5300.png",
  },
  correct: {
    dot: "/figma/game/badge-163-5361.png",
    glow: "/figma/game/badge-163-5362.png",
  },
};
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
  const location = useLocation();
  const {
    phase,
    questionIndex,
    roundStartAt,
    sendAnswer,
    reconnectWs,
    resetRoom,
    roomCode,
    currentQuestion,
    players,
    playerId,
    selfAnswerIndex,
    lastSelfPoints,
    answerCounts,
    wsStatus,
  } = useRoom();
  const { actions: engagementActions } = useEngagement();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealStep, setRevealStep] = useState<"answers" | "result">("answers");
  const [wasConnectedOnce, setWasConnectedOnce] = useState(false);
  const recordedRoundRef = useRef<number | null>(null);
  const designLock = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("mode") === "design" || params.get("design") === "1";
  }, [location.search]);
  const designState = useMemo<DesignState | null>(() => {
    if (!designLock) {
      return null;
    }
    const params = new URLSearchParams(location.search);
    const raw = (params.get("state") ?? params.get("phase") ?? "").toLowerCase();
    const normalized = raw.replace(/_/g, "-");
    switch (normalized) {
      case "wait":
      case "prepared":
      case "round":
      case "round-wrong":
      case "round-correct":
      case "result-wrong":
      case "result-correct":
        return normalized;
      default:
        return "round";
    }
  }, [designLock, location.search]);
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
  const timerTotalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const timerStartAt = useMemo(() => roundStartAt ?? Date.now(), [roundStartAt, questionIndex, phase]);
  const [secondsLeft, setSecondsLeft] = useState<number>(timerTotalSeconds);
  const [frozenSecondsLeft, setFrozenSecondsLeft] = useState<number>(timerTotalSeconds);

  useEffect(() => {
    setSelectedIndex(null);
    setSecondsLeft(timerTotalSeconds);
    setFrozenSecondsLeft(timerTotalSeconds);
  }, [questionIndex, timerTotalSeconds]);

  useEffect(() => {
    if (wsStatus === "open") {
      setWasConnectedOnce(true);
    }
  }, [wsStatus]);

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
      return;
    }
    const startAt = timerStartAt;
    const tick = () => {
      const remaining = Math.max(0, durationMs - (Date.now() - startAt));
      setSecondsLeft(remaining / 1000);
    };
    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [durationMs, phase, timerStartAt]);

  useEffect(() => {
    if (phase === "round") {
      setFrozenSecondsLeft(secondsLeft);
    }
  }, [phase, secondsLeft]);

  const answers = useMemo(() => {
    if (designLock) {
      return DESIGN_LOCK_ANSWERS;
    }
    return activeQuestion
      ? buildAnswers(activeQuestion)
      : buildAnswers({
          id: "fallback",
          category: "visual_provocation",
          prompt_image: fallbackSrc,
          answers: [],
          correct_index: 0,
          duration_ms: 15000,
        });
  }, [activeQuestion, designLock]);

  useEffect(() => {
    if (designLock) {
      [DESIGN_LOCK_PROMPT, ...DESIGN_LOCK_ANSWERS.map((answer) => answer.src)].forEach((src) =>
        prefetchImage(src),
      );
      return;
    }
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
  }, [activeQuestion, answers, designLock]);

  const correctIndex = useMemo(() => {
    if (designState === "round-wrong" || designState === "result-wrong") {
      return 3;
    }
    if (
      designState === "round-correct" ||
      designState === "result-correct" ||
      designState === "round"
    ) {
      return 0;
    }
    return activeQuestion?.correct_index ?? 0;
  }, [activeQuestion?.correct_index, designState]);
  const displaySelectedIndex = useMemo(() => {
    if (
      designState === "round" ||
      designState === "round-wrong" ||
      designState === "round-correct" ||
      designState === "result-wrong" ||
      designState === "result-correct"
    ) {
      return 0;
    }
    return selectedIndex ?? selfAnswerIndex;
  }, [designState, selfAnswerIndex, selectedIndex]);
  const hasAnswer = displaySelectedIndex !== null;
  const isCorrect = hasAnswer && displaySelectedIndex === correctIndex;
  const safeRoundPoints = Math.max(0, Number(lastSelfPoints ?? 0));
  const revealText = resolveResultText({
    hasAnswer,
    isCorrect,
    points: safeRoundPoints,
    designState,
  });
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

  const questionTitle = designLock
    ? "Choose the most meme"
    : activeQuestion?.category
      ? CATEGORY_TITLE_OVERRIDES[activeQuestion.category] ?? titleCase(activeQuestion.category)
      : activeQuestion?.humor_tag
        ? titleCase(activeQuestion.humor_tag)
        : `Question ${Math.min(questionIndex + 1, MAX_QUESTIONS)}`;

  const promptSrc = designLock
    ? DESIGN_LOCK_PROMPT
    : activeQuestion
      ? resolveAssetRef(activeQuestion.prompt_image, fallbackSrc)
      : fallbackSrc;
  const renderPrompt = () => {
    if (designLock) {
      return <img alt={questionTitle} src={promptSrc} className={styles.questionImage} />;
    }
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
    if (phase !== "round" || selectedIndex !== null || selfAnswerIndex !== null) {
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

  const visualState = resolveVisualState({
    designState,
    phase,
    wsStatus,
    revealStep,
    hasAnswer,
    isCorrect,
    wasConnectedOnce,
  });
  const showWait = visualState === "wait" || visualState === "connecting" || visualState === "reconnecting" || visualState === "connection-lost";
  const showPrepared = visualState === "prepared";
  const showRound = visualState === "round";
  const showRevealAnswers = visualState === "round-wrong" || visualState === "round-correct";
  const showRevealResult = visualState === "result-wrong" || visualState === "result-correct";
  const showRoundFamily = !showWait && !showPrepared;
  const showRoundLayout = showRound || showRevealAnswers;
  const timerProgress = resolveTimerProgress({
    designLock,
    secondsLeft: showRound ? secondsLeft : frozenSecondsLeft,
    totalSeconds: timerTotalSeconds,
  });
  const timerDisplaySeconds = timerProgress.seconds;
  const progressDisplayPercent = timerProgress.percent;
  const waitText = resolveWaitText(visualState);
  const showRetryNow = shouldShowRetry(visualState) && wsStatus !== "open";
  const backgroundImage = showRoundFamily
    ? "/figma/game/bg-163-5283.png"
    : "/figma/game/bg-163-5233.png";
  const backgroundImageSize = showRoundFamily ? "562px 843px" : "528px 792px";
  const backgroundImagePosition = showRoundFamily ? "center 1px" : "center top";

  return (
    <section
      className={[
        styles.root,
        showRoundLayout ? styles.roundPhase : "",
        showWait ? styles.waitPhase : "",
        designLock ? styles.designLock : "",
      ].filter(Boolean).join(" ")}
    >
      <div
        className={styles.background}
        style={
          {
            "--game-bg-image": `url(${backgroundImage})`,
            "--game-bg-image-size": backgroundImageSize,
            "--game-bg-image-position": backgroundImagePosition,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <div className={styles.backgroundImage} />
      </div>

      {showWait && (
        <section className={`${styles.centerWrap} ${styles.phaseWait}`}>
          <img
            className={`${styles.loader} ${visualState !== "connection-lost" ? styles.loaderSpin : ""}`}
            src="/figma/game/loader-163-5237.png"
            alt="loader"
          />
          <h2 className={styles.waitTitle}>{waitText}</h2>
          {showRetryNow ? (
            <button type="button" className={styles.retryButton} onClick={reconnectWs}>
              Retry now
            </button>
          ) : null}
        </section>
      )}

      {showPrepared && (
        <section className={`${styles.centerWrap} ${styles.phasePrepared} ${styles.animShow}`}>
          <img
            className={styles.preparedHeroImage}
            src="/figma/game/prepared-163-5250.png"
            alt="Quiz options preview"
          />
          <h2 className={`${styles.preparedTitle} ${styles.animShow}`}>
            Let{"\u2019"}s play!
          </h2>
        </section>
      )}

      {showRoundLayout && (
        <div className={styles.roundStack}>
          <section className={styles.roundTitleCard}>
            <h2 className={styles.roundTitle}>{questionTitle}</h2>
          </section>

          <section className={styles.roundPromptCard}>
            <div className={styles.roundPromptMedia}>{renderPrompt()}</div>
            <div className={styles.roundTimerWrap}>
              <p className={styles.roundTimerText}>{timerDisplaySeconds} seconds left</p>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressDisplayPercent}%` }}
                />
                <span
                  className={styles.progressKnob}
                  style={{ left: `calc(${progressDisplayPercent}% - 13px)` }}
                />
              </div>
            </div>
          </section>

          <section className={styles.roundAnswersCard}>
              <div className={styles.answersGrid}>
              {answers.map((answer, index) => {
                const isSelected = displaySelectedIndex === index;
                const isCorrectAnswer = index === correctIndex;
                const showWrongState = showRevealAnswers && isSelected && !isCorrect;
                const showCorrectState = showRevealAnswers && isCorrectAnswer;
                const showRevealState = showWrongState || showCorrectState;
                const answerClassName = [
                  styles.answerButton,
                  isSelected ? styles.answerSelected : "",
                  showWrongState ? styles.answerRevealWrong : "",
                  showCorrectState ? styles.answerRevealCorrect : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={answer.id}
                    className={answerClassName}
                    onClick={() => handleSelect(index)}
                    disabled={!showRound || displaySelectedIndex !== null}
                  >
                    <img
                      className={[
                        styles.answerMedia,
                        showRevealState ? styles.answerMediaInset : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      src={
                        designLock && showRevealAnswers
                          ? DESIGN_REVEAL_ANSWER_OVERRIDES[visualState as "round-wrong" | "round-correct"]?.[
                              index
                            ] ?? answer.src
                          : answer.src
                      }
                      alt={`Answer ${index + 1}`}
                    />
                    {isSelected ? (
                      <>
                        <img
                          className={styles.answerPickBadgeImage}
                          src={
                            designLock && showRevealAnswers && isCorrect
                              ? DESIGN_BADGE_ASSETS.correct.dot
                              : DESIGN_BADGE_ASSETS.default.dot
                          }
                          alt=""
                          aria-hidden="true"
                        />
                        <img
                          className={styles.answerPickBadgeGlowImage}
                          src={
                            designLock && showRevealAnswers && isCorrect
                              ? DESIGN_BADGE_ASSETS.correct.glow
                              : DESIGN_BADGE_ASSETS.default.glow
                          }
                          alt=""
                          aria-hidden="true"
                        />
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {!showRound && showRevealResult && (
        <section className={`${styles.centerWrap} ${styles.phaseResult} ${styles.animShow}`}>
          {isCorrect ? (
            <img
              className={styles.resultIcon}
              src="/figma/game/correct-163-5275.png"
              alt="Correct answer"
            />
          ) : (
            <img
              className={styles.resultIcon}
              src="/figma/game/wrong-163-5262.png"
              alt="Wrong answer"
            />
          )}
          <h2 className={`${styles.resultMessage} ${isCorrect ? styles.resultMessageCenter : styles.resultMessageLeft}`}>
            {revealText}
          </h2>
        </section>
      )}

      <div className={styles.chromeButtons}>
        <button
          type="button"
          className={styles.chromeActionButton}
          aria-label="leave game"
          onClick={() => {
            resetRoom();
            navigate("/join", { replace: true });
          }}
        />
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
