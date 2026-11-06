import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import { matchProduct } from "../domain/matchProduct";
import { parseList } from "../domain/parseList";
import {
  activeItem,
  isComplete,
  markFound,
  moveAmongOpen,
  moveCategory,
  moveItemWithinCategory,
  skipItem,
  sortByCategory,
} from "../domain/shopQueue";
import { sameEan } from "../domain/ean";
import { awardedStars } from "../domain/scoring";
import { nextSticker } from "../domain/stickers";
import type {
  Adventure,
  AdventureItem,
  CategoryId,
  PackInfo,
  Product,
  SavedList,
  ScannedProduct,
  ScanResult,
} from "../domain/types";
import { products } from "../data/catalog";
import { createAdventure, createItem, createSampleAdventure, itemFromSaved, packOf, packFromScan, stripPack } from "../data/sample";

export type Settings = {
  soundEnabled: boolean;
};

export const defaultSettings: Settings = { soundEnabled: false };

export type AppState = {
  adventure: Adventure | null;
  saved: SavedList[];
  stickers: string[];
  categoryOrder: CategoryId[];
  settings: Settings;
};

export const initialState: AppState = {
  adventure: null,
  saved: [],
  stickers: [],
  categoryOrder: [...DEFAULT_CATEGORY_ORDER],
  settings: { ...defaultSettings },
};

export type Action =
  | { type: "hydrate"; data: Partial<AppState> }
  | { type: "set-sound"; enabled: boolean }
  | { type: "new-draft" }
  | { type: "start-sample" }
  | { type: "add-product"; product: Product }
  | { type: "add-lines"; lines: { product: Product; quantity: number }[] }
  | { type: "set-quantity"; itemId: string; quantity: number }
  | { type: "remove-item"; itemId: string }
  | { type: "move-item"; itemId: string; direction: -1 | 1 }
  | { type: "move-category"; category: CategoryId; direction: -1 | 1 }
  | { type: "set-category-order"; order: CategoryId[] }
  | { type: "add-scanned"; product: ScannedProduct; name: string; category: CategoryId; icon: string; source: "off" | "manual" }
  | { type: "attach-pack"; itemId: string; product: ScannedProduct; source?: "off" | "manual" }
  | { type: "restore-generic"; itemId: string }
  | { type: "insert-item"; item: AdventureItem; index: number }
  | { type: "start-shopping" }
  | { type: "found"; bonus?: ScanResult; pack?: ScannedProduct }
  | { type: "skip" }
  | { type: "undo" }
  | { type: "save-favorite" }
  | { type: "open-saved"; id: string };

function touch(adventure: Adventure, patch: Partial<Adventure>): Adventure {
  return { ...adventure, ...patch, updatedAt: Date.now() };
}

function blankDraft(order: CategoryId[]): Adventure {
  return createAdventure("Boodschappenlijst", [], order, "draft");
}

function remember(adventure: Adventure): { items: AdventureItem[]; phase: Adventure["phase"]; stickerId?: string; stickers: string[] } {
  return {
    items: adventure.items,
    phase: adventure.phase,
    stickerId: adventure.stickerId,
    stickers: [],
  };
}

function withHistory(state: AppState, adventure: Adventure) {
  const entry = { ...remember(adventure), stickers: state.stickers };
  return [...adventure.history, entry].slice(-20);
}

function upsertSaved(saved: SavedList[], adventure: Adventure, favorite?: boolean): SavedList[] {
  if (!adventure.items.length) return saved;
  const existing = saved.find((list) => list.id === adventure.id);
  const entry: SavedList = {
    id: adventure.id,
    name: adventure.name,
    items: adventure.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      icon: item.icon,
      category: item.category,
      quantity: item.quantity,
      ...packOf(item),
    })),
    favorite: favorite ?? existing?.favorite ?? false,
    updatedAt: Date.now(),
  };
  return [entry, ...saved.filter((list) => list.id !== entry.id)].slice(0, 40);
}

function mergeLines(items: AdventureItem[], lines: { product: Product; quantity: number }[]): AdventureItem[] {
  let next = items;
  for (const line of lines) {
    const existing = next.find((item) => item.productId === line.product.id && item.status !== "found");
    if (existing) {
      next = next.map((item) =>
        item.id === existing.id ? { ...item, quantity: Math.min(24, item.quantity + line.quantity) } : item,
      );
    } else {
      next = [...next, createItem(line.product, line.quantity)];
    }
  }
  return next;
}

function updateItem(state: AppState, itemId: string, change: (item: AdventureItem) => AdventureItem): AppState {
  if (!state.adventure) return state;
  let changed = false;
  const items = state.adventure.items.map((item) => {
    if (item.id !== itemId) return item;
    changed = true;
    return change(item);
  });
  return changed ? { ...state, adventure: touch(state.adventure, { items }) } : state;
}

function ensureDraft(state: AppState): Adventure {
  if (!state.adventure || state.adventure.phase === "done") return blankDraft(state.categoryOrder);
  return state.adventure;
}

function isAdventure(value: Adventure | null): value is Adventure {
  return Boolean(value && Array.isArray(value.items) && Array.isArray(value.categoryOrder));
}

export function recognizeList(text: string): { quantity: number; query: string; product: Product | null }[] {
  return parseList(text).map((chunk) => ({
    quantity: chunk.quantity,
    query: chunk.query,
    product: matchProduct(chunk.query, products),
  }));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate": {
      const stored = action.data.adventure ?? null;
      const adventure = isAdventure(stored) ? { ...stored, history: stored.history ?? [] } : null;
      return {
        adventure,
        saved: Array.isArray(action.data.saved) ? action.data.saved : [],
        stickers: Array.isArray(action.data.stickers) ? action.data.stickers : [],
        categoryOrder: action.data.categoryOrder?.length ? action.data.categoryOrder : [...DEFAULT_CATEGORY_ORDER],
        settings: { ...defaultSettings, ...action.data.settings },
      };
    }
    case "set-sound":
      return { ...state, settings: { ...state.settings, soundEnabled: action.enabled } };
    case "new-draft": {
      const saved = state.adventure?.items.length ? upsertSaved(state.saved, state.adventure) : state.saved;
      return { ...state, saved, adventure: blankDraft(state.categoryOrder) };
    }
    case "start-sample": {
      const saved = state.adventure?.items.length ? upsertSaved(state.saved, state.adventure) : state.saved;
      return { ...state, saved, adventure: createSampleAdventure(state.categoryOrder) };
    }
    case "add-product": {
      const adventure = ensureDraft(state);
      const items = mergeLines(adventure.items, [{ product: action.product, quantity: 1 }]);
      return { ...state, adventure: touch(adventure, { items }) };
    }
    case "add-lines": {
      const adventure = ensureDraft(state);
      return { ...state, adventure: touch(adventure, { items: mergeLines(adventure.items, action.lines) }) };
    }
    case "set-quantity": {
      if (!state.adventure) return state;
      const items = state.adventure.items.map((item) =>
        item.id === action.itemId && item.status !== "found"
          ? { ...item, quantity: Math.max(1, Math.min(24, action.quantity)) }
          : item,
      );
      return { ...state, adventure: touch(state.adventure, { items }) };
    }
    case "remove-item": {
      if (!state.adventure) return state;
      const items = state.adventure.items.filter((item) => item.id !== action.itemId || item.status === "found");
      return { ...state, adventure: touch(state.adventure, { items }) };
    }
    case "move-item": {
      if (!state.adventure) return state;
      const items =
        state.adventure.phase === "shopping"
          ? moveAmongOpen(state.adventure.items, action.itemId, action.direction)
          : moveItemWithinCategory(state.adventure.items, action.itemId, action.direction);
      return { ...state, adventure: touch(state.adventure, { items }) };
    }
    case "move-category": {
      const categoryOrder = moveCategory(state.adventure?.categoryOrder ?? state.categoryOrder, action.category, action.direction);
      return {
        ...state,
        categoryOrder,
        adventure: state.adventure ? touch(state.adventure, { categoryOrder }) : null,
      };
    }
    case "set-category-order":
      return {
        ...state,
        categoryOrder: action.order,
        adventure: state.adventure ? touch(state.adventure, { categoryOrder: action.order }) : null,
      };
    case "add-scanned": {
      const adventure = ensureDraft(state);
      const existing = adventure.items.find((item) => item.status !== "found" && sameEan(item.ean, action.product.ean));
      if (existing) {
        const items = adventure.items.map((item) =>
          item.id === existing.id ? { ...item, quantity: Math.min(24, item.quantity + 1) } : item,
        );
        return { ...state, adventure: touch(adventure, { items }) };
      }
      const item: AdventureItem = {
        id: crypto.randomUUID(),
        productId: action.product.matchProductId ?? `ean:${action.product.ean}`,
        name: action.name.trim() || action.product.name || "Product",
        icon: action.icon,
        category: action.category,
        quantity: 1,
        status: "pending",
        ...packFromScan(action.product, action.source),
      };
      return { ...state, adventure: touch(adventure, { items: [...adventure.items, item] }) };
    }
    case "attach-pack":
      return updateItem(state, action.itemId, (item) => ({ ...stripPack(item), ...packFromScan(action.product, action.source ?? "off") }));
    case "restore-generic":
      return updateItem(state, action.itemId, (item) => stripPack(item));
    case "insert-item": {
      if (!state.adventure || state.adventure.items.some((item) => item.id === action.item.id)) return state;
      const items = [...state.adventure.items];
      items.splice(Math.max(0, Math.min(action.index, items.length)), 0, action.item);
      return { ...state, adventure: touch(state.adventure, { items }) };
    }
    case "start-shopping": {
      if (!state.adventure?.items.length || state.adventure.phase === "shopping") return state;
      const items = sortByCategory(
        state.adventure.items.map(({ stars: _stars, scan: _scan, ...item }) => ({ ...item, status: "pending" as const })),
        state.adventure.categoryOrder,
      );
      const adventure = touch(state.adventure, { items, phase: "shopping", history: [] });
      return { ...state, adventure, saved: upsertSaved(state.saved, adventure) };
    }
    case "found": {
      if (!state.adventure) return state;
      const current = activeItem(state.adventure.items);
      if (!current) return state;
      const pack: PackInfo = action.pack && action.bonus === "confirmed" ? packFromScan(action.pack, "off") : {};
      const items = markFound(state.adventure.items, current.id).map((item) =>
        item.id === current.id
          ? { ...(action.pack ? stripPack(item) : item), ...pack, stars: awardedStars(action.bonus), scan: action.bonus }
          : item,
      );
      const history = withHistory(state, state.adventure);
      if (isComplete(items)) {
        const stickerId = state.adventure.stickerId ?? nextSticker(state.stickers);
        const stickers = state.stickers.includes(stickerId) ? state.stickers : [...state.stickers, stickerId];
        const adventure = touch(state.adventure, { items, history, phase: "done", stickerId });
        return { ...state, stickers, adventure, saved: upsertSaved(state.saved, adventure) };
      }
      return { ...state, adventure: touch(state.adventure, { items, history, phase: "shopping" }) };
    }
    case "skip": {
      if (!state.adventure) return state;
      const current = activeItem(state.adventure.items);
      if (!current) return state;
      const items = skipItem(state.adventure.items, current.id);
      if (items === state.adventure.items) return state;
      return { ...state, adventure: touch(state.adventure, { items, history: withHistory(state, state.adventure) }) };
    }
    case "undo": {
      const adventure = state.adventure;
      const previous = adventure?.history.at(-1);
      if (!adventure || !previous) return state;
      const restored = touch(adventure, {
        items: previous.items,
        phase: previous.phase,
        stickerId: previous.stickerId,
        history: adventure.history.slice(0, -1),
      });
      return {
        ...state,
        stickers: previous.stickers,
        adventure: restored,
        saved: upsertSaved(state.saved, restored),
      };
    }
    case "save-favorite": {
      if (!state.adventure?.items.length) return state;
      return { ...state, saved: upsertSaved(state.saved, state.adventure, true) };
    }
    case "open-saved": {
      const list = state.saved.find((entry) => entry.id === action.id);
      if (!list) return state;
      const adventure = createAdventure(list.name, [], state.categoryOrder, "draft");
      const items = sortByCategory(list.items.map(itemFromSaved), state.categoryOrder);
      return { ...state, adventure: { ...adventure, items } };
    }
    default:
      return state;
  }
}
