/**
 * Generate permanent catalog voice library (Realtime only).
 * Usage: npm run voice:library
 * Writes WAV + manifest.json under server/voice-library/ (and optional public copy).
 * Does NOT regenerate on every deploy — run intentionally / CI artifact.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPO = join(ROOT, "..");
const OUT = join(ROOT, "voice-library");
const PUBLIC_OUT = join(REPO, "public", "voice-library");

if (process.env.OPENAI_API_KEY === undefined) {
  try {
    process.loadEnvFile(join(ROOT, ".env"));
  } catch {
    // optional
  }
}

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_VOICE_MODEL || "gpt-realtime-2.1-mini";
const VOICE = process.env.OPENAI_VOICE_VOICE || "marin";
const INSTRUCTION = "v5";
const DELIVERY = "v5";
const TEMPLATE = "v5";
const LANGUAGE = "nl-NL";

const PERSONALITY = `Je bent Karrie, een vrolijk en nieuwsgierig winkelvriendje voor jonge kinderen. Je praat in natuurlijk Nederlands, met een warme stem en een glimlach. Je klinkt spontaan en vertrouwd. Spreek rustig, duidelijk en speels, alsof je samen met een kind boodschappen doet. Behoud steeds dezelfde herkenbare stem. Spreek uitsluitend de opgegeven tekst uit.`;

const ARTICLES = {
  banaan: "de",
  bananen: "de",
  appel: "de",
  appels: "de",
  melk: "de",
  brood: "het",
  ei: "het",
  eieren: "de",
  tomaat: "de",
  tomaten: "de",
  komkommer: "de",
  wortel: "de",
  wortels: "de",
};

const PLURALS = {
  appel: "appels",
  banaan: "bananen",
  peer: "peren",
  tomaat: "tomaten",
  wortel: "wortels",
  aardappel: "aardappelen",
  sinaasappel: "sinaasappels",
  ei: "eieren",
};

const MASS = new Set(["melk", "yoghurt", "boter", "kaas", "rijst", "pasta", "water", "olie"]);

function libraryFileId(text) {
  let hash = 2166136261;
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function pickIndex(seed, n) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % n;
}

function spokenOf(name) {
  const trimmed = name.trim();
  if (!trimmed) return "product";
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function nounPhrase(productId, name, withArticle, withQuantity = true) {
  let spoken = spokenOf(name);
  const key = spoken.toLowerCase();
  const mass = MASS.has(key);
  const looksPlural = /en$|els$|ers$|s$/i.test(spoken) && !mass;
  if (looksPlural || PLURALS[key]) spoken = PLURALS[key] || spoken;
  const article = ARTICLES[key] || ARTICLES[key.replace(/en$/, "")] || ARTICLES[productId];
  if (withArticle && article) return `${article} ${spoken}`;
  return spoken;
}

function productPhrase(productId, name) {
  const builders = [
    () => `Kun jij ${nounPhrase(productId, name, true)} vinden?`,
    () => `Nu gaan we ${nounPhrase(productId, name, false)} zoeken!`,
    () => {
      const np = nounPhrase(productId, name, true);
      const plural = /en$|els$|ers$|s$/i.test(np.split(" ").pop() || "");
      return plural ? `Waar zijn ${np}?` : `Waar is ${np}?`;
    },
    () => `Zoek maar ${nounPhrase(productId, name, false)}!`,
  ];
  return builders[pickIndex(productId, builders.length)]();
}

function voiceCacheKey(text, event) {
  const instructionVersion = `${INSTRUCTION}|${DELIVERY}|${TEMPLATE}|${event}`;
  const raw = [text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase(), LANGUAGE, VOICE, instructionVersion, MODEL].join("|");
  return createHash("sha256").update(raw).digest("hex");
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

function speakOnce(text, event) {
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
        if (!pcm.length) return fail(new Error("no audio"));
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

async function loadCatalogProducts() {
  const src = await readFile(join(REPO, "src", "data", "catalog.ts"), "utf8");
  const products = [];
  const re = /product\("([^"]+)",\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(src))) {
    products.push({ productId: match[1], name: match[2] });
  }
  return products;
}

async function main() {
  if (!API_KEY) {
    console.error("OPENAI_API_KEY required");
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  await mkdir(PUBLIC_OUT, { recursive: true });

  const products = await loadCatalogProducts();
  const lines = [
    ...products.map((p) => ({
      event: "product",
      text: productPhrase(p.productId, p.name),
      productId: p.productId,
    })),
    { event: "mission", text: "Psst… ik heb een speciale opdracht voor je!" },
    { event: "mission", text: "Ik heb een bonusmissie!" },
    { event: "mission", text: "Zoek de bonus!" },
    { event: "complete", text: "Gelukt! Alle boodschappen zijn gevonden." },
    { event: "complete", text: "Wat heb jij goed geholpen vandaag!" },
    { event: "complete", text: "Ons boodschappenavontuur zit erop!" },
    { event: "complete", text: "Tadaa! Dat hebben we samen mooi gedaan!" },
    // Deferred positive set — generated but not auto-played in P0.
    { event: "positive", text: "Hebbes!" },
    { event: "positive", text: "Ja hoor!" },
    { event: "positive", text: "Gevonden!" },
  ];

  // Dedupe by event|text
  const seen = new Set();
  const unique = [];
  for (const line of lines) {
    const key = `${line.event}|${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  const entries = [];
  for (let i = 0; i < unique.length; i += 1) {
    const line = unique[i];
    const id = libraryFileId(line.text);
    const rel = join(line.event, `${id}.wav`).replace(/\\/g, "/");
    const abs = join(OUT, rel);
    await mkdir(dirname(abs), { recursive: true });
    console.log(`[${i + 1}/${unique.length}] ${line.event}: ${line.text}`);
    let wav;
    try {
      wav = await speakOnce(line.text, line.event);
    } catch (error) {
      console.warn("retry", error.message);
      wav = await speakOnce(line.text, line.event);
    }
    await writeFile(abs, wav);
    const pubDir = join(PUBLIC_OUT, line.event);
    await mkdir(pubDir, { recursive: true });
    await copyFile(abs, join(PUBLIC_OUT, rel));
    entries.push({
      event: line.event,
      text: line.text,
      file: rel,
      cacheKey: voiceCacheKey(line.text, line.event),
      productId: line.productId,
    });
    // Gentle pacing to avoid rate limits.
    await new Promise((r) => setTimeout(r, 250));
  }

  const manifest = {
    version: "v5",
    model: MODEL,
    voice: VOICE,
    instructionVersion: INSTRUCTION,
    deliveryVersion: DELIVERY,
    templateVersion: TEMPLATE,
    generatedAt: new Date().toISOString(),
    entries,
  };
  await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(join(PUBLIC_OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${entries.length} clips to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
