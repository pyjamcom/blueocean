import { useMemo, useState } from "react";
import { useWsClient } from "./useWsClient";
import { getOrCreateClientId, randomId } from "../utils/ids";
import { trackEvent } from "../utils/analytics";

export interface UseJoinRoomOptions {
  roomCode?: string;
  avatarId?: string;
  playerName?: string;
}

export function useJoinRoom({ roomCode, avatarId = "avatar_raccoon_dj", playerName }: UseJoinRoomOptions) {
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);
  const [errors, setErrors] = useState<unknown[]>([]);

  const code = useMemo(() => roomCode ?? randomId(4), [roomCode]);
  const playerId = useMemo(() => getOrCreateClientId(), []);

  const wsUrl =
    import.meta.env.VITE_WS_URL ??
    (typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss://ws.escapers.app"
      : "ws://localhost:3001");

  const { status, send } = useWsClient({
    url: wsUrl,
    onOpen: () => {
      const safeName = playerName?.trim();
      const payload: Record<string, string> = { roomCode: code, playerId, avatarId };
      if (safeName) {
        payload.playerName = safeName.slice(0, 18);
      }
      send({
        type: "join",
        payload,
      });
    },
    onMessage: (message) => {
      if (message.type === "joined") {
        const payload = message.payload as { roomCode?: string } | undefined;
        if (payload?.roomCode) {
          setJoinedRoom(payload.roomCode);
          trackEvent("join_room", { roomCode: payload.roomCode });
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
