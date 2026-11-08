import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { BarcodeLookup, LookupResult } from "./barcode.js";
import { APPROVAL, CREATED_FROM, type Candidate, type CandidateStore } from "./candidates.js";
import { canonicalEan } from "./ean.js";
import type { Illustrator } from "./illustration.js";
import type { NormalizeResult } from "./normalize.js";
import type { NameImageLookup, NameImageResult } from "./nameImage.js";
import type { OffSearch } from "./offSearch.js";
import { parseName, type ParsedName } from "./productName.js";
import { ImageIdentitySchema, type ImageDiscovery } from "./images.js";
import type { Limits } from "./limits.js";
import type { OfferLookup } from "./offers/index.js";
import { PRODUCT_CATEGORIES } from "./offers/match.js";
import { RETAILERS, type PrijsProfeet } from "./offers/prijsprofeet.js";
import type { StoreImageLookup, StoreImageResult } from "./storeImage.js";
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

export type OfferDeps = {
  lookup: Pick<OfferLookup, "find" | "stats">;
  provider?: Pick<PrijsProfeet, "stats">;
  /** Per-IP limits; PrijsProfeet's own limits are kept by the provider for the whole server. */
  limits: Limits;
};

export type StoreImageDeps = {
  lookup: Pick<StoreImageLookup, "find" | "cached" | "stats">;
  /** The offers' per-IP limits; PrijsProfeet's own limits are shared with the offers by the provider. */
  limits: Limits;
};

export type NameImageDeps = {
  lookup: Pick<NameImageLookup, "find" | "cached" | "stats">;
  /** The offers' per-IP limits; each source keeps its own server-wide limit. */
  limits: Limits;
  off?: Pick<OffSearch, "stats">;
};

export type IllustrationDeps = {
  illustrator: Pick<Illustrator, "draw" | "cached" | "stats" | "imageUsd" | "model">;
  /** Per-IP limits and the daily budget for generated pictures, separate from recognition. */
  limits: Limits;
};

export type ProductDeps = {
  normalize: (name: string) => Promise<NormalizeResult>;
  candidates: CandidateStore;
  limits: Limits;
  /** Only present when ILLUSTRATIONS_ENABLED is on; the route answers 404 otherwise. */
  illustrations?: IllustrationDeps;
  /** Bearer token for the review routes; without one they do not exist. */
  adminToken?: string;
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
  offers?: OfferDeps;
  storeImages?: StoreImageDeps;
  nameImages?: NameImageDeps;
  products?: ProductDeps;
  log: (entry: Record<string, unknown>) => void;
  now?: () => number;
};

const ROUTES = [
  "/api/products/recognize-photo",
  "/api/images/discover",
  "/api/images/ean",
  "/api/images/name",
  "/api/products/barcode",
  "/api/offers/match",
  "/api/products/normalize",
  "/api/products/illustration",
];
const ADMIN = "/api/admin/candidates";

/** What the app gets back for a typed-in product; the same for a fresh answer and a known candidate. */
function productOf(candidate: Candidate) {
  const { canonicalName, displayName, singularName, pluralName, childFriendlyLabel, category, subcategory, closestDrawing } = candidate;
  return { canonicalName, displayName, singularName, pluralName, childFriendlyLabel, category, subcategory, closestDrawing };
}

function sameToken(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

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
  "not-a-product": 422,
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
  const offerOutcomes: Record<string, number> = {};
  const storeImageOutcomes: Record<string, number> = {};
  const nameImageOutcomes: Record<string, number> = {};
  const productOutcomes: Record<string, number> = {};
  const illustrationOutcomes: Record<string, number> = {};
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
        offers: deps.offers
          ? { stats: deps.offers.limits.stats(), cache: deps.offers.lookup.stats(), provider: deps.offers.provider?.stats(), outcomes: offerOutcomes }
          : undefined,
        storeImages: deps.storeImages ? { stats: deps.storeImages.limits.stats(), cache: deps.storeImages.lookup.stats(), outcomes: storeImageOutcomes } : undefined,
        nameImages: deps.nameImages
          ? { stats: deps.nameImages.limits.stats(), cache: deps.nameImages.lookup.stats(), off: deps.nameImages.off?.stats(), outcomes: nameImageOutcomes }
          : undefined,
        products: deps.products
          ? {
              stats: deps.products.limits.stats(),
              candidates: deps.products.candidates.stats(),
              outcomes: productOutcomes,
              illustrations: deps.products.illustrations
                ? {
                    enabled: true,
                    model: deps.products.illustrations.illustrator.model,
                    stats: deps.products.illustrations.limits.stats(),
                    cache: deps.products.illustrations.illustrator.stats(),
                    outcomes: illustrationOutcomes,
                  }
                : { enabled: false },
            }
          : undefined,
      });
    }

    if (url.pathname === ADMIN || url.pathname.startsWith(`${ADMIN}/`)) return admin();
    if (url.pathname === "/api/products/illustration" && !deps.products?.illustrations) return send(404, { status: "error", code: "not-found" });
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
    if (url.pathname === "/api/images/ean") return storeImage(body);
    if (url.pathname === "/api/images/name") return nameImage(body);
    if (url.pathname === "/api/products/barcode") return lookupBarcode(body);
    if (url.pathname === "/api/offers/match") return matchOffer(body);
    if (url.pathname === "/api/products/normalize") return normalizeTyped(body);
    if (url.pathname === "/api/products/illustration") return illustrate(body);

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

    /** Only the barcode goes to PrijsProfeet. The answer is a link to the retailer's photo, never the photo itself. */
    async function storeImage(body: unknown) {
      const images = deps.storeImages;
      if (!images) return send(503, { status: "error", code: "misconfigured" });
      const request = BarcodeRequestSchema.safeParse(body);
      const ean = request.success ? canonicalEan(request.data.ean) : null;
      if (!ean) return send(400, { status: "error", code: "bad-request" });

      const reply = (result: StoreImageResult) => {
        if (!result.ok) {
          count(storeImageOutcomes, `error-${result.code}`);
          return send(result.code === "limit" ? 429 : 502, { status: "error", code: result.code === "limit" ? "rate-limited" : "unavailable" });
        }
        entry.found = result.image ? "found" : "none";
        count(storeImageOutcomes, result.image ? `found-${result.image.retailer}` : "none");
        return send(200, { status: "ok", image: result.image });
      };
      const hit = images.lookup.cached(ean);
      if (hit) {
        entry.cached = true;
        return reply(hit);
      }
      const denial = images.limits.admit(clientIp(req));
      if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });
      const callStarted = now();
      const result = await images.lookup.find(ean);
      images.limits.record({ ok: result.ok, latencyMs: now() - callStarted });
      entry.lookupMs = now() - callStarted;
      return reply(result);
    }

    /**
     * Only the typed product name goes to PrijsProfeet and Open Food Facts. The answer holds links and attribution;
     * a name match never gives the item a barcode. Each answer also counts the product as a candidate.
     */
    async function nameImage(body: unknown) {
      const images = deps.nameImages;
      if (!images) return send(503, { status: "error", code: "misconfigured" });
      const request = NameRequestSchema.safeParse(body);
      if (!request.success) return send(400, { status: "error", code: "bad-request" });
      const parsed = parseName(request.data.name);
      if (!parsed) return send(422, { status: "error", code: "not-a-product" });
      const ip = clientIp(req);

      const reply = (result: NameImageResult) => {
        if (!result.ok) {
          count(nameImageOutcomes, `error-${result.code}`);
          return send(result.code === "limit" ? 429 : 502, { status: "error", code: result.code === "limit" ? "rate-limited" : "unavailable" });
        }
        const { answer } = result;
        count(nameImageOutcomes, `${answer.classification}-${answer.match ? answer.match.source : "none"}`);
        entry.found = answer.match ? answer.match.source : answer.classification;
        deps.products?.candidates.recordName(
          {
            base: parsed.base,
            classification: answer.classification,
            brand: answer.brand,
            variant: answer.variant,
            packaging: packagingLabel(parsed),
            category: answer.category,
            prijsprofeetMatch: answer.searched.prijsprofeet === "match",
            offMatch: answer.searched.off === "match",
            imageAvailable: Boolean(answer.match),
          },
          ip,
        );
        return send(200, { status: "ok", result: answer });
      };
      const hit = images.lookup.cached(parsed.name);
      if (hit) {
        entry.cached = true;
        return reply(hit);
      }
      const denial = images.limits.admit(ip);
      if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });
      const callStarted = now();
      const result = await images.lookup.find(parsed.name);
      images.limits.record({ ok: result.ok, latencyMs: now() - callStarted });
      entry.lookupMs = now() - callStarted;
      return reply(result);
    }

    /** Only the product's name, kind and barcode go to PrijsProfeet; nothing about the family. */
    async function matchOffer(body: unknown) {
      const offers = deps.offers;
      if (!offers) return send(503, { status: "error", code: "misconfigured" });
      const request = OfferRequestSchema.safeParse(body);
      if (!request.success) return send(400, { status: "error", code: "bad-request" });
      const { retailer, product } = request.data;
      const ean = product.ean ? canonicalEan(product.ean) : null;
      if (product.ean && !ean) return send(400, { status: "error", code: "bad-request" });

      const denial = offers.limits.admit(clientIp(req));
      if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });
      const callStarted = now();
      const result = await offers.lookup.find({ ...product, ean: ean ?? undefined }, retailer);
      offers.limits.record({ ok: result.ok, latencyMs: now() - callStarted });
      Object.assign(entry, { retailer, generic: product.generic, lookupMs: now() - callStarted });
      if (!result.ok) {
        count(offerOutcomes, `error-${result.code}`);
        return send(result.code === "limit" ? 429 : 502, { status: "error", code: result.code === "limit" ? "rate-limited" : "unavailable" });
      }
      count(offerOutcomes, `${retailer}-${result.match.matchType}`);
      entry.found = result.match.matchType;
      return send(200, { status: "ok", match: result.match, fetchedAt: new Date(now()).toISOString() });
    }

    /** One product name the parent typed, nothing else from the list. A known candidate answers without OpenAI. */
    async function normalizeTyped(body: unknown) {
      const products = deps.products;
      if (!products) return send(503, { status: "error", code: "misconfigured" });
      const request = NormalizeRequestSchema.safeParse(body);
      if (!request.success) return send(400, { status: "error", code: "bad-request" });
      const name = parseName(request.data.name)?.base;
      if (!name) {
        count(productOutcomes, "refused-input");
        return send(422, { status: "error", code: "not-a-product" });
      }
      const ip = clientIp(req);
      const illustrations = Boolean(products.illustrations);
      const known = products.candidates.find(name);
      if (known) {
        entry.cached = true;
        if (known.approvalStatus === "rejected") {
          count(productOutcomes, "known-rejected");
          return send(422, { status: "error", code: "not-a-product" });
        }
        products.candidates.seen(known, ip);
        count(productOutcomes, "known");
        return send(200, { status: "ok", product: productOf(known), illustrations });
      }
      if (!deps.configured) return send(503, { status: "error", code: "misconfigured" });
      const denial = products.limits.admit(ip);
      if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });

      const callStarted = now();
      const result = await products.normalize(name);
      const latencyMs = now() - callStarted;
      products.limits.record({ ok: result.ok, latencyMs, usage: result.usage });
      Object.assign(entry, { model: deps.model, openaiMs: latencyMs, usage: result.usage, code: result.ok ? undefined : result.code });
      count(productOutcomes, result.ok ? "normalized" : result.brand ? "brand" : `error-${result.code}`);
      if (!result.ok) {
        if (result.brand) products.candidates.recordBrand(name, ip);
        return send(STATUS_BY_CODE[result.code] ?? 502, { status: "error", code: result.code, ...(result.brand && { reason: "brand" }) });
      }
      const candidate = products.candidates.record(result.product, name, request.data.createdFrom ?? "search", ip);
      return send(200, { status: "ok", product: candidate ? productOf(candidate) : result.product, illustrations: illustrations && Boolean(candidate) });
    }

    /** Draws only a known candidate, never a free prompt; one picture per candidate, shared by every device. */
    async function illustrate(body: unknown) {
      const products = deps.products!;
      const drawing = products.illustrations!;
      if (!deps.configured) return send(503, { status: "error", code: "misconfigured" });
      const request = IllustrationRequestSchema.safeParse(body);
      if (!request.success) return send(400, { status: "error", code: "bad-request" });
      const name = parseName(request.data.name)?.base;
      const candidate = name ? products.candidates.find(name) : null;
      if (!candidate || candidate.approvalStatus === "rejected") return send(404, { status: "error", code: "unknown" });
      const hit = drawing.illustrator.cached(candidate);
      if (hit) {
        entry.cached = true;
        count(illustrationOutcomes, "cached");
        return send(200, { status: "ok", image: hit });
      }
      const denial = drawing.limits.admit(clientIp(req));
      if (denial) return send(STATUS_BY_CODE[denial], { status: "error", code: denial });
      const callStarted = now();
      const result = await drawing.illustrator.draw(candidate);
      const fresh = result.ok && !result.cached;
      drawing.limits.record({ ok: result.ok, latencyMs: now() - callStarted, extraUsd: fresh ? drawing.illustrator.imageUsd : 0 });
      Object.assign(entry, { imageMs: now() - callStarted, code: result.ok ? undefined : result.code });
      count(illustrationOutcomes, result.ok ? (result.cached ? "cached" : "generated") : `error-${result.code}`);
      if (!result.ok) return send(STATUS_BY_CODE[result.code] ?? 502, { status: "error", code: result.code });
      products.candidates.setIllustration(candidate.candidateId, `memory:${candidate.candidateId}`);
      return send(200, { status: "ok", image: result.image });
    }

    /** Manual review: list candidates and approve or reject them. Without a configured token these routes do not exist. */
    async function admin() {
      const token = deps.products?.adminToken;
      const given = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (!token || !given || !sameToken(given, token)) return send(404, { status: "error", code: "not-found" });
      const candidates = deps.products!.candidates;
      if (url.pathname === ADMIN && req.method === "GET") {
        const status = url.searchParams.get("status");
        if (status && !APPROVAL.includes(status as never)) return send(400, { status: "error", code: "bad-request" });
        return send(200, { status: "ok", candidates: candidates.list((status as Candidate["approvalStatus"]) || undefined) });
      }
      const id = url.pathname.slice(ADMIN.length + 1);
      if (!id || id.includes("/") || req.method !== "POST") return send(405, { status: "error", code: "method" });
      let review: z.infer<typeof ReviewSchema>;
      try {
        const parsed = ReviewSchema.safeParse(JSON.parse(await readBody(req)));
        if (!parsed.success) return send(400, { status: "error", code: "bad-request" });
        review = parsed.data;
      } catch {
        return send(400, { status: "error", code: "bad-request" });
      }
      const updated = candidates.review(id, review.approvalStatus);
      return updated ? send(200, { status: "ok", candidate: updated }) : send(404, { status: "error", code: "unknown" });
    }
  };
}

const NormalizeRequestSchema = z.object({ name: z.string().max(40), createdFrom: z.enum(CREATED_FROM).optional() }).strict();

const IllustrationRequestSchema = z.object({ name: z.string().max(40) }).strict();

const NameRequestSchema = z.object({ name: z.string().max(40) }).strict();

/** "blik", "1 l", "6 x 200 ml": how a requested pack is kept on a candidate. */
function packagingLabel(parsed: ParsedName): string | undefined {
  const words: Record<string, string> = { can: "blik", bottle: "fles", carton: "pak", jar: "pot", bag: "zak", tube: "tube", multipack: "multipack" };
  const size = parsed.size ? `${parsed.size.count ? `${parsed.size.count} x ` : ""}${parsed.size.amount} ${parsed.size.unit}` : "";
  const label = [parsed.packaging && !(parsed.packaging === "multipack" && parsed.size?.count) ? words[parsed.packaging] : "", size].filter(Boolean).join(" ");
  return label || undefined;
}

const ReviewSchema = z.object({ approvalStatus: z.enum(APPROVAL) }).strict();

const OfferText = z.string().trim().min(1).max(120);

const OfferRequestSchema = z
  .object({
    retailer: z.enum(RETAILERS),
    product: z
      .object({
        name: OfferText,
        aliases: z.array(OfferText).max(8).optional(),
        category: z.enum(PRODUCT_CATEGORIES),
        generic: z.boolean(),
        brand: OfferText.optional(),
        variant: OfferText.optional(),
        size: z.string().trim().min(1).max(40).optional(),
        ean: z.string().max(14).optional(),
      })
      .strict(),
  })
  .strict();

const BarcodeRequestSchema = z.object({ ean: z.string().max(14) }).strict();

const ImageRequestSchema = z.object({ identity: ImageIdentitySchema, refresh: z.boolean().optional() }).strict();
