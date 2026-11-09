import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";
import { createHandler } from "./app.js";
import type { PoolLike } from "./candidatesPg.js";
import { createLimits } from "./limits.js";
import { contentHashOf, createSharedListStore, sanitizeSharedList, SHARED_LIST_TTL_MS } from "./sharedLists.js";

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

describe("sanitizeSharedList", () => {
  it("accepts SharedListV1 and rejects empty or oversized payloads", () => {
    expect(sanitizeSharedList(sample)).toMatchObject({ version: 1, name: "Week", items: [{ name: "Melk", quantity: 2 }] });
    expect(sanitizeSharedList({ version: 1, items: [] })).toBeNull();
    expect(sanitizeSharedList({ version: 2, items: sample.items })).toBeNull();
    expect(sanitizeSharedList({ version: 1, items: [{ name: "x", quantity: 1, category: "nope" }] })).toBeNull();
  });
});

describe("sharedLists store", () => {
  it("creates, reuses by content hash, gets, expires and purges", async () => {
    const { pool } = memoryPool();
    await pool.query(TABLE_SQL);
    let now = Date.UTC(2026, 10, 9, 12);
    const store = createSharedListStore(pool, () => now);

    const created = await store.create(sample);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.reused).toBe(false);
    expect(created.id.length).toBeGreaterThanOrEqual(16);

    const reused = await store.create(sample);
    expect(reused).toEqual({ ok: true, id: created.id, expiresAt: expect.any(String), reused: true });

    const got = await store.get(created.id);
    expect(got).toEqual({ ok: true, list: sanitizeSharedList(sample) });
    expect(contentHashOf(sanitizeSharedList(sample)!)).toHaveLength(64);

    now += SHARED_LIST_TTL_MS + 1;
    expect(await store.get(created.id)).toEqual({ ok: false, code: "expired" });
    expect(await store.purgeExpired()).toBe(1);
    expect(await store.get(created.id)).toEqual({ ok: false, code: "missing" });
    expect(store.stats()).toMatchObject({ created: 1, reused: 1, hits: 1, expired: 1, purged: 1 });
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

describe("POST/GET /api/lists/share", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  async function start(perIpPerHour = 10) {
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
      log: () => undefined,
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    return {
      base,
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
    const fetched = await get(body.id);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ status: "ok", list: { name: "Week", items: [{ name: "Melk" }] } });

    const health = await fetch(`${base}/api/health`);
    const healthBody = await health.json();
    expect(healthBody.sharedLists).toMatchObject({ enabled: true, outcomes: { created: 1, hits: 1 } });
  });

  it("rate-limits create and rejects invalid payloads", async () => {
    const { post } = await start(1);
    expect((await post(sample)).status).toBe(200);
    expect((await post(sample)).status).toBe(429);
    expect((await post({ version: 1, items: [] }, "10.0.0.2")).status).toBe(422);
  });
});
