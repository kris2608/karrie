export const VOICE_INSTRUCTION_VERSION = "v6";
export const VOICE_DELIVERY_VERSION = "v6";
export const VOICE_TEMPLATE_VERSION = "v6";
export const VOICE_LANGUAGE = "nl-NL";
export const VOICE_CACHE_NAMESPACE = "karrie-voice-v6";
export const DEFAULT_VOICE_MODEL = "gpt-realtime-2.1";
export const DEFAULT_VOICE_NAME = "coral";

/**
 * Short Dutch single-speaker identity (v6).
 * Native Netherlands Dutch, cheerful and childlike. Keep it brief: Realtime over-interprets long briefs.
 */
export const DEFAULT_VOICE_PERSONALITY = `Je bent Karrie, een blij kinderstemmetje voor een kind van een jaar of drie. Je spreekt Nederlands zoals in Nederland, zonder buitenlands accent. Je klinkt vrolijk, speels en enthousiast. Zeg alleen de zin die je krijgt, niets ervoor of erna.`;

const BASELINE_DELIVERY = "Zelfde vrolijke kinderstem. Nederlands uit Nederland. Geen andere spreker.";

const MOOD: Record<string, string> = {
  complete: "Stemming: uitgelaten blij, een feestje.",
  welcome: "Stemming: vrolijk, daar gaan we!",
  mission: "Stemming: speels en enthousiast.",
  sticker: "Stemming: trots en blij.",
  positive: "Stemming: blij verrast.",
};

export function buildSpeakInstructions(event: string, text: string): string {
  const mood = MOOD[event] ?? "";
  return `${DEFAULT_VOICE_PERSONALITY}

${BASELINE_DELIVERY}
${mood}

Zeg precies de volgende Nederlandse zin en niets anders:
${text}`;
}
