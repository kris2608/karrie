import type { BarcodeAnswer, BarcodeProduct, BarcodeStatus } from "../barcode.js";
import type { Candidate } from "../candidates.js";
import type { NameAnswer } from "../nameImage.js";
import type { Packaging, Size } from "../productName.js";

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
};

export type StoredNameHit = {
  answer: NameAnswer;
  productId: string;
  packMatched: boolean;
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
  storeImageByGtin: (ean: string) => Promise<StoreImageInput | null>;
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
