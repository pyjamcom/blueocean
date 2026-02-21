#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Anima } = require("@animaapp/anima-sdk");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeNodeIds(args, env) {
  const fromArgs = splitCsv(args["node-ids"] || args["nodes-id"]);
  if (fromArgs.length > 0) return fromArgs;
  if (args["node-id"]) return [String(args["node-id"]).trim()];
  const fromEnv = splitCsv(env.FIGMA_NODE_IDS);
  if (fromEnv.length > 0) return fromEnv;
  if (env.FIGMA_NODE_ID) return [String(env.FIGMA_NODE_ID).trim()];
  return [];
}

function withDefaults(args) {
  const animaEnvPath = args.env || path.resolve(process.cwd(), "config/anima_api.env");
  const figmaEnvPath = args["figma-env"] || path.resolve(process.cwd(), "config/figma_api.env");
  const fromAnima = parseEnvFile(animaEnvPath);
  const fromFigma = parseEnvFile(figmaEnvPath);
  const env = { ...fromAnima, ...fromFigma, ...process.env };

  const cfg = {
    animaEnvPath,
    figmaEnvPath,
    animaToken: args["anima-token"] || env.ANIMA_API_TOKEN || "",
    animaTeamId: args["team-id"] || env.ANIMA_TEAM_ID || "",
    animaUserId: args["user-id"] || env.ANIMA_USER_ID || "",
    figmaToken: args["figma-token"] || env.FIGMA_ACCESS_TOKEN || "",
    fileKey: args["file-key"] || env.FIGMA_FILE_KEY || "",
    nodeIds: normalizeNodeIds(args, env),
    framework: args.framework || env.ANIMA_FRAMEWORK || "react",
    language: args.language || env.ANIMA_LANGUAGE || "typescript",
    styling: args.styling || env.ANIMA_STYLING || "plain_css",
    uiLibrary: args["ui-library"] || env.ANIMA_UI_LIBRARY || "",
    outDir: path.resolve(process.cwd(), args.out || env.ANIMA_OUT_DIR || "reports/anima"),
  };

  return cfg;
}

function validateConfig(cfg) {
  if (!cfg.animaToken) {
    throw new Error(
      `Missing ANIMA_API_TOKEN. Set it in ${cfg.animaEnvPath} or pass --anima-token.`,
    );
  }
  if (!cfg.figmaToken) {
    throw new Error(
      `Missing FIGMA_ACCESS_TOKEN. Set it in ${cfg.figmaEnvPath} or pass --figma-token.`,
    );
  }
  if (!cfg.fileKey) {
    throw new Error(
      `Missing FIGMA_FILE_KEY. Set it in ${cfg.figmaEnvPath} or pass --file-key.`,
    );
  }
  if (cfg.nodeIds.length === 0) {
    throw new Error(
      "Missing FIGMA_NODE_ID/FIGMA_NODE_IDS. Set it in config/figma_api.env or pass --node-id/--node-ids.",
    );
  }
  if (!["react", "html"].includes(cfg.framework)) {
    throw new Error(`Invalid --framework value "${cfg.framework}". Use react or html.`);
  }
  if (!["typescript", "javascript"].includes(cfg.language)) {
    throw new Error(`Invalid --language value "${cfg.language}". Use typescript or javascript.`);
  }
  if (!["plain_css", "tailwind", "inline_styles"].includes(cfg.styling)) {
    throw new Error(
      `Invalid --styling value "${cfg.styling}". Use plain_css, tailwind, or inline_styles.`,
    );
  }
}

function safePath(baseDir, relativePath) {
  const normalized = relativePath.replace(/^\/+/, "");
  const target = path.resolve(baseDir, normalized);
  if (!target.startsWith(baseDir + path.sep) && target !== baseDir) {
    throw new Error(`Unsafe output path from API: ${relativePath}`);
  }
  return target;
}

function writeFiles(baseDir, files) {
  const paths = [];
  for (const [relativePath, payload] of Object.entries(files || {})) {
    const outPath = safePath(baseDir, relativePath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (payload.isBinary) {
      fs.writeFileSync(outPath, Buffer.from(payload.content, "base64"));
    } else {
      fs.writeFileSync(outPath, payload.content, "utf8");
    }
    paths.push(outPath);
  }
  return paths;
}

async function run() {
  const args = parseArgs(process.argv);
  const cfg = withDefaults(args);
  validateConfig(cfg);

  const auth = cfg.animaTeamId
    ? { token: cfg.animaToken, teamId: cfg.animaTeamId }
    : cfg.animaUserId
      ? { token: cfg.animaToken, userId: cfg.animaUserId }
      : { token: cfg.animaToken };

  const anima = new Anima({ auth });
  const settings = {
    framework: cfg.framework,
    language: cfg.language,
    styling: cfg.styling,
  };
  if (cfg.uiLibrary) {
    settings.uiLibrary = cfg.uiLibrary;
  }

  console.log(
    `[anima] start file=${cfg.fileKey} nodes=${cfg.nodeIds.join(",")} framework=${cfg.framework} styling=${cfg.styling}`,
  );

  const result = await anima.generateCode(
    {
      fileKey: cfg.fileKey,
      figmaToken: cfg.figmaToken,
      nodesId: cfg.nodeIds,
      settings,
    },
    {
      onQueueing: ({ sessionId }) => console.log(`[anima] queueing session=${sessionId}`),
      onStart: ({ sessionId }) => console.log(`[anima] started session=${sessionId}`),
      onGeneratingCode: ({ status, progress }) => {
        console.log(`[anima] status=${status} progress=${progress}`);
      },
      onCodegenCompleted: () => console.log("[anima] generation completed"),
    },
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(cfg.outDir, `${cfg.fileKey}_${stamp}`);
  fs.mkdirSync(runDir, { recursive: true });

  const written = writeFiles(runDir, result.files);
  const metaPath = path.join(runDir, "anima_run.json");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        fileKey: cfg.fileKey,
        nodesId: cfg.nodeIds,
        sessionId: result.sessionId,
        tokenUsage: result.tokenUsage,
        figmaFileName: result.figmaFileName || null,
        figmaSelectedFrameName: result.figmaSelectedFrameName || null,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`[anima] OK files=${written.length} dir=${runDir} meta=${metaPath}`);
}

run().catch((err) => {
  console.error(`[anima] FAIL: ${err.message}`);
  process.exit(1);
});
