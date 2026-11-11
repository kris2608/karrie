import { describe, expect, it } from "vitest";
import { candidateHeading, dutchGenericName } from "./candidateLabel";

describe("candidateHeading", () => {
  it("does not repeat Zespri in the title when brand is known", () => {
    const heading = candidateHeading({
      productName: "Zespri Kiwi Gold",
      brand: "Zespri",
      packageSize: "500 g",
    });
    expect(heading.title).toBe("Kiwi Gold");
    expect(heading.subtitle).toBe("Zespri · 500 g");
  });

  it("shows Dutch labels for English fruit generics", () => {
    expect(dutchGenericName("pears")).toBe("Peren");
    expect(dutchGenericName("apples")).toBe("Appels");
    expect(candidateHeading({ genericName: "pear" }).title).toBe("Peer");
  });
});
