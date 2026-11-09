import { describe, expect, it } from "vitest";
import {
  canEncodeForQr,
  decodeSharedList,
  encodeSharedList,
  payloadFromHash,
  SHARE_LIST_QR_MAX,
  sharedListUrl,
  toImportSavedItems,
  toSharedList,
  type SharedListV1,
} from "./shareList";
import type { AdventureItem } from "./types";

const melk: AdventureItem = {
  id: "a",
  productId: "melk",
  name: "Melk",
  icon: "milk",
  category: "dairy",
  quantity: 2,
  status: "pending",
};

const hagelslag: AdventureItem = {
  id: "b",
  productId: "hagelslag",
  name: "Hagelslag",
  icon: "sprinkles",
  category: "breakfast",
  quantity: 1,
  status: "pending",
  brand: "De Ruijter",
  packageSize: "400 g",
  ean: "8710496978722",
  photoId: "local-photo",
  recognition: { confidence: "high", genericName: "hagelslag" },
  nutrition: { nutriscore: "D" },
  stars: 3,
};

const custom: AdventureItem = {
  id: "c",
  productId: "custom:cashewnoten",
  name: "Cashewnoten",
  icon: "unknown",
  category: "produce",
  quantity: 1,
  status: "pending",
  kind: "custom_generic",
};

describe("toSharedList", () => {
  it("keeps names, quantities, categories and strips private fields", () => {
    const list = toSharedList({ name: "Weekboodschappen", retailer: "albert_heijn", items: [melk, hagelslag] });
    expect(list).toMatchObject({
      version: 1,
      name: "Weekboodschappen",
      retailer: "albert_heijn",
      items: [
        { name: "Melk", quantity: 2, category: "dairy", productId: "melk" },
        { name: "Hagelslag", quantity: 1, category: "breakfast", productId: "hagelslag", brand: "De Ruijter", packageSize: "400 g", ean: "8710496978722" },
      ],
    });
    expect(JSON.stringify(list)).not.toMatch(/photoId|recognition|nutrition|stars/);
  });

  it("keeps Dutch and Unicode names and custom generics", () => {
    const fancy: AdventureItem = { ...melk, name: "Biologische volle melk 🥛", productId: "melk" };
    const list = toSharedList({ name: "Boodschappenlijst", items: [fancy, custom] });
    expect(list?.items[0].name).toContain("Biologische");
    expect(list?.items[1]).toMatchObject({ name: "Cashewnoten", kind: "custom_generic", productId: "custom:cashewnoten" });
    expect(list?.name).toBeUndefined();
  });

  it("drops unverified EAN candidates and unknown catalog ids", () => {
    const bad: AdventureItem = {
      ...melk,
      productId: "not-a-real-product",
      ean: "123",
      recognition: { confidence: "low", eanCandidate: "8710496978722" },
    };
    const list = toSharedList({ name: "x", items: [bad] });
    expect(list?.items[0].ean).toBeUndefined();
    expect(list?.items[0].productId).toBeUndefined();
  });
});

describe("encode and decode", () => {
  it("round-trips a normal list", async () => {
    const source = toSharedList({ name: "Zaterdag", retailer: "jumbo", items: [melk, hagelslag, custom] })!;
    const encoded = await encodeSharedList(source);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.url).toMatch(/^https:\/\/www\.karrie\.eu\/#list=/);
    expect(encoded.payload.length).toBeGreaterThan(0);
    expect(typeof canEncodeForQr(encoded.payload)).toBe("boolean");
    if (encoded.payload.length > SHARE_LIST_QR_MAX) expect(canEncodeForQr(encoded.payload)).toBe(false);
    const decoded = await decodeSharedList(encoded.url);
    expect(decoded).toEqual({ ok: true, list: source });
  });

  it("rejects malformed, unsupported and truncated payloads", async () => {
    expect(await decodeSharedList("")).toEqual({ ok: false, code: "missing" });
    expect(await decodeSharedList("#list=nope")).toMatchObject({ ok: false, code: "malformed" });
    expect(await decodeSharedList("#list=0.e30=")).toMatchObject({ ok: false }); // {}
    const fakeVersion = btoa(JSON.stringify({ v: 99, i: [{ n: "Melk", q: 1, c: "dairy" }] }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(await decodeSharedList(`#list=0.${fakeVersion}`)).toEqual({ ok: false, code: "unsupported" });
  });

  it("parses the hash helper", () => {
    expect(payloadFromHash("#list=0.abc")).toBe("0.abc");
    expect(payloadFromHash("#other")).toBeNull();
  });
});

describe("import mapping", () => {
  it("creates local saved items without photos and with pending-ready fields", () => {
    const list: SharedListV1 = {
      version: 1,
      retailer: "lidl",
      items: [
        { name: "Melk", quantity: 2, category: "dairy", productId: "melk" },
        { name: "Hagelslag", quantity: 1, category: "breakfast", ean: "8710496978722", brand: "De Ruijter" },
      ],
    };
    const items = toImportSavedItems(list);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ productId: "melk", quantity: 2, imageKind: "generic", imageChoice: "drawing" });
    expect(items[1].ean).toBe("8710496978722");
    expect(items.every((item) => !("photoId" in item && item.photoId))).toBe(true);
  });
});

describe("sharedListUrl", () => {
  it("builds the public fragment URL", () => {
    expect(sharedListUrl("0.abc")).toBe("https://www.karrie.eu/#list=0.abc");
  });
});
