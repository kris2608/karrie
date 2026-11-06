import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Limits } from "./limits.js";
import type { RecognizeResult } from "./recognize.js";
import { checkImage, MAX_BODY_BYTES } from "./validate.js";

export type AppDeps = {
  allowedOrigins: string[];
  requireOrigin: boolean;
  configured: boolean;
  model: string;
  limits: Limits;
  recognize: (dataUrl: string) => Promise<RecognizeResult>;
  log: (entry: Record<string, unknown>) => void;
  now?: () => number;
};

const STATUS_BY_CODE: Record<string, number> = {
  refused: 422,
  incomplete: 502,
  malformed: 502,
  timeout: 504,
  busy: 503,
  unavailable: 502,
  rejected: 422,
  misconfigured: 503,
  "rate-limited": 429,
  "daily-limit": 429,
  budget: 429,
  "in-flight": 429,
};

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX_BODY_BYTES) {
      reject(new BodyTooLarge());
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

export function createHandler(deps: AppDeps) {
  const now = deps.now ?? Date.now;
  const inFlight = new Set<string>();

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const id = randomUUID().slice(0, 8);
    const started = now();
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    const allowed = origin !== undefined && deps.allowedOrigins.includes(origin);
    const url = new URL(req.url ?? "/", "http://localhost");
    const entry: Record<string, unknown> = { id, method: req.method, path: url.pathname };

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    function send(status: number, body: unknown) {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      deps.log({ ...entry, status, ms: now() - started });
    }

    if (req.method === "OPTIONS") {
      if (!allowed) return send(403, { status: "error", code: "origin" });
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return send(200, { status: "ok", configured: deps.configured, model: deps.model, stats: deps.limits.stats() });
    }

    if (url.pathname !== "/api/products/recognize-photo") return send(404, { status: "error", code: "not-found" });
    if (req.method !== "POST") return send(405, { status: "error", code: "method" });
    if (origin !== undefined ? !allowed : deps.requireOrigin) return send(403, { status: "error", code: "origin" });
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(415, { status: "error", code: "unsupported-type" });

    let raw: string;
    try {
      raw = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLarge) return send(413, { status: "error", code: "too-large" });
      return send(400, { status: "error", code: "bad-request" });
    }
    entry.bytes = raw.length;

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(400, { status: "error", code: "bad-request" });
    }
    const image = checkImage(body);
    if (!image.ok) return send(image.status, { status: "error", code: image.code });
    if (!deps.configured) return send(503, { status: "error", code: "misconfigured" });

    const ip = clientIp(req);
    if (inFlight.has(ip)) return send(429, { status: "error", code: "in-flight" });
    const denial = deps.limits.admit(ip);
    if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });

    inFlight.add(ip);
    const callStarted = now();
    try {
      const result = await deps.recognize(image.dataUrl);
      const latencyMs = now() - callStarted;
      deps.limits.record({ ok: result.ok, latencyMs, usage: result.usage });
      Object.assign(entry, { model: deps.model, openaiMs: latencyMs, usage: result.usage, code: result.ok ? undefined : result.code });
      if (!result.ok) return send(STATUS_BY_CODE[result.code] ?? 502, { status: "error", code: result.code });
      return send(200, { status: "ok", product: result.product });
    } finally {
      inFlight.delete(ip);
    }
  };
}
