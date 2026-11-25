import { describe, expect, it } from "vitest";
import { isAllowedSpeechText, productPhrase } from "../../domain/voiceScripts";
import { shoppingPrefetchPhrases, staticFeedbackPhrases } from "./useShopVoice";

describe("shopping phrase stability", () => {
  it("prefetches with the same adventureId:itemId seed used at play/replay", () => {
    const items = [
      { id: "i1", productId: "banaan", name: "Bananen", quantity: 1, status: "pending" as const },
      { id: "i2", productId: "melk", name: "Melk", quantity: 1, status: "pending" as const },
    ];
    const phrases = shoppingPrefetchPhrases("adv-1", items as never);
    expect(phrases).toHaveLength(2);
    expect(phrases[0]!.text).toBe(productPhrase(items[0]!, "adv-1:i1").text);
    expect(phrases[1]!.text).toBe(productPhrase(items[1]!, "adv-1:i2").text);
    // Replay of the same step must not invent a Date.now seed.
    expect(productPhrase(items[0]!, "adv-1:i1").text).toBe(phrases[0]!.text);
  });

  it("prefetches up to five upcoming products and warmer static feedback", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `i${index}`,
      productId: "banaan",
      name: "Banaan",
      quantity: 1,
      status: "pending" as const,
    }));
    expect(shoppingPrefetchPhrases("adv-1", items as never)).toHaveLength(5);
    const staticPhrases = staticFeedbackPhrases();
    expect(staticPhrases.length).toBeGreaterThanOrEqual(10);
    expect(staticPhrases.every((phrase) => isAllowedSpeechText(phrase.text))).toBe(true);
  });

  it("does not prefetch welcome until intro combo exists", () => {
    const phrases = shoppingPrefetchPhrases("adv-1", [
      { id: "i1", productId: "banaan", name: "Bananen", quantity: 1, status: "pending" },
    ] as never);
    expect(phrases.every((phrase) => phrase.event === "product")).toBe(true);
  });
});

