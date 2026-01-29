const PLAYER_NAME_KEY = "player_name";

export function getStoredPlayerName() {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PLAYER_NAME_KEY}=`));
  if (!match) return "";
  return decodeURIComponent(match.split("=")[1] ?? "");
}

export function setStoredPlayerName(value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${PLAYER_NAME_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000`;
}
