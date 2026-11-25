import { useEffect, useRef } from "react";
import {
  incorrectPhrase,
  missionPhrase,
  playPhrase,
  positivePhrase,
  productPhrase,
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
  /** Healthier mission offered/active for the current item. */
  missionActive?: boolean;
  /** Colour / drag / guess play prompts. */
  playKind?: "color" | "drag" | "guess" | null;
  playColorLabel?: string;
};

/** Prefetch helpers shared with ReviewScreen start — no welcome until intro combo exists. */
export function shoppingPrefetchPhrases(adventureId: string, items: AdventureItem[]): VoicePhrase[] {
  const open = items.filter((item) => item.status !== "found");
  const phrases: VoicePhrase[] = [];
  for (const item of open.slice(0, 5)) {
    phrases.push(productPhrase(item, `${adventureId}:${item.id}`));
  }
  return phrases;
}

export function staticFeedbackPhrases(): VoicePhrase[] {
  return [
    positivePhrase("warm:pos:0"),
    positivePhrase("warm:pos:1"),
    positivePhrase("warm:pos:2"),
    positivePhrase("warm:pos:3"),
    incorrectPhrase("warm:bad:0"),
    incorrectPhrase("warm:bad:1"),
    incorrectPhrase("warm:bad:2"),
    missionPhrase("warm:mission:0"),
    missionPhrase("warm:mission:1"),
    missionPhrase("warm:mission:2"),
  ];
}

/**
 * Shopping voice: stable product phrases, optional mission/play lines, replay of the same text.
 * Never blocks scanning / found progression.
 */
export function useShopVoice(options: Options) {
  const {
    enabled,
    optInSeen,
    adventureId,
    items,
    currentId,
    intro,
    locked,
    showGuess,
    missionActive,
    playKind,
    playColorLabel,
  } = options;
  const spokenProduct = useRef<string | null>(null);
  /** Exact phrase for the current step — prefetch, play, and replay share this. */
  const currentPhrase = useRef<VoicePhrase | null>(null);
  const lastPositiveAt = useRef(0);
  const missionSpoken = useRef<string | null>(null);
  const playSpoken = useRef<string | null>(null);
  const finalSpoken = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      voiceController.cancel();
      return;
    }
    return () => {
      voiceController.cancel();
    };
  }, [enabled]);

  // Prefetch upcoming product clips with the same adventureId:itemId seed as play.
  useEffect(() => {
    if (!enabled || !adventureId) return;
    voiceController.prefetch(shoppingPrefetchPhrases(adventureId, items));
  }, [enabled, adventureId, items, currentId]);

  useEffect(() => {
    if (!enabled || !adventureId || intro || locked || showGuess) return;
    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current) return;

    const alreadySpoken = spokenProduct.current === current.id;
    if (alreadySpoken) return;

    spokenProduct.current = current.id;

    const seed = `${adventureId}:${current.id}`;
    const product = productPhrase(current, seed, voiceController.avoidText("product"));
    currentPhrase.current = product;

    const token = voiceController.bump();
    voiceController.play(product, { token, priority: "high", delayMs: 0 });

    const open = items.filter((item) => item.status !== "found");
    // Occasional final nudge — low priority so it never interrupts the product line.
    if (open.length === 1 && finalSpoken.current !== adventureId) {
      finalSpoken.current = adventureId;
      if (Math.random() > 0.4) {
        const finalLine: VoicePhrase = {
          event: "encouragement",
          phraseId: "encouragement:final",
          text: "Nog eentje te gaan!",
        };
        voiceController.play(finalLine, { token, priority: "low", delayMs: 500 });
      }
    }

    const upcoming = open.slice(1, 6).map((item) => productPhrase(item, `${adventureId}:${item.id}`));
    voiceController.prefetch(upcoming);
  }, [enabled, adventureId, currentId, items, intro, locked, showGuess]);

  // Mission prompt — never names the secret alternative. Delay so product bump wins first.
  useEffect(() => {
    if (!enabled || !adventureId || !missionActive || intro || locked) return;
    const key = `${adventureId}:${currentId}:mission`;
    if (missionSpoken.current === key) return;
    missionSpoken.current = key;
    const phrase = missionPhrase(key, voiceController.avoidText("mission"));
    const timer = window.setTimeout(() => {
      voiceController.play(phrase, { token: voiceController.currentToken(), priority: "normal" });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [enabled, adventureId, currentId, missionActive, intro, locked]);

  // Colour / drag / guess play prompts from UI copy; guess never spoils the answer.
  useEffect(() => {
    if (!enabled || !adventureId || !playKind || intro || locked) return;
    const key = `${adventureId}:${currentId}:play:${playKind}:${playColorLabel ?? ""}`;
    if (playSpoken.current === key) return;
    playSpoken.current = key;
    const phrase = playPhrase(key, playKind, playColorLabel);
    const timer = window.setTimeout(() => {
      voiceController.play(phrase, { token: voiceController.currentToken(), priority: "normal" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabled, adventureId, currentId, playKind, playColorLabel, intro, locked]);

  function replay() {
    if (!enabled) return;
    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current || !adventureId) return;
    unlockAudio();
    const phrase =
      currentPhrase.current && currentPhrase.current.phraseId.startsWith("product:")
        ? currentPhrase.current
        : productPhrase(current, `${adventureId}:${current.id}`);
    currentPhrase.current = phrase;
    const token = voiceController.bump();
    voiceController.play(phrase, { token, priority: "high" });
  }

  function onFoundSuccess() {
    if (!enabled || !adventureId) return;
    const now = Date.now();
    const shouldPraise = now - lastPositiveAt.current > 4000 && Math.random() > 0.45;
    const token = voiceController.bump();
    spokenProduct.current = null;
    currentPhrase.current = null;

    if (shouldPraise) {
      lastPositiveAt.current = now;
      const praise = positivePhrase(`${adventureId}:pos:${currentId ?? "x"}`, voiceController.avoidText("positive"));
      // After found SFX (~220ms) so we don't overlap beep/pop/star.
      voiceController.play(praise, { token, priority: "normal", delayMs: 220 });
    }
  }

  function onGuessCorrect() {
    if (!enabled || !adventureId) return;
    const now = Date.now();
    lastPositiveAt.current = now;
    const token = voiceController.currentToken();
    const praise = positivePhrase(`${adventureId}:guess:${currentId ?? "x"}`, voiceController.avoidText("positive"));
    voiceController.play(praise, { token, priority: "normal", delayMs: 80 });
  }

  function onGuessWrong() {
    if (!enabled || !adventureId) return;
    const token = voiceController.bump();
    const phrase = incorrectPhrase(`${adventureId}:wrong:${currentId ?? "x"}`, voiceController.avoidText("incorrect"));
    voiceController.play(phrase, { token, priority: "normal", delayMs: 80 });
  }

  function prepareOptIn(choice: boolean) {
    unlockAudio();
    trackEvent({ name: "voice_opt_in", data: { enabled: choice ? 1 : 0 } });
    if (choice) {
      voiceController.setEnabled(true);
      voiceController.prefetch(staticFeedbackPhrases());
    }
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
