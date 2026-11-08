import { CATEGORIES } from "../../domain/categories";
import type { CategoryId } from "../../domain/types";
import type { CustomEnrichment } from "../../state/reducer";

export type NormalizeOutcome =
  | { status: "ok"; enrichment: CustomEnrichment; illustrations: boolean }
  /** The server says it is not one generic product; the item stays as typed and is not asked again. */
  | { status: "refused"; brand?: boolean }
  | { status: "retry" };

export type IllustrationOutcome = { status: "ok"; image: Blob } | { status: "none" } | { status: "retry" };

export const CUSTOM_RULES = {
  timeoutMs: 30_000,
  illustrationTimeoutMs: 90_000,
  illustrationsPerDay: 8,
};

export type CustomProductDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  origin: string;
  now: () => number;
};

const DEVICE_KEY = "karrie-illustration-day";
const CATEGORY_IDS = new Set<string>(CATEGORIES.map((category) => category.id));
const text = (value: unknown, max = 40) => (typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : undefined);

export function enrichmentOf(product: unknown): CustomEnrichment | null {
  if (!product || typeof product !== "object") return null;
  const raw = product as Record<string, unknown>;
  const displayName = text(raw.displayName);
  const canonicalName = text(raw.canonicalName);
  if (!displayName || !canonicalName || typeof raw.category !== "string" || !CATEGORY_IDS.has(raw.category)) return null;
  const enrichment: CustomEnrichment = { displayName, canonicalName, category: raw.category as CategoryId };
  const singularName = text(raw.singularName);
  const pluralName = text(raw.pluralName);
  const childFriendlyLabel = text(raw.childFriendlyLabel);
  const subcategory = text(raw.subcategory, 30);
  const drawing = text(raw.closestDrawing, 40);
  return {
    ...enrichment,
    ...(singularName && { singularName }),
    ...(pluralName && { pluralName }),
    ...(childFriendlyLabel && { childFriendlyLabel }),
    ...(subcategory && { subcategory }),
    ...(drawing && { drawing }),
  };
}

/** Only the typed product name goes to the server; never the list, its name or anything about the family. */
export function createCustomProductClient(deps: CustomProductDeps) {
  const url = (path: string) => `${deps.origin.replace(/\/$/, "")}${path}`;

  async function post(path: string, body: unknown, timeoutMs: number): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await deps.fetch(url(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function usedToday(): { day: string; count: number } {
    const day = new Date(deps.now()).toISOString().slice(0, 10);
    try {
      const saved = JSON.parse(deps.storage?.getItem(DEVICE_KEY) ?? "null") as { day: string; count: number } | null;
      return saved?.day === day ? saved : { day, count: 0 };
    } catch {
      return { day, count: 0 };
    }
  }

  async function normalizeOnce(name: string): Promise<NormalizeOutcome> {
    if (!deps.online()) return { status: "retry" };
    const reply = await post("/api/products/normalize", { name, createdFrom: "search" }, CUSTOM_RULES.timeoutMs);
    if (!reply) return { status: "retry" };
    if (reply.status === 422 && reply.body?.reason === "brand") return { status: "refused", brand: true };
    if (reply.status === 422 || reply.status === 400) return { status: "refused" };
    const enrichment = reply.status === 200 && reply.body?.status === "ok" ? enrichmentOf(reply.body.product) : null;
    return enrichment ? { status: "ok", enrichment, illustrations: reply.body?.illustrations === true } : { status: "retry" };
  }

  /** The add sheet and the background tidy-up may ask for the same name at once; they share one request. */
  const running = new Map<string, Promise<NormalizeOutcome>>();

  return {
    online: deps.online,

    normalize(name: string): Promise<NormalizeOutcome> {
      const current = running.get(name);
      if (current) return current;
      const request = normalizeOnce(name).finally(() => running.delete(name));
      running.set(name, request);
      return request;
    },

    /** A Karrie-style drawing for a product the server knows; "none" when drawings are off or the device used its share today. */
    async illustration(name: string): Promise<IllustrationOutcome> {
      if (!deps.online()) return { status: "retry" };
      const used = usedToday();
      if (used.count >= CUSTOM_RULES.illustrationsPerDay) return { status: "retry" };
      deps.storage?.setItem(DEVICE_KEY, JSON.stringify({ day: used.day, count: used.count + 1 }));
      const reply = await post("/api/products/illustration", { name }, CUSTOM_RULES.illustrationTimeoutMs);
      if (!reply) return { status: "retry" };
      if (reply.status === 404) return { status: "none" };
      const image = reply.status === 200 ? reply.body?.image : undefined;
      if (typeof image !== "string" || !/^data:image\/(webp|png);base64,/.test(image)) return { status: "retry" };
      try {
        return { status: "ok", image: await (await deps.fetch(image)).blob() };
      } catch {
        return { status: "retry" };
      }
    },
  };
}

export const customProducts = createCustomProductClient({
  fetch: (...args) => fetch(...args),
  online: () => typeof navigator === "undefined" || navigator.onLine,
  storage: typeof localStorage === "undefined" ? null : localStorage,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  now: Date.now,
});
