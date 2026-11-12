import { describe, expect, it } from "vitest";
import { tileLongPress } from "./tileLongPress";

describe("tileLongPress", () => {
  it("asks to forget a user product only when it is not on the list", () => {
    expect(tileLongPress(true, 0)).toBe("confirm-forget");
  });

  it("takes a product off the list without a dialog while quantity is 1", () => {
    expect(tileLongPress(true, 1)).toBe("remove-from-list");
    expect(tileLongPress(false, 1)).toBe("remove-from-list");
  });

  it("steps quantity down above one, for user products and catalog products", () => {
    expect(tileLongPress(true, 2)).toBe("decrement");
    expect(tileLongPress(false, 3)).toBe("decrement");
  });

  it("never deletes a catalog product", () => {
    expect(tileLongPress(false, 0)).toBe("nothing");
  });
});
