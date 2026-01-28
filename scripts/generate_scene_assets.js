const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const assetsDir = path.join(ROOT, "assets");
const storyScenePath = path.join(ROOT, "data", "story_scene_manifest.json");
const storyPath = path.join(ROOT, "data", "game_story.json");

if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const storyScenes = readJson(storyScenePath);
const story = readJson(storyPath);

const assetIds = new Set();

if (Array.isArray(storyScenes?.scenes)) {
  storyScenes.scenes.forEach((scene) => {
    if (scene.prompt_asset_id) assetIds.add(scene.prompt_asset_id);
    (scene.answer_asset_ids || []).forEach((id) => assetIds.add(id));
  });
}

const storyIcons = story?.story || {};
[
  "theme_icons",
  "mood_icons",
  "passport_stamps",
  "problem_escape_icons",
  "passport_stamp_ids",
  "victory_anim_assets",
  "panic_mode_icons",
].forEach((key) => {
  (storyIcons[key] || []).forEach((id) => assetIds.add(id));
});

const roles = storyIcons.roles || {};
Object.values(roles).forEach((id) => assetIds.add(id));

const STORY_EXTRA = [
  "stamp_cheers",
  "stamp_rocket",
  "stamp_sun",
  "stamp_moon",
  "stamp_firework",
  "stamp_laugh",
];
STORY_EXTRA.forEach((id) => assetIds.add(id));

const extraBattleIcons = ["icon_rocket", "icon_snail", "icon_shark", "icon_taco"];
extraBattleIcons.forEach((id) => assetIds.add(id));

const palette = {
  yellow: "#ffd166",
  orange: "#f4a261",
  red: "#ff6b6b",
  pink: "#ff9f9f",
  teal: "#63e6be",
  blue: "#4dabf7",
  purple: "#845ef7",
  gray: "#2b2d42",
  white: "#f8f9fa",
};

const stroke = "rgba(17,17,17,0.9)";
const strokeWidth = 5;

function svgWrap(content) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
    `${content}</svg>`;
}

function circle(cx, cy, r, fill = palette.yellow, extra = "") {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${extra}/>`;
}

function rect(x, y, w, h, rx = 12, fill = palette.yellow, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${extra}/>`;
}

function line(x1, y1, x2, y2, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" ${extra}/>`;
}

function svgPath(d, fill = "none", extra = "") {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
}

function polygon(points, fill = palette.yellow, extra = "") {
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" ${extra}/>`;
}

function star(cx, cy, r, fill = palette.orange) {
  const points = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    points.push(`${x},${y}`);
    const angle2 = angle + Math.PI / 5;
    const x2 = cx + Math.cos(angle2) * (r * 0.45);
    const y2 = cy + Math.sin(angle2) * (r * 0.45);
    points.push(`${x2},${y2}`);
  }
  return polygon(points.join(" "), fill);
}

function smileFace({ eyes = "dot", mouth = "smile", color = palette.yellow } = {}) {
  const eyeLeft = eyes === "wink"
    ? line(44, 56, 54, 56)
    : circle(46, 54, 5, palette.white);
  const eyeRight = eyes === "squint"
    ? line(70, 56, 80, 56)
    : circle(78, 54, 5, palette.white);
  const mouthPath = mouth === "frown"
    ? svgPath("M44 82 Q64 66 84 82")
    : mouth === "surprised"
      ? circle(64, 80, 8, palette.white)
      : mouth === "flat"
        ? line(46, 80, 82, 80)
        : svgPath("M44 76 Q64 92 84 76");
  return [
    circle(64, 64, 38, color),
    eyeLeft,
    eyeRight,
    mouthPath,
  ].join("");
}

function catFace() {
  return [
    circle(64, 68, 34, palette.yellow),
    polygon("34,40 50,32 50,54", palette.orange),
    polygon("94,40 78,32 78,54", palette.orange),
    circle(52, 68, 4, palette.white),
    circle(76, 68, 4, palette.white),
    svgPath("M52 80 Q64 90 76 80"),
  ].join("");
}

function dogFace() {
  return [
    circle(64, 70, 34, palette.orange),
    rect(30, 50, 18, 30, 8, palette.red),
    rect(80, 50, 18, 30, 8, palette.red),
    circle(52, 70, 4, palette.white),
    circle(76, 70, 4, palette.white),
    circle(64, 82, 6, palette.gray),
  ].join("");
}

function penguinBody() {
  return [
    rect(40, 26, 48, 76, 24, palette.gray),
    rect(48, 38, 32, 52, 18, palette.white),
    polygon("58,42 70,42 64,54", palette.orange),
  ].join("");
}

function pizzaSlice() {
  return [
    polygon("32,28 96,52 40,104", palette.orange),
    polygon("32,28 96,52 90,30", palette.yellow),
    circle(60, 60, 6, palette.red),
    circle(50, 78, 5, palette.red),
    circle(74, 74, 5, palette.red),
  ].join("");
}

function toaster() {
  return [
    rect(28, 40, 72, 52, 18, palette.yellow),
    rect(38, 50, 52, 12, 6, palette.white),
    rect(42, 64, 10, 10, 4, palette.red),
    rect(58, 64, 10, 10, 4, palette.red),
  ].join("");
}

function headphones() {
  return [
    svgPath("M40 46 Q64 22 88 46"),
    rect(28, 46, 14, 26, 6, palette.blue),
    rect(86, 46, 14, 26, 6, palette.blue),
  ].join("");
}

function shaker() {
  return [
    rect(54, 20, 20, 18, 6, palette.white),
    rect(48, 32, 32, 52, 10, palette.teal),
  ].join("");
}

function tray() {
  return [
    rect(38, 64, 52, 10, 6, palette.white),
    circle(64, 60, 6, palette.orange),
  ].join("");
}

function chefHat() {
  return [
    circle(50, 40, 12, palette.white),
    circle(64, 36, 14, palette.white),
    circle(78, 40, 12, palette.white),
    rect(44, 48, 40, 14, 6, palette.white),
  ].join("");
}

function goggles() {
  return [
    rect(40, 54, 18, 12, 6, palette.blue),
    rect(70, 54, 18, 12, 6, palette.blue),
    line(58, 60, 70, 60),
  ].join("");
}

function hatTop() {
  return [
    rect(40, 32, 48, 34, 6, palette.gray),
    rect(30, 64, 68, 10, 6, palette.gray),
  ].join("");
}

function hatBucket() {
  return [
    rect(38, 34, 52, 26, 10, palette.orange),
    rect(32, 60, 64, 12, 8, palette.orange),
  ].join("");
}

function hatParty() {
  return [
    polygon("40,76 64,28 88,76", palette.red),
    circle(64, 26, 6, palette.yellow),
  ].join("");
}

function hatCowboy() {
  return [
    rect(42, 40, 44, 22, 6, palette.orange),
    rect(24, 60, 80, 12, 8, palette.orange),
  ].join("");
}

function hatWizard() {
  return [
    polygon("44,86 64,30 84,86", palette.purple),
    rect(36, 86, 56, 10, 6, palette.purple),
    star(64, 54, 6, palette.yellow),
  ].join("");
}

function glassesClink() {
  return [
    rect(34, 42, 24, 28, 6, palette.white),
    rect(70, 42, 24, 28, 6, palette.white),
    line(46, 70, 46, 92),
    line(82, 70, 82, 92),
    star(64, 36, 8, palette.yellow),
  ].join("");
}

function glassSingle() {
  return [
    rect(52, 34, 24, 32, 6, palette.white),
    line(64, 66, 64, 96),
  ].join("");
}

function cup() {
  return [
    polygon("44,34 84,34 76,86 52,86", palette.white),
    line(84, 44, 96, 60),
  ].join("");
}

function bell() {
  return [
    svgPath("M36 76 Q64 28 92 76"),
    rect(40, 76, 48, 12, 6, palette.orange),
    circle(64, 84, 6, palette.yellow),
  ].join("");
}

function banana() {
  return [
    svgPath("M36 80 Q64 36 98 50 Q70 94 36 80", palette.yellow),
    svgPath("M40 76 Q64 44 90 52", "none"),
  ].join("");
}

function cameraOverlay() {
  return [
    rect(70, 58, 26, 18, 6, palette.blue),
    circle(83, 67, 6, palette.white),
  ].join("");
}

function radioOverlay() {
  return [
    rect(68, 58, 28, 18, 6, palette.teal),
    line(72, 56, 80, 40),
  ].join("");
}

function micOverlay() {
  return [
    circle(88, 50, 8, palette.gray),
    rect(84, 56, 8, 18, 4, palette.gray),
  ].join("");
}

function rocket() {
  return [
    polygon("64,20 90,70 64,60 38,70", palette.red),
    circle(64, 46, 8, palette.white),
    polygon("58,70 70,70 64,90", palette.orange),
  ].join("");
}

function snail() {
  return [
    circle(52, 70, 18, palette.orange),
    svgPath("M52 60 Q64 60 64 70 Q64 80 52 80"),
    rect(68, 64, 26, 12, 6, palette.teal),
    line(72, 64, 72, 52),
    line(82, 64, 82, 52),
  ].join("");
}

function shark() {
  return [
    polygon("32,70 96,50 96,90", palette.blue),
    polygon("72,40 86,52 62,52", palette.blue),
    circle(76, 66, 4, palette.white),
  ].join("");
}

function taco() {
  return [
    svgPath("M32 70 Q64 32 96 70", palette.orange),
    rect(36, 70, 56, 16, 6, palette.red),
    circle(48, 68, 4, palette.teal),
    circle(64, 66, 4, palette.yellow),
    circle(80, 68, 4, palette.teal),
  ].join("");
}

function guitar() {
  return [
    circle(52, 70, 16, palette.orange),
    circle(74, 58, 10, palette.orange),
    rect(80, 40, 10, 50, 4, palette.gray),
  ].join("");
}

function drums() {
  return [
    rect(36, 58, 56, 32, 8, palette.red),
    line(36, 58, 92, 58),
    line(40, 46, 52, 58),
    line(76, 46, 88, 58),
  ].join("");
}

function bass() {
  return [
    circle(50, 74, 18, palette.purple),
    rect(66, 36, 12, 60, 4, palette.gray),
  ].join("");
}

function violin() {
  return [
    circle(56, 70, 14, palette.orange),
    circle(74, 62, 10, palette.orange),
    rect(78, 38, 8, 50, 4, palette.gray),
  ].join("");
}

function bottle() {
  return [
    rect(52, 24, 24, 20, 6, palette.blue),
    rect(46, 38, 36, 60, 12, palette.blue),
    circle(64, 54, 4, palette.white),
    circle(56, 70, 4, palette.white),
  ].join("");
}

function cloud() {
  return [
    circle(48, 66, 16, palette.white),
    circle(64, 58, 18, palette.white),
    circle(80, 66, 14, palette.white),
    rect(42, 66, 50, 18, 10, palette.white),
  ].join("");
}

function globe() {
  return [
    circle(64, 64, 30, palette.teal),
    svgPath("M34 64 Q64 38 94 64"),
    svgPath("M34 64 Q64 90 94 64"),
    line(64, 34, 64, 94),
  ].join("");
}

function cactus() {
  return [
    rect(54, 34, 20, 60, 10, palette.teal),
    rect(38, 54, 16, 18, 8, palette.teal),
    rect(74, 46, 16, 22, 8, palette.teal),
  ].join("");
}

function sock() {
  return [
    rect(52, 30, 26, 44, 10, palette.orange),
    rect(36, 64, 36, 20, 10, palette.orange),
  ].join("");
}

function trophy(size = "normal") {
  const scale = size === "tiny" ? 0.6 : size === "big" ? 1.2 : 1;
  const offsetX = 64 - 20 * scale;
  const offsetY = 44 - 20 * scale;
  return [
    rect(offsetX, offsetY, 40 * scale, 24 * scale, 8 * scale, palette.yellow),
    rect(54, 68, 20, 12, 6, palette.orange),
    rect(48, 80, 32, 10, 6, palette.orange),
  ].join("");
}

function stampFrame(inner) {
  return [
    rect(24, 24, 80, 80, 12, palette.white),
    inner,
  ].join("");
}

function confetti() {
  return [
    rect(40, 40, 10, 10, 3, palette.red),
    rect(70, 36, 12, 12, 3, palette.teal),
    rect(56, 70, 10, 10, 3, palette.yellow),
    rect(82, 70, 10, 10, 3, palette.purple),
  ].join("");
}

function renderIcon(id) {
  if (id === "prompt_rocket_vs_snail") {
    return rocket() + snail();
  }
  if (id === "prompt_shark_vs_taco") {
    return shark() + taco();
  }
  if (id === "prompt_same_hat") {
    return circle(44, 70, 20, palette.white) + circle(84, 70, 20, palette.white);
  }
  if (id === "prompt_mirror_toast") {
    return glassesClink();
  }
  if (id === "prompt_silhouette_tall_hat") {
    return circle(64, 72, 26, palette.gray) + hatTop();
  }
  if (id === "ans_draw") {
    return line(24, 90, 104, 90) + line(40, 40, 40, 90) + line(60, 40, 60, 90);
  }
  if (id === "ans_friendly") {
    return circle(52, 64, 16, palette.red) + circle(76, 64, 16, palette.pink);
  }
  if (id === "prompt_wide_eyes") return smileFace({ eyes: "dot", mouth: "flat", color: palette.yellow });
  if (id === "prompt_cheek_puff") return smileFace({ eyes: "dot", mouth: "flat", color: palette.orange });

  if (id.startsWith("theme_")) {
    if (id.includes("passport")) return rect(36, 32, 56, 64, 12, palette.red) + circle(64, 64, 12, palette.yellow);
    if (id.includes("route")) return svgPath("M30 90 Q64 30 98 90") + circle(30, 90, 8, palette.yellow) + circle(98, 90, 8, palette.yellow);
    if (id.includes("stamp")) return stampFrame(star(64, 64, 12, palette.orange));
    if (id.includes("wave")) return svgPath("M24 70 Q44 50 64 70 T104 70");
    return circle(64, 64, 32, palette.blue);
  }
  if (id.startsWith("mood_")) {
    if (id.includes("laugh")) return smileFace({ mouth: "smile", color: palette.yellow });
    if (id.includes("wild")) return star(64, 64, 18, palette.red);
    if (id.includes("breezy")) return svgPath("M24 60 Q48 48 72 60") + svgPath("M40 76 Q64 64 88 76");
    if (id.includes("friends")) return circle(48, 64, 18, palette.blue) + circle(80, 64, 18, palette.teal);
    if (id.includes("confetti")) return confetti();
    if (id.includes("relief")) return cloud();
    if (id.includes("party")) return star(64, 64, 16, palette.yellow) + confetti();
    if (id.includes("splash")) return svgPath("M64 32 Q96 70 64 96 Q32 70 64 32", palette.teal);
  }
  if (id.startsWith("icon_")) {
    if (id.includes("passport")) return rect(36, 32, 56, 64, 12, palette.red) + star(64, 64, 10, palette.yellow);
    if (id.includes("stamp")) return stampFrame(star(64, 64, 12, palette.orange));
    if (id.includes("traveler")) return circle(64, 50, 16, palette.yellow) + rect(52, 70, 24, 26, 8, palette.blue);
    if (id.includes("rocket")) return rocket();
    if (id.includes("snail")) return snail();
    if (id.includes("shark")) return shark();
    if (id.includes("taco")) return taco();
  }
  if (id.startsWith("stamp_")) {
    return stampFrame(star(64, 64, 12, palette.orange));
  }
  if (id.startsWith("escape_") || id.startsWith("panic_") || id.startsWith("anim_")) {
    if (id.includes("confetti")) return confetti();
    if (id.includes("firework")) return star(64, 64, 18, palette.red);
    if (id.includes("laugh")) return smileFace({ mouth: "smile", color: palette.yellow });
    if (id.includes("swirl")) return svgPath("M32 64 Q64 32 96 64 Q64 96 32 64");
    if (id.includes("rocket")) return rocket();
    if (id.includes("clapper")) return rect(40, 54, 48, 22, 6, palette.gray);
    if (id.includes("whistle")) return rect(44, 60, 40, 14, 6, palette.gray);
    if (id.includes("zigzag")) return svgPath("M36 40 L52 60 L68 40 L84 60");
    if (id.includes("music")) return svgPath("M48 40 L48 86") + circle(46, 90, 6, palette.blue);
    if (id.includes("splash")) return svgPath("M64 32 Q96 70 64 96 Q32 70 64 32", palette.teal);
    return star(64, 64, 16, palette.orange);
  }

  if (id.startsWith("prompt_cat") || id.startsWith("ans_cat")) {
    return catFace() + headphones() + rect(40, 92, 48, 12, 6, palette.gray);
  }
  if (id.startsWith("ans_dog_dj")) {
    return dogFace() + headphones() + rect(40, 92, 48, 12, 6, palette.gray);
  }
  if (id.startsWith("prompt_penguin") || id.startsWith("ans_penguin")) {
    let overlay = "";
    if (id.includes("bartender")) overlay = shaker();
    if (id.includes("waiter")) overlay = tray();
    if (id.includes("chef")) overlay = chefHat();
    if (id.includes("pilot")) overlay = goggles();
    return penguinBody() + overlay;
  }
  if (id.includes("pizza")) {
    let overlay = "";
    if (id.includes("crown")) overlay = star(64, 26, 10, palette.yellow);
    if (id.includes("mask")) overlay = rect(44, 56, 40, 18, 8, palette.gray);
    if (id.includes("shoe")) overlay = rect(46, 84, 36, 14, 6, palette.gray);
    if (id.includes("drone")) overlay = line(34, 32, 94, 32);
    return pizzaSlice() + overlay;
  }
  if (id.includes("toaster")) {
    return toaster();
  }
  if (id.includes("hat_top")) return hatTop();
  if (id.includes("hat_bucket")) return hatBucket();
  if (id.includes("hat_party")) return hatParty();
  if (id.includes("hat_none")) return circle(64, 70, 30, palette.white);
  if (id.includes("hat_cowboy")) return hatCowboy();
  if (id.includes("hat_wizard")) return hatWizard();
  if (id.includes("toast_clink")) return glassesClink();
  if (id.includes("toast_wave")) return glassSingle() + line(84, 38, 100, 52);
  if (id.includes("toast_spin")) return glassSingle() + svgPath("M80 40 Q104 64 80 88");
  if (id.includes("toast_silence")) return glassSingle() + line(88, 34, 102, 48);
  if (id.includes("toast_cloud")) return toastBase() + cloud();
  if (id.includes("toast_globe")) return toastBase() + globe();
  if (id.includes("toast_rain")) return toastBase() + line(48, 88, 48, 108) + line(64, 88, 64, 108);
  if (id.includes("toast_sun")) return toastBase() + star(64, 32, 10, palette.yellow);
  if (id.includes("toast_thunder")) return toastBase() + svgPath("M60 28 L72 28 L60 52 L74 52");
  if (id.includes("toast_moon")) return toastBase() + circle(80, 32, 10, palette.white);
  if (id.includes("toast_ring")) return toastBase() + circle(64, 28, 10, "none");
  if (id.includes("toast_rocket")) return toastBase() + rocket();
  if (id.includes("cup_flip")) return cup() + svgPath("M32 34 Q64 16 96 34");
  if (id.includes("flip_success")) return cup() + star(94, 30, 8, palette.yellow);
  if (id.includes("flip_spin")) return cup() + svgPath("M30 64 Q64 20 98 64");
  if (id.includes("flip_miss")) return cup() + line(30, 94, 98, 94);
  if (id.includes("flip_double")) return cup() + rect(32, 48, 16, 30, 6, palette.white);
  if (id.includes("bell")) {
    let overlay = "";
    if (id.includes("hit")) overlay = star(96, 30, 8, palette.yellow);
    if (id.includes("fake")) overlay = line(96, 40, 112, 56);
    if (id.includes("dodge")) overlay = line(20, 64, 32, 74);
    if (id.includes("double")) overlay = rect(18, 72, 28, 8, 4, palette.orange);
    if (id.includes("slap")) overlay = line(64, 16, 64, 28);
    return bell() + overlay;
  }
  if (id.includes("banana")) {
    let overlay = "";
    if (id.includes("phone")) overlay = rect(76, 64, 10, 18, 4, palette.gray);
    if (id.includes("camera")) overlay = cameraOverlay();
    if (id.includes("radio")) overlay = radioOverlay();
    if (id.includes("mic")) overlay = micOverlay();
    return banana() + overlay;
  }
  if (id.includes("face")) {
    if (id.includes("wide")) return smileFace({ eyes: "dot", mouth: "smile", color: palette.yellow });
    if (id.includes("squint")) return smileFace({ eyes: "squint", mouth: "smile", color: palette.yellow });
    if (id.includes("wink")) return smileFace({ eyes: "wink", mouth: "smile", color: palette.yellow });
    if (id.includes("blank")) return smileFace({ eyes: "dot", mouth: "flat", color: palette.yellow });
    if (id.includes("puff")) return smileFace({ eyes: "dot", mouth: "flat", color: palette.orange });
    if (id.includes("grin")) return smileFace({ eyes: "dot", mouth: "smile", color: palette.orange });
    if (id.includes("frown")) return smileFace({ eyes: "dot", mouth: "frown", color: palette.orange });
    if (id.includes("surprised")) return smileFace({ eyes: "dot", mouth: "surprised", color: palette.orange });
    return smileFace();
  }
  if (id.includes("rocket")) return rocket();
  if (id.includes("snail")) return snail();
  if (id.includes("shark")) return shark();
  if (id.includes("taco")) return taco();
  if (id.includes("guitar")) return guitar();
  if (id.includes("drums")) return drums();
  if (id.includes("bass")) return bass();
  if (id.includes("violin")) return violin();
  if (id.includes("soda") || id.includes("fizz")) return bottle();
  if (id.includes("cactus")) return cactus();
  if (id.includes("sock")) return sock();
  if (id.includes("trophy")) {
    if (id.includes("tiny")) return trophy("tiny");
    if (id.includes("big")) return trophy("big");
    return trophy("normal");
  }
  return star(64, 64, 16, palette.yellow);
}

function toastBase() {
  return rect(40, 44, 48, 48, 12, palette.orange);
}

const generated = [];
assetIds.forEach((id) => {
  const filePath = path.join(assetsDir, `${id}.svg`);
  const svg = svgWrap(renderIcon(id));
  fs.writeFileSync(filePath, svg, "utf8");
  generated.push(id);
});

console.log(`Generated ${generated.length} assets.`);
