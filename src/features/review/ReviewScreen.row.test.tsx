/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Adventure } from "../../domain/types";
import { ReviewScreen } from "./ReviewScreen";

const dispatch = vi.fn();

const adventure: Adventure = {
  id: "adv",
  name: "Test",
  phase: "draft",
  createdAt: 1,
  updatedAt: 1,
  categoryOrder: ["drinks"],
  history: [],
  retailer: "albert_heijn",
  items: [
    {
      id: "item-1",
      productId: "siroop",
      name: "Karvan Cévitam Zero",
      icon: "siroop",
      category: "drinks",
      quantity: 1,
      status: "pending",
      brand: "Karvan Cévitam",
      packageSize: "0,6 l",
      ean: "8710395948659",
    },
  ],
};

vi.mock("../../state/AdventureContext", () => ({
  useAdventure: () => ({
    dispatch,
    adventure,
    saved: [],
    settings: { smartDiscovery: false, referenceImages: false },
    declined: [],
  }),
}));

vi.mock("../../components/ItemArt", () => ({
  ItemArt: () => <span data-testid="row-art" />,
  useArt: () => ({ pick: null }),
  hasPhoto: () => false,
}));

vi.mock("../../storage/offers", () => ({
  offerQueries: () => [],
  offers: { sync: vi.fn() },
  useOfferViews: () => ({
    views: new Map([
      [
        "item-1",
        {
          shown: "deal",
          answer: {
            offer: {
              matchType: "exact",
              productName: "Karvan",
              retailer: "albert_heijn",
              promotionalPrice: 1,
              originalPrice: 2,
              sourceUrl: "https://example.com",
            },
          },
        },
      ],
    ]),
    deals: 1,
  }),
}));

vi.mock("./useHealthierPreflight", () => ({
  useHealthierPreflight: () => undefined,
}));

vi.mock("../offers/OfferTag", () => ({
  OfferTag: () => <span>Aanbieding</span>,
  offerLabel: () => "Aanbieding",
  TagIcon: () => null,
  Attribution: () => null,
}));

vi.mock("../offers/OfferSheet", () => ({
  OfferSheet: () => null,
}));

vi.mock("../offers/RetailerPicker", () => ({
  RetailerPicker: () => null,
}));

vi.mock("../photo/PhotoFlow", () => ({
  PhotoFlow: () => null,
}));

vi.mock("../share/ShareListSheet", () => ({
  ShareListSheet: () => null,
}));

vi.mock("./SaveListSheet", () => ({
  SaveListSheet: () => null,
}));

vi.mock("./ItemSheet", () => ({
  ItemSheet: ({ item }: { item: { id?: string } | null }) => (item ? <div data-testid="item-sheet">{item.id}</div> : null),
}));

afterEach(() => {
  cleanup();
  dispatch.mockReset();
});

describe("ReviewScreen item row", () => {
  it("opens detail from image and title; offer banner stays separate", () => {
    render(
      <MemoryRouter>
        <ReviewScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("item-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("edit-item"));
    expect(screen.getByTestId("item-sheet").textContent).toBe("item-1");
    cleanup();
    render(
      <MemoryRouter>
        <ReviewScreen />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("edit-item-text"));
    expect(screen.getByTestId("item-sheet").textContent).toBe("item-1");
    fireEvent.click(screen.getByTestId("offer-button"));
    expect(screen.getByTestId("item-sheet").textContent).toBe("item-1");
  });

  it("does not show category reorder controls", () => {
    render(
      <MemoryRouter>
        <ReviewScreen />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText("Categorie omhoog")).toBeNull();
    expect(screen.queryByLabelText("Categorie omlaag")).toBeNull();
  });
});
