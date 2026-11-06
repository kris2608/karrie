import type { ImageIdentity } from "../../domain/imageIdentity";

/** Mirrors ReferenceImage on the server. Every URL was returned by a search service and checked to be a real picture. */
export type ReferenceImage = {
  imageUrl: string;
  thumbnailUrl?: string;
  sourcePageUrl: string;
  title?: string;
  provider: string;
  matchingStatus: "exact" | "same-type" | "unverified";
  usageRightsStatus: "permitted" | "unknown";
  sourceName: string;
  license?: string;
  attribution?: string;
  cors: boolean;
};

/** found: open licence, shown automatically. personal: matches, rights unclear, kept on this device only. */
export type Discovery = {
  status: "found" | "personal" | "review" | "none";
  selected?: number;
  candidates: ReferenceImage[];
  provider: string;
  searchedAt: number;
};

export type DiscoverOutcome =
  | { status: "ok"; discovery: Discovery; selectedData?: string }
  | { status: "offline" }
  | { status: "limit"; code: string }
  | { status: "error"; code: string };

export const IMAGE_CLIENT_RULES = {
  timeoutMs: 45_000,
  devicePerDay: 40,
};

const LIMIT_CODES = new Set(["rate-limited", "daily-limit", "budget", "busy", "device-limit"]);
const DEVICE_KEY = "karrie-images-day";

export type ImageClientDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  origin: string;
  now: () => number;
};

function isDiscovery(value: unknown): value is Discovery {
  const body = value as Discovery | null;
  return Boolean(body && ["found", "personal", "review", "none"].includes(body.status) && Array.isArray(body.candidates));
}

export function createImageClient(deps: ImageClientDeps) {
  function usedToday() {
    const day = new Date(deps.now()).toISOString().slice(0, 10);
    try {
      const saved = JSON.parse(deps.storage?.getItem(DEVICE_KEY) ?? "null") as { day: string; count: number } | null;
      return saved?.day === day ? saved : { day, count: 0 };
    } catch {
      return { day, count: 0 };
    }
  }

  return {
    async discover(identity: ImageIdentity, refresh = false): Promise<DiscoverOutcome> {
      if (!deps.online()) return { status: "offline" };
      const used = usedToday();
      if (used.count >= IMAGE_CLIENT_RULES.devicePerDay) return { status: "limit", code: "device-limit" };
      deps.storage?.setItem(DEVICE_KEY, JSON.stringify({ day: used.day, count: used.count + 1 }));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), IMAGE_CLIENT_RULES.timeoutMs);
      try {
        const response = await deps.fetch(`${deps.origin.replace(/\/$/, "")}/api/images/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identity, refresh: refresh || undefined }),
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { status?: string; code?: string; discovery?: unknown; selectedData?: unknown } | null;
        if (response.ok && body?.status === "ok" && isDiscovery(body.discovery)) {
          const data = typeof body.selectedData === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.selectedData) ? body.selectedData : undefined;
          return { status: "ok", discovery: body.discovery, selectedData: data };
        }
        const code = body?.code ?? `http-${response.status}`;
        return LIMIT_CODES.has(code) || response.status === 429 ? { status: "limit", code } : { status: "error", code };
      } catch {
        if (controller.signal.aborted) return { status: "error", code: "timeout" };
        return deps.online() ? { status: "error", code: "unreachable" } : { status: "offline" };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export type ImageClient = ReturnType<typeof createImageClient>;

export const images = createImageClient({
  fetch: (...args) => fetch(...args),
  online: () => navigator.onLine,
  storage: typeof localStorage === "undefined" ? null : localStorage,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  now: Date.now,
});
