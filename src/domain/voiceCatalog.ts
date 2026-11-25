import catalogJson from "../data/voice-catalog.json";

export type VoiceCatalogEntry = {
  productId: string;
  spokenName: string;
  instruction: string;
};

type VoiceCatalogFile = {
  version: string;
  language: string;
  products: VoiceCatalogEntry[];
};

const file = catalogJson as VoiceCatalogFile;

const byId = new Map(file.products.map((entry) => [entry.productId, entry]));

export const VOICE_CATALOG_VERSION = file.version;
export const VOICE_CATALOG_LANGUAGE = file.language;

export function voiceCatalogEntry(productId: string): VoiceCatalogEntry | undefined {
  return byId.get(productId);
}

export function voiceCatalogInstruction(productId: string): string | undefined {
  return byId.get(productId)?.instruction;
}

export function allVoiceCatalogEntries(): readonly VoiceCatalogEntry[] {
  return file.products;
}

/** Static instruction texts for server allowlist sync. */
export function allVoiceCatalogInstructions(): string[] {
  return file.products.map((entry) => entry.instruction);
}
