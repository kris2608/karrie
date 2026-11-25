import WebSocket from "ws";
import type { VoiceEvent } from "./allowlist.js";
import { buildSpeakInstructions, VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE } from "./personality.js";
import { transcriptsMatch } from "./transcript.js";
import { pcmToWav } from "./wav.js";

export { VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE };

const ALLOWED_MODELS = new Set(["gpt-realtime-2.1-mini"]);
const DEPRECATED_MODELS = new Set(["gpt-4o-mini-tts", "tts-1", "tts-1-hd", "gpt-4o-mini-tts-2025-03-20", "gpt-4o-mini-tts-2025-12-15"]);
const ALLOWED_VOICES = new Set(["marin", "coral", "shimmer", "cedar", "alloy", "ash", "ballad", "echo", "sage", "verse"]);

export type SpeechProviderResult = {
  audio: Buffer;
  contentType: string;
  model: string;
  voice: string;
  usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number; audioOutputTokens?: number };
};

export type SpeechGenerateOptions = {
  event: VoiceEvent;
};

export type SpeechProvider = {
  model: string;
  voice: string;
  instructionVersion: string;
  generate(text: string, options: SpeechGenerateOptions): Promise<SpeechProviderResult>;
};

export type RealtimeSpeechConfig = {
  apiKey: string;
  model?: string;
  voice?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
};

function assertModel(model: string): string {
  if (DEPRECATED_MODELS.has(model) || model.includes("tts-1") || model.includes("mini-tts")) {
    throw new Error(`Unsupported deprecated voice model: ${model}. Use gpt-realtime-2.1-mini.`);
  }
  if (!ALLOWED_MODELS.has(model)) {
    throw new Error(`Unsupported voice model: ${model}. Allowed: gpt-realtime-2.1-mini.`);
  }
  return model;
}

function assertVoice(voice: string): string {
  if (!ALLOWED_VOICES.has(voice)) {
    throw new Error(`Unsupported Realtime voice: ${voice}.`);
  }
  return voice;
}

type Gate = { acquire(): Promise<() => void> };

function createGate(limit: number): Gate {
  let active = 0;
  const waiters: Array<() => void> = [];
  return {
    async acquire() {
      if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
      active += 1;
      return () => {
        active -= 1;
        waiters.shift()?.();
      };
    },
  };
}

/**
 * One-shot Realtime TTS: opens a short WebSocket, speaks exact Dutch text, returns WAV.
 * Never uses /v1/audio/speech.
 */
export function createRealtimeSpeechProvider(config: RealtimeSpeechConfig): SpeechProvider {
  const model = assertModel(config.model || "gpt-realtime-2.1-mini");
  const voice = assertVoice(config.voice || "marin");
  const timeoutMs = config.timeoutMs ?? 12_000;
  const gate = createGate(Math.max(1, config.maxConcurrent ?? 2));

  async function generateOnce(text: string, event: VoiceEvent): Promise<SpeechProviderResult> {
    const release = await gate.acquire();
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const chunks: Buffer[] = [];
    let transcript = "";
    let usage: SpeechProviderResult["usage"];
    let settled = false;

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });

    const result = await new Promise<SpeechProviderResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(new Error("Realtime voice timeout"));
      }, timeoutMs);

      function fail(error: Error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(error);
      }

      function succeed(value: SpeechProviderResult) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve(value);
      }

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              model,
              output_modalities: ["audio"],
              audio: {
                output: {
                  voice,
                  format: { type: "audio/pcm", rate: 24_000 },
                },
                input: {
                  turn_detection: null,
                },
              },
            },
          }),
        );
      });

      ws.on("message", (raw) => {
        let eventMsg: Record<string, unknown>;
        try {
          eventMsg = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(eventMsg.type ?? "");

        if (type === "error") {
          const err = eventMsg.error as { message?: string } | undefined;
          fail(new Error(err?.message || "Realtime error"));
          return;
        }

        if (type === "session.updated" || type === "session.created") {
          // Fire the one-shot speak after session is ready; session.created may precede our update.
          if (type === "session.updated") {
            ws.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  conversation: "none",
                  output_modalities: ["audio"],
                  instructions: buildSpeakInstructions(event, text),
                  audio: {
                    output: {
                      voice,
                      format: { type: "audio/pcm", rate: 24_000 },
                    },
                  },
                },
              }),
            );
          }
          return;
        }

        if (type === "response.output_audio.delta" || type === "response.audio.delta") {
          const delta = typeof eventMsg.delta === "string" ? eventMsg.delta : "";
          if (delta) chunks.push(Buffer.from(delta, "base64"));
          return;
        }

        if (
          type === "response.output_audio_transcript.done" ||
          type === "response.audio_transcript.done" ||
          type === "response.output_audio_transcript.delta"
        ) {
          const piece = typeof eventMsg.transcript === "string" ? eventMsg.transcript : typeof eventMsg.delta === "string" ? eventMsg.delta : "";
          if (piece) transcript += piece;
          return;
        }

        if (type === "response.done") {
          const response = eventMsg.response as
            | {
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                  input_token_details?: { cached_tokens?: number };
                  output_token_details?: { audio_tokens?: number; text_tokens?: number };
                };
                output?: Array<{ content?: Array<{ transcript?: string; type?: string }> }>;
              }
            | undefined;
          if (response?.usage) {
            usage = {
              inputTokens: response.usage.input_tokens ?? 0,
              cachedInputTokens: response.usage.input_token_details?.cached_tokens ?? 0,
              outputTokens: response.usage.output_tokens ?? 0,
              audioOutputTokens: response.usage.output_token_details?.audio_tokens,
            };
          }
          if (!transcript && response?.output) {
            for (const item of response.output) {
              for (const part of item.content ?? []) {
                if (part.transcript) transcript += part.transcript;
              }
            }
          }

          const pcm = Buffer.concat(chunks);
          if (!pcm.length) {
            fail(new Error("Realtime returned no audio"));
            return;
          }
          if (!transcriptsMatch(text, transcript)) {
            fail(new Error(`Realtime transcript mismatch: got "${transcript}"`));
            return;
          }
          succeed({
            audio: pcmToWav(pcm, 24_000),
            contentType: "audio/wav",
            model,
            voice,
            usage,
          });
        }
      });

      ws.on("error", (error) => fail(error instanceof Error ? error : new Error(String(error))));
      ws.on("close", () => {
        if (!settled) fail(new Error("Realtime connection closed early"));
      });
    }).finally(release);

    return result;
  }

  return {
    model,
    voice,
    instructionVersion: VOICE_INSTRUCTION_VERSION,
    async generate(text: string, options: SpeechGenerateOptions): Promise<SpeechProviderResult> {
      try {
        return await generateOnce(text, options.event);
      } catch {
        // One retry for transport / transcript glitches.
        return await generateOnce(text, options.event);
      }
    },
  };
}

/** @deprecated Removed — Speech API must not be used. */
export function createSpeechApiProvider(): never {
  throw new Error("Speech API provider removed. Use createRealtimeSpeechProvider.");
}
