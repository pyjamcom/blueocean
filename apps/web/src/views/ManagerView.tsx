import { useMemo } from "react";
import { useRoom } from "../context/RoomContext";
import JoinView from "./JoinView";
import LobbyView from "./LobbyView";
import RoundGallery from "./RoundGallery";
import ResultView from "./ResultView";

export default function ManagerView() {
  const { phase, roomCode } = useRoom();

  const view = useMemo(() => {
    if (!roomCode) {
      return <JoinView />;
    }
    switch (phase) {
      case "join":
        return <JoinView />;
      case "lobby":
        return <LobbyView />;
      case "prepared":
      case "round":
      case "reveal":
        return <RoundGallery />;
      case "leaderboard":
      case "end":
      default:
        return <ResultView />;
    }
  }, [phase, roomCode]);

  return view;
}
