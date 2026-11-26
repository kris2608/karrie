import { MPEGDecoder } from "mpg123-decoder";
import { checkPcmClip, checkSpokenClip, type ClipVerdict } from "./clipQuality.js";

let decoderPromise: Promise<MPEGDecoder> | null = null;
let decodeChain: Promise<unknown> = Promise.resolve();

function decoder(): Promise<MPEGDecoder> {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      const dec = new MPEGDecoder();
      await dec.ready;
      return dec;
    })();
  }
  return decoderPromise;
}

function floatToPcm(samples: Float32Array): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm.writeInt16LE(Math.round(clamped * 32_767), i * 2);
  }
  return pcm;
}

async function decodeMp3(audio: Buffer): Promise<{ pcm: Buffer; sampleRate: number }> {
  const run = decodeChain.then(async () => {
    const dec = await decoder();
    const decoded = dec.decode(audio);
    const channel = decoded.channelData[0];
    if (!channel || !decoded.samplesDecoded || !decoded.sampleRate) {
      throw new Error("mp3 decode empty");
    }
    return { pcm: floatToPcm(channel), sampleRate: decoded.sampleRate };
  });
  decodeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function looksLikeMp3(audio: Buffer): boolean {
  if (audio.length >= 3 && audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) return true;
  return audio.length >= 2 && audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0;
}

/** WAV stays on the PCM checker. MP3 is decoded, then the same silence and duration rules apply. */
export async function checkSpokenAudio(audio: Buffer, text: string, contentType = ""): Promise<ClipVerdict> {
  const wav = audio.length >= 12 && audio.toString("ascii", 0, 4) === "RIFF" && audio.toString("ascii", 8, 12) === "WAVE";
  if (wav || /audio\/wav/i.test(contentType)) return checkSpokenClip(audio, text);
  if (!looksLikeMp3(audio) && !/audio\/(mpeg|mp3)/i.test(contentType)) return { ok: false, reason: "invalid" };
  try {
    const decoded = await decodeMp3(audio);
    return checkPcmClip(decoded.pcm, decoded.sampleRate, text);
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
