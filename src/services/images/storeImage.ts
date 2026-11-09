import { imageRetailerName, isImageSourceRetailer, type ImageSourceRetailerId } from "../../domain/retailers";

/**
 * Mirrors StoreImage on the server: a link to a retailer's own product photo for one exact barcode, found through
 * PrijsProfeet. The photo belongs to the retailer; Karrie only links to it and never keeps a copy.
 */
export type StoreImage = {
  ean: string;
  imageUrl: string;
  retailer: ImageSourceRetailerId;
  sourceUrl?: string;
  quantity?: string;
  productName?: string;
  brand?: string;
};

export type StoreImageOutcome =
  | { status: "ok"; image: StoreImage | null }
  | { status: "offline" }
  | { status: "limit"; code: string }
  | { status: "error"; code: string };

export const STORE_IMAGE_CLIENT_RULES = { timeoutMs: 15_000 };

/** Same allowlist as the server: each retailer's own image host and path. */
export const RETAILER_IMAGE_HOSTS: Record<ImageSourceRetailerId, { host: string; path: string }> = {
  albert_heijn: { host: "static.ah.nl", path: "/dam/product/" },
  jumbo: { host: "www.jumbo.com", path: "/dam-images/" },
  lidl: { host: "www.lidl.nl", path: "/assets/" },
  plus: { host: "images.ctfassets.net", path: "/s0lodsnpsezb/" },
  dirk: { host: "web-fileserver.dirk.nl", path: "/artikelen/" },
  hoogvliet: { host: "static.hoogvliet.nl", path: "/" },
  dekamarkt: { host: "web-fileserver.dekamarkt.nl", path: "/" },
  poiesz: { host: "images.poiesz-supermarkten.nl", path: "/" },
};

/** The credit for a retailer photo: always the retailer and PrijsProfeet, never Open Food Facts. */
export function storeCredit(image: Pick<StoreImage, "retailer">): string {
  return `Foto: ${imageRetailerName(image.retailer)}, via PrijsProfeet.`;
}

const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget"]);

function parsed(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 600) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

/** Checked again here: the same barcode, an allowed retailer image host, and an https product page if any. */
export function cleanStoreImage(value: unknown, ean: string): StoreImage | null {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  if (raw.ean !== ean || !isImageSourceRetailer(raw.retailer)) return null;
  const image = parsed(raw.imageUrl);
  const allowed = RETAILER_IMAGE_HOSTS[raw.retailer];
  if (!image || image.hostname !== allowed.host || !image.pathname.startsWith(allowed.path)) return null;
  const page = parsed(raw.sourceUrl);
  return { ean, imageUrl: image.href, retailer: raw.retailer, ...(page && { sourceUrl: page.href }) };
}

export type StoreImageClientDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  origin: string;
};

export function createStoreImageClient(deps: StoreImageClientDeps) {
  return {
    /** Only the barcode is sent. Optional listRetailer prefers that supermarket's photo when several exist. */
    async find(ean: string, listRetailer?: string): Promise<StoreImageOutcome> {
      if (!deps.online()) return { status: "offline" };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), STORE_IMAGE_CLIENT_RULES.timeoutMs);
      try {
        const response = await deps.fetch(`${deps.origin.replace(/\/$/, "")}/api/images/ean`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ean, ...(listRetailer && { retailer: listRetailer }) }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { status?: string; code?: string; image?: unknown } | null;
        if (response.ok && body?.status === "ok") {
          if (body.image === null) return { status: "ok", image: null };
          const image = cleanStoreImage(body.image, ean);
          return image ? { status: "ok", image } : { status: "error", code: "malformed" };
        }
        const code = body?.code ?? `http-${response.status}`;
        return LIMIT_CODES.has(code) || response.status === 429 ? { status: "limit", code } : { status: "error", code };
      } catch {
        if (controller.signal.aborted) return { status: "error", code: "timeout" };
        return deps.online() ? { status: "error", code: "unreachable" } : { status: "offline" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type StoreImageClient = ReturnType<typeof createStoreImageClient>;

export const storeImageClient = createStoreImageClient({
  fetch: (...args) => fetch(...args),
  online: () => navigator.onLine,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
});
