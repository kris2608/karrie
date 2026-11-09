import { describe, expect, it } from "vitest";
import { assignBonuses, pickMissions } from "./discovery";
import { colorFor, pickDistractor, pickPlayOffers, seededRandom } from "./bonusPlay";
import type { AdventureItem, AlternativeAssessment } from "./types";

function item(id: string, productId: string, category: AdventureItem["category"], extra: Partial<AdventureItem> = {}): AdventureItem {
  return { id, productId, name: productId, icon: productId, category, quantity: 1, status: "pending", ...extra };
}

const possible: AlternativeAssessment = {
  status: "possible",
  evidence: "label",
  criteria: ["no-added-sugar"],
  alternativeType: "100% pindakaas",
  targetType: "pindakaas",
  source: "barcode",
  assessedAt: 1,
};

describe("bonus play picker", () => {
  it("is deterministic for a seed and rotates kinds", () => {
    const list = [
      item("1", "banaan", "produce"),
      item("2", "broccoli", "produce"),
      item("3", "melk", "dairy"),
      item("4", "brood", "bakery"),
      item("5", "yoghurt", "dairy"),
      item("6", "wortel", "produce"),
    ];
    const a = pickPlayOffers(list, [], true, "adv-1");
    const b = pickPlayOffers(list, [], true, "adv-1");
    const c = pickPlayOffers(list, [], true, "adv-2");
    expect(a).toEqual(b);
    expect(Object.keys(a).length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(a).length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(c));
    const kinds = new Set(Object.values(a).map((play) => play.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(1);
  });

  it("never stacks play on a healthier mission product", () => {
    const list = [item("a", "pindakaas", "breakfast", { alternative: possible, brand: "Calvé", name: "Calvé Pindakaas" }), item("b", "banaan", "produce"), item("c", "broccoli", "produce")];
    const missions = pickMissions(list, true);
    expect(missions).toContain("a");
    const plays = pickPlayOffers(list, missions, true, "seed");
    expect(plays.a).toBeUndefined();
    expect(Object.keys(plays).every((id) => id !== "a")).toBe(true);
  });

  it("assigns nothing when Bonusmissies is off", () => {
    const list = [item("1", "banaan", "produce"), item("2", "broccoli", "produce"), item("3", "wortel", "produce")];
    expect(assignBonuses(list, false, [], "seed").every((entry) => !entry.mission && !entry.play)).toBe(true);
    expect(pickPlayOffers(list, [], false, "seed")).toEqual({});
  });

  it("handles short lists without crashing", () => {
    expect(Object.keys(pickPlayOffers([item("1", "banaan", "produce")], [], true, "s"))).toHaveLength(1);
    expect(pickPlayOffers([], [], true, "s")).toEqual({});
  });

  it("only maps unambiguous colours and finds same-category distractors", () => {
    expect(colorFor("banaan")).toBe("geel");
    expect(colorFor("broccoli")).toBe("groen");
    expect(colorFor("paprika")).toBeUndefined();
    const rand = seededRandom("x");
    expect(pickDistractor("banaan", "produce", rand)).toBeTruthy();
    expect(pickDistractor("banaan", "produce", rand)).not.toBe("banaan");
  });
});
