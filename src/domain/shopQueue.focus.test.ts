import { describe, expect, it } from "vitest";
import { activeItem, focusItem } from "./shopQueue";
import type { AdventureItem } from "./types";

function item(id: string, status: AdventureItem["status"] = "pending"): AdventureItem {
  return {
    id,
    productId: id,
    name: id,
    icon: id,
    category: "produce",
    quantity: 1,
    status,
  };
}

describe("focusItem", () => {
  it("brings an open item to the front without marking found", () => {
    const items = [item("a"), item("b"), item("c", "found"), item("d")];
    const next = focusItem(items, "d");
    expect(activeItem(next)?.id).toBe("d");
    expect(next.find((entry) => entry.id === "c")?.status).toBe("found");
    expect(next.map((entry) => entry.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("is a no-op for the current active item or a found item", () => {
    const items = [item("a"), item("b")];
    expect(focusItem(items, "a")).toBe(items);
    expect(focusItem(items, "missing")).toEqual(items);
  });
});
