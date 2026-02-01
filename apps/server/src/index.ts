import crypto from "crypto";
import express from "express";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import Redis from "ioredis";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const COMPLIANCE_LOG_LIMIT = 1000;
const LOG_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const TEST_API_ENABLED = process.env.TEST_API_ENABLED === "true";
const TEST_API_TOKEN = process.env.TEST_API_TOKEN;
const REDIS_URL = process.env.REDIS_URL;
const REDIS_ENABLED = Boolean(REDIS_URL);
const REDIS_CHANNEL = "escapers:broadcast";
const INSTANCE_ID = process.env.INSTANCE_ID ?? crypto.randomUUID();
const ROUND_DEFAULT_MS = 10000;
const PREPARED_DURATION_MS = 3000;
const REVEAL_DURATION_MS = 5000;
const LEADERBOARD_DURATION_MS = 5000;
const MAX_QUESTIONS = 15;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 35000;
const STALE_PLAYER_MS = 45000;

const redis = REDIS_ENABLED ? new Redis(REDIS_URL as string) : null;
const redisSub = REDIS_ENABLED ? new Redis(REDIS_URL as string) : null;
if (redis) {
  redis.on("error", (err: unknown) => console.error("redis:error", err));
}
if (redisSub) {
  redisSub.on("error", (err: unknown) => console.error("redis:sub:error", err));
}

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

app.post("/crew/create", async (req, res) => {
  const playerId = req.body?.playerId;
  if (typeof playerId !== "string" || !playerId.trim()) {
    res.status(400).json({ ok: false, error: "playerId_required" });
    return;
  }
  const code = normalizeCrewCode(req.body?.code) || randomCrewCode();
  const name = sanitizeName(req.body?.name ?? `Crew ${code}`);
  const avatarId = req.body?.avatarId ?? "unknown";
  const member: CrewMember = {
    id: playerId,
    name: sanitizeName(req.body?.memberName ?? req.body?.name ?? "Player"),
    avatarId,
    weeklyPoints: 0,
    lastWeekPoints: 0,
    seasonPoints: 0,
    correctCount: 0,
    streak: 0,
    role: "owner",
    title: "Captain",
    updatedAt: Date.now(),
  };
  const crew: Crew = {
    code,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    members: { [member.id]: member },
    banned: {},
  };
  await writeCrew(crew);
  res.json({ ok: true, crew: crewToResponse(crew), role: "owner" });
});

app.post("/crew/join", async (req, res) => {
  const code = normalizeCrewCode(req.body?.code);
  const playerId = req.body?.playerId;
  if (!code || typeof playerId !== "string" || !playerId.trim()) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const crew = await readCrew(code);
  if (!crew) {
    res.status(404).json({ ok: false, error: "crew_not_found" });
    return;
  }
  if (crew.banned?.[playerId]) {
    res.status(403).json({ ok: false, error: "crew_banned" });
    return;
  }
  if (crew.banned?.[playerId]) {
    res.status(403).json({ ok: false, error: "crew_banned" });
    return;
  }
  const avatarId = req.body?.avatarId ?? "unknown";
  crew.members[playerId] = {
    id: playerId,
    name: sanitizeName(req.body?.name ?? "Player"),
    avatarId,
    weeklyPoints: crew.members[playerId]?.weeklyPoints ?? 0,
    lastWeekPoints: crew.members[playerId]?.lastWeekPoints ?? 0,
    seasonPoints: crew.members[playerId]?.seasonPoints ?? 0,
    correctCount: crew.members[playerId]?.correctCount ?? 0,
    streak: crew.members[playerId]?.streak ?? 0,
    role: crew.members[playerId]?.role ?? "member",
    title: crew.members[playerId]?.title,
    updatedAt: Date.now(),
  };
  crew.updatedAt = Date.now();
  recomputeCrewTitles(crew);
  await writeCrew(crew);
  res.json({ ok: true, crew: crewToResponse(crew), role: crew.members[playerId].role });
});

app.post("/crew/leave", async (req, res) => {
  const code = normalizeCrewCode(req.body?.code);
  const playerId = req.body?.playerId;
  if (!code || typeof playerId !== "string" || !playerId.trim()) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const crew = await readCrew(code);
  if (!crew) {
    res.status(404).json({ ok: false, error: "crew_not_found" });
    return;
  }
  delete crew.members[playerId];
  crew.updatedAt = Date.now();
  if (!Object.keys(crew.members).length) {
    await deleteCrew(code);
    res.json({ ok: true, crew: null });
    return;
  }
  recomputeCrewTitles(crew);
  await writeCrew(crew);
  res.json({ ok: true, crew: crewToResponse(crew) });
});

app.post("/crew/update", async (req, res) => {
  const code = normalizeCrewCode(req.body?.code);
  const playerId = req.body?.playerId;
  if (!code || typeof playerId !== "string" || !playerId.trim()) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const crew = await readCrew(code);
  if (!crew) {
    res.status(404).json({ ok: false, error: "crew_not_found" });
    return;
  }
  const existing = crew.members[playerId];
  const avatarId = req.body?.avatarId ?? existing?.avatarId ?? "unknown";
  const member: CrewMember = {
    id: playerId,
    name: sanitizeName(req.body?.name ?? existing?.name ?? "Player"),
    avatarId,
    weeklyPoints: typeof req.body?.weeklyPoints === "number" ? req.body.weeklyPoints : existing?.weeklyPoints ?? 0,
    lastWeekPoints:
      typeof req.body?.lastWeekPoints === "number" ? req.body.lastWeekPoints : existing?.lastWeekPoints ?? 0,
    seasonPoints: typeof req.body?.seasonPoints === "number" ? req.body.seasonPoints : existing?.seasonPoints ?? 0,
    correctCount: typeof req.body?.correctCount === "number" ? req.body.correctCount : existing?.correctCount ?? 0,
    streak: typeof req.body?.streak === "number" ? req.body.streak : existing?.streak ?? 0,
    role: existing?.role ?? "member",
    title: existing?.title,
    updatedAt: Date.now(),
  };
  crew.members[playerId] = member;
  crew.updatedAt = Date.now();
  recomputeCrewTitles(crew);
  await writeCrew(crew);
  res.json({ ok: true, crew: crewToResponse(crew), role: member.role });
});

app.post("/crew/kick", async (req, res) => {
  const code = normalizeCrewCode(req.body?.code);
  const requesterId = req.body?.requesterId;
  const targetId = req.body?.targetId;
  if (!code || typeof requesterId !== "string" || typeof targetId !== "string") {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const crew = await readCrew(code);
  if (!crew) {
    res.status(404).json({ ok: false, error: "crew_not_found" });
    return;
  }
  const requester = crew.members[requesterId];
  if (!requester || requester.role !== "owner") {
    res.status(403).json({ ok: false, error: "not_owner" });
    return;
  }
  if (requesterId === targetId) {
    res.status(400).json({ ok: false, error: "cannot_kick_self" });
    return;
  }
  const target = crew.members[targetId];
  if (!target) {
    res.status(404).json({ ok: false, error: "member_not_found" });
    return;
  }
  if (target.role === "owner") {
    res.status(400).json({ ok: false, error: "cannot_kick_owner" });
    return;
  }
  delete crew.members[targetId];
  crew.updatedAt = Date.now();
  recomputeCrewTitles(crew);
  await writeCrew(crew);
  res.json({ ok: true, crew: crewToResponse(crew) });
});

app.post("/crew/ban", async (req, res) => {
  const code = normalizeCrewCode(req.body?.code);
  const requesterId = req.body?.requesterId;
  const targetId = req.body?.targetId;
  if (!code || typeof requesterId !== "string" || typeof targetId !== "string") {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const crew = await readCrew(code);
  if (!crew) {
    res.status(404).json({ ok: false, error: "crew_not_found" });
    return;
  }
  const requester = crew.members[requesterId];
  if (!requester || requester.role !== "owner") {
    res.status(403).json({ ok: false, error: "not_owner" });
    return;
  }
  if (requesterId === targetId) {
    res.status(400).json({ ok: false, error: "cannot_ban_self" });
    return;
  }
  const target = crew.members[targetId];
  if (!target) {
    res.status(404).json({ ok: false, error: "member_not_found" });
    return;
  }
  if (target.role === "owner") {
    res.status(400).json({ ok: false, error: "cannot_ban_owner" });
    return;
  }
  crew.banned = crew.banned ?? {};
  crew.banned[targetId] = {
    id: targetId,
    name: target.name,
    avatarId: target.avatarId,
    bannedAt: Date.now(),
    bannedBy: requesterId,
  };
  delete crew.members[targetId];
  crew.updatedAt = Date.now();
  recomputeCrewTitles(crew);
  await writeCrew(crew);
  res.json({ ok: true, crew: crewToResponse(crew) });
});

app.get("/crew/:code", async (req, res) => {
  const code = normalizeCrewCode(req.params.code);
  if (!code) {
    res.status(400).json({ ok: false, error: "invalid_code" });
    return;
  }
  const crew = await readCrew(code);
  if (!crew) {
    res.status(404).json({ ok: false, error: "crew_not_found" });
    return;
  }
  res.json({ ok: true, crew: crewToResponse(crew) });
});

app.get("/leaderboard", async (req, res) => {
  const period = req.query.period === "season" ? "season" : "weekly";
  const scope = req.query.scope === "group" ? "group" : "global";
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10) || 10));
  if (scope === "group") {
    const code = normalizeCrewCode(String(req.query.crewCode ?? req.query.code ?? ""));
    if (!code) {
      res.status(400).json({ ok: false, error: "crew_code_required" });
      return;
    }
    const crew = await readCrew(code);
    if (!crew) {
      res.status(404).json({ ok: false, error: "crew_not_found" });
      return;
    }
    const members = Object.values(crew.members);
    const scored = members.map((member) => {
      const lastWeek = member.lastWeekPoints ?? 0;
      const seasonPoints = member.seasonPoints ?? 0;
      const weeklyDelta = Math.max(0, member.weeklyPoints - lastWeek);
      const funScore = period === "season" ? seasonPoints : member.weeklyPoints;
      const deltaPoints = period === "weekly" && weeklyDelta > 0 ? weeklyDelta : null;
      const percentileBand = period === "weekly" ? (weeklyDelta > 0 ? "Top 50%" : "Rising") : null;
      return { member, funScore, deltaPoints, percentileBand, weeklyDelta };
    });
    const sorted =
      period === "weekly"
        ? scored.sort((a, b) => b.weeklyDelta - a.weeklyDelta)
        : scored.sort((a, b) => b.funScore - a.funScore);
    const top = sorted.slice(0, limit).map((entry) => ({
      displayName: entry.member.name,
      avatarId: entry.member.avatarId,
      funScore: entry.funScore,
      deltaPoints: entry.deltaPoints,
      percentileBand: entry.percentileBand,
    }));
    const playerId = typeof req.query.playerId === "string" ? req.query.playerId : undefined;
    const self = playerId ? crew.members[playerId] : undefined;
    const selfLastWeek = self?.lastWeekPoints ?? 0;
    const selfSeasonPoints = self?.seasonPoints ?? 0;
    const selfDelta = self ? Math.max(0, self.weeklyPoints - selfLastWeek) : 0;
    res.json({
      period,
      scope: "group",
      generatedAt: new Date().toISOString(),
      self: self
        ? {
            displayName: self.name,
            avatarId: self.avatarId,
            funScore: period === "season" ? selfSeasonPoints : self.weeklyPoints,
            deltaPoints: period === "weekly" && selfDelta > 0 ? selfDelta : null,
            percentileBand: period === "weekly" ? (selfDelta > 0 ? "Top 50%" : "Rising") : null,
          }
        : null,
      top,
    });
    return;
  }
  const codes = await listCrewCodes();
  const crews = await Promise.all(codes.map((code) => readCrew(code)));
  const membersMap = new Map<string, CrewMember>();
  for (const [index, crew] of crews.entries()) {
    if (!crew) {
      const staleCode = codes[index];
      if (staleCode) {
        await unindexCrew(staleCode);
      }
      continue;
    }
    Object.values(crew.members).forEach((member) => {
      const existing = membersMap.get(member.id);
      if (!existing || member.updatedAt > existing.updatedAt) {
        membersMap.set(member.id, member);
      }
    });
  }
  const allMembers = Array.from(membersMap.values());
  const scored = allMembers.map((member) => {
    const lastWeek = member.lastWeekPoints ?? 0;
    const seasonPoints = member.seasonPoints ?? 0;
    const weeklyDelta = Math.max(0, member.weeklyPoints - lastWeek);
    const funScore = period === "season" ? seasonPoints : member.weeklyPoints;
    const deltaPoints = period === "weekly" && weeklyDelta > 0 ? weeklyDelta : null;
    const percentileBand = period === "weekly" ? (weeklyDelta > 0 ? "Top 50%" : "Rising") : null;
    return { member, funScore, deltaPoints, percentileBand, weeklyDelta };
  });
  const sorted =
    period === "weekly"
      ? scored.sort((a, b) => b.weeklyDelta - a.weeklyDelta)
      : scored.sort((a, b) => b.funScore - a.funScore);
  const top = sorted.slice(0, limit).map((entry) => ({
    displayName: entry.member.name,
    avatarId: entry.member.avatarId,
    funScore: entry.funScore,
    deltaPoints: entry.deltaPoints,
    percentileBand: entry.percentileBand,
  }));
  const playerId = typeof req.query.playerId === "string" ? req.query.playerId : undefined;
  const self = playerId ? membersMap.get(playerId) : undefined;
  const selfLastWeek = self?.lastWeekPoints ?? 0;
  const selfSeasonPoints = self?.seasonPoints ?? 0;
  const selfDelta = self ? Math.max(0, self.weeklyPoints - selfLastWeek) : 0;
  res.json({
    period,
    scope: "global",
    generatedAt: new Date().toISOString(),
    self: self
      ? {
          displayName: self.name,
          avatarId: self.avatarId,
          funScore: period === "season" ? selfSeasonPoints : self.weeklyPoints,
          deltaPoints: period === "weekly" && selfDelta > 0 ? selfDelta : null,
          percentileBand: period === "weekly" ? (selfDelta > 0 ? "Top 50%" : "Rising") : null,
        }
      : null,
    top,
  });
});

app.get("/metrics", async (_req, res) => {
  const roomsActive = await roomStore.count();
  res.json({
    ...metrics,
    roomsActive,
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
const CREW_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const ROOM_TTL_MS = 1000 * 60 * 120;
const MAX_ROOM_PLAYERS = 12;
const MIN_ROOM_PLAYERS = 3;
const ANSWER_COOLDOWN_MS = 700;
const INCIDENT_LOG_LIMIT = 500;
const PUBLIC_ROOM_CODE = "PLAY";
const PUBLIC_ROOM_POINTER_KEY = "public:PLAY:next";
const CREW_INDEX_KEY = "crew:index";
let publicRoomPointerMemory: string | null = null;
type RoomTimers = {
  reveal?: ReturnType<typeof setTimeout>;
  leaderboard?: ReturnType<typeof setTimeout>;
  next?: ReturnType<typeof setTimeout>;
};
const roomTimers = new Map<string, RoomTimers>();
const crewStore = new Map<string, Crew>();
const crewIndex = new Set<string>();

type CrewRole = "owner" | "member";

interface CrewMember {
  id: string;
  name: string;
  avatarId: string;
  weeklyPoints: number;
  lastWeekPoints: number;
  seasonPoints: number;
  correctCount: number;
  streak: number;
  role: CrewRole;
  title?: string;
  updatedAt: number;
}

interface Crew {
  code: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  members: Record<string, CrewMember>;
  banned: Record<string, { id: string; name?: string; avatarId?: string; bannedAt: number; bannedBy: string }>;
}

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

type RoomPhase = "join" | "lobby" | "prepared" | "round" | "reveal" | "leaderboard" | "end";
const allowedPhases = new Set<RoomPhase>(["join", "lobby", "prepared", "round", "reveal", "leaderboard", "end"]);
const isRoomPhase = (value: unknown): value is RoomPhase =>
  typeof value === "string" && allowedPhases.has(value as RoomPhase);

const normalizeCrewCode = (raw?: string) =>
  (raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

const sanitizeName = (name?: string) => {
  const trimmed = (name ?? "").trim().slice(0, 18);
  return trimmed || "Player";
};

const randomCrewCode = (length = 4) => {
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return output;
};

const crewKey = (code: string) => `crew:${code}`;

async function indexCrew(code: string) {
  if (redis) {
    await redis.sadd(CREW_INDEX_KEY, code);
    return;
  }
  crewIndex.add(code);
}

async function unindexCrew(code: string) {
  if (redis) {
    await redis.srem(CREW_INDEX_KEY, code);
    return;
  }
  crewIndex.delete(code);
}

async function listCrewCodes(): Promise<string[]> {
  if (redis) {
    return redis.smembers(CREW_INDEX_KEY);
  }
  return Array.from(crewIndex);
}

async function readCrew(code: string): Promise<Crew | null> {
  if (redis) {
    const raw = await redis.get(crewKey(code));
    if (!raw) return null;
    try {
      const crew = JSON.parse(raw) as Crew;
      if (!crew.banned) {
        crew.banned = {};
      }
      return crew;
    } catch {
      return null;
    }
  }
  const crew = crewStore.get(code) ?? null;
  if (crew && !crew.banned) {
    crew.banned = {};
  }
  return crew;
}

async function writeCrew(crew: Crew) {
  if (redis) {
    await redis.set(crewKey(crew.code), JSON.stringify(crew), "PX", CREW_TTL_MS);
    await indexCrew(crew.code);
    return;
  }
  crewStore.set(crew.code, crew);
  crewIndex.add(crew.code);
}

async function deleteCrew(code: string) {
  if (redis) {
    await redis.del(crewKey(code));
    await unindexCrew(code);
    return;
  }
  crewStore.delete(code);
  crewIndex.delete(code);
}

function recomputeCrewTitles(crew: Crew) {
  const members = Object.values(crew.members);
  if (!members.length) return;
  const topScore = [...members].sort((a, b) => b.weeklyPoints - a.weeklyPoints)[0];
  const topCorrect = [...members].sort((a, b) => b.correctCount - a.correctCount)[0];
  members.forEach((member) => {
    let title: string | undefined;
    if (topScore && topScore.weeklyPoints > 0 && member.id === topScore.id) {
      title = "Score Boss";
    } else if (topCorrect && topCorrect.correctCount > 0 && member.id === topCorrect.id) {
      title = "Sharp Eye";
    } else if (member.role === "owner") {
      title = "Captain";
    }
    member.title = title;
  });
}

function crewToResponse(crew: Crew) {
  return {
    code: crew.code,
    name: crew.name,
    members: Object.values(crew.members).map((member) => ({
      id: member.id,
      name: member.name,
      avatarId: member.avatarId,
      weeklyPoints: member.weeklyPoints,
      lastWeekPoints: member.lastWeekPoints,
      seasonPoints: member.seasonPoints,
      correctCount: member.correctCount,
      streak: member.streak,
      title: member.title,
      role: member.role,
    })),
  };
}

interface StagePayload {
  roomCode: string;
  phase: RoomPhase;
  questionIndex?: number;
  roundStartAt?: number;
}

interface Player {
  id: string;
  avatarId: string;
  name?: string;
  ready: boolean;
  score: number;
  correctCount: number;
  streak: number;
  connectionId?: string;
  lastAnswerAt?: number;
  lastSeen?: number;
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

type StoredRoom = {
  code: string;
  players: Player[];
  createdAt: number;
  expiresAt: number;
  locked: boolean;
  hostId?: string;
  stage?: StagePayload;
  currentQuestionIndex?: number;
  questionsByIndex: Record<string, { correctIndex: number; durationMs: number }>;
  answeredByIndex: Record<string, string[]>;
};

interface RoomStore {
  get(code: string): Promise<Room | null>;
  set(room: Room): Promise<void>;
  delete(code: string): Promise<boolean>;
  list(): Promise<Room[]>;
  count(): Promise<number>;
}

const roomsMemory = new Map<string, Room>();
const incidents: Incident[] = [];
const rateBuckets = new Map<string, RateBucket>();
const socketState = new WeakMap<
  WebSocket,
  { ip: string; joinedRoom?: string; playerId?: string; connectionId?: string; lastPong?: number }
>();
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

function serializeRoom(room: Room): StoredRoom {
  const questionsByIndex: Record<string, { correctIndex: number; durationMs: number }> = {};
  room.questionsByIndex.forEach((value, key) => {
    questionsByIndex[String(key)] = value;
  });
  const answeredByIndex: Record<string, string[]> = {};
  room.answeredByIndex.forEach((value, key) => {
    answeredByIndex[String(key)] = Array.from(value);
  });
  return {
    code: room.code,
    players: Array.from(room.players.values()),
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    locked: room.locked,
    hostId: room.hostId,
    stage: room.stage,
    currentQuestionIndex: room.currentQuestionIndex,
    questionsByIndex,
    answeredByIndex,
  };
}

function deserializeRoom(data: StoredRoom): Room {
  const players = new Map<string, Player>();
  data.players.forEach((player) => {
    players.set(player.id, { ...player });
  });
  const questionsByIndex = new Map<number, { correctIndex: number; durationMs: number }>();
  Object.entries(data.questionsByIndex ?? {}).forEach(([key, value]) => {
    questionsByIndex.set(Number(key), value);
  });
  const answeredByIndex = new Map<number, Set<string>>();
  Object.entries(data.answeredByIndex ?? {}).forEach(([key, value]) => {
    answeredByIndex.set(Number(key), new Set(value));
  });
  return {
    code: data.code,
    players,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    locked: data.locked,
    hostId: data.hostId,
    stage: data.stage,
    currentQuestionIndex: data.currentQuestionIndex,
    questionsByIndex,
    answeredByIndex,
  };
}

async function listRedisRooms(): Promise<Room[]> {
  if (!redis) return [];
  const rooms: Room[] = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "room:*", "COUNT", "100");
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) {
        continue;
      }
      try {
        rooms.push(deserializeRoom(JSON.parse(raw) as StoredRoom));
      } catch (err) {
        console.warn("redis:parse_room_failed", key, err);
      }
    }
  } while (cursor !== "0");
  return rooms;
}

const roomStore: RoomStore = REDIS_ENABLED
  ? {
      async get(code: string) {
        const raw = await redis?.get(`room:${code}`);
        if (!raw) return null;
        return deserializeRoom(JSON.parse(raw) as StoredRoom);
      },
      async set(room: Room) {
        const raw = JSON.stringify(serializeRoom(room));
        const ttlSec = Math.max(60, Math.ceil((room.expiresAt - Date.now()) / 1000));
        await redis?.set(`room:${room.code}`, raw, "EX", ttlSec);
      },
      async delete(code: string) {
        const res = await redis?.del(`room:${code}`);
        return Boolean(res && res > 0);
      },
      async list() {
        return listRedisRooms();
      },
      async count() {
        const rooms = await listRedisRooms();
        return rooms.length;
      },
    }
  : {
      async get(code: string) {
        return roomsMemory.get(code) ?? null;
      },
      async set(room: Room) {
        roomsMemory.set(room.code, room);
      },
      async delete(code: string) {
        return roomsMemory.delete(code);
      },
      async list() {
        return Array.from(roomsMemory.values());
      },
      async count() {
        return roomsMemory.size;
      },
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

function buildNewRoom(code: string): Room {
  const now = Date.now();
  return {
    code,
    players: new Map(),
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    locked: false,
    questionsByIndex: new Map(),
    answeredByIndex: new Map(),
  };
}

async function updateRoom(
  code: string,
  updater: (room: Room) => void,
  options: { createIfMissing?: boolean } = {},
): Promise<Room | null> {
  if (!REDIS_ENABLED || !redis) {
    let room = roomsMemory.get(code) ?? null;
    if (!room && options.createIfMissing) {
      room = buildNewRoom(code);
      metrics.roomsCreated += 1;
    }
    if (!room) {
      return null;
    }
    updater(room);
    room.expiresAt = Date.now() + ROOM_TTL_MS;
    roomsMemory.set(code, room);
    return room;
  }

  const key = `room:${code}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await redis.watch(key);
    const raw = await redis.get(key);
    let room = raw ? deserializeRoom(JSON.parse(raw) as StoredRoom) : null;
    let created = false;
    if (!room) {
      if (!options.createIfMissing) {
        await redis.unwatch();
        return null;
      }
      room = buildNewRoom(code);
      created = true;
    }
    updater(room);
    room.expiresAt = Date.now() + ROOM_TTL_MS;
    const ttlSec = Math.max(60, Math.ceil((room.expiresAt - Date.now()) / 1000));
    const rawUpdated = JSON.stringify(serializeRoom(room));
    const tx = redis.multi();
    tx.set(key, rawUpdated, "EX", ttlSec);
    const res = await tx.exec();
    if (res === null) {
      continue;
    }
    if (created) {
      metrics.roomsCreated += 1;
    }
    return room;
  }
  return null;
}

async function getOrCreateRoom(code?: string): Promise<Room> {
  if (code) {
    const existing = await roomStore.get(code);
    if (existing) {
      return existing;
    }
  }
  let newCode = code || generateRoomCode(4 + Math.floor(Math.random() * 3));
  if (!code) {
    for (let i = 0; i < 5; i += 1) {
      const existing = await roomStore.get(newCode);
      if (!existing) break;
      newCode = generateRoomCode(4 + Math.floor(Math.random() * 3));
    }
  }
  const room: Room = buildNewRoom(newCode);
  metrics.roomsCreated += 1;
  await roomStore.set(room);
  return room;
}

async function touchRoom(room: Room) {
  room.expiresAt = Date.now() + ROOM_TTL_MS;
  await roomStore.set(room);
}

function send(ws: WebSocket, payload: unknown) {
  ws.send(JSON.stringify(payload));
}

function buildRoster(room: Room) {
  return Array.from(room.players.values()).map((player) => ({
    id: player.id,
    avatarId: player.avatarId,
    name: player.name,
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

function clearRoomTimers(roomCode: string) {
  const timers = roomTimers.get(roomCode);
  if (!timers) {
    return;
  }
  if (timers.reveal) {
    clearTimeout(timers.reveal);
  }
  if (timers.leaderboard) {
    clearTimeout(timers.leaderboard);
  }
  if (timers.next) {
    clearTimeout(timers.next);
  }
  roomTimers.delete(roomCode);
}

async function applyStageTransition(
  roomCode: string,
  expectedPhase: RoomPhase,
  expectedQuestionIndex: number | null,
  nextStage: StagePayload,
): Promise<Room | null> {
  let updated = false;
  const room = await updateRoom(
    roomCode,
    (roomValue) => {
      ensureRoomStage(roomValue);
      if (roomValue.stage?.phase !== expectedPhase) {
        return;
      }
      const currentIndex =
        typeof roomValue.currentQuestionIndex === "number"
          ? roomValue.currentQuestionIndex
          : roomValue.stage?.questionIndex;
      if (typeof expectedQuestionIndex === "number" && currentIndex !== expectedQuestionIndex) {
        return;
      }
      roomValue.stage = { ...nextStage, roomCode: roomValue.code };
      if (typeof nextStage.questionIndex === "number") {
        roomValue.currentQuestionIndex = nextStage.questionIndex;
      }
      ensureRoomStage(roomValue);
      updated = true;
    },
    { createIfMissing: false },
  );
  if (!room || !updated) {
    return null;
  }
  broadcastToRoom(room.code, { type: "stage", payload: room.stage });
  return room;
}

function scheduleStageTimers(room: Room) {
  clearRoomTimers(room.code);
  if (!room.stage) {
    return;
  }
  if (room.stage.phase === "prepared") {
    schedulePreparedTimers(room);
    return;
  }
  if (room.stage.phase === "round") {
    scheduleRoundTimers(room);
    return;
  }
  if (room.stage.phase === "reveal") {
    scheduleRevealTimers(room);
    return;
  }
  if (room.stage.phase === "leaderboard") {
    scheduleLeaderboardTimers(room);
  }
}

function schedulePreparedTimers(room: Room) {
  if (!room.stage || room.stage.phase !== "prepared") {
    return;
  }
  const stage = room.stage;
  const questionIndex =
    typeof stage.questionIndex === "number"
      ? stage.questionIndex
      : typeof room.currentQuestionIndex === "number"
        ? room.currentQuestionIndex
        : 0;
  const startAt = stage.roundStartAt ?? Date.now() + PREPARED_DURATION_MS;
  const delay = Math.max(0, startAt - Date.now());
  const timers: RoomTimers = {};
  timers.next = setTimeout(() => {
    void (async () => {
      const updated = await applyStageTransition(
        room.code,
        "prepared",
        questionIndex,
        {
          roomCode: room.code,
          phase: "round",
          questionIndex,
          roundStartAt: startAt,
        },
      );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, delay);
  roomTimers.set(room.code, timers);
}

function scheduleRoundTimers(room: Room) {
  if (!room.stage || room.stage.phase !== "round") {
    return;
  }
  const stage = room.stage;
  const questionIndex =
    typeof stage.questionIndex === "number"
      ? stage.questionIndex
      : typeof room.currentQuestionIndex === "number"
        ? room.currentQuestionIndex
        : 0;
  const startAt = stage.roundStartAt ?? Date.now();
  const questionInfo = room.questionsByIndex.get(questionIndex);
  const durationMs = questionInfo?.durationMs ?? ROUND_DEFAULT_MS;
  const remaining = Math.max(0, durationMs - (Date.now() - startAt));
  const timers: RoomTimers = {};
  timers.reveal = setTimeout(() => {
    void (async () => {
      const updated = await applyStageTransition(
        room.code,
        "round",
        questionIndex,
        {
          roomCode: room.code,
          phase: "reveal",
          questionIndex,
          roundStartAt: startAt,
        },
      );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, remaining);
  timers.leaderboard = setTimeout(() => {
    void (async () => {
      const updated = await applyStageTransition(
        room.code,
        "reveal",
        questionIndex,
        {
          roomCode: room.code,
          phase: "leaderboard",
          questionIndex,
          roundStartAt: startAt,
        },
      );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, remaining + REVEAL_DURATION_MS);
  timers.next = setTimeout(() => {
    void (async () => {
    const nextIndex = questionIndex + 1;
    const nextPhase: RoomPhase = nextIndex >= MAX_QUESTIONS ? "end" : "prepared";
    const updated = await applyStageTransition(
      room.code,
      "leaderboard",
      questionIndex,
      {
        roomCode: room.code,
        phase: nextPhase,
        questionIndex: nextIndex,
        roundStartAt: nextPhase === "prepared" ? Date.now() + PREPARED_DURATION_MS : undefined,
      },
    );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, remaining + REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
  roomTimers.set(room.code, timers);
}

function scheduleRevealTimers(room: Room) {
  if (!room.stage || room.stage.phase !== "reveal") {
    return;
  }
  const stage = room.stage;
  const questionIndex =
    typeof stage.questionIndex === "number"
      ? stage.questionIndex
      : typeof room.currentQuestionIndex === "number"
        ? room.currentQuestionIndex
        : 0;
  const startAt = stage.roundStartAt ?? Date.now();
  const timers: RoomTimers = {};
  timers.leaderboard = setTimeout(() => {
    void (async () => {
      const updated = await applyStageTransition(
        room.code,
        "reveal",
        questionIndex,
        {
          roomCode: room.code,
          phase: "leaderboard",
          questionIndex,
          roundStartAt: startAt,
        },
      );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, REVEAL_DURATION_MS);
  timers.next = setTimeout(() => {
    void (async () => {
    const nextIndex = questionIndex + 1;
    const nextPhase: RoomPhase = nextIndex >= MAX_QUESTIONS ? "end" : "prepared";
    const updated = await applyStageTransition(
      room.code,
      "leaderboard",
      questionIndex,
      {
        roomCode: room.code,
        phase: nextPhase,
        questionIndex: nextIndex,
        roundStartAt: nextPhase === "prepared" ? Date.now() + PREPARED_DURATION_MS : undefined,
      },
    );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, REVEAL_DURATION_MS + LEADERBOARD_DURATION_MS);
  roomTimers.set(room.code, timers);
}

function scheduleLeaderboardTimers(room: Room) {
  if (!room.stage || room.stage.phase !== "leaderboard") {
    return;
  }
  const stage = room.stage;
  const questionIndex =
    typeof stage.questionIndex === "number"
      ? stage.questionIndex
      : typeof room.currentQuestionIndex === "number"
        ? room.currentQuestionIndex
        : 0;
  const timers: RoomTimers = {};
  timers.next = setTimeout(() => {
    void (async () => {
    const nextIndex = questionIndex + 1;
    const nextPhase: RoomPhase = nextIndex >= MAX_QUESTIONS ? "end" : "prepared";
    const updated = await applyStageTransition(
      room.code,
      "leaderboard",
      questionIndex,
      {
        roomCode: room.code,
        phase: nextPhase,
        questionIndex: nextIndex,
        roundStartAt: nextPhase === "prepared" ? Date.now() + PREPARED_DURATION_MS : undefined,
      },
    );
      if (updated) {
        scheduleStageTimers(updated);
      }
    })();
  }, LEADERBOARD_DURATION_MS);
  roomTimers.set(room.code, timers);
}

function buildScorePayload(room: Room) {
  const players = Array.from(room.players.values());
  const sorted = [...players].sort((a, b) => b.score - a.score);
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
      name: player.name,
      ready: player.ready,
      score: player.score,
      correctCount: player.correctCount,
      streak: player.streak,
    })),
    leaderboardTop5,
    podiumTop3,
  };
}

function calculateScore(params: { isCorrect: boolean; latencyMs: number; durationMs: number; startAt?: number }) {
  if (!params.isCorrect) {
    return { points: 0, correctIncrement: 0, streakDelta: -1 };
  }
  const durationMs = Math.max(1, params.durationMs);
  const elapsedMs =
    typeof params.startAt === "number" ? Math.max(0, Date.now() - params.startAt) : Math.max(0, params.latencyMs);
  const rawPoints = 1000 - (1000 / durationMs) * elapsedMs;
  const points = Math.round(Math.max(0, Math.min(1000, rawPoints)));
  return { points, correctIncrement: 1, streakDelta: 1 };
}

function broadcastToRoomLocal(roomCode: string, payload: unknown) {
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

function broadcastToRoom(roomCode: string, payload: unknown) {
  broadcastToRoomLocal(roomCode, payload);
  if (redis) {
    const message = JSON.stringify({ roomCode, payload, origin: INSTANCE_ID });
    redis.publish(REDIS_CHANNEL, message).catch((err: unknown) => {
      console.warn("redis:publish_failed", err);
    });
  }
}

if (redisSub) {
  redisSub.subscribe(REDIS_CHANNEL).catch((err: unknown) => {
    console.warn("redis:subscribe_failed", err);
  });
  redisSub.on("message", (_channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as { roomCode: string; payload: unknown; origin?: string };
      if (parsed.origin === INSTANCE_ID) {
        return;
      }
      if (parsed.roomCode) {
        broadcastToRoomLocal(parsed.roomCode, parsed.payload);
      }
    } catch (err: unknown) {
      console.warn("redis:message_parse_failed", err);
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

function ensureHost(room: Room, fallbackId?: string) {
  if (!room.hostId || !room.players.has(room.hostId)) {
    room.hostId = fallbackId ?? (room.players.keys().next().value as string | undefined);
    return true;
  }
  return false;
}

function isCurrentConnection(room: Room, playerId: string, connectionId?: string) {
  const player = room.players.get(playerId);
  if (!player) return false;
  if (!connectionId || !player.connectionId) return true;
  return player.connectionId === connectionId;
}

function addOrUpdatePlayer(
  room: Room,
  playerId: string,
  avatarId: string,
  ready = true,
  name?: string,
  connectionId?: string,
) {
  const existing = room.players.get(playerId);
  if (existing) {
    existing.avatarId = avatarId;
    existing.ready = ready;
    if (name) {
      existing.name = name;
    }
    if (connectionId) {
      existing.connectionId = connectionId;
    }
    existing.lastSeen = Date.now();
    return;
  }
  room.players.set(playerId, {
    id: playerId,
    avatarId,
    name,
    ready,
    score: 0,
    correctCount: 0,
    streak: 0,
    connectionId,
    lastSeen: Date.now(),
  });
}

async function markPlayerSeen(roomCode: string, playerId: string, connectionId?: string) {
  const now = Date.now();
  await updateRoom(
    roomCode,
    (roomValue) => {
      const player = roomValue.players.get(playerId);
      if (!player) return;
      if (connectionId && player.connectionId && player.connectionId !== connectionId) {
        return;
      }
      const lastSeen = player.lastSeen ?? 0;
      if (now - lastSeen < 10000) {
        return;
      }
      player.lastSeen = now;
    },
    { createIfMissing: false },
  );
}

async function pruneStalePlayers() {
  const now = Date.now();
  const rooms = await roomStore.list();
  for (const room of rooms) {
    let removed = false;
    room.players.forEach((player, id) => {
      const lastSeen = player.lastSeen ?? room.createdAt;
      if (now - lastSeen > STALE_PLAYER_MS) {
        room.players.delete(id);
        removed = true;
        if (room.hostId === id) {
          room.hostId = undefined;
        }
      }
    });
  if (removed) {
      ensureHost(room);
      await roomStore.set(room);
      broadcastRoster(room);
    }
  }
}

async function autoStartEligibleRooms() {
  const rooms = await roomStore.list();
  for (const room of rooms) {
    let autoStage: StagePayload | null = null;
    const updated = await updateRoom(
      room.code,
      (roomValue) => {
        const maybeStage = maybeAutoStartRoom(roomValue);
        if (maybeStage) {
          autoStage = maybeStage;
        }
      },
      { createIfMissing: false },
    );
    if (updated && autoStage) {
      await clearPublicRoomPointerIfMatch(updated.code);
      broadcastToRoom(updated.code, { type: "stage", payload: autoStage });
      scheduleStageTimers(updated);
    }
  }
}

function maybeAutoStartRoom(room: Room) {
  if (!room.stage) {
    ensureRoomStage(room);
  }
  ensureHost(room);
  if (room.stage?.phase !== "lobby") {
    return null;
  }
  if (room.players.size < MIN_ROOM_PLAYERS) {
    return null;
  }
  const players = Array.from(room.players.values());
  const readyPlayers = players.filter((player) => player.ready);
  if (readyPlayers.length < MIN_ROOM_PLAYERS) {
    return null;
  }
  if (room.hostId) {
    const host = room.players.get(room.hostId);
    if (!host?.ready) {
      return null;
    }
  }
  const nextStage: StagePayload = {
    roomCode: room.code,
    phase: "prepared",
    questionIndex: typeof room.currentQuestionIndex === "number" ? room.currentQuestionIndex : 0,
    roundStartAt: Date.now() + PREPARED_DURATION_MS,
  };
  room.stage = nextStage;
  room.currentQuestionIndex = nextStage.questionIndex ?? 0;
  return nextStage;
}

async function getPublicRoomPointer(): Promise<string | null> {
  if (redis) {
    return redis.get(PUBLIC_ROOM_POINTER_KEY);
  }
  return publicRoomPointerMemory;
}

async function setPublicRoomPointer(code: string) {
  const ttlSec = Math.max(60, Math.ceil(ROOM_TTL_MS / 1000));
  if (redis) {
    await redis.set(PUBLIC_ROOM_POINTER_KEY, code, "EX", ttlSec);
    return;
  }
  publicRoomPointerMemory = code;
}

async function trySetPublicRoomPointer(code: string): Promise<boolean> {
  const ttlSec = Math.max(60, Math.ceil(ROOM_TTL_MS / 1000));
  if (redis) {
    const res = await redis.set(PUBLIC_ROOM_POINTER_KEY, code, "EX", ttlSec, "NX");
    return Boolean(res);
  }
  if (publicRoomPointerMemory) {
    return false;
  }
  publicRoomPointerMemory = code;
  return true;
}

async function clearPublicRoomPointerIfMatch(code: string) {
  if (redis) {
    const current = await redis.get(PUBLIC_ROOM_POINTER_KEY);
    if (current === code) {
      await redis.del(PUBLIC_ROOM_POINTER_KEY);
    }
    return;
  }
  if (publicRoomPointerMemory === code) {
    publicRoomPointerMemory = null;
  }
}

async function resolvePublicJoinRoom(): Promise<string> {
  const mainRoom = await roomStore.get(PUBLIC_ROOM_CODE);
  if (!mainRoom) {
    return PUBLIC_ROOM_CODE;
  }
  ensureRoomStage(mainRoom);
  if (mainRoom.stage?.phase === "lobby" && mainRoom.players.size < MAX_ROOM_PLAYERS) {
    return PUBLIC_ROOM_CODE;
  }
  const pointer = await getPublicRoomPointer();
  if (pointer) {
    const room = await roomStore.get(pointer);
    if (!room) {
      const created = buildNewRoom(pointer);
      ensureRoomStage(created);
      metrics.roomsCreated += 1;
      await roomStore.set(created);
      return pointer;
    }
    ensureRoomStage(room);
    if (room.stage?.phase === "lobby" && room.players.size < MAX_ROOM_PLAYERS) {
      return pointer;
    }
    await clearPublicRoomPointerIfMatch(pointer);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let candidate = generateRoomCode(4 + Math.floor(Math.random() * 3));
    for (let i = 0; i < 5; i += 1) {
      const existing = await roomStore.get(candidate);
      if (!existing) break;
      candidate = generateRoomCode(4 + Math.floor(Math.random() * 3));
    }
    const claimed = await trySetPublicRoomPointer(candidate);
    if (claimed) {
      const room = buildNewRoom(candidate);
      ensureRoomStage(room);
      metrics.roomsCreated += 1;
      await roomStore.set(room);
      return candidate;
    }
    const current = await getPublicRoomPointer();
    if (current) {
      const room = await roomStore.get(current);
      if (!room) {
        const created = buildNewRoom(current);
        ensureRoomStage(created);
        metrics.roomsCreated += 1;
        await roomStore.set(created);
        return current;
      }
      ensureRoomStage(room);
      if (room.stage?.phase === "lobby" && room.players.size < MAX_ROOM_PLAYERS) {
        return current;
      }
    }
  }
  return PUBLIC_ROOM_CODE;
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

async function getRoomOrSend(roomCode: string, res: express.Response) {
  const room = await roomStore.get(roomCode);
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

testRouter.get("/rooms", async (_req, res) => {
  const rooms = await roomStore.list();
  res.json({
    ok: true,
    rooms: rooms.map((room) => buildRoomSnapshot(room)),
  });
});

testRouter.post("/rooms", async (req, res) => {
  const roomCode = typeof req.body?.roomCode === "string" ? req.body.roomCode : undefined;
  const hostId = typeof req.body?.hostId === "string" ? req.body.hostId : `test-host-${Date.now()}`;
  const avatarId = typeof req.body?.avatarId === "string" ? req.body.avatarId : "avatar_robot_party";
  const playerName = typeof req.body?.playerName === "string" ? req.body.playerName : undefined;
  const ready = req.body?.ready !== false;
  let resolvedCode = roomCode;
  if (!resolvedCode) {
    const created = await getOrCreateRoom();
    resolvedCode = created.code;
  }
  const room = await updateRoom(
    resolvedCode,
    (roomValue) => {
      if (!roomValue.hostId) {
        roomValue.hostId = hostId;
      }
      addOrUpdatePlayer(roomValue, hostId, avatarId, ready, playerName);
      ensureRoomStage(roomValue);
    },
    { createIfMissing: true },
  );
  if (!room) {
    res.status(500).json({ ok: false, error: "room_create_failed" });
    return;
  }
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.get("/rooms/:roomCode", async (req, res) => {
  const room = await getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/players", async (req, res) => {
  const playerId = req.body?.playerId;
  const avatarId = req.body?.avatarId ?? "avatar_robot_party";
  const playerName = typeof req.body?.playerName === "string" ? req.body.playerName : undefined;
  if (typeof playerId !== "string" || typeof avatarId !== "string") {
    res.status(400).json({ ok: false, error: "playerId and avatarId required" });
    return;
  }
  const ready = req.body?.ready !== false;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      addOrUpdatePlayer(roomValue, playerId, avatarId, ready, playerName);
      if (req.body?.asHost === true || !roomValue.hostId) {
        roomValue.hostId = playerId;
      }
      ensureRoomStage(roomValue);
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.delete("/rooms/:roomCode/players/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      roomValue.players.delete(playerId);
      if (roomValue.hostId === playerId) {
        roomValue.hostId = roomValue.players.keys().next().value as string | undefined;
      }
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/players/:playerId/ready", async (req, res) => {
  let playerFound = false;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      const player = roomValue.players.get(req.params.playerId);
      if (!player) {
        return;
      }
      playerFound = true;
      player.ready = req.body?.ready === true;
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  if (!playerFound) {
    res.status(404).json({ ok: false, error: "player_not_found" });
    return;
  }
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/players/:playerId/avatar", async (req, res) => {
  const avatarId = req.body?.avatarId;
  if (typeof avatarId !== "string") {
    res.status(400).json({ ok: false, error: "avatarId required" });
    return;
  }
  let playerFound = false;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      const player = roomValue.players.get(req.params.playerId);
      if (!player) {
        return;
      }
      playerFound = true;
      player.avatarId = avatarId;
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  if (!playerFound) {
    res.status(404).json({ ok: false, error: "player_not_found" });
    return;
  }
  broadcastRoster(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/stage", async (req, res) => {
  const phase = req.body?.phase as RoomPhase | undefined;
  const playerId = req.body?.playerId as string | undefined;
  const force = req.body?.force === true;
  if (!phase || !allowedPhases.has(phase)) {
    res.status(400).json({ ok: false, error: "invalid phase" });
    return;
  }
  const nextStage: StagePayload = {
    roomCode: req.params.roomCode,
    phase,
  };
  if (typeof req.body?.questionIndex === "number") {
    nextStage.questionIndex = req.body.questionIndex;
  }
  if (typeof req.body?.roundStartAt === "number") {
    nextStage.roundStartAt = req.body.roundStartAt;
  }
  let notHost = false;
  let blockedByMinPlayers = false;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      if (!force && playerId && roomValue.hostId && roomValue.hostId !== playerId) {
        notHost = true;
        return;
      }
      if (phase === "round" && roomValue.players.size < MIN_ROOM_PLAYERS) {
        blockedByMinPlayers = true;
        return;
      }
      roomValue.stage = { ...nextStage, roomCode: roomValue.code };
      if (typeof nextStage.questionIndex === "number") {
        roomValue.currentQuestionIndex = nextStage.questionIndex;
      }
      ensureRoomStage(roomValue);
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  if (notHost) {
    res.status(403).json({ ok: false, error: "not host" });
    return;
  }
  if (blockedByMinPlayers) {
    res.status(409).json({ ok: false, error: "min_players" });
    return;
  }
  if (phase === "round") {
    await clearPublicRoomPointerIfMatch(room.code);
  }
  broadcastToRoom(room.code, { type: "stage", payload: room.stage });
  scheduleStageTimers(room);
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/question", async (req, res) => {
  const rawPayload = req.body;
  if (!validateQuestionFn(rawPayload)) {
    res.status(400).json({ ok: false, error: "invalid question", details: validateQuestion.errors });
    return;
  }
  let resolvedIndex: number | undefined;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      resolvedIndex =
        typeof rawPayload.questionIndex === "number"
          ? rawPayload.questionIndex
          : roomValue.currentQuestionIndex;
      if (typeof resolvedIndex === "number") {
        roomValue.questionsByIndex.set(resolvedIndex, {
          correctIndex: rawPayload.correct_index,
          durationMs: rawPayload.duration_ms,
        });
        roomValue.currentQuestionIndex = resolvedIndex;
      }
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  const payload = { ...rawPayload, roomCode: room.code };
  broadcastToRoom(room.code, { type: "question", payload });
  res.json({ ok: true });
});

testRouter.post("/rooms/:roomCode/answer", async (req, res) => {
  const payload = { ...req.body, roomCode: req.params.roomCode };
  if (!validateAnswerFn(payload)) {
    res.status(400).json({ ok: false, error: "invalid answer", details: validateAnswer.errors });
    return;
  }
  let playerFound = false;
  let scorePayload: ReturnType<typeof buildScorePayload> | null = null;
  const room = await updateRoom(
    req.params.roomCode,
    (roomValue) => {
      const player = roomValue.players.get(payload.playerId);
      if (!player) {
        return;
      }
      playerFound = true;
      const questionIndex =
        typeof payload.questionIndex === "number"
          ? payload.questionIndex
          : roomValue.currentQuestionIndex;
      if (typeof questionIndex !== "number") {
        return;
      }
      const answeredSet = roomValue.answeredByIndex.get(questionIndex) ?? new Set<string>();
      if (answeredSet.has(payload.playerId)) {
        return;
      }
      answeredSet.add(payload.playerId);
      roomValue.answeredByIndex.set(questionIndex, answeredSet);
      const questionInfo = roomValue.questionsByIndex.get(questionIndex);
      if (questionInfo) {
        const isCorrect = payload.answerIndex === questionInfo.correctIndex;
        const scoring = calculateScore({
          isCorrect,
          latencyMs: payload.latencyMs ?? 0,
          durationMs: questionInfo.durationMs ?? 10000,
          startAt: roomValue.stage?.roundStartAt,
        });
        player.score += scoring.points;
        player.correctCount += scoring.correctIncrement;
        player.streak = isCorrect ? player.streak + 1 : 0;
        scorePayload = buildScorePayload(roomValue);
      }
    },
    { createIfMissing: false },
  );
  if (!room) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  if (!playerFound) {
    res.status(404).json({ ok: false, error: "player_not_found" });
    return;
  }
  if (scorePayload) {
    broadcastToRoom(room.code, { type: "score", payload: scorePayload });
  }
  broadcastToRoom(room.code, { type: "answer", payload });
  res.json({ ok: true, room: buildRoomSnapshot(room) });
});

testRouter.post("/rooms/:roomCode/broadcast", async (req, res) => {
  const room = await getRoomOrSend(req.params.roomCode, res);
  if (!room) return;
  const payload = req.body;
  broadcastToRoom(room.code, payload);
  res.json({ ok: true });
});

testRouter.post("/rooms/:roomCode/reset", async (req, res) => {
  const roomCode = req.params.roomCode;
  const deleted = await roomStore.delete(roomCode);
  if (!deleted) {
    res.status(404).json({ ok: false, error: "room_not_found" });
    return;
  }
  metrics.roomsExpired += 1;
  res.json({ ok: true });
});

wss.on("connection", (socket, request) => {
  const ip = resolveIp(request);
  socketState.set(socket, { ip, lastPong: Date.now() });
  metrics.wsConnections += 1;
  console.log("ws:connect");

  socket.on("pong", () => {
    const state = socketState.get(socket);
    if (!state) return;
    state.lastPong = Date.now();
    if (state.joinedRoom && state.playerId) {
      void markPlayerSeen(state.joinedRoom, state.playerId, state.connectionId);
    }
  });

  socket.on("message", async (data) => {
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
      if (state.joinedRoom && state.playerId) {
        void markPlayerSeen(state.joinedRoom, state.playerId, state.connectionId);
      }

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

        const processJoin = async () => {
          if (state.joinedRoom) {
            send(socket, { type: "joined", payload: { roomCode: state.joinedRoom } });
            return;
          }
          const connectionId = crypto.randomUUID();
          let roomCodeForJoin = joinPayload.roomCode;
          if (joinPayload.roomCode === PUBLIC_ROOM_CODE) {
            roomCodeForJoin = await resolvePublicJoinRoom();
          }
          const roomBurst = checkRate(`join:room:${roomCodeForJoin}`, 5000, 6, 12);
          if (!roomBurst.allowed) {
            logIncident({
              at: Date.now(),
              type: "join_burst",
              ip: state.ip,
              roomCode: joinPayload.roomCode,
            });
            metrics.joinFail += 1;
            return;
          }
          if (roomBurst.delayMs > 0) {
            setTimeout(() => {
              void processJoin();
            }, roomBurst.delayMs);
            return;
          }
          let isHost = false;
          let joinAllowed = true;
          let joinRoomCode = roomCodeForJoin;
          const playerName =
            typeof joinPayload.playerName === "string" ? joinPayload.playerName.trim().slice(0, 18) : undefined;
          const room = await updateRoom(
            joinRoomCode,
            (roomValue) => {
              joinRoomCode = roomValue.code;
              if (roomValue.players.size >= MAX_ROOM_PLAYERS && !roomValue.players.has(joinPayload.playerId)) {
                joinAllowed = false;
                return;
              }
              if (!roomValue.hostId || !roomValue.players.has(roomValue.hostId)) {
                roomValue.hostId = joinPayload.playerId;
                isHost = true;
              } else if (roomValue.hostId === joinPayload.playerId) {
                isHost = true;
              }
              addOrUpdatePlayer(
                roomValue,
                joinPayload.playerId,
                joinPayload.avatarId,
                false,
                playerName,
                connectionId,
              );
              ensureRoomStage(roomValue);
            },
            { createIfMissing: true },
          );
          if (!room || !joinAllowed) {
            send(socket, { type: "error", errors: [{ message: "room full" }] });
            logIncident({ at: Date.now(), type: "room_full", ip: state.ip, roomCode: joinRoomCode });
            metrics.joinFail += 1;
            return;
          }
          state.joinedRoom = room.code;
          state.playerId = joinPayload.playerId;
          state.connectionId = connectionId;
          send(socket, { type: "joined", payload: { roomCode: room.code, isHost, stage: room.stage } });
          broadcastRoster(room);
          metrics.joinSuccess += 1;
        };

        if (joinRate.delayMs > 0) {
          setTimeout(() => {
            void processJoin();
          }, joinRate.delayMs);
        } else {
          await processJoin();
        }
        return;
      }

      if (type === "leave") {
        const leavePayload = payload as any;
        const roomCode = leavePayload?.roomCode;
        const playerId = leavePayload?.playerId;
        if (!roomCode || !playerId) {
          send(socket, { type: "error", errors: [{ message: "invalid leave" }] });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "leave" });
          return;
        }
        if (!state.joinedRoom || state.joinedRoom !== roomCode || state.playerId !== playerId) {
          send(socket, { type: "error", errors: [{ message: "invalid leave" }] });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "leave_room" });
          return;
        }
        const room = await updateRoom(
          roomCode,
          (roomValue) => {
            if (!isCurrentConnection(roomValue, playerId, state.connectionId)) {
              return;
            }
            roomValue.players.delete(playerId);
            if (roomValue.hostId === playerId) {
              const nextHost = roomValue.players.keys().next().value as string | undefined;
              roomValue.hostId = nextHost;
            }
          },
          { createIfMissing: false },
        );
        if (room) {
          await touchRoom(room);
          broadcastRoster(room);
        }
        state.joinedRoom = undefined;
        state.playerId = undefined;
        send(socket, { type: "left", payload: { roomCode } });
        return;
      }

      if (type === "name") {
        const namePayload = payload as any;
        const roomCode = namePayload?.roomCode;
        const playerId = namePayload?.playerId;
        const name =
          typeof namePayload?.name === "string" ? namePayload.name.trim().slice(0, 18) : "";
        if (!roomCode || !playerId || !name) {
          send(socket, { type: "error", errors: [{ message: "invalid name" }] });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "name" });
          return;
        }
        if (!state.joinedRoom || state.joinedRoom !== roomCode || state.playerId !== playerId) {
          send(socket, { type: "error", errors: [{ message: "invalid name" }] });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "name_room" });
          return;
        }
        const room = await updateRoom(
          roomCode,
          (roomValue) => {
            const player = roomValue.players.get(playerId);
            if (player) {
              if (!isCurrentConnection(roomValue, playerId, state.connectionId)) {
                return;
              }
              player.name = name;
              player.lastSeen = Date.now();
            }
          },
          { createIfMissing: false },
        );
        if (!room) {
          send(socket, { type: "error", errors: [{ message: "room not found" }] });
          return;
        }
        broadcastRoster(room);
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
        let notHost = false;
        let blockedByMinPlayers = false;
        const room = await updateRoom(
          roomCode,
          (roomValue) => {
            if (roomValue.hostId && roomValue.hostId !== state.playerId) {
              notHost = true;
              return;
            }
            if (roomValue.hostId && roomValue.hostId === state.playerId) {
              if (!isCurrentConnection(roomValue, state.playerId, state.connectionId)) {
                notHost = true;
                return;
              }
            }
            if ((phase === "round" || phase === "prepared") && roomValue.players.size < MIN_ROOM_PLAYERS) {
              blockedByMinPlayers = true;
              return;
            }
            const nextStage: StagePayload = {
              roomCode: roomValue.code,
              phase: phase as RoomPhase,
            };
            if (typeof stagePayload.questionIndex === "number") {
              nextStage.questionIndex = stagePayload.questionIndex;
            } else if (typeof roomValue.currentQuestionIndex === "number") {
              nextStage.questionIndex = roomValue.currentQuestionIndex;
            }
            if (typeof stagePayload.roundStartAt === "number") {
              nextStage.roundStartAt = stagePayload.roundStartAt;
            } else if (phase === "prepared") {
              nextStage.roundStartAt = Date.now() + PREPARED_DURATION_MS;
            }
            roomValue.stage = nextStage;
            if (typeof nextStage.questionIndex === "number") {
              roomValue.currentQuestionIndex = nextStage.questionIndex;
            }
            ensureRoomStage(roomValue);
          },
          { createIfMissing: false },
        );
        if (!room) {
          return;
        }
        if (notHost) {
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "stage_host" });
          return;
        }
        if (blockedByMinPlayers) {
          send(socket, { type: "error", errors: [{ message: "min_players" }] });
          logIncident({ at: Date.now(), type: "invalid_payload", ip: state.ip, detail: "stage_min_players" });
          return;
        }
        if (phase === "round" || phase === "prepared") {
          await clearPublicRoomPointerIfMatch(room.code);
        }
        broadcastToRoom(roomCode, { type: "stage", payload: room.stage });
        scheduleStageTimers(room);
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
        let autoStage: StagePayload | null = null;
        const room = await updateRoom(
          roomCode,
          (roomValue) => {
            const player = roomValue.players.get(playerId);
            if (!player) {
              return;
            }
            if (!isCurrentConnection(roomValue, playerId, state.connectionId)) {
              return;
            }
            ensureHost(roomValue, playerId);
            player.ready = ready;
            player.lastSeen = Date.now();
            const maybeStage = maybeAutoStartRoom(roomValue);
            if (maybeStage) {
              autoStage = maybeStage;
            }
          },
          { createIfMissing: false },
        );
        if (room) {
          broadcastRoster(room);
          if (autoStage) {
            const autoPhase = (autoStage as StagePayload | null)?.phase;
            if (autoPhase === "round" || autoPhase === "prepared") {
              await clearPublicRoomPointerIfMatch(room.code);
            }
            broadcastToRoom(room.code, { type: "stage", payload: autoStage });
            scheduleStageTimers(room);
          }
        }
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
        const room = await updateRoom(
          roomCode,
          (roomValue) => {
            const player = roomValue.players.get(playerId);
            if (!player) {
              return;
            }
            if (!isCurrentConnection(roomValue, playerId, state.connectionId)) {
              return;
            }
            player.avatarId = avatarId;
            player.lastSeen = Date.now();
          },
          { createIfMissing: false },
        );
        if (room) {
          broadcastRoster(room);
        }
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
          const room = await updateRoom(
            state.joinedRoom,
            (roomValue) => {
              if (roomValue.hostId && roomValue.hostId === state.playerId) {
                if (!isCurrentConnection(roomValue, state.playerId, state.connectionId)) {
                  return;
                }
              }
              const index =
                typeof questionPayload.questionIndex === "number"
                  ? questionPayload.questionIndex
                  : roomValue.currentQuestionIndex;
              if (typeof index === "number") {
                roomValue.questionsByIndex.set(index, {
                  correctIndex: questionPayload.correct_index,
                  durationMs: questionPayload.duration_ms,
                });
                roomValue.currentQuestionIndex = index;
              }
            },
            { createIfMissing: false },
          );
          if (room) {
            broadcastToRoom(room.code, { type: "question", payload: questionPayload });
            if (room.stage?.phase === "round") {
              scheduleStageTimers(room);
            }
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
        let scorePayload: ReturnType<typeof buildScorePayload> | null = null;
        let autoStage: StagePayload | null = null;
        const room = await updateRoom(
          answerPayload.roomCode,
          (roomValue) => {
            if (!isCurrentConnection(roomValue, answerPayload.playerId, state.connectionId)) {
              return;
            }
            const questionIndex =
              typeof answerPayload.questionIndex === "number"
                ? answerPayload.questionIndex
                : roomValue.currentQuestionIndex;
            if (typeof questionIndex !== "number") {
              return;
            }
            const answeredSet = roomValue.answeredByIndex.get(questionIndex) ?? new Set<string>();
            if (answeredSet.has(answerPayload.playerId)) {
              return;
            }
            answeredSet.add(answerPayload.playerId);
            roomValue.answeredByIndex.set(questionIndex, answeredSet);
            const questionInfo = roomValue.questionsByIndex.get(questionIndex);
            const player = roomValue.players.get(answerPayload.playerId);
            if (questionInfo && player) {
              const isCorrect = answerPayload.answerIndex === questionInfo.correctIndex;
              const scoring = calculateScore({
                isCorrect,
                latencyMs: answerPayload.latencyMs ?? 0,
                durationMs: questionInfo.durationMs ?? 10000,
                startAt: roomValue.stage?.roundStartAt,
              });
              player.score += scoring.points;
              player.correctCount += scoring.correctIncrement;
              player.streak = isCorrect ? player.streak + 1 : 0;
              player.lastSeen = Date.now();
              scorePayload = buildScorePayload(roomValue);
            }
            if (roomValue.stage?.phase === "round" && roomValue.players.size > 0) {
              const allAnswered = answeredSet.size >= roomValue.players.size;
              if (allAnswered) {
                autoStage = {
                  roomCode: roomValue.code,
                  phase: "reveal",
                  questionIndex,
                  roundStartAt: roomValue.stage.roundStartAt ?? Date.now(),
                };
                roomValue.stage = autoStage;
                roomValue.currentQuestionIndex = questionIndex;
              }
            }
          },
          { createIfMissing: false },
        );
        if (room && scorePayload) {
          broadcastToRoom(room.code, { type: "score", payload: scorePayload });
        }
        broadcastToRoom(answerPayload.roomCode, { type: "answer", payload: answerPayload });
        metrics.answerAccepted += 1;
        if (room && autoStage) {
          clearRoomTimers(room.code);
          broadcastToRoom(room.code, { type: "stage", payload: autoStage });
          scheduleStageTimers(room);
        }
      }
    } catch (_err) {
      const state = socketState.get(socket);
      send(socket, { type: "error", errors: [{ message: "invalid message" }] });
      logIncident({ at: Date.now(), type: "invalid_payload", ip: state?.ip, detail: "parse" });
    }
  });

  socket.on("close", async () => {
    console.log("ws:disconnect");
    metrics.wsDisconnects += 1;
    const state = socketState.get(socket);
    if (state?.joinedRoom && state.playerId) {
      const room = await roomStore.get(state.joinedRoom);
      if (room) {
        const player = room.players.get(state.playerId);
        if (!player) {
          return;
        }
        if (state.connectionId && player.connectionId && player.connectionId !== state.connectionId) {
          return;
        }
        room.players.delete(state.playerId);
        if (room.hostId === state.playerId) {
          const nextHost = room.players.keys().next().value as string | undefined;
          room.hostId = nextHost;
        }
        await touchRoom(room);
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
  wss.clients.forEach((client) => {
    const state = socketState.get(client);
    if (!state) {
      return;
    }
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }
    if (state.lastPong && now - state.lastPong > HEARTBEAT_TIMEOUT_MS) {
      client.terminate();
      return;
    }
    try {
      client.ping();
    } catch (_err) {
      client.terminate();
    }
  });
  void pruneStalePlayers();
  void autoStartEligibleRooms();
}, HEARTBEAT_INTERVAL_MS);

setInterval(async () => {
  const now = Date.now();
  const rooms = await roomStore.list();
  for (const room of rooms) {
    if (room.expiresAt <= now) {
      await roomStore.delete(room.code);
      clearRoomTimers(room.code);
      metrics.roomsExpired += 1;
    }
  }
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
