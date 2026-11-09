import { describe, expect, it, vi } from "vitest";
import { SHARE_TEXT, SHARE_TITLE, SHARE_URL, shareKarrie, whatsAppShareUrl } from "./share";

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

describe("whatsAppShareUrl", () => {
  it("encodes the Dutch share text with the short list URL", () => {
    const listUrl = "https://www.karrie.eu/l/abcdefghijklmnop";
    const url = whatsAppShareUrl(listUrl);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(url.slice("https://wa.me/?text=".length));
    expect(text).toContain("🛒 Ik heb een boodschappenlijstje met Karrie gedeeld!");
    expect(text).toContain(listUrl);
  });
});
