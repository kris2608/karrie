export type CategoryId = "produce" | "bakery" | "pantry" | "dairy" | "frozen" | "household";

export type ItemStatus = "pending" | "found" | "skipped";

export type AdventurePhase = "draft" | "shopping" | "done";

export type Product = {
  id: string;
  name: string;
  aliases: string[];
  category: CategoryId;
  groupId: string;
};

export type ImageKind = "generic" | "photo";

/** How the product itself was identified: catalog, typed by a parent, Open Food Facts, or OpenAI photo recognition. */
export type ItemSource = "catalog" | "manual" | "off" | "vision";

/** Where the shown photo came from, independent of how the product was identified. */
export type ImageSource = "off" | "parent";

export type Confidence = "high" | "medium" | "low";

export type Recognition = {
  genericName?: string;
  variant?: string;
  subcategory?: string;
  claims?: string[];
  nutriScoreSeen?: string;
  confidence: Confidence;
  inferred?: string[];
};

export type ScanResult = "verified" | "confirmed";

export type Nutrition = {
  nutriscore?: string;
  energyKcal100g?: number;
  sugars100g?: number;
  fat100g?: number;
  saturatedFat100g?: number;
  salt100g?: number;
  proteins100g?: number;
  fiber100g?: number;
};

export type PackInfo = {
  ean?: string;
  brand?: string;
  packageSize?: string;
  imageUrl?: string;
  /** Key of a parent photo stored on this device. */
  photoId?: string;
  imageKind?: ImageKind;
  imageSource?: ImageSource;
  source?: ItemSource;
  nutrition?: Nutrition;
  offAttribution?: boolean;
  recognition?: Recognition;
};

export type ScannedProduct = {
  ean: string;
  name?: string;
  brand?: string;
  packageSize?: string;
  imageUrl?: string;
  categoryTags: string[];
  nutrition?: Nutrition;
  category: CategoryId;
  matchProductId?: string;
};

export type AdventureItem = PackInfo & {
  id: string;
  productId: string;
  name: string;
  icon: string;
  category: CategoryId;
  quantity: number;
  status: ItemStatus;
  stars?: number;
  scan?: ScanResult;
};

export type HistoryEntry = {
  items: AdventureItem[];
  phase: AdventurePhase;
  stickerId?: string;
  stickers: string[];
};

export type Adventure = {
  id: string;
  name: string;
  phase: AdventurePhase;
  items: AdventureItem[];
  categoryOrder: CategoryId[];
  createdAt: number;
  updatedAt: number;
  stickerId?: string;
  history: HistoryEntry[];
};

export type SavedItem = PackInfo & {
  productId: string;
  name: string;
  icon: string;
  category: CategoryId;
  quantity: number;
};

export type SavedList = {
  id: string;
  name: string;
  items: SavedItem[];
  favorite: boolean;
  updatedAt: number;
};
