export const AVATAR_IDS = [
  "avatar_disco_sloth",
  "avatar_laughing_llama",
  "avatar_pizza_hero",
  "avatar_wild_toucan",
  "avatar_party_octopus",
  "avatar_space_cactus",
  "avatar_raccoon_sneak",
  "avatar_penguin_chef",
  "avatar_dance_fox",
  "avatar_coconut_king",
  "avatar_banana_bandit",
  "avatar_sleepy_tiger",
  "avatar_neon_panda",
  "avatar_soda_shark",
];

export function randomAvatarId() {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

export function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 60%)`;
}
