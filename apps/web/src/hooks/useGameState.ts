import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateScore, ScoringMode } from "../utils/scoring";
import { trackEvent } from "../utils/analytics";

export type GamePhase = "lobby" | "round" | "reveal" | "leaderboard" | "end";

export interface QuestionState {
  id: string;
  correct_index: number;
  duration_ms: number;
}

export interface PlayerState {
  id: string;
  avatar_id: string;
  score: number;
  correctCount: number;
  streak: number;
}

export interface GameState {
  phase: GamePhase;
  questionIndex: number;
  questions: QuestionState[];
  players: PlayerState[];
  roundStartAt: number | null;
  scoringMode: ScoringMode;
  pointsMultiplier: 0 | 1 | 2;
}

export interface UseGameStateOptions {
  questions: QuestionState[];
  players: PlayerState[];
  scoringMode: ScoringMode;
  pointsMultiplier: 0 | 1 | 2;
  revealDurationMs?: number;
  leaderboardDurationMs?: number;
}

export interface AnswerEvent {
  playerId: string;
  answerIndex: number;
  responseTimeMs: number;
}

export function useGameState({
  questions,
  players,
  scoringMode,
  pointsMultiplier,
  revealDurationMs = 2500,
  leaderboardDurationMs = 5000,
}: UseGameStateOptions) {
  const [state, setState] = useState<GameState>({
    phase: "lobby",
    questionIndex: 0,
    questions,
    players,
    roundStartAt: null,
    scoringMode,
    pointsMultiplier,
  });

  const answersRef = useRef<Record<string, AnswerEvent>>({});
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const startRound = useCallback(() => {
    answersRef.current = {};
    trackEvent("round_start");
    setState((prev) => ({
      ...prev,
      phase: "round",
      roundStartAt: Date.now(),
    }));
  }, []);

  const endRound = useCallback(() => {
    trackEvent("round_end");
    setState((prev) => {
      const updatedPlayers = prev.players.map((player) => {
        if (answersRef.current[player.id]) {
          return player;
        }
        return { ...player, streak: 0 };
      });
      return {
        ...prev,
        players: updatedPlayers,
        phase: "reveal",
      };
    });
  }, []);

  const nextQuestion = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.questionIndex + 1;
      if (nextIndex >= prev.questions.length) {
        return { ...prev, phase: "end" };
      }
      return {
        ...prev,
        phase: "round",
        questionIndex: nextIndex,
        roundStartAt: Date.now(),
      };
    });
  }, []);

  const submitAnswer = useCallback(
    ({ playerId, answerIndex, responseTimeMs }: AnswerEvent) => {
      setState((prev) => {
        if (prev.phase !== "round") {
          return prev;
        }
        if (answersRef.current[playerId]) {
          return prev;
        }

        const question = prev.questions[prev.questionIndex];
        const isCorrect = answerIndex === question.correct_index;
        answersRef.current[playerId] = { playerId, answerIndex, responseTimeMs };

        const result = calculateScore({
          isCorrect,
          responseTimeMs,
          questionTimeMs: question.duration_ms,
          pointsMultiplier: prev.pointsMultiplier,
          mode: prev.scoringMode,
        });

        const updatedPlayers = prev.players.map((player) => {
          if (player.id !== playerId) {
            return player;
          }
          const nextStreak = isCorrect ? player.streak + 1 : 0;
          return {
            ...player,
            score: player.score + result.points,
            correctCount: player.correctCount + result.correctIncrement,
            streak: nextStreak,
          };
        });

        const allAnswered = updatedPlayers.every((player) => answersRef.current[player.id]);
        return {
          ...prev,
          players: updatedPlayers,
          phase: allAnswered ? "reveal" : prev.phase,
        };
      });
    },
    [],
  );

  useEffect(() => {
    clearTimers();
    if (state.phase === "round" && state.roundStartAt) {
      const question = state.questions[state.questionIndex];
      const remaining = question.duration_ms - (Date.now() - state.roundStartAt);
      const timerId = window.setTimeout(() => endRound(), Math.max(0, remaining));
      timersRef.current.push(timerId);
    }
    if (state.phase === "reveal") {
      const timerId = window.setTimeout(() => {
        setState((prev) => ({ ...prev, phase: "leaderboard" }));
      }, revealDurationMs);
      timersRef.current.push(timerId);
    }
    if (state.phase === "leaderboard") {
      trackEvent("leaderboard_view");
      const timerId = window.setTimeout(() => nextQuestion(), leaderboardDurationMs);
      timersRef.current.push(timerId);
    }
    return clearTimers;
  }, [state.phase, state.roundStartAt, state.questionIndex, state.questions, endRound, nextQuestion, revealDurationMs, leaderboardDurationMs]);

  const leaderboard = useMemo(() => {
    const sorted = [...state.players].sort((a, b) => {
      if (state.scoringMode === "accuracy") {
        return b.correctCount - a.correctCount || b.score - a.score;
      }
      return b.score - a.score;
    });
    return sorted.map((player, idx) => ({
      ...player,
      rank: idx + 1,
    }));
  }, [state.players, state.scoringMode]);

  return {
    state,
    startRound,
    submitAnswer,
    endRound,
    nextQuestion,
    leaderboard,
  };
}
