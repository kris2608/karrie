import { createHash, randomBytes } from "node:crypto";
import type { PoolLike, Queryable } from "./candidatesPg.js";
import { PRODUCT_CATEGORIES, type ProductCategory } from "./offers/match.js";
import { isRetailer, type RetailerId } from "./offers/prijsprofeet.js";

export const SHARED_LIST_TTL_MS = 48 * 60 * 60 * 1000;
export const SHARED_LIST_MAX_ITEMS = 40;
export const SHARED_LIST_MAX_NAME = 40;
export const SHARED_LIST_MAX_PACKAGE = 24;
export const SHARED_LIST_ID_BYTES = 12; // 16 base64url chars

export type SharedListItem = {
  name: string;
  quantity: number;
  category: ProductCategory;
  productId?: string;
  brand?: string;
  packageSize?: string;
  ean?: string;
  kind?: "custom_generic";
  icon?: string;
};

export type SharedListPayload = {
  version: 1;
  name?: string;
  retailer?: RetailerId;
  items: SharedListItem[];
};

export type SharedListStats = {
  created: number;
  reused: number;
  hits: number;
  expired: number;
  missing: number;
  purged: number;
};

export type SharedListStore = {
  create: (raw: unknown) => Promise<{ ok: true; id: string; expiresAt: string; reused: boolean } | { ok: false; code: "empty" | "invalid" | "unavailable" }>;
  get: (id: string) => Promise<{ ok: true; list: SharedListPayload } | { ok: false; code: "missing" | "expired" | "invalid" | "unavailable" }>;
  purgeExpired: () => Promise<number>;
  stats: () => SharedListStats;
};

type Rows = { rows: Record<string, unknown>[] };

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

function newId(): string {
  return randomBytes(SHARED_LIST_ID_BYTES).toString("base64url");
}

function isId(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** Accept the client SharedListV1 shape and drop anything outside the allowlist. */
export function sanitizeSharedList(raw: unknown): SharedListPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.version !== 1 && row.version !== undefined) return null;
  if (!Array.isArray(row.items) || row.items.length === 0 || row.items.length > SHARED_LIST_MAX_ITEMS) return null;
  const items: SharedListItem[] = [];
  for (const entry of row.items) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string" ? clip(item.name, SHARED_LIST_MAX_NAME) : "";
    const quantity = typeof item.quantity === "number" ? Math.trunc(item.quantity) : NaN;
    if (!name || !isCategory(item.category) || !Number.isFinite(quantity) || quantity < 1 || quantity > 24) return null;
    const shared: SharedListItem = { name, quantity, category: item.category };
    if (typeof item.productId === "string" && item.productId.trim()) shared.productId = item.productId.trim().slice(0, 80);
    if (typeof item.brand === "string" && clip(item.brand, SHARED_LIST_MAX_NAME)) shared.brand = clip(item.brand, SHARED_LIST_MAX_NAME);
    if (typeof item.packageSize === "string" && clip(item.packageSize, SHARED_LIST_MAX_PACKAGE)) {
      shared.packageSize = clip(item.packageSize, SHARED_LIST_MAX_PACKAGE);
    }
    if (typeof item.ean === "string" && /^\d{8,14}$/.test(item.ean.trim())) shared.ean = item.ean.trim();
    if (item.kind === "custom_generic") shared.kind = "custom_generic";
    if (typeof item.icon === "string" && item.icon.trim() && item.icon.trim() !== "unknown") {
      shared.icon = item.icon.trim().slice(0, 60);
    }
    items.push(shared);
  }
  if (!items.length) return null;
  const name = typeof row.name === "string" ? clip(row.name, SHARED_LIST_MAX_NAME) : "";
  const retailer = isRetailer(row.retailer) ? row.retailer : undefined;
  return {
    version: 1,
    ...(name && { name }),
    ...(retailer && { retailer }),
    items,
  };
}

export function contentHashOf(list: SharedListPayload): string {
  return createHash("sha256").update(JSON.stringify(list)).digest("hex");
}

export function createSharedListStore(pool: PoolLike, now: () => number = Date.now): SharedListStore {
  const totals: SharedListStats = { created: 0, reused: 0, hits: 0, expired: 0, missing: 0, purged: 0 };

  async function query(text: string, values?: unknown[]): Promise<Rows> {
    return pool.query(text, values);
  }

  return {
    async create(raw) {
      const list = sanitizeSharedList(raw);
      if (!list) return { ok: false, code: "invalid" };
      if (!list.items.length) return { ok: false, code: "empty" };
      const hash = contentHashOf(list);
      const expiresAt = new Date(now() + SHARED_LIST_TTL_MS);
      try {
        const existing = await query(
          `SELECT id FROM shared_lists WHERE content_hash = $1 AND expires_at > $2 ORDER BY expires_at DESC LIMIT 1`,
          [hash, new Date(now()).toISOString()],
        );
        if (existing.rows[0]?.id && typeof existing.rows[0].id === "string") {
          const id = existing.rows[0].id;
          await query(`UPDATE shared_lists SET expires_at = $2 WHERE id = $1`, [id, expiresAt.toISOString()]);
          totals.reused += 1;
          return { ok: true, id, expiresAt: expiresAt.toISOString(), reused: true };
        }
        const id = newId();
        await query(`INSERT INTO shared_lists (id, content_hash, payload, created_at, expires_at) VALUES ($1, $2, $3::jsonb, $4, $5)`, [
          id,
          hash,
          JSON.stringify(list),
          new Date(now()).toISOString(),
          expiresAt.toISOString(),
        ]);
        totals.created += 1;
        return { ok: true, id, expiresAt: expiresAt.toISOString(), reused: false };
      } catch {
        return { ok: false, code: "unavailable" };
      }
    },

    async get(id) {
      if (!isId(id)) {
        totals.missing += 1;
        return { ok: false, code: "invalid" };
      }
      try {
        const { rows } = await query(`SELECT payload, expires_at FROM shared_lists WHERE id = $1`, [id]);
        const row = rows[0];
        if (!row) {
          totals.missing += 1;
          return { ok: false, code: "missing" };
        }
        const expiresAt = row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(String(row.expires_at));
        if (!Number.isFinite(expiresAt) || expiresAt <= now()) {
          totals.expired += 1;
          return { ok: false, code: "expired" };
        }
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        const list = sanitizeSharedList(payload);
        if (!list) {
          totals.missing += 1;
          return { ok: false, code: "invalid" };
        }
        totals.hits += 1;
        return { ok: true, list };
      } catch {
        return { ok: false, code: "unavailable" };
      }
    },

    async purgeExpired() {
      try {
        const { rows } = await query(`DELETE FROM shared_lists WHERE expires_at <= $1 RETURNING id`, [new Date(now()).toISOString()]);
        const count = rows.length;
        totals.purged += count;
        return count;
      } catch {
        return 0;
      }
    },

    stats: () => ({ ...totals }),
  };
}

/** No-op store when Postgres is off: create/get always unavailable. */
export function disabledSharedListStore(): SharedListStore {
  const totals: SharedListStats = { created: 0, reused: 0, hits: 0, expired: 0, missing: 0, purged: 0 };
  return {
    async create() {
      return { ok: false, code: "unavailable" };
    },
    async get() {
      return { ok: false, code: "unavailable" };
    },
    async purgeExpired() {
      return 0;
    },
    stats: () => ({ ...totals }),
  };
}

export type { Queryable };
