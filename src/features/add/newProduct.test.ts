import { describe, expect, it } from "vitest";
import { customProductId } from "../../domain/customProduct";
import type { NamePhoto } from "../../domain/types";
import type { NameAnswer } from "../../services/images/nameImage";
import { customWork } from "../../state/customEnrichment";
import { initialState, reducer, type CustomEnrichment } from "../../state/reducer";
import { newProductView, refusedBrand, wantsTidy, type NameLookup, type Tidy } from "./newProduct";

const PHOTO: NamePhoto = { source: "prijsprofeet", imageUrl: "https://static.ah.nl/dam/product/chocomel-vol.jpg", productName: "Chocomel Vol", retailer: "albert_heijn" };
const CHOCOMEL: NameAnswer = { classification: "branded", brand: "Chocomel", match: PHOTO, alternatives: [], category: "dairy" };
const OPTIMEL: NameAnswer = { classification: "branded", brand: "Optimel", match: null, alternatives: [] };
const UNKNOWN: NameAnswer = { classification: "unknown", match: null, alternatives: [] };
const CASHEW: CustomEnrichment = { displayName: "Cashewnoten", canonicalName: "cashewnoot", category: "pantry", subcategory: "noten" };

const pending: NameLookup = { status: "pending", answer: null };
const idle: Tidy = { status: "idle" };

describe("the new-product sheet", () => {
  it("searches while the name lookup runs, then shows the brand photo and department without a tidy-up", () => {
    expect(newProductView(pending, idle, true)).toEqual({ phase: "searching" });
    expect(wantsTidy(pending, idle)).toBe(false);
    const found: NameLookup = { status: "found", answer: CHOCOMEL };
    expect(wantsTidy(found, idle)).toBe(false);
    expect(newProductView(found, idle, true)).toEqual({ phase: "found", brand: "Chocomel", category: "dairy", photo: PHOTO });
    expect(newProductView({ status: "none", answer: OPTIMEL }, idle, true)).toEqual({ phase: "found", brand: "Optimel", category: undefined });
  });

  it("an earlier answer shows at once while a recheck runs", () => {
    expect(newProductView({ status: "pending", answer: CHOCOMEL }, idle, true)).toMatchObject({ phase: "found", photo: PHOTO });
  });

  it("an unknown name goes to the tidy-up, which gives the department and drawing", () => {
    const none: NameLookup = { status: "none", answer: UNKNOWN };
    expect(wantsTidy(none, idle)).toBe(true);
    expect(newProductView(none, idle, true)).toEqual({ phase: "searching" });
    expect(newProductView(none, { status: "running" }, true)).toEqual({ phase: "searching" });
    expect(wantsTidy(none, { status: "running" })).toBe(false);
    expect(newProductView(none, { status: "ok", enrichment: { ...CASHEW, drawing: "walnuts" }, illustrations: false }, true)).toEqual({
      phase: "found",
      category: "pantry",
      drawing: "walnuts",
    });
    expect(newProductView(none, { status: "none" }, true)).toEqual({ phase: "plain" });
  });

  it("a tidy-up refusal for a brand still names the brand, without the size", () => {
    expect(refusedBrand("Calvé 350 gram")).toBe("Calvé");
    expect(newProductView({ status: "none", answer: UNKNOWN }, { status: "brand", brand: "Calvé" }, true)).toEqual({ phase: "found", brand: "Calvé" });
  });

  it("offline the parent can add right away and Karrie looks later", () => {
    expect(newProductView(pending, idle, false)).toEqual({ phase: "offline" });
    expect(newProductView({ status: "none", answer: UNKNOWN }, idle, false)).toEqual({ phase: "offline" });
  });

  it("what the sheet found lands on the new item, so the background asks nothing again", () => {
    const productId = customProductId("Cashewnoten");
    let state = reducer(initialState, { type: "add-custom", name: "Cashewnoten", itemId: "a" });
    state = reducer(state, { type: "enrich-custom", productId, result: CASHEW, illustrations: false });
    expect(state.adventure!.items[0]).toMatchObject({ name: "Cashewnoten", category: "pantry", enrichment: { status: "done" } });
    const names = { status: () => "none" as const, value: () => UNKNOWN };
    expect(customWork(state, names)).toMatchObject({ normalize: [], brand: [] });
  });
});
