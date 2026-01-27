const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

function loadSchema() {
  const schemaPath = path.join(__dirname, "..", "schema", "assets.schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
}

function normalizeAssets(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.assets)) {
    return data.assets;
  }
  throw new Error("Input must be an array or an object with an assets array");
}

function validateAssets(data, schema, baseDir) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const assets = normalizeAssets(data);

  const errors = [];
  const ids = new Set();
  const duplicates = [];
  const missingFiles = [];
  const missingEvidence = [];

  assets.forEach((asset) => {
    const valid = validate(asset);
    if (!valid) {
      errors.push({ id: asset.id, errors: validate.errors || [] });
    }
    if (ids.has(asset.id)) {
      duplicates.push(asset.id);
    } else {
      ids.add(asset.id);
    }
    if (asset.file) {
      const filePath = path.isAbsolute(asset.file)
        ? asset.file
        : path.join(baseDir, asset.file);
      if (!fs.existsSync(filePath)) {
        missingFiles.push({ id: asset.id, file: asset.file });
      }
    }
    if (asset.evidence_file) {
      const evidencePath = path.isAbsolute(asset.evidence_file)
        ? asset.evidence_file
        : path.join(baseDir, asset.evidence_file);
      if (!fs.existsSync(evidencePath)) {
        missingEvidence.push({ id: asset.id, evidence_file: asset.evidence_file });
      }
    }
  });

  return {
    valid:
      errors.length === 0 &&
      duplicates.length === 0 &&
      missingFiles.length === 0 &&
      missingEvidence.length === 0,
    errors,
    duplicates,
    missingFiles,
    missingEvidence,
  };
}

function run() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/validate_assets.js <assets.json>");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const schema = loadSchema();
  const baseDir = path.join(__dirname, "..");
  const result = validateAssets(raw, schema, baseDir);

  if (!result.valid) {
    result.errors.forEach((item) => {
      console.error(`Schema errors for asset ${item.id}:`);
      console.error(item.errors);
    });
    if (result.duplicates.length > 0) {
      console.error("Duplicate asset ids:", result.duplicates);
    }
    if (result.missingFiles.length > 0) {
      console.error("Missing asset files:", result.missingFiles);
    }
    if (result.missingEvidence.length > 0) {
      console.error("Missing license evidence files:", result.missingEvidence);
    }
    process.exit(1);
  }

  console.log("Assets validation passed");
}

if (require.main === module) {
  run();
}

module.exports = { normalizeAssets, validateAssets };
