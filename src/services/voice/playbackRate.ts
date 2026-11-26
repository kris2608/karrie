/**
 * Play every spoken line 20% faster without raising the pitch.
 *
 * The speech clip is a plain HTMLAudioElement, not a Web Audio graph, so
 * playbackRate plus preservesPitch is the browser's own time-stretch.
 * Unprefixed preservesPitch is Chrome 86+, Firefox 101+, Safari/iOS 17.2+.
 * Older Safari only has webkitPreservesPitch (removed after the unprefixed
 * property shipped). If a browser has neither, leave the rate at 1 so the
 * voice cannot chipmunk.
 *
 * This is playback only. Cache keys stay on the v6 coral clips.
 */
export const VOICE_PLAYBACK_RATE = 1.2;

type PitchSafeAudio = HTMLAudioElement & {
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
  mozPreservesPitch?: boolean;
};

export function applySpeechPlayback(audio: HTMLAudioElement): void {
  const el = audio as PitchSafeAudio;
  const canPreservePitch = "preservesPitch" in el || "webkitPreservesPitch" in el || "mozPreservesPitch" in el;
  if ("preservesPitch" in el) el.preservesPitch = true;
  if ("webkitPreservesPitch" in el) el.webkitPreservesPitch = true;
  if ("mozPreservesPitch" in el) el.mozPreservesPitch = true;
  el.playbackRate = canPreservePitch ? VOICE_PLAYBACK_RATE : 1;
}
