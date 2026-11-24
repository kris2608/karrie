import type { VoiceEvent, VoicePhrase } from "../../domain/voiceScripts";
import { unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../analytics";
import { readVoiceBlob } from "./cache";
import { voiceClient } from "./client";

export type PlayOptions = {
  /** Cancel if this token no longer matches when audio is ready. */
  token: number;
  /** Wait before speaking so SFX can finish. */
  delayMs?: number;
  /** Prefer product instructions over optional encouragement. */
  priority?: "high" | "normal" | "low";
};

type Queued = {
  phrase: VoicePhrase;
  options: PlayOptions;
};

/**
 * Single-speaker controller: one clip at a time, never blocks shopping.
 * Stale tokens and disabled voice discard playback but keep cached audio.
 */
export function createVoiceController() {
  let enabled = false;
  let token = 0;
  let current: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let playingPriority: "high" | "normal" | "low" | null = null;
  let queue: Queued | null = null;
  const lastByEvent = new Map<VoiceEvent, string>();
  let synthFallback = true;

  function bump(): number {
    token += 1;
    return token;
  }

  function stopCurrent() {
    if (current) {
      current.onended = null;
      current.onerror = null;
      try {
        current.pause();
      } catch {
        // ignore
      }
      current.src = "";
      current = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    playingPriority = null;
  }

  function cancel() {
    bump();
    queue = null;
    stopCurrent();
  }

  function setEnabled(value: boolean) {
    enabled = value;
    if (!value) cancel();
  }

  function isEnabled() {
    return enabled;
  }

  function currentToken() {
    return token;
  }

  async function resolveBlob(phrase: VoicePhrase): Promise<Blob | null> {
    const cached = await readVoiceBlob(phrase.text);
    if (cached) return cached;
    const result = await voiceClient.fetchClip(phrase.event, phrase.text);
    if (result.status === "ok") return result.blob;
    return null;
  }

  function speakWithSynth(text: string, playToken: number): boolean {
    if (!synthFallback || typeof speechSynthesis === "undefined") return false;
    try {
      const voices = speechSynthesis.getVoices();
      const dutch = voices.find((voice) => /^nl(-|_)/i.test(voice.lang));
      if (!dutch && voices.length) return false;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "nl-NL";
      if (dutch) utter.voice = dutch;
      utter.rate = 0.92;
      utter.onend = () => {
        if (playToken === token) playingPriority = null;
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
      return true;
    } catch {
      return false;
    }
  }

  async function playBlob(blob: Blob, playToken: number, priority: PlayOptions["priority"]): Promise<void> {
    if (playToken !== token || !enabled) return;
    stopCurrent();
    unlockAudio();
    const url = URL.createObjectURL(blob);
    objectUrl = url;
    const audio = new Audio(url);
    current = audio;
    playingPriority = priority ?? "normal";
    await new Promise<void>((resolve) => {
      audio.onended = () => {
        if (objectUrl === url) {
          URL.revokeObjectURL(url);
          objectUrl = null;
        }
        if (current === audio) current = null;
        playingPriority = null;
        resolve();
        void drain();
      };
      audio.onerror = () => {
        trackEvent({ name: "voice_playback_failed", data: { reason: "element" } });
        if (objectUrl === url) {
          URL.revokeObjectURL(url);
          objectUrl = null;
        }
        if (current === audio) current = null;
        playingPriority = null;
        resolve();
        void drain();
      };
      void audio.play().catch(() => {
        trackEvent({ name: "voice_playback_failed", data: { reason: "play" } });
        stopCurrent();
        resolve();
        void drain();
      });
    });
  }

  async function run(phrase: VoicePhrase, options: PlayOptions): Promise<void> {
    if (!enabled || options.token !== token) return;
    if (options.delayMs && options.delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, options.delayMs));
      if (!enabled || options.token !== token) return;
    }

    const priority = options.priority ?? "normal";
    if (playingPriority === "high" && priority !== "high") {
      if (priority === "low") return;
      queue = { phrase, options };
      return;
    }

    const blob = await resolveBlob(phrase);
    if (!enabled || options.token !== token) return;

    lastByEvent.set(phrase.event, phrase.text);

    if (blob) {
      await playBlob(blob, options.token, priority);
      return;
    }

    if (speakWithSynth(phrase.text, options.token)) {
      playingPriority = priority;
      return;
    }
    // Silent failure — shopping continues.
  }

  async function drain() {
    const next = queue;
    queue = null;
    if (!next || !enabled) return;
    if (next.options.token !== token) return;
    await run(next.phrase, next.options);
  }

  function play(phrase: VoicePhrase, options?: Partial<PlayOptions>): number {
    if (!enabled) return token;
    const playToken = options?.token ?? token;
    if (playToken !== token) return token;
    void run(phrase, {
      token: playToken,
      delayMs: options?.delayMs,
      priority: options?.priority,
    });
    return playToken;
  }

  function avoidText(event: VoiceEvent): string | undefined {
    return lastByEvent.get(event);
  }

  function prefetch(phrases: VoicePhrase[]) {
    if (!enabled) return;
    for (const phrase of phrases.slice(0, 4)) {
      void (async () => {
        const cached = await readVoiceBlob(phrase.text);
        if (cached) return;
        await voiceClient.fetchClip(phrase.event, phrase.text);
      })();
    }
  }

  return {
    setEnabled,
    isEnabled,
    cancel,
    bump,
    currentToken,
    play,
    avoidText,
    prefetch,
    /** Test hook */
    _stopCurrent: stopCurrent,
  };
}

export const voiceController = createVoiceController();
