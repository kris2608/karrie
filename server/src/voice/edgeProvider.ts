import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { VoiceEvent } from "./allowlist.js";
import { checkSpokenAudio } from "./audioCheck.js";
import { composeSpeechRate, SPEECH_TEMPO } from "./prosody.js";
import { VOICE_INSTRUCTION_VERSION } from "./personality.js";

export const EDGE_VOICE_MODEL = "edge-tts";
export const DEFAULT_EDGE_VOICE = "nl-NL-MaartenNeural";
export const DEFAULT_EDGE_RATE = "+8%";
export const DEFAULT_EDGE_PITCH = "+16Hz";
/** 24 kHz mono MP3 at 96 kbps. Above the 48 kbps default of some Edge clients. */
export const EDGE_OUTPUT_FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

export type EdgeSynthesize = (text: string, options: { voice: string; rate: string; pitch: string }) => Promise<Buffer>;

export type EdgeSpeechConfig = {
  voice?: string;
  /** Prosody from the approved sample, before the 20% delivery speed-up. */
  rate?: string;
  pitch?: string;
  tempo?: number;
  /** Test hook. Production uses the Edge Read Aloud socket. */
  synthesize?: EdgeSynthesize;
};

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("close", () => resolve());
  });
  return Buffer.concat(chunks);
}

export function createEdgeSpeechProvider(config: EdgeSpeechConfig = {}) {
  const voice = config.voice || DEFAULT_EDGE_VOICE;
  const pitch = config.pitch || DEFAULT_EDGE_PITCH;
  const rate = composeSpeechRate(config.rate || DEFAULT_EDGE_RATE, config.tempo ?? SPEECH_TEMPO);
  let client: MsEdgeTTS | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  function dropClient() {
    const current = client;
    client = null;
    try {
      current?.close();
    } catch {
      // ignore
    }
  }

  async function liveSynthesize(text: string): Promise<Buffer> {
    if (!client) {
      const next = new MsEdgeTTS({ connectionTimeoutMs: 12_000, synthesisTimeoutMs: 20_000 });
      await next.setMetadata(voice, EDGE_OUTPUT_FORMAT);
      client = next;
    }
    const { audioStream } = client.toStream(escapeXml(text), { rate, pitch });
    return readStream(audioStream);
  }

  async function generateOnce(text: string): Promise<Buffer> {
    const run = queue.then(async () => {
      const audio = config.synthesize
        ? await config.synthesize(text, { voice, rate, pitch })
        : await liveSynthesize(text);
      if (!audio.length) throw new Error("Edge audio empty");
      const verdict = await checkSpokenAudio(audio, text, "audio/mpeg");
      if (!verdict.ok) throw new Error(`Edge audio ${verdict.reason}`);
      return audio;
    });
    queue = run.then(
      () => undefined,
      () => {
        dropClient();
      },
    );
    return run;
  }

  return {
    model: EDGE_VOICE_MODEL,
    voice,
    /** Prosody and tempo are delivery, not a new speaking prompt. */
    instructionVersion: VOICE_INSTRUCTION_VERSION,
    rate,
    pitch,
    async generate(text: string, _options: { event: VoiceEvent }) {
      try {
        return {
          audio: await generateOnce(text),
          contentType: "audio/mpeg",
          model: EDGE_VOICE_MODEL,
          voice,
        };
      } catch (first) {
        dropClient();
        try {
          return {
            audio: await generateOnce(text),
            contentType: "audio/mpeg",
            model: EDGE_VOICE_MODEL,
            voice,
          };
        } catch (second) {
          throw second instanceof Error ? second : first;
        }
      }
    },
  };
}
