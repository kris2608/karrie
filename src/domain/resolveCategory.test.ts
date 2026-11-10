import { describe, expect, it } from "vitest";
import { categoryFromName, categoryFromTags, resolveCategory } from "./resolveCategory";

describe("resolveCategory", () => {
  it("maps PrijsProfeet drink slugs and OFF beverage tags to drinks", () => {
    expect(resolveCategory({ tags: ["frisdrank"] })).toBe("drinks");
    expect(resolveCategory({ tags: ["en:sodas", "en:carbonated-drinks"] })).toBe("drinks");
    expect(resolveCategory({ tags: ["en:beverages", "en:waters"] })).toBe("drinks");
    expect(categoryFromTags(["en:fruit-juices"])).toBe("drinks");
  });

  it("maps clear Dutch drink names", () => {
    expect(categoryFromName("Cola")).toBe("drinks");
    expect(categoryFromName("Spa rood")).toBe("drinks");
    expect(resolveCategory({ name: "Sinaasappelsap" })).toBe("drinks");
  });

  it("keeps dairy and leaves spreads undecided", () => {
    expect(categoryFromTags(["en:dairy-desserts", "en:custards"])).toBe("dairy");
    expect(categoryFromName("Rum Rozijnen vla")).toBe("dairy");
    expect(categoryFromTags(["en:spreads", "en:peanut-butters"])).toBeUndefined();
  });
});
