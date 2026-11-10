/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { emptyPersisted } from "../storage/db";

function persisted(patch: Partial<ReturnType<typeof emptyPersisted>> = {}) {
  return { ...emptyPersisted(), ...patch };
}

const loadPersisted = vi.fn();
const savePersisted = vi.fn();
const resetDatabaseConnection = vi.fn();
const mayPersist = vi.fn((status: string) => status === "ready" || status === "save_failed");

vi.mock("../storage/db", async () => {
  const actual = await vi.importActual<typeof import("../storage/db")>("../storage/db");
  return {
    ...actual,
    loadPersisted: (...args: unknown[]) => loadPersisted(...args),
    savePersisted: (...args: unknown[]) => savePersisted(...args),
    resetDatabaseConnection: (...args: unknown[]) => resetDatabaseConnection(...args),
    mayPersist: (status: "loading" | "ready" | "failed" | "save_failed") => mayPersist(status),
  };
});

vi.mock("../storage/photos", () => ({
  preparePhotos: () => Promise.resolve(),
}));

vi.mock("../storage/offers", () => ({
  offers: { hydrate: () => Promise.resolve(), sync: () => undefined },
  offerQueries: () => [],
}));

vi.mock("../storage/references", () => ({
  references: { hydrate: () => Promise.resolve(), photoIds: () => [], setEnabled: () => undefined, request: () => undefined },
}));

vi.mock("../storage/nameImages", () => ({
  nameImages: { hydrate: () => Promise.resolve(), status: () => "pending" },
  privateLabelImages: { hydrate: () => Promise.resolve() },
  useNameImagesVersion: () => 0,
}));

vi.mock("../storage/storeImages", () => ({
  storeImages: { hydrate: () => Promise.resolve(), request: () => undefined, status: () => "pending" },
  setStoreImageRetailer: () => undefined,
  useStoreImagesVersion: () => 0,
}));

vi.mock("../services/catalog/sync", () => ({
  catalogSync: { hydrate: () => Promise.resolve(), sync: () => Promise.resolve() },
}));

vi.mock("../services/analyticsMilestones", () => ({
  bootstrapAnalytics: () => Promise.resolve(),
}));

vi.mock("../services/analytics", () => ({
  trackEvent: () => true,
}));

vi.mock("./customEnrichment", () => ({
  useCustomEnrichment: () => undefined,
}));

vi.mock("./sharedPackHydrate", () => ({
  useSharedPackHydrate: () => undefined,
}));

vi.mock("../feedback/sound", () => ({
  setSoundEnabled: () => undefined,
}));

describe("AdventureProvider persist gate", () => {
  beforeEach(() => {
    loadPersisted.mockReset();
    savePersisted.mockReset();
    resetDatabaseConnection.mockReset();
    mayPersist.mockImplementation((status: string) => status === "ready" || status === "save_failed");
    savePersisted.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not save empty state after a failed load", async () => {
    loadPersisted.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { AdventureProvider } = await import("./AdventureContext");
    render(
      <AdventureProvider>
        <div data-testid="app-child">app</div>
      </AdventureProvider>,
    );
    expect(await screen.findByTestId("storage-load-error")).toBeTruthy();
    expect(screen.queryByTestId("app-child")).toBeNull();
    await waitFor(() => expect(mayPersist).toHaveBeenCalled());
    expect(savePersisted).not.toHaveBeenCalled();
  });

  it("hydrates and saves after a successful load", async () => {
    loadPersisted.mockResolvedValue({
      ok: true,
      data: persisted({
        adventure: {
          id: "adv",
          name: "Test",
          phase: "draft",
          items: [],
          history: [],
          categoryOrder: [],
          createdAt: 1,
          updatedAt: 1,
          retailer: "albert_heijn",
        },
        saved: [{ id: "s1", name: "Week", items: [], favorite: true, updatedAt: 1 }],
        stickers: ["a"],
      }),
    });
    const { AdventureProvider } = await import("./AdventureContext");
    render(
      <AdventureProvider>
        <div data-testid="app-child">app</div>
      </AdventureProvider>,
    );
    expect(await screen.findByTestId("app-child")).toBeTruthy();
    await waitFor(() => expect(savePersisted).toHaveBeenCalled());
    const saved = savePersisted.mock.calls.at(-1)?.[0];
    expect(saved.adventure?.id).toBe("adv");
    expect(saved.saved).toHaveLength(1);
  });

  it("retries load without writing empty data first", async () => {
    loadPersisted
      .mockResolvedValueOnce({ ok: false, reason: "read_failed" })
      .mockResolvedValueOnce({
        ok: true,
        data: persisted({
          saved: [{ id: "kept", name: "Kept", items: [], favorite: true, updatedAt: 1 }],
        }),
      });
    const { AdventureProvider } = await import("./AdventureContext");
    render(
      <AdventureProvider>
        <div data-testid="app-child">app</div>
      </AdventureProvider>,
    );
    expect(await screen.findByTestId("storage-load-error")).toBeTruthy();
    expect(savePersisted).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByTestId("storage-retry")[0]);
    expect(resetDatabaseConnection).toHaveBeenCalled();
    expect(await screen.findByTestId("app-child")).toBeTruthy();
    await waitFor(() => expect(savePersisted).toHaveBeenCalled());
    expect(savePersisted.mock.calls.at(-1)?.[0].saved[0].id).toBe("kept");
  });

  it("marks save_failed without clearing in-memory data", async () => {
    loadPersisted.mockResolvedValue({
      ok: true,
      data: persisted({
        saved: [{ id: "s1", name: "Week", items: [], favorite: true, updatedAt: 1 }],
      }),
    });
    savePersisted.mockRejectedValue(new Error("quota"));
    const { AdventureProvider } = await import("./AdventureContext");
    render(
      <AdventureProvider>
        <div data-testid="app-child">app</div>
      </AdventureProvider>,
    );
    expect(await screen.findByTestId("app-child")).toBeTruthy();
    expect(await screen.findByTestId("storage-save-warning")).toBeTruthy();
  });
});
