import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../../src/domain/categories";
import { products } from "../../../src/data/catalog";
import { BOOTSTRAP_CATEGORIES, BOOTSTRAP_PRODUCTS } from "./bootstrap.js";

describe("catalog bootstrap parity", () => {
  it("matches the app categories and products exactly", () => {
    expect(BOOTSTRAP_CATEGORIES.map((category) => category.id)).toEqual(CATEGORIES.map((category) => category.id));
    expect(BOOTSTRAP_CATEGORIES.map((category) => [category.label, category.short])).toEqual(
      CATEGORIES.map((category) => [category.label, category.short]),
    );
    expect(BOOTSTRAP_PRODUCTS.map((product) => [product.id, product.name, product.category, product.groupId, product.aliases])).toEqual(
      products.map((product) => [product.id, product.name, product.category, product.groupId, product.aliases]),
    );
  });
});
