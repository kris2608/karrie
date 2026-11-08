import { parseSize } from "../productName.js";

export type PackEvidenceSource = "openfoodfacts" | "prijsprofeet" | "parent_unverified";

export type PackEvidence = {
  source: PackEvidenceSource;
  quantityRaw?: string;
  quantityMl?: number;
  productName?: string;
  brand?: string;
  retrievedAt: number;
};

export type PackSummary = {
  sources: PackEvidence[];
  conflict: boolean;
  /** Quantity to show when sources agree, or the first OFF value when they conflict (until a parent confirms). */
  displayQuantity?: string;
};

/** Total contents in ml (liquids) or g (solids) for one pack, including multipack count. */
export function quantityMlOf(raw?: string | null): number | undefined {
  if (!raw) return undefined;
  const size = parseSize(raw.replace(/\s+/g, " ").trim());
  if (!size) {
    /** "1 liter" already covered; also accept "1L" glued forms via parseSize after normalize. */
    const alt = parseSize(raw.replace(",", ".").replace(/\s+/g, ""));
    if (!alt) return undefined;
    return alt.count && alt.count > 1 ? alt.amount * alt.count : alt.amount;
  }
  return size.count && size.count > 1 ? size.amount * size.count : size.amount;
}

/** Material disagreement: >5% relative difference, or missing one side with both raw strings present and unequal. */
export function packsConflict(a?: number | null, b?: number | null, rawA?: string | null, rawB?: string | null): boolean {
  if (a != null && b != null) {
    const larger = Math.max(a, b);
    if (!larger) return false;
    return Math.abs(a - b) / larger > 0.05;
  }
  if (rawA && rawB) {
    const na = rawA.replace(/\s+/g, " ").trim().toLowerCase();
    const nb = rawB.replace(/\s+/g, " ").trim().toLowerCase();
    return na !== nb && quantityMlOf(rawA) != null && quantityMlOf(rawB) != null
      ? packsConflict(quantityMlOf(rawA), quantityMlOf(rawB))
      : na !== nb && Boolean(quantityMlOf(rawA) || quantityMlOf(rawB));
  }
  return false;
}

export function summarizePack(evidence: PackEvidence[]): PackSummary {
  const withQty = evidence.filter((entry) => entry.quantityRaw || entry.quantityMl != null);
  const off = withQty.find((entry) => entry.source === "openfoodfacts");
  const retailer = withQty.find((entry) => entry.source === "prijsprofeet");
  const parent = withQty.find((entry) => entry.source === "parent_unverified");
  const conflict =
    !parent && packsConflict(off?.quantityMl, retailer?.quantityMl, off?.quantityRaw, retailer?.quantityRaw);
  const displayQuantity = parent?.quantityRaw ?? (conflict ? undefined : retailer?.quantityRaw ?? off?.quantityRaw);
  return { sources: withQty, conflict, ...(displayQuantity && { displayQuantity }) };
}

/** Dutch labels for conflict copy: "220 ml" / "1 liter". */
export function formatPackChoice(raw: string): string {
  const ml = quantityMlOf(raw);
  if (ml != null && ml >= 1000 && ml % 1000 === 0) {
    const liters = ml / 1000;
    return liters === 1 ? "1 liter" : `${liters} liter`;
  }
  return raw.replace(/\s+/g, " ").trim();
}
