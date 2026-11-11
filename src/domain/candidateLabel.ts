import { catalogByName } from "./productDraft";
import { productHeading, type ProductHeading } from "./productHeading";

/** Common English generics from vision → Dutch display names. */
const DUTCH_GENERIC: Record<string, string> = {
  pear: "Peer",
  pears: "Peren",
  apple: "Appel",
  apples: "Appels",
  banana: "Banaan",
  bananas: "Bananen",
  kiwi: "Kiwi",
  tomato: "Tomaat",
  tomatoes: "Tomaten",
  milk: "Melk",
  bread: "Brood",
  cheese: "Kaas",
  yogurt: "Yoghurt",
  yoghurt: "Yoghurt",
  chicken: "Kip",
  spinach: "Spinazie",
  potato: "Aardappel",
  potatoes: "Aardappelen",
};

export function dutchGenericName(generic: string | null | undefined): string | undefined {
  if (!generic?.trim()) return undefined;
  const raw = generic.trim();
  const folded = raw.toLowerCase();
  if (DUTCH_GENERIC[folded]) return DUTCH_GENERIC[folded];
  const catalog = catalogByName(raw);
  if (catalog) return catalog.name;
  // Keep readable capitalisation for unknown Dutch-looking names.
  if (/^[a-z]/.test(raw) && !/[A-Z]/.test(raw.slice(1))) return raw.charAt(0).toUpperCase() + raw.slice(1);
  return raw;
}

/** Brand-safe title + subtitle for identity candidates and confirmation heads. */
export function candidateHeading(input: {
  productName?: string | null;
  genericName?: string | null;
  brand?: string | null;
  variant?: string | null;
  packageSize?: string | null;
}): ProductHeading {
  const name = (input.productName?.trim() || dutchGenericName(input.genericName) || "Onbekend product").slice(0, 40);
  return productHeading({
    name,
    brand: input.brand ?? undefined,
    variant: input.variant ?? undefined,
    packageSize: input.packageSize ?? undefined,
  });
}
