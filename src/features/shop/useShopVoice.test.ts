import { describe, expect, it } from "vitest";
import { isAllowedSpeechText, productPhrase } from "../../domain/voiceScripts";
import { shoppingPrefetchPhrases, staticFeedbackPhrases } from "./useShopVoice";

describe("shopping phrase stability", () => {
  it("prefetches with the same productId canonical phrase used at play/replay", () => {
    const items = [
      { id: "i1", productId: "banaan", name: "Bananen", quantity: 1, status: "pending" as const },
      { id: "i2", productId: "melk", name: "Melk", quantity: 1, status: "pending" as const },
    ];
    const phrases = shoppingPrefetchPhrases("adv-1", items as never);
    expect(phrases).toHaveLength(2);
    expect(phrases[0]!.text).toBe(productPhrase(items[0]!, "adv-1:i1").text);
    expect(phrases[1]!.text).toBe(productPhrase(items[1]!, "adv-1:i2").text);
    // Canonical per productId — adventure seed must not change the line.
    expect(productPhrase(items[0]!, "adv-1:i1").text).toBe(productPhrase(items[0]!, "other-seed").text);
  });

  it("prefetches current + next only and static mission/complete", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `i${index}`,
      productId: "banaan",
      name: "Banaan",
      quantity: 1,
      status: "pending" as const,
    }));
    expect(shoppingPrefetchPhrases("adv-1", items as never)).toHaveLength(2);
    const staticPhrases = staticFeedbackPhrases();
    expect(staticPhrases.some((phrase) => phrase.event === "welcome")).toBe(true);
    expect(staticPhrases.some((phrase) => phrase.event === "complete" && phrase.text.startsWith("Hoera!"))).toBe(true);
    expect(staticPhrases.every((phrase) => isAllowedSpeechText(phrase.text))).toBe(true);
  });

  it("does not prefetch welcome until intro combo exists", () => {
    const phrases = shoppingPrefetchPhrases("adv-1", [
      { id: "i1", productId: "banaan", name: "Bananen", quantity: 1, status: "pending" },
    ] as never);
    expect(phrases.every((phrase) => phrase.event === "product")).toBe(true);
  });

  it("uses only four canonical product template families", () => {
    const text = productPhrase({ productId: "banaan", name: "Banaan", quantity: 1 }).text;
    expect(
      /^Kun jij .+ vinden\?$/.test(text) ||
        /^Nu gaan we .+ zoeken!$/.test(text) ||
        /^Waar (is|zijn) .+\?$/.test(text) ||
        /^Zoek maar .+!$/.test(text),
    ).toBe(true);
  });
});
