const ERROR_THROTTLE_MS = 2000;
let lastErrorAt = 0;

function sendClientError(payload: Record<string, unknown>) {
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(`${apiBase}/client-error`, blob);
    return;
  }
  fetch(`${apiBase}/client-error`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function registerErrorHandlers() {
  window.addEventListener("error", (event) => {
    if (Date.now() - lastErrorAt < ERROR_THROTTLE_MS) {
      return;
    }
    lastErrorAt = Date.now();
    sendClientError({
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (Date.now() - lastErrorAt < ERROR_THROTTLE_MS) {
      return;
    }
    lastErrorAt = Date.now();
    sendClientError({
      message: "unhandledrejection",
      source: "promise",
      detail: String(event.reason ?? "unknown"),
    });
  });
}
