type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;
let enabled = false;
/** Persistent speech element — primed during unlock so iOS Safari/PWA can autoplay later. */
let speechElement: HTMLAudioElement | null = null;
/** Separate element for silent unlock — never steals the speech element's src mid-play. */
let unlockElement: HTMLAudioElement | null = null;
let speechPrimed = false;

/** Minimal silent WAV (44-byte header + tiny PCM) for unlock priming. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();

  if (!speechElement) {
    speechElement = new Audio();
    speechElement.preload = "auto";
    speechElement.setAttribute("playsinline", "true");
  }
  if (!speechPrimed) {
    speechPrimed = true;
    try {
      if (!unlockElement) {
        unlockElement = new Audio();
        unlockElement.preload = "auto";
        unlockElement.setAttribute("playsinline", "true");
      }
      unlockElement.src = SILENT_WAV;
      void unlockElement
        .play()
        .then(() => {
          try {
            unlockElement?.pause();
          } catch {
            // ignore
          }
        })
        .catch(() => {
          speechPrimed = false;
        });
    } catch {
      speechPrimed = false;
    }
  }
}

/** Shared HTMLAudioElement for voice clips (same unlock path as SFX). */
export function getSpeechElement(): HTMLAudioElement {
  unlockAudio();
  if (!speechElement) {
    speechElement = new Audio();
    speechElement.preload = "auto";
    speechElement.setAttribute("playsinline", "true");
  }
  return speechElement;
}

function ready(): AudioContext | null {
  if (!enabled) return null;
  unlockAudio();
  return context && context.state !== "closed" ? context : null;
}

function tone(ctx: AudioContext, options: { freq: number; to?: number; start: number; length: number; type?: OscillatorType; gain?: number }) {
  const { freq, to, start, length, type = "sine", gain = 0.18 } = options;
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + length);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export function playPop() {
  const ctx = ready();
  if (!ctx) return;
  tone(ctx, { freq: 420, to: 880, start: 0, length: 0.09, type: "triangle", gain: 0.22 });
}

/** The scanner "biep!": once when a code is read or a photo is recognised, never on the shutter. */
export function playBeep() {
  const ctx = ready();
  if (!ctx) return;
  tone(ctx, { freq: 1250, start: 0, length: 0.08, type: "square", gain: 0.07 });
}

export function playStar() {
  const ctx = ready();
  if (!ctx) return;
  tone(ctx, { freq: 1318, start: 0, length: 0.18, gain: 0.12 });
  tone(ctx, { freq: 1760, start: 0.07, length: 0.24, gain: 0.1 });
}

export function playFanfare() {
  const ctx = ready();
  if (!ctx) return;
  [523, 659, 784, 1046].forEach((freq, index) => {
    tone(ctx, { freq, start: index * 0.11, length: index === 3 ? 0.5 : 0.16, type: "triangle", gain: 0.16 });
  });
}
