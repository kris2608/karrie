// Development-only check of the real PrijsProfeet search through Karrie's own matcher (dist/offers).
// Usage (from server/, after npm run build): node scripts/check-offers.mjs
// Makes about 20 free /search calls, spaced out; uses PRIJSPROFEET_API_KEY from .env when present and prints no secrets.
import { existsSync } from "node:fs";
import { createOfferLookup } from "../dist/offers/index.js";
import { createPrijsProfeet } from "../dist/offers/prijsprofeet.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const PRODUCTS = [
  { name: "Banaan", aliases: ["bananen"], category: "produce", generic: true },
  { name: "Komkommer", aliases: ["komkommers"], category: "produce", generic: true },
  { name: "Melk", aliases: ["halfvolle melk"], category: "dairy", generic: true },
  { name: "Brood", aliases: ["witbrood"], category: "bakery", generic: true },
  { name: "Appel", aliases: ["appels"], category: "produce", generic: true },
  { name: "Kaas", aliases: ["jong belegen kaas"], category: "dairy", generic: true },
  { name: "Biologisch halfvolle melk", brand: "Arla", size: "1 l", category: "dairy", generic: false },
  { name: "Biologisch halfvolle melk", brand: "Arla", size: "1 l", ean: "8718166011021", category: "dairy", generic: false },
];
const RETAILERS = ["jumbo", "albert_heijn", "lidl"];

const provider = createPrijsProfeet({
  userAgent: process.env.PRIJSPROFEET_USER_AGENT || "Karrie/1.0 (+https://karrie.eu)",
  apiKey: process.env.PRIJSPROFEET_API_KEY || undefined,
});
const lookup = createOfferLookup(provider);

for (const retailer of RETAILERS) {
  for (const product of PRODUCTS) {
    const started = Date.now();
    const result = await lookup.find(product, retailer);
    const label = `${retailer.padEnd(13)} ${(product.brand ? `${product.brand} ` : "") + product.name}${product.ean ? " (EAN)" : ""}`;
    if (!result.ok) {
      console.log(`${label.padEnd(60)} error ${result.code}`);
      continue;
    }
    const { match } = result;
    const offer = "offer" in match ? ` -> ${match.offer.productName} | ${match.offer.promotionMechanism ?? "?"} | t/m ${match.offer.validUntil ?? "?"}` : "";
    console.log(`${label.padEnd(60)} ${match.matchType}${"matchConfidence" in match ? `/${match.matchConfidence}` : ""}${offer} (${Date.now() - started} ms)`);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}
console.log(JSON.stringify({ provider: provider.stats(), cache: lookup.stats() }));
