import { products } from "../data/catalog";
import type { AdventureItem, CategoryId, PlayKind, PlayOffer } from "./types";

export type { PlayKind, PlayOffer };

/** Unambiguous ART colours only — never invent or ask the model. */
export const COLOR_HUNT: Readonly<Record<string, string>> = {
  banaan: "geel",
  citroen: "geel",
  mais: "geel",
  kaas: "geel",
  boter: "geel",
  broccoli: "groen",
  komkommer: "groen",
  sla: "groen",
  "verse-spinazie": "groen",
  spinazie: "groen",
  sperziebonen: "groen",
  courgette: "groen",
  augurk: "groen",
  wortel: "oranje",
  sinaasappel: "oranje",
  mandarijn: "oranje",
  aardbei: "rood",
  tomaat: "rood",
  frisdrank: "rood",
  druiven: "paars",
  aubergine: "paars",
  bessen: "paars",
  water: "blauw",
  melk: "wit",
  yoghurt: "wit",
  kwark: "wit",
};

const PLAY_KINDS: readonly PlayKind[] = ["guess", "color", "drag"];

/** Mulberry32 — stable 0..1 stream from a string seed. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = h >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function colorFor(productId: string): string | undefined {
  return COLOR_HUNT[productId];
}

/** Same-category catalog sibling for the guess game; undefined when none. */
export function pickDistractor(productId: string, category: CategoryId, rand: () => number): string | undefined {
  const pool = products.filter((product) => product.category === category && product.id !== productId);
  if (!pool.length) return undefined;
  return pool[Math.floor(rand() * pool.length)]?.id;
}

function eligibleKind(item: AdventureItem, kind: PlayKind, rand: () => number): PlayOffer | undefined {
  if (kind === "guess") {
    const distractorId = pickDistractor(item.productId, item.category, rand);
    if (!distractorId) return undefined;
    return { kind, status: "offered", distractorId };
  }
  if (kind === "color") {
    const colorLabel = colorFor(item.productId);
    if (!colorLabel) return undefined;
    return { kind, status: "offered", colorLabel };
  }
  return { kind: "drag", status: "offered" };
}

export type BonusPick = {
  missionIds: string[];
  plays: Record<string, PlayOffer>;
};

/**
 * Deterministic unified picker (seed = adventure id):
 * healthier missions first (caller supplies missionIds), then ≈1 play per 3 remaining items.
 * Never two bonuses on the same product.
 */
export function pickPlayOffers(
  items: AdventureItem[],
  missionIds: readonly string[],
  enabled: boolean,
  seed: string,
): Record<string, PlayOffer> {
  if (!enabled) return {};
  const blocked = new Set(missionIds);
  const candidates = items.filter((item) => item.status !== "found" && !blocked.has(item.id) && !item.mission);
  if (!candidates.length) return {};

  const rand = seededRandom(seed);
  const target = Math.max(1, Math.round(candidates.length / 3));
  const plays: Record<string, PlayOffer> = {};
  let kindIndex = Math.floor(rand() * PLAY_KINDS.length);
  const order = [...candidates];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const item of order) {
    if (Object.keys(plays).length >= target) break;
    for (let attempt = 0; attempt < PLAY_KINDS.length; attempt += 1) {
      const kind = PLAY_KINDS[(kindIndex + attempt) % PLAY_KINDS.length];
      const offer = eligibleKind(item, kind, rand);
      if (!offer) continue;
      plays[item.id] = offer;
      kindIndex = (kindIndex + attempt + 1) % PLAY_KINDS.length;
      break;
    }
  }
  return plays;
}

export function playActive(item: AdventureItem | undefined): PlayOffer | undefined {
  const play = item?.play;
  if (!play || play.status === "done" || play.status === "skipped") return undefined;
  return play;
}
