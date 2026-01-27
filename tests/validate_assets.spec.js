const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { validateAssets } = require("../scripts/validate_assets");

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "schema", "assets.schema.json"), "utf-8"),
);

function run() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "assets", "manifest.json"), "utf-8"),
  );
  const result = validateAssets(manifest, schema, path.join(__dirname, ".."));
  assert.strictEqual(result.valid, true, "asset manifest should pass validation");
  console.log("validate_assets.spec.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
