import express from "express";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemasDir = path.join(__dirname, "..", "schemas", "ws");
const joinSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "join.schema.json"), "utf-8"));
const questionSchema = JSON.parse(
  fs.readFileSync(path.join(schemasDir, "question.schema.json"), "utf-8"),
);
const answerSchema = JSON.parse(
  fs.readFileSync(path.join(schemasDir, "answer.schema.json"), "utf-8"),
);

const validateJoin = ajv.compile(joinSchema);
const validateQuestion = ajv.compile(questionSchema);
const validateAnswer = ajv.compile(answerSchema);

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface Player {
  id: string;
  avatarId: string;
  score: number;
  correctCount: number;
  streak: number;
}

interface Room {
  code: string;
  players: Map<string, Player>;
}

const rooms = new Map<string, Room>();

function generateRoomCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function getOrCreateRoom(code?: string): Room {
  if (code && rooms.has(code)) {
    return rooms.get(code)!;
  }
  const newCode = code || generateRoomCode(4 + Math.floor(Math.random() * 3));
  const room: Room = { code: newCode, players: new Map() };
  rooms.set(newCode, room);
  return room;
}

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

wss.on("connection", (socket) => {
  console.log("ws:connect");

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      if (type === "join") {
        if (!validateJoin(payload)) {
          send(socket, { type: "error", errors: validateJoin.errors });
          return;
        }
        const room = getOrCreateRoom(payload.roomCode);
        if (room.players.size >= 12) {
          send(socket, { type: "error", errors: [{ message: "room full" }] });
          return;
        }
        if (!room.players.has(payload.playerId)) {
          room.players.set(payload.playerId, {
            id: payload.playerId,
            avatarId: payload.avatarId,
            score: 0,
            correctCount: 0,
            streak: 0,
          });
        }
        send(socket, { type: "joined", payload: { roomCode: room.code } });
        return;
      }

      if (type === "question") {
        if (!validateQuestion(payload)) {
          send(socket, { type: "error", errors: validateQuestion.errors });
          return;
        }
        send(socket, { type: "question", payload });
        return;
      }

      if (type === "answer") {
        if (!validateAnswer(payload)) {
          send(socket, { type: "error", errors: validateAnswer.errors });
          return;
        }
        send(socket, { type: "answer", payload });
      }
    } catch (_err) {
      send(socket, { type: "error", errors: [{ message: "invalid message" }] });
    }
  });

  socket.on("close", () => {
    console.log("ws:disconnect");
  });
});

server.listen(PORT, () => {
  console.log(`server listening on ${PORT}`);
});
