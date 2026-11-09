import { describe, expect, it, vi } from "vitest";
import { cleanNamePhoto, createNameImageClient } from "./nameImage";

describe("name image client purpose", () => {
  it("keeps a structured brand on photos", () => {
    const photo = cleanNamePhoto({
      source: "prijsprofeet",
      productName: "AH Hagelslag Melk",
      brand: "AH",
      retailer: "albert_heijn",
      imageUrl: "https://static.ah.nl/dam/product/AHI_x?rendition=800x800_WEBP&fileType=binary",
    });
    expect(photo?.brand).toBe("AH");
  });

  it("sends purpose=private-label for private-label cache keys", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        result: { classification: "unknown", match: null, alternatives: [], privateLabelAlternatives: [] },
      }),
    });
    const client = createNameImageClient({ fetch: fetch as never, online: () => true, origin: "https://api.example" });
    await client.find("private-label|jumbo|hagelslag");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      name: "hagelslag",
      retailer: "jumbo",
      purpose: "private-label",
    });
  });
});
