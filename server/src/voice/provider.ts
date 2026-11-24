import type OpenAI from "openai";

export const VOICE_INSTRUCTION_VERSION = "v1";
export const VOICE_LANGUAGE = "nl-NL";

export const DEFAULT_VOICE_PERSONALITY =
  "Speak in natural Netherlands Dutch. You are Karrie, a friendly and playful shopping companion for young children. Speak warmly, clearly and conversationally, with a gentle smile in your voice. Use natural intonation and short pauses. Be encouraging but not overly enthusiastic. Avoid baby talk, exaggerated excitement and robotic delivery. Speak slightly slower than normal conversational speech.";

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
  const voice = config.voice || "coral";
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
