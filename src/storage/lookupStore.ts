/**
 * Background lookups kept per key on this device: one request per key, a few at a time, waiting while offline, with
 * a retry schedule per answer. Shared by retailer photos per barcode and product photos per typed name.
 */
export type LookupOutcome<V> =
  | { status: "ok"; image: V | null }
  | { status: "offline" }
  | { status: "limit"; code: string }
  | { status: "error"; code: string };

/** `image` is the last answer; for a barcode only a photo, for a name also an answer without a photo. */
export type LookupEntry<V> = {
  state: "found" | "none" | "error" | "limit";
  image?: V;
  attempts: number;
  retryAt?: number;
  updatedAt: number;
};

export type LookupRules = {
  concurrency: number;
  foundRecheckMs: number;
  noneRetryMs: number;
  errorBaseMs: number;
  errorMaxMs: number;
  limitRetryMs: number;
  maxEntries: number;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const LOOKUP_RULES: LookupRules = {
  concurrency: 2,
  foundRecheckMs: 30 * DAY,
  noneRetryMs: 7 * DAY,
  errorBaseMs: 2 * 60 * 1000,
  errorMaxMs: DAY,
  limitRetryMs: 3 * HOUR,
  maxEntries: 600,
};

export function due(entry: LookupEntry<unknown> | undefined, now: number): boolean {
  return !entry || (entry.retryAt ?? 0) <= now;
}

const anything = (value: unknown) => Boolean(value);

/** The next state after a lookup. A photo already found stays until a recheck finds another one. Offline changes nothing. */
export function nextEntry<V>(previous: LookupEntry<V> | undefined, outcome: LookupOutcome<V>, now: number, rules: LookupRules = LOOKUP_RULES, found: (value: V) => boolean = anything): LookupEntry<V> | undefined {
  const attempts = (previous?.attempts ?? 0) + 1;
  const kept = previous?.image !== undefined && found(previous.image) ? { state: "found" as const, image: previous.image } : undefined;
  const last = previous?.image !== undefined ? { image: previous.image } : {};
  switch (outcome.status) {
    case "offline":
      return previous;
    case "ok":
      if (outcome.image !== null && found(outcome.image)) return { state: "found", image: outcome.image, attempts: 0, retryAt: now + rules.foundRecheckMs, updatedAt: now };
      if (kept) return { ...kept, attempts: 0, retryAt: now + rules.foundRecheckMs, updatedAt: now };
      return { state: "none", ...(outcome.image !== null && { image: outcome.image }), attempts: 0, retryAt: now + rules.noneRetryMs, updatedAt: now };
    case "limit":
      return { ...last, state: "limit", ...kept, attempts, retryAt: now + rules.limitRetryMs, updatedAt: now };
    case "error":
      return { ...last, state: "error", ...kept, attempts, retryAt: now + Math.min(rules.errorMaxMs, rules.errorBaseMs * 4 ** (attempts - 1)), updatedAt: now };
  }
}

/** found: a photo to show. none: nothing to show, other sources may be tried. pending: not answered yet. */
export type LookupStatus = "found" | "none" | "pending";

export type LookupStoreDeps<V> = {
  client: { find: (key: string) => Promise<LookupOutcome<V>> };
  now: () => number;
  load: () => Promise<Record<string, LookupEntry<V>> | undefined>;
  save: (entries: Record<string, LookupEntry<V>>) => Promise<void>;
  online: (listener: () => void) => void;
  rules?: LookupRules;
  /** Whether an answer holds a photo; for a barcode every answer that is not null does. */
  found?: (value: V) => boolean;
};

export function createLookupStore<V>(deps: LookupStoreDeps<V>) {
  const rules = deps.rules ?? LOOKUP_RULES;
  const found = deps.found ?? anything;
  let entries: Record<string, LookupEntry<V>> = {};
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

  function prune(all: Record<string, LookupEntry<V>>) {
    const keys = Object.keys(all);
    if (keys.length <= rules.maxEntries) return all;
    const kept = keys.sort((a, b) => all[b].updatedAt - all[a].updatedAt).slice(0, rules.maxEntries);
    return Object.fromEntries(kept.map((key) => [key, all[key]]));
  }

  function set(key: string, entry: LookupEntry<V> | undefined) {
    entries = { ...entries };
    if (entry) entries[key] = entry;
    else delete entries[key];
    emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void deps.save(prune(entries)).catch(() => undefined), 400);
  }

  async function run(key: string) {
    const outcome = await deps.client.find(key).catch((): LookupOutcome<V> => ({ status: "error", code: "unexpected" }));
    if (outcome.status === "offline") {
      queue.add(key);
      if (!waitingForOnline) {
        waitingForOnline = true;
        deps.online(() => {
          waitingForOnline = false;
          pump();
        });
      }
      return;
    }
    set(key, nextEntry(entries[key], outcome, deps.now(), rules, found));
  }

  function pump() {
    if (waitingForOnline || !hydrated) return;
    while (running < rules.concurrency && queue.size) {
      const key = queue.values().next().value as string;
      queue.delete(key);
      active.add(key);
      running += 1;
      void run(key).finally(() => {
        running -= 1;
        active.delete(key);
        emit();
        pump();
      });
    }
  }

  const value = (key: string | undefined): V | null => (key && entries[key]?.image !== undefined ? entries[key].image! : null);
  function image(key: string | undefined): V | null {
    const answer = value(key);
    return answer !== null && found(answer) ? answer : null;
  }

  return {
    async hydrate() {
      const stored = await deps.load().catch(() => undefined);
      if (stored && typeof stored === "object") entries = { ...stored, ...entries };
      hydrated = true;
      for (const key of queue) if (!due(entries[key], deps.now())) queue.delete(key);
      emit();
      pump();
    },
    entry: (key: string | undefined) => (key ? entries[key] : undefined),
    /** Changes on every update, for effects that depend on several keys at once. */
    version: () => version,
    /** The answer only when it holds a photo. */
    image,
    /** The last answer, with or without a photo. */
    value,
    /** What the picture choice can rely on; an answer kept from before counts even while a recheck runs. */
    status(key: string | undefined): LookupStatus {
      if (!key) return "none";
      if (image(key)) return "found";
      if (queue.has(key) || active.has(key) || !hydrated) return "pending";
      return entries[key] ? "none" : "pending";
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /**
     * Queues one lookup per key; asking again for the same key is free.
     * `refresh: true` bypasses the found/none retry window (pull-to-refresh).
     */
    request(key: string | undefined, options?: { refresh?: boolean }) {
      if (!key || queue.has(key) || active.has(key)) return;
      if (hydrated && !options?.refresh && !due(entries[key], deps.now())) return;
      queue.add(key);
      emit();
      pump();
    },
    /** Seeds a found photo immediately (e.g. barcode answer.storeImage) so the UI updates before a recheck. */
    accept(key: string | undefined, image: V) {
      if (!key || !found(image)) return;
      set(key, { state: "found", image, attempts: 0, retryAt: deps.now() + rules.foundRecheckMs, updatedAt: deps.now() });
    },
  };
}

export type LookupStore<V> = ReturnType<typeof createLookupStore<V>>;
