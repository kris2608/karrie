import { ART } from "../components/art";
import { products } from "../data/catalog";
import type { AdventureItem, CategoryId, PackInfo, PlayKind, PlayOffer } from "./types";

export type { PlayKind, PlayOffer };

/** Real pack/name photos only — catalog drawings look too alike for "Raad het product". */
export function hasGuessPhoto(item: Pick<PackInfo, "imageUrl" | "imageKind" | "photoId" | "namePhoto">): boolean {
  if (item.namePhoto?.imageUrl) return true;
  return item.imageKind === "photo" && Boolean(item.photoId || item.imageUrl);
}

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

/** Only the comparison game is active for now; color/drag stay in the type system but are not assigned. */
const PLAY_KINDS: readonly PlayKind[] = ["guess"];

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

function artKey(productId: string): string {
  return products.find((product) => product.id === productId)?.illustration ?? productId;
}

function hexDistance(a: string, b: string): number {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    if (h.length < 6) return [0, 0, 0] as const;
    return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)] as const;
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

/** How clearly two drawings differ for a toddler: kind first, then colour. */
export function distractorScore(productId: string, otherId: string): number {
  const own = ART[artKey(productId)];
  const other = ART[artKey(otherId)];
  if (!own || !other) return 0;
  let score = 0;
  if (own.kind !== other.kind) score += 100;
  score += Math.min(hexDistance(own.color, other.color), 240) / 2;
  return score;
}

/**
 * Pick a distractor that looks clearly different (silhouette + colour).
 * Prefer same category when possible; widen the pool when same-shelf art is too similar.
 */
export function pickDistractor(productId: string, category: CategoryId, rand: () => number): string | undefined {
  const others = products.filter((product) => product.id !== productId);
  if (!others.length) return undefined;

  const sameCategory = others.filter((product) => product.category === category);
  const clear = (pool: typeof others) => pool.filter((product) => distractorScore(productId, product.id) >= 100);
  // Different art kind is the bar; fall back to strong colour contrast if every sibling shares a silhouette.
  const vivid = (pool: typeof others) => pool.filter((product) => distractorScore(productId, product.id) >= 60);

  const preferred = clear(sameCategory);
  const widened = preferred.length ? preferred : clear(others);
  const pool = widened.length ? widened : vivid(sameCategory).length ? vivid(sameCategory) : vivid(others);
  if (!pool.length) return undefined;
  return pool[Math.floor(rand() * pool.length)]?.id;
}

/** Another open list item with a real photo, so both guess choices are product pictures. */
export function pickPhotoDistractor(item: AdventureItem, peers: AdventureItem[], rand: () => number): AdventureItem | undefined {
  const pool = peers.filter((peer) => peer.id !== item.id && peer.status !== "found" && hasGuessPhoto(peer));
  if (!pool.length) return undefined;
  return pool[Math.floor(rand() * pool.length)];
}

function eligibleKind(item: AdventureItem, kind: PlayKind, rand: () => number, peers: AdventureItem[]): PlayOffer | undefined {
  if (kind === "guess") {
    if (!hasGuessPhoto(item)) return undefined;
    const distractor = pickPhotoDistractor(item, peers, rand);
    if (!distractor) return undefined;
    return { kind, status: "offered", distractorId: distractor.productId, distractorItemId: distractor.id };
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
      const offer = eligibleKind(item, kind, rand, candidates);
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
