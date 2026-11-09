import { describe, expect, it, vi } from "vitest";
import {
  SHARE_LIST_TEXT,
  SHARE_LIST_TITLE,
  SHARE_TEXT,
  SHARE_TITLE,
  SHARE_URL,
  shareKarrie,
  shareShoppingList,
} from "./share";

describe("shareKarrie", () => {
  it("opens the system share sheet with only the public site", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();
    await expect(shareKarrie({ share, copy })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
    expect(copy).not.toHaveBeenCalled();
  });

  it("copies the link when share is missing or refuses the payload", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(shareKarrie({ copy })).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(SHARE_URL);

    copy.mockClear();
    await expect(shareKarrie({ share: vi.fn(), canShare: () => false, copy })).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(SHARE_URL);
  });

  it("treats cancelling the sheet as nothing, and copies when share fails otherwise", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const abort = Object.assign(new Error("nope"), { name: "AbortError" });
    await expect(shareKarrie({ share: vi.fn().mockRejectedValue(abort), copy })).resolves.toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();

    await expect(shareKarrie({ share: vi.fn().mockRejectedValue(new Error("broken")), copy })).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(SHARE_URL);
  });
});

describe("shareShoppingList", () => {
  const listUrl = "https://www.karrie.eu/#list=0.abc";

  it("shares the list URL without changing shareKarrie", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();
    await expect(shareShoppingList(listUrl, { share, copy })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: SHARE_LIST_TITLE, text: SHARE_LIST_TEXT, url: listUrl });
    expect(copy).not.toHaveBeenCalled();
  });

  it("copies the full hash URL when native share is unavailable", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(shareShoppingList(listUrl, { copy })).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(listUrl);
  });

  it("returns cancelled on AbortError without copying", async () => {
    const copy = vi.fn();
    const abort = Object.assign(new Error("nope"), { name: "AbortError" });
    await expect(shareShoppingList(listUrl, { share: vi.fn().mockRejectedValue(abort), copy })).resolves.toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });
});
