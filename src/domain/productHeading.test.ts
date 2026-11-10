import { describe, expect, it } from "vitest";
import { mayRefreshName, productHeading, stripBrandFromName } from "./productHeading";

describe("productHeading", () => {
  it("shows product as title and Brand · Amount as subtitle", () => {
    expect(productHeading({ name: "Karvan Cévitam Zero multivruchten siroop", brand: "Karvan Cévitam", packageSize: "0,6 l" })).toEqual({
      title: "Zero multivruchten siroop",
      subtitle: "Karvan Cévitam · 0,6 l",
      brand: "Karvan Cévitam",
      packageSize: "0,6 l",
    });
    expect(productHeading({ name: "lemon", brand: "Spa", packageSize: "1000 ml" })).toEqual({
      title: "lemon",
      subtitle: "Spa · 1000 ml",
      brand: "Spa",
      packageSize: "1000 ml",
    });
    expect(productHeading({ name: "Knoflooksaus", brand: "Calvé", packageSize: "250 ml", variant: "knoflook" })).toEqual({
      title: "Knoflooksaus",
      subtitle: "Calvé · knoflook · 250 ml",
      brand: "Calvé",
      packageSize: "250 ml",
    });
  });

  it("omits missing parts and leaves brand-only names intact", () => {
    expect(productHeading({ name: "Chocomel", brand: "Chocomel" })).toEqual({
      title: "Chocomel",
      subtitle: "Chocomel",
      brand: "Chocomel",
    });
    expect(productHeading({ name: "Appel" }).subtitle).toBeUndefined();
    expect(stripBrandFromName("Côte d'Or BonBonBloc chocoladereep", "Côte d'Or")).toBe("BonBonBloc chocoladereep");
  });

  it("gives Toevoegen mine/extra tiles a product title and Brand · Amount subtitle", () => {
    const heading = productHeading({
      name: "Karvan Cévitam Zero multivruchten siroop",
      brand: "Karvan Cévitam",
      packageSize: "0,6 l",
    });
    expect(heading).toMatchObject({ title: "Zero multivruchten siroop", subtitle: "Karvan Cévitam · 0,6 l" });
  });
});

describe("mayRefreshName", () => {
  it("keeps parent nicknames and fieldSources locks, allows catalog-like titles", () => {
    expect(mayRefreshName({ name: "Onze pindakaas", brand: "Calvé", barcode: { status: "off-exact" } }, "Pindakaas", "Calvé")).toBe(false);
    expect(mayRefreshName({ name: "Pindakaas", fieldSources: { name: "parent" } }, "Pindakaas", "Calvé")).toBe(false);
    expect(mayRefreshName({ name: "Calvé Pindakaas", brand: "Calvé", barcode: {} }, "Pindakaas", "Calvé")).toBe(true);
    expect(mayRefreshName({ name: "Pindakaas", brand: "Calvé", barcode: {} }, "Pindakaas", "Calvé")).toBe(true);
    expect(mayRefreshName({ name: "Zelf bedacht", kind: "custom_generic" }, "Pindakaas", "Calvé")).toBe(false);
  });
});
