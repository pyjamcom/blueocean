import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.svg", "icons/icon-512.svg"],
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "escapers-assets",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/icons/"),
            handler: "CacheFirst",
            options: {
              cacheName: "escapers-icons",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
            },
          },
        ],
      },
      manifest: {
        name: "Escapers",
        short_name: "Escapers",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0b10",
        theme_color: "#0b0b10",
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
