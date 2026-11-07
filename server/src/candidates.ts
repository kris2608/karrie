import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NormalizedProduct } from "./normalize.js";
import { singularKey } from "./productName.js";

export const CREATED_FROM = ["search", "photo", "import"] as const;
export const APPROVAL = ["pending", "approved", "rejected"] as const;
export type CreatedFrom = (typeof CREATED_FROM)[number];
export type ApprovalStatus = (typeof APPROVAL)[number];

/**
 * A generic product parents added that the shared catalog may take over after a manual review. Holds no IP
 * addresses, devices or lists: only the product and how often different devices asked for it per day.
 */
export type Candidate = {
  candidateId: string;
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
  firstSeenAt: string;
  lastSeenAt: string;
  usageCount: number;
  createdFrom: CreatedFrom;
  approvalStatus: ApprovalStatus;
  reviewedAt?: string;
};

export type CandidateConfig = {
  /** JSON file to keep candidates across restarts; without it they live in memory until the process stops. */
  file?: string;
  maxCandidates?: number;
  now?: () => number;
};

const dedupeKey = (candidate: Pick<Candidate, "category" | "canonicalName">) => `${candidate.category}|${singularKey(candidate.canonicalName)}`;

function readFile(file: string | undefined): Candidate[] {
  if (!file || !existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as { candidates?: unknown };
    return Array.isArray(data.candidates) ? data.candidates.filter((entry): entry is Candidate => Boolean(entry && typeof entry === "object" && "candidateId" in entry)) : [];
  } catch {
    return [];
  }
}

export function createCandidateStore(config: CandidateConfig = {}) {
  const now = config.now ?? Date.now;
  const max = config.maxCandidates ?? 5000;
  const byKey = new Map<string, Candidate>();
  for (const candidate of readFile(config.file)) byKey.set(dedupeKey(candidate), candidate);
  /** One count per device, product and day; the salt is new each start, so these hashes cannot be linked to an IP later. */
  const salt = randomUUID();
  let day = "";
  const counted = new Set<string>();
  let writing: Promise<void> = Promise.resolve();
  let writeErrors = 0;

  function persist() {
    const file = config.file;
    if (!file) return;
    const body = JSON.stringify({ version: 1, candidates: [...byKey.values()] }, null, 1);
    writing = writing
      .then(async () => {
        await mkdir(dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, body, "utf8");
        await rename(temporary, file);
      })
      .catch(() => {
        writeErrors += 1;
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

  return {
    persistent: Boolean(config.file),
    /** A known candidate for what a parent typed, by singular/plural key. */
    find(typed: string): Candidate | null {
      const key = singularKey(typed);
      if (!key) return null;
      for (const candidate of byKey.values()) if (candidate.searchKeys.includes(key)) return candidate;
      return null;
    },
    /** Counts one more use of a known candidate. */
    seen(candidate: Candidate, ip: string) {
      count(candidate, ip);
      persist();
    },
    /** Adds the normalized product as a pending candidate, or merges it into the same product in the same department. */
    record(product: NormalizedProduct, typed: string, from: CreatedFrom, ip: string): Candidate | null {
      const keys = [typed, product.canonicalName, product.displayName, product.singularName, product.pluralName].map(singularKey).filter(Boolean);
      const key = dedupeKey(product);
      let candidate = byKey.get(key);
      if (!candidate) {
        if (byKey.size >= max) return null;
        const at = new Date(now()).toISOString();
        candidate = {
          candidateId: randomUUID(),
          canonicalName: product.canonicalName,
          displayName: product.displayName,
          singularName: product.singularName,
          pluralName: product.pluralName,
          childFriendlyLabel: product.childFriendlyLabel,
          searchKeys: [],
          category: product.category,
          subcategory: product.subcategory,
          closestDrawing: product.closestDrawing,
          illustration: null,
          firstSeenAt: at,
          lastSeenAt: at,
          usageCount: 0,
          createdFrom: from,
          approvalStatus: "pending",
        };
        byKey.set(key, candidate);
      }
      candidate.searchKeys = [...new Set([...candidate.searchKeys, ...keys])].slice(0, 12);
      count(candidate, ip);
      persist();
      return candidate;
    },
    setIllustration(candidateId: string, illustration: string) {
      const candidate = [...byKey.values()].find((entry) => entry.candidateId === candidateId);
      if (!candidate) return;
      candidate.illustration = illustration;
      persist();
    },
    list(status?: ApprovalStatus): Candidate[] {
      return [...byKey.values()].filter((candidate) => !status || candidate.approvalStatus === status).sort((a, b) => b.usageCount - a.usageCount);
    },
    /** Only a person changes the status; nothing here promotes a candidate on its own. */
    review(candidateId: string, status: ApprovalStatus): Candidate | null {
      const candidate = [...byKey.values()].find((entry) => entry.candidateId === candidateId);
      if (!candidate) return null;
      candidate.approvalStatus = status;
      candidate.reviewedAt = new Date(now()).toISOString();
      persist();
      return candidate;
    },
    stats() {
      const all = [...byKey.values()];
      return {
        persistent: Boolean(config.file),
        total: all.length,
        pending: all.filter((candidate) => candidate.approvalStatus === "pending").length,
        approved: all.filter((candidate) => candidate.approvalStatus === "approved").length,
        rejected: all.filter((candidate) => candidate.approvalStatus === "rejected").length,
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
