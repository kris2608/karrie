/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdventureItem } from "../../domain/types";
import { PictureBlock } from "./PictureBlock";

vi.mock("../../state/AdventureContext", () => ({
  useAdventure: () => ({
    dispatch: vi.fn(),
    adventure: null,
    settings: { referenceImages: true },
  }),
}));

vi.mock("../../components/ItemArt", () => ({
  useArt: () => ({ pick: { source: "prijsprofeet" }, name: null }),
  useNamePhoto: () => null,
  markBroken: vi.fn(),
}));

vi.mock("../../storage/storeImages", () => ({
  useStoreImage: () => ({ imageUrl: "https://example.com/store.jpg", retailer: "albert_heijn" }),
}));

vi.mock("../../storage/nameImages", () => ({
  nameImages: { request: vi.fn() },
  privateLabelImages: { request: vi.fn() },
  useNameAnswer: () => null,
  usePrivateLabelAnswer: () => null,
}));

vi.mock("../../storage/references", () => ({
  references: { request: vi.fn(), choose: vi.fn() },
  shownImage: () => null,
  useReference: () => null,
  useSearching: () => false,
}));

afterEach(() => cleanup());

describe("PictureBlock", () => {
  it("hides Je kind ziet for EAN-matched products", () => {
    const item: AdventureItem = {
      id: "1",
      productId: "chocoladereep",
      name: "Côte d'Or",
      icon: "chocoladereep",
      category: "pantry",
      quantity: 1,
      status: "pending",
      ean: "7622201135010",
      brand: "Côte d'Or",
      source: "off",
      imageUrl: "https://images.openfoodfacts.org/x.jpg",
      imageSource: "off",
      imageKind: "photo",
    };
    const { container } = render(<PictureBlock item={item} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("picture-block")).toBeNull();
  });

  it("still shows for branded non-EAN items when a reference path is available", () => {
    const item: AdventureItem = {
      id: "2",
      productId: "hagelslag",
      name: "Hagelslag",
      icon: "hagelslag",
      category: "breakfast",
      quantity: 1,
      status: "pending",
      brand: "De Ruijter",
      source: "barcode",
    };
    render(<PictureBlock item={item} />);
    expect(screen.getByTestId("picture-block")).toBeTruthy();
    expect(screen.getByText("Je kind ziet")).toBeTruthy();
  });
});
