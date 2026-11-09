import { describe, expect, it } from "vitest";
import { productById } from "../data/catalog";
import {
  privateLabelLookupKey,
  privateLabelQuery,
  parsePrivateLabelLookupKey,
  wantsNameImage,
  wantsPrivateLabels,
} from "./imageIdentity";

const hagelslag = productById("hagelslag")!;

describe("private-label eligibility", () => {
  it("lets a generic catalog hagelslag request AH / Jumbo / Lidl alternatives", () => {
    const item = { name: hagelslag.name, productId: hagelslag.id, kind: undefined as undefined, category: hagelslag.category };
    expect(wantsPrivateLabels({ ...item, icon: "x" } as never, "albert_heijn")).toBe(true);
    expect(privateLabelQuery({ ...item, icon: "x" } as never)).toBe(hagelslag.name);
    expect(privateLabelLookupKey(hagelslag.name, "albert_heijn")).toBe(`private-label|albert_heijn|${hagelslag.name.toLocaleLowerCase("nl")}`);
    expect(privateLabelLookupKey(hagelslag.name, "jumbo")).toContain("|jumbo|");
    expect(privateLabelLookupKey(hagelslag.name, "lidl")).toContain("|lidl|");
  });

  it("does not request private labels without a supermarket or with an EAN", () => {
    const item = { name: "Hagelslag", productId: hagelslag.id };
    expect(wantsPrivateLabels(item as never, undefined)).toBe(false);
    expect(wantsPrivateLabels({ ...item, ean: "8710496978722" } as never, "jumbo")).toBe(false);
  });

  it("keeps manufacturer brands out and strips house-brand prefixes for adopted items", () => {
    expect(wantsPrivateLabels({ name: "Pepsi Original", brand: "Pepsi", source: "barcode", recognition: { specific: true } } as never, "jumbo")).toBe(false);
    expect(privateLabelQuery({ name: "AH Hagelslag Melk", privateLabelRetailer: "albert_heijn" } as never)).toBe("Hagelslag Melk");
    expect(wantsPrivateLabels({ name: "AH Hagelslag Melk", privateLabelRetailer: "albert_heijn" } as never, "jumbo")).toBe(true);
  });

  it("does not treat catalog generics as typed name-image lookups", () => {
    expect(wantsNameImage({ kind: undefined, ean: undefined })).toBe(false);
    expect(wantsNameImage({ kind: "custom_generic", ean: undefined })).toBe(true);
  });

  it("parses private-label lookup keys", () => {
    expect(parsePrivateLabelLookupKey("private-label|jumbo|hagelslag")).toEqual({
      name: "hagelslag",
      retailer: "jumbo",
      purpose: "private-label",
    });
    expect(parsePrivateLabelLookupKey("hagelslag|r|jumbo")).toBeNull();
  });
});
