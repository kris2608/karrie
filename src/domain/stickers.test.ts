import { describe, expect, it } from "vitest";
import { STICKERS, stickerPreview } from "./stickers";

const ALL = STICKERS.map((sticker) => sticker.id);

describe("sticker preview", () => {
  it("is empty without stickers", () => {
    expect(stickerPreview([])).toEqual({ count: 0, shown: [], more: 0 });
  });

  it("shows the newest stickers first", () => {
    expect(stickerPreview(["ster"])).toEqual({ count: 1, shown: ["ster"], more: 0 });
    expect(stickerPreview(ALL.slice(0, 5))).toEqual({ count: 5, shown: ["melk", "brood", "banaan", "appel", "ster"], more: 0 });
  });

  it("keeps one row of five and counts the rest", () => {
    expect(stickerPreview(ALL)).toEqual({ count: 6, shown: ["kar", "melk", "brood", "banaan", "appel"], more: 1 });
  });

  it("counts each sticker once", () => {
    expect(stickerPreview(["ster", "appel", "ster"])).toEqual({ count: 2, shown: ["appel", "ster"], more: 0 });
  });
});
