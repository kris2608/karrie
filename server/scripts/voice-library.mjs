/**
 * Generate / refresh permanent catalog voice library (Realtime only).
 * Usage: npm run voice:library
 * Reads src/data/voice-catalog.json — no duplicated grammar.
 * Reuses existing WAV when text + voice + versions match and file is valid RIFF/WAVE.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPO = join(ROOT, "..");
const OUT = join(ROOT, "voice-library");
const PUBLIC_OUT = join(REPO, "public", "voice-library");
const CATALOG_PATH = join(REPO, "src", "data", "voice-catalog.json");

if (process.env.OPENAI_API_KEY === undefined) {
  try {
    process.loadEnvFile(join(ROOT, ".env"));
  } catch {
    // optional
  }
}

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_VOICE_MODEL || "gpt-realtime-2.1-mini";
/** Match server/index.ts — was wrongly OPENAI_VOICE_VOICE. */
const VOICE = process.env.OPENAI_VOICE || "marin";
const INSTRUCTION = "v5";
const DELIVERY = "v5";
const TEMPLATE = "v5";
const LANGUAGE = "nl-NL";

const PERSONALITY = `Je bent Karrie, een vrolijk en nieuwsgierig winkelvriendje voor jonge kinderen. Je praat in natuurlijk Nederlands, met een warme stem en een glimlach. Je klinkt spontaan en vertrouwd. Spreek rustig, duidelijk en speels, alsof je samen met een kind boodschappen doet. Behoud steeds dezelfde herkenbare stem. Spreek uitsluitend de opgegeven tekst uit.`;

const FIXED = [
  { event: "mission", text: "Psst… ik heb een speciale opdracht voor je!" },
  { event: "mission", text: "Ik heb een bonusmissie!" },
  { event: "mission", text: "Zoek de bonus!" },
  { event: "complete", text: "Gelukt! Alle boodschappen zijn gevonden." },
  { event: "complete", text: "Wat heb jij goed geholpen vandaag!" },
  { event: "complete", text: "Ons boodschappenavontuur zit erop!" },
  { event: "complete", text: "Tadaa! Dat hebben we samen mooi gedaan!" },
  { event: "positive", text: "Hebbes!" },
  { event: "positive", text: "Ja hoor!" },
  { event: "positive", text: "Gevonden!" },
];

function libraryFileId(text) {
  let hash = 2166136261;
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function voiceCacheKey(text, event) {
  const instructionVersion = `${INSTRUCTION}|${DELIVERY}|${TEMPLATE}|${event}`;
  const raw = [
    text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase(),
    LANGUAGE,
    VOICE,
    instructionVersion,
    MODEL,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function isValidWav(buf) {
  if (!buf || buf.length < 44) return false;
  return buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE";
}

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

function speakOnce(text) {
  return new Promise((resolve, reject) => {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    const chunks = [];
    let settled = false;
    let responseCreated = false;
    const timer = setTimeout(() => fail(new Error("timeout")), 20_000);

    function fail(error) {
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

    function succeed(wav) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            conversation: "none",
            output_modalities: ["audio"],
            instructions: `${PERSONALITY}\n\nZelfde Karrie-stem.\n\nZeg precies:\n${text}`,
            audio: { output: { voice: VOICE, format: { type: "audio/pcm", rate: 24_000 } } },
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
              output: { voice: VOICE, format: { type: "audio/pcm", rate: 24_000 } },
              input: { turn_detection: null },
            },
          },
        }),
      );
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "error") return fail(new Error(msg.error?.message || "error"));
      if (msg.type === "session.updated") return createResponse();
      if (msg.type === "response.output_audio.delta" || msg.type === "response.audio.delta") {
        if (msg.delta) chunks.push(Buffer.from(msg.delta, "base64"));
        return;
      }
      if (msg.type === "response.done") {
        const pcm = Buffer.concat(chunks);
        if (!pcm.length || pcm.length % 2 !== 0) return fail(new Error("invalid PCM"));
        if (msg.response?.status && msg.response.status !== "completed") {
          return fail(new Error(`status ${msg.response.status}`));
        }
        succeed(pcmToWav(pcm));
      }
    });

    ws.on("error", (e) => fail(e));
    ws.on("close", () => {
      if (!settled) fail(new Error("closed"));
    });
  });
}

async function speakWithRetry(text) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await speakOnce(text);
    } catch (error) {
      last = error;
      const wait = attempt * 1500;
      console.warn(`retry ${attempt}/4 after ${wait}ms: ${error.message || error}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

async function main() {
  if (!API_KEY) {
    console.error("OPENAI_API_KEY required");
    process.exit(1);
  }

  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const lines = [
    ...catalog.products.map((p) => ({
      event: "product",
      text: p.instruction,
      productId: p.productId,
      spokenName: p.spokenName,
    })),
    ...FIXED,
  ];

  const seen = new Set();
  const unique = [];
  for (const line of lines) {
    const key = `${line.event}|${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  await mkdir(OUT, { recursive: true });
  await mkdir(PUBLIC_OUT, { recursive: true });

  let previous = { entries: [] };
  const prevPath = join(OUT, "manifest.json");
  if (existsSync(prevPath)) {
    try {
      previous = JSON.parse(await readFile(prevPath, "utf8"));
    } catch {
      // ignore
    }
  }
  const prevByKey = new Map((previous.entries || []).map((e) => [`${e.event}|${e.text}`, e]));

  const entries = [];
  const failed = [];
  let reused = 0;
  let generated = 0;

  for (let i = 0; i < unique.length; i += 1) {
    const line = unique[i];
    const id = libraryFileId(line.text);
    const rel = join(line.event, `${id}.wav`).replace(/\\/g, "/");
    const abs = join(OUT, rel);
    const pubAbs = join(PUBLIC_OUT, rel);
    await mkdir(dirname(abs), { recursive: true });
    await mkdir(dirname(pubAbs), { recursive: true });

    const cacheKey = voiceCacheKey(line.text, line.event);
    const entry = {
      event: line.event,
      text: line.text,
      file: rel,
      cacheKey,
      productId: line.productId,
      spokenName: line.spokenName,
    };

    const prev = prevByKey.get(`${line.event}|${line.text}`);
    const versionsOk =
      previous.voice === VOICE &&
      previous.model === MODEL &&
      previous.instructionVersion === INSTRUCTION &&
      previous.deliveryVersion === DELIVERY &&
      previous.templateVersion === TEMPLATE;

    let keepPath = null;
    if (versionsOk && prev && existsSync(join(OUT, prev.file))) {
      const buf = await readFile(join(OUT, prev.file));
      if (isValidWav(buf) && prev.text === line.text) keepPath = join(OUT, prev.file);
    }
    if (!keepPath && existsSync(abs)) {
      const buf = await readFile(abs);
      if (isValidWav(buf)) keepPath = abs;
    }

    if (keepPath) {
      console.log(`[${i + 1}/${unique.length}] reuse: ${line.text}`);
      if (keepPath !== abs) await copyFile(keepPath, abs);
      await copyFile(abs, pubAbs);
      entries.push(entry);
      reused += 1;
      continue;
    }

    console.log(`[${i + 1}/${unique.length}] generate: ${line.event}: ${line.text}`);
    try {
      const wav = await speakWithRetry(line.text);
      if (!isValidWav(wav)) throw new Error("generated invalid wav");
      await writeFile(abs, wav);
      await copyFile(abs, pubAbs);
      entries.push(entry);
      generated += 1;
    } catch (error) {
      console.error(`FAILED: ${line.text} — ${error.message || error}`);
      failed.push(line.text);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const manifest = {
    version: "v5",
    model: MODEL,
    voice: VOICE,
    instructionVersion: INSTRUCTION,
    deliveryVersion: DELIVERY,
    templateVersion: TEMPLATE,
    generatedAt: new Date().toISOString(),
    reused,
    generated,
    entries,
    failed,
  };
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(PUBLIC_OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${entries.length} clips (reused ${reused}, generated ${generated}) to ${OUT}`);
  if (failed.length) {
    console.error(`Failed ${failed.length} clips — re-run to retry missing files.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
