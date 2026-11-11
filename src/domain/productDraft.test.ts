import { describe, expect, it } from "vitest";
import { sourcesLine } from "../features/photo/PhotoResultSheet";
import type { FoundAnswer } from "../services/barcode/lookup";
import type { RecognizedProduct } from "../services/vision/types";
import { catalogByName, categoryFromName, categoryFromTags, mergeDraft, newItemFor, selectIdentityCandidate } from "./productDraft";
import type { SavedItem } from "./types";
import type { VisualCandidate } from "../services/vision/types";

const CALVE = "8710400000006";

const OFF: FoundAnswer = {
  ean: CALVE,
  status: "off-exact",
  product: { name: "Pindakaas", brand: "Calvé", quantity: "350 g", imageUrl: "https://images.openfoodfacts.org/x.jpg", nutriScore: "C", per100: { sugars: 6.5, salt: 0.9 }, categories: ["en:spreads"] },
  source: { kind: "off", name: "Open Food Facts", url: `https://world.openfoodfacts.org/product/${CALVE}`, dataLicense: "ODbL", imageLicense: "CC BY-SA" },
  at: 1,
};

const WEB: FoundAnswer = {
  ean: CALVE,
  status: "web-page",
  product: { name: "Pindakaas met stukjes pinda", brand: "Calvé", quantity: "350 g" },
  source: { kind: "web", name: "jumbo.com", url: "https://www.jumbo.com/p" },
  at: 1,
};

const PHOTO: RecognizedProduct = {
  recognized: true,
  productName: "Calvé Pindakaas",
  genericName: "Pindakaas",
  brand: "Calvé",
  variant: "Met stukjes pinda",
  packageSize: "600 g",
  category: "houdbaar",
  subcategory: "pindakaas",
  ean: null,
  visibleNutriScore: null,
  visibleClaims: [],
  inferredFields: ["packageSize"],
  confidence: "medium",
  needsConfirmation: false,
  containsPeople: false,
  catalogType: "pindakaas",
  specificProduct: true,
  visibleIngredients: null,
  alternative: { status: "none", evidence: "none", criteria: [], alternativeType: null, targetType: null, reason: null, parentExplanation: null, childPrompt: null },
};

describe("merging barcode, photo and my products", () => {
  it("surfaces a pack-size conflict without blocking Nutri-Score", () => {
    const draft = mergeDraft({
      ean: CALVE,
      barcode: {
        ...OFF,
        pack: {
          conflict: true,
          sources: [
            { source: "openfoodfacts", quantityRaw: "220 ml", quantityMl: 220 },
            { source: "prijsprofeet", quantityRaw: "1 l", quantityMl: 1000 },
          ],
        },
      },
    });
    expect(draft.packConflict).toEqual({ raw: ["220 ml", "1 l"], choices: ["220 ml", "1 liter"] });
    expect(draft.pack.packConflict).toEqual(draft.packConflict);
    expect(draft.pack.nutrition?.nutriscore).toBe("c");
    expect(draft.unsure).toBe(true);
  });

  it("a complete Open Food Facts record needs no photo and keeps each field's source", () => {
    const draft = mergeDraft({ ean: CALVE, barcode: OFF });
    expect(draft).toMatchObject({ name: "Pindakaas", ean: CALVE, recognized: true, unsure: false, keepPhoto: true, imageUrl: OFF.product.imageUrl, match: { id: "pindakaas" } });
    expect(draft.fields.brand).toEqual({ value: "Calvé", source: "off", verified: false });
    expect(draft.pack).toMatchObject({
      ean: CALVE,
      brand: "Calvé",
      packageSize: "350 g",
      imageUrl: OFF.product.imageUrl,
      barcode: { status: "off-exact", sourceName: "Open Food Facts" },
      nutrition: { nutriscore: "c", sugars100g: 6.5, salt100g: 0.9 },
      fieldSources: { name: "off", brand: "off", packageSize: "off", image: "off", nutrition: "off" },
    });
    expect(sourcesLine(draft, false)).toBe("Gegevens: Open Food Facts (ODbL), foto CC BY-SA. Controleer het altijd even zelf.");
  });

  it("Open Food Facts beats what the photo read, and what the photo read beats a web page or a guess", () => {
    const off = mergeDraft({ ean: CALVE, barcode: OFF, photo: PHOTO });
    expect(off.fields.name).toMatchObject({ value: "Pindakaas", source: "off" });
    expect(off.fields.variant).toMatchObject({ value: "Met stukjes pinda", source: "photo" });
    expect(off.fields.packageSize).toMatchObject({ value: "350 g", source: "off" });
    expect(off.pack.recognition?.variant).toBe("Met stukjes pinda");

    const web = mergeDraft({ ean: CALVE, barcode: WEB, photo: PHOTO });
    expect(web.fields.name).toMatchObject({ value: "Calvé Pindakaas", source: "photo" });
    expect(web.fields.packageSize).toMatchObject({ value: "350 g", source: "web" });
    expect(web.unsure).toBe(false);
    expect(sourcesLine(web, true)).toBe("Gevonden op jumbo.com via de streepjescode. Herkend met OpenAI. Controleer het altijd even zelf.");

    expect(mergeDraft({ ean: CALVE, barcode: WEB })).toMatchObject({ unsure: false, recognized: true });
    expect(
      mergeDraft({
        ean: CALVE,
        barcode: { ...WEB, status: "off-partial", product: { name: "Pindakaas" }, source: OFF.source },
      }).unsure,
    ).toBe(true);

    const guess = mergeDraft({ photo: PHOTO });
    expect(guess.fields.packageSize).toMatchObject({ value: "600 g", source: "guess" });
    expect(guess.pack.packageSize).toBeUndefined();
    expect(guess.pack.ean).toBeUndefined();
  });

  it("never lets an uncertain source overwrite what the parent confirmed before", () => {
    const mine = { name: "Onze pindakaas", brand: "Calvé", ean: CALVE, productId: "pindakaas", icon: "pindakaas", category: "pantry", quantity: 1, photoId: "p1", source: "off" } as SavedItem;
    const draft = mergeDraft({ ean: CALVE, mine, barcode: OFF, photo: { ...PHOTO, brand: "Calvé" } });
    expect(draft.fields.name).toEqual({ value: "Onze pindakaas", source: "parent", verified: true });
    expect(draft.fields.packageSize).toMatchObject({ value: "350 g", source: "off" });
    expect(draft).toMatchObject({ photoId: "p1", unsure: false, recognized: true });
    expect(mergeDraft({ ean: CALVE, mine })).toMatchObject({ name: "Onze pindakaas", unsure: false });
  });

  it("flags a photo that shows another brand than the barcode says", () => {
    const draft = mergeDraft({ ean: CALVE, barcode: OFF, photo: { ...PHOTO, brand: "Duyvis" } });
    expect(draft).toMatchObject({ unsure: true, confident: false });
    expect(draft.fields.brand?.value).toBe("Calvé");
  });

  it("a scanned code with nothing found leaves the parent to fill it in, but keeps the code", () => {
    expect(mergeDraft({ ean: CALVE })).toMatchObject({ name: "", ean: CALVE, recognized: false, pack: { ean: CALVE } });
  });

  it("keeps Nutri-Score from Open Food Facts on a PrijsProfeet web-page answer", () => {
    const merged: FoundAnswer = {
      ...WEB,
      product: {
        ...WEB.product,
        nutriScore: "C",
        per100: { sugars: 6.5 },
        ingredients: "pinda's, zout",
        imageUrl: "https://images.openfoodfacts.org/x.jpg",
      },
    };
    const draft = mergeDraft({ ean: CALVE, barcode: merged });
    expect(draft.pack.nutrition).toEqual({ nutriscore: "c", sugars100g: 6.5 });
    expect(draft.pack.ingredients).toBe("pinda's, zout");
    expect(draft.pack.imageUrl).toBe(merged.product.imageUrl);
    expect(draft.pack.fieldSources?.nutrition).toBe("off");
    expect(sourcesLine(draft, false)).toContain("Voeding: Open Food Facts (ODbL)");
    expect(sourcesLine(draft, false)).toContain("jumbo.com");
  });

  it("uses only exact catalog names and clear Open Food Facts shop sections", () => {
    expect(catalogByName("Pindakaas")?.id).toBe("pindakaas");
    expect(catalogByName("Chocoladereep melk")).toBeNull();
    expect(categoryFromTags(["en:frozen-desserts", "en:ice-creams"])).toBe("frozen");
    expect(categoryFromTags(["en:dairy-desserts", "en:custards"])).toBe("dairy");
    expect(categoryFromTags(["en:spreads", "en:peanut-butters"])).toBeUndefined();
    expect(categoryFromName("Rum Rozijnen vla")).toBe("dairy");
    expect(mergeDraft({ ean: CALVE, barcode: { ...OFF, product: { ...OFF.product, name: "Rum Rozijnen vla", categories: [] } } }).category).toBe(
      "dairy",
    );
  });

  it("puts drinks in Dranken from PP slug, OFF tags, department, or name", () => {
    expect(mergeDraft({ ean: CALVE, barcode: { ...WEB, product: { ...WEB.product, categories: ["frisdrank"] } } }).category).toBe("drinks");
    expect(
      mergeDraft({
        ean: CALVE,
        barcode: { ...WEB, product: { name: "Pepsi", brand: "Pepsi", categories: ["en:sodas"] } },
      }).category,
    ).toBe("drinks");
    expect(mergeDraft({ ean: CALVE, barcode: { ...WEB, department: "drinks", product: { name: "Pepsi", brand: "Pepsi" } } }).category).toBe(
      "drinks",
    );
    expect(mergeDraft({ ean: CALVE, barcode: { ...WEB, product: { name: "Cola zero", brand: "Coca-Cola" } } }).category).toBe("drinks");
  });

  it("prefers barcode department over a wrong vision houdbaar section", () => {
    const draft = mergeDraft({
      ean: CALVE,
      barcode: { ...WEB, department: "drinks", product: { name: "Pepsi", brand: "Pepsi", categories: ["frisdrank"] } },
      photo: { ...PHOTO, productName: "Pepsi", genericName: "Frisdrank", brand: "Pepsi", category: "houdbaar" },
    });
    expect(draft.category).toBe("drinks");
  });

  it("copies confirmed catalog ids from the barcode answer onto the pack", () => {
    const draft = mergeDraft({
      ean: CALVE,
      barcode: { ...OFF, catalogProductId: "b-abc123def456", catalogVariantId: "aabbccddeeff001122334455" },
    });
    expect(draft.pack).toMatchObject({ catalogProductId: "b-abc123def456", catalogVariantId: "aabbccddeeff001122334455" });
    expect(draft.match?.id).toBe("pindakaas");
    const { item } = newItemFor(draft, draft.name, draft.category);
    expect(item.productId).toBe("pindakaas");
    expect(item.pack?.catalogProductId).toBe("b-abc123def456");
  });

  it("S6: generic Melk without EAN keeps the bundled drawing id and invents no catalog ids", () => {
    const match = catalogByName("Melk");
    expect(match?.id).toBe("melk");
    const draft = {
      name: "Melk",
      category: "dairy" as const,
      icon: "melk",
      match,
      keepPhoto: false,
      fields: {},
      pack: {},
      from: {},
      unsure: false,
      confident: true,
      recognized: true,
    };
    const { item, withPhoto } = newItemFor(draft, "Melk", "dairy");
    expect(item).toMatchObject({ productId: "melk", icon: "melk" });
    expect(item.pack?.catalogProductId).toBeUndefined();
    expect(item.pack?.ean).toBeUndefined();
    expect(withPhoto).toBe(false);
  });
});

describe("multi-candidate photo selection", () => {
  const salame: VisualCandidate = {
    observedCandidateId: "c1",
    productName: "Casa di Mama Salame",
    genericName: "pizza",
    catalogType: "pizza",
    specificProduct: true,
    brand: "Dr. Oetker",
    variant: "Salame",
    packageSize: null,
    category: "diepvries",
    subcategory: "pizza",
    ean: null,
    inferredFields: [],
    confidence: "high",
    imageUrl: "https://example.com/salame.jpg",
  };
  const speciale: VisualCandidate = {
    ...salame,
    observedCandidateId: "c2",
    productName: "Casa di Mama Speciale",
    variant: "Speciale",
    imageUrl: "https://example.com/speciale.jpg",
  };

  it("asks for a choice when several flavours are visible, then keeps only the selected one's evidence", () => {
    const draft = mergeDraft({
      photo: {
        ...PHOTO,
        productName: "Casa di Mama",
        brand: "Dr. Oetker",
        variant: null,
        catalogType: "pizza",
        category: "diepvries",
        subcategory: "pizza",
        visibleClaims: ["Primary claim"],
        visibleIngredients: "Primary ingredients",
        visibleNutriScore: "C",
        alternative: {
          status: "possible",
          evidence: "inferred",
          criteria: ["less-saturated-fat"],
          alternativeType: "dunnere pizza",
          targetType: "pizza",
          reason: "Minder vet",
          parentExplanation: "Waarschijnlijk minder vet.",
          childPrompt: "Kun jij een dunnere pizza vinden?",
        },
      },
      identityCandidates: [salame, speciale],
      recognitionOutcome: "multiple",
      needsSelection: true,
    });
    expect(draft.needsSelection).toBe(true);
    expect(draft.confident).toBe(false);
    expect(draft.identityCandidates).toHaveLength(2);

    const chosen = selectIdentityCandidate(draft, "c2");
    expect(chosen.needsSelection).toBe(false);
    expect(chosen.recognitionOutcome).toBe("single");
    expect(chosen.name).toMatch(/Speciale/);
    expect(chosen.fields.variant?.value).toBe("Speciale");
    expect(chosen.fields.brand?.value).toBe("Dr. Oetker");
    expect(chosen.identityCandidates).toEqual([speciale]);
    expect(chosen.imageUrl).toBe("https://example.com/speciale.jpg");
    expect(chosen.omitCapturePhoto).toBe(true);
    expect(chosen.pack.ean).toBeUndefined();
    expect(chosen.pack.nutrition).toBeUndefined();
    expect(chosen.pack.ingredients).toBeUndefined();
    expect(chosen.pack.alternative).toBeUndefined();
    expect(chosen.pack.recognition?.claims).toBeUndefined();
    expect(chosen.pack.recognition?.ingredientsSeen).toBeUndefined();
    expect(newItemFor(chosen, chosen.name, chosen.category).withPhoto).toBe(false);
  });
});
