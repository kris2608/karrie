import type { VoiceEvent, VoicePhrase } from "../../domain/voiceScripts";
import { unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../analytics";
import { ensureVoiceCacheConfig, peekVoiceBlob, readVoiceBlob } from "./cache";
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
 * Order: local cache → server → generate → silent (no speechSynthesis by default).
 */
export function createVoiceController(options?: { synthFallback?: boolean }) {
  let enabled = false;
  let token = 0;
  let current: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let playingPriority: "high" | "normal" | "low" | null = null;
  let activePlayToken: number | null = null;
  let queue: Queued | null = null;
  const lastByEvent = new Map<VoiceEvent, string>();
  let synthFallback = options?.synthFallback === true;

  function bump(): number {
    token += 1;
    return token;
  }

  function stopSynth() {
    if (typeof speechSynthesis === "undefined") return;
    try {
      speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  function stopCurrent() {
    stopSynth();
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
    activePlayToken = null;
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
    await ensureVoiceCacheConfig();
    const cached = await readVoiceBlob(phrase.text, phrase.event);
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
      utter.rate = 0.95;
      utter.onend = () => {
        // Only release speaker if this generation still owns it.
        if (playToken === token && activePlayToken === playToken) {
          playingPriority = null;
          activePlayToken = null;
          void drain();
        }
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
      return true;
    } catch {
      return false;
    }
  }

  /** Release speaker only when this playToken still owns playback. */
  function finishClip(playToken: number) {
    if (activePlayToken !== playToken || playToken !== token) return;
    playingPriority = null;
    activePlayToken = null;
    void drain();
  }

  async function playBlob(blob: Blob, playToken: number, priority: PlayOptions["priority"]): Promise<void> {
    if (playToken !== token || !enabled) {
      finishClip(playToken);
      return;
    }
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
    unlockAudio();
    const url = URL.createObjectURL(blob);
    objectUrl = url;
    const audio = new Audio(url);
    current = audio;
    playingPriority = priority ?? "normal";
    activePlayToken = playToken;
    await new Promise<void>((resolve) => {
      const done = () => {
        if (objectUrl === url) {
          URL.revokeObjectURL(url);
          objectUrl = null;
        }
        if (current === audio) current = null;
        resolve();
        finishClip(playToken);
      };
      audio.onended = () => done();
      audio.onerror = () => {
        trackEvent({ name: "voice_playback_failed", data: { reason: "element" } });
        done();
      };
      void audio.play().catch(() => {
        trackEvent({ name: "voice_playback_failed", data: { reason: "play" } });
        done();
      });
    });
  }

  /** Runs a clip that already reserved `playingPriority` via play() or drain(). */
  async function run(phrase: VoicePhrase, options: PlayOptions): Promise<void> {
    const priority = options.priority ?? "normal";
    const playToken = options.token;
    if (!enabled || playToken !== token) {
      finishClip(playToken);
      return;
    }
    if (options.delayMs && options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (!enabled || playToken !== token) {
        finishClip(playToken);
        return;
      }
    }

    const blob = await resolveBlob(phrase);
    if (!enabled || playToken !== token) {
      finishClip(playToken);
      return;
    }

    lastByEvent.set(phrase.event, phrase.text);

    if (blob) {
      await playBlob(blob, playToken, priority);
      return;
    }

    if (speakWithSynth(phrase.text, playToken)) {
      playingPriority = priority;
      activePlayToken = playToken;
      return;
    }

    // Silent failure — free the speaker for the next clip only if we still own it.
    finishClip(playToken);
  }

  async function drain() {
    const next = queue;
    queue = null;
    if (!next || !enabled) return;
    if (next.options.token !== token) return;
    playingPriority = next.options.priority ?? "normal";
    activePlayToken = next.options.token;
    await run(next.phrase, next.options);
  }

  function play(phrase: VoicePhrase, options?: Partial<PlayOptions>): number {
    if (!enabled) return token;
    const playToken = options?.token ?? token;
    if (playToken !== token) return token;
    const priority = options?.priority ?? "normal";
    const next: PlayOptions = {
      token: playToken,
      delayMs: options?.delayMs,
      priority,
    };

    if (playingPriority !== null) {
      if (priority === "low") return playToken;
      // High priority (product / replay) beats optional praise — interrupt and clear queue.
      if (priority === "high") {
        queue = null;
        stopCurrent();
        playingPriority = priority;
        activePlayToken = playToken;
        void run(phrase, next);
        return playToken;
      }
      // Normal: replace queued clip (replay / later praise overrides earlier queue).
      queue = { phrase, options: { ...next, delayMs: 0 } };
      return playToken;
    }

    playingPriority = priority;
    activePlayToken = playToken;
    void run(phrase, next);
    return playToken;
  }

  function avoidText(event: VoiceEvent): string | undefined {
    return lastByEvent.get(event);
  }

  function prefetch(phrases: VoicePhrase[]) {
    void ensureVoiceCacheConfig();
    for (const phrase of phrases.slice(0, 6)) {
      void (async () => {
        const cached = await readVoiceBlob(phrase.text, phrase.event);
        if (cached) return;
        await voiceClient.fetchClip(phrase.event, phrase.text);
      })();
    }
  }

  function isCachedSync(text: string, event?: string): boolean {
    return Boolean(peekVoiceBlob(text, event));
  }

  async function isCached(text: string, event?: string): Promise<boolean> {
    return Boolean(await readVoiceBlob(text, event));
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
    isCached,
    isCachedSync,
    /** Test hook */
    _stopCurrent: stopCurrent,
  };
}

export const voiceController = createVoiceController();
