import { useEffect, useRef } from "react";
import {
  completePhrase,
  missionPhrase,
  productPhrase,
  type VoicePhrase,
} from "../../domain/voiceScripts";
import type { AdventureItem } from "../../domain/types";
import { activeItem } from "../../domain/shopQueue";
import { unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../../services/analytics";
import { voiceController } from "../../services/voice/controller";

type InstructionStatus = "requested" | "ready" | "started" | "completed" | "failed";

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
  /** Colour / drag / guess play prompts — disabled for auto speech in P0. */
  playKind?: "color" | "drag" | "guess" | null;
  playColorLabel?: string;
};

/** Prefetch current + next only — shared with ReviewScreen start. */
export function shoppingPrefetchPhrases(adventureId: string, items: AdventureItem[]): VoicePhrase[] {
  const open = items.filter((item) => item.status !== "found");
  const phrases: VoicePhrase[] = [];
  for (const item of open.slice(0, 2)) {
    phrases.push(productPhrase(item, `${adventureId}:${item.id}`));
  }
  return phrases;
}

/** Mission + complete lines only (praise disabled on happy path). */
export function staticFeedbackPhrases(): VoicePhrase[] {
  return [
    missionPhrase("warm:mission:0"),
    missionPhrase("warm:mission:1"),
    missionPhrase("warm:mission:2"),
    completePhrase("warm:complete:0"),
    completePhrase("warm:complete:1"),
  ];
}

const PERMANENT_FAIL = new Set(["invalid", "misconfigured"]);

/**
 * Shopping voice P0: product instruction, mission (replaces product), complete via CompleteScreen.
 * Guess missions: no automatic speech that could spoil; replay stays product-safe.
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
  } = options;

  const instructionKey = useRef<string | null>(null);
  const instructionStatus = useRef<InstructionStatus | null>(null);
  const retryUsed = useRef(false);
  /** Exact phrase for the current step — play and replay share this. */
  const currentPhrase = useRef<VoicePhrase | null>(null);
  const wasEnabled = useRef(enabled);

  useEffect(() => {
    if (!enabled) {
      voiceController.cancel();
      return;
    }
    return () => {
      voiceController.cancel();
    };
  }, [enabled]);

  // Mute off→on: clear status so current instruction can request again.
  useEffect(() => {
    if (enabled && !wasEnabled.current) {
      instructionKey.current = null;
      instructionStatus.current = null;
      retryUsed.current = false;
    }
    wasEnabled.current = enabled;
  }, [enabled]);

  // Prefetch current + next only.
  useEffect(() => {
    if (!enabled || !adventureId) return;
    voiceController.prefetch(shoppingPrefetchPhrases(adventureId, items));
  }, [enabled, adventureId, items, currentId]);

  useEffect(() => {
    if (!enabled || !adventureId || intro || locked) return;
    // Guess missions: no automatic speech that could spoil.
    if (showGuess) return;

    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current) return;

    const stepKey = missionActive
      ? `${adventureId}:${current.id}:mission`
      : `${adventureId}:${current.id}:product`;

    if (
      instructionKey.current === stepKey &&
      (instructionStatus.current === "completed" ||
        instructionStatus.current === "started" ||
        instructionStatus.current === "requested" ||
        instructionStatus.current === "ready")
    ) {
      return;
    }

    // Permanent fail for this step — do not loop.
    if (instructionKey.current === stepKey && instructionStatus.current === "failed" && retryUsed.current) {
      return;
    }

    const seed = `${adventureId}:${current.id}`;
    const phrase = missionActive
      ? missionPhrase(seed, voiceController.avoidText("mission"))
      : productPhrase(current, seed);

    currentPhrase.current = phrase;
    instructionKey.current = stepKey;
    instructionStatus.current = "requested";
    retryUsed.current = false;

    const generation = voiceController.bump();

    void (async () => {
      instructionStatus.current = "started";
      trackEvent({ name: "voice_instruction", data: { phase: "started", event: phrase.event } });
      let outcome = await voiceController.play(phrase, { generation, priority: "high", delayMs: 0 });

      if (instructionKey.current !== stepKey) return;

      if (outcome.status === "failed" && outcome.code && !PERMANENT_FAIL.has(outcome.code) && !retryUsed.current) {
        retryUsed.current = true;
        trackEvent({ name: "voice_instruction", data: { phase: "retry", event: phrase.event, code: outcome.code } });
        const retryGen = voiceController.currentToken();
        outcome = await voiceController.play(phrase, { generation: retryGen, priority: "high" });
      }

      if (instructionKey.current !== stepKey) return;

      if (outcome.status === "completed") {
        instructionStatus.current = "completed";
        trackEvent({ name: "voice_instruction", data: { phase: "completed", event: phrase.event } });
      } else if (outcome.status === "failed") {
        instructionStatus.current = "failed";
        trackEvent({
          name: "voice_instruction",
          data: { phase: "failed", event: phrase.event, code: outcome.code },
        });
      } else if (outcome.status === "cancelled") {
        // Step change / mute — allow re-request if still current later.
        instructionStatus.current = null;
        instructionKey.current = null;
      }
    })();

    const open = items.filter((item) => item.status !== "found");
    const upcoming = open.slice(1, 3).map((item) => productPhrase(item, `${adventureId}:${item.id}`));
    voiceController.prefetch(upcoming);
  }, [enabled, adventureId, currentId, items, intro, locked, showGuess, missionActive]);

  function replay() {
    if (!enabled) return;
    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current || !adventureId) return;
    unlockAudio();
    // Replay: mission phrase when mission active, else product — never guess spoilers.
    const seed = `${adventureId}:${current.id}`;
    const phrase = missionActive
      ? currentPhrase.current?.event === "mission"
        ? currentPhrase.current
        : missionPhrase(seed)
      : currentPhrase.current?.event === "product"
        ? currentPhrase.current
        : productPhrase(current, seed);
    currentPhrase.current = phrase;
    const generation = voiceController.bump();
    void voiceController.play(phrase, { generation, priority: "high" });
  }

  /** Praise disabled — SFX-only callers keep the hook. */
  function onFoundSuccess() {
    instructionKey.current = null;
    instructionStatus.current = null;
    retryUsed.current = false;
    currentPhrase.current = null;
  }

  function onGuessCorrect() {
    // No automatic speech.
  }

  function onGuessWrong() {
    // No automatic speech.
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
    if (enabled) voiceController.prefetch(phrases.slice(0, 3));
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
