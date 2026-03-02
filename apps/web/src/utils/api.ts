const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    return normalizeUrl(envUrl.trim());
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host)) {
      return "http://localhost:3001";
    }
    return "https://ws.escapers.app";
  }

  return "http://localhost:3001";
}
