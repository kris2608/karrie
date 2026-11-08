import type { CatalogStore } from "./types.js";

const DAY = 24 * 60 * 60 * 1000;
export const IMAGE_HEALTH_RULES = {
  checkAfterMs: 7 * DAY,
  batch: 5,
  intervalMs: 60_000,
  timeoutMs: 5_000,
};

/** Bounded HEAD checks for catalog images; marks broken URLs unavailable. */
export function startImageHealth(
  catalog: Pick<CatalogStore, "imagesNeedingCheck" | "markImageUnavailable" | "touchImageChecked">,
  fetchImpl: typeof fetch = fetch,
): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function tick() {
    if (stopped) return;
    const pending = await catalog.imagesNeedingCheck(IMAGE_HEALTH_RULES.checkAfterMs, IMAGE_HEALTH_RULES.batch).catch(() => []);
    for (const image of pending) {
      if (stopped) return;
      try {
        const response = await fetchImpl(image.url, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(IMAGE_HEALTH_RULES.timeoutMs),
        });
        if (response.ok) await catalog.touchImageChecked(image.id);
        else await catalog.markImageUnavailable(image.id);
      } catch {
        await catalog.markImageUnavailable(image.id).catch(() => undefined);
      }
    }
  }

  timer = setInterval(() => {
    void tick();
  }, IMAGE_HEALTH_RULES.intervalMs);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  void tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
