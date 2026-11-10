import { useSyncExternalStore } from "react";
import { identityKey, type ImageIdentity } from "../domain/imageIdentity";
import { factsFor, type ProductFacts } from "../domain/productFacts";
import { trackProductImageResult } from "../services/analyticsHelpers";
import { images as defaultClient, type DiscoverOutcome, type Discovery, type ImageClient, type ReferenceImage } from "../services/images/client";
import { readKv, writeKv } from "./db";
import { savePhoto, usePhotoUrl } from "./photos";

/**
 * Reference pictures found for products, kept on this device only. Pictures with unclear rights
 * ("personal") never leave the device and are never shared with other families by the server.
 */
export type ReferenceEntry = {
  identity: ImageIdentity;
  state: "found" | "personal" | "review" | "none" | "error" | "limit";
  discovery?: Discovery;
  /** undefined: the search's own pick. A number: the parent's pick. null: the parent wants no reference picture. */
  chosen?: number | null;
  /** A local copy of the shown picture, so it also works offline. */
  photoId?: string;
  photoFor?: string;
  attempts: number;
  retryAt?: number;
  updatedAt: number;
};

const HOUR = 60 * 60 * 1000;

export const REFERENCE_RULES = {
  concurrency: 2,
  noneRetryMs: 14 * 24 * HOUR,
  errorBaseMs: 2 * 60 * 1000,
  errorMaxMs: 24 * HOUR,
  limitRetryMs: 3 * HOUR,
  maxEntries: 400,
};

const KV_KEY = "references";

/** Whether a new search is due. Found pictures and parent decisions are never searched again on their own. */
export function due(entry: ReferenceEntry | undefined, now: number): boolean {
  if (!entry) return true;
  if (entry.state === "found" || entry.state === "personal" || entry.state === "review") return false;
  return (entry.retryAt ?? 0) <= now;
}

/** The next state after a search. Offline changes nothing: the queue waits for the connection to return. */
export function afterOutcome(previous: ReferenceEntry | undefined, identity: ImageIdentity, outcome: DiscoverOutcome, now: number): ReferenceEntry | undefined {
  const attempts = (previous?.attempts ?? 0) + 1;
  const base = { identity, chosen: previous?.chosen === null ? null : undefined, attempts, updatedAt: now };
  switch (outcome.status) {
    case "offline":
      return previous;
    case "ok":
      return {
        ...base,
        state: outcome.discovery.status,
        discovery: outcome.discovery.facts || !previous?.discovery?.facts ? outcome.discovery : { ...outcome.discovery, facts: previous.discovery.facts },
        attempts: 0,
        retryAt: outcome.discovery.status === "none" ? now + REFERENCE_RULES.noneRetryMs : undefined,
      };
    case "limit":
      return { ...previous, ...base, state: previous?.discovery ? previous.state : "limit", retryAt: now + REFERENCE_RULES.limitRetryMs };
    case "error":
      return {
        ...previous,
        ...base,
        state: previous?.discovery ? previous.state : "error",
        retryAt: now + Math.min(REFERENCE_RULES.errorMaxMs, REFERENCE_RULES.errorBaseMs * 4 ** (attempts - 1)),
      };
  }
}

/** The picture to show, or null. Pictures that still need review only appear once a parent picked one. */
export function shownImage(entry: ReferenceEntry | undefined): ReferenceImage | null {
  const discovery = entry?.discovery;
  if (!discovery || entry.chosen === null) return null;
  if (typeof entry.chosen === "number") return discovery.candidates[entry.chosen] ?? null;
  if (discovery.status !== "found" && discovery.status !== "personal") return null;
  return discovery.selected === undefined ? null : (discovery.candidates[discovery.selected] ?? null);
}

export function createReferenceStore(deps: {
  client: ImageClient;
  now: () => number;
  load: () => Promise<Record<string, ReferenceEntry> | undefined>;
  save: (entries: Record<string, ReferenceEntry>) => Promise<void>;
  keepCopy: (data: string) => Promise<string | null>;
  online: (listener: () => void) => void;
}) {
  let entries: Record<string, ReferenceEntry> = {};
  const listeners = new Set<() => void>();
  const queue = new Map<string, { identity: ImageIdentity; refresh: boolean }>();
  const active = new Set<string>();
  let running = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let waitingForOnline = false;
  /** Searches wait until stored answers are loaded, so nothing already known is searched again. */
  let hydrated = false;

  function emit() {
    for (const listener of listeners) listener();
  }

  function set(key: string, entry: ReferenceEntry | undefined) {
    entries = { ...entries };
    if (entry) entries[key] = entry;
    else delete entries[key];
    emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void deps.save(prune(entries)).catch(() => undefined), 400);
  }

  function prune(all: Record<string, ReferenceEntry>) {
    const keys = Object.keys(all);
    if (keys.length <= REFERENCE_RULES.maxEntries) return all;
    const kept = keys.sort((a, b) => all[b].updatedAt - all[a].updatedAt).slice(0, REFERENCE_RULES.maxEntries);
    return Object.fromEntries(kept.map((key) => [key, all[key]]));
  }

  async function run(key: string, identity: ImageIdentity, refresh: boolean) {
    const outcome = await deps.client.discover(identity, refresh);
    if (outcome.status === "offline") {
      queue.set(key, { identity, refresh });
      if (!waitingForOnline) {
        waitingForOnline = true;
        deps.online(() => {
          waitingForOnline = false;
          pump();
        });
      }
      return;
    }
    let next = afterOutcome(entries[key], identity, outcome, deps.now());
    if (next && outcome.status === "ok" && refresh) next = { ...next, chosen: undefined };
    if (next && outcome.status === "ok") {
      const shown = shownImage(next);
      const photoId = shown && outcome.selectedData ? await deps.keepCopy(outcome.selectedData) : null;
      if (shown && photoId) next = { ...next, photoId, photoFor: shown.imageUrl };
    }
    set(key, next);
    const analyticsOutcome =
      outcome.status === "ok"
        ? next && (next.state === "found" || next.state === "personal" || next.state === "review")
          ? "found"
          : "not_found"
        : "error";
    trackProductImageResult("reference", key, analyticsOutcome);
  }

  function pump() {
    if (waitingForOnline || !hydrated) return;
    while (running < REFERENCE_RULES.concurrency && queue.size) {
      const [key, job] = queue.entries().next().value as [string, { identity: ImageIdentity; refresh: boolean }];
      queue.delete(key);
      active.add(key);
      running += 1;
      void run(key, job.identity, job.refresh).finally(() => {
        running -= 1;
        active.delete(key);
        emit();
        pump();
      });
    }
  }

  let enabled = true;

  return {
    /** Off: nothing new is searched and found pictures are hidden, but kept for when it is switched on again. */
    setEnabled(next: boolean) {
      if (next === enabled) return;
      enabled = next;
      if (!enabled) queue.clear();
      emit();
    },
    enabled: () => enabled,
    async hydrate() {
      const stored = await deps.load().catch(() => undefined);
      if (stored && typeof stored === "object") entries = { ...stored, ...entries };
      hydrated = true;
      for (const [key, job] of queue) if (!job.refresh && !due(entries[key], deps.now())) queue.delete(key);
      emit();
      pump();
    },
    entries: () => entries,
    entry: (identity: ImageIdentity | null) => (identity ? entries[identityKey(identity)] : undefined),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    pending: (identity: ImageIdentity) => queue.has(identityKey(identity)) || active.has(identityKey(identity)),
    /** Queues one search per product; repeated requests for the same product are free. */
    request(identity: ImageIdentity | null, options: { refresh?: boolean } = {}) {
      if (!identity || !enabled) return;
      const key = identityKey(identity);
      if (queue.has(key) || active.has(key) || (!options.refresh && !due(entries[key], deps.now()))) return;
      queue.set(key, { identity, refresh: Boolean(options.refresh) });
      emit();
      pump();
    },
    /** A parent's pick: a candidate's index, or null for no reference picture at all. */
    choose(identity: ImageIdentity, chosen: number | null | undefined) {
      const key = identityKey(identity);
      const entry = entries[key];
      if (entry) set(key, { ...entry, chosen, updatedAt: deps.now() });
    },
    photoIds(): string[] {
      return Object.values(entries)
        .map((entry) => entry.photoId)
        .filter((id): id is string => Boolean(id));
    },
  };
}

async function keepCopy(data: string): Promise<string | null> {
  try {
    return await savePhoto(await (await fetch(data)).blob());
  } catch {
    return null;
  }
}

export const references = createReferenceStore({
  client: defaultClient,
  now: Date.now,
  load: () => readKv<Record<string, ReferenceEntry>>(KV_KEY),
  save: (entries) => writeKv(KV_KEY, entries),
  keepCopy,
  online: (listener) => window.addEventListener("online", listener, { once: true }),
});

export function useReference(identity: ImageIdentity | null): ReferenceEntry | undefined {
  return useSyncExternalStore(references.subscribe, () => references.entry(identity));
}

/** What the product page said about a branded pack; standard products have none. */
export function useFacts(item: Parameters<typeof factsFor>[0]): ProductFacts | undefined {
  return useSyncExternalStore(references.subscribe, () => factsFor(item, references.entry));
}

export function useSearching(identity: ImageIdentity | null): boolean {
  return useSyncExternalStore(references.subscribe, () => Boolean(identity && references.pending(identity)));
}

/** The URL to show for a product's reference picture: the local copy when there is one, else the source. */
export function useReferenceUrl(identity: ImageIdentity | null): { url: string; image: ReferenceImage } | null {
  const entry = useSyncExternalStore(references.subscribe, () => (references.enabled() ? references.entry(identity) : undefined));
  const image = shownImage(entry);
  const local = usePhotoUrl(image && entry?.photoFor === image.imageUrl ? entry.photoId : undefined);
  if (!image) return null;
  return { url: local ?? image.imageUrl, image };
}
