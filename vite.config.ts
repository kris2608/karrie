import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** Only the production site counts; the tracker ignores localhost and previews. */
const UMAMI_DOMAIN = "karrieapp.onrender.com";

/** Adds the Umami Cloud tracker to production builds only, when both public values are set. */
function umami(): Plugin {
  let tag: string | null = null;
  return {
    name: "karrie-umami",
    apply: "build",
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir || process.cwd(), "UMAMI_");
      const src = (process.env.UMAMI_SCRIPT_URL ?? env.UMAMI_SCRIPT_URL ?? "").trim();
      const id = (process.env.UMAMI_WEBSITE_ID ?? env.UMAMI_WEBSITE_ID ?? "").trim();
      tag = /^https:\/\/[^\s"<>]+$/.test(src) && /^[0-9a-f-]{36}$/i.test(id) ? `<script defer src="${src}" data-website-id="${id}" data-domains="${UMAMI_DOMAIN}" data-exclude-search="true" data-exclude-hash="true" data-do-not-track="true"></script>` : null;
      if (!tag && (src || id)) config.logger.warn("Umami: UMAMI_SCRIPT_URL or UMAMI_WEBSITE_ID looks wrong; no tracker added.");
    },
    transformIndexHtml(html) {
      return tag && !html.includes("data-website-id") ? html.replace("</head>", `    ${tag}\n  </head>`) : html;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    umami(),
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
        // A preference for the installed app only; browser tabs still rotate, so the shop has a landscape layout too.
        orientation: "portrait",
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
        navigateFallbackDenylist: [/^\/api\//, /^\/privacy\.html$/],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2,webp}"],
        globIgnores: ["og-image.png"],
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
            urlPattern: /^https:\/\/(upload\.wikimedia\.org\/|thumb\.wikimedia\.org\/|images\.unsplash\.com\/|cdn\.pixabay\.com\/|api\.openverse\.org\/v1\/images\/[0-9a-f-]+\/thumb\/)/,
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
