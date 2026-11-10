/** Mirrors server/src/barcode.ts. Everything is checked again here; the server answer is never trusted blindly. */
export type BarcodeProduct = {
  name?: string;
  brand?: string;
  variant?: string;
  quantity?: string;
  imageUrl?: string;
  categories?: string[];
  nutriScore?: "A" | "B" | "C" | "D" | "E";
  per100?: { energyKcal?: number; fat?: number; saturatedFat?: number; sugars?: number; fibre?: number; protein?: number; salt?: number };
  ingredients?: string;
};

export type BarcodeSource =
  | { kind: "off"; name: "Open Food Facts"; url: string; dataLicense: "ODbL"; imageLicense?: "CC BY-SA" }
  | { kind: "web"; name: string; url: string };

export type FoundStatus = "off-exact" | "off-partial" | "web-page";

export type PackEvidence = {
  source: "openfoodfacts" | "prijsprofeet" | "parent_unverified";
  quantityRaw?: string;
  quantityMl?: number;
  productName?: string;
  brand?: string;
};

export type PackSummary = {
  sources: PackEvidence[];
  conflict: boolean;
  displayQuantity?: string;
};

export type StoreImageHint = {
  ean: string;
  imageUrl: string;
  retailer: string;
  sourceUrl?: string;
  quantity?: string;
  productName?: string;
  brand?: string;
};

export type BarcodeAnswer =
  | {
      ean: string;
      status: FoundStatus;
      product: BarcodeProduct;
      source: BarcodeSource;
      at: number;
      pack?: PackSummary;
      storeImage?: StoreImageHint;
    }
  | { ean: string; status: "none"; at: number };

const PER100 = ["energyKcal", "fat", "saturatedFat", "sugars", "fibre", "protein", "salt"] as const;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function https(value: unknown, host?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!host || url.hostname === host) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function product(value: unknown): BarcodeProduct {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const per = (raw.per100 && typeof raw.per100 === "object" ? raw.per100 : {}) as Record<string, unknown>;
  const per100 = Object.fromEntries(
    PER100.flatMap((key) => {
      const amount = per[key];
      return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? [[key, amount]] : [];
    }),
  );
  const grade = typeof raw.nutriScore === "string" && /^[A-E]$/.test(raw.nutriScore) ? (raw.nutriScore as BarcodeProduct["nutriScore"]) : undefined;
  const categories = Array.isArray(raw.categories) ? raw.categories.filter((tag): tag is string => typeof tag === "string").slice(0, 30) : [];
  const result: BarcodeProduct = {
    name: text(raw.name, 80),
    brand: text(raw.brand, 40),
    variant: text(raw.variant, 40),
    quantity: text(raw.quantity, 24),
    imageUrl: https(raw.imageUrl, "images.openfoodfacts.org"),
    categories: categories.length ? categories : undefined,
    nutriScore: grade,
    per100: Object.keys(per100).length ? per100 : undefined,
    ingredients: text(raw.ingredients, 600),
  };
  return Object.fromEntries(Object.entries(result).filter(([, entry]) => entry !== undefined)) as BarcodeProduct;
}

function source(value: unknown): BarcodeSource | null {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const url = https(raw.url);
  if (!url) return null;
  if (raw.kind === "off") return { kind: "off", name: "Open Food Facts", url, dataLicense: "ODbL", ...(raw.imageLicense === "CC BY-SA" && { imageLicense: "CC BY-SA" as const }) };
  const name = text(raw.name, 60);
  return raw.kind === "web" && name ? { kind: "web", name, url } : null;
}

export function cleanAnswer(value: unknown, ean: string): BarcodeAnswer | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.ean !== ean || typeof raw.at !== "number") return null;
  if (raw.status === "none") return { ean, status: "none", at: raw.at };
  if (raw.status !== "off-exact" && raw.status !== "off-partial" && raw.status !== "web-page") return null;
  const found = product(raw.product);
  const from = source(raw.source);
  if (!from || (!found.name && !found.imageUrl)) return null;
  if ((raw.status === "web-page") !== (from.kind === "web")) return null;
  // Keep OFF-hosted imageUrl on web-page answers (PP identity + OFF photo fill).
  const pack = cleanPack(raw.pack);
  const storeImage = cleanStoreHint(raw.storeImage, ean);
  if (pack?.displayQuantity) found.quantity = pack.displayQuantity;
  else if (pack?.conflict) delete found.quantity;
  return {
    ean,
    status: raw.status,
    product: found,
    source: from,
    at: raw.at,
    ...(pack && { pack }),
    ...(storeImage && { storeImage }),
  };
}

function cleanPack(value: unknown): PackSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const sources = Array.isArray(raw.sources)
    ? raw.sources.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as Record<string, unknown>;
        if (row.source !== "openfoodfacts" && row.source !== "prijsprofeet" && row.source !== "parent_unverified") return [];
        return [
          {
            source: row.source,
            ...(text(row.quantityRaw, 24) && { quantityRaw: text(row.quantityRaw, 24) }),
            ...(typeof row.quantityMl === "number" && Number.isFinite(row.quantityMl) && { quantityMl: row.quantityMl }),
            ...(text(row.productName, 80) && { productName: text(row.productName, 80) }),
            ...(text(row.brand, 40) && { brand: text(row.brand, 40) }),
          } satisfies PackEvidence,
        ];
      })
    : [];
  return {
    sources,
    conflict: raw.conflict === true,
    ...(text(raw.displayQuantity, 24) && { displayQuantity: text(raw.displayQuantity, 24) }),
  };
}

function cleanStoreHint(value: unknown, ean: string): StoreImageHint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const imageUrl = https(raw.imageUrl);
  const retailer = text(raw.retailer, 40);
  if (!imageUrl || !retailer) return undefined;
  return {
    ean,
    imageUrl,
    retailer,
    ...(https(raw.sourceUrl) && { sourceUrl: https(raw.sourceUrl) }),
    ...(text(raw.quantity, 24) && { quantity: text(raw.quantity, 24) }),
    ...(text(raw.productName, 80) && { productName: text(raw.productName, 80) }),
    ...(text(raw.brand, 40) && { brand: text(raw.brand, 40) }),
  };
}
