const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const manifestPath = path.join(__dirname, "..", "data", "memes_manifest.json");
const outputDir = path.join(__dirname, "..", "apps", "web", "public", "memes");
const pixabayDataPath = path.join(__dirname, "..", "data", "memes_all_pixabay.json");
const pixabayCachePath = path.join(__dirname, "..", "data", "pixabay_api_cache.json");

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const PIXABAY_RATE_LIMIT_PER_MINUTE = Number(process.env.PIXABAY_RATE_LIMIT_PER_MINUTE || 60);
const MEME_LIMIT = Number(process.env.MEME_LIMIT || 0);
const MEME_OFFSET = Number(process.env.MEME_OFFSET || 0);

const API_MIN_INTERVAL_MS = Math.max(250, Math.ceil(60000 / Math.max(1, PIXABAY_RATE_LIMIT_PER_MINUTE)));
const API_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

let pixabayIdByFileUrl = new Map();
if (fs.existsSync(pixabayDataPath)) {
  try {
    const pixabayItems = JSON.parse(fs.readFileSync(pixabayDataPath, "utf8"));
    if (Array.isArray(pixabayItems)) {
      pixabayIdByFileUrl = new Map(
        pixabayItems
          .filter((item) => item && item.fileURL && item.id)
          .map((item) => [item.fileURL, item.id]),
      );
    }
  } catch (err) {
    console.warn("failed to parse memes_all_pixabay.json", err.message);
  }
}

let pixabayCache = {};
if (fs.existsSync(pixabayCachePath)) {
  try {
    pixabayCache = JSON.parse(fs.readFileSync(pixabayCachePath, "utf8"));
  } catch (err) {
    console.warn("failed to parse pixabay_api_cache.json", err.message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function savePixabayCache() {
  try {
    fs.writeFileSync(pixabayCachePath, JSON.stringify(pixabayCache, null, 2));
  } catch (err) {
    console.warn("failed to write pixabay_api_cache.json", err.message);
  }
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const request = client.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (response) => {
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

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

let lastApiCallAt = 0;
async function enforceApiRateLimit() {
  const now = Date.now();
  const waitFor = lastApiCallAt + API_MIN_INTERVAL_MS - now;
  if (waitFor > 0) {
    await sleep(waitFor);
  }
  lastApiCallAt = Date.now();
}

const pixabayUrlCache = new Map();
async function resolvePixabayUrl(item) {
  if (!PIXABAY_API_KEY) return item.url;
  const pixabayId = pixabayIdByFileUrl.get(item.url);
  if (!pixabayId) return item.url;
  if (pixabayUrlCache.has(pixabayId)) {
    return pixabayUrlCache.get(pixabayId);
  }
  const cached = pixabayCache[pixabayId];
  if (cached && cached.url && Date.now() - cached.ts < API_CACHE_TTL_MS) {
    pixabayUrlCache.set(pixabayId, cached.url);
    return cached.url;
  }
  await enforceApiRateLimit();
  const apiUrl = `https://pixabay.com/api/?key=${encodeURIComponent(PIXABAY_API_KEY)}&id=${pixabayId}`;
  const data = await fetchJson(apiUrl);
  const hit = data?.hits?.[0];
  const resolved =
    hit?.largeImageURL || hit?.webformatURL || hit?.previewURL || item.url;
  pixabayUrlCache.set(pixabayId, resolved);
  pixabayCache[pixabayId] = { url: resolved, ts: Date.now() };
  savePixabayCache();
  return resolved;
}

async function run() {
  let ok = 0;
  let failed = 0;
  const startIndex = Number.isFinite(MEME_OFFSET) ? Math.max(0, MEME_OFFSET) : 0;
  const sliced = MEME_LIMIT > 0 ? approved.slice(startIndex, startIndex + MEME_LIMIT) : approved.slice(startIndex);
  for (const item of sliced) {
    const fileName = item.file_name || `${item.id}.jpg`;
    const filePath = path.join(outputDir, fileName);
    if (fs.existsSync(filePath)) {
      ok += 1;
      continue;
    }
    try {
      const url = await resolvePixabayUrl(item);
      // eslint-disable-next-line no-await-in-loop
      await downloadFile(url, filePath);
      ok += 1;
      console.log(`downloaded ${item.id}`);
      // polite pacing to avoid rate limits
      // eslint-disable-next-line no-await-in-loop
      await sleep(200);
    } catch (err) {
      failed += 1;
      console.error(`failed ${item.id}: ${err.message}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(400);
    }
  }
  console.log(`done: ok=${ok} failed=${failed}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
