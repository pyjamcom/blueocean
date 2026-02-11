import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AgeGate from "./components/AgeGate";
import HelpButton from "./components/HelpButton";
import { EngagementProvider } from "./context/EngagementContext";
import { RoomProvider, RoomPhase, useRoom } from "./context/RoomContext";
import { registerErrorHandlers } from "./utils/telemetry";
import RoundGallery from "./views/RoundGallery";
import JoinView from "./views/JoinView";
import LobbyView from "./views/LobbyView";
import JoinWaitView from "./views/JoinWaitView";
import ResultView from "./views/ResultView";
import ManagerView from "./views/ManagerView";
import DebugLeaderboardView from "./views/DebugLeaderboardView";
import LeaderboardView from "./views/LeaderboardView";
import LegalView from "./views/LegalView";
import { JOIN_META_DESCRIPTION, JOIN_SHARE_IMAGE, LEADERBOARD_SHARE_IMAGE } from "./utils/seo";

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

type SeoConfig = {
  title: string;
  description: string;
  keywords?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  twitterCard?: string;
  twitterImage?: string;
  robots: string;
};

const SEO_JOIN: SeoConfig = {
  title: "Escapers - Party Games & Meme Quiz with Friends",
  description: JOIN_META_DESCRIPTION,
  keywords:
    "party games, meme game, funny quiz, party quiz, friends quiz, icebreaker games, online quiz, group game, fun party games",
  canonical: "https://escapers.app/join",
  ogTitle: "Escapers - Party Games & Meme Quiz with Friends",
  ogDescription: JOIN_META_DESCRIPTION,
  ogUrl: "https://escapers.app/join",
  ogImage: JOIN_SHARE_IMAGE,
  twitterCard: "summary_large_image",
  twitterImage: JOIN_SHARE_IMAGE,
  robots: "index, follow",
};

const SEO_LEADERBOARD: SeoConfig = {
  title: "Escapers Leaderboard - Party Quiz & Friends Quiz",
  description: JOIN_META_DESCRIPTION,
  keywords:
    "party games, party quiz, friends quiz, meme game, group game, fun party games, hilarious party games",
  canonical: "https://escapers.app/leaderboard",
  ogTitle: "Escapers Leaderboard - Party Quiz & Friends Quiz",
  ogDescription: JOIN_META_DESCRIPTION,
  ogUrl: "https://escapers.app/leaderboard",
  ogImage: LEADERBOARD_SHARE_IMAGE,
  twitterCard: "summary_large_image",
  twitterImage: LEADERBOARD_SHARE_IMAGE,
  robots: "index, follow",
};

const SEO_DEFAULT: SeoConfig = {
  title: "Escapers",
  description: "Party games and meme quiz with friends.",
  robots: "noindex, nofollow",
};

function setMetaTag(attr: "name" | "property", value: string, content?: string) {
  const selector = `meta[${attr}=\"${value}\"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  const tag = existing ?? document.createElement("meta");
  tag.setAttribute(attr, value);
  tag.setAttribute("content", content);
  if (!existing) {
    document.head.appendChild(tag);
  }
}

function setCanonicalLink(href?: string) {
  const existing = document.head.querySelector<HTMLLinkElement>("link[rel=\"canonical\"]");
  if (!href) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  const link = existing ?? document.createElement("link");
  link.setAttribute("rel", "canonical");
  link.setAttribute("href", href);
  if (!existing) {
    document.head.appendChild(link);
  }
}

function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const upper = path.toUpperCase();
    const isJoin = path === "/" || path === "/join";
    const isLeaderboard = path === "/leaderboard";
    const isJoinCode = /^\/[A-Z0-9]{4}$/.test(upper);

    const config = isJoin ? SEO_JOIN : isLeaderboard ? SEO_LEADERBOARD : SEO_DEFAULT;
    const robots = isJoin || isLeaderboard ? config.robots : "noindex, nofollow";

    document.title = config.title;
    setMetaTag("name", "description", config.description);
    setMetaTag("name", "keywords", config.keywords);
    setMetaTag("name", "robots", robots);

    setMetaTag("property", "og:title", config.ogTitle ?? config.title);
    setMetaTag("property", "og:description", config.ogDescription ?? config.description);
    setMetaTag("property", "og:type", "website");
    setMetaTag("property", "og:url", config.ogUrl ?? window.location.href);
    setMetaTag("property", "og:image", config.ogImage);
    setMetaTag("property", "og:image:width", config.ogImage ? "1200" : undefined);
    setMetaTag("property", "og:image:height", config.ogImage ? "630" : undefined);
    setMetaTag("property", "og:image:alt", config.ogTitle ?? config.title);

    setMetaTag("name", "twitter:card", config.twitterCard);
    setMetaTag("name", "twitter:title", config.ogTitle ?? config.title);
    setMetaTag("name", "twitter:description", config.ogDescription ?? config.description);
    setMetaTag("name", "twitter:image", config.twitterImage ?? config.ogImage);

    if (isJoin) {
      setCanonicalLink(SEO_JOIN.canonical);
    } else if (isLeaderboard) {
      setCanonicalLink(SEO_LEADERBOARD.canonical);
    } else if (isJoinCode) {
      setCanonicalLink(SEO_JOIN.canonical);
    } else {
      setCanonicalLink(undefined);
    }
  }, [location.pathname]);

  return null;
}

function StageNavigator() {
  const { phase, roomCode, joinedAt, roundStartAt, isHost, players } = useRoom();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const path = location.pathname.toUpperCase();
    const isDebugPath = location.pathname.startsWith("/debug");
    const isLeaderboardPath = location.pathname === "/leaderboard";
    const isManagerPath = location.pathname === "/manager";
    const isLegalPath = location.pathname.startsWith("/legal");
    const isJoinPath =
      location.pathname === "/join" || /^\/[A-Z0-9]{4}$/.test(path);
    const searchParams = new URLSearchParams(location.search);
    const allowPreview = searchParams.get("preview") === "1";
    const isPublicRoom = roomCode === "PLAY";

    if ((isDebugPath && allowPreview) || isLeaderboardPath || isLegalPath) {
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
      <EngagementProvider>
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
            <SeoManager />
            <StageNavigator />
            <Routes>
              <Route path="/join" element={<JoinView />} />
              <Route path="/:code" element={<JoinView />} />
              <Route path="/lobby" element={<LobbyView />} />
              <Route path="/game" element={<RoundGallery />} />
              <Route path="/result" element={<ResultView />} />
              <Route path="/legal/privacy" element={<LegalView doc="privacy" />} />
              <Route path="/legal/terms" element={<LegalView doc="terms" />} />
              <Route path="/legal/data-deletion" element={<LegalView doc="data-deletion" />} />
              <Route path="/manager" element={<ManagerView />} />
              <Route path="/debug/leaderboard" element={<DebugLeaderboardView />} />
              <Route path="/leaderboard" element={<LeaderboardView />} />
              <Route path="/wait" element={<JoinWaitView />} />
              <Route path="*" element={<Navigate to="/join" replace />} />
            </Routes>
          </div>
        </RoomProvider>
      </EngagementProvider>
    </BrowserRouter>
  );
}
