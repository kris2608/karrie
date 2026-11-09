/**
 * Read-only coverage of Postgres nutrition/ingredient facts for healthier-alternative planning.
 * Usage (from server/): node scripts/diagnose-product-facts.mjs
 * Needs CANDIDATES_DATABASE_URL. Prints counts only — never GTINs, names, or connection strings.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.CANDIDATES_DATABASE_URL;
if (!url) {
  console.log(JSON.stringify({ status: "skipped", reason: "CANDIDATES_DATABASE_URL missing" }, null, 2));
  process.exit(0);
}

const pg = await import("pg");
const pool = new pg.default.Pool({
  connectionString: url,
  max: 2,
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM catalog_products WHERE product_type = 'generic') AS generic_products,
      (SELECT COUNT(*)::int FROM catalog_products WHERE product_type = 'branded') AS branded_products,
      (SELECT COUNT(*)::int FROM product_identifiers) AS gtins,
      (SELECT COUNT(DISTINCT variant_id)::int FROM product_identifiers) AS variants_with_gtin,
      (SELECT COUNT(*)::int FROM product_facts WHERE source = 'openfoodfacts') AS off_fact_rows,
      (SELECT COUNT(*)::int FROM product_facts
        WHERE source = 'openfoodfacts' AND ingredients IS NOT NULL AND btrim(ingredients) <> '') AS with_ingredients,
      (SELECT COUNT(*)::int FROM product_facts
        WHERE source = 'openfoodfacts' AND per100 IS NOT NULL) AS with_per100,
      (SELECT COUNT(*)::int FROM product_facts
        WHERE source = 'openfoodfacts' AND nutri_score IS NOT NULL) AS with_nutriscore,
      (SELECT COUNT(*)::int FROM catalog_products
        WHERE product_type = 'generic' OR generic_parent_id IS NOT NULL) AS with_generic_type,
      (SELECT COUNT(DISTINCT f.variant_id)::int FROM product_facts f
        WHERE f.source = 'openfoodfacts'
          AND (
            (f.ingredients IS NOT NULL AND btrim(f.ingredients) <> '')
            OR (
              f.per100 IS NOT NULL
              AND (
                (f.per100 ? 'sugars' AND f.per100->>'sugars' IS NOT NULL)
                OR (f.per100 ? 'salt' AND f.per100->>'salt' IS NOT NULL)
                OR (f.per100 ? 'fibre' AND f.per100->>'fibre' IS NOT NULL)
                OR (f.per100 ? 'fiber' AND f.per100->>'fiber' IS NOT NULL)
                OR (f.per100 ? 'saturatedFat' AND f.per100->>'saturatedFat' IS NOT NULL)
                OR (f.per100 ? 'saturated-fat' AND f.per100->>'saturated-fat' IS NOT NULL)
              )
            )
          )) AS assessable_variants
  `);

  const counts = rows[0] ?? {};
  console.log(
    JSON.stringify(
      {
        status: "ok",
        note: "Postgres Open Food Facts only. IndexedDB product-page facts are device-local and not counted here.",
        counts: {
          genericProducts: counts.generic_products,
          brandedProducts: counts.branded_products,
          gtins: counts.gtins,
          variantsWithGtin: counts.variants_with_gtin,
          offFactRows: counts.off_fact_rows,
          withIngredients: counts.with_ingredients,
          withPer100: counts.with_per100,
          withNutriScore: counts.with_nutriscore,
          withGenericType: counts.with_generic_type,
          assessableVariants: counts.assessable_variants,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        status: "error",
        reason: error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/[^\s]+/gi, "postgres://***") : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}
