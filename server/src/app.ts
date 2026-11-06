import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { BarcodeLookup, LookupResult } from "./barcode.js";
import { canonicalEan } from "./ean.js";
import { ImageIdentitySchema, type ImageDiscovery } from "./images.js";
import type { Limits } from "./limits.js";
import type { RecognizeResult } from "./recognize.js";
import { checkImage, MAX_BODY_BYTES } from "./validate.js";

export type ImageDeps = {
  discovery: Pick<ImageDiscovery, "discover" | "cached" | "busy" | "provider">;
  limits: Limits;
  /** Dollars per paid search call (OpenAI web search or Brave); tokens are counted separately. */
  searchCallUsd: number;
  providerCallUsd: number;
};

export type BarcodeDeps = {
  lookup: Pick<BarcodeLookup, "lookup" | "cached" | "webEnabled">;
  /** Per-IP limits for new lookups; its budget only gates the paid web search, Open Food Facts stays available. */
  limits: Limits;
  searchCallUsd: number;
};

export type AppDeps = {
  allowedOrigins: string[];
  requireOrigin: boolean;
  configured: boolean;
  model: string;
  limits: Limits;
  recognize: (dataUrl: string, scannedEan?: string) => Promise<RecognizeResult>;
  images?: ImageDeps;
  barcode?: BarcodeDeps;
  log: (entry: Record<string, unknown>) => void;
  now?: () => number;
};

const ROUTES = ["/api/products/recognize-photo", "/api/images/discover", "/api/products/barcode"];

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
  /** Why picture leads failed, by type only; shown on /api/health so a blocked host is visible without logs. */
  const imageFailures: Record<string, number> = {};
  const imageOutcomes: Record<string, number> = {};
  const barcodeFailures: Record<string, number> = {};
  const barcodeOutcomes: Record<string, number> = {};
  const count = (into: Record<string, number>, key: string) => (into[key] = (into[key] ?? 0) + 1);

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
      return send(200, {
        status: "ok",
        configured: deps.configured,
        model: deps.model,
        stats: deps.limits.stats(),
        images: deps.images ? { provider: deps.images.discovery.provider, stats: deps.images.limits.stats(), outcomes: imageOutcomes, failures: imageFailures } : undefined,
        barcode: deps.barcode ? { webSearch: deps.barcode.lookup.webEnabled, stats: deps.barcode.limits.stats(), outcomes: barcodeOutcomes, failures: barcodeFailures } : undefined,
      });
    }

    if (!ROUTES.includes(url.pathname)) return send(404, { status: "error", code: "not-found" });
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
    if (url.pathname === "/api/images/discover") return discoverImages(body);
    if (url.pathname === "/api/products/barcode") return lookupBarcode(body);

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
      const result = await deps.recognize(image.dataUrl, canonicalEan((body as { scannedEan?: unknown }).scannedEan) ?? undefined);
      const latencyMs = now() - callStarted;
      deps.limits.record({ ok: result.ok, latencyMs, usage: result.usage });
      Object.assign(entry, { model: deps.model, openaiMs: latencyMs, usage: result.usage, code: result.ok ? undefined : result.code });
      if (!result.ok) return send(STATUS_BY_CODE[result.code] ?? 502, { status: "error", code: result.code });
      return send(200, { status: "ok", product: result.product });
    } finally {
      inFlight.delete(ip);
    }

    /** Cached answers are free and skip the limits; new searches are rate limited, budgeted and capped in number. */
    async function discoverImages(body: unknown) {
      const images = deps.images;
      if (!deps.configured || !images) return send(503, { status: "error", code: "misconfigured" });
      const request = ImageRequestSchema.safeParse(body);
      if (!request.success) return send(400, { status: "error", code: "bad-request" });
      const { identity, refresh } = request.data;
      entry.generic = identity.generic;

      const hit = refresh ? null : images.discovery.cached(identity);
      if (hit) {
        entry.cached = true;
        return send(200, { status: "ok", discovery: hit });
      }
      if (images.discovery.busy()) return send(503, { status: "error", code: "busy" });
      const ip = clientIp(req);
      const denial = images.limits.admit(ip);
      if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });

      const callStarted = now();
      const result = await images.discovery.discover(identity, { refresh });
      const latencyMs = now() - callStarted;
      const extraUsd = result.searchCalls * images.searchCallUsd + result.providerCalls * images.providerCallUsd;
      images.limits.record({ ok: result.ok, latencyMs, usage: result.usage, extraUsd });
      Object.assign(entry, { provider: images.discovery.provider, openaiMs: latencyMs, usage: result.usage, searchCalls: result.searchCalls, cached: result.ok ? result.cached : undefined });
      for (const failure of (result as { failures?: string[] }).failures ?? []) imageFailures[failure] = (imageFailures[failure] ?? 0) + 1;
      const outcome = result.ok ? `${identity.generic ? "generic" : "branded"}-${result.discovery.status}` : `error-${result.code}`;
      imageOutcomes[outcome] = (imageOutcomes[outcome] ?? 0) + 1;
      if (!result.ok) return send(STATUS_BY_CODE[result.code] ?? 502, { status: "error", code: result.code });
      entry.found = result.discovery.status;
      return send(200, { status: "ok", discovery: result.discovery, selectedData: result.selectedData });
    }

    /** Only the barcode number arrives here; it goes to Open Food Facts and, if needed, one web search. */
    async function lookupBarcode(body: unknown) {
      const barcode = deps.barcode;
      if (!barcode) return send(503, { status: "error", code: "misconfigured" });
      const request = BarcodeRequestSchema.safeParse(body);
      const ean = request.success ? canonicalEan(request.data.ean) : null;
      if (!ean) return send(400, { status: "error", code: "bad-request" });

      const reply = (result: LookupResult) => {
        if (!result.ok) return send(502, { status: "error", code: result.code });
        entry.found = result.answer.status;
        return send(200, { status: "ok", answer: result.answer });
      };
      const hit = barcode.lookup.cached(ean);
      if (hit) {
        entry.cached = true;
        return reply(hit);
      }
      const denial = barcode.limits.admit(clientIp(req));
      if (denial && denial !== "budget") return send(STATUS_BY_CODE[denial], { status: "error", code: denial });

      const callStarted = now();
      const result = await barcode.lookup.lookup(ean, { allowWeb: !denial });
      const latencyMs = now() - callStarted;
      if (!denial) barcode.limits.record({ ok: result.ok, latencyMs, usage: result.ok ? result.usage : undefined, extraUsd: result.ok ? result.searchCalls * barcode.searchCallUsd : 0 });
      Object.assign(entry, { lookupMs: latencyMs, searchCalls: result.ok ? result.searchCalls : undefined });
      for (const failure of result.failures) count(barcodeFailures, failure);
      count(barcodeOutcomes, result.ok ? result.answer.status : `error-${result.code}`);
      return reply(result);
    }
  };
}

const BarcodeRequestSchema = z.object({ ean: z.string().max(14) }).strict();

const ImageRequestSchema = z.object({ identity: ImageIdentitySchema, refresh: z.boolean().optional() }).strict();
