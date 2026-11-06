import { expect, it } from "vitest";
import { initialState, recognizeList, reducer } from "./reducer";

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
