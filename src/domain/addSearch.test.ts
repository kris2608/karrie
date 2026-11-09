import { describe, expect, it } from "vitest";
import { initialState, reducer } from "../state/reducer";
import { productById } from "../data/catalog";
import { customAddLabel, orderedCatalogResults, pinnedCatalogGeneric } from "./addSearch";

describe("pinnedCatalogGeneric", () => {
  it.each([
    ["melk", "melk"],
    ["chips", "chips"],
    ["kwark", "kwark"],
    ["yoghurt", "yoghurt"],
    ["cola", "frisdrank"],
    ["halfvolle melk", "melk"],
    ["chipjes", "chips"],
  ])("pins %s as catalog generic %s", (query, id) => {
    expect(pinnedCatalogGeneric(query)).toMatchObject({ id });
  });

  it("does not treat typo matches as a covered generic", () => {
    expect(pinnedCatalogGeneric("courget")).toBeNull();
    expect(orderedCatalogResults("courget")[0]?.id).toBe("courgette");
  });
});

describe("customAddLabel", () => {
  const names = ["Sinaasappelsap", "Frisdrank", "Melk", "Chips", "Kwark", "Yoghurt"];

  it.each(["melk", "chips", "kwark", "yoghurt", "cola", "chipjes"])("hides Voeg toe when %s is a known generic", (query) => {
    expect(customAddLabel(query, [], names)).toBeNull();
  });

  it("still offers custom for unknowns and typo-only suggestions", () => {
    expect(customAddLabel("cashewnoten", [], names)).toBe("Cashewnoten");
    expect(customAddLabel("courget", [], names)).toBe("Courget");
  });

  it("keeps nameTaken for mine/extra collisions without a catalog pin", () => {
    expect(customAddLabel("walnoten", [], ["Walnoten"])).toBeNull();
  });
});

describe("orderedCatalogResults", () => {
  it("puts the generic first among substring hits", () => {
    expect(orderedCatalogResults("melk")[0]?.id).toBe("melk");
    expect(orderedCatalogResults("melk").some((product) => product.id === "karnemelk")).toBe(true);
  });
});

describe("add-product quantity", () => {
  it("adds melk once then increases quantity on the same list line", () => {
    const melk = productById("melk")!;
    let state = reducer(initialState, { type: "add-product", product: melk });
    expect(state.adventure?.items).toHaveLength(1);
    expect(state.adventure?.items[0]).toMatchObject({ productId: "melk", quantity: 1 });
    state = reducer(state, { type: "add-product", product: melk });
    expect(state.adventure?.items).toHaveLength(1);
    expect(state.adventure?.items[0].quantity).toBe(2);
  });
});
