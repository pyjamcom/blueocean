const fs = require("fs");
const path = require("path");

const urlsPath = path.join(__dirname, "..", "data", "memes_all_urls.txt");
const manifestPath = path.join(__dirname, "..", "data", "memes_manifest.json");

if (!fs.existsSync(urlsPath)) {
  console.error("memes_all_urls.txt not found");
  process.exit(1);
}

const raw = fs.readFileSync(urlsPath, "utf8");
const urls = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

const items = urls.map((url, index) => {
  let ext = ".jpg";
  try {
    const urlObj = new URL(url);
    const base = path.basename(urlObj.pathname);
    const parsedExt = path.extname(base);
    if (parsedExt) {
      ext = parsedExt.toLowerCase();
    }
  } catch (_err) {
    // keep default extension
  }
  const id = `meme_${String(index + 1).padStart(6, "0")}`;
  const fileName = `${id}${ext}`;
  return {
    id,
    url,
    file_name: fileName,
    public_path: `/memes/${fileName}`,
    license_ok: false,
    license_type: "",
    source_url: url,
    source_query: "",
    year_tag: "",
    safety_tags: ["no_text", "no_brand", "no_politics"],
    notes: "",
  };
});

const manifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  items,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`wrote ${items.length} items to ${manifestPath}`);
