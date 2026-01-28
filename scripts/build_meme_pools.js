const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const manifestPath = path.join(ROOT, "data", "memes_manifest.json");
const poolsDir = path.join(ROOT, "data", "pools");

if (!fs.existsSync(poolsDir)) {
  fs.mkdirSync(poolsDir, { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const items = Array.isArray(manifest.items) ? manifest.items : [];

const buildItem = (item) => ({
  id: item.id,
  public_path: item.public_path,
  license_type: item.license_type,
  source_url: item.source_url,
  source_query: item.source_query,
  year_tag: item.year_tag || "",
  safety_tags: item.safety_tags || [],
});

const pools = {
  memes_static_cc0: items.map(buildItem),
  memes_gif_cc0: [],
  memes_vector_cc0: [],
  memes_photo_templates_cc0: [],
  memes_reaction_sets_cc0: [],
};

Object.entries(pools).forEach(([name, list]) => {
  const payload = {
    type: name,
    items: list,
  };
  fs.writeFileSync(path.join(poolsDir, `${name}.json`), JSON.stringify(payload, null, 2) + "\n", "utf8");
});

console.log("Meme pools written.");
