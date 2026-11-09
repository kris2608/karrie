import { DEFAULT_CATEGORY_ORDER, mergeCategoryOrder } from "../domain/categories";
import { matchProduct, normalize } from "../domain/matchProduct";
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
import { assignBonuses, declineKey } from "../domain/discovery";
import { SCORING } from "../domain/scoring";
import { rememberCompleted } from "../domain/feedback";
import { nextSticker } from "../domain/stickers";
import { MINE_LIMIT, mineKey, remember as rememberMine } from "../domain/mine";
import { categoryIcon } from "../domain/categoryIcon";
import { customName, customProductId, nameTaken, singularKey, suggestion } from "../domain/customProduct";
import type {
  Adventure,
  AdventureItem,
  AlternativeAssessment,
  CategoryId,
  ImageChoice,
  MissionState,
  NamePhoto,
  PackInfo,
  Product,
  SavedItem,
  SavedList,
} from "../domain/types";
import { isRetailer, type RetailerId } from "../domain/retailers";
import { toImportSavedItems, type SharedListV1 } from "../domain/shareList";
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
  /** The supermarket picked last; new lists start with it. */
  retailer?: RetailerId;
  /** "Hoe werkt Karrie?" was shown once before a first adventure; absent in data from before it existed. */
  introSeen?: boolean;
};

/** What the server made of a typed-in product; never a brand, barcode or nutrition. */
export type CustomEnrichment = {
  displayName: string;
  canonicalName: string;
  singularName?: string;
  pluralName?: string;
  childFriendlyLabel?: string;
  category: CategoryId;
  subcategory?: string;
  /** A catalog drawing that fits well enough until (or instead of) a generated one. */
  drawing?: string;
};

export const ENRICH_TRIES = 3;

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
  /** Distinct adventure ids that reached the finish at least once on this device. */
  completedAdventures: string[];
  /** The automatic feedback invite was dismissed or opened. */
  feedbackAsked: boolean;
};

export const initialState: AppState = {
  adventure: null,
  saved: [],
  stickers: [],
  categoryOrder: [...DEFAULT_CATEGORY_ORDER],
  settings: { ...defaultSettings },
  declined: [],
  mine: [],
  completedAdventures: [],
  feedbackAsked: false,
};

export type Action =
  | { type: "hydrate"; data: Partial<AppState> }
  | { type: "set-sound"; enabled: boolean }
  | { type: "set-discovery"; enabled: boolean }
  | { type: "set-reference-images"; enabled: boolean }
  | { type: "set-retailer"; retailer: RetailerId | null }
  /** The parent's default for new lists; the current list keeps its own supermarket. */
  | { type: "set-default-retailer"; retailer: RetailerId | null }
  | { type: "intro-seen" }
  | { type: "set-image-choice"; itemId: string; choice: ImageChoice | undefined }
  | { type: "confirm-pack-size"; itemId: string; packageSize: string }
  | { type: "add-mine"; key: string }
  | { type: "forget-mine"; key: string }
  | { type: "restore-mine"; entry: SavedItem; index: number }
  | { type: "set-mission"; itemId: string; enabled: boolean }
  /** Attach a healthier-alternative assessment prepared before shopping. */
  | { type: "set-alternative"; itemId: string; alternative: AlternativeAssessment }
  | { type: "mission-accept" }
  | { type: "mission-skip" }
  | { type: "mission-done"; keep: "original" | "alternative" }
  | { type: "play-skip" }
  | { type: "play-done" }
  | { type: "play-activate" }
  | { type: "new-draft" }
  | { type: "start-sample" }
  | { type: "add-product"; product: Product }
  | { type: "add-lines"; lines: { product: Product; quantity: number }[] }
  | { type: "set-quantity"; itemId: string; quantity: number }
  | { type: "remove-item"; itemId: string }
  /** Drop every open (non-found) line; found items and list metadata stay. */
  | { type: "clear-open-items" }
  | { type: "move-item"; itemId: string; direction: -1 | 1 }
  | { type: "move-category"; category: CategoryId; direction: -1 | 1 }
  | { type: "set-category-order"; order: CategoryId[] }
  | { type: "restore-generic"; itemId: string }
  | {
      type: "add-recognized";
      name: string;
      category: CategoryId;
      icon: string;
      productId?: string;
      photoId?: string;
      pack?: VisionPack;
      /** How the product was identified; only used for anonymous statistics. */
      via?: "photo" | "barcode" | "manual";
      /** Collected by the child at home; counts towards the home progress. */
      discovered?: boolean;
    }
  | { type: "cheer"; milestone: number }
  | { type: "set-photo"; itemId: string; photoId: string }
  | { type: "apply-recognition"; itemId: string; photoId?: string; pack: VisionPack }
  | { type: "edit-item"; itemId: string; name?: string; category?: CategoryId; icon?: string; productId?: string }
  /** A generic product the catalog does not have; `itemId` lets the screen undo exactly this line. */
  | { type: "add-custom"; name: string; itemId: string }
  /** The background tidy-up of a typed-in product; null counts as a failed try. */
  | { type: "enrich-custom"; productId: string; result: CustomEnrichment | null; final?: boolean; illustrations?: boolean }
  | { type: "set-illustration"; productId: string; illustrationId: string | null }
  /** A name search found this typed product as a brand; no OpenAI tidy-up is needed for it. */
  | { type: "brand-custom"; productId: string; brand: string; category?: CategoryId }
  | { type: "choose-name-photo"; productId: string; photo: NamePhoto | null }
  /** Explicit commercial private-label identity; never from an image pick alone. */
  | {
      type: "adopt-commercial";
      itemId: string;
      name: string;
      brand?: string;
      privateLabelRetailer: RetailerId;
      photo?: NamePhoto;
    }
  | { type: "insert-item"; item: AdventureItem; index: number }
  | { type: "start-shopping" }
  | { type: "found" }
  | { type: "skip" }
  | { type: "undo" }
  | { type: "save-favorite"; name?: string; store?: string }
  /** Save a copy under a new id; the previous favorite row (if any) stays unchanged. */
  | { type: "save-favorite-as-new"; name?: string; store?: string }
  | { type: "open-saved"; id: string }
  | { type: "forget-saved"; id: string }
  | { type: "restore-saved"; list: SavedList; index: number }
  | { type: "clear-saved" }
  /** Import a shared list: `open` replaces the current draft; `save-only` keeps the active adventure. */
  | { type: "import-shared-list"; list: SharedListV1; mode: "open" | "save-only" }
  | { type: "feedback-asked" };

function touch(adventure: Adventure, patch: Partial<Adventure>): Adventure {
  return { ...adventure, ...patch, updatedAt: Date.now() };
}

export const DEFAULT_LIST_NAME = "Boodschappenlijst";

/** The name a parent gave the list, or nothing for the built-in names. */
export function listName(list: Pick<SavedList, "name">): string | undefined {
  return list.name && list.name !== DEFAULT_LIST_NAME && list.name !== "Voorbeeldlijst" ? list.name : undefined;
}

function blankDraft(order: CategoryId[], retailer?: RetailerId): Adventure {
  return withRetailer(createAdventure(DEFAULT_LIST_NAME, [], order, "draft"), retailer);
}

function withRetailer(adventure: Adventure, retailer: RetailerId | undefined): Adventure {
  const { retailer: _previous, ...rest } = adventure;
  return retailer ? { ...rest, retailer } : rest;
}

/** Lists from before the home adventure have neither field; anything malformed is dropped. */
function withHomeProgress(adventure: Adventure): Adventure {
  const { discovered, cheered, ...rest } = adventure;
  return {
    ...rest,
    ...(Array.isArray(discovered) && { discovered: discovered.filter((id) => typeof id === "string") }),
    ...(Array.isArray(cheered) && { cheered: cheered.filter((value) => typeof value === "number") }),
  };
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
  if (!adventure.items.length || (adventure.forgotten && favorite === undefined)) return saved;
  const existing = saved.find((list) => list.id === adventure.id);
  const entry: SavedList = {
    id: adventure.id,
    name: adventure.name,
    ...(adventure.store && { store: adventure.store }),
    ...(adventure.retailer && { retailer: adventure.retailer }),
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

/** The current list loses its saved copy; starting a new list, finishing or undoing must not bring it back. */
function forget(adventure: Adventure | null, ids: string[]): Adventure | null {
  return adventure && ids.includes(adventure.id) ? { ...adventure, forgotten: true } : adventure;
}

function remembered(adventure: Adventure): Adventure {
  const { forgotten: _forgotten, ...rest } = adventure;
  return rest;
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

function customEntry(name: string): SavedItem {
  return {
    productId: customProductId(name),
    name,
    canonicalName: normalize(name),
    icon: categoryIcon("pantry"),
    category: "pantry",
    quantity: 1,
    kind: "custom_generic",
    source: "user_created",
    imageKind: "generic",
    createdAt: Date.now(),
    enrichment: { status: "pending", tries: 0 },
  };
}

/** Applies one change to every copy of a typed-in product: the list, Mijn producten and saved lists. */
function updateCustom(state: AppState, productId: string, change: <T extends SavedItem | AdventureItem>(item: T) => T): AppState {
  const own = <T extends SavedItem | AdventureItem>(item: T) => item.kind === "custom_generic" && item.productId === productId;
  const apply = <T extends SavedItem | AdventureItem>(items: T[]) => {
    const next = items.map((item) => (own(item) ? change(item) : item));
    return next.some((item, index) => item !== items[index]) ? next : items;
  };
  const items = state.adventure ? apply(state.adventure.items) : undefined;
  const saved = state.saved.map((list) => {
    const next = apply(list.items);
    return next === list.items ? list : { ...list, items: next };
  });
  const mine = apply(state.mine);
  const savedChanged = saved.some((list, index) => list !== state.saved[index]);
  const listChanged = Boolean(state.adventure && items && items !== state.adventure.items);
  if (mine === state.mine && !savedChanged && !listChanged) return state;
  return {
    ...state,
    mine,
    saved: savedChanged ? saved : state.saved,
    adventure: state.adventure && listChanged ? touch(state.adventure, { items: items! }) : state.adventure,
  };
}

function enriched<T extends SavedItem | AdventureItem>(item: T, result: CustomEnrichment): T {
  const enrichment = { status: "done" as const, tries: (item.enrichment?.tries ?? 0) + 1, at: Date.now() };
  const name = singularKey(result.displayName) === singularKey(item.name) ? result.displayName.trim().slice(0, 40) : item.name;
  const aliases = [...new Set([result.singularName, result.pluralName, result.childFriendlyLabel, result.displayName].map((alias) => alias?.trim() ?? ""))]
    .filter((alias) => alias && normalize(alias) !== normalize(name));
  const icon = result.drawing && productById(result.drawing) ? result.drawing : categoryIcon(result.category);
  return {
    ...item,
    name,
    canonicalName: result.canonicalName,
    category: result.category,
    icon,
    ...(result.subcategory && { subcategory: result.subcategory }),
    ...(aliases.length && { aliases }),
    enrichment,
  };
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
    const completedAdventures = rememberCompleted(state.completedAdventures, state.adventure.id);
    return { ...state, stickers, adventure, saved: upsertSaved(state.saved, adventure), completedAdventures };
  }
  return { ...state, adventure: touch(state.adventure, { items, history, phase: "shopping" }) };
}

/** A list name that fits a row; long model descriptions fall back to the catalog name. */
function shortName(text: string | undefined) {
  const trimmed = text?.trim();
  return trimmed && trimmed.length <= 32 ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : undefined;
}

function ensureDraft(state: AppState): Adventure {
  if (!state.adventure || state.adventure.phase === "done") return blankDraft(state.categoryOrder, state.settings.retailer);
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
      const adventure = isAdventure(stored)
        ? withRetailer(
            withHomeProgress({
              ...stored,
              history: stored.history ?? [],
              categoryOrder: mergeCategoryOrder(stored.categoryOrder),
            }),
            isRetailer(stored.retailer) ? stored.retailer : undefined,
          )
        : null;
      const settings: Settings = { ...defaultSettings, ...action.data.settings };
      if (!isRetailer(settings.retailer)) delete settings.retailer;
      return {
        adventure,
        saved: Array.isArray(action.data.saved) ? action.data.saved : [],
        stickers: Array.isArray(action.data.stickers) ? action.data.stickers : [],
        categoryOrder: mergeCategoryOrder(action.data.categoryOrder),
        settings,
        declined: Array.isArray(action.data.declined) ? action.data.declined : [],
        mine: Array.isArray(action.data.mine) ? action.data.mine : [],
        completedAdventures: Array.isArray(action.data.completedAdventures)
          ? action.data.completedAdventures.filter((id): id is string => typeof id === "string")
          : [],
        feedbackAsked: action.data.feedbackAsked === true,
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
    case "set-retailer": {
      /** List supermarket only; the default for new lists is `set-default-retailer`. */
      const retailer = action.retailer ?? undefined;
      const base = !state.adventure || state.adventure.phase === "done" ? ensureDraft(state) : state.adventure;
      return { ...state, adventure: touch(withRetailer(base, retailer), {}) };
    }
    case "set-default-retailer": {
      const { retailer: _previous, ...rest } = state.settings;
      return { ...state, settings: action.retailer ? { ...rest, retailer: action.retailer } : rest };
    }
    case "intro-seen":
      return state.settings.introSeen ? state : { ...state, settings: { ...state.settings, introSeen: true } };
    case "confirm-pack-size":
      return updateItem(state, action.itemId, (item) => {
        const { packConflict: _cleared, ...rest } = item;
        return {
          ...rest,
          packageSize: action.packageSize.slice(0, 24),
          fieldSources: { ...item.fieldSources, packageSize: "parent" as const },
        };
      });
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
    case "set-alternative": {
      if (state.adventure?.phase !== "draft") return state;
      return updateItem(state, action.itemId, (item) => ({ ...item, alternative: action.alternative }));
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
    case "play-skip":
    case "play-done":
    case "play-activate": {
      if (!state.adventure) return state;
      const current = activeItem(state.adventure.items);
      if (!current?.play || current.play.status === "done" || current.play.status === "skipped") return state;
      if (action.type === "play-activate" && current.play.status === "active") return state;
      const status = (action.type === "play-skip" ? "skipped" : action.type === "play-done" ? "done" : "active") as
        | "skipped"
        | "done"
        | "active";
      const items = state.adventure.items.map((item) =>
        item.id === current.id ? { ...item, play: { ...item.play!, status } } : item,
      );
      // Only "Nu niet" is undoable; activate/done are soft UI progress.
      const history = action.type === "play-skip" ? withHistory(state, state.adventure) : state.adventure.history;
      return { ...state, adventure: touch(state.adventure, { items, history }) };
    }
    case "new-draft": {
      const saved = state.adventure?.items.length ? upsertSaved(state.saved, state.adventure) : state.saved;
      return { ...state, saved, adventure: blankDraft(state.categoryOrder, state.settings.retailer) };
    }
    case "start-sample": {
      const saved = state.adventure?.items.length ? upsertSaved(state.saved, state.adventure) : state.saved;
      return { ...state, saved, adventure: withRetailer(createSampleAdventure(state.categoryOrder), state.settings.retailer) };
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
    case "clear-open-items": {
      if (!state.adventure) return state;
      const items = state.adventure.items.filter((item) => item.status === "found");
      if (items.length === state.adventure.items.length) return state;
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
      const discovered = action.discovered ? { discovered: [...(adventure.discovered ?? []), item.id] } : {};
      return { ...state, mine: rememberMine(state.mine, item), adventure: touch(adventure, { items: [...adventure.items, item], ...discovered }) };
    }
    case "cheer": {
      if (!state.adventure || state.adventure.cheered?.includes(action.milestone)) return state;
      return { ...state, adventure: touch(state.adventure, { cheered: [...(state.adventure.cheered ?? []), action.milestone] }) };
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
      return updateItem(state, action.itemId, (item) => {
        const custom = item.kind === "custom_generic";
        const edited: AdventureItem = {
          ...item,
          name: action.name?.trim().slice(0, 40) || item.name,
          category: action.category ?? item.category,
          icon: action.icon ?? item.icon,
          productId: custom ? item.productId : (action.productId ?? item.productId),
          ...(item.enrichment?.status === "pending" && (action.category || action.icon) && { enrichment: { ...item.enrichment, status: "done" as const } }),
        };
        if (!custom || !action.icon || !edited.illustrationId) return edited;
        const { illustrationId: _drawing, ...rest } = edited;
        return { ...rest, illustration: "none" };
      });
    case "add-custom": {
      const name = customName(action.name);
      if (!name) return state;
      const known = suggestion(name, state.mine);
      if (known?.kind === "catalog" && !known.close && nameTaken(name, [known.product.name])) return reducer(state, { type: "add-product", product: known.product });
      if (known?.kind === "mine" && known.entry.kind !== "custom_generic") return reducer(state, { type: "add-mine", key: mineKey(known.entry) });
      const adventure = ensureDraft(state);
      const productId = customProductId(name);
      const existing = adventure.items.find((item) => item.status !== "found" && item.productId === productId);
      if (existing) {
        const items = adventure.items.map((item) => (item === existing ? { ...item, quantity: Math.min(24, item.quantity + 1) } : item));
        return { ...state, adventure: touch(adventure, { items }) };
      }
      const entry = state.mine.find((saved) => saved.kind === "custom_generic" && saved.productId === productId) ?? customEntry(name);
      const item: AdventureItem = { ...itemFromSaved(entry), id: action.itemId };
      const mine = [entry, ...state.mine.filter((saved) => saved !== entry)].slice(0, MINE_LIMIT);
      return { ...state, mine, adventure: touch(adventure, { items: [...adventure.items, item] }) };
    }
    case "enrich-custom":
      return updateCustom(state, action.productId, (item) => {
        if (item.enrichment?.status !== "pending") return item;
        if (action.result) {
          const next = enriched(item, action.result);
          return action.illustrations && !next.illustrationId ? { ...next, illustration: "pending" } : next;
        }
        const tries = item.enrichment.tries + 1;
        return { ...item, enrichment: { status: action.final || tries >= ENRICH_TRIES ? "failed" : "pending", tries, at: Date.now() } };
      });
    case "brand-custom": {
      const brand = action.brand.trim().slice(0, 40);
      if (!brand) return state;
      return updateCustom(state, action.productId, (item) => {
        const untouched = item.enrichment?.status === "pending";
        if (item.brand === brand && !untouched) return item;
        const moved = untouched && action.category && action.category !== item.category ? { category: action.category, icon: categoryIcon(action.category) } : {};
        return { ...item, brand, ...moved, enrichment: { status: "done" as const, tries: item.enrichment?.tries ?? 0, at: Date.now() } };
      });
    }
    case "choose-name-photo":
      return updateCustom(state, action.productId, (item) => {
        if (action.photo) return { ...item, namePhoto: action.photo };
        const { namePhoto: _photo, ...rest } = item;
        return rest as typeof item;
      });
    case "adopt-commercial":
      return updateItem(state, action.itemId, (item) => {
        const {
          ean: _ean,
          barcode: _barcode,
          nutrition: _nutrition,
          offAttribution: _off,
          recognition: _recognition,
          packConflict: _conflict,
          packageSize: _packageSize,
          photoId: _photoId,
          imageUrl: _imageUrl,
          imageKind: _imageKind,
          imageSource: _imageSource,
          fieldSources: previousFields,
          alternative: _alternative,
          missionEnabled: _missionEnabled,
          brand: _oldBrand,
          ...rest
        } = item;
        const draft = state.adventure?.phase === "draft";
        const fieldSources = previousFields
          ? (() => {
              const { packageSize: _pack, ...kept } = previousFields;
              return Object.keys(kept).length ? kept : undefined;
            })()
          : undefined;
        return {
          ...rest,
          ...(draft ? {} : { alternative: item.alternative, missionEnabled: item.missionEnabled }),
          name: action.name.slice(0, 40),
          ...(action.brand ? { brand: action.brand.slice(0, 40) } : {}),
          privateLabelRetailer: action.privateLabelRetailer,
          ...(fieldSources && { fieldSources }),
          ...(action.photo && { namePhoto: action.photo, imageChoice: "reference" as const }),
          ...(!action.photo && item.namePhoto ? { namePhoto: item.namePhoto } : {}),
        };
      });
    case "set-illustration":
      return updateCustom(state, action.productId, (item) => {
        if (item.illustration === "none") return item;
        return action.illustrationId ? { ...item, illustrationId: action.illustrationId, illustration: "ready" } : { ...item, illustration: item.illustrationId ? "ready" : "none" };
      });
    case "insert-item": {
      if (!state.adventure || state.adventure.items.some((item) => item.id === action.item.id)) return state;
      const items = [...state.adventure.items];
      items.splice(Math.max(0, Math.min(action.index, items.length)), 0, action.item);
      return { ...state, adventure: touch(state.adventure, { items }) };
    }
    case "start-shopping": {
      if (!state.adventure?.items.length || state.adventure.phase === "shopping") return state;
      const reset = state.adventure.items.map(({ stars: _stars, scan: _scan, mission: _mission, play: _play, ...item }) => ({
        ...item,
        status: "pending" as const,
      }));
      const withBonuses = assignBonuses(reset, state.settings.smartDiscovery, state.declined, state.adventure.id);
      const items = sortByCategory(withBonuses, state.adventure.categoryOrder);
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
      const { forgotten: _forgotten, ...current } = state.adventure;
      const adventure = action.name === undefined && action.store === undefined ? current : { ...current, name: name || DEFAULT_LIST_NAME, store: store || undefined };
      return { ...state, adventure, saved: upsertSaved(state.saved, adventure, true) };
    }
    case "save-favorite-as-new": {
      if (!state.adventure?.items.length) return state;
      const name = action.name?.trim().slice(0, 40);
      const store = action.store?.trim().slice(0, 40);
      const { forgotten: _forgotten, ...current } = state.adventure;
      const adventure = {
        ...current,
        id: crypto.randomUUID(),
        name: name || DEFAULT_LIST_NAME,
        store: store || undefined,
        updatedAt: Date.now(),
      };
      return { ...state, adventure, saved: upsertSaved(state.saved, adventure, true) };
    }
    case "open-saved": {
      const list = state.saved.find((entry) => entry.id === action.id);
      if (!list) return state;
      const adventure = createAdventure(list.name, [], state.categoryOrder, "draft");
      const items = sortByCategory(list.items.map(itemFromSaved), state.categoryOrder);
      const retailer = isRetailer(list.retailer) ? list.retailer : state.settings.retailer;
      return { ...state, adventure: withRetailer({ ...adventure, id: list.id, ...(list.store && { store: list.store }), items }, retailer) };
    }
    case "forget-saved":
      return { ...state, saved: state.saved.filter((list) => list.id !== action.id), adventure: forget(state.adventure, [action.id]) };
    case "restore-saved": {
      const saved = state.saved.filter((list) => list.id !== action.list.id);
      const adventure = state.adventure?.id === action.list.id ? remembered(state.adventure) : state.adventure;
      return { ...state, adventure, saved: [...saved.slice(0, action.index), action.list, ...saved.slice(action.index)] };
    }
    case "clear-saved":
      return { ...state, saved: [], adventure: forget(state.adventure, state.saved.map((list) => list.id)) };
    case "import-shared-list": {
      const items = toImportSavedItems(action.list);
      if (!items.length) return state;
      const name = action.list.name?.trim().slice(0, 40) || DEFAULT_LIST_NAME;
      const retailer = isRetailer(action.list.retailer) ? action.list.retailer : undefined;
      const entry: SavedList = {
        id: crypto.randomUUID(),
        name,
        ...(retailer && { retailer }),
        items,
        favorite: false,
        updatedAt: Date.now(),
      };
      if (action.mode === "save-only") {
        return { ...state, saved: [entry, ...state.saved].slice(0, 40) };
      }
      const saved = state.adventure?.items.length ? upsertSaved(state.saved, state.adventure) : state.saved;
      const adventure = createAdventure(name, [], state.categoryOrder, "draft");
      const sorted = sortByCategory(items.map(itemFromSaved), state.categoryOrder);
      return {
        ...state,
        saved: [entry, ...saved.filter((list) => list.id !== entry.id)].slice(0, 40),
        adventure: withRetailer({ ...adventure, id: entry.id, items: sorted }, retailer),
      };
    }
    case "feedback-asked":
      return state.feedbackAsked ? state : { ...state, feedbackAsked: true };
    default:
      return state;
  }
}
