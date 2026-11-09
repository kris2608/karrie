import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import { houseBrandRetailer } from "../domain/retailers";
import { sortByCategory } from "../domain/shopQueue";
import type {
  Adventure,
  AdventureItem,
  AdventurePhase,
  AlternativeAssessment,
  BarcodeInfo,
  CategoryId,
  FieldSources,
  Nutrition,
  PackInfo,
  Product,
  Recognition,
  SavedItem,
} from "../domain/types";
import { productById } from "./catalog";

export const SAMPLE_IDS = ["appel", "banaan", "brood", "melk"] as const;

const PACK_KEYS = [
  "ean",
  "brand",
  "packageSize",
  "imageUrl",
  "photoId",
  "imageKind",
  "imageSource",
  "imageChoice",
  "source",
  "nutrition",
  "offAttribution",
  "barcode",
  "fieldSources",
  "recognition",
  "alternative",
  "missionEnabled",
  "kind",
  "canonicalName",
  "aliases",
  "subcategory",
  "createdAt",
  "enrichment",
  "illustrationId",
  "illustration",
  "namePhoto",
  "privateLabelRetailer",
] as const;
const IMAGE_KEYS = ["imageUrl", "photoId", "imageKind", "imageSource", "imageChoice"] as const;

export function packOf(item: PackInfo): PackInfo {
  const pack: Record<string, unknown> = {};
  for (const key of PACK_KEYS) if (item[key] !== undefined) pack[key] = item[key];
  return pack as PackInfo;
}

export function stripPack<T extends PackInfo>(item: T): T {
  const copy = { ...item };
  for (const key of PACK_KEYS) delete copy[key];
  return copy;
}

export function withoutImage<T extends PackInfo>(item: T): T {
  const copy = { ...item };
  for (const key of IMAGE_KEYS) delete copy[key];
  return { ...copy, imageKind: "generic", imageChoice: "drawing" };
}

/** Swaps only the picture for a parent photo; product identity stays as it was. */
export function withParentPhoto<T extends PackInfo>(item: T, photoId: string): T {
  const copy = { ...item };
  for (const key of IMAGE_KEYS) delete copy[key];
  return { ...copy, photoId, imageKind: "photo", imageSource: "parent", imageChoice: "photo" };
}

/** What the confirmation sheet stores: from the photo, the barcode lookup, or both. */
export type VisionPack = {
  brand?: string;
  packageSize?: string;
  recognition?: Recognition;
  alternative?: AlternativeAssessment;
  /** Decoded by the phone's barcode reader; a model reading never ends up here. */
  ean?: string;
  barcode?: BarcodeInfo;
  /** The Open Food Facts front photo; a parent photo replaces it. */
  imageUrl?: string;
  nutrition?: Nutrition;
  fieldSources?: FieldSources;
  packConflict?: { choices: string[]; raw: string[] };
};

export function packFromVision(vision: VisionPack, photoId?: string): PackInfo {
  const offImage = photoId ? undefined : vision.imageUrl;
  const privateLabelRetailer = houseBrandRetailer(vision.brand, vision.recognition?.genericName);
  return packOf({
    ean: vision.ean,
    brand: vision.brand,
    packageSize: vision.packageSize,
    photoId,
    imageUrl: offImage,
    imageKind: photoId || offImage ? "photo" : "generic",
    imageSource: photoId ? "parent" : offImage ? "off" : undefined,
    source: vision.barcode ? (vision.barcode.status === "web-page" ? "barcode" : "off") : vision.recognition ? "vision" : "manual",
    nutrition: vision.nutrition,
    offAttribution: vision.barcode && vision.barcode.status !== "web-page" ? true : undefined,
    barcode: vision.barcode,
    fieldSources: vision.fieldSources,
    recognition: vision.recognition,
    alternative: vision.alternative,
    packConflict: vision.packConflict,
    ...(privateLabelRetailer && { privateLabelRetailer }),
  });
}

export function itemFromSaved(saved: SavedItem): AdventureItem {
  return {
    ...saved,
    id: crypto.randomUUID(),
    quantity: Math.max(1, Math.min(24, saved.quantity)),
    status: "pending",
  };
}

export function createItem(product: Product, quantity = 1): AdventureItem {
  return {
    id: crypto.randomUUID(),
    productId: product.id,
    name: product.name,
    icon: product.illustration ?? product.id,
    category: product.category,
    quantity: Math.max(1, Math.min(24, quantity)),
    status: "pending",
  };
}

export function createAdventure(
  name: string,
  source: Product[],
  order: CategoryId[],
  phase: AdventurePhase,
  quantities?: number[],
): Adventure {
  const now = Date.now();
  const items = sortByCategory(
    source.map((product, index) => createItem(product, quantities?.[index] ?? 1)),
    order,
  );
  return {
    id: crypto.randomUUID(),
    name,
    phase,
    items,
    categoryOrder: [...order],
    createdAt: now,
    updatedAt: now,
    history: [],
  };
}

export function sampleProducts(): Product[] {
  return SAMPLE_IDS.map((id) => {
    const product = productById(id);
    if (!product) throw new Error(`Voorbeeldproduct ontbreekt: ${id}`);
    return product;
  });
}

export function createSampleAdventure(order: CategoryId[] = DEFAULT_CATEGORY_ORDER): Adventure {
  return createAdventure("Voorbeeldlijst", sampleProducts(), order, "shopping");
}
