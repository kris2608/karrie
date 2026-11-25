import type OpenAI from "openai";

export const VOICE_INSTRUCTION_VERSION = "v2";
export const VOICE_LANGUAGE = "nl-NL";

export const DEFAULT_VOICE_PERSONALITY =
  "Speak in natural Netherlands Dutch. You are Karrie, a warm and playful shopping friend for children aged 2 to 5. Sound bright, friendly and a little lively — like a kind adult talking to a small child with a smile. Keep sentences clear and short. Be encouraging and fun. Do not use baby talk, squeaky cartoon voices or exaggerated shouting. Speak at a natural, easy pace for young children — not slow or sleepy.";

export type SpeechProviderResult = {
  audio: Buffer;
  contentType: string;
  model: string;
  voice: string;
  /** Approximate billed usage when available; Speech API may omit tokens. */
  usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  extraUsd?: number;
};

export type SpeechProvider = {
  model: string;
  voice: string;
  instructionVersion: string;
  generate(text: string): Promise<SpeechProviderResult>;
};

export type SpeechProviderConfig = {
  model?: string;
  voice?: string;
  instructions?: string;
  /** Flat dollar estimate per Speech API call when usage tokens are absent. */
  callUsd?: number;
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
};

/**
 * OpenAI Speech API provider (`gpt-4o-mini-tts`).
 * Abstracted so a Realtime one-shot provider can replace it before Jan 2027 shutdown.
 */
export function createSpeechApiProvider(client: OpenAI, config: SpeechProviderConfig = {}): SpeechProvider {
  const model = config.model || "gpt-4o-mini-tts";
  const voice = config.voice || "nova";
  const instructions = config.instructions || DEFAULT_VOICE_PERSONALITY;
  const format = config.responseFormat || "mp3";
  const callUsd = config.callUsd ?? 0.015;
  const contentType =
    format === "mp3"
      ? "audio/mpeg"
      : format === "opus"
        ? "audio/ogg"
        : format === "wav"
          ? "audio/wav"
          : format === "aac"
            ? "audio/aac"
            : format === "flac"
              ? "audio/flac"
              : "audio/pcm";

  return {
    model,
    voice,
    instructionVersion: VOICE_INSTRUCTION_VERSION,
    async generate(text: string): Promise<SpeechProviderResult> {
      const response = await client.audio.speech.create({
        model,
        voice,
        input: text,
        instructions,
        response_format: format,
      });
      const audio = Buffer.from(await response.arrayBuffer());
      return {
        audio,
        contentType,
        model,
        voice,
        extraUsd: callUsd,
      };
    },
  };
}
