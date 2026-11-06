import { productById } from "../data/catalog";
import type { CategoryId, Product } from "./types";

/**
 * Open Food Facts category tags mapped to Karrie catalog products.
 * More specific tags come first. Only exact tags count: a product is never
 * matched on its name or on a loose word overlap.
 */
const TYPE_RULES: [tag: string, productId: string][] = [
  ["en:wholemeal-breads", "volkorenbrood"],
  ["en:baguettes", "stokbrood"],
  ["en:croissants", "croissant"],
  ["en:rusks", "beschuit"],
  ["en:crackers", "crackers"],
  ["en:pitas", "pita"],
  ["en:tortillas", "wraps"],
  ["en:wraps", "wraps"],
  ["en:bread-rolls", "bolletjes"],
  ["en:frozen-breads", "diepvriesbrood"],
  ["en:breads", "brood"],
  ["en:buttermilks", "karnemelk"],
  ["en:milks", "melk"],
  ["en:quarks", "kwark"],
  ["en:yogurts", "yoghurt"],
  ["en:cream-cheeses", "roomkaas"],
  ["en:cheeses", "kaas"],
  ["en:butters", "boter"],
  ["en:chicken-eggs", "eieren"],
  ["en:eggs", "eieren"],
  ["en:whipping-creams", "slagroom"],
  ["en:whipped-creams", "slagroom"],
  ["en:custards", "vla"],
  ["en:peanut-butters", "pindakaas"],
  ["en:jams", "jam"],
  ["en:chocolate-sprinkles", "hagelslag"],
  ["en:sprinkles", "hagelslag"],
  ["en:mueslis", "muesli"],
  ["en:breakfast-cereals", "ontbijtgranen"],
  ["en:pastas", "pasta"],
  ["en:rices", "rijst"],
  ["en:rolled-oats", "havermout"],
  ["en:oat-flakes", "havermout"],
  ["en:tomato-pastes", "tomatenpuree"],
  ["en:pasta-sauces", "pastasaus"],
  ["en:soups", "soep"],
  ["en:olive-oils", "olijfolie"],
  ["en:wheat-flours", "bloem"],
  ["en:flours", "bloem"],
  ["en:sugars", "suiker"],
  ["en:coffees", "koffie"],
  ["en:teas", "thee"],
  ["en:biscuits", "koekjes"],
  ["en:cookies", "koekjes"],
  ["en:crisps", "chips"],
  ["en:potato-crisps", "chips"],
  ["en:sweet-corns", "mais"],
  ["en:honeys", "honing"],
  ["en:orange-juices", "sinaasappelsap"],
  ["en:mineral-waters", "water"],
  ["en:spring-waters", "water"],
  ["en:waters", "water"],
  ["en:chicken-breasts", "kipfilet"],
  ["en:minced-meats", "gehakt"],
  ["en:salmons", "zalm"],
  ["en:frozen-peas", "doperwten"],
  ["en:peas", "doperwten"],
  ["en:ice-creams", "ijs"],
  ["en:pizzas", "pizza"],
  ["en:fish-fingers", "vissticks"],
  ["en:spinachs", "spinazie"],
  ["en:french-fries", "friet"],
  ["en:frozen-berries", "bessen"],
  ["en:apples", "appel"],
  ["en:bananas", "banaan"],
  ["en:pears", "peer"],
  ["en:oranges", "sinaasappel"],
  ["en:strawberries", "aardbei"],
  ["en:grapes", "druiven"],
  ["en:clementines", "mandarijn"],
  ["en:mandarins", "mandarijn"],
  ["en:lemons", "citroen"],
  ["en:kiwis", "kiwi"],
  ["en:tomatoes", "tomaat"],
  ["en:cucumbers", "komkommer"],
  ["en:sweet-peppers", "paprika"],
  ["en:carrots", "wortel"],
  ["en:broccoli", "broccoli"],
  ["en:lettuces", "sla"],
  ["en:avocados", "avocado"],
  ["en:potatoes", "aardappel"],
  ["en:onions", "ui"],
  ["en:mushrooms", "champignons"],
  ["en:courgettes", "courgette"],
  ["en:green-beans", "sperziebonen"],
  ["en:leeks", "prei"],
];

const CATEGORY_RULES: [tag: string, category: CategoryId][] = [
  ["en:frozen-foods", "frozen"],
  ["en:dairies", "dairy"],
  ["en:meats", "dairy"],
  ["en:fishes", "dairy"],
  ["en:fresh-fruits", "produce"],
  ["en:fresh-vegetables", "produce"],
  ["en:breads", "bakery"],
  ["en:viennoiseries", "bakery"],
  ["en:pastries", "bakery"],
];

export const TYPE_RULE_PRODUCT_IDS = [...new Set(TYPE_RULES.map(([, id]) => id))];

function matchingRules(tags: string[]) {
  const present = new Set(tags);
  return TYPE_RULES.filter(([tag]) => present.has(tag));
}

/** The most specific catalog product for a set of tags, if any. */
export function matchType(product: { categoryTags: string[] }): Product | null {
  const rule = matchingRules(product.categoryTags)[0];
  return rule ? productById(rule[1]) ?? null : null;
}

/** Every catalog product group the tags could stand for. */
export function typeGroups(tags: string[]): Set<string> {
  return new Set(
    matchingRules(tags)
      .map(([, id]) => productById(id)?.groupId)
      .filter((group): group is string => Boolean(group)),
  );
}

/** Conservative check for a generic list item: an exact tag must point into the same product group. */
export function matchesItemType(product: { categoryTags: string[] }, productId: string): boolean {
  const group = productById(productId)?.groupId;
  return Boolean(group) && typeGroups(product.categoryTags).has(group!);
}

export function mapCategory(tags: string[]): CategoryId {
  if (tags.includes("en:frozen-foods")) return "frozen";
  const typed = matchType({ categoryTags: tags });
  if (typed) return typed.category;
  const present = new Set(tags);
  return CATEGORY_RULES.find(([tag]) => present.has(tag))?.[1] ?? "pantry";
}
