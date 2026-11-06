import type { ScannedProduct } from "../../domain/types";
import { normalizeOffProduct, OFF_FIELDS, type OffProduct } from "./normalize";

export const OFF_ORIGIN = "https://world.openfoodfacts.org";
const APP_VERSION = "1.1";

export type FetchResult = { status: "found"; product: ScannedProduct } | { status: "not-found" };

export class OffHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(`Open Food Facts antwoordde met ${status}`);
  }
}

export function productUrl(ean: string): string {
  const params = new URLSearchParams({
    fields: OFF_FIELDS.join(","),
    lc: "nl",
    cc: "nl",
    app_name: "Karrie",
    app_version: APP_VERSION,
  });
  return `${OFF_ORIGIN}/api/v3/product/${encodeURIComponent(ean)}?${params}`;
}

function retryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Sends only the barcode; no images, camera frames or personal data leave the device. */
export async function fetchOffProduct(ean: string, fetcher: typeof fetch, signal?: AbortSignal): Promise<FetchResult> {
  const response = await fetcher(productUrl(ean), {
    signal,
    headers: { Accept: "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) throw new OffHttpError(response.status, retryAfter(response.headers.get("Retry-After")));
  const body = (await response.json()) as { status?: string; product?: OffProduct };
  if (!body.product || body.status === "failure") return { status: "not-found" };
  return { status: "found", product: normalizeOffProduct(ean, body.product) };
}
