import { products } from "../data/catalog";
import type { VisionPack } from "../data/sample";
import type { FoundAnswer } from "../services/barcode/lookup";
import type { RecognizedProduct, RecognitionOutcome, VisualCandidate } from "../services/vision/types";
import { productFromCandidate } from "../services/vision/types";
import { categoryIcon } from "./categoryIcon";
import { normalize } from "./matchProduct";
import { resolveCategory } from "./resolveCategory";
import type { BarcodeInfo, CategoryId, FieldSource, FieldSources, Nutrition, Product, SavedItem } from "./types";
import { draftFromVision, needsCheck } from "./visionMapping";

export { categoryFromName, categoryFromTags, resolveCategory } from "./resolveCategory";

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
  /** Independent sources disagree on pack size; parent should confirm. */
  packConflict?: { choices: string[]; raw: string[] };
  /** Visually distinct products/flavours; parent picks one before add when needsSelection. */
  identityCandidates?: VisualCandidate[];
  recognitionOutcome?: RecognitionOutcome;
  needsSelection?: boolean;
  /** True when the capture showed several products; do not save that photo as this pack's image. */
  omitCapturePhoto?: boolean;
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

/** Only an exact catalog name or alias: "Chocoladereep melk" must not become "melk". */
export function catalogByName(name: string | undefined): Product | null {
  const wanted = name ? normalize(name) : "";
  return (wanted && products.find((product) => [product.name, ...product.aliases].some((alias) => normalize(alias) === wanted))) || null;
}

/**
 * Nutri-Score and per-100g from the barcode product payload.
 * The server only places these fields from Open Food Facts (including on PP-primary web-page answers).
 */
export function nutritionOf(answer: FoundAnswer | undefined): Nutrition | undefined {
  if (!answer?.product) return undefined;
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
  const wantPhoto = !draft || draft.keepPhoto || !matched;
  return {
    item: { name, category, icon: matched ? matched.id : categoryIcon(category), productId: matched?.id, pack: draft?.pack, via },
    // A multi-product capture must not become the chosen pack's personal photo.
    withPhoto: wantPhoto && !draft?.omitCapturePhoto,
  };
}

export type DraftInput = {
  ean?: string;
  mine?: SavedItem;
  barcode?: FoundAnswer;
  photo?: RecognizedProduct;
  identityCandidates?: VisualCandidate[];
  recognitionOutcome?: RecognitionOutcome;
  needsSelection?: boolean;
};

/**
 * Rebuild a draft after the parent picks one visual candidate. Only the selected candidate is kept;
 * speculative siblings are dropped so they are never persisted.
 */
export function selectIdentityCandidate(draft: ProductDraft, candidateId: string): ProductDraft {
  const candidate = draft.identityCandidates?.find((entry) => entry.observedCandidateId === candidateId);
  if (!candidate) return draft;
  const fromMulti = Boolean(draft.needsSelection && (draft.identityCandidates?.length ?? 0) > 1);
  const photo = productFromCandidate(candidate);
  const next = mergeDraft({
    // A neighbouring barcode must not stick to a differently chosen flavour.
    ean: fromMulti ? undefined : draft.ean,
    mine: fromMulti ? undefined : draft.from.mine,
    barcode: fromMulti ? undefined : draft.from.barcode,
    photo,
    identityCandidates: [candidate],
    recognitionOutcome: "single",
    needsSelection: false,
  });
  return {
    ...next,
    // Prefer the selected candidate's own identity image; never keep another product's evidence.
    imageUrl: candidate.imageUrl ?? next.imageUrl,
    omitCapturePhoto: fromMulti || draft.omitCapturePhoto,
    fields: {
      ...next.fields,
      ...(candidate.productName || candidate.genericName
        ? { name: { value: (candidate.productName || candidate.genericName)!, source: "photo", verified: false } }
        : {}),
      ...(candidate.brand ? { brand: { value: candidate.brand, source: "photo", verified: false } } : {}),
      ...(candidate.variant ? { variant: { value: candidate.variant, source: "photo", verified: false } } : {}),
      ...(candidate.packageSize ? { packageSize: { value: candidate.packageSize, source: "photo", verified: false } } : {}),
    },
    name: candidate.productName || candidate.genericName || next.name,
    pack: {
      ...next.pack,
      brand: candidate.brand ?? undefined,
      packageSize: candidate.packageSize ?? undefined,
      ...(candidate.catalogProductId && { catalogProductId: candidate.catalogProductId }),
      ...(candidate.imageUrl && { imageUrl: candidate.imageUrl }),
      recognition: {
        ...next.pack.recognition,
        genericName: candidate.genericName ?? undefined,
        variant: candidate.variant ?? undefined,
        subcategory: candidate.subcategory ?? undefined,
        // Candidate-specific: do not inherit primary claims/ingredients/nutri/alternative.
        claims: undefined,
        nutriScoreSeen: undefined,
        ingredientsSeen: undefined,
        confidence: candidate.confidence,
        inferred: candidate.inferredFields.length ? candidate.inferredFields : undefined,
        specific: candidate.specificProduct,
        eanCandidate: candidate.ean ?? undefined,
      },
      alternative: undefined,
      ingredients: undefined,
      nutrition: undefined,
    },
  };
}

export function mergeDraft({ ean, mine, barcode, photo, identityCandidates, recognitionOutcome, needsSelection }: DraftInput): ProductDraft {
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
  const fromBarcode =
    barcode?.department ??
    resolveCategory({ tags: found?.categories, name: found?.name ?? fields.name?.value });
  const category = mine?.category ?? fromBarcode ?? vision?.category ?? match?.category ?? "pantry";
  const offImage = mine?.imageSource === "off" ? mine.imageUrl : found?.imageUrl;
  const nutrition = mine?.nutrition ?? nutritionOf(barcode);
  const fromBarcodeIngredients = barcode?.product.ingredients?.trim().slice(0, 600) || undefined;
  const ingredients = mine?.ingredients ?? fromBarcodeIngredients ?? vision?.pack.recognition?.ingredientsSeen;
  const kept = (name: FieldName) => {
    const field = fields[name];
    return field && field.source !== "guess" ? field.value : undefined;
  };
  const barcodeInfo: BarcodeInfo | undefined = barcode ? { status: barcode.status, sourceName: barcode.source.name, sourceUrl: barcode.source.url, at: barcode.at } : mine?.barcode;

  const packConflict = packConflictOf(barcode);
  const choose = Boolean(needsSelection && identityCandidates && identityCandidates.length > 1);
  const primaryCandidate = !choose && identityCandidates?.length === 1 ? identityCandidates[0] : undefined;
  const catalogProductId =
    barcode?.catalogProductId ?? mine?.catalogProductId ?? primaryCandidate?.catalogProductId;
  const catalogVariantId = barcode?.catalogVariantId ?? mine?.catalogVariantId;
  const candidateImage = primaryCandidate?.imageUrl;
  const fieldSources: FieldSources = Object.fromEntries(
    Object.entries({
      name: fields.name?.source,
      brand: fields.brand?.source,
      variant: fields.variant?.source,
      packageSize: fields.packageSize?.source,
      image: mine?.photoId ? "parent" : offImage || candidateImage ? "off" : undefined,
      nutrition: nutrition ? (mine?.nutrition ? (mine.fieldSources?.nutrition ?? "off") : "off") : undefined,
    }).filter(([, value]) => value !== undefined),
  );
  const pack: VisionPack = {
    recognition: vision?.pack.recognition ?? mine?.recognition,
    alternative: vision?.pack.alternative ?? mine?.alternative,
    brand: kept("brand"),
    packageSize: kept("packageSize"),
    ean: ean ?? mine?.ean,
    barcode: barcodeInfo,
    imageUrl: offImage ?? candidateImage,
    ...(catalogProductId && { catalogProductId }),
    ...(catalogVariantId && { catalogVariantId }),
    nutrition,
    ...(ingredients && { ingredients }),
    fieldSources,
    ...(packConflict && { packConflict }),
  };

  // Identity is trusted from OFF exact, a clean PP/web hit (name+brand), or mine — OFF is not required for certainty.
  const trustedIdentity =
    Boolean(mine) ||
    barcode?.status === "off-exact" ||
    (barcode?.status === "web-page" && Boolean(found?.name && found?.brand));
  const disagree = Boolean(photo?.recognized && differ(photo.brand, mine?.brand ?? found?.brand));
  return {
    name: fields.name?.value ?? match?.name ?? "",
    category,
    icon: match?.id ?? categoryIcon(category),
    match,
    keepPhoto: Boolean(kept("brand")) || Boolean(photo?.specificProduct) || Boolean(ean) || !match,
    fields,
    photoId: mine?.photoId,
    imageUrl: offImage ?? candidateImage,
    pack,
    ean: pack.ean,
    from: { mine, barcode, photo },
    unsure: choose || disagree || Boolean(packConflict) || (!trustedIdentity && (Boolean(barcode) || !photo || needsCheck(photo))),
    confident: !choose && !disagree && !packConflict && (trustedIdentity || !photo || photo.confidence !== "low"),
    recognized: Boolean(mine || found?.name || photo?.recognized),
    ...(packConflict && { packConflict }),
    ...(identityCandidates && identityCandidates.length > 0 && { identityCandidates }),
    ...(recognitionOutcome && { recognitionOutcome }),
    ...(typeof needsSelection === "boolean" && { needsSelection }),
  };
}

function packConflictOf(barcode?: FoundAnswer): ProductDraft["packConflict"] {
  const pack = barcode?.pack;
  if (!pack?.conflict) return undefined;
  const raw = pack.sources.map((entry) => entry.quantityRaw).filter((value): value is string => Boolean(value));
  const unique = [...new Set(raw)];
  if (unique.length < 2) return undefined;
  return { raw: unique, choices: unique.map(formatPackChoice) };
}

function formatPackChoice(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim().toLowerCase();
  if (/^(1|1\.0)\s*l(iter)?s?$/.test(normalized) || normalized === "1000 ml") return "1 liter";
  return raw.replace(/\s+/g, " ").trim();
}
