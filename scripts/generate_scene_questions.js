const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const questionsPath = path.join(ROOT, "data", "questions.json");
const scenesPath = path.join(ROOT, "data", "story_scene_manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function tagsFromId(id) {
  return id.split("_").filter(Boolean);
}

const questionsData = readJson(questionsPath);
const questions = Array.isArray(questionsData.questions) ? questionsData.questions : [];
const existingIds = new Set(questions.map((q) => q.id));

const sceneData = readJson(scenesPath);
const scenes = Array.isArray(sceneData.scenes) ? sceneData.scenes : [];

const newQuestions = [];

scenes.forEach((scene) => {
  const qId = Array.isArray(scene.question_ids) && scene.question_ids[0]
    ? scene.question_ids[0]
    : scene.id;
  if (!qId || existingIds.has(qId)) {
    return;
  }
  const category = scene.type;
  const promptId = scene.prompt_asset_id;
  const answers = (scene.answer_asset_ids || []).slice(0, 4).map((assetId, index) => ({
    id: `${qId}_a${index + 1}`,
    asset_id: assetId,
    tags: tagsFromId(assetId),
  }));
  while (answers.length < 4) {
    answers.push({
      id: `${qId}_a${answers.length + 1}`,
      asset_id: promptId,
      tags: tagsFromId(promptId),
    });
  }
  const base = {
    id: qId,
    category,
    prompt_image: promptId,
    answers,
    correct_index: 0,
    humor_tag: scene.humor_tag || "silly",
    duration_ms: category === "drunk_reflex" ? 5000 : 6000,
  };
  if (category === "drunk_reflex") {
    base.trigger_asset_id = promptId;
  }
  if (category === "sound_pantomime") {
    base.audio_asset_id = promptId;
  }
  if (category === "face_mimic") {
    base.face_overlay_ids = scene.answer_asset_ids || [promptId];
  }
  if (category === "absurd_sum") {
    base.prompt_pair_ids = [promptId, promptId];
  }
  if (category === "icon_battle") {
    if (scene.id.includes("rocket_vs_snail")) {
      base.battle_pair_ids = ["icon_rocket", "icon_snail"];
    } else if (scene.id.includes("shark_vs_taco")) {
      base.battle_pair_ids = ["icon_shark", "icon_taco"];
    } else {
      base.battle_pair_ids = [promptId, promptId];
    }
  }
  if (category === "silhouette_guess") {
    base.silhouette_base_id = promptId;
  }
  if (category === "trophy_rewards") {
    base.trophy_stamp_id = promptId;
  }

  newQuestions.push(base);
  existingIds.add(qId);
});

questionsData.questions = questions.concat(newQuestions);
writeJson(questionsPath, questionsData);
console.log(`Added ${newQuestions.length} scene questions.`);
