import { describe, expect, it, vi } from "vitest";
import { LOOKUP_RULES } from "../storage/lookupStore";
import { initialState, reducer } from "./reducer";
import {
  neededSharedPackEans,
  needsSharedPackHydrate,
  nextHydrateAttempt,
  shouldAttemptHydrate,
} from "./sharedPackHydrate";

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
      mode: "create",
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
      mode: "create",
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

describe("shared pack hydrate retry schedule", () => {
  it("stops after a successful find and after a durable miss", () => {
    expect(
      nextHydrateAttempt(undefined, { status: "found", ean: "1", answer: {} as never, cached: false, lookupSource: "open_food_facts" }, 1000),
    ).toMatchObject({
      status: "complete",
    });
    expect(nextHydrateAttempt(undefined, { status: "none", ean: "1" }, 1000)).toMatchObject({
      status: "miss",
      retryAt: 1000 + LOOKUP_RULES.noneRetryMs,
    });
    expect(shouldAttemptHydrate({ status: "complete", attempts: 1, retryAt: Infinity }, 2000)).toBe(false);
    expect(shouldAttemptHydrate({ status: "miss", attempts: 1, retryAt: 1000 + LOOKUP_RULES.noneRetryMs }, 2000)).toBe(false);
  });

  it("backs off on temporary errors and allows a later retry", () => {
    const first = nextHydrateAttempt(undefined, { status: "error", ean: "1", code: "unreachable" }, 1000);
    expect(first.status).toBe("retry");
    expect(first.retryAt).toBe(1000 + LOOKUP_RULES.errorBaseMs);
    expect(shouldAttemptHydrate(first, 1000)).toBe(false);
    expect(shouldAttemptHydrate(first, first.retryAt)).toBe(true);

    const offline = nextHydrateAttempt(first, { status: "offline", ean: "1" }, first.retryAt);
    expect(offline.status).toBe("retry");
    expect(offline.attempts).toBe(2);
    expect(offline.retryAt).toBe(first.retryAt + LOOKUP_RULES.errorBaseMs * 4);
  });

  it("respects rate limits and caps attempts", () => {
    const limited = nextHydrateAttempt(undefined, { status: "limit", ean: "1", code: "rate-limited" }, 0);
    expect(limited).toMatchObject({ status: "retry", retryAt: LOOKUP_RULES.limitRetryMs });

    let entry = undefined as ReturnType<typeof nextHydrateAttempt> | undefined;
    for (let i = 0; i < 8; i += 1) {
      entry = nextHydrateAttempt(entry, { status: "error", ean: "1", code: "boom" }, i);
    }
    expect(entry?.status).toBe("miss");
    expect(shouldAttemptHydrate(entry, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("starts a fresh key immediately and skips in-flight pending", () => {
    expect(shouldAttemptHydrate(undefined, 0)).toBe(true);
    expect(shouldAttemptHydrate({ status: "pending", attempts: 0, retryAt: 0 }, 0)).toBe(false);
  });
});

describe("shared pack hydrate fail then succeed", () => {
  it("records retry then complete across outcomes", () => {
    const failed = nextHydrateAttempt(undefined, { status: "error", ean: "871", code: "timeout" }, 0);
    expect(failed.status).toBe("retry");
    const ok = nextHydrateAttempt(
      failed,
      { status: "found", ean: "871", answer: {} as never, cached: false, lookupSource: "open_food_facts" },
      failed.retryAt,
    );
    expect(ok.status).toBe("complete");
    expect(shouldAttemptHydrate(ok, failed.retryAt + 1)).toBe(false);
  });

  it("does not invent extra lookups for already-complete keys", () => {
    const spy = vi.fn();
    const complete = nextHydrateAttempt(
      undefined,
      { status: "found", ean: "1", answer: {} as never, cached: false, lookupSource: "open_food_facts" },
      0,
    );
    if (shouldAttemptHydrate(complete, 1)) spy();
    expect(spy).not.toHaveBeenCalled();
  });
});

