/**
 * Accent-insensitive fold for comparing brand prefixes in product titles.
 * Keeps letters/digits/spaces so "Calvé" and "Calve" align.
 */
export function foldTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip a leading brand from a product title when the brand is known and not the whole name.
 * "Karvan Cévitam Zero multivruchten siroop" + brand "Karvan Cévitam" → "Zero multivruchten siroop".
 * Leaves "Chocomel" alone when brand is also "Chocomel".
 */
export function stripBrandFromName(name: string, brand?: string | null): string {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const cleanBrand = (brand ?? "").replace(/\s+/g, " ").trim();
  if (!cleanName || !cleanBrand) return cleanName;

  const nameFold = foldTitle(cleanName);
  const brandFold = foldTitle(cleanBrand);
  if (!brandFold || nameFold === brandFold) return cleanName;
  if (!nameFold.startsWith(brandFold)) return cleanName;

  const after = nameFold.slice(brandFold.length);
  if (after.length > 0 && !/^\s/.test(after)) return cleanName;

  const nameWords = cleanName.split(" ").filter(Boolean);
  for (let consumed = 0; consumed < nameWords.length; consumed += 1) {
    const folded = foldTitle(nameWords.slice(0, consumed + 1).join(" "));
    if (folded === brandFold) {
      const rest = nameWords.slice(consumed + 1).join(" ").trim();
      return rest || cleanName;
    }
    if (!brandFold.startsWith(folded)) return cleanName;
  }
  return cleanName;
}

/** Apply brand stripping to a barcode/catalog identity pair. */
export function cleanProductIdentity(name?: string | null, brand?: string | null): { name?: string; brand?: string } {
  const cleanBrand = brand?.replace(/\s+/g, " ").trim() || undefined;
  const rawName = name?.replace(/\s+/g, " ").trim() || undefined;
  if (!rawName) return { ...(cleanBrand && { brand: cleanBrand }) };
  const cleaned = stripBrandFromName(rawName, cleanBrand);
  return {
    name: cleaned.slice(0, 80),
    ...(cleanBrand && { brand: cleanBrand.slice(0, 40) }),
  };
}
