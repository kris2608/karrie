/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Adventure } from "../../domain/types";
import { ShareListSheet } from "./ShareListSheet";

const create = vi.fn();

vi.mock("../../services/shareList/client", () => ({
  shareListClient: {
    create: (...args: unknown[]) => create(...args),
    fetch: vi.fn(),
  },
}));

vi.mock("../../services/analytics", () => ({
  trackEvent: vi.fn(),
}));

afterEach(() => {
  cleanup();
  create.mockReset();
});

const adventure: Adventure = {
  id: "a1",
  name: "Week",
  phase: "draft",
  retailer: "albert_heijn",
  items: [
    {
      id: "i1",
      productId: "melk",
      name: "Melk",
      icon: "milk",
      category: "dairy",
      quantity: 1,
      status: "pending",
    },
  ],
  categoryOrder: ["dairy"],
  history: [],
  createdAt: 1,
  updatedAt: 1,
};

describe("ShareListSheet", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("shows WhatsApp and copy actions for a short link (no QR)", async () => {
    create.mockResolvedValue({
      status: "ok",
      id: "abcdefghijklmnop",
      url: "https://www.karrie.eu/l/abcdefghijklmnop",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    render(<ShareListSheet open source={adventure} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-list-whatsapp")).toBeTruthy());
    expect(screen.getByTestId("share-list-copy")).toBeTruthy();
    expect(screen.queryByTestId("share-list-qr")).toBeNull();
    expect(document.querySelector(".share-qr")).toBeNull();

    fireEvent.click(screen.getByTestId("share-list-whatsapp"));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(screen.getByTestId("share-list-copy"));
    await waitFor(() => expect(screen.getByText("Link gekopieerd!")).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://www.karrie.eu/l/abcdefghijklmnop");
  });

  it("shows an error when the API refuses", async () => {
    create.mockResolvedValue({ status: "error", code: "unavailable" });
    render(<ShareListSheet open source={adventure} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("share-list-error")).toBeTruthy());
    expect(screen.getByTestId("share-list-error").textContent).toMatch(/lukt nu niet/i);
  });
});
