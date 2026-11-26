/**
 * Spoken clips already include the faster Maarten rate.
 * Playback stays at 1× so the browser does not time-stretch them.
 */
export const VOICE_PLAYBACK_RATE = 1;

export function applySpeechPlayback(audio: HTMLAudioElement): void {
  audio.playbackRate = VOICE_PLAYBACK_RATE;
}
