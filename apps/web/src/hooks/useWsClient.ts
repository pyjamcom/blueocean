import { useCallback, useEffect, useRef, useState } from "react";

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface WsMessage {
  type: string;
  payload?: unknown;
  errors?: unknown;
}

export interface UseWsClientOptions {
  url: string;
  autoConnect?: boolean;
  onMessage?: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useWsClient({ url, autoConnect = true, onMessage, onOpen, onClose }: UseWsClientOptions) {
  const [status, setStatus] = useState<WsStatus>("idle");
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current) {
      return;
    }
    setStatus("connecting");
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("open");
      onOpen?.();
    });

    socket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as WsMessage;
        onMessage?.(parsed);
      } catch (_err) {
        onMessage?.({ type: "error", errors: [{ message: "invalid payload" }] });
      }
    });

    socket.addEventListener("close", () => {
      setStatus("closed");
      socketRef.current = null;
      onClose?.();
    });

    socket.addEventListener("error", () => {
      setStatus("error");
    });
  }, [onClose, onMessage, onOpen, url]);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const send = useCallback((payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return { status, connect, disconnect, send };
}
