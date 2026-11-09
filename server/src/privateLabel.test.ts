import { describe, expect, it } from "vitest";
import { matchName, privateLabelImages, type NameRow } from "./nameMatch.js";
import { privateLabelKey } from "./nameImage.js";
import { IMAGE_SOURCE_RETAILERS, RETAILERS, nameSearchUrl, privateLabelSearchUrl, searchUrl } from "./offers/prijsprofeet.js";

const AH = "https://static.ah.nl/dam/product/AHI_hagelslag?rendition=800x800_WEBP&fileType=binary";
const JUMBO = "https://www.jumbo.com/dam-images/fit-in/360x360/Products/jumbo_hagelslag.png";
const PEPSI = "https://www.jumbo.com/dam-images/fit-in/360x360/Products/pepsi_regular.png";
const PEPSI_ZERO = "https://static.ah.nl/dam/product/AHI_pepsi_zero?rendition=800x800_WEBP&fileType=binary";

function row(partial: Partial<NameRow> & Pick<NameRow, "name" | "retailer">): NameRow {
  return {
    source: "prijsprofeet",
    brands: partial.brands ?? [],
    imageUrl: partial.imageUrl,
    privateLabel: partial.privateLabel,
    promotionStatus: partial.promotionStatus ?? "unknown",
    ...partial,
  };
}

describe("private-label suggestions stay retailer-scoped", () => {
  const rows: NameRow[] = [
    row({ name: "AH Hagelslag Melk", retailer: "albert_heijn", brands: ["AH"], privateLabel: true, imageUrl: AH }),
    row({ name: "Jumbo Hagelslag Puur", retailer: "jumbo", brands: ["Jumbo"], privateLabel: true, imageUrl: JUMBO }),
    row({ name: "De Ruijter Hagelslag", retailer: "albert_heijn", brands: ["De Ruijter"], imageUrl: AH }),
    row({ name: "Lidl Hagelslag", retailer: "lidl", brands: ["Lidl"], privateLabel: true, imageUrl: "https://www.lidl.nl/assets/lidl_hagelslag.png" }),
  ];

  it("AH selected → only AH private-label alternatives", () => {
    const labels = privateLabelImages("hagelslag", rows, "albert_heijn");
    expect(labels.map((entry) => entry.retailer)).toEqual(["albert_heijn"]);
    expect(labels.every((entry) => entry.privateLabel)).toBe(true);
  });

  it("Jumbo selected → only Jumbo private-label alternatives", () => {
    expect(privateLabelImages("hagelslag", rows, "jumbo").map((entry) => entry.productName)).toEqual(["Jumbo Hagelslag Puur"]);
  });

  it("Lidl selected → only Lidl private-label alternatives", () => {
    expect(privateLabelImages("hagelslag", rows, "lidl").map((entry) => entry.retailer)).toEqual(["lidl"]);
  });

  it("missing private_label is never treated as a house brand suggestion", () => {
    const unclear = [row({ name: "Hagelslag Melk", retailer: "albert_heijn", brands: ["AH"], imageUrl: AH })];
    expect(privateLabelImages("hagelslag", unclear, "albert_heijn")).toEqual([]);
  });

  it("keeps private-label cache keys isolated per supermarket", () => {
    expect(privateLabelKey("albert_heijn", "Hagelslag")).toBe("private-label|albert_heijn|hagelslag||");
    expect(privateLabelKey("jumbo", "Hagelslag")).toBe("private-label|jumbo|hagelslag||");
    expect(privateLabelKey("albert_heijn", "Hagelslag")).not.toBe(privateLabelKey("jumbo", "Hagelslag"));
  });
});

describe("manufacturer brands stay retailer-independent", () => {
  it("Pepsi may use an image from another supermarket than the shopping list", () => {
    const rows: NameRow[] = [
      row({ name: "Pepsi Regular 1.5L", retailer: "jumbo", brands: ["Pepsi"], imageUrl: PEPSI, promotionStatus: "active" }),
      row({ name: "Pepsi Zero 1.5L", retailer: "albert_heijn", brands: ["Pepsi"], imageUrl: PEPSI_ZERO }),
    ];
    const matched = matchName("Pepsi", rows);
    expect(matched.classification).toBe("branded");
    expect(matched.match?.imageUrl).toBe(PEPSI);
    expect(matched.match?.productName).not.toMatch(/Zero/i);
  });

  it("does not treat Pepsi Zero as regular Pepsi", () => {
    const rows: NameRow[] = [row({ name: "Pepsi Zero Cherry", retailer: "albert_heijn", brands: ["Pepsi"], imageUrl: PEPSI_ZERO })];
    expect(matchName("Pepsi", rows).match).toBeNull();
    expect(matchName("Pepsi Zero Cherry", rows).match?.imageUrl).toBe(PEPSI_ZERO);
  });
});

describe("shopping retailers stay separate from image-source coverage", () => {
  it("offer search stays on one shopping supermarket", () => {
    expect(searchUrl("cola", "albert_heijn")).toContain("retailer=albert_heijn");
    expect(searchUrl("cola", "albert_heijn")).toContain("promotion_status=active");
    expect([...RETAILERS]).toEqual(["jumbo", "albert_heijn", "lidl"]);
  });

  it("name search uses the image-source set and supports pagination", () => {
    expect(nameSearchUrl("cola", 2)).toContain("page=2");
    expect(nameSearchUrl("cola")).toContain(`retailer=${IMAGE_SOURCE_RETAILERS.join("%2C")}`);
    expect(privateLabelSearchUrl("hagelslag", "jumbo")).toContain("retailer=jumbo");
    expect(privateLabelSearchUrl("hagelslag", "jumbo")).not.toContain("albert_heijn");
  });
});
