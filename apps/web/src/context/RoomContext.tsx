import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWsClient } from "../hooks/useWsClient";
import { randomId, randomPlayerId } from "../utils/ids";
import { questionBank } from "../data/questions";

export type RoomPhase = "join" | "lobby" | "round" | "reveal" | "leaderboard" | "end";

export interface StagePayload {
  roomCode: string;
  phase: RoomPhase;
  questionIndex?: number;
  roundStartAt?: number;
}

export interface RoomPlayer {
  id: string;
  avatarId: string;
  ready: boolean;
  score: number;
  correctCount: number;
  streak: number;
}

interface RoomState {
  roomCode: string | null;
  playerId: string;
  isHost: boolean;
  phase: RoomPhase;
  questionIndex: number;
  roundStartAt: number | null;
  joinedAt: number | null;
  players: RoomPlayer[];
  answerCounts: [number, number, number, number];
  wsStatus: string;
  errors: unknown[];
  joinRoom: (roomCode?: string, avatarId?: string) => void;
  sendStage: (payload: Omit<StagePayload, "roomCode">) => void;
  startGame: () => void;
  sendAnswer: (answerIndex: number) => void;
  setReady: (ready: boolean) => void;
  setAvatar: (avatarId: string) => void;
}

const RoomContext = createContext<RoomState | null>(null);

const REVEAL_DURATION_MS = 2400;
const LEADERBOARD_DURATION_MS = 2400;

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [phase, setPhase] = useState<RoomPhase>("join");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [roundStartAt, setRoundStartAt] = useState<number | null>(null);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [answerCounts, setAnswerCounts] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [errors, setErrors] = useState<unknown[]>([]);
  const playerId = useMemo(() => randomPlayerId(), []);
  const joinSentRef = useRef(false);
  const pendingJoinRef = useRef<{ roomCode: string; avatarId: string } | null>(null);
  const hostTimersRef = useRef<number[]>([]);
  const answeredByQuestionRef = useRef<Record<number, Set<string>>>({});
  const sentQuestionsRef = useRef<Set<number>>(new Set());

  const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

  const applyStage = useCallback((payload: StagePayload) => {
    setPhase(payload.phase);
    if (typeof payload.questionIndex === "number") {
      setQuestionIndex(payload.questionIndex);
    }
    if (typeof payload.roundStartAt === "number") {
      setRoundStartAt(payload.roundStartAt);
    } else if (payload.phase !== "round") {
      setRoundStartAt(null);
    }
  }, []);

  const mergeRoster = useCallback(
    (
      payload:
        | {
            players?: Array<{
              id: string;
              avatarId: string;
              ready?: boolean;
              score?: number;
              correctCount?: number;
              streak?: number;
            }>;
          }
        | undefined,
    ) => {
    if (!payload?.players) return;
    setPlayers((prev) => {
      const prevMap = new Map(prev.map((player) => [player.id, player]));
      return payload.players.map((player) => {
        const existing = prevMap.get(player.id);
        return {
          id: player.id,
          avatarId: player.avatarId,
          ready: player.ready === true,
          score: player.score ?? existing?.score ?? 0,
          correctCount: player.correctCount ?? existing?.correctCount ?? 0,
          streak: player.streak ?? existing?.streak ?? 0,
        };
      });
    });
  }, []);

  const { status: wsStatus, send } = useWsClient({
    url: wsUrl,
    onMessage: (message) => {
      if (message.type === "joined") {
        const payload = message.payload as
          | { roomCode?: string; isHost?: boolean; stage?: StagePayload }
          | undefined;
        if (payload?.roomCode) {
          setRoomCode(payload.roomCode);
          setIsHost(payload.isHost === true);
          setJoinedAt(Date.now());
          if (payload.stage?.roomCode === payload.roomCode) {
            applyStage(payload.stage);
          } else {
            applyStage({ roomCode: payload.roomCode, phase: "lobby", questionIndex: 0 });
          }
        }
        return;
      }
      if (message.type === "roster") {
        const payload = message.payload as { players?: Array<{ id: string; avatarId: string; ready?: boolean }> } | undefined;
        mergeRoster(payload);
        return;
      }
      if (message.type === "stage") {
        const payload = message.payload as StagePayload | undefined;
        if (payload?.roomCode && payload.phase) {
          applyStage(payload);
        }
        return;
      }
      if (message.type === "answer") {
        const payload = message.payload as
          | { playerId?: string; answerIndex?: number; latencyMs?: number; questionIndex?: number }
          | undefined;
        if (!payload?.playerId || typeof payload.answerIndex !== "number") {
          return;
        }
        const effectiveIndex =
          typeof payload.questionIndex === "number" ? payload.questionIndex : questionIndex;
        const question = questionBank[effectiveIndex];
        if (!question) {
          return;
        }
        const answeredSet =
          answeredByQuestionRef.current[effectiveIndex] ?? new Set<string>();
        if (answeredSet.has(payload.playerId)) {
          return;
        }
        answeredSet.add(payload.playerId);
        answeredByQuestionRef.current[effectiveIndex] = answeredSet;

        if (effectiveIndex === questionIndex) {
          setAnswerCounts((prev) => {
            const next = [...prev] as [number, number, number, number];
            if (payload.answerIndex >= 0 && payload.answerIndex < 4) {
              next[payload.answerIndex] = (next[payload.answerIndex] ?? 0) + 1;
            }
            return next;
          });
        }
        return;
      }
      if (message.type === "score") {
        const payload = message.payload as
          | { players?: Array<{ id: string; avatarId: string; ready?: boolean; score?: number; correctCount?: number; streak?: number }> }
          | undefined;
        if (!payload?.players) {
          return;
        }
        setPlayers(
          payload.players.map((player) => ({
            id: player.id,
            avatarId: player.avatarId,
            ready: player.ready === true,
            score: player.score ?? 0,
            correctCount: player.correctCount ?? 0,
            streak: player.streak ?? 0,
          })),
        );
        return;
      }
      if (message.type === "error" && Array.isArray(message.errors)) {
        setErrors(message.errors);
      }
    },
    onClose: () => {
      joinSentRef.current = false;
    },
  });

  const flushJoin = useCallback(() => {
    const pending = pendingJoinRef.current;
    if (!pending || joinSentRef.current) return;
    if (wsStatus !== "open") return;
    send({
      type: "join",
      payload: {
        roomCode: pending.roomCode,
        playerId,
        avatarId: pending.avatarId,
      },
    });
    joinSentRef.current = true;
  }, [playerId, send, wsStatus]);

  useEffect(() => {
    if (wsStatus === "open") {
      flushJoin();
    }
  }, [flushJoin, wsStatus]);

  const joinRoom = useCallback(
    (requestedRoom?: string, avatarId = "avatar_disco_sloth") => {
      const room = requestedRoom ?? randomId(4);
      pendingJoinRef.current = { roomCode: room, avatarId };
      flushJoin();
    },
    [flushJoin],
  );

  const sendStage = useCallback(
    (payload: Omit<StagePayload, "roomCode">) => {
      if (!roomCode) return;
      const stagePayload: StagePayload = { roomCode, ...payload };
      send({ type: "stage", payload: stagePayload });
      applyStage(stagePayload);
    },
    [applyStage, roomCode, send],
  );

  const startGame = useCallback(() => {
    if (!roomCode) return;
    const startAt = Date.now();
    sendStage({ phase: "round", questionIndex: 0, roundStartAt: startAt });
  }, [roomCode, sendStage]);

  const sendAnswer = useCallback(
    (answerIndex: number) => {
      if (!roomCode) return;
      const latencyMs = roundStartAt ? Date.now() - roundStartAt : 0;
      send({
        type: "answer",
        payload: {
          roomCode,
          playerId,
          answerIndex,
          latencyMs,
          questionIndex,
        },
      });
    },
    [playerId, questionIndex, roomCode, roundStartAt, send],
  );

  const setAvatar = useCallback(
    (avatarId: string) => {
      if (!roomCode) return;
      send({
        type: "avatar",
        payload: {
          roomCode,
          playerId,
          avatarId,
        },
      });
    },
    [playerId, roomCode, send],
  );

  const setReady = useCallback(
    (ready: boolean) => {
      if (!roomCode) return;
      send({
        type: "ready",
        payload: {
          roomCode,
          playerId,
          ready,
        },
      });
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === playerId ? { ...player, ready } : player,
        ),
      );
    },
    [playerId, roomCode, send],
  );

  const clearHostTimers = useCallback(() => {
    hostTimersRef.current.forEach((id) => window.clearTimeout(id));
    hostTimersRef.current = [];
  }, []);

  useEffect(() => {
    clearHostTimers();
    if (!isHost || phase !== "round" || !roomCode) {
      return clearHostTimers;
    }
    const question = questionBank[questionIndex];
    const durationMs = question?.duration_ms ?? 6000;
    const startAt = roundStartAt ?? Date.now();
    const remaining = Math.max(0, durationMs - (Date.now() - startAt));

    if (question && !sentQuestionsRef.current.has(questionIndex)) {
      send({
        type: "question",
        payload: { ...question, questionIndex },
      });
      sentQuestionsRef.current.add(questionIndex);
    }

    const revealTimer = window.setTimeout(() => {
      sendStage({ phase: "reveal", questionIndex, roundStartAt: startAt });
    }, remaining);
    const leaderboardTimer = window.setTimeout(() => {
      sendStage({ phase: "leaderboard", questionIndex, roundStartAt: startAt });
    }, remaining + REVEAL_DURATION_MS);
    const nextTimer = window.setTimeout(() => {
      const nextIndex = questionIndex + 1;
      if (nextIndex >= questionBank.length) {
        sendStage({ phase: "end", questionIndex });
      } else {
        sendStage({ phase: "round", questionIndex: nextIndex, roundStartAt: Date.now() });
      }
    }, remaining + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);

    hostTimersRef.current.push(revealTimer, leaderboardTimer, nextTimer);
    return clearHostTimers;
  }, [clearHostTimers, isHost, phase, questionIndex, roomCode, roundStartAt, sendStage]);

  useEffect(() => {
    sentQuestionsRef.current.clear();
  }, [roomCode]);

  useEffect(() => {
    answeredByQuestionRef.current[questionIndex] = new Set();
    setAnswerCounts([0, 0, 0, 0]);
  }, [questionIndex]);

  const value: RoomState = {
    roomCode,
    playerId,
    isHost,
    phase,
    questionIndex,
    roundStartAt,
    joinedAt,
    players,
    answerCounts,
    wsStatus,
    errors,
    joinRoom,
    sendStage,
    startGame,
    sendAnswer,
    setReady,
    setAvatar,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoom must be used inside RoomProvider");
  }
  return ctx;
}
