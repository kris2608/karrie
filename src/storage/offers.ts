import { useMemo, useSyncExternalStore } from "react";
import { isCurrent, offerQuery, shownAs, type OfferAnswer, type OfferQuery, type Shown } from "../domain/offers";
import type { RetailerId } from "../domain/retailers";
import type { AdventureItem } from "../domain/types";
import { offersClient, type OfferClient, type OfferOutcome } from "../services/offers/client";
import { readKv, writeKv } from "./db";

/** The last answer for one product at one supermarket, kept on this device so lists open with it at once. */
export type OfferEntry = {
  query: OfferQuery;
  answer?: OfferAnswer;
  /** When the answer was fetched; answers older than a day are never shown. */
  checkedAt?: number;
  attempts: number;
  retryAt?: number;
  updatedAt: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const OFFER_STORE_RULES = {
  concurrency: 2,
  debounceMs: 300,
  staleMs: 6 * HOUR,
  maxAgeMs: 24 * HOUR,
  errorBaseMs: 2 * MINUTE,
  errorMaxMs: 32 * MINUTE,
  limitRetryMs: 30 * MINUTE,
  maxEntries: 600,
};

const KV_KEY = "offers";

/** The stored answer if it may still be shown: at most a day old and, for a promotion, still running. */
export function usable(entry: OfferEntry | undefined, now: number): OfferAnswer | undefined {
  const answer = entry?.answer;
  if (!answer || entry.checkedAt === undefined || now - entry.checkedAt >= OFFER_STORE_RULES.maxAgeMs) return undefined;
  if (answer.offer && !isCurrent(answer.offer, now)) return undefined;
  return answer;
}

/** Whether to ask again: nothing usable, or the answer is older than six hours; never while backing off. */
export function due(entry: OfferEntry | undefined, now: number): boolean {
  if (!entry) return true;
  if ((entry.retryAt ?? 0) > now) return false;
  if (!usable(entry, now)) return true;
  return now - (entry.checkedAt ?? 0) >= OFFER_STORE_RULES.staleMs;
}

/** The next entry after a lookup. A failure keeps the previous answer while it is still usable. */
export function afterOutcome(previous: OfferEntry | undefined, query: OfferQuery, outcome: Exclude<OfferOutcome, { status: "offline" }>, now: number): OfferEntry {
  const attempts = (previous?.attempts ?? 0) + 1;
  if (outcome.status === "ok" && outcome.answer.matchType !== "unknown") {
    return { query, answer: outcome.answer, checkedAt: now, attempts: 0, updatedAt: now };
  }
  const wait =
    outcome.status === "limit"
      ? OFFER_STORE_RULES.limitRetryMs
      : Math.min(OFFER_STORE_RULES.errorMaxMs, OFFER_STORE_RULES.errorBaseMs * 4 ** (attempts - 1));
  return { ...previous, query, attempts, retryAt: now + wait, updatedAt: now };
}

export function createOfferStore(deps: {
  client: Pick<OfferClient, "find">;
  now: () => number;
  load: () => Promise<Record<string, OfferEntry> | undefined>;
  save: (entries: Record<string, OfferEntry>) => Promise<void>;
  online: (listener: () => void) => void;
  schedule?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
}) {
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms));
  let entries: Record<string, OfferEntry> = {};
  const listeners = new Set<() => void>();
  const queue = new Map<string, OfferQuery>();
  const active = new Set<string>();
  let running = 0;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let waitingForOnline = false;
  let hydrated = false;

  function emit() {
    for (const listener of listeners) listener();
  }

  function prune(all: Record<string, OfferEntry>) {
    const now = deps.now();
    const fresh = Object.entries(all).filter(([, entry]) => now - entry.updatedAt < OFFER_STORE_RULES.maxAgeMs * 7);
    fresh.sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
    return Object.fromEntries(fresh.slice(0, OFFER_STORE_RULES.maxEntries));
  }

  function set(key: string, entry: OfferEntry) {
    entries = { ...entries, [key]: entry };
    emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void deps.save(prune(entries)).catch(() => undefined), 400);
  }

  async function run(query: OfferQuery) {
    let outcome: OfferOutcome;
    try {
      outcome = await deps.client.find(query.product, query.retailer);
    } catch {
      outcome = { status: "error", code: "client" };
    }
    if (outcome.status === "offline") {
      queue.set(query.key, query);
      if (!waitingForOnline) {
        waitingForOnline = true;
        deps.online(() => {
          waitingForOnline = false;
          pump();
        });
      }
      return;
    }
    set(query.key, afterOutcome(entries[query.key], query, outcome, deps.now()));
  }

  function pump() {
    if (waitingForOnline || !hydrated) return;
    while (running < OFFER_STORE_RULES.concurrency && queue.size) {
      const [key, query] = queue.entries().next().value as [string, OfferQuery];
      queue.delete(key);
      active.add(key);
      running += 1;
      void run(query).finally(() => {
        running -= 1;
        active.delete(key);
        emit();
        pump();
      });
    }
  }

  /** New requests wait a moment, so a burst of additions or a quick supermarket switch costs nothing extra. */
  function later() {
    clearTimeout(debounce);
    debounce = schedule(() => pump(), OFFER_STORE_RULES.debounceMs);
  }

  return {
    async hydrate() {
      const stored = await deps.load().catch(() => undefined);
      if (stored && typeof stored === "object") entries = { ...prune(stored), ...entries };
      hydrated = true;
      for (const [key] of queue) if (!due(entries[key], deps.now())) queue.delete(key);
      emit();
      later();
    },
    entries: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    pending: (key: string) => queue.has(key) || active.has(key),
    /**
     * The products the current list wants answers for. Waiting lookups for anything else (a removed
     * product, another supermarket) are dropped; the same product is only ever asked once at a time.
     */
    sync(queries: OfferQuery[]) {
      const wanted = new Map(queries.map((query) => [query.key, query]));
      let changed = false;
      for (const key of [...queue.keys()]) {
        if (!wanted.has(key)) {
          queue.delete(key);
          changed = true;
        }
      }
      for (const [key, query] of wanted) {
        if (queue.has(key) || active.has(key) || !due(entries[key], deps.now())) continue;
        queue.set(key, query);
        changed = true;
      }
      if (!changed) return;
      emit();
      later();
    },
  };
}

export type OfferStore = ReturnType<typeof createOfferStore>;

export const offers = createOfferStore({
  client: offersClient,
  now: Date.now,
  load: () => readKv<Record<string, OfferEntry>>(KV_KEY),
  save: (entries) => writeKv(KV_KEY, entries),
  online: (listener) => window.addEventListener("online", listener, { once: true }),
});

/** The questions for a list's open items at its supermarket; none without a supermarket. */
export function offerQueries(items: readonly AdventureItem[], retailer: RetailerId | undefined): OfferQuery[] {
  if (!retailer) return [];
  const seen = new Set<string>();
  return items.flatMap((item) => {
    if (item.status === "found") return [];
    const query = offerQuery(item, retailer);
    if (!query || seen.has(query.key)) return [];
    seen.add(query.key);
    return [query];
  });
}

export type OfferView = { answer: OfferAnswer; shown: Shown };

/** What to show for each item id; items without a running, matching promotion are absent. */
export function offerViews(entries: Record<string, OfferEntry>, items: readonly AdventureItem[], retailer: RetailerId | undefined, now: number) {
  const views = new Map<string, OfferView>();
  if (!retailer) return views;
  for (const item of items) {
    const query = offerQuery(item, retailer);
    const answer = query ? usable(entries[query.key], now) : undefined;
    const shown = shownAs(answer, now);
    if (answer && shown) views.set(item.id, { answer, shown });
  }
  return views;
}

/** Offers for a list, with the count of reliable ones for the summary line. */
export function useOfferViews(items: readonly AdventureItem[], retailer: RetailerId | undefined) {
  const entries = useSyncExternalStore(offers.subscribe, offers.entries);
  return useMemo(() => {
    const views = offerViews(entries, items, retailer, Date.now());
    let deals = 0;
    for (const view of views.values()) if (view.shown === "deal") deals += 1;
    return { views, deals };
  }, [entries, items, retailer]);
}
