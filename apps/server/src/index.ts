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
const TEST_API_ENABLED = process.env.TEST_API_ENABLED === "true";
const TEST_API_TOKEN = process.env.TEST_API_TOKEN;

app.use(express.json({ limit: "4kb" }));

const defaultCorsOrigins = ["https://escapers.app", "https://www.escapers.app"];
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = corsOrigins.length > 0 ? corsOrigins : defaultCorsOrigins;

function isTestAuthorized(req: express.Request) {
  if (!TEST_API_ENABLED) {
    return false;
  }
  if (!TEST_API_TOKEN) {
    return true;
  }
  const headerToken = req.header("x-test-token");
  const authHeader = req.header("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  return headerToken === TEST_API_TOKEN || bearerToken === TEST_API_TOKEN;
}

const testRouter = express.Router();
testRouter.use((req, res, next) => {
  if (!isTestAuthorized(req)) {
    res.status(TEST_API_ENABLED ? 401 : 404).json({ ok: false, error: "test api disabled" });
    return;
  }
  next();
});
app.use("/test", testRouter);

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
const allowedPhases = new Set<RoomPhase>(["join", "lobby", "round", "reveal", "leaderboard", "end"]);
const isRoomPhase = (value: unknown): value is RoomPhase =>
  typeof value === "string" && allowedPhases.has(value as RoomPhase);

interface StagePayload {
  roomCode: string;
  phase: RoomPhase;
  questionIndex?: number;
  roundStartAt?: number;
}

interface Player {
  id: string;
  avatarId: string;
  ready: boolean;
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
  currentQuestionIndex?: number;
  questionsByIndex: Map<number, { correctIndex: number; durationMs: number }>;
  answeredByIndex: Map<number, Set<string>>;
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
    questionsByIndex: new Map(),
    answeredByIndex: new Map(),
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

function buildRoster(room: Room) {
  return Array.from(room.players.values()).map((player) => ({
    id: player.id,
    avatarId: player.avatarId,
    ready: player.ready,
    score: player.score,
    correctCount: player.correctCount,
    streak: player.streak,
  }));
}

function broadcastRoster(room: Room) {
  broadcastToRoom(room.code, {
    type: "roster",
    payload: {
      roomCode: room.code,
      players: buildRoster(room),
      hostId: room.hostId,
    },
  });
}

function buildScorePayload(room: Room) {
  const players = Array.from(room.players.values());
  const sorted = [...players].sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
  const leaderboardTop5 = sorted.slice(0, 5).map((player, index) => ({
    playerId: player.id,
    avatarId: player.avatarId,
    score: player.score,
    correctCount: player.correctCount,
    rank: index + 1,
  }));
  const podiumTop3 = leaderboardTop5.slice(0, 3);
  return {
    roomCode: room.code,
    mode: "speed",
    players: players.map((player) => ({
      id: player.id,
      avatarId: player.avatarId,
      ready: player.ready,
      score: player.score,
      correctCount: player.correctCount,
      streak: player.streak,
    })),
    leaderboardTop5,
    podiumTop3,
  };
}

function calculateScore(params: { isCorrect: boolean; latencyMs: number; durationMs: number; multiplier?: number }) {
  if (!params.isCorrect) {
    return { points: 0, correctIncrement: 0, streakDelta: -1 };
  }
  const multiplier = params.multiplier ?? 1;
  const pointsPossible = 1000 * multiplier;
  if (params.latencyMs <= 500) {
    return { points: pointsPossible, correctIncrement: 1, streakDelta: 1 };
  }
  const ratio = 1 - (params.latencyMs / params.durationMs) / 2;
  const clamped = Math.max(0, Math.min(1, ratio));
  const points = Math.round(pointsPossible * clamped);
  return { points, correctIncrement: 1, streakDelta: 1 };
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

function ensureRoomStage(room: Room) {
  if (!room.stage) {
    room.stage = { roomCode: room.code, phase: "lobby", questionIndex: 0 };
  }
  if (typeof room.currentQuestionIndex !== "number") {
    room.currentQuestionIndex = room.stage.questionIndex ?? 0;
  }
}

function addOrUpdatePlayer(room: Room, playerId: string, avatarId: string, ready = true) {
  const existing = room.players.get(playerId);
  if (existing) {
    existing.avatarId = avatarId;
    existing.ready = ready;
    return;
  }
  room.players.set(playerId, {
    id: playerId,
    avatarId,
    ready,
    score: 0,
    correctCount: 0,
    streak: 0,
  });
}

function buildRoomSnapshot(room: Room) {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    stage: room.stage,
    currentQuestionIndex: room.currentQuestionIndex,
    players: buildRoster(room),
    expiresAt: room.expiresAt,
  };
}

function getRoomOrSend(roomCode: string, res: express.Response) {
  const room = rooms.get(roomCode);
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return null;
  }
  return room;
}

function getPlayerOrSend(room: Room, playerId: string, res: express.Response) {
  const player = room.players.get(playerId);
  if (!player) {
    res.status(404).json({ ok: false, error: "player_not_found" });
    return null;
  }
  return player;
}

testRouter.get("/rooms", (_req, res) => {
  res.json({
    ok: true,
    rooms: Array.from(rooms.values()).map((room) => buildRoomSnapshot(room)),
  });
});

testRouter.post("/rooms", (req, res) => {
  const roomCode = typeof req.body?.roomCode === "string" ? req.body.roomCode : undefined;
  const hostId = typeof req.body?.hostId === "string" ? req.body.hostId : `test-host-${Date.now()}`;
  const avatarId = typeof req.body?.avatarId === "string" ? req.body.avatarId : "avatar_robot_party";
  const ready = req.body?.ready !== false;
  const room = getOrCreateRoom(roomCode);
  if (!room.hostId) {
    room.hostId = hostId;
  }
  addOrUpdatePlayer(room, hostId, avatarId, ready);
  ensureRoomStage(room);
  touchRoom(room);
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.get("/rooms/:roomCode", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/players", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const playerId = req.body?.playerId;
  const avatarId = req.body?.avatarId ?? "avatar_robot_party";
  if (typeof playerId !== "string" || typeof avatarId !== "string") {
    res.status(400).json({ ok: false, error: "playerId and avatarId required" });
    return;
  }
  const ready = req.body?.ready !== false;
  addOrUpdatePlayer(room, playerId, avatarId, ready);
  if (req.body?.asHost === true || !room.hostId) {
    room.hostId = playerId;
  }
  ensureRoomStage(room);
  touchRoom(room);
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.delete("/rooms/:roomCode/players/:playerId", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const { playerId } = req.params;
  room.players.delete(playerId);
  if (room.hostId === playerId) {
    room.hostId = room.players.keys().next().value as string | undefined;
  }
  touchRoom(room);
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/players/:playerId/ready", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const player = getPlayerOrSend(room, req.params.playerId, res);
  if (!player) return;
  player.ready = req.body?.ready === true;
  touchRoom(room);
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/players/:playerId/avatar", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const player = getPlayerOrSend(room, req.params.playerId, res);
  if (!player) return;
  const avatarId = req.body?.avatarId;
  if (typeof avatarId !== "string") {
    res.status(400).json({ ok: false, error: "avatarId required" });
    return;
  }
  player.avatarId = avatarId;
  touchRoom(room);
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/stage", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const phase = req.body?.phase as RoomPhase | undefined;
  const playerId = req.body?.playerId as string | undefined;
  const force = req.body?.force === true;
  if (!phase || !allowedPhases.has(phase)) {
    res.status(400).json({ ok: false, error: "invalid phase" });
    return;
  }
  if (!force && playerId && room.hostId && room.hostId !== playerId) {
    res.status(403).json({ ok: false, error: "not host" });
    return;
  }
  const nextStage: StagePayload = {
    roomCode: room.code,
    phase,
  };
  if (typeof req.body?.questionIndex === "number") {
    nextStage.questionIndex = req.body.questionIndex;
    room.currentQuestionIndex = req.body.questionIndex;
  }
  if (typeof req.body?.roundStartAt === "number") {
    nextStage.roundStartAt = req.body.roundStartAt;
  }
  room.stage = nextStage;
  ensureRoomStage(room);
  touchRoom(room);
  broadcastToRoom(room.code, { type: "stage", payload: nextStage });
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/question", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const payload = { ...req.body, roomCode: room.code };
  if (!validateQuestionFn(payload)) {
    res.status(400).json({ ok: false, error: "invalid question", details: validateQuestion.errors });
    return;
  }
  const index =
    typeof payload.questionIndex === "number"
      ? payload.questionIndex
      : room.currentQuestionIndex;
  if (typeof index === "number") {
    room.questionsByIndex.set(index, {
      correctIndex: payload.correct_index,
      durationMs: payload.duration_ms,
    });
  }
  touchRoom(room);
  broadcastToRoom(room.code, { type: "question", payload });
  res.json({ ok: true });
});

testRouter.post("/rooms/:roomCode/answer", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const payload = { ...req.body, roomCode: room.code };
  if (!validateAnswerFn(payload)) {
    res.status(400).json({ ok: false, error: "invalid answer", details: validateAnswer.errors });
    return;
  }
  const player = room.players.get(payload.playerId);
  if (!player) {
    res.status(404).json({ ok: false, error: "player_not_found" });
    return;
  }
  const questionIndex =
    typeof payload.questionIndex === "number"
      ? payload.questionIndex
      : room.currentQuestionIndex;
  if (typeof questionIndex === "number") {
    const answeredSet = room.answeredByIndex.get(questionIndex) ?? new Set<string>();
    if (!answeredSet.has(payload.playerId)) {
      answeredSet.add(payload.playerId);
      room.answeredByIndex.set(questionIndex, answeredSet);
      const questionInfo = room.questionsByIndex.get(questionIndex);
      if (questionInfo) {
        const isCorrect = payload.answerIndex === questionInfo.correctIndex;
        const scoring = calculateScore({
          isCorrect,
          latencyMs: payload.latencyMs ?? 0,
          durationMs: questionInfo.durationMs ?? 6000,
        });
        player.score += scoring.points;
        player.correctCount += scoring.correctIncrement;
        player.streak = isCorrect ? player.streak + 1 : 0;
        broadcastToRoom(room.code, { type: "score", payload: buildScorePayload(room) });
      }
    }
  }
  touchRoom(room);
  broadcastToRoom(room.code, { type: "answer", payload });
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/broadcast", (req, res) => {
  const room = getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const payload = req.body;
  broadcastToRoom(room.code, payload);
  res.json({ ok: true });
});

testRouter.post("/rooms/:roomCode/reset", (req, res) => {
  const roomCode = req.params.roomCode;
  if (!rooms.has(roomCode)) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  rooms.delete(roomCode);
  metrics.roomsExpired += 1;
  res.json({ ok: true });
});

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
              ready: true,
              score: 0,
              correctCount: 0,
              streak: 0,
            });
          } else {
            const existing = room.players.get(joinPayload.playerId);
            if (existing) {
              existing.avatarId = joinPayload.avatarId;
            }
          }
          if (!room.stage) {
            room.stage = { roomCode: room.code, phase: "lobby", questionIndex: 0 };
          }
          state.joinedRoom = room.code;
          state.playerId = joinPayload.playerId;
          send(socket, { type: "joined", payload: { roomCode: room.code, isHost, stage: room.stage } });
          broadcastRoster(room);
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
        const phase = stagePayload?.phase;
        const roomCode = stagePayload?.roomCode as string | undefined;
        if (!roomCode || !isRoomPhase(phase)) {
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
        if (typeof nextStage.questionIndex === "number") {
          room.currentQuestionIndex = nextStage.questionIndex;
        }
        touchRoom(room);
        broadcastToRoom(roomCode, { type: "stage", payload: nextStage });
        return;
      }

      if (type === "ready") {
        const readyPayload = payload as any;
        const roomCode = readyPayload?.roomCode as string | undefined;
        const playerId = readyPayload?.playerId as string | undefined;
        const ready = readyPayload?.ready === true;
        if (!roomCode || !playerId) {
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "ready" });
          return;
        }
        const room = rooms.get(roomCode);
        if (!room) {
          return;
        }
        const player = room.players.get(playerId);
        if (!player) {
          return;
        }
        player.ready = ready;
        touchRoom(room);
        broadcastRoster(room);
        return;
      }

      if (type === "avatar") {
        const avatarPayload = payload as any;
        const roomCode = avatarPayload?.roomCode as string | undefined;
        const playerId = avatarPayload?.playerId as string | undefined;
        const avatarId = avatarPayload?.avatarId as string | undefined;
        if (!roomCode || !playerId || !avatarId) {
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "avatar" });
          return;
        }
        const room = rooms.get(roomCode);
        if (!room) {
          return;
        }
        const player = room.players.get(playerId);
        if (!player) {
          return;
        }
        player.avatarId = avatarId;
        touchRoom(room);
        broadcastRoster(room);
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
            const index =
              typeof questionPayload.questionIndex === "number"
                ? questionPayload.questionIndex
                : room.currentQuestionIndex;
            if (typeof index === "number") {
              room.questionsByIndex.set(index, {
                correctIndex: questionPayload.correct_index,
                durationMs: questionPayload.duration_ms,
              });
            }
            touchRoom(room);
            broadcastToRoom(room.code, { type: "question", payload: questionPayload });
          }
        }
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
          touchRoom(room);
          const questionIndex =
            typeof answerPayload.questionIndex === "number"
              ? answerPayload.questionIndex
              : room.currentQuestionIndex;
          if (typeof questionIndex === "number") {
            const answeredSet = room.answeredByIndex.get(questionIndex) ?? new Set<string>();
            if (answeredSet.has(answerPayload.playerId)) {
              return;
            }
            answeredSet.add(answerPayload.playerId);
            room.answeredByIndex.set(questionIndex, answeredSet);
            const questionInfo = room.questionsByIndex.get(questionIndex);
            const player = room.players.get(answerPayload.playerId);
            if (questionInfo && player) {
              const isCorrect = answerPayload.answerIndex === questionInfo.correctIndex;
              const scoring = calculateScore({
                isCorrect,
                latencyMs: answerPayload.latencyMs ?? 0,
                durationMs: questionInfo.durationMs ?? 6000,
              });
              player.score += scoring.points;
              player.correctCount += scoring.correctIncrement;
              player.streak = isCorrect ? player.streak + 1 : 0;
              broadcastToRoom(room.code, { type: "score", payload: buildScorePayload(room) });
            }
          }
        }
        broadcastToRoom(answerPayload.roomCode, { type: "answer", payload: answerPayload });
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
    const state = socketState.get(socket);
    if (state?.joinedRoom && state.playerId) {
      const room = rooms.get(state.joinedRoom);
      if (room) {
        room.players.delete(state.playerId);
        if (room.hostId === state.playerId) {
          const nextHost = room.players.keys().next().value as string | undefined;
          room.hostId = nextHost;
        }
        broadcastRoster(room);
      }
    }
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
