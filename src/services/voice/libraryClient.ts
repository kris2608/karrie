import {
  VOICE_DELIVERY_VERSION,
  VOICE_INSTRUCTION_VERSION,
  VOICE_TEMPLATE_VERSION,
  type VoicePhrase,
} from "../../domain/voiceScripts";
import { getVoiceCacheConfig } from "./cache";

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

let manifestPromise: Promise<VoiceLibraryManifest | null> | null = null;
let manifestCache: VoiceLibraryManifest | null | undefined;

function baseUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

export async function loadVoiceLibraryManifest(): Promise<VoiceLibraryManifest | null> {
  if (manifestCache !== undefined) return manifestCache;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const response = await fetch(`${baseUrl()}voice-library/manifest.json`, { method: "GET" });
      if (!response.ok) {
        manifestCache = null;
        return null;
      }
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/html")) {
        manifestCache = null;
        return null;
      }
      const body = (await response.json()) as VoiceLibraryManifest;
      if (!body?.entries?.length) {
        manifestCache = null;
        return null;
      }
      manifestCache = body;
      return body;
    } catch {
      manifestCache = null;
      return null;
    } finally {
      manifestPromise = null;
    }
  })();
  return manifestPromise;
}

function versionsCompatible(manifest: VoiceLibraryManifest): boolean {
  const cfg = getVoiceCacheConfig();
  const instruction = cfg.instructionVersion || VOICE_INSTRUCTION_VERSION;
  const delivery = cfg.deliveryVersion || VOICE_DELIVERY_VERSION;
  const template = cfg.templateVersion || VOICE_TEMPLATE_VERSION;
  return (
    manifest.voice === cfg.voice &&
    manifest.model === cfg.model &&
    manifest.instructionVersion === instruction &&
    manifest.deliveryVersion === delivery &&
    manifest.templateVersion === template
  );
}

export function findLibraryEntry(
  manifest: VoiceLibraryManifest,
  phrase: VoicePhrase & { productId?: string },
): LibraryManifestEntry | null {
  if (!versionsCompatible(manifest)) return null;
  if (phrase.event === "product" && phrase.productId) {
    const byId = manifest.entries.find((e) => e.event === "product" && e.productId === phrase.productId && e.text === phrase.text);
    if (byId) return byId;
  }
  return manifest.entries.find((e) => e.event === phrase.event && e.text === phrase.text) ?? null;
}

/** RIFF....WAVE header check; rejects HTML/error bodies with HTTP 200. */
export function isValidWavBlob(blob: Blob, contentType?: string | null): boolean {
  if (contentType && /text\/html|application\/json|text\/plain/i.test(contentType)) return false;
  return blob.size >= 44;
}

export async function assertValidWav(blob: Blob, contentType?: string | null): Promise<boolean> {
  if (!isValidWavBlob(blob, contentType)) return false;
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (head.length < 12) return false;
  const riff = String.fromCharCode(head[0]!, head[1]!, head[2]!, head[3]!);
  const wave = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!);
  return riff === "RIFF" && wave === "WAVE";
}

export async function fetchManifestLibraryClip(
  phrase: VoicePhrase & { productId?: string },
): Promise<{ blob: Blob; file: string } | null> {
  if (typeof fetch === "undefined") return null;
  const manifest = await loadVoiceLibraryManifest();
  if (!manifest) return null;
  const entry = findLibraryEntry(manifest, phrase);
  if (!entry) return null;
  const url = `${baseUrl()}voice-library/${entry.file.replace(/^\/+/, "")}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type");
  const blob = await response.blob();
  if (!(await assertValidWav(blob, contentType))) return null;
  return { blob, file: entry.file };
}
