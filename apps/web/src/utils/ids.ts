export function randomId(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)];
  }
  return output;
}

export function randomPlayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `P-${randomId(10)}`;
}

let cachedClientId: string | null = null;
const CLIENT_ID_KEY = "escapers_client_id";

export function getOrCreateClientId(): string {
  if (cachedClientId) {
    return cachedClientId;
  }
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(CLIENT_ID_KEY);
      if (stored) {
        cachedClientId = stored;
        return stored;
      }
      const created = randomPlayerId();
      window.localStorage.setItem(CLIENT_ID_KEY, created);
      cachedClientId = created;
      return created;
    } catch (_err) {
      // fall through to ephemeral id
    }
  }
  const fallback = randomPlayerId();
  cachedClientId = fallback;
  return fallback;
}
