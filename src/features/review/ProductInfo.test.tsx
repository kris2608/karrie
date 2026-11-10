/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdventureItem } from "../../domain/types";
import { ProductInfo } from "./ProductInfo";

vi.mock("../../storage/references", () => ({
  useFacts: () => undefined,
}));

const item = {
  id: "1",
  productId: "pindakaas",
  name: "Knoflooksaus",
  icon: "pindakaas",
  category: "pantry",
  quantity: 1,
  status: "pending",
  brand: "Calvé",
  packageSize: "250 ml",
  ingredients: "plantaardige oliën, knoflook",
  nutrition: { nutriscore: "c", energyKcal100g: 252, sugars100g: 9.4 },
  barcode: {
    status: "off-exact",
    sourceName: "Open Food Facts",
    sourceUrl: "https://world.openfoodfacts.org/product/8720182255563",
    at: 1,
  },
} as AdventureItem;

describe("ProductInfo", () => {
  it("shows OFF pack nutrition and ingredients when page facts are missing", () => {
    render(<ProductInfo item={item} />);
    expect(screen.getByTestId("product-info")).toBeTruthy();
    expect(screen.getByText("Energie")).toBeTruthy();
    expect(screen.getByText(/252/)).toBeTruthy();
    expect(screen.getByText("Ingrediënten")).toBeTruthy();
    expect(screen.getByText("Van Open Food Facts.")).toBeTruthy();
  });
});
