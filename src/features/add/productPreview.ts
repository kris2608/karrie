import type { AdventureItem, CategoryId, Product, SavedItem } from "../../domain/types";
import type { RetailerId } from "../../domain/retailers";
import type { PreviewPack } from "./ProductPreviewSheet";

export type PreviewTarget =
  | { kind: "catalog"; product: Product; listed?: AdventureItem; quantity: number; offer?: RetailerId }
  | { kind: "mine"; entry: SavedItem; listed?: AdventureItem; quantity: number; offer?: RetailerId }
  | { kind: "extra"; item: AdventureItem; quantity: number; offer?: RetailerId };

/** Keeps the ⓘ clear of the heart (top-leading) and quantity badge (top-trailing). */
export function infoCorner(quantity: number): "top-trailing" | "bottom-leading" {
  return quantity > 0 ? "bottom-leading" : "top-trailing";
}

export function previewName(target: PreviewTarget): string {
  return target.kind === "catalog" ? target.product.name : target.kind === "mine" ? target.entry.name : target.item.name;
}

export function previewCategory(target: PreviewTarget): CategoryId {
  return target.kind === "catalog" ? target.product.category : target.kind === "mine" ? target.entry.category : target.item.category;
}

export function previewQuantity(target: PreviewTarget): number {
  return target.quantity;
}

export function previewPack(target: PreviewTarget): PreviewPack | undefined {
  if (target.kind === "catalog") {
    const listed = target.listed;
    if (!listed) return { name: target.product.name, productId: target.product.id, category: target.product.category, icon: target.product.id };
    return listed;
  }
  if (target.kind === "mine") return target.listed ?? target.entry;
  return target.item;
}

export function previewMine(target: PreviewTarget): boolean {
  return target.kind === "mine";
}

/** Tile gestures stay separate: card tap adds, info opens preview, long-press removes. */
export function tileGesture(kind: "add" | "info" | "long-press"): "add" | "preview" | "remove" {
  if (kind === "add") return "add";
  if (kind === "info") return "preview";
  return "remove";
}
