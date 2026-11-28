/**
 * Article, number and template for every catalogue product.
 * `voice-catalog.json` is generated from this table; the grammar test keeps them identical.
 */

export type SpeechArticle = "de" | "het";
export type SpeechNumber = "singular" | "plural" | "mass";
export type SpeechTemplate = "kun" | "zoek" | "waar" | "gaan" | "zoek-jij";

export type SpeechRule = {
  article: SpeechArticle;
  noun: string;
  number: SpeechNumber;
  template: SpeechTemplate;
};

type Row = [id: string, article: SpeechArticle, noun: string, number: SpeechNumber, template: SpeechTemplate];

/** Catalogue order. Plural fruit and packs use a plural noun; mass nouns stay singular. */
const ROWS: readonly Row[] = [
  ["appel", "de", "appels", "plural", "kun"],
  ["banaan", "de", "bananen", "plural", "zoek"],
  ["peer", "de", "peren", "plural", "waar"],
  ["sinaasappel", "de", "sinaasappels", "plural", "gaan"],
  ["aardbei", "de", "aardbeien", "plural", "kun"],
  ["druiven", "de", "druiven", "plural", "gaan"],
  ["mandarijn", "de", "mandarijn", "singular", "waar"],
  ["citroen", "de", "citroen", "singular", "kun"],
  ["kiwi", "de", "kiwi", "singular", "kun"],
  ["tomaat", "de", "tomaten", "plural", "waar"],
  ["komkommer", "de", "komkommer", "singular", "waar"],
  ["paprika", "de", "paprika", "singular", "kun"],
  ["wortel", "de", "wortels", "plural", "gaan"],
  ["broccoli", "de", "broccoli", "singular", "gaan"],
  ["sla", "de", "sla", "singular", "kun"],
  ["avocado", "de", "avocado", "singular", "zoek"],
  ["aardappel", "de", "aardappelen", "plural", "waar"],
  ["aardappeltjes", "de", "aardappeltjes", "plural", "waar"],
  ["ui", "de", "uien", "plural", "kun"],
  ["knoflook", "de", "knoflook", "mass", "gaan"],
  ["champignons", "de", "champignons", "plural", "zoek"],
  ["courgette", "de", "courgette", "singular", "waar"],
  ["aubergine", "de", "aubergine", "singular", "kun"],
  ["sperziebonen", "de", "sperziebonen", "plural", "waar"],
  ["prei", "de", "prei", "singular", "waar"],
  ["verse-spinazie", "de", "verse spinazie", "mass", "zoek"],
  ["wokgroenten", "de", "wokgroenten", "plural", "zoek"],
  ["pastagroenten", "de", "pastagroenten", "plural", "zoek"],
  ["brood", "het", "brood", "singular", "kun"],
  ["bolletjes", "de", "bolletjes", "plural", "kun"],
  ["krentenbollen", "de", "krentenbollen", "plural", "zoek"],
  ["croissant", "de", "croissant", "singular", "waar"],
  ["stokbrood", "het", "stokbrood", "singular", "zoek"],
  ["pistoletjes", "de", "pistoletjes", "plural", "waar"],
  ["kipfilet", "de", "kipfilet", "singular", "waar"],
  ["gehakt", "het", "gehakt", "mass", "kun"],
  ["zalm", "de", "zalm", "mass", "kun"],
  ["vegaburger", "de", "vegaburger", "singular", "waar"],
  ["beschuit", "de", "beschuit", "mass", "zoek"],
  ["crackers", "de", "crackers", "plural", "kun"],
  ["havermout", "de", "havermout", "mass", "zoek"],
  ["pindakaas", "de", "pindakaas", "mass", "zoek-jij"],
  ["noten", "de", "noten", "plural", "kun"],
  ["jam", "de", "jam", "mass", "waar"],
  ["hagelslag", "de", "hagelslag", "mass", "kun"],
  ["muesli", "de", "muesli", "mass", "zoek"],
  ["honing", "de", "honing", "mass", "zoek"],
  ["appelstroop", "de", "appelstroop", "mass", "zoek"],
  ["pasta", "de", "pasta", "mass", "zoek"],
  ["rijst", "de", "rijst", "mass", "kun"],
  ["tomatenpuree", "de", "tomatenpuree", "mass", "zoek"],
  ["soep", "de", "soep", "mass", "zoek"],
  ["olijfolie", "de", "olijfolie", "mass", "gaan"],
  ["suiker", "de", "suiker", "mass", "gaan"],
  ["koekjes", "de", "koekjes", "plural", "waar"],
  ["chips", "de", "chips", "plural", "zoek"],
  ["chocoladereep", "de", "chocoladereep", "singular", "waar"],
  ["ontbijtkoek", "de", "ontbijtkoek", "singular", "kun"],
  ["pastasaus", "de", "pastasaus", "mass", "zoek"],
  ["mais", "de", "mais", "mass", "waar"],
  ["augurk", "de", "augurken", "plural", "zoek"],
  ["olijven", "de", "olijven", "plural", "gaan"],
  ["babyvoeding", "de", "babyvoeding", "mass", "kun"],
  ["melk", "de", "melk", "mass", "waar"],
  ["yoghurt", "de", "yoghurt", "mass", "kun"],
  ["kwark", "de", "kwark", "mass", "waar"],
  ["kaas", "de", "kaas", "mass", "kun"],
  ["ham", "de", "ham", "mass", "kun"],
  ["salami", "de", "salami", "mass", "zoek"],
  ["mozzarella", "de", "mozzarella", "mass", "zoek"],
  ["feta", "de", "feta", "mass", "kun"],
  ["eieren", "de", "eieren", "plural", "waar"],
  ["boter", "de", "boter", "mass", "kun"],
  ["vla", "de", "vla", "mass", "zoek"],
  ["karnemelk", "de", "karnemelk", "mass", "waar"],
  ["roomkaas", "de", "roomkaas", "mass", "zoek"],
  ["slagroom", "de", "slagroom", "mass", "waar"],
  ["koffie", "de", "koffie", "mass", "kun"],
  ["thee", "de", "thee", "mass", "kun"],
  ["sinaasappelsap", "het", "sinaasappelsap", "mass", "gaan"],
  ["water", "het", "water", "mass", "waar"],
  ["drinkpakje", "het", "drinkpakje", "singular", "gaan"],
  ["frisdrank", "de", "frisdrank", "mass", "waar"],
  ["siroop", "de", "siroop", "mass", "kun"],
  ["ijs", "het", "ijs", "mass", "waar"],
  ["pizza", "de", "pizza", "singular", "kun"],
  ["vissticks", "de", "vissticks", "plural", "zoek"],
  ["spinazie", "de", "spinazie", "mass", "zoek"],
  ["bessen", "de", "bessen", "plural", "kun"],
  ["kant-en-klaar", "het", "kant-en-klaarmaaltje", "singular", "waar"],
  ["maaltijdsalade", "de", "maaltijdsalade", "singular", "waar"],
  ["toiletpapier", "het", "toiletpapier", "mass", "kun"],
  ["keukenpapier", "het", "keukenpapier", "mass", "kun"],
  ["afwasmiddel", "het", "afwasmiddel", "mass", "zoek"],
  ["wasmiddel", "het", "wasmiddel", "mass", "kun"],
  ["vuilniszakken", "de", "vuilniszakken", "plural", "waar"],
  ["schoonmaakmiddel", "het", "schoonmaakmiddel", "mass", "zoek"],
  ["vaatwastabletten", "de", "vaatwastabletten", "plural", "kun"],
  ["handzeep", "de", "handzeep", "mass", "gaan"],
  ["tandpasta", "de", "tandpasta", "mass", "kun"],
  ["shampoo", "de", "shampoo", "mass", "zoek"],
  ["luiers", "de", "luiers", "plural", "waar"],
];

export const PRODUCT_SPEECH: Record<string, SpeechRule> = Object.fromEntries(
  ROWS.map(([id, article, noun, number, template]) => [id, { article, noun, number, template }]),
);

const BY_NOUN = new Map<string, SpeechRule>();
for (const rule of Object.values(PRODUCT_SPEECH)) {
  BY_NOUN.set(rule.noun, rule);
}

export function ruleForProduct(productId: string): SpeechRule | undefined {
  return PRODUCT_SPEECH[productId];
}

/** Exact spoken noun from the grammar table, e.g. "mais" or "drinkpakje". */
export function ruleForSpokenNoun(noun: string): SpeechRule | undefined {
  return BY_NOUN.get(noun.trim().toLowerCase());
}

export function instructionFor(rule: SpeechRule): string {
  const nounPhrase = `${rule.article} ${rule.noun}`;
  switch (rule.template) {
    case "kun":
      return `Kun jij ${nounPhrase} vinden?`;
    case "zoek":
      return `Zoek maar ${nounPhrase}!`;
    case "gaan":
      return `Nu gaan we ${nounPhrase} zoeken!`;
    case "zoek-jij":
      return `Zoek jij ${nounPhrase}?`;
    case "waar":
      return rule.number === "plural" ? `Waar zijn ${nounPhrase}?` : `Waar is ${nounPhrase}?`;
    default: {
      const never: never = rule.template;
      return never;
    }
  }
}

export function buildVoiceCatalog(): {
  version: string;
  language: string;
  products: Array<{ productId: string; spokenName: string; instruction: string }>;
} {
  return {
    version: "v6",
    language: "nl-NL",
    products: ROWS.map(([productId, article, noun, number, template]) => ({
      productId,
      spokenName: noun,
      instruction: instructionFor({ article, noun, number, template }),
    })),
  };
}
