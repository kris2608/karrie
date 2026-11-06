import { openDB } from "idb";
import { DEFAULT_CATEGORY_ORDER } from "../domain/categories";
import type { Adventure, CategoryId, SavedList } from "../domain/types";
import { defaultSettings, type Settings } from "../state/reducer";

const DB_NAME = "karrie";
const DB_VERSION = 3;

export type Persisted = {
  adventure: Adventure | null;
  saved: SavedList[];
  stickers: string[];
  categoryOrder: CategoryId[];
  settings: Settings;
  declined: string[];
};

export const emptyPersisted = (): Persisted => ({
  adventure: null,
  saved: [],
  stickers: [],
  categoryOrder: [...DEFAULT_CATEGORY_ORDER],
  settings: { ...defaultSettings },
  declined: [],
});

let connection: ReturnType<typeof openDB> | null = null;

function database() {
  connection ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("products")) db.createObjectStore("products");
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
    },
    blocking(_current, _next, event) {
      // A newer Karrie in another tab needs to upgrade; let it.
      (event.target as IDBDatabase).close();
      connection = null;
    },
    terminated() {
      connection = null;
    },
  }).catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

export async function writePhoto(id: string, blob: Blob): Promise<void> {
  await (await database()).put("photos", blob, id);
}

export async function readPhoto(id: string): Promise<Blob | undefined> {
  try {
    return (await (await database()).get("photos", id)) as Blob | undefined;
  } catch {
    return undefined;
  }
}

export async function photoKeys(): Promise<string[]> {
  try {
    return (await (await database()).getAllKeys("photos")).map(String);
  } catch {
    return [];
  }
}

export async function deletePhotos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    const tx = (await database()).transaction("photos", "readwrite");
    await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
  } catch {
    // Left-over photos only cost space; the next start tries again.
  }
}

export async function loadPersisted(): Promise<Persisted> {
  try {
    const db = await database();
    const adventure = (await db.get("kv", "adventure")) as Adventure | null | undefined;
    const saved = (await db.get("kv", "saved")) as SavedList[] | undefined;
    const stickers = (await db.get("kv", "stickers")) as string[] | undefined;
    const categoryOrder = (await db.get("kv", "categoryOrder")) as CategoryId[] | undefined;
    const settings = (await db.get("kv", "settings")) as Partial<Settings> | undefined;
    const discovery = (await db.get("kv", "discovery")) as { declined?: string[] } | undefined;
    return {
      adventure: adventure ?? null,
      saved: saved ?? [],
      stickers: stickers ?? [],
      categoryOrder: categoryOrder?.length ? categoryOrder : [...DEFAULT_CATEGORY_ORDER],
      settings: { ...defaultSettings, ...settings },
      declined: Array.isArray(discovery?.declined) ? discovery.declined : [],
    };
  } catch {
    return emptyPersisted();
  }
}

export async function savePersisted(data: Persisted): Promise<void> {
  const db = await database();
  const tx = db.transaction("kv", "readwrite");
  await Promise.all([
    tx.store.put(data.adventure, "adventure"),
    tx.store.put(data.saved, "saved"),
    tx.store.put(data.stickers, "stickers"),
    tx.store.put(data.categoryOrder, "categoryOrder"),
    tx.store.put(data.settings, "settings"),
    tx.store.put({ declined: data.declined }, "discovery"),
    tx.done,
  ]);
}
