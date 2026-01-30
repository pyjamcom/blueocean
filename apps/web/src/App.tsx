import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AgeGate from "./components/AgeGate";
import HelpButton from "./components/HelpButton";
import { RoomProvider, RoomPhase, useRoom } from "./context/RoomContext";
import { registerErrorHandlers } from "./utils/telemetry";
import RoundGallery from "./views/RoundGallery";
import JoinPinView from "./views/JoinPinView";
import JoinNameView from "./views/JoinNameView";
import LobbyView from "./views/LobbyView";
import JoinWaitView from "./views/JoinWaitView";
import ResultView from "./views/ResultView";
import ManagerView from "./views/ManagerView";
import DebugLeaderboardView from "./views/DebugLeaderboardView";

const sceneStyles: Record<string, React.CSSProperties> = {
  join: { "--accent": "#ff6b6b" } as React.CSSProperties,
  lobby: { "--accent": "#ffd166" } as React.CSSProperties,
  game: { "--accent": "#4dabf7" } as React.CSSProperties,
  result: { "--accent": "#63e6be" } as React.CSSProperties,
};

function Scene({ variant }: { variant: keyof typeof sceneStyles }) {
  return (
    <div className={`scene scene--${variant}`} style={sceneStyles[variant]}>
      <div className="orb orb--main" />
      <div className="orb orb--a" />
      <div className="orb orb--b" />
      <div className="orb orb--c" />
      <div className="ring" />
      <div className="spark spark--a" />
      <div className="spark spark--b" />
      <div className="stamp" />
    </div>
  );
}

const phaseRoutes: Record<RoomPhase, string> = {
  join: "/join",
  lobby: "/lobby",
  prepared: "/game",
  round: "/game",
  reveal: "/game",
  leaderboard: "/result",
  end: "/result",
};

const MIN_PLAYERS = 3;

function StageNavigator() {
  const { phase, roomCode, joinedAt, roundStartAt, isHost, players } = useRoom();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname.toUpperCase();
    const isDebugPath = location.pathname.startsWith("/debug");
    const isManagerPath = location.pathname === "/manager";
    const isJoinPath =
      location.pathname === "/join" ||
      location.pathname === "/join/name" ||
      /^\/[A-Z0-9]{4}$/.test(path);
    const searchParams = new URLSearchParams(location.search);
    const allowPreview = searchParams.get("preview") === "1";
    const isPublicRoom = roomCode === "PLAY";

    if (isDebugPath && allowPreview) {
      return;
    }

    if (!roomCode) {
      if (!isJoinPath && !isManagerPath) {
        navigate("/join", { replace: true });
      }
      return;
    }

    if (isManagerPath) {
      return;
    }

    const hostWaitKey = typeof window !== "undefined" ? window.localStorage.getItem("escapers_host_wait") : null;
    const hostWaiting = Boolean(hostWaitKey && hostWaitKey === roomCode && isHost);
    if (hostWaiting && players.length < MIN_PLAYERS) {
      if (location.pathname !== "/join") {
        navigate("/join", { replace: true });
      }
      return;
    }

    if (isPublicRoom && phase !== "lobby" && phase !== "join") {
      return;
    }

    const shouldWait =
      phase !== "lobby" &&
      phase !== "join" &&
      typeof joinedAt === "number" &&
      typeof roundStartAt === "number" &&
      joinedAt > roundStartAt;
    const target = shouldWait ? "/wait" : phaseRoutes[phase] ?? "/join";
    const nextTarget = target;
    if (location.pathname !== nextTarget) {
      navigate(nextTarget, { replace: true });
    }
  }, [joinedAt, location.pathname, navigate, phase, roomCode, roundStartAt, isHost, players.length]);

  return null;
}

export default function App() {
  const [gateStatus, setGateStatus] = useState<"prompt" | "accepted" | "blocked">("prompt");

  useEffect(() => {
    const stored = window.localStorage.getItem("age_gate");
    if (stored === "accepted") {
      setGateStatus("accepted");
      return;
    }
    setGateStatus("prompt");
  }, []);

  useEffect(() => {
    registerErrorHandlers();
  }, []);

  const logCompliance = () => {
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    const payload = JSON.stringify({ accepted: true, at: Date.now() });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(`${apiBase}/compliance/age`, blob);
      return;
    }
    fetch(`${apiBase}/compliance/age`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => undefined);
  };

  const handleAccept = () => {
    window.localStorage.setItem("age_gate", "accepted");
    logCompliance();
    setGateStatus("accepted");
  };

  const handleReject = () => {
    setGateStatus("blocked");
  };

  const handleExit = () => {
    window.location.href = "about:blank";
  };

  return (
    <BrowserRouter>
      <RoomProvider>
        <div className="app">
          {gateStatus !== "accepted" && (
            <AgeGate
              status={gateStatus === "blocked" ? "blocked" : "prompt"}
              onAccept={handleAccept}
              onReject={handleReject}
              onExit={handleExit}
            />
          )}
          <HelpButton />
          <StageNavigator />
          <Routes>
            <Route path="/join" element={<JoinPinView />} />
            <Route path="/join/name" element={<JoinNameView />} />
            <Route path="/:code" element={<JoinNameView />} />
            <Route path="/lobby" element={<LobbyView />} />
            <Route path="/game" element={<RoundGallery />} />
            <Route path="/result" element={<ResultView />} />
            <Route path="/manager" element={<ManagerView />} />
            <Route path="/debug/leaderboard" element={<DebugLeaderboardView />} />
            <Route path="/wait" element={<JoinWaitView />} />
            <Route path="*" element={<Navigate to="/join" replace />} />
          </Routes>
        </div>
      </RoomProvider>
    </BrowserRouter>
  );
}
