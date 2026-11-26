import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pcmToWav } from "./wav.js";
import { expectedLibraryIdentity, libraryLookup, loadVoiceLibrary, resetVoiceLibraryCache } from "./library.js";

function library(manifest: unknown, files: Record<string, Buffer> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "karrie-voice-"));
  for (const [file, audio] of Object.entries(files)) {
    const abs = join(root, file);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, audio);
  }
  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
  return root;
}

function loudWav(): Buffer {
  const pcm = Buffer.alloc(24_000 * 2 * 0.9);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(8_000, i);
  return pcmToWav(pcm, 24_000);
}

describe("voice library identity", () => {
  afterEach(() => {
    delete process.env.VOICE_LIBRARY_DIR;
    resetVoiceLibraryCache();
  });

  it("ignores a marin v5 library so those clips cannot be served", () => {
    const root = library({
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      instructionVersion: "v5",
      deliveryVersion: "v5",
      templateVersion: "v5",
      entries: [{ event: "positive", text: "Hebbes!", file: "positive/old.wav", cacheKey: "marin-key" }],
    }, { "positive/old.wav": loudWav() });
    process.env.VOICE_LIBRARY_DIR = root;
    resetVoiceLibraryCache();
    expect(loadVoiceLibrary().byKey.size).toBe(0);
    expect(libraryLookup({ cacheKey: "marin-key", event: "positive", text: "Hebbes!" })).toBeNull();
  });

  it("skips a silent clip even when the manifest identity matches", () => {
    const identity = expectedLibraryIdentity();
    const silent = Buffer.alloc(24_000 * 2 * 4.8);
    const root = library(
      {
        ...identity,
        entries: [{ event: "product", text: "Kun jij de hagelslag vinden?", file: "product/bad.wav", cacheKey: "bad" }],
      },
      { "product/bad.wav": pcmToWav(silent, 24_000) },
    );
    process.env.VOICE_LIBRARY_DIR = root;
    resetVoiceLibraryCache();
    expect(loadVoiceLibrary().byKey.has("bad")).toBe(false);
    expect(libraryLookup({ cacheKey: "bad", event: "product", text: "Kun jij de hagelslag vinden?" })).toBeNull();
  });

  it("serves a loud clip whose manifest matches the current voice", () => {
    const identity = expectedLibraryIdentity();
    const root = library(
      {
        ...identity,
        entries: [{ event: "positive", text: "Hebbes!", file: "positive/ok.wav", cacheKey: "ok" }],
      },
      { "positive/ok.wav": loudWav() },
    );
    process.env.VOICE_LIBRARY_DIR = root;
    resetVoiceLibraryCache();
    expect(loadVoiceLibrary().byKey.has("ok")).toBe(true);
    expect(libraryLookup({ cacheKey: "ok", event: "positive", text: "Hebbes!" })?.voice).toBe(identity.voice);
  });
});
