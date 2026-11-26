import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Long enough for a shopping trip, short enough that a leaked token dies quickly. */
export const APP_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

const INSTALL_ID = /^[A-Za-z0-9_-]{16,64}$/;

export type AppToken = { token: string; expiresAt: number; installId: string };

export function newInstallId(): string {
  return randomBytes(16).toString("base64url");
}

export function isInstallId(value: string): boolean {
  return INSTALL_ID.test(value);
}

/** Stable subject key for usage rows. Not reversible to the IP or install id. */
export function hashUsageSubject(secret: string, value: string): string {
  return createHash("sha256").update(`${secret}:${value}`).digest("base64url").slice(0, 24);
}

export function signAppToken(secret: string, installId: string, now: number, ttlMs = APP_TOKEN_TTL_MS): AppToken {
  const expiresAt = now + ttlMs;
  const payload = Buffer.from(JSON.stringify({ v: 1, sub: installId, exp: expiresAt })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresAt, installId };
}

export function verifyAppToken(secret: string, token: string, now: number): { installId: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig || token.slice(dot + 1).includes(".")) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: unknown; sub?: unknown; exp?: unknown };
    if (body.v !== 1 || typeof body.sub !== "string" || !isInstallId(body.sub) || typeof body.exp !== "number") return null;
    if (!Number.isFinite(body.exp) || body.exp < now || body.exp > now + APP_TOKEN_TTL_MS + 60_000) return null;
    return { installId: body.sub };
  } catch {
    return null;
  }
}
