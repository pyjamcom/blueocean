#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

function getConfig(args) {
  const envPath = args.env || path.resolve(process.cwd(), "config/figma_api.env");
  const fromFile = parseEnvFile(envPath);
  const env = { ...fromFile, ...process.env };

  return {
    envPath,
    token: args.token || env.FIGMA_ACCESS_TOKEN || "",
    fileKey: args["file-key"] || env.FIGMA_FILE_KEY || "",
    nodeId: args["node-id"] || env.FIGMA_NODE_ID || "",
    depth: args.depth || env.FIGMA_DEPTH || "",
    version: args.version || env.FIGMA_VERSION || "",
    outDir: path.resolve(process.cwd(), args.out || "reports/figma"),
  };
}

function buildUrl(cfg) {
  if (!cfg.fileKey) {
    throw new Error("Missing FIGMA_FILE_KEY. Set it in config/figma_api.env or pass --file-key.");
  }
  const base = `https://api.figma.com/v1/files/${cfg.fileKey}`;
  const search = new URLSearchParams();
  if (cfg.nodeId) search.set("ids", cfg.nodeId);
  if (cfg.depth) search.set("depth", String(cfg.depth));
  if (cfg.version) search.set("version", String(cfg.version));
  const suffix = search.toString();
  return suffix ? `${base}?${suffix}` : base;
}

async function run() {
  const args = parseArgs(process.argv);
  const cfg = getConfig(args);

  if (!cfg.token) {
    throw new Error(
      `Missing FIGMA_ACCESS_TOKEN. Add it to ${cfg.envPath} or pass --token.`,
    );
  }

  const url = buildUrl(cfg);
  console.log(`[figma] GET ${url}`);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Figma-Token": cfg.token,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 500)}`);
  }

  if (!res.ok) {
    const details = json?.err || json?.message || JSON.stringify(json);
    throw new Error(`Figma API error ${res.status}: ${details}`);
  }

  fs.mkdirSync(cfg.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = cfg.nodeId ? `_${cfg.nodeId.replace(/[:]/g, "-")}` : "";
  const outPath = path.join(cfg.outDir, `file_${cfg.fileKey}${suffix}_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(json, null, 2), "utf8");

  const name = json?.name || "unknown";
  const nodeCount = Array.isArray(json?.nodes) ? Object.keys(json.nodes).length : 0;
  console.log(`[figma] OK. file=\"${name}\" nodes=${nodeCount} saved=${outPath}`);
}

run().catch((err) => {
  console.error(`[figma] FAIL: ${err.message}`);
  process.exit(1);
});
