import { describe, expect, it } from "vitest";
import { productPhrase } from "../../domain/voiceScripts";
import { findLibraryEntry, type VoiceLibraryManifest } from "./libraryClient";

describe("voice library client", () => {
  it("does not play a marin manifest from any cached library", () => {
    const phrase = productPhrase({ productId: "melk", name: "Melk", quantity: 1 });
    const manifest: VoiceLibraryManifest = {
      version: "v5",
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      instructionVersion: "v5",
      deliveryVersion: "v5",
      templateVersion: "v5",
      entries: [{ event: "product", text: phrase.text, file: "product/old.wav", cacheKey: "old", productId: "melk" }],
    };
    expect(findLibraryEntry(manifest, phrase)).toBeNull();
  });
});
