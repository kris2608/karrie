import { describe, expect, it } from "vitest";
import { sharedListPreviewHtml, sharedListSummary } from "./sharedListPreview.js";

describe("sharedListPreview", () => {
  it("summarises name and product count for Open Graph without the retailer", () => {
    expect(
      sharedListSummary({
        version: 1,
        name: "Weekend",
        retailer: "albert_heijn",
        items: [
          { name: "Melk", quantity: 1, category: "dairy" },
          { name: "Brood", quantity: 1, category: "bakery" },
        ],
      }),
    ).toEqual({ title: "Weekend", description: "Weekend · 2 producten" });
  });

  it("renders escaped Open Graph HTML that opens the SPA list URL", () => {
    const html = sharedListPreviewHtml(
      { version: 1, name: 'A&B "lijst"', retailer: "jumbo", items: [{ name: "Melk", quantity: 1, category: "dairy" }] },
      "abcdefghijklmnop",
      "https://www.karrie.eu",
    );
    expect(html).toContain('property="og:title" content="A&amp;B &quot;lijst&quot; · Karrie"');
    expect(html).toContain("A&amp;B &quot;lijst&quot; · 1 product");
    expect(html).not.toContain("Jumbo");
    expect(html).toContain("https://www.karrie.eu/l/abcdefghijklmnop");
    expect(html).toContain("noindex");
  });
});
