import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NormalizedProduct } from "./normalize.js";
import type { ProductCategory } from "./offers/match.js";
import { normalizeName, singularKey } from "./productName.js";

export const CREATED_FROM = ["search", "photo", "import"] as const;
export const APPROVAL = ["pending", "approved", "rejected"] as const;
export const CLASSIFICATION = ["generic", "branded", "unknown"] as const;
export type CreatedFrom = (typeof CREATED_FROM)[number];
export type ApprovalStatus = (typeof APPROVAL)[number];
export type Classification = (typeof CLASSIFICATION)[number];

const MAX_PACKAGING = 8;

/**
 * A product parents added that the shared catalog may take over after a manual review. Holds no IP addresses,
 * devices or lists: only the product and how often different devices asked for it per day.
 */
export type Candidate = {
  candidateId: string;
  /** generic: a product type ("walnoten"); branded: a brand and formulation ("Chocomel", "Chocomel 0% suiker"); unknown: not classified yet. */
  classification: Classification;
  canonicalName: string;
  displayName: string;
  singularName: string;
  pluralName: string;
  childFriendlyLabel: string;
  searchKeys: string[];
  category: NormalizedProduct["category"];
  subcategory: string | null;
  closestDrawing: string | null;
  /** Key of the generated drawing in the illustration cache; null until one exists. */
  illustration: string | null;
  brand?: string;
  /** The formulation asked for besides the brand; packaging and sizes are in requestedPackaging. */
  variant?: string;
  /** Packs parents asked for ("blik", "1000 ml"); they count towards the same product. */
  requestedPackaging?: string[];
  /** From the latest name search: whether PrijsProfeet or Open Food Facts had a reliable photo. */
  prijsprofeetMatch?: boolean;
  offMatch?: boolean;
  imageAvailable?: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  usageCount: number;
  createdFrom: CreatedFrom;
  approvalStatus: ApprovalStatus;
  reviewedAt?: string;
};

/** What a name search learned about a typed product; no names of people, lists or devices. */
export type NameRecord = {
  base: string;
  classification: "branded" | "unknown";
  brand?: string;
  variant?: string;
  packaging?: string;
  category?: ProductCategory;
  prijsprofeetMatch: boolean;
  offMatch: boolean;
  imageAvailable: boolean;
};

export type CandidateChange = { all: Candidate[]; changed: Candidate[]; removed: string[] };

/** Where candidates are kept between restarts. */
export type CandidatePersistence = {
  kind: "file" | "postgres";
  load(): Promise<Candidate[]>;
  write(change: CandidateChange): Promise<void>;
};

export type CandidateConfig = {
  /** JSON file to keep candidates across restarts; without it (or persistence) they live in memory. */
  file?: string;
  persistence?: CandidatePersistence;
  maxCandidates?: number;
  now?: () => number;
};

export function dedupeKey(candidate: Pick<Candidate, "category" | "canonicalName" | "brand" | "variant"> & { classification?: Classification }): string {
  if (candidate.classification === "branded") return `brand|${singularKey(candidate.brand ?? candidate.canonicalName)}|${singularKey(candidate.variant ?? "")}`;
  if (candidate.classification === "unknown") return `name|${singularKey(candidate.canonicalName)}`;
  return `${candidate.category}|${singularKey(candidate.canonicalName)}`;
}

function valid(entry: unknown): entry is Candidate {
  return Boolean(entry && typeof entry === "object" && "candidateId" in entry && "canonicalName" in entry);
}

/** Records from before classification existed are generic products. */
function upgrade(candidate: Candidate): Candidate {
  return candidate.classification ? candidate : { ...candidate, classification: "generic" };
}

function readFileSyncSafe(file: string): Candidate[] {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as { candidates?: unknown };
    return Array.isArray(data.candidates) ? data.candidates.filter(valid).map(upgrade) : [];
  } catch {
    return [];
  }
}

export function fileStorage(file: string): CandidatePersistence {
  return {
    kind: "file",
    load: async () => readFileSyncSafe(file),
    async write({ all }) {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 2, candidates: all }, null, 1), "utf8");
      await rename(temporary, file);
    },
  };
}

export function createCandidateStore(config: CandidateConfig = {}) {
  const now = config.now ?? Date.now;
  const max = config.maxCandidates ?? 5000;
  const persistence = config.persistence ?? (config.file ? fileStorage(config.file) : undefined);
  const byKey = new Map<string, Candidate>();
  /** A file is read at once, so the store is complete before the server listens; a database through load(). */
  let loaded = !config.persistence;
  let loadError: string | undefined;
  if (config.file && !config.persistence) for (const candidate of readFileSyncSafe(config.file)) byKey.set(dedupeKey(candidate), candidate);
  /** One count per device, product and day; the salt is new each start, so these hashes cannot be linked to an IP later. */
  const salt = randomUUID();
  let day = "";
  const counted = new Set<string>();
  let writing: Promise<void> = Promise.resolve();
  let writeErrors = 0;
  const dirty = new Set<string>();
  const removed = new Set<string>();

  function persist(...changed: Candidate[]) {
    if (!persistence || !loaded) return;
    for (const candidate of changed) dirty.add(candidate.candidateId);
    writing = writing.then(async () => {
      if (!dirty.size && !removed.size) return;
      const all = [...byKey.values()];
      const change = { all, changed: all.filter((candidate) => dirty.has(candidate.candidateId)), removed: [...removed] };
      dirty.clear();
      removed.clear();
      try {
        await persistence.write(change);
      } catch {
        writeErrors += 1;
        /** Retried with the next change, so an outage loses nothing that is still in memory. */
        for (const candidate of change.changed) dirty.add(candidate.candidateId);
        for (const candidateId of change.removed) if (!byId(candidateId)) removed.add(candidateId);
      }
    });
  }

  function count(candidate: Candidate, ip: string) {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      counted.clear();
    }
    const hash = createHash("sha256").update(`${salt}|${ip}|${candidate.candidateId}|${today}`).digest("hex");
    candidate.lastSeenAt = new Date(now()).toISOString();
    if (counted.has(hash)) return;
    counted.add(hash);
    candidate.usageCount += 1;
  }

  const byId = (candidateId: string) => [...byKey.values()].find((entry) => entry.candidateId === candidateId);
  const withKey = (key: string, classification?: Classification) =>
    [...byKey.values()].find((candidate) => candidate.searchKeys.includes(key) && (!classification || candidate.classification === classification));

  function create(fields: Omit<Candidate, "candidateId" | "firstSeenAt" | "lastSeenAt" | "usageCount" | "approvalStatus" | "illustration" | "searchKeys">): Candidate | null {
    if (byKey.size >= max) return null;
    const at = new Date(now()).toISOString();
    return { candidateId: randomUUID(), ...fields, illustration: null, searchKeys: [], firstSeenAt: at, lastSeenAt: at, usageCount: 0, approvalStatus: "pending" };
  }

  /** Folds a not-yet-classified entry into the product it turned out to be, keeping its count and first date. */
  function absorb(target: Candidate, keys: string[]) {
    for (const key of keys) {
      const unknown = byKey.get(`name|${key}`);
      if (!unknown || unknown === target) continue;
      byKey.delete(`name|${key}`);
      removed.add(unknown.candidateId);
      target.usageCount += unknown.usageCount;
      if (unknown.firstSeenAt < target.firstSeenAt) target.firstSeenAt = unknown.firstSeenAt;
      target.searchKeys = [...new Set([...target.searchKeys, ...unknown.searchKeys])].slice(0, 12);
      target.requestedPackaging = [...new Set([...(target.requestedPackaging ?? []), ...(unknown.requestedPackaging ?? [])])].slice(0, MAX_PACKAGING);
      if (unknown.prijsprofeetMatch !== undefined) target.prijsprofeetMatch ??= unknown.prijsprofeetMatch;
      if (unknown.offMatch !== undefined) target.offMatch ??= unknown.offMatch;
      if (unknown.imageAvailable !== undefined) target.imageAvailable ??= unknown.imageAvailable;
    }
  }

  function addPackaging(candidate: Candidate, packaging: string | undefined) {
    if (!packaging) return;
    const list = candidate.requestedPackaging ?? [];
    if (!list.includes(packaging) && list.length < MAX_PACKAGING) candidate.requestedPackaging = [...list, packaging];
  }

  function nameFields(base: string, category: ProductCategory | undefined) {
    const plain = normalizeName(base);
    return { canonicalName: plain, displayName: base, singularName: plain, pluralName: plain, childFriendlyLabel: plain, category: category ?? "pantry", subcategory: null, closestDrawing: null };
  }

  function recordName(input: NameRecord, ip: string): Candidate | null {
    const key = singularKey(input.base);
    if (!key) return null;
    const flags = { prijsprofeetMatch: input.prijsprofeetMatch, offMatch: input.offMatch, imageAvailable: input.imageAvailable };
    let candidate: Candidate | null | undefined;
    if (input.classification === "branded") {
      const brand = input.brand ?? input.base;
      const lookup = dedupeKey({ classification: "branded", brand, variant: input.variant, canonicalName: input.base, category: "pantry" });
      candidate = byKey.get(lookup);
      if (!candidate) {
        candidate = create({ classification: "branded", ...nameFields(input.base, input.category), brand, ...(input.variant && { variant: input.variant }), createdFrom: "search" });
        if (!candidate) return null;
        byKey.set(lookup, candidate);
      }
      absorb(candidate, [key]);
    } else {
      candidate = withKey(key, "generic") ?? withKey(key, "branded") ?? byKey.get(`name|${key}`);
      if (!candidate) {
        candidate = create({ classification: "unknown", ...nameFields(input.base, input.category), createdFrom: "search" });
        if (!candidate) return null;
        byKey.set(`name|${key}`, candidate);
      }
    }
    if (candidate.classification !== "generic") Object.assign(candidate, flags);
    candidate.searchKeys = [...new Set([...candidate.searchKeys, key])].slice(0, 12);
    addPackaging(candidate, input.packaging);
    count(candidate, ip);
    persist(candidate);
    return candidate;
  }

  return {
    get persistent() {
      return Boolean(persistence) && loaded && !loadError;
    },
    storage: (): "memory" | "file" | "postgres" => (persistence && loaded && !loadError ? persistence.kind : "memory"),
    /** Reads a database before the server listens. On failure the store keeps working in memory and says so. */
    async load(): Promise<void> {
      if (loaded || !persistence) return;
      try {
        for (const candidate of await persistence.load()) {
          const ready = upgrade(candidate);
          byKey.set(dedupeKey(ready), ready);
        }
        loaded = true;
      } catch (error) {
        loadError = (error as { code?: string }).code ?? "unavailable";
      }
    },
    /** A known generic product for what a parent typed, by singular/plural key; brands never answer normalize. */
    find(typed: string): Candidate | null {
      const key = singularKey(typed);
      if (!key) return null;
      return withKey(key, "generic") ?? null;
    },
    /** Counts one more use of a known candidate. */
    seen(candidate: Candidate, ip: string) {
      count(candidate, ip);
      persist(candidate);
    },
    /** Adds the normalized product as a pending candidate, or merges it into the same product in the same department. */
    record(product: NormalizedProduct, typed: string, from: CreatedFrom, ip: string): Candidate | null {
      const keys = [typed, product.canonicalName, product.displayName, product.singularName, product.pluralName].map(singularKey).filter(Boolean);
      const key = dedupeKey({ ...product, classification: "generic" });
      let candidate = byKey.get(key);
      if (!candidate) {
        const fresh = create({
          classification: "generic",
          canonicalName: product.canonicalName,
          displayName: product.displayName,
          singularName: product.singularName,
          pluralName: product.pluralName,
          childFriendlyLabel: product.childFriendlyLabel,
          category: product.category,
          subcategory: product.subcategory,
          closestDrawing: product.closestDrawing,
          createdFrom: from,
        });
        if (!fresh) return null;
        candidate = fresh;
        byKey.set(key, candidate);
      }
      candidate.searchKeys = [...new Set([...candidate.searchKeys, ...keys])].slice(0, 12);
      absorb(candidate, keys);
      count(candidate, ip);
      persist(candidate);
      return candidate;
    },
    recordName,
    /** OpenAI said the typed name is a brand; it is kept as a branded product without a photo match. */
    recordBrand(base: string, ip: string): Candidate | null {
      return recordName({ base, classification: "branded", brand: base, prijsprofeetMatch: false, offMatch: false, imageAvailable: false }, ip);
    },
    setIllustration(candidateId: string, illustration: string) {
      const candidate = byId(candidateId);
      if (!candidate) return;
      candidate.illustration = illustration;
      persist(candidate);
    },
    list(status?: ApprovalStatus): Candidate[] {
      return [...byKey.values()].filter((candidate) => !status || candidate.approvalStatus === status).sort((a, b) => b.usageCount - a.usageCount);
    },
    /** Only a person changes the status; nothing here promotes a candidate on its own. */
    review(candidateId: string, status: ApprovalStatus): Candidate | null {
      const candidate = byId(candidateId);
      if (!candidate) return null;
      candidate.approvalStatus = status;
      candidate.reviewedAt = new Date(now()).toISOString();
      persist(candidate);
      return candidate;
    },
    stats() {
      const all = [...byKey.values()];
      const by = (field: "approvalStatus" | "classification", value: string) => all.filter((candidate) => candidate[field] === value).length;
      return {
        persistent: Boolean(persistence) && loaded && !loadError,
        storage: persistence && loaded && !loadError ? persistence.kind : "memory",
        ...(loadError && { loadError }),
        total: all.length,
        pending: by("approvalStatus", "pending"),
        approved: by("approvalStatus", "approved"),
        rejected: by("approvalStatus", "rejected"),
        generic: by("classification", "generic"),
        branded: by("classification", "branded"),
        unknown: by("classification", "unknown"),
        writeErrors,
      };
    },
    /** Resolves once every pending write has landed; for tests and shutdown. */
    flush(): Promise<void> {
      return writing;
    },
  };
}

export type CandidateStore = ReturnType<typeof createCandidateStore>;
