import type { RawFacts } from "../src/facts.js";

/** Shaped like a Dutch supermarket product page: JSON-LD, a Nutri-Score image and a nutrition table. */
export const SHOP_PAGE = `<!doctype html><html><head><title>AH Terra Pindakaas 100% naturel 350 g</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"AH Terra Pindakaas 100% naturel","brand":{"@type":"Brand","name":"AH Terra"},"weight":"350 g"}</script>
<script>window.tracking = { nutriscore: "e" };</script></head><body>
<h1>AH Terra Pindakaas 100% naturel</h1><img src="/static/nutriscore-b.svg" alt="Nutri-Score B">
<ul><li>Zonder toegevoegd suiker</li><li>Zonder toegevoegd zout</li><li>Vegan</li></ul>
<h2>Ingrediënten</h2><p>Pinda's (100%).</p><p>Allergie-informatie: Bevat: pinda's</p>
<h2>Voedingswaarden</h2><table><tr><th>Per 100 g</th></tr><tr><td>Energie</td><td>2563 kJ (618 kcal)</td></tr>
<tr><td>Vet</td><td>51,3 g</td></tr><tr><td>Waarvan verzadigd</td><td>7,9 g</td></tr><tr><td>Koolhydraten</td><td>11 g</td></tr>
<tr><td>Waarvan suikers</td><td>5,2 g</td></tr><tr><td>Voedingsvezel</td><td>8,1 g</td></tr><tr><td>Eiwitten</td><td>25,8 g</td></tr><tr><td>Zout</td><td>0,01 g</td></tr></table>
<footer>Klantenservice</footer></body></html>`;

export const raw = (overrides: Partial<RawFacts> = {}): RawFacts => ({
  sameProduct: true,
  nutriScore: "B",
  per100Unit: "g",
  energyKcal: 618,
  fat: 51.3,
  saturatedFat: 7.9,
  sugars: 5.2,
  fibre: 8.1,
  protein: 25.8,
  salt: 0.01,
  ingredients: "Pinda's (100%).",
  allergens: ["pinda's"],
  claims: ["Zonder toegevoegd suiker", "Vegan"],
  quantity: "350 g",
  ...overrides,
});
