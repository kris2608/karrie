import type { AdventureItem, CategoryId } from "./types";

export function activeItem(items: AdventureItem[]): AdventureItem | undefined {
  return items.find((item) => item.status !== "found");
}

export function markFound(items: AdventureItem[], id: string): AdventureItem[] {
  return items.map((item) => (item.id === id && item.status !== "found" ? { ...item, status: "found" } : item));
}

export function skipItem(items: AdventureItem[], id: string): AdventureItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0 || items[index].status === "found") return items;
  const open = items.filter((item) => item.status !== "found");
  if (open.length <= 1) return items;
  const item = items[index];
  return [...items.filter((_, itemIndex) => itemIndex !== index), { ...item, status: "skipped" }];
}

export function isComplete(items: AdventureItem[]): boolean {
  return items.length > 0 && items.every((item) => item.status === "found");
}

export function foundCount(items: AdventureItem[]): number {
  return items.filter((item) => item.status === "found").length;
}

export function sortByCategory(items: AdventureItem[], order: CategoryId[]): AdventureItem[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const foundDelta = Number(a.item.status === "found") - Number(b.item.status === "found");
      if (foundDelta) return foundDelta;
      const categoryDelta = (rank.get(a.item.category) ?? 99) - (rank.get(b.item.category) ?? 99);
      return categoryDelta || a.index - b.index;
    })
    .map(({ item }) => item);
}

export function moveCategory(order: CategoryId[], category: CategoryId, direction: -1 | 1): CategoryId[] {
  const index = order.indexOf(category);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = order.slice();
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}

export function moveItemWithinCategory(items: AdventureItem[], id: string, direction: -1 | 1): AdventureItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  const category = items[index].category;
  const same = items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter((entry) => entry.item.category === category && entry.item.status !== "found");
  const position = same.findIndex((entry) => entry.item.id === id);
  const target = same[position + direction];
  if (position < 0 || !target) return items;
  const next = items.slice();
  [next[index], next[target.itemIndex]] = [next[target.itemIndex], next[index]];
  return next;
}

export function moveAmongOpen(items: AdventureItem[], id: string, direction: -1 | 1): AdventureItem[] {
  const open = items
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item.status !== "found");
  const position = open.findIndex((entry) => entry.item.id === id);
  const target = open[position + direction];
  if (position < 0 || !target) return items;
  const next = items.slice();
  [next[open[position].index], next[target.index]] = [next[target.index], next[open[position].index]];
  return next;
}
