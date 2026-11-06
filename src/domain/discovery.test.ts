import { describe, expect, it } from "vitest";
import { FOOD_TYPES, HOUSEHOLD_TYPES } from "../../server/src/schema";
import { products } from "../data/catalog";
import type { RecognizedAlternative } from "../services/vision/types";
import { badgeFor, declineKey, labelCheck, missionOn, parentLine, pickMissions, resolveAssessment, samePurpose } from "./discovery";
import type { AdventureItem, AlternativeAssessment } from "./types";

const SWEET_PEANUT: RecognizedAlternative = {
  status: "possible",
  evidence: "label",
  criteria: ["no-added-sugar", "no-added-salt"],
  alternativeType: "100% pindakaas",
  targetType: "pindakaas",
  reason: "Suiker en zout toegevoegd.",
  parentExplanation: "Er staan suiker en zout in de ingrediënten",
  childPrompt: "Kun jij pindakaas met alleen pinda's vinden?",
};

const LABEL = "Pinda's (90%), suiker, plantaardige olie (palm), zout";

function item(id: string, alternative?: AlternativeAssessment, extra: Partial<AdventureItem> = {}): AdventureItem {
  return { id, productId: "pindakaas", name: `Pindakaas ${id}`, icon: "pindakaas", category: "pantry", quantity: 1, status: "pending", alternative, ...extra };
}

const possible = (evidence: "label" | "inferred"): AlternativeAssessment => ({
  status: "possible",
  evidence,
  criteria: ["no-added-sugar"],
  alternativeType: "100% pindakaas",
  targetType: "pindakaas",
  source: "photo",
  assessedAt: 1,
});

describe("server catalog types", () => {
  it("match the catalog exactly, so every target has a drawing", () => {
    const food = products.filter((product) => product.category !== "household").map((product) => product.id);
    const household = products.filter((product) => product.category === "household").map((product) => product.id);
    expect([...FOOD_TYPES].sort()).toEqual(food.sort());
    expect([...HOUSEHOLD_TYPES].sort()).toEqual(household.sort());
  });
});

describe("same purpose", () => {
  it("allows the same type and a short allowlist, nothing else", () => {
    expect(samePurpose("pindakaas", "pindakaas")).toBe(true);
    expect(samePurpose("brood", "volkorenbrood")).toBe(true);
    expect(samePurpose("ontbijtgranen", "muesli")).toBe(true);
    expect(samePurpose("volkorenbrood", "brood")).toBe(false);
    expect(samePurpose("koekjes", "wortel")).toBe(false);
    expect(samePurpose("melk", "water")).toBe(false);
  });
});

describe("label check", () => {
  it("keeps label evidence when the ingredients show the issue", () => {
    expect(labelCheck(["no-added-sugar", "no-added-salt"], "label", LABEL)).toEqual({ criteria: ["no-added-sugar", "no-added-salt"], evidence: "label" });
  });

  it("drops a criterion the label contradicts and downgrades unsupported label evidence", () => {
    expect(labelCheck(["no-added-sugar", "no-added-salt"], "label", "Pinda's, zout")).toEqual({ criteria: ["no-added-salt"], evidence: "label" });
    expect(labelCheck(["more-fibre"], "label", "Tarwebloem, water, gist")).toEqual({ criteria: ["more-fibre"], evidence: "inferred" });
    expect(labelCheck(["no-added-sugar"], "label", undefined)).toEqual({ criteria: ["no-added-sugar"], evidence: "inferred" });
    expect(labelCheck(["wholegrain"], "label", "Volkorentarwemeel, water")).toEqual({ criteria: [], evidence: "inferred" });
  });
});

describe("resolveAssessment", () => {
  it("turns a backed label reading into a mission with a qualified parent line", () => {
    const result = resolveAssessment(SWEET_PEANUT, "pindakaas", LABEL, undefined, 5);
    expect(result).toMatchObject({ status: "possible", evidence: "label", targetType: "pindakaas", assessedAt: 5, source: "photo" });
    expect(result?.parentExplanation).toBe("Op het etiket gezien: er staan suiker en zout in de ingrediënten.");
  });

  it("says 'waarschijnlijk' and asks to check the label when nothing was read", () => {
    const result = resolveAssessment({ ...SWEET_PEANUT, evidence: "inferred" }, "pindakaas");
    expect(result?.evidence).toBe("inferred");
    expect(result?.parentExplanation).toBe("Waarschijnlijk: er staan suiker en zout in de ingrediënten. Kijk even op het etiket.");
    expect(parentLine("Dit is waarschijnlijk wit brood", "inferred")).toBe("Dit is waarschijnlijk wit brood. Kijk even op het etiket.");
    expect(parentLine("Op het etiket staan suiker en zout", "label")).toBe("Op het etiket staan suiker en zout.");
    expect(parentLine("Deze pindakaas bevat waarschijnlijk suiker", "label")).toBe("Op het etiket gezien: deze pindakaas bevat suiker.");
  });

  it("rejects an unrelated target, an unknown type and an empty suggestion", () => {
    expect(resolveAssessment({ ...SWEET_PEANUT, targetType: "wortel" }, "pindakaas")?.status).toBe("none");
    expect(resolveAssessment(SWEET_PEANUT, undefined)?.status).toBe("none");
    expect(resolveAssessment({ ...SWEET_PEANUT, targetType: "hummus" }, "pindakaas")?.status).toBe("none");
    expect(resolveAssessment({ ...SWEET_PEANUT, criteria: [] }, "pindakaas")?.status).toBe("none");
  });

  it("passes none and insufficient data through without criteria", () => {
    expect(resolveAssessment({ ...SWEET_PEANUT, status: "none" }, "pindakaas")).toMatchObject({ status: "none", criteria: [] });
    expect(resolveAssessment({ ...SWEET_PEANUT, status: "insufficient-data", evidence: "none" }, "pindakaas")).toMatchObject({ status: "insufficient-data", criteria: [] });
    expect(resolveAssessment({ ...SWEET_PEANUT, evidence: "none" }, "pindakaas")?.status).toBe("insufficient-data");
    expect(resolveAssessment(undefined, "pindakaas")).toBeUndefined();
  });

  it("allows white bread to wholegrain bread", () => {
    const result = resolveAssessment(
      { ...SWEET_PEANUT, criteria: ["wholegrain"], alternativeType: "volkorenbrood", targetType: "volkorenbrood", childPrompt: null },
      "brood",
      "Tarwebloem, water, gist, zout",
    );
    expect(result).toMatchObject({ status: "possible", evidence: "label", targetType: "volkorenbrood", childPrompt: "Kun jij volkorenbrood vinden?" });
  });
});

describe("missions", () => {
  it("label evidence is on by default, a guess waits for the parent", () => {
    expect(missionOn(item("a", possible("label")))).toBe(true);
    expect(missionOn(item("b", possible("inferred")))).toBe(false);
    expect(missionOn(item("c", possible("inferred"), { missionEnabled: true }))).toBe(true);
    expect(missionOn(item("d", possible("label"), { missionEnabled: false }))).toBe(false);
    expect(missionOn(item("e", { ...possible("label"), status: "none" }))).toBe(false);
    expect(missionOn(item("f", { ...possible("label"), targetType: "onbekend" }))).toBe(false);
  });

  it("remembers a declined suggestion unless the parent turns it back on", () => {
    const declined = item("a", possible("label"));
    expect(missionOn(declined, [declineKey(declined)])).toBe(false);
    expect(missionOn({ ...declined, missionEnabled: true }, [declineKey(declined)])).toBe(true);
  });

  it("picks at most three, skips found items and respects the setting", () => {
    const items = ["a", "b", "c", "d"].map((id) => item(id, possible("label")));
    expect(pickMissions(items, true)).toEqual(["a", "b", "c"]);
    expect(pickMissions([{ ...items[0], status: "found" }, ...items.slice(1)], true)).toEqual(["b", "c", "d"]);
    expect(pickMissions(items, false)).toEqual([]);
  });

  it("shows one visual cue, never a number", () => {
    expect(badgeFor(possible("label"))).toBe("hundred");
    expect(badgeFor({ ...possible("label"), alternativeType: "volkorenbrood", criteria: ["wholegrain"] })).toBe("grain");
    expect(badgeFor({ ...possible("label"), alternativeType: "yoghurt zonder suiker" })).toBe("no-sugar");
    expect(badgeFor({ ...possible("label"), alternativeType: "ongezouten nootjes", criteria: ["unsalted"] })).toBe("no-salt");
  });
});
