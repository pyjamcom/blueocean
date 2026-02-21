#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_NODES = [
  "105:1969",
  "105:2011",
  "105:2025",
  "105:2040",
  "105:2160",
  "105:2407",
  "106:4141",
  "106:4776",
  "106:4907",
  "106:4973",
  "107:6140",
];

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
    .map((item) => item.trim())
    .filter(Boolean);
}

function nowStamp() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function loadState(statePath, nodeIds) {
  if (!fs.existsSync(statePath)) {
    return {
      createdAt: new Date().toISOString(),
      completed: [],
      attempts: [],
      remaining: [...nodeIds],
    };
  }
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    const completed = Array.isArray(parsed.completed) ? parsed.completed : [];
    return {
      createdAt: parsed.createdAt || new Date().toISOString(),
      completed,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      remaining: nodeIds.filter((id) => !completed.includes(id)),
    };
  } catch (error) {
    return {
      createdAt: new Date().toISOString(),
      completed: [],
      attempts: [],
      remaining: [...nodeIds],
    };
  }
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        createdAt: state.createdAt,
        updatedAt: new Date().toISOString(),
        completed: state.completed,
        remaining: state.remaining,
        attempts: state.attempts,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function runCodegen(cfg, nodeId) {
  const scriptPath = path.resolve(__dirname, "anima_codegen_from_figma.js");
  const args = [
    scriptPath,
    "--file-key",
    cfg.fileKey,
    "--node-id",
    nodeId,
    "--framework",
    cfg.framework,
    "--language",
    cfg.language,
    "--styling",
    cfg.styling,
    "--out",
    cfg.outDir,
  ];

  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const lastLine = lines[lines.length - 1] || "";
  const limitHit = /Requested Usage Exceeds Limit/i.test(output);
  const success = result.status === 0;
  const stamp = nowStamp();
  const nodeStamp = nodeId.replace(/:/g, "-");
  const logName = `run_${nodeStamp}_${stamp}.log`;
  const logPath = path.join(cfg.outDir, logName);
  fs.mkdirSync(cfg.outDir, { recursive: true });
  fs.writeFileSync(logPath, output, "utf8");

  return {
    success,
    limitHit,
    status: result.status,
    logName,
    logPath,
    lastLine,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  const nodeIds = splitCsv(args["node-ids"]);
  const queue = nodeIds.length > 0 ? nodeIds : DEFAULT_NODES;
  const outDir = path.resolve(process.cwd(), args.out || "reports/anima/section_105_1504");
  const statePath = path.resolve(outDir, args.state || "retry_state.json");
  const fileKey = args["file-key"] || process.env.FIGMA_FILE_KEY || "z8NmGr4kz5UO2woLmgkZDC";
  const framework = args.framework || "react";
  const language = args.language || "typescript";
  const styling = args.styling || "plain_css";
  const intervalMin = Number(args["interval-min"] || 30);
  const watch = args.watch === "true";

  const cfg = { outDir, fileKey, framework, language, styling };

  console.log(`[retry] start queue=${queue.join(",")} watch=${watch} intervalMin=${intervalMin}`);
  console.log(`[retry] state=${statePath}`);

  const state = loadState(statePath, queue);
  state.remaining = queue.filter((id) => !state.completed.includes(id));
  saveState(statePath, state);

  while (state.remaining.length > 0) {
    console.log(`[retry] cycle start remaining=${state.remaining.length}`);
    let stopForLimit = false;
    const cycleNodes = [...state.remaining];

    for (const nodeId of cycleNodes) {
      const result = runCodegen(cfg, nodeId);
      const attempt = {
        nodeId,
        at: new Date().toISOString(),
        success: result.success,
        limitHit: result.limitHit,
        status: result.status,
        logName: result.logName,
        lastLine: result.lastLine,
      };
      state.attempts.push(attempt);
      console.log(
        `[retry] node=${nodeId} success=${result.success} limit=${result.limitHit} log=${result.logName}`,
      );

      if (result.success) {
        if (!state.completed.includes(nodeId)) {
          state.completed.push(nodeId);
        }
        state.remaining = state.remaining.filter((id) => id !== nodeId);
      } else if (result.limitHit) {
        stopForLimit = true;
        break;
      }
      saveState(statePath, state);
    }

    saveState(statePath, state);

    if (!watch) {
      break;
    }
    if (state.remaining.length === 0) {
      break;
    }
    if (!stopForLimit) {
      console.log("[retry] cycle done, continuing next interval for remaining nodes.");
    } else {
      console.log("[retry] limit hit, waiting for next interval before retry.");
    }
    await sleep(Math.max(1, intervalMin) * 60 * 1000);
  }

  if (state.remaining.length === 0) {
    console.log("[retry] all nodes completed.");
  } else {
    console.log(`[retry] finished with remaining=${state.remaining.join(",")}`);
  }
}

main().catch((error) => {
  console.error(`[retry] fatal: ${error.message}`);
  process.exit(1);
});
