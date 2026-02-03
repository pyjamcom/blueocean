const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateQuestions } = require("../scripts/validate_questions");

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "schema", "questions.schema.json"), "utf-8"),
);

function makeAnswer(id, assetId) {
  return {
    id,
    asset_id: assetId,
    tags: ["fun"],
  };
}

function baseQuestion(overrides = {}) {
  return {
    id: "q1",
    category: "visual_provocation",
    prompt_image: "10001",
    answers: [
      makeAnswer("a1", "20001"),
      makeAnswer("a2", "20002"),
      makeAnswer("a3", "20003"),
      makeAnswer("a4", "20004"),
    ],
    correct_index: 2,
    humor_tag: "silly",
    duration_ms: 5000,
    ...overrides,
  };
}

function run() {
  let result = validateQuestions([baseQuestion()], schema);
  assert.strictEqual(result.valid, true, "valid question should pass");

  const passCategories = [
    "visual_provocation",
    "telepath_sync",
    "absurd_toast",
  ];

  passCategories.forEach((category) => {
    const passResult = validateQuestions([baseQuestion({ category })], schema);
    assert.strictEqual(passResult.valid, true, `${category} should pass`);
  });

  result = validateQuestions([
    baseQuestion({ answers: [makeAnswer("a1", "1"), makeAnswer("a2", "2")] }),
  ], schema);
  assert.strictEqual(result.valid, false, "answers length should fail");

  result = validateQuestions([baseQuestion({ category: "sound_pantomime" })], schema);
  assert.strictEqual(result.valid, false, "sound_pantomime needs audio_asset_id");
  result = validateQuestions([baseQuestion({ category: "sound_pantomime", audio_asset_id: "30001" })], schema);
  assert.strictEqual(result.valid, true, "sound_pantomime passes with audio_asset_id");

  result = validateQuestions([baseQuestion({ category: "face_mimic" })], schema);
  assert.strictEqual(result.valid, false, "face_mimic needs face_overlay_ids");
  result = validateQuestions([baseQuestion({ category: "face_mimic", face_overlay_ids: ["40001"] })], schema);
  assert.strictEqual(result.valid, true, "face_mimic passes with face_overlay_ids");

  result = validateQuestions([baseQuestion({ category: "absurd_sum" })], schema);
  assert.strictEqual(result.valid, false, "absurd_sum needs prompt_pair_ids");
  result = validateQuestions([baseQuestion({ category: "absurd_sum", prompt_pair_ids: ["50001", "50002"] })], schema);
  assert.strictEqual(result.valid, true, "absurd_sum passes with prompt_pair_ids");

  result = validateQuestions([baseQuestion({ category: "icon_battle" })], schema);
  assert.strictEqual(result.valid, false, "icon_battle needs battle_pair_ids");
  result = validateQuestions([baseQuestion({ category: "icon_battle", battle_pair_ids: ["51001", "51002"] })], schema);
  assert.strictEqual(result.valid, true, "icon_battle passes with battle_pair_ids");

  result = validateQuestions([baseQuestion({ category: "drunk_reflex" })], schema);
  assert.strictEqual(result.valid, false, "drunk_reflex needs trigger_asset_id");
  result = validateQuestions([baseQuestion({ category: "drunk_reflex", trigger_asset_id: "60001" })], schema);
  assert.strictEqual(result.valid, true, "drunk_reflex passes with trigger_asset_id");

  result = validateQuestions([baseQuestion({ category: "silhouette_guess" })], schema);
  assert.strictEqual(result.valid, false, "silhouette_guess needs silhouette_base_id");
  result = validateQuestions([baseQuestion({ category: "silhouette_guess", silhouette_base_id: "61001" })], schema);
  assert.strictEqual(result.valid, true, "silhouette_guess passes with silhouette_base_id");

  result = validateQuestions([baseQuestion({ category: "trophy_rewards" })], schema);
  assert.strictEqual(result.valid, false, "trophy_rewards needs trophy_stamp_id");
  result = validateQuestions([baseQuestion({ category: "trophy_rewards", trophy_stamp_id: "70001" })], schema);
  assert.strictEqual(result.valid, true, "trophy_rewards passes with trophy_stamp_id");

  result = validateQuestions([
    baseQuestion({ answers: [makeAnswer("a1", "AB12"), makeAnswer("a2", "2"), makeAnswer("a3", "3"), makeAnswer("a4", "4")] }),
  ], schema);
  assert.strictEqual(result.valid, true, "asset_id with letters should pass");

  result = validateQuestions([
    baseQuestion({ answers: [makeAnswer("a1", "12-A"), makeAnswer("a2", "2"), makeAnswer("a3", "3"), makeAnswer("a4", "4")] }),
  ], schema);
  assert.strictEqual(result.valid, false, "asset_id with symbols should fail");

  console.log("validate_questions.spec.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
