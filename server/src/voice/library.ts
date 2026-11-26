import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceCacheEntry } from "./cache.js";
import { checkSpokenClip } from "./clipQuality.js";
import { libraryFileId as hashLibraryFileId } from "./libraryId.js";
import {
  DEFAULT_VOICE_MODEL,
  DEFAULT_VOICE_NAME,
  VOICE_DELIVERY_VERSION,
  VOICE_INSTRUCTION_VERSION,
  VOICE_TEMPLATE_VERSION,
} from "./personality.js";

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

/** Includes the instruction version so a marin-era filename cannot be served again. */
export function libraryFileId(text: string, version = VOICE_INSTRUCTION_VERSION): string {
  return hashLibraryFileId(text, version);
}

export function expectedLibraryIdentity(): {
  model: string;
  voice: string;
  instructionVersion: string;
  deliveryVersion: string;
  templateVersion: string;
} {
  return {
    model: process.env.OPENAI_VOICE_MODEL || DEFAULT_VOICE_MODEL,
    voice: process.env.OPENAI_VOICE || DEFAULT_VOICE_NAME,
    instructionVersion: VOICE_INSTRUCTION_VERSION,
    deliveryVersion: VOICE_DELIVERY_VERSION,
    templateVersion: VOICE_TEMPLATE_VERSION,
  };
}

export function libraryIdentityMatches(manifest: Pick<VoiceLibraryManifest, "model" | "voice" | "instructionVersion" | "deliveryVersion" | "templateVersion">): boolean {
  const expected = expectedLibraryIdentity();
  return (
    manifest.model === expected.model &&
    manifest.voice === expected.voice &&
    manifest.instructionVersion === expected.instructionVersion &&
    manifest.deliveryVersion === expected.deliveryVersion &&
    manifest.templateVersion === expected.templateVersion
  );
}

export function resetVoiceLibraryCache(): void {
  cached = null;
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
    if (!libraryIdentityMatches(manifest)) {
      console.warn(
        JSON.stringify({
          event: "voice_library_ignored",
          reason: "identity",
          model: manifest.model,
          voice: manifest.voice,
          instructionVersion: manifest.instructionVersion,
        }),
      );
      cached = { root, byKey, byText };
      return cached;
    }
    for (const entry of manifest.entries ?? []) {
      const path = join(root, entry.file);
      if (!existsSync(path)) continue;
      const audio = readFileSync(path);
      const quality = checkSpokenClip(audio, entry.text);
      if (!quality.ok) {
        console.warn(JSON.stringify({ event: "voice_library_clip_rejected", file: entry.file, reason: quality.reason }));
        continue;
      }
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
  // Require cacheKey match — do not fall back to event|text (wrong-era audio risk).
  return lib.byKey.get(input.cacheKey) ?? null;
}

/** Hash used in Postgres seed keys — same as voiceCacheKey. */
export function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
