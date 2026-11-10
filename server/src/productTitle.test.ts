import { describe, expect, it } from "vitest";
import { fromOff, mergePpWithOff } from "./barcode.js";
import { cleanProductIdentity, stripBrandFromName } from "./productTitle.js";

describe("stripBrandFromName", () => {
  it("strips a leading brand and leaves brand-equals-name alone", () => {
    expect(stripBrandFromName("Karvan Cévitam Zero multivruchten siroop", "Karvan Cévitam")).toBe("Zero multivruchten siroop");
    expect(stripBrandFromName("Calvé Knoflooksaus", "Calvé")).toBe("Knoflooksaus");
    expect(stripBrandFromName("Calve Knoflooksaus", "Calvé")).toBe("Knoflooksaus");
    expect(stripBrandFromName("Chocomel", "Chocomel")).toBe("Chocomel");
    expect(stripBrandFromName("lemon", "Spa")).toBe("lemon");
    expect(stripBrandFromName("Pindakaas", "Calvé")).toBe("Pindakaas");
  });
});

describe("barcode identity cleanup", () => {
  it("strips brand from OFF titles when brands are present", () => {
    const found = fromOff("8710400000006", {
      code: "8710400000006",
      product_name_nl: "Calvé Pindakaas",
      brands: "Calvé",
      quantity: "350 g",
    });
    expect(found).toMatchObject({ status: "off-exact", product: { name: "Pindakaas", brand: "Calvé", quantity: "350 g" } });
  });

  it("strips PP titles after merge with OFF", () => {
    const merged = mergePpWithOff(
      {
        ean: "8710395948659",
        status: "web-page",
        product: { name: "Karvan Cévitam Zero multivruchten siroop", brand: "Karvan Cévitam", quantity: "0,6 l" },
        source: { kind: "web", name: "Albert Heijn", url: "https://www.ah.nl/x" },
        at: 1,
      },
      { product: { name: "Multivruchtensiroop", brand: "Karvan Cévitam", nutriScore: "C" } },
    );
    expect(merged.product).toMatchObject({
      name: "Zero multivruchten siroop",
      brand: "Karvan Cévitam",
      quantity: "0,6 l",
      nutriScore: "C",
    });
  });

  it("cleanProductIdentity keeps brand and shortens name", () => {
    expect(cleanProductIdentity("Spa Touch lemon", "Spa")).toEqual({ name: "Touch lemon", brand: "Spa" });
  });
});
