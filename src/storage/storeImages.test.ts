import { describe, expect, it } from "vitest";
import { AUTOMATIC_ORDER, pickArt, type ArtCandidates } from "../components/ItemArt";
import { identityKey, identityOf, wantsReference, wantsStoreImage } from "../domain/imageIdentity";
import { wantedReferences, wantedStoreImages } from "../domain/referenceTargets";
import type { Adventure, AdventureItem } from "../domain/types";
import { packOf } from "../data/sample";
import { cleanStoreImage, createStoreImageClient, storeCredit, type StoreImage, type StoreImageOutcome } from "../services/images/storeImage";
import { afterOutcome, createStoreImageStore, due, STORE_IMAGE_RULES, type StoreImageEntry } from "./storeImages";

const EAN = "8710496978722";
const AH = "https://static.ah.nl/dam/product/AHI_4354523130313137313331?revLabel=1&rendition=800x800_WEBP&fileType=binary";
const STORE: StoreImage = { ean: EAN, imageUrl: AH, retailer: "albert_heijn", sourceUrl: "https://www.ah.nl/producten/product/wi62618/de-ruijter-kleintjes-hagelslag" };
const OFF = { imageUrl: "https://images.openfoodfacts.org/x.jpg", imageKind: "photo" as const, imageSource: "off" as const };

const item = (overrides: Partial<AdventureItem>): AdventureItem => ({
  id: "1",
  productId: "p",
  name: "Hagelslag",
  icon: "hagelslag",
  category: "breakfast",
  quantity: 1,
  status: "pending",
  ...overrides,
});
const scanned = (overrides: Partial<AdventureItem> = {}) => item({ ean: EAN, brand: "De Ruijter", source: "off", ...overrides });

describe("picture order", () => {
  const all: ArtCandidates = { off: "off", prijsprofeet: "pp", reference: "ref", parent: "mine" };
  const drop = (...sources: (keyof ArtCandidates)[]) => Object.fromEntries(Object.entries(all).filter(([key]) => !sources.includes(key as keyof ArtCandidates)));

  it("uses PrijsProfeet, then Open Food Facts, then a reference, then the parent's photo, then the drawing", () => {
    expect(AUTOMATIC_ORDER).toEqual(["prijsprofeet", "off", "name", "reference", "parent"]);
    expect(pickArt(undefined, all)).toEqual({ source: "prijsprofeet", url: "pp" });
    expect(pickArt(undefined, drop("prijsprofeet"))).toEqual({ source: "off", url: "off" });
    expect(pickArt(undefined, drop("off", "prijsprofeet"))).toEqual({ source: "reference", url: "ref" });
    expect(pickArt(undefined, { parent: "mine" })).toEqual({ source: "parent", url: "mine" });
    expect(pickArt(undefined, {})).toBeNull();
  });

  it("always lets the parent's choice win", () => {
    expect(pickArt("photo", all)).toEqual({ source: "parent", url: "mine" });
    expect(pickArt("reference", all)).toEqual({ source: "prijsprofeet", url: "pp" });
    expect(pickArt("reference", drop("prijsprofeet"))).toEqual({ source: "reference", url: "ref" });
    expect(pickArt("drawing", all)).toBeNull();
  });

  it("falls back to the automatic order when the chosen picture is missing or broken, without a new choice", () => {
    expect(pickArt("photo", drop("parent"))).toEqual({ source: "off", url: "off" });
    expect(pickArt("photo", { prijsprofeet: "pp" })).toEqual({ source: "prijsprofeet", url: "pp" });
    expect(pickArt("reference", { off: null, prijsprofeet: null, reference: null, parent: "mine" })).toEqual({ source: "parent", url: "mine" });
  });
});

describe("which products look for a retailer photo", () => {
  it("looks up a retailer photo for every scanned EAN, including packs that already have an Open Food Facts photo", () => {
    expect(wantsStoreImage(scanned())).toBe(true);
    expect(wantsStoreImage(scanned(OFF))).toBe(true);
    expect(wantsStoreImage(item({}))).toBe(false);
    expect(wantsStoreImage(item({ ean: EAN, kind: "custom_generic" }))).toBe(false);
    expect(wantsStoreImage(scanned({ photoId: "p1", imageKind: "photo", imageSource: "parent" }))).toBe(true);
    const adventure = {
      phase: "draft",
      items: [scanned(), scanned({ id: "2" }), scanned({ id: "3", ean: "8718166011021", ...OFF }), item({ id: "4" })],
    } as unknown as Adventure;
    expect(wantedStoreImages(adventure)).toEqual([EAN, "8718166011021"]);
    expect(wantedStoreImages({ ...adventure, phase: "done" })).toEqual([]);
  });

  it("does not search a reference picture while the retailer photo is pending or once one is found", () => {
    const identity = identityOf(scanned());
    expect(wantsReference(identity, undefined, false, true)).toBe(false);
    expect(wantsReference(identity, "reference", false, true)).toBe(false);
    expect(wantsReference(identity, undefined, false, false)).toBe(true);

    const adventure = { phase: "draft", items: [scanned(), item({ id: "2", name: "Pindakaas", brand: "Calvé", source: "vision", recognition: { specific: true, confidence: "high" } })] } as unknown as Adventure;
    const calve = "p|calve|pindakaas||";
    expect(wantedReferences(adventure, () => "pending").map(identityKey)).toEqual([calve]);
    expect(wantedReferences(adventure, () => "found").map(identityKey)).toEqual([calve]);
    expect(wantedReferences(adventure, () => "none").map(identityKey)).toEqual(["p|de ruijter|hagelslag||", calve]);
  });

  it("keeps the picture choice in a saved list", () => {
    expect(packOf(scanned({ imageChoice: "drawing" }))).toMatchObject({ ean: EAN, imageChoice: "drawing" });
  });
});

describe("cleaning the answer", () => {
  it("accepts only the same barcode and the retailer's own image host", () => {
    expect(cleanStoreImage(STORE, EAN)).toEqual(STORE);
    expect(cleanStoreImage(STORE, "8718166011021")).toBeNull();
    expect(cleanStoreImage({ ...STORE, retailer: "jumbo" }, EAN)).toBeNull();
    const plusUrl = "https://images.ctfassets.net/s0lodsnpsezb/abc/def/plus.png";
    const dirkUrl = "https://web-fileserver.dirk.nl/artikelen/123.png";
    expect(cleanStoreImage({ ean: EAN, imageUrl: plusUrl, retailer: "plus" }, EAN)).toEqual({ ean: EAN, imageUrl: plusUrl, retailer: "plus" });
    expect(cleanStoreImage({ ean: EAN, imageUrl: dirkUrl, retailer: "dirk" }, EAN)).toEqual({ ean: EAN, imageUrl: dirkUrl, retailer: "dirk" });
    expect(cleanStoreImage({ ean: EAN, imageUrl: "https://images.ctfassets.net/other/x.png", retailer: "plus" }, EAN)).toBeNull();
    expect(cleanStoreImage({ ...STORE, imageUrl: "http://static.ah.nl/dam/product/x" }, EAN)).toBeNull();
    expect(cleanStoreImage({ ...STORE, imageUrl: "https://images.openfoodfacts.org/x.jpg" }, EAN)).toBeNull();
    expect(cleanStoreImage({ ...STORE, imageUrl: "https://static.ah.nl/elders/x" }, EAN)).toBeNull();
    expect(cleanStoreImage({ ...STORE, imageUrl: "javascript:alert(1)" }, EAN)).toBeNull();
    expect(cleanStoreImage({ ...STORE, sourceUrl: "javascript:alert(1)" }, EAN)).toEqual({ ean: EAN, imageUrl: AH, retailer: "albert_heijn" });
    expect(cleanStoreImage(null, EAN)).toBeNull();
  });

  it("credits the retailer and PrijsProfeet, never Open Food Facts", () => {
    expect(storeCredit(STORE)).toBe("Foto: Albert Heijn, via PrijsProfeet.");
    expect(storeCredit({ retailer: "jumbo" })).not.toMatch(/Open Food Facts/);
    expect(storeCredit({ retailer: "plus" })).toBe("Foto: Plus, via PrijsProfeet.");
    expect(storeCredit({ retailer: "dirk" })).toBe("Foto: Dirk, via PrijsProfeet.");
  });

  it("sends only the barcode and maps answers to outcomes", async () => {
    let body = "";
    let reply: () => Response = () => new Response(JSON.stringify({ status: "ok", image: STORE }), { status: 200 });
    const client = createStoreImageClient({
      fetch: (async (_url: string, init: RequestInit) => ((body = String(init.body)), reply())) as unknown as typeof fetch,
      online: () => true,
      origin: "https://karrie-api.onrender.com",
    });
    expect(await client.find(EAN)).toEqual({ status: "ok", image: STORE });
    expect(JSON.parse(body)).toEqual({ ean: EAN });
    reply = () => new Response(JSON.stringify({ status: "ok", image: null }), { status: 200 });
    expect(await client.find(EAN)).toEqual({ status: "ok", image: null });
    reply = () => new Response(JSON.stringify({ status: "ok", image: { ...STORE, imageUrl: "https://evil.example/x.png" } }), { status: 200 });
    expect(await client.find(EAN)).toEqual({ status: "error", code: "malformed" });
    reply = () => new Response(JSON.stringify({ status: "error", code: "rate-limited" }), { status: 429 });
    expect(await client.find(EAN)).toEqual({ status: "limit", code: "rate-limited" });
    const offline = createStoreImageClient({ fetch: (async () => reply()) as unknown as typeof fetch, online: () => false, origin: "" });
    expect(await offline.find(EAN)).toEqual({ status: "offline" });
  });
});

describe("retailer photo store", () => {
  const NOW = 1_000_000;

  it("keeps a found photo, retries a miss after a week and errors with backoff", () => {
    const found = afterOutcome(undefined, { status: "ok", image: STORE }, NOW)!;
    expect(found).toMatchObject({ state: "found", image: STORE, retryAt: NOW + STORE_IMAGE_RULES.foundRecheckMs });
    expect(due(found, NOW + 1)).toBe(false);
    const miss = afterOutcome(undefined, { status: "ok", image: null }, NOW)!;
    expect(miss).toMatchObject({ state: "none", retryAt: NOW + STORE_IMAGE_RULES.noneRetryMs });
    const first = afterOutcome(undefined, { status: "error", code: "x" }, NOW)!;
    const second = afterOutcome(first, { status: "error", code: "x" }, NOW)!;
    expect(second.retryAt! - NOW).toBe(STORE_IMAGE_RULES.errorBaseMs * 4);
    expect(afterOutcome(found, { status: "ok", image: null }, NOW + 5)).toMatchObject({ state: "found", image: STORE });
    expect(afterOutcome(found, { status: "limit", code: "x" }, NOW + 5)).toMatchObject({ image: STORE });
    expect(afterOutcome(found, { status: "offline" }, NOW + 5)).toBe(found);
  });

  function store(answer: () => StoreImageOutcome, stored?: Record<string, StoreImageEntry>) {
    const calls: string[] = [];
    let online: (() => void) | undefined;
    const saved: Record<string, StoreImageEntry>[] = [];
    const instance = createStoreImageStore({
      client: { find: async (ean) => (calls.push(ean), answer()) },
      now: () => NOW,
      load: async () => stored,
      save: async (entries) => void saved.push(entries),
      online: (listener) => (online = listener),
    });
    return { instance, calls, saved, goOnline: () => online?.() };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("waits for stored answers, asks once per barcode, and keeps only the link", async () => {
    const { instance, calls } = store(() => ({ status: "ok", image: STORE }));
    instance.request(EAN);
    instance.request(EAN);
    expect(instance.status(EAN)).toBe("pending");
    expect(calls).toEqual([]);
    await instance.hydrate();
    await settle();
    expect(calls).toEqual([EAN]);
    expect(instance.status(EAN)).toBe("found");
    expect(instance.image(EAN)).toEqual(STORE);
    expect(Object.keys(instance.entry(EAN)!)).not.toContain("photoId");
    instance.request(EAN);
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("never asks again for a barcode it already knows", async () => {
    const { instance, calls } = store(() => ({ status: "ok", image: null }), { [EAN]: { state: "none", attempts: 0, retryAt: NOW + 1, updatedAt: NOW } });
    instance.request(EAN);
    await instance.hydrate();
    await settle();
    expect(calls).toEqual([]);
    expect(instance.status(EAN)).toBe("none");
  });

  it("waits for the connection when offline, without losing the request", async () => {
    let up = false;
    const { instance, calls, goOnline } = store(() => (up ? { status: "ok", image: STORE } : { status: "offline" }));
    await instance.hydrate();
    instance.request(EAN);
    await settle();
    expect(instance.status(EAN)).toBe("pending");
    up = true;
    goOnline();
    await settle();
    expect(calls).toHaveLength(2);
    expect(instance.status(EAN)).toBe("found");
  });
});
