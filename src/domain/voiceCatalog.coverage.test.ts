import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { products } from "../data/catalog";
import { allVoiceCatalogEntries, voiceCatalogEntry } from "./voiceCatalog";
import { productPhrase, VOICE_DELIVERY_VERSION, VOICE_INSTRUCTION_VERSION, VOICE_TEMPLATE_VERSION } from "./voiceScripts";

const MANIFEST = join(process.cwd(), "public", "voice-library", "manifest.json");
const LIB_ROOT = join(process.cwd(), "public", "voice-library");

describe("voice catalog coverage", () => {
  it("covers every generic catalogue product with a fixed instruction", () => {
    expect(allVoiceCatalogEntries()).toHaveLength(products.length);
    for (const product of products) {
      const entry = voiceCatalogEntry(product.id);
      expect(entry, product.id).toBeDefined();
      expect(entry!.instruction.length).toBeGreaterThan(3);
      const phrase = productPhrase({ productId: product.id, name: product.name, quantity: 1 });
      expect(phrase.text).toBe(entry!.instruction);
      expect(phrase.productId).toBe(product.id);
      // Quantity must not change catalog speech.
      expect(productPhrase({ productId: product.id, name: product.name, quantity: 3 }).text).toBe(entry!.instruction);
    }
  });

  it("has a compatible manifest entry and valid WAV for every catalog instruction", () => {
    expect(existsSync(MANIFEST)).toBe(true);
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
      voice: string;
      model: string;
      instructionVersion: string;
      deliveryVersion: string;
      templateVersion: string;
      entries: Array<{ event: string; text: string; file: string; productId?: string }>;
    };
    expect(manifest.voice).toBe("marin");
    expect(manifest.model).toBe("gpt-realtime-2.1-mini");
    expect(manifest.instructionVersion).toBe(VOICE_INSTRUCTION_VERSION);
    expect(manifest.deliveryVersion).toBe(VOICE_DELIVERY_VERSION);
    expect(manifest.templateVersion).toBe(VOICE_TEMPLATE_VERSION);

    const byPid = new Map(
      manifest.entries.filter((e) => e.event === "product" && e.productId).map((e) => [e.productId!, e]),
    );

    let covered = 0;
    for (const product of products) {
      const instruction = voiceCatalogEntry(product.id)!.instruction;
      const entry = byPid.get(product.id);
      expect(entry, `manifest missing ${product.id}`).toBeDefined();
      expect(entry!.text).toBe(instruction);
      const wavPath = join(LIB_ROOT, entry!.file);
      expect(existsSync(wavPath), wavPath).toBe(true);
      const head = readFileSync(wavPath).subarray(0, 12);
      expect(head.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(head.subarray(8, 12).toString("ascii")).toBe("WAVE");
      covered += 1;
    }
    expect(covered).toBe(products.length);
  });
});
