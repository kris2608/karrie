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

const cut = (value: string | undefined, max: number) => {
  const trimmed = value?.trim().slice(0, max).trim();
  return trimmed || undefined;
};

/** A recognised branded pack is looked up exactly; everything else as the plain product type. */
export function identityOf(item: Identifiable): ImageIdentity | null {
  const name = cut(item.name, 60);
  if (!name) return null;
  const brand = cut(item.brand, 40);
  if (item.source === "vision" && item.recognition?.specific && brand) {
    return { name, brand, variant: cut(item.recognition.variant, 40), size: cut(item.packageSize, 20), generic: false };
  }
  return { name, generic: true };
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
