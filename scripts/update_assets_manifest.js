const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const manifestPath = path.join(ROOT, "assets", "manifest.json");
const assetsDir = path.join(ROOT, "assets");

const now = new Date().toISOString().slice(0, 10);

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    return { version: 1, assets: [] };
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function saveManifest(data) {
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getTags(id) {
  return id
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean);
}

const manifest = loadManifest();
const existing = new Map((manifest.assets || []).map((asset) => [asset.id, asset]));

const svgFiles = fs
  .readdirSync(assetsDir)
  .filter((file) => file.endsWith(".svg"));

svgFiles.forEach((file) => {
  const id = file.replace(/\.svg$/, "");
  if (existing.has(id)) {
    return;
  }
  const entry = {
    id,
    tags: getTags(id),
    file: `assets/${file}`,
    license: "CC0",
    source_url: "local://generated",
    evidence_file: "licenses/generated_cc0.png",
    license_checked_at: now,
  };
  manifest.assets.push(entry);
});

saveManifest(manifest);
console.log(`Manifest updated. Total assets: ${manifest.assets.length}`);
