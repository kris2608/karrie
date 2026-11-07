import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Offer, OfferAnswer, OfferQuery } from "../domain/offers";
import type { AdventureItem } from "../domain/types";
import type { OfferOutcome } from "../services/offers/client";
import { afterOutcome, createOfferStore, due, OFFER_STORE_RULES, offerViews, usable, type OfferEntry } from "./offers";

const NOW = Date.parse("2026-11-07T10:00:00Z");
const HOUR = 60 * 60_000;
const MINUTE = 60_000;

const offer = (overrides: Partial<Offer> = {}): Offer => ({
  retailer: "jumbo",
  sourceProductId: "jumbo_test_bananen",
  productName: "Jumbo Bananen",
  promotionStatus: "active",
  promotionalPrice: 1.49,
  originalPrice: 1.99,
  validUntil: "2026-11-10",
  matchType: "likely",
  matchConfidence: "high",
  fetchedAt: new Date(NOW).toISOString(),
  ...overrides,
});
const answer = (overrides: Partial<Offer> = {}): OfferAnswer => ({ matchType: "likely", offer: offer(overrides), fetchedAt: new Date(NOW).toISOString() });
const ok = (value: OfferAnswer = answer()): OfferOutcome => ({ status: "ok", answer: value });

const query = (name: string, retailer: OfferQuery["retailer"] = "jumbo"): OfferQuery => ({
  key: `${retailer}|g|${name.toLowerCase()}`,
  retailer,
  product: { name, category: "produce", generic: true },
});
const entry = (overrides: Partial<OfferEntry> = {}): OfferEntry => ({ query: query("Banaan"), answer: answer(), checkedAt: NOW, attempts: 0, updatedAt: NOW, ...overrides });

describe("what may be shown", () => {
  it("10. never shows an answer older than a day or a promotion that has ended", () => {
    expect(usable(entry(), NOW)).toBeDefined();
    expect(usable(entry(), NOW + 25 * HOUR)).toBeUndefined();
    expect(usable(entry({ answer: answer({ validUntil: "2026-11-06" }) }), NOW)).toBeUndefined();
    expect(usable(entry({ answer: answer({ promotionStatus: "expired" }) }), NOW)).toBeUndefined();
  });

  it("asks again after six hours, but not while backing off", () => {
    expect(due(entry(), NOW + 5 * HOUR)).toBe(false);
    expect(due(entry(), NOW + 7 * HOUR)).toBe(true);
    expect(due(entry({ retryAt: NOW + 8 * HOUR }), NOW + 7 * HOUR)).toBe(false);
    expect(due(undefined, NOW)).toBe(true);
  });

  it("12. backs off 2, 8 and 32 minutes after errors and keeps the last answer", () => {
    let current: OfferEntry | undefined = entry();
    const waits: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      current = afterOutcome(current, query("Banaan"), { status: "error", code: "unavailable" }, NOW);
      waits.push((current.retryAt! - NOW) / MINUTE);
    }
    expect(waits).toEqual([2, 8, 32, 32]);
    expect(current?.answer).toEqual(answer());
    expect(afterOutcome(undefined, query("Banaan"), { status: "limit", code: "rate-limited" }, NOW).retryAt).toBe(NOW + OFFER_STORE_RULES.limitRetryMs);
  });

  it("13. a doubtful match is only a possible offer; none and unknown show nothing", () => {
    const item = { id: "1", productId: "banaan", name: "Banaan", icon: "banaan", category: "produce", quantity: 1, status: "pending" } as AdventureItem;
    const entries = (value: OfferAnswer) => ({ "jumbo|g|banaan": entry({ answer: value }) });
    expect(offerViews(entries(answer()), [item], "jumbo", NOW).get("1")?.shown).toBe("deal");
    expect(offerViews(entries(answer({ matchConfidence: "medium" })), [item], "jumbo", NOW).get("1")?.shown).toBe("maybe");
    expect(offerViews(entries({ matchType: "none", fetchedAt: "" }), [item], "jumbo", NOW).size).toBe(0);
    expect(offerViews(entries(answer()), [item], undefined, NOW).size).toBe(0);
  });
});

describe("offer store", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  function setup(options: { stored?: Record<string, OfferEntry>; find?: (name: string) => Promise<OfferOutcome> } = {}) {
    const asked: string[] = [];
    const saved: Record<string, OfferEntry>[] = [];
    let onlineAgain: (() => void) | undefined;
    const store = createOfferStore({
      client: {
        find: async (product, retailer) => {
          asked.push(`${retailer}|${product.name}`);
          return options.find ? options.find(product.name) : ok();
        },
      },
      now: () => Date.now(),
      load: async () => options.stored,
      save: async (entries) => void saved.push(entries),
      online: (listener) => (onlineAgain = listener),
    });
    return { store, asked, saved, online: () => onlineAgain?.() };
  }

  it("5. a burst of additions waits for the debounce and asks once per product, two at a time", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { store, asked } = setup({ find: async () => (await gate, ok()) });
    await store.hydrate();
    store.sync([query("Banaan")]);
    store.sync([query("Banaan"), query("Melk")]);
    store.sync([query("Banaan"), query("Melk"), query("Brood"), query("Banaan")]);
    expect(asked).toEqual([]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    expect(asked).toEqual(["jumbo|Banaan", "jumbo|Melk"]);
    store.sync([query("Banaan"), query("Melk"), query("Brood")]);
    release!();
    await vi.advanceTimersByTimeAsync(10);
    expect(asked).toEqual(["jumbo|Banaan", "jumbo|Melk", "jumbo|Brood"]);
  });

  it("8. a quick supermarket switch drops the questions for the old one", async () => {
    const { store, asked } = setup();
    await store.hydrate();
    store.sync([query("Banaan", "jumbo")]);
    store.sync([query("Banaan", "albert_heijn")]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    expect(asked).toEqual(["albert_heijn|Banaan"]);
  });

  it("7. opens with stored answers at once and refreshes only stale ones", async () => {
    const stale = entry({ query: query("Melk"), checkedAt: NOW - 7 * HOUR, updatedAt: NOW - 7 * HOUR });
    const { store, asked, saved } = setup({ stored: { "jumbo|g|banaan": entry(), "jumbo|g|melk": stale } });
    await store.hydrate();
    expect(usable(store.entries()["jumbo|g|banaan"], NOW)).toBeDefined();
    expect(usable(store.entries()["jumbo|g|melk"], NOW)).toBeDefined();
    store.sync([query("Banaan"), query("Melk")]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs + 500);
    expect(asked).toEqual(["jumbo|Melk"]);
    expect(store.entries()["jumbo|g|melk"].checkedAt).toBe(NOW + OFFER_STORE_RULES.debounceMs);
    expect(Object.keys(saved.at(-1) ?? {})).toEqual(expect.arrayContaining(["jumbo|g|banaan", "jumbo|g|melk"]));
  });

  it("waits for stored answers before asking anything", async () => {
    const { store, asked } = setup({ stored: { "jumbo|g|banaan": entry() } });
    store.sync([query("Banaan")]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    expect(asked).toEqual([]);
    await store.hydrate();
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    expect(asked).toEqual([]);
  });

  it("12. offline keeps the cached answer and asks again when the connection returns", async () => {
    let offline = true;
    const stale = entry({ checkedAt: NOW - 7 * HOUR });
    const { store, asked, online } = setup({ stored: { "jumbo|g|banaan": stale }, find: async () => (offline ? { status: "offline" } : ok()) });
    await store.hydrate();
    store.sync([query("Banaan")]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    expect(asked).toHaveLength(1);
    expect(store.entries()["jumbo|g|banaan"]).toEqual(stale);
    expect(store.pending("jumbo|g|banaan")).toBe(true);
    offline = false;
    online();
    await vi.advanceTimersByTimeAsync(10);
    expect(asked).toHaveLength(2);
    expect(store.entries()["jumbo|g|banaan"].checkedAt).toBeGreaterThan(NOW);
  });

  it("12. an error does not retry before the backoff ends", async () => {
    const { store, asked } = setup({ find: async () => ({ status: "error", code: "unavailable" }) });
    await store.hydrate();
    store.sync([query("Banaan")]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    store.sync([query("Banaan")]);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    store.sync([query("Banaan")]);
    await vi.advanceTimersByTimeAsync(OFFER_STORE_RULES.debounceMs);
    expect(asked).toHaveLength(2);
  });
});
