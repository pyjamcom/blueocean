import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWsClient } from "../hooks/useWsClient";
import { getOrCreateClientId, randomId } from "../utils/ids";
import { questionBank, QuestionRecord } from "../data/questions";
import { mapStageToQuestionIndex, shuffleQuestionAnswers } from "../utils/questionShuffle";

export type RoomPhase = "join" | "lobby" | "prepared" | "round" | "reveal" | "leaderboard" | "end";

export interface StagePayload {
  roomCode: string;
  phase: RoomPhase;
  questionIndex?: number;
  roundStartAt?: number;
}

export interface RoomPlayer {
  id: string;
  avatarId: string;
  name?: string;
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
  currentQuestion: (QuestionRecord & { questionIndex?: number }) | null;
  joinedAt: number | null;
  players: RoomPlayer[];
  answerCounts: [number, number, number, number];
  lastSelfPoints: number;
  wsStatus: string;
  errors: unknown[];
  joinRoom: (roomCode?: string, avatarId?: string, playerName?: string) => void;
  resetRoom: () => void;
  sendStage: (payload: Omit<StagePayload, "roomCode">) => void;
  startGame: () => void;
  sendAnswer: (answerIndex: number) => void;
  setReady: (ready: boolean) => void;
  setAvatar: (avatarId: string) => void;
  setName: (name: string) => void;
  createNextRoom: (roomCode?: string, avatarId?: string, playerName?: string) => void;
}

const RoomContext = createContext<RoomState | null>(null);

const MIN_ROOM_PLAYERS = 3;

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [phase, setPhase] = useState<RoomPhase>("join");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [roundStartAt, setRoundStartAt] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<(QuestionRecord & { questionIndex?: number }) | null>(null);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [answerCounts, setAnswerCounts] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const [lastSelfPoints, setLastSelfPoints] = useState(0);
  const [errors, setErrors] = useState<unknown[]>([]);
  const playerId = useMemo(() => getOrCreateClientId(), []);
  const joinSentRef = useRef(false);
  const pendingJoinRef = useRef<{ roomCode: string; avatarId: string; playerName?: string } | null>(null);
  const awaitingLeaveRef = useRef(false);
  const hostTimersRef = useRef<number[]>([]);
  const answeredByQuestionRef = useRef<Record<number, Set<string>>>({});
  const sentQuestionsRef = useRef<Set<number>>(new Set());
  const autoStartRef = useRef(false);

  const wsUrl =
    import.meta.env.VITE_WS_URL ??
    (typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss://ws.escapers.app"
      : "ws://localhost:3001");

  const applyStage = useCallback((payload: StagePayload) => {
    setPhase(payload.phase);
    if (typeof payload.questionIndex === "number") {
      setQuestionIndex(payload.questionIndex);
    }
    if (typeof payload.roundStartAt === "number") {
      setRoundStartAt(payload.roundStartAt);
    } else if (payload.phase !== "round" && payload.phase !== "prepared") {
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
              name?: string;
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
          name: player.name ?? existing?.name,
          ready: player.ready === true,
          score: player.score ?? existing?.score ?? 0,
          correctCount: player.correctCount ?? existing?.correctCount ?? 0,
          streak: player.streak ?? existing?.streak ?? 0,
        };
      });
    });
  }, []);

  const { status: wsStatus, send, disconnect } = useWsClient({
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
          setLastSelfPoints(0);
          if (payload.stage?.roomCode === payload.roomCode) {
            applyStage(payload.stage);
          } else {
            applyStage({ roomCode: payload.roomCode, phase: "lobby", questionIndex: 0 });
          }
        }
        return;
      }
      if (message.type === "roster") {
        const payload = message.payload as
          | { players?: Array<{ id: string; avatarId: string; ready?: boolean }>; hostId?: string }
          | undefined;
        mergeRoster(payload);
        if (payload?.hostId) {
          setIsHost(payload.hostId === playerId);
        }
        return;
      }
      if (message.type === "left") {
        awaitingLeaveRef.current = false;
        joinSentRef.current = false;
        flushJoin();
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
      if (message.type === "question") {
        const payload = message.payload as (QuestionRecord & { questionIndex?: number }) | undefined;
        if (payload?.id) {
          const incomingIndex =
            typeof payload.questionIndex === "number" ? payload.questionIndex : questionIndex;
          if (typeof payload.questionIndex === "number") {
            setQuestionIndex(payload.questionIndex);
          }
          const resolvedIndex = mapStageToQuestionIndex(roomCode, incomingIndex, questionBank.length);
          const baseQuestion = questionBank[resolvedIndex];
          if (baseQuestion) {
            const shuffled = shuffleQuestionAnswers(baseQuestion, roomCode, incomingIndex);
            setCurrentQuestion({ ...shuffled, questionIndex: incomingIndex });
          } else {
            setCurrentQuestion(payload);
          }
        }
        return;
      }
      if (message.type === "score") {
        const payload = message.payload as
          | { players?: Array<{ id: string; avatarId: string; name?: string; ready?: boolean; score?: number; correctCount?: number; streak?: number }> }
          | undefined;
        if (!payload?.players) {
          return;
        }
        setPlayers((prev) => {
          const prevMap = new Map(prev.map((player) => [player.id, player]));
          const nextPlayers = payload.players.map((player) => ({
            id: player.id,
            avatarId: player.avatarId,
            name: player.name,
            ready: player.ready === true,
            score: player.score ?? 0,
            correctCount: player.correctCount ?? 0,
            streak: player.streak ?? 0,
          }));
          const prevSelf = prevMap.get(playerId);
          const nextSelf = nextPlayers.find((player) => player.id === playerId);
          if (prevSelf && nextSelf) {
            const delta = nextSelf.score - prevSelf.score;
            if (delta !== 0) {
              setLastSelfPoints(delta);
            }
          }
          return nextPlayers;
        });
        return;
      }
      if (message.type === "error" && Array.isArray(message.errors)) {
        setErrors(message.errors);
        joinSentRef.current = false;
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
    const safeName = pending.playerName?.trim();
    const payload: {
      roomCode: string;
      playerId: string;
      avatarId: string;
      playerName?: string;
    } = {
      roomCode: pending.roomCode,
      playerId,
      avatarId: pending.avatarId,
    };
    if (safeName) {
      payload.playerName = safeName.slice(0, 18);
    }
    send({
      type: "join",
      payload,
    });
    joinSentRef.current = true;
  }, [playerId, send, wsStatus]);

  useEffect(() => {
    if (wsStatus === "open") {
      flushJoin();
    }
  }, [flushJoin, wsStatus]);

  const joinRoom = useCallback(
    (requestedRoom?: string, avatarId = "avatar_raccoon_dj", playerName?: string) => {
      const room = requestedRoom ?? randomId(4);
      pendingJoinRef.current = { roomCode: room, avatarId, playerName };
      setErrors([]);
      joinSentRef.current = false;
      flushJoin();
    },
    [flushJoin],
  );

  const clearHostTimers = useCallback(() => {
    hostTimersRef.current.forEach((id) => window.clearTimeout(id));
    hostTimersRef.current = [];
  }, []);

  const resetLocalState = useCallback(() => {
    clearHostTimers();
    setRoomCode(null);
    setIsHost(false);
    setPhase("join");
    setQuestionIndex(0);
    setRoundStartAt(null);
    setCurrentQuestion(null);
    setJoinedAt(null);
    setPlayers([]);
    setAnswerCounts([0, 0, 0, 0]);
    setLastSelfPoints(0);
    setErrors([]);
    sentQuestionsRef.current.clear();
    answeredByQuestionRef.current = {};
  }, [clearHostTimers]);

  const createNextRoom = useCallback(
    (targetRoom = randomId(4), avatarId = "avatar_raccoon_dj", playerName?: string) => {
      const nextRoom = targetRoom;
      pendingJoinRef.current = { roomCode: nextRoom, avatarId, playerName };
      joinSentRef.current = false;
      resetLocalState();
      if (roomCode && wsStatus === "open") {
        awaitingLeaveRef.current = true;
        send({ type: "leave", payload: { roomCode, playerId } });
        return;
      }
      flushJoin();
    },
    [flushJoin, playerId, resetLocalState, roomCode, send, wsStatus],
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
    sendStage({ phase: "prepared", questionIndex: 0 });
  }, [roomCode, sendStage]);

  useEffect(() => {
    if (phase !== "lobby") {
      autoStartRef.current = false;
      return;
    }
    if (!isHost || !roomCode) {
      autoStartRef.current = false;
      return;
    }
    const readyCount = players.filter((player) => player.ready).length;
    const selfReady = players.find((player) => player.id === playerId)?.ready === true;
    if (selfReady && readyCount >= MIN_ROOM_PLAYERS) {
      if (!autoStartRef.current) {
        autoStartRef.current = true;
        startGame();
      }
      return;
    }
    autoStartRef.current = false;
  }, [isHost, phase, playerId, players, roomCode, startGame]);

  const sendAnswer = useCallback(
    (answerIndex: number) => {
      if (!roomCode) return;
      const latencyMs = roundStartAt ? Math.max(0, Math.round(Date.now() - roundStartAt)) : 0;
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

  const setName = useCallback(
    (name: string) => {
      if (!roomCode) return;
      const safeName = name.trim().slice(0, 18);
      if (!safeName) return;
      send({
        type: "name",
        payload: {
          roomCode,
          playerId,
          name: safeName,
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

  const resetRoom = useCallback(() => {
    clearHostTimers();
    disconnect();
    setRoomCode(null);
    setIsHost(false);
    setPhase("join");
    setQuestionIndex(0);
    setRoundStartAt(null);
    setCurrentQuestion(null);
    setJoinedAt(null);
    setPlayers([]);
    setAnswerCounts([0, 0, 0, 0]);
    setErrors([]);
    joinSentRef.current = false;
    pendingJoinRef.current = null;
    sentQuestionsRef.current.clear();
    answeredByQuestionRef.current = {};
  }, [clearHostTimers, disconnect]);

  useEffect(() => {
    clearHostTimers();
    if (!isHost || !roomCode) {
      return clearHostTimers;
    }
    if (phase !== "prepared" && phase !== "round") {
      return clearHostTimers;
    }
    const resolvedIndex = mapStageToQuestionIndex(roomCode, questionIndex, questionBank.length);
    const baseQuestion = questionBank[resolvedIndex];
    const question = baseQuestion
      ? shuffleQuestionAnswers(baseQuestion, roomCode, questionIndex)
      : undefined;
    if (question && !sentQuestionsRef.current.has(questionIndex)) {
      const sanitizedAnswers = question.answers.map((answer) => {
        const payload: { id: string; asset_id: string; image_url?: string } = {
          id: answer.id,
          asset_id: answer.asset_id ?? "",
        };
        if (answer.image_url) {
          payload.image_url = answer.image_url;
        }
        return payload;
      });
      send({
        type: "question",
        payload: {
          id: question.id,
          questionIndex,
          prompt_image: question.prompt_image,
          answers: sanitizedAnswers,
          correct_index: question.correct_index,
          duration_ms: question.duration_ms,
        },
      });
      sentQuestionsRef.current.add(questionIndex);
    }
    return clearHostTimers;
  }, [clearHostTimers, isHost, phase, questionIndex, roomCode, send]);

  useEffect(() => {
    sentQuestionsRef.current.clear();
  }, [roomCode]);

  useEffect(() => {
    setCurrentQuestion(null);
    answeredByQuestionRef.current[questionIndex] = new Set();
    setAnswerCounts([0, 0, 0, 0]);
    setLastSelfPoints(0);
  }, [questionIndex]);

  const value: RoomState = {
    roomCode,
    playerId,
    isHost,
    phase,
    questionIndex,
    roundStartAt,
    currentQuestion,
    joinedAt,
    players,
    answerCounts,
    lastSelfPoints,
    wsStatus,
    errors,
    joinRoom,
    resetRoom,
    sendStage,
    startGame,
    sendAnswer,
    setReady,
    setAvatar,
    setName,
    createNextRoom,
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
