/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdventureItem } from "../../domain/types";
import { AlternativePreviewSheet } from "./AlternativePreviewSheet";
import { ItemSheet } from "./ItemSheet";

const dispatch = vi.fn();

vi.mock("../../state/AdventureContext", () => ({
  useAdventure: () => ({
    dispatch,
    adventure: null,
    settings: { referenceImages: true, smartDiscovery: true },
    declined: [],
  }),
}));

vi.mock("../../components/ItemArt", () => ({
  ItemArt: () => <span data-testid="item-art" />,
  useArt: () => ({ pick: null }),
  hasPhoto: (item: { photoId?: string }) => Boolean(item.photoId),
}));

vi.mock("../add/useOffNutrition", () => ({
  useOffNutrition: () => undefined,
}));

vi.mock("./PictureBlock", () => ({
  PictureBlock: ({ item }: { item: AdventureItem }) => (item.ean ? null : <section data-testid="picture-block" />),
}));

vi.mock("./ProductInfo", () => ({
  ProductInfo: () => null,
}));

vi.mock("../../storage/nameImages", () => ({
  privateLabelImages: { request: vi.fn() },
  usePrivateLabelAnswer: () => null,
}));

afterEach(() => {
  cleanup();
  dispatch.mockReset();
});

const photo = {
  source: "prijsprofeet" as const,
  imageUrl: "https://www.jumbo.com/dam-images/fit-in/360x360/Products/jumbo_hagelslag.png",
  productName: "Jumbo Hagelslag Puur",
  brand: "Jumbo",
  retailer: "jumbo",
  packaging: "400 g",
};

/** Keep a typed AdventureItem shape available for future ItemSheet mounts without pulling the full provider graph. */
export const sampleItem: AdventureItem = {
  id: "1",
  productId: "hagelslag",
  name: "AH Hagelslag Melk",
  icon: "sprinkles",
  category: "breakfast",
  quantity: 1,
  status: "pending",
  brand: "AH",
  privateLabelRetailer: "albert_heijn",
};

const eanItem: AdventureItem = {
  id: "ean-1",
  productId: "chocoladereep",
  name: "Côte d'Or BonBonBloc",
  icon: "chocoladereep",
  category: "pantry",
  quantity: 1,
  status: "pending",
  ean: "7622201135010",
  brand: "Côte d'Or",
  packageSize: "200 g",
  source: "off",
  offAttribution: true,
};

describe("AlternativePreviewSheet", () => {
  it("does not confirm when previewing, closing or choosing Behouden", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <AlternativePreviewSheet open photo={photo} retailer="jumbo" onClose={onClose} onConfirm={onConfirm} />,
    );
    expect(screen.getByTestId("alternative-preview")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("alternative-keep"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<AlternativePreviewSheet open={false} photo={photo} retailer="jumbo" onClose={onClose} onConfirm={onConfirm} />);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms only via Gebruik dit product with the structured brand", () => {
    const onConfirm = vi.fn();
    render(<AlternativePreviewSheet open photo={photo} retailer="jumbo" onClose={() => undefined} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("alternative-use"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ brand: "Jumbo", productName: "Jumbo Hagelslag Puur" });
  });
});

describe("ItemSheet EAN simplification", () => {
  it("hides picture toggles and photo actions for EAN items, keeps naam/afdeling", () => {
    render(
      <ItemSheet item={eanItem} onClose={() => undefined} onRestore={() => undefined} onPhoto={() => undefined} onRemove={() => undefined} />,
    );
    expect(screen.queryByTestId("picture-block")).toBeNull();
    expect(screen.queryByTestId("photo-pack")).toBeNull();
    expect(screen.queryByTestId("restore-generic")).toBeNull();
    expect(screen.getByTestId("item-edit-open").textContent).toBe("Naam of afdeling aanpassen");
    fireEvent.click(screen.getByTestId("item-edit-open"));
    expect(screen.getByTestId("item-edit")).toBeTruthy();
    expect(screen.getByTestId("item-name")).toBeTruthy();
    expect(screen.getByText("Afdeling")).toBeTruthy();
    expect(screen.queryByText("Kies een tekening")).toBeNull();
    expect(screen.getByTestId("remove-item")).toBeTruthy();
  });

  it("keeps picture block and drawing edit for non-EAN items", () => {
    render(
      <ItemSheet item={sampleItem} onClose={() => undefined} onRestore={() => undefined} onPhoto={() => undefined} onRemove={() => undefined} />,
    );
    expect(screen.getByTestId("picture-block")).toBeTruthy();
    expect(screen.getByTestId("photo-pack")).toBeTruthy();
    expect(screen.getByTestId("item-edit-open").textContent).toBe("Naam, afdeling of tekening aanpassen");
    fireEvent.click(screen.getByTestId("item-edit-open"));
    expect(screen.getByText("Kies een tekening")).toBeTruthy();
  });
});
