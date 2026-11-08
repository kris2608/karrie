import { afterEach, describe, expect, it } from "vitest";
import { artIdOf, extendCatalog, productById, products } from "../../data/catalog";
import { createCatalogSync, type CatalogSyncState } from "./sync";

const bundledCount = () => products.filter((product) => !product.id.startsWith("shared-")).length;

describe("catalog sync merge", () => {
  afterEach(() => {
    extendCatalog([]);
  });

  it("adds shared products, keeps bundled ids, and drops deprecated shared ones", () => {
    const before = products.length;
    extendCatalog([
      { id: "shared-chocomel", name: "Chocomel", category: "dairy", aliases: ["chocomel"], illustrationKey: "drinkpakje" },
      { id: "appel", name: "Hacked", category: "produce", aliases: [] },
    ]);
    expect(productById("shared-chocomel")?.name).toBe("Chocomel");
    expect(artIdOf(productById("shared-chocomel")!)).toBe("drinkpakje");
    expect(productById("appel")?.name).toBe("Appel");
    expect(products.length).toBe(before + 1);

    extendCatalog([{ id: "shared-chocomel", name: "Chocomel", category: "dairy", aliases: [], deprecated: true }]);
    expect(productById("shared-chocomel")).toBeUndefined();
    expect(products.length).toBe(before);
  });

  it("hydrates from cache offline and syncs when online", async () => {
    let stored: CatalogSyncState | undefined = {
      since: "2026-01-01T00:00:00.000Z",
      products: [{ id: "shared-cola", name: "Cola", category: "drinks", aliases: ["cola"] }],
      checkedAt: 1,
    };
    const sync = createCatalogSync({
      fetch: async () =>
        new Response(JSON.stringify({ status: "ok", products: [], next: null }), { status: 200 }),
      online: () => false,
      origin: "https://api.example",
      now: () => 10,
      load: async () => stored,
      save: async (state) => {
        stored = state;
      },
    });
    await sync.hydrate();
    expect(productById("shared-cola")?.name).toBe("Cola");

    let called = false;
    const online = createCatalogSync({
      fetch: async () => {
        called = true;
        return new Response(
          JSON.stringify({
            status: "ok",
            products: [{ id: "shared-cola", name: "Cola", category: "drinks", aliases: ["cola"], updatedAt: "2026-02-01T00:00:00.000Z" }],
            next: null,
          }),
          { status: 200 },
        );
      },
      online: () => true,
      origin: "https://api.example",
      now: () => Date.UTC(2026, 5, 1),
      load: async () => stored,
      save: async (state) => {
        stored = state;
      },
    });
    await online.sync();
    expect(called).toBe(true);
    expect(stored?.checkedAt).toBe(Date.UTC(2026, 5, 1));
  });

  it("artIdOf falls back to the product id", () => {
    expect(artIdOf({ id: "melk" })).toBe("melk");
    expect(artIdOf({ id: "x", illustration: "melk" })).toBe("melk");
    expect(bundledCount()).toBeGreaterThan(50);
  });
});
