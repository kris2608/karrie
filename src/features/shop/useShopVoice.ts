import { useEffect, useRef } from "react";
import {
  incorrectPhrase,
  positivePhrase,
  productPhrase,
  welcomePhrase,
  type VoicePhrase,
} from "../../domain/voiceScripts";
import type { AdventureItem } from "../../domain/types";
import { activeItem } from "../../domain/shopQueue";
import { unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../../services/analytics";
import { voiceController } from "../../services/voice/controller";

type Options = {
  enabled: boolean;
  optInSeen: boolean;
  adventureId: string | undefined;
  items: AdventureItem[];
  currentId: string | undefined;
  intro: boolean;
  locked: boolean;
  showGuess: boolean;
};

/**
 * Drives Phase 1 shopping voice: welcome once, product on each new active item, replay helper.
 * Never blocks scanning / found progression.
 */
export function useShopVoice(options: Options) {
  const { enabled, optInSeen, adventureId, items, currentId, intro, locked, showGuess } = options;
  const welcomed = useRef<string | null>(null);
  const spokenProduct = useRef<string | null>(null);
  const lastPositiveAt = useRef(0);

  useEffect(() => {
    if (!enabled) {
      voiceController.cancel();
      return;
    }
    return () => {
      voiceController.cancel();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !adventureId || intro || locked || showGuess) return;
    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current) return;

    const justWelcomed = welcomed.current !== adventureId;
    const alreadySpoken = spokenProduct.current === current.id;
    if (!justWelcomed && alreadySpoken) return;

    const token = voiceController.bump();
    const seed = `${adventureId}:${current.id}`;

    if (justWelcomed) {
      welcomed.current = adventureId;
      const welcome = welcomePhrase(seed, voiceController.avoidText("welcome"));
      voiceController.play(welcome, { token, priority: "high" });
    }

    if (alreadySpoken) return;
    spokenProduct.current = current.id;

    const product = productPhrase(current, seed, voiceController.avoidText("product"));
    voiceController.play(product, {
      token,
      priority: "high",
      delayMs: justWelcomed ? 700 : 0,
    });

    const open = items.filter((item) => item.status !== "found");
    const upcoming = open.slice(1, 4).map((item) => productPhrase(item, `${adventureId}:pre:${item.id}`));
    voiceController.prefetch(upcoming);
  }, [enabled, adventureId, currentId, items, intro, locked, showGuess]);

  function replay() {
    if (!enabled) return;
    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current || !adventureId) return;
    unlockAudio();
    const token = voiceController.currentToken();
    const phrase = productPhrase(current, `${adventureId}:replay:${current.id}:${Date.now()}`);
    voiceController.play(phrase, { token, priority: "high" });
  }

  function onFoundSuccess() {
    if (!enabled || !adventureId) return;
    const now = Date.now();
    // Intermittent positive feedback — not after every find, and not within 4s.
    const shouldPraise = now - lastPositiveAt.current > 4000 && Math.random() > 0.45;
    const token = voiceController.bump();
    spokenProduct.current = null;

    if (shouldPraise) {
      lastPositiveAt.current = now;
      const praise = positivePhrase(`${adventureId}:pos:${now}`, voiceController.avoidText("positive"));
      voiceController.play(praise, { token, priority: "normal", delayMs: 220 });
    }
  }

  function onGuessCorrect() {
    if (!enabled || !adventureId) return;
    const now = Date.now();
    lastPositiveAt.current = now;
    const token = voiceController.currentToken();
    const praise = positivePhrase(`${adventureId}:guess:${now}`, voiceController.avoidText("positive"));
    voiceController.play(praise, { token, priority: "normal", delayMs: 80 });
  }

  function onGuessWrong() {
    if (!enabled || !adventureId) return;
    const token = voiceController.bump();
    const phrase = incorrectPhrase(`${adventureId}:wrong:${Date.now()}`, voiceController.avoidText("incorrect"));
    voiceController.play(phrase, { token, priority: "normal", delayMs: 80 });
  }

  function prepareOptIn(choice: boolean) {
    unlockAudio();
    trackEvent({ name: "voice_opt_in", data: { enabled: choice ? 1 : 0 } });
    if (choice) voiceController.setEnabled(true);
  }

  function prefetchList(phrases: VoicePhrase[]) {
    if (enabled) voiceController.prefetch(phrases);
  }

  return {
    replay,
    onFoundSuccess,
    onGuessCorrect,
    onGuessWrong,
    prepareOptIn,
    prefetchList,
    needsOptIn: !optInSeen,
  };
}
