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
const COMPLIANCE_LOG_LIMIT = 1000;
const LOG_TTL_MS = 1000 * 60 * 60 * 24 * 30;

app.use(express.json({ limit: "4kb" }));

const defaultCorsOrigins = ["https://escapers.app", "https://www.escapers.app"];
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = corsOrigins.length > 0 ? corsOrigins : defaultCorsOrigins;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedCorsOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const complianceEvents: { at: number; accepted: boolean }[] = [];
const analyticsEvents: { at: number; event: string; sessionId?: string; meta?: unknown }[] = [];

app.post("/compliance/age", (req, res) => {
  const accepted = req.body?.accepted === true;
  complianceEvents.push({ at: Date.now(), accepted });
  if (complianceEvents.length > COMPLIANCE_LOG_LIMIT) {
    complianceEvents.shift();
  }
  res.json({ ok: true });
});

app.post("/analytics", (req, res) => {
  const { event, at, sessionId, meta } = req.body ?? {};
  if (typeof event === "string") {
    analyticsEvents.push({ at: typeof at === "number" ? at : Date.now(), event, sessionId, meta });
    if (analyticsEvents.length > 2000) {
      analyticsEvents.shift();
    }
  }
  res.json({ ok: true });
});

app.post("/client-error", (req, res) => {
  const { message, source, lineno, colno } = req.body ?? {};
  if (typeof message === "string") {
    analyticsEvents.push({
      at: Date.now(),
      event: "client_error",
      meta: { message, source, lineno, colno },
    });
    if (analyticsEvents.length > 2000) {
      analyticsEvents.shift();
    }
  }
  res.json({ ok: true });
});

app.get("/metrics", (_req, res) => {
  res.json({
    ...metrics,
    roomsActive: rooms.size,
    uptimeSec: Math.floor(process.uptime()),
  });
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
const validateJoinFn = validateJoin as (data: any) => boolean;
const validateQuestionFn = validateQuestion as (data: any) => boolean;
const validateAnswerFn = validateAnswer as (data: any) => boolean;

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 1000 * 60 * 120;
const MAX_ROOM_PLAYERS = 12;
const ANSWER_COOLDOWN_MS = 700;
const INCIDENT_LOG_LIMIT = 500;

type IncidentType =
  | "rate_limit"
  | "spam_drop"
  | "room_locked"
  | "room_full"
  | "join_burst"
  | "invalid_payload";

interface Incident {
  at: number;
  type: IncidentType;
  ip?: string;
  roomCode?: string;
  playerId?: string;
  detail?: string;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

type RoomPhase = "join" | "lobby" | "round" | "reveal" | "leaderboard" | "end";

interface StagePayload {
  roomCode: string;
  phase: RoomPhase;
  questionIndex?: number;
  roundStartAt?: number;
}

interface Player {
  id: string;
  avatarId: string;
  score: number;
  correctCount: number;
  streak: number;
  lastAnswerAt?: number;
}

interface Room {
  code: string;
  players: Map<string, Player>;
  createdAt: number;
  expiresAt: number;
  locked: boolean;
  hostId?: string;
  stage?: StagePayload;
}

const rooms = new Map<string, Room>();
const incidents: Incident[] = [];
const rateBuckets = new Map<string, RateBucket>();
const socketState = new WeakMap<WebSocket, { ip: string; joinedRoom?: string; playerId?: string }>();
const answerCooldowns = new Map<string, number>();
const metrics = {
  wsConnections: 0,
  wsDisconnects: 0,
  joinSuccess: 0,
  joinFail: 0,
  answerAccepted: 0,
  answerRejected: 0,
  roomsCreated: 0,
  roomsExpired: 0,
  incidents: 0,
};

function logIncident(incident: Incident) {
  incidents.push(incident);
  metrics.incidents += 1;
  if (incidents.length > INCIDENT_LOG_LIMIT) {
    incidents.shift();
  }
  console.warn("incident", JSON.stringify(incident));
}

function resolveIp(req: http.IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const first = forwarded.split(",")[0];
    if (first) {
      return first.trim();
    }
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0];
    if (first) {
      return first.trim();
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}

function checkRate(
  key: string,
  windowMs: number,
  softMax: number,
  hardMax = softMax * 2,
): { allowed: boolean; delayMs: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, delayMs: 0 };
  }
  bucket.count += 1;
  if (bucket.count > hardMax) {
    return { allowed: false, delayMs: 0 };
  }
  if (bucket.count > softMax) {
    return { allowed: true, delayMs: 300 + Math.floor(Math.random() * 500) };
  }
  return { allowed: true, delayMs: 0 };
}

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
  const now = Date.now();
  const room: Room = {
    code: newCode,
    players: new Map(),
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    locked: false,
  };
  metrics.roomsCreated += 1;
  rooms.set(newCode, room);
  return room;
}

function touchRoom(room: Room) {
  room.expiresAt = Date.now() + ROOM_TTL_MS;
}

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function broadcastToRoom(roomCode: string, payload: unknown) {
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }
    const clientState = socketState.get(client);
    if (clientState?.joinedRoom === roomCode) {
      send(client, payload);
    }
  });
}

wss.on("connection", (socket, request) => {
  const ip = resolveIp(request);
  socketState.set(socket, { ip });
  metrics.wsConnections += 1;
  console.log("ws:connect");

  socket.on("message", (data) => {
    try {
      const state = socketState.get(socket);
      if (!state) {
        return;
      }
      const baseRate = checkRate(`msg:${state.ip}`, 2000, 12, 20);
      if (!baseRate.allowed) {
        logIncident({ at: Date.now(), type: "rate_limit", ip: state.ip, detail: "msg" });
        return;
      }

      const message: any = JSON.parse(data.toString());
      const type = message?.type;
      const payload: any = (message as any).payload;

      if (type === "join") {
        const joinPayload = payload as any;
        if (!validateJoinFn(joinPayload)) {
          send(socket, { type: "error", errors: validateJoin.errors });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "join" });
          metrics.joinFail += 1;
          return;
        }
        const joinRate = checkRate(`join:ip:${state.ip}`, 10000, 5, 10);
        if (!joinRate.allowed) {
          logIncident({ at: Date.now(), type: "rate_limit", ip: state.ip, detail: "join" });
          metrics.joinFail += 1;
          return;
        }

        const processJoin = () => {
          if (state.joinedRoom) {
            send(socket, { type: "joined", payload: { roomCode: state.joinedRoom } });
            return;
          }
          const room = getOrCreateRoom(joinPayload.roomCode);
          touchRoom(room);
          if (room.locked) {
            logIncident({ at: Date.now(), type: "room_locked", ip: state.ip, roomCode: room.code });
            metrics.joinFail += 1;
            return;
          }
          let isHost = false;
          if (!room.hostId) {
            room.hostId = joinPayload.playerId;
            isHost = true;
          } else if (room.hostId === joinPayload.playerId) {
            isHost = true;
          }
          const roomBurst = checkRate(`join:room:${room.code}`, 5000, 6, 12);
          if (!roomBurst.allowed) {
            logIncident({
              at: Date.now(),
              type: "join_burst",
              ip: state.ip,
              roomCode: room.code,
            });
            metrics.joinFail += 1;
            return;
          }
          if (roomBurst.delayMs > 0) {
            setTimeout(processJoin, roomBurst.delayMs);
            return;
          }
          if (room.players.size >= MAX_ROOM_PLAYERS) {
            send(socket, { type: "error", errors: [{ message: "room full" }] });
            logIncident({ at: Date.now(), type: "room_full", ip: state.ip, roomCode: room.code });
            metrics.joinFail += 1;
            return;
          }
          if (!room.players.has(joinPayload.playerId)) {
            room.players.set(joinPayload.playerId, {
              id: joinPayload.playerId,
              avatarId: joinPayload.avatarId,
              score: 0,
              correctCount: 0,
              streak: 0,
            });
          }
          if (!room.stage) {
            room.stage = { roomCode: room.code, phase: "lobby", questionIndex: 0 };
          }
          state.joinedRoom = room.code;
          state.playerId = joinPayload.playerId;
          send(socket, { type: "joined", payload: { roomCode: room.code, isHost, stage: room.stage } });
          metrics.joinSuccess += 1;
        };

        if (joinRate.delayMs > 0) {
          setTimeout(processJoin, joinRate.delayMs);
        } else {
          processJoin();
        }
        return;
      }

      if (type === "stage") {
        const stagePayload = payload as any;
        const phase = stagePayload?.phase as string | undefined;
        const roomCode = stagePayload?.roomCode as string | undefined;
        const allowedPhases = new Set([
          "join",
          "lobby",
          "round",
          "reveal",
          "leaderboard",
          "end",
        ]);
        if (!roomCode || !phase || !allowedPhases.has(phase)) {
          send(socket, { type: "error", errors: [{ message: "invalid stage" }] });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "stage" });
          return;
        }
        if (!state.joinedRoom || state.joinedRoom !== roomCode) {
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "stage_room" });
          return;
        }
        const room = rooms.get(roomCode);
        if (!room) {
          return;
        }
        if (room.hostId && room.hostId !== state.playerId) {
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "stage_host" });
          return;
        }
        const nextStage: StagePayload = {
          roomCode,
          phase: phase as RoomPhase,
        };
        if (typeof stagePayload.questionIndex === "number") {
          nextStage.questionIndex = stagePayload.questionIndex;
        }
        if (typeof stagePayload.roundStartAt === "number") {
          nextStage.roundStartAt = stagePayload.roundStartAt;
        }
        room.stage = nextStage;
        touchRoom(room);
        broadcastToRoom(roomCode, { type: "stage", payload: nextStage });
        return;
      }

      if (type === "question") {
        const questionPayload = payload as any;
        if (!validateQuestionFn(questionPayload)) {
          send(socket, { type: "error", errors: validateQuestion.errors });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "question" });
          return;
        }
        if (state.joinedRoom) {
          const room = rooms.get(state.joinedRoom);
          if (room) {
            touchRoom(room);
          }
        }
        send(socket, { type: "question", payload: questionPayload });
        return;
      }

      if (type === "answer") {
        const answerPayload = payload as any;
        if (!validateAnswerFn(answerPayload)) {
          send(socket, { type: "error", errors: validateAnswer.errors });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "answer" });
          metrics.answerRejected += 1;
          return;
        }
        const answerRate = checkRate(`answer:${answerPayload.playerId}`, 2000, 5, 10);
        if (!answerRate.allowed) {
          logIncident({
            at: Date.now(),
            type: "rate_limit",
            ip: state.ip,
            roomCode: answerPayload.roomCode,
            playerId: answerPayload.playerId,
            detail: "answer",
          });
          metrics.answerRejected += 1;
          return;
        }
        const cooldownKey = `${answerPayload.roomCode}:${answerPayload.playerId}`;
        const lastAnswer = answerCooldowns.get(cooldownKey) ?? 0;
        if (Date.now() - lastAnswer < ANSWER_COOLDOWN_MS) {
          logIncident({
            at: Date.now(),
            type: "spam_drop",
            ip: state.ip,
            roomCode: answerPayload.roomCode,
            playerId: answerPayload.playerId,
          });
          metrics.answerRejected += 1;
          return;
        }
        answerCooldowns.set(cooldownKey, Date.now());
        const room = rooms.get(answerPayload.roomCode);
        if (room) {
          room.locked = true;
          touchRoom(room);
        }
        send(socket, { type: "answer", payload: answerPayload });
        metrics.answerAccepted += 1;
      }
    } catch (_err) {
      const state = socketState.get(socket);
      send(socket, { type: "error", errors: [{ message: "invalid message" }] });
      logIncident({ at: Date.now(), type: "invalid_payload", ip: state?.ip, detail: "parse" });
    }
  });

  socket.on("close", () => {
    console.log("ws:disconnect");
    metrics.wsDisconnects += 1;
  });
});

server.listen(PORT, () => {
  console.log(`server listening on ${PORT}`);
});

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (room.expiresAt <= now) {
      rooms.delete(code);
      metrics.roomsExpired += 1;
    }
  });
  const cutoff = now - LOG_TTL_MS;
  while (complianceEvents.length > 0) {
    const first = complianceEvents[0];
    if (!first || first.at >= cutoff) {
      break;
    }
    complianceEvents.shift();
  }
  while (analyticsEvents.length > 0) {
    const first = analyticsEvents[0];
    if (!first || first.at >= cutoff) {
      break;
    }
    analyticsEvents.shift();
  }
}, 1000 * 60 * 5);
