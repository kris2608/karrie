import { products } from "../data/catalog";
import type { VisionPack } from "../data/sample";
import type { FoundAnswer } from "../services/barcode/lookup";
import type { RecognizedProduct } from "../services/vision/types";
import { categoryIcon } from "./categoryIcon";
import { normalize } from "./matchProduct";
import type { BarcodeInfo, CategoryId, FieldSource, FieldSources, Nutrition, Product, SavedItem } from "./types";
import { draftFromVision, needsCheck } from "./visionMapping";

/** One proposed field, with where it came from. Only the parent's own data counts as verified. */
export type DraftField = { value: string; source: FieldSource; verified: boolean };
type FieldName = "name" | "brand" | "variant" | "packageSize";

/** What the confirmation sheet shows and stores, merged from my products, the barcode lookup and the photo. */
export type ProductDraft = {
  name: string;
  category: CategoryId;
  icon: string;
  match: Product | null;
  /** A branded pack is shown as its photo; loose bread or fruit keeps its drawing. */
  keepPhoto: boolean;
  fields: Partial<Record<FieldName, DraftField>>;
  /** A picture to show when there is no new photo: the parent's earlier one, else the Open Food Facts front. */
  photoId?: string;
  imageUrl?: string;
  pack: VisionPack;
  ean?: string;
  from: { mine?: SavedItem; barcode?: FoundAnswer; photo?: RecognizedProduct };
  /** The parent should look before adding: a partial record, a web page, an unsure photo or sources that disagree. */
  unsure: boolean;
  /** Sure enough to offer the item already on the list; only a low-confidence photo without a barcode match is not. */
  confident: boolean;
  recognized: boolean;
};

/**
 * Higher wins, per field: what the parent confirmed before, then a complete Open Food Facts record, then what
 * the photo read on the pack, then a partial record or a web page, then what the model guessed.
 */
type Offer = { value?: string | null; source: FieldSource; rank: number };

function pick(...offers: Offer[]): DraftField | undefined {
  const best = offers
    .map((offer) => ({ ...offer, value: offer.value?.trim() }))
    .filter((offer) => Boolean(offer.value))
    .sort((a, b) => b.rank - a.rank)[0];
  return best && { value: best.value!, source: best.source, verified: best.source === "parent" };
}

/** Open Food Facts tags that say clearly where a product is in the shop; anything else stays undecided. */
const TAG_CATEGORY: [RegExp, CategoryId][] = [
  [/^en:frozen-/, "frozen"],
  [/^en:(dairies|milks|yogurts|cheeses|eggs|creams|fresh-desserts)$/, "dairy"],
  [/^en:(breads|pastries|cakes|viennoiseries)$/, "bakery"],
  [/^en:(fresh-fruits|fresh-vegetables)$/, "produce"],
  [/^en:(non-food-products|household-products|cleaning-products|detergents)$/, "household"],
];

export function categoryFromTags(tags: string[] | undefined): CategoryId | undefined {
  for (const [pattern, category] of TAG_CATEGORY) if (tags?.some((tag) => pattern.test(tag))) return category;
  return undefined;
}

/** Only an exact catalog name or alias: "Chocoladereep melk" must not become "melk". */
export function catalogByName(name: string | undefined): Product | null {
  const wanted = name ? normalize(name) : "";
  return (wanted && products.find((product) => [product.name, ...product.aliases].some((alias) => normalize(alias) === wanted))) || null;
}

function nutritionOf(answer: FoundAnswer | undefined): Nutrition | undefined {
  if (!answer || answer.source.kind !== "off") return undefined;
  const { per100 = {}, nutriScore } = answer.product;
  const nutrition: Nutrition = {
    nutriscore: nutriScore?.toLowerCase(),
    energyKcal100g: per100.energyKcal,
    sugars100g: per100.sugars,
    fat100g: per100.fat,
    saturatedFat100g: per100.saturatedFat,
    salt100g: per100.salt,
    proteins100g: per100.protein,
    fiber100g: per100.fibre,
  };
  const filled = Object.fromEntries(Object.entries(nutrition).filter(([, value]) => value !== undefined));
  return Object.keys(filled).length ? (filled as Nutrition) : undefined;
}

const differ = (a?: string | null, b?: string | null) => Boolean(a && b && normalize(a) !== normalize(b));

export type AddVia = "photo" | "barcode" | "manual";

export type NewItem = { name: string; category: CategoryId; icon: string; productId?: string; pack?: VisionPack; via: AddVia };

/**
 * The list item for a draft, used by the parent sheet and the child's basket alike. A catalog match in the chosen
 * category keeps its drawing and needs no photo; anything else keeps the new photo, if there is one.
 */
export function newItemFor(draft: ProductDraft | null, name: string, category: CategoryId): { item: NewItem; withPhoto: boolean } {
  const matched = draft?.match && draft.match.category === category ? draft.match : null;
  const via: AddVia = draft?.from.photo ? "photo" : draft?.from.barcode || draft?.from.mine ? "barcode" : "manual";
  return {
    item: { name, category, icon: matched ? matched.id : categoryIcon(category), productId: matched?.id, pack: draft?.pack, via },
    withPhoto: !draft || draft.keepPhoto || !matched,
  };
}

export type DraftInput = { ean?: string; mine?: SavedItem; barcode?: FoundAnswer; photo?: RecognizedProduct };

export function mergeDraft({ ean, mine, barcode, photo }: DraftInput): ProductDraft {
  const vision = photo ? draftFromVision(photo) : null;
  const inferred = new Set(photo?.inferredFields ?? []);
  const found = barcode?.product;
  const lookup = (value?: string): Offer =>
    barcode?.status === "off-exact" ? { value, source: "off", rank: 4 } : { value, source: barcode?.source.kind === "web" ? "web" : "off", rank: 2 };
  const seen = (value: string | null | undefined, field: string): Offer => (inferred.has(field) ? { value, source: "guess", rank: 1 } : { value, source: "photo", rank: 3 });
  const own = (value?: string): Offer => ({ value, source: "parent", rank: 5 });

  const fields: ProductDraft["fields"] = Object.fromEntries(
    Object.entries({
      name: pick(own(mine?.name), lookup(found?.name), seen(photo?.productName ?? photo?.genericName, "productName")),
      brand: pick(own(mine?.brand), lookup(found?.brand), seen(photo?.brand, "brand")),
      variant: pick(lookup(found?.variant), seen(photo?.variant, "variant")),
      packageSize: pick(own(mine?.packageSize), lookup(found?.quantity), seen(photo?.packageSize, "packageSize")),
    }).filter(([, field]) => field),
  );

  const match = (mine && products.find((product) => product.id === mine.productId)) || vision?.match || catalogByName(found?.name) || null;
  const category = mine?.category ?? vision?.category ?? categoryFromTags(found?.categories) ?? match?.category ?? "pantry";
  const offImage = mine?.imageSource === "off" ? mine.imageUrl : found?.imageUrl;
  const nutrition = mine?.nutrition ?? nutritionOf(barcode);
  const kept = (name: FieldName) => {
    const field = fields[name];
    return field && field.source !== "guess" ? field.value : undefined;
  };
  const fieldSources: FieldSources = Object.fromEntries(
    Object.entries({
      name: fields.name?.source,
      brand: fields.brand?.source,
      variant: fields.variant?.source,
      packageSize: fields.packageSize?.source,
      image: mine?.photoId ? "parent" : offImage ? "off" : undefined,
      nutrition: nutrition ? (mine?.nutrition ? (mine.fieldSources?.nutrition ?? "off") : "off") : undefined,
    }).filter(([, value]) => value !== undefined),
  );
  const barcodeInfo: BarcodeInfo | undefined = barcode ? { status: barcode.status, sourceName: barcode.source.name, sourceUrl: barcode.source.url, at: barcode.at } : mine?.barcode;

  const pack: VisionPack = {
    recognition: vision?.pack.recognition ?? mine?.recognition,
    alternative: vision?.pack.alternative ?? mine?.alternative,
    brand: kept("brand"),
    packageSize: kept("packageSize"),
    ean: ean ?? mine?.ean,
    barcode: barcodeInfo,
    imageUrl: offImage,
    nutrition,
    fieldSources,
  };

  const exact = barcode?.status === "off-exact" || Boolean(mine);
  const disagree = Boolean(photo?.recognized && differ(photo.brand, mine?.brand ?? found?.brand));
  return {
    name: fields.name?.value ?? match?.name ?? "",
    category,
    icon: match?.id ?? categoryIcon(category),
    match,
    keepPhoto: Boolean(kept("brand")) || Boolean(photo?.specificProduct) || Boolean(ean) || !match,
    fields,
    photoId: mine?.photoId,
    imageUrl: offImage,
    pack,
    ean: pack.ean,
    from: { mine, barcode, photo },
    unsure: disagree || (!exact && (Boolean(barcode) || !photo || needsCheck(photo))),
    confident: !disagree && (exact || !photo || photo.confidence !== "low"),
    recognized: Boolean(mine || found?.name || photo?.recognized),
  };
}
