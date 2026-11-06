import { describe, expect, it } from "vitest";
import { createConfirmation } from "./barcodeReader";

describe("barcode confirmation", () => {
  it("reports a valid code once it is read twice without another code in between", () => {
    const confirm = createConfirmation();
    expect(confirm({ code: "8710400000006", format: "ean-13" })).toBeNull();
    expect(confirm(null)).toBeNull();
    expect(confirm({ code: "8710400000006", format: "ean-13" })).toBe("8710400000006");
  });

  it("starts over on a different or invalid code and never reports the same code twice", () => {
    const confirm = createConfirmation();
    confirm({ code: "8710400000006", format: "ean-13" });
    expect(confirm({ code: "8710400000007", format: "ean-13" })).toBeNull();
    expect(confirm({ code: "8710400000006", format: "ean-13" })).toBeNull();
    expect(confirm({ code: "8710400000006", format: "ean-13" })).toBe("8710400000006");
    expect(confirm({ code: "8710400000006", format: "ean-13" })).toBeNull();
  });

  it("brings UPC codes into the Open Food Facts form", () => {
    const confirm = createConfirmation();
    confirm({ code: "036000291452", format: "upc-a" });
    expect(confirm({ code: "036000291452", format: "upc-a" })).toBe("0036000291452");
  });
});
