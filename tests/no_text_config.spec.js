const assert = require("assert");
const fs = require("fs");
const path = require("path");

const allowedPattern = /^[A-Za-z0-9_:/.-]+$/;

function collectStrings(value, out) {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function run() {
  const baseDir = path.join(__dirname, "..");
  const poolDir = path.join(baseDir, "data", "pools");
  const poolFiles = fs.readdirSync(poolDir).filter((name) => name.endsWith(".json"));

  const files = [
    path.join(baseDir, "data", "game_story.json"),
    path.join(baseDir, "data", "story_scene_manifest.json"),
    path.join(baseDir, "data", "story_pack_global.json"),
    ...poolFiles.map((name) => path.join(poolDir, name)),
  ];

  const violations = [];

  files.forEach((filePath) => {
    const data = loadJson(filePath);
    const strings = [];
    collectStrings(data, strings);
    strings.forEach((value) => {
      if (!allowedPattern.test(value)) {
        violations.push({ file: filePath, value });
      }
    });
  });

  assert.strictEqual(
    violations.length,
    0,
    `ui config contains disallowed text: ${JSON.stringify(violations.slice(0, 5))}`,
  );

  console.log("no_text_config.spec.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
