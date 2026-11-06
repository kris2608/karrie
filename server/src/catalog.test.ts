import { describe, expect, it } from "vitest";
import { products } from "../../src/data/catalog";
import { FOOD_TYPES, HOUSEHOLD_TYPES } from "./schema.js";

describe("catalog types", () => {
  it("match the app catalog exactly, so every target has a drawing", () => {
    const food = products.filter((product) => product.category !== "household").map((product) => product.id);
    const household = products.filter((product) => product.category === "household").map((product) => product.id);
    expect([...FOOD_TYPES].sort()).toEqual(food.sort());
    expect([...HOUSEHOLD_TYPES].sort()).toEqual(household.sort());
  });
});
