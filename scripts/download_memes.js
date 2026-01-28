const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const manifestPath = path.join(__dirname, "..", "data", "memes_manifest.json");
const outputDir = path.join(__dirname, "..", "apps", "web", "public", "memes");

if (!fs.existsSync(manifestPath)) {
  console.error("memes_manifest.json not found. Run scripts/build_meme_manifest.js first.");
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const items = Array.isArray(manifest.items) ? manifest.items : [];
const approved = items.filter((item) => item.license_ok === true);

if (approved.length === 0) {
  console.log("No approved items (license_ok=true). Nothing to download.");
  process.exit(0);
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(downloadFile(response.headers.location, filePath));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close(resolve);
      });
    });
    request.on("error", reject);
  });
}

async function run() {
  let ok = 0;
  let failed = 0;
  for (const item of approved) {
    const fileName = item.file_name || `${item.id}.jpg`;
    const filePath = path.join(outputDir, fileName);
    if (fs.existsSync(filePath)) {
      ok += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await downloadFile(item.url, filePath);
      ok += 1;
      console.log(`downloaded ${item.id}`);
    } catch (err) {
      failed += 1;
      console.error(`failed ${item.id}: ${err.message}`);
    }
  }
  console.log(`done: ok=${ok} failed=${failed}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
