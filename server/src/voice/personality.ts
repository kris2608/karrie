import type { VoiceEvent } from "./allowlist.js";

export const VOICE_INSTRUCTION_VERSION = "v4";
export const VOICE_DELIVERY_VERSION = "v4";
export const VOICE_TEMPLATE_VERSION = "v4";
export const VOICE_LANGUAGE = "nl-NL";
export const VOICE_CACHE_NAMESPACE = "karrie-voice-v4";

/**
 * Stable single-speaker identity. Keep short: Realtime over-interprets long expressive briefs
 * into pitch jumps that sound like a second voice.
 */
export const DEFAULT_VOICE_PERSONALITY = `You are Karrie, one warm shopping friend for children aged two to five.

Always use the same speaker identity, the same calm mid pitch, and the same speaking speed in every clip. Do not change character, timbre, or energy between sentences.

Speak authentic Netherlands Dutch (Nederlands-Nederlands), not Belgian Flemish and not English-accented Dutch. Use clear Dutch vowels (aa, oo, ui, eu), natural Dutch rhythm and stress, and a soft conversational tone. Do not use an English cadence, rolled theatrical R, German consonants, or anglicized vowels.

Sound like a kind adult talking gently to a small child in a Dutch supermarket — warm and clear, never a cartoon, baby voice, whisper, shout, teacher, or commercial announcer.

Keep speech short and steady. Do not add laughter, gasps, song, or extra words.

Always speak the supplied Dutch text exactly, and nothing else.`;

/** One shared baseline + a single short mood tag — not a new character per event. */
const BASELINE_DELIVERY =
  "Same Karrie voice and pitch as always. Only a tiny mood shift, never a different speaker.";

const MOOD: Record<VoiceEvent, string> = {
  welcome: "Mood: warmly inviting.",
  product: "Mood: gently curious.",
  positive: "Mood: softly pleased.",
  incorrect: "Mood: kindly redirecting.",
  encouragement: "Mood: warmly encouraging.",
  complete: "Mood: quietly proud.",
  sticker: "Mood: warmly pleased.",
  mission: "Mood: playfully attentive (not a whisper).",
  play: "Mood: clear and playful.",
};

export function buildSpeakInstructions(event: VoiceEvent, text: string): string {
  const mood = MOOD[event] ?? MOOD.product;
  return `${DEFAULT_VOICE_PERSONALITY}

${BASELINE_DELIVERY}
${mood}

Say exactly the following Dutch sentence and nothing else:
${text}`;
}
