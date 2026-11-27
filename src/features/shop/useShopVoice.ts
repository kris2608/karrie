import { useEffect, useRef } from "react";
import {
  celebrationPhrase,
  positivePhrase,
  productPhrase,
  startPhrase,
  missionPhrase,
  completePhrase,
  type VoicePhrase,
} from "../../domain/voiceScripts";
import { INITIAL_PRAISE_STATE, planFoundVoice, type PraiseState } from "../../domain/voiceRound";
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
  /** Test hook. Defaults to Math.random. */
  random?: () => number;
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

/** Start and ending first, so they are warm before the round needs them. */
export function roundWarmupPhrases(adventureId: string, items: AdventureItem[]): VoicePhrase[] {
  return [startPhrase(adventureId), celebrationPhrase(adventureId), ...shoppingPrefetchPhrases(adventureId, items)];
}

/** Mission, celebration and a praise line for the opt-in warm-up. */
export function staticFeedbackPhrases(): VoicePhrase[] {
  return [
    startPhrase("warm:start"),
    celebrationPhrase("warm:complete"),
    missionPhrase("warm:mission:0"),
    missionPhrase("warm:mission:1"),
    positivePhrase("warm:praise:0"),
    completePhrase("warm:complete:0"),
  ];
}

const PERMANENT_FAIL = new Set(["invalid", "misconfigured", "device-limit", "rate-limited", "daily-limit", "budget"]);
const OPENING_WAIT_MS = 8_000;

function waitFor(pending: Promise<unknown> | null, limitMs: number): Promise<void> {
  if (!pending) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, limitMs);
    pending.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

/**
 * Shopping voice: start line once per fresh round, then every product instruction.
 * Praise is occasional. The ending plays at the found instant of the last product.
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
    random,
  } = options;

  const instructionKey = useRef<string | null>(null);
  const instructionStatus = useRef<InstructionStatus | null>(null);
  const retryUsed = useRef(false);
  /** Exact phrase for the current step — play and replay share this. */
  const currentPhrase = useRef<VoicePhrase | null>(null);
  const wasEnabled = useRef(enabled);
  const openingFor = useRef<string | null>(null);
  const openingPlay = useRef<Promise<unknown> | null>(null);
  const praiseFlight = useRef<Promise<unknown> | null>(null);
  const praiseState = useRef<PraiseState>({ ...INITIAL_PRAISE_STATE });
  const praiseAdventure = useRef<string | null>(null);

  if (praiseAdventure.current !== (adventureId ?? null)) {
    praiseAdventure.current = adventureId ?? null;
    praiseState.current = { ...INITIAL_PRAISE_STATE };
    openingFor.current = null;
    openingPlay.current = null;
  }

  useEffect(() => {
    if (!enabled) {
      voiceController.cancel();
      return;
    }
    return () => {
      voiceController.releaseShopping();
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

  useEffect(() => {
    if (!enabled || !adventureId) return;
    voiceController.prefetch(roundWarmupPhrases(adventureId, items));
    const fresh = !items.some((item) => item.status === "found");
    if (!fresh || openingFor.current === adventureId) return;
    openingFor.current = adventureId;
    const generation = voiceController.currentToken();
    openingPlay.current = voiceController.play(startPhrase(adventureId), {
      generation,
      priority: "high",
      delayMs: 0,
    });
  }, [enabled, adventureId, items]);

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

    const opening = openingPlay.current;
    const praise = praiseFlight.current;

    void (async () => {
      await waitFor(opening, OPENING_WAIT_MS);
      await waitFor(praise, 2_200);
      if (instructionKey.current !== stepKey) return;

      const generation = voiceController.bump();
      instructionStatus.current = "started";
      trackEvent({ name: "voice_instruction", data: { phase: "started", event: phrase.event } });
      let outcome = await voiceController.play(phrase, { generation, priority: "high", delayMs: 0 });

      if (instructionKey.current !== stepKey) return;

      if (outcome.status === "failed" && outcome.code && !PERMANENT_FAIL.has(outcome.code) && !retryUsed.current) {
        retryUsed.current = true;
        trackEvent({ name: "voice_instruction", data: { phase: "retry", event: phrase.event, code: outcome.code } });
        const retryGen = voiceController.currentToken();
        outcome = await voiceController.play(phrase, { generation: retryGen, priority: "high", delayMs: 0 });
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
  }, [enabled, adventureId, currentId, items, intro, locked, showGuess, missionActive]);

  function replay() {
    if (!enabled) return;
    const current = items.find((item) => item.id === currentId) ?? activeItem(items);
    if (!current || !adventureId) return;
    // Guess missions: product-safe replay only — never spoil.
    if (showGuess && !missionActive) {
      unlockAudio();
      const phrase = productPhrase(current, `${adventureId}:${current.id}`);
      currentPhrase.current = phrase;
      const generation = voiceController.bump();
      void voiceController.play(phrase, { generation, priority: "high", delayMs: 0 });
      return;
    }
    unlockAudio();
    const seed = `${adventureId}:${current.id}`;
    const stepKey = missionActive
      ? `${adventureId}:${current.id}:mission`
      : `${adventureId}:${current.id}:product`;
    const phrase =
      instructionKey.current === stepKey && currentPhrase.current
        ? currentPhrase.current
        : missionActive
          ? missionPhrase(seed)
          : productPhrase(current, seed);
    currentPhrase.current = phrase;
    const generation = voiceController.bump();
    void voiceController.play(phrase, { generation, priority: "high", delayMs: 0 });
  }

  /**
   * Called in the same turn as the found dispatch.
   * Last item: celebration immediately, no praise in front of it.
   * Other finds: praise only when planFoundVoice says so.
   */
  function onFoundSuccess(isLast = false) {
    const generation = voiceController.bump();
    instructionKey.current = null;
    instructionStatus.current = null;
    retryUsed.current = false;
    currentPhrase.current = null;
    if (!enabled) return;
    const plan = planFoundVoice(praiseState.current, { isLast, random: (random ?? Math.random)() });
    praiseState.current = plan.praise;
    if (plan.line === "celebration") {
      praiseFlight.current = null;
      const phrase = celebrationPhrase(adventureId ?? "round");
      void voiceController.play(phrase, { generation, priority: "high", delayMs: plan.delayMs, handoff: true });
      return;
    }
    if (plan.line === "praise") {
      const phrase = positivePhrase(`${adventureId ?? "round"}:${praiseState.current.findsSincePraise}`, voiceController.avoidText("positive"));
      praiseFlight.current = voiceController.play(phrase, { generation, priority: "high", delayMs: plan.delayMs });
      return;
    }
    praiseFlight.current = null;
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
    if (enabled) voiceController.prefetch(phrases.slice(0, 4));
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
