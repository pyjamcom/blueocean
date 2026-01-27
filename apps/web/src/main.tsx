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

if (import.meta.env.DEV) {
  startTextGuard();
}
