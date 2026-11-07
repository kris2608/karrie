import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { products } from "../data/catalog";
import type { AlternativeAssessment } from "../domain/types";
import { resetTracking, trackEvent, type Tracked } from "../services/analytics";
import type { BarcodeOutcome } from "../services/barcode/lookup";
import { analyticsEvents, barcodeSource } from "./analyticsEvents";
import { initialState, reducer, type Action, type AppState } from "./reducer";

const [first, second] = products;
const later = products.find((product) => product.category === "household")!;

function run(state: AppState, action: Action): { state: AppState; events: Tracked[] } {
  const next = reducer(state, action);
  return { state: next, events: analyticsEvents(action, state, next) };
}

function names(events: Tracked[]) {
  return events.map((entry) => entry.event.name);
}

function play(actions: Action[], from: AppState = initialState) {
  let state = from;
  const events: Tracked[] = [];
  for (const action of actions) {
    const step = run(state, action);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

const SWEET: AlternativeAssessment = {
  status: "possible",
  evidence: "label",
  criteria: ["no-added-sugar", "no-added-salt"],
  alternativeType: "100% pindakaas",
  targetType: "pindakaas",
  childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
  source: "photo",
  assessedAt: 1,
};

const pindakaas: Action = {
  type: "add-recognized",
  name: "Calvé Pindakaas",
  category: "pantry",
  icon: "pindakaas",
  productId: "pindakaas",
  pack: { brand: "Calvé", ean: "8710400000000", recognition: { confidence: "high" }, alternative: SWEET },
  via: "barcode",
};

describe("analytics events", () => {
  it("counts a new list once, at its first product, and each new line as an added product", () => {
    const { events } = play([
      { type: "add-product", product: first },
      { type: "add-product", product: first },
      { type: "add-product", product: second },
    ]);
    expect(names(events)).toEqual(["shopping_list_created", "product_added", "product_added"]);
    expect(events[1].event).toEqual({ name: "product_added", data: { method: "catalog", category: first.category } });
    expect(events[0].once).toBeTruthy();
  });

  it("counts pasting ten products as one new list with ten added products", () => {
    const lines = products.slice(0, 10).map((product) => ({ product, quantity: 2 }));
    const { events } = run(initialState, { type: "add-lines", lines });
    expect(names(events).filter((name) => name === "shopping_list_created")).toHaveLength(1);
    expect(events.filter((entry) => entry.event.name === "product_added").map((entry) => "data" in entry.event && entry.event.data)).toEqual(
      products.slice(0, 10).map((product) => ({ method: "paste", category: product.category })),
    );
  });

  it("does not count opening a saved list as a new one, nor adding to it", () => {
    const saved = play([{ type: "add-product", product: first }, { type: "save-favorite", name: "Zaterdag" }, { type: "new-draft" }]).state;
    const id = saved.saved[0].id;
    const { events } = play([{ type: "open-saved", id }, { type: "add-product", product: second }], saved);
    expect(names(events)).toEqual(["product_added"]);
  });

  it("does not count undoing a removal, or a recognised product without a name", () => {
    const listed = play([{ type: "add-product", product: first }]).state;
    const item = listed.adventure!.items[0];
    const { events } = play(
      [
        { type: "remove-item", itemId: item.id },
        { type: "insert-item", item, index: 0 },
        { type: "add-recognized", name: "  ", category: "pantry", icon: "pindakaas", via: "photo" },
      ],
      listed,
    );
    expect(events).toEqual([]);
  });

  it("uses the identification method of a confirmed product, and manual without one", () => {
    expect(run(initialState, pindakaas).events[1].event).toEqual({ name: "product_added", data: { method: "barcode", category: "pantry" } });
    const manual: Action = { type: "add-recognized", name: "Iets", category: "household", icon: "x" };
    expect(run(initialState, manual).events[1].event).toEqual({ name: "product_added", data: { method: "manual", category: "household" } });
  });

  it("starts an adventure once; going back to it is not another start", () => {
    const listed = play([{ type: "add-product", product: first }, { type: "add-product", product: second }]).state;
    const start = run(listed, { type: "start-shopping" });
    expect(start.events).toEqual([{ event: { name: "adventure_started", data: { item_count: 2 } }, once: listed.adventure!.id }]);
    expect(run(start.state, { type: "start-shopping" }).events).toEqual([]);
  });

  it("completes once, even after undo and found again", () => {
    const shopping = play([{ type: "add-product", product: first }, { type: "add-product", product: second }, { type: "start-shopping" }]).state;
    const finish = play([{ type: "found" }, { type: "found" }], shopping);
    expect(finish.events).toEqual([{ event: { name: "adventure_completed", data: { item_count: 2, completed_missions: 0 } }, once: shopping.adventure!.id }]);
    const again = play([{ type: "undo" }, { type: "found" }], finish.state);
    expect(again.events[0].once).toBe(finish.events[0].once);
  });

  it("counts a finished bonus mission with the choice, not when it is shown, accepted or skipped", () => {
    const listed = play([pindakaas, { type: "add-product", product: later }]).state;
    const offered = run(listed, { type: "start-shopping" }).state;
    expect(play([{ type: "mission-skip" }], offered).events).toEqual([]);
    const accepted = run(offered, { type: "mission-accept" });
    expect(accepted.events).toEqual([]);
    const done = run(accepted.state, { type: "mission-done", keep: "alternative" });
    expect(done.events).toEqual([{ event: { name: "bonus_mission_completed", data: { choice: "alternative" } }, once: expect.stringContaining(listed.adventure!.id) }]);
    const finished = run(done.state, { type: "found" });
    expect(finished.events[0].event).toEqual({ name: "adventure_completed", data: { item_count: 2, completed_missions: 1 } });
  });

  it("counts keeping the original as original, and the last mission also completes the adventure", () => {
    const shopping = play([pindakaas, { type: "start-shopping" }, { type: "mission-accept" }]).state;
    const { events } = run(shopping, { type: "mission-done", keep: "original" });
    expect(events.map((entry) => entry.event)).toEqual([
      { name: "bonus_mission_completed", data: { choice: "original" } },
      { name: "adventure_completed", data: { item_count: 1, completed_missions: 1 } },
    ]);
  });

  it("sends nothing for hydrating or settings", () => {
    const stored = play([{ type: "add-product", product: first }, { type: "start-shopping" }]).state;
    expect(run(initialState, { type: "hydrate", data: stored }).events).toEqual([]);
    expect(run(stored, { type: "set-sound", enabled: true }).events).toEqual([]);
  });

  it("never puts product names, codes or list names in the event data", () => {
    const { events } = play([pindakaas, { type: "save-favorite", name: "Weekboodschappen", store: "Jumbo" }, { type: "start-shopping" }, { type: "mission-accept" }, { type: "mission-done", keep: "alternative" }]);
    const sent = JSON.stringify(events.map((entry) => entry.event));
    for (const secret of ["Calvé", "Pindakaas", "8710400000000", "Weekboodschappen", "Jumbo"]) expect(sent).not.toContain(secret);
  });
});

describe("barcode sources", () => {
  const off = { status: "off-exact" as const, ean: "1", product: {}, at: 1, source: { kind: "off" as const, name: "Open Food Facts" as const, url: "https://x", dataLicense: "ODbL" as const } };
  it("names where a barcode answer came from and ignores misses", () => {
    expect(barcodeSource({ status: "found", ean: "1", answer: off, cached: false })).toBe("open_food_facts");
    expect(barcodeSource({ status: "found", ean: "1", answer: { ...off, status: "web-page", source: { kind: "web", name: "jumbo.com", url: "https://x" } }, cached: false })).toBe("web_search");
    expect(barcodeSource({ status: "found", ean: "1", answer: off, cached: true })).toBe("cache");
    expect(barcodeSource({ status: "mine", ean: "1", item: { productId: "x", name: "x", icon: "x", category: "pantry", quantity: 1 } } as BarcodeOutcome)).toBe("my_products");
    for (const status of ["none", "offline"] as const) expect(barcodeSource({ status, ean: "1" })).toBeNull();
    expect(barcodeSource({ status: "error", ean: "1", code: "timeout" })).toBeNull();
  });
});

describe("events sent to a mocked Umami", () => {
  const track = vi.fn();
  beforeEach(() => {
    resetTracking();
    track.mockReset();
    vi.stubGlobal("window", { umami: { track } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a whole trip, with removing everything, undo and found again, sends each milestone once", () => {
    let { state, events } = play([{ type: "add-product", product: first }]);
    const item = state.adventure!.items[0];
    const rest = play(
      [
        { type: "set-quantity", itemId: item.id, quantity: 3 },
        { type: "remove-item", itemId: item.id },
        { type: "add-product", product: first },
        { type: "add-product", product: second },
        { type: "start-shopping" },
        { type: "found" },
        { type: "found" },
        { type: "undo" },
        { type: "found" },
      ],
      state,
    );
    state = rest.state;
    events = [...events, ...rest.events];
    for (const { event, once } of events) trackEvent(event, once);
    expect(track.mock.calls.map(([name]) => name)).toEqual([
      "shopping_list_created",
      "product_added",
      "product_added",
      "product_added",
      "adventure_started",
      "adventure_completed",
    ]);
    expect(state.adventure!.phase).toBe("done");
  });
});
