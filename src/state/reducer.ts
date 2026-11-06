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
import { declineKey, pickMissions } from "../domain/discovery";
import { SCORING } from "../domain/scoring";
import { nextSticker } from "../domain/stickers";
import { mineKey, remember as rememberMine } from "../domain/mine";
import type { Adventure, AdventureItem, CategoryId, ImageChoice, MissionState, PackInfo, Product, SavedItem, SavedList } from "../domain/types";
import { productById, products } from "../data/catalog";
import {
  createAdventure,
  createItem,
  createSampleAdventure,
  itemFromSaved,
  packFromVision,
  packOf,
  stripPack,
  withoutImage,
  withParentPhoto,
  type VisionPack,
} from "../data/sample";

export type Settings = {
  soundEnabled: boolean;
  smartDiscovery: boolean;
  /** Look up reference pictures for products on the list; sends only product names, never photos. */
  referenceImages: boolean;
};

export const defaultSettings: Settings = { soundEnabled: false, smartDiscovery: true, referenceImages: true };

export type AppState = {
  adventure: Adventure | null;
  saved: SavedList[];
  stickers: string[];
  categoryOrder: CategoryId[];
  settings: Settings;
  /** declineKey()s of suggestions a parent turned down. */
  declined: string[];
  /** Mijn producten, newest first. */
  mine: SavedItem[];
};

export const initialState: AppState = {
  adventure: null,
  saved: [],
  stickers: [],
  categoryOrder: [...DEFAULT_CATEGORY_ORDER],
  settings: { ...defaultSettings },
  declined: [],
  mine: [],
};

export type Action =
  | { type: "hydrate"; data: Partial<AppState> }
  | { type: "set-sound"; enabled: boolean }
  | { type: "set-discovery"; enabled: boolean }
  | { type: "set-reference-images"; enabled: boolean }
  | { type: "set-image-choice"; itemId: string; choice: ImageChoice | undefined }
  | { type: "add-mine"; key: string }
  | { type: "forget-mine"; key: string }
  | { type: "restore-mine"; entry: SavedItem; index: number }
  | { type: "set-mission"; itemId: string; enabled: boolean }
  | { type: "mission-accept" }
  | { type: "mission-skip" }
  | { type: "mission-done"; keep: "original" | "alternative" }
  | { type: "new-draft" }
  | { type: "start-sample" }
  | { type: "add-product"; product: Product }
  | { type: "add-lines"; lines: { product: Product; quantity: number }[] }
  | { type: "set-quantity"; itemId: string; quantity: number }
  | { type: "remove-item"; itemId: string }
  | { type: "move-item"; itemId: string; direction: -1 | 1 }
  | { type: "move-category"; category: CategoryId; direction: -1 | 1 }
  | { type: "set-category-order"; order: CategoryId[] }
  | { type: "restore-generic"; itemId: string }
  | { type: "add-recognized"; name: string; category: CategoryId; icon: string; productId?: string; photoId?: string; pack?: VisionPack }
  | { type: "set-photo"; itemId: string; photoId: string }
  | { type: "apply-recognition"; itemId: string; photoId?: string; pack: VisionPack }
  | { type: "edit-item"; itemId: string; name?: string; category?: CategoryId; icon?: string; productId?: string }
  | { type: "insert-item"; item: AdventureItem; index: number }
  | { type: "start-shopping" }
  | { type: "found" }
  | { type: "skip" }
  | { type: "undo" }
  | { type: "save-favorite"; name?: string; store?: string }
  | { type: "open-saved"; id: string }
  | { type: "forget-saved"; id: string }
  | { type: "restore-saved"; list: SavedList; index: number }
  | { type: "clear-saved" };

function touch(adventure: Adventure, patch: Partial<Adventure>): Adventure {
  return { ...adventure, ...patch, updatedAt: Date.now() };
}

export const DEFAULT_LIST_NAME = "Boodschappenlijst";

/** The name a parent gave the list, or nothing for the built-in names. */
export function listName(list: Pick<SavedList, "name">): string | undefined {
  return list.name && list.name !== DEFAULT_LIST_NAME && list.name !== "Voorbeeldlijst" ? list.name : undefined;
}

function blankDraft(order: CategoryId[]): Adventure {
  return createAdventure(DEFAULT_LIST_NAME, [], order, "draft");
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
    ...(adventure.store && { store: adventure.store }),
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

/** Commits a shopping step with an undo entry, finishing the adventure when nothing is left. */
function collected(state: AppState, items: AdventureItem[]): AppState {
  if (!state.adventure) return state;
  const history = withHistory(state, state.adventure);
  if (isComplete(items)) {
    const stickerId = state.adventure.stickerId ?? nextSticker(state.stickers);
    const stickers = state.stickers.includes(stickerId) ? state.stickers : [...state.stickers, stickerId];
    const adventure = touch(state.adventure, { items, history, phase: "done", stickerId });
    return { ...state, stickers, adventure, saved: upsertSaved(state.saved, adventure) };
  }
  return { ...state, adventure: touch(state.adventure, { items, history, phase: "shopping" }) };
}

/** A list name that fits a row; long model descriptions fall back to the catalog name. */
function shortName(text: string | undefined) {
  const trimmed = text?.trim();
  return trimmed && trimmed.length <= 32 ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : undefined;
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
        declined: Array.isArray(action.data.declined) ? action.data.declined : [],
        mine: Array.isArray(action.data.mine) ? action.data.mine : [],
      };
    }
    case "add-mine": {
      const entry = state.mine.find((saved) => mineKey(saved) === action.key);
      if (!entry) return state;
      const adventure = ensureDraft(state);
      const existing = adventure.items.find((item) => item.status !== "found" && mineKey(item) === action.key);
      const items = existing
        ? adventure.items.map((item) => (item === existing ? { ...item, quantity: Math.min(24, item.quantity + 1) } : item))
        : [...adventure.items, itemFromSaved(entry)];
      return { ...state, adventure: touch(adventure, { items }) };
    }
    case "forget-mine":
      return { ...state, mine: state.mine.filter((entry) => mineKey(entry) !== action.key) };
    case "restore-mine": {
      const mine = state.mine.filter((entry) => mineKey(entry) !== mineKey(action.entry));
      return { ...state, mine: [...mine.slice(0, action.index), action.entry, ...mine.slice(action.index)] };
    }
    case "set-sound":
      return { ...state, settings: { ...state.settings, soundEnabled: action.enabled } };
    case "set-discovery": {
      const settings = { ...state.settings, smartDiscovery: action.enabled };
      if (action.enabled || state.adventure?.phase !== "shopping") return { ...state, settings };
      const items = state.adventure.items.map((item) => (item.mission && item.mission.status !== "done" ? { ...item, mission: undefined } : item));
      return { ...state, settings, adventure: touch(state.adventure, { items }) };
    }
    case "set-reference-images":
      return { ...state, settings: { ...state.settings, referenceImages: action.enabled } };
    case "set-image-choice":
      return updateItem(state, action.itemId, (item) => {
        const { imageChoice: _previous, ...rest } = item;
        return action.choice ? { ...rest, imageChoice: action.choice } : rest;
      });
    case "set-mission": {
      const item = state.adventure?.items.find((entry) => entry.id === action.itemId);
      if (!item) return state;
      const key = declineKey(item);
      const declined = action.enabled ? state.declined.filter((entry) => entry !== key) : [...new Set([...state.declined, key])].slice(-200);
      const next = updateItem(state, action.itemId, (entry) => ({ ...entry, missionEnabled: action.enabled }));
      return { ...next, declined };
    }
    case "mission-accept":
    case "mission-skip": {
      if (!state.adventure) return state;
      const current = activeItem(state.adventure.items);
      if (!current?.mission || current.mission.status === "done") return state;
      const status: MissionState["status"] = action.type === "mission-accept" ? "active" : "skipped";
      const items = state.adventure.items.map((item) => (item.id === current.id ? { ...item, mission: { status } } : item));
      return { ...state, adventure: touch(state.adventure, { items, history: withHistory(state, state.adventure) }) };
    }
    case "mission-done": {
      if (!state.adventure) return state;
      const current = activeItem(state.adventure.items);
      const target = current?.alternative?.targetType ? productById(current.alternative.targetType) : undefined;
      if (!current || current.mission?.status !== "active" || !target) return state;
      const mission = { status: "done" as const, stars: SCORING.discoveryBonus, kept: action.keep };
      const swapped: AdventureItem =
        action.keep === "alternative"
          ? {
              ...stripPack(current),
              productId: target.id,
              name: shortName(current.alternative?.alternativeType) ?? target.name,
              icon: target.id,
              category: target.category,
              source: "catalog",
              mission: { ...mission, swappedFrom: current },
            }
          : { ...current, mission };
      const items = markFound(
        state.adventure.items.map((item) => (item.id === current.id ? swapped : item)),
        current.id,
      );
      const declined = action.keep === "original" ? [...new Set([...state.declined, declineKey(current)])].slice(-200) : state.declined;
      return { ...collected(state, items), declined };
    }
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
    case "restore-generic":
      return updateItem(state, action.itemId, (item) => withoutImage(item));
    case "add-recognized": {
      const adventure = ensureDraft(state);
      const name = action.name.trim().slice(0, 40);
      if (!name) return state;
      const base = { productId: action.productId ?? `photo:${crypto.randomUUID()}`, name, icon: action.icon, category: action.category };
      const pack: PackInfo = action.pack
        ? packFromVision(action.pack, action.photoId)
        : action.photoId
          ? withParentPhoto({ source: "manual" as const }, action.photoId)
          : { source: "manual" };
      const item: AdventureItem = { id: crypto.randomUUID(), ...base, quantity: 1, status: "pending", ...pack };
      return { ...state, mine: rememberMine(state.mine, item), adventure: touch(adventure, { items: [...adventure.items, item] }) };
    }
    case "set-photo":
      return updateItem(state, action.itemId, (item) => withParentPhoto(item, action.photoId));
    case "apply-recognition": {
      const next = updateItem(state, action.itemId, (item) => {
        if (item.ean) return action.photoId ? withParentPhoto(item, action.photoId) : item;
        const hadImage = Boolean(item.photoId || item.imageUrl);
        const keep = action.photoId || !hadImage ? {} : packOf({ photoId: item.photoId, imageUrl: item.imageUrl, imageKind: item.imageKind, imageSource: item.imageSource });
        return { ...stripPack(item), ...packFromVision(action.pack, action.photoId), ...keep };
      });
      const updated = next.adventure?.items.find((item) => item.id === action.itemId);
      return updated ? { ...next, mine: rememberMine(next.mine, updated) } : next;
    }
    case "edit-item":
      return updateItem(state, action.itemId, (item) => ({
        ...item,
        name: action.name?.trim().slice(0, 40) || item.name,
        category: action.category ?? item.category,
        icon: action.icon ?? item.icon,
        productId: action.productId ?? item.productId,
      }));
    case "insert-item": {
      if (!state.adventure || state.adventure.items.some((item) => item.id === action.item.id)) return state;
      const items = [...state.adventure.items];
      items.splice(Math.max(0, Math.min(action.index, items.length)), 0, action.item);
      return { ...state, adventure: touch(state.adventure, { items }) };
    }
    case "start-shopping": {
      if (!state.adventure?.items.length || state.adventure.phase === "shopping") return state;
      const reset = state.adventure.items.map(({ stars: _stars, scan: _scan, mission: _mission, ...item }) => ({ ...item, status: "pending" as const }));
      const offered = new Set(pickMissions(reset, state.settings.smartDiscovery, state.declined));
      const items = sortByCategory(
        reset.map((item) => (offered.has(item.id) ? { ...item, mission: { status: "offered" as const } } : item)),
        state.adventure.categoryOrder,
      );
      const adventure = touch(state.adventure, { items, phase: "shopping", history: [] });
      return { ...state, adventure, saved: upsertSaved(state.saved, adventure) };
    }
    case "found": {
      if (!state.adventure) return state;
      const current = activeItem(state.adventure.items);
      if (!current) return state;
      return collected(state, markFound(state.adventure.items, current.id));
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
      const name = action.name?.trim().slice(0, 40);
      const store = action.store?.trim().slice(0, 40);
      const adventure =
        action.name === undefined && action.store === undefined
          ? state.adventure
          : { ...state.adventure, name: name || DEFAULT_LIST_NAME, store: store || undefined };
      return { ...state, adventure, saved: upsertSaved(state.saved, adventure, true) };
    }
    case "open-saved": {
      const list = state.saved.find((entry) => entry.id === action.id);
      if (!list) return state;
      const adventure = createAdventure(list.name, [], state.categoryOrder, "draft");
      const items = sortByCategory(list.items.map(itemFromSaved), state.categoryOrder);
      return { ...state, adventure: { ...adventure, ...(list.store && { store: list.store }), items } };
    }
    case "forget-saved":
      return { ...state, saved: state.saved.filter((list) => list.id !== action.id) };
    case "restore-saved": {
      const saved = state.saved.filter((list) => list.id !== action.list.id);
      return { ...state, saved: [...saved.slice(0, action.index), action.list, ...saved.slice(action.index)] };
    }
    case "clear-saved":
      return { ...state, saved: [] };
    default:
      return state;
  }
}
