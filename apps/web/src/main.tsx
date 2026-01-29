import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { startTextGuard } from "./utils/textGuard";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    if (!registrations.length) return;
    registrations.forEach((registration) => registration.unregister());
    if (!sessionStorage.getItem("sw_purged")) {
      sessionStorage.setItem("sw_purged", "1");
      window.location.reload();
    }
  });
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
}

if (import.meta.env.DEV) {
  startTextGuard();
}
