import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AgeGate from "./components/AgeGate";
import HelpButton from "./components/HelpButton";
import { registerErrorHandlers } from "./utils/telemetry";
import RoundGallery from "./views/RoundGallery";
import JoinView from "./views/JoinView";
import LobbyView from "./views/LobbyView";
import JoinWaitView from "./views/JoinWaitView";
import ResultView from "./views/ResultView";

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
        <Routes>
          <Route path="/join" element={<JoinView />} />
          <Route path="/:code" element={<JoinView />} />
          <Route path="/lobby" element={<LobbyView />} />
          <Route path="/game" element={<RoundGallery />} />
          <Route path="/result" element={<ResultView />} />
          <Route path="/wait" element={<JoinWaitView />} />
          <Route path="*" element={<Navigate to="/join" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
