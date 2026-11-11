import { isCategoryId } from "../domain/categories";
import type { CategoryId, Product } from "../domain/types";

function product(id: string, name: string, category: CategoryId, groupId: string, aliases: string[] = [], illustration?: string): Product {
  return { id, name, category, groupId, aliases, ...(illustration && { illustration }) };
}

export const products: Product[] = [
  product("appel", "Appel", "produce", "apples", ["appels", "apple"]),
  product("banaan", "Banaan", "produce", "bananas", ["bananen", "banana"]),
  product("peer", "Peer", "produce", "pears", ["peren"]),
  product("sinaasappel", "Sinaasappel", "produce", "oranges", ["sinaasappels", "appelsien"]),
  product("aardbei", "Aardbei", "produce", "strawberries", ["aardbeien"]),
  product("druiven", "Druiven", "produce", "grapes", ["druif"]),
  product("mandarijn", "Mandarijn", "produce", "mandarins", ["mandarijnen", "clementine", "clementines"]),
  product("citroen", "Citroen", "produce", "lemons", ["citroenen"]),
  product("kiwi", "Kiwi", "produce", "kiwi", ["kiwi's", "kiwis"]),
  product("tomaat", "Tomaat", "produce", "tomatoes", ["tomaten"]),
  product("komkommer", "Komkommer", "produce", "cucumbers", ["komkommers"]),
  product("paprika", "Paprika", "produce", "peppers", ["paprikas", "paprika's"]),
  product("wortel", "Wortel", "produce", "carrots", ["wortels", "worteltjes"]),
  product("broccoli", "Broccoli", "produce", "broccoli"),
  product("sla", "Sla", "produce", "lettuce", ["kropsla", "krop sla"]),
  product("avocado", "Avocado", "produce", "avocado", ["avocados", "avocado's"]),
  product("aardappel", "Aardappel", "produce", "potatoes", ["aardappelen", "aardappels"]),
  product("aardappeltjes", "Aardappeltjes", "produce", "baby-potatoes", ["krieltjes", "gesneden aardappelen", "gesneden aardappels"]),
  product("ui", "Ui", "produce", "onions", ["uien"]),
  product("knoflook", "Knoflook", "produce", "garlic", ["look"]),
  product("champignons", "Champignons", "produce", "mushrooms", ["champignon"]),
  product("courgette", "Courgette", "produce", "zucchini", ["courgettes"]),
  product("aubergine", "Aubergine", "produce", "aubergine", ["aubergines"]),
  product("sperziebonen", "Sperziebonen", "produce", "green-beans", ["sperzieboon", "bonen"]),
  product("prei", "Prei", "produce", "leek", ["preien"]),
  product("verse-spinazie", "Verse spinazie", "produce", "fresh-spinach", ["spinazie vers", "verse spinazie"]),
  product("wokgroenten", "Wokgroenten", "produce", "wok-veg", ["wokgroente"]),
  product("pastagroenten", "Pastagroenten", "produce", "pasta-veg"),
  product("brood", "Brood", "bakery", "bread", ["witbrood", "casino", "volkorenbrood", "volkoren brood", "volkoren"]),
  product("bolletjes", "Bolletjes", "bakery", "rolls", ["bolletje", "broodjes", "kadetjes"]),
  product("krentenbollen", "Krentenbollen", "bakery", "currant-buns", ["krentenbol", "krenten broodjes"]),
  product("croissant", "Croissant", "bakery", "croissant", ["croissants"]),
  product("stokbrood", "Stokbrood", "bakery", "baguette", ["stokbroden"]),
  product("kipfilet", "Kipfilet", "meat", "chicken", ["kip"]),
  product("gehakt", "Gehakt", "meat", "mince", ["half om half"]),
  product("zalm", "Zalm", "meat", "salmon"),
  product("vegaburger", "Vegaburger", "meat", "vega-burger", ["vegetarische burger", "plantburger", "vega burger"]),
  product("beschuit", "Beschuit", "breakfast", "rusk", ["beschuiten"]),
  product("crackers", "Crackers", "breakfast", "crackers", ["cracker"]),
  product("havermout", "Havermout", "breakfast", "oats", ["havervlokken"]),
  product("pindakaas", "Pindakaas", "breakfast", "peanut-butter"),
  product("noten", "Noten", "snacks", "nuts", ["ongezouten noten", "gezouten noten", "pinda's", "amandelen"]),
  product("jam", "Jam", "breakfast", "jam", ["confituur", "aardbeienjam"]),
  product("hagelslag", "Hagelslag", "breakfast", "sprinkles"),
  product("muesli", "Muesli", "breakfast", "cereal", ["cruesli"]),
  product("honing", "Honing", "breakfast", "honey"),
  product("appelstroop", "Appelstroop", "breakfast", "apple-syrup"),
  product("pasta", "Pasta", "pantry", "pasta", ["spaghetti", "macaroni", "penne"]),
  product("rijst", "Rijst", "pantry", "rice"),
  product("tomatenpuree", "Tomatenpuree", "pantry", "tomato-paste", ["tomatenpure"]),
  product("soep", "Soep", "pantry", "soup", ["soepblik", "tomatensoep"]),
  product("olijfolie", "Olijfolie", "pantry", "olive-oil", ["olie"]),
  product("bloem", "Bloem", "pantry", "flour", ["tarwebloem"]),
  product("suiker", "Suiker", "pantry", "sugar"),
  product("koekjes", "Koekjes", "snacks", "cookies", ["koek", "biscuit", "biscuits"]),
  product("chips", "Chips", "snacks", "crisps", ["chipjes"]),
  product("chocoladereep", "Chocoladereep", "snacks", "chocolate-bar", ["chocolade", "chocola", "reep"], "koekjes"),
  product("ontbijtkoek", "Ontbijtkoek", "breakfast", "breakfast-cake", ["peperkoek"], "koekjes"),
  product("pastasaus", "Pastasaus", "pantry", "pasta-sauce", ["pastasausje", "saus"]),
  product("mais", "Mais", "pantry", "corn", ["maïs", "maisblik"]),
  product("augurk", "Augurk", "pantry", "pickle", ["augurken", "zure bom"]),
  product("olijven", "Olijven", "pantry", "olives", ["olijf"]),
  product("babyvoeding", "Babyvoeding", "pantry", "baby-food", ["babypotje", "olvarit", "potje"]),
  product("melk", "Melk", "dairy", "milk", ["melkpak", "halfvolle melk"]),
  product("yoghurt", "Yoghurt", "dairy", "yogurt", ["yogurt"]),
  product("kwark", "Kwark", "dairy", "yogurt"),
  product("kaas", "Kaas", "deli", "cheese", ["kaasplakken"]),
  product("ham", "Ham", "deli", "ham", ["achterham", "beenham", "kipfilet plakken"], "kipfilet"),
  product("salami", "Salami", "deli", "salami", [], "kipfilet"),
  product("mozzarella", "Mozzarella", "deli", "mozzarella", ["mozarella"]),
  product("feta", "Feta", "deli", "feta"),
  product("boter", "Boter", "dairy", "butter"),
  product("eieren", "Eieren", "dairy", "eggs", ["ei", "eierdoos"]),
  product("vla", "Vla", "dairy", "custard", ["vanillevla"]),
  product("karnemelk", "Karnemelk", "dairy", "milk"),
  product("roomkaas", "Roomkaas", "dairy", "cream-cheese"),
  product("koffie", "Koffie", "drinks", "coffee"),
  product("thee", "Thee", "drinks", "tea", ["theezakjes"]),
  product("sinaasappelsap", "Sinaasappelsap", "drinks", "juice", ["sap", "jus"]),
  product("water", "Water", "drinks", "water", ["bronwater", "spa"]),
  product("drinkpakje", "Drinkpakje", "drinks", "drink-carton", ["drinkyoghurt", "pakje"]),
  product("frisdrank", "Frisdrank", "drinks", "soda", ["cola", "limonade", "sinas"]),
  product("siroop", "Siroop", "drinks", "syrup", ["ranja"]),
  product("ijs", "IJs", "frozen", "ice-cream", ["ijsje", "roomijs"]),
  product("pizza", "Pizza", "frozen", "pizza", ["diepvriespizza"]),
  product("vissticks", "Vissticks", "frozen", "fish-sticks", ["visstick"]),
  product("spinazie", "Spinazie", "frozen", "spinach", ["diepvriesspinazie"]),
  product("bessen", "Bessen", "frozen", "berries", ["bosbessen", "diepvriesfruit"]),
  product("kant-en-klaar", "Kant-en-klaar", "frozen", "ready-meal", ["ovenschotel", "diepvriesmaaltijd"]),
  product("maaltijdsalade", "Maaltijdsalade", "meals", "meal-salad", ["maaltijd salade", "salade maaltijd"], "sla"),
  product("eiersalade", "Eiersalade", "deli", "egg-salad", ["eiersla"], "eieren"),
  product("toiletpapier", "Toiletpapier", "household", "toilet-paper", ["wc papier", "wc-papier"]),
  product("keukenpapier", "Keukenpapier", "household", "kitchen-roll", ["keukenrol"]),
  product("afwasmiddel", "Afwasmiddel", "household", "dish-soap", ["afwas"]),
  product("wasmiddel", "Wasmiddel", "household", "detergent", ["waspoeder"]),
  product("vuilniszakken", "Vuilniszakken", "household", "trash-bags", ["vuilniszak", "pedaalzakken"]),
  product("schoonmaakmiddel", "Schoonmaakmiddel", "household", "cleaner", ["allesreiniger"]),
  product("vaatwastabletten", "Vaatwastabletten", "household", "dishwasher", ["vaatwastablet", "vaatwas"]),
  product("handzeep", "Handzeep", "care", "soap", ["zeep"]),
  product("tandpasta", "Tandpasta", "care", "toothpaste"),
  product("shampoo", "Shampoo", "care", "shampoo"),
  product("luiers", "Luiers", "care", "diapers", ["luier"]),
];

export function productById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

/** Drawing id for a product: shared catalog rows may point at a bundled illustration. */
export function artIdOf(product: Pick<Product, "id" | "illustration">): string {
  return product.illustration ?? product.id;
}

const BUNDLED_IDS = new Set(products.map((entry) => entry.id));

export type SharedCatalogProduct = {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  illustrationKey?: string;
  deprecated?: boolean;
  updatedAt?: string;
};

/**
 * Merges approved shared products into the live catalog array in place.
 * Bundled ids are never removed or renamed; deprecated shared ids are dropped.
 */
export function extendCatalog(list: SharedCatalogProduct[]): void {
  for (let index = products.length - 1; index >= 0; index -= 1) {
    if (!BUNDLED_IDS.has(products[index].id)) products.splice(index, 1);
  }
  for (const entry of list) {
    if (entry.deprecated || BUNDLED_IDS.has(entry.id) || !isCategoryId(entry.category)) continue;
    products.push({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      groupId: entry.id,
      aliases: entry.aliases.filter((alias) => typeof alias === "string"),
      ...(entry.illustrationKey && { illustration: entry.illustrationKey }),
    });
  }
}
