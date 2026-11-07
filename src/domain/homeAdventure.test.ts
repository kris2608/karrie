import { describe, expect, it } from "vitest";
import { createItem } from "../data/sample";
import { productById } from "../data/catalog";
import type { FoundAnswer } from "../services/barcode/lookup";
import type { RecognizedProduct } from "../services/vision/types";
import { CHALLENGES, challengeFor, fitsChallenge } from "./challenges";
import { childName, collectedLine, createScanGate, discoveredCount, discoveryVerdict, milestoneReached } from "./homeAdventure";
import { mergeDraft, newItemFor } from "./productDraft";
import type { AdventureItem } from "./types";

const MILK_EAN = "8712800000004";

const NONE = { status: "none", evidence: "none", criteria: [], alternativeType: null, targetType: null, reason: null, parentExplanation: null, childPrompt: null } as const;

const BANANA: RecognizedProduct = {
  recognized: true,
  productName: "Bananen",
  genericName: "Banaan",
  brand: null,
  variant: null,
  packageSize: null,
  category: "groente-fruit",
  subcategory: "banaan",
  ean: null,
  visibleNutriScore: null,
  visibleClaims: [],
  inferredFields: [],
  confidence: "high",
  needsConfirmation: false,
  containsPeople: false,
  catalogType: "banaan",
  specificProduct: false,
  visibleIngredients: null,
  alternative: { ...NONE, criteria: [] },
};

const UNSURE_APPLE: RecognizedProduct = { ...BANANA, productName: "Appel", genericName: "Appel", subcategory: "appel", catalogType: "appel", confidence: "low", needsConfirmation: true };

const NOTHING: RecognizedProduct = { ...BANANA, recognized: false, productName: null, genericName: null, subcategory: null, catalogType: null, confidence: "low" };

const MILK: FoundAnswer = {
  ean: MILK_EAN,
  status: "off-exact",
  product: { name: "Halfvolle melk", brand: "Campina", quantity: "1 l", imageUrl: "https://images.openfoodfacts.org/milk.jpg", categories: ["en:milks"] },
  source: { kind: "off", name: "Open Food Facts", url: `https://world.openfoodfacts.org/product/${MILK_EAN}`, dataLicense: "ODbL", imageLicense: "CC BY-SA" },
  at: 1,
};

const WEB_MILK: FoundAnswer = { ...MILK, status: "web-page", source: { kind: "web", name: "winkel.nl", url: "https://winkel.nl/p" } };

const listed = (id: string): AdventureItem => createItem(productById(id)!, 1);

describe("what the child sees after the camera", () => {
  it("a loose banana goes straight into the basket with the catalog drawing and no photo", () => {
    const draft = mergeDraft({ photo: BANANA });
    expect(discoveryVerdict(draft, [])).toEqual({ kind: "collect" });
    expect(childName(draft)).toBe("Banaan");
    const { item, withPhoto } = newItemFor(draft, draft.name, draft.match!.category);
    expect(item).toMatchObject({ productId: "banaan", icon: "banaan", category: "produce", via: "photo" });
    expect(withPhoto).toBe(false);
  });

  it("an exact milk barcode goes straight in and keeps its branded picture", () => {
    const draft = mergeDraft({ ean: MILK_EAN, barcode: MILK });
    expect(discoveryVerdict(draft, [])).toEqual({ kind: "collect" });
    const { item, withPhoto } = newItemFor(draft, draft.name, draft.category);
    expect(item.via).toBe("barcode");
    expect(item.pack).toMatchObject({ ean: MILK_EAN, imageUrl: MILK.product.imageUrl, brand: "Campina" });
    expect(withPhoto).toBe(true);
    expect(childName(draft)).toBe("Halfvolle melk");
  });

  it("an unsure apple is asked first, and a yes puts it in", () => {
    const draft = mergeDraft({ photo: UNSURE_APPLE });
    expect(discoveryVerdict(draft, [])).toEqual({ kind: "ask" });
    expect(discoveryVerdict(draft, [], true)).toEqual({ kind: "collect" });
  });

  it("an unknown photo, a barcode only a web page knows, or nothing at all goes to a parent", () => {
    expect(discoveryVerdict(mergeDraft({ photo: NOTHING }), [])).toEqual({ kind: "parent" });
    expect(discoveryVerdict(mergeDraft({ ean: MILK_EAN, barcode: WEB_MILK }), [])).toEqual({ kind: "parent" });
    expect(discoveryVerdict(mergeDraft({ ean: MILK_EAN }), [])).toEqual({ kind: "parent" });
    expect(discoveryVerdict(null, [])).toEqual({ kind: "parent" });
  });

  it("a product already on the list is a duplicate, by drawing or by barcode", () => {
    const banana = listed("banaan");
    expect(discoveryVerdict(mergeDraft({ photo: BANANA }), [banana])).toEqual({ kind: "duplicate", item: banana });
    const milk: AdventureItem = { ...listed("melk"), productId: "photo:1", ean: MILK_EAN };
    expect(discoveryVerdict(mergeDraft({ ean: MILK_EAN, barcode: WEB_MILK }), [milk])).toEqual({ kind: "duplicate", item: milk });
    // A found item is no longer on the list to collect.
    expect(discoveryVerdict(mergeDraft({ photo: BANANA }), [{ ...banana, status: "found" }])).toEqual({ kind: "collect" });
  });
});

describe("home progress", () => {
  it("counts distinct collected items that are still on the list", () => {
    const [a, b] = [listed("appel"), listed("peer")];
    expect(discoveredCount({ items: [a, b], discovered: [a.id, b.id, "removed"] })).toBe(2);
    expect(discoveredCount({ items: [a] })).toBe(0);
    expect(discoveredCount(null)).toBe(0);
  });

  it("celebrates five once", () => {
    expect(milestoneReached(4, [])).toBeNull();
    expect(milestoneReached(5, undefined)).toBe(5);
    expect(milestoneReached(6, [5])).toBeNull();
  });

  it("says it simply", () => {
    expect(collectedLine(1)).toBe("1 product ontdekt!");
    expect(collectedLine(3)).toBe("3 producten verzameld!");
  });
});

describe("scan gate", () => {
  it("beeps once per code, and ignores the pack just collected for a moment", () => {
    const gate = createScanGate(3000);
    expect(gate.read("1", 0)).toBe("new");
    expect(gate.read("1", 100)).toBe("again");
    gate.hold("1", 1000);
    expect(gate.read("1", 2000)).toBe("held");
    expect(gate.read("2", 2100)).toBe("new");
    expect(gate.read("1", 4100)).toBe("new");
    gate.reset();
    expect(gate.read("2", 4200)).toBe("new");
  });

  it("keeps one scanning session going: barcode, photo, barcode", () => {
    const gate = createScanGate(3000);
    expect(gate.read("A", 0)).toBe("new");
    gate.hold("A", 500);
    expect(gate.read("A", 800)).toBe("held");
    // A photo product has no code, so nothing new is held and A is still ignored for a moment.
    expect(gate.read("A", 3000)).toBe("held");
    expect(gate.read("B", 3100)).toBe("new");
    gate.hold("B", 4000);
    expect(gate.read("B", 4500)).toBe("held");
    expect(gate.read("A", 4600)).toBe("new");
  });
});

describe("search ideas", () => {
  it("are fixed per progress and match catalog products only", () => {
    expect(challengeFor(0)).toBe(challengeFor(CHALLENGES.length));
    expect(new Set(CHALLENGES.map((challenge) => challenge.id)).size).toBe(CHALLENGES.length);
    for (const challenge of CHALLENGES) for (const id of challenge.ids ?? []) expect(productById(id), id).toBeDefined();
    const fruit = CHALLENGES.find((challenge) => challenge.id === "fruit")!;
    expect(fitsChallenge(fruit, { productId: "banaan", category: "produce" })).toBe(true);
    expect(fitsChallenge(fruit, { productId: "wortel", category: "produce" })).toBe(false);
    const fridge = CHALLENGES.find((challenge) => challenge.id === "fridge")!;
    expect(fitsChallenge(fridge, { category: "dairy" })).toBe(true);
  });
});
