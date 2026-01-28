const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const poolsDir = path.join(ROOT, "data", "pools");
const scenesPath = path.join(ROOT, "data", "story_scene_manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const scenes = readJson(scenesPath).scenes || [];
const byType = new Map();

scenes.forEach((scene) => {
  const type = scene.type;
  const qId = Array.isArray(scene.question_ids) && scene.question_ids[0]
    ? scene.question_ids[0]
    : scene.id;
  if (!type || !qId) return;
  if (!byType.has(type)) {
    byType.set(type, []);
  }
  byType.get(type).push(qId);
});

byType.forEach((ids, type) => {
  const poolPath = path.join(poolsDir, `${type}.json`);
  if (!fs.existsSync(poolPath)) return;
  const pool = readJson(poolPath);
  const existing = new Set(pool.question_ids || []);
  const nextIds = ids.filter((id) => !existing.has(id));
  if (nextIds.length === 0) return;
  pool.question_ids = [...nextIds, ...(pool.question_ids || [])];
  writeJson(poolPath, pool);
});

console.log("Pools updated for scene questions.");
