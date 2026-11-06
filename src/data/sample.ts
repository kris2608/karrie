import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import { sortByCategory } from "../domain/shopQueue";
import type {
  Adventure,
  AdventureItem,
  AdventurePhase,
  CategoryId,
  PackInfo,
  Product,
  SavedItem,
  ScannedProduct,
} from "../domain/types";
import { productById } from "./catalog";

export const SAMPLE_IDS = ["appel", "banaan", "brood", "melk"] as const;

const PACK_KEYS = ["ean", "brand", "packageSize", "imageUrl", "imageKind", "source", "nutrition", "offAttribution"] as const;

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

export function packFromScan(product: ScannedProduct, source: "off" | "manual"): PackInfo {
  return packOf({
    ean: product.ean,
    brand: product.brand,
    packageSize: product.packageSize,
    imageUrl: source === "off" ? product.imageUrl : undefined,
    imageKind: source === "off" && product.imageUrl ? "photo" : "generic",
    source,
    nutrition: product.nutrition,
    offAttribution: source === "off" ? true : undefined,
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
