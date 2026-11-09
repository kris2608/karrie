import { describe, expect, it, vi } from "vitest";
import { createShareListClient } from "./client";
import type { SharedListV1 } from "../../domain/shareList";

const list: SharedListV1 = {
  version: 1,
  name: "Week",
  items: [{ name: "Melk", quantity: 1, category: "dairy", productId: "melk" }],
};

describe("shareListClient", () => {
  it("creates a short link from the API", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        id: "abcdefghijklmnop",
        url: "https://www.karrie.eu/l/abcdefghijklmnop",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    });
    const client = createShareListClient({ origin: "https://api.example", fetch: fetchFn as typeof fetch });
    await expect(client.create(list)).resolves.toEqual({
      status: "ok",
      id: "abcdefghijklmnop",
      url: "https://www.karrie.eu/l/abcdefghijklmnop",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.example/api/lists/share",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("maps rate-limit, empty and network failures", async () => {
    const rate = createShareListClient({
      origin: "https://api.example",
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }) as typeof fetch,
    });
    await expect(rate.create(list)).resolves.toEqual({ status: "error", code: "rate-limited" });

    const empty = createShareListClient({
      origin: "https://api.example",
      fetch: vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ status: "error", code: "empty" }),
      }) as typeof fetch,
    });
    await expect(empty.create(list)).resolves.toEqual({ status: "error", code: "empty" });

    vi.useFakeTimers();
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    const network = createShareListClient({ origin: "https://api.example", fetch: fetchFn as typeof fetch });
    const pending = network.create(list);
    await vi.advanceTimersByTimeAsync(1300);
    await expect(pending).resolves.toEqual({ status: "error", code: "network" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("fetches a list and maps expired / missing", async () => {
    const ok = createShareListClient({
      origin: "https://api.example",
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", list }),
      }) as typeof fetch,
    });
    await expect(ok.fetch("abcdefghijklmnop")).resolves.toEqual({ status: "ok", list });

    const expired = createShareListClient({
      origin: "https://api.example",
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) }) as typeof fetch,
    });
    await expect(expired.fetch("abcdefghijklmnop")).resolves.toEqual({ status: "error", code: "expired" });

    const missing = createShareListClient({
      origin: "https://api.example",
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as typeof fetch,
    });
    await expect(missing.fetch("abcdefghijklmnop")).resolves.toEqual({ status: "error", code: "not-found" });
  });
});
