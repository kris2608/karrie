import { describe, expect, it } from "vitest";
import { pickArt } from "../components/ItemArt";
import { identityKey, identityOf, nameImageKey } from "../domain/imageIdentity";
import { wantedReferences } from "../domain/referenceTargets";
import type { Adventure, AdventureItem, NamePhoto } from "../domain/types";
import { cleanNameAnswer, cleanNamePhoto, createNameImageClient, namePhotoCredit, type NameAnswer, type NameImageOutcome } from "../services/images/nameImage";
import type { LookupStatus } from "../storage/lookupStore";
import { createNameImageStore, type NameImageEntry } from "../storage/nameImages";
import { customWork } from "./customEnrichment";
import { initialState, reducer, type AppState } from "./reducer";

const AH_PHOTO: NamePhoto = {
  source: "prijsprofeet",
  imageUrl: "https://static.ah.nl/dam/product/chocomel-vol.jpg",
  productName: "Chocomel Vol",
  retailer: "albert_heijn",
  sourceUrl: "https://www.ah.nl/producten/product/wi1/chocomel-vol",
  packaging: "1 l",
};
const OFF_PHOTO: NamePhoto = { source: "off", imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg", productName: "Chocomel Vol", sourceUrl: "https://world.openfoodfacts.org/product/871" };
const CHOCOMEL: NameAnswer = { classification: "branded", brand: "Chocomel", match: AH_PHOTO, alternatives: [OFF_PHOTO], category: "dairy" };
const UNKNOWN: NameAnswer = { classification: "unknown", match: null, alternatives: [] };

function names(answers: Record<string, NameAnswer | "pending">) {
  return {
    status: (key: string): LookupStatus => (answers[key] === "pending" || !(key in answers) ? "pending" : (answers[key] as NameAnswer).match ? "found" : "none"),
    value: (key: string) => (answers[key] && answers[key] !== "pending" ? (answers[key] as NameAnswer) : null),
  };
}

const add = (state: AppState, name: string) => reducer(state, { type: "add-custom", name, itemId: crypto.randomUUID() });

describe("typed brands: one tap, then the name lookup decides", () => {
  it("adds Chocomel at once and waits for the name lookup before any OpenAI tidy-up, also offline", () => {
    const state = add(initialState, "Chocomel");
    expect(state.adventure!.items).toHaveLength(1);
    expect(state.mine[0]).toMatchObject({ kind: "custom_generic", name: "Chocomel", enrichment: { status: "pending" } });
    const waiting = customWork(state, names({}));
    expect(waiting).toMatchObject({ lookup: ["chocomel"], normalize: [], brand: [], illustrate: [] });
  });

  it("a brand found by name skips the tidy-up and the drawing, and is remembered in Mijn producten", () => {
    let state = add(initialState, "Chocomel");
    const work = customWork(state, names({ chocomel: CHOCOMEL }));
    expect(work).toMatchObject({ normalize: [], illustrate: [], brand: [{ productId: state.mine[0].productId, brand: "Chocomel", category: "dairy" }] });
    state = reducer(state, { type: "brand-custom", ...work.brand[0] });
    expect(state.mine[0]).toMatchObject({ brand: "Chocomel", category: "dairy", enrichment: { status: "done" } });
    expect(state.adventure!.items[0]).toMatchObject({ brand: "Chocomel", category: "dairy" });
    expect(customWork(state, names({ chocomel: CHOCOMEL }))).toMatchObject({ normalize: [], illustrate: [], brand: [] });
    expect(reducer(state, { type: "brand-custom", ...work.brand[0] })).toBe(state);
  });

  it("a generic product goes through the tidy-up as before", () => {
    const state = add(initialState, "cashewnoten");
    expect(customWork(state, names({ cashewnoten: UNKNOWN }))).toMatchObject({ lookup: ["cashewnoten"], normalize: [{ name: "Cashewnoten" }], brand: [] });
  });

  it("keeps the parent's category once the product was tidied or moved", () => {
    let state = add(initialState, "Chocomel");
    const { productId, category } = state.mine[0];
    expect(category).not.toBe("dairy");
    state = reducer(state, { type: "enrich-custom", productId, result: null, final: true });
    state = reducer(state, { type: "brand-custom", productId, brand: "Chocomel", category: "dairy" });
    expect(state.mine[0]).toMatchObject({ brand: "Chocomel", category });
  });

  it("a parent's photo choice lands on every copy and can be undone", () => {
    let state = add(initialState, "Chocomel");
    const productId = state.mine[0].productId;
    state = reducer(state, { type: "choose-name-photo", productId, photo: OFF_PHOTO });
    expect(state.mine[0].namePhoto).toEqual(OFF_PHOTO);
    expect(state.adventure!.items[0].namePhoto).toEqual(OFF_PHOTO);
    state = reducer(state, { type: "choose-name-photo", productId, photo: null });
    expect(state.mine[0].namePhoto).toBeUndefined();
    expect(state.adventure!.items[0].namePhoto).toBeUndefined();
  });
});

describe("reference search after the free sources", () => {
  const typed = (overrides: Partial<AdventureItem> = {}): AdventureItem => ({
    id: "1",
    productId: "custom:chocomel",
    name: "Chocomel 1 liter",
    icon: "melk",
    category: "dairy",
    quantity: 1,
    status: "pending",
    kind: "custom_generic",
    brand: "Chocomel",
    ...overrides,
  });
  const list = (...items: AdventureItem[]) => ({ phase: "draft", items }) as unknown as Adventure;

  it("gives a typed brand a picture-only identity; a typed product without a brand stays generic", () => {
    expect(identityOf(typed())).toEqual({ name: "Chocomel", brand: "Chocomel", size: "1 l", generic: false, typed: true });
    expect(identityOf(typed({ brand: undefined, name: "Walnoten" }))).toEqual({ name: "Walnoten", generic: true });
  });

  it("waits for the name lookup, skips a found photo or a chosen one, and searches when nothing was found", () => {
    const key = nameImageKey("Chocomel 1 liter");
    expect(key).toBe("chocomel 1 liter");
    expect(wantedReferences(list(typed()), undefined, () => "pending")).toEqual([]);
    expect(wantedReferences(list(typed()), undefined, () => "found")).toEqual([]);
    expect(wantedReferences(list(typed({ namePhoto: OFF_PHOTO })), undefined, () => "none")).toEqual([]);
    expect(wantedReferences(list(typed()), undefined, () => "none").map(identityKey)).toEqual([identityKey(identityOf(typed())!)]);
  });
});

describe("picture order with a name photo", () => {
  it("a scanned pack keeps its barcode photo; a name photo only fills in after it", () => {
    expect(pickArt(undefined, { prijsprofeet: "barcode", name: "name", reference: "ref" })).toEqual({ source: "prijsprofeet", url: "barcode" });
    expect(pickArt(undefined, { name: "name", reference: "ref" })).toEqual({ source: "name", url: "name" });
  });

  it("the parent's choice is never overridden, and a broken name photo falls back", () => {
    expect(pickArt("photo", { name: "name", parent: "mine" })).toEqual({ source: "parent", url: "mine" });
    expect(pickArt("reference", { name: "name", reference: "ref" })).toEqual({ source: "name", url: "name" });
    expect(pickArt("reference", { name: null, reference: "ref" })).toEqual({ source: "reference", url: "ref" });
    expect(pickArt(undefined, { name: null })).toBeNull();
  });
});

describe("cleaning a name answer", () => {
  it("accepts retailer photos only from that retailer's host and Open Food Facts photos only from theirs", () => {
    expect(cleanNamePhoto(AH_PHOTO)).toEqual(AH_PHOTO);
    expect(cleanNamePhoto(OFF_PHOTO)).toEqual(OFF_PHOTO);
    expect(cleanNamePhoto({ ...AH_PHOTO, retailer: "jumbo" })).toBeNull();
    expect(cleanNamePhoto({ ...AH_PHOTO, source: "off" })).toBeNull();
    expect(cleanNamePhoto({ ...OFF_PHOTO, source: "prijsprofeet" })).toBeNull();
    expect(cleanNamePhoto({ ...AH_PHOTO, imageUrl: "javascript:alert(1)" })).toBeNull();
    expect(cleanNamePhoto({ ...AH_PHOTO, ean: "8712345678906", nutrition: { sugars: 9 } })).toEqual(AH_PHOTO);
  });

  it("an unknown answer never carries a photo, and a branded one needs a brand", () => {
    expect(cleanNameAnswer({ classification: "unknown", match: AH_PHOTO, alternatives: [OFF_PHOTO] })).toEqual(UNKNOWN);
    expect(cleanNameAnswer({ classification: "branded", match: AH_PHOTO, alternatives: [] })).toEqual(UNKNOWN);
    expect(cleanNameAnswer({ ...CHOCOMEL, category: "rockets" })).toEqual({ classification: "branded", brand: "Chocomel", match: AH_PHOTO, alternatives: [OFF_PHOTO] });
    expect(cleanNameAnswer(null)).toBeNull();
  });

  it("credits the source and says it is an example, never Open Food Facts for a retailer photo", () => {
    expect(namePhotoCredit(AH_PHOTO)).toBe("Foto: Albert Heijn, via PrijsProfeet · een voorbeeld van dit product.");
    expect(namePhotoCredit(OFF_PHOTO)).toBe("Foto: Open Food Facts (CC BY-SA) · een voorbeeld van dit product.");
  });
});

describe("name image client and store", () => {
  it("sends only the typed name and maps answers to outcomes", async () => {
    let body = "";
    let reply = () => new Response(JSON.stringify({ status: "ok", result: CHOCOMEL }), { status: 200 });
    const client = createNameImageClient({
      fetch: (async (_url: string, init: RequestInit) => ((body = String(init.body)), reply())) as unknown as typeof fetch,
      online: () => true,
      origin: "https://karrie-api.onrender.com",
    });
    expect(await client.find("Chocomel")).toEqual({ status: "ok", image: CHOCOMEL });
    expect(JSON.parse(body)).toEqual({ name: "Chocomel" });
    reply = () => new Response(JSON.stringify({ status: "error", code: "not-a-product" }), { status: 422 });
    expect(await client.find("iets")).toEqual({ status: "ok", image: UNKNOWN });
    reply = () => new Response(JSON.stringify({ status: "error", code: "misconfigured" }), { status: 503 });
    expect(await client.find("Chocomel")).toEqual({ status: "ok", image: UNKNOWN });
    reply = () => new Response(JSON.stringify({ status: "error", code: "rate-limited" }), { status: 429 });
    expect(await client.find("Chocomel")).toEqual({ status: "limit", code: "rate-limited" });
    reply = () => new Response(JSON.stringify({ status: "error", code: "unavailable" }), { status: 502 });
    expect(await client.find("Chocomel")).toEqual({ status: "error", code: "unavailable" });
    const offline = createNameImageClient({ fetch: (async () => reply()) as unknown as typeof fetch, online: () => false, origin: "" });
    expect(await offline.find("Chocomel")).toEqual({ status: "offline" });
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  function store(answer: () => NameImageOutcome, stored?: Record<string, NameImageEntry>) {
    const calls: string[] = [];
    const instance = createNameImageStore({
      client: { find: async (name) => (calls.push(name), answer()) },
      now: () => 1_000_000,
      load: async () => stored,
      save: async () => undefined,
      online: () => undefined,
    });
    return { instance, calls };
  }

  it("asks once per name, remembers a brand without a photo, and never asks again for a known name", async () => {
    const { instance, calls } = store(() => ({ status: "ok", image: CHOCOMEL }));
    instance.request("chocomel");
    instance.request("chocomel");
    await instance.hydrate();
    await settle();
    expect(calls).toEqual(["chocomel"]);
    expect(instance.status("chocomel")).toBe("found");
    expect(instance.value("chocomel")).toEqual(CHOCOMEL);
    instance.request("chocomel");
    await settle();
    expect(calls).toHaveLength(1);

    const optimel: NameAnswer = { classification: "branded", brand: "Optimel", match: null, alternatives: [] };
    const known = store(() => ({ status: "ok", image: optimel }), { optimel: { state: "none", image: optimel, attempts: 0, retryAt: 1_000_001, updatedAt: 1_000_000 } });
    known.instance.request("optimel");
    await known.instance.hydrate();
    await settle();
    expect(known.calls).toEqual([]);
    expect(known.instance.status("optimel")).toBe("none");
    expect(known.instance.value("optimel")).toEqual(optimel);
  });
});
