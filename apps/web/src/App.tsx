import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

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
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/join" element={<Scene variant="join" />} />
          <Route path="/lobby" element={<Scene variant="lobby" />} />
          <Route path="/game" element={<Scene variant="game" />} />
          <Route path="/result" element={<Scene variant="result" />} />
          <Route path="*" element={<Navigate to="/join" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
