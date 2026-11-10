import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import { productById } from "../data/catalog";
import { createAdventure, createItem } from "../data/sample";
import type { FoundAnswer } from "../services/barcode/lookup";
import { initialState, reducer, type AppState } from "./reducer";
import { collectRefreshEans, refreshActionFromAnswer, runRefreshEanPacks } from "./refreshEanPacks";

const CALVE = "8710400000006";
const OFF: FoundAnswer = {
  ean: CALVE,
  status: "off-exact",
  product: {
    name: "Calvé Pindakaas",
    brand: "Calvé",
    quantity: "350 g",
    imageUrl: "https://images.openfoodfacts.org/x.jpg",
    ingredients: "pinda's, zout",
    nutriScore: "C",
    per100: { sugars: 6.5 },
  },
  source: { kind: "off", name: "Open Food Facts", url: `https://world.openfoodfacts.org/product/${CALVE}`, dataLicense: "ODbL", imageLicense: "CC BY-SA" },
  catalogProductId: "b-calve",
  catalogVariantId: "abcdef0123456789",
  at: 1,
};

function withEanList(): AppState {
  const base = createItem(productById("pindakaas")!);
  const item = {
    ...base,
    ean: CALVE,
    name: "Calvé Pindakaas",
    brand: "Calvé",
    packageSize: "500 g",
    photoId: "parent-1",
    imageSource: "parent" as const,
    barcode: { status: "off-exact" as const, sourceName: "Open Food Facts", sourceUrl: "https://example", at: 1 },
  };
  const mine = [
    {
      name: "Calvé Pindakaas",
      ean: CALVE,
      productId: "pindakaas",
      icon: "pindakaas",
      category: "pantry" as const,
      quantity: 1,
      brand: "Calvé",
      packageSize: "500 g",
      photoId: "parent-1",
      imageSource: "parent" as const,
      barcode: { status: "off-exact" as const, sourceName: "Open Food Facts", sourceUrl: "https://example", at: 1 },
    },
  ];
  const adventure = {
    ...createAdventure("Test", [productById("pindakaas")!], DEFAULT_CATEGORY_ORDER, "draft"),
    items: [item],
  };
  const saved = [
    {
      id: "saved-1",
      name: "Bewaard",
      items: [{ ...mine[0], name: "Calvé Pindakaas" }],
      favorite: false,
      updatedAt: 1,
    },
  ];
  return { ...initialState, adventure, mine, saved };
}

describe("refresh-ean-pack", () => {
  it("updates adventure, mine and saved by EAN, strips brand from the title, and keeps a parent photo", () => {
    const before = withEanList();
    const action = refreshActionFromAnswer(CALVE, OFF);
    const state = reducer(before, action);

    expect(action.name).toBe("Pindakaas");
    expect(state.adventure!.items[0]).toMatchObject({
      ean: CALVE,
      name: "Pindakaas",
      brand: "Calvé",
      packageSize: "350 g",
      catalogProductId: "b-calve",
      catalogVariantId: "abcdef0123456789",
      nutrition: { nutriscore: "c", sugars100g: 6.5 },
      ingredients: "pinda's, zout",
      source: "off",
      photoId: "parent-1",
      imageSource: "parent",
      productId: "pindakaas",
      icon: "pindakaas",
    });
    expect(state.adventure!.items[0].imageUrl).toBeUndefined();
    expect(state.mine[0]).toMatchObject({
      name: "Pindakaas",
      brand: "Calvé",
      catalogProductId: "b-calve",
      photoId: "parent-1",
      imageSource: "parent",
    });
    expect(state.saved[0].items[0]).toMatchObject({
      name: "Pindakaas",
      brand: "Calvé",
      packageSize: "350 g",
      photoId: "parent-1",
    });
  });

  it("keeps a parent nickname while still refreshing brand and size", () => {
    const before = withEanList();
    const nicknamed = {
      ...before,
      adventure: {
        ...before.adventure!,
        items: before.adventure!.items.map((item) => ({ ...item, name: "Onze pindakaas", fieldSources: { name: "parent" as const } })),
      },
      mine: before.mine.map((item) => ({ ...item, name: "Onze pindakaas", fieldSources: { name: "parent" as const } })),
    };
    const state = reducer(nicknamed, refreshActionFromAnswer(CALVE, OFF));
    expect(state.adventure!.items[0]).toMatchObject({ name: "Onze pindakaas", brand: "Calvé", packageSize: "350 g" });
    expect(state.mine[0]).toMatchObject({ name: "Onze pindakaas", brand: "Calvé", packageSize: "350 g" });
  });

  it("fills an OFF image only when there is no parent photo and no existing image", () => {
    const before = withEanList();
    const bare = {
      ...before,
      adventure: {
        ...before.adventure!,
        items: before.adventure!.items.map((item) => {
          const { photoId: _photoId, imageSource: _imageSource, ...rest } = item;
          return rest;
        }),
      },
      mine: before.mine.map((item) => {
        const { photoId: _photoId, imageSource: _imageSource, ...rest } = item;
        return rest;
      }),
    };
    const state = reducer(bare, refreshActionFromAnswer(CALVE, OFF));
    expect(state.adventure!.items[0]).toMatchObject({
      imageUrl: OFF.product.imageUrl,
      imageKind: "photo",
      imageSource: "off",
    });
  });
});

describe("collectRefreshEans", () => {
  it("collects unique valid EANs from mine and open list, skipping found items", () => {
    const state = withEanList();
    const found = { ...state.adventure!.items[0], id: "found-1", status: "found" as const, ean: "8712345678906" };
    const adventure = { ...state.adventure!, items: [...state.adventure!.items, found] };
    expect(collectRefreshEans(state.mine, adventure)).toEqual([CALVE]);
  });
});

describe("runRefreshEanPacks", () => {
  it("dispatches refresh actions for found answers and reports updated", async () => {
    const dispatch = vi.fn();
    const refresh = vi.fn(async () => ({ status: "found" as const, ean: CALVE, answer: OFF, cached: false, lookupSource: "open_food_facts" as const }));
    const images = { accept: vi.fn(), request: vi.fn() };
    await expect(runRefreshEanPacks({ eans: [CALVE], dispatch, refresh, storeImages: images, online: () => true })).resolves.toBe("updated");
    expect(dispatch).toHaveBeenCalledWith(refreshActionFromAnswer(CALVE, OFF));
    expect(images.request).toHaveBeenCalledWith(CALVE, { refresh: true });
  });

  it("seeds a PrijsProfeet store photo from the barcode answer", async () => {
    const dispatch = vi.fn();
    const withStore: FoundAnswer = {
      ...OFF,
      storeImage: {
        ean: CALVE,
        imageUrl: "https://www.jumbo.com/dam-images/fit-in/360x360/Products/calve.png",
        retailer: "jumbo",
        sourceUrl: "https://www.jumbo.com/producten/calve",
      },
    };
    const refresh = vi.fn(async () => ({ status: "found" as const, ean: CALVE, answer: withStore, cached: false, lookupSource: "open_food_facts" as const }));
    const images = { accept: vi.fn(), request: vi.fn() };
    await runRefreshEanPacks({ eans: [CALVE], dispatch, refresh, storeImages: images, online: () => true });
    expect(images.accept).toHaveBeenCalledWith(
      CALVE,
      expect.objectContaining({ ean: CALVE, retailer: "jumbo", imageUrl: withStore.storeImage!.imageUrl }),
    );
    expect(images.request).toHaveBeenCalledWith(CALVE, { refresh: true });
  });

  it("reports offline without calling refresh", async () => {
    const dispatch = vi.fn();
    const refresh = vi.fn();
    const images = { accept: vi.fn(), request: vi.fn() };
    await expect(runRefreshEanPacks({ eans: [CALVE], dispatch, refresh, storeImages: images, online: () => false })).resolves.toBe("offline");
    expect(refresh).not.toHaveBeenCalled();
    expect(images.request).not.toHaveBeenCalled();
  });
});
