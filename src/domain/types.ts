import type { RetailerId } from "./retailers";

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

/** The parent's choice of picture; undefined lets a found reference picture win over the photo, then the drawing. */
export type ImageChoice = "reference" | "photo" | "drawing";

/** How the product itself was identified. "off": Open Food Facts by barcode; "barcode": a web page that prints the barcode. */
export type ItemSource = "catalog" | "manual" | "off" | "barcode" | "vision";

/** Where one field came from: the parent, Open Food Facts, a web page, read on the photo, or guessed from it. */
export type FieldSource = "parent" | "off" | "web" | "photo" | "guess";
export type FieldSources = Partial<Record<"name" | "brand" | "variant" | "packageSize" | "image" | "nutrition", FieldSource>>;

/** The barcode lookup behind an item. None of these is verified; off-exact only means name and brand were present. */
export type BarcodeInfo = { status: "off-exact" | "off-partial" | "web-page"; sourceName: string; sourceUrl: string; at: number };

/** Where the shown photo came from, independent of how the product was identified. */
export type ImageSource = "off" | "parent";

export type Confidence = "high" | "medium" | "low";

/** What OpenAI read or guessed from the photo. Nothing here is verified. */
export type Recognition = {
  genericName?: string;
  variant?: string;
  subcategory?: string;
  claims?: string[];
  nutriScoreSeen?: string;
  ingredientsSeen?: string;
  /** A barcode the model read; checksum-valid but never confirmed, so never used for gameplay. */
  eanCandidate?: string;
  specific?: boolean;
  confidence: Confidence;
  inferred?: string[];
};

/** Legacy barcode-scan result on lists from before the scanner was removed. */
export type ScanResult = "verified" | "confirmed";

export type Criterion = "no-added-sugar" | "no-added-salt" | "unsalted" | "wholegrain" | "less-sugar" | "more-fibre" | "less-saturated-fat";

/** "label": the issue was read on the pack; "inferred": the model's own product knowledge. */
export type Evidence = "label" | "inferred" | "none";

/** OpenAI's suggestion after the local guards. Never "verified": there is no second data source to check it against. */
export type AlternativeAssessment = {
  status: "none" | "possible" | "insufficient-data";
  evidence: Evidence;
  criteria: Criterion[];
  alternativeType?: string;
  /** Catalog id of the alternative; its drawing is what the child looks for. */
  targetType?: string;
  reason?: string;
  parentExplanation?: string;
  childPrompt?: string;
  source: "photo";
  model?: string;
  assessedAt: number;
};

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
  /** Only a code the phone's barcode reader decoded (checksum-valid); a model reading stays in recognition.eanCandidate. */
  ean?: string;
  brand?: string;
  packageSize?: string;
  imageUrl?: string;
  /** Key of a parent photo stored on this device. */
  photoId?: string;
  imageKind?: ImageKind;
  imageSource?: ImageSource;
  imageChoice?: ImageChoice;
  source?: ItemSource;
  nutrition?: Nutrition;
  offAttribution?: boolean;
  barcode?: BarcodeInfo;
  fieldSources?: FieldSources;
  recognition?: Recognition;
  alternative?: AlternativeAssessment;
  /** The parent's choice for the bonus mission; undefined means the evidence-based default. */
  missionEnabled?: boolean;
};

/** Per-adventure state of a bonus mission: offered at start, active once the child goes looking. */
export type MissionState = {
  status: "offered" | "active" | "skipped" | "done";
  stars?: number;
  kept?: "original" | "alternative";
  swappedFrom?: AdventureItem;
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
  mission?: MissionState;
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
  /** The supermarket the parent typed when saving; not used for anything else yet. */
  store?: string;
  /** The supermarket whose offers are shown for this list; no lookups happen without one. */
  retailer?: RetailerId;
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
  store?: string;
  retailer?: RetailerId;
  items: SavedItem[];
  favorite: boolean;
  updatedAt: number;
};
