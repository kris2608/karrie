import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import { createCandidateStore, type CandidatePersistence, type NameRecord } from "./candidates.js";
import { CANDIDATES_TABLE_SQL, postgresStorage, type PoolLike } from "./candidatesPg.js";
import { guardNormalized, type RawNormalized } from "./normalize.js";

const WALNUTS: RawNormalized = {
  isProduct: true,
  isGeneric: true,
  reason: "ok",
  canonicalName: "walnoot",
  displayName: "Walnoten",
  singularName: "walnoot",
  pluralName: "walnoten",
  childFriendlyLabel: "nootjes",
  category: "pantry",
  subcategory: "Noten",
  closestDrawing: "none",
  confidence: "high",
};
const PRODUCT = guardNormalized(WALNUTS, "walnoten")!;

const branded = (patch: Partial<NameRecord> = {}): NameRecord => ({
  base: "Chocomel",
  classification: "branded",
  brand: "Chocomel",
  category: "dairy",
  prijsprofeetMatch: true,
  offMatch: false,
  imageAvailable: true,
  ...patch,
});

function memoryPg() {
  /** pg-mem refuses a second CREATE TABLE IF NOT EXISTS without this; real Postgres accepts it. */
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return { db, pool: () => new Pool() as unknown as PoolLike };
}

describe("candidate classification and dedupe", () => {
  it("keeps Chocomel, Chocomel blik and Chocomel 1 liter as one branded product with the packs it was asked in", () => {
    const store = createCandidateStore();
    store.recordName(branded(), "1.1.1.1");
    store.recordName(branded({ packaging: "blik" }), "2.2.2.2");
    store.recordName(branded({ packaging: "1 l" }), "3.3.3.3");
    const [chocomel] = store.list();
    expect(store.list()).toHaveLength(1);
    expect(chocomel).toMatchObject({
      classification: "branded",
      brand: "Chocomel",
      usageCount: 3,
      requestedPackaging: ["blik", "1 l"],
      category: "dairy",
      prijsprofeetMatch: true,
      imageAvailable: true,
      approvalStatus: "pending",
    });
    expect(chocomel.variant).toBeUndefined();
  });

  it("keeps a formulation apart: Chocomel 0% suiker is its own product", () => {
    const store = createCandidateStore();
    store.recordName(branded(), "ip");
    store.recordName(branded({ base: "Chocomel 0% suiker", variant: "0% suiker", imageAvailable: false, prijsprofeetMatch: false }), "ip");
    expect(store.list().map((candidate) => [candidate.brand, candidate.variant ?? ""])).toEqual(
      expect.arrayContaining([
        ["Chocomel", ""],
        ["Chocomel", "0% suiker"],
      ]),
    );
    expect(store.stats()).toMatchObject({ total: 2, branded: 2, generic: 0, unknown: 0 });
  });

  it("counts each device once a day and stores no IP address", () => {
    let time = Date.UTC(2026, 10, 8, 9);
    const store = createCandidateStore({ now: () => time });
    for (const ip of ["1.1.1.1", "1.1.1.1", "2.2.2.2"]) store.recordName(branded(), ip);
    expect(store.list()[0]).toMatchObject({ usageCount: 2, firstSeenAt: "2026-11-08T09:00:00.000Z" });
    time += 24 * 60 * 60 * 1000;
    store.recordName(branded(), "1.1.1.1");
    expect(store.list()[0]).toMatchObject({ usageCount: 3, lastSeenAt: "2026-11-09T09:00:00.000Z" });
    expect(JSON.stringify(store.list())).not.toMatch(/1\.1\.1\.1|2\.2\.2\.2/);
  });

  it("folds an unknown name into the generic product it turns out to be", () => {
    const store = createCandidateStore();
    store.recordName({ base: "walnoten", classification: "unknown", prijsprofeetMatch: false, offMatch: false, imageAvailable: false }, "1.1.1.1");
    expect(store.stats()).toMatchObject({ unknown: 1, generic: 0 });
    expect(store.find("walnoten")).toBeNull();
    store.record(PRODUCT, "walnoten", "search", "2.2.2.2");
    expect(store.stats()).toMatchObject({ total: 1, unknown: 0, generic: 1 });
    expect(store.find("walnoot")).toMatchObject({ usageCount: 2, classification: "generic" });
    store.recordName({ base: "walnoten", classification: "unknown", prijsprofeetMatch: false, offMatch: false, imageAvailable: false }, "3.3.3.3");
    expect(store.stats()).toMatchObject({ total: 1, unknown: 0 });
  });

  it("keeps an OpenAI brand answer as branded, never as a generic product", () => {
    const store = createCandidateStore();
    store.recordBrand("Nutella", "ip");
    expect(store.list()[0]).toMatchObject({ classification: "branded", brand: "Nutella", imageAvailable: false });
    expect(store.find("nutella")).toBeNull();
  });

  it("reads old files as generic candidates and survives a restart with a file", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "karrie-candidates-")), "candidates.json");
    const old = { candidateId: "old", canonicalName: "rijst", displayName: "Rijst", category: "pantry", searchKeys: ["rijst"], usageCount: 4, approvalStatus: "pending" };
    writeFileSync(file, JSON.stringify({ candidates: [old] }));
    expect(createCandidateStore({ file }).find("rijst")).toMatchObject({ classification: "generic", usageCount: 4 });

    writeFileSync(file, JSON.stringify({ candidates: [] }));
    const store = createCandidateStore({ file });
    store.record(PRODUCT, "walnoten", "search", "ip");
    store.recordName(branded(), "ip");
    await store.flush();
    const saved = JSON.parse(readFileSync(file, "utf8"));
    expect(saved.version).toBe(2);
    const again = createCandidateStore({ file });
    expect(again.stats()).toMatchObject({ storage: "file", generic: 1, branded: 1 });
  });
});

describe("candidate persistence", () => {
  it("survives a restart in Postgres, with one row per candidate", async () => {
    const { db, pool } = memoryPg();
    const first = createCandidateStore({ persistence: postgresStorage(pool()) });
    await first.load();
    expect(first.storage()).toBe("postgres");
    first.recordName(branded({ packaging: "blik" }), "1.1.1.1");
    first.record(PRODUCT, "walnoten", "photo", "1.1.1.1");
    await first.flush();
    expect(db.public.many("SELECT candidate_id, dedupe_key FROM candidates")).toHaveLength(2);

    const second = createCandidateStore({ persistence: postgresStorage(pool()) });
    expect(second.stats()).toMatchObject({ storage: "memory", total: 0 });
    await second.load();
    expect(second.stats()).toMatchObject({ storage: "postgres", persistent: true, total: 2, branded: 1, generic: 1 });
    expect(second.find("walnoot")).toMatchObject({ createdFrom: "photo", usageCount: 1 });
    second.recordName(branded(), "2.2.2.2");
    await second.flush();
    const third = createCandidateStore({ persistence: postgresStorage(pool()) });
    await third.load();
    expect(third.list().find((candidate) => candidate.brand === "Chocomel")).toMatchObject({ usageCount: 2, requestedPackaging: ["blik"] });
  });

  it("deletes an unknown row that was folded into a product", async () => {
    const { db, pool } = memoryPg();
    const store = createCandidateStore({ persistence: postgresStorage(pool()) });
    await store.load();
    store.recordName({ base: "walnoten", classification: "unknown", prijsprofeetMatch: false, offMatch: false, imageAvailable: false }, "ip");
    await store.flush();
    store.record(PRODUCT, "walnoten", "search", "ip2");
    await store.flush();
    expect(db.public.many("SELECT dedupe_key FROM candidates")).toEqual([{ dedupe_key: "pantry|walnoot" }]);
  });

  it("matches the migration file", () => {
    const sql = readFileSync(new URL("../migrations/001_candidates.sql", import.meta.url), "utf8");
    const statement = (text: string) => text.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
    expect(statement(sql)).toBe(statement(CANDIDATES_TABLE_SQL));
  });

  it("says memory, not postgres, when the database is unreachable, and keeps working", async () => {
    const broken: CandidatePersistence = { kind: "postgres", load: async () => Promise.reject(Object.assign(new Error("down"), { code: "ECONNREFUSED" })), write: async () => undefined };
    const store = createCandidateStore({ persistence: broken });
    await store.load();
    expect(store.stats()).toMatchObject({ storage: "memory", persistent: false, loadError: "ECONNREFUSED" });
    expect(store.recordName(branded(), "ip")).toMatchObject({ brand: "Chocomel" });
  });

  it("retries a failed write with the next change", async () => {
    const writes: string[][] = [];
    let fail = true;
    const flaky: CandidatePersistence = {
      kind: "postgres",
      load: async () => [],
      async write({ changed }) {
        if (fail) throw new Error("down");
        writes.push(changed.map((candidate) => candidate.brand ?? candidate.canonicalName));
      },
    };
    const store = createCandidateStore({ persistence: flaky });
    await store.load();
    store.recordName(branded(), "ip");
    await store.flush();
    expect(store.stats().writeErrors).toBe(1);
    fail = false;
    store.recordBrand("Nutella", "ip");
    await store.flush();
    expect(writes).toEqual([["Chocomel", "Nutella"]]);
  });
});
