type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;
let enabled = false;

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
