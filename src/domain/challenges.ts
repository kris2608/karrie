import type { CategoryId } from "./types";

/** A small search idea while collecting at home. Matched on catalog ids or the shop category only; never scored. */
export type Challenge = { id: string; text: string; ids?: string[]; categories?: CategoryId[] };

export const CHALLENGES: Challenge[] = [
  { id: "fruit", text: "Zoek iets uit de fruitmand!", ids: ["appel", "banaan", "peer", "sinaasappel", "aardbei", "druiven", "mandarijn", "citroen", "kiwi", "avocado"] },
  { id: "fridge", text: "Zoek iets uit de koelkast!", categories: ["dairy"] },
  {
    id: "breakfast",
    text: "Zoek iets voor het ontbijt!",
    ids: ["brood", "volkorenbrood", "bolletjes", "croissant", "beschuit", "crackers", "havermout", "pindakaas", "jam", "hagelslag", "ontbijtgranen", "muesli", "honing", "sinaasappelsap", "melk", "yoghurt", "kaas", "boter", "eieren"],
  },
  { id: "veggie", text: "Zoek een groente!", ids: ["tomaat", "komkommer", "paprika", "wortel", "broccoli", "sla", "aardappel", "ui", "champignons", "courgette", "sperziebonen", "prei", "spinazie", "doperwten"] },
  { id: "drink", text: "Zoek iets om te drinken!", ids: ["melk", "karnemelk", "water", "sinaasappelsap", "koffie", "thee"] },
];

/** The same idea for the same progress, so a rerender or reopen never shuffles it. */
export function challengeFor(count: number): Challenge {
  return CHALLENGES[count % CHALLENGES.length];
}

export function fitsChallenge(challenge: Challenge, product: { productId?: string; category: CategoryId }): boolean {
  if (product.productId && challenge.ids?.includes(product.productId)) return true;
  return Boolean(challenge.categories?.includes(product.category));
}
