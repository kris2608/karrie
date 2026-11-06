import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import { sortByCategory } from "../domain/shopQueue";
import type { Adventure, AdventureItem, AdventurePhase, CategoryId, Product } from "../domain/types";
import { productById } from "./catalog";

export const SAMPLE_IDS = ["appel", "banaan", "brood", "melk"] as const;

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
