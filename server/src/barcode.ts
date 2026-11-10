import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { PackSummary } from "./catalog/pack.js";
import type { CatalogStore } from "./catalog/types.js";
import { eanForms } from "./ean.js";
import { cleanUrl, get, readLimited, stripHtml, usageOf, type Fetch, type RawResponse } from "./images.js";
import type { Usage } from "./limits.js";
import type { ProductCategory } from "./offers/match.js";
import { imageRetailerName, RETAILER_RANK, type OfferRow } from "./offers/prijsprofeet.js";
import { categoryOf, resolveCategory } from "./resolveCategory.js";
import type { StoreImageLookup } from "./storeImage.js";

/**
 * A product found by its barcode. Open Food Facts data is community-edited (ODbL, photos CC BY-SA);
 * a web page is only used when it prints the same barcode. Neither is ever "verified".
 */
export type BarcodeProduct = {
  name?: string;
  brand?: string;
  variant?: string;
  quantity?: string;
  /** Only from images.openfoodfacts.org. */
  imageUrl?: string;
  categories?: string[];
  nutriScore?: "A" | "B" | "C" | "D" | "E";
  per100?: { energyKcal?: number; fat?: number; saturatedFat?: number; sugars?: number; fibre?: number; protein?: number; salt?: number };
  ingredients?: string;
};

export type BarcodeSource =
  | { kind: "off"; name: "Open Food Facts"; url: string; dataLicense: "ODbL"; imageLicense?: "CC BY-SA" }
  | { kind: "web"; name: string; url: string };

/** off-exact: name and brand; off-partial: something to show, but the parent must confirm; web-page: the page prints this barcode. */
export type BarcodeStatus = "off-exact" | "off-partial" | "web-page" | "none";

export type BarcodeAnswer = {
  ean: string;
  status: BarcodeStatus;
  product?: BarcodeProduct;
  source?: BarcodeSource;
  at: number;
  /** Resolved shop department from PP slug / OFF tags / name; never invents pantry. */
  department?: ProductCategory;
  /** Pack-size evidence from OFF / PrijsProfeet / parent; conflict means the parent should confirm. */
  pack?: PackSummary;
  /** Exact-EAN retailer image already in the catalog, so the client can skip PrijsProfeet. */
  storeImage?: { ean: string; imageUrl: string; retailer: string; sourceUrl?: string; quantity?: string; productName?: string; brand?: string };
};

export type LookupResult =
  | { ok: true; answer: BarcodeAnswer; cached: boolean; usage?: Usage; searchCalls: number; failures: string[] }
  | { ok: false; code: "unavailable"; failures: string[] };

const DAY = 24 * 60 * 60 * 1000;
export const BARCODE_RULES = {
  offOrigin: "https://world.openfoodfacts.org",
  /** Open Food Facts allows 100 product reads a minute per client; every family shares the server's address. */
  offGapMs: 700,
  offTimeoutMs: 8_000,
  retryDelaysMs: [1_000, 3_000],
  maxRetryAfterMs: 10_000,
  foundTtlMs: 30 * DAY,
  missTtlMs: 7 * DAY,
  errorTtlMs: 5 * 60 * 1000,
  cacheEntries: 5_000,
  webPages: 3,
  pageBytes: 900_000,
};

export const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_nl",
  "generic_name",
  "generic_name_nl",
  "brands",
  "quantity",
  "image_front_url",
  "categories_tags",
  "nutriscore_grade",
  "nutriments",
  "ingredients_text_nl",
  "ingredients_text",
];

export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_nl?: string;
  generic_name?: string;
  generic_name_nl?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  categories_tags?: unknown;
  nutriscore_grade?: string;
  nutriments?: Record<string, unknown>;
  ingredients_text_nl?: string;
  ingredients_text?: string;
};

const PLACEHOLDER = /^(unknown|onbekend|inconnu|test|product|produit|n\/?a|none|null|[-?.\s]+|\d+)$/i;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length < 2 || PLACEHOLDER.test(clean)) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function amount(value: unknown, max: number): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? Math.round(parsed * 100) / 100 : undefined;
}

export function offImage(value: unknown): string | undefined {
  const url = typeof value === "string" ? cleanUrl(value) : null;
  return url && url.hostname === "images.openfoodfacts.org" ? url.href : undefined;
}

/** What an Open Food Facts record can credibly tell, or null when it has nothing usable or is for another code. */
export function fromOff(ean: string, raw: OffProduct): { status: "off-exact" | "off-partial"; product: BarcodeProduct } | null {
  if (raw.code && !eanForms(ean).includes(raw.code.replace(/^0+(?=\d{13})/, ""))) return null;
  const name = text(raw.product_name_nl, 80) ?? text(raw.product_name, 80) ?? text(raw.generic_name_nl, 80) ?? text(raw.generic_name, 80);
  const brand = text(raw.brands?.split(",")[0], 40);
  const imageUrl = offImage(raw.image_front_url);
  if (!name && !imageUrl) return null;
  const facts = raw.nutriments ?? {};
  const per100 = Object.fromEntries(
    Object.entries({
      energyKcal: amount(facts["energy-kcal_100g"], 900),
      fat: amount(facts.fat_100g, 100),
      saturatedFat: amount(facts["saturated-fat_100g"], 100),
      sugars: amount(facts.sugars_100g, 100),
      fibre: amount(facts.fiber_100g, 100),
      protein: amount(facts.proteins_100g, 100),
      salt: amount(facts.salt_100g, 30),
    }).filter(([, value]) => value !== undefined),
  );
  const grade = typeof raw.nutriscore_grade === "string" ? raw.nutriscore_grade.trim().toUpperCase() : "";
  const categories = Array.isArray(raw.categories_tags) ? raw.categories_tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30) : [];
  /** "400 g ℮": the estimated-quantity mark, sometimes typed as a plain "e". */
  const quantity = text(raw.quantity?.replace(/\s+[e℮]$/u, ""), 24);
  /** Only the Dutch list: the main one is often in another language. */
  const ingredients = text(raw.ingredients_text_nl, 600);
  const product: BarcodeProduct = {
    ...(name && { name }),
    ...(brand && { brand }),
    ...(quantity && { quantity }),
    ...(imageUrl && { imageUrl }),
    ...(categories.length && { categories }),
    ...(/^[A-E]$/.test(grade) && { nutriScore: grade as BarcodeProduct["nutriScore"] }),
    ...(Object.keys(per100).length && { per100 }),
    ...(ingredients && { ingredients }),
  };
  return { status: name && brand ? "off-exact" : "off-partial", product };
}

export function offUrl(ean: string): string {
  const params = new URLSearchParams({ fields: OFF_FIELDS.join(","), lc: "nl", cc: "nl" });
  return `${BARCODE_RULES.offOrigin}/api/v3/product/${ean}?${params}`;
}

/** PrijsProfeet identity wins; Open Food Facts only fills empty nutrition and related slots. */
export function mergePpWithOff(
  pp: BarcodeAnswer & { product: BarcodeProduct; source: BarcodeSource },
  off: { product: BarcodeProduct } | null,
  storeImage?: NonNullable<BarcodeAnswer["storeImage"]>,
): BarcodeAnswer {
  const base = pp.product;
  const fill = off?.product;
  const categories =
    base.categories?.length && fill?.categories?.length
      ? [...base.categories, ...fill.categories.filter((tag) => !base.categories!.includes(tag))]
      : base.categories?.length
        ? base.categories
        : fill?.categories;
  const product: BarcodeProduct = {
    ...base,
    ...(fill && {
      ...(!base.name && fill.name ? { name: fill.name } : {}),
      ...(!base.brand && fill.brand ? { brand: fill.brand } : {}),
      ...(!base.quantity && fill.quantity ? { quantity: fill.quantity } : {}),
      ...(!base.variant && fill.variant ? { variant: fill.variant } : {}),
      ...(categories?.length ? { categories } : {}),
      ...(!base.nutriScore && fill.nutriScore ? { nutriScore: fill.nutriScore } : {}),
      ...(!base.per100 && fill.per100 ? { per100: fill.per100 } : {}),
      ...(!base.ingredients && fill.ingredients ? { ingredients: fill.ingredients } : {}),
      ...(!base.imageUrl && fill.imageUrl ? { imageUrl: fill.imageUrl } : {}),
    }),
  };
  const department = resolveCategory({ tags: product.categories, name: product.name });
  return { ...pp, product, ...(department && { department }), ...(storeImage && { storeImage }) };
}

function withDepartment(answer: BarcodeAnswer): BarcodeAnswer {
  if (answer.status === "none" || !answer.product) return answer;
  const department =
    answer.department ?? resolveCategory({ tags: answer.product.categories, name: answer.product.name });
  return department ? { ...answer, department } : answer;
}

function retryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// ---------------------------------------------------------------- web search when Open Food Facts has nothing

export const WebProductSchema = z.object({
  found: z.boolean().describe("A search result is about the grocery product with exactly this barcode."),
  name: z.string().nullable().describe("Product name as the page writes it, without the brand."),
  brand: z.string().nullable(),
  variant: z.string().nullable().describe("Flavour or variant, e.g. 'naturel' or 'light'."),
  quantity: z.string().nullable().describe("Net content as written, e.g. '350 g'."),
  sourceUrl: z.string().nullable().describe("The search result URL these details come from."),
});
type WebProduct = z.infer<typeof WebProductSchema>;
const WEB_FORMAT = zodTextFormat(WebProductSchema, "barcode_product");

export function webSearchRequest(model: string, ean: string) {
  return {
    model,
    store: false,
    reasoning: { effort: "low" as const },
    instructions: [
      "You identify a grocery product from its barcode. Call web_search once with the barcode in quotes.",
      "Only use a result that shows this exact barcode. Copy name, brand, variant and content as written there; never guess.",
      "If no result is clearly about this barcode, set found to false and the rest to null.",
    ].join("\n"),
    input: `Barcode (EAN): ${ean}`,
    tools: [{ type: "web_search" as const, user_location: { type: "approximate" as const, country: "NL" } }],
    tool_choice: "required" as const,
    max_tool_calls: 1,
    include: ["web_search_call.results"],
    text: { format: { type: WEB_FORMAT.type, name: WEB_FORMAT.name, strict: true, schema: WEB_FORMAT.schema } },
    max_output_tokens: 600,
  };
}

function webAnswerOf(response: RawResponse): { product: WebProduct | null; results: string[]; searchCalls: number } {
  const results: string[] = [];
  let searchCalls = 0;
  for (const item of response.output ?? []) {
    if (item.type !== "web_search_call") continue;
    if (item.action?.type === "search") searchCalls += 1;
    for (const result of item.results ?? []) {
      const url = cleanUrl(result.url);
      if (url && !results.includes(url.href)) results.push(url.href);
    }
  }
  const textPart = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  try {
    const parsed = textPart ? WebProductSchema.safeParse(JSON.parse(textPart)) : null;
    return { product: parsed?.success ? parsed.data : null, results, searchCalls };
  } catch {
    return { product: null, results, searchCalls };
  }
}

const words = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);

/** The page must print the barcode and name the product; details it does not contain are dropped. */
export function checkWebPage(ean: string, html: string, product: WebProduct): BarcodeProduct | null {
  const digits = html.replace(/(\d)[\s.-](?=\d)/g, "$1");
  if (!eanForms(ean).some((form) => new RegExp(`(^|\\D)${form}(\\D|$)`).test(digits))) return null;
  const page = new Set(words(stripHtml(html)));
  const onPage = (value: string | null) => {
    const wanted = value ? words(value) : [];
    return wanted.length > 0 && wanted.filter((word) => page.has(word)).length / wanted.length >= 0.6 ? value!.trim() : undefined;
  };
  const name = onPage(product.name);
  if (!name) return null;
  const brand = onPage(product.brand);
  const variant = onPage(product.variant);
  const quantity = product.quantity && digits.replace(/\s/g, "").toLowerCase().includes(product.quantity.replace(/\s/g, "").toLowerCase()) ? product.quantity.trim() : undefined;
  return {
    name: name.slice(0, 80),
    ...(brand && { brand: brand.slice(0, 40) }),
    ...(variant && { variant: variant.slice(0, 40) }),
    ...(quantity && { quantity: quantity.slice(0, 24) }),
  };
}

// ---------------------------------------------------------------- the service

type ResponsesClient = { responses: { create: (body: never, options?: { signal?: AbortSignal }) => Promise<unknown> } };

export type BarcodeConfig = {
  userAgent: string;
  /** OpenAI client and model for the web search; without them only Open Food Facts is asked. */
  web?: { client: ResponsesClient; model: string };
  /** Shared Postgres catalog; checked after the memory cache and before Open Food Facts. */
  catalog?: Pick<
    CatalogStore,
    "byGtin" | "upsertBarcodeRecord" | "cacheGet" | "cachePut" | "rememberSeen" | "packForGtin"
  >;
  /** PrijsProfeet exact-EAN lookup (all retailers); asked together with Open Food Facts. */
  storeImages?: Pick<StoreImageLookup, "find">;
};

class OffError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`off ${status}`);
  }
}

export function createBarcodeLookup(config: BarcodeConfig, fetchImpl: Fetch = fetch, now: () => number = Date.now, sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const cache = new Map<string, { answer: BarcodeAnswer; until: number } | { error: true; until: number }>();
  const pending = new Map<string, Promise<LookupResult>>();
  let nextSlot = 0;

  async function spaced() {
    const time = now();
    const start = Math.max(time, nextSlot);
    nextSlot = start + BARCODE_RULES.offGapMs;
    if (start > time) await sleep(start - time);
  }

  async function askOff(ean: string): Promise<OffProduct | null> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await spaced();
        const response = await fetchImpl(offUrl(ean), {
          headers: { "User-Agent": config.userAgent, Accept: "application/json" },
          signal: AbortSignal.timeout(BARCODE_RULES.offTimeoutMs),
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new OffError(response.status, retryAfter(response.headers.get("retry-after")));
        const body = (await response.json()) as { status?: string; product?: OffProduct };
        return body.status === "failure" || !body.product ? null : body.product;
      } catch (error) {
        const retryable = !(error instanceof OffError) || error.status === 429 || error.status >= 500;
        if (!retryable || attempt >= BARCODE_RULES.retryDelaysMs.length) throw error;
        const hinted = error instanceof OffError ? error.retryAfterMs : undefined;
        await sleep(Math.min(hinted ?? BARCODE_RULES.retryDelaysMs[attempt], BARCODE_RULES.maxRetryAfterMs));
      }
    }
  }

  async function askWeb(ean: string, failures: string[]): Promise<{ answer?: BarcodeAnswer; usage?: Usage; searchCalls: number }> {
    if (!config.web) return { searchCalls: 0 };
    const response = (await config.web.client.responses.create(webSearchRequest(config.web.model, ean) as never).catch(() => null)) as RawResponse | null;
    if (!response) {
      failures.push("web:error");
      return { searchCalls: 0 };
    }
    const usage = usageOf(response);
    const { product, results, searchCalls } = webAnswerOf(response);
    if (!product?.found) {
      failures.push("web:not-found");
      return { usage, searchCalls };
    }
    const stated = cleanUrl(product.sourceUrl ?? undefined)?.href;
    const pages = [...new Set([...(stated && results.includes(stated) ? [stated] : []), ...results])].slice(0, BARCODE_RULES.webPages);
    for (const page of pages) {
      const fetched = await get(fetchImpl, page, "text/html").catch(() => null);
      const bytes = fetched?.ok ? await readLimited(fetched, BARCODE_RULES.pageBytes).catch(() => null) : null;
      if (!bytes) {
        failures.push("web:page-unavailable");
        continue;
      }
      const checked = checkWebPage(ean, bytes.toString("utf8"), product);
      if (checked) {
        const source: BarcodeSource = { kind: "web", name: new URL(page).hostname.replace(/^www\./, ""), url: page };
        return { answer: { ean, status: "web-page", product: checked, source, at: now() }, usage, searchCalls };
      }
      failures.push("web:not-on-page");
    }
    return { usage, searchCalls };
  }

  function remember(ean: string, entry: { answer: BarcodeAnswer; until: number } | { error: true; until: number }) {
    if (cache.size >= BARCODE_RULES.cacheEntries) cache.delete(cache.keys().next().value as string);
    cache.set(ean, entry);
  }

  async function persist(answer: BarcodeAnswer): Promise<BarcodeAnswer> {
    const withDept = withDepartment(answer);
    if (!config.catalog || withDept.status === "none" || !withDept.product || !withDept.source) return withDept;
    await config.catalog.upsertBarcodeRecord({
      ean: withDept.ean,
      status: withDept.status,
      product: withDept.product,
      source: withDept.source,
      at: withDept.at,
      ...(withDept.department && { department: withDept.department }),
    });
    const pack = await config.catalog.packForGtin(withDept.ean).catch(() => null);
    if (!pack) return withDept;
    const product = {
      ...withDept.product,
      ...(pack.displayQuantity ? { quantity: pack.displayQuantity } : pack.conflict ? { quantity: undefined } : {}),
    };
    return { ...withDept, product, pack };
  }

  function persistMiss(ean: string) {
    if (!config.catalog) return;
    void config.catalog.cachePut(`barcode:${ean}`, "barcode-miss", { status: "none" }, now() + BARCODE_RULES.missTtlMs);
  }

  async function fromCatalog(ean: string): Promise<LookupResult | null> {
    if (!config.catalog) return null;
    const hit = await config.catalog.byGtin(ean).catch(() => null);
    if (hit) {
      const answer = withDepartment({
        ...hit.answer,
        pack: hit.pack,
        ...(hit.storeImage && { storeImage: hit.storeImage }),
      });
      remember(ean, { answer, until: now() + BARCODE_RULES.foundTtlMs });
      void config.catalog.rememberSeen(hit.productId);
      if (hit.stale) {
        void lookupFresh(ean, false, { refreshOnly: true }).catch(() => undefined);
      }
      return { ok: true, answer, cached: true, searchCalls: 0, failures: [] };
    }
    const miss = await config.catalog.cacheGet<{ status: "none" }>(`barcode:${ean}`).catch(() => null);
    if (miss?.status === "none") {
      const answer: BarcodeAnswer = { ean, status: "none", at: now() };
      remember(ean, { answer, until: now() + BARCODE_RULES.missTtlMs });
      return { ok: true, answer, cached: true, searchCalls: 0, failures: [] };
    }
    return null;
  }

  function pickRetailerRow(rows: OfferRow[]): OfferRow | undefined {
    if (!rows.length) return undefined;
    return [...rows].sort((a, b) => (RETAILER_RANK[a.retailer] ?? 99) - (RETAILER_RANK[b.retailer] ?? 99))[0];
  }

  function fromPrijsProfeet(ean: string, rows: OfferRow[]): BarcodeAnswer | null {
    const row = pickRetailerRow(rows);
    if (!row) return null;
    const source: BarcodeSource = {
      kind: "web",
      name: imageRetailerName(row.retailer),
      url: row.sourceUrl ?? `https://www.prijsprofeet.nl/?q=${ean}`,
    };
    const product: BarcodeProduct = {
      ...(row.productName && { name: row.productName.slice(0, 80) }),
      ...(row.brand && { brand: row.brand.slice(0, 40) }),
      ...(row.quantity && { quantity: row.quantity.slice(0, 40) }),
      ...(row.category && categoryOf(row.category) && { categories: [row.category] }),
    };
    if (!product.name && !product.brand) return null;
    return { ean, status: "web-page", product, source, at: now() };
  }

  async function withStore(ean: string): Promise<{ rows: OfferRow[]; image?: NonNullable<BarcodeAnswer["storeImage"]> }> {
    if (!config.storeImages) return { rows: [] };
    const result = await config.storeImages.find(ean).catch(() => null);
    if (!result?.ok) return { rows: [] };
    return {
      rows: result.rows,
      ...(result.image && {
        image: {
          ean,
          imageUrl: result.image.imageUrl,
          retailer: result.image.retailer,
          ...(result.image.sourceUrl && { sourceUrl: result.image.sourceUrl }),
          ...(result.image.quantity && { quantity: result.image.quantity }),
          ...(result.image.productName && { productName: result.image.productName }),
          ...(result.image.brand && { brand: result.image.brand }),
        },
      }),
    };
  }

  async function lookupFresh(ean: string, allowWeb: boolean, options: { refreshOnly?: boolean } = {}): Promise<LookupResult> {
    const failures: string[] = [];
    const storePromise = withStore(ean);
    let raw: OffProduct | null = null;
    let offFailed = false;
    try {
      raw = await askOff(ean);
    } catch (error) {
      offFailed = true;
      failures.push(error instanceof OffError ? `off:http-${error.status}` : "off:unreachable");
    }
    const store = await storePromise;
    const off = raw ? fromOff(ean, raw) : null;
    const fromPp = fromPrijsProfeet(ean, store.rows);

    if (fromPp) {
      if (!off && !offFailed) failures.push(raw ? "off:not-credible" : "off:not-found");
      let answer = mergePpWithOff(fromPp as BarcodeAnswer & { product: BarcodeProduct; source: BarcodeSource }, off, store.image);
      answer = await persist(answer);
      remember(ean, { answer, until: now() + BARCODE_RULES.foundTtlMs });
      return { ok: true, answer, cached: false, searchCalls: 0, failures };
    }

    if (offFailed) {
      if (!options.refreshOnly) remember(ean, { error: true, until: now() + BARCODE_RULES.errorTtlMs });
      return { ok: false, code: "unavailable", failures };
    }

    if (off) {
      const source: BarcodeSource = {
        kind: "off",
        name: "Open Food Facts",
        url: `${BARCODE_RULES.offOrigin}/product/${ean}`,
        dataLicense: "ODbL",
        ...(off.product.imageUrl && { imageLicense: "CC BY-SA" as const }),
      };
      let answer: BarcodeAnswer = {
        ean,
        status: off.status,
        product: off.product,
        source,
        at: now(),
        ...(store.image && { storeImage: store.image }),
      };
      answer = await persist(answer);
      remember(ean, { answer, until: now() + BARCODE_RULES.foundTtlMs });
      return { ok: true, answer, cached: false, searchCalls: 0, failures };
    }

    failures.push(raw ? "off:not-credible" : "off:not-found");
    if (options.refreshOnly) return { ok: true, answer: { ean, status: "none", at: now() }, cached: false, searchCalls: 0, failures };

    if (!allowWeb || !config.web) {
      // Without the web search the miss is not final, so it is kept briefly.
      const answer: BarcodeAnswer = { ean, status: "none", at: now() };
      remember(ean, { answer, until: now() + (config.web ? BARCODE_RULES.errorTtlMs : BARCODE_RULES.missTtlMs) });
      if (!config.web) persistMiss(ean);
      if (config.web) failures.push("web:budget");
      return { ok: true, answer, cached: false, searchCalls: 0, failures };
    }
    const web = await askWeb(ean, failures);
    let answer = web.answer ?? { ean, status: "none" as const, at: now() };
    if (web.answer) answer = await persist({ ...answer, ...(store.image && { storeImage: store.image }) });
    else persistMiss(ean);
    remember(ean, { answer, until: now() + (web.answer ? BARCODE_RULES.foundTtlMs : BARCODE_RULES.missTtlMs) });
    return { ok: true, answer, cached: false, usage: web.usage, searchCalls: web.searchCalls, failures };
  }

  /** A cached answer, a remembered recent error, or nothing; never calls anyone. */
  function cached(ean: string): LookupResult | null {
    const entry = cache.get(ean);
    if (!entry || entry.until <= now()) return null;
    return "error" in entry ? { ok: false, code: "unavailable", failures: [] } : { ok: true, answer: entry.answer, cached: true, searchCalls: 0, failures: [] };
  }

  return {
    webEnabled: Boolean(config.web),
    cached,
    lookup(ean: string, options: { allowWeb: boolean }): Promise<LookupResult> {
      const known = cached(ean);
      if (known) return Promise.resolve(known);
      const running = pending.get(ean);
      if (running) return running;
      const promise = (async () => {
        const central = await fromCatalog(ean);
        if (central) return central;
        return lookupFresh(ean, options.allowWeb);
      })().finally(() => pending.delete(ean));
      pending.set(ean, promise);
      return promise;
    },
  };
}

export type BarcodeLookup = ReturnType<typeof createBarcodeLookup>;
