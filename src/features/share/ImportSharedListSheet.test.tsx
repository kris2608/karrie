/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportSharedListSheet } from "./ImportSharedListSheet";

vi.mock("../../components/ItemArt", () => ({
  ItemArt: () => <span data-testid="item-art" />,
}));

afterEach(() => {
  cleanup();
});

describe("ImportSharedListSheet headings", () => {
  it("shows Brand · Amount subtitle for branded shared products", () => {
    render(
      <ImportSharedListSheet
        list={{
          version: 1,
          name: "Gedeeld",
          items: [
            {
              name: "Calvé Pindakaas",
              quantity: 2,
              category: "pantry",
              productId: "pindakaas",
              brand: "Calvé",
              packageSize: "350 g",
            },
            { name: "Banaan", quantity: 1, category: "produce", productId: "banaan" },
          ],
        }}
        adventure={null}
        onClose={() => undefined}
        onImport={() => undefined}
      />,
    );

    const sheet = screen.getByTestId("import-shared-list");
    expect(sheet.textContent).toContain("Pindakaas");
    expect(sheet.textContent).toContain("Calvé · 350 g · ×2");
    expect(sheet.textContent).toContain("Banaan");
    expect(sheet.textContent).not.toMatch(/Calvé Pindakaas/);
  });
});
