import type { VoiceEvent } from "./allowlist.js";

export const VOICE_INSTRUCTION_VERSION = "v5";
export const VOICE_DELIVERY_VERSION = "v5";
export const VOICE_TEMPLATE_VERSION = "v5";
export const VOICE_LANGUAGE = "nl-NL";
export const VOICE_CACHE_NAMESPACE = "karrie-voice-v5";

/**
 * Short Dutch single-speaker identity (v5). Keep brief: Realtime over-interprets long briefs.
 */
export const DEFAULT_VOICE_PERSONALITY = `Je bent Karrie, een vrolijk en nieuwsgierig winkelvriendje voor jonge kinderen. Je praat in natuurlijk Nederlands, met een warme stem en een glimlach. Je klinkt spontaan en vertrouwd. Spreek rustig, duidelijk en speels, alsof je samen met een kind boodschappen doet. Behoud steeds dezelfde herkenbare stem. Spreek uitsluitend de opgegeven tekst uit.`;

/** Identical delivery for ordinary product instructions; tiny mood only for celebration/mission. */
const BASELINE_DELIVERY = "Zelfde Karrie-stem en toonhoogte. Geen andere spreker.";

const MOOD: Partial<Record<VoiceEvent, string>> = {
  complete: "Stemming: rustig trots.",
  mission: "Stemming: speels aandachtig (geen fluisterstem).",
  sticker: "Stemming: warm tevreden.",
};

export function buildSpeakInstructions(event: VoiceEvent, text: string): string {
  const mood = MOOD[event] ?? "";
  return `${DEFAULT_VOICE_PERSONALITY}

${BASELINE_DELIVERY}
${mood}

Zeg precies de volgende Nederlandse zin en niets anders:
${text}`;
}
