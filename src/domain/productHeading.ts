import { normalize } from "./matchProduct";

/**
 * Strip a leading brand from a product title when the brand is known and not the whole name.
 * Mirrors server/src/productTitle.ts for display-time leftovers.
 */
export function stripBrandFromName(name: string, brand?: string | null): string {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const cleanBrand = (brand ?? "").replace(/\s+/g, " ").trim();
  if (!cleanName || !cleanBrand) return cleanName;

  const nameFold = normalize(cleanName);
  const brandFold = normalize(cleanBrand);
  if (!brandFold || nameFold === brandFold) return cleanName;
  if (!nameFold.startsWith(brandFold)) return cleanName;

  const after = nameFold.slice(brandFold.length);
  if (after.length > 0 && !/^\s/.test(after)) return cleanName;

  const nameWords = cleanName.split(" ").filter(Boolean);
  for (let consumed = 0; consumed < nameWords.length; consumed += 1) {
    const folded = normalize(nameWords.slice(0, consumed + 1).join(" "));
    if (folded === brandFold) {
      const rest = nameWords.slice(consumed + 1).join(" ").trim();
      return rest || cleanName;
    }
    if (!brandFold.startsWith(folded)) return cleanName;
  }
  return cleanName;
}

export type ProductHeading = {
  /** Product title without a duplicated leading brand. */
  title: string;
  /** `Brand · Variant · Amount` with missing parts omitted. */
  subtitle: string | undefined;
  brand?: string;
  packageSize?: string;
};

/** Shared Brand / Product / Amount heading for preview and Controleren sheets. */
export function productHeading(input: {
  name: string;
  brand?: string;
  packageSize?: string;
  variant?: string;
}): ProductHeading {
  const brand = input.brand?.replace(/\s+/g, " ").trim() || undefined;
  const packageSize = input.packageSize?.replace(/\s+/g, " ").trim() || undefined;
  const variant = input.variant?.replace(/\s+/g, " ").trim() || undefined;
  const title = stripBrandFromName(input.name, brand).slice(0, 40) || input.name.trim().slice(0, 40);
  const subtitle = [brand, variant, packageSize].filter(Boolean).join(" · ") || undefined;
  return { title, subtitle, ...(brand && { brand }), ...(packageSize && { packageSize }) };
}

/**
 * Whether a refresh may overwrite the local display name with a cleaned server title.
 * Locks parent-tagged names and obvious nicknames; allows catalog-like titles through.
 */
export function mayRefreshName(
  item: { name: string; brand?: string; fieldSources?: { name?: string }; barcode?: unknown; kind?: string },
  serverName: string,
  serverBrand?: string,
): boolean {
  if (item.fieldSources?.name === "parent") return false;

  const local = normalize(item.name);
  const server = normalize(serverName);
  const stripped = normalize(stripBrandFromName(serverName, serverBrand));
  if (local === server || local === stripped) return true;

  const brand = serverBrand || item.brand;
  if (brand && local.startsWith(normalize(brand))) return true;

  // Still looks like the server product title (prefix / extension).
  if (stripped && (local.startsWith(stripped) || stripped.startsWith(local))) return true;

  // Typed custom without barcode evidence — keep the parent's wording.
  if (item.kind === "custom_generic" && !item.barcode) return false;

  // Nickname / local rename ("Onze pindakaas") — keep it.
  return false;
}
