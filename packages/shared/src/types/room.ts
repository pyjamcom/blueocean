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

export type ScoringMode = "speed" | "accuracy";
export type PointsMultiplier = 0 | 1 | 2;

export interface RoomSettings {
  scoringMode: ScoringMode;
  pointsMultiplier: PointsMultiplier;
}

export interface Room {
  code: string;
  players: Player[];
  state: RoomState;
  current_question: Question | null;
  started_at?: number;
  settings: RoomSettings;
}
