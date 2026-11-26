import { cpSync, createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { MARKETING_NAV_FALLBACK_DENYLIST } from "./src/content/marketing/routing";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
/** Prefer Render's commit; local builds fall back to today's date so Settings always shows something. */
const appBuild = (process.env.RENDER_GIT_COMMIT ?? process.env.VITE_GIT_COMMIT ?? "").trim().slice(0, 7) || new Date().toISOString().slice(0, 10);

/** Only the production site counts; the tracker ignores localhost and previews. The old address stays for apps installed from it. */
const UMAMI_DOMAINS = "karrie.eu,www.karrie.eu,karrieapp.onrender.com";

/**
 * Umami before-send: rewrite /l/{token} and /s/{token} pageviews so share secrets never leave the device.
 * Must stay a single-line IIFE assignable to window before the tracker script loads.
 */
const UMAMI_BEFORE_SEND = `window.karrieUmamiBeforeSend=function(t,p){if(!p||typeof p!=="object")return!1;if(typeof p.url==="string"){try{var u=new URL(p.url,location.origin);if(/^\\/(?:l|s)\\/[A-Za-z0-9_-]{16,64}\\/?$/.test(u.pathname))p.url=u.pathname.charAt(1)==="s"?"/s":"/l"}catch(e){p.url=p.url.replace(/\\/(?:l|s)\\/[A-Za-z0-9_-]{16,64}\\/?/g,function(m){return m.charAt(1)==="s"?"/s":"/l"})}}return p};`;

/** One voice library: `server/voice-library`. The static app serves a build-time copy. */
function voiceLibrary(): Plugin {
  const src = path.resolve(rootDir, "server/voice-library");
  let outDir = path.resolve(rootDir, "dist");
  return {
    name: "karrie-voice-library",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/voice-library", (req, res, next) => {
        const raw = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        const rel = raw.replace(/^\/+/, "");
        if (!rel || rel.includes("..")) {
          next();
          return;
        }
        const file = path.resolve(src, rel);
        if (!file.startsWith(src) || !existsSync(file)) {
          next();
          return;
        }
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json; charset=utf-8" : file.endsWith(".mp3") ? "audio/mpeg" : "audio/wav");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      if (!existsSync(path.join(src, "manifest.json"))) return;
      cpSync(src, path.join(outDir, "voice-library"), { recursive: true });
    },
  };
}

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
      tag =
        /^https:\/\/[^\s"<>]+$/.test(src) && /^[0-9a-f-]{36}$/i.test(id)
          ? `<script>${UMAMI_BEFORE_SEND}</script>\n    <script defer src="${src}" data-website-id="${id}" data-domains="${UMAMI_DOMAINS}" data-exclude-search="true" data-exclude-hash="true" data-do-not-track="true" data-before-send="karrieUmamiBeforeSend"></script>`
          : null;
      if (!tag && (src || id)) config.logger.warn("Umami: UMAMI_SCRIPT_URL or UMAMI_WEBSITE_ID looks wrong; no tracker added.");
    },
    transformIndexHtml(html) {
      return tag && !html.includes("data-website-id") ? html.replace("</head>", `    ${tag}\n  </head>`) : html;
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_APP_BUILD": JSON.stringify(appBuild),
  },
  plugins: [
    react(),
    voiceLibrary(),
    umami(),
    VitePWA({
      // Prompt keeps the new worker waiting until the app calls skipWaiting
      // at a safe moment. clientsClaim then takes the open page so it can reload.
      registerType: "prompt",
      injectRegister: false,
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
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [...MARKETING_NAV_FALLBACK_DENYLIST],
        // Precache the tiny manifest only when a library was generated. WAV clips stay runtime-cached.
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2,webp,mp3,opus}",
          ...(existsSync(path.join(rootDir, "server/voice-library/manifest.json")) ? ["voice-library/manifest.json"] : []),
        ],
        globIgnores: ["og-image.png", "voice-library/**/*.wav"],
        runtimeCaching: [
          {
            urlPattern: /\/voice-library\/.*\.(?:wav|mp3|json)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "karrie-voice-library-v7",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 120, maxAgeSeconds: 365 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
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
      input: {
        main: path.resolve(rootDir, "index.html"),
        ontdek: path.resolve(rootDir, "ontdek.html"),
        over: path.resolve(rootDir, "over.html"),
        tips: path.resolve(rootDir, "boodschappen-met-kinderen.html"),
        visualList: path.resolve(rootDir, "boodschappenlijstje-met-plaatjes.html"),
      },
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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
