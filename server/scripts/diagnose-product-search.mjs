/**
 * Read-only product-search coverage check for branded-discovery planning.
 * Usage (from server/): node scripts/diagnose-product-search.mjs
 * Loads CANDIDATES_DATABASE_URL / PRIJSPROFEET_* from the environment or server/.env.
 * One PP name search + one active-offer search per term; never invents counts.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const TERMS = ["melk", "chips", "kwark", "yoghurt", "cola"];

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productKey(row) {
  if (row.ean) return `ean:${row.ean}`;
  const name = normalize(row.productName ?? row.name ?? "");
  const qty = String(row.quantity ?? "").toLowerCase();
  return `name:${name}|${qty}`;
}

async function loadBootstrap() {
  try {
    const mod = await import(new URL("../dist/catalog/bootstrap.js", import.meta.url).href);
    return mod.BOOTSTRAP_PRODUCTS;
  } catch (error) {
    throw new Error(`Run npm run build in server/ first (${error instanceof Error ? error.message : error})`);
  }
}

function bundledMatches(products, term) {
  const needle = normalize(term);
  return products.filter((product) => {
    const names = [product.name, ...(product.aliases ?? [])];
    return names.some((name) => normalize(name) === needle || normalize(name).includes(needle) || needle.includes(normalize(name)));
  });
}

async function pgCounts(term) {
  const url = process.env.CANDIDATES_DATABASE_URL;
  if (!url) return { status: "n/a", reason: "CANDIDATES_DATABASE_URL missing", approved: null, byAlias: null };

  const pg = await import("pg");
  const { createCatalogStore } = await import(new URL("../dist/catalog/repo.js", import.meta.url).href);
  const pool = new pg.default.Pool({
    connectionString: url,
    max: 2,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
  });
  try {
    const alias = normalize(term);
    const { rows: approvedRows } = await pool.query(
      `SELECT COUNT(DISTINCT p.id)::int AS count
       FROM catalog_products p
       LEFT JOIN catalog_aliases a ON a.product_id = p.id
       WHERE p.approval_status = 'approved'
         AND (
           lower(p.name) LIKE $1
           OR a.alias_normalized = $2
           OR a.alias_normalized LIKE $1
         )`,
      [`%${alias}%`, alias],
    );
    const store = createCatalogStore(pool);
    const hit = await store.byAlias({ alias: term });
    return {
      status: "ok",
      approved: approvedRows[0]?.count ?? 0,
      byAlias: hit?.productId ? 1 : 0,
      byAliasProductId: hit?.productId ?? null,
    };
  } catch (error) {
    return { status: "n/a", reason: error instanceof Error ? error.message : String(error), approved: null, byAlias: null };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function ppClient() {
  if (process.env.OFFERS === "off") return null;
  // Match server/src/index.ts default when PRIJSPROFEET_USER_AGENT is unset.
  const userAgent = process.env.PRIJSPROFEET_USER_AGENT || "Karrie/1.0 (+https://karrie.eu)";
  const { createPrijsProfeet, PRIJSPROFEET_RULES } = await import(new URL("../dist/offers/prijsprofeet.js", import.meta.url).href);
  return {
    client: createPrijsProfeet({
      userAgent,
      apiKey: process.env.PRIJSPROFEET_API_KEY || undefined,
    }),
    rules: PRIJSPROFEET_RULES,
  };
}

function summarizePp(rows, pageSize, maxPages) {
  const fetched = rows.length;
  const keys = new Set(rows.map(productKey));
  const brands = new Set(rows.map((row) => (row.brand || "").trim()).filter(Boolean));
  const retailers = new Set(rows.map((row) => row.retailer).filter(Boolean));
  const withImage = rows.filter((row) => Boolean(row.imageUrl)).length;
  const activeOffers = rows.filter((row) => row.promotionStatus === "active").length;
  const hitPageCap = fetched >= pageSize * maxPages;
  return {
    fetched,
    pageSize,
    maxPages,
    pageCapNote: hitPageCap ? `paginated_cap_${pageSize}x${maxPages}` : "short_of_cap_or_complete",
    distinctProducts: keys.size,
    brands: brands.size,
    retailers: retailers.size,
    withImage,
    activeInNameSearch: activeOffers,
  };
}

const bootstrap = await loadBootstrap();
const pp = await ppClient();

console.log(JSON.stringify({ note: "full corpus size unknown for PP; fetched = paginated rows only", pageSize: pp?.rules.pageSize, maxNamePages: pp?.rules.maxNamePages }, null, 2));

const table = [];
for (const term of TERMS) {
  const bundled = bundledMatches(bootstrap, term);
  const pg = await pgCounts(term);

  let nameSearch = { status: "n/a", reason: "PRIJSPROFEET_USER_AGENT missing" };
  let offerSearch = { status: "n/a", reason: "PRIJSPROFEET_USER_AGENT missing" };

  if (pp) {
    const nameResult = await pp.client.searchName(term);
    if (!nameResult.ok) {
      nameSearch = { status: "error", code: nameResult.code };
    } else {
      nameSearch = { status: "ok", ...summarizePp(nameResult.rows, pp.rules.pageSize, pp.rules.maxNamePages) };
    }

    // One active-offer probe via first shopping retailer only (albert_heijn) — not full coverage.
    const offerResult = await pp.client.search(term, "albert_heijn");
    if (!offerResult.ok) {
      offerSearch = { status: "error", code: offerResult.code, retailer: "albert_heijn" };
    } else {
      offerSearch = {
        status: "ok",
        retailer: "albert_heijn",
        fetched: offerResult.rows.length,
        pageSize: pp.rules.pageSize,
        note: "active_promotions_only_single_retailer_page1",
        withImage: offerResult.rows.filter((row) => Boolean(row.imageUrl)).length,
      };
    }
  }

  const row = {
    term,
    bundledGenericMatches: bundled.length,
    bundledIds: bundled.map((product) => product.id),
    pgApprovedMatches: pg.status === "ok" ? pg.approved : "n/a",
    pgByAliasHit: pg.status === "ok" ? pg.byAlias : "n/a",
    ppNameFetched: nameSearch.status === "ok" ? nameSearch.fetched : "n/a",
    ppNameDistinct: nameSearch.status === "ok" ? nameSearch.distinctProducts : "n/a",
    ppBrands: nameSearch.status === "ok" ? nameSearch.brands : "n/a",
    ppRetailers: nameSearch.status === "ok" ? nameSearch.retailers : "n/a",
    ppWithImage: nameSearch.status === "ok" ? nameSearch.withImage : "n/a",
    ppNamePageNote: nameSearch.status === "ok" ? nameSearch.pageCapNote : nameSearch.reason || nameSearch.code,
    ppActiveOffersAh: offerSearch.status === "ok" ? offerSearch.fetched : "n/a",
    ppOfferNote: offerSearch.status === "ok" ? offerSearch.note : offerSearch.reason || offerSearch.code,
  };
  table.push(row);
  console.log(`\n=== ${term} ===`);
  console.log(JSON.stringify(row, null, 2));
}

console.log("\n=== TABLE ===");
console.log(
  [
    "term",
    "bundled",
    "pg_approved",
    "pp_name_fetched",
    "pp_distinct",
    "pp_brands",
    "pp_retailers",
    "pp_images",
    "pp_offers_ah",
  ].join("\t"),
);
for (const row of table) {
  console.log(
    [
      row.term,
      row.bundledGenericMatches,
      row.pgApprovedMatches,
      row.ppNameFetched,
      row.ppNameDistinct,
      row.ppBrands,
      row.ppRetailers,
      row.ppWithImage,
      row.ppActiveOffersAh,
    ].join("\t"),
  );
}

console.log("\n=== RAW_JSON ===");
console.log(JSON.stringify(table, null, 2));
