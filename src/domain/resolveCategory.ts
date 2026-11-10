import type { CategoryId } from "./types";

/** PrijsProfeet unified categories with one clear shop department. */
const PP_DEPARTMENT: Record<string, CategoryId> = {
  "groente-fruit": "produce",
  "zuivel-eieren": "dairy",
  kaas: "dairy",
  vlees: "meat",
  vis: "meat",
  vega: "meat",
  "brood-bakkerij": "bakery",
  ontbijt: "breakfast",
  "pasta-rijst-wereldkeuken": "pantry",
  "soepen-conserven-sauzen": "pantry",
  "snoep-koek-chips": "pantry",
  frisdrank: "drinks",
  "koffie-thee": "drinks",
  bier: "drinks",
  wijn: "drinks",
  "sterke-drank": "drinks",
  "bier-wijn-sterke-drank": "drinks",
  diepvries: "frozen",
  huishouden: "household",
  drogisterij: "household",
  huidverzorging: "household",
  haarverzorging: "household",
  deodorant: "household",
  mondverzorging: "household",
  "baby-kind": "household",
  huisdier: "household",
};

/** Open Food Facts `en:` tags (and mixed joined text) that clearly place a product. */
const TAG_CATEGORY: [RegExp, CategoryId][] = [
  [/^en:frozen-/, "frozen"],
  [/en:(beverages?|drinks?|sodas?|soft-drinks?|carbonated-drinks?|colas?|lemonades?|waters?|spring-waters?|mineral-waters?|fruit-juices?|juices?|nectars?|coffees?|teas?|plant-based-beverages?|energy-drinks?|sports-drinks?|beers?|wines?|spirits?)/, "drinks"],
  [/^en:(dairies|dairy-|milks?|yogurts?|cheeses?|eggs|creams?|fresh-desserts|custards?|puddings?)/, "dairy"],
  [/^en:(breads|pastries|cakes|viennoiseries)$/, "bakery"],
  [/^en:(fresh-fruits|fresh-vegetables)$/, "produce"],
  [/^en:(meats?|fresh-meats?|poultries?|fishes?|seafood)/, "meat"],
  [/^en:(breakfast-cereals|jams?|honeys?)/, "breakfast"],
  [/^en:(non-food-products|household-products|cleaning-products|detergents)$/, "household"],
];

const DAIRY_NAME = /\b(vla|yoghurt|yogurt|kwark|karnemelk|slagroom|drinkyoghurt|roomkaas)\b/i;
const DRINK_NAME =
  /\b(cola|frisdrank|limonade|sinas|sap|jus|sinaasappelsap|appelsap|water|bronwater|spa|koffie|thee|bier|wijn|ranja|siroop|iced\s*tea|energydrink|energy\s*drink)\b/i;
const FROZEN_NAME = /\b(diepvries|ijsjes?|ijslolly|pizza\s*diepvries)\b/i;

export type ResolveCategoryInput = { tags?: string[]; name?: string };

/** Map PP slugs, OFF tags, and clear Dutch names to a shop department. Never invents pantry. */
export function resolveCategory({ tags, name }: ResolveCategoryInput): CategoryId | undefined {
  if (tags?.length) {
    for (const tag of tags) {
      const slug = PP_DEPARTMENT[tag];
      if (slug) return slug;
    }
    const joined = tags.join(" ").toLowerCase();
    if (/frisdrank|koffie-thee|\bbier\b|wijn|sterke-drank/.test(joined)) return "drinks";
    if (/zuivel|groente-fruit|diepvries|huishouden/.test(joined)) {
      for (const tag of tags) {
        const slug = PP_DEPARTMENT[tag];
        if (slug) return slug;
      }
    }
    for (const [pattern, category] of TAG_CATEGORY) {
      if (tags.some((tag) => pattern.test(tag)) || pattern.test(joined)) return category;
    }
    if (/drink|beverage|frisdrank|sap|water|koffie|thee/.test(joined)) return "drinks";
    if (/dairy|zuivel|milk|yoghurt|kaas|cheese/.test(joined)) return "dairy";
    if (/frozen|diepvries|ijs/.test(joined)) return "frozen";
    if (/fruit|vegetable|groente|produce/.test(joined)) return "produce";
    if (/bread|bakery|brood/.test(joined)) return "bakery";
    if (/meat|vlees|vis|fish/.test(joined)) return "meat";
    if (/breakfast|ontbijt|jam|hagelslag/.test(joined)) return "breakfast";
    if (/household|schoonmaak|hygiene|drogist/.test(joined)) return "household";
  }
  if (name) {
    if (DRINK_NAME.test(name)) return "drinks";
    if (DAIRY_NAME.test(name)) return "dairy";
    if (FROZEN_NAME.test(name)) return "frozen";
  }
  return undefined;
}

export function categoryFromTags(tags: string[] | undefined): CategoryId | undefined {
  return resolveCategory({ tags });
}

export function categoryFromName(name: string | undefined): CategoryId | undefined {
  return name ? resolveCategory({ name }) : undefined;
}

export function categoryOf(unified: string | undefined): CategoryId | undefined {
  return unified && Object.hasOwn(PP_DEPARTMENT, unified) ? PP_DEPARTMENT[unified] : undefined;
}
