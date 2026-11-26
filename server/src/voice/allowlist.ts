/** Mirrors client `voiceScripts` allowlist — keep in sync when templates change. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATIC = new Set([
  // Welcome / round start
  "Hoi! Zullen we samen boodschappen gaan zoeken? Daar gaan we!",
  "Hoi! Zullen we samen boodschappen doen?",
  "Ben je klaar voor ons boodschappenavontuur?",
  "Kom, we gaan op zoek naar de boodschappen!",
  // Positive
  "Hebbes!",
  "Ja hoor!",
  "Gevonden!",
  "Die mag in ons wagentje!",
  "Kijk eens aan!",
  "Ja, die hebben we!",
  "Goed gedaan!",
  "Die is het!",
  "Dat is hem!",
  "Helemaal goed!",
  // Incorrect
  "Oeps, die zoeken we nog niet.",
  "Bijna! Kijk nog eens goed.",
  "Dat is iets anders. Probeer het nog maar eens.",
  // Encouragement / final
  "Wat zijn we goed bezig!",
  "We zijn al een heel eind!",
  "Nog een paar boodschappen!",
  "Nog eentje te gaan!",
  // Complete / sticker
  "Hoera! Alle boodschappen zijn gevonden! Wat heb jij dat goed gedaan!",
  "Tadaa! We hebben alles gevonden! Hoera, wat goed van jou!",
  "Gelukt! Alle boodschappen zijn in het mandje! Dat hebben we samen gedaan!",
  "Jaaa! De speurtocht is klaar! Wat heb jij goed geholpen!",
  "Gelukt! Alle boodschappen zijn gevonden.",
  "Wat heb jij goed geholpen vandaag!",
  "Ons boodschappenavontuur zit erop!",
  "Tadaa! Dat hebben we samen mooi gedaan!",
  "Kijk, je hebt een nieuwe sticker verdiend!",
  "Er is een nieuwe sticker voor jouw stickerboek!",
  // Mission / play (never reveal guess answers)
  "Psst… ik heb een speciale opdracht voor je!",
  "Ik heb een bonusmissie!",
  "Zoek de bonus!",
  "Sleep naar Karrie!",
  "Raad het product!",
]);

function loadCatalogInstructions(): Set<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "..", "src", "data", "voice-catalog.json"),
    join(here, "..", "..", "voice-catalog.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as { products?: Array<{ instruction?: string }> };
      return new Set((raw.products ?? []).map((p) => p.instruction).filter((t): t is string => Boolean(t)));
    } catch {
      // try next
    }
  }
  return new Set();
}

const CATALOG = loadCatalogInstructions();

/** Product patterns — canonical + legacy so old clients do not 422. */
const DYNAMIC_PATTERNS = [
  /^Kun jij (.+) vinden\?$/,
  /^Nu gaan we (.+) zoeken!$/,
  /^Waar zijn (.+)\?$/,
  /^Waar is (.+)\?$/,
  /^Zoek maar (.+)!$/,
  /^Zoek jij (.+)\?$/,
  /^Hmm… waar zouden (.+) zijn\?$/,
  /^Hmm… waar zou (.+) zijn\?$/,
  /^Zo, nu nog (.+)!$/,
  /^(.+)! Zie jij .+ al\?$/,
  /^Op zoek naar (.+)!$/,
  /^Nog eentje: (.+)!$/,
  /^We hebben .+ (.+) nodig\.$/,
  /^Zoek iets .+!$/,
];

const MAX_SPOKEN_NAME = 40;
const MAX_TEXT = 140;

export const VOICE_EVENTS = [
  "welcome",
  "product",
  "positive",
  "incorrect",
  "encouragement",
  "complete",
  "sticker",
  "mission",
  "play",
] as const;
export type VoiceEvent = (typeof VOICE_EVENTS)[number];

export function isVoiceEvent(value: unknown): value is VoiceEvent {
  return typeof value === "string" && (VOICE_EVENTS as readonly string[]).includes(value);
}

export function isAllowedSpeechText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return false;
  if (STATIC.has(trimmed) || CATALOG.has(trimmed)) return true;
  for (const pattern of DYNAMIC_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const name = (match[1] ?? "").trim();
    if (name && (name.length > MAX_SPOKEN_NAME || /[<>{}[\]\\]|https?:/i.test(name))) return false;
    return true;
  }
  return false;
}

export function normalizeSpeechKey(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
