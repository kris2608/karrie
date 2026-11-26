import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it } from "vitest";
import { hashUsageSubject, signAppToken, verifyAppToken } from "./appToken.js";
import { createHandler } from "./app.js";
import { clientIp } from "./clientIp.js";
import type { PoolLike } from "./candidatesPg.js";
import { createLimits, type LimitConfig } from "./limits.js";
import { createPgUsageStore } from "./usageStore.js";

const LIMITS: LimitConfig = {
  perIpPerHour: 1,
  perIpPerDay: 5,
  dailyRequests: 100,
  dailyBudgetUsd: 1,
  inputUsdPerMTok: 1,
  cachedInputUsdPerMTok: 0.1,
  outputUsdPerMTok: 4,
};

function request(forwarded: string | undefined, remote = "10.0.0.1") {
  return { headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded }, socket: { remoteAddress: remote } } as never;
}

describe("clientIp", () => {
  it("trusts the rightmost X-Forwarded-For hop, which is the one Render appends", () => {
    expect(clientIp(request("1.2.3.4, 203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(request("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(request(undefined, "::ffff:198.51.100.4"))).toBe("198.51.100.4");
    expect(clientIp(request(undefined, ""))).toBe("unknown");
  });
});

describe("app tokens", () => {
  const now = Date.UTC(2026, 10, 26, 12);
  const secret = "test-secret";

  it("round-trips a token and rejects tampering, expiry and a far-future expiry", () => {
    const signed = signAppToken(secret, "abcdefghijklmnop", now);
    expect(verifyAppToken(secret, signed.token, now)).toEqual({ installId: "abcdefghijklmnop" });
    expect(verifyAppToken("other", signed.token, now)).toBeNull();
    expect(verifyAppToken(secret, `${signed.token}x`, now)).toBeNull();
    expect(verifyAppToken(secret, signed.token, signed.expiresAt + 1)).toBeNull();
    const forever = signAppToken(secret, "abcdefghijklmnop", now, 1000 * 60 * 60 * 24 * 30);
    expect(verifyAppToken(secret, forever.token, now)).toBeNull();
  });
});

describe("usage store", () => {
  it("keeps the daily budget across a new process", async () => {
    const db = newDb({ noAstCoverageCheck: true });
    const { Pool } = db.adapters.createPg();
    const pool = new Pool() as unknown as PoolLike;
    await pool.query(readFileSync(new URL("../migrations/010_usage_state.sql", import.meta.url), "utf8"));
    const store = createPgUsageStore(pool);
    const config: LimitConfig = { ...LIMITS, perIpPerHour: 100, dailyBudgetUsd: 0.01 };
    const hash = (value: string) => hashUsageSubject("secret", value);
    const time = Date.UTC(2026, 10, 26, 15);
    const first = createLimits(config, () => time);
    first.useStore(store, "recognize", hash);
    await first.hydrate();
    expect(first.admit("203.0.113.9", "abcdefghijklmnop")).toBeNull();
    first.record({ ok: true, latencyMs: 10, usage: { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 } });
    await first.commit();

    const restarted = createLimits(config, () => time);
    restarted.useStore(store, "recognize", hash);
    await restarted.hydrate();
    expect(restarted.admit("198.51.100.8")).toBe("budget");
    expect(restarted.stats().today.costUsd).toBeGreaterThan(0.01);
  });
});

describe("paid routes", () => {
  let server: Server | null = null;
  afterEach(() => {
    server?.close();
    server = null;
  });

  async function start() {
    const handler = createHandler({
      allowedOrigins: ["https://www.karrie.eu"],
      requireOrigin: true,
      configured: true,
      model: "gpt-5.4-mini",
      adminToken: "admin-secret",
      appAuth: { secret: "app-secret", required: true },
      limits: createLimits({ ...LIMITS, perIpPerHour: 10, dailyRequests: 10 }),
      sessionLimits: createLimits({ ...LIMITS, perIpPerHour: 10, perIpPerDay: 10, dailyRequests: 10 }),
      recognize: async () => ({ ok: false, code: "unavailable" }) as never,
      offers: {
        lookup: { find: async () => ({ ok: true, match: { matchType: "none" } }), stats: () => ({ hits: 0, misses: 0, entries: 0 }) },
        limits: createLimits(LIMITS),
      },
      log: () => undefined,
    });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const session = async (forwarded: string, installId = "abcdefghijklmnop") => {
      const response = await fetch(`${base}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://www.karrie.eu", "X-Forwarded-For": forwarded },
        body: JSON.stringify({ installId }),
      });
      return response.json() as Promise<{ token: string }>;
    };
    const offer = (token: string | undefined, forwarded: string) =>
      fetch(`${base}/api/offers/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.karrie.eu",
          "X-Forwarded-For": forwarded,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ retailer: "albert_heijn", product: { name: "Melk", aliases: ["melk"], category: "dairy", generic: true } }),
      });
    return { base, session, offer };
  }

  it("hides budgets on the public health check and shows them to the admin token", async () => {
    const { base } = await start();
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ status: "ok" });
    expect((await fetch(`${base}/api/admin/health`)).status).toBe(404);
    const detailed = await (await fetch(`${base}/api/admin/health`, { headers: { Authorization: "Bearer admin-secret" } })).json();
    expect(detailed).toMatchObject({ status: "ok", model: "gpt-5.4-mini", offers: { outcomes: {} } });
    expect(JSON.stringify(await (await fetch(`${base}/api/health`)).json())).not.toContain("gpt-5.4-mini");
  });

  it("requires an app token for a paid route and rates the real client IP, not a spoofed first hop", async () => {
    const { session, offer } = await start();
    expect((await offer(undefined, "1.1.1.1, 203.0.113.9")).status).toBe(401);
    const { token } = await session("203.0.113.9");
    expect(verifyAppToken("app-secret", token, Date.now())?.installId).toBe("abcdefghijklmnop");
    expect((await offer(token, "1.1.1.1, 203.0.113.9")).status).toBe(200);
    expect((await offer(token, "8.8.8.8, 203.0.113.9")).status).toBe(429);
    const other = await session("198.51.100.10", "zzzzzzzzzzzzzzzz");
    expect((await offer(other.token, "203.0.113.9, 198.51.100.10")).status).toBe(200);
  });
});
