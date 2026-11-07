import { useSyncExternalStore } from "react";
import { storeImageClient, type StoreImage, type StoreImageClient, type StoreImageOutcome } from "../services/images/storeImage";
import { readKv, writeKv } from "./db";

/**
 * Retailer photos per scanned barcode, found through PrijsProfeet. Only the link is kept, never the photo itself:
 * it belongs to the retailer. Keyed by barcode, so every list and "Mijn producten" with that code share it.
 */
export type StoreImageEntry = {
  state: "found" | "none" | "error" | "limit";
  image?: StoreImage;
  attempts: number;
  retryAt?: number;
  updatedAt: number;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const STORE_IMAGE_RULES = {
  concurrency: 2,
  foundRecheckMs: 30 * DAY,
  noneRetryMs: 7 * DAY,
  errorBaseMs: 2 * 60 * 1000,
  errorMaxMs: DAY,
  limitRetryMs: 3 * HOUR,
  maxEntries: 600,
};

const KV_KEY = "storeImages";

export function due(entry: StoreImageEntry | undefined, now: number): boolean {
  return !entry || (entry.retryAt ?? 0) <= now;
}

/** The next state after a lookup. A photo already found stays until a recheck finds another one. Offline changes nothing. */
export function afterOutcome(previous: StoreImageEntry | undefined, outcome: StoreImageOutcome, now: number): StoreImageEntry | undefined {
  const attempts = (previous?.attempts ?? 0) + 1;
  const kept = previous?.image ? { state: "found" as const, image: previous.image } : undefined;
  switch (outcome.status) {
    case "offline":
      return previous;
    case "ok":
      if (outcome.image) return { state: "found", image: outcome.image, attempts: 0, retryAt: now + STORE_IMAGE_RULES.foundRecheckMs, updatedAt: now };
      return kept
        ? { ...kept, attempts: 0, retryAt: now + STORE_IMAGE_RULES.foundRecheckMs, updatedAt: now }
        : { state: "none", attempts: 0, retryAt: now + STORE_IMAGE_RULES.noneRetryMs, updatedAt: now };
    case "limit":
      return { state: "limit", ...kept, attempts, retryAt: now + STORE_IMAGE_RULES.limitRetryMs, updatedAt: now };
    case "error":
      return { state: "error", ...kept, attempts, retryAt: now + Math.min(STORE_IMAGE_RULES.errorMaxMs, STORE_IMAGE_RULES.errorBaseMs * 4 ** (attempts - 1)), updatedAt: now };
  }
}

/** found: a photo to show. none: nothing to show, other sources may be tried. pending: not answered yet. */
export type StoreImageStatus = "found" | "none" | "pending";

export function createStoreImageStore(deps: {
  client: Pick<StoreImageClient, "find">;
  now: () => number;
  load: () => Promise<Record<string, StoreImageEntry> | undefined>;
  save: (entries: Record<string, StoreImageEntry>) => Promise<void>;
  online: (listener: () => void) => void;
}) {
  let entries: Record<string, StoreImageEntry> = {};
  const listeners = new Set<() => void>();
  const queue = new Set<string>();
  const active = new Set<string>();
  let running = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let waitingForOnline = false;
  let hydrated = false;
  let version = 0;

  function emit() {
    version += 1;
    for (const listener of listeners) listener();
  }

  function prune(all: Record<string, StoreImageEntry>) {
    const keys = Object.keys(all);
    if (keys.length <= STORE_IMAGE_RULES.maxEntries) return all;
    const kept = keys.sort((a, b) => all[b].updatedAt - all[a].updatedAt).slice(0, STORE_IMAGE_RULES.maxEntries);
    return Object.fromEntries(kept.map((key) => [key, all[key]]));
  }

  function set(ean: string, entry: StoreImageEntry | undefined) {
    entries = { ...entries };
    if (entry) entries[ean] = entry;
    else delete entries[ean];
    emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void deps.save(prune(entries)).catch(() => undefined), 400);
  }

  async function run(ean: string) {
    const outcome = await deps.client.find(ean).catch((): StoreImageOutcome => ({ status: "error", code: "unexpected" }));
    if (outcome.status === "offline") {
      queue.add(ean);
      if (!waitingForOnline) {
        waitingForOnline = true;
        deps.online(() => {
          waitingForOnline = false;
          pump();
        });
      }
      return;
    }
    set(ean, afterOutcome(entries[ean], outcome, deps.now()));
  }

  function pump() {
    if (waitingForOnline || !hydrated) return;
    while (running < STORE_IMAGE_RULES.concurrency && queue.size) {
      const ean = queue.values().next().value as string;
      queue.delete(ean);
      active.add(ean);
      running += 1;
      void run(ean).finally(() => {
        running -= 1;
        active.delete(ean);
        emit();
        pump();
      });
    }
  }

  function image(ean: string | undefined): StoreImage | null {
    return (ean && entries[ean]?.image) || null;
  }

  return {
    async hydrate() {
      const stored = await deps.load().catch(() => undefined);
      if (stored && typeof stored === "object") entries = { ...stored, ...entries };
      hydrated = true;
      for (const ean of queue) if (!due(entries[ean], deps.now())) queue.delete(ean);
      emit();
      pump();
    },
    entry: (ean: string | undefined) => (ean ? entries[ean] : undefined),
    /** Changes on every update, for effects that depend on several barcodes at once. */
    version: () => version,
    image,
    /** What the picture choice can rely on; an answer kept from before counts even while a recheck runs. */
    status(ean: string | undefined): StoreImageStatus {
      if (!ean) return "none";
      if (image(ean)) return "found";
      const entry = entries[ean];
      if (queue.has(ean) || active.has(ean) || !hydrated) return "pending";
      return entry ? "none" : "pending";
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Queues one lookup per barcode; asking again for the same code is free. */
    request(ean: string | undefined) {
      if (!ean || queue.has(ean) || active.has(ean) || (hydrated && !due(entries[ean], deps.now()))) return;
      queue.add(ean);
      emit();
      pump();
    },
  };
}

export type StoreImageStore = ReturnType<typeof createStoreImageStore>;

export const storeImages = createStoreImageStore({
  client: storeImageClient,
  now: Date.now,
  load: () => readKv<Record<string, StoreImageEntry>>(KV_KEY),
  save: (entries) => writeKv(KV_KEY, entries),
  online: (listener) => window.addEventListener("online", listener, { once: true }),
});

export function useStoreImage(ean: string | undefined): StoreImage | null {
  return useSyncExternalStore(storeImages.subscribe, () => storeImages.image(ean));
}

export function useStoreImagesVersion(): number {
  return useSyncExternalStore(storeImages.subscribe, storeImages.version);
}

export function useStoreImageStatus(ean: string | undefined): StoreImageStatus {
  return useSyncExternalStore(storeImages.subscribe, () => storeImages.status(ean));
}
