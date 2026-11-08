import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { FACT_RULES, factsOf, factsRequest, guardFacts, pageEvidence, worthReading, type ProductFacts } from "./facts.js";
import type { Usage } from "./limits.js";
import { errorCode } from "./recognize.js";
import { matchesMagic, type ImageType } from "./validate.js";

export const ImageIdentitySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    brand: z.string().trim().max(40).nullish(),
    variant: z.string().trim().max(40).nullish(),
    size: z.string().trim().max(20).nullish(),
    generic: z.boolean(),
    /** A product a parent typed: pictures only, nothing read from shop pages (no nutrition from a name). */
    typed: z.boolean().optional(),
  })
  .strict();

export type ImageIdentity = z.infer<typeof ImageIdentitySchema>;

export type Provider = "openai-web" | "brave";
/** "permitted": an open licence allows showing and storing it. "unknown": only a parent may choose to show it. */
export type UsageRights = "permitted" | "unknown";
export type Matching = "exact" | "same-type" | "unverified";

/** A picture that really exists at imageUrl; nothing here comes from model-written text. */
export type ReferenceImage = {
  imageUrl: string;
  thumbnailUrl?: string;
  sourcePageUrl: string;
  title?: string;
  provider: Provider;
  matchingStatus: Matching;
  usageRightsStatus: UsageRights;
  sourceName: string;
  license?: string;
  attribution?: string;
  /** The host sends Access-Control-Allow-Origin: *, so the app can store a permitted copy. */
  cors: boolean;
};

/**
 * found: an open-licence picture is selected. personal: the selected picture matches but its rights are unclear,
 * so it may only be kept on the device that asked, never shared through the server cache.
 */
export type Discovery = {
  status: "found" | "personal" | "review" | "none";
  selected?: number;
  candidates: ReferenceImage[];
  provider: Provider;
  searchedAt: number;
  /** Read from a candidate's product page. Facts are not pictures, so they travel with every shareable answer. */
  facts?: ProductFacts;
};

export type DiscoverResult =
  | { ok: true; discovery: Discovery; selectedData?: string; usage?: Usage; searchCalls: number; providerCalls: number; cached?: boolean }
  | { ok: false; code: string; usage?: Usage; searchCalls: number; providerCalls: number };

export const OPEN_SOURCES = ["commons.wikimedia.org", "unsplash.com", "pixabay.com"] as const;
export const BLOCKED = [
  "istockphoto.com",
  "gettyimages.com",
  "gettyimages.nl",
  "shutterstock.com",
  "123rf.com",
  "depositphotos.com",
  "alamy.com",
  "dreamstime.com",
  "stock.adobe.com",
  "adobe.com",
  "freepik.com",
  "magnific.com",
  "superstock.com",
  "pixtastock.com",
  "vecteezy.com",
  "reddit.com",
  "pinterest.com",
  "ftcdn.net",
];
const FREE_LICENSE = /^(cc0|public domain|pd\b|cc[ -]by(-sa)?[ -]\d)/i;
const USER_AGENT = "KarrieImageCheck/1.0 (https://karrie.eu; family grocery list app)";

export const IMAGE_RULES = {
  maxCandidates: 3,
  maxLeads: 8,
  pageBytes: 900_000,
  imageBytes: 4_000_000,
  fetchTimeoutMs: 6_000,
  /** Openverse answers in 8-14 s and makes some thumbnails on first request. */
  openverseTimeoutMs: 16_000,
  openverseLeads: 3,
  thumbWidth: 640,
  foundTtlMs: 30 * 24 * 60 * 60 * 1000,
  noneTtlMs: 3 * 24 * 60 * 60 * 1000,
  cacheEntries: 2_000,
  /** The selected picture travels back as a data URL so the device keeps its own copy; larger ones go by URL. */
  selectedDataChars: 1_200_000,
};

function part(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Different brands, variants or sizes never share a key; generic products ignore brand. */
export function identityKey(identity: ImageIdentity): string {
  return identity.generic ? `g|${part(identity.name)}` : ["p", part(identity.brand), part(identity.name), part(identity.variant), part(identity.size)].join("|");
}

export function describe(identity: ImageIdentity): string {
  const name = identity.brand && part(identity.name).startsWith(part(identity.brand)) ? identity.name : [identity.brand, identity.name].filter(Boolean).join(" ");
  return [name, identity.variant, identity.size].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- leads

/** Where a picture might be found. Every URL here was returned by a search service, never written by a model. */
export type Lead =
  | { kind: "image"; imageUrl: string; thumbnailUrl?: string; sourcePageUrl: string; title?: string; provider: Provider }
  | { kind: "open-image"; imageUrl: string; sourcePageUrl: string; title?: string; sourceName: string; license: string; attribution: string; provider: Provider }
  | { kind: "commons"; fileTitle: string; sourcePageUrl: string; provider: Provider }
  | { kind: "page"; sourcePageUrl: string; title?: string; open: boolean; provider: Provider };

export function cleanUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(url.hostname) || url.hostname.endsWith(".local")) return null;
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
    return url;
  } catch {
    return null;
  }
}

function hostIs(url: URL, domain: string) {
  return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
}

const blocked = (url: URL) => BLOCKED.some((domain) => hostIs(url, domain));

/** Classifies a result page: a Commons file, an open-licence photo page, or any other page. */
export function leadForPage(raw: string | undefined, title: string | undefined, provider: Provider): Lead | null {
  const url = cleanUrl(raw);
  if (!url || blocked(url) || /\.pdf$/i.test(url.pathname) || hostIs(url, "wikipedia.org")) return null;
  if (hostIs(url, "commons.wikimedia.org")) {
    const fileTitle = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ""));
    return /^File:/i.test(fileTitle) ? { kind: "commons", fileTitle, sourcePageUrl: url.href, provider } : null;
  }
  if (hostIs(url, "unsplash.com") || hostIs(url, "pixabay.com")) {
    return /^\/photos?\//.test(url.pathname) ? { kind: "page", sourcePageUrl: url.href, title, open: true, provider } : null;
  }
  return { kind: "page", sourcePageUrl: url.href, title, open: false, provider };
}

// ---------------------------------------------------------------- provider: OpenAI web search

export function openAiSearchRequest(model: string, identity: ImageIdentity) {
  const product = describe(identity);
  const input = identity.generic
    ? [
        `Product: ${identity.name} (a generic grocery product, Dutch name).`,
        `Call web_search once, with one query per site: ${OPEN_SOURCES.map((site) => `site:${site}`).join(", ")}.`,
        `Each query is the product in plain English followed by "isolated", for example "site:unsplash.com banana isolated".`,
      ].join("\n")
    : [
        `Product: ${product} (a branded product sold in Dutch supermarkets).`,
        `Call web_search once, with these two queries: "site:commons.wikimedia.org ${[identity.brand, identity.name].filter(Boolean).join(" ")}" and "${product}".`,
      ].join("\n");
  return {
    model,
    store: false,
    reasoning: { effort: "low" as const },
    instructions: "You look up product photos. Call web_search exactly once with the queries asked for, then reply only OK.",
    input,
    tools: [
      {
        type: "web_search" as const,
        search_content_types: ["image", "text"],
        image_settings: { max_results: IMAGE_RULES.maxCandidates, caption: true },
        user_location: { type: "approximate" as const, country: "NL" },
        filters: identity.generic ? { allowed_domains: [...OPEN_SOURCES] } : { blocked_domains: BLOCKED },
      },
    ],
    tool_choice: "required" as const,
    max_tool_calls: 1,
    max_output_tokens: 300,
    include: ["web_search_call.results"],
  };
}

type RawResult = { type?: string; url?: string; title?: string; image_url?: string; thumbnail_url?: string; source_website_url?: string; caption?: string };
export type RawResponse = {
  status?: string;
  output?: { type: string; action?: { type?: string; query?: string; queries?: string[] }; results?: RawResult[]; content?: { type: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

/** Reads image_result entries first (documented, but not returned on our account in November 2026), then text_result pages. */
export function leadsFromOpenAi(response: RawResponse): { leads: Lead[]; searchCalls: number; imageResults: number } {
  const leads: Lead[] = [];
  const seen = new Set<string>();
  let searchCalls = 0;
  let imageResults = 0;
  for (const item of response.output ?? []) {
    if (item.type !== "web_search_call") continue;
    if (item.action?.type === "search") searchCalls += 1;
    for (const result of item.results ?? []) {
      if (result.type === "image_result") {
        const image = cleanUrl(result.image_url);
        const source = cleanUrl(result.source_website_url);
        if (!image || !source || blocked(image) || blocked(source) || seen.has(image.href)) continue;
        seen.add(image.href);
        imageResults += 1;
        leads.push({ kind: "image", imageUrl: image.href, thumbnailUrl: cleanUrl(result.thumbnail_url)?.href, sourcePageUrl: source.href, title: result.caption?.slice(0, 160), provider: "openai-web" });
        continue;
      }
      const lead = leadForPage(result.url, result.title?.slice(0, 160), "openai-web");
      if (!lead || seen.has(lead.sourcePageUrl)) continue;
      seen.add(lead.sourcePageUrl);
      leads.push(lead);
    }
  }
  return { leads, searchCalls, imageResults };
}

/** The plain English product term the model searched with ("site:unsplash.com banana isolated" -> "banana"). */
export function englishTerm(response: RawResponse): string | undefined {
  for (const item of response.output ?? []) {
    if (item.type !== "web_search_call") continue;
    for (const query of [...(item.action?.queries ?? []), item.action?.query ?? ""]) {
      const term = query
        .replace(/site:\S+/gi, " ")
        .replace(/\b(isolated|photo|white background)\b/gi, " ")
        .replace(/[^\p{L}\p{N}' -]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (term && term.length <= 40) return term;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- open source: Openverse (CC-licensed photos, free, no key)

type OpenverseImage = {
  title?: string;
  foreign_landing_url?: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  source?: string;
  provider?: string;
};

const OPENVERSE_LICENSES: Record<string, string> = { cc0: "CC0", pdm: "Publiek domein", by: "CC BY", "by-sa": "CC BY-SA" };

/** Stock sources only: Flickr results for "banana" are trees and beaches, for "cucumber" sea cucumbers. */
export const OPENVERSE_SOURCES = ["stocksnap", "rawpixel"];

export function openverseUrl(term: string): string {
  const url = new URL("https://api.openverse.org/v1/images/");
  const params = {
    q: term,
    license: Object.keys(OPENVERSE_LICENSES).join(","),
    category: "photograph",
    source: OPENVERSE_SOURCES.join(","),
    mature: "false",
    page_size: "20",
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

/** Only titles that name the product. Openverse's own resized copy is used, so the server never contacts the photo host itself. */
export function leadsFromOpenverse(body: { results?: OpenverseImage[] }, term: string, provider: Provider): Lead[] {
  const words = part(term)
    .split(" ")
    .filter((word) => word.length > 2)
    .map((word) => word.replace(/(es|s)$/, ""));
  const leads: Lead[] = [];
  for (const result of body.results ?? []) {
    const image = cleanUrl(result.thumbnail);
    const page = cleanUrl(result.foreign_landing_url);
    const license = result.license ? OPENVERSE_LICENSES[result.license] : undefined;
    if (!image || !page || !license || image.hostname !== "api.openverse.org" || blocked(page)) continue;
    if (!words.some((word) => part(result.title).includes(word))) continue;
    const name = result.license === "by" || result.license === "by-sa" ? `${license} ${result.license_version ?? ""}`.trim() : license;
    const source = (result.source ?? "Openverse").replace(/^\w/, (letter) => letter.toUpperCase());
    leads.push({
      kind: "open-image",
      imageUrl: image.href,
      sourcePageUrl: page.href,
      title: result.title?.slice(0, 160),
      sourceName: source,
      license: name,
      attribution: [stripHtml(result.creator ?? ""), name, `${source} via Openverse`].filter(Boolean).join(" · "),
      provider,
    });
    if (leads.length >= IMAGE_RULES.openverseLeads) break;
  }
  return leads;
}

// ---------------------------------------------------------------- provider: Brave Image Search (inactive without BRAVE_SEARCH_API_KEY)

type BraveImage = { title?: string; url?: string; source?: string; thumbnail?: { src?: string }; properties?: { url?: string } };

export function braveQuery(identity: ImageIdentity): string {
  return identity.generic ? `${identity.name} los product foto` : describe(identity);
}

/** Maps https://api.search.brave.com/res/v1/images/search results; thumbnails come through Brave's image proxy. */
export function leadsFromBrave(body: { results?: BraveImage[] }): Lead[] {
  const leads: Lead[] = [];
  for (const result of body.results ?? []) {
    const page = leadForPage(result.url, result.title, "brave");
    const image = cleanUrl(result.properties?.url);
    if (!page || !image || blocked(image)) continue;
    if (page.kind === "commons") leads.push(page);
    else leads.push({ kind: "image", imageUrl: image.href, thumbnailUrl: cleanUrl(result.thumbnail?.src)?.href, sourcePageUrl: page.sourcePageUrl, title: result.title?.slice(0, 160), provider: "brave" });
  }
  return leads;
}

// ---------------------------------------------------------------- resolving leads to real, valid images

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function readLimited(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Every redirect hop is checked again, so a search result cannot steer the server to a private address. */
export async function get(fetchImpl: Fetch, url: string, accept: string, timeoutMs = IMAGE_RULES.fetchTimeoutMs): Promise<Response | null> {
  let target = cleanUrl(url);
  for (let hop = 0; target && hop < 4; hop += 1) {
    const response = await fetchImpl(target.href, { headers: { "User-Agent": USER_AGENT, Accept: accept }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response;
    target = cleanUrl(new URL(location, target).href);
  }
  return null;
}

export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function ogImage(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(property|name)=["'](og:image(:secure_url)?|twitter:image)["']/i.test(tag)) continue;
    const content = /content=["']([^"']+)["']/i.exec(tag)?.[1];
    if (content) return content.replace(/&amp;/g, "&");
  }
  return undefined;
}

/** Unsplash puts a logo overlay and a huge size on og:image; ask its CDN for the plain photo. */
export function plainUnsplash(raw: string): string | undefined {
  const url = cleanUrl(raw);
  if (!url || url.hostname !== "images.unsplash.com") return undefined;
  return `${url.origin}${url.pathname}?w=${IMAGE_RULES.thumbWidth}&q=80&fit=max&fm=jpg`;
}

export type Fetched = { dataUrl: string; cors: boolean };
export type Failure = "page-unavailable" | "no-image-on-page" | "image-unavailable" | "not-an-image";
export type Resolved = Omit<ReferenceImage, "matchingStatus"> & Fetched;

async function fetchImage(fetchImpl: Fetch, url: string, timeoutMs?: number, accept = "image/jpeg,image/png,image/webp"): Promise<Fetched | Failure> {
  const response = await get(fetchImpl, url, accept, timeoutMs).catch(() => null);
  if (!response?.ok) return "image-unavailable";
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim() as ImageType;
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") return "not-an-image";
  const bytes = await readLimited(response, IMAGE_RULES.imageBytes).catch(() => null);
  if (!bytes || bytes.length < 2_000 || !matchesMagic(type, bytes.subarray(0, 16))) return "not-an-image";
  return { dataUrl: `data:${type};base64,${bytes.toString("base64")}`, cors: response.headers.get("access-control-allow-origin") === "*" };
}

async function resolveCommons(fetchImpl: Fetch, lead: Extract<Lead, { kind: "commons" }>): Promise<Resolved | Failure> {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  const params = { action: "query", format: "json", prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: String(IMAGE_RULES.thumbWidth), titles: lead.fileTitle };
  for (const [key, value] of Object.entries(params)) api.searchParams.set(key, value);
  const response = await get(fetchImpl, api.href, "application/json").catch(() => null);
  if (!response?.ok) return "page-unavailable";
  type Info = { thumburl?: string; url?: string; mime?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };
  const body = (await response.json().catch(() => ({}))) as { query?: { pages?: Record<string, { imageinfo?: Info[] }> } };
  const info = Object.values(body.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info) return "no-image-on-page";
  if (!/^image\/(jpeg|png|webp)$/.test(info.mime ?? "")) return "not-an-image";
  const imageUrl = cleanUrl(info.thumburl ?? info.url)?.href;
  if (!imageUrl) return "no-image-on-page";
  const image = await fetchImage(fetchImpl, imageUrl);
  if (typeof image === "string") return image;
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value ?? "");
  const artist = stripHtml(meta.Artist?.value ?? "");
  return {
    imageUrl,
    sourcePageUrl: info.descriptionurl ?? lead.sourcePageUrl,
    title: stripHtml(meta.ObjectName?.value ?? lead.fileTitle.replace(/^File:/i, "")),
    provider: lead.provider,
    usageRightsStatus: FREE_LICENSE.test(license) ? "permitted" : "unknown",
    sourceName: "Wikimedia Commons",
    license: license || undefined,
    attribution: [artist, license, "Wikimedia Commons"].filter(Boolean).join(" · "),
    ...image,
  };
}

async function resolvePage(fetchImpl: Fetch, lead: Extract<Lead, { kind: "page" }>): Promise<Resolved | Failure> {
  const page = await get(fetchImpl, lead.sourcePageUrl, "text/html").catch(() => null);
  if (!page?.ok || !(page.headers.get("content-type") ?? "").includes("html")) return "page-unavailable";
  const html = (await readLimited(page, IMAGE_RULES.pageBytes).catch(() => null))?.toString("utf8");
  const found = html ? ogImage(html) : undefined;
  if (!found) return "no-image-on-page";
  const source = new URL(lead.sourcePageUrl);
  const unsplash = hostIs(source, "unsplash.com");
  const pixabay = hostIs(source, "pixabay.com");
  const imageUrl = unsplash ? plainUnsplash(found) : cleanUrl(new URL(found, source).href)?.href;
  if (!imageUrl) return "no-image-on-page";
  const image = await fetchImage(fetchImpl, imageUrl);
  if (typeof image === "string") return image;
  const open = lead.open && (unsplash || pixabay);
  return {
    imageUrl,
    sourcePageUrl: lead.sourcePageUrl,
    title: lead.title,
    provider: lead.provider,
    usageRightsStatus: open ? "permitted" : "unknown",
    sourceName: unsplash ? "Unsplash" : pixabay ? "Pixabay" : source.hostname.replace(/^www\./, ""),
    license: open ? (unsplash ? "Unsplash-licentie" : "Pixabay-licentie") : undefined,
    attribution: open ? `Foto via ${unsplash ? "Unsplash" : "Pixabay"}` : undefined,
    ...image,
  };
}

async function resolveOpenImage(fetchImpl: Fetch, lead: Extract<Lead, { kind: "open-image" }>): Promise<Resolved | Failure> {
  // Openverse answers 406 to a list of image types for thumbnails it has not made yet; the type is still checked below.
  const image = await fetchImage(fetchImpl, lead.imageUrl, IMAGE_RULES.openverseTimeoutMs, "*/*");
  if (typeof image === "string") return image;
  return {
    imageUrl: lead.imageUrl,
    sourcePageUrl: lead.sourcePageUrl,
    title: lead.title,
    provider: lead.provider,
    usageRightsStatus: "permitted",
    sourceName: lead.sourceName,
    license: lead.license,
    attribution: lead.attribution,
    ...image,
  };
}

/** The shop's own picture first; when the shop refuses Render, the search service's thumbnail of it. */
async function resolveImage(fetchImpl: Fetch, lead: Extract<Lead, { kind: "image" }>): Promise<Resolved | Failure> {
  const original = await fetchImage(fetchImpl, lead.imageUrl);
  const image = typeof original === "string" && lead.thumbnailUrl ? await fetchImage(fetchImpl, lead.thumbnailUrl, undefined, "*/*") : original;
  if (typeof image === "string") return image;
  return {
    imageUrl: lead.imageUrl,
    thumbnailUrl: lead.thumbnailUrl,
    sourcePageUrl: lead.sourcePageUrl,
    title: lead.title,
    provider: lead.provider,
    usageRightsStatus: "unknown",
    sourceName: new URL(lead.sourcePageUrl).hostname.replace(/^www\./, ""),
    ...image,
  };
}

/** failures are "<source>:<failure>", e.g. "unsplash.com:page-unavailable" or "other:no-image-on-page". */
export async function resolveLeads(fetchImpl: Fetch, leads: Lead[]): Promise<{ resolved: Resolved[]; failures: string[] }> {
  const rank = (lead: Lead) => (lead.kind === "commons" ? 0 : lead.kind === "open-image" ? 1 : lead.kind === "page" && lead.open ? 2 : 3);
  const ordered = leads
    .map((lead, index) => ({ lead, index }))
    .sort((a, b) => rank(a.lead) - rank(b.lead) || a.index - b.index)
    .map(({ lead }) => lead)
    .slice(0, IMAGE_RULES.maxLeads);
  const resolve = (lead: Lead) =>
    lead.kind === "commons"
      ? resolveCommons(fetchImpl, lead)
      : lead.kind === "open-image"
        ? resolveOpenImage(fetchImpl, lead)
        : lead.kind === "page"
          ? resolvePage(fetchImpl, lead)
          : resolveImage(fetchImpl, lead);
  const settled = await Promise.all(ordered.map((lead) => resolve(lead).catch((): Failure => "image-unavailable")));
  const seen = new Set<string>();
  const resolved: Resolved[] = [];
  const failures: string[] = [];
  settled.forEach((outcome, index) => {
    if (typeof outcome === "string") failures.push(`${sourceClass(ordered[index])}:${outcome}`);
    else if (!seen.has(outcome.imageUrl)) {
      seen.add(outcome.imageUrl);
      resolved.push(outcome);
    }
  });
  return { resolved: resolved.slice(0, IMAGE_RULES.maxCandidates), failures };
}

/** Names only the open sources; every other site is "other", so monitoring never records which shops were visited. */
function sourceClass(lead: Lead): string {
  if (lead.kind === "open-image") return "openverse";
  const host = new URL(lead.sourcePageUrl).hostname;
  return OPEN_SOURCES.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? "other";
}

// ---------------------------------------------------------------- matching with OpenAI vision

const Same = z.enum(["same", "different", "not-visible"]);

export const VerdictSchema = z.object({
  images: z.array(
    z.object({
      index: z.number().int(),
      productType: z.enum(["same", "different"]).describe("Same kind of product (peanut butter, yoghurt, banana...)."),
      brand: Same,
      variant: Same.describe("Flavour, fat level, 'naturel', '100%', wholegrain and similar."),
      size: Same,
      frontFacing: z.boolean(),
      clear: z.boolean().describe("Sharp, well lit, the product fills a good part of the picture."),
      asSold: z.boolean().describe("The whole product as a shopper picks it up: unpeeled, uncut, not an extreme close-up, the whole pack in view."),
      brandVisible: z.boolean().describe("A brand name or shop label is readable on the product or pack."),
      plainBackground: z.boolean(),
      people: z.boolean().describe("A face or body is visible. A hand holding the product does not count."),
    }),
  ),
});

export type Verdict = z.infer<typeof VerdictSchema>["images"][number];

const VERDICT = zodTextFormat(VerdictSchema, "image_verdicts");

export function verifyRequest(model: string, identity: ImageIdentity, images: { dataUrl: string; title?: string }[]) {
  const target = identity.generic
    ? `the generic grocery product "${identity.name}" (Dutch name). Brand and variant do not matter; answer "not-visible" for them when there is none.`
    : `this branded product: "${describe(identity)}". Brand: ${identity.brand ?? "unknown"}. Variant: ${identity.variant ?? "not given"}. Size: ${identity.size ?? "not given"}.`;
  return {
    model,
    store: false,
    reasoning: { effort: "low" as const },
    instructions: [
      "You compare pictures with a grocery product. Judge only what you can see on the pack or product; titles can be wrong.",
      'brand/variant/size: "same" when visibly the same, "different" when visibly another one, "not-visible" when you cannot read it.',
      "A recipe, a dish, a shelf, a logo, a shipping carton or several different products is productType different.",
      "Return one entry per image, using its index.",
    ].join("\n"),
    input: [
      {
        role: "user" as const,
        content: [
          { type: "input_text" as const, text: `Compare each picture with ${target}` },
          ...images.flatMap((image, index) => [
            { type: "input_text" as const, text: `Image ${index}${image.title ? ` (page title: ${image.title})` : ""}:` },
            { type: "input_image" as const, image_url: image.dataUrl, detail: "low" as const },
          ]),
        ],
      },
    ],
    text: { format: { type: VERDICT.type, name: VERDICT.name, strict: true, schema: VERDICT.schema } },
    max_output_tokens: 800,
  };
}

export function verdictsOf(response: RawResponse, count: number): Verdict[] {
  const text = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!text) return [];
  try {
    const parsed = VerdictSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.images.filter((entry) => entry.index >= 0 && entry.index < count) : [];
  } catch {
    return [];
  }
}

/** Exact means brand and type match and nothing visible contradicts the variant or size. Mismatches are dropped. */
export function matchOf(identity: ImageIdentity, verdict: Verdict): Matching | "mismatch" {
  if (verdict.people || verdict.productType === "different") return "mismatch";
  if (identity.generic) return "same-type";
  if (verdict.brand === "different" || (identity.variant && verdict.variant === "different") || (identity.size && verdict.size === "different")) return "mismatch";
  return verdict.brand === "same" ? "exact" : "unverified";
}

/** Brand, type, variant, size, then front view, clarity and a plain background. */
export function scoreOf(identity: ImageIdentity, verdict: Verdict): number {
  return (
    (verdict.brand === "same" ? 16 : 0) +
    (verdict.productType === "same" ? 8 : 0) +
    (identity.variant && verdict.variant === "same" ? 4 : 0) +
    (identity.size && verdict.size === "same" ? 2 : 0) +
    (verdict.asSold ? 4 : 0) +
    (identity.generic && verdict.brandVisible ? -4 : 0) +
    (verdict.frontFacing ? 2 : 0) +
    (verdict.clear ? 2 : 0) +
    (verdict.plainBackground ? 1 : 0)
  );
}

/** A child must recognise it at a glance, and a generic product must not show someone's brand. */
function childReady(identity: ImageIdentity, verdict: Verdict): boolean {
  return verdict.clear && verdict.asSold && !(identity.generic && verdict.brandVisible);
}

/** Only a permitted, matching, clear picture is applied automatically; the rest waits for a parent. */
export function decide(identity: ImageIdentity, resolved: Resolved[], verdicts: Verdict[], provider: Provider, now: number): Discovery {
  const ranked: { image: ReferenceImage; score: number; usable: boolean; personal: boolean }[] = [];
  resolved.forEach((entry, index) => {
    const verdict = verdicts.find((item) => item.index === index);
    if (!verdict) return;
    const match = matchOf(identity, verdict);
    if (match === "mismatch") return;
    const { dataUrl: _dataUrl, ...image } = entry;
    const fits = match !== "unverified" && childReady(identity, verdict);
    const usable = fits && image.usageRightsStatus === "permitted";
    ranked.push({ image: { ...image, matchingStatus: match }, score: scoreOf(identity, verdict), usable, personal: fits && !usable });
  });
  ranked.sort((a, b) => Number(b.usable) - Number(a.usable) || Number(b.personal) - Number(a.personal) || b.score - a.score);
  const candidates = ranked.map((entry) => entry.image);
  if (ranked[0]?.usable) return { status: "found", selected: 0, candidates, provider, searchedAt: now };
  if (ranked[0]?.personal) return { status: "personal", selected: 0, candidates, provider, searchedAt: now };
  return { status: candidates.length ? "review" : "none", candidates, provider, searchedAt: now };
}

/** What other devices may receive: open-licence pictures only. Null when nothing may be shared. */
export function shareable(discovery: Discovery): Discovery | null {
  if (discovery.status === "none") return discovery;
  const candidates = discovery.candidates.filter((image) => image.usageRightsStatus === "permitted");
  if (!candidates.length) return null;
  return { ...discovery, status: discovery.status === "found" ? "found" : "review", selected: discovery.status === "found" ? 0 : undefined, candidates };
}

// ---------------------------------------------------------------- the service

export function usageOf(response: RawResponse): Usage | undefined {
  if (!response.usage) return undefined;
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  };
}

export function addUsage(a?: Usage, b?: Usage): Usage | undefined {
  if (!a) return b;
  if (!b) return a;
  return { inputTokens: a.inputTokens + b.inputTokens, cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

type ResponsesClient = { responses: { create: (body: never, options?: { signal?: AbortSignal }) => Promise<unknown> } };

export type DiscoveryConfig = { model: string; maxConcurrent: number; braveKey?: string; openverse?: boolean };

export type SearchReport = {
  leads: Lead[];
  usage?: Usage;
  searchCalls: number;
  providerCalls: number;
  imageResults: number;
  term?: string;
  provider: Provider;
  failures: string[];
};

export function braveFailure(status: number | undefined): string {
  if (status === 401 || status === 403) return "brave:unauthorized";
  if (status === 429) return "brave:rate-limited";
  return "brave:unavailable";
}

export function createImageDiscovery(client: ResponsesClient, config: DiscoveryConfig, fetchImpl: Fetch = fetch, now: () => number = Date.now) {
  const cache = new Map<string, { discovery: Discovery; until: number }>();
  const pending = new Map<string, Promise<DiscoverResult>>();
  const facts = new Map<string, { facts: ProductFacts; until: number }>();
  let running = 0;
  /** The provider for branded packs; standard products always go through OpenAI web search and Openverse. */
  const provider: Provider = config.braveKey ? "brave" : "openai-web";

  async function braveLeads(identity: ImageIdentity, key: string): Promise<{ leads: Lead[] } | { failure: string }> {
    const url = new URL("https://api.search.brave.com/res/v1/images/search");
    for (const [name, value] of Object.entries({ q: braveQuery(identity), country: "NL", search_lang: "nl", count: "12", safesearch: "strict" })) url.searchParams.set(name, value);
    const response = await fetchImpl(url.href, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!response?.ok) return { failure: braveFailure(response?.status) };
    const body = (await response.json().catch(() => ({}))) as { results?: BraveImage[] };
    return { leads: leadsFromBrave(body) };
  }

  /** Brave for a branded pack when a key is set; if Brave fails, OpenAI web search still runs. */
  async function findLeads(identity: ImageIdentity): Promise<SearchReport> {
    const failures: string[] = [];
    let providerCalls = 0;
    if (config.braveKey && !identity.generic) {
      const brave = await braveLeads(identity, config.braveKey);
      providerCalls = 1;
      if ("leads" in brave) return { leads: brave.leads, searchCalls: 0, providerCalls, imageResults: 0, provider: "brave", failures };
      failures.push(brave.failure);
    }
    const search = (await client.responses.create(openAiSearchRequest(config.model, identity) as never)) as RawResponse;
    const found = leadsFromOpenAi(search);
    return {
      leads: found.leads,
      usage: usageOf(search),
      searchCalls: found.searchCalls,
      providerCalls,
      imageResults: found.imageResults,
      term: englishTerm(search),
      provider: "openai-web",
      failures,
    };
  }

  /** Openverse's index is English; the term comes from the query the model already wrote, so this costs no extra model call. */
  async function openverseLeads(identity: ImageIdentity, term: string | undefined): Promise<{ leads: Lead[]; failure?: string }> {
    if (!config.openverse || !identity.generic || !term) return { leads: [] };
    const response = await get(fetchImpl, openverseUrl(term), "application/json", IMAGE_RULES.openverseTimeoutMs).catch(() => null);
    if (!response?.ok) return { leads: [], failure: response?.status === 429 ? "openverse:rate-limited" : "openverse:unavailable" };
    const body = (await response.json().catch(() => ({}))) as { results?: OpenverseImage[] };
    const leads = leadsFromOpenverse(body, term, provider);
    return leads.length ? { leads } : { leads, failure: "openverse:no-results" };
  }

  /**
   * Branded packs only: the facts on the shop or brand page of the chosen picture, else the next matching one.
   * Kept per product, so a later search for the same pack (another family, a refresh) pays nothing for them.
   */
  async function productFacts(identity: ImageIdentity, discovery: Discovery): Promise<{ facts?: ProductFacts; usage?: Usage; failures: string[] }> {
    if (identity.generic) return { failures: [] };
    const key = identityKey(identity);
    const known = facts.get(key);
    if (known && known.until > now()) return { facts: known.facts, failures: [] };
    const order = discovery.selected === undefined ? discovery.candidates : [discovery.candidates[discovery.selected], ...discovery.candidates];
    const pages = [...new Set(order.filter((image) => image.usageRightsStatus === "unknown").map((image) => image.sourcePageUrl))].slice(0, FACT_RULES.pages);
    const failures: string[] = [];
    let usage: Usage | undefined;
    for (const page of pages) {
      const response = await get(fetchImpl, page, "text/html").catch(() => null);
      const bytes = response?.ok ? await readLimited(response, IMAGE_RULES.pageBytes).catch(() => null) : null;
      if (!bytes) {
        failures.push("facts:page-unavailable");
        continue;
      }
      const evidence = pageEvidence(bytes.toString("utf8"));
      if (!worthReading(evidence)) {
        failures.push("facts:not-on-page");
        continue;
      }
      const answer = (await client.responses.create(factsRequest(config.model, describe(identity), evidence) as never).catch(() => null)) as RawResponse | null;
      if (!answer) {
        failures.push("facts:error");
        break;
      }
      usage = addUsage(usage, usageOf(answer));
      const raw = factsOf(answer);
      const found = raw && guardFacts(raw, evidence, { url: page, name: new URL(page).hostname.replace(/^www\./, ""), at: now() });
      if (found) {
        if (facts.size >= IMAGE_RULES.cacheEntries) facts.delete(facts.keys().next().value as string);
        facts.set(key, { facts: found, until: now() + IMAGE_RULES.foundTtlMs });
        return { facts: found, usage, failures };
      }
      failures.push("facts:not-on-page");
    }
    return { usage, failures };
  }

  /** The one entry point for finding pictures of a product. Switching provider changes nothing else. */
  async function searchProductReferenceImages(identity: ImageIdentity): Promise<DiscoverResult & { failures?: string[] }> {
    let report: SearchReport = { leads: [], searchCalls: 0, providerCalls: 0, imageResults: 0, provider, failures: [] };
    try {
      report = await findLeads(identity);
      const open = await openverseLeads(identity, report.term);
      const resolution = await resolveLeads(fetchImpl, [...report.leads, ...open.leads]);
      const { resolved } = resolution;
      const failures = [...report.failures, ...resolution.failures];
      if (!report.leads.length) failures.push("search:no-results");
      if (open.failure) failures.push(open.failure);
      const base = { usage: report.usage, searchCalls: report.searchCalls, providerCalls: report.providerCalls, failures };
      if (!resolved.length) return { ok: true, discovery: { status: "none", candidates: [], provider: report.provider, searchedAt: now() }, ...base };
      const check = (await client.responses.create(verifyRequest(config.model, identity, resolved) as never)) as RawResponse;
      const decided = decide(identity, resolved, verdictsOf(check, resolved.length), report.provider, now());
      const read = identity.typed ? { failures: [] as string[], facts: undefined, usage: undefined } : await productFacts(identity, decided);
      failures.push(...read.failures);
      const discovery = read.facts ? { ...decided, facts: read.facts } : decided;
      const chosen = discovery.selected === undefined ? undefined : discovery.candidates[discovery.selected];
      const data = chosen && resolved.find((entry) => entry.imageUrl === chosen.imageUrl)?.dataUrl;
      const selectedData = data && data.length <= IMAGE_RULES.selectedDataChars ? data : undefined;
      return { ok: true, discovery, selectedData, ...base, usage: addUsage(addUsage(report.usage, usageOf(check)), read.usage) };
    } catch (error) {
      const status = (error as { status?: number }).status;
      return { ok: false, code: status === 429 ? "busy" : errorCode(error), usage: report.usage, searchCalls: report.searchCalls, providerCalls: report.providerCalls };
    }
  }

  async function searchAgain(identity: ImageIdentity): Promise<DiscoverResult> {
    running += 1;
    try {
      return await searchProductReferenceImages(identity);
    } finally {
      running -= 1;
    }
  }

  return {
    provider,
    searchProductReferenceImages,
    cached(identity: ImageIdentity): Discovery | null {
      const hit = cache.get(identityKey(identity));
      return hit && hit.until > now() ? hit.discovery : null;
    },
    busy: () => running >= config.maxConcurrent,
    /**
     * Identical concurrent requests share one search. Only what may be shared is kept in memory for other devices;
     * a picture with unclear rights goes only to the device that asked.
     */
    async discover(identity: ImageIdentity, options: { refresh?: boolean } = {}): Promise<DiscoverResult> {
      const key = identityKey(identity);
      const hit = options.refresh ? null : cache.get(key);
      if (hit && hit.until > now()) return { ok: true, discovery: hit.discovery, searchCalls: 0, providerCalls: 0, cached: true };
      const joined = pending.get(key);
      if (joined)
        return joined.then((result) => {
          if (!result.ok) return result;
          const shared = shareable(result.discovery);
          return shared ? { ok: true, discovery: shared, searchCalls: 0, providerCalls: 0, cached: true } : searchAgain(identity);
        });
      running += 1;
      const task = searchProductReferenceImages(identity).finally(() => {
        running -= 1;
        pending.delete(key);
      });
      pending.set(key, task);
      const result = await task;
      const shared = result.ok ? shareable(result.discovery) : null;
      if (shared) {
        if (cache.size >= IMAGE_RULES.cacheEntries) cache.delete(cache.keys().next().value as string);
        cache.set(key, { discovery: shared, until: now() + (shared.status === "none" ? IMAGE_RULES.noneTtlMs : IMAGE_RULES.foundTtlMs) });
      }
      return result;
    },
  };
}

export type ImageDiscovery = ReturnType<typeof createImageDiscovery>;
