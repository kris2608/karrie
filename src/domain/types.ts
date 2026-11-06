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

export type AdventureItem = {
  id: string;
  productId: string;
  name: string;
  icon: string;
  category: CategoryId;
  quantity: number;
  status: ItemStatus;
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

export type SavedItem = {
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
