import { describe, expect, it } from "vitest";
import { identityKey as clientKey, type ImageIdentity } from "../../src/domain/imageIdentity";
import { identityKey as serverKey } from "./images.js";

describe("image identity keys", () => {
  it("are the same on the device and on the server", () => {
    const samples: ImageIdentity[] = [
      { name: "Banaan", generic: true },
      { name: "Crème fraîche", generic: true },
      { name: "AH Terra Pindakaas", brand: "AH Terra", variant: "100% naturel", size: "350 g", generic: false },
      { name: "Lay's Chips", brand: "Lay's", variant: "paprika", generic: false },
    ];
    for (const sample of samples) expect(clientKey(sample)).toBe(serverKey(sample));
  });
});
