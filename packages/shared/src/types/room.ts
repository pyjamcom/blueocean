import { Player } from "./player";
import { Question } from "./question";

export enum RoomState {
  Lobby = "lobby",
  Prepared = "prepared",
  Round = "round",
  Reveal = "reveal",
  Leaderboard = "leaderboard",
  End = "end"
}

export interface Room {
  code: string;
  players: Player[];
  state: RoomState;
  current_question: Question | null;
  started_at?: number;
}
