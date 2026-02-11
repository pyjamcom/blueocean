import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "..", "dist");

const baseHtml = await readFile(path.join(distDir, "index.html"), "utf8");

const joinDescription =
  "Jump into party games, a meme game, and funny quiz rounds. Create or join a room and play online with friends in fast icebreaker games.";

const pages = [
  {
    slug: "join",
    title: "Escapers - Party Games & Meme Quiz with Friends",
    description: joinDescription,
    keywords:
      "party games, meme game, funny quiz, party quiz, friends quiz, icebreaker games, online quiz, group game, fun party games",
    canonical: "https://escapers.app/join",
    ogTitle: "Escapers - Party Games & Meme Quiz with Friends",
    ogDescription: joinDescription,
    ogUrl: "https://escapers.app/join",
    ogImage: "https://escapers.app/og/join.png",
  },
  {
    slug: "leaderboard",
    title: "Escapers Leaderboard - Party Quiz & Friends Quiz",
    description: joinDescription,
    keywords:
      "party games, party quiz, friends quiz, meme game, group game, fun party games, hilarious party games",
    canonical: "https://escapers.app/leaderboard",
    ogTitle: "Escapers Leaderboard - Party Quiz & Friends Quiz",
    ogDescription: joinDescription,
    ogUrl: "https://escapers.app/leaderboard",
    ogImage: "https://escapers.app/og/leaderboard.png",
  },
];

const renderMeta = (page) => `
    <meta name="description" content="${page.description}" />
    <meta name="keywords" content="${page.keywords}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${page.canonical}" />
    <meta property="og:title" content="${page.ogTitle}" />
    <meta property="og:description" content="${page.ogDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${page.ogUrl}" />
    <meta property="og:image" content="${page.ogImage}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${page.ogTitle}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${page.ogTitle}" />
    <meta name="twitter:description" content="${page.ogDescription}" />
    <meta name="twitter:image" content="${page.ogImage}" />
`;

const setTitle = (html, title) =>
  html.replace(new RegExp("<title>[^<]*</title>", "i"), `<title>${title}</title>`);

for (const page of pages) {
  const outDir = path.join(distDir, page.slug);
  await mkdir(outDir, { recursive: true });
  const withTitle = setTitle(baseHtml, page.title);
  const withMeta = withTitle.replace("</head>", `${renderMeta(page)}\n  </head>`);
  await writeFile(path.join(outDir, "index.html"), withMeta, "utf8");
}
