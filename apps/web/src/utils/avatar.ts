import avatarsManifest from "../../../../data/avatars_manifest.json";

const avatarFiles: string[] = Array.isArray((avatarsManifest as any)?.items)
  ? ((avatarsManifest as any).items as string[])
  : [];

const fallbackAvatars = [
  "avatar_raccoon_dj",
  "avatar_panda_disco",
  "avatar_cat_bartender",
  "avatar_llama_sax",
  "avatar_koala_sleepy",
  "avatar_octopus_juggler",
  "avatar_goose_conductor",
  "avatar_capybara_chill",
  "avatar_robot_party",
  "avatar_penguin_mic",
  "avatar_sushi_samurai",
  "avatar_taco_dancer",
  "avatar_croissant_skater",
  "avatar_pineapple_king",
  "avatar_lemon_skater",
  "avatar_donut_magician",
  "avatar_cupcake_magician",
  "avatar_whale_dj",
  "avatar_owl_bartender",
  "avatar_flamingo_guitarist",
  "avatar_duck_detective",
  "avatar_dog_surfer",
  "avatar_fox_mailman",
  "avatar_panda_tourist",
  "avatar_cactus_rocker",
  "avatar_brain_cook",
  "avatar_dino_skate",
  "avatar_avocado_drummer",
  "avatar_banana_rocket",
  "avatar_shrimp_king",
];

export const AVATAR_IDS = avatarFiles.length ? avatarFiles : fallbackAvatars;

export function randomAvatarId() {
  const fallback = fallbackAvatars[0] ?? "avatar_raccoon_dj";
  if (!AVATAR_IDS.length) return fallback;
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)] ?? AVATAR_IDS[0] ?? fallback;
}

const AVATAR_STORAGE_KEY = "avatar_id";

export function getStoredAvatarId() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(AVATAR_STORAGE_KEY);
  if (stored && AVATAR_IDS.includes(stored)) {
    return stored;
  }
  return null;
}

export function setStoredAvatarId(id: string) {
  if (typeof window === "undefined") return;
  if (!AVATAR_IDS.includes(id)) return;
  window.localStorage.setItem(AVATAR_STORAGE_KEY, id);
}

function hashValue(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function avatarColor(id: string) {
  const hue = Math.abs(hashValue(id)) % 360;
  return `hsl(${hue} 70% 60%)`;
}

export function avatarIconIndex(id: string) {
  return Math.abs(hashValue(id));
}

export function getAvatarImageUrl(id: string) {
  if (!avatarFiles.length) return null;
  if (avatarFiles.includes(id)) {
    return `/avatars/${id}`;
  }
  const idx = avatarIconIndex(id) % avatarFiles.length;
  const resolved = avatarFiles[idx] ?? avatarFiles[0];
  return resolved ? `/avatars/${resolved}` : null;
}
