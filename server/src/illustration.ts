import type { Candidate } from "./candidates.js";
import { errorCode, type RecognizeErrorCode } from "./recognize.js";

export type IllustrationConfig = {
  model: string;
  /** Dollars per generated picture at the chosen size and quality; tokens are not reported per image. */
  imageUsd: number;
  maxCached?: number;
};

export type IllustrationResult = { ok: true; image: string; cached: boolean } | { ok: false; code: RecognizeErrorCode };

type ImagesClient = { images: { generate: (body: never) => Promise<unknown> } };

const DEPARTMENT: Record<Candidate["category"], string> = {
  produce: "fruit or vegetable",
  bakery: "bakery product",
  meat: "meat, fish or vegetarian product",
  breakfast: "breakfast or spread product",
  deli: "cheese or cold-cut product",
  dairy: "dairy product",
  snacks: "snack or sweets product",
  pantry: "pantry product",
  meals: "ready meal or salad",
  drinks: "drink",
  frozen: "frozen food",
  care: "personal-care product",
  household: "household product",
};

/** A fixed style so every drawing looks like the rest of Karrie; only the product's own names vary. */
export function illustrationPrompt(candidate: Pick<Candidate, "canonicalName" | "displayName" | "category" | "subcategory">): string {
  const what = `${candidate.displayName} (Dutch: "${candidate.canonicalName}", a ${candidate.subcategory ?? DEPARTMENT[candidate.category]})`;
  return [
    `One ${what}, drawn as a friendly sticker for a children's shopping game.`,
    "Style: flat vector illustration, thick rounded dark-brown outlines, warm cheerful colours, one soft highlight, gentle shadow, slightly chunky proportions.",
    "Show the product itself, loose or in a plain unlabeled bag or bowl, centred, filling most of the square.",
    "No text, no letters, no logo, no brand, no barcode, no people, no face, no background scene, transparent background.",
    "Not photo-realistic, not 3D render, not a packshot.",
  ].join(" ");
}

export function illustrationRequest(config: IllustrationConfig, candidate: Candidate) {
  return {
    model: config.model,
    prompt: illustrationPrompt(candidate),
    n: 1,
    size: "1024x1024" as const,
    quality: "low" as const,
    background: "transparent" as const,
    output_format: "webp" as const,
  };
}

/** Generates at most one picture per candidate and keeps it in memory, so a second device gets it for free. */
export function createIllustrator(client: ImagesClient, config: IllustrationConfig) {
  const cache = new Map<string, string>();
  const running = new Map<string, Promise<IllustrationResult>>();
  const max = config.maxCached ?? 300;

  async function generate(candidate: Candidate): Promise<IllustrationResult> {
    try {
      const response = (await client.images.generate(illustrationRequest(config, candidate) as never)) as { data?: { b64_json?: string }[] };
      const data = response.data?.[0]?.b64_json;
      if (!data) return { ok: false, code: "malformed" };
      const image = `data:image/webp;base64,${data}`;
      if (cache.size >= max) cache.delete(cache.keys().next().value!);
      cache.set(candidate.candidateId, image);
      return { ok: true, image, cached: false };
    } catch (error) {
      return { ok: false, code: errorCode(error) };
    }
  }

  return {
    model: config.model,
    imageUsd: config.imageUsd,
    cached(candidate: Candidate): string | null {
      return cache.get(candidate.candidateId) ?? null;
    },
    draw(candidate: Candidate): Promise<IllustrationResult> {
      const hit = cache.get(candidate.candidateId);
      if (hit) return Promise.resolve({ ok: true, image: hit, cached: true });
      const existing = running.get(candidate.candidateId);
      if (existing) return existing;
      const job = generate(candidate).finally(() => running.delete(candidate.candidateId));
      running.set(candidate.candidateId, job);
      return job;
    },
    stats() {
      return { cached: cache.size, running: running.size };
    },
  };
}

export type Illustrator = ReturnType<typeof createIllustrator>;
