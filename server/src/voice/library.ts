import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceCacheEntry } from "./cache.js";

export type LibraryManifestEntry = {
  event: string;
  text: string;
  file: string;
  cacheKey: string;
  productId?: string;
};

export type VoiceLibraryManifest = {
  version: string;
  model: string;
  voice: string;
  instructionVersion: string;
  deliveryVersion: string;
  templateVersion: string;
  entries: LibraryManifestEntry[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, "..", "..", "voice-library");

let cached: { root: string; byKey: Map<string, VoiceCacheEntry>; byText: Map<string, VoiceCacheEntry> } | null = null;

/** Short stable id matching client `voiceLibraryFileId`. */
export function libraryFileId(text: string): string {
  let hash = 2166136261;
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function loadVoiceLibrary(root = process.env.VOICE_LIBRARY_DIR || DEFAULT_ROOT): {
  byKey: Map<string, VoiceCacheEntry>;
  byText: Map<string, VoiceCacheEntry>;
} {
  if (cached && cached.root === root) return cached;
  const byKey = new Map<string, VoiceCacheEntry>();
  const byText = new Map<string, VoiceCacheEntry>();
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) {
    cached = { root, byKey, byText };
    return cached;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VoiceLibraryManifest;
    for (const entry of manifest.entries ?? []) {
      const path = join(root, entry.file);
      if (!existsSync(path)) continue;
      const audio = readFileSync(path);
      const value: VoiceCacheEntry = {
        audio,
        contentType: "audio/wav",
        model: manifest.model,
        voice: manifest.voice,
      };
      byKey.set(entry.cacheKey, value);
      byText.set(`${entry.event}|${entry.text}`, value);
    }
  } catch (error) {
    console.warn(JSON.stringify({ event: "voice_library_load_failed", error: String(error).slice(0, 120) }));
  }
  cached = { root, byKey, byText };
  return cached;
}

export function libraryLookup(input: {
  cacheKey: string;
  event: string;
  text: string;
}): VoiceCacheEntry | null {
  const lib = loadVoiceLibrary();
  return lib.byKey.get(input.cacheKey) ?? lib.byText.get(`${input.event}|${input.text}`) ?? null;
}

/** Hash used in Postgres seed keys — same as voiceCacheKey. */
export function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
