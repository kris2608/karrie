import type { SharedListV1 } from "../../domain/shareList";

export type ShareCreateResult =
  | { status: "ok"; id: string; url: string; expiresAt: string }
  | { status: "error"; code: "empty" | "invalid" | "unavailable" | "rate-limited" | "network" };

export type ShareFetchResult =
  | { status: "ok"; list: SharedListV1 }
  | { status: "error"; code: "expired" | "not-found" | "unavailable" | "network" };

type Deps = { origin: string; fetch: typeof fetch };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createShareListClient(deps: Deps) {
  const base = deps.origin.replace(/\/$/, "");

  async function createOnce(list: SharedListV1): Promise<ShareCreateResult> {
    if (!base) return { status: "error", code: "unavailable" };
    try {
      const response = await deps.fetch(`${base}/api/lists/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        body: JSON.stringify(list),
      });
      const body = (await readJson(response)) as { status?: string; code?: string; id?: string; url?: string; expiresAt?: string } | null;
      if (response.status === 429) return { status: "error", code: "rate-limited" };
      if (response.status === 422 && body?.code === "empty") return { status: "error", code: "empty" };
      if (response.status === 422) return { status: "error", code: "invalid" };
      if (!response.ok || body?.status !== "ok" || !body.id || !body.url || !body.expiresAt) {
        return { status: "error", code: "unavailable" };
      }
      return { status: "ok", id: body.id, url: body.url, expiresAt: body.expiresAt };
    } catch {
      return { status: "error", code: "network" };
    }
  }

  return {
    /** Cold API starts can fail once; retry briefly on network/unavailable. */
    async create(list: SharedListV1): Promise<ShareCreateResult> {
      const first = await createOnce(list);
      if (first.status === "ok" || (first.code !== "unavailable" && first.code !== "network")) return first;
      await sleep(1200);
      return createOnce(list);
    },

    async fetch(id: string): Promise<ShareFetchResult> {
      if (!base) return { status: "error", code: "unavailable" };
      try {
        const response = await deps.fetch(`${base}/api/lists/share/${encodeURIComponent(id)}`, {
          method: "GET",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        const body = (await readJson(response)) as { status?: string; code?: string; list?: SharedListV1 } | null;
        if (response.status === 410) return { status: "error", code: "expired" };
        if (response.status === 404) return { status: "error", code: "not-found" };
        if (!response.ok || body?.status !== "ok" || !body.list) return { status: "error", code: "unavailable" };
        return { status: "ok", list: body.list };
      } catch {
        return { status: "error", code: "network" };
      }
    },
  };
}

export const shareListClient = createShareListClient({
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  fetch: (...args) => fetch(...args),
});
