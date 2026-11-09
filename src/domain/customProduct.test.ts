import { describe, expect, it } from "vitest";
import { customName, customProductId, nameTaken, singularKey, suggestion } from "./customProduct";
import { parseName, sizeLabel } from "./typedName";
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

  it("accepts packaging words and pack sizes after the product, keeping what was typed", () => {
    expect(customName("chocomel blik")).toBe("Chocomel blik");
    expect(customName("Chocomel 1 liter")).toBe("Chocomel 1 liter");
    expect(customName("Chocomel 0% suiker")).toBe("Chocomel 0% suiker");
    for (const input of ["Chocomel 6", "blik chocomel", "1 liter chocomel", "Chocomel 1 liter 2 liter", "Chocomel 12345 ml"]) expect(customName(input), input).toBeNull();
  });
});

describe("parseName", () => {
  it("splits the product from its packaging and pack size", () => {
    expect(parseName("Chocomel")).toEqual({ name: "Chocomel", base: "Chocomel" });
    expect(parseName("chocomel blik")).toEqual({ name: "Chocomel blik", base: "Chocomel", packaging: "can" });
    expect(parseName("Chocomel 1 liter")).toEqual({ name: "Chocomel 1 liter", base: "Chocomel", size: { unit: "ml", amount: 1000 } });
    expect(parseName("Chocomel 1,5l")?.size).toEqual({ unit: "ml", amount: 1500 });
    expect(parseName("Chocomel 6 x 200 ml")).toMatchObject({ base: "Chocomel", packaging: "multipack", size: { unit: "ml", amount: 200, count: 6 } });
    expect(parseName("Chocomel 4-pack")).toMatchObject({ base: "Chocomel", packaging: "multipack" });
    expect(parseName("Chocomel 0% suiker")).toEqual({ name: "Chocomel 0% suiker", base: "Chocomel 0% suiker" });
    expect(parseName("Calvé pindakaas 350 g")).toMatchObject({ base: "Calvé pindakaas", size: { unit: "g", amount: 350 } });
    expect(parseName("Nutella pot")).toMatchObject({ base: "Nutella", packaging: "jar" });
    expect(parseName("walnoten")).toEqual({ name: "Walnoten", base: "Walnoten" });
  });

  it("labels sizes the way packs do", () => {
    expect(sizeLabel({ unit: "ml", amount: 1000 })).toBe("1 l");
    expect(sizeLabel({ unit: "ml", amount: 1500 })).toBe("1,5 l");
    expect(sizeLabel({ unit: "ml", amount: 200, count: 6 })).toBe("6 x 200 ml");
    expect(sizeLabel({ unit: "g", amount: 350 })).toBe("350 g");
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
    expect(suggestion("tomaten", [])).toMatchObject({ kind: "catalog", product: { id: "tomaat" }, close: false });
    expect(suggestion("walnoten", [])).toBeNull();
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

describe("nameTaken", () => {
  const names = ["Sinaasappelsap", "Frisdrank", "Walnoten", "Humus"];

  it("blocks only the same name, in either form", () => {
    expect(nameTaken("walnoot", names)).toBe(true);
    expect(nameTaken("Frisdrank", names)).toBe(true);
    expect(nameTaken("humus", names)).toBe(true);
  });

  it("leaves room for similar names, aliases and typos at the nameTaken layer", () => {
    expect(nameTaken("appelsap", names)).toBe(false);
    expect(nameTaken("cola", names)).toBe(false);
    expect(nameTaken("hummus", names)).toBe(false);
    expect(nameTaken("", names)).toBe(false);
  });
});

describe("suggestion covers aliases for search pinning", () => {
  it("maps cola to Frisdrank without needing nameTaken", () => {
    expect(suggestion("cola", [])).toMatchObject({ kind: "catalog", product: { id: "frisdrank" }, close: false });
  });
});
