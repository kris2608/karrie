import { isRecognizedProduct, type RecognizedProduct } from "./types";

export type VisionResult =
  | { status: "ok"; product: RecognizedProduct }
  | { status: "offline" }
  | { status: "aborted" }
  | { status: "limit"; code: "device-limit" | "rate-limited" | "daily-limit" | "budget" | "in-flight" }
  | { status: "error"; code: string };

export const VISION_RULES = {
  timeoutMs: 75_000,
  slowAfterMs: 5_000,
  warmEveryMs: 60_000,
  devicePerDay: 25,
};

export type VisionDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  origin: string;
  now: () => number;
};

const DEVICE_KEY = "karrie-vision-day";
const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget", "in-flight"]);

export function createVisionClient(deps: VisionDeps) {
  let inFlight = false;
  let warmedAt = -Infinity;
  const url = (path: string) => `${deps.origin.replace(/\/$/, "")}${path}`;

  function usedToday(): { day: string; count: number } {
    const day = new Date(deps.now()).toISOString().slice(0, 10);
    try {
      const saved = JSON.parse(deps.storage?.getItem(DEVICE_KEY) ?? "null") as { day: string; count: number } | null;
      return saved?.day === day ? saved : { day, count: 0 };
    } catch {
      return { day, count: 0 };
    }
  }

  return {
    /** Free Render instances sleep; waking it while the parent frames the photo hides most of the delay. */
    warmUp() {
      if (!deps.online() || deps.now() - warmedAt < VISION_RULES.warmEveryMs) return;
      warmedAt = deps.now();
      deps.fetch(url("/api/health"), { credentials: "omit", referrerPolicy: "no-referrer" }).catch(() => undefined);
    },

    busy: () => inFlight,

    async recognize(dataUrl: string, options: { signal?: AbortSignal; onSlow?: () => void } = {}): Promise<VisionResult> {
      if (!deps.online()) return { status: "offline" };
      if (inFlight) return { status: "limit", code: "in-flight" };
      const used = usedToday();
      if (used.count >= VISION_RULES.devicePerDay) return { status: "limit", code: "device-limit" };

      inFlight = true;
      deps.storage?.setItem(DEVICE_KEY, JSON.stringify({ day: used.day, count: used.count + 1 }));
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort);
      const timeout = setTimeout(abort, VISION_RULES.timeoutMs);
      const slow = setTimeout(() => options.onSlow?.(), VISION_RULES.slowAfterMs);
      try {
        const response = await deps.fetch(url("/api/products/recognize-photo"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { status?: string; code?: string; product?: unknown } | null;
        if (response.ok && body?.status === "ok" && isRecognizedProduct(body.product)) return { status: "ok", product: body.product };
        const code = body?.code ?? `http-${response.status}`;
        if (LIMIT_CODES.has(code)) return { status: "limit", code: code as "rate-limited" };
        return { status: "error", code };
      } catch {
        if (options.signal?.aborted) return { status: "aborted" };
        if (controller.signal.aborted) return { status: "error", code: "timeout" };
        return deps.online() ? { status: "error", code: "unreachable" } : { status: "offline" };
      } finally {
        clearTimeout(timeout);
        clearTimeout(slow);
        options.signal?.removeEventListener("abort", abort);
        inFlight = false;
      }
    },
  };
}

export const vision = createVisionClient({
  fetch: (...args) => fetch(...args),
  online: () => navigator.onLine,
  storage: typeof localStorage === "undefined" ? null : localStorage,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  now: Date.now,
});
