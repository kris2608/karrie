import type { PackInfo } from "./types";

/** What a reference picture must show. Mirrors ImageIdentitySchema on the server, including its length limits. */
export type ImageIdentity = {
  name: string;
  brand?: string;
  variant?: string;
  size?: string;
  generic: boolean;
};

type Identifiable = Pick<PackInfo, "brand" | "packageSize" | "source" | "recognition"> & { name: string };
type Pictured = Pick<PackInfo, "imageUrl" | "imageKind" | "imageSource">;

const cut = (value: string | undefined, max: number) => {
  const trimmed = value?.trim().slice(0, max).trim();
  return trimmed || undefined;
};

/** A recognised or barcode-identified branded pack is looked up exactly; everything else as the plain product type. */
export function identityOf(item: Identifiable): ImageIdentity | null {
  const name = cut(item.name, 60);
  if (!name) return null;
  const brand = cut(item.brand, 40);
  const branded = (item.source === "vision" && item.recognition?.specific) || item.source === "off" || item.source === "barcode";
  if (branded && brand) {
    return { name, brand, variant: cut(item.recognition?.variant, 40), size: cut(item.packageSize, 20), generic: false };
  }
  return { name, generic: true };
}

/** The front photo Open Food Facts publishes for this exact barcode. */
export function hasOffPhoto(item: Pictured): boolean {
  return item.imageSource === "off" && item.imageKind === "photo" && Boolean(item.imageUrl);
}

/**
 * Only a recognised branded pack gets a reference picture without asking. Standard products keep their drawing, and
 * a pack with an Open Food Facts front photo keeps that photo, unless a parent picks "Voorbeeldfoto".
 */
export function wantsReference(identity: ImageIdentity | null, choice: PackInfo["imageChoice"], offPhoto = false): boolean {
  if (!identity || choice === "photo" || choice === "drawing") return false;
  return choice === "reference" || (!identity.generic && !offPhoto);
}

function part(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Same key as the server: different brands, variants or sizes never share a picture. */
export function identityKey(identity: ImageIdentity): string {
  return identity.generic ? `g|${part(identity.name)}` : ["p", part(identity.brand), part(identity.name), part(identity.variant), part(identity.size)].join("|");
}
