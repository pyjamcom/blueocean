const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const manifestPath = path.join(ROOT, "data", "memes_manifest.json");
const questionsPath = path.join(ROOT, "data", "questions.json");
const outputDir = path.join(ROOT, "apps", "web", "public", "memes");
const poolPath = path.join(ROOT, "data", "pools", "visual_provocation.json");

const CHUNK_SIZE = 5; // 1 prompt + 4 answers

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function hasFile(fileName) {
  return fs.existsSync(path.join(outputDir, fileName));
}

const manifest = loadJson(manifestPath);
const items = Array.isArray(manifest.items) ? manifest.items : [];
const available = items
  .filter((item) => item && item.license_ok === true && item.file_name && hasFile(item.file_name))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

const chunkCount = Math.floor(available.length / CHUNK_SIZE);
const memeQuestions = [];

for (let i = 0; i < chunkCount; i += 1) {
  const chunk = available.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE);
  if (chunk.length < CHUNK_SIZE) break;
  const prompt = chunk[0];
  const answers = chunk.slice(1);
  memeQuestions.push({
    id: `q_meme_${String(i + 1).padStart(4, "0")}`,
    category: "visual_provocation",
    prompt_image: prompt.id,
    answers: answers.map((meme, idx) => ({
      id: `a${idx + 1}`,
      asset_id: meme.id,
      tags: ["meme"],
    })),
    correct_index: i % 4,
    humor_tag: "meme",
    duration_ms: 6000,
  });
}

const existing = fs.existsSync(questionsPath) ? loadJson(questionsPath) : { version: 1, questions: [] };
const existingQuestions = Array.isArray(existing.questions) ? existing.questions : [];
const filteredExisting = existingQuestions.filter((q) => !String(q.id || "").startsWith("q_meme_"));
const combined = [...filteredExisting, ...memeQuestions];

writeJson(questionsPath, { version: 1, questions: combined });

let pool = { type: "visual_provocation", question_ids: [] };
if (fs.existsSync(poolPath)) {
  const existingPool = loadJson(poolPath);
  if (existingPool && typeof existingPool === "object") {
    pool = { ...pool, ...existingPool };
  }
}

pool.question_ids = combined
  .filter((q) => q.category === "visual_provocation")
  .map((q) => q.id);

writeJson(poolPath, pool);

console.log(
  `meme questions: ${memeQuestions.length} (used ${memeQuestions.length * CHUNK_SIZE}/${available.length} files)`,
);
