import { PRODUCT_CATEGORIES, type ProductCategory } from "./offers/match.js";

/** PrijsProfeet unified categories with one clear shop department. */
const PP_DEPARTMENT: Record<string, ProductCategory> = {
  "groente-fruit": "produce",
  "zuivel-eieren": "dairy",
  kaas: "deli",
  vlees: "meat",
  vis: "meat",
  vega: "meat",
  "brood-bakkerij": "bakery",
  ontbijt: "breakfast",
  "pasta-rijst-wereldkeuken": "pantry",
  "soepen-conserven-sauzen": "pantry",
  "snoep-koek-chips": "snacks",
  frisdrank: "drinks",
  "koffie-thee": "drinks",
  bier: "drinks",
  wijn: "drinks",
  "sterke-drank": "drinks",
  "bier-wijn-sterke-drank": "drinks",
  diepvries: "frozen",
  maaltijden: "meals",
  huishouden: "household",
  drogisterij: "care",
  huidverzorging: "care",
  haarverzorging: "care",
  deodorant: "care",
  mondverzorging: "care",
  "baby-kind": "care",
  huisdier: "household",
};

/** Open Food Facts `en:` tags (and mixed joined text) that clearly place a product. */
const TAG_CATEGORY: [RegExp, ProductCategory][] = [
  [/^en:frozen-/, "frozen"],
  [/en:(beverages?|drinks?|sodas?|soft-drinks?|carbonated-drinks?|colas?|lemonades?|waters?|spring-waters?|mineral-waters?|fruit-juices?|juices?|nectars?|coffees?|teas?|plant-based-beverages?|energy-drinks?|sports-drinks?|beers?|wines?|spirits?)/, "drinks"],
  [/^en:(milks?|yogurts?|eggs|creams?|fresh-desserts|custards?|puddings?)/, "dairy"],
  [/^en:(cheeses?|hams?|sausages?|cured-meats?)/, "deli"],
  [/^en:(breads|pastries|cakes|viennoiseries)$/, "bakery"],
  [/^en:(prepared-salads|prepared-meals|meals|baby-foods?)/, "meals"],
  [/^en:(fresh-fruits|fresh-vegetables)$/, "produce"],
  [/^en:(meats?|fresh-meats?|poultries?|fishes?|seafood)/, "meat"],
  [/^en:(breakfast-cereals|jams?|honeys?)/, "breakfast"],
  [/^en:(chips|crisps|candies|chocolates|cookies|biscuits|salty-snacks)/, "snacks"],
  [/^en:(bodycare|dental-care|shampoos|baby-diapers|personal-care)/, "care"],
  [/^en:(non-food-products|household-products|cleaning-products|detergents)$/, "household"],
];

const DAIRY_NAME = /\b(vla|yoghurt|yogurt|kwark|karnemelk|slagroom|drinkyoghurt|roomkaas|eieren|boter)\b/i;
const DELI_NAME = /\b(kaas|kaasplakken|ham|salami|kipfilet|vleeswaren|filet\s*americain|boterhamworst)\b/i;
const SNACK_NAME = /\b(chips|snoep|chocolade(?!\s*pasta)|chocoladereep|zoutjes|koekjes|drop|winegums)\b/i;
const BREAKFAST_NAME = /\b(ontbijtkoek|peperkoek|hagelslag|pindakaas|chocopasta|chocoladepasta|jam|honing)\b/i;
const CARE_NAME = /\b(tandpasta|shampoo|deodorant|luiers?|douchegel|bodylotion|handzeep)\b/i;
const MEAL_NAME = /\b(maaltijdsalade|maaltijd|kant-en-klaar|eiersalade|huzarensalade|wraps?)\b/i;
const BABY_FOOD_NAME = /\b(olvarit|babyvoeding|babypotje|fruithapje|groentehapje)\b/i;
const DRINK_NAME =
  /\b(cola|frisdrank|limonade|sinas|sap|jus|sinaasappelsap|appelsap|water|bronwater|spa|koffie|thee|bier|wijn|ranja|siroop|iced\s*tea|energydrink|energy\s*drink)\b/i;
const FROZEN_NAME = /\b(diepvries|ijsjes?|ijslolly|pizza\s*diepvries)\b/i;

export type ResolveCategoryInput = { tags?: string[]; name?: string };

/** Map PP slugs, OFF tags, and clear Dutch names to a shop department. Never invents pantry. */
export function resolveCategory({ tags, name }: ResolveCategoryInput): ProductCategory | undefined {
  if (tags?.length) {
    for (const tag of tags) {
      const slug = PP_DEPARTMENT[tag];
      if (slug && PRODUCT_CATEGORIES.includes(slug)) return slug;
    }
    const joined = tags.join(" ").toLowerCase();
    if (/frisdrank|koffie-thee|\bbier\b|wijn|sterke-drank/.test(joined)) return "drinks";
    for (const [pattern, category] of TAG_CATEGORY) {
      if (tags.some((tag) => pattern.test(tag)) || pattern.test(joined)) return category;
    }
    if (/drink|beverage|frisdrank|sap|water|koffie|thee/.test(joined)) return "drinks";
    if (/\bkaas\b|cheese|ham|salami|vleeswaren/.test(joined)) return "deli";
    if (/dairy|zuivel|milk|yoghurt/.test(joined)) return "dairy";
    if (/chips|snoep|chocolate|koek/.test(joined)) return "snacks";
    if (/frozen|diepvries|ijs/.test(joined)) return "frozen";
    if (/fruit|vegetable|groente|produce/.test(joined)) return "produce";
    if (/bread|bakery|brood/.test(joined)) return "bakery";
    if (/meat|vlees|vis|fish/.test(joined)) return "meat";
    if (/breakfast|ontbijt|jam|hagelslag/.test(joined)) return "breakfast";
    if (/verzorging|hygiene|shampoo|tandpasta|drogist/.test(joined)) return "care";
    if (/household|schoonmaak/.test(joined)) return "household";
  }
  if (name) {
    if (BABY_FOOD_NAME.test(name)) return "pantry";
    if (DRINK_NAME.test(name)) return "drinks";
    if (BREAKFAST_NAME.test(name)) return "breakfast";
    if (DELI_NAME.test(name)) return "deli";
    if (CARE_NAME.test(name)) return "care";
    if (MEAL_NAME.test(name)) return "meals";
    if (SNACK_NAME.test(name)) return "snacks";
    if (DAIRY_NAME.test(name)) return "dairy";
    if (FROZEN_NAME.test(name)) return "frozen";
  }
  return undefined;
}

/** The app department for a PrijsProfeet category, when it has one clear place. */
export function categoryOf(unified: string | undefined): ProductCategory | undefined {
  return unified && Object.hasOwn(PP_DEPARTMENT, unified) && PRODUCT_CATEGORIES.includes(PP_DEPARTMENT[unified])
    ? PP_DEPARTMENT[unified]
    : undefined;
}
