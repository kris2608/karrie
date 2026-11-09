import { describe, expect, it, vi } from "vitest";
import { LIST_SHARE_TEXT, LIST_SHARE_TITLE, SHARE_TEXT, SHARE_TITLE, SHARE_URL, shareKarrie, shareLink } from "./share";

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

describe("shareLink", () => {
  it("shares or copies the given short list URL", async () => {
    const listUrl = "https://www.karrie.eu/l/abcdefghijklmnop";
    const data = { title: LIST_SHARE_TITLE, text: LIST_SHARE_TEXT, url: listUrl };
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn().mockResolvedValue(undefined);
    await expect(shareLink({ share, copy }, data)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
    await expect(shareLink({ copy }, data)).resolves.toBe("copied");
    expect(copy).toHaveBeenCalledWith(listUrl);
  });
});
