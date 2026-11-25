import { describe, expect, it } from "vitest";
import { PAGE_SEO } from "./seo";
import { absoluteUrl, CANONICAL_ORIGIN, PUBLIC_PATHS } from "./site";
import { TIPS_FAQ } from "./tips";
import { VISUAL_LIST_ITEMS } from "./visualList";

describe("marketing site constants", () => {
  it("uses www canonical host", () => {
    expect(CANONICAL_ORIGIN).toBe("https://www.karrie.eu");
    expect(absoluteUrl(PUBLIC_PATHS.ontdek)).toBe("https://www.karrie.eu/ontdek");
  });

  it("defines SEO for every public marketing path", () => {
    expect(PAGE_SEO.ontdek.path).toBe(PUBLIC_PATHS.ontdek);
    expect(PAGE_SEO.over.path).toBe(PUBLIC_PATHS.over);
    expect(PAGE_SEO.tips.path).toBe(PUBLIC_PATHS.tips);
    expect(PAGE_SEO.visualList.path).toBe(PUBLIC_PATHS.visualList);
    for (const page of Object.values(PAGE_SEO)) {
      expect(page.title.length).toBeGreaterThan(10);
      expect(page.description.length).toBeGreaterThan(40);
    }
  });

  it("keeps FAQ answers factual about accounts and downloads", () => {
    const byQ = Object.fromEntries(TIPS_FAQ.map((item) => [item.q, item.a]));
    expect(byQ["Heb ik een account nodig?"]).toMatch(/Nee/i);
    expect(byQ["Moet ik Karrie downloaden?"]).toMatch(/Nee/i);
    expect(byQ["Werkt Karrie in iedere supermarkt?"]).toMatch(/aanbiedingen/i);
  });

  it("lists familiar products for the visual example", () => {
    expect(VISUAL_LIST_ITEMS.map((item) => item.id)).toEqual(["banaan", "appel", "melk", "brood", "komkommer", "kaas"]);
  });
});
