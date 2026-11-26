import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { products } from "../data/catalog";
import { voiceCatalogEntry } from "./voiceCatalog";
import { productPhrase, VOICE_DELIVERY_VERSION, VOICE_INSTRUCTION_VERSION, VOICE_TEMPLATE_VERSION } from "./voiceScripts";

const MANIFEST = join(process.cwd(), "server", "voice-library", "manifest.json");

describe("voice catalog coverage", () => {
  it("speaks a fixed instruction for every generic product", () => {
    for (const product of products) {
      const entry = voiceCatalogEntry(product.id);
      expect(entry, product.id).toBeDefined();
      expect(productPhrase({ productId: product.id, name: product.name, quantity: 1 }).text).toBe(entry!.instruction);
    }
  });

  it("only serves a library generated for the current voice", () => {
    if (!existsSync(MANIFEST)) return;
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
      voice: string;
      model: string;
      instructionVersion: string;
      deliveryVersion: string;
      templateVersion: string;
    };
    expect(manifest.voice).toBe("coral");
    expect(manifest.model).toBe("gpt-realtime-2.1");
    expect(manifest.instructionVersion).toBe(VOICE_INSTRUCTION_VERSION);
    expect(manifest.deliveryVersion).toBe(VOICE_DELIVERY_VERSION);
    expect(manifest.templateVersion).toBe(VOICE_TEMPLATE_VERSION);
  });
});
