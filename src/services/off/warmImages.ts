import type { PackInfo } from "../../domain/types";

/**
 * Requests every packaging photo once so the service worker's off-images cache
 * holds it before the family loses signal in the shop. Failures are ignored:
 * the drawing is always the fallback.
 */
export function warmImages(items: PackInfo[]): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const urls = [...new Set(items.filter((item) => item.imageKind === "photo" && item.imageUrl).map((item) => item.imageUrl!))];
  for (const url of urls) {
    void fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" }).catch(() => undefined);
  }
}
