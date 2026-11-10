import type { BarcodeAnswer, BarcodeProduct, BarcodeStatus } from "../barcode.js";
import type { Candidate } from "../candidates.js";
import type { NameAnswer } from "../nameImage.js";
import type { Packaging, Size } from "../productName.js";
import type { PackEvidence, PackSummary } from "./pack.js";

export type CatalogConfidence = "off-exact" | "off-partial" | "web-page";
export type CatalogUsageStatus = "cc_by_sa" | "link_only" | "unavailable";
export type CatalogApproval = "candidate" | "approved" | "rejected" | "deprecated";
export type CatalogOrigin = "bundled" | "shared";
export type ProductType = "generic" | "branded";

export type StoredBarcodeHit = {
  answer: BarcodeAnswer;
  stale: boolean;
  variantId: string;
  productId: string;
  pack: PackSummary;
  storeImage?: StoreImageInput;
};

export type StoredNameHit = {
  answer: NameAnswer;
  productId: string;
  packMatched: boolean;
  /** True only when a pack was requested and the top image is tied to the matching variant. */
  exactPack?: boolean;
};

export type CatalogChange = {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  illustrationKey?: string;
  deprecated: boolean;
  updatedAt: string;
};

export type CatalogStats = {
  enabled: boolean;
  degraded: boolean;
  migrations: string[];
  products: number;
  identifiers: number;
  centralHits: number;
  writes: number;
  writeErrors: number;
};

export type UpsertBarcodeInput = {
  ean: string;
  status: Exclude<BarcodeStatus, "none">;
  product: BarcodeProduct;
  source: NonNullable<BarcodeAnswer["source"]>;
  at: number;
  /** Resolved shop department when known (PP / OFF / name); omit rather than invent pantry. */
  department?: import("../offers/match.js").ProductCategory;
};

export type UpsertNameImagesInput = {
  typed: string;
  answer: NameAnswer;
};

export type StoreImageInput = {
  ean: string;
  imageUrl: string;
  retailer: string;
  sourceUrl?: string;
  quantity?: string;
  productName?: string;
  brand?: string;
};

export type RetailerPackRow = {
  retailer: string;
  quantity?: string;
  productName?: string;
  brand?: string;
};

export type RetailerPackInput = {
  ean: string;
  rows: RetailerPackRow[];
};

export type ParentPackInput = {
  ean: string;
  quantity: string;
};

export type ApproveCandidateInput = Candidate;

export type SetDefaultInput = {
  id: string;
  isDefaultCatalog?: boolean;
  illustrationKey?: string | null;
  category?: string;
  genericParentId?: string | null;
  deprecated?: boolean;
};

export type NameLookupRequest = {
  alias: string;
  packaging?: Packaging;
  size?: Size;
};

export type CatalogStore = {
  enabled: true;
  degraded: () => boolean;
  stats: () => CatalogStats;
  byGtin: (ean: string) => Promise<StoredBarcodeHit | null>;
  byAlias: (request: NameLookupRequest) => Promise<StoredNameHit | null>;
  upsertBarcodeRecord: (input: UpsertBarcodeInput) => Promise<void>;
  upsertNameImages: (input: UpsertNameImagesInput) => Promise<void>;
  upsertStoreImage: (input: StoreImageInput) => Promise<void>;
  storeImageByGtin: (ean: string, preferRetailer?: string) => Promise<StoreImageInput | null>;
  recordRetailerPack: (input: RetailerPackInput) => Promise<PackSummary | null>;
  recordParentPack: (input: ParentPackInput) => Promise<PackSummary | null>;
  packForGtin: (ean: string, listRetailer?: string) => Promise<PackSummary>;
  repairPackConflicts: () => Promise<number>;
  gtinsMissingRetailerPack: (limit: number) => Promise<string[]>;
  cacheGet: <T>(key: string) => Promise<T | null>;
  cachePut: (key: string, kind: string, payload: unknown, expiresAt: number) => Promise<void>;
  changesSince: (since: string | null, limit: number) => Promise<{ products: CatalogChange[]; next: string | null }>;
  approveCandidate: (candidate: ApproveCandidateInput) => Promise<{ productId: string } | null>;
  setDefault: (input: SetDefaultInput) => Promise<boolean>;
  markImageUnavailable: (id: string) => Promise<void>;
  touchImageChecked: (id: string) => Promise<void>;
  imagesNeedingCheck: (olderThanMs: number, limit: number) => Promise<{ id: string; url: string }[]>;
  rememberSeen: (productId: string) => Promise<void>;
};

export type DisabledCatalog = { enabled: false; stats: () => CatalogStats };
export type Catalog = CatalogStore | DisabledCatalog;

export type { PackEvidence, PackSummary };
