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

interface RoomState {
  roomCode: string | null;
  playerId: string;
  isHost: boolean;
  phase: RoomPhase;
  questionIndex: number;
  roundStartAt: number | null;
  wsStatus: string;
  errors: unknown[];
  joinRoom: (roomCode?: string, avatarId?: string) => void;
  sendStage: (payload: Omit<StagePayload, "roomCode">) => void;
  startGame: () => void;
  sendAnswer: (answerIndex: number) => void;
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
  const [errors, setErrors] = useState<unknown[]>([]);
  const playerId = useMemo(() => randomPlayerId(), []);
  const joinSentRef = useRef(false);
  const pendingJoinRef = useRef<{ roomCode: string; avatarId: string } | null>(null);
  const hostTimersRef = useRef<number[]>([]);

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
          if (payload.stage?.roomCode === payload.roomCode) {
            applyStage(payload.stage);
          } else {
            applyStage({ roomCode: payload.roomCode, phase: "lobby", questionIndex: 0 });
          }
        }
        return;
      }
      if (message.type === "stage") {
        const payload = message.payload as StagePayload | undefined;
        if (payload?.roomCode && payload.phase) {
          applyStage(payload);
        }
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
        },
      });
    },
    [playerId, roomCode, roundStartAt, send],
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

  const value: RoomState = {
    roomCode,
    playerId,
    isHost,
    phase,
    questionIndex,
    roundStartAt,
    wsStatus,
    errors,
    joinRoom,
    sendStage,
    startGame,
    sendAnswer,
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
