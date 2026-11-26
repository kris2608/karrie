import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import catalogJson from "../data/voice-catalog.json";
import { products } from "../data/catalog";
import { buildVoiceCatalog, instructionFor, PRODUCT_SPEECH, ruleForProduct } from "./productSpeechGrammar";
import { productPhrase } from "./voiceScripts";

describe("product speech grammar", () => {
  it("covers every catalogue product with de/het and singular or plural", () => {
    expect(Object.keys(PRODUCT_SPEECH)).toHaveLength(products.length);
    expect(catalogJson).toEqual(buildVoiceCatalog());
    for (const product of products) {
      const rule = ruleForProduct(product.id);
      expect(rule, product.id).toBeDefined();
      const instruction = instructionFor(rule!);
      expect(instruction).toContain(`${rule!.article} ${rule!.noun}`);
      expect(instruction).not.toMatch(/^(Kun jij|Nu gaan we|Zoek maar|Zoek jij|Waar is|Waar zijn) (?!de |het )/);
      if (instruction.startsWith("Waar ")) {
        expect(instruction.startsWith(rule!.number === "plural" ? "Waar zijn " : "Waar is ")).toBe(true);
      }
      expect(productPhrase({ productId: product.id, name: product.name, quantity: 1 }).text).toBe(instruction);
      expect(productPhrase({ productId: product.id, name: product.name, quantity: 4 }).text).toBe(instruction);
    }
  });

  it("fixes the phrases the owner called out", () => {
    expect(instructionFor(ruleForProduct("croissant")!)).toBe("Waar is de croissant?");
    expect(instructionFor(ruleForProduct("mais")!)).toBe("Waar is de mais?");
    expect(instructionFor(ruleForProduct("ui")!)).toBe("Kun jij de uien vinden?");
    expect(instructionFor(ruleForProduct("drinkpakje")!)).toBe("Nu gaan we het drinkpakje zoeken!");
    expect(instructionFor(ruleForProduct("kant-en-klaar")!)).toBe("Waar is het kant-en-klaarmaaltje?");
    expect(instructionFor(ruleForProduct("luiers")!)).toBe("Waar zijn de luiers?");
    expect(instructionFor(ruleForProduct("brood")!)).toBe("Kun jij het brood vinden?");
  });

  it("does not ship a second copy of the voice library", () => {
    const duplicate = join(process.cwd(), "public", "voice-library");
    expect(readFileSync(join(process.cwd(), "vite.config.ts"), "utf8")).toContain("server/voice-library");
    expect(() => readFileSync(join(duplicate, "manifest.json"))).toThrow();
  });
});
