/**
 * Dev-only Realtime voice audition. Writes WAV under server/tmp/voice-audition/.
 * Usage: npm run voice:audition
 * Shipped voice is gpt-realtime-2.1 + coral. Never uses the Speech API.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "tmp", "voice-audition");

if (process.env.OPENAI_API_KEY === undefined) {
  try {
    process.loadEnvFile(join(__dirname, "..", ".env"));
  } catch {
    // optional
  }
}

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_VOICE_MODEL || "gpt-realtime-2.1";
const VOICES = ["marin", "coral", "cedar"];

const PERSONALITY = `Je bent Karrie, een blij kinderstemmetje voor een kind van een jaar of drie. Je spreekt Nederlands zoals in Nederland, zonder buitenlands accent. Je klinkt vrolijk, speels en enthousiast. Zeg alleen de zin die je krijgt, niets ervoor of erna.`;

const BASELINE = "Zelfde Karrie-stem en toonhoogte. Geen andere spreker.";

const LINES = [
  { id: "welcome", text: "Hoi! Zullen we samen boodschappen doen?", mood: "Mood: warmly inviting." },
  { id: "banana", text: "Hmm… waar zouden de bananen zijn?", mood: "Mood: gently curious." },
  { id: "milk", text: "Zo, nu nog melk!", mood: "Mood: gently curious." },
  { id: "hebbes", text: "Hebbes!", mood: "Mood: softly pleased." },
  { id: "apples", text: "Hmm… waar zouden de drie appels zijn?", mood: "Mood: gently curious." },
  { id: "mission", text: "Psst… ik heb een speciale opdracht voor je!", mood: "Mood: playfully attentive (not a whisper)." },
  { id: "tadaa", text: "Tadaa! Dat hebben we samen mooi gedaan!", mood: "Mood: quietly proud." },
];

function pcmToWav(pcm, sampleRate = 24_000) {
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, 44);
  return buffer;
}

function speakOnce(voice, line) {
  return new Promise((resolve, reject) => {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    const chunks = [];
    let settled = false;
    let responseCreated = false;
    const timer = setTimeout(() => fail(new Error("timeout")), 20_000);
    let fallback;

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(error);
    }

    function succeed(wav) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (fallback) clearTimeout(fallback);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(wav);
    }

    function createResponse() {
      if (settled || responseCreated || ws.readyState !== WebSocket.OPEN) return;
      responseCreated = true;
      if (fallback) clearTimeout(fallback);
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            conversation: "none",
            output_modalities: ["audio"],
            instructions: `${PERSONALITY}\n\n${BASELINE}\n${line.mood}\n\nSay exactly the following Dutch sentence and nothing else:\n${line.text}`,
            audio: { output: { voice, format: { type: "audio/pcm", rate: 24_000 } } },
          },
        }),
      );
    }

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            model: MODEL,
            output_modalities: ["audio"],
            audio: {
              output: { voice, format: { type: "audio/pcm", rate: 24_000 } },
              input: { turn_detection: null },
            },
          },
        }),
      );
      fallback = setTimeout(() => createResponse(), 400);
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const type = String(msg.type ?? "");
      if (type === "error") {
        fail(new Error(msg.error?.message || "Realtime error"));
        return;
      }
      if (type === "session.updated") {
        createResponse();
        return;
      }
      if (type === "response.output_audio.delta" || type === "response.audio.delta") {
        if (typeof msg.delta === "string") chunks.push(Buffer.from(msg.delta, "base64"));
        return;
      }
      if (type === "response.done") {
        const pcm = Buffer.concat(chunks);
        if (!pcm.length) fail(new Error("no audio"));
        else succeed(pcmToWav(pcm));
      }
    });

    ws.on("error", (error) => fail(error instanceof Error ? error : new Error(String(error))));
    ws.on("close", () => {
      if (!settled) fail(new Error("closed early"));
    });
  });
}

async function main() {
  if (!API_KEY) {
    console.error("OPENAI_API_KEY required");
    process.exit(1);
  }
  if (MODEL.includes("tts") || MODEL.includes("tts-1")) {
    console.error("Audition must use Realtime only. Refusing Speech API model:", MODEL);
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  const index = [];

  for (const voice of VOICES) {
    for (const line of LINES) {
      const file = `${voice}-${line.id}.wav`;
      process.stdout.write(`Generating ${file}... `);
      try {
        const wav = await speakOnce(voice, line);
        await writeFile(join(OUT, file), wav);
        index.push({ voice, id: line.id, text: line.text, file, bytes: wav.length });
        console.log("ok", wav.length, "bytes");
      } catch (error) {
        console.log("FAIL", error instanceof Error ? error.message : error);
      }
    }
  }

  const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>Karrie voice audition v5</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; background: #f7f3ea; color: #1c2a24; }
    h1 { font-size: 1.4rem; }
    .row { display: grid; grid-template-columns: 90px 1fr auto; gap: 0.75rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #cfc6b4; }
    .voice { font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; font-family: ui-sans-serif, system-ui, sans-serif; }
    audio { height: 32px; }
  </style>
</head>
<body>
  <h1>Karrie Realtime audition v5 (${MODEL})</h1>
  <p>Compare marin / coral / cedar against the shipped coral voice. This page does not change the default.</p>
  ${index
    .map(
      (row) => `<div class="row"><span class="voice">${row.voice}</span><span>${row.text}</span><audio controls src="./${row.file}"></audio></div>`,
    )
    .join("\n  ")}
</body>
</html>`;

  await writeFile(join(OUT, "index.html"), html);
  await writeFile(join(OUT, "summary.json"), JSON.stringify({ model: MODEL, personality: "v5", voices: VOICES, clips: index }, null, 2));
  console.log(`\nWrote ${index.length} clips + index to ${OUT}`);
  console.log("Shipped default is coral on gpt-realtime-2.1. This audition does not change it.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
