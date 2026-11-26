import { describe, expect, it, vi } from "vitest";
import { createApiFetch, installId } from "./apiSession";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("api session", () => {
  it("reuses an install id and sends the bearer token without a login", async () => {
    const storage = memory();
    expect(installId(storage)).toMatch(/^[a-z0-9]{32}$/);
    expect(installId(storage)).toBe(installId(storage));
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/session")) {
        return new Response(JSON.stringify({ status: "ok", token: "tok", expiresAt: "2099-01-01T00:00:00.000Z", installId: installId(storage) }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    });
    const apiFetch = createApiFetch({ fetch: fetchFn as typeof fetch, origin: "https://api.example", storage, now: () => 0 });
    await apiFetch("https://api.example/api/offers/match", { method: "POST", body: "{}" });
    const init = fetchFn.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("asks for a fresh token once when the server says the session is missing", async () => {
    const storage = memory();
    installId(storage);
    let offers = 0;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/session")) {
        return new Response(JSON.stringify({ status: "ok", token: "next", expiresAt: "2099-01-01T00:00:00.000Z" }), { status: 200 });
      }
      offers += 1;
      if (offers === 1) return new Response(JSON.stringify({ status: "error", code: "session" }), { status: 401 });
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    });
    const apiFetch = createApiFetch({ fetch: fetchFn as typeof fetch, origin: "https://api.example", storage, now: () => 0 });
    const response = await apiFetch("https://api.example/api/offers/match", { method: "POST" });
    expect(response.status).toBe(200);
    expect(offers).toBe(2);
  });
});
