const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

function loadSchema() {
  const schemaPath = path.join(__dirname, "..", "schema", "questions.schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
}

function normalizeQuestions(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.questions)) {
    return data.questions;
  }
  throw new Error("Input must be an array or an object with a questions array");
}

function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

function hasLetters(value) {
  return /[A-Za-z]/.test(value);
}

function collectAssetIdIssues(question) {
  const issues = [];
  const checkValue = (label, value) => {
    if (!value || typeof value !== "string") {
      return;
    }
    if (isUrl(value)) {
      return;
    }
    if (hasLetters(value)) {
      issues.push({ label, value });
    }
  };

  checkValue("prompt_image", question.prompt_image);
  checkValue("audio_asset_id", question.audio_asset_id);
  checkValue("trigger_asset_id", question.trigger_asset_id);
  checkValue("trophy_stamp_id", question.trophy_stamp_id);

  if (Array.isArray(question.face_overlay_ids)) {
    question.face_overlay_ids.forEach((id) => checkValue("face_overlay_ids", id));
  }
  if (Array.isArray(question.prompt_pair_ids)) {
    question.prompt_pair_ids.forEach((id) => checkValue("prompt_pair_ids", id));
  }

  if (Array.isArray(question.answers)) {
    question.answers.forEach((answer) => {
      if (answer && typeof answer === "object") {
        checkValue("answer.asset_id", answer.asset_id);
      }
    });
  }

  return issues;
}

function validateQuestions(data, schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const questions = normalizeQuestions(data);

  const errors = [];
  const assetIdErrors = [];

  questions.forEach((question) => {
    const valid = validate(question);
    if (!valid) {
      errors.push({ id: question.id, errors: validate.errors || [] });
    }
    const issues = collectAssetIdIssues(question);
    if (issues.length > 0) {
      assetIdErrors.push({ id: question.id, issues });
    }
  });

  return {
    valid: errors.length === 0 && assetIdErrors.length === 0,
    errors,
    assetIdErrors,
  };
}

function run() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/validate_questions.js <questions.json>");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const schema = loadSchema();
  const result = validateQuestions(raw, schema);

  if (!result.valid) {
    result.errors.forEach((item) => {
      console.error(`Schema errors for question ${item.id}:`);
      console.error(item.errors);
    });
    result.assetIdErrors.forEach((item) => {
      console.error(`Asset id errors for question ${item.id}:`);
      console.error(item.issues);
    });
    process.exit(1);
  }

  console.log("Questions validation passed");
}

if (require.main === module) {
  run();
}

module.exports = {
  collectAssetIdIssues,
  normalizeQuestions,
  validateQuestions,
};
