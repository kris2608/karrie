import { describe, expect, it, vi } from "vitest";
import { catalogMatch, draftFromVision, needsCheck, visibleEan } from "../../domain/visionMapping";
import { createVisionClient, VISION_RULES, type VisionDeps } from "./client";
import type { RecognizedProduct } from "./types";

const PEANUT: RecognizedProduct = {
  recognized: true,
  productName: "100% Pindakaas Naturel",
  genericName: "Pindakaas",
  brand: "AH Terra",
  variant: "Naturel",
  packageSize: null,
  category: "houdbaar",
  subcategory: "pindakaas",
  ean: null,
  visibleNutriScore: "A",
  visibleClaims: ["100% pindakaas", "Naturel"],
  inferredFields: [],
  confidence: "high",
  needsConfirmation: true,
  containsPeople: false,
};

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

function client(fetcher: VisionDeps["fetch"], overrides: Partial<VisionDeps> = {}) {
  return createVisionClient({ fetch: fetcher, online: () => true, storage: memoryStorage(), origin: "https://api.test", now: () => Date.UTC(2026, 10, 6), ...overrides });
}

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("visionMapping", () => {
  it("maps AH Terra pindakaas to the catalog drawing and pantry, with no EAN", () => {
    const draft = draftFromVision(PEANUT);
    expect(draft.match?.id).toBe("pindakaas");
    expect(draft).toMatchObject({ name: "100% Pindakaas Naturel", category: "pantry", icon: "pindakaas" });
    expect(draft.pack).toMatchObject({ brand: "AH Terra", recognition: { variant: "Naturel", confidence: "high", nutriScoreSeen: "A" } });
    expect("ean" in draft.pack).toBe(false);
  });

  it("matches only exact names or aliases, never loose text", () => {
    expect(catalogMatch({ ...PEANUT, subcategory: "pindakaas met stukjes", genericName: "notenpasta" })).toBeNull();
    expect(catalogMatch({ ...PEANUT, subcategory: null, genericName: "Melk" })?.id).toBe("melk");
  });

  it("drops brand or size the model only inferred", () => {
    const draft = draftFromVision({ ...PEANUT, packageSize: "350 g", inferredFields: ["brand", "packageSize"] });
    expect(draft.pack.brand).toBeUndefined();
    expect(draft.pack.packageSize).toBeUndefined();
  });

  it("accepts a visible EAN only with a valid checksum", () => {
    expect(visibleEan({ ...PEANUT, ean: "3017620422003" })).toBe("3017620422003");
    expect(visibleEan({ ...PEANUT, ean: "3017620422004" })).toBeNull();
  });

  it("asks for a check on low confidence or an unrecognised photo", () => {
    expect(needsCheck({ ...PEANUT, needsConfirmation: false })).toBe(false);
    expect(needsCheck({ ...PEANUT, needsConfirmation: false, confidence: "low" })).toBe(true);
    expect(needsCheck({ ...PEANUT, needsConfirmation: false, recognized: false })).toBe(true);
  });

  it("falls back to the section icon when nothing in the catalog matches", () => {
    const draft = draftFromVision({ ...PEANUT, productName: null, genericName: "Kokosmelk", subcategory: "kokosmelk", category: "houdbaar" });
    expect(draft.match).toBeNull();
    expect(draft.name).toBe("Kokosmelk");
    expect(draft.icon).toBe("pakket");
  });
});

describe("vision client", () => {
  it("posts the image once and returns the product", async () => {
    const fetcher = vi.fn(() => ok({ status: "ok", product: PEANUT }));
    const result = await client(fetcher).recognize("data:image/jpeg;base64,AAAA");
    expect(result).toEqual({ status: "ok", product: PEANUT });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/api/products/recognize-photo");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("does not call the network when offline", async () => {
    const fetcher = vi.fn(() => ok({}));
    expect(await client(fetcher, { online: () => false }).recognize("data:")).toEqual({ status: "offline" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a second submit while one is running", async () => {
    let release: () => void = () => {};
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => (release = () => resolve(new Response(JSON.stringify({ status: "ok", product: PEANUT }))))));
    const vision = client(fetcher);
    const first = vision.recognize("data:a");
    expect(await vision.recognize("data:b")).toEqual({ status: "limit", code: "in-flight" });
    release();
    expect((await first).status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops at the daily device limit", async () => {
    const fetcher = vi.fn(() => ok({ status: "ok", product: PEANUT }));
    const vision = client(fetcher);
    for (let i = 0; i < VISION_RULES.devicePerDay; i += 1) await vision.recognize("data:a");
    expect(await vision.recognize("data:a")).toEqual({ status: "limit", code: "device-limit" });
  });

  it("maps server limits, errors and malformed bodies", async () => {
    expect(await client(() => ok({ status: "error", code: "rate-limited" }, 429)).recognize("data:a")).toEqual({ status: "limit", code: "rate-limited" });
    expect(await client(() => ok({ status: "error", code: "refused" }, 422)).recognize("data:a")).toEqual({ status: "error", code: "refused" });
    expect(await client(() => ok({ status: "ok", product: { recognized: "yes" } })).recognize("data:a")).toEqual({ status: "error", code: "http-200" });
    expect(await client(() => Promise.reject(new TypeError("fetch failed"))).recognize("data:a")).toEqual({ status: "error", code: "unreachable" });
  });

  it("reports a cancelled request as aborted", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = client(fetcher as VisionDeps["fetch"]).recognize("data:a", { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ status: "aborted" });
  });
});
