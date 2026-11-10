import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler, sanitizeLogPath } from "./app.js";
import type { PoolLike } from "./candidatesPg.js";
import { createLimits } from "./limits.js";
import {
  contentHashOf,
  createSharedListStore,
  sanitizeSharedList,
  sanitizeSharedListResult,
  SHARED_LIST_MAX_ITEMS,
  SHARED_LIST_TTL_MS,
} from "./sharedLists.js";

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS shared_lists (
  id text PRIMARY KEY,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
`;

const sample = {
  version: 1 as const,
  name: "Week",
  retailer: "albert_heijn" as const,
  items: [{ name: "Melk", quantity: 2, category: "dairy" as const, productId: "melk" }],
};

function memoryPool() {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as PoolLike;
  return { db, pool };
}

function manyItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Product ${index}`,
    quantity: 1,
    category: "dairy" as const,
  }));
}

describe("sanitizeSharedList", () => {
  it("accepts SharedListV1 and rejects empty, invalid or oversized payloads", () => {
    expect(sanitizeSharedList(sample)).toMatchObject({ version: 1, name: "Week", items: [{ name: "Melk", quantity: 2 }] });
    expect(sanitizeSharedListResult({ version: 1, items: [] })).toEqual({ ok: false, code: "empty" });
    expect(sanitizeSharedListResult({ version: 2, items: sample.items })).toEqual({ ok: false, code: "invalid" });
    expect(sanitizeSharedListResult({ version: 1, items: [{ name: "x", quantity: 1, category: "nope" }] })).toEqual({
      ok: false,
      code: "invalid",
    });
    expect(sanitizeSharedListResult({ version: 1, items: manyItems(SHARED_LIST_MAX_ITEMS) }).ok).toBe(true);
    expect(sanitizeSharedListResult({ version: 1, items: manyItems(SHARED_LIST_MAX_ITEMS + 1) })).toEqual({
      ok: false,
      code: "too-many",
    });
  });

  it("keeps catalog-shaped ids and variants, strips local-only product ids", () => {
    const cleaned = sanitizeSharedList({
      version: 1,
      items: [
        { name: "Calvé", quantity: 1, category: "breakfast", productId: "b-calve", ean: "8710400322100", brand: "Calvé", variant: "naturel" },
        { name: "Foto", quantity: 1, category: "dairy", productId: "photo:local" },
        { name: "Shared", quantity: 1, category: "dairy", productId: "shared:dairy:melk" },
      ],
    });
    expect(cleaned?.items[0]).toMatchObject({ productId: "b-calve", ean: "8710400322100", variant: "naturel", brand: "Calvé" });
    expect(cleaned?.items[1].productId).toBeUndefined();
    expect(cleaned?.items[2].productId).toBeUndefined();
  });
});

describe("sharedLists store", () => {
  it("creates a fresh immutable 48h link every time and expires independently", async () => {
    const { pool } = memoryPool();
    await pool.query(TABLE_SQL);
    let now = Date.UTC(2026, 10, 9, 12);
    const store = createSharedListStore(pool, () => now);

    const first = await store.create(sample);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.id.length).toBeGreaterThanOrEqual(16);
    const firstExpiry = Date.parse(first.expiresAt);
    expect(firstExpiry).toBe(now + SHARED_LIST_TTL_MS);

    now += 60 * 60 * 1000;
    const second = await store.create(sample);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.id).not.toBe(first.id);
    expect(Date.parse(second.expiresAt)).toBe(now + SHARED_LIST_TTL_MS);

    expect(await store.get(first.id)).toEqual({ ok: true, list: sanitizeSharedList(sample) });
    expect(contentHashOf(sanitizeSharedList(sample)!)).toHaveLength(64);

    now = firstExpiry;
    expect(await store.get(first.id)).toEqual({ ok: false, code: "expired" });
    expect(await store.get(second.id)).toEqual({ ok: true, list: sanitizeSharedList(sample) });

    now = Date.parse(second.expiresAt) + 1;
    expect(await store.get(second.id)).toEqual({ ok: false, code: "expired" });
    expect(await store.purgeExpired()).toBe(2);
    expect(await store.get(first.id)).toEqual({ ok: false, code: "missing" });
    expect(store.stats()).toMatchObject({ created: 2, hits: 2, expired: 2, purged: 2 });
  });

  it("returns unavailable when postgres queries fail", async () => {
    const pool = {
      query: async () => {
        throw new Error("down");
      },
    } as unknown as PoolLike;
    const store = createSharedListStore(pool);
    expect(await store.create(sample)).toEqual({ ok: false, code: "unavailable" });
    expect(await store.get("abcdefghijklmnop")).toEqual({ ok: false, code: "unavailable" });
  });
});

describe("sanitizeLogPath", () => {
  it("masks share tokens and leaves other routes alone", () => {
    expect(sanitizeLogPath("/api/lists/share/abcdefghijklmnop")).toBe("/api/lists/share/:id");
    expect(sanitizeLogPath("/api/lists/share")).toBe("/api/lists/share");
    expect(sanitizeLogPath("/api/health")).toBe("/api/health");
  });
});

describe("POST/GET /api/lists/share", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  async function start(perIpPerHour = 10, logs: Record<string, unknown>[] = []) {
    const { pool } = memoryPool();
    await pool.query(TABLE_SQL);
    const store = createSharedListStore(pool);
    const handler = createHandler({
      allowedOrigins: ["https://www.karrie.eu"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      limits: createLimits({
        perIpPerHour: 3,
        perIpPerDay: 5,
        dailyRequests: 100,
        dailyBudgetUsd: 1,
        inputUsdPerMTok: 0,
        cachedInputUsdPerMTok: 0,
        outputUsdPerMTok: 0,
      }),
      recognize: async () => ({ ok: false, code: "unavailable" }) as never,
      sharedLists: {
        store,
        limits: createLimits({
          perIpPerHour,
          perIpPerDay: 40,
          dailyRequests: 2000,
          dailyBudgetUsd: 1_000_000,
          inputUsdPerMTok: 0,
          cachedInputUsdPerMTok: 0,
          outputUsdPerMTok: 0,
        }),
        publicOrigin: "https://www.karrie.eu",
      },
      log: (entry) => logs.push(entry),
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return {
      base,
      logs,
      post: (body: unknown, ip = "10.0.0.1") =>
        fetch(`${base}/api/lists/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://www.karrie.eu", "X-Forwarded-For": ip },
          body: JSON.stringify(body),
        }),
      get: (id: string) =>
        fetch(`${base}/api/lists/share/${id}`, {
          headers: { Origin: "https://www.karrie.eu" },
        }),
    };
  }

  it("creates a short URL and returns the payload", async () => {
    const { post, get, base } = await start();
    const created = await post(sample);
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body).toMatchObject({
      status: "ok",
      id: expect.any(String),
      url: expect.stringMatching(/^https:\/\/www\.karrie\.eu\/l\//),
      expiresAt: expect.any(String),
    });
    expect(body.reused).toBeUndefined();
    const fetched = await get(body.id);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ status: "ok", list: { name: "Week", items: [{ name: "Melk" }] } });

    const health = await fetch(`${base}/api/health`);
    const healthBody = await health.json();
    expect(healthBody.sharedLists).toMatchObject({ enabled: true, outcomes: { created: 1, hits: 1 } });
  });

  it("logs share GETs without the token and rejects oversized lists", async () => {
    const logs: Record<string, unknown>[] = [];
    const { post, get } = await start(10, logs);
    const created = await post(sample);
    const body = await created.json();
    await get(body.id);
    await get("zzzzzzzzzzzzzzzz");
    expect(logs.filter((entry) => entry.method === "GET").every((entry) => entry.path === "/api/lists/share/:id")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(body.id);

    const oversized = await post({ version: 1, items: manyItems(SHARED_LIST_MAX_ITEMS + 1) }, "10.0.0.9");
    expect(oversized.status).toBe(422);
    expect(await oversized.json()).toEqual({ status: "error", code: "too-many" });
  });

  it("rate-limits create and rejects invalid payloads", async () => {
    const { post } = await start(1);
    expect((await post(sample)).status).toBe(200);
    expect((await post(sample)).status).toBe(429);
    expect((await post({ version: 1, items: [] }, "10.0.0.2")).status).toBe(422);
  });
});
