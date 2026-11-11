import { describe, expect, it, vi } from "vitest";
import { catalogMatch, draftFromVision, needsCheck, visibleEan } from "../../domain/visionMapping";
import { createVisionClient, VISION_RULES, type VisionDeps } from "./client";
import type { RecognizedProduct } from "./types";

const PEANUT: RecognizedProduct = {
  recognized: true,
  productName: "100% Pindakaas Naturel",
  genericName: "Pindakaas",
  brand: "AH Terra",
  variant: "Naturel",
  packageSize: null,
  category: "houdbaar",
  subcategory: "pindakaas",
  ean: null,
  visibleNutriScore: "A",
  visibleClaims: ["100% pindakaas", "Naturel"],
  inferredFields: [],
  confidence: "high",
  needsConfirmation: true,
  containsPeople: false,
  catalogType: "pindakaas",
  specificProduct: true,
  visibleIngredients: null,
  alternative: {
    status: "none",
    evidence: "label",
    criteria: [],
    alternativeType: null,
    targetType: null,
    reason: "Al 100% pinda's.",
    parentExplanation: null,
    childPrompt: null,
  },
};

const BREAD: RecognizedProduct = {
  ...PEANUT,
  productName: null,
  genericName: "Wit brood",
  brand: null,
  variant: null,
  category: "bakker",
  subcategory: "witbrood",
  visibleClaims: [],
  visibleNutriScore: null,
  catalogType: "brood",
  specificProduct: false,
};

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

function client(fetcher: VisionDeps["fetch"], overrides: Partial<VisionDeps> = {}) {
  return createVisionClient({ fetch: fetcher, online: () => true, storage: memoryStorage(), origin: "https://api.test", now: () => Date.UTC(2026, 10, 6), ...overrides });
}

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("visionMapping", () => {
  it("maps AH Terra pindakaas to the catalog drawing and breakfast, with no EAN", () => {
    const draft = draftFromVision(PEANUT);
    expect(draft.match?.id).toBe("pindakaas");
    expect(draft).toMatchObject({ name: "100% Pindakaas Naturel", category: "breakfast", icon: "pindakaas" });
    expect(draft.pack).toMatchObject({ brand: "AH Terra", recognition: { variant: "Naturel", confidence: "high", nutriScoreSeen: "A" } });
    expect("ean" in draft.pack).toBe(false);
  });

  it("keeps Olvarit baby meals in pantry even when spinach is in the name", () => {
    const draft = draftFromVision({
      ...PEANUT,
      productName: "Olvarit Spinazie Kip Aardappel",
      brand: "Olvarit",
      genericName: "spinazie",
      subcategory: "spinazie",
      catalogType: "verse-spinazie",
      category: "groente-fruit",
      specificProduct: true,
    });
    expect(draft.category).toBe("pantry");
    expect(draft.match?.id).toBe("babyvoeding");
  });

  it("prefers the catalog type the model picked, else matches only exact names or aliases", () => {
    expect(catalogMatch({ ...PEANUT, catalogType: "brood", productName: "Wit casinobrood", subcategory: "casinobrood", genericName: "brood" })?.id).toBe("brood");
    expect(catalogMatch({ ...PEANUT, catalogType: "brood", productName: "Volkoren casino", subcategory: "volkorenbrood", genericName: null })?.id).toBe("brood");
    expect(catalogMatch({ ...PEANUT, catalogType: "jam", productName: "Mister Choc Choco Pasta", subcategory: "chocopasta", genericName: "chocopasta" })).toBeNull();
    expect(catalogMatch({ ...PEANUT, catalogType: "bestaat-niet", subcategory: null, genericName: "Melk" })?.id).toBe("melk");
    expect(catalogMatch({ ...PEANUT, catalogType: null, subcategory: "pindakaas met stukjes", genericName: "notenpasta" })).toBeNull();
    expect(catalogMatch({ ...PEANUT, catalogType: null, subcategory: null, genericName: "Melk" })?.id).toBe("melk");
  });

  it("shows the photo for a branded pack and the drawing for generic bread", () => {
    expect(draftFromVision(PEANUT).keepPhoto).toBe(true);
    const bread = draftFromVision(BREAD);
    expect(bread).toMatchObject({ keepPhoto: false, icon: "brood", category: "bakery", name: "Wit brood" });
    expect(bread.pack.recognition?.specific).toBe(false);
    expect(draftFromVision({ ...BREAD, catalogType: null, subcategory: "desembol", genericName: "Desembol" }).keepPhoto).toBe(true);
  });

  it("keeps a readable barcode only as an unverified candidate", () => {
    const draft = draftFromVision({ ...PEANUT, ean: "3017620422003" });
    expect(draft.pack.recognition?.eanCandidate).toBe("3017620422003");
    expect("ean" in draft.pack).toBe(false);
    expect(draftFromVision({ ...PEANUT, ean: "3017620422004" }).pack.recognition?.eanCandidate).toBeUndefined();
  });

  it("carries the guarded assessment: none for AH Terra, a label-backed mission for sweetened peanut butter", () => {
    expect(draftFromVision(PEANUT).pack.alternative).toMatchObject({ status: "none", criteria: [], source: "photo" });
    const sweet = draftFromVision({
      ...PEANUT,
      productName: "Pindakaas",
      brand: "Calvé",
      visibleIngredients: "pinda's (90%), suiker, plantaardige olie, zout",
      alternative: {
        status: "possible",
        evidence: "label",
        criteria: ["no-added-sugar", "no-added-salt"],
        alternativeType: "100% pindakaas",
        targetType: "pindakaas",
        reason: "Suiker en zout toegevoegd.",
        parentExplanation: "er staan suiker en zout in de ingrediënten",
        childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
      },
    });
    expect(sweet.pack.alternative).toMatchObject({
      status: "possible",
      evidence: "label",
      targetType: "pindakaas",
      parentExplanation: "Op het etiket gezien: er staan suiker en zout in de ingrediënten.",
    });
  });

  it("drops brand or size the model only inferred", () => {
    const draft = draftFromVision({ ...PEANUT, packageSize: "350 g", inferredFields: ["brand", "packageSize"] });
    expect(draft.pack.brand).toBeUndefined();
    expect(draft.pack.packageSize).toBeUndefined();
  });

  it("accepts a visible EAN only with a valid checksum", () => {
    expect(visibleEan({ ...PEANUT, ean: "3017620422003" })).toBe("3017620422003");
    expect(visibleEan({ ...PEANUT, ean: "3017620422004" })).toBeNull();
  });

  it("asks for a check on low confidence or an unrecognised photo", () => {
    expect(needsCheck({ ...PEANUT, needsConfirmation: false })).toBe(false);
    expect(needsCheck({ ...PEANUT, needsConfirmation: false, confidence: "low" })).toBe(true);
    expect(needsCheck({ ...PEANUT, needsConfirmation: false, recognized: false })).toBe(true);
  });

  it("falls back to the section icon when nothing in the catalog matches", () => {
    const draft = draftFromVision({ ...PEANUT, catalogType: null, productName: null, genericName: "Kokosmelk", subcategory: "kokosmelk", category: "houdbaar" });
    expect(draft.match).toBeNull();
    expect(draft.name).toBe("Kokosmelk");
    expect(draft.icon).toBe("pakket");
  });
});

describe("vision client", () => {
  it("posts the image once and returns the product, including additive multi-candidate fields", async () => {
    const fetcher = vi.fn(() =>
      ok({
        status: "ok",
        product: PEANUT,
        recognitionOutcome: "multiple",
        needsSelection: true,
        candidates: [
          {
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
          },
          {
            observedCandidateId: "c2",
            productName: "Casa di Mama Speciale",
            genericName: "pizza",
            catalogType: "pizza",
            specificProduct: true,
            brand: "Dr. Oetker",
            variant: "Speciale",
            packageSize: null,
            category: "diepvries",
            subcategory: "pizza",
            ean: null,
            inferredFields: [],
            confidence: "high",
          },
        ],
      }),
    );
    const result = await client(fetcher).recognize("data:image/jpeg;base64,AAAA");
    expect(result).toMatchObject({
      status: "ok",
      product: PEANUT,
      recognitionOutcome: "multiple",
      needsSelection: true,
      candidates: [{ variant: "Salame" }, { variant: "Speciale" }],
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/products/recognize-photo");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("accepts a legacy single-product response without candidates", async () => {
    const result = await client(() => ok({ status: "ok", product: PEANUT })).recognize("data:a");
    expect(result).toEqual({
      status: "ok",
      product: PEANUT,
      candidates: [],
      recognitionOutcome: "uncertain",
      needsSelection: false,
    });
  });

  it("does not call the network when offline", async () => {
    const fetcher = vi.fn(() => ok({}));
    expect(await client(fetcher, { online: () => false }).recognize("data:")).toEqual({ status: "offline" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a second submit while one is running", async () => {
    let release: () => void = () => {};
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => (release = () => resolve(new Response(JSON.stringify({ status: "ok", product: PEANUT }))))));
    const vision = client(fetcher);
    const first = vision.recognize("data:a");
    expect(await vision.recognize("data:b")).toEqual({ status: "limit", code: "in-flight" });
    release();
    expect((await first).status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops at the daily device limit", async () => {
    const fetcher = vi.fn(() => ok({ status: "ok", product: PEANUT }));
    const vision = client(fetcher);
    for (let i = 0; i < VISION_RULES.devicePerDay; i += 1) await vision.recognize("data:a");
    expect(await vision.recognize("data:a")).toEqual({ status: "limit", code: "device-limit" });
  });

  it("maps server limits, errors and malformed bodies", async () => {
    expect(await client(() => ok({ status: "error", code: "rate-limited" }, 429)).recognize("data:a")).toEqual({ status: "limit", code: "rate-limited" });
    expect(await client(() => ok({ status: "error", code: "refused" }, 422)).recognize("data:a")).toEqual({ status: "error", code: "refused" });
    expect(await client(() => ok({ status: "ok", product: { recognized: "yes" } })).recognize("data:a")).toEqual({ status: "error", code: "http-200" });
    expect(await client(() => Promise.reject(new TypeError("fetch failed"))).recognize("data:a")).toEqual({ status: "error", code: "unreachable" });
  });

  it("reports a cancelled request as aborted", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = client(fetcher as VisionDeps["fetch"]).recognize("data:a", { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ status: "aborted" });
  });
});
