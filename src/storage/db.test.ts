import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const put = vi.fn();
const openDB = vi.fn();

vi.mock("idb", () => ({
  openDB: (...args: unknown[]) => openDB(...args),
}));

describe("loadPersisted", () => {
  beforeEach(async () => {
    get.mockReset();
    put.mockReset();
    openDB.mockReset();
    vi.resetModules();
    const db = await import("./db");
    db.resetDatabaseConnection();
  });

  it("returns ok empty data for a genuine fresh installation", async () => {
    openDB.mockResolvedValue({
      get: get.mockResolvedValue(undefined),
      put,
      transaction: vi.fn(),
      objectStoreNames: { contains: () => true },
    });
    const { loadPersisted } = await import("./db");
    const result = await loadPersisted();
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        adventure: null,
        saved: [],
        stickers: [],
        mine: [],
      }),
    });
  });

  it("returns existing adventure and saved lists on success", async () => {
    get.mockImplementation((_store: string, key: string) => {
      if (key === "adventure") return Promise.resolve({ id: "a1", phase: "draft", items: [], createdAt: 1, updatedAt: 1 });
      if (key === "saved") return Promise.resolve([{ id: "s1", name: "Week", items: [], updatedAt: 1 }]);
      if (key === "stickers") return Promise.resolve(["star"]);
      return Promise.resolve(undefined);
    });
    openDB.mockResolvedValue({ get, put, transaction: vi.fn(), objectStoreNames: { contains: () => true } });
    const { loadPersisted } = await import("./db");
    const result = await loadPersisted();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.adventure?.id).toBe("a1");
    expect(result.data.saved).toHaveLength(1);
    expect(result.data.stickers).toEqual(["star"]);
  });

  it("returns unavailable when IndexedDB cannot open", async () => {
    openDB.mockRejectedValue(new Error("blocked"));
    const { loadPersisted } = await import("./db");
    await expect(loadPersisted()).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns read_failed when a key read throws", async () => {
    get.mockRejectedValue(new Error("read failed"));
    openDB.mockResolvedValue({ get, put, transaction: vi.fn(), objectStoreNames: { contains: () => true } });
    const { loadPersisted } = await import("./db");
    await expect(loadPersisted()).resolves.toEqual({ ok: false, reason: "read_failed" });
  });

  it("mayPersist only allows saves after a successful load", async () => {
    const { mayPersist } = await import("./db");
    expect(mayPersist("loading")).toBe(false);
    expect(mayPersist("failed")).toBe(false);
    expect(mayPersist("ready")).toBe(true);
    expect(mayPersist("save_failed")).toBe(true);
  });

  it("does not write empty data when load failed (save gate)", async () => {
    openDB.mockRejectedValue(new Error("blocked"));
    const { loadPersisted, mayPersist, savePersisted } = await import("./db");
    const result = await loadPersisted();
    expect(result.ok).toBe(false);
    expect(mayPersist("failed")).toBe(false);
    // savePersisted must not be called by callers when mayPersist is false; assert the gate itself.
    expect(put).not.toHaveBeenCalled();
    expect(typeof savePersisted).toBe("function");
  });
});
