/**
 * Optional thorough backfill: strip brand prefixes from catalog_products.name using the same
 * fold rules as server/src/productTitle.ts (accents). Migration 008 covers the simple ASCII case.
 * Usage (from server/): node scripts/backfill-product-titles.mjs
 * Needs CANDIDATES_DATABASE_URL. Dry-run by default; pass --write to apply.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.CANDIDATES_DATABASE_URL;
const write = process.argv.includes("--write");

if (!url) {
  console.log(JSON.stringify({ status: "skipped", reason: "CANDIDATES_DATABASE_URL missing" }, null, 2));
  process.exit(0);
}

function foldTitle(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBrandFromName(name, brand) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  const cleanBrand = (brand ?? "").replace(/\s+/g, " ").trim();
  if (!cleanName || !cleanBrand) return cleanName;
  const nameFold = foldTitle(cleanName);
  const brandFold = foldTitle(cleanBrand);
  if (!brandFold || nameFold === brandFold || !nameFold.startsWith(brandFold)) return cleanName;
  const afterFold = nameFold.slice(brandFold.length);
  if (afterFold.length > 0 && !/^\s/.test(afterFold)) return cleanName;
  const brandWords = brandFold.split(" ").filter(Boolean);
  const nameWords = cleanName.split(" ").filter(Boolean);
  const nameFolds = nameWords.map(foldTitle);
  if (brandWords.length > nameWords.length) return cleanName;
  for (let i = 0; i < brandWords.length; i += 1) {
    if (nameFolds[i] !== brandWords[i]) return cleanName;
  }
  const rest = nameWords.slice(brandWords.length).join(" ").trim();
  return rest || cleanName;
}

const pg = await import("pg");
const pool = new pg.default.Pool({
  connectionString: url,
  max: 2,
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `SELECT id, name, brand FROM catalog_products
     WHERE brand IS NOT NULL AND btrim(brand) <> '' AND product_type = 'branded'`,
  );
  const changes = [];
  for (const row of rows) {
    const next = stripBrandFromName(String(row.name), String(row.brand));
    if (next && next !== row.name) changes.push({ id: row.id, from: row.name, to: next });
  }
  if (write) {
    for (const change of changes) {
      await pool.query(`UPDATE catalog_products SET name = $1, updated_at = now() WHERE id = $2`, [change.to, change.id]);
    }
  }
  console.log(JSON.stringify({ status: "ok", write, scanned: rows.length, changed: changes.length, sample: changes.slice(0, 10) }, null, 2));
} finally {
  await pool.end();
}
