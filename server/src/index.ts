import { existsSync } from "node:fs";
import { createServer } from "node:http";
import OpenAI from "openai";
import { createHandler } from "./app.js";
import { createBarcodeLookup } from "./barcode.js";
import { createCandidateStore } from "./candidates.js";
import { createIllustrator } from "./illustration.js";
import { normalizeProduct } from "./normalize.js";
import { createImageDiscovery } from "./images.js";
import { createLimits } from "./limits.js";
import { createOfferLookup } from "./offers/index.js";
import { createPrijsProfeet } from "./offers/prijsprofeet.js";
import { recognizePhoto, type RecognizeConfig } from "./recognize.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const env = process.env;

function number(name: string, fallback: number): number {
  const value = Number(env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function pick<T extends string>(name: string, options: readonly T[], fallback: T): T {
  const value = env[name] as T | undefined;
  return value && options.includes(value) ? value : fallback;
}

const config: RecognizeConfig = {
  model: env.OPENAI_VISION_MODEL || "gpt-5.4-mini",
  detail: pick("OPENAI_IMAGE_DETAIL", ["low", "high", "auto"] as const, "auto"),
  reasoningEffort: env.OPENAI_REASONING_EFFORT === "default" ? null : pick("OPENAI_REASONING_EFFORT", ["none", "low", "medium", "high"] as const, "low"),
  maxOutputTokens: number("OPENAI_MAX_OUTPUT_TOKENS", 1200),
};

const apiKey = env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey, timeout: number("OPENAI_TIMEOUT_MS", 30_000), maxRetries: 1 }) : null;

const limits = createLimits({
  perIpPerHour: number("LIMIT_PER_IP_HOUR", 20),
  perIpPerDay: number("LIMIT_PER_IP_DAY", 60),
  dailyRequests: number("LIMIT_DAILY_REQUESTS", 300),
  dailyBudgetUsd: number("DAILY_BUDGET_USD", 1),
  inputUsdPerMTok: number("PRICE_INPUT_PER_MTOK", 0.75),
  cachedInputUsdPerMTok: number("PRICE_CACHED_INPUT_PER_MTOK", 0.075),
  outputUsdPerMTok: number("PRICE_OUTPUT_PER_MTOK", 4.5),
});

const imageLimits = createLimits({
  perIpPerHour: number("IMAGE_LIMIT_PER_IP_HOUR", 30),
  perIpPerDay: number("IMAGE_LIMIT_PER_IP_DAY", 80),
  dailyRequests: number("IMAGE_LIMIT_DAILY_REQUESTS", 200),
  dailyBudgetUsd: number("IMAGE_DAILY_BUDGET_USD", 1),
  inputUsdPerMTok: number("PRICE_INPUT_PER_MTOK", 0.75),
  cachedInputUsdPerMTok: number("PRICE_CACHED_INPUT_PER_MTOK", 0.075),
  outputUsdPerMTok: number("PRICE_OUTPUT_PER_MTOK", 4.5),
});

const discovery = client
  ? createImageDiscovery(client, {
      model: env.OPENAI_IMAGE_SEARCH_MODEL || config.model,
      maxConcurrent: number("IMAGE_MAX_CONCURRENT", 3),
      braveKey: env.BRAVE_SEARCH_API_KEY || undefined,
      openverse: env.IMAGE_OPENVERSE !== "off",
    })
  : null;

const barcodeLimits = createLimits({
  perIpPerHour: number("BARCODE_LIMIT_PER_IP_HOUR", 60),
  perIpPerDay: number("BARCODE_LIMIT_PER_IP_DAY", 200),
  dailyRequests: number("BARCODE_LIMIT_DAILY_REQUESTS", 1000),
  dailyBudgetUsd: number("BARCODE_DAILY_BUDGET_USD", 0.5),
  inputUsdPerMTok: number("PRICE_INPUT_PER_MTOK", 0.75),
  cachedInputUsdPerMTok: number("PRICE_CACHED_INPUT_PER_MTOK", 0.075),
  outputUsdPerMTok: number("PRICE_OUTPUT_PER_MTOK", 4.5),
});

const barcode = createBarcodeLookup({
  userAgent: env.OFF_USER_AGENT || "Karrie/1.0 (https://karrieapp.onrender.com)",
  web: client && env.BARCODE_WEB_SEARCH !== "off" ? { client, model: env.OPENAI_IMAGE_SEARCH_MODEL || config.model } : undefined,
});

const offerLimits = createLimits({
  perIpPerHour: number("OFFERS_LIMIT_PER_IP_HOUR", 300),
  perIpPerDay: number("OFFERS_LIMIT_PER_IP_DAY", 1500),
  dailyRequests: number("OFFERS_LIMIT_DAILY_REQUESTS", 20_000),
  dailyBudgetUsd: 1,
  inputUsdPerMTok: 0,
  cachedInputUsdPerMTok: 0,
  outputUsdPerMTok: 0,
});

const prijsProfeet =
  env.OFFERS !== "off"
    ? createPrijsProfeet({
        userAgent: env.PRIJSPROFEET_USER_AGENT || "Karrie/1.0 (+https://karrieapp.onrender.com)",
        apiKey: env.PRIJSPROFEET_API_KEY || undefined,
      })
    : null;

const productLimits = createLimits({
  perIpPerHour: number("PRODUCTS_LIMIT_PER_IP_HOUR", 30),
  perIpPerDay: number("PRODUCTS_LIMIT_PER_IP_DAY", 100),
  dailyRequests: number("PRODUCTS_LIMIT_DAILY_REQUESTS", 1000),
  dailyBudgetUsd: number("PRODUCTS_DAILY_BUDGET_USD", 0.5),
  inputUsdPerMTok: number("PRICE_INPUT_PER_MTOK", 0.75),
  cachedInputUsdPerMTok: number("PRICE_CACHED_INPUT_PER_MTOK", 0.075),
  outputUsdPerMTok: number("PRICE_OUTPUT_PER_MTOK", 4.5),
});

const candidates = createCandidateStore({ file: env.CANDIDATES_FILE || undefined, maxCandidates: number("CANDIDATES_MAX", 5000) });

/** Paid per picture; off unless ILLUSTRATIONS_ENABLED is "true". See DEPLOYMENT.md for the costs. */
const illustrationLimits = createLimits({
  perIpPerHour: number("ILLUSTRATION_LIMIT_PER_IP_HOUR", 5),
  perIpPerDay: number("ILLUSTRATION_LIMIT_PER_IP_DAY", 10),
  dailyRequests: number("ILLUSTRATION_LIMIT_DAILY_REQUESTS", 100),
  dailyBudgetUsd: number("ILLUSTRATION_DAILY_BUDGET_USD", 1),
  inputUsdPerMTok: 0,
  cachedInputUsdPerMTok: 0,
  outputUsdPerMTok: 0,
});
const illustrator =
  client && env.ILLUSTRATIONS_ENABLED === "true"
    ? createIllustrator(client, { model: env.ILLUSTRATION_MODEL || "gpt-image-1", imageUsd: number("PRICE_ILLUSTRATION", 0.011) })
    : null;

const handler = createHandler({
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "https://karrieapp.onrender.com,http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  requireOrigin: env.REQUIRE_ORIGIN !== "false",
  configured: Boolean(client),
  model: config.model,
  limits,
  recognize: (dataUrl, scannedEan) => recognizePhoto(client!, config, dataUrl, scannedEan),
  images: discovery
    ? {
        discovery,
        limits: imageLimits,
        searchCallUsd: number("PRICE_WEB_SEARCH_CALL", 0.01),
        providerCallUsd: number("PRICE_BRAVE_CALL", 0.005),
      }
    : undefined,
  barcode: { lookup: barcode, limits: barcodeLimits, searchCallUsd: number("PRICE_WEB_SEARCH_CALL", 0.01) },
  offers: prijsProfeet ? { lookup: createOfferLookup(prijsProfeet), provider: prijsProfeet, limits: offerLimits } : undefined,
  products: {
    normalize: (name) => normalizeProduct(client!, { model: env.OPENAI_PRODUCT_MODEL || config.model, maxOutputTokens: number("PRODUCT_MAX_OUTPUT_TOKENS", 600) }, name),
    candidates,
    limits: productLimits,
    illustrations: illustrator ? { illustrator, limits: illustrationLimits } : undefined,
    adminToken: env.CANDIDATES_ADMIN_TOKEN || undefined,
  },
  log: (entry) => console.log(JSON.stringify(entry)),
});

const port = number("PORT", 8787);
createServer((req, res) => {
  handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "error", code: "server" }));
  });
}).listen(port, () => {
  console.log(
    JSON.stringify({
      event: "listening",
      port,
      model: config.model,
      configured: Boolean(client),
      imageProvider: discovery?.provider,
      candidates: candidates.persistent ? "file" : "memory",
      illustrations: Boolean(illustrator),
    }),
  );
});
