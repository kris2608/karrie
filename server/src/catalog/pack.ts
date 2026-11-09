import { parseSize } from "../productName.js";
import { RETAILER_RANK } from "../offers/prijsprofeet.js";

export type PackEvidenceSource = "openfoodfacts" | "prijsprofeet" | "parent_unverified";

export type PackEvidence = {
  source: PackEvidenceSource;
  /** Empty for OFF and parent; PrijsProfeet slug when known. */
  retailer?: string;
  quantityRaw?: string;
  quantityMl?: number;
  productName?: string;
  brand?: string;
  retrievedAt: number;
};

export type PackSummary = {
  sources: PackEvidence[];
  /** True only when PrijsProfeet retailers disagree with no majority (parent must choose). */
  conflict: boolean;
  /** Preferred quantity: parent, then PrijsProfeet majority, then Open Food Facts. */
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

function packKey(entry: PackEvidence): string {
  if (entry.quantityMl != null) return `ml:${entry.quantityMl}`;
  return `raw:${(entry.quantityRaw ?? "").replace(/\s+/g, " ").trim().toLowerCase()}`;
}

/**
 * Prefer the parent's confirmation, then the PrijsProfeet majority size (ties broken by listRetailer,
 * then retailer rank), then Open Food Facts. A disagreement with Open Food Facts no longer asks the parent.
 */
export function summarizePack(evidence: PackEvidence[], listRetailer?: string): PackSummary {
  const withQty = evidence.filter((entry) => entry.quantityRaw || entry.quantityMl != null);
  const parent = withQty.find((entry) => entry.source === "parent_unverified");
  const off = withQty.find((entry) => entry.source === "openfoodfacts");
  const retailers = withQty.filter((entry) => entry.source === "prijsprofeet");

  if (parent?.quantityRaw) {
    return { sources: withQty, conflict: false, displayQuantity: parent.quantityRaw };
  }

  if (retailers.length === 0) {
    return { sources: withQty, conflict: false, ...(off?.quantityRaw && { displayQuantity: off.quantityRaw }) };
  }

  const groups = new Map<string, PackEvidence[]>();
  for (const entry of retailers) {
    const key = packKey(entry);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }

  const ranked = [...groups.values()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const score = (entries: PackEvidence[]) => {
      if (listRetailer && entries.some((entry) => entry.retailer === listRetailer)) return 0;
      return Math.min(...entries.map((entry) => RETAILER_RANK[entry.retailer ?? ""] ?? 99));
    };
    return score(a) - score(b);
  });

  const best = ranked[0];
  const runner = ranked[1];
  const tied =
    Boolean(runner) &&
    runner.length === best.length &&
    packsConflict(best[0].quantityMl, runner[0].quantityMl, best[0].quantityRaw, runner[0].quantityRaw);
  /** A list-supermarket hit uniquely in one tied group breaks the tie; otherwise the parent chooses. */
  const listBreaksTie =
    Boolean(listRetailer) &&
    tied &&
    best.some((entry) => entry.retailer === listRetailer) !== runner!.some((entry) => entry.retailer === listRetailer);

  if (tied && !listBreaksTie) {
    return { sources: withQty, conflict: true };
  }

  const displayQuantity = best[0].quantityRaw ?? off?.quantityRaw;
  return { sources: withQty, conflict: false, ...(displayQuantity && { displayQuantity }) };
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
