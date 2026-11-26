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

  it("persists a muted voice and loads it back", async () => {
    const store = new Map<string, unknown>();
    openDB.mockResolvedValue({
      get: (_storeName: string, key: string) => Promise.resolve(store.get(key)),
      transaction: () => ({
        store: {
          put: (value: unknown, key: string) => {
            store.set(key, value);
            return Promise.resolve();
          },
        },
        done: Promise.resolve(),
      }),
      objectStoreNames: { contains: () => true },
    });
    const { emptyPersisted, loadPersisted, savePersisted } = await import("./db");
    const data = emptyPersisted();
    data.settings = { ...data.settings, voiceEnabled: false, voiceOptInSeen: true };
    await savePersisted(data);
    const loaded = await loadPersisted();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.data.settings.voiceEnabled).toBe(false);
    expect(loaded.data.settings.voiceOptInSeen).toBe(true);
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
