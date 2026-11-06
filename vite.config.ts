import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "Karrie",
        short_name: "Karrie",
        description: "Speur, vind en vink af!",
        lang: "nl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#fff6e8",
        theme_color: "#14c4b8",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.openfoodfacts\.org\//,
            handler: "CacheFirst",
            options: {
              cacheName: "off-images",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 90 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          {
            // Open-licence reference pictures only; pictures with unclear rights are kept as local copies instead.
            urlPattern: /^https:\/\/(upload\.wikimedia\.org|thumb\.wikimedia\.org|images\.unsplash\.com|cdn\.pixabay\.com)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "reference-images",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:8787" } },
  preview: { proxy: { "/api": "http://localhost:8787" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/](motion|motion-dom|motion-utils|framer-motion|canvas-confetti)[\\/]/.test(id)) return "motion";
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
