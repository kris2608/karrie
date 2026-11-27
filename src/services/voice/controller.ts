import type { VoiceEvent, VoicePhrase } from "../../domain/voiceScripts";
import { getSpeechElement, unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../analytics";
import { peekVoiceBlob, readVoiceBlob } from "./cache";
import { speakOnDevice, type DeviceSpeechResult } from "./deviceSpeech";
import { applySpeechPlayback } from "./playbackRate";
import { voiceScheduler } from "./scheduler";

export type PlayPriority = "high" | "normal" | "low";

export type PlayOptions = {
  /** Shopping generation — bump on step change / mute / leave. */
  generation?: number;
  /** Wait before speaking so SFX can finish. */
  delayMs?: number;
  priority?: PlayPriority;
  /**
   * Keep playing across the shop → complete navigation.
   * Mute still stops it. A later shopping line does not.
   */
  handoff?: boolean;
};

export type PlayOutcome = {
  status: "completed" | "cancelled" | "failed" | "skipped";
  playId: number;
  code?: string;
  fetchMs?: number;
  source?: string;
};

type SpeakerState = "idle" | "loading" | "playing" | "cancelled" | "failed";

type ActivePlay = {
  playId: number;
  generation: number;
  priority: PlayPriority;
  handoff: boolean;
  abort: AbortController;
  settle: (outcome: PlayOutcome) => void;
  settled: boolean;
};

const BENIGN_FETCH = new Set(["cancelled", "promoted", "replaced", "queue-full"]);
const SPOKEN_FALLBACK = new Set(["device-limit", "rate-limited", "daily-limit", "budget", "upstream", "network", "deadline"]);

function voicePlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/**
 * Single-speaker controller with playId ownership.
 * generation invalidates shopping context; playId owns the active clip.
 * Every play path settles its promise (completed / cancelled / failed / skipped).
 */
export function createVoiceController(options?: {
  speakFallback?: (text: string, signal: AbortSignal) => Promise<DeviceSpeechResult>;
}) {
  const speakFallback = options?.speakFallback ?? speakOnDevice;
  let enabled = false;
  let generation = 0;
  let nextPlayId = 0;
  let state: SpeakerState = "idle";
  let active: ActivePlay | null = null;
  let objectUrl: string | null = null;
  let queue: { phrase: VoicePhrase; options: PlayOptions; playId: number; settle: (o: PlayOutcome) => void } | null =
    null;
  const lastByEvent = new Map<VoiceEvent, string>();

  function bump(): number {
    generation += 1;
    cancelActive("cancelled");
    queue = null;
    return generation;
  }

  function currentToken() {
    return generation;
  }

  function resolveActive(outcome: PlayOutcome) {
    if (!active || active.settled) return;
    if (active.playId !== outcome.playId) return;
    active.settled = true;
    active.settle(outcome);
  }

  function clearMedia() {
    const el = getSpeechElement();
    el.onended = null;
    el.onerror = null;
    try {
      el.pause();
    } catch {
      // ignore
    }
    try {
      el.removeAttribute("src");
      el.load();
    } catch {
      // ignore
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function cancelActive(status: PlayOutcome["status"] = "cancelled", code?: string) {
    if (!active) {
      clearMedia();
      state = "idle";
      return;
    }
    const play = active;
    play.abort.abort();
    clearMedia();
    resolveActive({ status, playId: play.playId, code });
    active = null;
    state = status === "failed" ? "failed" : status === "cancelled" ? "cancelled" : "idle";
    if (status === "cancelled" || status === "failed") {
      // Transient — ready for next play.
      state = "idle";
    }
  }

  function cancel() {
    bump();
    voiceScheduler.cancelBackground();
    queue = null;
    state = "idle";
  }

  /** Shop unmount. A celebration handed off to the complete screen keeps playing. */
  function releaseShopping() {
    voiceScheduler.cancelBackground();
    queue = null;
    if (active?.handoff) {
      generation += 1;
      return;
    }
    cancel();
  }

  function setEnabled(value: boolean) {
    enabled = value;
    if (!value) cancel();
  }

  function isEnabled() {
    return enabled;
  }

  function finishOwner(playId: number, outcome: PlayOutcome) {
    if (!active || active.playId !== playId) return;
    resolveActive(outcome);
    active = null;
    clearMedia();
    state = outcome.status === "failed" ? "failed" : "idle";
    if (state === "failed") state = "idle";
    void drain();
  }

  async function run(phrase: VoicePhrase, options: PlayOptions, playId: number, settle: (o: PlayOutcome) => void) {
    const priority = options.priority ?? "normal";
    const gen = options.generation ?? generation;
    const abort = new AbortController();
    const play: ActivePlay = {
      playId,
      generation: gen,
      priority,
      handoff: options.handoff === true,
      abort,
      settle,
      settled: false,
    };
    active = play;
    state = "loading";

    const dropped = () => !enabled || abort.signal.aborted || active?.playId !== playId || (!play.handoff && gen !== generation);

    if (dropped()) {
      finishOwner(playId, { status: "cancelled", playId });
      return;
    }

    if (options.delayMs && options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (dropped()) {
        finishOwner(playId, { status: "cancelled", playId });
        return;
      }
    }

    const fetched = await voiceScheduler.fetchInteractive(phrase, abort.signal);
    if (dropped()) {
      finishOwner(playId, { status: "cancelled", playId, fetchMs: fetched.ms });
      return;
    }

    lastByEvent.set(phrase.event, phrase.text);

    if (!fetched.ok) {
      if (BENIGN_FETCH.has(fetched.code)) {
        finishOwner(playId, { status: "cancelled", playId, code: fetched.code, fetchMs: fetched.ms });
        return;
      }
      if (SPOKEN_FALLBACK.has(fetched.code)) {
        const spoken = await speakFallback(phrase.text, abort.signal);
        if (dropped() || spoken === "cancelled") {
          finishOwner(playId, { status: "cancelled", playId, code: fetched.code, fetchMs: fetched.ms });
          return;
        }
        if (spoken === "ok") {
          trackEvent({
            name: "voice_fetch",
            data: { source: "synth", ms: fetched.ms, event: phrase.event },
          });
          finishOwner(playId, { status: "completed", playId, code: "synth", fetchMs: fetched.ms });
          return;
        }
      }
      trackEvent({
        name: "voice_playback_failed",
        data: { reason: "fetch", stage: "fetch", code: fetched.code, platform: voicePlatform() },
      });
      finishOwner(playId, { status: "failed", playId, code: fetched.code, fetchMs: fetched.ms });
      return;
    }

    trackEvent({
      name: "voice_fetch",
      data: { source: fetched.source, ms: fetched.ms, event: phrase.event },
    });

    // Stash timings on the active play via closure in playBlob settle.
    const blob = fetched.blob;
    const fetchMs = fetched.ms;
    const source = fetched.source;
    if (dropped()) {
      finishOwner(playId, { status: "cancelled", playId, fetchMs, source });
      return;
    }
    unlockAudio();
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    const url = URL.createObjectURL(blob);
    objectUrl = url;
    const audio = getSpeechElement();
    state = "playing";
    await new Promise<void>((resolve) => {
      const done = (status: PlayOutcome["status"], code?: string) => {
        if (objectUrl === url) {
          URL.revokeObjectURL(url);
          objectUrl = null;
        }
        finishOwner(play.playId, { status, playId: play.playId, code, fetchMs, source });
        resolve();
      };
      if (play.abort.signal.aborted || active?.playId !== play.playId) {
        done("cancelled");
        return;
      }
      audio.onended = () => done("completed");
      audio.onerror = () => {
        if (play.abort.signal.aborted || active?.playId !== play.playId) {
          done("cancelled", "aborted");
          return;
        }
        trackEvent({
          name: "voice_playback_failed",
          data: { reason: "element", stage: "play", code: "element", platform: voicePlatform() },
        });
        done("failed", "element");
      };
      audio.src = url;
      // Safari can reset the rate when src changes or playback starts. Pitch lock stays on.
      applySpeechPlayback(audio);
      audio.onplay = () => applySpeechPlayback(audio);
      void audio.play().catch((error: unknown) => {
        const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
        if (name === "AbortError" || play.abort.signal.aborted || active?.playId !== play.playId) {
          done("cancelled", "aborted");
          return;
        }
        if (name === "NotAllowedError") {
          trackEvent({ name: "voice_autoplay_reject", data: { reason: name } });
        }
        trackEvent({
          name: "voice_playback_failed",
          data: { reason: "play", stage: "play", code: name || "play", platform: voicePlatform() },
        });
        done("failed", name || "play");
      });
    });
  }

  async function drain() {
    const next = queue;
    queue = null;
    if (!next || !enabled) return;
    if ((next.options.generation ?? generation) !== generation) {
      next.settle({ status: "cancelled", playId: next.playId });
      return;
    }
    await run(next.phrase, next.options, next.playId, next.settle);
  }

  function play(phrase: VoicePhrase, options?: Partial<PlayOptions>): Promise<PlayOutcome> {
    if (!enabled) {
      return Promise.resolve({ status: "skipped", playId: 0, code: "disabled" });
    }
    unlockAudio();
    const gen = options?.generation ?? generation;
    if (gen !== generation) {
      return Promise.resolve({ status: "cancelled", playId: 0, code: "stale-generation" });
    }
    const priority = options?.priority ?? "normal";
    const playId = ++nextPlayId;
    const nextOptions: PlayOptions = {
      generation: gen,
      delayMs: options?.delayMs,
      priority,
      handoff: options?.handoff,
    };

    return new Promise<PlayOutcome>((settle) => {
      if (active) {
        if (priority === "low") {
          settle({ status: "skipped", playId, code: "busy" });
          return;
        }
        if (priority === "high") {
          queue = null;
          cancelActive("cancelled");
          void run(phrase, nextOptions, playId, settle);
          return;
        }
        // Normal: replace queued clip only.
        if (queue) queue.settle({ status: "cancelled", playId: queue.playId, code: "replaced" });
        queue = { phrase, options: { ...nextOptions, delayMs: 0 }, playId, settle };
        return;
      }

      void run(phrase, nextOptions, playId, settle);
    });
  }

  function avoidText(event: VoiceEvent): string | undefined {
    return lastByEvent.get(event);
  }

  function prefetch(phrases: VoicePhrase[]) {
    voiceScheduler.schedule(phrases);
  }

  function isCachedSync(text: string, event?: string): boolean {
    return Boolean(peekVoiceBlob(text, event));
  }

  async function isCached(text: string, event?: string): Promise<boolean> {
    return Boolean(await readVoiceBlob(text, event));
  }

  function speakerState(): SpeakerState {
    return state;
  }

  return {
    setEnabled,
    isEnabled,
    cancel,
    releaseShopping,
    bump,
    currentToken,
    play,
    avoidText,
    prefetch,
    isCached,
    isCachedSync,
    speakerState,
    /** Test hook — settles active waiters. */
    _stopCurrent: () => cancelActive("cancelled"),
  };
}

export const voiceController = createVoiceController();
