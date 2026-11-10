import { useEffect, useSyncExternalStore } from "react";
import type { Adventure, PackInfo, SavedList } from "../domain/types";
import { trackStorageFailure } from "../services/analyticsHelpers";
import { deletePhotos, photoKeys, readPhoto, writePhoto } from "./db";

type Entry = { url: string | null; loading?: Promise<void> };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(id: string): Promise<void> {
  const known = entries.get(id);
  if (known?.url || known?.loading) return known.loading ?? Promise.resolve();
  const loading = readPhoto(id).then((blob) => {
    entries.set(id, { url: blob ? URL.createObjectURL(blob) : null });
    emit();
  });
  entries.set(id, { url: null, loading });
  return loading;
}

/** Stores a processed photo and makes it available immediately. */
export async function savePhoto(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  try {
    await writePhoto(id, blob);
  } catch (error) {
    const quota = error instanceof DOMException && error.name === "QuotaExceededError";
    trackStorageFailure("photo", quota ? "quota" : "write_failed");
    throw error;
  }
  entries.set(id, { url: URL.createObjectURL(blob) });
  emit();
  return id;
}

export function photoUrl(id: string | undefined): string | null {
  return id ? (entries.get(id)?.url ?? null) : null;
}

export function usePhotoUrl(id: string | undefined): string | null {
  const url = useSyncExternalStore(subscribe, () => photoUrl(id));
  useEffect(() => {
    if (id) void load(id);
  }, [id]);
  return url;
}

export function referencedPhotos(adventure: Adventure | null, saved: SavedList[]): Set<string> {
  const ids = new Set<string>();
  const add = (item: PackInfo) => {
    if (item.photoId) ids.add(item.photoId);
    if (item.illustrationId) ids.add(item.illustrationId);
  };
  if (adventure) {
    adventure.items.forEach(add);
    for (const entry of adventure.history) entry.items.forEach(add);
  }
  for (const list of saved) list.items.forEach(add);
  return ids;
}

/** Decodes every photo still in use and deletes the rest. Runs once at start so undo keeps working. */
export async function preparePhotos(adventure: Adventure | null, saved: SavedList[], alsoKeep: string[] = []): Promise<void> {
  const keep = referencedPhotos(adventure, saved);
  await Promise.all([...keep].map(load));
  const spare = new Set(alsoKeep);
  const stored = await photoKeys();
  await deletePhotos(stored.filter((id) => !keep.has(id) && !spare.has(id)));
}
