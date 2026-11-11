import { describe, expect, it } from "vitest";
import { customWork } from "../../state/customEnrichment";
import { initialState, reducer } from "../../state/reducer";
import { CUSTOM_RULES, createCustomProductClient, enrichmentOf } from "./client";

const PRODUCT = {
  canonicalName: "cashewnoot",
  displayName: "Cashewnoten",
  singularName: "cashewnoot",
  pluralName: "cashewnoten",
  childFriendlyLabel: "nootjes",
  category: "pantry",
  subcategory: "noten",
  closestDrawing: null,
};

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

function client(reply: (url: string, init?: RequestInit) => Response | Promise<Response>, online = true) {
  const calls: { url: string; body?: unknown }[] = [];
  const api = createCustomProductClient({
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return reply(url, init);
    }) as typeof fetch,
    online: () => online,
    storage: memoryStorage(),
    origin: "https://api.example",
    now: () => Date.UTC(2026, 10, 7, 12),
  });
  return { api, calls };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("custom product client", () => {
  it("sends only the typed name and turns the answer into an enrichment", async () => {
    const { api, calls } = client(() => json(200, { status: "ok", product: PRODUCT, illustrations: false }));
    const outcome = await api.normalize("Cashewnoten");
    expect(calls).toEqual([{ url: "https://api.example/api/products/normalize", body: { name: "Cashewnoten", createdFrom: "search" } }]);
    expect(outcome).toEqual({
      status: "ok",
      illustrations: false,
      enrichment: { displayName: "Cashewnoten", canonicalName: "cashewnoot", singularName: "cashewnoot", pluralName: "cashewnoten", childFriendlyLabel: "nootjes", category: "pantry", subcategory: "noten" },
    });
  });

  it("keeps refusals final and everything else for a later try", async () => {
    expect(await client(() => json(422, { status: "error", code: "not-a-product" })).api.normalize("Calvé")).toEqual({ status: "refused" });
    expect(await client(() => json(429, { status: "error", code: "rate-limited" })).api.normalize("Komijn")).toEqual({ status: "retry" });
    expect(await client(() => json(200, { status: "ok", product: { ...PRODUCT, category: "aisle" } })).api.normalize("Komijn")).toEqual({ status: "retry" });
    expect(await client(() => Promise.reject(new TypeError("offline"))).api.normalize("Komijn")).toEqual({ status: "retry" });
    const offline = client(() => json(200, {}), false);
    expect(await offline.api.normalize("Komijn")).toEqual({ status: "retry" });
    expect(offline.calls).toHaveLength(0);
  });

  it("shares one request when the add sheet and the background tidy-up ask at once, and asks again afterwards", async () => {
    const { api, calls } = client(() => json(200, { status: "ok", product: PRODUCT, illustrations: true }));
    const [sheet, background] = await Promise.all([api.normalize("Cashewnoten"), api.normalize("Cashewnoten")]);
    expect(background).toBe(sheet);
    expect(calls).toHaveLength(1);
    await api.normalize("Cashewnoten");
    expect(calls).toHaveLength(2);
  });

  it("keeps the closest drawing and refuses names that are too long", () => {
    expect(enrichmentOf({ ...PRODUCT, closestDrawing: "pindakaas" })?.drawing).toBe("pindakaas");
    expect(enrichmentOf({ ...PRODUCT, displayName: "x".repeat(60) })).toBeNull();
  });

  it("asks for a drawing at most a few times a day and treats 404 as no drawing", async () => {
    const image = "data:image/webp;base64,UklGRg==";
    const { api, calls } = client((url) => (url.startsWith("data:") ? new Response(new Blob(["RIFF"], { type: "image/webp" })) : json(200, { status: "ok", image })));
    const first = await api.illustration("Cashewnoten");
    expect(first.status).toBe("ok");
    for (let index = 1; index < CUSTOM_RULES.illustrationsPerDay; index += 1) await api.illustration("Cashewnoten");
    expect(await api.illustration("Cashewnoten")).toEqual({ status: "retry" });
    expect(calls.filter((call) => call.url.endsWith("/api/products/illustration"))).toHaveLength(CUSTOM_RULES.illustrationsPerDay);
    expect(await client(() => json(404, { status: "error", code: "not-found" })).api.illustration("Cashewnoten")).toEqual({ status: "none" });
  });
});

describe("customWork", () => {
  it("lists each pending product once, then its drawing once the tidy-up is done", () => {
    let state = reducer(initialState, { type: "add-custom", name: "cashewnoten", itemId: crypto.randomUUID() });
    expect(customWork(state)).toMatchObject({ normalize: [{ productId: "custom:cashewnoot", name: "Cashewnoten" }], illustrate: [], brand: [] });
    state = reducer(state, { type: "enrich-custom", productId: "custom:cashewnoot", result: { displayName: "Cashewnoten", canonicalName: "cashewnoot", category: "pantry" }, illustrations: true });
    expect(customWork(state)).toMatchObject({ normalize: [], illustrate: [{ productId: "custom:cashewnoot", name: "Cashewnoten" }] });
    state = reducer(state, { type: "set-illustration", productId: "custom:cashewnoot", illustrationId: "drawing-1" });
    expect(customWork(state)).toMatchObject({ normalize: [], illustrate: [] });
  });

  it("stops at once when the server refuses the product", () => {
    let state = reducer(initialState, { type: "add-custom", name: "komijn", itemId: crypto.randomUUID() });
    state = reducer(state, { type: "enrich-custom", productId: "custom:komijn", result: null, final: true });
    expect(state.mine[0].enrichment).toMatchObject({ status: "failed", tries: 1 });
    expect(customWork(state).normalize).toHaveLength(0);
  });
});
