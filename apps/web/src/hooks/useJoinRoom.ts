import { useMemo, useState } from "react";
import { useWsClient } from "./useWsClient";
import { randomId, randomPlayerId } from "../utils/ids";

export interface UseJoinRoomOptions {
  roomCode?: string;
  avatarId?: string;
}

export function useJoinRoom({ roomCode, avatarId = "avatar_disco_sloth" }: UseJoinRoomOptions) {
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);
  const [errors, setErrors] = useState<unknown[]>([]);

  const code = useMemo(() => roomCode ?? randomId(4), [roomCode]);
  const playerId = useMemo(() => randomPlayerId(), []);

  const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

  const { status, send } = useWsClient({
    url: wsUrl,
    onOpen: () => {
      send({
        type: "join",
        payload: {
          roomCode: code,
          playerId,
          avatarId,
        },
      });
    },
    onMessage: (message) => {
      if (message.type === "joined") {
        const payload = message.payload as { roomCode?: string } | undefined;
        if (payload?.roomCode) {
          setJoinedRoom(payload.roomCode);
        }
      }
      if (message.type === "error") {
        if (Array.isArray(message.errors)) {
          setErrors(message.errors);
        }
      }
    },
  });

  return {
    status,
    roomCode: joinedRoom ?? code,
    playerId,
    errors,
  };
}
