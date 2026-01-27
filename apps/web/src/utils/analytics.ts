import { randomId } from "./ids";

const SESSION_KEY = "analytics_session";

function getSessionId() {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const next = randomId(12);
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

export function trackEvent(event: string, meta: Record<string, unknown> = {}) {
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const payload = {
    event,
    at: Date.now(),
    sessionId: getSessionId(),
    meta,
  };

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(`${apiBase}/analytics`, blob);
    return;
  }

  fetch(`${apiBase}/analytics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
