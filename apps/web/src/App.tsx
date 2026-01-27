import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import RoundGallery from "./views/RoundGallery";
import { useJoinRoom } from "./hooks/useJoinRoom";

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

function JoinScene() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const code = params.get("code")?.toUpperCase();
  useJoinRoom({ roomCode: code ?? undefined });
  return <Scene variant="join" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/join" element={<JoinScene />} />
          <Route path="/lobby" element={<Scene variant="lobby" />} />
          <Route path="/game" element={<RoundGallery />} />
          <Route path="/result" element={<Scene variant="result" />} />
          <Route path="*" element={<Navigate to="/join" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
