import { describe, expect, it } from "vitest";
import { initialState, reducer } from "./reducer";
import { neededSharedPackEans, needsSharedPackHydrate } from "./sharedPackHydrate";

describe("shared pack hydrate", () => {
  it("flags EAN items without an OFF photo and skips drawings without commercial identity", () => {
    expect(
      needsSharedPackHydrate({
        id: "1",
        productId: "hagelslag",
        name: "Hagelslag",
        icon: "hagelslag",
        category: "breakfast",
        quantity: 1,
        status: "pending",
        ean: "8710496978722",
        brand: "De Ruijter",
        source: "barcode",
      }),
    ).toBe(true);
    expect(
      needsSharedPackHydrate({
        id: "2",
        productId: "melk",
        name: "Melk",
        icon: "melk",
        category: "dairy",
        quantity: 1,
        status: "pending",
        imageChoice: "drawing",
      }),
    ).toBe(false);
  });

  it("apply-shared-pack attaches OFF image when the EAN matches and never overwrites a parent photo", () => {
    let state = reducer(initialState, {
      type: "import-shared-list",
      mode: "open",
      list: {
        version: 1,
        items: [{ name: "Hagelslag", quantity: 1, category: "breakfast", ean: "8710496978722", brand: "De Ruijter", productId: "hagelslag" }],
      },
    });
    const itemId = state.adventure!.items[0].id;
    expect(neededSharedPackEans(state.adventure).map((entry) => entry.ean)).toEqual(["8710496978722"]);

    state = reducer(state, {
      type: "apply-shared-pack",
      itemId,
      ean: "8710496978722",
      imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg",
      brand: "De Ruijter",
      packageSize: "400 g",
      barcode: { status: "off-exact", sourceName: "Open Food Facts", sourceUrl: "https://world.openfoodfacts.org/product/8710496978722", at: 1 },
    });
    expect(state.adventure!.items[0]).toMatchObject({
      imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg",
      imageKind: "photo",
      imageSource: "off",
      brand: "De Ruijter",
      packageSize: "400 g",
      source: "barcode",
    });

    state = reducer(state, { type: "set-photo", itemId, photoId: "parent-1" });
    const withParent = reducer(state, {
      type: "apply-shared-pack",
      itemId,
      ean: "8710496978722",
      imageUrl: "https://images.openfoodfacts.org/other.jpg",
    });
    expect(withParent.adventure!.items[0].photoId).toBe("parent-1");
    expect(withParent.adventure!.items[0].imageSource).toBe("parent");
    expect(withParent.adventure!.items[0].imageUrl).not.toBe("https://images.openfoodfacts.org/other.jpg");
  });

  it("allows EAN + custom_generic hydrate and applies nutrition plus catalog ids", () => {
    expect(
      needsSharedPackHydrate({
        id: "c",
        productId: "custom:hagelslag",
        name: "Hagelslag",
        icon: "unknown",
        category: "breakfast",
        quantity: 1,
        status: "pending",
        ean: "8710496978722",
        kind: "custom_generic",
        source: "shared",
      }),
    ).toBe(true);

    let state = reducer(initialState, {
      type: "import-shared-list",
      mode: "open",
      list: {
        version: 1,
        items: [
          {
            name: "Hagelslag",
            quantity: 1,
            category: "breakfast",
            ean: "8710496978722",
            brand: "De Ruijter",
            productId: "b-deruijter99",
            kind: "custom_generic",
          },
        ],
      },
    });
    const itemId = state.adventure!.items[0].id;
    state = reducer(state, {
      type: "apply-shared-pack",
      itemId,
      ean: "8710496978722",
      imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg",
      nutrition: { nutriscore: "d", sugars100g: 60 },
      ingredients: "Suiker, cacao",
      catalogProductId: "b-deruijter99",
      catalogVariantId: "aabbccddeeff001122334455",
      offAttribution: true,
      barcode: { status: "off-exact", sourceName: "Open Food Facts", sourceUrl: "https://world.openfoodfacts.org/product/8710496978722", at: 1 },
    });
    expect(state.adventure!.items[0]).toMatchObject({
      imageUrl: "https://images.openfoodfacts.org/images/products/871/front.jpg",
      nutrition: { nutriscore: "d", sugars100g: 60 },
      ingredients: "Suiker, cacao",
      catalogProductId: "b-deruijter99",
      catalogVariantId: "aabbccddeeff001122334455",
      offAttribution: true,
      source: "barcode",
    });
    expect(state.adventure!.items[0].photoId).toBeUndefined();
  });

  it("repairs legacy drawing+EAN on hydrate so store lookups can run", () => {
    const state = reducer(initialState, {
      type: "hydrate",
      data: {
        adventure: {
          id: "adv",
          name: "Oud",
          phase: "draft",
          createdAt: 1,
          updatedAt: 1,
          categoryOrder: initialState.categoryOrder,
          history: [],
          items: [
            {
              id: "x",
              productId: "hagelslag",
              name: "Hagelslag",
              icon: "hagelslag",
              category: "breakfast",
              quantity: 1,
              status: "pending",
              ean: "8710496978722",
              brand: "De Ruijter",
              imageKind: "generic",
              imageChoice: "drawing",
            },
          ],
        },
      },
    });
    expect(state.adventure!.items[0].imageChoice).toBeUndefined();
    expect(state.adventure!.items[0].source).toBe("barcode");
  });
});
