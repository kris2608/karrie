import { words } from "../nameMatch.js";
import type { Packaging, Size } from "../productName.js";
import { parseSize } from "../productName.js";

/** Stable lookup key for a product name, optionally prefixed with a brand. */
export function normalizedKey(name: string, brand?: string | null): string {
  const parts = words([brand, name].filter(Boolean).join(" "));
  return parts.join(" ") || name.trim().toLowerCase();
}

export function aliasKey(value: string): string {
  return words(value).join(" ");
}

export type PackParts = {
  packageQuantity?: number | null;
  packageUnit?: string | null;
  multipackCount?: number | null;
  packageType?: string | null;
  label?: string | null;
};

/** Compact uniqueness key for a packaging variant. Empty packs share one row. */
export function packKey(parts: PackParts): string {
  return [
    parts.packageQuantity ?? "",
    parts.packageUnit ?? "",
    parts.multipackCount ?? "",
    parts.packageType ?? "",
  ].join("|");
}

/** Build pack parts from an Open Food Facts / typed quantity string like "330 ml" or "6 x 200 ml". */
export function packFromQuantity(quantity?: string | null, packaging?: Packaging | null): PackParts {
  const size = quantity ? parseSize(quantity.replace(/\s+/g, " ").trim()) : null;
  if (!size && !packaging) return { label: quantity?.trim() || null };
  return {
    packageQuantity: size?.amount ?? null,
    packageUnit: size?.unit ?? null,
    multipackCount: size?.count ?? null,
    packageType: packaging ?? null,
    label: quantity?.trim() || null,
  };
}

export function sizeMatches(requested: Size | undefined, packaging: Packaging | undefined, variant: PackParts): boolean {
  if (!requested && !packaging) return true;
  if (packaging && variant.packageType && packaging !== variant.packageType) return false;
  if (packaging && !variant.packageType) return false;
  if (!requested) return Boolean(packaging);
  if (variant.packageUnit !== requested.unit) return false;
  if (Number(variant.packageQuantity) !== requested.amount) return false;
  const wantCount = requested.count ?? null;
  const haveCount = variant.multipackCount ?? null;
  if (wantCount && haveCount !== wantCount) return false;
  return true;
}
