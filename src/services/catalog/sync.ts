import { extendCatalog, type SharedCatalogProduct } from "../../data/catalog";
import { readKv, writeKv } from "../../storage/db";

const KV_KEY = "catalogSync";
const SIX_HOURS = 6 * 60 * 60 * 1000;

export type CatalogSyncState = {
  since: string | null;
  products: SharedCatalogProduct[];
  checkedAt: number;
};

export type CatalogSyncDeps = {
  fetch: typeof fetch;
  online: () => boolean;
  origin: string;
  now: () => number;
  load: () => Promise<CatalogSyncState | undefined>;
  save: (state: CatalogSyncState) => Promise<void>;
};

type ChangesBody = {
  status?: string;
  products?: SharedCatalogProduct[];
  next?: string | null;
};

function mergeProducts(current: SharedCatalogProduct[], incoming: SharedCatalogProduct[]): SharedCatalogProduct[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    if (entry.deprecated) byId.delete(entry.id);
    else byId.set(entry.id, { ...entry, deprecated: false });
  }
  return [...byId.values()];
}

export function createCatalogSync(deps: CatalogSyncDeps) {
  let running: Promise<void> | null = null;

  async function apply(state: CatalogSyncState) {
    extendCatalog(state.products);
    await deps.save(state);
  }

  async function pull(force = false): Promise<void> {
    if (!deps.online() || !deps.origin) return;
    const stored = (await deps.load()) ?? { since: null, products: [], checkedAt: 0 };
    if (!force && stored.checkedAt && deps.now() - stored.checkedAt < SIX_HOURS) {
      extendCatalog(stored.products);
      return;
    }
    let since = stored.since;
    let products = [...stored.products];
    for (;;) {
      const url = new URL("/api/catalog/changes", deps.origin.replace(/\/$/, "") + "/");
      if (since) url.searchParams.set("since", since);
      url.searchParams.set("limit", "200");
      const response = await deps.fetch(url.href, {
        method: "GET",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const body = (await response.json().catch(() => null)) as ChangesBody | null;
      if (!response.ok || body?.status !== "ok" || !Array.isArray(body.products)) break;
      products = mergeProducts(products, body.products);
      const latest = body.products.at(-1)?.updatedAt ?? since;
      since = typeof latest === "string" ? latest : since;
      if (!body.next) break;
      since = body.next;
    }
    await apply({ since, products, checkedAt: deps.now() });
  }

  function sync(options?: { force?: boolean }) {
    if (running) return running;
    running = pull(options?.force === true)
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
    return running;
  }

  return {
    /** Apply a cached sync without network; safe during offline startup. */
    async hydrate() {
      const stored = await deps.load();
      if (stored?.products.length) extendCatalog(stored.products);
    },
    /** Fetch incremental changes when online; never throws. */
    sync,
    /** Same as sync({ force: true }); used by pull-to-refresh on Toevoegen. */
    refresh: () => sync({ force: true }),
  };
}

export const catalogSync = createCatalogSync({
  fetch: (...args) => fetch(...args),
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  now: Date.now,
  load: () => readKv<CatalogSyncState>(KV_KEY),
  save: (state) => writeKv(KV_KEY, state),
});
