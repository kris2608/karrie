import WebSocket from "ws";
import type { VoiceEvent } from "./allowlist.js";
import { buildSpeakInstructions, VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE } from "./personality.js";
import { transcriptsMatch } from "./transcript.js";
import { pcmToWav } from "./wav.js";

export { VOICE_INSTRUCTION_VERSION, VOICE_LANGUAGE };

const ALLOWED_MODELS = new Set(["gpt-realtime-2.1-mini"]);
const DEPRECATED_MODELS = new Set(["gpt-4o-mini-tts", "tts-1", "tts-1-hd", "gpt-4o-mini-tts-2025-03-20", "gpt-4o-mini-tts-2025-12-15"]);
const ALLOWED_VOICES = new Set(["marin", "coral", "shimmer", "cedar", "alloy", "ash", "ballad", "echo", "sage", "verse"]);

const PCM_RATE = 24_000;
const PCM_BYTES_PER_SEC = PCM_RATE * 2;

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

function minPcmBytesForText(text: string): number {
  // ~40ms per character, floor 200ms, cap 2.5s — reject empty / truncated clips.
  const ms = Math.min(2_500, Math.max(200, text.trim().length * 40));
  return Math.floor((PCM_BYTES_PER_SEC * ms) / 1000);
}

function isTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|closed early|ECONN|socket|network|Realtime connection/i.test(message);
}

function isSchemaOrModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Unsupported|invalid_request|schema|voice model|Realtime voice/i.test(message);
}

/**
 * One-shot Realtime TTS: opens a short WebSocket, speaks exact Dutch text, returns WAV.
 * Never uses /v1/audio/speech. Creates response only after session.updated.
 */
export function createRealtimeSpeechProvider(config: RealtimeSpeechConfig): SpeechProvider {
  const model = assertModel(config.model || "gpt-realtime-2.1-mini");
  const voice = assertVoice(config.voice || "marin");
  const timeoutMs = config.timeoutMs ?? 12_000;
  const gate = createGate(Math.max(1, config.maxConcurrent ?? 2));

  async function generateOnce(text: string, event: VoiceEvent): Promise<SpeechProviderResult> {
    const connectStarted = Date.now();
    const release = await gate.acquire();
    const queueWaitMs = Date.now() - connectStarted;
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const chunks: Buffer[] = [];
    let transcript = "";
    let usage: SpeechProviderResult["usage"];
    let settled = false;
    let responseCreated = false;
    let openAt = 0;

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

      function createResponse() {
        if (settled || responseCreated || ws.readyState !== WebSocket.OPEN) return;
        responseCreated = true;
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
                  format: { type: "audio/pcm", rate: PCM_RATE },
                },
              },
            },
          }),
        );
      }

      ws.on("open", () => {
        openAt = Date.now();
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
                  format: { type: "audio/pcm", rate: PCM_RATE },
                },
                input: {
                  turn_detection: null,
                },
              },
            },
          }),
        );
        // No speculative create — wait for session.updated only.
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

        if (type === "session.updated") {
          createResponse();
          return;
        }

        if (type === "response.output_audio.delta" || type === "response.audio.delta") {
          const delta = typeof eventMsg.delta === "string" ? eventMsg.delta : "";
          if (delta) chunks.push(Buffer.from(delta, "base64"));
          return;
        }

        if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
          const piece = typeof eventMsg.delta === "string" ? eventMsg.delta : "";
          if (piece) transcript += piece;
          return;
        }
        if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
          const final = typeof eventMsg.transcript === "string" ? eventMsg.transcript : "";
          if (final) transcript = final;
          return;
        }

        if (type === "response.done") {
          const response = eventMsg.response as
            | {
                status?: string;
                status_details?: { type?: string; reason?: string };
                usage?: {
                  input_tokens?: number;
                  output_tokens?: number;
                  input_token_details?: { cached_tokens?: number };
                  output_token_details?: { audio_tokens?: number; text_tokens?: number };
                };
                output?: Array<{ content?: Array<{ transcript?: string; type?: string }> }>;
              }
            | undefined;

          const status = response?.status ?? "";
          if (status && status !== "completed") {
            fail(new Error(`Realtime response status: ${status}`));
            return;
          }

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
          if (!pcm.length || pcm.length % 2 !== 0) {
            fail(new Error("Realtime returned invalid PCM"));
            return;
          }

          const minBytes = minPcmBytesForText(text);
          if (pcm.length < minBytes) {
            fail(new Error(`Realtime audio too short: ${pcm.length} < ${minBytes}`));
            return;
          }

          if (!transcript.trim()) {
            console.warn(
              JSON.stringify({
                event: "voice_transcript_missing",
                pcmBytes: pcm.length,
                textLen: text.length,
              }),
            );
            fail(new Error("Realtime transcript missing"));
            return;
          }

          if (!transcriptsMatch(text, transcript)) {
            console.warn(
              JSON.stringify({
                event: "voice_transcript_mismatch",
                pcmBytes: pcm.length,
                textLen: text.length,
                spokenLen: transcript.length,
              }),
            );
            fail(new Error(`Realtime transcript mismatch`));
            return;
          }

          const generateMs = Date.now() - (openAt || connectStarted);
          console.info(
            JSON.stringify({
              event: "voice_generate_ok",
              queueWaitMs,
              connectMs: openAt ? openAt - connectStarted : 0,
              generateMs,
              pcmBytes: pcm.length,
              textLen: text.length,
            }),
          );

          succeed({
            audio: pcmToWav(pcm, PCM_RATE),
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
      } catch (first) {
        // Retry transport/timeout only — not model/voice/schema, and not transcript as permanent model error.
        // Missing transcript / mismatch: one transient retry.
        if (isSchemaOrModelError(first)) throw first;
        const message = first instanceof Error ? first.message : String(first);
        const retryable =
          isTransportError(first) || /transcript missing|transcript mismatch|audio too short|invalid PCM|status:/i.test(message);
        if (!retryable) throw first;
        try {
          return await generateOnce(text, options.event);
        } catch (second) {
          throw second instanceof Error ? second : first;
        }
      }
    },
  };
}

/** @deprecated Removed — Speech API must not be used. */
export function createSpeechApiProvider(): never {
  throw new Error("Speech API provider removed. Use createRealtimeSpeechProvider.");
}
