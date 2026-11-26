/** Reject near-silent or time-stretched clips before they are cached or shipped. */

const FULL_SCALE = 32_768;
/** About -34 dBFS. The broken hagelslag/frisdrank clips peaked around 8. */
const MIN_PEAK = 0.02;
/** Share of samples that must leave the noise floor on a clip longer than 1s. */
const MIN_ACTIVE_RATIO = 0.04;
const NOISE_FLOOR = 800;

export type ClipVerdict =
  | { ok: true; durationMs: number; peak: number }
  | { ok: false; reason: "invalid" | "silent" | "too-short" | "stretched"; durationMs?: number; peak?: number };

export function checkPcmClip(pcm: Buffer, sampleRate: number, text: string): ClipVerdict {
  if (!pcm.length || pcm.length % 2 !== 0 || sampleRate < 8_000) return { ok: false, reason: "invalid" };
  const samples = pcm.length / 2;
  const durationMs = (samples / sampleRate) * 1000;
  let peak = 0;
  let active = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const value = Math.abs(pcm.readInt16LE(i));
    if (value > peak) peak = value;
    if (value > NOISE_FLOOR) active += 1;
  }
  const peakRatio = peak / FULL_SCALE;
  const activeRatio = active / samples;
  const chars = [...text.trim()].length;
  const pauses = (text.match(/[.!?…,]/g) ?? []).length;
  const minMs = Math.min(2_500, Math.max(180, chars * 28));
  // ~155 ms per character plus a little air. "Waar zijn luiers?" at 5.0 s fails; a normal take does not.
  const maxMs = Math.max(1_600, chars * 155 + pauses * 280 + 900);

  if (peakRatio < MIN_PEAK || (durationMs > 1_000 && activeRatio < MIN_ACTIVE_RATIO)) {
    return { ok: false, reason: "silent", durationMs, peak: peakRatio };
  }
  if (durationMs < minMs) return { ok: false, reason: "too-short", durationMs, peak: peakRatio };
  if (durationMs > maxMs) return { ok: false, reason: "stretched", durationMs, peak: peakRatio };
  return { ok: true, durationMs, peak: peakRatio };
}

export function readWavPcm(wav: Buffer): { pcm: Buffer; sampleRate: number } | null {
  if (wav.length < 44) return null;
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let sampleRate = 24_000;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > wav.length) return null;
    if (id === "fmt " && size >= 16) sampleRate = wav.readUInt32LE(start + 4);
    if (id === "data") return { pcm: wav.subarray(start, start + size), sampleRate };
    offset = start + size + (size % 2);
  }
  return null;
}

export function checkSpokenClip(wav: Buffer, text: string): ClipVerdict {
  const decoded = readWavPcm(wav);
  if (!decoded) return { ok: false, reason: "invalid" };
  return checkPcmClip(decoded.pcm, decoded.sampleRate, text);
}
