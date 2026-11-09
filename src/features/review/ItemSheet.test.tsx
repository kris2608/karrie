/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdventureItem } from "../../domain/types";
import { AlternativePreviewSheet } from "./AlternativePreviewSheet";

afterEach(() => cleanup());

const photo = {
  source: "prijsprofeet" as const,
  imageUrl: "https://www.jumbo.com/dam-images/fit-in/360x360/Products/jumbo_hagelslag.png",
  productName: "Jumbo Hagelslag Puur",
  brand: "Jumbo",
  retailer: "jumbo",
  packaging: "400 g",
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
