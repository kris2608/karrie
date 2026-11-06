import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import { sortByCategory } from "../domain/shopQueue";
import type {
  Adventure,
  AdventureItem,
  AdventurePhase,
  AlternativeAssessment,
  CategoryId,
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
  "recognition",
  "alternative",
  "missionEnabled",
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

export type VisionPack = {
  brand?: string;
  packageSize?: string;
  recognition: Recognition;
  alternative?: AlternativeAssessment;
};

/** Never carries an EAN: a model reading is not a verified barcode. */
export function packFromVision(vision: VisionPack, photoId?: string): PackInfo {
  return packOf({
    brand: vision.brand,
    packageSize: vision.packageSize,
    photoId,
    imageKind: photoId ? "photo" : "generic",
    imageSource: photoId ? "parent" : undefined,
    source: "vision",
    recognition: vision.recognition,
    alternative: vision.alternative,
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
    icon: product.id,
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
