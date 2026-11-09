/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Adventure } from "../../domain/types";
import { SharedListBoot } from "./SharedListBoot";

const fetchList = vi.fn();
const dispatch = vi.fn();

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
    adventure: {
      id: "empty",
      name: "Boodschappenlijst",
      phase: "draft",
      items: [],
      categoryOrder: [],
      history: [],
      createdAt: 1,
      updatedAt: 1,
    } satisfies Adventure,
    dispatch,
    hydrated: true,
  }),
}));

afterEach(() => {
  cleanup();
  fetchList.mockReset();
  dispatch.mockReset();
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
    expect(screen.getByTestId("import-confirm").textContent).toMatch(/Gebruik dit lijstje/);
    fireEvent.click(screen.getByTestId("import-confirm"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "import-shared-list", mode: "open" }),
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
  });
});
