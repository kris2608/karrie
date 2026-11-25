import { describe, expect, it } from "vitest";
import { MARKETING_NAV_FALLBACK_DENYLIST, MARKETING_RENDER_REWRITES } from "./routing";

describe("marketing routing", () => {
  it("denies SPA navigation fallback for public pages", () => {
    const paths = [
      "/ontdek",
      "/ontdek.html",
      "/over",
      "/boodschappen-met-kinderen",
      "/boodschappenlijstje-met-plaatjes",
      "/privacy.html",
      "/robots.txt",
      "/sitemap.xml",
      "/api/health",
    ];
    for (const path of paths) {
      expect(
        MARKETING_NAV_FALLBACK_DENYLIST.some((pattern) => pattern.test(path)),
        path,
      ).toBe(true);
    }
    expect(MARKETING_NAV_FALLBACK_DENYLIST.some((pattern) => pattern.test("/"))).toBe(false);
    expect(MARKETING_NAV_FALLBACK_DENYLIST.some((pattern) => pattern.test("/toevoegen"))).toBe(false);
  });

  it("lists Render rewrites for clean marketing URLs", () => {
    expect(MARKETING_RENDER_REWRITES.map((row) => row.source)).toEqual([
      "/ontdek",
      "/over",
      "/boodschappen-met-kinderen",
      "/boodschappenlijstje-met-plaatjes",
    ]);
  });
});
