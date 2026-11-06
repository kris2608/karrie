import { describe, expect, it } from "vitest";
import { pickArt } from "../components/ItemArt";
import { identityKey, identityOf, type ImageIdentity } from "../domain/imageIdentity";
import { wantedReferences } from "../domain/referenceTargets";
import type { Adventure, AdventureItem } from "../domain/types";
import type { DiscoverOutcome, Discovery, ImageClient, ReferenceImage } from "../services/images/client";
import { afterOutcome, createReferenceStore, due, REFERENCE_RULES, shownImage, type ReferenceEntry } from "./references";

const BANAAN: ImageIdentity = { name: "Banaan", generic: true };
const image = (overrides: Partial<ReferenceImage> = {}): ReferenceImage => ({
  imageUrl: "https://images.unsplash.com/banana",
  sourcePageUrl: "https://unsplash.com/photos/banana",
  provider: "openai-web",
  matchingStatus: "same-type",
  usageRightsStatus: "permitted",
  sourceName: "Unsplash",
  cors: true,
  ...overrides,
});
const discovery = (status: Discovery["status"], candidates = [image()]): Discovery => ({
  status,
  selected: status === "found" || status === "personal" ? 0 : undefined,
  candidates: status === "none" ? [] : candidates,
  provider: "openai-web",
  searchedAt: 1,
});
const ok = (status: Discovery["status"], selectedData?: string): DiscoverOutcome => ({ status: "ok", discovery: discovery(status), selectedData });

describe("identity", () => {
  it("looks up recognised branded packs exactly and everything else as a product type", () => {
    expect(identityOf({ name: "AH Terra Pindakaas", brand: "AH Terra", packageSize: "350 g", source: "vision", recognition: { specific: true, variant: "100% naturel", confidence: "high" } })).toEqual({
      name: "AH Terra Pindakaas",
      brand: "AH Terra",
      variant: "100% naturel",
      size: "350 g",
      generic: false,
    });
    expect(identityOf({ name: "Pindakaas", brand: "AH Terra", source: "vision", recognition: { specific: false, confidence: "medium" } })).toEqual({ name: "Pindakaas", generic: true });
    expect(identityOf({ name: "Banaan" })).toEqual(BANAAN);
    expect(identityOf({ name: "  " })).toBeNull();
    expect(identityOf({ name: "x".repeat(80) })?.name).toHaveLength(60);
  });

  it("asks for list items and mission targets, not for products pinned to a photo or drawing", () => {
    const item = (overrides: Partial<AdventureItem>): AdventureItem => ({ id: "1", productId: "p", name: "Banaan", icon: "banaan", category: "produce", quantity: 1, status: "pending", ...overrides });
    const adventure = {
      phase: "draft",
      items: [
        item({}),
        item({ id: "2", name: "Melk", imageChoice: "photo" }),
        item({ id: "3", name: "Brood", imageChoice: "drawing" }),
        item({ id: "4", name: "Pindakaas", alternative: { status: "possible", evidence: "label", criteria: [], targetType: "pindakaas", source: "photo", assessedAt: 1 } }),
      ],
    } as unknown as Adventure;
    expect(wantedReferences(adventure).map(identityKey)).toEqual(["g|banaan", "g|pindakaas"]);
    expect(wantedReferences({ ...adventure, phase: "done" })).toEqual([]);
  });

  it("shows the parent's choice first, then the reference picture, then the photo", () => {
    expect(pickArt(undefined, "ref", "photo")).toBe("ref");
    expect(pickArt(undefined, null, "photo")).toBe("photo");
    expect(pickArt("photo", "ref", "photo")).toBe("photo");
    expect(pickArt("drawing", "ref", "photo")).toBeNull();
    expect(pickArt("reference", null, "photo")).toBe("photo");
  });
});

describe("retry policy", () => {
  it("never searches found pictures or parent decisions again, and retries the rest later", () => {
    const now = 1_000_000;
    const found = afterOutcome(undefined, BANAAN, ok("found"), now)!;
    expect(due(found, now + 1e12)).toBe(false);
    const none = afterOutcome(undefined, BANAAN, ok("none"), now)!;
    expect(due(none, now + REFERENCE_RULES.noneRetryMs - 1)).toBe(false);
    expect(due(none, now + REFERENCE_RULES.noneRetryMs)).toBe(true);
    const first = afterOutcome(undefined, BANAAN, { status: "error", code: "unreachable" }, now)!;
    const second = afterOutcome(first, BANAAN, { status: "error", code: "unreachable" }, now)!;
    expect(second.retryAt! - now).toBe(4 * (first.retryAt! - now));
    const limited = afterOutcome(undefined, BANAAN, { status: "limit", code: "budget" }, now)!;
    expect(limited).toMatchObject({ state: "limit", retryAt: now + REFERENCE_RULES.limitRetryMs });
    expect(afterOutcome(found, BANAAN, { status: "offline" }, now)).toBe(found);
    expect(afterOutcome(found, BANAAN, { status: "error", code: "x" }, now)?.discovery).toEqual(found.discovery);
  });

  it("shows found and personal pictures, review pictures only once a parent picked one", () => {
    const entry = (state: Discovery["status"], chosen?: number | null): ReferenceEntry => ({ identity: BANAAN, state, discovery: discovery(state), chosen, attempts: 0, updatedAt: 1 });
    expect(shownImage(entry("found"))?.imageUrl).toBe("https://images.unsplash.com/banana");
    expect(shownImage(entry("personal"))).not.toBeNull();
    expect(shownImage(entry("review"))).toBeNull();
    expect(shownImage(entry("review", 0))).not.toBeNull();
    expect(shownImage(entry("found", null))).toBeNull();
  });
});

describe("reference queue", () => {
  async function setup(answer: (identity: ImageIdentity) => DiscoverOutcome | Promise<DiscoverOutcome>, stored?: Record<string, ReferenceEntry>) {
    const calls: string[] = [];
    let running = 0;
    let peak = 0;
    const copies: string[] = [];
    const onlineListeners: (() => void)[] = [];
    const client = {
      discover: async (identity: ImageIdentity) => {
        calls.push(identity.name);
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return answer(identity);
      },
    } as ImageClient;
    const saved: Record<string, ReferenceEntry>[] = [];
    const store = createReferenceStore({
      client,
      now: () => 1000,
      load: async () => stored,
      save: async (entries) => void saved.push(entries),
      keepCopy: async (data) => (copies.push(data), "photo-1"),
      online: (listener) => onlineListeners.push(listener),
    });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
    const hydrate = () => store.hydrate();
    return { store, calls, copies, onlineListeners, settle, hydrate, peak: () => peak };
  }

  async function ready(answer: (identity: ImageIdentity) => DiscoverOutcome | Promise<DiscoverOutcome>) {
    const context = await setup(answer);
    await context.hydrate();
    return context;
  }

  it("waits for stored answers before searching, and never searches a known product again", async () => {
    const known: ReferenceEntry = { identity: BANAAN, state: "found", discovery: discovery("found"), attempts: 0, updatedAt: 1 };
    const { store, calls, settle, hydrate } = await setup(() => ok("found"), { [identityKey(BANAAN)]: known });
    store.request(BANAAN);
    store.request({ name: "Appel", generic: true });
    await settle();
    expect(calls).toEqual([]);
    await hydrate();
    await settle();
    expect(calls).toEqual(["Appel"]);
  });

  it("searches each product once, at most two at a time, and keeps a local copy of the picture", async () => {
    const { store, calls, copies, settle, peak } = await ready(() => ok("found", "data:image/jpeg;base64,AAAA"));
    for (const name of ["Banaan", "Appel", "Peer", "Banaan", " banaan "]) store.request({ name, generic: true });
    await settle();
    expect(calls).toEqual(["Banaan", "Appel", "Peer"]);
    expect(peak()).toBe(2);
    expect(copies).toHaveLength(3);
    expect(store.entry(BANAAN)).toMatchObject({ state: "found", photoId: "photo-1", photoFor: "https://images.unsplash.com/banana" });
    store.request(BANAAN);
    await settle();
    expect(calls).toHaveLength(3);
  });

  it("waits for the connection to return before trying again", async () => {
    let online = false;
    const { store, calls, onlineListeners, settle } = await ready(() => (online ? ok("found") : { status: "offline" }));
    store.request(BANAAN);
    await settle();
    expect(store.entry(BANAAN)).toBeUndefined();
    expect(store.pending(BANAAN)).toBe(true);
    online = true;
    onlineListeners.forEach((listener) => listener());
    await settle();
    expect(calls).toHaveLength(2);
    expect(store.entry(BANAAN)?.state).toBe("found");
  });

  it("lets a parent remove the picture, and a new search brings one back", async () => {
    const { store, settle } = await ready(() => ok("found"));
    store.request(BANAAN);
    await settle();
    store.choose(BANAAN, null);
    expect(shownImage(store.entry(BANAAN))).toBeNull();
    store.request(BANAAN);
    await settle();
    expect(shownImage(store.entry(BANAAN))).toBeNull();
    store.request(BANAAN, { refresh: true });
    await settle();
    expect(shownImage(store.entry(BANAAN))).not.toBeNull();
  });

  it("searches nothing while switched off", async () => {
    const { store, calls, settle } = await ready(() => ok("found"));
    store.setEnabled(false);
    store.request(BANAAN);
    await settle();
    expect(calls).toEqual([]);
  });
});
