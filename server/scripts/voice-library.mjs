/**
 * Regenerate the permanent voice library (Realtime only).
 * Usage: npm run voice:generate
 * Writes server/voice-library/ only. The Vite build copies it into the static app.
 * Requires OPENAI_API_KEY. Reuses a clip only when voice, model, versions and audio quality match.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { checkPcmClip } from "../src/voice/clipQuality.ts";
import { libraryFileId } from "../src/voice/libraryId.ts";
import {
  buildSpeakInstructions,
  DEFAULT_VOICE_MODEL,
  DEFAULT_VOICE_NAME,
  VOICE_DELIVERY_VERSION,
  VOICE_INSTRUCTION_VERSION,
  VOICE_LANGUAGE,
  VOICE_TEMPLATE_VERSION,
} from "../src/voice/personality.ts";
import { transcriptsMatch } from "../src/voice/transcript.ts";
import { pcmToWav } from "../src/voice/wav.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPO = join(ROOT, "..");
const OUT = join(ROOT, "voice-library");
const CATALOG_PATH = join(REPO, "src", "data", "voice-catalog.json");

if (process.env.OPENAI_API_KEY === undefined) {
  try {
    process.loadEnvFile(join(ROOT, ".env"));
  } catch {
    // optional
  }
}

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_VOICE_MODEL || DEFAULT_VOICE_MODEL;
const VOICE = process.env.OPENAI_VOICE || DEFAULT_VOICE_NAME;
const PCM_RATE = 24_000;

/** Fixed lines. Keep in sync with ALLOWED_STATIC_TEXTS (asserted by voiceScripts.test). */
const FIXED = [
  { event: "welcome", text: "Hoi! Zullen we samen boodschappen gaan zoeken? Daar gaan we!" },
  { event: "welcome", text: "Hoi! Zullen we samen boodschappen doen?" },
  { event: "welcome", text: "Ben je klaar voor ons boodschappenavontuur?" },
  { event: "welcome", text: "Kom, we gaan op zoek naar de boodschappen!" },
  { event: "positive", text: "Hebbes!" },
  { event: "positive", text: "Ja hoor!" },
  { event: "positive", text: "Gevonden!" },
  { event: "positive", text: "Die mag in ons wagentje!" },
  { event: "positive", text: "Kijk eens aan!" },
  { event: "positive", text: "Ja, die hebben we!" },
  { event: "positive", text: "Goed gedaan!" },
  { event: "positive", text: "Die is het!" },
  { event: "positive", text: "Dat is hem!" },
  { event: "positive", text: "Helemaal goed!" },
  { event: "incorrect", text: "Oeps, die zoeken we nog niet." },
  { event: "incorrect", text: "Bijna! Kijk nog eens goed." },
  { event: "incorrect", text: "Dat is iets anders. Probeer het nog maar eens." },
  { event: "encouragement", text: "Wat zijn we goed bezig!" },
  { event: "encouragement", text: "We zijn al een heel eind!" },
  { event: "encouragement", text: "Nog een paar boodschappen!" },
  { event: "encouragement", text: "Nog eentje te gaan!" },
  { event: "complete", text: "Hoera! Alle boodschappen zijn gevonden! Wat heb jij dat goed gedaan!" },
  { event: "complete", text: "Tadaa! We hebben alles gevonden! Hoera, wat goed van jou!" },
  { event: "complete", text: "Gelukt! Alle boodschappen zijn in het mandje! Dat hebben we samen gedaan!" },
  { event: "complete", text: "Jaaa! De speurtocht is klaar! Wat heb jij goed geholpen!" },
  { event: "complete", text: "Gelukt! Alle boodschappen zijn gevonden." },
  { event: "complete", text: "Wat heb jij goed geholpen vandaag!" },
  { event: "complete", text: "Ons boodschappenavontuur zit erop!" },
  { event: "complete", text: "Tadaa! Dat hebben we samen mooi gedaan!" },
  { event: "sticker", text: "Kijk, je hebt een nieuwe sticker verdiend!" },
  { event: "sticker", text: "Er is een nieuwe sticker voor jouw stickerboek!" },
  { event: "mission", text: "Psst… ik heb een speciale opdracht voor je!" },
  { event: "mission", text: "Ik heb een bonusmissie!" },
  { event: "mission", text: "Zoek de bonus!" },
  { event: "play", text: "Sleep naar Karrie!" },
  { event: "play", text: "Raad het product!" },
];

function voiceCacheKey(text, event) {
  const instructionVersion = `${VOICE_INSTRUCTION_VERSION}|${VOICE_DELIVERY_VERSION}|${VOICE_TEMPLATE_VERSION}|${event}`;
  const raw = [text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase(), VOICE_LANGUAGE, VOICE, instructionVersion, MODEL].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function speakOnce(event, text) {
  return new Promise((resolve, reject) => {
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`;
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
    const chunks = [];
    let transcript = "";
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
            instructions: buildSpeakInstructions(event, text),
            audio: { output: { voice: VOICE, format: { type: "audio/pcm", rate: PCM_RATE } } },
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
              output: { voice: VOICE, format: { type: "audio/pcm", rate: PCM_RATE } },
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
      if (msg.type === "response.output_audio_transcript.delta" || msg.type === "response.audio_transcript.delta") {
        if (msg.delta) transcript += msg.delta;
        return;
      }
      if (msg.type === "response.output_audio_transcript.done" || msg.type === "response.audio_transcript.done") {
        if (msg.transcript) transcript = msg.transcript;
        return;
      }
      if (msg.type === "response.done") {
        const pcm = Buffer.concat(chunks);
        if (!pcm.length || pcm.length % 2 !== 0) return fail(new Error("invalid PCM"));
        if (msg.response?.status && msg.response.status !== "completed") {
          return fail(new Error(`status ${msg.response.status}`));
        }
        const quality = checkPcmClip(pcm, PCM_RATE, text);
        if (!quality.ok) return fail(new Error(`audio ${quality.reason}`));
        if (!transcriptsMatch(text, transcript)) return fail(new Error("transcript mismatch"));
        succeed(pcmToWav(pcm, PCM_RATE));
      }
    });

    ws.on("error", (error) => fail(error));
    ws.on("close", () => {
      if (!settled) fail(new Error("closed"));
    });
  });
}

async function speakWithRetry(event, text) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await speakOnce(event, text);
    } catch (error) {
      last = error;
      const wait = attempt * 1500;
      console.warn(`retry ${attempt}/4 after ${wait}ms: ${error.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw last;
}

async function removeOrphans(keep) {
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const rel = abs.slice(OUT.length + 1).replace(/\\/g, "/");
      if (rel === "manifest.json") continue;
      if (!keep.has(rel)) {
        await rm(abs);
        console.log(`removed orphan ${rel}`);
      }
    }
  }
  if (existsSync(OUT)) await walk(OUT);
}

async function main() {
  if (!API_KEY) {
    console.error("OPENAI_API_KEY required. Set it and run: npm run voice:generate");
    process.exit(1);
  }

  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const lines = [
    ...catalog.products.map((product) => ({
      event: "product",
      text: product.instruction,
      productId: product.productId,
      spokenName: product.spokenName,
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

  let previous = { entries: [] };
  const prevPath = join(OUT, "manifest.json");
  if (existsSync(prevPath)) {
    try {
      previous = JSON.parse(await readFile(prevPath, "utf8"));
    } catch {
      // ignore
    }
  }
  const prevByKey = new Map((previous.entries || []).map((entry) => [`${entry.event}|${entry.text}`, entry]));
  const versionsOk =
    previous.voice === VOICE &&
    previous.model === MODEL &&
    previous.instructionVersion === VOICE_INSTRUCTION_VERSION &&
    previous.deliveryVersion === VOICE_DELIVERY_VERSION &&
    previous.templateVersion === VOICE_TEMPLATE_VERSION;

  const entries = [];
  const failed = [];
  let reused = 0;
  let generated = 0;

  for (let i = 0; i < unique.length; i += 1) {
    const line = unique[i];
    const id = libraryFileId(line.text, VOICE_INSTRUCTION_VERSION);
    const rel = join(line.event, `${id}.wav`).replace(/\\/g, "/");
    const abs = join(OUT, rel);
    await mkdir(dirname(abs), { recursive: true });

    const cacheKey = voiceCacheKey(line.text, line.event);
    const entry = {
      event: line.event,
      text: line.text,
      file: rel,
      cacheKey,
      ...(line.productId ? { productId: line.productId, spokenName: line.spokenName } : {}),
    };

    const prev = prevByKey.get(`${line.event}|${line.text}`);
    let keep = null;
    if (versionsOk && prev && existsSync(join(OUT, prev.file))) {
      const buf = await readFile(join(OUT, prev.file));
      if (buf.subarray(0, 4).toString("ascii") === "RIFF") {
        const { readWavPcm } = await import("../src/voice/clipQuality.ts");
        const decoded = readWavPcm(buf);
        if (decoded && checkPcmClip(decoded.pcm, decoded.sampleRate, line.text).ok && prev.text === line.text) keep = buf;
      }
    }

    if (keep) {
      console.log(`[${i + 1}/${unique.length}] reuse: ${line.text}`);
      if (prev.file !== rel) await writeFile(abs, keep);
      entries.push(entry);
      reused += 1;
      continue;
    }

    console.log(`[${i + 1}/${unique.length}] generate: ${line.event}: ${line.text}`);
    try {
      const wav = await speakWithRetry(line.event, line.text);
      await writeFile(abs, wav);
      entries.push(entry);
      generated += 1;
    } catch (error) {
      console.error(`FAILED: ${line.text} — ${error.message || error}`);
      failed.push(line.text);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const manifest = {
    version: VOICE_INSTRUCTION_VERSION,
    model: MODEL,
    voice: VOICE,
    instructionVersion: VOICE_INSTRUCTION_VERSION,
    deliveryVersion: VOICE_DELIVERY_VERSION,
    templateVersion: VOICE_TEMPLATE_VERSION,
    generatedAt: new Date().toISOString(),
    reused,
    generated,
    entries,
    failed,
  };
  await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await removeOrphans(new Set(entries.map((entry) => entry.file)));
  console.log(`Wrote ${entries.length} clips (reused ${reused}, generated ${generated}) to ${OUT}`);
  console.log("Clips were not copied to public/. The Vite build serves server/voice-library.");
  if (failed.length) {
    console.error(`Failed ${failed.length} clips — re-run to retry missing files.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
