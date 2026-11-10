import { trackEvent, type ProductImageSource, type StorageFailureReason, type StorageOperation } from "./analytics";

const imageSent = new Set<string>();
const storageCoalesce = new Map<string, number>();
const STORAGE_COALESCE_MS = 30_000;

/** One product_image_result per logical lookup key per page session. */
export function trackProductImageResult(source: ProductImageSource, key: string, outcome: "found" | "not_found" | "error"): void {
  const once = `img:${source}:${key}`;
  if (imageSent.has(once)) return;
  imageSent.add(once);
  trackEvent({ name: "product_image_result", data: { source, outcome } }, once);
}

/** Coalesce identical storage failures so a stuck loop does not flood Umami. */
export function trackStorageFailure(operation: StorageOperation, reason: StorageFailureReason): void {
  const key = `${operation}:${reason}`;
  const now = Date.now();
  const previous = storageCoalesce.get(key) ?? 0;
  if (now - previous < STORAGE_COALESCE_MS) return;
  storageCoalesce.set(key, now);
  trackEvent({ name: "storage_operation_failed", data: { operation, reason } });
}

/** Tests only. */
export function resetAnalyticsHelpers(): void {
  imageSent.clear();
  storageCoalesce.clear();
}
