import { describe, expect, it } from "vitest";
import { customName, customProductId, singularKey, suggestion } from "./customProduct";
import type { SavedItem } from "./types";

describe("customName", () => {
  it("accepts plain product words and tidies them", () => {
    expect(customName("walnoten")).toBe("Walnoten");
    expect(customName("  cashew   noten ")).toBe("Cashew noten");
    expect(customName("komijn")).toBe("Komijn");
    expect(customName("crème fraîche")).toBe("Crème fraîche");
  });

  it("refuses empty, numeric and meaningless input", () => {
    for (const input of ["", " ", "a", "123", "2 kilo appels", "!!!", "melk?", "dingen", "spullen"]) {
      expect(customName(input), input).toBeNull();
    }
  });

  it("refuses whole phrases and shopping-list sentences", () => {
    expect(customName("dingen voor ontbijt")).toBeNull();
    expect(customName("brood met kaas")).toBeNull();
    expect(customName("hele ongezouten walnoten van de notenmix afdeling")).toBeNull();
    expect(customName("vier hele grote walnoten")).toBeNull();
  });
});

describe("singularKey", () => {
  it("gives singular and plural the same key", () => {
    const pairs = [
      ["walnoot", "walnoten"],
      ["cashewnoot", "cashewnoten"],
      ["rozijn", "rozijnen"],
      ["banaan", "bananen"],
      ["wortel", "wortels"],
      ["peer", "peren"],
      ["kaas", "kazen"],
      ["druif", "druiven"],
      ["bes", "bessen"],
      ["kiwi", "kiwi's"],
      ["champignon", "champignons"],
      ["aardappel", "aardappelen"],
    ];
    for (const [one, many] of pairs) expect(singularKey(many), many).toBe(singularKey(one));
  });

  it("leaves words alone that only look plural", () => {
    expect(singularKey("ijs")).toBe("ijs");
    expect(singularKey("kaas")).toBe("kaas");
    expect(singularKey("Groene thee")).toBe("groene-thee");
  });

  it("builds one product id for both forms", () => {
    expect(customProductId("Walnoten")).toBe("custom:walnoot");
    expect(customProductId("walnoot")).toBe("custom:walnoot");
  });
});

describe("suggestion", () => {
  const walnuts: SavedItem = { productId: "custom:walnoot", name: "Walnoten", icon: "pakket", category: "pantry", quantity: 1, kind: "custom_generic" };

  it("finds catalog products first, also by singular or plural", () => {
    expect(suggestion("prei", [])).toMatchObject({ kind: "catalog", product: { id: "prei" }, close: false });
    expect(suggestion("Courgettes", [])).toMatchObject({ kind: "catalog", product: { id: "courgette" }, close: false });
  });

  it("offers a typo match only as a close suggestion", () => {
    expect(suggestion("courget", [])).toMatchObject({ kind: "catalog", product: { id: "courgette" }, close: true });
  });

  it("finds a product this device made before, in either form", () => {
    expect(suggestion("walnoot", [walnuts])).toMatchObject({ kind: "mine", entry: { productId: "custom:walnoot" } });
    expect(suggestion("walnoten", [walnuts])).toMatchObject({ kind: "mine" });
  });

  it("has nothing for a product that does not exist yet", () => {
    expect(suggestion("walnoten", [])).toBeNull();
    expect(suggestion("komijn", [])).toBeNull();
    expect(suggestion("rozijnen", [])).toBeNull();
  });
});
