/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { Adventure } from "../../domain/types";
import { ShopScreen } from "./ShopScreen";

const adventure: Adventure = {
  id: "adv",
  name: "Test",
  phase: "shopping",
  createdAt: 1,
  updatedAt: 1,
  categoryOrder: ["produce"],
  history: [],
  items: [
    {
      id: "item-1",
      productId: "banaan",
      name: "Banaan",
      icon: "banaan",
      category: "produce",
      quantity: 1,
      status: "pending",
    },
  ],
};

vi.mock("../../state/AdventureContext", () => ({
  useAdventure: () => ({
    dispatch: vi.fn(),
    adventure,
    settings: { soundEnabled: false, voiceEnabled: false, voiceOptInSeen: true, smartDiscovery: false, referenceImages: false },
  }),
}));

vi.mock("../../storage/offers", () => ({
  useOfferViews: () => ({ views: new Map(), deals: 0 }),
}));

vi.mock("./useShopVoice", () => ({
  useShopVoice: () => ({
    replay: vi.fn(),
    onFoundSuccess: vi.fn(),
    onGuessCorrect: vi.fn(),
    onGuessWrong: vi.fn(),
    prepareOptIn: vi.fn(),
  }),
}));

vi.mock("../../hooks/useScreenWakeLock", () => ({
  useScreenWakeLock: () => undefined,
}));

vi.mock("../../services/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("../../services/analyticsMilestones", () => ({
  ensureAdventureStarted: () => true,
}));

vi.mock("../../feedback/sound", () => ({
  unlockAudio: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

afterEach(() => cleanup());

describe("ShopScreen leave", () => {
  it("asks before leaving and keeps the child in the shop until Naar huis", async () => {
    render(
      <MemoryRouter initialEntries={["/winkel"]}>
        <Routes>
          <Route path="/winkel" element={<ShopScreen />} />
          <Route path="/" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("bekijk-lijstje"));
    expect(screen.getByLabelText("Lijst aanpassen")).toBeTruthy();
    fireEvent.click(screen.getByTestId("stop-adventure"));
    expect(screen.getByTestId("leave-shop").textContent).toContain("Stoppen met speuren?");
    fireEvent.click(screen.getByTestId("leave-stay"));
    await waitFor(() => expect(screen.queryByTestId("leave-shop")).toBeNull());
    expect(screen.queryByTestId("where")).toBeNull();
    fireEvent.click(screen.getByTestId("stop-adventure"));
    fireEvent.click(screen.getByTestId("leave-home"));
    expect(screen.getByTestId("where").textContent).toBe("/");
  });
});
