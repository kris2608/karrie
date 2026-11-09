import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBarcodeLookup, type OffProduct } from "../barcode.js";
import { createCandidateStore } from "../candidates.js";
import type { PoolLike } from "../candidatesPg.js";
import { createHandler } from "../app.js";
import { migrate } from "../db/migrate.js";
import { createLimits } from "../limits.js";
import { createCatalogStore } from "./repo.js";
import { seedCatalog } from "./seed.js";
import { BOOTSTRAP_PRODUCTS } from "./bootstrap.js";
import { packFromQuantity, packKey } from "./keys.js";

const MIGRATIONS = join(fileURLToPath(new URL("../../migrations", import.meta.url)));

function memoryPg() {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return { db, pool: () => new Pool() as unknown as PoolLike };
}

async function readyCatalog() {
  const { pool } = memoryPg();
  const client = pool();
  const migration = await migrate(client, MIGRATIONS);
  await seedCatalog(client);
  const catalog = createCatalogStore(client, { migrations: [...migration.skipped, ...migration.applied], refreshDays: 90 });
  return { pool: client, catalog, migration };
}

const NUTELLA: OffProduct = {
  code: "3017620425035",
  product_name: "Nutella",
  brands: "Ferrero",
  quantity: "400 g",
  image_front_url: "https://images.openfoodfacts.org/images/products/301/762/042/5035/front_en.jpg",
  nutriscore_grade: "e",
  nutriments: { "energy-kcal_100g": 539, fat_100g: 30.9, sugars_100g: 56.3, salt_100g: 0.107 },
  ingredients_text_nl: "Suiker, palmolie",
};

function offResponse(product: OffProduct | null, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => (product ? { status: "success", product } : { status: "failure" }),
  };
}

describe("catalog migrations and seed", () => {
  it("applies migrations once and reseeds bundled products idempotently", { timeout: 15_000 }, async () => {
    const { pool } = memoryPg();
    const client = pool();
    const first = await migrate(client, MIGRATIONS);
    expect(first.applied).toEqual(["001", "002", "003", "004", "005"]);
    const second = await migrate(client, MIGRATIONS);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(["001", "002", "003", "004", "005"]);
    const seeded = await seedCatalog(client);
    expect(seeded.products).toBe(BOOTSTRAP_PRODUCTS.length);
    await seedCatalog(client);
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM catalog_products WHERE origin = 'bundled'`);
    expect(Number(rows[0].n)).toBe(BOOTSTRAP_PRODUCTS.length);
  });

  it("keeps bundled ids and illustration keys", async () => {
    const { pool } = await readyCatalog();
    const { rows } = await pool.query(`SELECT id, illustration_key FROM catalog_products WHERE id = 'appel'`);
    expect(rows[0]).toMatchObject({ id: "appel", illustration_key: "appel" });
  });
});

describe("shared barcode catalog", () => {
  it("normalises UPC-A to EAN-13 and reuses a stored product without calling Open Food Facts", async () => {
    const { catalog } = await readyCatalog();
    let offCalls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("openfoodfacts")) {
        offCalls += 1;
        return offResponse(NUTELLA);
      }
      throw new Error(`unexpected ${url}`);
    });
    const first = createBarcodeLookup({ userAgent: "test", catalog }, fetchImpl as never, () => Date.now(), async () => undefined);
    const result = await first.lookup("3017620425035", { allowWeb: false });
    expect(result.ok && result.answer.status).toBe("off-exact");
    expect(offCalls).toBe(1);

    await vi.waitFor(async () => {
      const hit = await catalog.byGtin("3017620425035");
      expect(hit?.answer.product?.name).toBe("Nutella");
    });

    const second = createBarcodeLookup({ userAgent: "test", catalog }, fetchImpl as never, () => Date.now(), async () => undefined);
    const reused = await second.lookup("3017620425035", { allowWeb: false });
    expect(reused.ok && reused.cached).toBe(true);
    expect(offCalls).toBe(1);
    expect(catalog.stats().centralHits).toBeGreaterThan(0);
  });

  it("keeps packaging variants and formulations apart", async () => {
    const { catalog } = await readyCatalog();
    await catalog.upsertBarcodeRecord({
      ean: "8710624292502",
      status: "off-exact",
      product: { name: "Coca-Cola", brand: "Coca-Cola", quantity: "330 ml" },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/8710624292502", dataLicense: "ODbL" },
      at: Date.now(),
    });
    await catalog.upsertBarcodeRecord({
      ean: "5449000000996",
      status: "off-exact",
      product: { name: "Coca-Cola Zero", brand: "Coca-Cola", quantity: "330 ml", variant: "Zero" },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/5449000000996", dataLicense: "ODbL" },
      at: Date.now(),
    });
    await catalog.upsertBarcodeRecord({
      ean: "5449000054227",
      status: "off-exact",
      product: { name: "Coca-Cola", brand: "Coca-Cola", quantity: "1.5 l" },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/5449000054227", dataLicense: "ODbL" },
      at: Date.now(),
    });
    const original = await catalog.byGtin("8710624292502");
    const zero = await catalog.byGtin("5449000000996");
    const litre = await catalog.byGtin("5449000054227");
    expect(original?.productId).not.toBe(zero?.productId);
    expect(original?.productId).toBe(litre?.productId);
    expect(original?.variantId).not.toBe(litre?.variantId);
    expect(packKey(packFromQuantity("330 ml"))).not.toBe(packKey(packFromQuantity("1.5 l")));
  });

  it("stores Nutri-Score only from Open Food Facts with retrieval dates", async () => {
    const { catalog, pool } = await readyCatalog();
    const at = Date.UTC(2026, 0, 15);
    await catalog.upsertBarcodeRecord({
      ean: "3017620425035",
      status: "off-exact",
      product: { name: "Nutella", brand: "Ferrero", nutriScore: "E", per100: { energyKcal: 539 } },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/3017620425035", dataLicense: "ODbL" },
      at,
    });
    const { rows } = await pool.query(`SELECT nutri_score, source, retrieved_at FROM product_facts`);
    expect(rows[0]).toMatchObject({ nutri_score: "E", source: "openfoodfacts" });
    expect(new Date(String(rows[0].retrieved_at)).getTime()).toBe(at);
  });

  it("never marks a web-page result as off-exact", async () => {
    const { catalog } = await readyCatalog();
    await catalog.upsertBarcodeRecord({
      ean: "8710624292502",
      status: "web-page",
      product: { name: "Cola", brand: "Test" },
      source: { kind: "web", name: "example.com", url: "https://example.com/p" },
      at: Date.now(),
    });
    const hit = await catalog.byGtin("8710624292502");
    expect(hit?.answer.status).toBe("web-page");
  });

  it("falls back to Open Food Facts when the database is down", async () => {
    const broken = {
      enabled: true as const,
      degraded: () => true,
      stats: () => ({ enabled: true, degraded: true, migrations: [], products: 0, identifiers: 0, centralHits: 0, writes: 0, writeErrors: 1 }),
      byGtin: async () => {
        throw new Error("down");
      },
      upsertBarcodeRecord: async () => undefined,
      packForGtin: async () => ({ sources: [], conflict: false }),
      cacheGet: async () => null,
      cachePut: async () => undefined,
      rememberSeen: async () => undefined,
    };
    let offCalls = 0;
    const fetchImpl = vi.fn(async () => {
      offCalls += 1;
      return offResponse(NUTELLA);
    });
    const lookup = createBarcodeLookup({ userAgent: "test", catalog: broken }, fetchImpl as never, () => Date.now(), async () => undefined);
    const result = await lookup.lookup("3017620425035", { allowWeb: false });
    expect(result.ok && result.answer.product?.name).toBe("Nutella");
    expect(offCalls).toBe(1);
  });

  it("refreshes stale records in the background", async () => {
    const ready = await readyCatalog();
    const old = Date.now() - 100 * 24 * 60 * 60 * 1000;
    await ready.catalog.upsertBarcodeRecord({
      ean: "3017620425035",
      status: "off-exact",
      product: { name: "Nutella", brand: "Ferrero" },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/3017620425035", dataLicense: "ODbL" },
      at: old,
    });
    await ready.pool.query(`UPDATE product_identifiers SET last_verified_at = $1::timestamptz`, [new Date(old).toISOString()]);
    let offCalls = 0;
    const fetchImpl = vi.fn(async () => {
      offCalls += 1;
      return offResponse(NUTELLA);
    });
    const lookup = createBarcodeLookup(
      { userAgent: "test", catalog: ready.catalog },
      fetchImpl as never,
      () => Date.now(),
      async () => undefined,
    );
    const hit = await lookup.lookup("3017620425035", { allowWeb: false });
    expect(hit.ok && hit.cached).toBe(true);
    await vi.waitFor(() => expect(offCalls).toBeGreaterThan(0));
  });
});

describe("name images and admin sync", () => {
  it("checks the catalog first and never assigns a barcode from a name image", async () => {
    const { catalog } = await readyCatalog();
    await catalog.upsertNameImages({
      typed: "Chocomel",
      answer: {
        classification: "branded",
        brand: "Chocomel",
        match: {
          source: "prijsprofeet",
          productName: "Chocomel Halfvol",
          brand: "Chocomel",
          imageUrl: "https://cdn.example/chocomel.jpg",
          retailer: "albert_heijn",
          confidence: "high",
        },
        alternatives: [],
        searched: { prijsprofeet: "match", off: "skipped" },
      },
    });
    const hit = await catalog.byAlias({ alias: "Chocomel" });
    expect(hit?.answer.match?.imageUrl).toContain("chocomel");
    expect(hit?.answer.match && "ean" in hit.answer.match).toBe(false);
  });

  it("respects a requested pack when matching by alias", async () => {
    const { catalog, pool } = await readyCatalog();
    await catalog.upsertNameImages({
      typed: "Chocomel",
      answer: {
        classification: "branded",
        brand: "Chocomel",
        match: {
          source: "prijsprofeet",
          productName: "Chocomel",
          brand: "Chocomel",
          imageUrl: "https://cdn.example/chocomel.jpg",
          confidence: "high",
        },
        alternatives: [],
        searched: { prijsprofeet: "match", off: "skipped" },
      },
    });
    const { rows } = await pool.query(`SELECT id FROM catalog_products WHERE brand = 'Chocomel'`);
    const productId = String(rows[0].id);
    await pool.query(
      `INSERT INTO product_variants (id, product_id, package_quantity, package_unit, multipack_count, package_type, pack_key, label)
       VALUES ('v1', $1, 1000, 'ml', NULL, NULL, '1000|ml||', '1 l')`,
      [productId],
    );
    const plain = await catalog.byAlias({ alias: "Chocomel" });
    expect(plain?.packMatched).toBe(true);
    expect(plain?.exactPack).toBe(false);
    const litre = await catalog.byAlias({ alias: "Chocomel", size: { unit: "ml", amount: 1000 } });
    expect(litre?.packMatched).toBe(true);
    expect(litre?.exactPack).toBe(false);
    const blik = await catalog.byAlias({ alias: "Chocomel", packaging: "can" });
    expect(blik?.packMatched).toBe(false);
    expect(blik?.exactPack).toBe(false);
  });

  it("ranks packaging-aware images and keeps formulations apart", async () => {
    const { catalog, pool } = await readyCatalog();
    await pool.query(
      `INSERT INTO catalog_products (id, normalized_key, name, product_type, brand, formulation, category_id, aliases, approval_status, is_default_catalog, origin)
       VALUES
         ('p-choco', 'chocomel', 'Chocomel', 'branded', 'Chocomel', NULL, 'dairy', '["Chocomel"]'::jsonb, 'approved', false, 'shared'),
         ('p-pepsi', 'pepsi', 'Pepsi', 'branded', 'Pepsi', NULL, 'drinks', '["Pepsi"]'::jsonb, 'approved', false, 'shared'),
         ('p-zero', 'pepsi zero', 'Pepsi Zero', 'branded', 'Pepsi', 'Zero', 'drinks', '["Pepsi Zero","Pepsi"]'::jsonb, 'approved', false, 'shared'),
         ('p-cherry', 'pepsi zero cherry', 'Pepsi Zero Cherry', 'branded', 'Pepsi', 'Zero Cherry', 'drinks', '["Pepsi Zero Cherry","Pepsi"]'::jsonb, 'approved', false, 'shared')`,
    );
    await pool.query(
      `INSERT INTO catalog_aliases (alias_normalized, product_id) VALUES
         ('chocomel', 'p-choco'), ('pepsi', 'p-pepsi'), ('pepsi', 'p-zero'), ('pepsi', 'p-cherry'),
         ('pepsi zero', 'p-zero'), ('pepsi zero cherry', 'p-cherry')`,
    );
    await pool.query(
      `INSERT INTO product_variants (id, product_id, package_quantity, package_unit, multipack_count, package_type, pack_key, label) VALUES
         ('v-can', 'p-choco', 250, 'ml', NULL, 'can', '250|ml||can', '250 ml blik'),
         ('v-litre', 'p-choco', 1000, 'ml', NULL, 'carton', '1000|ml||carton', '1 l'),
         ('v-multi', 'p-choco', 250, 'ml', 6, 'can', '250|ml|6|can', '6 x 250 ml'),
         ('v-pepsi', 'p-pepsi', 1500, 'ml', NULL, NULL, '1500|ml||', '1.5 l'),
         ('v-zero', 'p-zero', 1500, 'ml', NULL, NULL, '1500|ml||', '1.5 l'),
         ('v-cherry', 'p-cherry', 330, 'ml', NULL, 'can', '330|ml||can', '330 ml')`,
    );
    await pool.query(
      `INSERT INTO product_images (id, product_id, variant_id, url, source, usage_status, preferred) VALUES
         ('i-rep', 'p-choco', NULL, 'https://cdn.example/chocomel-rep.jpg', 'prijsprofeet', 'link_only', true),
         ('i-can', 'p-choco', 'v-can', 'https://cdn.example/chocomel-can.jpg', 'prijsprofeet', 'link_only', false),
         ('i-litre', 'p-choco', 'v-litre', 'https://cdn.example/chocomel-litre.jpg', 'prijsprofeet', 'link_only', false),
         ('i-multi', 'p-choco', 'v-multi', 'https://cdn.example/chocomel-multi.jpg', 'prijsprofeet', 'link_only', false),
         ('i-pepsi', 'p-pepsi', 'v-pepsi', 'https://cdn.example/pepsi.jpg', 'prijsprofeet', 'link_only', true),
         ('i-zero', 'p-zero', 'v-zero', 'https://cdn.example/pepsi-zero.jpg', 'prijsprofeet', 'link_only', true),
         ('i-cherry', 'p-cherry', 'v-cherry', 'https://cdn.example/pepsi-zero-cherry.jpg', 'prijsprofeet', 'link_only', true)`,
    );
    await pool.query(
      `INSERT INTO product_identifiers (gtin, variant_id, source, confidence) VALUES
         ('8712345678901', 'v-can', 'openfoodfacts', 'off-exact'),
         ('8712345678902', 'v-litre', 'openfoodfacts', 'off-exact')`,
    );

    const can = await catalog.byAlias({ alias: "Chocomel", packaging: "can", size: { unit: "ml", amount: 250 } });
    expect(can?.exactPack).toBe(true);
    expect(can?.answer.match?.imageUrl).toContain("chocomel-can");

    const litre = await catalog.byAlias({ alias: "Chocomel", size: { unit: "ml", amount: 1000 } });
    expect(litre?.exactPack).toBe(true);
    expect(litre?.answer.match?.imageUrl).toContain("chocomel-litre");

    const pepsi = await catalog.byAlias({ alias: "Pepsi" });
    expect(pepsi?.answer.match?.imageUrl).toContain("pepsi.jpg");
    expect(pepsi?.productId).toBe("p-pepsi");

    const zero = await catalog.byAlias({ alias: "Pepsi Zero" });
    expect(zero?.answer.match?.imageUrl).toContain("pepsi-zero.jpg");
    expect(zero?.productId).toBe("p-zero");

    const cherry = await catalog.byAlias({ alias: "Pepsi Zero Cherry" });
    expect(cherry?.answer.match?.imageUrl).toContain("pepsi-zero-cherry");

    const missingCan = await catalog.byAlias({ alias: "Chocomel", packaging: "can", size: { unit: "ml", amount: 330 } });
    expect(missingCan?.packMatched).toBe(false);

    const plain = await catalog.byAlias({ alias: "Chocomel" });
    expect(plain?.answer.match?.imageUrl).toContain("chocomel-rep");
    expect(new Set(plain?.answer.alternatives.map((image) => image.imageUrl) ?? []).size).toBe(plain?.answer.alternatives.length);
  });

  it("stores retailer images as link_only and skips unavailable ones", async () => {
    const { catalog, pool } = await readyCatalog();
    await catalog.upsertBarcodeRecord({
      ean: "3017620425035",
      status: "off-exact",
      product: { name: "Nutella", brand: "Ferrero" },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/3017620425035", dataLicense: "ODbL" },
      at: Date.now(),
    });
    await catalog.upsertStoreImage({
      ean: "3017620425035",
      imageUrl: "https://static.ah.nl/nutella.jpg",
      retailer: "albert_heijn",
      sourceUrl: "https://www.ah.nl/p",
    });
    const { rows } = await pool.query(`SELECT usage_status FROM product_images WHERE source = 'prijsprofeet'`);
    expect(rows[0].usage_status).toBe("link_only");
    const { rows: imgs } = await pool.query(`SELECT id FROM product_images WHERE source = 'prijsprofeet'`);
    await catalog.markImageUnavailable(String(imgs[0].id));
    const served = await catalog.storeImageByGtin("3017620425035");
    expect(served).toBeNull();
  });

  it("links an approved candidate and never auto-approves; sync omits non-default rows", async () => {
    const { catalog } = await readyCatalog();
    const candidates = createCandidateStore();
    const recorded = candidates.recordName(
      {
        base: "Chocomel",
        classification: "branded",
        brand: "Chocomel",
        category: "dairy",
        prijsprofeetMatch: true,
        offMatch: false,
        imageAvailable: true,
      },
      "1.1.1.1",
    )!;
    expect(recorded.approvalStatus).toBe("pending");
    const approved = candidates.review(recorded.candidateId, "approved")!;
    const linked = await catalog.approveCandidate(approved);
    expect(linked?.productId).toBeTruthy();

    const page = await catalog.changesSince(null, 200);
    expect(page.products.find((product) => product.id === linked!.productId)).toBeUndefined();

    await catalog.setDefault({ id: linked!.productId, isDefaultCatalog: true });
    const after = await catalog.changesSince(null, 200);
    expect(after.products.some((product) => product.id === linked!.productId)).toBe(true);
  });

  it("keeps GTIN on the first Campina variant and lets PrijsProfeet win over Open Food Facts", async () => {
    const CAMPINA = "8712800001256";
    const { catalog, pool } = await readyCatalog();
    await catalog.upsertBarcodeRecord({
      ean: CAMPINA,
      status: "off-exact",
      product: {
        name: "Magere yoghurt",
        brand: "Campina",
        quantity: "220 ml",
        imageUrl: "https://images.openfoodfacts.org/images/products/871/280/000/1256/front_nl.jpg",
        nutriScore: "C",
      },
      source: { kind: "off", name: "Open Food Facts", url: `https://world.openfoodfacts.org/product/${CAMPINA}`, dataLicense: "ODbL", imageLicense: "CC BY-SA" },
      at: Date.now(),
    });
    const before = await pool.query(`SELECT variant_id, pack_conflict FROM product_identifiers WHERE gtin = $1`, [CAMPINA]);
    const variantId = String(before.rows[0].variant_id);
    expect(before.rows[0].pack_conflict).toBe(false);

    await catalog.recordRetailerPack({
      ean: CAMPINA,
      rows: [{ retailer: "jumbo", quantity: "1 l", productName: "Campina Magere yoghurt", brand: "Campina" }],
    });
    await catalog.upsertStoreImage({
      ean: CAMPINA,
      imageUrl: "https://static.jumbo.com/campina.jpg",
      retailer: "jumbo",
      sourceUrl: "https://www.jumbo.com/p",
      quantity: "1 l",
      productName: "Campina Magere yoghurt",
      brand: "Campina",
    });

    const after = await pool.query(`SELECT variant_id, pack_conflict FROM product_identifiers WHERE gtin = $1`, [CAMPINA]);
    expect(String(after.rows[0].variant_id)).toBe(variantId);
    expect(after.rows[0].pack_conflict).toBe(false);

    const hit = await catalog.byGtin(CAMPINA);
    expect(hit?.pack.conflict).toBe(false);
    expect(hit?.pack.displayQuantity).toBe("1 l");
    expect(hit?.pack.sources.map((entry) => entry.quantityRaw)).toEqual(expect.arrayContaining(["220 ml", "1 l"]));
    expect(hit?.storeImage?.imageUrl).toContain("jumbo.com");
    expect(hit?.answer.status === "none" ? undefined : hit?.answer.product?.quantity).toBe("1 l");
    expect(hit?.answer.status === "none" ? undefined : hit?.answer.product.nutriScore).toBe("C");
    const still = await pool.query(`SELECT variant_id FROM product_identifiers WHERE gtin = $1`, [CAMPINA]);
    expect(String(still.rows[0].variant_id)).toBe(variantId);
  });

  it("does not flag pack conflict when OFF and retailer agree on size", async () => {
    const { catalog, pool } = await readyCatalog();
    await catalog.upsertBarcodeRecord({
      ean: "3017620425035",
      status: "off-exact",
      product: { name: "Nutella", brand: "Ferrero", quantity: "400 g" },
      source: { kind: "off", name: "Open Food Facts", url: "https://world.openfoodfacts.org/product/3017620425035", dataLicense: "ODbL" },
      at: Date.now(),
    });
    await catalog.upsertStoreImage({
      ean: "3017620425035",
      imageUrl: "https://static.ah.nl/nutella.jpg",
      retailer: "albert_heijn",
      sourceUrl: "https://www.ah.nl/p",
      quantity: "400 g",
    });
    const { rows } = await pool.query(`SELECT pack_conflict FROM product_identifiers WHERE gtin = '3017620425035'`);
    expect(rows[0].pack_conflict).toBe(false);
  });

  it("exposes catalog changes and hides admin routes without a token", async () => {
    const { catalog } = await readyCatalog();
    const handler = createHandler({
      allowedOrigins: ["http://localhost:5173"],
      requireOrigin: false,
      configured: false,
      model: "test",
      limits: createLimits({
        perIpPerHour: 10,
        perIpPerDay: 10,
        dailyRequests: 10,
        dailyBudgetUsd: 1,
        inputUsdPerMTok: 0,
        cachedInputUsdPerMTok: 0,
        outputUsdPerMTok: 0,
      }),
      recognize: async () => ({ ok: false, code: "busy" as const }),
      catalog,
      log: () => undefined,
    });
    const changes = await invoke(handler, "GET", "/api/catalog/changes");
    expect(changes.status).toBe(200);
    const admin = await invoke(handler, "POST", "/api/admin/catalog/x", { isDefaultCatalog: true });
    expect(admin.status).toBe(404);
  });
});

function invoke(
  handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>,
  method: string,
  path: string,
  body?: unknown,
) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const chunks: Buffer[] = [];
    const req = {
      method,
      url: path,
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      [Symbol.asyncIterator]: async function* () {
        if (body) yield Buffer.from(JSON.stringify(body));
      },
    } as unknown as import("node:http").IncomingMessage;
    const res = {
      headersSent: false,
      setHeader() {},
      writeHead(status: number) {
        this.statusCode = status;
        this.headersSent = true;
      },
      statusCode: 200,
      end(payload?: string) {
        resolve({ status: this.statusCode, body: payload ? JSON.parse(payload) : null });
      },
      write(chunk: Buffer) {
        chunks.push(chunk);
      },
    } as unknown as import("node:http").ServerResponse & { statusCode: number };
    void handler(req, res);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});
