import { createHash } from "node:crypto";
import type { BarcodeAnswer, BarcodeProduct, BarcodeSource } from "../barcode.js";
import type { Candidate } from "../candidates.js";
import type { PoolLike, Queryable } from "../candidatesPg.js";
import type { NameAnswer } from "../nameImage.js";
import type { NameImage } from "../nameMatch.js";
import type { ProductCategory } from "../offers/match.js";
import { imageRetailerName, RETAILER_RANK, type SourceRetailer } from "../offers/prijsprofeet.js";
import { PRODUCT_CATEGORIES } from "../offers/match.js";
import { formulationWords, words } from "../nameMatch.js";
import { parseName } from "../productName.js";
import { resolveCategory } from "../resolveCategory.js";
import { aliasKey, normalizedKey, packFromQuantity, packKey, sizeMatches } from "./keys.js";
import { bestPpIdentity, quantityMlOf, summarizePack, type PackEvidence, type PackEvidenceSource } from "./pack.js";
import type {
  Catalog,
  CatalogChange,
  CatalogConfidence,
  CatalogStats,
  CatalogStore,
  NameLookupRequest,
  ParentPackInput,
  RetailerPackInput,
  SetDefaultInput,
  StoredBarcodeHit,
  StoredNameHit,
  StoreImageInput,
  UpsertBarcodeInput,
  UpsertNameImagesInput,
} from "./types.js";

const DAY = 24 * 60 * 60 * 1000;
export const CATALOG_RULES = {
  queryTimeoutMs: 4_000,
  refreshDays: 90,
  seenThrottleMs: DAY,
};

type Counters = { centralHits: number; writes: number; writeErrors: number; degraded: boolean; migrations: string[] };

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function parseAliases(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function productIdFromKey(key: string, prefix: string): string {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

function variantIdOf(productId: string, key: string): string {
  return createHash("sha1").update(`${productId}|${key}`).digest("hex").slice(0, 24);
}

function imageIdOf(productId: string, url: string): string {
  return createHash("sha1").update(`${productId}|${url}`).digest("hex").slice(0, 24);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("catalog-timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parsePer100(value: unknown): BarcodeProduct["per100"] | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as BarcodeProduct["per100"];
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as BarcodeProduct["per100"];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function rebuildAnswer(row: Record<string, unknown>): BarcodeAnswer {
  const confidence = String(row.confidence) as CatalogConfidence;
  const per100 = parsePer100(row.per100);
  const product: BarcodeProduct = {
    ...(asString(row.name) ? { name: asString(row.name) } : {}),
    ...(asString(row.brand) ? { brand: asString(row.brand) } : {}),
    ...(asString(row.formulation) ? { variant: asString(row.formulation) } : {}),
    ...(asString(row.variant_label) ? { quantity: asString(row.variant_label) } : {}),
    ...(asString(row.image_url) && row.usage_status !== "unavailable" ? { imageUrl: asString(row.image_url) } : {}),
    ...(asString(row.nutri_score) ? { nutriScore: asString(row.nutri_score) as BarcodeProduct["nutriScore"] } : {}),
    ...(per100 ? { per100 } : {}),
    ...(asString(row.ingredients) ? { ingredients: asString(row.ingredients) } : {}),
  };
  const sourceKind = asString(row.source_kind) ?? asString(row.id_source) ?? "off";
  let source: BarcodeSource | undefined;
  if (sourceKind === "web" || confidence === "web-page") {
    source = { kind: "web", name: asString(row.source_name) ?? "web", url: asString(row.source_url) ?? "" };
  } else {
    source = {
      kind: "off",
      name: "Open Food Facts",
      url: asString(row.source_url) ?? `https://world.openfoodfacts.org/product/${row.gtin}`,
      dataLicense: "ODbL",
      ...(product.imageUrl && { imageLicense: "CC BY-SA" as const }),
    };
  }
  const departmentRaw = asString(row.category_id);
  const department =
    departmentRaw &&
    departmentRaw !== "pantry" &&
    PRODUCT_CATEGORIES.includes(departmentRaw as ProductCategory)
      ? (departmentRaw as ProductCategory)
      : undefined;
  return {
    ean: String(row.gtin),
    status: confidence,
    product,
    source,
    at: new Date(String(row.last_verified_at ?? row.refreshed_at ?? Date.now())).getTime(),
    ...(department && { department }),
  };
}

export function createCatalogStore(
  pool: PoolLike,
  options: { refreshDays?: number; now?: () => number; migrations?: string[] } = {},
): CatalogStore {
  const now = options.now ?? Date.now;
  const refreshMs = (options.refreshDays ?? CATALOG_RULES.refreshDays) * DAY;
  const counters: Counters = {
    centralHits: 0,
    writes: 0,
    writeErrors: 0,
    degraded: false,
    migrations: options.migrations ?? [],
  };
  const lastSeen = new Map<string, number>();

  async function run<T>(label: string, work: (db: Queryable) => Promise<T>): Promise<T> {
    try {
      return await withTimeout(work(pool), CATALOG_RULES.queryTimeoutMs);
    } catch (error) {
      counters.degraded = true;
      counters.writeErrors += label.startsWith("write:") || label.startsWith("upsert") ? 1 : 0;
      throw error;
    }
  }

  async function tx<T>(work: (client: Queryable & { release(): void }) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function replaceAliases(db: Queryable, productId: string, aliases: string[]) {
    await db.query(`DELETE FROM catalog_aliases WHERE product_id = $1`, [productId]);
    const seen = new Set<string>();
    for (const alias of aliases) {
      const key = aliasKey(alias);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      await db.query(
        `INSERT INTO catalog_aliases (alias_normalized, product_id) VALUES ($1, $2)
         ON CONFLICT (alias_normalized, product_id) DO NOTHING`,
        [key, productId],
      );
    }
  }

  const store: CatalogStore = {
    enabled: true,
    degraded: () => counters.degraded,
    stats(): CatalogStats {
      return {
        enabled: true,
        degraded: counters.degraded,
        migrations: counters.migrations,
        products: 0,
        identifiers: 0,
        centralHits: counters.centralHits,
        writes: counters.writes,
        writeErrors: counters.writeErrors,
      };
    },

    async byGtin(ean) {
      try {
        const row = await run("byGtin", async (db) => {
          const { rows } = await db.query(
            `SELECT i.gtin, i.confidence, i.source AS id_source, i.last_verified_at,
                    v.id AS variant_id, v.label AS variant_label, v.product_id,
                    p.name, p.brand, p.formulation, p.category_id,
                    f.nutri_score, f.per100, f.ingredients, f.refreshed_at, f.source_url AS facts_url
             FROM product_identifiers i
             JOIN product_variants v ON v.id = i.variant_id
             JOIN catalog_products p ON p.id = v.product_id
             LEFT JOIN product_facts f ON f.variant_id = v.id AND f.source = 'openfoodfacts'
             WHERE i.gtin = $1`,
            [ean],
          );
          const base = rows[0];
          if (!base) return null;
          const { rows: images } = await db.query(
            `SELECT url, usage_status, source FROM product_images
             WHERE product_id = $1 AND usage_status <> 'unavailable'
             ORDER BY CASE WHEN variant_id = $2 THEN 0 ELSE 1 END, preferred DESC, created_at ASC
             LIMIT 1`,
            [base.product_id, base.variant_id],
          );
          const { rows: storeRows } = await db.query(
            `SELECT url, retailer, source_url FROM product_images
             WHERE product_id = $1 AND usage_status = 'link_only' AND source = 'prijsprofeet'
             ORDER BY CASE WHEN variant_id = $2 THEN 0 ELSE 1 END, preferred DESC, created_at ASC
             LIMIT 1`,
            [base.product_id, base.variant_id],
          );
          const img = images[0];
          const store = storeRows[0];
          return {
            ...base,
            image_url: img?.url,
            usage_status: img?.usage_status,
            image_source: img?.source,
            store_url: store?.url,
            store_retailer: store?.retailer,
            store_source_url: store?.source_url,
            source_kind: String(base.confidence) === "web-page" || store?.retailer ? "web" : "off",
            source_url:
              asString(store?.source_url) ??
              (String(base.confidence) === "web-page"
                ? `https://www.prijsprofeet.nl/?q=${base.gtin}`
                : (asString(base.facts_url) ?? `https://world.openfoodfacts.org/product/${base.gtin}`)),
            source_name: store?.retailer
              ? imageRetailerName(String(store.retailer) as SourceRetailer)
              : String(base.confidence) === "web-page"
                ? "PrijsProfeet"
                : "Open Food Facts",
          } as Record<string, unknown>;
        });
        if (!row) return null;
        counters.centralHits += 1;
        const verified = new Date(String(row.last_verified_at ?? row.refreshed_at ?? 0)).getTime();
        const stale = !Number.isFinite(verified) || now() - verified > refreshMs;
        const pack = await loadPackSummary(pool, ean).catch(() => summarizePack([]));
        const answer = rebuildAnswer(row);
        if (answer.product) {
          if (pack.displayQuantity) answer.product = { ...answer.product, quantity: pack.displayQuantity };
          else if (pack.conflict) answer.product = { ...answer.product, quantity: undefined };
          const pp = bestPpIdentity(pack.sources);
          if (pp) {
            answer.product = {
              ...answer.product,
              ...(pp.productName && { name: pp.productName.slice(0, 80) }),
              ...(pp.brand && { brand: pp.brand.slice(0, 40) }),
            };
            answer.status = "web-page";
            const retailer = pp.retailer ?? asString(row.store_retailer);
            answer.source = {
              kind: "web",
              name: retailer ? imageRetailerName(retailer as SourceRetailer) : "PrijsProfeet",
              url: asString(row.store_source_url) ?? `https://www.prijsprofeet.nl/?q=${ean}`,
            };
          }
        }
        answer.pack = pack;
        const storeImage = asString(row.store_url)
          ? {
              ean,
              imageUrl: String(row.store_url),
              retailer: String(row.store_retailer ?? "unknown"),
              ...(asString(row.store_source_url) && { sourceUrl: asString(row.store_source_url) }),
            }
          : undefined;
        if (storeImage) answer.storeImage = storeImage;
        return {
          answer,
          stale,
          variantId: String(row.variant_id),
          productId: String(row.product_id),
          pack,
          ...(storeImage && { storeImage }),
        } satisfies StoredBarcodeHit;
      } catch {
        return null;
      }
    },

    async byAlias(request: NameLookupRequest) {
      try {
        const key = aliasKey(request.alias);
        if (!key) return null;
        const packRequested = Boolean(request.packaging || request.size);
        const typedFormulation = formulationWords(words(request.alias)).sort().join(" ");

        const products = await run("byAlias:products", async (db) => {
          const { rows } = await db.query(
            `SELECT DISTINCT ON (p.id) p.id, p.name, p.brand, p.formulation, p.product_type, p.category_id, p.normalized_key
             FROM catalog_aliases a
             JOIN catalog_products p ON p.id = a.product_id
             WHERE a.alias_normalized = $1
               AND p.approval_status = 'approved'
             ORDER BY p.id ASC`,
            [key],
          );
          return rows;
        });
        if (!products.length) return null;

        type ProductRow = (typeof products)[number];
        const compatible = products
          .map((row) => {
            const brandWords = asString(row.brand) ? words(String(row.brand)) : [];
            const fieldFormulation = formulationWords(words(asString(row.formulation) ?? ""));
            let rest = words(String(row.name));
            if (brandWords.length) {
              for (let start = 0; start + brandWords.length <= rest.length; start += 1) {
                if (brandWords.every((word, index) => rest[start + index] === word)) {
                  rest = [...rest.slice(0, start), ...rest.slice(start + brandWords.length)];
                  break;
                }
              }
            }
            const fromName = formulationWords(rest);
            const productFormulation = [...new Set(fieldFormulation.length ? fieldFormulation : fromName)].sort().join(" ");
            const formulationOk = typedFormulation === productFormulation;
            const nameAlias = aliasKey(String(row.name)) === key;
            return { row, formulationOk, nameAlias, key: String(row.normalized_key ?? "") };
          })
          .filter((entry) => entry.formulationOk);
        if (!compatible.length) return null;
        compatible.sort((a, b) => Number(b.nameAlias) - Number(a.nameAlias) || a.key.localeCompare(b.key) || String(a.row.id).localeCompare(String(b.row.id)));
        const chosen = compatible[0].row as ProductRow;
        const productId = String(chosen.id);

        const variants = await run("byAlias:variants", async (db) => {
          const { rows } = await db.query(
            `SELECT id, package_quantity, package_unit, multipack_count, package_type, pack_key, label
             FROM product_variants
             WHERE product_id = $1
             ORDER BY pack_key ASC, id ASC`,
            [productId],
          );
          return rows;
        });
        const matchedVariants = packRequested
          ? variants.filter((row) =>
              sizeMatches(request.size, request.packaging, {
                packageQuantity: asNumber(row.package_quantity),
                packageUnit: asString(row.package_unit),
                multipackCount: asNumber(row.multipack_count),
                packageType: asString(row.package_type),
              }),
            )
          : [];
        if (packRequested && !matchedVariants.length) {
          return { answer: emptyNameAnswer(), productId, packMatched: false, exactPack: false } satisfies StoredNameHit;
        }
        const selectedVariantId = packRequested && matchedVariants[0] ? String(matchedVariants[0].id) : undefined;

        const imageRows = await run("byAlias:images", async (db) => {
          const { rows } = await db.query(
            `SELECT url, source, retailer, source_url, usage_status, variant_id, preferred, created_at, id
             FROM product_images
             WHERE product_id = $1 AND usage_status <> 'unavailable'
             ORDER BY preferred DESC, created_at ASC, id ASC`,
            [productId],
          );
          return rows;
        });

        type Ranked = { image: NameImage; rank: number };
        const ranked: Ranked[] = [];
        const seen = new Set<string>();
        for (const row of imageRows) {
          const url = asString(row.url);
          if (!url || seen.has(url)) continue;
          seen.add(url);
          const variantId = asString(row.variant_id);
          let rank = 1;
          if (selectedVariantId && variantId === selectedVariantId) rank = 0;
          else if (variantId) rank = packRequested ? 99 : 2;
          if (rank >= 99) continue;
          ranked.push({
            rank,
            image: {
              imageUrl: url,
              productName: String(chosen.name),
              confidence: rank === 0 ? "high" : "medium",
              brand: asString(chosen.brand) ?? String(chosen.name),
              source: asString(row.source) === "openfoodfacts" ? "off" : "prijsprofeet",
              ...(asString(row.retailer) && { retailer: asString(row.retailer) as NameImage["retailer"] }),
              ...(asString(row.source_url) && { sourceUrl: asString(row.source_url) }),
            },
          });
        }
        ranked.sort((a, b) => a.rank - b.rank);
        if (!ranked.length) return null;
        counters.centralHits += 1;
        const [match, ...alternatives] = ranked.map((entry) => entry.image);
        const category = asString(chosen.category_id);
        const exactPack = packRequested && ranked[0]?.rank === 0;
        const answer: NameAnswer = {
          classification: chosen.product_type === "branded" ? "branded" : "unknown",
          ...(asString(chosen.brand) ? { brand: asString(chosen.brand) } : {}),
          ...(asString(chosen.formulation) ? { variant: asString(chosen.formulation) } : {}),
          match,
          alternatives: alternatives.slice(0, 6),
          ...(category && PRODUCT_CATEGORIES.includes(category as ProductCategory)
            ? { category: category as ProductCategory }
            : {}),
          searched: { prijsprofeet: "skipped", off: "skipped" },
        };
        return { answer, productId, packMatched: true, exactPack } satisfies StoredNameHit;
      } catch {
        return null;
      }
    },

    async upsertBarcodeRecord(input: UpsertBarcodeInput): Promise<{ productId: string; variantId: string } | null> {
      const writeOnce = async (): Promise<{ productId: string; variantId: string }> =>
        withTimeout(
          tx(async (db) => {
            const offWrite = input.source.kind === "off";
            const existingPp = offWrite ? await bestPpEvidenceForGtin(db, input.ean) : null;
            const brand = (existingPp?.brand || input.product.brand)?.slice(0, 40);
            const name = (existingPp?.productName || input.product.name || brand || input.ean).slice(0, 80);
            const formulation = input.product.variant;
            const pack = packFromQuantity(input.product.quantity);
            const keyPack = packKey(pack);
            const category =
              input.department ??
              resolveCategory({ tags: input.product.categories, name }) ??
              "pantry";

            await ensureCategory(db, category);

            const { rows: linkedRows } = await db.query(
              `SELECT p.id AS product_id
               FROM product_identifiers i
               JOIN product_variants v ON v.id = i.variant_id
               JOIN catalog_products p ON p.id = v.product_id
               WHERE i.gtin = $1`,
              [input.ean],
            );
            let resolvedProductId: string;
            if (offWrite && existingPp && linkedRows[0]?.product_id) {
              // Keep the existing catalog row for this GTIN; never let OFF rename it away from PP identity.
              resolvedProductId = String(linkedRows[0].product_id);
              await db.query(
                `UPDATE catalog_products SET
                   name = COALESCE($1, name),
                   brand = COALESCE($2, brand),
                   category_id = CASE
                     WHEN category_id = 'pantry' AND $3::text <> 'pantry' THEN $3
                     ELSE category_id
                   END,
                   updated_at = now(),
                   last_seen_at = now()
                 WHERE id = $4`,
                [existingPp.productName?.slice(0, 80) ?? null, existingPp.brand?.slice(0, 40) ?? null, category, resolvedProductId],
              );
            } else {
              const key = normalizedKey([name, formulation].filter(Boolean).join(" "), brand);
              const productId = productIdFromKey(key, "b");
              await db.query(
                `INSERT INTO catalog_products (
                   id, normalized_key, name, product_type, brand, formulation, category_id,
                   illustration_key, aliases, approval_status, is_default_catalog, origin, updated_at, last_seen_at
                 ) VALUES ($1, $2, $3, 'branded', $4, $5, $6, NULL, $7::jsonb, 'approved', false, 'shared', now(), now())
                 ON CONFLICT (normalized_key) DO UPDATE SET
                   name = EXCLUDED.name,
                   brand = COALESCE(EXCLUDED.brand, catalog_products.brand),
                   formulation = COALESCE(EXCLUDED.formulation, catalog_products.formulation),
                   category_id = CASE
                     WHEN catalog_products.category_id = 'pantry' AND EXCLUDED.category_id <> 'pantry' THEN EXCLUDED.category_id
                     ELSE catalog_products.category_id
                   END,
                   updated_at = now(),
                   last_seen_at = now()
                 RETURNING id`,
                [
                  productId,
                  key,
                  name,
                  brand ?? null,
                  formulation ?? null,
                  category,
                  JSON.stringify([name, brand].filter(Boolean)),
                ],
              );
              const { rows: productRows } = await db.query(`SELECT id FROM catalog_products WHERE normalized_key = $1`, [key]);
              resolvedProductId = String(productRows[0]?.id ?? productId);
            }
            await replaceAliases(db, resolvedProductId, [name, brand].filter((value): value is string => Boolean(value)));

            const resolvedVariantId = variantIdOf(resolvedProductId, keyPack);
            await db.query(
              `INSERT INTO product_variants (
                 id, product_id, package_quantity, package_unit, multipack_count, package_type, pack_key, label, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
               ON CONFLICT (product_id, pack_key) DO UPDATE SET
                 label = COALESCE(EXCLUDED.label, product_variants.label),
                 updated_at = now()`,
              [
                resolvedVariantId,
                resolvedProductId,
                pack.packageQuantity ?? null,
                pack.packageUnit ?? null,
                pack.multipackCount ?? null,
                pack.packageType ?? null,
                keyPack,
                pack.label ?? null,
              ],
            );
            const { rows: variantRows } = await db.query(
              `SELECT id FROM product_variants WHERE product_id = $1 AND pack_key = $2`,
              [resolvedProductId, keyPack],
            );
            const finalVariantId = String(variantRows[0]?.id ?? resolvedVariantId);

            const { rows: existingId } = await db.query(
              `SELECT variant_id, pack_conflict FROM product_identifiers WHERE gtin = $1`,
              [input.ean],
            );
            const priorVariant = asString(existingId[0]?.variant_id);
            let bindVariantId = finalVariantId;
            let packConflict = false;
            if (priorVariant && priorVariant !== finalVariantId) {
              const { rows: priorPack } = await db.query(
                `SELECT package_quantity, package_unit, multipack_count, label FROM product_variants WHERE id = $1`,
                [priorVariant],
              );
              const priorMl = priorPack[0]
                ? quantityMlOf(
                    asString(priorPack[0].label) ??
                      (priorPack[0].package_quantity != null && priorPack[0].package_unit
                        ? `${priorPack[0].package_quantity} ${priorPack[0].package_unit}`
                        : undefined),
                  )
                : undefined;
              const nextMl = quantityMlOf(input.product.quantity);
              if (priorMl != null && nextMl != null && Math.abs(priorMl - nextMl) / Math.max(priorMl, nextMl) > 0.05) {
                bindVariantId = priorVariant;
                packConflict = true;
              }
            }

            await db.query(
              `INSERT INTO product_identifiers (gtin, variant_id, source, confidence, pack_conflict, first_seen_at, last_verified_at)
               VALUES ($1, $2, $3, $4, $5, now(), now())
               ON CONFLICT (gtin) DO UPDATE SET
                 variant_id = CASE
                   WHEN product_identifiers.pack_conflict OR $5 THEN product_identifiers.variant_id
                   ELSE EXCLUDED.variant_id
                 END,
                 source = EXCLUDED.source,
                 confidence = EXCLUDED.confidence,
                 pack_conflict = product_identifiers.pack_conflict OR EXCLUDED.pack_conflict,
                 last_verified_at = now()`,
              [input.ean, bindVariantId, input.source.kind === "off" ? "openfoodfacts" : "web", input.status, packConflict],
            );

            const hasOffFacts = Boolean(input.product.nutriScore || input.product.per100 || input.product.ingredients);
            const offFactsUrl =
              input.source.kind === "off" ? input.source.url : `https://world.openfoodfacts.org/product/${input.ean}`;

            if (input.source.kind === "off") {
              await upsertEvidence(db, {
                gtin: input.ean,
                source: "openfoodfacts",
                quantityRaw: input.product.quantity,
                productName: input.product.name,
                brand: input.product.brand,
                at: input.at,
              });
              await refreshConflictFlag(db, input.ean);
            }

            if (input.source.kind === "off" || hasOffFacts) {
              const when = new Date(input.at).toISOString();
              await db.query(
                `INSERT INTO product_facts (
                   variant_id, source, source_url, license, nutri_score, per100, ingredients, retrieved_at, refreshed_at
                 ) VALUES ($1, 'openfoodfacts', $2, 'ODbL', $3, $4::jsonb, $5, $6::timestamptz, $6::timestamptz)
                 ON CONFLICT (variant_id, source) DO UPDATE SET
                   source_url = EXCLUDED.source_url,
                   nutri_score = COALESCE(EXCLUDED.nutri_score, product_facts.nutri_score),
                   per100 = COALESCE(EXCLUDED.per100, product_facts.per100),
                   ingredients = COALESCE(EXCLUDED.ingredients, product_facts.ingredients),
                   refreshed_at = EXCLUDED.refreshed_at`,
                [
                  bindVariantId,
                  offFactsUrl,
                  input.product.nutriScore ?? null,
                  input.product.per100 ? JSON.stringify(input.product.per100) : null,
                  input.product.ingredients ?? null,
                  when,
                ],
              );
            }

            // product.imageUrl is always an images.openfoodfacts.org URL when set.
            if (input.product.imageUrl) {
              const imageId = imageIdOf(resolvedProductId, input.product.imageUrl);
              await db.query(
                `INSERT INTO product_images (
                   id, product_id, variant_id, url, source, source_url, license, usage_status, preferred, last_checked_at
                 ) VALUES ($1, $2, $3, $4, 'openfoodfacts', $5, 'CC BY-SA', 'cc_by_sa', true, now())
                 ON CONFLICT (product_id, url) DO UPDATE SET
                   variant_id = COALESCE(product_images.variant_id, EXCLUDED.variant_id),
                   preferred = true,
                   usage_status = 'cc_by_sa',
                   last_checked_at = now()`,
                [imageId, resolvedProductId, bindVariantId, input.product.imageUrl, offFactsUrl],
              );
            }

            counters.writes += 1;
            return { productId: resolvedProductId, variantId: bindVariantId };
          }),
          CATALOG_RULES.queryTimeoutMs,
        );

      try {
        return await writeOnce();
      } catch {
        try {
          return await writeOnce();
        } catch {
          counters.degraded = true;
          counters.writeErrors += 1;
          return null;
        }
      }
    },

    async upsertNameImages(input: UpsertNameImagesInput) {
      try {
        const { answer } = input;
        if (answer.classification !== "branded" || !answer.brand) return;
        const parsed = parseName(input.typed);
        await run("write:name", () =>
          tx(async (db) => {
            const name = answer.brand!;
            const formulation = answer.variant;
            const key = normalizedKey([name, formulation].filter(Boolean).join(" "), name);
            const productId = productIdFromKey(key, "n");
            const category =
              answer.category ??
              resolveCategory({ name: [name, formulation].filter(Boolean).join(" ") }) ??
              "pantry";
            await ensureCategory(db, category);
            const aliases = [name, formulation ? `${name} ${formulation}` : null].filter((value): value is string => Boolean(value));
            await db.query(
              `INSERT INTO catalog_products (
                 id, normalized_key, name, product_type, brand, formulation, category_id,
                 aliases, approval_status, is_default_catalog, origin, private_label, retailer, updated_at, last_seen_at
               ) VALUES ($1, $2, $3, 'branded', $4, $5, $6, $7::jsonb, 'approved', false, 'shared', false, NULL, now(), now())
               ON CONFLICT (normalized_key) DO UPDATE SET
                 brand = COALESCE(EXCLUDED.brand, catalog_products.brand),
                 formulation = COALESCE(EXCLUDED.formulation, catalog_products.formulation),
                 category_id = CASE
                   WHEN catalog_products.category_id = 'pantry' AND EXCLUDED.category_id <> 'pantry' THEN EXCLUDED.category_id
                   ELSE catalog_products.category_id
                 END,
                 updated_at = now(),
                 last_seen_at = now()`,
              [productId, key, name, name, formulation ?? null, category, JSON.stringify(aliases)],
            );
            const { rows } = await db.query(`SELECT id FROM catalog_products WHERE normalized_key = $1`, [key]);
            const resolvedId = String(rows[0]?.id ?? productId);
            await replaceAliases(db, resolvedId, aliases);

            const packWanted = Boolean(parsed?.packaging || parsed?.size);
            let matchVariantId: string | null = null;
            if (packWanted && answer.match?.packaging) {
              const pack = packFromQuantity(answer.match.packaging, parsed?.packaging);
              const keyPack = packKey(pack);
              const variantId = variantIdOf(resolvedId, keyPack);
              await db.query(
                `INSERT INTO product_variants (
                   id, product_id, package_quantity, package_unit, multipack_count, package_type, pack_key, label, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
                 ON CONFLICT (product_id, pack_key) DO UPDATE SET
                   label = COALESCE(EXCLUDED.label, product_variants.label),
                   updated_at = now()`,
                [
                  variantId,
                  resolvedId,
                  pack.packageQuantity ?? null,
                  pack.packageUnit ?? null,
                  pack.multipackCount ?? null,
                  pack.packageType ?? null,
                  keyPack,
                  pack.label ?? null,
                ],
              );
              const { rows: variantRows } = await db.query(
                `SELECT id FROM product_variants WHERE product_id = $1 AND pack_key = $2`,
                [resolvedId, keyPack],
              );
              matchVariantId = asString(variantRows[0]?.id) ?? variantId;
            }

            const images = [answer.match, ...answer.alternatives, ...(answer.privateLabelAlternatives ?? [])].filter(
              (image): image is NameImage => Boolean(image),
            );
            let preferred = true;
            for (const image of images) {
              const id = imageIdOf(resolvedId, image.imageUrl);
              const fromOff = image.source === "off";
              const isPrivate = image.privateLabel === true;
              const attachVariant = !isPrivate && image === answer.match ? matchVariantId : null;
              if (isPrivate && image.retailer) {
                const plKey = normalizedKey([image.productName, image.retailer].join(" "), image.brand ?? image.productName);
                const plId = productIdFromKey(plKey, "pl");
                await db.query(
                  `INSERT INTO catalog_products (
                     id, normalized_key, name, product_type, brand, formulation, category_id, generic_parent_id,
                     aliases, approval_status, is_default_catalog, origin, private_label, retailer, updated_at, last_seen_at
                   ) VALUES ($1, $2, $3, 'branded', $4, NULL, $5, $6, $7::jsonb, 'approved', false, 'shared', true, $8, now(), now())
                   ON CONFLICT (normalized_key) DO UPDATE SET
                     private_label = true,
                     retailer = COALESCE(EXCLUDED.retailer, catalog_products.retailer),
                     generic_parent_id = COALESCE(catalog_products.generic_parent_id, EXCLUDED.generic_parent_id),
                     updated_at = now(),
                     last_seen_at = now()`,
                  [
                    plId,
                    plKey,
                    image.productName.slice(0, 120),
                    image.brand ?? image.productName.slice(0, 40),
                    category,
                    resolvedId,
                    JSON.stringify([image.productName]),
                    image.retailer,
                  ],
                );
              }
              await db.query(
                `INSERT INTO product_images (
                   id, product_id, variant_id, url, source, retailer, source_url, license, usage_status, preferred, last_checked_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
                 ON CONFLICT (product_id, url) DO UPDATE SET
                   variant_id = COALESCE(EXCLUDED.variant_id, product_images.variant_id),
                   preferred = product_images.preferred OR EXCLUDED.preferred,
                   last_checked_at = now()`,
                [
                  id,
                  resolvedId,
                  attachVariant,
                  image.imageUrl,
                  fromOff ? "openfoodfacts" : "prijsprofeet",
                  image.retailer ?? null,
                  image.sourceUrl ?? null,
                  fromOff ? "CC BY-SA" : null,
                  fromOff ? "cc_by_sa" : "link_only",
                  preferred && !isPrivate,
                ],
              );
              preferred = false;
            }
            counters.writes += 1;
          }),
        );
      } catch {
        counters.writeErrors += 1;
      }
    },

    async upsertStoreImage(input: StoreImageInput) {
      try {
        await run("write:storeImage", () =>
          tx(async (db) => {
            const { rows } = await db.query(
              `SELECT v.id AS variant_id, v.product_id
               FROM product_identifiers i
               JOIN product_variants v ON v.id = i.variant_id
               WHERE i.gtin = $1`,
              [input.ean],
            );
            const hit = rows[0];
            if (!hit) return;
            const id = imageIdOf(String(hit.product_id), input.imageUrl);
            await db.query(
              `INSERT INTO product_images (
                 id, product_id, variant_id, url, source, retailer, source_url, license, usage_status, preferred, last_checked_at
               ) VALUES ($1, $2, $3, $4, 'prijsprofeet', $5, $6, NULL, 'link_only', true, now())
               ON CONFLICT (product_id, url) DO UPDATE SET
                 retailer = EXCLUDED.retailer,
                 source_url = EXCLUDED.source_url,
                 usage_status = 'link_only',
                 preferred = true,
                 last_checked_at = now()`,
              [id, hit.product_id, hit.variant_id, input.imageUrl, input.retailer, input.sourceUrl ?? null],
            );
            counters.writes += 1;
          }),
        );
      } catch {
        counters.writeErrors += 1;
      }
    },

    async storeImageByGtin(ean, preferRetailer) {
      try {
        const row = await run("storeImageByGtin", async (db) => {
          const { rows } = await db.query(
            `SELECT i.gtin, v.id AS variant_id, img.url, img.retailer, img.source_url
             FROM product_identifiers i
             JOIN product_variants v ON v.id = i.variant_id
             JOIN product_images img ON img.product_id = v.product_id
               AND img.usage_status = 'link_only'
               AND img.source = 'prijsprofeet'
             WHERE i.gtin = $1
             ORDER BY
               CASE WHEN $2::text IS NOT NULL AND img.retailer = $2 THEN 0 ELSE 1 END,
               CASE WHEN img.variant_id = v.id THEN 0 ELSE 1 END,
               img.preferred DESC,
               img.created_at ASC
             LIMIT 1`,
            [ean, preferRetailer ?? null],
          );
          return rows[0] ?? null;
        });
        if (!row?.url) return null;
        counters.centralHits += 1;
        const pack = await loadPackSummary(pool, ean, preferRetailer).catch(() => summarizePack([]));
        const retailerEvidence =
          pack.sources.find((entry) => entry.source === "prijsprofeet" && entry.retailer === String(row.retailer)) ??
          pack.sources.find((entry) => entry.source === "prijsprofeet");
        return {
          ean,
          imageUrl: String(row.url),
          retailer: String(row.retailer ?? "unknown"),
          ...(asString(row.source_url) && { sourceUrl: asString(row.source_url) }),
          ...(retailerEvidence?.quantityRaw && { quantity: retailerEvidence.quantityRaw }),
          ...(retailerEvidence?.productName && { productName: retailerEvidence.productName }),
          ...(retailerEvidence?.brand && { brand: retailerEvidence.brand }),
        };
      } catch {
        return null;
      }
    },

    async packForGtin(ean, listRetailer) {
      try {
        return await loadPackSummary(pool, ean, listRetailer);
      } catch {
        return summarizePack([]);
      }
    },

    async recordRetailerPack(input: RetailerPackInput) {
      if (!input.rows.length) return null;
      try {
        return await run("write:retailerPack", () =>
          tx(async (db) => {
            for (const row of input.rows) {
              await upsertEvidence(db, {
                gtin: input.ean,
                source: "prijsprofeet",
                retailer: row.retailer,
                quantityRaw: row.quantity,
                productName: row.productName,
                brand: row.brand,
                at: now(),
              });
            }
            await refreshConflictFlag(db, input.ean);
            await applyPpIdentityToGtin(db, input.ean);
            counters.writes += 1;
            return loadPackSummary(db, input.ean);
          }),
        );
      } catch {
        counters.writeErrors += 1;
        return null;
      }
    },

    async recordParentPack(input: ParentPackInput) {
      try {
        return await run("write:parentPack", () =>
          tx(async (db) => {
            await upsertEvidence(db, {
              gtin: input.ean,
              source: "parent_unverified",
              quantityRaw: input.quantity,
              at: now(),
            });
            await refreshConflictFlag(db, input.ean);
            counters.writes += 1;
            return loadPackSummary(db, input.ean);
          }),
        );
      } catch {
        counters.writeErrors += 1;
        return null;
      }
    },

    async gtinsMissingRetailerPack(limit) {
      try {
        return await run("gtinsMissingRetailerPack", async (db) => {
          const { rows } = await db.query(
            `SELECT i.gtin
             FROM product_identifiers i
             WHERE NOT EXISTS (
               SELECT 1 FROM product_pack_evidence e
               WHERE e.gtin = i.gtin AND e.source = 'prijsprofeet'
             )
             ORDER BY i.last_verified_at DESC
             LIMIT $1`,
            [Math.max(1, Math.min(limit, 50))],
          );
          return rows.map((row) => String(row.gtin));
        });
      } catch {
        return [];
      }
    },

    async repairPackConflicts() {
      try {
        return await run("write:repairPack", () =>
          tx(async (db) => {
            const { rows } = await db.query(`SELECT DISTINCT gtin FROM product_pack_evidence`);
            let fixed = 0;
            for (const row of rows) {
              const before = await db.query(`SELECT pack_conflict FROM product_identifiers WHERE gtin = $1`, [row.gtin]);
              await refreshConflictFlag(db, String(row.gtin));
              const after = await db.query(`SELECT pack_conflict FROM product_identifiers WHERE gtin = $1`, [row.gtin]);
              if (Boolean(before.rows[0]?.pack_conflict) && !after.rows[0]?.pack_conflict) fixed += 1;
            }
            counters.writes += 1;
            return fixed;
          }),
        );
      } catch {
        counters.writeErrors += 1;
        return 0;
      }
    },

    async cacheGet<T>(key: string) {
      try {
        const row = await run("cacheGet", async (db) => {
          const { rows } = await db.query(
            `SELECT payload FROM lookup_cache WHERE key = $1 AND expires_at > $2::timestamptz`,
            [key, new Date(now()).toISOString()],
          );
          return rows[0] ?? null;
        });
        if (!row) return null;
        const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
        return payload as T;
      } catch {
        return null;
      }
    },

    async cachePut(key, kind, payload, expiresAt) {
      try {
        await run("write:cache", async (db) => {
          await db.query(
            `INSERT INTO lookup_cache (key, kind, payload, expires_at)
             VALUES ($1, $2, $3::jsonb, $4::timestamptz)
             ON CONFLICT (key) DO UPDATE SET kind = EXCLUDED.kind, payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
            [key, kind, JSON.stringify(payload), new Date(expiresAt).toISOString()],
          );
          counters.writes += 1;
        });
      } catch {
        counters.writeErrors += 1;
      }
    },

    async changesSince(since, limit) {
      try {
        return await run("changesSince", async (db) => {
          const params: unknown[] = [limit];
          let where = `(is_default_catalog = true OR approval_status = 'deprecated') AND origin = 'shared'`;
          if (since) {
            params.push(since);
            where += ` AND updated_at > $2::timestamptz`;
          }
          const { rows } = await db.query(
            `SELECT id, name, category_id, aliases, illustration_key, approval_status, updated_at
             FROM catalog_products
             WHERE ${where}
             ORDER BY updated_at ASC
             LIMIT $1`,
            params,
          );
          const products: CatalogChange[] = rows.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            category: String(row.category_id),
            aliases: parseAliases(row.aliases),
            ...(asString(row.illustration_key) && { illustrationKey: asString(row.illustration_key) }),
            deprecated: row.approval_status === "deprecated",
            updatedAt: new Date(String(row.updated_at)).toISOString(),
          }));
          const next = products.length === limit ? products[products.length - 1]?.updatedAt ?? null : null;
          return { products, next };
        });
      } catch {
        return { products: [], next: null };
      }
    },

    async approveCandidate(candidate: Candidate) {
      try {
        return await run("write:approve", () =>
          tx(async (db) => {
            const name = candidate.displayName || candidate.canonicalName;
            const brand = candidate.classification === "branded" ? candidate.brand ?? name : null;
            const key = normalizedKey(name, brand);
            const productId = candidate.candidateId || productIdFromKey(key, "c");
            const category =
              candidate.category && PRODUCT_CATEGORIES.includes(candidate.category as ProductCategory)
                ? candidate.category
                : "pantry";
            await ensureCategory(db, category);
            const aliases = [
              candidate.canonicalName,
              candidate.displayName,
              candidate.singularName,
              candidate.pluralName,
              candidate.childFriendlyLabel,
              brand,
            ].filter((value): value is string => Boolean(value));
            await db.query(
              `INSERT INTO catalog_products (
                 id, normalized_key, name, product_type, brand, formulation, category_id,
                 illustration_key, aliases, approval_status, is_default_catalog, origin, source_candidate_id, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'approved', false, 'shared', $10, now())
               ON CONFLICT (source_candidate_id) DO UPDATE SET
                 approval_status = 'approved',
                 name = EXCLUDED.name,
                 brand = EXCLUDED.brand,
                 formulation = EXCLUDED.formulation,
                 category_id = EXCLUDED.category_id,
                 illustration_key = COALESCE(EXCLUDED.illustration_key, catalog_products.illustration_key),
                 aliases = EXCLUDED.aliases,
                 updated_at = now()
               RETURNING id`,
              [
                productId,
                `${key}|${candidate.candidateId}`,
                name,
                candidate.classification === "branded" ? "branded" : "generic",
                brand,
                candidate.variant ?? null,
                category,
                candidate.closestDrawing && candidate.closestDrawing !== "none" ? candidate.closestDrawing : null,
                JSON.stringify(aliases),
                candidate.candidateId,
              ],
            );
            const { rows } = await db.query(`SELECT id FROM catalog_products WHERE source_candidate_id = $1`, [
              candidate.candidateId,
            ]);
            const resolvedId = String(rows[0]?.id ?? productId);
            await replaceAliases(db, resolvedId, aliases);
            counters.writes += 1;
            return { productId: resolvedId };
          }),
        );
      } catch {
        counters.writeErrors += 1;
        return null;
      }
    },

    async setDefault(input: SetDefaultInput) {
      try {
        return await run("write:setDefault", async (db) => {
          const sets: string[] = ["updated_at = now()"];
          const values: unknown[] = [input.id];
          const add = (sql: string, value: unknown) => {
            values.push(value);
            sets.push(`${sql} = $${values.length}`);
          };
          if (input.isDefaultCatalog !== undefined) add("is_default_catalog", input.isDefaultCatalog);
          if (input.illustrationKey !== undefined) add("illustration_key", input.illustrationKey);
          if (input.category) add("category_id", input.category);
          if (input.genericParentId !== undefined) add("generic_parent_id", input.genericParentId);
          if (input.deprecated === true) {
            values.push("deprecated");
            sets.push(`approval_status = $${values.length}`);
            values.push(false);
            sets.push(`is_default_catalog = $${values.length}`);
          } else if (input.deprecated === false) {
            values.push("approved");
            sets.push(`approval_status = $${values.length}`);
          }
          const { rows } = await db.query(
            `UPDATE catalog_products SET ${sets.join(", ")} WHERE id = $1 RETURNING id`,
            values,
          );
          counters.writes += 1;
          return rows.length > 0;
        });
      } catch {
        counters.writeErrors += 1;
        return false;
      }
    },

    async markImageUnavailable(id) {
      try {
        await run("write:imageUnavailable", async (db) => {
          await db.query(`UPDATE product_images SET usage_status = 'unavailable', last_checked_at = now() WHERE id = $1`, [id]);
        });
      } catch {
        counters.writeErrors += 1;
      }
    },

    async touchImageChecked(id) {
      try {
        await run("write:imageChecked", async (db) => {
          await db.query(`UPDATE product_images SET last_checked_at = now() WHERE id = $1`, [id]);
        });
      } catch {
        /* ignore */
      }
    },

    async imagesNeedingCheck(olderThanMs, limit) {
      try {
        return await run("imagesNeedingCheck", async (db) => {
          const { rows } = await db.query(
            `SELECT id, url FROM product_images
             WHERE usage_status <> 'unavailable'
               AND (last_checked_at IS NULL OR last_checked_at < $1::timestamptz)
             ORDER BY last_checked_at ASC
             LIMIT $2`,
            [new Date(now() - olderThanMs).toISOString(), limit],
          );
          return rows.map((row) => ({ id: String(row.id), url: String(row.url) }));
        });
      } catch {
        return [];
      }
    },

    async rememberSeen(productId) {
      const previous = lastSeen.get(productId) ?? 0;
      if (now() - previous < CATALOG_RULES.seenThrottleMs) return;
      lastSeen.set(productId, now());
      try {
        await run("write:seen", async (db) => {
          await db.query(`UPDATE catalog_products SET last_seen_at = now() WHERE id = $1`, [productId]);
        });
      } catch {
        /* ignore */
      }
    },
  };

  /** Live counts for health; cheap enough for occasional polls. */
  const originalStats = store.stats;
  store.stats = () => {
    const base = originalStats();
    void pool
      .query(`SELECT
         (SELECT COUNT(*)::int FROM catalog_products) AS products,
         (SELECT COUNT(*)::int FROM product_identifiers) AS identifiers`)
      .then(({ rows }) => {
        liveCounts.products = Number(rows[0]?.products ?? 0);
        liveCounts.identifiers = Number(rows[0]?.identifiers ?? 0);
        counters.degraded = false;
      })
      .catch(() => {
        counters.degraded = true;
      });
    return { ...base, products: liveCounts.products, identifiers: liveCounts.identifiers };
  };

  const liveCounts = { products: 0, identifiers: 0 };
  return store;
}

function emptyNameAnswer(): NameAnswer {
  return {
    classification: "unknown",
    match: null,
    alternatives: [],
    searched: { prijsprofeet: "skipped", off: "skipped" },
  };
}

async function bestPpEvidenceForGtin(
  db: Queryable,
  gtin: string,
): Promise<{ productName?: string; brand?: string; retailer?: string } | null> {
  const { rows } = await db.query(
    `SELECT product_name, brand, retailer FROM product_pack_evidence
     WHERE gtin = $1 AND source = 'prijsprofeet' AND (product_name IS NOT NULL OR brand IS NOT NULL)`,
    [gtin],
  );
  if (!rows.length) return null;
  const ranked = [...rows].sort(
    (a, b) => (RETAILER_RANK[String(a.retailer ?? "")] ?? 99) - (RETAILER_RANK[String(b.retailer ?? "")] ?? 99),
  );
  const top = ranked[0];
  return {
    ...(asString(top.product_name) && { productName: asString(top.product_name) }),
    ...(asString(top.brand) && { brand: asString(top.brand) }),
    ...(asString(top.retailer) && { retailer: asString(top.retailer) }),
  };
}

/** Push the best PrijsProfeet name/brand onto the catalog product linked to this GTIN. */
async function applyPpIdentityToGtin(db: Queryable, gtin: string) {
  const pp = await bestPpEvidenceForGtin(db, gtin);
  if (!pp?.productName && !pp?.brand) return;
  await db.query(
    `UPDATE catalog_products p SET
       name = COALESCE($2, p.name),
       brand = COALESCE($3, p.brand),
       updated_at = now()
     FROM product_identifiers i
     JOIN product_variants v ON v.id = i.variant_id
     WHERE i.gtin = $1 AND v.product_id = p.id`,
    [gtin, pp.productName?.slice(0, 80) ?? null, pp.brand?.slice(0, 40) ?? null],
  );
}

async function upsertEvidence(
  db: Queryable,
  input: {
    gtin: string;
    source: PackEvidenceSource;
    retailer?: string;
    quantityRaw?: string;
    productName?: string;
    brand?: string;
    at: number;
  },
) {
  const retailer = input.source === "prijsprofeet" ? (input.retailer ?? "").trim().toLowerCase() : "";
  await db.query(
    `INSERT INTO product_pack_evidence (gtin, source, retailer, quantity_raw, quantity_ml, product_name, brand, retrieved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
     ON CONFLICT (gtin, source, retailer) DO UPDATE SET
       quantity_raw = COALESCE(EXCLUDED.quantity_raw, product_pack_evidence.quantity_raw),
       quantity_ml = COALESCE(EXCLUDED.quantity_ml, product_pack_evidence.quantity_ml),
       product_name = COALESCE(EXCLUDED.product_name, product_pack_evidence.product_name),
       brand = COALESCE(EXCLUDED.brand, product_pack_evidence.brand),
       retrieved_at = EXCLUDED.retrieved_at`,
    [
      input.gtin,
      input.source,
      retailer,
      input.quantityRaw ?? null,
      quantityMlOf(input.quantityRaw) ?? null,
      input.productName ?? null,
      input.brand ?? null,
      new Date(input.at).toISOString(),
    ],
  );
}

async function loadPackSummary(db: Queryable, gtin: string, listRetailer?: string) {
  const { rows } = await db.query(
    `SELECT source, retailer, quantity_raw, quantity_ml, product_name, brand, retrieved_at
     FROM product_pack_evidence WHERE gtin = $1`,
    [gtin],
  );
  const evidence: PackEvidence[] = rows.map((row) => ({
    source: String(row.source) as PackEvidenceSource,
    ...(asString(row.retailer) && { retailer: asString(row.retailer) }),
    ...(asString(row.quantity_raw) && { quantityRaw: asString(row.quantity_raw) }),
    ...(asNumber(row.quantity_ml) != null && { quantityMl: asNumber(row.quantity_ml) }),
    ...(asString(row.product_name) && { productName: asString(row.product_name) }),
    ...(asString(row.brand) && { brand: asString(row.brand) }),
    retrievedAt: new Date(String(row.retrieved_at)).getTime(),
  }));
  return summarizePack(evidence, listRetailer);
}

async function refreshConflictFlag(db: Queryable, gtin: string) {
  const pack = await loadPackSummary(db, gtin);
  await db.query(`UPDATE product_identifiers SET pack_conflict = $2 WHERE gtin = $1`, [gtin, pack.conflict]);
}

async function ensureCategory(db: Queryable, id: string) {
  await db.query(
    `INSERT INTO categories (id, label, short, sort_order) VALUES ($1, $1, $1, 99)
     ON CONFLICT (id) DO NOTHING`,
    [id],
  );
}


export function disabledCatalog(): Catalog {
  return {
    enabled: false,
    stats: () => ({
      enabled: false,
      degraded: false,
      migrations: [],
      products: 0,
      identifiers: 0,
      centralHits: 0,
      writes: 0,
      writeErrors: 0,
    }),
  };
}
