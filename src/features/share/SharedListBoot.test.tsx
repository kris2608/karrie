/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Adventure } from "../../domain/types";
import { SharedListBoot } from "./SharedListBoot";

const fetchList = vi.fn();
const dispatch = vi.fn();

const emptyAdventure: Adventure = {
  id: "empty",
  name: "Boodschappenlijst",
  phase: "draft",
  items: [],
  categoryOrder: [],
  history: [],
  createdAt: 1,
  updatedAt: 1,
};

const unfinishedAdventure: Adventure = {
  ...emptyAdventure,
  id: "open",
  items: [
    {
      id: "i1",
      productId: "banaan",
      name: "Banaan",
      icon: "banaan",
      category: "produce",
      quantity: 1,
      status: "pending",
    },
  ],
};

let adventure: Adventure = emptyAdventure;

vi.mock("../../services/shareList/client", () => ({
  shareListClient: {
    create: vi.fn(),
    fetch: (...args: unknown[]) => fetchList(...args),
  },
}));

vi.mock("../../services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../state/AdventureContext", () => ({
  useAdventure: () => ({
    get adventure() {
      return adventure;
    },
    dispatch,
    hydrated: true,
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div
      data-testid="location-probe"
      data-pathname={location.pathname}
      data-notice={(location.state as { notice?: string } | null)?.notice ?? ""}
    />
  );
}

afterEach(() => {
  cleanup();
  fetchList.mockReset();
  dispatch.mockReset();
  adventure = emptyAdventure;
});

describe("SharedListBoot", () => {
  it("loads /l/:id and imports an independent local copy", async () => {
    fetchList.mockResolvedValue({
      status: "ok",
      list: {
        version: 1,
        name: "Gedeeld",
        items: [{ name: "Melk", quantity: 1, category: "dairy", productId: "melk" }],
      },
    });
    render(
      <MemoryRouter initialEntries={["/l/abcdefghijklmnop"]}>
        <SharedListBoot />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("import-shared-list")).toBeTruthy());
    expect(screen.getByTestId("import-create").textContent).toMatch(/Nieuw lijstje/);
    fireEvent.click(screen.getByTestId("import-create"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "import-shared-list", mode: "create" }),
    );
  });

  it("shows expired copy for 410 responses", async () => {
    fetchList.mockResolvedValue({ status: "error", code: "expired" });
    render(
      <MemoryRouter initialEntries={["/l/abcdefghijklmnop"]}>
        <SharedListBoot />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("import-shared-error")).toBeTruthy());
    expect(screen.getByText(/Dit boodschappenlijstje is verlopen/)).toBeTruthy();
    expect(screen.getByText(/opnieuw te delen/)).toBeTruthy();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps product counts and quantities from the shared snapshot", async () => {
    fetchList.mockResolvedValue({
      status: "ok",
      list: {
        version: 1,
        name: "Gedeeld",
        items: [
          { name: "Melk", quantity: 3, category: "dairy", productId: "melk" },
          { name: "Brood", quantity: 2, category: "bakery", productId: "brood" },
        ],
      },
    });
    render(
      <MemoryRouter initialEntries={["/l/abcdefghijklmnop"]}>
        <SharedListBoot />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("import-shared-list")).toBeTruthy());
    expect(screen.getByTestId("import-shared-list").textContent).toMatch(/2 producten/);
    fireEvent.click(screen.getByTestId("import-create"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "import-shared-list",
        mode: "create",
        list: expect.objectContaining({
          items: [
            expect.objectContaining({ name: "Melk", quantity: 3 }),
            expect.objectContaining({ name: "Brood", quantity: 2 }),
          ],
        }),
      }),
    );
  });

  it("merges into the current list when the parent chooses add", async () => {
    adventure = unfinishedAdventure;
    fetchList.mockResolvedValue({
      status: "ok",
      list: {
        version: 1,
        items: [{ name: "Melk", quantity: 1, category: "dairy", productId: "melk" }],
      },
    });
    render(
      <MemoryRouter initialEntries={["/l/abcdefghijklmnop"]}>
        <Routes>
          <Route path="/l/:id" element={<SharedListBoot />} />
          <Route path="/controleren" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("import-shared-list")).toBeTruthy());
    fireEvent.click(screen.getByTestId("import-merge"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "import-shared-list", mode: "merge" }),
    );
    await waitFor(() => expect(screen.getByTestId("location-probe").getAttribute("data-pathname")).toBe("/controleren"));
  });
});
