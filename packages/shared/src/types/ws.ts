import { Answer } from "./answer";
import { Player } from "./player";
import { Question } from "./question";
import { Room } from "./room";

export interface JoinEvent {
  type: "join";
  player: Player;
  room: Room;
}

export interface StartEvent {
  type: "start";
  room: Room;
  seed: number;
}

export interface QuestionEvent {
  type: "question";
  question: Question;
  timer_ms: number;
}

export interface AnswerEvent {
  type: "answer";
  player: Player;
  answer: Answer;
  latency_ms: number;
}

export interface ScoreEntry {
  player_id: string;
  score: number;
  rank: number;
  streak: number;
}

export interface ScoreEvent {
  type: "score";
  leaderboard: ScoreEntry[];
}

export interface NextEvent {
  type: "next";
  next_question_id: string;
}

export type WsEvent =
  | JoinEvent
  | StartEvent
  | QuestionEvent
  | AnswerEvent
  | ScoreEvent
  | NextEvent;
