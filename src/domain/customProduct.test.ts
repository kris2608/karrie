import { describe, expect, it } from "vitest";
import { customName, customProductId, singularKey, suggestion } from "./customProduct";
import type { SavedItem } from "./types";

describe("customName", () => {
  it("accepts plain product words and tidies them", () => {
    expect(customName("cashewnoten")).toBe("Cashewnoten");
    expect(customName("  cashewnoten ")).toBe("Cashewnoten");
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
    expect(customName("hele ongezouten cashewnoten van de notenmix afdeling")).toBeNull();
    expect(customName("vier hele grote cashewnoten")).toBeNull();
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
    expect(customProductId("Cashewnoten")).toBe("custom:cashewnoot");
    expect(customProductId("cashewnoot")).toBe("custom:cashewnoot");
  });
});

describe("suggestion", () => {
  const cashews: SavedItem = { productId: "custom:cashewnoot", name: "Cashewnoten", icon: "pakket", category: "pantry", quantity: 1, kind: "custom_generic" };

  it("finds catalog products first, also by singular or plural", () => {
    expect(suggestion("prei", [])).toMatchObject({ kind: "catalog", product: { id: "prei" }, close: false });
    expect(suggestion("Courgettes", [])).toMatchObject({ kind: "catalog", product: { id: "courgette" }, close: false });
    expect(suggestion("walnoten", [])).toMatchObject({ kind: "catalog", product: { id: "walnoten" }, close: false });
  });

  it("offers a typo match only as a close suggestion", () => {
    expect(suggestion("courget", [])).toMatchObject({ kind: "catalog", product: { id: "courgette" }, close: true });
  });

  it("finds a product this device made before, in either form", () => {
    expect(suggestion("cashewnoot", [cashews])).toMatchObject({ kind: "mine", entry: { productId: "custom:cashewnoot" } });
    expect(suggestion("cashewnoten", [cashews])).toMatchObject({ kind: "mine" });
  });

  it("has nothing for a product that does not exist yet", () => {
    expect(suggestion("cashewnoten", [])).toBeNull();
    expect(suggestion("komijn", [])).toBeNull();
    expect(suggestion("rozijnen", [])).toBeNull();
  });
});
