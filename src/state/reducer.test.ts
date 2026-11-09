import { expect, it } from "vitest";
import { DEFAULT_LIST_NAME, initialState, listName, recognizeList, reducer } from "./reducer";

function shop() {
  return reducer(initialState, { type: "start-sample" });
}

it("herkent een geplakte lijst", () => {
  const lines = recognizeList("2x melk\nbrood\n- 3 appels\nmeik");
  expect(lines.map((line) => [line.quantity, line.product?.id])).toEqual([
    [2, "melk"],
    [1, "brood"],
    [3, "appel"],
    [1, "melk"],
  ]);
});

it("bewaart een mis-tik als ongedaan en geeft een sticker aan het eind", () => {
  let state = shop();
  const first = state.adventure?.items[0].productId;
  state = reducer(state, { type: "found" });
  expect(state.adventure?.items.find((item) => item.productId === first)?.status).toBe("found");
  state = reducer(state, { type: "undo" });
  expect(state.adventure?.items.every((item) => item.status === "pending")).toBe(true);

  state = reducer(state, { type: "skip" });
  expect(state.adventure?.items.at(-1)?.status).toBe("skipped");
  state = reducer(state, { type: "undo" });

  for (let step = 0; step < 4; step += 1) state = reducer(state, { type: "found" });
  expect(state.adventure?.phase).toBe("done");
  expect(state.adventure?.stickerId).toBe("ster");
  expect(state.stickers).toEqual(["ster"]);
  expect(state.saved[0]?.items).toHaveLength(4);

  state = reducer(state, { type: "undo" });
  expect(state.adventure?.phase).toBe("shopping");
  expect(state.stickers).toEqual([]);
});

it("telt twee keer gevonden als precies twee producten", () => {
  let state = shop();
  state = reducer(state, { type: "found" });
  state = reducer(state, { type: "found" });
  expect(state.adventure?.items.filter((item) => item.status === "found")).toHaveLength(2);
  expect(state.adventure?.history).toHaveLength(2);
  expect(state.adventure?.phase).toBe("shopping");
});

it("bewaart de geluidsinstelling en zet die standaard uit", () => {
  expect(initialState.settings.soundEnabled).toBe(false);
  const on = reducer(initialState, { type: "set-sound", enabled: true });
  expect(on.settings.soundEnabled).toBe(true);
  const hydrated = reducer(initialState, { type: "hydrate", data: {} });
  expect(hydrated.settings.soundEnabled).toBe(false);
});

it("bewaart een nieuw lijstje voor later zonder het avontuur te starten", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  state = reducer(state, { type: "save-favorite" });
  expect(state.adventure?.phase).toBe("draft");
  expect(state.saved[0]).toMatchObject({ id: state.adventure?.id, favorite: true });
  expect(state.saved[0].items.map((item) => item.productId)).toEqual(["banaan"]);
});

it("wist open producten van het lijstje maar laat gevonden regels en de winkel staan", () => {
  const banaan = recognizeList("banaan")[0].product!;
  const melk = recognizeList("melk")[0].product!;
  let state = reducer(initialState, { type: "set-retailer", retailer: "jumbo" });
  state = reducer(state, { type: "add-product", product: banaan });
  state = reducer(state, { type: "add-product", product: melk });
  state = reducer(state, { type: "start-shopping" });
  const firstId = state.adventure!.items[0].id;
  state = reducer(state, { type: "found" });
  expect(state.adventure?.items.find((item) => item.id === firstId)?.status).toBe("found");

  const open = state.adventure!.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status !== "found");
  state = reducer(state, { type: "clear-open-items" });
  expect(state.adventure?.retailer).toBe("jumbo");
  expect(state.adventure?.items.map((item) => item.id)).toEqual([firstId]);

  for (const { item, index } of open) state = reducer(state, { type: "insert-item", item, index });
  expect(state.adventure?.items).toHaveLength(2);
  expect(state.adventure?.items.some((item) => item.status !== "found")).toBe(true);
});

it("wist een bewaard lijstje, zet het terug op zijn plek en wist alles", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = initialState;
  for (let i = 0; i < 3; i += 1) {
    state = reducer(state, { type: "new-draft" });
    state = reducer(state, { type: "add-product", product: banaan });
    state = reducer(state, { type: "save-favorite" });
  }
  const ids = state.saved.map((list) => list.id);
  expect(ids).toHaveLength(3);
  const middle = state.saved[1];
  state = reducer(state, { type: "forget-saved", id: middle.id });
  expect(state.saved.map((list) => list.id)).toEqual([ids[0], ids[2]]);
  state = reducer(state, { type: "restore-saved", list: middle, index: 1 });
  expect(state.saved.map((list) => list.id)).toEqual(ids);
  state = reducer(state, { type: "clear-saved" });
  expect(state.saved).toEqual([]);
  expect(state.adventure?.items).toHaveLength(1);
});

it("wist een bewaard lijstje, zet het terug op zijn plek en wist alles", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = initialState;
  for (let i = 0; i < 3; i += 1) {
    state = reducer(state, { type: "new-draft" });
    state = reducer(state, { type: "add-product", product: banaan });
    state = reducer(state, { type: "save-favorite" });
  }
  const ids = state.saved.map((list) => list.id);
  expect(ids).toHaveLength(3);
  const middle = state.saved[1];
  state = reducer(state, { type: "forget-saved", id: middle.id });
  expect(state.saved.map((list) => list.id)).toEqual([ids[0], ids[2]]);
  state = reducer(state, { type: "restore-saved", list: middle, index: 1 });
  expect(state.saved.map((list) => list.id)).toEqual(ids);
  state = reducer(state, { type: "clear-saved" });
  expect(state.saved).toEqual([]);
  expect(state.adventure?.items).toHaveLength(1);
});

it("een gewist lijstje komt niet vanzelf terug als vorig lijstje", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  state = reducer(state, { type: "save-favorite" });
  state = reducer(state, { type: "clear-saved" });
  expect(reducer(state, { type: "new-draft" }).saved).toEqual([]);

  // Lang drukken en dan Ongedaan maken: dan hoort het er weer bij.
  const id = state.adventure!.id;
  const kept = reducer(reducer(state, { type: "restore-saved", list: { id, name: "x", items: [], favorite: false, updatedAt: 1 }, index: 0 }), { type: "new-draft" });
  expect(kept.saved.map((list) => list.id)).toEqual([id]);

  // Zelf weer bewaren mag altijd.
  expect(reducer(state, { type: "save-favorite" }).saved.map((list) => list.id)).toEqual([id]);
});

it("een afgerond avontuur dat gewist is, komt niet terug na nieuw avontuur of terug", () => {
  let state = shop();
  for (let step = 0; step < 4; step += 1) state = reducer(state, { type: "found" });
  expect(state.saved).toHaveLength(1);
  state = reducer(state, { type: "forget-saved", id: state.saved[0].id });
  expect(reducer(state, { type: "undo" }).saved).toEqual([]);
  expect(reducer(state, { type: "new-draft" }).saved).toEqual([]);
});

it("bewaart een lijstje met een naam en supermarkt en neemt die mee bij openen", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  expect(listName(state.adventure!)).toBeUndefined();
  state = reducer(state, { type: "save-favorite", name: "  Weekboodschappen ", store: "Albert Heijn" });
  expect(state.saved[0]).toMatchObject({ name: "Weekboodschappen", store: "Albert Heijn", favorite: true });
  expect(state.adventure).toMatchObject({ name: "Weekboodschappen", store: "Albert Heijn" });

  state = reducer(state, { type: "new-draft" });
  state = reducer(state, { type: "open-saved", id: state.saved[0].id });
  expect(state.adventure?.id).toBe(state.saved[0].id);
  expect(listName(state.adventure!)).toBe("Weekboodschappen");
  expect(state.adventure?.store).toBe("Albert Heijn");

  state = reducer(state, { type: "save-favorite", name: "", store: " " });
  expect(state.saved[0].name).toBe(DEFAULT_LIST_NAME);
  expect(state.saved[0].store).toBeUndefined();
  expect(listName(state.saved[0])).toBeUndefined();
});

it("werkt een heropend favoriet bij zonder een tweede kopie", () => {
  const banaan = recognizeList("banaan")[0].product!;
  const melk = recognizeList("melk")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  state = reducer(state, { type: "save-favorite", name: "Week" });
  const id = state.saved[0].id;

  state = reducer(state, { type: "new-draft" });
  state = reducer(state, { type: "open-saved", id });
  expect(state.adventure?.id).toBe(id);
  state = reducer(state, { type: "add-product", product: melk });
  state = reducer(state, { type: "save-favorite" });
  expect(state.saved.filter((list) => list.favorite)).toHaveLength(1);
  expect(state.saved[0]).toMatchObject({ id, name: "Week", favorite: true });
  expect(state.saved[0].items.map((item) => item.productId).sort()).toEqual(["banaan", "melk"]);

  state = reducer(state, { type: "remove-item", itemId: state.adventure!.items.find((item) => item.productId === "banaan")!.id });
  state = reducer(state, { type: "save-favorite" });
  state = reducer(state, { type: "save-favorite" });
  expect(state.saved.filter((list) => list.favorite)).toHaveLength(1);
  expect(state.saved[0].items.map((item) => item.productId)).toEqual(["melk"]);
});

it("bewaart als nieuw een aparte favoriet en laat het origineel staan", () => {
  const banaan = recognizeList("banaan")[0].product!;
  const melk = recognizeList("melk")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  state = reducer(state, { type: "save-favorite", name: "Origineel" });
  const originalId = state.saved[0].id;

  state = reducer(state, { type: "new-draft" });
  state = reducer(state, { type: "open-saved", id: originalId });
  state = reducer(state, { type: "add-product", product: melk });
  state = reducer(state, { type: "save-favorite-as-new", name: "Kopie" });

  expect(state.adventure?.id).not.toBe(originalId);
  expect(state.adventure).toMatchObject({ id: state.saved[0].id, name: "Kopie" });
  expect(state.saved.filter((list) => list.favorite)).toHaveLength(2);
  const original = state.saved.find((list) => list.id === originalId)!;
  expect(original).toMatchObject({ name: "Origineel", favorite: true });
  expect(original.items.map((item) => item.productId)).toEqual(["banaan"]);
  expect(state.saved[0].items.map((item) => item.productId).sort()).toEqual(["banaan", "melk"]);
});

it("importeert een gedeeld lijstje als nieuw avontuur met verse ids", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  const previousId = state.adventure!.id;
  const shared = {
    version: 1 as const,
    name: "Van oma",
    retailer: "lidl" as const,
    items: [
      { name: "Melk", quantity: 2, category: "dairy" as const, productId: "melk" },
      { name: "Cashewnoten", quantity: 1, category: "produce" as const, kind: "custom_generic" as const, productId: "custom:cashewnoten" },
    ],
  };
  state = reducer(state, { type: "import-shared-list", list: shared, mode: "open" });
  expect(state.adventure?.id).not.toBe(previousId);
  expect(state.adventure).toMatchObject({ name: "Van oma", retailer: "lidl", phase: "draft" });
  expect(state.adventure?.items.map((item) => [item.name, item.quantity, item.status])).toEqual([
    ["Cashewnoten", 1, "pending"],
    ["Melk", 2, "pending"],
  ]);
  expect(state.adventure?.items.every((item) => item.id && !("photoId" in item && item.photoId))).toBe(true);
  expect(state.saved.some((list) => list.id === previousId)).toBe(true);
  expect(state.saved[0]?.name).toBe("Van oma");
  expect(state.settings.retailer).not.toBe("lidl");
});

it("bewaart een gedeeld lijstje zonder het actieve avontuur te overschrijven", () => {
  const banaan = recognizeList("banaan")[0].product!;
  let state = reducer(initialState, { type: "add-product", product: banaan });
  const currentId = state.adventure!.id;
  state = reducer(state, {
    type: "import-shared-list",
    list: {
      version: 1,
      name: "Buurvrouw",
      items: [{ name: "Brood", quantity: 1, category: "bakery", productId: "brood" }],
    },
    mode: "save-only",
  });
  expect(state.adventure?.id).toBe(currentId);
  expect(state.adventure?.items.map((item) => item.productId)).toEqual(["banaan"]);
  expect(state.saved[0]).toMatchObject({ name: "Buurvrouw", favorite: false });
  expect(state.saved[0].items[0]).toMatchObject({ name: "Brood", imageKind: "generic" });
});

it("maakt van een geplakte lijst een avontuur en bewaart een favoriet", () => {
  const lines = recognizeList("banaan\n2 pakken yoghurt").flatMap((line) =>
    line.product ? [{ product: line.product, quantity: line.quantity }] : [],
  );
  let state = reducer(initialState, { type: "add-lines", lines });
  expect(state.adventure?.items.map((item) => [item.productId, item.quantity])).toEqual([
    ["banaan", 1],
    ["yoghurt", 2],
  ]);
  state = reducer(state, { type: "start-shopping" });
  expect(state.adventure?.phase).toBe("shopping");
  expect(state.adventure?.items.map((item) => item.productId)).toEqual(["banaan", "yoghurt"]);
  state = reducer(state, { type: "save-favorite" });
  expect(state.saved[0]?.favorite).toBe(true);
});

function finish(state: ReturnType<typeof shop>) {
  const open = state.adventure!.items.filter((item) => item.status !== "found").length;
  let next = state;
  for (let step = 0; step < open; step += 1) next = reducer(next, { type: "found" });
  return next;
}

it("telt elk afgerond avontuur één keer voor de feedback-uitnodiging", () => {
  let state = finish(shop());
  const first = state.adventure!.id;
  expect(state.completedAdventures).toEqual([first]);
  expect(state.feedbackAsked).toBe(false);

  state = finish(reducer(state, { type: "undo" }));
  expect(state.completedAdventures).toEqual([first]);

  state = finish(reducer(state, { type: "start-sample" }));
  const second = state.adventure!.id;
  expect(second).not.toBe(first);
  expect(state.completedAdventures).toEqual([first, second]);

  state = reducer(state, { type: "feedback-asked" });
  expect(state.feedbackAsked).toBe(true);
  expect(reducer(state, { type: "feedback-asked" })).toBe(state);

  const restored = reducer(initialState, {
    type: "hydrate",
    data: { completedAdventures: [first, second], feedbackAsked: true, saved: [{ id: "saved-only", name: "Zaterdag", items: [], favorite: true, updatedAt: 1 }] },
  });
  expect(restored.completedAdventures).toEqual([first, second]);
  expect(restored.feedbackAsked).toBe(true);
  expect(restored.completedAdventures).not.toContain("saved-only");
});
