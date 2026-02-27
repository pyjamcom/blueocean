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

const DESIGN_LOCK_PROMPT = "/figma/game/round-prompt-163-5288.png";
const DESIGN_LOCK_ANSWERS: [AnswerOption, AnswerOption, AnswerOption, AnswerOption] = [
  { id: "figma-a1", src: "/figma/game/round-answer-1-163-5298.png" },
  { id: "figma-a2", src: "/figma/game/round-answer-2-163-5303.png" },
  { id: "figma-a3", src: "/figma/game/round-answer-3-163-5306.png" },
  { id: "figma-a4", src: "/figma/game/round-answer-4-163-5308.png" },
];
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
    resetRoom,
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
    if (designState === "round-wrong") {
      return 3;
    }
    if (designState === "round-correct" || designState === "round") {
      return 0;
    }
    return activeQuestion?.correct_index ?? 0;
  }, [activeQuestion?.correct_index, designState]);
  const displaySelectedIndex = useMemo(() => {
    if (designState === "round" || designState === "round-wrong" || designState === "round-correct") {
      return 0;
    }
    return selectedIndex;
  }, [designState, selectedIndex]);
  const hasAnswer = displaySelectedIndex !== null;
  const isCorrect = hasAnswer && displaySelectedIndex === correctIndex;
  const safeRoundPoints = Math.max(0, Number(lastSelfPoints ?? 0));
  const displayRoundPoints = designState === "result-correct" ? 70 : safeRoundPoints;
  const revealMessage = !hasAnswer ? "No answer" : isCorrect ? "Correct answer" : "Wrong answer";
  const revealCorrectMessage = displayRoundPoints > 0 ? `Correct answer\n+${displayRoundPoints}` : "Correct answer";
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

  const showWait = designState
    ? designState === "wait"
    : wsStatus !== "open" || phase === "join" || phase === "lobby";
  const showPrepared = designState ? designState === "prepared" : phase === "prepared";
  const showRound = designState ? designState === "round" : phase === "round";
  const showReveal = designState
    ? designState === "round-wrong" ||
      designState === "round-correct" ||
      designState === "result-wrong" ||
      designState === "result-correct"
    : phase === "reveal";
  const showRoundFamily = designState
    ? designState !== "wait" && designState !== "prepared"
    : showRound || showReveal || phase === "leaderboard" || phase === "end";
  const showRevealAnswers = designState
    ? designState === "round-wrong" || designState === "round-correct"
    : showReveal && revealStep === "answers";
  const showRevealResult = designState
    ? designState === "result-wrong" || designState === "result-correct"
    : showReveal && revealStep === "result";
  const showRoundLayout = showRound || showRevealAnswers;
  const timerDisplaySeconds = designLock ? 12 : showRevealAnswers ? 12 : secondsLeft;
  const progressDisplayPercent = designLock ? (168 / 318) * 100 : showRevealAnswers ? (168 / 318) * 100 : progressPercent;
  const backgroundImage = showRoundFamily
    ? "/figma/game/bg-163-5283.png"
    : "/figma/game/bg-163-5233.png";

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
        style={{ "--game-bg-image": `url(${backgroundImage})` } as React.CSSProperties}
        aria-hidden="true"
      />

      {showWait && (
        <section className={`${styles.centerWrap} ${styles.phaseWait}`}>
          <img
            className={`${styles.loader} ${styles.loaderSpin}`}
            src="/figma/game/loader-163-5237.png"
            alt="loader"
          />
          <h2 className={styles.waitTitle}>Waiting for the other players...</h2>
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
            Let&apos;s play!
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
                  style={{ left: `calc(${progressDisplayPercent}% - 11px)` }}
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
                      className={`${styles.answerMedia} ${showRevealState ? styles.answerMediaInset : ""}`}
                      src={answer.src}
                      alt={`Answer ${index + 1}`}
                    />
                    {isSelected ? (
                      <span className={styles.answerPickBadge}>
                        <span className={styles.answerPickTick} />
                      </span>
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
            {isCorrect ? revealCorrectMessage : revealMessage}
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
