import type { Queryable } from "../candidatesPg.js";
import { BOOTSTRAP_CATEGORIES, BOOTSTRAP_PRODUCTS } from "./bootstrap.js";
import { aliasKey, normalizedKey } from "./keys.js";

export type SeedResult = { categories: number; products: number };

/** Upserts the bundled categories and products. Shared (non-bundled) rows are left alone. */
export async function seedCatalog(db: Queryable): Promise<SeedResult> {
  for (const category of BOOTSTRAP_CATEGORIES) {
    await db.query(
      `INSERT INTO categories (id, label, short, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, short = EXCLUDED.short, sort_order = EXCLUDED.sort_order`,
      [category.id, category.label, category.short, category.sortOrder],
    );
  }

  let products = 0;
  for (const product of BOOTSTRAP_PRODUCTS) {
    const aliases = [product.name, ...product.aliases];
    const key = normalizedKey(product.name);
    await db.query(
      `INSERT INTO catalog_products (
         id, normalized_key, name, product_type, brand, formulation, category_id,
         illustration_key, aliases, approval_status, is_default_catalog, origin, updated_at
       ) VALUES ($1, $2, $3, 'generic', NULL, NULL, $4, $5, $6::jsonb, 'approved', true, 'bundled', now())
       ON CONFLICT (id) DO UPDATE SET
         normalized_key = EXCLUDED.normalized_key,
         name = EXCLUDED.name,
         category_id = EXCLUDED.category_id,
         illustration_key = EXCLUDED.illustration_key,
         aliases = EXCLUDED.aliases,
         approval_status = 'approved',
         is_default_catalog = true,
         updated_at = now()
       WHERE catalog_products.origin = 'bundled'`,
      [product.id, key, product.name, product.category, product.id, JSON.stringify(aliases)],
    );

    await db.query(`DELETE FROM catalog_aliases WHERE product_id = $1`, [product.id]);
    const seen = new Set<string>();
    for (const alias of aliases) {
      const normalized = aliasKey(alias);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      await db.query(
        `INSERT INTO catalog_aliases (alias_normalized, product_id) VALUES ($1, $2)
         ON CONFLICT (alias_normalized, product_id) DO NOTHING`,
        [normalized, product.id],
      );
    }
    products += 1;
  }

  return { categories: BOOTSTRAP_CATEGORIES.length, products };
}
