import { existsSync } from "node:fs";
import { createServer } from "node:http";
import OpenAI from "openai";
import { createHandler } from "./app.js";
import { createLimits } from "./limits.js";
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

const handler = createHandler({
  allowedOrigins: (env.ALLOWED_ORIGINS ?? "https://karrieapp.onrender.com,http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  requireOrigin: env.REQUIRE_ORIGIN !== "false",
  configured: Boolean(client),
  model: config.model,
  limits,
  recognize: (dataUrl) => recognizePhoto(client!, config, dataUrl),
  log: (entry) => console.log(JSON.stringify(entry)),
});

const port = number("PORT", 8787);
createServer((req, res) => {
  handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "error", code: "server" }));
  });
}).listen(port, () => {
  console.log(JSON.stringify({ event: "listening", port, model: config.model, configured: Boolean(client) }));
});
